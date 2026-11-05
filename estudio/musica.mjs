// ════════════════════════════════════════════════════════════════
// MÚSICA (navegador) — una pieza por acto con Lyria 3 Pro (sección 14.4).
//
//  · Actos: cada bloque del guion es un acto; en la prueba de 3 minutos (un
//    solo bloque) se parte en dos, para que la banda sonora cambie.
//  · El director musical recibe la historia entera de cada acto (lugar, lo
//    que pasa, lo que se dice y el minuto en que empieza cada escena) y
//    escribe en inglés una pieza con su línea de tiempo.
//  · Cada pieza dura lo que dura su acto (hasta 184 s, el límite de Lyria
//    3 Pro). Antes eran clips de 30 s en bucle: sonaban viejos y repetidos.
//    Si un acto dura más, el montaje repite la pieza con fundidos.
// ════════════════════════════════════════════════════════════════
import { pedirTexto, parsearJSON } from './texto.mjs';
import { pedirMedio, recordarUrl } from './medios.mjs';
import { promptMusica, segundosDe, MUSICA_PROHIBIDA } from './prompts.mjs';
import { contarPalabras } from './guion.mjs';
import { segundosVoz } from './voces.mjs';

// La 1 era Lyria 2 (30 s en bucle); la 2 es Lyria 3 Pro con director con contexto.
export const VERSION_MUSICA = 2;
export const MAX_PIEZA = 184;
export const musicaVigente = m => Boolean(m?.ruta) && m.version === VERSION_MUSICA;

// Lo que dura una escena en el montaje: su voz más las pausas de entrada,
// entre tramos y de salida (aprox.; si no hay voz, por palabras).
const duracionEscena = e => (segundosVoz(e) || segundosDe(contarPalabras(e.lineas.map(l => l.texto).join(' ')))) + 0.35 + 0.5 + 0.25 * Math.max(0, (e.voz?.tramos?.length || 1) - 1);

export function actosDelEpisodio(ep) {
  const bloques = ep?.bloques || [];
  let grupos = bloques.map(b => b.escenas);
  if (grupos.length === 1 && grupos[0].length >= 2) {
    const mitad = Math.ceil(grupos[0].length / 2);
    grupos = [grupos[0].slice(0, mitad), grupos[0].slice(mitad)];
  }
  return grupos.map((escenas, i) => {
    let t = 0;
    const detalle = escenas.map(e => {
      const d = { titulo: e.titulo, accion: e.accion, escenario: e.escenario, inicio: t, frases: (e.lineas || []).slice(0, 4) };
      t += duracionEscena(e);
      return d;
    });
    return {
      numero: i + 1,
      escenas: escenas.map(e => e.id),
      segundos: t,
      segundosPieza: Math.max(15, Math.min(MAX_PIEZA, Math.ceil(t + 3))),
      resumen: escenas.map(e => `${e.titulo}: ${e.accion}`).join(' / ').slice(0, 600),
      detalle,
    };
  });
}

export function validarMusica(json, actos) {
  const problemas = [];
  const briefs = {};
  for (const a of actos) {
    const brief = String((json?.pistas || []).find(p => Number(p?.acto) === a.numero)?.brief || '').replace(/\s+/g, ' ').trim();
    const prohibida = MUSICA_PROHIBIDA.find(p => new RegExp(`\\b${p.replace(/[-]/g, '\\-')}\\b`, 'i').test(brief));
    const palabras = contarPalabras(brief);
    if (palabras < 60) problemas.push(`la pieza del acto ${a.numero} tiene ${palabras} palabras y necesita al menos 90, con su línea de tiempo`);
    else if (/[áéíóúñ¿¡]/i.test(brief)) problemas.push(`la descripción del acto ${a.numero} tiene español y la música se pide en inglés`);
    else if (prohibida) problemas.push(`la descripción del acto ${a.numero} nombra «${prohibida}», que está prohibido (no lo nombres ni para negarlo)`);
    else if (!/\d:\d\d/.test(brief)) problemas.push(`la descripción del acto ${a.numero} no tiene línea de tiempo con marcas como 0:00-0:30`);
    else briefs[a.numero] = brief;
  }
  return { problemas, briefs };
}

// Escribe los briefs que falten y genera las piezas que falten, una a una.
// La música de una versión anterior se rehace entera (brief y pieza).
export async function generarMusica({ proyectoId, datos, numero, control, aviso, guardar, alAvanzar }) {
  const ep = datos.episodios[numero];
  const actos = actosDelEpisodio(ep);
  ep.musica ||= {};
  for (const a of actos) if (ep.musica[a.numero] && ep.musica[a.numero].version !== VERSION_MUSICA) delete ep.musica[a.numero];
  const sinBrief = actos.filter(a => !ep.musica[a.numero]?.brief);
  if (sinBrief.length) {
    let comentario = '', ultimo = '';
    for (let intento = 0; intento < 3 && sinBrief.some(a => !ep.musica[a.numero]?.brief); intento++) {
      aviso?.('El director musical escribe la música de cada acto…');
      const faltan = sinBrief.filter(a => !ep.musica[a.numero]?.brief);
      const p = promptMusica(datos, faltan);
      const json = parsearJSON(await pedirTexto({ ...p, mensaje: p.mensaje + comentario }, { control, aviso }));
      const { problemas, briefs } = validarMusica(json, faltan);
      for (const [n, brief] of Object.entries(briefs)) ep.musica[n] = { brief, version: VERSION_MUSICA };
      ultimo = problemas.join('; ');
      comentario = problemas.length ? `\n\nREINTENTO OBLIGATORIO: ${ultimo}.` : '';
    }
    if (sinBrief.some(a => !ep.musica[a.numero]?.brief)) throw new Error(`El director musical no escribió la música de todos los actos (${ultimo}).`);
    await guardar();
  }
  let hechas = 0;
  for (const a of actos) {
    const pista = ep.musica[a.numero];
    if (pista.ruta) continue;
    aviso?.(`música del acto ${a.numero} de ${actos.length} (una pieza de ${a.segundosPieza} s tarda un par de minutos)…`);
    const r = await pedirMedio('/api/musica', { proyecto: proyectoId, clave: `musica-ep${numero}-${a.numero}-v${VERSION_MUSICA}`, brief: pista.brief, segundos: a.segundosPieza }, { control, aviso });
    recordarUrl(r.ruta, r.url);
    ep.musica[a.numero] = { ...pista, ruta: r.ruta, segundos: r.segundos || a.segundosPieza, version: VERSION_MUSICA, fecha: Date.now() };
    hechas++;
    await guardar();
    alAvanzar?.();
  }
  return hechas;
}
