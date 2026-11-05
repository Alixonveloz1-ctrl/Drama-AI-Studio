// ════════════════════════════════════════════════════════════════
// MEDIOS (navegador) — generar imágenes y verlas.
//
// Cola de la sección 18:
//  · Nada en paralelo: un elemento a la vez.
//  · Las peticiones de imagen y de arranque de video salen AL RITMO
//    de la cuota de Google (2 por minuto): cada una espera su turno
//    en una cola ordenada y sale en cuanto hay hueco, en vez de
//    lanzarse, chocar con el límite y esperar a ciegas. Vale igual
//    para los lotes y para los botones manuales: tocar «Generar» no
//    lanza la petición al instante si la cuota está llena; queda en
//    cola y sale cuando le toca.
//  · Un 429 es una espera: 60, 120, 180, 240 y 300 s, con cuenta atrás.
//  · Un bloqueo sale a la primera y se dice (reintentarlo lo vuelve a
//    bloquear y gasta cuota de verdad).
//  · Un elemento que falla no tumba la tanda: se cuenta y se sigue.
//  · «Detener» corta de verdad, también en mitad de una espera de minutos.
//  · Cada espera dice el MOTIVO real (antes decía «corte pasajero» para
//    todo y no se sabía qué pasaba).
//  · Si Google tardó demasiado y hubo que cortar, NO se reintenta solo:
//    Google pudo haber hecho (y cobrado) la imagen; se dice y se deja decidir.
// ════════════════════════════════════════════════════════════════
import { llamar, explicar } from './red.mjs';
import { esBloqueo, esCuota, errorDetenido } from './texto.mjs';

export const ESPERAS_CUOTA_MEDIOS = [60, 120, 180, 240, 300];

async function esperar(segundos, control, aviso, motivo) {
  for (let restante = segundos * 4; restante > 0; restante--) {
    if (control?.detenido) throw errorDetenido();
    if (restante % 4 === 0) {
      const s = restante / 4;
      aviso?.(`${motivo} Reintento en ${s >= 60 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : s + ' s'}.`);
    }
    await new Promise(listo => setTimeout(listo, 250));
  }
}

// El motivo de un fallo pasajero en pocas palabras, para la cuenta atrás.
export function motivoCorto(e) {
  const google = String(e?.detalleGoogle || '').match(/^\d{3}/)?.[0];
  if (e?.tipo === 'red') return 'Se cortó la conexión con el estudio (red del teléfono).';
  if (/\b503\b/.test(`${e?.message} ${e?.detalleGoogle || ''}`)) return 'Google está saturado ahora mismo (código 503).';
  if (/\b500\b/.test(`${e?.message} ${e?.detalleGoogle || ''}`)) return 'Google tuvo un fallo interno (código 500).';
  return `${String(e?.message || 'Fallo pasajero.').replace(/\s+$/, '')}${google ? ` (Google: ${google})` : ''}`;
}

// ─── Ritmo de cuota: salir al ritmo que Google permite ───
// La cuota de generación es de 2 peticiones por minuto (el modelo de
// imagen y el arranque de Veo). El ritmo anota cuándo salió cada
// petición y hace esperar a la siguiente SOLO lo que falta para que
// la más vieja de las últimas «maximo» cumpla la ventana: las dos
// primeras salen seguidas y después se abre un hueco cada media
// ventana. Quien espera conserva su turno (cola en orden de llegada),
// así un lote y los toques manuales comparten la misma fila.
export function crearRitmo({ maximo = 2, ventanaMs = 60000, ahora = () => Date.now() } = {}) {
  const salidas = [];
  let cadena = Promise.resolve();
  function faltaMs() {
    const t = ahora();
    while (salidas.length && t - salidas[0] >= ventanaMs) salidas.shift();
    return salidas.length < maximo ? 0 : Math.max(0, ventanaMs - (t - salidas[0]));
  }
  async function turno({ control, aviso } = {}) {
    let soltar;
    const miSalida = new Promise(r => { soltar = r; });
    const anterior = cadena;
    cadena = anterior.then(() => miSalida);
    await anterior;
    try {
      let ultimoAviso = -1;
      for (;;) {
        if (control?.detenido) throw errorDetenido();
        const falta = faltaMs();
        if (!falta) { salidas.push(ahora()); return; }
        const s = Math.ceil(falta / 1000);
        if (s !== ultimoAviso) {
          ultimoAviso = s;
          aviso?.(`En cola por la cuota de Google (${maximo} por minuto): esta generación sale en ${s} s, en cuanto haya hueco.`);
        }
        await new Promise(listo => setTimeout(listo, Math.min(250, falta)));
      }
    } finally { soltar(); }
  }
  return { turno, faltaMs };
}

// Solo la imagen y el arranque de video comparten esta cuota; la voz,
// la música, la transcripción y el montaje tienen las suyas y no se
// frenan aquí.
let ventanaRitmoMs = 60000;
export function fijarVentanaRitmo(ms) { ventanaRitmoMs = ms; }
const RITMOS = new Map();
function ritmoDe(ruta) {
  if (ruta !== '/api/imagen' && ruta !== '/api/video-inicio') return null;
  if (!RITMOS.has(ruta)) RITMOS.set(ruta, crearRitmo({ ventanaMs: ventanaRitmoMs }));
  return RITMOS.get(ruta);
}

// Una petición de medios con la política de esperas de imagen y video.
export async function pedirMedio(ruta, cuerpo, { control, aviso } = {}) {
  const ritmo = ritmoDe(ruta);
  if (ritmo) await ritmo.turno({ control, aviso });
  let cuota = 0, pasajero = 0;
  for (;;) {
    if (control?.detenido) throw errorDetenido();
    try {
      return await llamar(ruta, { metodo: 'POST', cuerpo, senal: control?.abortador.signal });
    } catch (e) {
      if (e.detenido || control?.detenido) throw errorDetenido();
      if (esBloqueo(e)) throw e;
      if (esCuota(e) && cuota < ESPERAS_CUOTA_MEDIOS.length) {
        await esperar(ESPERAS_CUOTA_MEDIOS[cuota++], control, aviso, 'Google pide esperar por el límite por minuto de tu cuenta.');
        continue;
      }
      if (e.tipo === 'tiempo') throw e;
      if (e.reintentable && pasajero < 2) {
        await esperar(pasajero++ ? 15 : 5, control, aviso, `${motivoCorto(e)} Se vuelve a intentar.`);
        continue;
      }
      throw e;
    }
  }
}

// ─── Tanda: uno a uno, saltando lo hecho, contando fallos ───
export async function tanda(elementos, { hacer, yaHecho = () => false, control, aviso, alAvanzar, palabra = 'generadas' }) {
  const cuenta = { generados: 0, existian: 0, fallidos: 0, bloqueados: 0, errores: [], palabra };
  for (let i = 0; i < elementos.length; i++) {
    if (control?.detenido) throw Object.assign(errorDetenido(), { cuenta });
    const el = elementos[i];
    if (yaHecho(el)) { cuenta.existian++; continue; }
    try {
      await hacer(el, { control, aviso: t => aviso?.(`${i + 1} de ${elementos.length} · ${t}`) });
      cuenta.generados++;
    } catch (e) {
      if (e.detenido) throw Object.assign(e, { cuenta });
      if (esBloqueo(e)) cuenta.bloqueados++;
      cuenta.fallidos++;
      cuenta.errores.push({ elemento: el, texto: explicar(e) });
    }
    alAvanzar?.(cuenta);
  }
  return cuenta;
}

export function resumenTanda(c) {
  const partes = [`${c.generados} ${c.palabra || 'generadas'}`];
  if (c.existian) partes.push(`${c.existian} ya existían`);
  if (c.fallidos) partes.push(`${c.fallidos} fallaron${c.bloqueados ? ` (${c.bloqueados} ${c.palabra === 'generados' ? 'bloqueados' : 'bloqueadas'} por Google)` : ''}`);
  return partes.join(' · ');
}

// ─── URLs firmadas para ver los medios (caducan; se piden de nuevo) ───
const cache = new Map();   // ruta → { url, caduca }
export function recordarUrl(ruta, url) {
  cache.set(ruta, { url, caduca: Date.now() + 5.5 * 3600 * 1000 });
}
export async function urlsDe(proyecto, rutas) {
  const faltan = [...new Set(rutas.filter(r => r && !(cache.get(r)?.caduca > Date.now())))];
  if (faltan.length) {
    const { urls } = await llamar('/api/urls', { metodo: 'POST', cuerpo: { proyecto, ver: faltan } });
    for (const [ruta, url] of Object.entries(urls || {})) recordarUrl(ruta, url);
  }
  return Object.fromEntries(rutas.map(r => [r, cache.get(r)?.url]));
}

// Pone la URL a cada <img data-ruta> y <video data-ruta> de un contenedor
// (y la imagen de portada a los videos con data-portada).
export async function cargarImagenes(contenedor, proyecto) {
  const medios = [...contenedor.querySelectorAll('img[data-ruta], video[data-ruta], audio[data-ruta]')];
  if (!medios.length || !proyecto) return;
  const rutas = medios.flatMap(m => [m.dataset.ruta, m.dataset.portada].filter(Boolean));
  try {
    const urls = await urlsDe(proyecto, rutas);
    for (const m of medios) {
      if (m.dataset.portada && urls[m.dataset.portada] && m.poster !== urls[m.dataset.portada]) m.poster = urls[m.dataset.portada];
      if (urls[m.dataset.ruta] && m.src !== urls[m.dataset.ruta]) m.src = urls[m.dataset.ruta];
    }
  } catch (e) {
    for (const m of medios) m.closest('.marco')?.setAttribute('data-error', 'No se pudo cargar: ' + explicar(e));
  }
}
