// ════════════════════════════════════════════════════════════════
// YOUTUBE — leer los subtítulos de un video público para estudiar su
// historia (endpoint /api/inspiracion). Solo funciones puras: el html
// de la página del video trae las pistas de subtítulos disponibles y
// cada pista se puede bajar en formato json3. Si el video no trae
// subtítulos legibles, no hay historia que estudiar y se dice.
// ════════════════════════════════════════════════════════════════

function idDeEnlace(enlace) {
  const t = String(enlace || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : '';
}

// Las pistas vienen como un array JSON dentro del html; se extrae por
// balanceo de corchetes para no depender de un parser de la página.
function pistasDeHtml(html) {
  const t = String(html || '');
  const i = t.indexOf('"captionTracks":');
  if (i < 0) return [];
  const inicio = t.indexOf('[', i);
  if (inicio < 0) return [];
  let nivel = 0, fin = -1, enCadena = false, escape = false;
  for (let j = inicio; j < t.length; j++) {
    const c = t[j];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '[') nivel++;
    else if (c === ']' && --nivel === 0) { fin = j; break; }
  }
  if (fin < 0) return [];
  try {
    const pistas = JSON.parse(t.slice(inicio, fin + 1));
    return Array.isArray(pistas) ? pistas.filter(p => p && typeof p.baseUrl === 'string') : [];
  } catch { return []; }
}

// Español primero (la app trabaja en español), luego inglés; dentro de
// cada idioma, la pista escrita por el autor antes que la automática.
function elegirPista(pistas) {
  const lista = Array.isArray(pistas) ? pistas : [];
  const puntuar = p => {
    const idioma = String(p.languageCode || '');
    const base = idioma.startsWith('es') ? 0 : idioma.startsWith('en') ? 10 : 20;
    return base + (p.kind === 'asr' ? 1 : 0);
  };
  return [...lista].sort((a, b) => puntuar(a) - puntuar(b))[0] || null;
}

function textoDeJson3(datos) {
  const eventos = Array.isArray(datos?.events) ? datos.events : [];
  const partes = [];
  for (const e of eventos) {
    const texto = (e.segs || []).map(s => s.utf8 || '').join('');
    if (texto.trim()) partes.push(texto.replace(/\s+/g, ' ').trim());
  }
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

function tituloDeHtml(html) {
  const m = String(html || '').match(/<meta property="og:title" content="([^"]+)"/);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : '';
}

module.exports = { idDeEnlace, pistasDeHtml, elegirPista, textoDeJson3, tituloDeHtml };
