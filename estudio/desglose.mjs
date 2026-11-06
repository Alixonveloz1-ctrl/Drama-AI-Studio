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
//
// REGLA DEL DUEÑO (2026-11-04): el texto es lo más barato de la cadena;
// las imágenes y los videos, lo caro. Ningún arreglo puede recortar el
// contexto ni las descripciones que alimentan a las imágenes para
// ahorrar texto o tiempo de servidor. Si una escena no cabe en una
// llamada, se parte en dos llamadas COMPLETAS; si un campo sale mal, se
// corrige SOLO ese campo. Se gasta texto, nunca contexto. (El antiguo
// «modo breve» con topes de palabras iba contra esta regla y producía
// desgloses incompletos que trababan la escena una y otra vez.)
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
- Cada plano lleva "ancla": palabras CONSECUTIVAS copiadas literalmente del texto de la escena. Si el ancla sale de una LÍNEA HABLADA (diálogo, pensamiento o Sistema), debe cubrir FRASES COMPLETAS de esa línea: empieza donde empieza una oración (al principio de la línea o justo tras un punto, una exclamación o una interrogación) y termina donde termina una oración (en su signo de cierre). NUNCA partas una oración por la mitad: si una oración es larga, el plano la lleva ENTERA, aunque pase de 14 palabras; si una línea tiene varias oraciones cortas, un plano puede llevar dos o tres seguidas. Esto es innegociable: la voz de ese plano dice el ancla entera, y una frase partida no cabe al montar la narración completa. Si el ancla sale de «lo que se ve al empezar» (la descripción, que no se habla), basta un fragmento consecutivo de 4 a 14 palabras. Las anclas siguen el orden del texto: un plano nunca muestra algo que ocurre después de su ancla.
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

// Las oraciones de un texto, cortando tras cada signo de cierre (con su
// comilla de cierre si la lleva). Sirve para juzgar las anclas: un ancla
// que sale de una línea hablada debe cubrir frases COMPLETAS, nunca
// partir una oración (decisión del dueño: al montar la narración
// completa, media frase no cabe en su plano).
export function frasesDelTexto(texto) {
  return String(texto || '').match(/[^.!?…]+[.!?…]+[»”"']*|[^.!?…]+$/g)?.map(f => f.trim()).filter(Boolean) || [];
}

// Todos los tramos de frases completas y consecutivas de una línea,
// normalizados: el conjunto contra el que se comprueba un ancla.
export function tramosDeFrases(linea) {
  const frases = frasesDelTexto(linea?.texto);
  const tramos = new Set();
  for (let a = 0; a < frases.length; a++) {
    let junto = '';
    for (let b = a; b < frases.length; b++) {
      junto = (junto + ' ' + frases[b]).trim();
      tramos.add(normalizar(junto));
    }
  }
  return tramos;
}

export function validarDesglose(json, escenas, universo) {
  const problemas = [];
  const ids = new Set([...universo.personajes.map(p => p.id), ...(universo.variantes || []).map(v => v.id)]);
  const lista = v => [...new Set((Array.isArray(v) ? v : []).map(String).filter(id => ids.has(id)))];
  const crudas = Array.isArray(json?.escenas) ? json.escenas : [];
  const resultado = {}, presentesDe = {};
  let accion = 0, total = 0;
  for (const escena of escenas) {
    let c = crudas.find(x => x?.id === escena.id);
    // Llamada de UNA sola escena (cada parte de una escena partida, o el
    // reintento de una en solitario): lo devuelto ES esa escena, aunque el
    // director la etiquete distinto («e1-parte1») o la mande en trozos
    // (visto en vivo: la primera parte se rechazó tres veces por la
    // etiqueta). Se adopta y la validación completa de abajo juzga su
    // calidad. En llamadas de varias escenas la etiqueta sigue estricta.
    if (!c && escenas.length === 1 && crudas.length) {
      c = { presentes: crudas[0]?.presentes, planos: crudas.flatMap(x => (Array.isArray(x?.planos) ? x.planos : [])) };
    }
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
    // Frases completas: los tramos válidos de cada línea hablada y el
    // texto de la descripción inicial (de ahí el ancla SÍ puede ser un
    // fragmento, porque no se habla).
    const tramosFrases = new Set(escena.lineas.flatMap(l => [...tramosDeFrases(l)]));
    const textoAccion = normalizar(escena.accion);
    const lineasNorm = escena.lineas.map(l => normalizar(l.texto));
    let desde = 0;
    // Quién está en la escena en cada momento.
    const actual = new Set(presentes);
    const algunaVez = new Set(presentes);
    planos.forEach((p, i) => {
      const ancla = normalizar(p.ancla);
      // Una frase completa de una línea vale como ancla aunque tenga
      // menos de 3 palabras («¡Suéltala!», «Imposible.»): es literal y
      // es justo lo que la regla de frases completas pide.
      const valida = contarPalabras(p.ancla) >= 3 || tramosFrases.has(ancla);
      const pos = valida ? texto.indexOf(ancla, desde) : -1;
      if (pos >= 0) desde = pos;
      else if (valida && texto.includes(ancla)) problemas.push(`${donde(i)} retrocede respecto al orden del texto`);
      else problemas.push(`el ancla del plano ${i + 1} de la escena ${escena.id} no está copiada literalmente del texto`);
      // Si el ancla está dentro de una línea hablada pero no cubre
      // frases completas de ella, parte una oración: se rechaza (la voz
      // del plano dice el ancla entera y la narración completa no cabe).
      // Las anclas de la descripción inicial quedan exentas: no se hablan.
      if (valida && pos >= 0 && ancla && !tramosFrases.has(ancla) && !textoAccion.includes(ancla) && lineasNorm.some(t => t.includes(ancla))) {
        problemas.push(`el ancla del plano ${i + 1} de la escena ${escena.id} parte una frase: debe cubrir frases completas de su línea`);
      }
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
// Problemas que se arreglan reescribiendo UN campo de UN plano, sin tocar
// el resto del desglose. Todo lo demás (anclas, orden, número de planos,
// presencias) es estructural y se resuelve reintentando con la explicación.
const RE_CAMPO = [
  { campo: 'ancla', re: /^el ancla del plano (\d+) de la escena (\S+) parte una frase/ },
  { campo: 'estado', re: /^el estado del plano (\d+) de la escena (\S+) no dice dónde está/ },
  { campo: 'estado', re: /^el plano (\d+) de la escena (\S+) no describe en "estado"/ },
  { campo: 'cambio', re: /^el plano (\d+) de la escena (\S+) no dice en "cambio"/ },
  { campo: 'prompt', re: /^el plano (\d+) de la escena (\S+) no tiene un prompt suficiente/ },
  { campo: 'movimiento', re: /^el plano de acción (\d+) de la escena (\S+) no dice qué movimiento/ },
  { campo: 'encuadre', re: /^el plano (\d+) de la escena (\S+) no dice su encuadre/ },
];

// Clasifica los problemas de una validación: devuelve null si hay alguno
// estructural; si no, la lista de fallos de campo {escena, plano, campo, texto}.
export function fallosDeCampo(problemas) {
  const fallos = [];
  for (const p of problemas) {
    const hit = RE_CAMPO.map(r => ({ campo: r.campo, m: p.match(r.re) })).find(r => r.m);
    if (!hit) return null;
    fallos.push({ escena: hit.m[2], plano: Number(hit.m[1]), campo: hit.campo, texto: p });
  }
  return fallos.length ? fallos : null;
}

export const SISTEMA_CORRECTOR = `Eres el CORRECTOR DE CONTINUIDAD de un drama corto asiático. Te doy un desglose de planos YA HECHO y SOLO los planos que el revisor automático señaló, cada uno con el motivo exacto del señalamiento. Tu trabajo es reescribir ÚNICAMENTE los campos señalados de esos planos, completos y en inglés, respetando el texto de la escena, la posición de cada persona en ese instante y la continuidad con el plano anterior. No tocas ningún otro plano, no cambias la historia y no acortas nada: el campo corregido lleva TODO el detalle que debía llevar.
Respondes SOLO JSON válido.`;

export function promptCorreccion(datos, escenas, candidato, fallos) {
  const u = datos.universo;
  const nombre = id => nombreDe(u, id);
  const porEscena = new Map();
  for (const f of fallos) {
    if (!porEscena.has(f.escena)) porEscena.set(f.escena, []);
    porEscena.get(f.escena).push(f);
  }
  const bloques = [...porEscena.entries()].map(([idEscena, lista]) => {
    const escena = escenas.find(e => e.id === idEscena);
    const planos = candidato[idEscena] || [];
    const detalle = lista.map(f => {
      const p = planos[f.plano - 1] || {};
      const anterior = f.plano > 1 ? planos[f.plano - 2] : null;
      return `Plano ${f.plano} — SEÑALADO: ${f.texto}
  Presentes en este plano (si corriges el "estado", debe decir dónde está CADA uno, por su nombre): ${(p.presentes || []).map(nombre).join(', ') || 'nadie'}
  Ancla: «${p.ancla || ''}» · Tipo: ${p.tipo || ''} · Encuadre actual: ${p.encuadre || 'sin decir'}
  Estado actual: ${p.estado || '—'}
  Cambio actual: ${p.cambio || '—'}
  Prompt actual: ${p.prompt || '—'}
  Movimiento actual: ${p.movimiento || '—'}${anterior ? `\n  Estado del plano anterior (continuidad): ${anterior.estado || '—'}` : ''}`;
    }).join('\n');
    return `═══ ESCENA ${idEscena} — escenario ${escena?.escenario || ''} — Lo que se ve al empezar: ${escena?.accion || ''}
Texto de la escena: ${escena ? textoEscena(escena) : ''}
${detalle}`;
  }).join('\n\n');
  return {
    sistema: SISTEMA_CORRECTOR,
    mensaje: `CORRECCIÓN DIRIGIDA de campos sueltos de un desglose ya hecho. No reescribas el desglose: corrige SOLO lo señalado.

${fichaVisual(u)}

${bloques}

Devuelve JSON: {"correcciones":[{"escena":"${fallos[0].escena}","plano":1,"ancla":"ancla corregida (solo si se señaló que parte una frase: las frases COMPLETAS de su línea que cubren el fragmento señalado, copiadas literalmente de la línea, ni una palabra más ni una menos; si no se señaló, vacío)","estado":"estado corregido completo en inglés (solo si el campo señalado es el estado; si no, vacío)","cambio":"cambio corregido completo en inglés (solo si se señaló; si no, vacío)","prompt":"prompt corregido completo en inglés (solo si se señaló; si no, vacío)","movimiento":"movimiento corregido en inglés (solo en planos de acción y solo si se señaló; si no, vacío)","encuadre":"general | medio | primer_plano | detalle (solo si se señaló; si no, vacío)"}]}
Una corrección por plano señalado, con su número de plano. Los campos no señalados van vacíos y NO se tocan.`,
    temperatura: 0.3,
  };
}

// Pide las correcciones de los campos señalados y las aplica sobre los
// planos normalizados de la validación. Devuelve cuántos planos tocó.
async function corregirCampos(datos, escenas, r, fallos, { control, aviso }) {
  const json = parsearJSON(await pedirTexto(promptCorreccion(datos, escenas, r.resultado, fallos), { control, aviso }));
  let tocados = 0;
  for (const c of Array.isArray(json?.correcciones) ? json.correcciones : []) {
    const plano = r.resultado[String(c?.escena)]?.[Number(c?.plano) - 1];
    if (!plano) continue;
    const estado = String(c?.estado || '').trim();
    const cambio = String(c?.cambio || '').trim();
    const prompt = String(c?.prompt || '').trim();
    const movimiento = String(c?.movimiento || '').trim();
    const anclaNueva = String(c?.ancla || '').trim();
    const encuadre = encuadreDe(c?.encuadre);
    let toco = false;
    if (contarPalabras(anclaNueva) >= 3 && anclaNueva !== plano.ancla) { plano.ancla = anclaNueva; toco = true; }
    if (estado.length >= 20 && estado !== plano.estado) { plano.estado = estado; toco = true; }
    if (cambio.length >= 15 && cambio !== plano.cambio) { plano.cambio = cambio; toco = true; }
    if (prompt.length >= 40 && prompt !== plano.prompt) { plano.prompt = prompt; toco = true; }
    if (movimiento && plano.tipo === 'accion' && movimiento !== plano.movimiento) { plano.movimiento = movimiento; toco = true; }
    if (encuadre && encuadre !== plano.encuadre) { plano.encuadre = encuadre; toco = true; }
    if (toco) tocados++;
  }
  return tocados;
}

// Pide un desglose y lo valida. Si el único fallo es de campos sueltos
// (un estado que olvida a alguien, un cambio corto…), NO se reescribe el
// desglose entero —al reescribirse rompe otros planos que estaban bien—:
// se corrigen solo esos campos con una llamada enfocada (corrección
// dirigida). Lo estructural sí se reintenta con la explicación, como antes.
async function pedirConCorreccion(datos, escenas, { control, aviso, etiqueta, extra = '', validar = null }) {
  const prompt = promptDesglose(datos, escenas, extra);
  const validarFn = validar || (j => validarDesglose(j, escenas, datos.universo));
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
    let r = validarFn(json);
    for (let pasada = 0; pasada < 2 && r.problemas.length; pasada++) {
      const fallos = fallosDeCampo(r.problemas);
      if (!fallos) break;
      aviso?.(`${etiqueta}: corrijo solo ${fallos.length === 1 ? 'el campo señalado' : `los ${fallos.length} campos señalados`}…`);
      const tocados = await corregirCampos(datos, escenas, r, fallos, { control, aviso });
      if (!tocados) break;
      r = validarFn({ escenas: escenas.map(e => ({ id: e.id, presentes: r.presentes[e.id] || [], planos: r.resultado[e.id] || [] })) });
    }
    if (!r.problemas.length) return r;
    ultimo = r.problemas.slice(0, 12).join('; ');
    comentario = `\n\nREINTENTO OBLIGATORIO: se rechazó porque ${ultimo}. Corrígelo y devuelve el desglose completo.`;
  }
  throw Object.assign(new Error(`${etiqueta}: el director no cumplió las reglas después de ${INTENTOS} intentos (${ultimo}). Lo ya guardado se conserva.`), { tipo: 'formato' });
}

// ─── Escena partida en dos llamadas ───
// Una escena larga no cabe en UNA respuesta dentro del límite de tiempo
// del servidor. Partirla por la mitad de su texto y desglosarla en dos
// llamadas completas cuesta una llamada de texto más (lo barato) y no
// recorta nada de lo que alimenta a las imágenes (lo caro).

// Parte el texto de una escena en dos mitades de peso parecido (por
// líneas completas). Devuelve null si no se puede partir.
export function partirEscena(escena) {
  if (!Array.isArray(escena.lineas) || escena.lineas.length < 2) return null;
  const pesos = escena.lineas.map(l => contarPalabras(l.texto));
  const total = pesos.reduce((a, b) => a + b, 0);
  if (total < 24) return null;
  let corte = 1, acumulado = pesos[0];
  while (corte < escena.lineas.length - 1 && acumulado + pesos[corte] <= total / 2) { acumulado += pesos[corte]; corte++; }
  return [
    { ...escena, lineas: escena.lineas.slice(0, corte) },
    { ...escena, lineas: escena.lineas.slice(corte) },
  ];
}

async function desgloseEnDosPartes(datos, escena, { control, aviso }) {
  const partes = partirEscena(escena);
  if (!partes) throw Object.assign(new Error(`Desglose de la escena ${escena.id}: tardó demasiado y su texto no se pudo partir en dos. Lo ya guardado se conserva.`), { tipo: 'tiempo' });
  aviso?.(`La escena ${escena.id} es larga: la desgloso en dos partes completas, sin recortar nada…`);
  const [primera, segunda] = partes;
  const minTotal = minimoPlanos(escena), maxTotal = maximoPlanos(escena);
  const extra1 = `\n\nESTA ES LA PRIMERA PARTE de la escena ${escena.id}: el texto de arriba es solo su primera mitad; la escena continúa después. Desglosa SOLO este texto, con las descripciones completas de siempre, sin acortar nada. La escena completa necesita entre ${minTotal} y ${maxTotal} planos entre las dos partes: escribe para esta parte entre ${Math.max(1, Math.ceil(minTotal / 2))} y ${Math.max(2, Math.ceil(maxTotal / 2))} planos. El "id" de la escena en tu JSON es exactamente "${escena.id}", sin añadidos ni sufijos: es la misma escena de siempre, solo cubres una parte de su texto.`;
  // El tope de cada parte se comprueba también al validar: el mínimo y el
  // máximo de cada mitad por separado dejan pasar sumas que la escena
  // completa no admite (visto en pruebas: 7 + 7 contra un máximo de 13).
  const tope1 = Math.ceil(maxTotal / 2);
  const validar1 = j => {
    const r = validarDesglose(j, [primera], datos.universo);
    const n = r.resultado[escena.id]?.length || 0;
    if (n > tope1) r.problemas.push(`esta primera parte trae ${n} planos y su tope es ${tope1}: la escena completa admite como máximo ${maxTotal} entre las dos partes`);
    return r;
  };
  const r1 = await pedirConCorreccion(datos, [primera], { control, aviso, etiqueta: `Desglose de la escena ${escena.id} (primera parte)`, extra: extra1, validar: validar1 });
  const planos1 = r1.resultado[escena.id] || [];
  const presentes1 = r1.presentes[escena.id] || [];
  // Quién sigue físicamente en la escena al empezar la segunda parte.
  const quedan = new Set(presentes1);
  for (const p of planos1) { for (const id of p.entran || []) quedan.add(id); for (const id of p.salen || []) quedan.delete(id); }
  const nombre = id => nombreDe(datos.universo, id);
  const resumen1 = planos1.map((p, i) => `Plano ${i + 1} (${p.tipo}, ${NOMBRE_ENCUADRE[p.encuadre] || 'sin encuadre'}) ancla «${p.ancla}» — Estado: ${p.estado}`).join('\n');
  const extra2 = `\n\nESTA ES LA SEGUNDA PARTE de la escena ${escena.id}: el texto de arriba es solo su segunda mitad; la primera mitad ya ocurrió y ya se desglosó así (NO la repitas):\n${resumen1}\nAl empezar esta segunda parte están presentes: ${[...quedan].map(nombre).join(', ') || 'nadie'}. Tu campo "presentes" debe ser exactamente esa lista, con sus ids: ${[...quedan].join(', ') || '—'}.\nEl último estado de la primera parte: ${planos1[planos1.length - 1]?.estado || ''}\nLas anclas salen SOLO de las líneas de esta segunda parte (no de «lo que se ve al empezar», que ya pasó). El PRIMER plano de esta parte SÍ lleva "cambio": qué cambió respecto al último plano de la primera parte. La escena completa necesita entre ${minTotal} y ${maxTotal} planos entre las dos partes y ya hay ${planos1.length}: escribe entre ${Math.max(1, minTotal - planos1.length)} y ${Math.max(1, maxTotal - planos1.length)} planos, con las descripciones completas de siempre. El "id" de la escena en tu JSON es exactamente "${escena.id}", sin añadidos ni sufijos: es la misma escena de siempre, solo cubres su segunda parte.`;
  const validar2 = j => {
    const r = validarDesglose(j, [segunda], datos.universo);
    // La segunda parte continúa una escena ya abierta: su primer plano
    // no tiene que ser el general que abre la escena (ese fue el primero
    // de la primera parte). Todo lo demás se exige igual.
    r.problemas = r.problemas.filter(p => !p.includes('empieza con dos o más personas'));
    const n2 = r.resultado[escena.id]?.length || 0;
    if (planos1.length + n2 > maxTotal) r.problemas.push(`entre las dos partes sumarían ${planos1.length + n2} planos y la escena admite como máximo ${maxTotal}: escribe menos planos en esta parte`);
    if (planos1.length + n2 < minTotal) r.problemas.push(`entre las dos partes sumarían solo ${planos1.length + n2} planos y la escena necesita al menos ${minTotal}: escribe más planos en esta parte`);
    return r;
  };
  const r2 = await pedirConCorreccion(datos, [segunda], { control, aviso, etiqueta: `Desglose de la escena ${escena.id} (segunda parte)`, extra: extra2, validar: validar2 });
  // Unión y validación de la escena COMPLETA, con todas sus reglas.
  let r = validarDesglose({ escenas: [{ id: escena.id, presentes: presentes1, planos: [...planos1, ...(r2.resultado[escena.id] || [])] }] }, [escena], datos.universo);
  if (r.problemas.length && fallosDeCampo(r.problemas)) {
    await corregirCampos(datos, [escena], r, fallosDeCampo(r.problemas), { control, aviso });
    r = validarDesglose({ escenas: [{ id: escena.id, presentes: r.presentes[escena.id] || [], planos: r.resultado[escena.id] || [] }] }, [escena], datos.universo);
  }
  if (r.problemas.length) throw Object.assign(new Error(`Desglose de la escena ${escena.id}: al unir las dos partes quedó un problema (${r.problemas.slice(0, 12).join('; ')}). Lo ya guardado se conserva.`), { tipo: 'formato' });
  return r;
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
  const pedirUna = async escena => {
    try {
      return await pedirConCorreccion(datos, [escena], { control, aviso, etiqueta: `Desglose de la escena ${escena.id}` });
    } catch (e) {
      if (e.tipo !== 'tiempo') throw e;
      // No cupo en el tiempo: se parte en dos llamadas completas (regla
      // del dueño: gastar texto, nunca recortar contexto).
      return await desgloseEnDosPartes(datos, escena, { control, aviso });
    }
  };
  for (const [g, grupo] of grupos.entries()) {
    const etiqueta = `Desglose de planos: escenas ${hechas + 1} a ${hechas + grupo.length} de ${pendientes.length}`;
    let resultado, presentes;
    try {
      ({ resultado, presentes } = await pedirConCorreccion(datos, grupo, { control, aviso, etiqueta }));
    } catch (e) {
      // Si no cupo en el tiempo con varias escenas, se reintenta de una en una.
      if (e.tipo !== 'tiempo') throw e;
      resultado = {}; presentes = {};
      for (const escena of grupo) {
        const r = await pedirUna(escena);
        Object.assign(resultado, r.resultado);
        Object.assign(presentes, r.presentes);
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
    // No se borra nada aquí: lo ya generado queda marcado como
    // obsoleto. El video marcado se descarta al pintar Escenas (ya
    // no sirve: su imagen hay que regenerarla y el montaje lo excluye).
    if (plano.imagen) plano.imagenObsoleta = true;
    if (plano.video) plano.videoObsoleto = true;
    correcciones++;
  }
  for (const e of escenas) if (revisadas.has(e.id)) e.revisada = Date.now();
  await guardar?.();
  return { revisadas: escenas.filter(e => revisadas.has(e.id)).length, correcciones, sinRevisar: escenas.filter(e => !revisadas.has(e.id)).map(e => e.id) };
}
