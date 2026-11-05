// ════════════════════════════════════════════════════════════════
// MONTAJE — lanza el trabajo de Cloud Run que monta el episodio final o el
// ZIP con todo el material (secciones 16 y 16.3).
//
//   POST { accion: 'iniciar', proyecto, hoja }       → { operacion, ruta, carpeta }
//   POST { accion: 'estado', proyecto, operacion, carpeta, ruta } → { listo, url? }
//
//  · El montador no conoce ningún archivo por su nombre: recibe en el bucket
//    la lista de descargas (origen → destino) y el guion de FFmpeg que
//    escribe ESTE servidor a partir de la hoja (nunca el navegador).
//  · El resultado queda en la carpeta de medios del proyecto y se descarga
//    con una URL firmada de corta vida.
//  · Si falla, el contenedor deja el motivo en error.txt: es lo único que
//    se puede leer desde el teléfono, y se devuelve con palabras.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, firmarUrl } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { validar, construir } = require('./_lib/hoja');

const OPERACION = /^projects\/[\w-]+\/locations\/[\w-]+\/operations\/[\w-]+$/;

function carpetaTrabajo(id, modo, episodio) {
  medios.carpeta(id);
  return `${cfg.prefijo}/proyectos/${id}/montaje/${modo}-ep${String(episodio).padStart(2, '0')}`;
}

async function subirTexto(token, ruta, contenido, tipo = 'text/plain; charset=utf-8') {
  const q = new URLSearchParams({ uploadType: 'media', name: ruta });
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o?${q}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo }, body: Buffer.from(contenido, 'utf8'), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new ErrorEstudio(`No se pudo preparar el montaje en el bucket (Google respondió ${r.status}).`, { estado: 502, tipo: 'google' });
}

async function leerTexto(token, ruta) {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o/${encodeURIComponent(ruta)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  return r.ok ? (await r.text()).trim() : '';
}

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const b = req.body || {};
  if (!cfg.bucket) throw new ErrorEstudio('Falta GCS_OUTPUT_BUCKET en Vercel. Vuelve a ejecutar el instalador.', { estado: 500, tipo: 'configuracion' });

  if (b.accion === 'estado') {
    const operacion = String(b.operacion || '');
    if (!OPERACION.test(operacion)) throw new ErrorEstudio('Esa operación de montaje no es válida.', { estado: 400, tipo: 'peticion' });
    const carpeta = String(b.carpeta || '');
    if (!carpeta.startsWith(`${cfg.prefijo}/proyectos/${b.proyecto}/montaje/`) || carpeta.includes('..')) throw new ErrorEstudio('Esa carpeta de montaje no es de este proyecto.', { estado: 400, tipo: 'peticion' });
    const ruta = medios.exigirDelProyecto(b.proyecto, b.ruta);
    const { cuenta, token } = await google();
    const r = await fetch(`https://run.googleapis.com/v2/${operacion}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw errorDeGoogle('la consulta del montaje', r.status, d);
    if (!d.done) return { listo: false };
    if (d.error) {
      const motivo = await leerTexto(token, `${carpeta}/error.txt`);
      throw new ErrorEstudio('El montaje falló y no se hizo el archivo.', { estado: 502, tipo: 'montaje_fallo', detalle: (motivo || d.error.message || JSON.stringify(d.error)).slice(0, 1400) });
    }
    const nombre = ruta.split('/').pop();
    return { listo: true, ruta, url: firmarUrl(cuenta, cfg.bucket, ruta, { segundos: 6 * 3600, descargarComo: nombre }), ver: firmarUrl(cuenta, cfg.bucket, ruta, { segundos: 6 * 3600 }) };
  }

  const hoja = validar(b.proyecto, b.hoja);
  const carpeta = carpetaTrabajo(b.proyecto, hoja.modo, hoja.episodio);
  const { script, descargas, textos, archivo } = construir(hoja, { bucket: cfg.bucket, carpeta });
  const ruta = medios.carpeta(b.proyecto) + archivo;
  const { proyecto, token } = await google();
  for (const [r, c] of textos) await subirTexto(token, r, c);
  // El salto de línea final NO es opcional: «read» de bash se salta la
  // última línea si no lo lleva y el último archivo no se descargaría.
  await subirTexto(token, `${carpeta}/descargas.txt`, descargas.map(([o, d]) => `${o}\t${d}`).join('\n') + '\n');
  await subirTexto(token, `${carpeta}/montar.sh`, script, 'text/x-shellscript');
  await subirTexto(token, `${carpeta}/hoja.json`, JSON.stringify(hoja, null, 1), 'application/json');
  await subirTexto(token, `${carpeta}/error.txt`, '');

  const job = cfg.trabajoMontaje, region = cfg.regionMontaje;
  const r = await fetch(`https://run.googleapis.com/v2/projects/${proyecto}/locations/${region}/jobs/${job}:run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides: { containerOverrides: [{ env: [
      { name: 'TRABAJO', value: `gs://${cfg.bucket}/${carpeta}` },
      { name: 'SALIDA', value: `gs://${cfg.bucket}/${ruta}` },
      { name: 'ARCHIVO', value: archivo },
    ] }] } }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new ErrorEstudio(`No encuentro el montador «${job}» en ${region}. Ejecuta el instalador (./c en Cloud Shell): es el que lo crea.`, { estado: 502, tipo: 'configuracion', detalle: JSON.stringify(d).slice(0, 300) });
    throw errorDeGoogle('el montador', r.status, d);
  }
  if (!d.name) throw new ErrorEstudio('Google aceptó el montaje pero no devolvió el número de la operación.', { estado: 502, tipo: 'google' });
  return { operacion: d.name, ruta, carpeta };
});
