// ════════════════════════════════════════════════════════════════
// VIDEO (arranque) — pide a Veo el clip de un plano a partir de su imagen.
//
//  · Se arranca con :predictLongRunning y se consulta después con
//    /api/video-estado: un video tarda minutos y la función muere a los 60 s.
//  · El MP4 lo escribe Veo directamente en el bucket (storageUri), dentro de
//    la carpeta del proyecto: nunca pasa por aquí.
//  · La imagen del plano se lee del bucket en el servidor (el navegador solo
//    manda su ruta), así no hay límite de 4,5 MB que valga.
//  · 4 segundos: es lo que dura un plano de acción y Veo solo acepta 4, 6 u 8.
//  · Audio nativo: Veo genera el ambiente y los efectos mirando el video que
//    él mismo crea; el prompt le prohíbe voces (sección 13.3).
//  · El prompt pasa por el mismo saneado que el de imagen: Veo tiene el mismo
//    filtro de seguridad y un clip bloqueado cuesta más que una imagen.
//  · El modelo elegido nunca se cambia por otro. Un bloqueo no se reintenta.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex, MODELOS_VIDEO } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { limpiarPrompt } = require('./_lib/saneado');

const SEGUNDOS = 4;

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const b = req.body || {};
  const id = b.proyecto;
  const modelo = MODELOS_VIDEO.includes(b.modelo) ? b.modelo : cfg.modeloVideo;
  if (typeof b.prompt !== 'string' || b.prompt.trim().length < 20) throw new ErrorEstudio('Falta el texto del video.', { estado: 400, tipo: 'peticion' });
  // La carpeta del clip sale de la clave del plano: siempre dentro del proyecto.
  const carpetaClip = medios.rutaMedio(id, b.clave, 'mp4').replace(/\.mp4$/, '/');
  if (!b.imagen) throw new ErrorEstudio('Este plano no tiene imagen todavía. El video arranca de ella: genérala primero.', { estado: 409, tipo: 'falta_referencia' });
  const rutaImagen = medios.exigirDelProyecto(id, b.imagen);
  if (!cfg.bucket) throw new ErrorEstudio('Falta GCS_OUTPUT_BUCKET en Vercel. Vuelve a ejecutar el instalador.', { estado: 500, tipo: 'configuracion' });

  const { proyecto, token } = await google();
  const { bytes, tipo } = await medios.leer(token, rutaImagen, 'la imagen del plano');

  const cuerpo = {
    instances: [{
      prompt: limpiarPrompt(b.prompt),
      image: { bytesBase64Encoded: bytes.toString('base64'), mimeType: /jpe?g/i.test(tipo) ? 'image/jpeg' : 'image/png' },
    }],
    parameters: {
      aspectRatio: b.formato === '16:9' ? '16:9' : '9:16',
      sampleCount: 1,
      durationSeconds: SEGUNDOS,
      generateAudio: true,
      personGeneration: 'allow_adult',
      // El prompt negativo es una LISTA DE COSAS, nunca una orden. Va en
      // parameters y se aplica después del reescritor de Veo, que no se puede
      // apagar: es la única restricción que el reescritor no suaviza.
      ...(typeof b.negativo === 'string' && b.negativo.trim() ? { negativePrompt: b.negativo.trim().slice(0, 1500) } : {}),
      storageUri: `gs://${cfg.bucket}/${carpetaClip}`,
    },
  };

  let r;
  try {
    r = await fetch(urlVertex(proyecto, cfg.region, modelo, 'predictLongRunning'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(40000),
    });
  } catch (e) {
    throw new ErrorEstudio('No hubo conexión con Google para arrancar el video: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  if (!r.ok) throw errorDeGoogle(`video (${modelo})`, r.status, d);
  if (!d.name) throw new ErrorEstudio('Veo aceptó la petición pero no devolvió el número de la operación.', { estado: 502, tipo: 'google' });
  return { operacion: d.name, modelo, segundos: SEGUNDOS };
});
