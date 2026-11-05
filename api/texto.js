// ════════════════════════════════════════════════════════════════
// TEXTO — el único punto que genera texto: ideas, universo, biblia de
// dirección, nota del episodio y guion por bloques.
//
// Reglas heredadas del estudio de anime (cada una costó un fallo real):
//
//  · Gemini 3.x solo se sirve desde el endpoint "global".
//  · Gemini 3.1 Pro SIEMPRE piensa antes de responder, y ese pensamiento
//    gasta del mismo límite de salida (maxOutputTokens). Con un límite corto
//    se queda pensando y no devuelve nada (finishReason MAX_TOKENS): por eso
//    el límite es amplio. Las partes "thought" se descartan al leer.
//  · thinkingLevel LOW: el nivel por defecto (HIGH) hacía que el bloque largo
//    pasara de los 60 s de Vercel y el navegador recibía una página de error
//    que no era JSON. LOW razona de sobra para escribir.
//  · Vercel corta a los 60 s con un 504 en texto plano que no se distingue de
//    un corte de red. Aquí se para a los 57 s y se contesta en JSON que la
//    petición fue demasiado lenta: el navegador la hace más pequeña en vez
//    de repetirla igual (repetirla igual vuelve a fallar). Antes el corte
//    era a los 50 s, pero en el texto no queda trabajo después de que
//    Google contesta (a diferencia de la imagen o la voz, que aún guardan
//    el archivo), y el dueño señaló que una respuesta que llegaba a los
//    55 s se mataba sola teniendo permiso hasta los 60; 57 deja solo el
//    margen de entregar la respuesta.
//  · Sin cambio de modelo: si el elegido falla, se devuelve el error de Google.
//  · Los cuatro filtros configurables, en OFF (el estudio puede escribir
//    contenido adulto). Las protecciones no configurables de Google siguen
//    activas; si bloquean, se dice que es un bloqueo y no se reintenta.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');

const LIMITE_MS = 57000;
const MAX_MENSAJE = 400000;   // caracteres; muy por debajo de los 4,5 MB de Vercel

function extraerTexto(datos) {
  const partes = datos?.candidates?.[0]?.content?.parts || [];
  return partes.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
}

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const inicio = Date.now();
  const { sistema, mensaje, temperatura, maxTokens } = req.body || {};
  if (typeof mensaje !== 'string' || !mensaje.trim()) {
    throw new ErrorEstudio('Falta el texto que hay que enviar al modelo.', { estado: 400, tipo: 'peticion' });
  }
  if (mensaje.length + String(sistema || '').length > MAX_MENSAJE) {
    throw new ErrorEstudio('La petición de texto es demasiado grande. Hay que pedirla en partes más pequeñas.', { estado: 413, tipo: 'peticion' });
  }
  const { proyecto, token } = await google();
  const modelo = cfg.modeloTexto;
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: mensaje }] }],
    ...(sistema ? { systemInstruction: { parts: [{ text: String(sistema) }] } } : {}),
    generationConfig: {
      temperature: Number.isFinite(Number(temperatura)) ? Math.max(0, Math.min(2, Number(temperatura))) : 0.8,
      maxOutputTokens: Number.isFinite(Number(maxTokens)) ? Math.max(4096, Math.min(32768, Math.floor(Number(maxTokens)))) : 32768,
      responseMimeType: 'application/json',
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
      throw new ErrorEstudio(`Google tardó más de ${LIMITE_MS / 1000} s en escribir esta parte. Hay que pedirla más pequeña.`, { estado: 504, tipo: 'tiempo' });
    }
    throw new ErrorEstudio('No hubo conexión con Google para escribir el texto: ' + e.message, { estado: 502, tipo: 'google' });
  }

  const crudo = await respuesta.text();
  let datos;
  try { datos = JSON.parse(crudo); } catch { datos = { error: { message: crudo.slice(0, 300) || `HTTP ${respuesta.status}` } }; }
  if (!respuesta.ok) throw errorDeGoogle(`el texto (${modelo})`, respuesta.status, datos);

  const texto = extraerTexto(datos);
  if (!texto) {
    const motivo = datos.candidates?.[0]?.finishReason || 'desconocido';
    const bloqueoPrompt = datos.promptFeedback?.blockReason;
    if (bloqueoPrompt || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(motivo)) {
      throw new ErrorEstudio('Google bloqueó este texto con su filtro de seguridad. Reintentar igual no sirve: hay que cambiar lo que se pide.',
        { estado: 422, tipo: 'bloqueo', detalle: `blocked ${bloqueoPrompt || motivo}` });
    }
    if (motivo === 'MAX_TOKENS') {
      throw new ErrorEstudio('El modelo se quedó sin espacio antes de terminar de escribir. Hay que pedir esta parte más pequeña.', { estado: 502, tipo: 'tiempo', detalle: 'MAX_TOKENS' });
    }
    throw new ErrorEstudio(`Google no devolvió texto (motivo: ${motivo}).`, { estado: 502, tipo: 'google', detalle: motivo });
  }
  return { texto, modelo };
});
