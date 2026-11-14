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

// ─── Memoria de equipo (continuidad de objetos entre escenas) ───
// Los lugares tienen inventario cerrado, pero nadie llevaba la cuenta de
// lo que cada PERSONAJE trae encima a lo largo de la historia: una lanza
// ganada en una escena no existía para el director de una escena posterior,
// que la reinventaba (fallo real visto por el dueño en «La Balsa», escena
// 14: el diálogo decía «arpón», Leo ya tenía una lanza metálica dada por
// el Sistema y la foto salió con un palo de madera, con una nota del
// revisor que justificaba el invento). Esta memoria se construye leyendo
// el guion EN ORDEN —solo texto, lo barato— y viaja con cada llamada de
// desglose, de corrección de campos y de revisión.
export const SISTEMA_EQUIPO = `Eres el encargado de la CONTINUIDAD DE EQUIPO de un drama corto. Lees el guion EN ORDEN y llevas la lista de los objetos importantes que cada personaje TRAE ENCIMA: qué gana, qué pierde y qué se transforma, escena por escena.
- Solo objetos que el personaje lleva consigo o usa con las manos y que pueden volver a aparecer: un arma, una herramienta, una llave, un objeto clave de la historia. NO ropa (la ropa se registra aparte, en "vestuario"), NO muebles ni cosas del lugar (eso es el inventario del escenario), NO lo que se consume en el momento (una comida que se come), salvo que el texto lo mantenga en su poder.
- "descripcion" (EN INGLÉS): cómo debe dibujarse ese objeto SIEMPRE — material, forma, tamaño y color, en una frase completa y concreta. Esa frase se copiará palabra por palabra en los prompts de imagen: escríbela una sola vez y bien. Si el objeto ya está en la lista que te doy, NO lo registres otra vez ni cambies su descripción.
- "lleva": el personaje ya trae el objeto desde el principio (su ficha o la primera escena lo muestran como suyo). "gana": el texto de la escena se lo entrega, lo fabrica, lo encuentra o el Sistema se lo da. "pierde": lo pierde, se lo quitan, se rompe o lo deja atrás para siempre. "reemplaza": un objeto nuevo sustituye a uno que ya traía (una mejora, un intercambio): nombra el sustituido en "reemplazaA" y describe el nuevo; el viejo deja de existir.
- TAMBIÉN llevas el VESTUARIO: lo que cada personaje LLEVA PUESTO. LA FICHA MANDA: el atuendo base de cada personaje es el que SU FICHA describe (arriba, en PERSONAJES, te doy la descripción de cada uno), copiado fielmente: prenda y color tal como la ficha los escribe. Ese atuendo se registra UNA vez, desde la primera escena en la que el personaje aparece. Para eso están la ficha y su imagen de referencia: la ropa nace de ahí, no del guion.
- El texto de las escenas NO crea ni cambia el atuendo base: las palabras sueltas de ropa en la narración o los diálogos («su camisa», «la blusa», «la ropa mojada») son solo cómo el texto habla de él, NO un hecho de vestuario, y jamás redefinen lo que el personaje lleva puesto.
- UN evento nuevo SOLO cuando una escena NARRA como hecho que el personaje se viste de otra manera: se cambia de ropa, le dan o le fabrican ropa nueva, se disfraza, amanece con otro atuendo por la historia. Sin ese hecho narrado NO hay evento nuevo: la ropa no se mueve sola.
- "descripcion" del vestuario (EN INGLÉS): la prenda y su COLOR exactos, con el detalle que la dibuja siempre igual (corte, largo, material), en una frase completa y concreta. Esa frase se copiará palabra por palabra en los prompts: el color registrado es el color de ese atuendo para toda la serie, salvo un cambio narrado de la historia. Si la ficha no nombra el color, NO lo inventes desde las palabras sueltas del guion: registra la prenda tal como la ficha la describe. Mojada, sucia o rota NO es otro atuendo: es el estado de la misma ropa y no se registra.
Respondes SOLO JSON válido.`;

export function promptEquipo(datos, escenas, objetos, atuendos = {}) {
  const u = datos.universo;
  const nombres = Object.fromEntries(u.personajes.map(p => [p.id, p.nombre]));
  const lista = escenas.map(e => {
    const lineas = e.lineas.map(l => `${l.tipo === 'sistema' ? 'SISTEMA' : (nombres[l.personaje] || l.nombre || l.personaje)}${l.tipo === 'pensamiento' ? ' (piensa)' : ''}: ${l.texto}`).join('\n');
    return `═══ ESCENA ${e.id} — «${e.titulo}»\nLo que se ve al empezar: ${e.accion}\n${lineas}`;
  }).join('\n\n');
  const actual = formatearEquipo(u, objetos) || 'Nadie trae nada registrado todavía.';
  const vest = formatearVestuario(u, atuendos) || 'Nadie tiene vestuario registrado todavía.';
  return {
    sistema: SISTEMA_EQUIPO,
    mensaje: `PERSONAJES:\n${u.personajes.map(p => `- ${p.id} = ${p.nombre}: ${p.appearance}`).join('\n')}

EQUIPO REGISTRADO HASTA AHORA (lo que cada personaje ya trae al empezar estas escenas):
${actual}

VESTUARIO REGISTRADO HASTA AHORA (lo que cada personaje ya lleva puesto al empezar estas escenas):
${vest}

ESCENAS NUEVAS, en orden:
${lista}

Devuelve UN SOLO objeto con los cambios de equipo y los de vestuario que ocurren en ESTAS escenas, en el orden en que ocurren: {"cambios":[{"escena":"${escenas[0].id}","personaje":"c1","accion":"lleva | gana | pierde | reemplaza","objeto":"nombre corto del objeto","descripcion":"exact English visual description (solo en lleva, gana y reemplaza)","reemplazaA":"nombre del objeto sustituido (solo en reemplaza)"}],"vestuario":[{"escena":"${escenas[0].id}","personaje":"c1","descripcion":"exact English outfit description: garment and colour (el de su FICHA, la primera vez que aparece; uno nuevo solo cuando una escena narra que se viste de otra manera)"}]}
Si en una escena nadie gana, pierde ni reemplaza nada, de esa escena no devuelvas nada de "cambios"; si la ropa de nadie se establece ni cambia en estas escenas, "vestuario" va vacío.`,
    temperatura: 0.3,
  };
}

function formatearEquipo(u, objetos, orden = null, hastaIdx = Infinity) {
  const lineas = [];
  for (const p of u.personajes) {
    for (const o of objetos?.[p.id] || []) {
      if (orden && (orden.get(o.desde) ?? Infinity) > hastaIdx) continue;
      lineas.push(`- ${p.nombre} (${p.id}) trae «${o.objeto}»: "${o.descripcion}" (desde la escena ${o.desde})`);
    }
  }
  return lineas.join('\n');
}

// El episodio que contiene una escena, con el orden de sus escenas.
export function episodioDeEscena(datos, idEscena) {
  for (const [numero, ep] of Object.entries(datos.episodios || {})) {
    const lista = (ep?.bloques || []).flatMap(b => b.escenas || []);
    const idx = lista.findIndex(e => e.id === idEscena);
    if (idx >= 0) return { numero, ep, orden: new Map(lista.map((e, i) => [e.id, i])) };
  }
  return null;
}

// El bloque de equipo que acompaña a las llamadas del desglose, de la
// corrección y de la revisión: solo los objetos que el personaje ya trae
// cuando empieza la ÚLTIMA escena del lote (cada uno dice desde cuándo).
export function bloqueEquipo(datos, escenas) {
  if (!escenas?.length) return '';
  const hallado = episodioDeEscena(datos, escenas[0].id);
  if (!hallado?.ep?.equipo?.objetos) return '';
  const hastaIdx = hallado.orden.get(escenas[escenas.length - 1].id) ?? Infinity;
  const lista = formatearEquipo(datos.universo, hallado.ep.equipo.objetos, hallado.orden, hastaIdx);
  if (!lista) return '';
  return `\n\nEQUIPO QUE CADA PERSONAJE YA TRAE (memoria de la historia: lo que ganó o lleva desde antes, con su descripción EXACTA en inglés y desde qué escena lo trae):\n${lista}`;
}

// El vestuario registrado de un personaje a una altura del guion: el
// último tramo cuyo «desde» no pasa de esa escena.
function formatearVestuario(u, atuendos, orden = null, hastaIdx = Infinity) {
  const lineas = [];
  for (const p of u.personajes) {
    const tramos = (atuendos?.[p.id] || []).filter(t => !orden || (orden.get(t.desde) ?? Infinity) <= hastaIdx);
    const vigente = tramos[tramos.length - 1];
    if (vigente) lineas.push(`- ${p.nombre} (${p.id}) viste: "${vigente.descripcion}" (desde la escena ${vigente.desde})`);
  }
  return lineas.join('\n');
}

// Aplica los eventos de vestuario de una lectura del guion. La ropa de
// un personaje queda CONGELADA en la descripción registrada (prenda y
// color): solo un evento nuevo —la historia lo viste de otra manera—
// abre otro tramo. Lo pidió el dueño el 2026-11-13: el color del
// vestido de un personaje cambiaba de escena en escena porque cada
// desglose lo reescribía con palabras distintas y regenerar no lo
// arreglaba (la imagen obedece al texto).
export function aplicarCambiosVestuario(atuendos, eventos, orden, universo) {
  const ids = new Set(universo.personajes.map(p => p.id));
  const madre = id => (universo.variantes || []).find(v => v.id === id)?.madre || id;
  const lista = (Array.isArray(eventos) ? [...eventos] : [])
    .filter(c => c && orden.has(String(c?.escena || '')) && ids.has(madre(String(c?.personaje || ''))))
    .sort((a, b) => orden.get(String(a.escena)) - orden.get(String(b.escena)));
  for (const c of lista) {
    const pid = madre(String(c.personaje));
    const descripcion = String(c.descripcion || '').replace(/\s+/g, ' ').trim();
    if (descripcion.length < 20) continue;
    const tramos = atuendos[pid] ||= [];
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && normalizar(ultimo.descripcion) === normalizar(descripcion)) continue;   // el mismo atuendo: no es un cambio
    tramos.push({ descripcion, desde: String(c.escena) });
  }
  return atuendos;
}

// El bloque de vestuario que acompaña a las llamadas del desglose, de
// la corrección y de la revisión: el atuendo vigente de cada personaje
// cuando empieza la ÚLTIMA escena del lote, con su descripción EXACTA.
export function bloqueVestuario(datos, escenas) {
  if (!escenas?.length) return '';
  const hallado = episodioDeEscena(datos, escenas[0].id);
  if (!hallado?.ep?.vestuario?.atuendos) return '';
  const hastaIdx = hallado.orden.get(escenas[escenas.length - 1].id) ?? Infinity;
  const lista = formatearVestuario(datos.universo, hallado.ep.vestuario.atuendos, hallado.orden, hastaIdx);
  if (!lista) return '';
  return `\n\nVESTUARIO FIJADO DE CADA PERSONAJE (memoria de la historia: la prenda y el COLOR exactos que lleva cada uno a esta altura, y desde qué escena):\n${lista}`;
}

// Huella del guion de un episodio: si el texto cambia, la memoria de
// equipo se reconstruye (solo texto; lo caro son las imágenes).
export function huellaGuion(escenas, universo = null) {
  // Las fichas también alimentan la memoria (el vestuario nace de la
  // ficha): si una ficha cambia, la huella cambia y la memoria se
  // reconstruye, igual que si cambia el guion.
  const fichas = (universo?.personajes || []).map(p => `${p.id}|${p.aspecto || ''}|${p.appearance || ''}`).join('\n');
  const texto = escenas.map(e => `${e.id}|${e.accion}|${textoEscena(e)}`).join('\n') + '\n==\n' + fichas;
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (Math.imul(h, 31) + texto.charCodeAt(i)) | 0;
  return `${escenas.length}:${texto.length}:${(h >>> 0).toString(36)}`;
}

// Aplica los cambios de equipo de una lectura del guion sobre la lista.
// La descripción de un objeto, una vez registrada, NO cambia: solo un
// «reemplaza» expreso la sustituye (una mejora del Sistema, un cambio).
export function aplicarCambiosEquipo(objetos, cambios, orden, universo) {
  const ids = new Set(universo.personajes.map(p => p.id));
  const madre = id => (universo.variantes || []).find(v => v.id === id)?.madre || id;
  const clave = s => normalizar(s).replace(/^(la|el|los|las|su|un|una|the|a|an)\s+/, '').trim();
  const lista = (Array.isArray(cambios) ? [...cambios] : [])
    .filter(c => c && orden.has(String(c?.escena || '')) && ids.has(madre(String(c?.personaje || ''))))
    .sort((a, b) => orden.get(String(a.escena)) - orden.get(String(b.escena)));
  for (const c of lista) {
    const pid = madre(String(c.personaje));
    const accion = normalizar(c.accion);
    const objeto = String(c.objeto || '').replace(/\s+/g, ' ').trim();
    if (!objeto) continue;
    const actual = objetos[pid] ||= [];
    const quitar = nombre => {
      const j = actual.findIndex(o => clave(o.objeto) === clave(nombre));
      if (j >= 0) actual.splice(j, 1);
    };
    if (accion === 'pierde') { quitar(objeto); continue; }
    if (!['lleva', 'gana', 'reemplaza'].includes(accion)) continue;
    const descripcion = String(c.descripcion || '').replace(/\s+/g, ' ').trim();
    if (descripcion.length < 20) continue;
    if (accion === 'reemplaza') quitar(String(c.reemplazaA || ''));
    if (actual.some(o => clave(o.objeto) === clave(objeto))) {
      if (accion !== 'reemplaza') continue;   // ya registrado: su descripción manda
      quitar(objeto);
    }
    actual.push({ objeto, descripcion, desde: String(c.escena) });
  }
  return objetos;
}

// Construye (o reconstruye, si el guion cambió) la memoria de equipo del
// episodio leyendo su guion en orden. Como asegurarLugares: se llama
// antes de desglosar y el resultado queda guardado en el episodio.
export async function asegurarEquipo(datos, numero, { control, aviso, guardar } = {}) {
  const ep = datos.episodios?.[numero];
  if (!ep) return null;
  const escenas = escenasDelEpisodio(datos, numero);
  if (!escenas.length) return null;
  const huella = huellaGuion(escenas, datos.universo);
  if (ep.equipo?.huella === huella && ep.equipo?.objetos && ep.vestuario?.huella === huella && ep.vestuario?.atuendos) return ep.equipo;
  aviso?.('Armo la memoria de continuidad: leo el guion en orden y anoto lo que cada personaje trae encima y lo que lleva puesto…');
  const orden = new Map(escenas.map((e, i) => [e.id, i]));
  const objetos = {};
  const atuendos = {};
  let parcial = false;
  const LOTE = 8;
  for (let i = 0; i < escenas.length; i += LOTE) {
    const lote = escenas.slice(i, i + LOTE);
    let cambios = null;
    let vestuario = null;
    for (let intento = 0; intento < 2 && cambios === null; intento++) {
      try {
        const json = parsearJSON(await pedirTexto(promptEquipo(datos, lote, objetos, atuendos), { control, aviso }));
        if (Array.isArray(json?.cambios) || Array.isArray(json?.vestuario)) { cambios = json.cambios || []; vestuario = json.vestuario || []; }
      } catch (e) { if (e?.detenido) throw e; }
    }
    if (cambios === null) { parcial = true; continue; }
    aplicarCambiosEquipo(objetos, cambios, orden, datos.universo);
    aplicarCambiosVestuario(atuendos, vestuario, orden, datos.universo);
  }
  ep.equipo = { huella, objetos };
  ep.vestuario = { huella, atuendos };
  if (parcial) aviso?.('La memoria de continuidad quedó parcial: una parte del guion no se pudo leer; lo anotado sí viaja con el desglose.');
  await guardar?.();
  return ep.equipo;
}

// Al rehacer el desglose de una escena, el plano que conserva su ancla
// hereda la imagen (y el video) que ya se pagaron: rehacer no puede
// descolgarlos. Si el prompt nuevo difiere del viejo, la imagen heredada
// queda marcada obsoleta, como hace la revisión del director de arte.
export function heredarMedios(viejos = [], nuevos = []) {
  let heredados = 0;
  (nuevos || []).forEach((p, i) => {
    const v = (viejos || [])[i];
    if (!v?.imagen || normalizar(v.ancla) !== normalizar(p.ancla)) return;
    p.imagen = v.imagen;
    if (v.video) p.video = v.video;
    if (normalizar(v.prompt) !== normalizar(p.prompt)) {
      p.imagenObsoleta = true;
      if (p.video) p.videoObsoleto = true;
    }
    heredados++;
  });
  return heredados;
}

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
- "accion": alguien camina, pelea, construye, nada, conduce o manipula un objeto. Se anima con video: TÚ decides cuánto dura, entre 3 y 6 segundos, y lo escribes en "segundos".
- "cobertura": una cara que reacciona, una mano, un objeto o un plano general de paisaje. Es imagen fija con movimiento de cámara en el montaje: 1,5 a 3 segundos. Si lo que pasa en un momento cabe en menos de 3 segundos, es cobertura, nunca acción.
- Proporción objetivo: 70 % acción y 30 % cobertura, contando planos.

REGLAS DEL DESGLOSE:
- Cada plano lleva "ancla": palabras CONSECUTIVAS copiadas literalmente del texto de la escena. Si el ancla sale de una LÍNEA HABLADA (diálogo, pensamiento o Sistema), debe cubrir FRASES COMPLETAS de esa línea: empieza donde empieza una oración (al principio de la línea o justo tras un punto, una exclamación o una interrogación) y termina donde termina una oración (en su signo de cierre). NUNCA partas una oración por la mitad: si una oración es larga, el plano la lleva ENTERA, aunque pase de 14 palabras; si una línea tiene varias oraciones cortas, un plano puede llevar dos o tres seguidas. Esto es innegociable: la voz de ese plano dice el ancla entera, y una frase partida no cabe al montar la narración completa. Si el ancla sale de «lo que se ve al empezar» (la descripción, que no se habla), basta un fragmento consecutivo de 4 a 14 palabras. Las anclas siguen el orden del texto: un plano nunca muestra algo que ocurre después de su ancla.
- Estado físico acumulado: entre planos se conservan posición, ropa, lesiones, objetos y quién está presente. Un corte cambia el encuadre, no la realidad.
- Peso editorial de 1 a 5 por plano: la frase o la acción principal pesa más que un detalle o una reacción rápida.
- \"segundos\" de cada plano de acción (3 a 6, entero): elige según lo que el plano lleva — su ancla hablada a ritmo normal (unas 2,5 palabras por segundo) y la acción que se ve. Una frase corta con un gesto: 3 o 4. Una frase larga o una acción que se desarrolla: 5 o 6. Nunca menos de 3 ni más de 6.
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

EQUIPO DE LOS PERSONAJES (memoria de la historia): cada personaje trae objetos que ganó o que lleva desde antes; el mensaje los lista con su descripción en inglés EXACTA y desde qué escena los trae.
- Cuando un plano muestra a un personaje con uno de esos objetos (en la mano, colgado del cinturón, usándolo), copia su descripción EXACTA, palabra por palabra, en "prompt" y en "estado": es el MISMO objeto en toda la serie, nunca una versión nueva por escena.
- El texto puede nombrar ese objeto con una palabra suelta distinta (el diálogo dice «arpón» y lo que el personaje trae es su lanza): esa palabra NO crea un objeto nuevo; se filma el objeto que ya trae, con su descripción exacta.
- PROHIBIDO inventar armas, herramientas u objetos importantes que no estén en el equipo del personaje, ni en el inventario del lugar, ni los entregue el texto de ESTA escena. Nada de versiones improvisadas de lo que el personaje ya tiene en su forma establecida.
- Si el texto de ESTA escena entrega algo nuevo a un personaje, descríbelo completo la primera vez que aparece y mantenlo idéntico en los planos siguientes de la escena.

VESTUARIO DE LOS PERSONAJES (memoria de la historia): el mensaje lista el VESTUARIO FIJADO de cada personaje: la prenda y el color EXACTOS que lleva a esta altura y desde qué escena.
- Copia esa descripción PALABRA POR PALABRA en la media frase de identidad y donde el "estado" nombre su ropa: es el MISMO atuendo en toda la serie; jamás parafrasees el color ni lo sustituyas por un sinónimo o un tono vecino.
- La ropa SOLO se aparta del vestuario fijado cuando el texto de ESTA escena viste al personaje de otra manera como hecho de la historia (se cambia, le dan ropa nueva, un disfraz): entonces describe ese atuendo nuevo completo y con la misma exactitud, y mantenlo idéntico en los planos siguientes de la escena.
- Mojada, sucia, rota o desordenada es el ESTADO de la misma ropa: va en "estado" como estado, sin tocar la descripción del atuendo.

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

${fichaVisual(u)}${bloqueEquipo(datos, escenas)}${bloqueVestuario(datos, escenas)}

DIRECCIÓN VISUAL DE LA SERIE: ${datos.biblia?.direccionVisual || ''}
ASPECTO DEL GÉNERO Y DE CADA SUBGÉNERO (obligatorio en los prompts; todos a la vez): ${direccionDeAspecto(datos.formulario)}
${esEcchi(datos.formulario) ? `FAN SERVICE (ecchi adulto): cuando la escena tiene un momento sugerente (está en su "accion" o en lo que se dice), dale al menos un plano que lo muestre con claridad: encuadre que realza la figura, ropa ajustada o mojada (siempre opaca: nunca transparente ni dejando ver el pecho a través), pose atractiva, ángulo sugerente. Las mujeres siempre se describen hermosas y con su vestuario ajustado. Sin desnudez ni partes íntimas, y sin palabras que el filtro bloquee.
` : ''}
RITMO DE MONTAJE: ${datos.biblia?.ritmoMontaje || ''}
Formato de imagen: ${datos.formulario.formato === '16:9' ? '16:9 horizontal' : '9:16 vertical: encuadres verticales, personajes centrados, poco aire lateral'}.

${escenasParaPrompt(u, escenas)}
${extra}
Devuelve JSON con EXACTAMENTE ${escenas.length} escenas, en el mismo orden:
{"escenas":[{"id":"${escenas[0].id}","presentes":["c1","c2"],"planos":[{"tipo":"accion | cobertura","encuadre":"general | medio | primer_plano | detalle","ancla":"palabras copiadas del texto","personajes":["c1"],"entran":[],"salen":[],"estado":"where every present person is and what they do at this instant, by name, plus key objects","cambio":"what changed since the previous shot (empty only in the first shot)","peso":3,"segundos":4,"prompt":"Scene with …","movimiento":"… (solo acción)","sistema":"texto de la línea del Sistema que aparece sobre este plano, o vacío"}]}]}`,
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
      // El largo del video lo decide el director (regla del dueño,
      // 2026-11-12): entre 3 y 6 segundos; sin dato, 4 como antes.
      segundos: Math.max(3, Math.min(6, Math.round(Number(p?.segundos) || 4))),
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

EQUIPO DE LOS PERSONAJES: el mensaje trae la memoria de equipo — lo que cada personaje ya trae, con su descripción EXACTA y desde qué escena lo trae. Un prompt que dibuja uno de esos objetos como otra cosa (otra forma, otro material, una versión improvisada de palo) ES UN FALLO: corrígelo copiando la descripción exacta del objeto en el prompt (y en el estado, si ahí también sale cambiado). La palabra suelta del diálogo («arpón») nunca manda sobre el objeto establecido. VESTUARIO: el mensaje trae también el VESTUARIO FIJADO de cada personaje (prenda y color exactos, y desde qué escena). Un prompt que lo vista con otra prenda u OTRO COLOR sin que el texto de la escena lo justifique como cambio de la historia ES UN FALLO: corrígelo copiando la descripción fijada en el prompt (y en el estado, si ahí también sale cambiado).
Y si un plano necesita un objeto que no está NI en el equipo del personaje NI en el inventario del lugar NI lo entrega el texto de la escena, NO lo corrijas inventándolo y NO lo des por bueno con una explicación: añádelo a tu JSON en un array "avisos", junto a "correcciones", con la misma forma ({"escena","plano","motivo"}), diciendo qué objeto falta y por qué no se puede resolver sin el dueño. Un aviso no lleva prompt ni estado: el dueño decide.
Respondes SOLO JSON válido.`;

export function promptRevision(datos, escenas) {
  const u = datos.universo;
  const nombres = ids => (ids || []).map(id => nombreDe(u, id)).join(', ') || 'nadie';
  const lista = escenas.map(e => `═══ ESCENA ${e.id} — escenario ${e.escenario} — presentes al empezar: ${nombres(e.presentes)}\nLo que se ve al empezar: ${e.accion}\nTexto: ${textoEscena(e)}\n${(e.planos || []).map((p, i) => `Plano ${i + 1} (${p.tipo}, ${NOMBRE_ENCUADRE[p.encuadre] || 'sin encuadre'}) ancla «${p.ancla}» · se ve: ${nombres(p.personajes)}${p.entran?.length ? ' · entran: ' + nombres(p.entran) : ''}${p.salen?.length ? ' · salen: ' + nombres(p.salen) : ''}\n  Estado: ${p.estado || '—'}\n  Cambio: ${p.cambio || '—'}\n  Prompt: ${p.prompt}`).join('\n')}`).join('\n\n');
  return {
    sistema: SISTEMA_ARTE,
    mensaje: `${fichaVisual(u)}${bloqueEquipo(datos, escenas)}${bloqueVestuario(datos, escenas)}

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

Si el campo que corriges nombra un objeto del equipo de un personaje (el mensaje trae la memoria de equipo, con la descripción exacta de cada objeto), copia esa descripción EXACTA, palabra por palabra: jamás sustituyas un objeto establecido por una versión inventada o improvisada. Y si el campo que corriges nombra la ropa de un personaje (el mensaje trae su VESTUARIO FIJADO: prenda y color exactos), cópiala también palabra por palabra: el color registrado es el único color de ese atuendo, no lo parafrasees ni lo cambies de tono.
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

${fichaVisual(u)}${bloqueEquipo(datos, escenas)}${bloqueVestuario(datos, escenas)}

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
  await asegurarEquipo(datos, numero, { control, aviso, guardar });
  const todas = escenasDelEpisodio(datos, numero);
  const pendientes = soloEscena ? todas.filter(e => e.id === soloEscena) : rehacerTodo ? todas : todas.filter(e => !e.planos?.length);
  const informe = { revisadas: 0, correcciones: 0, avisos: 0, sinRevisar: [] };
  const grupos = agrupar(pendientes);
  let hechas = 0, porRevisar = [];
  const revisarLo = async () => {
    const lote = porRevisar;
    porRevisar = [];
    try {
      const r = await revisar(datos, lote, { control, aviso, guardar });
      informe.revisadas += r.revisadas; informe.correcciones += r.correcciones; informe.avisos += r.avisos || 0; informe.sinRevisar.push(...r.sinRevisar);
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
      const viejos = escena.planos?.length ? escena.planos : null;
      if (viejos) escena.planosAnteriores = viejos;
      escena.planos = resultado[escena.id].map((p, n) => ({ ...p, id: `${escena.id}-${n + 1}` }));
      // Rehacer un desglose no puede descolgar los medios ya pagados: el
      // plano que conserva su ancla hereda su imagen (y su video); si el
      // prompt cambió, la heredada queda obsoleta, como en la revisión.
      if (viejos) heredarMedios(viejos, escena.planos);
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

// Aplica sobre los planos lo que el director de arte devolvió: las
// correcciones reescriben el campo señalado y marcan la imagen obsoleta
// sin borrar nada; los «avisos» no tocan nada — dejan la nota visible en
// la tarjeta para que el dueño decida (un objeto que no existe en
// ninguna ficha no se rellena con un invento ni se excusa con una nota).
export function aplicarRevision(escenas, json) {
  const revisadas = new Set((Array.isArray(json?.revisadas) ? json.revisadas : []).map(String));
  let correcciones = 0, avisos = 0;
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
  for (const c of Array.isArray(json?.avisos) ? json.avisos : []) {
    const escena = escenas.find(e => e.id === String(c?.escena));
    const plano = escena?.planos?.[Number(c?.plano) - 1];
    const motivo = String(c?.motivo || '').trim();
    if (!plano || !motivo) continue;
    plano.revision = /^aviso\b/i.test(motivo) ? motivo : `AVISO: ${motivo}`;
    avisos++;
  }
  return { correcciones, avisos, revisadas };
}

// El director de arte. Devuelve qué revisó de verdad.
export async function revisar(datos, escenas, { control, aviso, guardar }) {
  aviso?.('El director de arte revisa la puesta en escena…');
  const json = parsearJSON(await pedirTexto(promptRevision(datos, escenas), { control, aviso }));
  const { correcciones, avisos, revisadas } = aplicarRevision(escenas, json);
  for (const e of escenas) if (revisadas.has(e.id)) e.revisada = Date.now();
  await guardar?.();
  return { revisadas: escenas.filter(e => revisadas.has(e.id)).length, correcciones, avisos, sinRevisar: escenas.filter(e => !revisadas.has(e.id)).map(e => e.id) };
}
