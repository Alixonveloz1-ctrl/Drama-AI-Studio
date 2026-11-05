// ════════════════════════════════════════════════════════════════
// DESGLOSE DE PLANOS (director de fotografía) y REVISIÓN DE PUESTA EN
// ESCENA (director de arte) — secciones 7.3, 7.4 y 11.
//
//  · Dos tipos de plano: ACCIÓN (alguien hace algo; se anima con Veo, 4 s) y
//    COBERTURA (una cara que reacciona, una mano, un objeto, un paisaje;
//    imagen fija con movimiento de cámara en el montaje, 1,5 a 3 s).
//    Proporción objetivo 70 % acción / 30 % cobertura, contando planos.
//  · Lo hace el director solo, sin pantalla de confirmación; el dueño solo
//    puede pedir que se rehaga el desglose de una escena.
//  · Cada plano queda anclado a un fragmento LITERAL y ordenado de la escena:
//    no puede adelantar acontecimientos.
//  · Peso editorial de 1 a 5: el audio se reparte según esos pesos.
//  · Mínimo de planos por palabras: <18 → 1; 18-35 → 2; 36+ → 3.
//  · Los trucos de encubrimiento van dentro del desglose (cortar antes de que
//    termine un movimiento complejo y poner una reacción, etc.).
//  · El director de arte revisa cada 5 escenas. Cuando corrige un plano NO
//    borra nada: marca la imagen como obsoleta y deja decidir. Si no pudo
//    revisar, lo dice: nunca informa «sin fallos» de algo que no miró.
//
// CONTINUIDAD DE ESCENA (fallo real visto por el dueño: una mujer que
// desaparece cuando el hombre despierta, un hombre que aparece de la nada,
// un plato roto que se esfuma y una mujer que salta a la cama):
//  · PUESTA EN ESCENA: quién está en la escena desde el principio. Nadie
//    aparece sin entrar ni desaparece sin salir, y se dice en qué plano.
//  · ENCUADRE de cada plano (general, medio, primer plano, detalle). Solo un
//    encuadre cerrado puede dejar fuera a alguien que está presente.
//  · Con dos o más personas, el primer plano es GENERAL y las muestra a todas
//    en su sitio: es el mapa de la escena para todos los planos siguientes.
//  · ESTADO de cada plano: dónde está y qué hace CADA persona presente (se
//    vea o no) y cómo están los objetos que importan. CAMBIO: qué es distinto
//    respecto al plano anterior, para que la imagen no copie la anterior.
//  · Todo se comprueba aquí, en el texto, ANTES de pagar ninguna imagen.
// ════════════════════════════════════════════════════════════════
import { pedirTexto, parsearJSON } from './texto.mjs';
import { contarPalabras, normalizar, asegurarLugares } from './guion.mjs';
import { contextoEleccion, segundosDe, esEcchi } from './prompts.mjs';
import { direccionDeAspecto } from './imagenes.mjs';

const POR_LLAMADA = 5;          // escenas como mucho por petición
const PLANOS_POR_LLAMADA = 16;  // y planos mínimos sumados: la respuesta tiene que caber en el tiempo
const REVISAR_CADA = 5;         // el director de arte revisa cada 5 escenas
const INTENTOS = 3;

export function textoEscena(e) {
  return e.lineas.map(l => l.texto).join(' ');
}

export function minimoPlanos(escena) {
  const palabras = contarPalabras(textoEscena(escena));
  const porPalabras = palabras < 18 ? 1 : palabras < 36 ? 2 : 3;
  return Math.max(porPalabras, Math.ceil(segundosDe(palabras) / 4));
}
export function maximoPlanos(escena) {
  return Math.max(minimoPlanos(escena) + 1, Math.ceil(segundosDe(contarPalabras(textoEscena(escena))) / 1.5) + 1);
}

export const ENCUADRES = ['general', 'medio', 'primer_plano', 'detalle'];
export const NOMBRE_ENCUADRE = { general: 'General', medio: 'Medio', primer_plano: 'Primer plano', detalle: 'Detalle' };

// Para un encuadre cerrado (primer plano o detalle), el estado que se manda
// a la imagen debe hablar solo del personaje visible: si describe con detalle
// lo que hacen los demás presentes, Google intenta meterlos a todos en un
// rostro y se atasca hasta el límite de tiempo. Las frases que mencionan a
// alguien fuera de cuadro se quitan (ese alguien queda solo en la lista de
// «fuera de cuadro»); las que no mencionan a ningún visible también se
// quitan, porque suelen describir objetos o acciones fuera del encuadre.
export function textoSoloVisibles(texto, visibles, presentes) {
  if (typeof texto !== 'string' || !texto.trim()) return '';
  const baja = s => String(s || '').toLowerCase();
  const vis = [...new Set((Array.isArray(visibles) ? visibles : []).map(baja).filter(Boolean))];
  const fuera = [...new Set((Array.isArray(presentes) ? presentes : []).map(baja).filter(Boolean))].filter(n => !vis.includes(n));
  const frases = texto.split(/(?<=[.;])\s+/).map(f => f.trim()).filter(Boolean);
  const kept = frases.filter(f => {
    const t = baja(f);
    if (fuera.some(n => t.includes(n))) return false;
    return vis.some(n => t.includes(n));
  });
  if (!kept.length) return '';
  return kept.join('; ').replace(/;+$/, '') + '.';
}

// Nombre de un personaje o de una variante (la variante se llama como su madre).
export function nombreDe(u, id) {
  const v = (u.variantes || []).find(x => x.id === id);
  const madre = v ? u.personajes.find(p => p.id === v.madre) : null;
  return madre?.nombre || u.personajes.find(p => p.id === id)?.nombre || id;
}

function fichaVisual(u) {
  const personajes = u.personajes.map(p => `- ${p.id} = ${p.nombre}: ${p.appearance}`).join('\n');
  const variantes = (u.variantes || []).map(v => `- ${v.id} = ${v.nombre} (variante de ${v.madre}): ${v.cambio}`).join('\n');
  const escenarios = u.escenarios.map(e => `- ${e.id} = ${e.nombre} (${e.interior ? 'INTERIOR' : 'EXTERIOR'}): ${e.ficha || e.description || e.descripcion}`).join('\n');
  return `PERSONAJES (aspecto en inglés para los prompts):\n${personajes}${variantes ? `\nVARIANTES (usa su id cuando el personaje aparece así):\n${variantes}` : ''}\n\nLUGARES (ficha de cada uno: inventario cerrado y posiciones fijas):\n${escenarios}`;
}

function escenasParaPrompt(u, escenas) {
  const nombres = Object.fromEntries(u.personajes.map(p => [p.id, p.nombre]));
  return escenas.map(e => {
    const lineas = e.lineas.map(l => `${l.tipo === 'sistema' ? 'SISTEMA' : (nombres[l.personaje] || l.nombre || l.personaje)}${l.tipo === 'pensamiento' ? ' (piensa)' : ''}: ${l.texto}`).join('\n');
    const palabras = contarPalabras(textoEscena(e));
    const reparto = (e.personajes || []).map(id => `${id} = ${nombres[id] || id}`).join(', ');
    return `═══ ESCENA ${e.id} — «${e.titulo}» — escenario ${e.escenario} — ${palabras} palabras (≈ ${Math.round(segundosDe(palabras))} s de audio) — MÍNIMO ${minimoPlanos(e)} planos, máximo ${maximoPlanos(e)}
Personajes de esta escena según el guion: ${reparto || 'ver las líneas'}
Lo que se ve al empezar: ${e.accion}
${lineas}`;
  }).join('\n\n');
}

export const SISTEMA_FOTOGRAFIA = `Eres el DIRECTOR DE FOTOGRAFÍA de un drama corto asiático de acción real (actores reales, imagen pulida de portada) que se mira en el teléfono. Decides cuántos planos tiene cada escena, qué muestra cada uno y su movimiento, a partir del guion YA ESCRITO. No inventas historia.

DOS TIPOS DE PLANO (el ritmo sale de alternarlos):
- "accion": alguien camina, pelea, construye, nada, conduce o manipula un objeto. Se anima con video: dura 4 segundos.
- "cobertura": una cara que reacciona, una mano, un objeto o un plano general de paisaje. Es imagen fija con movimiento de cámara en el montaje: 1,5 a 3 segundos.
- Proporción objetivo: 70 % acción y 30 % cobertura, contando planos.

REGLAS DEL DESGLOSE:
- Cada plano lleva "ancla": de 4 a 14 palabras CONSECUTIVAS copiadas literalmente del texto de la escena (de sus líneas o de lo que se ve al empezar). Las anclas siguen el orden del texto: un plano nunca muestra algo que ocurre después de su ancla.
- Estado físico acumulado: entre planos se conservan posición, ropa, lesiones, objetos y quién está presente. Un corte cambia el encuadre, no la realidad.
- Peso editorial de 1 a 5 por plano: la frase o la acción principal pesa más que un detalle o una reacción rápida.
- Personajes visibles: ids exactos del reparto (o de una variante), como máximo 3 por plano.
- Nadie mira a la cámara ni le habla al espectador: los personajes actúan dentro de la escena.

TRUCOS DE ENCUBRIMIENTO (obligatorios, ocultan los fallos de la IA):
- Cuando un plano tiene movimiento complejo de manos o de cuerpo entero, córtalo antes de que el movimiento termine y pon a continuación un primer plano de reacción.
- El primer plano de reacción es el comodín: barato, tapa cualquier fallo del plano anterior y refuerza la reacción del ciclo.
- Para un salto de tiempo, usa un plano general de paisaje (cobertura) en vez de generar una transición.

PUESTA EN ESCENA Y CONTINUIDAD (lo más importante; un fallo aquí tira imágenes buenas a la basura):
- Antes de los planos decides "presentes": quién está físicamente en la escena desde el principio. Si alguien despierta, se levanta o habla más tarde, YA estaba ahí desde el primer plano (tirado, dormido, en un rincón).
- Nadie aparece de la nada ni desaparece por arte de magia. Si alguien llega, el plano en que entra lo dice en "entran"; si se va, el plano en que sale lo dice en "salen".
- "encuadre" de cada plano: "general" (se ve el lugar y a todos los presentes), "medio" (una o dos personas de cintura para arriba), "primer_plano" (una cara) o "detalle" (una mano, un objeto). Solo un encuadre cerrado deja fuera a alguien presente; un plano general muestra a TODOS los presentes.
- Si al empezar hay dos o más presentes, el PRIMER plano es "general" y los muestra a todos en su sitio: es el mapa de la escena.
- "personajes" son SOLO los que se ven en el encuadre. Quien está presente pero fuera de cuadro sigue en la escena.
- "estado" (EN INGLÉS) de cada plano: dónde está y qué hace en ese instante CADA persona presente, se vea o no ("Su Mei stands at the table on the left, checking a cloth bag; Lin Fan lies unconscious on the dirt floor near the stove"), y cómo están los objetos que importan (un cuenco roto sigue roto en el suelo). Nombra a cada presente por su nombre.
- "cambio" (EN INGLÉS, desde el segundo plano): qué es distinto respecto al plano anterior: quién se movió, a dónde, qué postura nueva, qué objeto cambió ("Lin Fan has tripped and is falling forward onto Su Mei, who was kneeling by the bed"). Si en el ancla ocurre una acción (cae, se levanta, empuja), la imagen muestra ese momento, no el anterior.
- Para que una acción entre dos personas sea posible, las dos están colocadas a su alcance desde el plano anterior (si él cae encima de ella, ella está en su camino).

FICHA DEL LUGAR (inventario cerrado): cada lugar tiene su ficha con todo lo que existe en él y dónde está. Esa ficha completa acompaña a cada imagen por su cuenta: en el prompt NO la copies; di desde dónde mira la cámara y qué parte del lugar se ve («facing the sea, the black rocks on the right, the palm grove behind her»), siempre de acuerdo con la ficha. No inventes elementos que la ficha no tiene ni muevas los que tiene. Si la historia cambia el lugar (encienden una hoguera, levantan un refugio), ese cambio va en "estado" y se mantiene en los planos siguientes. En un interior, la lluvia o la nieve solo se ven por la ventana o la puerta, nunca dentro.

LITERALIDAD: una figura sobre un sentimiento («le hervía la sangre») se filma como gesto o postura, nunca como efecto especial.

CADA "prompt" (EN INGLÉS):
- Empieza con "Scene with [nombre] ([media frase de identidad: pelo y ropa del momento])" por cada personaje visible, o "Scene without people:".
- Describe el encuadre (wide shot / medium shot / close-up / insert, igual que "encuadre"), desde dónde mira la cámara, dónde está cada visible en el lugar y a qué distancia de los muebles, la acción del instante del ancla y la luz.
- Da referencias de tamaño reales: "standing beside the table, the tabletop at her hip", "kneeling next to the low bed". La gente y los muebles comparten suelo y perspectiva; nadie es un gigante delante de un decorado diminuto.
- Personajes de lado, de tres cuartos o de espaldas: nunca mirando a cámara.
- Prohibido: naked, nude, explicit, sexual, genitals, nipples. Sin texto, letras ni carteles legibles.
"movimiento" (EN INGLÉS, solo en planos de acción): la acción breve y clara que hará el video, sin movimientos de cámara inventados.

Respondes SOLO JSON válido.`;

export function promptDesglose(datos, escenas, extra = '') {
  const u = datos.universo;
  return {
    sistema: SISTEMA_FOTOGRAFIA,
    mensaje: `${contextoEleccion(datos.formulario)}

${fichaVisual(u)}

DIRECCIÓN VISUAL DE LA SERIE: ${datos.biblia?.direccionVisual || ''}
ASPECTO DEL GÉNERO Y DE CADA SUBGÉNERO (obligatorio en los prompts; todos a la vez): ${direccionDeAspecto(datos.formulario)}
${esEcchi(datos.formulario) ? `FAN SERVICE (ecchi adulto): cuando la escena tiene un momento sugerente (está en su "accion" o en lo que se dice), dale al menos un plano que lo muestre con claridad: encuadre que realza la figura, ropa ajustada o mojada (siempre opaca: nunca transparente ni dejando ver el pecho a través), pose atractiva, ángulo sugerente. Las mujeres siempre se describen hermosas y con su vestuario ajustado. Sin desnudez ni partes íntimas, y sin palabras que el filtro bloquee.
` : ''}
RITMO DE MONTAJE: ${datos.biblia?.ritmoMontaje || ''}
Formato de imagen: ${datos.formulario.formato === '16:9' ? '16:9 horizontal' : '9:16 vertical: encuadres verticales, personajes centrados, poco aire lateral'}.

${escenasParaPrompt(u, escenas)}
${extra}
Devuelve JSON con EXACTAMENTE ${escenas.length} escenas, en el mismo orden:
{"escenas":[{"id":"${escenas[0].id}","presentes":["c1","c2"],"planos":[{"tipo":"accion | cobertura","encuadre":"general | medio | primer_plano | detalle","ancla":"palabras copiadas del texto","personajes":["c1"],"entran":[],"salen":[],"estado":"where every present person is and what they do at this instant, by name, plus key objects","cambio":"what changed since the previous shot (empty only in the first shot)","peso":3,"prompt":"Scene with …","movimiento":"… (solo acción)","sistema":"texto de la línea del Sistema que aparece sobre este plano, o vacío"}]}]}`,
    temperatura: 0.5,
  };
}

// ─── Revisión ───
const MAX_VISIBLES = 4;   // el servidor adjunta como mucho 4 fichas por imagen

function encuadreDe(valor) {
  const v = normalizar(valor).replace(/\s+/g, '_');
  if (/^(general|wide|plano_general|gran_plano)/.test(v)) return 'general';
  if (/^(medio|medium|plano_medio|americano)/.test(v)) return 'medio';
  if (/^(primer|close)/.test(v)) return 'primer_plano';
  if (/^(detalle|insert|detail)/.test(v)) return 'detalle';
  return '';
}

export function validarDesglose(json, escenas, universo) {
  const problemas = [];
  const ids = new Set([...universo.personajes.map(p => p.id), ...(universo.variantes || []).map(v => v.id)]);
  const lista = v => [...new Set((Array.isArray(v) ? v : []).map(String).filter(id => ids.has(id)))];
  const crudas = Array.isArray(json?.escenas) ? json.escenas : [];
  const resultado = {}, presentesDe = {};
  let accion = 0, total = 0;
  for (const escena of escenas) {
    const c = crudas.find(x => x?.id === escena.id);
    if (!c) { problemas.push(`falta el desglose de la escena ${escena.id}`); continue; }
    const presentes = lista(c.presentes);
    const planos = (Array.isArray(c.planos) ? c.planos : []).map(p => ({
      tipo: p?.tipo === 'accion' ? 'accion' : 'cobertura',
      encuadre: encuadreDe(p?.encuadre),
      ancla: String(p?.ancla || '').trim(),
      personajes: lista(p?.personajes).slice(0, MAX_VISIBLES),
      entran: lista(p?.entran),
      salen: lista(p?.salen),
      estado: String(p?.estado || '').trim(),
      cambio: String(p?.cambio || '').trim(),
      peso: Math.max(1, Math.min(5, Math.round(Number(p?.peso) || 2))),
      prompt: String(p?.prompt || '').trim(),
      movimiento: String(p?.movimiento || '').trim(),
      sistema: String(p?.sistema || '').trim(),
    }));
    const donde = i => `el plano ${i + 1} de la escena ${escena.id}`;
    if (planos.length < minimoPlanos(escena)) problemas.push(`la escena ${escena.id} tiene ${planos.length} planos y necesita al menos ${minimoPlanos(escena)}`);
    if (planos.length > maximoPlanos(escena)) problemas.push(`la escena ${escena.id} tiene demasiados planos (${planos.length}; máximo ${maximoPlanos(escena)})`);
    // Lo que se ve al empezar va primero: es el principio de la escena.
    const texto = normalizar(escena.accion + ' ' + textoEscena(escena));
    let desde = 0;
    // Quién está en la escena en cada momento.
    const actual = new Set(presentes);
    const algunaVez = new Set(presentes);
    planos.forEach((p, i) => {
      const ancla = normalizar(p.ancla);
      const valida = contarPalabras(p.ancla) >= 3;
      const pos = valida ? texto.indexOf(ancla, desde) : -1;
      if (pos >= 0) desde = pos;
      else if (valida && texto.includes(ancla)) problemas.push(`${donde(i)} retrocede respecto al orden del texto`);
      else problemas.push(`el ancla del plano ${i + 1} de la escena ${escena.id} no está copiada literalmente del texto`);
      if (p.prompt.length < 40) problemas.push(`${donde(i)} no tiene un prompt suficiente`);
      if (/looking at (?:the )?camera|looks at (?:the )?camera|faces the camera|addressing the viewer/i.test(p.prompt)) problemas.push(`en ${donde(i)} alguien mira a cámara`);
      if (p.tipo === 'accion' && !p.movimiento) problemas.push(`el plano de acción ${i + 1} de la escena ${escena.id} no dice qué movimiento hace el video`);
      if (!p.encuadre) problemas.push(`${donde(i)} no dice su encuadre (general, medio, primer_plano o detalle)`);

      // Continuidad de presencia.
      for (const id of p.entran) { actual.add(id); algunaVez.add(id); }
      p.presentes = [...actual];
      for (const id of p.personajes) if (!actual.has(id)) problemas.push(`${nombreDe(universo, id)} aparece en ${donde(i)} sin estar en la escena (debe estar en "presentes" o entrar en "entran")`);
      const fuera = p.presentes.filter(id => !p.personajes.includes(id));
      if (p.encuadre === 'general' && fuera.length && p.personajes.length < MAX_VISIBLES) problemas.push(`${donde(i)} es general y deja fuera a ${fuera.map(id => nombreDe(universo, id)).join(', ')}, que está en la escena; un plano general muestra a todos`);
      if (i === 0 && presentes.length >= 2 && p.encuadre !== 'general') problemas.push(`la escena ${escena.id} empieza con dos o más personas y su primer plano tiene que ser general, con todas en su sitio`);
      const estado = normalizar(p.estado);
      if (p.estado.length < 20) problemas.push(`${donde(i)} no describe en "estado" dónde está cada persona presente`);
      else {
        const omitidos = p.presentes.filter(id => !estado.includes(normalizar(nombreDe(universo, id))));
        if (omitidos.length) problemas.push(`el estado del plano ${i + 1} de la escena ${escena.id} no dice dónde está ${omitidos.map(id => nombreDe(universo, id)).join(', ')}`);
      }
      if (i > 0 && p.cambio.length < 15) problemas.push(`${donde(i)} no dice en "cambio" qué es distinto respecto al plano anterior`);
      for (const id of p.salen) actual.delete(id);
    });
    // Quien habla en la escena tiene que estar en ella en algún momento.
    const hablan = [...new Set(escena.lineas.filter(l => l.tipo !== 'sistema' && ids.has(l.personaje)).map(l => l.personaje))];
    const ausentes = hablan.filter(id => !algunaVez.has(id) && ![...algunaVez].some(v => (universo.variantes || []).find(x => x.id === v)?.madre === id));
    if (ausentes.length) problemas.push(`en la escena ${escena.id} habla ${ausentes.map(id => nombreDe(universo, id)).join(', ')} pero no está en "presentes" ni entra en ningún plano`);
    accion += planos.filter(p => p.tipo === 'accion').length;
    total += planos.length;
    resultado[escena.id] = planos;
    presentesDe[escena.id] = presentes;
  }
  if (total >= 6) {
    const parte = accion / total;
    if (parte < 0.55 || parte > 0.85) problemas.push(`la proporción de planos de acción es ${Math.round(parte * 100)} % y debe rondar el 70 %`);
  }
  return { problemas, resultado, presentes: presentesDe };
}

export const SISTEMA_ARTE = `Eres el DIRECTOR DE ARTE y de continuidad. Lees prompts de imagen YA ESCRITOS y los contrastas con su escenario y con el texto de la escena, para cazar fallos antes de que cuesten imágenes: atrezo imposible (un mueble que ese lugar no tiene), clima imposible (lluvia dentro de un interior), un personaje en un sitio en el que no puede estar, ropa o heridas que cambian sin motivo, alguien mirando a cámara.
CONTINUIDAD DE PLANO A PLANO (lo que más se rompe): alguien que desaparece sin haber salido o aparece sin haber entrado; alguien que cambia de sitio sin que el texto lo mueva (estaba en la mesa y salta a la cama); un objeto que se esfuma (un cuenco roto que ya no está en el suelo); un plano que repite la postura del anterior cuando su ancla dice que ocurre una acción (cae, se levanta, empuja); dos personas que tienen que tocarse y no están a su alcance.
No cambias la historia ni el encuadre que funciona. Solo corriges lo que está mal, y explicas por qué.
Respondes SOLO JSON válido.`;

export function promptRevision(datos, escenas) {
  const u = datos.universo;
  const nombres = ids => (ids || []).map(id => nombreDe(u, id)).join(', ') || 'nadie';
  const lista = escenas.map(e => `═══ ESCENA ${e.id} — escenario ${e.escenario} — presentes al empezar: ${nombres(e.presentes)}\nLo que se ve al empezar: ${e.accion}\nTexto: ${textoEscena(e)}\n${(e.planos || []).map((p, i) => `Plano ${i + 1} (${p.tipo}, ${NOMBRE_ENCUADRE[p.encuadre] || 'sin encuadre'}) ancla «${p.ancla}» · se ve: ${nombres(p.personajes)}${p.entran?.length ? ' · entran: ' + nombres(p.entran) : ''}${p.salen?.length ? ' · salen: ' + nombres(p.salen) : ''}\n  Estado: ${p.estado || '—'}\n  Cambio: ${p.cambio || '—'}\n  Prompt: ${p.prompt}`).join('\n')}`).join('\n\n');
  return {
    sistema: SISTEMA_ARTE,
    mensaje: `${fichaVisual(u)}

${lista}

Devuelve JSON: {"revisadas":["ids de las escenas que revisaste"],"correcciones":[{"escena":"e1","plano":1,"prompt":"prompt completo corregido en inglés","estado":"estado corregido en inglés (o vacío si estaba bien)","cambio":"cambio corregido en inglés (o vacío)","motivo":"qué estaba mal, en español"}]}
Si un plano está bien, no lo incluyas. "revisadas" lista TODAS las escenas que de verdad miraste.`,
    temperatura: 0.3,
  };
}

// ─── Proceso ───
async function pedirValidado(prompt, validar, { control, aviso, etiqueta }) {
  let comentario = '', ultimo = '';
  for (let intento = 0; intento < INTENTOS; intento++) {
    aviso?.(intento ? `${etiqueta}: intento ${intento + 1} de ${INTENTOS}…` : `${etiqueta}…`);
    const crudo = await pedirTexto({ ...prompt, mensaje: prompt.mensaje + comentario }, { control, aviso });
    let json;
    try { json = parsearJSON(crudo); } catch {
      ultimo = 'la respuesta no era un JSON válido';
      comentario = '\n\nREINTENTO: devuelve SOLO el JSON pedido.';
      continue;
    }
    const r = validar(json);
    if (!r.problemas.length) return r;
    ultimo = r.problemas.slice(0, 12).join('; ');
    comentario = `\n\nREINTENTO OBLIGATORIO: se rechazó porque ${ultimo}. Corrígelo y devuelve el desglose completo.`;
  }
  throw Object.assign(new Error(`${etiqueta}: el director no cumplió las reglas después de ${INTENTOS} intentos (${ultimo}). Lo ya guardado se conserva.`), { tipo: 'formato' });
}

export function escenasDelEpisodio(datos, numero) {
  return (datos.episodios?.[numero]?.bloques || []).flatMap(b => b.escenas);
}

// Agrupa escenas seguidas sin pasarse de escenas ni de planos por petición.
export function agrupar(escenas) {
  const grupos = [];
  let actual = [], planos = 0;
  for (const e of escenas) {
    const m = minimoPlanos(e);
    if (actual.length && (actual.length >= POR_LLAMADA || planos + m > PLANOS_POR_LLAMADA)) { grupos.push(actual); actual = []; planos = 0; }
    actual.push(e);
    planos += m;
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

// Desglosa las escenas que no lo tienen (o solo una, si se pide rehacerla).
export async function desglosar(datos, numero, { control, aviso, guardar, soloEscena, rehacerTodo, alAvanzar }) {
  // Proyectos antiguos: el director detalla los lugares antes de desglosar.
  await asegurarLugares(datos, { control, aviso, guardar });
  const todas = escenasDelEpisodio(datos, numero);
  const pendientes = soloEscena ? todas.filter(e => e.id === soloEscena) : rehacerTodo ? todas : todas.filter(e => !e.planos?.length);
  const informe = { revisadas: 0, correcciones: 0, sinRevisar: [] };
  const grupos = agrupar(pendientes);
  let hechas = 0, porRevisar = [];
  const revisarLo = async () => {
    const lote = porRevisar;
    porRevisar = [];
    try {
      const r = await revisar(datos, lote, { control, aviso, guardar });
      informe.revisadas += r.revisadas; informe.correcciones += r.correcciones; informe.sinRevisar.push(...r.sinRevisar);
    } catch (e) {
      if (e.detenido) throw e;
      informe.sinRevisar.push(...lote.map(g => g.id));
    }
    alAvanzar?.();
  };
  // Una escena sola también puede pasarse de tiempo: su desglose pide el
  // MÁXIMO de planos y cada plano trae estado, cambio y prompt largos, así
  // que la respuesta no cabe en el límite del servidor y repetirla igual
  // vuelve a fallar (fallo visto en una escena de 37 s). El reintento la
  // pide MÁS PEQUEÑA, como promete el mensaje de error: el mínimo de
  // planos y campos breves, que la validación sigue aceptando.
  const extraBreve = escena => `\n\nIMPORTANTE, RESPUESTA BREVE OBLIGATORIA: escribe EXACTAMENTE ${minimoPlanos(escena)} planos para esta escena (el mínimo, no más). Cada "estado" en una sola frase corta de máximo 25 palabras, cada "cambio" de máximo 15 palabras y cada "prompt" de máximo 40 palabras. Sin adornos: la respuesta tiene que ser corta para caber en el tiempo del servidor.`;
  const pedirUna = async escena => {
    try {
      return await pedirValidado(promptDesglose(datos, [escena]), j => validarDesglose(j, [escena], datos.universo), { control, aviso, etiqueta: `Desglose de la escena ${escena.id}` });
    } catch (e) {
      if (e.tipo !== 'tiempo') throw e;
      aviso?.(`La escena ${escena.id} tardó demasiado; la pido más pequeña…`);
      return await pedirValidado(promptDesglose(datos, [escena], extraBreve(escena)), j => validarDesglose(j, [escena], datos.universo), { control, aviso, etiqueta: `Desglose breve de la escena ${escena.id}` });
    }
  };
  for (const [g, grupo] of grupos.entries()) {
    const etiqueta = `Desglose de planos: escenas ${hechas + 1} a ${hechas + grupo.length} de ${pendientes.length}`;
    let resultado, presentes;
    try {
      ({ resultado, presentes } = await pedirValidado(promptDesglose(datos, grupo), j => validarDesglose(j, grupo, datos.universo), { control, aviso, etiqueta }));
    } catch (e) {
      // Si no cupo en el tiempo con varias escenas, se reintenta de una en una.
      if (e.tipo !== 'tiempo') throw e;
      if (grupo.length === 1) {
        aviso?.('Tardó demasiado; la pido más pequeña…');
        ({ resultado, presentes } = await pedirValidado(promptDesglose(datos, grupo, extraBreve(grupo[0])), j => validarDesglose(j, grupo, datos.universo), { control, aviso, etiqueta: `Desglose breve de la escena ${grupo[0].id}` }));
      } else {
        resultado = {}; presentes = {};
        for (const escena of grupo) {
          const r = await pedirUna(escena);
          Object.assign(resultado, r.resultado);
          Object.assign(presentes, r.presentes);
        }
      }
    }
    for (const escena of grupo) {
      // Un desglose nuevo sustituye al anterior; sus imágenes se conservan
      // aparte por si se quieren recuperar.
      if (escena.planos?.length) escena.planosAnteriores = escena.planos;
      escena.planos = resultado[escena.id].map((p, n) => ({ ...p, id: `${escena.id}-${n + 1}` }));
      escena.presentes = presentes[escena.id] || [];
    }
    hechas += grupo.length;
    await guardar?.();
    alAvanzar?.();
    // Revisión de puesta en escena cada 5 escenas (y al final lo que quede).
    porRevisar.push(...grupo);
    while (porRevisar.length >= REVISAR_CADA) {
      const resto = porRevisar.slice(REVISAR_CADA);
      porRevisar = porRevisar.slice(0, REVISAR_CADA);
      await revisarLo();
      porRevisar = resto;
    }
    if (g === grupos.length - 1 && porRevisar.length) await revisarLo();
  }
  return informe;
}

// El director de arte. Devuelve qué revisó de verdad.
export async function revisar(datos, escenas, { control, aviso, guardar }) {
  aviso?.('El director de arte revisa la puesta en escena…');
  const json = parsearJSON(await pedirTexto(promptRevision(datos, escenas), { control, aviso }));
  const revisadas = new Set((Array.isArray(json?.revisadas) ? json.revisadas : []).map(String));
  let correcciones = 0;
  for (const c of Array.isArray(json?.correcciones) ? json.correcciones : []) {
    const escena = escenas.find(e => e.id === String(c?.escena));
    const plano = escena?.planos?.[Number(c?.plano) - 1];
    const nuevo = String(c?.prompt || '').trim();
    const estado = String(c?.estado || '').trim();
    const cambio = String(c?.cambio || '').trim();
    const cambiaPrompt = nuevo.length >= 40 && nuevo !== plano?.prompt;
    const cambiaEstado = estado.length >= 20 && estado !== plano?.estado;
    const cambiaCambio = cambio.length >= 15 && cambio !== plano?.cambio;
    if (!plano || !(cambiaPrompt || cambiaEstado || cambiaCambio)) continue;
    plano.promptAnterior = plano.prompt;
    if (cambiaPrompt) plano.prompt = nuevo;
    if (cambiaEstado) plano.estado = estado;
    if (cambiaCambio) plano.cambio = cambio;
    plano.revision = String(c?.motivo || '').trim();
    // No se borra nada: lo ya generado queda marcado como obsoleto.
    if (plano.imagen) plano.imagenObsoleta = true;
    if (plano.video) plano.videoObsoleto = true;
    correcciones++;
  }
  for (const e of escenas) if (revisadas.has(e.id)) e.revisada = Date.now();
  await guardar?.();
  return { revisadas: escenas.filter(e => revisadas.has(e.id)).length, correcciones, sinRevisar: escenas.filter(e => !revisadas.has(e.id)).map(e => e.id) };
}
