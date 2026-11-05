// ════════════════════════════════════════════════════════════════
// VIDEO (consulta) — pregunta a Veo cómo va una operación ya arrancada.
//
//  · Se consulta con fetchPredictOperation EN EL MODELO QUE LA ARRANCÓ: la
//    operación pertenece a ese modelo y preguntar a otro falla (en el estudio
//    de anime estuvo fijo al modelo Lite y rompía Fast y Calidad).
//  · La operación se guarda en el proyecto del bucket: si el dueño recarga,
//    la consulta sigue donde estaba y no se paga un clip repetido.
//  · Terminado, devuelve la ruta del MP4 dentro de la carpeta del proyecto y
//    una URL firmada de 7 días para verlo sin bucket público.
//  · Un clip bloqueado por el filtro se dice como bloqueo (no se reintenta).
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex, firmarUrl, MODELOS_VIDEO } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle, clasificar } = require('./_lib/errores');
const medios = require('./_lib/medios');

const SIETE_DIAS = 7 * 24 * 3600;
const OPERACION = /^projects\/[\w-]+\/locations\/[\w-]+\/publishers\/google\/models\/([\w.-]+)\/operations\/[\w-]+$/;

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const b = req.body || {};
  const id = b.proyecto;
  medios.carpeta(id);
  const operacion = String(b.operacion || '');
  const coincide = operacion.match(OPERACION);
  if (!coincide || !MODELOS_VIDEO.includes(coincide[1])) throw new ErrorEstudio('Esa operación de video no es válida.', { estado: 400, tipo: 'peticion' });
  const modelo = coincide[1];

  const { cuenta, proyecto, token } = await google();
  let r;
  try {
    r = await fetch(urlVertex(proyecto, cfg.region, modelo, 'fetchPredictOperation'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({ operationName: operacion }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new ErrorEstudio('No hubo conexión con Google para consultar el video: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  if (!r.ok) throw errorDeGoogle(`la consulta del video (${modelo})`, r.status, d);
  if (!d.done) return { listo: false };

  // Terminada con error: se explica y la operación se da por cerrada.
  if (d.error) {
    const detalle = `${d.error.code || ''} — ${d.error.message || JSON.stringify(d.error)}`.slice(0, 1500);
    if (clasificar(detalle) === 'bloqueo') throw new ErrorEstudio('Google bloqueó este video con su filtro de seguridad. Reintentar igual no sirve: cambia el plano.', { estado: 422, tipo: 'bloqueo', detalle });
    throw new ErrorEstudio('Veo terminó la operación con un error y no hizo el video.', { estado: 502, tipo: 'veo_fallo', detalle });
  }
  const videos = d.response?.videos || [];
  if (!videos.length && d.response?.raiMediaFilteredCount > 0) {
    const motivo = (d.response.raiMediaFilteredReasons || []).join(' · ');
    throw new ErrorEstudio('Google bloqueó este video con su filtro de seguridad. Reintentar igual no sirve: cambia el plano.', { estado: 422, tipo: 'bloqueo', detalle: `blocked ${motivo}`.trim() });
  }
  const gcs = String(videos[0]?.gcsUri || '');
  const prefijo = `gs://${cfg.bucket}/`;
  if (!gcs.startsWith(prefijo)) throw new ErrorEstudio('Veo terminó pero no devolvió un video en tu bucket.', { estado: 502, tipo: 'veo_fallo', detalle: gcs || JSON.stringify(d.response || {}).slice(0, 300) });
  const ruta = medios.exigirDelProyecto(id, gcs.slice(prefijo.length));
  return { listo: true, ruta, url: firmarUrl(cuenta, cfg.bucket, ruta, { segundos: SIETE_DIAS }), modelo };
});
