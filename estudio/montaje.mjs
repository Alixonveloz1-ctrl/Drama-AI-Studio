// ════════════════════════════════════════════════════════════════
// MONTAJE (navegador) — sección 16 y export ZIP (16.3).
//
//  · Arma la HOJA DE MONTAJE con datos: cada plano con su duración, cada
//    tramo de voz en su instante, la música por actos y los subtítulos. El
//    guion de FFmpeg lo escribe el servidor a partir de ella.
//  · Cada escena dura exactamente su narración (más una entrada y una cola
//    cortas). Sus planos ya NO se reparten solo por peso editorial: cada
//    plano está anclado a la frase que le corresponde (el ancla literal que
//    guarda el desglose) y el cambio de plano llega cuando empieza la
//    frase siguiente. Si ningún plano de la escena tiene un ancla que se
//    pueda situar en la voz, se conserva el reparto por peso de antes, para
//    no romper escenas antiguas.
//  · Un plano con video usa el clip (se retima en el montador); sin video,
//    su imagen con movimiento de cámara.
//  · El trabajo de Cloud Run tarda minutos: se guarda la operación en el
//    proyecto y se sigue consultando aunque se recargue la página.
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';
import { pedirMedio, recordarUrl } from './medios.mjs';
import { errorDetenido, esCuota } from './texto.mjs';
import { escenasDelEpisodio, nombreDe } from './desglose.mjs';
import { actosDelEpisodio, musicaVigente } from './musica.mjs';
import { frasesDeLinea } from './subtitulos.mjs';
import { vozVigente } from './voces.mjs';

// Huecos del montaje, medidos contra los dramas de referencia del dueño:
// allí el silencio entre líneas es menor de 1 s y solo se frena para el
// premio. Entrada corta, pausa mínima entre tramos y cola breve: lo que
// antes sumaba más de un segundo muerto por escena ahora es respiración.
// ADEL_VOZ: la frase siguiente empieza sobre el plano de reacción anterior
// y su plano llega ADEL_VOZ segundos después (J-cut), como en esos dramas,
// en vez de esperar clavada a que cambie la imagen.
export const ENTRADA = 0.15, PAUSA = 0.08, COLA = 0.15, ADEL_VOZ = 0.25;
export const MINIMO_PLANO = 0.5;

// Reparte D segundos entre los planos según su peso, sin bajar de un mínimo
// por plano. Si ni con el mínimo caben, la escena se alarga lo justo.
export function repartir(pesos, D) {
  const n = pesos.length;
  const total = Math.max(D, n * MINIMO_PLANO);
  let fijos = new Array(n).fill(false);
  let durs = [];
  for (let vuelta = 0; vuelta < n; vuelta++) {
    const libre = total - fijos.reduce((s, f) => s + (f ? MINIMO_PLANO : 0), 0);
    const suma = pesos.reduce((s, w, i) => s + (fijos[i] ? 0 : (w || 1)), 0) || 1;
    durs = pesos.map((w, i) => (fijos[i] ? MINIMO_PLANO : libre * (w || 1) / suma));
    const nuevos = durs.map((d, i) => !fijos[i] && d < MINIMO_PLANO);
    if (!nuevos.some(Boolean)) break;
    fijos = fijos.map((f, i) => f || nuevos[i]);
  }
  return { durs, total };
}
const CONSULTA_CADA = 15;

const dos = n => String(n).padStart(2, '0');

// Qué falta para poder montar. Las voces y la música las genera el propio
// botón de montar; las imágenes no (son lo caro y lo que el dueño revisa).
export function estadoDelEpisodio(datos, numero) {
  const ep = datos.episodios?.[numero];
  const escenas = escenasDelEpisodio(datos, numero);
  const planos = escenas.flatMap(e => e.planos || []);
  const actos = actosDelEpisodio(ep);
  return {
    escenas: escenas.length,
    sinDesglose: escenas.filter(e => !e.planos?.length).length,
    planos: planos.length,
    sinImagen: planos.filter(p => !p.imagen || p.imagenObsoleta).length,
    accion: planos.filter(p => p.tipo === 'accion').length,
    sinVideo: planos.filter(p => p.tipo === 'accion' && (!p.video || p.videoObsoleto)).length,
    sinVoz: escenas.filter(e => !vozVigente(e)).length,
    actos: actos.length,
    sinMusica: actos.filter(a => !musicaVigente(ep?.musica?.[a.numero])).length,
  };
}

const duracionEscena = e => ENTRADA + (e.voz?.tramos || []).reduce((n, t) => n + (t.segundos || 0), 0) + PAUSA * Math.max(0, (e.voz?.tramos?.length || 1) - 1) + COLA;

// Normalización local (la misma que usa guion.mjs) para buscar el ancla
// literal de un plano dentro del texto de su escena, sin importar acentos
// ni signos de puntuación.
const norm = t => String(t || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[«»"“”'‘’¿?¡!.,;:…—–\-()[\]]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Tiempos de voz y subtítulos de una escena, con t0 como inicio absoluto.
// Devuelve también, por índice de línea, su inicio y fin absolutos.
export function tiemposDeEscena(e, t0) {
  const voces = [], subtitulos = [], lineas = [];
  const lineasGuion = e.lineas || [];
  let t = t0 + ENTRADA;
  for (const tr of e.voz?.tramos || []) {
    voces.push({ ruta: tr.ruta, inicio: Number(t.toFixed(3)), segundos: tr.segundos || 0 });
    tr.lineas.forEach((indice, k) => {
      const linea = lineasGuion[indice];
      const tiempos = tr.tiempos?.[k] || { inicio: (tr.segundos || 0) * k / tr.lineas.length, fin: (tr.segundos || 0) * (k + 1) / tr.lineas.length };
      lineas[indice] = { inicio: t + tiempos.inicio, fin: t + tiempos.fin };
      // Los paneles del Sistema ya muestran su texto: no se duplica abajo.
      if (!linea || linea.tipo === 'sistema') return;
      subtitulos.push(...frasesDeLinea(linea.texto, t + tiempos.inicio, t + tiempos.fin));
    });
    t += (tr.segundos || 0) + PAUSA;
  }
  return { voces, subtitulos, lineas, inicio: t0, duracion: duracionEscena(e) };
}

// Duraciones ancladas a la frase: el cambio de plano i+1 llega ADEL_VOZ
// segundos DESPUÉS de que empiece la frase del plano i+1, así la voz entra
// sobre el plano de reacción anterior (J-cut) en vez de esperar al corte.
// Devuelve null si ningún plano de la escena tiene un ancla que se pueda
// situar en una línea hablada; en ese caso el llamador usa el reparto por
// peso de antes.
// La primera toma tiene una entrada de ENTRADA segundos antes de su frase
// (es el arranque de la escena, no un hueco): lo que se ancla de verdad es
// cada CAMBIO de plano con el inicio de la frase siguiente más el adelanto.
export function duracionesAncladas(e, tiempos) {
  const planos = e.planos || [];
  if (!planos.length) return null;
  const D = tiempos.duracion;
  const t0 = tiempos.inicio;
  // Línea de cada plano, buscando el ancla en orden (sin retroceder).
  const lineasGuion = e.lineas || [];
  let desde = 0;
  const lineaDe = planos.map(p => {
    const ancla = norm(p.ancla);
    if (!ancla) return -1;
    for (let i = desde; i < lineasGuion.length; i++) {
      if (norm(lineasGuion[i].texto).includes(ancla)) { desde = i; return i; }
    }
    return -1;
  });
  if (!lineaDe.some(i => i >= 0)) return null;
  // Reparto por peso, solo como respaldo para los planos sin ancla.
  const { durs: dursPeso } = repartir(planos.map(p => p.peso || 1), D);
  let acumPeso = t0;
  const inicioPeso = dursPeso.map(d => { const s = acumPeso; acumPeso += d; return s; });
  // Inicio de cada plano: si varios planos comparten la misma línea, se
  // reparte el tiempo de esa línea entre ellos, en orden.
  const inicios = lineaDe.map((idx, i) => {
    if (idx < 0) return inicioPeso[i];
    const misma = lineaDe.filter(x => x === idx).length;
    const k = lineaDe.slice(0, i + 1).filter(x => x === idx).length - 1;
    const lin = tiempos.lineas[idx];
    if (!lin) return inicioPeso[i];
    // El primer plano que abre una línea nueva llega ADEL_VOZ después de
    // que la frase empiece: la voz va sobre la reacción anterior. Los
    // planos que comparten la misma línea se siguen repartiendo su tiempo.
    const adelanto = (i > 0 && k === 0) ? ADEL_VOZ : 0;
    return lin.inicio + adelanto + k * (lin.fin - lin.inicio) / misma;
  });
  // Monótono: un plano nunca puede empezar antes que el anterior.
  for (let i = 1; i < inicios.length; i++) inicios[i] = Math.max(inicios[i], inicios[i - 1]);
  // Duración: del inicio EN VIDEO de cada plano al inicio del siguiente.
  // El primer plano empieza en el inicio de la escena (t0), no en su
  // frase (que llega tras la entrada); los siguientes empiezan ADEL_VOZ
  // después de que empiece su frase, para que la voz entre sobre la
  // reacción anterior. La suma sigue siendo la duración de la escena.
  const durs = inicios.map((s, i) => {
    const empiezaVideo = i === 0 ? t0 : s;
    const termina = i + 1 < inicios.length ? inicios[i + 1] : t0 + D;
    return Math.max(MINIMO_PLANO, termina - empiezaVideo);
  });
  return { inicios, durs, total: durs.reduce((a, b) => a + b, 0) };
}

// Duraciones de una escena: ancladas si se puede, por peso si no.
export function duracionesDeEscena(e, tiempos) {
  return duracionesAncladas(e, tiempos) || repartir(e.planos.map(p => p.peso || 1), tiempos.duracion);
}

// La hoja del episodio montado.
export function hojaDeVideo(datos, numero) {
  const ep = datos.episodios[numero];
  const escenas = escenasDelEpisodio(datos, numero);
  const planos = [], voces = [], subtitulos = [], inicioDe = {};
  let t0 = 0;
  for (const e of escenas) {
    if (!e.planos?.length) throw new Error(`La escena «${e.titulo}» no tiene desglose de planos.`);
    if (!vozVigente(e)) throw new Error(`La escena «${e.titulo}» no tiene voz (o es de una versión anterior y hay que rehacerla).`);
    const tiempos = tiemposDeEscena(e, t0);
    const { durs, total: D } = duracionesDeEscena(e, tiempos);
    inicioDe[e.id] = { inicio: t0, duracion: D };
    e.planos.forEach((p, i) => {
      if (!p.imagen?.ruta || p.imagenObsoleta) throw new Error(`Falta la imagen del plano ${i + 1} de «${e.titulo}».`);
      const d = durs[i];
      const video = p.video?.ruta && !p.videoObsoleto;
      planos.push({ tipo: video ? 'video' : 'imagen', ruta: video ? p.video.ruta : p.imagen.ruta, duracion: Number(d.toFixed(3)), sistema: p.sistema || '' });
    });
    voces.push(...tiempos.voces.map(v => ({ ruta: v.ruta, inicio: v.inicio })));
    subtitulos.push(...tiempos.subtitulos);
    t0 += D;
  }
  const musica = actosDelEpisodio(ep)
    .filter(a => musicaVigente(ep.musica?.[a.numero]) && a.escenas.length)
    .map(a => {
      const desde = inicioDe[a.escenas[0]]?.inicio ?? 0;
      const hasta = a.escenas.reduce((n, id) => n + (inicioDe[id]?.duracion || 0), 0);
      return { ruta: ep.musica[a.numero].ruta, inicio: Number(desde.toFixed(3)), duracion: Number(Math.max(1, hasta).toFixed(3)) };
    });
  const redondear = s => ({ ...s, inicio: Number(s.inicio.toFixed(3)), fin: Number(s.fin.toFixed(3)) });
  return { modo: 'video', episodio: numero, formato: datos.formulario.formato, planos, voces, musica, subtitulos: subtitulos.map(redondear) };
}

const slug = t => String(t || 'x').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const tres = n => String(n).padStart(3, '0');
const mmss = s => `${dos(Math.floor(s / 60))}:${dos(Math.floor(s % 60))}`;

// La hoja del ZIP con todo el material del episodio.
// Numeración GLOBAL por toma: la imagen y el video de la misma toma llevan
// el mismo número (por ejemplo, toma 007: imagenes/toma-007.png y
// videos/toma-007.mp4), para que nada se desordene cuando una toma no
// tiene video. Las voces NO van sueltas por escena: van en un solo audio
// (voces.wav, que mezcla el servidor en orden, con sus pausas), y la guía
// dice en qué segundo empieza cada toma y cuánto dura. El archivo de
// subtítulos con tiempos (subtitulos.srt, para CapCut) va SIEMPRE, aunque
// el episodio todavía no tenga imágenes: Exportar completa antes voces,
// música y tiempos, así que en uso real nunca va vacío.
export function hojaDeZip(datos, numero) {
  const u = datos.universo;
  const ep = datos.episodios[numero];
  const escenas = escenasDelEpisodio(datos, numero);
  const archivos = [];
  const ext = r => (r.split('.').pop() || 'bin').toLowerCase();
  for (const p of u.personajes) if (p.referencia?.ruta) archivos.push({ ruta: p.referencia.ruta, nombre: `personajes/${slug(p.nombre)}.${ext(p.referencia.ruta)}` });
  for (const v of u.variantes || []) if (v.referencia?.ruta) archivos.push({ ruta: v.referencia.ruta, nombre: `personajes/${slug(v.nombre)}.${ext(v.referencia.ruta)}` });

  // Tiempos de cada escena, con o sin imágenes: la guía y las voces usan
  // la misma regla de duraciones que el video montado (ancladas si se
  // puede, por peso si no), así que los segundos de la guía coinciden
  // con los del montaje.
  const guia = [];
  const vocesZip = [];
  const dialogosZip = [];
  const guiaDialogos = [];
  const subtitulosZip = [];
  let toma = 0, tEscena = 0, numDialogo = 0;
  for (const [n, e] of escenas.entries()) {
    const tiempos = tiemposDeEscena(e, tEscena);
    const { durs, total: D } = duracionesDeEscena(e, tiempos);
    // Voces de esta escena, en orden, con su inicio y su duración: el
    // servidor las mezcla en un solo voces.wav, no una por archivo.
    for (const v of tiempos.voces) vocesZip.push({ ruta: v.ruta, inicio: Number(v.inicio.toFixed(3)), segundos: v.segundos });
    // Y ADEMÁS, cada línea suelta y RECORTADA AL RAS (decisión del dueño:
    // en CapCut perdía mucho tiempo cortando los silencios de cada línea
    // a mano). Una entrada por línea hablada, en orden del episodio, con
    // su tramo y su desde/hasta dentro de él: el servidor la recorta y
    // le quita el silencio del principio y del final.
    for (const tr of e.voz?.tramos || []) {
      (tr.lineas || []).forEach((indice, k) => {
        const linea = (e.lineas || [])[indice];
        if (!linea) return;
        const tt = tr.tiempos?.[k] || { inicio: (tr.segundos || 0) * k / tr.lineas.length, fin: (tr.segundos || 0) * (k + 1) / tr.lineas.length };
        numDialogo++;
        const nombre = `dialogos/dialogo-${tres(numDialogo)}.wav`;
        const quien = linea.tipo === 'sistema' ? 'Sistema' : linea.personaje === 'extra' ? (linea.nombre || 'Extra') : nombreDe(u, linea.personaje);
        dialogosZip.push({ ruta: tr.ruta, desde: Number(tt.inicio.toFixed(3)), hasta: Number(tt.fin.toFixed(3)), nombre });
        guiaDialogos.push(`Diálogo ${tres(numDialogo)} — ${quien}${linea.tipo === 'pensamiento' ? ' (piensa)' : ''}: «${linea.texto}» — archivo ${nombre}`);
      });
    }
    subtitulosZip.push(...tiempos.subtitulos);
    let tToma = tEscena;
    for (const [i, p] of (e.planos || []).entries()) {
      toma++;
      const base = `toma-${tres(toma)}`;
      if (p.imagen?.ruta) archivos.push({ ruta: p.imagen.ruta, nombre: `imagenes/${base}.${ext(p.imagen.ruta)}` });
      if (p.video?.ruta) archivos.push({ ruta: p.video.ruta, nombre: `videos/${base}.mp4` });
      guia.push(`Toma ${tres(toma)} — Escena ${n + 1} «${e.titulo}», plano ${i + 1} — empieza en ${mmss(tToma)} (${tToma.toFixed(2)} s) y dura ${durs[i].toFixed(2)} s — frase: «${(p.ancla || '').trim() || 'sin ancla'}»`);
      tToma += durs[i];
    }
    tEscena += D;
  }
  for (const [acto, m] of Object.entries(ep.musica || {})) if (musicaVigente(m)) archivos.push({ ruta: m.ruta, nombre: `musica/acto-${acto}.${/\.mp3$/i.test(m.ruta) ? 'mp3' : 'wav'}` });
  if (ep.resultados?.video?.ruta) archivos.push({ ruta: ep.resultados.video.ruta, nombre: `episodio-${dos(numero)}.mp4` });

  const guion = escenas.map((e, n) => `ESCENA ${n + 1} — ${e.titulo}\n${e.accion}\n${e.lineas.map(l => `${l.tipo === 'sistema' ? 'SISTEMA' : l.personaje === 'extra' ? (l.nombre || 'Extra') : nombreDe(u, l.personaje)}${l.tipo === 'pensamiento' ? ' (piensa)' : ''}: ${l.texto}`).join('\n')}`).join('\n\n');
  const b = datos.biblia || {};
  const direccion = [
    `${u.titulo}\n${u.gancho}\n\nPREMISA\n${u.premisa}\n\nMUNDO\n${u.mundo}`,
    `PERSONAJES\n${u.personajes.map(p => `- ${p.nombre} (${p.rol}, ${p.edad} años): ${p.aspecto}`).join('\n')}`,
    `LUGARES\n${u.escenarios.map(e => `- ${e.nombre}: ${e.descripcion}${e.ficha ? `\n  Ficha: ${e.ficha}` : ''}`).join('\n')}`,
    `BIBLIA DE LA SERIE\nDirección visual: ${b.direccionVisual || ''}\nIdentidad musical: ${b.identidadMusical || ''}\nRitmo narrativo: ${b.ritmoNarrativo || ''}\nRitmo de montaje: ${b.ritmoMontaje || ''}`,
    `MÚSICA POR ACTOS\n${Object.entries(ep.musica || {}).map(([a, m]) => `Acto ${a}: ${m.brief || ''}`).join('\n')}`,
  ].join('\n\n');
  const tSrt = s => { const ms = Math.round(s * 1000); return `${dos(Math.floor(ms / 3600000))}:${dos(Math.floor(ms / 60000) % 60)}:${dos(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`; };
  const textos = [
    { nombre: 'guion.txt', contenido: guion },
    { nombre: 'direccion-creativa.txt', contenido: direccion },
    { nombre: 'guia.txt', contenido: `GUÍA DEL EPISODIO ${numero} — cada toma, en orden, con su inicio y su duración.\nLas voces van en un solo audio (voces.wav) en este mismo orden, con sus pausas: para editar, ajusta solo las imágenes, no las voces.\nY cada línea va además suelta en la carpeta «dialogos», recortada al ras (sin silencio al principio ni al final), por si prefieres colocarlas una a una.\n\n${guia.join('\n')}${guiaDialogos.length ? `\n\nDIÁLOGOS SUELTOS, EN ORDEN:\n${guiaDialogos.join('\n')}` : ''}` },
    { nombre: 'subtitulos.srt', contenido: subtitulosZip.map((s, i) => `${i + 1}\n${tSrt(s.inicio)} --> ${tSrt(s.fin)}\n${s.texto}\n`).join('\n') },
  ];
  return { modo: 'zip', episodio: numero, archivos, textos, voces: vocesZip, dialogos: dialogosZip };
}

async function dormir(segundos, control) {
  for (let i = 0; i < segundos * 4; i++) {
    if (control?.detenido) throw errorDetenido();
    await new Promise(listo => setTimeout(listo, 250));
  }
}

// Lanza (o sigue) el trabajo de montaje o de ZIP y espera a que termine.
export async function montar({ proyectoId, datos, numero, modo, control, aviso, guardar, cada = CONSULTA_CADA }) {
  const ep = datos.episodios[numero];
  ep.trabajos ||= {};
  if (!ep.trabajos[modo]?.operacion) {
    const hoja = modo === 'zip' ? hojaDeZip(datos, numero) : hojaDeVideo(datos, numero);
    aviso?.(modo === 'zip' ? 'Preparando el ZIP…' : 'Enviando el episodio al montador…');
    const r = await pedirMedio('/api/montaje', { accion: 'iniciar', proyecto: proyectoId, hoja }, { control, aviso });
    ep.trabajos[modo] = { operacion: r.operacion, ruta: r.ruta, carpeta: r.carpeta, inicio: Date.now() };
    await guardar();
  }
  const trabajo = ep.trabajos[modo];
  let fallos = 0;
  for (;;) {
    await dormir(cada, control);
    const pasados = Math.round((Date.now() - trabajo.inicio) / 1000);
    aviso?.(`${modo === 'zip' ? 'Haciendo el ZIP' : 'Montando el episodio'} en Google (${Math.floor(pasados / 60)} min ${pasados % 60} s)…`);
    let r;
    try {
      r = await llamar('/api/montaje', { metodo: 'POST', cuerpo: { accion: 'estado', proyecto: proyectoId, operacion: trabajo.operacion, carpeta: trabajo.carpeta, ruta: trabajo.ruta }, senal: control?.abortador.signal });
      fallos = 0;
    } catch (e) {
      if (e.detenido || control?.detenido) throw errorDetenido();
      if ((esCuota(e) || e.reintentable) && ++fallos <= 8) continue;
      if (e.tipo === 'montaje_fallo') { delete ep.trabajos[modo]; await guardar(); }
      throw e;
    }
    if (!r.listo) continue;
    recordarUrl(r.ruta, r.ver);
    ep.resultados ||= {};
    ep.resultados[modo] = { ruta: r.ruta, fecha: Date.now() };
    delete ep.trabajos[modo];
    await guardar();
    return { ...ep.resultados[modo], url: r.url, ver: r.ver };
  }
}
