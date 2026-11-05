// ════════════════════════════════════════════════════════════════
// VIDEOS (navegador) — el clip de cada plano con Veo (sección 13).
//
//  · Se arranca y se consulta cada 10 s. La operación arrancada se guarda en
//    el proyecto del bucket EN EL ACTO: si el teléfono recarga o se pulsa
//    Detener, la próxima vez se sigue consultando la misma y no se paga un
//    clip repetido.
//  · El prompt son varios bloques literales en inglés y el ORDEN importa:
//    dos reglas que se contradicen producen el comportamiento de la última.
//    En video el ángulo ya lo fija el primer fotograma; pedir «no mires a
//    cámara, usa ángulos laterales» obligaba a mover la cámara y peleaba con
//    «no muevas la cámara». De ahí venía la deriva a primer plano.
//  · La voz de cada toma la dice el propio Veo, en español y con el texto
//    exacto de esa toma (decisión del dueño del 2026-11-03, que sustituye
//    a la boca muda): pedirle boca hablando SIN voz no funcionó — con la
//    boca articulando, Veo inventaba el diálogo, y lo inventaba en chino.
//    Dándole las palabras escritas en español ya no inventa: dice su
//    pedazo de línea (el ancla), y la línea se completa corte a corte.
//    El dueño monta a mano en CapCut: ahí puede quitar solo la voz del
//    clip (conservando efectos) y poner la voz de Chirp del paquete, o
//    quedarse la de Veo si le suena mejor. El montaje automático NO se
//    toca: esto es solo la generación del video.
//  · Pensamiento: voz en off del personaje, con la boca cerrada en
//    pantalla. Sistema: voz sintética en off. Sin línea (ancla de acción
//    pura): solo ambiente y efectos, como siempre.
//  · Sin encadenado de fotogramas: ni el último fotograma del plano
//    siguiente ni fotogramas sacados del MP4 (nota final de la especificación).
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';
import { pedirMedio, recordarUrl } from './medios.mjs';
import { errorDetenido, esBloqueo, esCuota } from './texto.mjs';
import { sexoDe } from './imagenes.mjs';

export const MODELOS_VIDEO = [
  { valor: 'veo-3.1-lite-generate-001', etiqueta: 'Veo 3.1 Lite (predeterminado)' },
  { valor: 'veo-3.1-fast-generate-001', etiqueta: 'Veo 3.1 Fast (equilibrado)' },
  { valor: 'veo-3.1-generate-001', etiqueta: 'Veo 3.1 (máxima calidad)' },
];

export function modeloVideo(datos) {
  return MODELOS_VIDEO.some(m => m.valor === datos?.ajustes?.modeloVideo) ? datos.ajustes.modeloVideo : MODELOS_VIDEO[0].valor;
}

const CONSULTA_CADA = 10;     // segundos entre consultas
const CONSULTAS = 72;         // 12 minutos como mucho

// ─── Bloques literales (sección 13.2) ───
export const ACTUACION = 'PERFORMANCE — CRITICAL: the characters are acting inside the scene and stay in the story — never posing, never turning toward the lens, never making eye contact with the camera, never addressing the viewer. The angle on them is ALREADY set by the first frame; keep that relationship to them for the whole clip.';
// LA VOZ DE CADA PERSONAJE ES UNA SOLA (regla del dueño): Veo no guarda
// voces fijas como Chirp, así que la misma descripción de voz, palabra por
// palabra, viaja en TODAS las peticiones de ese personaje — diálogo y
// pensamiento — para que suene el mismo actor en todas sus tomas. La
// descripción se deriva siempre igual de su sexo, su edad y su rol, así
// que no depende de que nadie la escriba a mano ni cambia entre clips.
export function descripcionVoz(p) {
  const mujer = sexoDe(p || {}) === 'mujer';
  const edad = Number(p?.edad) || 0;
  const decada = edad >= 50 ? (mujer ? 'in her fifties' : 'in his fifties')
    : edad >= 40 ? (mujer ? 'in her forties' : 'in his forties')
    : edad >= 30 ? (mujer ? 'in her thirties' : 'in his thirties')
    : edad > 0 ? (mujer ? 'in her twenties' : 'in his twenties') : 'adult';
  const rol = String(p?.rol || '').toLowerCase();
  const tono = /protagonista|principal|héroe|heroe|hero/.test(rol)
    ? (mujer ? 'clear, warm and determined' : 'deep, calm and confident')
    : /antagonista|villano|villana|enemy|malo/.test(rol)
      ? (mujer ? 'cold, sharp and commanding' : 'rough, harsh and arrogant')
      : (mujer ? 'soft, clear and natural' : 'steady, clear and natural');
  return `${mujer ? "a woman's voice" : "a man's voice"}, ${decada}, ${tono}, neutral Latin American Spanish accent, natural pace, clear diction`;
}
// El sexo de la voz del Sistema va ESCRITO y fijo (decisión del dueño:
// mujer): la primera versión decía solo «voz sintética», sin sexo, y Veo
// sorteaba en cada clip entre anunciador y anunciadora; regenerar no lo
// arreglaba porque la descripción seguía ambigua.
export const VOZ_SISTEMA = "a WOMAN's synthetic system voice — always a female voice, never a male voice — youthful, clear and slightly robotic, flat, even and emotionless, neutral Latin American Spanish accent, measured pace";

// La voz de la toma: el texto exacto que Veo tiene que decir es el ancla
// del plano (el pedazo de la línea que le corresponde), en español.
export const bloqueVoz = voz => {
  const texto = String(voz.texto || '').replace(/"/g, '').trim();
  if (voz.tipo === 'dialogo') return `SPOKEN DIALOGUE — CRITICAL: ${voz.nombre} speaks ALOUD in this shot, in neutral Latin American Spanish, saying EXACTLY these words and nothing else: "${texto}". Only ${voz.nombre} speaks, the mouth articulates these exact words, and all speech is in Spanish only — never Chinese, never English. THE VOICE IS ALWAYS THIS EXACT VOICE (the same voice in every shot of this character): ${voz.descripcion}.`;
  if (voz.tipo === 'pensamiento') return `VOICE-OVER NARRATION — CRITICAL: nobody speaks on screen in this shot and every mouth stays closed, but the voice-over of ${voz.nombre} narrates in neutral Latin American Spanish, saying EXACTLY these words and nothing else: "${texto}". The voice-over is in Spanish only — never Chinese, never English. THE VOICE IS ALWAYS THIS EXACT VOICE, the same voice ${voz.nombre} speaks aloud with: ${voz.descripcion}.`;
  return `SYSTEM VOICE-OVER — CRITICAL: nobody speaks on screen; a synthetic system voice announces in neutral Latin American Spanish, saying EXACTLY these words and nothing else: "${texto}". Spanish only — never Chinese, never English. THE SYSTEM VOICE IS ALWAYS THE SAME VOICE: ${voz.descripcion}.`;
};
export const SIN_HABLA = 'NO SPEAKING PERFORMANCE: no character speaks aloud in this shot: mouths stay closed, the character reacts, listens or thinks, with no lip movement of speech.';

// Clasifica el ancla de un plano según la línea de la escena que contiene
// ese fragmento literal. Devuelve 'dialogo', 'pensamiento', 'sistema' o
// '' si el ancla no se sitúa en ninguna línea (por ejemplo, si viene de
// lo que se ve al empezar la escena). No rompe planos antiguos sin ancla.
const normAncla = t => String(t || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[«»"“”'‘’¿?¡!.,;:…—–\-()[\]]/g, ' ')
  .replace(/\s+/g, ' ').trim();
export function lineaDeAncla(escena, plano) {
  const ancla = normAncla(plano?.ancla);
  if (!ancla) return null;
  for (const l of escena?.lineas || []) {
    if (normAncla(l.texto).includes(ancla)) return l;
  }
  return null;
}
export function tipoDeAncla(escena, plano) {
  return lineaDeAncla(escena, plano)?.tipo || '';
}

// La voz que pide este plano: la línea cuya ancla lo ancla, el nombre de
// quien la dice y el texto exacto a decir (el ancla, su pedazo de línea).
// Sin línea localizada no se pide voz: solo ambiente y efectos.
export function vozDelPlano(datos, escena, plano) {
  const linea = lineaDeAncla(escena, plano);
  if (!linea || !['dialogo', 'pensamiento', 'sistema'].includes(linea.tipo)) return null;
  const texto = String(plano?.ancla || '').trim();
  if (!texto) return null;
  if (linea.tipo === 'sistema') return { tipo: 'sistema', nombre: 'The System', texto, descripcion: VOZ_SISTEMA };
  const personaje = (datos?.universo?.personajes || []).find(p => p.id === linea.personaje);
  const nombre = personaje?.nombre || linea.nombre || 'The character';
  return { tipo: linea.tipo, nombre, texto, descripcion: descripcionVoz(personaje || { nombre }) };
}
export const ENCUADRE_BLOQUEADO = 'FRAMING — LOCKED: the first frame sets the camera position, the lens and the shot size for the ENTIRE clip. Hold that exact framing from first frame to last: same distance to the subject, same lens, same shot size, same headroom, same amount of the room visible. The camera sits on a locked tripod unless the SHOT MOTION line names a camera move — if it names none, there is no zoom, no push-in, no pull-back and no reframing at any point.';
export const ESTILO = 'STYLE — ABSOLUTELY MANDATORY: preserve the exact rendering of the first frame, pixel for pixel in look. Do not restyle it, do not turn it into animation, illustration or a videogame cinematic while moving.';
// El texto literal de la especificación y, detrás, una frase añadida: Veo
// cumplía «sin habla» pero metía gritos, jadeos y risas (lo vio el dueño).
// Toda voz humana, también un grito, la pone después la voz del personaje.
export const AUDIO = 'AUDIO: NO voice dialogue, NO narration, NO singing, NO human speech of any kind. ONLY the diegetic sound of this shot: ambience of the location and the sound effects of the action actually visible in frame. NO human vocal sounds at all either: no screams, shouts, yells, gasps, grunts, groans, moans, sighs, laughter, crying, sobbing or heavy breathing — even if a character opens their mouth, the soundtrack carries only ambience and object sounds; every human voice is added later.';
// Cuando la toma lleva voz (la dice Veo, con su texto exacto), el audio es
// esa voz en español MÁS los efectos del plano — el dueño separa la voz en
// CapCut si prefiere la de Chirp. Lo que sigue prohibido es cualquier otra
// voz y cualquier otro idioma: ahí venía el chino inventado.
export const AUDIO_HABLA = 'AUDIO: the spoken words written above, in Spanish, PLUS the diegetic sound of this shot: ambience of the location and the sound effects of the action actually visible in frame. NO other voices, NO extra words beyond the quoted text, NO speech in any other language, NO singing and NO added music.';

// Del estudio de anime: Veo trata la lluvia como una capa de partículas de
// pantalla completa y la extendía por todo el plano, también dentro de un
// pasillo. La regla base no hace nada en exteriores (solo prohíbe INVENTAR
// clima); la cláusula dura se añade solo en interiores confirmados.
const CLIMA = 'WEATHER GEOGRAPHY — HARD RULE: the first frame defines where weather lives, and this clip may not move it. Rain, drizzle, snow, fog and wind-blown particles exist ONLY in the outdoor volume already visible in the first frame: beyond the window glass, beyond an open doorway, past the building line. Add no precipitation, spray or mist that is not already visible in the first frame, and every surface keeps exactly the wetness it has there: dry stays dry, wet stays wet.';
const CLIMA_INTERIOR = ' THIS SHOT IS INTERIOR: the camera is inside an enclosed built space with a ceiling and walls overhead. Nothing falls from above inside this space at any moment of the clip — no rain, no drizzle, no snow, no mist, no spray, no gust. The indoor air stays clear, indoor floors and furniture stay dry, and the characters\' hair and clothing stay dry.';

const CAMARA_ESCRITA = /\b(zoom|push[- ]?in|pull[- ]?back|pull[- ]?out|dolly|truck|tracking|track(?:s|ing)? (?:with|alongside|behind)|pan(?:s|ning)?|tilt(?:s|ing)?|crane|orbit(?:s|ing)?|arc(?:s|ing)? around|handheld|camera (?:move|moves|slowly|drifts|glides|pushes|pulls|rises|lowers|follows))\b/i;

function primeraFrase(texto) {
  const t = String(texto || '').replace(/"/g, '').trim();
  const corte = t.search(/\.\s/);
  return (corte > 0 ? t.slice(0, corte) : t).replace(/\.$/, '');
}

export function promptVideo(plano, escenario, opciones = {}) {
  const movimiento = String(plano.movimiento || '').trim();
  const camara = CAMARA_ESCRITA.test(movimiento);
  const motivo = movimiento
    ? 'MOTION — CRITICAL: animate EXACTLY the movement written in SHOT MOTION below and nothing more. The clip must END in the state described there, and settle there. No extra action, no new elements entering frame, and no camera move beyond the one written.'
    : 'MOTION — CRITICAL: subtle cinematic movement only. Gentle breathing, small natural gestures (head tilt, eye blink, hand movement). Characters stay in position — NO jumping, NO teleporting, NO sudden changes. Smooth and natural, like a live-action drama series.';
  const lugar = escenario ? `SETTING — already built into the input image, do not redesign it: ${primeraFrase(escenario.description || escenario.descripcion || escenario.nombre)}.` : '';
  const clima = CLIMA + (escenario?.interior ? CLIMA_INTERIOR : '');
  // voz: la línea que esta toma dice, con su texto exacto (la decide
  // videoPlano a partir del ancla). Diálogo: habla en pantalla.
  // Pensamiento y Sistema: voz en off con la boca cerrada (SIN_HABLA lo
  // refuerza). Sin voz localizada: actuación neutra, solo efectos.
  const voz = opciones.voz || null;
  const bloqueHabla = voz
    ? (voz.tipo === 'dialogo' ? bloqueVoz(voz) : SIN_HABLA + ' ' + bloqueVoz(voz))
    : '';
  return [
    ESTILO,
    motivo,
    camara ? '' : ENCUADRE_BLOQUEADO,
    lugar,
    clima,
    ACTUACION,
    bloqueHabla,
    `SHOT MOTION: ${movimiento ? movimiento.replace(/\.$/, '') : 'the characters hold their positions with small natural movement'}.`,
    voz ? AUDIO_HABLA : AUDIO,
  ].filter(Boolean).join(' ');
}

// Google: el prompt negativo es una LISTA DE COSAS, nunca una orden.
// «no rain indoors» no hace nada; «indoor rain» funciona.
export function negativoVideo(plano, escenario, opciones = {}) {
  const partes = [
    'blurry, distorted face, deformed face, warped anatomy, extra limbs, extra fingers, morphing hands, flickering, warping background, melting geometry, duplicated character',
    'text, letters, subtitles, captions, watermark, logo, timestamp, letterboxing, black bars, split screen',
    'character facing the camera, eye contact with the camera, posing for the camera',
    'anime, cartoon, illustration, cel shading, videogame cutscene',
    // La voz de la toma la dice Veo en español: en diálogo no se prohíbe
    // hablar (la boca lo está diciendo); en voz en off no se prohíbe la
    // narración, pero sí que alguien hable EN pantalla. En los tres casos
    // se prohíbe el habla en otro idioma, que era el fallo (chino), y los
    // sonidos vocales sueltos siguen prohibidos siempre.
    opciones.voz?.tipo === 'dialogo'
      ? 'singing, screaming, shouting, yelling, gasping, grunting, groaning, moaning, sighing, laughing, crying, sobbing, heavy breathing, human vocal sounds, chinese speech, english speech, foreign language dialogue'
      : opciones.voz
        ? 'talking, speech, dialogue, singing, screaming, shouting, yelling, gasping, grunting, groaning, moaning, sighing, laughing, crying, sobbing, heavy breathing, human vocal sounds, chinese speech, english speech, foreign language dialogue'
        : 'talking, speech, dialogue, voice-over, narration, singing, screaming, shouting, yelling, gasping, grunting, groaning, moaning, sighing, laughing, crying, sobbing, heavy breathing, human vocal sounds',
    'see-through clothing, transparent wet shirt, sheer fabric showing skin underneath',
    'indoor rain, rain inside a room, rain inside a corridor, precipitation indoors, water falling indoors, wet indoor floor, puddles indoors, indoor snow',
  ];
  if (opciones.voz?.tipo === 'sistema') partes.push('male system voice, male announcer voice, a man speaking, male voice-over');
  if (escenario?.interior) partes.push('rain streaks across the frame, rain in the foreground, weather particles over the characters, raindrops on the lens, indoor mist, indoor fog, wind blowing indoors, wet hair, wet clothing, water dripping from the ceiling');
  if (!CAMARA_ESCRITA.test(plano.movimiento || '')) partes.push('zoom in, zoom out, dolly in, push in, camera pull back, focal length change, shot size change, reframing, whip pan, orbiting camera, handheld shake');
  partes.push('cut to another shot, scene change, new character entering the frame, jump cut');
  return partes.join(', ');
}

async function dormir(segundos, control) {
  for (let i = 0; i < segundos * 4; i++) {
    if (control?.detenido) throw errorDetenido();
    await new Promise(listo => setTimeout(listo, 250));
  }
}

// Genera (o sigue esperando) el clip de un plano. `guardar` escribe el
// proyecto en el bucket: se llama en cuanto hay operación, y al terminar.
export async function videoPlano({ proyectoId, datos, escena, plano, control, aviso, guardar, cada = CONSULTA_CADA }) {
  if (!plano.imagen?.ruta) throw new Error('Este plano no tiene imagen todavía. El video arranca de ella: genérala primero.');
  if (plano.imagenObsoleta) throw new Error('La imagen de este plano quedó obsoleta tras la revisión. Regenérala primero: el video arrancaría de la imagen vieja.');
  const escenario = datos.universo.escenarios.find(x => x.id === escena.escenario);
  if (!plano.operacion?.nombre) {
    aviso?.('Enviando a Veo…');
    // La voz de la toma: si el ancla cae en una línea, Veo dice su texto
    // exacto en español (en pantalla si es diálogo; en off si es
    // pensamiento o Sistema). Si no cae en ninguna línea, el plano va
    // sin voz, solo con sus efectos.
    const voz = vozDelPlano(datos, escena, plano);
    const r = await pedirMedio('/api/video-inicio', {
      proyecto: proyectoId, clave: 'video-' + plano.id, imagen: plano.imagen.ruta,
      prompt: promptVideo(plano, escenario, { voz }), negativo: negativoVideo(plano, escenario, { voz }),
      formato: datos.formulario.formato, modelo: modeloVideo(datos),
    }, { control, aviso });
    plano.operacion = { nombre: r.operacion, modelo: r.modelo, inicio: Date.now(), imagen: plano.imagen.ruta };
    await guardar();
  } else {
    aviso?.('Siguiendo el video que Veo ya estaba haciendo…');
  }
  let fallosSeguidos = 0;
  for (let i = 1; i <= CONSULTAS; i++) {
    await dormir(cada, control);
    const pasados = Math.round((Date.now() - (plano.operacion.inicio || Date.now())) / 1000);
    aviso?.(`Veo está haciendo el video (${pasados >= 60 ? Math.floor(pasados / 60) + ' min ' + (pasados % 60) + ' s' : pasados + ' s'}; suele tardar de 1 a 4 minutos)…`);
    let r;
    try {
      r = await llamar('/api/video-estado', { metodo: 'POST', cuerpo: { proyecto: proyectoId, operacion: plano.operacion.nombre }, senal: control?.abortador.signal });
      fallosSeguidos = 0;
    } catch (e) {
      if (e.detenido || control?.detenido) throw errorDetenido();
      // Una consulta que choca con la cuota o con un corte no pierde el
      // video: se vuelve a preguntar en la siguiente vuelta.
      if (!esBloqueo(e) && (esCuota(e) || e.reintentable) && ++fallosSeguidos <= 6) continue;
      // Terminal: la operación se da por cerrada para poder arrancar otra.
      if (e.tipo === 'bloqueo' || e.tipo === 'veo_fallo' || e.status === 400) {
        delete plano.operacion;
        await guardar();
      }
      throw e;
    }
    if (!r.listo) continue;
    recordarUrl(r.ruta, r.url);
    plano.video = { ruta: r.ruta, modelo: r.modelo || plano.operacion.modelo, fecha: Date.now(), imagen: plano.operacion.imagen };
    plano.videoObsoleto = false;
    delete plano.operacion;
    await guardar();
    return plano.video;
  }
  // La operación se conserva: al volver a pulsar se sigue consultando.
  throw new Error('Veo lleva más de 12 minutos con este video. No se ha perdido: vuelve a pulsar el botón y se seguirá consultando la misma operación.');
}
