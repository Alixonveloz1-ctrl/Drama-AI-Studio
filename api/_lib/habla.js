// ════════════════════════════════════════════════════════════════
// TEXTO PARA LA VOZ — del estudio de anime (su «normalización para voz»).
//
// Chirp lee lo que está escrito, literalmente: «+10» lo dice «más uno cero»
// y «Q-Que» lo dice «cu, que». Todo lo numérico o simbólico le llega ya en
// palabras. Los subtítulos siguen usando el texto del guion tal cual.
// ════════════════════════════════════════════════════════════════
const UNI = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function tresCifras(n, femenino) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  let s = '';
  const c = Math.floor(n / 100), r = n % 100;
  if (c) s += femenino ? CEN[c].replace(/os$/, 'as') : CEN[c];
  if (r) {
    if (s) s += ' ';
    if (r < 30) s += UNI[r];
    else { s += DEC[Math.floor(r / 10)]; if (r % 10) s += ' y ' + UNI[r % 10]; }
  }
  if (femenino) s = s.replace(/\bveintiuno\b/, 'veintiuna').replace(/\buno\b/, 'una');
  return s;
}
// «uno» → «un» y «veintiuno» → «veintiún» delante de mil o millones.
const apocope = s => s.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un');

function enLetras(n, femenino) {
  n = Math.trunc(Number(n));
  if (!Number.isFinite(n)) return '';
  if (n < 0) return 'menos ' + enLetras(-n, femenino);
  if (n === 0) return 'cero';
  const partes = [];
  const millones = Math.floor(n / 1e6), resto = n % 1e6;
  const miles = Math.floor(resto / 1000), unidades = resto % 1000;
  if (millones) partes.push(millones === 1 ? 'un millón' : apocope(enLetras(millones)) + ' millones');
  if (miles) partes.push(miles === 1 ? 'mil' : apocope(tresCifras(miles)) + ' mil');
  if (unidades) partes.push(tresCifras(unidades, femenino));
  return partes.join(' ');
}

const digitoADigito = s => String(s).split('').map(d => UNI[Number(d)] ?? d).join(' ');

// «Q-Que» → «Que» (una letra suelta se lee por su nombre); «Pe-pero» →
// «Pe, pero». Solo si lo de delante es el principio de la palabra de detrás:
// «Ana-María» no se toca.
function arreglarTartamudeo(t) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return String(t).replace(/(?<!\p{L})(\p{L}{1,3})-(\p{L}{2,})(?!\p{L})/gu, (m, pre, palabra) => {
    if (!norm(palabra).startsWith(norm(pre))) return m;
    return pre.length === 1 ? palabra : `${pre}, ${palabra}`;
  });
}

function normalizarParaVoz(texto) {
  let t = arreglarTartamudeo(String(texto));
  t = t.replace(/\+\s?(\d)/g, 'más $1').replace(/−\s?(\d)/g, 'menos $1');
  t = t.replace(/(^|[\s(])-\s?(\d)/g, '$1menos $2');
  t = t.replace(/(\d)\s?[°º]\s?C\b/gi, '$1 grados');
  // Horas: 21:00 → las veintiuna · 9:12 → las nueve y doce
  t = t.replace(/((?:a\s+)?las\s+)?\b(\d{1,2}):(\d{2})(?::\d{2})?\b/gi, (m, pre, h, mi) => {
    const H = Number(h), M = Number(mi);
    if (H > 23 || M > 59) return m;
    const cuerpo = M === 0 ? enLetras(H, true) : enLetras(H, true) + ' y ' + enLetras(M);
    return pre ? pre + cuerpo : 'las ' + cuerpo;
  });
  t = t.replace(/¥\s?(\d(?:[\d.,]*\d)?)/g, (_, n) => enLetras(n.replace(/[.,]/g, '')) + ' yenes');
  t = t.replace(/\$\s?(\d(?:[\d.,]*\d)?)/g, (_, n) => enLetras(n.replace(/[.,]/g, '')) + ' dólares');
  t = t.replace(/€\s?(\d(?:[\d.,]*\d)?)/g, (_, n) => enLetras(n.replace(/[.,]/g, '')) + ' euros');
  t = t.replace(/(\d+)\s?%/g, (_, n) => enLetras(n) + ' por ciento');
  t = t.replace(/(\d+)\s?km\b/gi, (_, n) => enLetras(n) + ' kilómetros');
  t = t.replace(/(\d+)\s?kg\b/gi, (_, n) => enLetras(n) + ' kilos');
  t = t.replace(/(\d+)\s?cm\b/gi, (_, n) => enLetras(n) + ' centímetros');
  t = t.replace(/(\d+)\s?m\b/g, (_, n) => enLetras(n) + ' metros');
  // Decimales con coma y miles con punto (uso español).
  t = t.replace(/\b(\d+),(\d+)\b/g, (_, a, b) => enLetras(a) + ' coma ' + (b.length > 2 ? digitoADigito(b) : enLetras(b)));
  t = t.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, n => enLetras(n.replace(/\./g, '')));
  // Con cero delante es un código: se lee cifra a cifra.
  t = t.replace(/\b0(\d+)\b/g, m => digitoADigito(m));
  t = t.replace(/\b\d{1,9}\b/g, n => enLetras(n));
  t = t.replace(/\d/g, d => UNI[Number(d)] || '');
  t = t.replace(/&/g, ' y ').replace(/[¥$€²³]/g, '').replace(/[+±×÷=<>#@^|\\/_*~]/g, ' ');
  // Un espacio delante de un signo se lee como una pausa doble.
  return t.replace(/\s+([,.;:!?…])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

module.exports = { normalizarParaVoz, enLetras };
