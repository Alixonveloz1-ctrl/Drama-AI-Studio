// ════════════════════════════════════════════════════════════════
// SUBTÍTULOS (navegador) — sección 15.
//
//  · Alineación forzada: el texto es el del guion; de Speech-to-Text solo se
//    toman los TIEMPOS de cada palabra y se casan con las palabras del guion.
//  · Si la transcripción falla o casa poco, respaldo proporcional dentro del
//    tramo de voz (por número de palabras).
//  · Se cortan en los signos de puntuación finales (. ! ? …) y se reparten
//    dentro de los límites de su línea; las frases muy largas se parten en
//    las comas para que quepan en pantalla.
// ════════════════════════════════════════════════════════════════
import { pedirMedio } from './medios.mjs';
import { normalizar } from './guion.mjs';

const palabrasDe = t => normalizar(t).split(' ').filter(Boolean);

// Tiempos de cada línea de un tramo: [{ inicio, fin }] relativos al tramo.
export function alinearTramo(textos, palabrasStt, duracion) {
  const guion = textos.map(palabrasDe);
  const stt = (palabrasStt || []).map(w => ({ p: normalizar(w.palabra).replace(/\s+/g, ''), inicio: w.inicio, fin: w.fin }));
  const total = guion.reduce((n, l) => n + l.length, 0) || 1;
  let j = 0, casadas = 0;
  const marcas = guion.map(linea => linea.map(palabra => {
    for (let k = j; k < Math.min(stt.length, j + 6); k++) {
      if (stt[k].p === palabra) { j = k + 1; casadas++; return stt[k]; }
    }
    return null;
  }));
  // Respaldo proporcional si casa menos de un tercio.
  if (!stt.length || casadas / total < 0.34) {
    let t = 0;
    return guion.map(l => {
      const d = duracion * (l.length || 1) / total;
      const r = { inicio: t, fin: t + d, metodo: 'proporcional' };
      t += d;
      return r;
    });
  }
  const tiempos = marcas.map(m => {
    const hechas = m.filter(Boolean);
    return hechas.length ? { inicio: hechas[0].inicio, fin: hechas.at(-1).fin, metodo: 'alineado' } : null;
  });
  // Las líneas sin ninguna palabra casada se reparten entre sus vecinas.
  tiempos.forEach((t, i) => {
    if (t) return;
    const antes = tiempos.slice(0, i).reverse().find(Boolean)?.fin ?? 0;
    const despues = tiempos.slice(i + 1).find(Boolean)?.inicio ?? duracion;
    tiempos[i] = { inicio: antes, fin: Math.max(antes + 0.3, despues), metodo: 'proporcional' };
  });
  return tiempos;
}

// Alinea los tramos de voz de una escena que aún no tengan tiempos.
export async function alinearEscena({ proyectoId, escena, control, aviso }) {
  for (const t of escena.voz?.tramos || []) {
    if (t.tiempos?.length === t.lineas.length) continue;
    const textos = t.lineas.map(i => escena.lineas[i]?.texto || '');
    let palabras = [];
    try {
      const r = await pedirMedio('/api/transcripcion', { proyecto: proyectoId, ruta: t.ruta }, { control, aviso });
      palabras = r.palabras || [];
    } catch (e) {
      if (e.detenido) throw e;
      // Sin transcripción: reparto proporcional (sección 15).
    }
    t.tiempos = alinearTramo(textos, palabras, t.segundos || 0);
  }
}

// Una línea → frases cortas con su tiempo, dentro de [inicio, fin].
export function frasesDeLinea(texto, inicio, fin) {
  let frases = String(texto).split(/(?<=[.!?…])\s+/).map(f => f.trim()).filter(Boolean);
  frases = frases.flatMap(f => {
    if (f.length <= 70) return [f];
    const trozos = [];
    let actual = '';
    for (const parte of f.split(/(?<=,)\s+/)) {
      if ((actual + ' ' + parte).trim().length > 60 && actual) { trozos.push(actual); actual = parte; } else actual = (actual + ' ' + parte).trim();
    }
    if (actual) trozos.push(actual);
    return trozos;
  });
  const pesos = frases.map(f => palabrasDe(f).length || 1);
  const suma = pesos.reduce((a, b) => a + b, 0);
  let t = inicio;
  return frases.map((f, i) => {
    const d = (fin - inicio) * pesos[i] / suma;
    const s = { inicio: t, fin: t + d, texto: f };
    t += d;
    return s;
  });
}
