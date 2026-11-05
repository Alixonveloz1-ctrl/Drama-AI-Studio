// ════════════════════════════════════════════════════════════════
// PROMPTS DE IMAGEN — en inglés (los modelos de imagen obedecen mejor).
// El contrato de estilo (foto de acción real retocada) NO va aquí: lo añade siempre el
// servidor, primero, y no se puede sustituir.
//
// El género y CADA subgénero elegidos viajan con cada imagen (fichas,
// escenarios y planos) como dirección de aspecto: antes solo llegaban al
// guion y las imágenes salían iguales para cualquier elección.
// ════════════════════════════════════════════════════════════════
import { esEcchi, subgenerosEfectivos } from './prompts.mjs';

// Aspecto visual de cada género (luz, paleta, vestuario, energía de cámara).
export const ASPECTO_GENERO = {
  accion: 'action drama: dynamic body language, tension in every frame, dust and impact, strong directional light',
  fantasia: 'fantasy drama: ornate costumes, mystical motivated light, a world that is clearly not modern',
  isekai: 'isekai drama: a modern mind in another world; costumes and places belong to that world',
  mecha: 'mecha drama: military-industrial hangars, pilot suits, colossal machines with real weight and scale',
  romcom: 'romantic comedy: warm, bright, flattering light, expressive faces, charming everyday places',
  drama: 'emotional drama: soft naturalistic light, faces carrying the emotion, intimate framing',
  slice_of_life: 'slice of life: warm everyday light, lived-in places, small natural gestures',
  terror: 'horror: low-key lighting, deep shadows, cold desaturated palette, unsettling negative space',
  psicologico: 'psychological drama: claustrophobic framing, uneasy light, reflections and isolation',
  misterio: 'mystery: chiaroscuro, half-lit faces, clues visible in the frame, muted palette',
  deportes: 'sports drama: sweat, effort, sportswear and training gear, stadium or gym light',
  sci_fi: 'science fiction: advanced technology, clean cool light, practical screens and devices',
  aventura: 'adventure: wide landscapes, travel-worn costumes, sense of distance and discovery',
  sobrenatural: 'supernatural: eerie motivated light, mist, subtle uncanny details under the everyday world',
  supervivencia: 'survival: harsh weather, scarcity, dirt and fatigue on clothes, raw natural light',
  videojuego: 'game-system drama: grounded live-action world; system panels are never drawn into the image',
  donghua: 'cultivation drama: ancient Chinese sects, flowing hanfu, mountains, qi suggested through wind and light, never cartoon effects',
  transmigracion: 'transmigration drama: ancient Chinese period setting with authentic hanfu, courtyards and lanterns',
  naufragio: 'castaway drama: tropical island, salt-stained torn clothing, sun, sand and sea',
  ascenso_social: 'status drama: visible class contrast — humble clothes against luxurious robes, rich halls versus poor corners',
  sistema_juego: 'level-system drama: grounded live-action world; system panels are never drawn into the image',
};

// Aspecto visual de cada subgénero.
export const ASPECTO_SUBGENERO = {
  psicologico: 'psychological tension: uneasy framing and isolating light',
  romance: 'romance: soft warm light, longing glances, close two-shots, charged closeness',
  ecchi: 'ecchi (adult fan service): alluring adult women, figure-flattering form-fitting wardrobe, suggestive but non-explicit framing when the beat allows it',
  harem: 'harem: several attractive adult women around the male lead, each with her own distinct look',
  harem_inverso: 'reverse harem: several handsome adult men around the female lead, each with his own distinct look',
  comedia: 'comedy: brighter light, expressive comic reactions and timing',
  dark: 'dark tone: desaturated palette, hard shadows, grim consequences visible',
  gore: 'violent: visible wounds, blood and bruises with real weight (never gratuitous)',
  misterio: 'mystery: secrets in shadow, clues in frame',
  revenge: 'revenge: cold determined gazes, power reversal staged in the composition',
  overpowered: 'overpowered lead: heroic low angles, others shrinking around the protagonist',
  slice_of_life: 'slice of life: everyday warmth and mundane detail',
  musica: 'music and art: instruments, stages, studio light',
  deporte: 'sports: training gear, sweat, competition venues',
  mafia: 'crime: noir lighting, sharp suits, neon and smoke',
  escolar: 'academy for ADULTS only: university campus and adult students, never secondary school or school uniforms',
  militar: 'military: uniforms, rank insignia, discipline and hardware',
  reencarnacion: 'reincarnation: past and present lives contrasted through costume and light',
  viaje_tiempo: 'time travel: period details out of place, two eras colliding',
  apocalipsis: 'apocalypse: ruins, dust, improvised survival gear',
  idols: 'idols and fame: glamorous styling, stage lights, cameras and fans',
  medicina: 'medicine: clinical light, lab coats, herbs or instruments',
  sistema_awakening: 'system awakening: grounded live-action world; system panels are never drawn into the image',
};

// Casting (decisión del dueño): siempre, para todos los proyectos.
export const CASTING = 'CASTING of a hit Asian short drama: every adult woman is stunningly beautiful with an idol-like look — the refined, delicate features of top Korean and Chinese drama actresses: harmonious V-shaped face, large bright expressive eyes, small refined nose, soft full lips, flawless luminous porcelain skin, glossy hair, slender attractive figure, perfectly groomed for her era and role. Adult men are handsome like Korean and Chinese drama leading men: sharp jawline, clear skin, stylish hair, fit build. Keep each person\'s stated age, role, hair, injuries and dirt.';

export const ECCHI_VISUAL = 'ADULT ECCHI PROJECT: adult women (clearly 18+) have curvy, alluring figures and figure-flattering wardrobe consistent with their era and role (form-fitting cuts, low necklines, high slits, opaque fabric that hugs the figure, never transparent). When the scene has a suggestive beat, render it confidently through pose, framing and wardrobe. Never nudity, never intimate parts, never anything that reads as a minor.';

// Dirección de aspecto que acompaña a cada imagen del proyecto.
export function direccionDeAspecto(formulario) {
  const partes = [CASTING];
  if (ASPECTO_GENERO[formulario?.genero]) partes.push(`GENRE LOOK — ${ASPECTO_GENERO[formulario.genero]}.`);
  const subs = subgenerosEfectivos(formulario).filter(s => ASPECTO_SUBGENERO[s]);
  if (subs.length) partes.push(`SUBGENRE LAYERS (all of them apply at once): ${subs.map(s => ASPECTO_SUBGENERO[s]).join('; ')}.`);
  if (esEcchi(formulario)) partes.push(ECCHI_VISUAL);
  if (formulario?.publico === 'familia') partes.push('FAMILY AUDIENCE: modest wardrobe, nothing suggestive, no graphic violence.');
  return partes.join(' ');
}

// Mujer u hombre. Los personajes creados antes de guardar el sexo se
// reconocen por su aspecto (en inglés o en español); si no se sabe, ''.
export function sexoDe(p) {
  if (p?.sexo === 'mujer' || p?.sexo === 'hombre') return p.sexo;
  const en = String(p?.appearance || ''), es = String(p?.aspecto || '');
  if (/\b(woman|female|girl|lady|she|her)\b/i.test(en) || /\b(mujer|dama|señora|señorita|chica|muchacha|femenin\w*|ella)\b/i.test(es)) return 'mujer';
  if (/\b(man|male|boy|gentleman|he|his|beard|bearded|moustache|mustache)\b/i.test(en) || /\b(hombre|varón|caballero|señor|chico|muchacho|masculin\w*|él|barba|barbudo|bigote)\b/i.test(es)) return 'hombre';
  return '';
}

// Ficha maestra: UNA sola imagen limpia por personaje (sección 10.1).
export function promptFichaPersonaje(p, formulario) {
  const mujer = sexoDe(p) === 'mujer';
  const belleza = mujer
    ? `a stunningly beautiful adult woman with the idol-like look of a top K-drama or C-drama actress, ${p.edad} years old`
    : p.sexo === 'hombre' ? `a handsome adult man with the look of a K-drama or C-drama leading man, ${p.edad} years old` : `a ${p.edad}-year-old adult`;
  const ecchi = esEcchi(formulario) && mujer
    ? ' Her signature outfit is sexy and flatters her curvy, alluring figure: form-fitting, with a low neckline that shows cleavage and a short or high-slit skirt that shows her legs (as described). She stands in a confident, attractive pose that shows her full silhouette.'
    : '';
  return `Single clean CHARACTER REFERENCE still of ${p.nombre}, ${belleza}, ${p.rol || 'character'}. ${p.appearance || p.aspecto}.${ecchi} ONE person only, full body from head to feet, relaxed natural standing pose, three-quarter front view, face clearly readable, hands visible, plain light-grey studio backdrop with soft flattering light. Wardrobe exactly as described, clean and dry (this is the reference outfit; wet or torn states belong to scenes). Hair exactly as described. No turnaround, no collage, no multiple poses, no expression sheet.`;
}

// El lugar, en texto, para cada plano (decisión del dueño: sin imagen del
// escenario; la foto del lugar acababa pegada como fondo).
export function textoDelLugar(e) {
  if (!e) return undefined;
  return `${e.nombre} (${e.interior ? 'interior' : 'exterior'}). ${e.ficha || e.description || e.descripcion}`.replace(/\s+/g, ' ').trim();
}

// (Ya no se usa: los escenarios no tienen imagen.)
export function promptEscenario(e) {
  return `ESTABLISHING SHOT of a drama location: ${e.nombre}. ${e.description || e.descripcion}. ${e.interior ? 'Interior space.' : 'Exterior space.'} No people in frame. A wide production-design reference still that clearly shows the layout, architecture, materials, props and motivated light of the place, filmed at eye level with a natural lens so every piece of furniture and every door has its true real-world size (a table at hip height, a door a little taller than a person).`;
}

// Variante: se edita la imagen de la madre con la descripción del cambio.
export function promptVariante(v) {
  return `Show this same person ${v.cambio}`;
}
