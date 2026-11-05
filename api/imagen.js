// ════════════════════════════════════════════════════════════════
// IMAGEN — genera una imagen con Gemini (Nano Banana) y la guarda directamente
// en el bucket. Al navegador solo vuelve la ruta y una URL firmada: nada de
// imágenes de varios megas viajando por Safari.
//
// Cómo se arma el mensaje (orden deliberado, del estudio de anime):
//   1. El CONTRATO DE ESTILO semirrealista (sección 9.1), literal y SIEMPRE
//      primero: enmarca todo lo demás. Nunca se sustituye por otra cosa.
//   2. La referencia de CONTINUIDAD (el plano anterior) con su contrato 10.4.
//   3. Cada FICHA DE PERSONAJE seguida de su contrato 10.2. Sin esa línea el
//      modelo copia el encuadre de la ficha en vez de la identidad.
//   4. El LUGAR descrito en texto (decisión del dueño: sin imagen del
//      escenario; la foto acababa pegada como fondo y no se integraba).
//   5. Las reglas fijas, la dirección de aspecto del proyecto (casting
//      atractivo, género y CADA subgénero elegido, ecchi) y la escena.
// Las referencias se leen del bucket aquí mismo. Si una ficha de personaje no
// se puede adjuntar, NO se genera: ninguna imagen sale en silencio sin su
// identidad (sección 12).
//
// Un bloqueo de seguridad no se reintenta: se devuelve como bloqueo. Una cuota
// (429) sí rota de región si el modelo es regional; los modelos Gemini 3.x
// solo existen en "global" y allí no hay a dónde rotar.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex, ubicacionImagen, firmarUrl, MODELOS_IMAGEN } = require('./_lib/google');
const { ErrorEstudio, clasificar } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { limpiarPrompt } = require('./_lib/saneado');

// Vercel corta la función a los 60 s. A Google se le dan como mucho 47 s
// desde que llega la petición, para que quede tiempo de GUARDAR la imagen:
// una imagen que Google ya hizo y no se pudo guardar se paga y se pierde.
const LIMITE_MS = 47000;
const FIN_MS = 57000;
const MAX_REFERENCIAS_BYTES = 14 * 1024 * 1024;

// Contrato de estilo (decisión del dueño, con imágenes de referencia, que
// sustituye al texto literal 9.1 de la especificación): el aspecto pulido y
// luminoso de las portadas y miniaturas de los dramas cortos asiáticos, con
// caras de estrella de drama coreano y chino. Va SIEMPRE primero y no se
// sustituye por otra cosa.
//
// Fallo visto: con «semi-realistic key art» el modelo fue derivando a
// ilustración digital (cascada pintada, caras de dibujo), y como cada plano
// lleva el anterior de referencia, la deriva se contagiaba al siguiente. Esas
// portadas son FOTOS de actores reales retocadas: así se pide, y la palabra
// «semi-realistic» (que el modelo lee como «estilo de dibujo») ya no aparece.
//
// Segundo fallo visto (por pasarse): se le dijo que, si una referencia parecía
// dibujada, igual hiciera una foto, y empezó a IGNORAR las fichas hechas con el
// estilo anterior: caras y peinados distintos. Ahora la ficha manda en cara y
// pelo siempre; de una referencia solo se cambia el acabado, nunca la persona.
const ESTILO = `RENDERING (non-negotiable, applies to the ENTIRE image and every person in it): a LIVE-ACTION PHOTOGRAPH — a real film still of real Asian actors on a real set or location, shot on a high-end cinema camera with a real lens, then retouched like the glossy poster and thumbnail of a hit Chinese or Korean short drama. Real human skin with its fine natural texture under a flawless beauty retouch: luminous, smooth porcelain complexion with a soft glow. Beauty lighting that flatters every face, bright clean vivid colours with rich contrast, crisp sharp focus on the faces, natural optical depth of field with gentle bokeh. Real hair strands, real fabric weave, real wood, stone, water and foliage with photographic detail. Faces are adult and strikingly attractive, with the refined idol-like features of top K-drama and C-drama stars, eyes of real human proportions and readable emotion. Poverty, dirt, wounds and worn clothing appear when the story says so, photographed in this same polished look. Dramatic, energetic staging and cinematic composition with real camera perspective. STRICTLY FORBIDDEN: any drawn or painted look — illustration, digital painting, concept art, matte painting, semi-realistic illustration, airbrushed painting, watercolour, 3D render, CGI, video-game graphics, 2D anime, cel shading, linework or outlines, manga, cartoon or Disney/Pixar proportions, oversized eyes, plastic doll skin; also gritty documentary realism, dull washed-out grading, and plain or unattractive faces on the main characters. Reference images below are the source of IDENTITY and CONTINUITY: follow them exactly for every face, hairstyle, outfit and place. Only their surface finish is replaced: if a reference looks more drawn than a photo, translate that SAME face and hair into this photographic rendering — never swap the person for a different actor.`;

const contratoPersonaje = nombre => `CHARACTER REFERENCE above: this is ${nombre}. IDENTITY IS LOCKED to this image: ${nombre} must be instantly recognisable as this exact person — same face shape, eyes, eyebrows, nose, mouth, skin tone, facial proportions, adult body proportions and distinctive traits, and the SAME hair: same colour, length, parting, fringe and hairstyle. Never replace this face with a generic attractive face and never restyle the hair. DO NOT copy the reference pose, framing, neutral background or reference-sheet composition. WARDROBE IS CONTROLLED BY THE CURRENT SCENE TEXT: if this shot specifies a different outfit, use the shot's outfit while preserving identity. Show this same person, photographed in the RENDERING stated at the top of this message (a change of finish only, never of face or hair), at the body pose, camera angle and scale required by this scene, grounded in the environment and sharing its perspective and light. Never turn the reference into a collage or duplicate the person. Do not mix up characters.`;

const CONTRATO_CONTINUIDAD = `This reference is the immediately preceding physical state, not a loose mood board. Keep the SAME location identity (architecture, palette, time of day), lighting, character identity, clothing, hairstyle, injuries and object state. Preserve spatial continuity: a character remains at the same place until the CURRENT scene text moves them; an open door stays open; an object already held stays held until the text changes it. A camera cut changes framing, NOT reality. A character may be off-camera only when the CURRENT prompt deliberately frames something else — do not erase, teleport or relocate them just because the angle changed. This new image is a LATER moment, so actions may advance ONLY as described by the current scene text. If the current text explicitly changes state (door opens, character falls, object is picked up), the current text wins. Copy from it everything except a drawn or painted finish, if it has one: faces and hair always come from each character's own reference.`;

// El primer plano (general) de la escena: el mapa del lugar y de las personas.
const CONTRATO_SITUACION = 'SCENE MAP above: the opening wide shot of this SAME scene. It fixes the room layout, furniture, props and where each person started. Keep that geography exactly; people and objects move only as the SCENE STATE below says. Do not copy its framing; faces and hair always come from each character\'s own reference.';

// Va al FINAL, después de la escena: la última instrucción es la que manda, y
// una ficha que dice «blusa mojada» no puede ganarle (fallo visto: la tela se
// transparentaba y Veo bloqueaba después el video de ese plano).
const SIN_TRANSPARENCIAS = 'the fabric over the breasts is never see-through, sheer or translucent, and wet fabric never turns transparent: nothing shows or pokes through it (wear a bra or camisole underneath if needed).';
// En ecchi esto NO es una regla de pudor (fallo visto: la regla anterior hacía
// que el modelo abotonara blusas y alargara faldas, y se perdía el fan service).
const CONTRAPESO_ECCHI = 'This is NOT a modesty rule and nothing else gets covered up: keep the low neckline, visible cleavage, open collar, form-fitting cut, short or high-slit skirt and bare legs exactly as alluring as the character is designed.';
// El encuadre declarado en el desglose llegaba solo dentro del texto del
// plano y el modelo lo ignoraba: pedía primer plano y entregaba cuerpo
// entero (9 de 15 planos mal encuadrados en la revisión del dueño). Ahora
// viaja como instrucción obligatoria propia, con el recorte corporal
// exacto de cada tipo, y se repite en la comprobación final.
const ENCUADRE = {
  general: 'WIDE SHOT: full bodies visible head to feet, with the whole place readable around them; nobody is cropped at the waist, chest or knees.',
  medio: 'MEDIUM SHOT, waist up: every visible person is framed from the waist up only; NO legs, knees or feet in the frame, and do not pull back to a full-body shot.',
  primer_plano: 'CLOSE-UP: head and shoulders only, the face fills most of the frame; NO body below the chest, no waist, no legs, and do not pull back to a medium or wide shot.',
  detalle: 'INSERT, extreme close-up: only the hands or the single named object fill the frame; no full faces and no full bodies.',
};
const textoEncuadre = encuadre => ENCUADRE[encuadre] || '';

const cierre = (ecchi, encuadre = '') => `FINAL CHECK before rendering: this is a live-action photograph of real actors (never an illustration, painting or render), and every character keeps the exact face and hair of their own reference image. ${SIN_TRANSPARENCIAS} ${ecchi ? CONTRAPESO_ECCHI : 'Figure, legs and neckline stay as described.'}${encuadre ? ` FRAMING CHECK (mandatory): ${encuadre}` : ''} No text anywhere in the image.`;


function reglas(nombres, formato, ecchi, direccion, conEstado) {
  // Con estado de escena, la regla 2 ya no dice «a nadie más»: esa frase,
  // escrita después del contrato de continuidad, le ganaba y borraba a quien
  // seguía en la habitación (dos reglas que se contradicen: gana la última).
  const regla2 = conEstado
    ? '2. Show EVERY character listed as visible in this shot, each exactly where the SCENE STATE puts them. People listed as PRESENT BUT OUT OF FRAME are still in the room: this framing leaves them out, so do not draw them, and keep their part of the room consistent with where they are. Never add anyone who is not in the scene.'
    : '2. Show EVERY character named in the scene and nobody else beyond those mentioned.';
  return `${nombres.length ? `Character references provided: ${nombres.join(', ')}.\n\n` : ''}MANDATORY RULES:
1. ABSOLUTELY NO TEXT: no letters, words, numbers, watermarks, captions, subtitles, readable signage, logos or signatures.
${regla2}
3. Each character appears EXACTLY ONCE: never duplicate a person in the frame.${nombres.length ? '\n4. Match EACH character to THEIR reference image. Do not swap faces.' : ''}
5. Each character's face and hair match their reference image and description exactly: never lengthen, shorten, recolour or restyle the hair, never change the face.
6. Faces clear and anatomically correct. No extra limbs, no extra fingers, no melted features.
7. Format: ${formato === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical'} frame.
8. REAL-WORLD SCALE AND ONE PERSPECTIVE: people and the place share the same floor, horizon line, vanishing points and light. Furniture keeps its real size next to people: a table top reaches an adult's hip (about 75 cm), a chair seat the knee, a door frame is a little taller than a person, a bed reaches mid-thigh. Something farther from the camera looks smaller by the SAME perspective that makes a farther person look smaller — never shrink the room to make a person look big, never make a person a giant in front of a tiny set. Characters are never composited over the location like cut-outs.
9. LITERAL STAGING ONLY: a figure of speech about a feeling becomes an expression or a posture, never a special effect (no glowing eyes, no energy, no floating symbols). Real supernatural events stated as physically happening are allowed.
11. NO SEE-THROUGH (always): ${SIN_TRANSPARENCIAS}${ecchi ? ' ' + CONTRAPESO_ECCHI : ''}${ecchi ? `
10. ADULT ECCHI PROJECT: every character is an ADULT (18+) and clearly looks adult. Adult women keep their alluring figure and their figure-flattering wardrobe in every shot — it is part of their design. When the current scene describes a suggestive beat, render it confidently through pose, framing, wardrobe and expression; in grief or combat beats the emotion of the scene leads and no extra posing is added. Never nudity, never intimate parts.` : ''}${direccion ? `

PROJECT LOOK (chosen by the owner — apply all of it):
${direccion}` : ''}`;
}

const sinAcceso = m => /was not found or your project does not have access|publisher model .*not found/i.test(String(m || ''));

async function pedirAVertex(url, partes, proyecto, token, formato, limite) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: partes }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: formato === '16:9' ? '16:9' : '9:16' } },
      }),
      signal: AbortSignal.timeout(Math.max(1000, limite - Date.now())),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { tiempo: true };
    throw new ErrorEstudio('No hubo conexión con Google para la imagen: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  return { ok: r.ok, estado: r.status, datos: d };
}

// Interpreta la respuesta: imagen, bloqueo, cuota u otro error.
function leerRespuesta(res, modelo) {
  const d = res.datos || {};
  const mensaje = d.error?.message || '';
  if (!res.ok) {
    const detalle = `${res.estado} — ${mensaje}`;
    if (sinAcceso(mensaje)) return { error: new ErrorEstudio(`Tu proyecto no tiene acceso al modelo de imagen ${modelo}.`, { estado: 502, tipo: 'google', detalle }) };
    const tipo = clasificar(`${detalle} ${d.error?.status || ''}`);
    if (tipo === 'bloqueo') return { error: new ErrorEstudio('Google bloqueó esta imagen con su filtro de seguridad. Reintentar igual no sirve: cambia el texto del plano.', { estado: 422, tipo, detalle }) };
    if (tipo === 'cuota' || res.estado === 429) return { cuota: true, error: new ErrorEstudio('Google pide esperar: se alcanzó el límite de imágenes por minuto de tu cuenta.', { estado: 429, tipo: 'cuota', detalle }) };
    return { rotable: res.estado === 503, error: new ErrorEstudio(`Google no generó la imagen (código ${res.estado}).`, { estado: 502, tipo: 'google', detalle }) };
  }
  const candidato = d.candidates?.[0];
  const parte = candidato?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (parte) return { imagen: Buffer.from(parte.inlineData.data.replace(/\s/g, ''), 'base64'), tipo: parte.inlineData.mimeType };
  // Una respuesta SIN imagen es un rechazo, no falta de capacidad. Tratarla
  // como cuota hacía que se reintentara ocho veces con esperas de minutos.
  const motivo = candidato?.finishReason || d.promptFeedback?.blockReason || 'sin imagen';
  const texto = candidato?.content?.parts?.find(p => p.text)?.text;
  return { error: new ErrorEstudio('Google no quiso dibujar esta imagen (la bloqueó o respondió solo con texto). Reintentar igual no sirve: cambia el texto del plano.', { estado: 422, tipo: 'bloqueo', detalle: `blocked ${motivo}${texto ? ' — ' + texto.slice(0, 160) : ''}` }) };
}

// Registro de una línea por imagen, sin datos privados: si algo falla, en los
// registros de Vercel se ve cuánto tardó Google y qué respondió.
function registrar(datos) {
  try { console.log(JSON.stringify({ api: 'imagen', ...datos })); } catch {}
}

const texto = (v, max) => (typeof v === 'string' ? limpiarPrompt(v).slice(0, max) : '');

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const inicio = Date.now();
  const limite = inicio + LIMITE_MS;
  const b = req.body || {};
  const { proyecto: id, clave, prompt } = b;
  const formato = b.formato === '16:9' ? '16:9' : '9:16';
  const modelo = MODELOS_IMAGEN.includes(b.modelo) ? b.modelo : cfg.modeloImagen;
  if (typeof prompt !== 'string' || prompt.trim().length < 10) throw new ErrorEstudio('Falta el texto de la imagen.', { estado: 400, tipo: 'peticion' });
  const destino = medios.rutaMedio(id, clave, 'png');
  const personajes = (Array.isArray(b.personajes) ? b.personajes : []).slice(0, 4);
  for (const p of personajes) {
    const nombre = String(p?.nombre || '').trim();
    if (!nombre || !p?.ruta) throw new ErrorEstudio(`Falta la ficha de referencia de ${nombre || 'un personaje'}. No se generó la imagen para no cambiarle la cara.`, { estado: 409, tipo: 'falta_referencia' });
  }
  const { cuenta, proyecto, token } = await google();

  // Referencias desde el bucket, todas a la vez (antes iban una detrás de
  // otra y se comían segundos del tiempo de Google). Una ficha que falta o
  // no se lee detiene todo.
  const avisos = [];
  const leerRef = async (ruta, quePara) => {
    const { bytes, tipo } = await medios.leer(token, medios.exigirDelProyecto(id, ruta), quePara);
    return { bytes, parte: { inlineData: { mimeType: /^image\//.test(tipo) ? tipo : 'image/png', data: bytes.toString('base64') } } };
  };
  const partes = [{ text: ESTILO }];
  if (b.base) {
    // Edición (variante de un personaje): se parte de la imagen de la madre.
    partes.push((await leerRef(b.base, 'la imagen del personaje original')).parte);
    partes.push({ text: `BASE IMAGE above: this is ${String(b.nombreBase || 'the character')}. EDIT it: ${limpiarPrompt(prompt)}. Keep the SAME person — same face, facial proportions, eye colour, body proportions and distinctive traits — and the same clean reference-sheet composition (one person, full body, neutral background). Change ONLY what the edit asks.\n\n${cierre(b.ecchi === true)}` });
  } else {
    const tareas = [];
    if (b.continuidad) tareas.push({ ruta: b.continuidad, quePara: 'la imagen del plano anterior', contrato: CONTRATO_CONTINUIDAD });
    if (b.situacion && b.situacion !== b.continuidad) tareas.push({ ruta: b.situacion, quePara: 'el plano general de la escena', contrato: CONTRATO_SITUACION });
    for (const p of personajes) {
      const nombre = String(p.nombre).trim().slice(0, 80);
      tareas.push({ ruta: p.ruta, quePara: `la ficha de ${nombre}`, contrato: contratoPersonaje(nombre) });
    }
    const leidas = await Promise.all(tareas.map(t => leerRef(t.ruta, t.quePara)));
    let presupuesto = MAX_REFERENCIAS_BYTES;
    leidas.forEach((l, i) => { presupuesto -= l.bytes.length; partes.push(l.parte, { text: tareas[i].contrato }); });
    if (presupuesto < 0) throw new ErrorEstudio('Las imágenes de referencia de este plano pesan demasiado para enviarlas juntas. No se generó; prueba con menos personajes en el plano.', { estado: 413, tipo: 'peticion' });
    // Estado de la escena en este instante: quién está, dónde, y qué cambió.
    const estado = texto(b.estado, 1500);
    const cambio = texto(b.cambio, 800);
    const fuera = (Array.isArray(b.fuera) ? b.fuera : []).map(n => String(n || '').trim().slice(0, 80)).filter(Boolean).slice(0, 8);
    const lugar = texto(b.lugar, 2500);
    const escena = [
      lugar ? `LOCATION — the complete, fixed description of this place. Every shot of this place shows these same elements in these same positions; only the camera angle changes. Build it together with the characters as ONE real place — same ground, same light, same perspective — never as a backdrop behind them:\n${lugar}` : '',
      estado ? `SCENE STATE AT THIS INSTANT (everyone in the scene, visible or not, and the key objects):\n${estado}` : '',
      fuera.length ? `PRESENT BUT OUT OF FRAME (still in the room; this framing leaves them out): ${fuera.join(', ')}.` : '',
      cambio ? `WHAT CHANGED SINCE THE PREVIOUS SHOT (show this new moment; do not repeat the previous frame's poses):\n${cambio}` : '',
    ].filter(Boolean).join('\n\n');
    const encuadre = textoEncuadre(b.encuadre);
    partes.push({ text: `${reglas(personajes.map(p => p.nombre), formato, b.ecchi === true, texto(b.direccion, 2500), Boolean(estado))}${escena ? '\n\n' + escena : ''}${encuadre ? `\n\nFRAMING (mandatory, it overrides any looser wording in the scene text): ${encuadre}` : ''}\n\nScene to show:\n${limpiarPrompt(prompt)}\n\n${cierre(b.ecchi === true, encuadre)}` });
  }
  const msLectura = Date.now() - inicio;

  // Modelo global: una sola llamada. Regional: rotación ante cuota.
  const ubicacion = ubicacionImagen(modelo);
  const regiones = ubicacion === 'global' ? ['global'] : (cfg.regionesImagen.length ? cfg.regionesImagen : [ubicacion]);
  let ultimo;
  for (const region of regiones) {
    if (ultimo && limite - Date.now() < 15000) break;
    const t0 = Date.now();
    const res = await pedirAVertex(urlVertex(proyecto, region, modelo, 'generateContent'), partes, proyecto, token, formato, limite);
    const msGoogle = Date.now() - t0;
    if (res.tiempo) {
      registrar({ clave, modelo, region, msLectura, msGoogle, resultado: 'tiempo' });
      throw new ErrorEstudio(`Google tardó más de ${Math.round((limite - inicio) / 1000)} s en dibujar esta imagen y hubo que cortar para no pasar el límite del servidor. No se reintenta solo, para no pagarla dos veces: vuelve a pulsar cuando quieras.`, { estado: 504, tipo: 'tiempo' });
    }
    const leido = leerRespuesta(res, modelo);
    if (leido.imagen) {
      const tipo = /jpe?g/i.test(leido.tipo) ? 'image/jpeg' : 'image/png';
      const guardado = await medios.guardar(token, destino, leido.imagen, tipo, { espera: Math.max(3000, inicio + FIN_MS - Date.now()) });
      registrar({ clave, modelo, region, msLectura, msGoogle, msTotal: Date.now() - inicio, resultado: 'ok' });
      return { ruta: destino, url: firmarUrl(cuenta, cfg.bucket, destino), modelo, region, generacion: guardado.generacion, avisos };
    }
    ultimo = leido.error;
    registrar({ clave, modelo, region, msLectura, msGoogle, resultado: leido.error?.tipo, estado: res.estado, detalle: String(leido.error?.detalle || '').slice(0, 200) });
    if (!(leido.cuota || leido.rotable)) break;   // un bloqueo o un "sin acceso" es igual en todas las regiones
  }
  throw ultimo;
});
