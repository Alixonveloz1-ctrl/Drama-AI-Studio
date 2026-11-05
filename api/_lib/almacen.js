// ════════════════════════════════════════════════════════════════
// ALMACÉN — los proyectos viven en el bucket, que es la única fuente de
// verdad. Lecciones del estudio de anime:
//
//  · Cada lectura devuelve la "generación" del objeto y cada escritura exige
//    la generación que este dispositivo vio por última vez. Una petición
//    tardía, otra pestaña o una copia vieja ya no pueden pisar trabajo más
//    nuevo: el guardado recibe 409 y se avisa.
//  · Solo un 404 de verdad significa "no existe". Cualquier otro fallo de
//    lectura es un error: nunca un proyecto vacío ni uno que "desapareció".
//  · La versión que se sustituye se guarda en historial/ antes de escribir.
//  · Un proyecto que no se puede leer ahora aparece en la lista como
//    ilegible; no desaparece en silencio.
//  · TODO vive bajo el prefijo del estudio (GCS_PREFIX): nunca se escribe ni
//    se lee fuera de él.
// ════════════════════════════════════════════════════════════════
const { createHash } = require('node:crypto');
const { cfg } = require('./google');
const { ErrorEstudio } = require('./errores');

const MAX_BYTES = 3.5 * 1024 * 1024;
const REINTENTABLES = new Set([408, 429, 500, 502, 503, 504]);
const idValido = id => typeof id === 'string' && /^p[a-z0-9]{8,40}$/.test(id);
const raiz = () => `${cfg.prefijo}/proyectos`;
const rutaProyecto = id => `${raiz()}/${id}/proyecto.json`;
const rutaHistorial = id => `${raiz()}/${id}/historial/`;
const base = () => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o`;
const urlObjeto = (ruta, params) => `${base()}/${encodeURIComponent(ruta)}?${new URLSearchParams(params)}`;

function exigirBucket() {
  if (!cfg.bucket) throw new ErrorEstudio('Falta la variable GCS_OUTPUT_BUCKET en Vercel: no hay dónde guardar.', { estado: 500, tipo: 'configuracion' });
}

// Una petición a Cloud Storage, repetida una vez si Google responde con un
// estado pasajero.
async function gcs(token, url, opciones = {}) {
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, {
      ...opciones,
      headers: { Authorization: `Bearer ${token}`, ...opciones.headers },
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok || r.status === 404 || r.status === 412 || intento >= 1 || !REINTENTABLES.has(r.status)) return r;
    await new Promise(listo => setTimeout(listo, 400));
  }
}

function leerManifiesto(crudo, id) {
  try {
    const m = JSON.parse(crudo);
    return m && m.id === id && m.datos && typeof m.datos === 'object' && !Array.isArray(m.datos) ? m : null;
  } catch { return null; }
}

// { manifiesto, generacion }. Si no existe: { manifiesto: null, generacion: '0' }
// ('0' es lo que Cloud Storage entiende por "no debe existir todavía").
async function leer(token, id) {
  exigirBucket();
  for (let intento = 0; intento < 2; intento++) {
    const meta = await gcs(token, urlObjeto(rutaProyecto(id), { fields: 'generation' }));
    if (meta.status === 404) return { manifiesto: null, generacion: '0' };
    if (!meta.ok) throw new ErrorEstudio(`No se pudo leer el proyecto en el bucket (Google respondió ${meta.status}). No se supone vacío.`, { estado: 502, tipo: 'google' });
    const { generation } = await meta.json();
    // Se lee exactamente esa generación: contenido y versión siempre casan.
    const cuerpo = await gcs(token, urlObjeto(rutaProyecto(id), { alt: 'media', generation }));
    if (cuerpo.status === 404) continue;   // lo sustituyeron entre las dos peticiones
    if (!cuerpo.ok) throw new ErrorEstudio(`No se pudo leer el proyecto en el bucket (Google respondió ${cuerpo.status}).`, { estado: 502, tipo: 'google' });
    const manifiesto = leerManifiesto(await cuerpo.text(), id);
    if (!manifiesto) throw new ErrorEstudio('El archivo del proyecto en el bucket está dañado o no es de este estudio. No se tocó.', { estado: 422, tipo: 'fallo' });
    return { manifiesto, generacion: String(generation) };
  }
  throw new ErrorEstudio('El proyecto está cambiando ahora mismo desde otro sitio. Vuelve a intentarlo.', { estado: 409, tipo: 'conflicto' });
}

async function listar(token) {
  exigirBucket();
  const prefijo = raiz() + '/';
  const nombres = [];
  let pagina = '';
  do {
    const q = new URLSearchParams({ prefix: prefijo, fields: 'items(name),nextPageToken', ...(pagina ? { pageToken: pagina } : {}) });
    const r = await gcs(token, `${base()}?${q}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorEstudio(`No se pudo leer la lista de proyectos del bucket (Google respondió ${r.status}). No se supone vacía.`, { estado: 502, tipo: 'google' });
    for (const item of d.items || []) nombres.push(item.name);
    pagina = d.nextPageToken || '';
  } while (pagina);
  const ids = [...new Set(nombres.map(n => /^.*\/proyectos\/(p[a-z0-9]{8,40})\/proyecto\.json$/.exec(n)?.[1]).filter(Boolean))];
  const proyectos = [], ilegibles = [];
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async id => {
      try {
        const r = await gcs(token, urlObjeto(rutaProyecto(id), { alt: 'media' }));
        if (r.status === 404) return;   // se borró después de listar
        if (!r.ok) throw new Error(String(r.status));
        const m = leerManifiesto(await r.text(), id);
        if (!m) throw new Error('formato');
        proyectos.push({ id, nombre: m.nombre || 'Drama sin título', creado: m.creado || 0, actualizado: m.actualizado || 0, resumen: m.resumen || {} });
      } catch {
        ilegibles.push(id);
      }
    }));
  }
  proyectos.sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
  return { proyectos, ilegibles };
}

// cuerpo: { datos, nombre, resumen, generacionBase }
// generacionBase es la versión que este dispositivo leyó o escribió por
// última vez ('0' para un proyecto nuevo). Sin ella no se guarda.
async function guardar(token, id, cuerpo) {
  exigirBucket();
  const datos = cuerpo?.datos;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new ErrorEstudio('No hay datos de proyecto que guardar.', { estado: 400, tipo: 'peticion' });
  const generacionBase = cuerpo.generacionBase;
  if (generacionBase === undefined || generacionBase === null || !/^\d+$/.test(String(generacionBase))) throw new ErrorEstudio('Falta la versión del proyecto que se está guardando.', { estado: 400, tipo: 'peticion' });
  const { manifiesto: existente, generacion } = await leer(token, id);
  if (String(generacionBase) !== generacion) {
    throw Object.assign(new ErrorEstudio(existente
      ? 'Este proyecto cambió en otro dispositivo o pestaña después de abrirlo aquí. No se pisó: vuelve a abrirlo.'
      : 'Ese proyecto ya no existe en el bucket.', { estado: 409, tipo: 'conflicto' }), { generacion });
  }
  const ahora = Date.now();
  const manifiesto = {
    version: 1, id,
    nombre: String(cuerpo.nombre || existente?.nombre || 'Drama sin título').trim().slice(0, 200) || 'Drama sin título',
    creado: existente?.creado || ahora,
    actualizado: ahora,
    resumen: cuerpo.resumen && typeof cuerpo.resumen === 'object' ? cuerpo.resumen : {},
    datos,
  };
  const crudo = JSON.stringify(manifiesto);
  if (Buffer.byteLength(crudo, 'utf8') > MAX_BYTES) {
    throw new ErrorEstudio('El proyecto es demasiado grande para guardarlo así; no debe llevar imágenes ni audio dentro.', { estado: 413, tipo: 'peticion' });
  }
  // La versión que se sustituye se conserva en el historial.
  if (existente) {
    const copia = JSON.stringify(existente);
    const nombre = rutaHistorial(id) + createHash('sha256').update(copia).digest('hex') + '.json';
    const q = new URLSearchParams({ uploadType: 'media', name: nombre, ifGenerationMatch: '0' });
    const r = await gcs(token, `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o?${q}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: copia });
    if (!r.ok && r.status !== 412) throw new ErrorEstudio(`No se pudo guardar la copia de seguridad antes de escribir (Google respondió ${r.status}). No se tocó el proyecto.`, { estado: 502, tipo: 'google' });
  }
  const q = new URLSearchParams({ uploadType: 'media', name: rutaProyecto(id), ifGenerationMatch: generacion });
  const r = await gcs(token, `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(cfg.bucket)}/o?${q}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: crudo });
  if (r.status === 412) throw new ErrorEstudio('Otro guardado llegó justo antes que este. No se pisó: vuelve a abrir el proyecto.', { estado: 409, tipo: 'conflicto' });
  if (!r.ok) throw new ErrorEstudio(`No se pudo guardar el proyecto en el bucket (Google respondió ${r.status}).`, { estado: 502, tipo: 'google' });
  const escrito = await r.json().catch(() => ({}));
  return { id, nombre: manifiesto.nombre, actualizado: manifiesto.actualizado, generacion: escrito.generation ? String(escrito.generation) : null };
}

module.exports = { idValido, leer, listar, guardar, rutaProyecto, MAX_BYTES };
