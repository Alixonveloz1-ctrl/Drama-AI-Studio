// ════════════════════════════════════════════════════════════════
// AUDIO — utilidades para los WAV que devuelve Google.
//  · Si Google devuelve PCM crudo (16 bits, mono, 24 kHz) se envuelve en un
//    WAV para poder escucharlo y montarlo.
//  · La duración se lee de la cabecera, sin decodificar nada.
// ════════════════════════════════════════════════════════════════

function pcmAWav(pcm, { frecuencia = 24000, canales = 1, bits = 16 } = {}) {
  const cabecera = Buffer.alloc(44);
  const bytesPorSegundo = frecuencia * canales * bits / 8;
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(canales, 22);
  cabecera.writeUInt32LE(frecuencia, 24);
  cabecera.writeUInt32LE(bytesPorSegundo, 28);
  cabecera.writeUInt16LE(canales * bits / 8, 32);
  cabecera.writeUInt16LE(bits, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecera, pcm]);
}

// Duración de un WAV en segundos (busca el bloque «data»). null si no lo es.
function duracionWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12, bytesPorSegundo = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const tam = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') bytesPorSegundo = buf.readUInt32LE(pos + 16);
    if (id === 'data') return bytesPorSegundo ? Math.min(tam, buf.length - pos - 8) / bytesPorSegundo : null;
    pos += 8 + tam + (tam % 2);
  }
  return null;
}

// Duración de un MP3 en segundos (Lyria 3 Pro entrega MP3): se recorren las
// cabeceras de cada trama. null si no es un MP3 legible.
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const FRECUENCIAS = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function duracionMp3(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 10) return null;
  let pos = 0;
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    pos = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let segundos = 0, tramas = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; continue; }
    const version = (buf[pos + 1] >> 3) & 3;           // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const capa = (buf[pos + 1] >> 1) & 3;              // 1 = Layer III
    const iBit = buf[pos + 2] >> 4, iFrec = (buf[pos + 2] >> 2) & 3, relleno = (buf[pos + 2] >> 1) & 1;
    const frecuencia = FRECUENCIAS[version]?.[iFrec];
    const kbps = BITRATES[version === 3 ? 1 : 2][iBit];
    if (version === 1 || capa !== 1 || !frecuencia || !kbps) { pos++; continue; }
    const muestras = version === 3 ? 1152 : 576;
    const largo = Math.floor((muestras / 8) * kbps * 1000 / frecuencia) + relleno;
    if (largo < 4) { pos++; continue; }
    segundos += muestras / frecuencia;
    tramas++;
    pos += largo;
  }
  return tramas ? segundos : null;
}

module.exports = { pcmAWav, duracionWav, duracionMp3 };
