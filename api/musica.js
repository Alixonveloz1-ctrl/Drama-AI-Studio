// ════════════════════════════════════════════════════════════════
// MÚSICA — Lyria 3 Pro por Vertex AI (sección 14.4).
//
//   POST { proyecto, clave, brief, segundos } → { ruta, url, segundos }
//
//  · Una pieza por acto que dura lo que dura el acto (hasta 184 s, el límite
//    del modelo). Antes era Lyria 2: clips de 30 s que se repetían en bucle
//    y sonaban viejos (decisión del dueño: piezas largas con más contexto).
//  · La llamada es exactamente la de la parte de cortos del estudio de anime:
//    endpoint «interactions» de v1beta1 en global, el texto con «Instrumental
//    music only. No vocals, lyrics or speech. Requested duration N seconds.»
//    delante, y la respuesta en outputs[] con un audio MP3.
//  · El brief lo escribe el director musical en inglés (se comprueba antes).
//  · Componer una pieza larga tarda: esta función tiene 300 s y a Google se le
//    dan 270, para que quede tiempo de guardar. Va directo al bucket.
//  · Un fallo NO se reintenta solo (se pagaría dos veces); se explica.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, firmarUrl } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle } = require('./_lib/errores');
const medios = require('./_lib/medios');
const { duracionMp3, duracionWav } = require('./_lib/audio');

const LIMITE_MS = 270000;
const MAX_SEGUNDOS = 184;

// Lo que sonó mal la primera vez (techno viejo, sintetizador barato…). Va al
// final del texto como lista de cosas a evitar.
const EVITAR = 'Avoid: vocals, singing, choir, lyrics, spoken word, rap, retro or vintage synths, 80s synthwave, techno, EDM drops, dance beats, chiptune, 8-bit or video-game music, lo-fi, cheesy stock or elevator music, brass fanfares, marching-band sounds, old or low-fidelity recordings.';

function textoParaLyria(brief, segundos) {
  return `Instrumental music only. No vocals, lyrics or speech. Requested duration ${segundos} seconds. ${brief} ${EVITAR}`;
}

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const inicio = Date.now();
  const b = req.body || {};
  const brief = String(b.brief || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
  const segundos = Math.round(Number(b.segundos) || 60);
  if (brief.length < 20) throw new ErrorEstudio('Falta la descripción de la música.', { estado: 400, tipo: 'peticion' });
  if (/[áéíóúñ¿¡]/i.test(brief)) throw new ErrorEstudio('La descripción de la música está en español y la música se pide en inglés. Vuelve a pedir la música para que el director la escriba en inglés.', { estado: 400, tipo: 'peticion' });
  if (!(segundos >= 10 && segundos <= MAX_SEGUNDOS)) throw new ErrorEstudio(`Una pieza de música dura entre 10 y ${MAX_SEGUNDOS} segundos.`, { estado: 400, tipo: 'peticion' });
  const destinoBase = String(b.clave || '');
  medios.rutaMedio(b.proyecto, destinoBase, 'mp3');   // valida proyecto y clave antes de pagar

  const { cuenta, proyecto, token } = await google();
  let r;
  try {
    r = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${proyecto}/locations/${cfg.ubicacionMusica}/interactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({ model: cfg.modeloMusica, input: [{ type: 'text', text: textoParaLyria(brief, segundos) }] }),
      signal: AbortSignal.timeout(LIMITE_MS),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new ErrorEstudio(`Lyria tardó más de ${Math.round(LIMITE_MS / 1000)} s en componer esta pieza y hubo que cortar. No se reintenta solo, para no pagarla dos veces: vuelve a pulsar cuando quieras.`, { estado: 504, tipo: 'tiempo' });
    throw new ErrorEstudio('No hubo conexión con Google para la música: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  if (!r.ok) throw errorDeGoogle(`la música (${cfg.modeloMusica})`, r.status, d);
  if (d.status && d.status !== 'completed') throw new ErrorEstudio('Lyria no terminó la pieza.', { estado: 502, tipo: 'google', detalle: String(d.status).slice(0, 80) });
  const audio = (d.outputs || []).find(x => x?.type === 'audio' && x.data);
  if (!audio) throw new ErrorEstudio('Lyria no devolvió audio.', { estado: 502, tipo: 'google', detalle: JSON.stringify(d).slice(0, 300) });
  const tipo = String(audio.mime_type || audio.mimeType || '');
  const bytes = Buffer.from(String(audio.data).replace(/\s/g, ''), 'base64');
  if (!bytes.length) throw new ErrorEstudio('Lyria devolvió un audio vacío.', { estado: 502, tipo: 'google' });
  const esWav = /wav/i.test(tipo) || bytes.toString('ascii', 0, 4) === 'RIFF';
  const destino = medios.rutaMedio(b.proyecto, destinoBase, esWav ? 'wav' : 'mp3');
  await medios.guardar(token, destino, bytes, esWav ? 'audio/wav' : 'audio/mpeg', { espera: Math.max(5000, inicio + 295000 - Date.now()) });
  return { ruta: destino, url: firmarUrl(cuenta, cfg.bucket, destino), segundos: (esWav ? duracionWav(bytes) : duracionMp3(bytes)) || segundos };
});

module.exports.textoParaLyria = textoParaLyria;
module.exports.MAX_SEGUNDOS = MAX_SEGUNDOS;
