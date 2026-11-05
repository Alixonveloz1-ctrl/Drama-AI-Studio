// ════════════════════════════════════════════════════════════════
// MEDIOS — imágenes, audio y video de cada proyecto en el bucket.
//
// Todo vive en <GCS_PREFIX>/proyectos/<id>/medios/. El servidor se niega a
// leer, escribir o firmar nada fuera de esa carpeta (el nombre viene del
// navegador y se vuelve a comprobar aquí).
// ════════════════════════════════════════════════════════════════
const { cfg } = require('./google');
const { ErrorEstudio } = require('./errores');
const { idValido } = require('./almacen');

const CLAVE = /^[a-z0-9][a-z0-9_-]{1,80}$/;

function carpeta(id) {
  if (!idValido(id)) throw new ErrorEstudio('Ese identificador de proyecto no es válido.', { estado: 400, tipo: 'peticion' });
  return `${cfg.prefijo}/proyectos/${id}/medios/`;
}

function rutaMedio(id, clave, extension) {
  if (!CLAVE.test(String(clave || ''))) throw new ErrorEstudio('Ese nombre de archivo no es válido.', { estado: 400, tipo: 'peticion' });
  return carpeta(id) + clave + '.' + extension;
}

// Una ruta que llega del navegador solo vale si es de ESTE proyecto.
function exigirDelProyecto(id, ruta) {
  const base = carpeta(id);
  const r = String(ruta || '');
  if (!r.startsWith(base) || r.includes('..') || !/^[\w./-]+$/.test(r)) {
    throw new ErrorEstudio('Esa ruta de archivo no pertenece a este proyecto.', { estado: 400, tipo: 'peticion' });
  }
  return r;
}

const urlObjeto = (ruta, params = {}) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o/${encodeURIComponent(ruta)}?${new URLSearchParams(params)}`;

// Lee un archivo entero. Un fallo de lectura es un error con palabras, nunca
// un "no existe" (salvo un 404 de verdad).
async function leer(token, ruta, quePara) {
  const r = await fetch(urlObjeto(ruta, { alt: 'media' }), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) throw new ErrorEstudio(`No se encontró ${quePara} en el bucket.`, { estado: 409, tipo: 'falta_referencia' });
  if (!r.ok) throw new ErrorEstudio(`No se pudo leer ${quePara} del bucket (Google respondió ${r.status}).`, { estado: 502, tipo: 'google' });
  return { bytes: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') || 'application/octet-stream' };
}

async function guardar(token, ruta, bytes, tipo, { espera = 20000 } = {}) {
  const q = new URLSearchParams({ uploadType: 'media', name: ruta });
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o?${q}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo }, body: bytes, signal: AbortSignal.timeout(espera),
  });
  if (!r.ok) throw new ErrorEstudio(`No se pudo guardar el archivo en el bucket (Google respondió ${r.status}).`, { estado: 502, tipo: 'google' });
  const d = await r.json().catch(() => ({}));
  return { generacion: d.generation ? String(d.generation) : null, bytes: bytes.length };
}

// ¿Existe? Se pregunta por los metadatos: saber si algo se generó no debe
// costar su descarga. null = no se pudo comprobar (no es lo mismo que "no").
async function existe(token, ruta) {
  const r = await fetch(urlObjeto(ruta, { fields: 'generation,size' }), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return false;
  if (!r.ok) return null;
  return true;
}

module.exports = { carpeta, rutaMedio, exigirDelProyecto, leer, guardar, existe };
