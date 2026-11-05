// ════════════════════════════════════════════════════════════════
// INSPIRACIÓN — dos modos en un solo endpoint (el plan de Vercel
// admite 12 funciones y no cabe una más):
//
//  · Sin trozo ({enlace}): devuelve el TÍTULO del video, para
//    enseñar de qué video salió el concepto. Es decorativo: si la
//    página no se puede abrir, vuelve vacío y el flujo sigue.
//  · Con trozo ({enlace, desde, hasta}): Gemini MIRA ese trozo
//    del video y devuelve su resumen — la historia que se ve y se
//    escucha, el mecanismo del protagonista y el gancho.
//
// Por qué el video lo mira Gemini, y no se leen subtítulos (cada
// punto costó un fallo real, todos el 2026-11-04):
//  · YouTube bloquea la descarga de subtítulos desde servidores:
//    pide iniciar sesión o entrega la pista vacía aunque el video
//    sí tenga subtítulos en el reproductor. Ninguna ruta de
//    subtítulos desde el servidor es confiable, y los servicios
//    externos de transcripción dan migajas gratis y cobran el
//    resto: el dueño los probó y los rechazó.
//  · Gemini en Vertex SÍ acepta el enlace de YouTube como entrada
//    de video (comprobado en la consola de Google del dueño), con
//    la cuenta de Google Cloud que la app ya usa para todo: sin
//    servicios externos y sin la sesión de YouTube de nadie.
//  · El video entero no cabe: una compilación de 2 h son ~2,3
//    millones de tokens y el límite es 1 millón (error real de la
//    consola). Por trozos de 20 minutos (~354 mil tokens) cabe de
//    sobra. El dueño decidió: solo se mira la PRIMERA HORA, en 3
//    trozos de 20 minutos, que es más que suficiente.
//  · Resumir un trozo de video tarda bastante más que un texto:
//    el límite interno es amplio y la función tiene maxDuration
//    300 en vercel.json.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const yt = require('./_lib/youtube');

const LIMITE_MS = 280000;
const MAX_TROZO_S = 1500;   // 25 min: margen sobre los 20 que pide el estudio

const SISTEMA = 'Eres un analista de dramas cortos que funcionan en redes. Ves y escuchas un trozo de un video para quedarte con su CONCEPTO: la premisa general de la historia y el motor que la hace avanzar. No copias frases del video ni nombres propios: describes la forma de la historia, no su texto.';

function promptTrozo(desde, hasta) {
  return `Mira y escucha con atención este trozo de un drama corto que funciona muy bien (del minuto ${Math.round(desde / 60)} al minuto ${Math.round(hasta / 60)} del video). Resume SOLO lo que se aprende de este trozo, en español y en pocas líneas:
- La historia general: qué pasa en este tramo, en orden (la trama, sin diálogos copiados).
- El mecanismo: qué consigue el protagonista, qué ventaja especial usa y qué gana con ello en este tramo.
- El gancho: cómo arranca o cómo cierra este tramo, y cada cuánto llega un giro o una recompensa.`;
}

function extraerTexto(datos) {
  const partes = datos?.candidates?.[0]?.content?.parts || [];
  return partes.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
}

async function resumirTrozo(req, google, id) {
  const inicio = Date.now();
  const d = Number(req.body.desde), h = Number(req.body.hasta);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d < 0 || h <= d || h - d > MAX_TROZO_S) {
    throw new ErrorEstudio('El trozo de video pedido no es válido.', { estado: 400, tipo: 'peticion' });
  }
  const { proyecto, token } = await google();
  const modelo = cfg.modeloTexto;
  const cuerpo = {
    contents: [{
      role: 'user',
      parts: [
        {
          fileData: { mimeType: 'video/*', fileUri: 'https://www.youtube.com/watch?v=' + id },
          videoMetadata: { startOffset: { seconds: Math.floor(d) }, endOffset: { seconds: Math.floor(h) } },
        },
        { text: promptTrozo(d, h) },
      ],
    }],
    systemInstruction: { parts: [{ text: SISTEMA }] },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'LOW' },
    },
    safetySettings: ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT']
      .map(c => ({ category: 'HARM_CATEGORY_' + c, threshold: 'OFF' })),
  };

  let respuesta;
  try {
    respuesta = await fetch(urlVertex(proyecto, cfg.ubicacionTexto, modelo, 'generateContent'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(Math.max(1000, LIMITE_MS - (Date.now() - inicio))),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new ErrorEstudio('Google tardó demasiado mirando este trozo del video. Inténtalo de nuevo.', { estado: 504, tipo: 'tiempo' });
    }
    throw new ErrorEstudio('No hubo conexión con Google para mirar el video: ' + e.message, { estado: 502, tipo: 'google' });
  }

  const crudo = await respuesta.text();
  let datos;
  try { datos = JSON.parse(crudo); } catch { datos = { error: { message: crudo.slice(0, 300) || `HTTP ${respuesta.status}` } }; }
  if (!respuesta.ok) {
    if (/token count exceeds/i.test(String(datos?.error?.message || ''))) {
      throw new ErrorEstudio('Ese trozo de video es demasiado grande para que Gemini lo mire de una vez.', { estado: 422, tipo: 'peticion' });
    }
    throw errorDeGoogle('el video de inspiración', respuesta.status, datos);
  }

  const texto = extraerTexto(datos).trim();
  if (!texto) {
    const motivo = datos.candidates?.[0]?.finishReason || 'desconocido';
    const bloqueoPrompt = datos.promptFeedback?.blockReason;
    if (bloqueoPrompt || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(motivo)) {
      throw new ErrorEstudio('Google bloqueó la lectura de este video con su filtro de seguridad.', { estado: 422, tipo: 'bloqueo', detalle: `blocked ${bloqueoPrompt || motivo}` });
    }
    // Sin texto y sin bloqueo: lo más probable es que el video se
    // haya acabado antes de este trozo. El estudio lo interpreta.
    return { resumen: '', modelo, motivo };
  }
  return { resumen: texto, modelo };
}

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const { enlace } = req.body || {};
  const id = yt.idDeEnlace(enlace);
  if (!id) {
    throw new ErrorEstudio('Ese enlace no es de YouTube. Pega el enlace del video que quieres estudiar.', { estado: 400, tipo: 'peticion' });
  }
  if (req.body.desde !== undefined || req.body.hasta !== undefined) return resumirTrozo(req, google, id);
  let titulo = '';
  try {
    const r = await fetch('https://www.youtube.com/watch?v=' + id + '&hl=es', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    titulo = yt.tituloDeHtml(await r.text());
  } catch { /* el título es opcional */ }
  return { titulo };
});
