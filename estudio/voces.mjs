// ════════════════════════════════════════════════════════════════
// VOCES (navegador) — sección 14.
//
//  · Las voces se le piden a Google (no hay lista escrita aquí).
//  · Cada personaje recibe SU voz automáticamente, distinta de las demás y
//    acorde a si es mujer u hombre (el dueño no tiene que elegir nada; si
//    quiere, puede cambiarla en Personajes). El Sistema y cada extra con
//    nombre también tienen su voz fija. La voz pertenece a la identidad
//    madre: una variante habla con la voz de su personaje.
//  · Las voces son Chirp 3 HD (decisión del dueño: las de Gemini salían con
//    pausas raras). Una llamada por tramo de una misma voz, nunca una línea
//    suelta; si hay que rehacer, se rehace la escena entera.
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';
import { pedirMedio, recordarUrl } from './medios.mjs';
import { sexoDe } from './imagenes.mjs';

let cacheVoces = null;
export async function vocesDisponibles() {
  if (!cacheVoces) cacheVoces = llamar('/api/voz').then(r => r.voces).catch(e => { cacheVoces = null; throw e; });
  return cacheVoces;
}

// Número estable a partir de un texto (para que un extra conserve su voz).
function hash(texto) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// Reparte voces a quien no la tenga. Devuelve true si cambió algo.
export function asignarVoces(u, voces) {
  if (!voces?.length) return false;
  const usadas = new Set([...u.personajes.map(p => p.voz), u.vozSistema].filter(Boolean));
  let cambio = false;
  const elegir = (genero, semilla) => {
    const candidatas = voces.filter(v => !genero || v.genero === genero);
    const lista = candidatas.length ? candidatas : voces;
    const libres = lista.filter(v => !usadas.has(v.nombre));
    const de = libres.length ? libres : lista;
    const v = de[hash(semilla) % de.length];
    usadas.add(v.nombre);
    return v.nombre;
  };
  for (const p of u.personajes) {
    if (p.voz && voces.some(v => v.nombre === p.voz)) continue;
    p.voz = elegir(sexoDe(p), p.id + p.nombre);
    cambio = true;
  }
  if (u.tieneSistema && !u.vozSistema) { u.vozSistema = elegir('', 'sistema'); cambio = true; }
  return cambio;
}

// La voz de quien dice una línea.
export function vozDe(u, linea) {
  if (linea.tipo === 'sistema') return u.vozSistema;
  const madre = (u.variantes || []).find(v => v.id === linea.personaje)?.madre;
  const p = u.personajes.find(x => x.id === (madre || linea.personaje));
  if (p) return p.voz;
  // Un extra: voz estable por su nombre, entre las que no usa el reparto.
  u.vocesExtra ||= {};
  return u.vocesExtra[linea.nombre || 'Extra'];
}

export function asignarExtras(u, escenas, voces) {
  u.vocesExtra ||= {};
  const reparto = new Set([...u.personajes.map(p => p.voz), u.vozSistema].filter(Boolean));
  let cambio = false;
  for (const l of escenas.flatMap(e => e.lineas)) {
    const nombre = l.nombre || 'Extra';
    if (l.personaje !== 'extra' || u.vocesExtra[nombre]) continue;
    const libres = voces.filter(v => !reparto.has(v.nombre));
    const de = libres.length ? libres : voces;
    u.vocesExtra[nombre] = de[hash(nombre) % de.length].nombre;
    cambio = true;
  }
  return cambio;
}

// Versión de la forma de grabar: las voces de versiones anteriores se
// rehacen (la 1 salía cruzada con dos hablantes por llamada; la 2 era Gemini
// TTS, con pausas raras; la 3 es Chirp 3 HD).
export const VERSION_VOZ = 3;
export const vozVigente = e => Boolean(e?.voz?.tramos?.length) && !e.voz.obsoleta && e.voz.version === VERSION_VOZ;

// Parte la escena en tramos: líneas seguidas de la MISMA voz (y del mismo
// tipo: lo pensado va aparte). Así cada llamada tiene un solo hablante y al
// motor solo le llega lo que se dice.
export function tramosDeEscena(escena, u) {
  const tramos = [];
  let actual = null;
  escena.lineas.forEach((l, indice) => {
    const voz = vozDe(u, l);
    if (!voz) throw new Error(`Falta la voz de ${l.tipo === 'sistema' ? 'el Sistema' : l.nombre || l.personaje}.`);
    const pensamiento = l.tipo === 'pensamiento';
    if (!actual || actual.voz !== voz || actual.pensamiento !== pensamiento) {
      actual = { voz, pensamiento, lineas: [] };
      tramos.push(actual);
    }
    actual.lineas.push({ texto: l.texto, indice });
  });
  return tramos;
}

// Genera la voz de una escena entera (todos sus tramos). Solo se guarda
// cuando están todos: una escena nunca queda con la mitad de voces nuevas.
export async function vozEscena({ proyectoId, datos, escena, control, aviso, guardar }) {
  const u = datos.universo;
  const voces = await vocesDisponibles();
  if (asignarVoces(u, voces) | asignarExtras(u, [escena], voces)) await guardar();
  const tramos = tramosDeEscena(escena, u);
  const hechos = [];
  for (const [i, t] of tramos.entries()) {
    aviso?.(`voz de la escena · tramo ${i + 1} de ${tramos.length}…`);
    const r = await pedirMedio('/api/voz', {
      proyecto: proyectoId, clave: `voz-${escena.id}-${i + 1}`, voz: t.voz,
      lineas: t.lineas.map(l => l.texto),
    }, { control, aviso });
    recordarUrl(r.ruta, r.url);
    hechos.push({ ruta: r.ruta, segundos: r.segundos || 0, lineas: t.lineas.map(l => l.indice) });
  }
  escena.voz = { tramos: hechos, fecha: Date.now(), version: VERSION_VOZ };
  await guardar();
  return escena.voz;
}

// Muestra de una voz, para oírla antes de elegirla (se guarda y se reutiliza).
// Las muestras viejas (Gemini) quedan en «muestrasVoz» y ya no se usan.
export const TEXTO_MUESTRA = 'Hola. Así sonaría mi voz en este drama. ¿Te convence, o prefieres otra?';
export const muestraGuardada = (datos, voz) => datos?.muestrasChirp?.[voz];
export async function muestraDeVoz({ proyectoId, datos, voz, guardar }) {
  datos.muestrasChirp ||= {};
  if (datos.muestrasChirp[voz]) return datos.muestrasChirp[voz];
  const r = await pedirMedio('/api/voz', { proyecto: proyectoId, clave: `muestra-chirp-${voz.toLowerCase()}`, voz, lineas: [TEXTO_MUESTRA] });
  recordarUrl(r.ruta, r.url);
  datos.muestrasChirp[voz] = r.ruta;
  await guardar();
  return r.ruta;
}

export const segundosVoz = escena => (escena.voz?.tramos || []).reduce((n, t) => n + (t.segundos || 0), 0);
