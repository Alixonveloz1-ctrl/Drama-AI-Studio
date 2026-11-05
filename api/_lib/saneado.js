// ════════════════════════════════════════════════════════════════
// SANEADO DE PROMPTS — se revisa ANTES de enviar (imagen y video).
//
// Del estudio de anime: palabras que el filtro de Google bloquea seguro y
// frases cuya única función es señalar lo que hay bajo la ropa (no aportan
// nada dibujable y son justo las que disparan el filtro). Se quitan siempre,
// antes de la primera petición.
//
// Lo que NO se hace (sección 18.3): si Google bloquea, no se reintenta con el
// texto rebajado a escondidas. Se dice en pantalla y el dueño cambia el plano.
// ════════════════════════════════════════════════════════════════
const PALABRAS = [
  [/\bnaked\b/gi, 'in swimsuit'], [/\bnude\b/gi, 'in swimsuit'], [/\bexplicit\b/gi, 'suggestive'],
  [/\bpornograph\w*/gi, 'romantic'], [/\berotic\b/gi, 'romantic'], [/\bsex(ual)?\b/gi, 'romantic'],
  [/\bgenitals?\b/gi, ''], [/\bnipples?\b/gi, ''], [/\bnon-consensual\b/gi, 'surprising'],
  [/\bdesnud[oa]s?\b/gi, 'vestida'], [/\bpornogr[áa]fic[oa]s?\b/gi, 'romántico'], [/\bpezones?\b/gi, ''],
  [/\bgenitales\b/gi, ''], [/\bsexual(es|mente)?\b/gi, 'romántico'],
  // La ropa nunca se transparenta: Veo bloquea después el video de ese plano.
  [/\b(see-through|translucent)\b/gi, 'opaque'], [/\btransl[uú]cid[oa]s?\b/gi, 'opaca'],
];
const REDUNDANTE = [
  [/,?\s*(?:while |thus )?revealing (?:the )?(?:full |complete |entire )?(?:outline|silhouette|shape|curves?|contours?) of [^.,;]{0,70}/gi, ''],
  [/,?\s*revelando (?:la |el )?(?:silueta|forma|contorno)s? (?:completa |entera )?de [^.,;]{0,70}/gi, ''],
  [/,?\s*(?:exposing|baring) (?:her|his|the) (?:breasts?|chest|body|figure|underwear|skin)[^.,;]{0,40}/gi, ''],
  [/,?\s*dejando ver (?:sus?|el|la|los|las) [^.,;]{0,60}/gi, ''],
];

function limpiarPrompt(texto) {
  let t = String(texto || '');
  for (const [re, con] of PALABRAS) t = t.replace(re, con);
  for (const [re, con] of REDUNDANTE) t = t.replace(re, con);
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}

module.exports = { limpiarPrompt };
