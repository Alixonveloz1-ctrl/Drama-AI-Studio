// ════════════════════════════════════════════════════════════════
// VOZ — Chirp 3 HD, de la API de Text-to-Speech de Google (sección 14).
//
//   GET                       → { voces: [{ nombre, genero }] }
//     Las voces se le PIDEN a Google, no se escriben aquí: en el estudio de
//     anime la lista a mano ofrecía una voz que no existía. Nombre y género de
//     cada voz Chirp 3 HD del idioma salen de esa lista.
//   POST { proyecto, clave, voz, lineas } → { ruta, url, segundos }
//     Un tramo de escena: líneas seguidas de UNA misma voz. Al motor solo le
//     llega lo que se dice, ya en palabras (números, horas, tartamudeos).
//
// Por qué Chirp (decisión del dueño, igual que acabó su estudio de anime):
// con Gemini TTS la narración salía con pausas raras, como sin contexto, y
// cada llamada volvía a interpretar. Chirp es más plano pero natural y
// mantiene la misma persona de principio a fin. No hay instrucción de estilo
// que mandar: Chirp no la admite. Tampoco se manda velocidad ni tono (el
// estudio de anime comprobó que en Chirp estiran el audio y suena metálico).
// SIN motor de respaldo: si falla, se dice el error de Google tal cual.
//
// Segundo motor (decisión del dueño, 2026-11-12): Gemini 3.8 Flash TTS, el
// nuevo de Gemini — entra SOLO si la petición trae motor: 'gemini' (el
// ajuste vive en Personajes). El Gemini viejo derivaba de tono entre
// llamadas; el 3.8 promete mantenerlo, y el dueño lo prueba y decide.
// Chirp sigue siendo el predeterminado y no se toca.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, firmarUrl, urlVertex } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { pcmAWav, duracionWav } = require('./_lib/audio');
const { normalizarParaVoz } = require('./_lib/habla');

const LIMITE_MS = 50000;
// La API admite 5000 bytes de texto por llamada; se deja margen.
const MAX_BYTES = 4500;
const VOZ = /^[A-Z][a-z]{2,20}$/;

// El otro motor (a mano desde Personajes): Gemini 3.8 Flash TTS, el nuevo
// de Gemini que mantiene el mismo tono de principio a fin. Sus voces NO se
// piden a una lista viva: son las 30 fijas de Google, con el género de la
// lista oficial — la misma que ya usa su estudio de Legado. Ojo: varios
// nombres coinciden con los de Chirp, pero son OTRA voz en cada motor.
const VOCES_GEMINI = [
  { nombre: 'Alnilam', genero: 'hombre' }, { nombre: 'Orus', genero: 'hombre' },
  { nombre: 'Charon', genero: 'hombre' }, { nombre: 'Sadaltager', genero: 'hombre' },
  { nombre: 'Rasalgethi', genero: 'hombre' }, { nombre: 'Algenib', genero: 'hombre' },
  { nombre: 'Iapetus', genero: 'hombre' }, { nombre: 'Schedar', genero: 'hombre' },
  { nombre: 'Algieba', genero: 'hombre' }, { nombre: 'Achird', genero: 'hombre' },
  { nombre: 'Umbriel', genero: 'hombre' }, { nombre: 'Zubenelgenubi', genero: 'hombre' },
  { nombre: 'Puck', genero: 'hombre' }, { nombre: 'Fenrir', genero: 'hombre' },
  { nombre: 'Sadachbia', genero: 'hombre' }, { nombre: 'Enceladus', genero: 'hombre' },
  { nombre: 'Kore', genero: 'mujer' }, { nombre: 'Gacrux', genero: 'mujer' },
  { nombre: 'Erinome', genero: 'mujer' }, { nombre: 'Sulafat', genero: 'mujer' },
  { nombre: 'Despina', genero: 'mujer' }, { nombre: 'Aoede', genero: 'mujer' },
  { nombre: 'Autonoe', genero: 'mujer' }, { nombre: 'Callirrhoe', genero: 'mujer' },
  { nombre: 'Laomedeia', genero: 'mujer' }, { nombre: 'Leda', genero: 'mujer' },
  { nombre: 'Zephyr', genero: 'mujer' }, { nombre: 'Pulcherrima', genero: 'mujer' },
  { nombre: 'Vindemiatrix', genero: 'mujer' }, { nombre: 'Achernar', genero: 'mujer' },
];

// Cada línea termina en un signo: así Chirp hace la pausa justa entre una y
// otra (sin signo las pegaba).
function textoDelTramo(lineas) {
  return lineas.map(l => {
    const t = normalizarParaVoz(l);
    return /[.!?…»"”)]$/.test(t) ? t : t + '.';
  }).join(' ');
}

async function listarVoces(proyecto, token) {
  let r;
  try {
    r = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=' + encodeURIComponent(cfg.idiomaVoz), {
      headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': proyecto }, signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new ErrorEstudio('No hubo conexión con Google para pedir la lista de voces: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw errorDeGoogle('la lista de voces', r.status, d);
  const voces = new Map();
  for (const v of d.voices || []) {
    const m = String(v.name || '').match(/Chirp3-HD-([A-Za-z]+)$/);
    const genero = String(v.ssmlGender || '').toLowerCase();
    if (m && !voces.has(m[1])) voces.set(m[1], { nombre: m[1], genero: genero === 'female' ? 'mujer' : genero === 'male' ? 'hombre' : '' });
  }
  if (!voces.size) throw new ErrorEstudio('Google no devolvió ninguna voz Chirp 3 HD para español. Comprueba que la API de Text-to-Speech está activa (el instalador la activa).', { estado: 502, tipo: 'google' });
  return [...voces.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

module.exports = puerta({ metodos: ['GET', 'POST'] }, async (req, { google }) => {
  if (req.method === 'GET') {
    const { proyecto, token } = await google();
    return { voces: await listarVoces(proyecto, token), vocesGemini: VOCES_GEMINI };
  }
  const limite = Date.now() + LIMITE_MS;
  const b = req.body || {};
  const destino = medios.rutaMedio(b.proyecto, b.clave, 'wav');
  const voz = String(b.voz || '');
  // El motor lo elige el dueño en Personajes (ajustes.motorVoz). Sin motor
  // en la petición, Chirp: lo de siempre.
  const esGemini = b.motor === 'gemini';
  if (esGemini) {
    if (!VOCES_GEMINI.some(v => v.nombre === voz)) throw new ErrorEstudio('Esa voz no es del motor Gemini: elige una de su lista.', { estado: 400, tipo: 'peticion' });
  } else if (!VOZ.test(voz)) throw new ErrorEstudio('Falta la voz de este tramo.', { estado: 400, tipo: 'peticion' });
  const lineas = (Array.isArray(b.lineas) ? b.lineas : []).map(l => String(typeof l === 'string' ? l : l?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 600)).filter(Boolean);
  if (!lineas.length) throw new ErrorEstudio('Este tramo no tiene texto que decir.', { estado: 400, tipo: 'peticion' });
  const texto = textoDelTramo(lineas);
  if (Buffer.byteLength(texto) > MAX_BYTES) throw new ErrorEstudio('Este tramo es demasiado largo para una sola llamada de voz.', { estado: 400, tipo: 'peticion' });

  const { cuenta, proyecto, token } = await google();

  // ─── Motor Gemini: Gemini 3.8 Flash TTS por Vertex (generateContent) ───
  // La misma lectura plana de siempre: SIN instrucción de estilo y sin
  // velocidad ni tono (su herramienta de audios demostró que el estilo
  // deforma la dicción; la lectura tal cual es el estándar del dueño).
  // El audio llega en PCM o WAV y se guarda exactamente igual que Chirp.
  if (esGemini) {
    let rG;
    try {
      rG = await fetch(urlVertex(proyecto, 'global', cfg.modeloVozGemini, 'generateContent'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: texto }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
        }),
        signal: AbortSignal.timeout(Math.max(1000, limite - Date.now())),
      });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new ErrorEstudio('Google tardó demasiado en leer este tramo y hubo que cortar. Vuelve a pulsar cuando quieras.', { estado: 504, tipo: 'tiempo' });
      throw new ErrorEstudio('No hubo conexión con Google para la voz: ' + e.message, { estado: 502, tipo: 'google' });
    }
    const crudoG = await rG.text();
    let dG;
    try { dG = JSON.parse(crudoG); } catch { dG = { error: { message: crudoG.slice(0, 300) || `HTTP ${rG.status}` } }; }
    if (!rG.ok) throw errorDeGoogle(`la voz (Gemini 3.8 Flash TTS, ${voz})`, rG.status, dG);
    const parte = (dG.candidates?.[0]?.content?.parts || []).find(x => x.inlineData?.data);
    if (!parte) throw new ErrorEstudio('Google no devolvió audio para este tramo.', { estado: 502, tipo: 'google' });
    const brutoG = Buffer.from(String(parte.inlineData.data).replace(/\s/g, ''), 'base64');
    const tasa = Number(/rate=(\d+)/.exec(String(parte.inlineData.mimeType || ''))?.[1]) || 24000;
    const wavG = brutoG.toString('ascii', 0, 4) === 'RIFF' ? brutoG : pcmAWav(brutoG, { frecuencia: tasa });
    await medios.guardar(token, destino, wavG, 'audio/wav');
    return { ruta: destino, url: firmarUrl(cuenta, cfg.bucket, destino), segundos: duracionWav(wavG) };
  }

  let r;
  try {
    r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({
        input: { text: texto },
        voice: { languageCode: cfg.idiomaVoz, name: `${cfg.idiomaVoz}-Chirp3-HD-${voz}` },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
      }),
      signal: AbortSignal.timeout(Math.max(1000, limite - Date.now())),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new ErrorEstudio('Google tardó demasiado en leer este tramo y hubo que cortar. Vuelve a pulsar cuando quieras.', { estado: 504, tipo: 'tiempo' });
    throw new ErrorEstudio('No hubo conexión con Google para la voz: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  if (!r.ok) throw errorDeGoogle(`la voz (Chirp 3 HD, ${voz})`, r.status, d);
  if (!d.audioContent) throw new ErrorEstudio('Google no devolvió audio para este tramo.', { estado: 502, tipo: 'google' });
  const bruto = Buffer.from(String(d.audioContent).replace(/\s/g, ''), 'base64');
  // LINEAR16 llega ya como WAV; si llegara crudo, se envuelve.
  const wav = bruto.toString('ascii', 0, 4) === 'RIFF' ? bruto : pcmAWav(bruto, { frecuencia: 24000 });
  await medios.guardar(token, destino, wav, 'audio/wav');
  return { ruta: destino, url: firmarUrl(cuenta, cfg.bucket, destino), segundos: duracionWav(wav) };
});

module.exports.textoDelTramo = textoDelTramo;
module.exports.VOCES_GEMINI = VOCES_GEMINI;
