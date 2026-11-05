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
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, firmarUrl } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { pcmAWav, duracionWav } = require('./_lib/audio');
const { normalizarParaVoz } = require('./_lib/habla');

const LIMITE_MS = 50000;
// La API admite 5000 bytes de texto por llamada; se deja margen.
const MAX_BYTES = 4500;
const VOZ = /^[A-Z][a-z]{2,20}$/;

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
    return { voces: await listarVoces(proyecto, token) };
  }
  const limite = Date.now() + LIMITE_MS;
  const b = req.body || {};
  const destino = medios.rutaMedio(b.proyecto, b.clave, 'wav');
  const voz = String(b.voz || '');
  if (!VOZ.test(voz)) throw new ErrorEstudio('Falta la voz de este tramo.', { estado: 400, tipo: 'peticion' });
  const lineas = (Array.isArray(b.lineas) ? b.lineas : []).map(l => String(typeof l === 'string' ? l : l?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 600)).filter(Boolean);
  if (!lineas.length) throw new ErrorEstudio('Este tramo no tiene texto que decir.', { estado: 400, tipo: 'peticion' });
  const texto = textoDelTramo(lineas);
  if (Buffer.byteLength(texto) > MAX_BYTES) throw new ErrorEstudio('Este tramo es demasiado largo para una sola llamada de voz.', { estado: 400, tipo: 'peticion' });

  const { cuenta, proyecto, token } = await google();
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
