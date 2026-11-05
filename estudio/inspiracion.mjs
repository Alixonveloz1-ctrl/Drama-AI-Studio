// ════════════════════════════════════════════════════════════════
// INSPIRACIÓN — a partir de un enlace de YouTube que ya funciona, el
// estudio mira su historia y destila su CONCEPTO: la premisa
// general y el motor que la hace avanzar (cómo engancha, cómo
// narra el protagonista, cada cuánto llega un giro o una
// recompensa, qué se repite). Con ese concepto en el formulario,
// las ideas y el guion se escriben como una historia propia,
// desarrollada de nuevo: no se copian las frases del video ni sus
// nombres, se toma la forma que ya demostró funcionar.
//
// Cómo se mira (cada decisión costó un fallo real):
//  · Los subtítulos NO se pueden bajar desde un servidor: YouTube
//    los bloquea (comprobado el 2026-11-04). Nada de transcripciones.
//  · Gemini, con la cuenta de Google Cloud de la app, SÍ puede
//    mirar el video por su enlace (comprobado en la consola).
//  · El video entero no cabe en una sola mirada (una compilación
//    de 2 h pasa del millón de tokens), así que se mira por
//    trozos con principio y fin (modo trozo de api/inspiracion.js).
//  · El dueño decidió que basta la PRIMERA HORA: 3 trozos de 20
//    minutos, pedidos a la vez. Si el video dura menos, los
//    trozos que quedan fuera devuelven vacío o fallan y se sigue
//    con los que sí trajeron resumen.
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';
import { pedirTexto, parsearJSON } from './texto.mjs';

// Primera hora del video, en trozos de 20 minutos [desde, hasta) en segundos.
export const TROZOS_VIDEO = [[0, 1200], [1200, 2400], [2400, 3600]];

const SISTEMA_ANALISTA = 'Eres un analista de dramas cortos que funcionan en redes. Estudias videos para quedarte con su CONCEPTO: la premisa general de la historia y el motor que la hace avanzar. No copias frases del video ni nombres propios: describes la forma de la historia, no su texto.';

function promptConcepto(resumenes) {
  return {
    sistema: SISTEMA_ANALISTA,
    mensaje: `Con estos resúmenes de la primera hora de un drama corto que funciona muy bien, destila su CONCEPTO para escribir una historia NUEVA con la misma forma. La premisa se reescribe con palabras propias, como concepto general (de qué trata, qué mecanismo especial tiene el protagonista, qué gana con él y cómo crece), sin copiar frases ni nombres del video. El motor son las reglas de forma que hacen que funcione.

RESÚMENES:
${resumenes.map(r => `— Trozo (minutos ${TROZOS_VIDEO[r.i][0] / 60} a ${TROZOS_VIDEO[r.i][1] / 60}): ${r.texto}`).join('\n')}

Devuelve SOLO JSON:
{"premisa": "3 a 5 frases: el concepto general de la historia, listo para usarlo como concepto de un drama nuevo", "motor": ["regla de forma 1 (el gancho de los primeros segundos)", "regla 2 (cómo narra el protagonista)", "regla 3 (cada cuánto llega un giro o una recompensa)", "regla 4 (qué se repite en cada ciclo)", "regla 5 (cómo cierra o engancha al siguiente)"]}`,
    temperatura: 0.4,
  };
}

export function textoDeConcepto({ premisa, motor }) {
  return `${premisa}\n\nMotor de la historia (lo que hace que funcione):\n${(motor || []).map(m => '• ' + m).join('\n')}`;
}

// Mira la primera hora del video y devuelve el texto de concepto
// listo para el formulario.
export async function conceptoDesdeEnlace(enlace, { control, aviso } = {}) {
  let titulo = '';
  try {
    const datos = await llamar('/api/inspiracion', { metodo: 'POST', cuerpo: { enlace }, senal: control?.abortador.signal });
    titulo = datos.titulo || '';
  } catch { /* el título es opcional: el concepto no depende de él */ }

  aviso?.('Mirando la primera hora del video (3 trozos de 20 minutos a la vez)…');
  const resultados = await Promise.allSettled(TROZOS_VIDEO.map(([desde, hasta]) =>
    llamar('/api/inspiracion', { metodo: 'POST', cuerpo: { enlace, desde, hasta }, senal: control?.abortador.signal })));
  const resumenes = resultados
    .map((r, i) => ({ i, texto: r.status === 'fulfilled' ? String(r.value?.resumen || '').trim() : '' }))
    .filter(r => r.texto);
  if (!resumenes.length) {
    const primero = resultados[0];
    if (primero.status === 'rejected') throw primero.reason;
    throw new Error('Gemini no devolvió nada de ese video: puede que sea privado, que tenga restricción de edad o que el enlace no apunte a un video. Prueba con otro video.');
  }
  if (resumenes.length < TROZOS_VIDEO.length) {
    aviso?.(`El video no llega a la hora: sigo con sus ${resumenes.length} trozos.`);
  }

  aviso?.('Destilando el concepto de esa historia…');
  let ultimo = '';
  for (let intento = 0; intento < 2; intento++) {
    const json = parsearJSON(await pedirTexto(promptConcepto(resumenes), { control, aviso }));
    const premisa = String(json?.premisa || '').trim();
    const motor = Array.isArray(json?.motor) ? json.motor.map(m => String(m).trim()).filter(Boolean) : [];
    if (premisa.length >= 80 && motor.length >= 3) return { texto: textoDeConcepto({ premisa, motor }), titulo };
    ultimo = 'la destilación salió incompleta';
  }
  throw new Error(`No pude destilar el concepto de ese video (${ultimo}). Inténtalo de nuevo.`);
}
