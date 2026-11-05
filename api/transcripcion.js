// ════════════════════════════════════════════════════════════════
// TRANSCRIPCIÓN — Speech-to-Text con tiempos por palabra (sección 15).
//
//   POST { proyecto, ruta } → { palabras: [{ palabra, inicio, fin }] }
//
// Es ALINEACIÓN FORZADA: lo que se dijo ya se sabe (lo escribió el guion);
// lo que se pide son los tiempos de cada palabra. El navegador los casa con
// el texto del guion. Si no hay palabras (o el tramo es demasiado largo para
// la llamada síncrona), el navegador usa el reparto proporcional.
// El audio se lee del bucket aquí mismo: no viaja por el navegador.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { duracionWav } = require('./_lib/audio');

const segundos = v => {
  if (v == null) return 0;
  if (typeof v === 'object') return Number(v.seconds || 0) + Number(v.nanos || 0) / 1e9;
  return parseFloat(String(v).replace('s', '')) || 0;
};

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const b = req.body || {};
  const ruta = medios.exigirDelProyecto(b.proyecto, b.ruta);
  const { proyecto, token } = await google();
  const { bytes } = await medios.leer(token, ruta, 'la voz de este tramo');
  const dura = duracionWav(bytes);
  // La llamada síncrona admite como mucho un minuto de audio.
  if (dura && dura > 58) return { palabras: [], motivo: 'largo' };
  let r;
  try {
    r = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({
        config: { languageCode: cfg.idiomaSubtitulos, model: cfg.modeloSubtitulos, enableWordTimeOffsets: true, enableAutomaticPunctuation: false, encoding: 'LINEAR16', sampleRateHertz: bytes.readUInt32LE(24) || 24000 },
        audio: { content: bytes.subarray(44).toString('base64') },
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new ErrorEstudio('No hubo conexión con Google para los subtítulos: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw errorDeGoogle('los subtítulos', r.status, d);
  const palabras = [];
  for (const resultado of d.results || []) {
    for (const w of resultado.alternatives?.[0]?.words || []) palabras.push({ palabra: w.word, inicio: segundos(w.startTime), fin: segundos(w.endTime) });
  }
  return { palabras, segundos: dura };
});
