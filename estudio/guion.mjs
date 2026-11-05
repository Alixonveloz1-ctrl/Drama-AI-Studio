// ════════════════════════════════════════════════════════════════
// MOTOR DE GUION — ideas, universo, biblia, nota y guion por bloques.
//
// Nada de lo que vuelve del modelo se acepta a ciegas. Cada bloque se revisa
// antes de guardarlo (sección 7.2):
//   · al menos el número pedido de ciclos completos, demostrados con citas
//     LITERALES del propio texto y en orden (problema → reacción → recompensa);
//   · un bloque demasiado corto no es un éxito: se vuelve a pedir;
//   · sin escenas vacías, sin narrador, Sistema solo si la historia lo tiene,
//     pensamiento solo del protagonista, y narración del protagonista:
//     al menos la mitad de las palabras son del protagonista (diálogo +
//     pensamiento), no del resto del reparto ni del Sistema;
//   · se rechaza la prosa literaria, el texto que suena a IA, el resumen
//     escolar y el diálogo contado en estilo indirecto;
//   · en la apertura: conflicto antes de los 15 s y elemento especial antes
//     de los 30 s, medidos en palabras habladas.
// Si una petición no cabe en el tiempo del servidor, el bloque se parte en
// dos más pequeños (repetirla igual repite el corte). Cada bloque aceptado
// se guarda en el bucket en el acto: una tanda interrumpida se reanuda.
// ════════════════════════════════════════════════════════════════
import { pedirTexto, parsearJSON } from './texto.mjs';
import * as P from './prompts.mjs';

const INTENTOS = 4;

export const contarPalabras = t => String(t || '').split(/\s+/).filter(Boolean).length;
export const normalizar = t => String(t || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[«»"“”'‘’¿?¡!.,;:…—–\-()[\]]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// ─── Revisión de estilo (del estudio de anime, adaptada al guion actuado) ───
const PROSA_IA = [
  /el aire (?:estaba|se sentia) cargado/, /sus ojos reflejaban/, /silencio ensordecedor/, /el destino (?:tenia|estaba)/,
  /una mezcla (?:de emociones|indescriptible)/, /no podia evitar preguntarse/, /en lo mas profundo de su (?:ser|corazon)/,
  /como si el tiempo se hubiera detenido/, /una oleada de emociones/, /el peso de (?:sus|mis|las) palabras/,
];
const RESUMEN_ESCOLAR = [
  /durante (?:los|las) (?:dias|semanas|meses) siguientes/, /con el paso de los (?:dias|meses|anos)/, /los dias (?:pasaron|transcurrieron)/,
  /el tiempo (?:paso|transcurrio)/, /poco a poco (?:fue|iba) mejorando/, /entreno durante (?:dias|semanas|meses)/,
];
const INDIRECTO = /\b(?:le dijo que|les dijo que|explico que|respondio que|pregunto si|le conto que|les conto que|discutieron sobre|hablaron sobre)\b/g;
const ARRANQUE_AMBIENTAL = /^(?:el sol|la lluvia|el cielo|la noche|el viento|el aire|era una|en un mundo|desde tiempos|la ciudad|aquella manana|amanece|amanecia)/;

function frases(texto) {
  return (String(texto).match(/[^.!?…]+[.!?…]*/g) || []).map(s => s.trim()).filter(s => contarPalabras(s) > 0);
}

// ─── Ideas ───
export function validarIdeas(json) {
  const ideas = Array.isArray(json?.ideas) ? json.ideas : [];
  const limpias = ideas.slice(0, 3).map(i => ({ titulo: String(i?.titulo || '').trim(), concepto: String(i?.concepto || '').trim() }));
  const problemas = [];
  if (limpias.length < 3) problemas.push(`llegaron ${limpias.length} ideas y deben ser tres`);
  if (limpias.some(i => !i.titulo || !i.concepto)) problemas.push('alguna idea no trae título o concepto');
  if (limpias.some(i => contarPalabras(i.concepto) > 90)) problemas.push('algún concepto es demasiado largo: deben ser 2 o 3 frases');
  return { problemas, ideas: limpias };
}

// ─── Universo ───
export function validarUniverso(json, formulario) {
  const problemas = [];
  const u = json && typeof json === 'object' ? json : {};
  for (const campo of ['titulo', 'gancho', 'premisa', 'mundo', 'ventaja']) if (!String(u[campo] || '').trim()) problemas.push(`falta «${campo}»`);
  const personajes = (Array.isArray(u.personajes) ? u.personajes : []).map((p, i) => ({
    id: 'c' + (i + 1), nombre: String(p?.nombre || '').trim(), edad: Number(p?.edad), rol: String(p?.rol || '').trim(),
    sexo: /^(mujer|femenin|female|woman)/i.test(String(p?.sexo || '')) ? 'mujer' : /^(hombre|masculin|male|man)/i.test(String(p?.sexo || '')) ? 'hombre' : '',
    aspecto: String(p?.aspecto || '').trim(), appearance: String(p?.appearance || '').trim(),
    personalidad: String(p?.personalidad || '').trim(), formaDeHablar: String(p?.formaDeHablar || '').trim(),
  }));
  if (personajes.length < 2) problemas.push('hacen falta al menos 2 personajes');
  if (personajes.length > 8) personajes.length = 8;
  for (const p of personajes) {
    if (!p.nombre) problemas.push('un personaje no tiene nombre');
    if (!Number.isFinite(p.edad) || p.edad < 18) problemas.push(`${p.nombre || 'un personaje'} no es adulto (todos deben tener 18 años o más)`);
    if (!p.aspecto || !p.appearance) problemas.push(`${p.nombre || 'un personaje'} no tiene el aspecto en español y en inglés`);
  }
  const escenarios = (Array.isArray(u.escenarios) ? u.escenarios : []).map((e, i) => {
    const descripcion = String(e?.descripcion || '').trim();
    return {
      id: 'l' + (i + 1), nombre: String(e?.nombre || '').trim(), descripcion,
      description: String(e?.description || '').trim(),
      interior: typeof e?.interior === 'boolean' ? e.interior : /^interior/i.test(descripcion),
    };
  });
  if (escenarios.length < 2) problemas.push('hacen falta al menos 2 escenarios');
  for (const e of escenarios) if (!e.nombre || !e.descripcion) problemas.push('un escenario no tiene nombre o descripción');
  let tieneSistema = Boolean(u.tieneSistema);
  if (P.sistemaObligatorio(formulario)) tieneSistema = true;
  if (!P.sistemaPermitido(formulario)) tieneSistema = false;
  const sistema = tieneSistema ? {
    nombre: String(u.sistema?.nombre || '').trim(), reglaDelJuego: String(u.sistema?.reglaDelJuego || '').trim(),
    cuentaAtras: String(u.sistema?.cuentaAtras || '').trim(),
  } : null;
  if (tieneSistema && (!sistema.nombre || !sistema.reglaDelJuego)) problemas.push('la historia tiene Sistema pero falta su nombre o la regla de su primer panel');
  return {
    problemas,
    universo: {
      titulo: String(u.titulo || '').trim(), gancho: String(u.gancho || '').trim(), premisa: String(u.premisa || '').trim(),
      mundo: String(u.mundo || '').trim(), reglas: (Array.isArray(u.reglas) ? u.reglas : []).map(String).filter(Boolean),
      ventaja: String(u.ventaja || '').trim(), tieneSistema, sistema, personajes, escenarios,
    },
  };
}

export function validarBiblia(json) {
  const b = json && typeof json === 'object' ? json : {};
  const problemas = [];
  for (const campo of ['direccionVisual', 'identidadMusical', 'ritmoNarrativo', 'ritmoMontaje']) if (!String(b[campo] || '').trim()) problemas.push(`falta «${campo}»`);
  for (const campo of ['motivosRecurrentes', 'reglasDeOro', 'arcoTemporada']) if (!Array.isArray(b[campo]) || !b[campo].length) problemas.push(`falta la lista «${campo}»`);
  return { problemas, biblia: b };
}

export function validarLugares(json, escenarios) {
  const crudos = Array.isArray(json?.lugares) ? json.lugares : [];
  const problemas = [];
  const fichas = {};
  for (const e of escenarios) {
    const ficha = String(crudos.find(x => String(x?.id) === e.id)?.ficha || '').replace(/\s+/g, ' ').trim();
    const n = contarPalabras(ficha);
    if (n < 90) problemas.push(`la ficha de ${e.nombre} (${e.id}) es demasiado corta (${n} palabras; mínimo 90)`);
    else if (n > 320) problemas.push(`la ficha de ${e.nombre} (${e.id}) es demasiado larga (${n} palabras; máximo 320)`);
    else if (!/\b(the|with|and|of)\b/i.test(ficha)) problemas.push(`la ficha de ${e.nombre} no está en inglés`);
    else fichas[e.id] = ficha;
  }
  return { problemas, fichas };
}

// El director escribe las fichas de los lugares que no la tengan. Se llama al
// crear el universo y, en proyectos antiguos, antes del desglose.
export async function asegurarLugares(datos, opciones = {}) {
  const faltan = (datos.universo?.escenarios || []).filter(e => !e.ficha);
  if (!faltan.length) return 0;
  const { fichas } = await pedirValidado(P.promptLugares(datos, faltan), json => validarLugares(json, faltan), { ...opciones, etiqueta: 'El director de arte detalla los lugares' });
  for (const e of faltan) e.ficha = fichas[e.id];
  await opciones.guardar?.();
  return faltan.length;
}

export function validarNota(json) {
  const n = json && typeof json === 'object' ? json : {};
  const problemas = ['objetivo', 'curvaEmocional', 'imagenClave', 'notaDeDireccion'].filter(c => !String(n[c] || '').trim()).map(c => `falta «${c}»`);
  return { problemas, nota: n };
}

// ─── Bloque del guion ───
export function validarBloque(json, ctx) {
  const problemas = [];
  const { universo, minimoPalabras, ciclos: ciclosMinimos, esApertura, huellas: huellasPedidas = [] } = ctx;
  const ids = new Set(universo.personajes.map(p => p.id));
  const lugares = new Set(universo.escenarios.map(e => e.id));
  const protagonista = universo.personajes[0]?.id;
  const crudas = Array.isArray(json?.escenas) ? json.escenas : [];
  if (!crudas.length) problemas.push('no trae escenas');
  const escenas = [];
  let narrador = false, sistemaIndebido = false, pensamientoAjeno = false, extraSinNombre = false, lugarDesconocido = false, personajeDesconocido = false;
  for (const e of crudas) {
    const lineas = [];
    for (const l of Array.isArray(e?.lineas) ? e.lineas : []) {
      // Las acotaciones entre paréntesis no se dicen en voz alta.
      const texto = String(l?.texto || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
      const tipo = String(l?.tipo || '').toLowerCase();
      if (!texto) continue;
      if (!['dialogo', 'pensamiento', 'sistema'].includes(tipo)) { narrador = true; continue; }
      if (tipo === 'sistema') {
        if (!universo.tieneSistema) sistemaIndebido = true;
        lineas.push({ tipo, personaje: null, texto });
        continue;
      }
      const personaje = String(l?.personaje || '');
      if (tipo === 'pensamiento' && personaje !== protagonista) pensamientoAjeno = true;
      if (personaje === 'extra') {
        if (!String(l?.nombre || '').trim()) extraSinNombre = true;
        lineas.push({ tipo, personaje: 'extra', nombre: String(l.nombre || '').trim(), texto });
      } else {
        if (!ids.has(personaje)) personajeDesconocido = true;
        lineas.push({ tipo, personaje, texto });
      }
    }
    if (!lineas.length) continue;   // una escena sin texto no se rellena: se descarta
    const escenario = String(e?.escenario || '');
    if (!lugares.has(escenario)) lugarDesconocido = true;
    escenas.push({
      titulo: String(e?.titulo || '').trim() || 'Escena', escenario,
      personajes: [...new Set((Array.isArray(e?.personajes) ? e.personajes : []).map(String).filter(id => ids.has(id))
        .concat(lineas.map(l => l.personaje).filter(id => ids.has(id))))],
      accion: String(e?.accion || '').trim(), lineas,
    });
  }
  if (crudas.length && escenas.length < crudas.length) problemas.push('alguna escena venía vacía');
  if (narrador) problemas.push('apareció un narrador o un tipo de línea no permitido; solo hay diálogo, pensamiento del protagonista' + (universo.tieneSistema ? ' y Sistema' : ''));
  if (sistemaIndebido) problemas.push('aparecieron líneas del Sistema y esta historia NO tiene Sistema');
  if (pensamientoAjeno) problemas.push(`hubo pensamiento de alguien que no es el protagonista (${protagonista})`);
  if (extraSinNombre) problemas.push('un extra habla sin "nombre"');
  if (personajeDesconocido) problemas.push('se usó un id de personaje que no existe en el reparto');
  if (lugarDesconocido) problemas.push('se usó un id de escenario que no existe');
  if (escenas.some(e => !e.accion)) problemas.push('alguna escena no describe en "accion" lo que se ve');

  const todas = escenas.flatMap(e => e.lineas);
  const texto = todas.map(l => l.texto).join(' ');
  const palabras = contarPalabras(texto);
  if (palabras < minimoPalabras) problemas.push(`demasiado corto: ${palabras} palabras habladas y el mínimo es ${minimoPalabras}`);
  const porTipo = tipo => todas.filter(l => l.tipo === tipo).reduce((n, l) => n + contarPalabras(l.texto), 0);
  // Narración del protagonista (decisión del dueño): diálogo + pensamiento
  // del protagonista, sin contar el Sistema, tienen que ser al menos la
  // mitad de las palabras. El pensamiento interno ya NO tiene tope del 30 %:
  // es la voz que manda, y el diálogo entre los demás personajes solo
  // existe cuando el protagonista interactúa con ellos.
  const palabrasProta = todas.filter(l => l.personaje === protagonista && l.tipo !== 'sistema').reduce((n, l) => n + contarPalabras(l.texto), 0);
  const palabrasSinSistema = todas.filter(l => l.tipo !== 'sistema').reduce((n, l) => n + contarPalabras(l.texto), 0);
  if (palabrasSinSistema && palabrasProta / palabrasSinSistema < 0.5) problemas.push('poca narración del protagonista: al menos la mitad de las palabras (sin contar el Sistema) tienen que ser del protagonista, entre su diálogo y su pensamiento en primera persona');
  void porTipo;

  // Ciclos demostrados con citas literales, en orden.
  const norma = normalizar(texto);
  const ciclos = (Array.isArray(json?.ciclos) ? json.ciclos : []).map(c => ({
    problema: String(c?.problema || ''), solucion: String(c?.solucion || ''), reaccion: String(c?.reaccion || ''), recompensa: String(c?.recompensa || ''),
    citaProblema: String(c?.citaProblema || ''), citaReaccion: String(c?.citaReaccion || ''), citaRecompensa: String(c?.citaRecompensa || ''),
  }));
  const citaValida = cita => { const n = contarPalabras(cita); return n >= 4 && n <= 25; };
  const demostrados = ciclos.filter(c => {
    if (![c.citaProblema, c.citaReaccion, c.citaRecompensa].every(citaValida)) return false;
    const p = norma.indexOf(normalizar(c.citaProblema));
    const r = norma.indexOf(normalizar(c.citaReaccion), Math.max(0, p));
    const g = norma.indexOf(normalizar(c.citaRecompensa), Math.max(0, p));
    return p >= 0 && r > p && g > p;
  });
  if (demostrados.length < ciclosMinimos) {
    problemas.push(`solo ${demostrados.length} ciclo(s) completo(s) demostrados con citas literales en orden; hacen falta ${ciclosMinimos}`);
  }

  // El género y cada subgénero tienen que notarse en el bloque: se demuestra
  // con una cita literal de las líneas o de lo que se ve.
  const conAccion = normalizar(texto + ' ' + escenas.map(e => e.accion).join(' '));
  const huellasCrudas = Array.isArray(json?.huellas) ? json.huellas : [];
  const huellas = [];
  const faltan = [];
  // Si la historia tiene Sistema, sus propias líneas ya prueban el subgénero
  // «Sistema / Awakening» (y los géneros de sistema): no se rechaza un bloque
  // solo porque el modelo olvidó copiar esa cita.
  const lineaSistema = todas.find(l => l.tipo === 'sistema');
  const pruebaSistema = clave => lineaSistema && (clave === 'sistema_awakening' || (clave === 'genero' && ['videojuego', 'sistema_juego'].includes(ctx.genero)));
  for (const h of huellasPedidas) {
    const dada = huellasCrudas.find(x => String(x?.de || '') === h.clave && citaValida(String(x?.cita || '')) && conAccion.includes(normalizar(x.cita)));
    if (dada) huellas.push({ de: h.clave, cita: String(dada.cita) });
    else if (pruebaSistema(h.clave)) huellas.push({ de: h.clave, cita: lineaSistema.texto });
    else faltan.push(h.etiqueta);
  }
  if (faltan.length) problemas.push(`no se nota ${faltan.join(', ')} (falta su cita literal en "huellas"); cada elección del dueño tiene que verse en el bloque`);

  if (esApertura) {
    const a = json?.apertura || {};
    const posicionEnPalabras = cita => {
      const i = norma.indexOf(normalizar(cita));
      return i < 0 ? Infinity : contarPalabras(norma.slice(0, i));
    };
    const limite15 = Math.round(P.PALABRAS_POR_MINUTO / 4);       // ≈ 15 s
    const limite30 = Math.round(P.PALABRAS_POR_MINUTO / 2);       // ≈ 30 s
    if (!citaValida(a.citaConflicto || '') || posicionEnPalabras(a.citaConflicto) > limite15) problemas.push('la apertura no muestra el conflicto en los primeros 15 segundos');
    const sistemaATiempo = universo.tieneSistema && lineaSistema && posicionEnPalabras(lineaSistema.texto) <= limite30;
    if (!sistemaATiempo && (!citaValida(a.citaElemento || '') || posicionEnPalabras(a.citaElemento) > limite30)) problemas.push(universo.tieneSistema ? 'el Sistema no aparece en los primeros 30 segundos (su primera línea tiene que llegar en las primeras ~70 palabras)' : 'el elemento especial no aparece en los primeros 30 segundos');
    if (ARRANQUE_AMBIENTAL.test(normalizar(escenas[0]?.accion || ''))) problemas.push('abre con ambientación en vez de entrar en el conflicto');
    // GANCHO DESDE EL SEGUNDO 0 (regla del dueño): la voz entra con la
    // primera imagen, y es la del protagonista contando ya su conflicto.
    // Nada de abrir con acción muda ni con la línea de otro: en los
    // dramas que funcionan, la historia ya va hablando en el primer
    // segundo. Se admite que abra otro personaje SOLO si la segunda
    // línea es ya el protagonista.
    const prot = (universo.personajes || []).find(p => p.rol === 'protagonista');
    const primeras = escenas.flatMap(e => e.lineas).filter(l => l.tipo === 'dialogo' || l.tipo === 'pensamiento');
    if (prot && primeras.length && primeras[0].personaje !== prot.id && primeras[1]?.personaje !== prot.id) {
      problemas.push('la apertura no entra con la voz del protagonista: la primera línea tiene que ser suya (o la segunda, si abre otro), contando ya su conflicto desde el segundo 0, sin acción muda delante');
    }
  }

  // Estilo.
  const bajo = normalizar(texto + ' ' + escenas.map(e => e.accion).join(' '));
  if (PROSA_IA.some(re => re.test(bajo))) problemas.push('apareció prosa literaria o texto que suena a IA');
  if (RESUMEN_ESCOLAR.some(re => re.test(bajo))) problemas.push('hay resumen escolar («durante los días siguientes…»): hay que mostrar hechos concretos');
  if ((normalizar(texto).match(INDIRECTO) || []).length > Math.max(1, Math.floor(palabras / 400))) problemas.push('demasiado diálogo contado en estilo indirecto: debe oírse la conversación');
  const largos = frases(texto).map(contarPalabras);
  if (largos.length) {
    // Ritmo de los dramas de referencia: las líneas se dicen de un tirón,
    // encadenadas con comas, así que una «frase» entre puntos es en la
    // práctica una línea entera de 12 a 22 palabras. Solo se rechaza lo
    // que ya suena a párrafo leído, no la línea rápida y continua.
    const media = largos.reduce((a, b) => a + b, 0) / largos.length;
    if (media > 22) problemas.push(`frases demasiado largas (media ${media.toFixed(1)} palabras; el formato usa líneas de un tirón de 12 a 22)`);
    if (largos.filter(n => n > 40).length / largos.length > 0.15) problemas.push('demasiadas frases de más de 40 palabras');
  }

  return {
    problemas,
    bloque: { escenas, ciclos: demostrados, huellas, apertura: esApertura ? json?.apertura : undefined, resumen: String(json?.resumen || '').trim(), palabras },
  };
}

// ─── Llamadas con revisión y reintento ───
async function pedirValidado(prompt, validar, { control, aviso, etiqueta }) {
  let comentario = '';
  let ultimo = '';
  let problemas = [];
  for (let intento = 0; intento < INTENTOS; intento++) {
    aviso?.(intento ? `${etiqueta}: intento ${intento + 1} de ${INTENTOS}…` : `${etiqueta}…`);
    const crudo = await pedirTexto({ ...prompt, mensaje: prompt.mensaje + comentario }, { control, aviso });
    let json;
    try { json = parsearJSON(crudo); } catch {
      ultimo = 'la respuesta no era un JSON válido';
      comentario = '\n\nREINTENTO: la respuesta anterior no era un JSON válido. Devuelve SOLO el JSON pedido.';
      continue;
    }
    const resultado = validar(json);
    if (!resultado.problemas.length) return resultado;
    problemas = resultado.problemas;
    ultimo = problemas.join('; ');
    const corto = ultimo.match(/demasiado corto: (\d+) palabras habladas y el mínimo es (\d+)/);
    const cuanto = corto ? `\nTE FALTARON ${Number(corto[2]) - Number(corto[1])} PALABRAS como mínimo: añade ${Math.max(1, Math.ceil((Number(corto[2]) - Number(corto[1])) / 80))} escena(s) completa(s) más (con su conflicto, su reacción y su diálogo), sin alargar las frases. Cuenta las palabras antes de responder.` : '';
    comentario = `\n\nREINTENTO OBLIGATORIO: la respuesta anterior se rechazó porque ${ultimo}.${cuanto} Corrígelo y vuelve a escribirlo completo.`;
  }
  throw Object.assign(new Error(`${etiqueta}: el modelo no cumplió el formato después de ${INTENTOS} intentos (${ultimo}). Lo ya guardado se conserva.`), { tipo: 'formato', problemas });
}

export async function generarIdeas(datos, opciones) {
  const anteriores = [...(datos.ideasAnteriores || []), ...(datos.ideas || [])];
  const { ideas } = await pedirValidado(P.promptIdeas(datos.formulario, anteriores), validarIdeas, { ...opciones, etiqueta: 'Escribiendo tres ideas' });
  if (datos.ideas?.length) datos.ideasAnteriores = [...(datos.ideasAnteriores || []), ...datos.ideas].slice(-12);
  const lote = Date.now().toString(36);
  datos.ideas = ideas.map((i, n) => ({ id: `i${lote}${n}`, ...i }));
  return datos.ideas;
}

export async function generarUniverso(datos, idea, opciones) {
  const { universo } = await pedirValidado(P.promptUniverso(datos.formulario, idea),
    json => validarUniverso(json, datos.formulario), { ...opciones, etiqueta: 'Desarrollando el universo' });
  datos.ideaElegida = idea.id;
  datos.universo = universo;
  datos.biblia = null;
  datos.episodios = {};
  datos.episodioActual = 1;
  await opciones.guardar?.();
  const { biblia } = await pedirValidado(P.promptBiblia(datos), validarBiblia, { ...opciones, etiqueta: 'El director escribe la biblia de la serie' });
  datos.biblia = biblia;
  await opciones.guardar?.();
  await asegurarLugares(datos, opciones);
  return universo;
}

// Parte un trozo del plan en dos mitades (cuando no cupo en el tiempo).
function partir(pieza) {
  const mitad = Math.ceil(pieza.palabras / 2);
  const ciclos = Math.max(1, Math.ceil(pieza.ciclos / 2));
  return [
    { ...pieza, palabras: mitad, ciclos, parte: 'primera mitad' },
    { ...pieza, palabras: pieza.palabras - mitad, ciclos, parte: 'segunda mitad' },
  ];
}

export function segundosDelEpisodio(episodio) {
  return P.segundosDe((episodio?.bloques || []).reduce((n, b) => n + (b.palabras || 0), 0));
}

export async function escribirGuion(datos, numero, opciones) {
  const { control, aviso, guardar, alAvanzar } = opciones;
  datos.episodios ||= {};
  const ep = datos.episodios[numero] ||= { estado: 'escribiendo', plan: P.planDelEpisodio(datos.formulario), bloques: [], creado: Date.now() };
  if (!ep.nota) {
    const { nota } = await pedirValidado(P.promptNota(datos, numero), validarNota, { control, aviso, etiqueta: 'El director escribe la nota del episodio' });
    ep.nota = nota;
    await guardar?.();
  }
  let escenaNum = ep.bloques.reduce((n, b) => n + b.escenas.length, 0);
  // Ids de escena propios de cada episodio y de cada versión del guion: así
  // un episodio nuevo o un guion rehecho NUNCA hereda imágenes, voces ni
  // videos de otro (fallo real del estudio de anime). Los medios se nombran
  // a partir de estos ids.
  if (!ep.version) {
    datos.versiones ||= {};
    const anteriores = (datos.episodiosAnteriores || []).filter(x => x.numero === numero).length;
    ep.version = datos.versiones[numero] = Math.max(datos.versiones[numero] || 0, anteriores) + 1;
  }
  const prefijo = `${numero > 1 ? 'ep' + numero : ''}${ep.version > 1 ? 'v' + ep.version : ''}e`;
  for (let i = ep.bloques.length; i < ep.plan.length; i++) {
    const pieza = ep.plan[i];
    const etiqueta = `Escribiendo el bloque ${i + 1} de ${ep.plan.length}`;
    try {
      const vistas = new Set((ep.bloques[i - 1]?.huellas || []).map(h => h.de));
      const huellas = P.huellasPedidas(datos.formulario).filter(h => !vistas.has(h.clave));
      const { bloque } = await pedirValidado(P.promptBloque(datos, numero, i, ep.plan),
        json => validarBloque(json, { universo: datos.universo, genero: datos.formulario.genero, minimoPalabras: Math.ceil(pieza.palabras * 0.9), ciclos: pieza.ciclos, esApertura: i === 0, huellas }),
        { control, aviso, etiqueta });
      for (const escena of bloque.escenas) escena.id = prefijo + (++escenaNum);
      ep.bloques.push(bloque);
      ep.segundos = segundosDelEpisodio(ep);
      await guardar?.();
      alAvanzar?.();
    } catch (e) {
      // No cupo en el tiempo: se hace más pequeño en vez de repetirlo igual.
      // Cada corte divide por dos, así que esto termina solo.
      if (e.tipo === 'tiempo' && pieza.palabras >= 160) {
        ep.plan.splice(i, 1, ...partir(pieza));
        await guardar?.();
        aviso?.('Ese bloque no cupo en el tiempo del servidor: lo parto en dos más pequeños.');
        i--;
        continue;
      }
      // Salió corto (o sin alguna prueba) en todos los intentos: escribirlo en
      // dos partes más pequeñas es más fácil de cumplir que repetirlo igual.
      if (e.tipo === 'formato' && pieza.palabras >= 160 && (e.problemas || []).some(p => /demasiado corto|no se nota|ciclo/.test(p))) {
        ep.plan.splice(i, 1, ...partir(pieza));
        await guardar?.();
        aviso?.('Ese bloque salió corto varias veces: lo escribo en dos partes más pequeñas.');
        i--;
        continue;
      }
      throw e;
    }
  }
  // El episodio no se confirma si falta algo.
  const faltas = [];
  if (!datos.universo?.titulo) faltas.push('título');
  if (!datos.biblia?.direccionVisual) faltas.push('dirección visual');
  if (!ep.bloques.length || ep.bloques.some(b => !b.escenas.length)) faltas.push('escenas');
  if (ep.bloques.some(b => b.escenas.some(e => !e.lineas.length))) faltas.push('texto en alguna escena');
  if (faltas.length) throw new Error(`El episodio no se puede dar por terminado: falta ${faltas.join(', ')}.`);
  ep.estado = 'completo';
  ep.terminado = Date.now();
  await guardar?.();
  return ep;
}
