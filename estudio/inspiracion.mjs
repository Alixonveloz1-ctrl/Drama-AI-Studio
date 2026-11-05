// ════════════════════════════════════════════════════════════════
// INSPIRACIÓN — a partir de un enlace de YouTube que ya funciona, el
// estudio mira su HISTORIA COMPLETA y la trae como encargo del guion:
// la misma historia, en el mismo orden, con sus mismos giros y
// recompensas, contada con palabras propias. Solo cambian los
// personajes y los lugares, que la herramienta crea nuevos. Con un
// enlace NO hay tres ideas (instrucción del dueño, 2026-11-04): las
// ideas se desfasaban de la historia; el flujo va directo a crear el
// universo y escribir el guion de ESTA historia. Las tres ideas
// quedan para cuando el concepto lo escribe el dueño.
//
// Cómo se mira (cada decisión costó un fallo real):
//  · Los subtítulos NO se pueden bajar desde un servidor: YouTube
//    los bloquea (comprobado el 2026-11-04). Nada de transcripciones.
//  · Gemini, con la cuenta de Google Cloud de la app, SÍ puede
//    mirar el video por su enlace (comprobado en la consola).
//  · El video entero no cabe en una sola mirada (una compilación
//    de 2 h pasa del millón de tokens), así que se mira por
//    trozos con principio y fin (modo trozo de api/inspiracion.js).
//  · Se mira el video COMPLETO, en trozos de 20 minutos (decisión
//    del dueño el 2026-11-04: la espera resultó corta). La sonda
//    trae la duración y de ella sale el número de trozos; sin
//    duración conocida se avanza por oleadas de 3 trozos hasta que
//    una oleada vuelva vacía (el video se acabó).
//  · Cada trozo vuelve con su historia detallada; al final, una
//    llamada de texto las une en LA historia, en orden y sin
//    abreviar: ese texto ES el encargo del guion.
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';
import { pedirTexto, parsearJSON } from './texto.mjs';

export const TROZO_S = 1200;   // 20 minutos por mirada
export const MAX_TROZOS = 18;  // hasta 6 horas de video

// Los trozos [desde, hasta) que cubren un video de esa duración.
export function trozosDeVideo(duracion) {
  const d = Number(duracion) || 0;
  const n = d > 0 ? Math.min(MAX_TROZOS, Math.max(1, Math.ceil(d / TROZO_S))) : 3;
  return Array.from({ length: n }, (_, i) => [i * TROZO_S, (i + 1) * TROZO_S]);
}

const SISTEMA_HISTORIADOR = 'Eres el historiador de un estudio de dramas cortos. A partir de los relatos por trozos de un video que funciona, escribes LA HISTORIA COMPLETA de ese video: la misma historia, en el mismo orden, con sus mismos giros, recompensas y traiciones, contada con palabras propias. No es un resumen ni un concepto: es el desarrollo entero, con todo el detalle que traen los relatos, porque de este texto se escribirá el guion de esta misma historia. No copias frases ni diálogos del video y no usas nombres propios: los personajes se nombran por su papel (el protagonista, su esposa, el villano…) porque la herramienta creará personajes nuevos. No inventes otra historia, no cambies el orden y no abrevies los giros: cada recompensa y cada revés importante de los relatos tiene que estar.';

function promptHistoria(resumenes) {
  return {
    sistema: SISTEMA_HISTORIADOR,
    mensaje: `Con estos relatos por trozos de un drama corto que funciona muy bien, escribe LA HISTORIA COMPLETA de ese video, en orden:

${resumenes.map(r => `— Minutos ${Math.round(r.desde / 60)} a ${Math.round(r.hasta / 60)}: ${r.texto}`).join('\n')}

La historia debe traer: el arranque (la situación del protagonista y el gancho de los primeros segundos), su ventaja o mecanismo especial y cómo funciona, y después el desarrollo tramo a tramo — cada giro, ganancia, pérdida, traición y revelación en su orden — hasta el cierre del video o el gancho con el que queda abierto. Escríbela como un relato continuo y detallado, listo para que un guionista escriba ESTA historia con personajes y lugares nuevos.

Devuelve SOLO JSON:
{"historia": "la historia completa del video, en orden y con todo su detalle"}`,
    temperatura: 0.4,
  };
}

// Mira el video COMPLETO y devuelve su historia, lista para el
// formulario como concepto-encargo del guion.
export async function historiaDesdeEnlace(enlace, { control, aviso } = {}) {
  let titulo = '', duracion = 0;
  try {
    const datos = await llamar('/api/inspiracion', { metodo: 'POST', cuerpo: { enlace }, senal: control?.abortador.signal });
    titulo = datos.titulo || '';
    duracion = Number(datos.duracion) || 0;
  } catch { /* la sonda es opcional: sin duración se avanza por oleadas */ }

  const pedirTrozo = async ([desde, hasta]) => {
    const r = await llamar('/api/inspiracion', { metodo: 'POST', cuerpo: { enlace, desde, hasta }, senal: control?.abortador.signal });
    return String(r?.resumen || '').trim();
  };
  const resumenes = [];
  const recoger = (trozos, textos) => textos.forEach((t, k) => { if (t) resumenes.push({ desde: trozos[k][0], hasta: trozos[k][1], texto: t }); });

  if (duracion > 0) {
    const trozos = trozosDeVideo(duracion);
    aviso?.(`Mirando el video completo (${trozos.length} ${trozos.length === 1 ? 'trozo' : 'trozos'} de 20 minutos a la vez)…`);
    const rs = await Promise.allSettled(trozos.map(pedirTrozo));
    recoger(trozos, rs.map(r => (r.status === 'fulfilled' ? r.value : '')));
    if (!resumenes.length && rs[0]?.status === 'rejected') throw rs[0].reason;
  } else {
    // Sin duración conocida: oleadas de 3 trozos hasta que una vuelva
    // vacía (el video se acabó) o se llegue al tope.
    for (let base = 0; base < MAX_TROZOS; base += 3) {
      const trozos = [0, 1, 2].map(k => [(base + k) * TROZO_S, (base + k + 1) * TROZO_S]);
      aviso?.(base === 0 ? 'Mirando el video por trozos de 20 minutos…' : `El video sigue: mirando del minuto ${(base * TROZO_S) / 60} en adelante…`);
      const rs = await Promise.allSettled(trozos.map(pedirTrozo));
      const textos = rs.map(r => (r.status === 'fulfilled' ? r.value : ''));
      if (!textos.some(Boolean)) {
        if (!resumenes.length && rs[0]?.status === 'rejected') throw rs[0].reason;
        break;
      }
      recoger(trozos, textos);
    }
  }
  if (!resumenes.length) {
    throw new Error('Gemini no devolvió nada de ese video: puede que sea privado, que tenga restricción de edad o que el enlace no apunte a un video. Prueba con otro video.');
  }

  aviso?.('Armando la historia completa de ese video…');
  let ultimo = '';
  for (let intento = 0; intento < 2; intento++) {
    const json = parsearJSON(await pedirTexto(promptHistoria(resumenes), { control, aviso }));
    const historia = String(json?.historia || '').trim();
    if (historia.length >= 300) return { texto: historia, titulo };
    ultimo = 'la historia salió incompleta';
  }
  throw new Error(`No pude armar la historia de ese video (${ultimo}). Inténtalo de nuevo.`);
}
