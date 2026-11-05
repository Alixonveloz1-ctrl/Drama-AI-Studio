// Pruebas del motor de guion con un modelo simulado (sin llamadas reales).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../estudio/guion.mjs';
import * as P from '../estudio/prompts.mjs';
import { pedirTexto, crearControl, parsearJSON } from '../estudio/texto.mjs';

const formulario = { publico: 'masculino', genero: 'transmigracion', subgeneros: ['revenge', 'ecchi'], formato: '9:16', duracion: 3, cierre: 'completo', concepto: '' };

const universoCrudo = {
  titulo: 'El Boticario del Emperador', gancho: 'Murió en la farmacia y despertó como el hijo despreciado',
  premisa: 'Un farmacéutico moderno despierta en el cuerpo de un heredero humillado.', mundo: 'China antigua, ciudad amurallada.',
  reglas: ['La familia manda', 'El oro compra todo'], ventaja: 'Sabe medicina moderna', tieneSistema: true,
  sistema: { nombre: 'Sistema', reglaDelJuego: 'x' },
  personajes: [
    { nombre: 'Lin Feng', edad: 24, rol: 'protagonista', aspecto: 'pelo negro corto', appearance: 'short black hair' },
    { nombre: 'Wang Hu', edad: 30, rol: 'antagonista', aspecto: 'barba', appearance: 'beard' },
  ],
  escenarios: [
    { nombre: 'Patio de la mansión', descripcion: 'Exterior. Patio de piedra.', description: 'Exterior. Stone courtyard.' },
    { nombre: 'Botica', descripcion: 'Interior. Estantes de hierbas.', description: 'Interior. Herb shelves.' },
  ],
};

function universoValido() {
  return G.validarUniverso(universoCrudo, formulario).universo;
}

// Un bloque que cumple todo: ~430 palabras, frases cortas, dos ciclos con citas.
function bloqueValido({ apertura = true, palabras = 430 } = {}) {
  const lineas = [
    { tipo: 'dialogo', personaje: 'c2', texto: '¡Arrodíllate, inútil! Hoy pagas la deuda de tu padre.' },
    { tipo: 'pensamiento', personaje: 'c1', texto: 'Esa herida está infectada. Yo sé curarla mejor que nadie aquí.' },
    { tipo: 'dialogo', personaje: 'c1', texto: 'Tu hijo tiene fiebre. Si no lo curo, muere esta noche.' },
    { tipo: 'dialogo', personaje: 'c2', texto: 'Imposible. Ningún médico de la ciudad pudo bajarle la fiebre.' },
    { tipo: 'dialogo', personaje: 'extra', nombre: 'Criado', texto: 'Señor, el niño ya respira tranquilo. La fiebre bajó.' },
    { tipo: 'dialogo', personaje: 'c2', texto: 'No puede ser. Ese inútil lo salvó delante de todos.' },
    { tipo: 'dialogo', personaje: 'c2', texto: 'Toma esta bolsa de oro. La deuda queda perdonada.' },
  ];
  const relleno = 'Lo vi con mis propios ojos y no lo creo todavía.';
  const escenas = [{ titulo: 'La deuda', escenario: 'l1', personajes: ['c1', 'c2'], accion: 'Wang Hu empuja a Lin Feng contra el suelo del patio.', lineas: lineas.slice(0, 4) },
    { titulo: 'La cura', escenario: 'l2', personajes: ['c1', 'c2'], accion: 'Lin Feng mezcla hierbas junto al niño enfermo. La criada se inclina a su lado con la blusa empapada.', lineas: lineas.slice(4) }];
  let total = escenas.flatMap(e => e.lineas).reduce((n, l) => n + G.contarPalabras(l.texto), 0);
  let k = 0;
  while (total < palabras) {
    // Relleno con mayoría del protagonista (c1): la nueva regla exige que
    // al menos la mitad de las palabras sean del protagonista, entre su
    // diálogo y su pensamiento, no del resto del reparto.
    escenas[1].lineas.push({ tipo: 'dialogo', personaje: k % 3 === 2 ? 'c2' : 'c1', texto: relleno });
    total += G.contarPalabras(relleno); k++;
  }
  const json = {
    escenas,
    ciclos: [
      { problema: 'deuda', solucion: 'cura', reaccion: 'asombro', recompensa: 'oro', citaProblema: 'Hoy pagas la deuda de tu padre', citaReaccion: 'Ese inútil lo salvó delante de todos', citaRecompensa: 'La deuda queda perdonada' },
      { problema: 'fiebre', solucion: 'hierbas', reaccion: 'incredulidad', recompensa: 'respeto', citaProblema: 'Tu hijo tiene fiebre. Si no lo curo', citaReaccion: 'No puede ser. Ese inútil lo salvó', citaRecompensa: 'Toma esta bolsa de oro' },
    ],
    resumen: 'Lin Feng cura al hijo de Wang Hu.',
    huellas: [
      { de: 'genero', cita: 'Yo sé curarla mejor que nadie aquí' },
      { de: 'revenge', cita: 'Hoy pagas la deuda de tu padre' },
      { de: 'ecchi', cita: 'La criada se inclina a su lado con la blusa empapada' },
    ],
  };
  if (apertura) json.apertura = { citaConflicto: '¡Arrodíllate, inútil! Hoy pagas la deuda', citaElemento: 'Yo sé curarla mejor que nadie aquí' };
  return json;
}

const ctx = (extra = {}) => ({ universo: universoValido(), minimoPalabras: 392, ciclos: 2, esApertura: true, ...extra });

test('universo: ids propios, todos adultos y Sistema según la elección', () => {
  const { problemas, universo } = G.validarUniverso(universoCrudo, formulario);
  assert.deepEqual(problemas, []);
  assert.deepEqual(universo.personajes.map(p => p.id), ['c1', 'c2']);
  assert.equal(universo.tieneSistema, false, 'transmigración sin «sistema» en el concepto: no hay Sistema');
  assert.equal(universo.escenarios[1].interior, true);
  const menor = G.validarUniverso({ ...universoCrudo, personajes: [{ ...universoCrudo.personajes[0], edad: 17 }, universoCrudo.personajes[1]] }, formulario);
  assert.ok(menor.problemas.some(p => p.includes('no es adulto')));
  const conSistema = G.validarUniverso({ ...universoCrudo, sistema: { nombre: 'Sistema del Boticario', reglaDelJuego: 'Cura a diez personas' } }, { ...formulario, genero: 'sistema_juego' });
  assert.equal(conSistema.universo.tieneSistema, true);
});

test('bloque bueno: se acepta con sus dos ciclos demostrados', () => {
  const { problemas, bloque } = G.validarBloque(bloqueValido(), ctx());
  assert.deepEqual(problemas, []);
  assert.equal(bloque.ciclos.length, 2);
  assert.ok(bloque.palabras >= 392);
});

test('bloques malos: narrador, corto, sin ciclos, Sistema indebido, prosa de IA, escena vacía', () => {
  const casos = [
    [b => { b.escenas[0].lineas.unshift({ tipo: 'narrador', texto: 'Era una noche oscura.' }); }, 'narrador'],
    [b => { b.escenas[1].lineas = b.escenas[1].lineas.slice(0, 3); }, 'demasiado corto'],
    [b => { b.ciclos = [b.ciclos[0]]; }, 'hacen falta 2'],
    [b => { b.ciclos[0].citaReaccion = 'esto no aparece en ningún sitio del texto'; }, 'hacen falta 2'],
    [b => { b.escenas[0].lineas.push({ tipo: 'sistema', personaje: null, texto: 'Misión cumplida.' }); }, 'NO tiene Sistema'],
    [b => { b.escenas[0].lineas.push({ tipo: 'dialogo', personaje: 'c2', texto: 'Como si el tiempo se hubiera detenido.' }); }, 'suena a IA'],
    [b => { b.escenas[0].lineas.push({ tipo: 'dialogo', personaje: 'c2', texto: 'Durante los días siguientes entrenó.' }); }, 'resumen escolar'],
    [b => { b.escenas.push({ titulo: 'Vacía', escenario: 'l1', accion: 'Nada.', lineas: [] }); }, 'vacía'],
    [b => { b.escenas[0].lineas.push({ tipo: 'pensamiento', personaje: 'c2', texto: 'Lo odio.' }); }, 'no es el protagonista'],
    [b => {
      b.escenas[1].lineas.push({ tipo: 'dialogo', personaje: 'c1', texto: 'Al final del día ya nadie se atrevía a despreciarme.' });
      b.apertura.citaElemento = 'ya nadie se atrevía a despreciarme';
    }, '30 segundos'],
  ];
  for (const [romper, esperado] of casos) {
    const b = bloqueValido();
    romper(b);
    const { problemas } = G.validarBloque(b, ctx());
    assert.ok(problemas.some(p => p.includes(esperado)), `se esperaba «${esperado}» y salió: ${problemas.join(' | ')}`);
  }
});

test('plan: 3 minutos = 1 bloque con 2 ciclos; 30 minutos = 6 bloques', () => {
  const corto = P.planDelEpisodio(formulario);
  assert.equal(corto.length, 1);
  assert.equal(corto[0].ciclos, 2);
  assert.equal(corto[0].fase, 'unico');
  // Piloto de 30 segundos: 1 bloque de ~73 palabras, sin historia completa.
  const piloto = P.planDelEpisodio({ ...formulario, duracion: 0.5 });
  assert.equal(piloto.length, 1);
  assert.equal(piloto[0].palabras, Math.round(0.5 * P.PALABRAS_POR_MINUTO));
  assert.equal(piloto[0].ciclos, 1);
  assert.equal(P.etiquetaDuracion({ duracion: 0.5 }), 'prueba piloto de 30 segundos');
  assert.equal(P.etiquetaDuracion({ duracion: 3 }), 'prueba de 3 minutos');
  const largo = P.planDelEpisodio({ ...formulario, duracion: 30 });
  assert.equal(largo.length, 6);
  assert.equal(largo.reduce((n, b) => n + b.palabras, 0), 30 * P.PALABRAS_POR_MINUTO);
  assert.ok(largo.reduce((n, b) => n + b.ciclos, 0) >= 20, 'entre 20 y 40 ciclos en 30 minutos');
});

test('prompts: catálogo sin emojis, sin Sistema cuando no toca, dirección visual fuera del guion', () => {
  const p = P.promptIdeas(formulario);
  assert.match(p.mensaje, /Género principal: Transmigración/);
  assert.match(p.mensaje, /Venganza: motivada/);
  assert.match(p.mensaje, /NO tiene Sistema/);
  const familia = P.contextoEleccion({ ...formulario, publico: 'familia' });
  assert.doesNotMatch(familia, /Ecchi/, 'para toda la familia quita los subgéneros adultos');
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'PALETA_SECRETA ocre', ritmoNarrativo: 'rápido' }, episodios: {} };
  const bloque = P.promptBloque(datos, 1, 0, P.planDelEpisodio(formulario));
  assert.doesNotMatch(bloque.mensaje, /PALETA_SECRETA/);
  assert.match(bloque.mensaje, /primeros 15 segundos/);
});

// ─── Con red simulada ───
let respuestas, llamadas, fetchOriginal;
beforeEach(() => {
  llamadas = []; respuestas = [];
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body || '{}') });
    const r = respuestas.shift();
    if (!r) throw new Error('llamada inesperada');
    return new Response(JSON.stringify(r.cuerpo), { status: r.estado || 200 });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });
const texto = json => ({ cuerpo: { texto: JSON.stringify(json) } });

test('guion completo de 3 minutos: nota + bloque, se guarda cada paso', async () => {
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'ocre', ritmoNarrativo: 'rápido' }, episodios: {} };
  respuestas = [
    texto({ objetivo: 'a', curvaEmocional: 'b', imagenClave: 'c', notaDeDireccion: 'd', quedaAbierto: '' }),
    texto(bloqueValido()),
  ];
  let guardados = 0;
  const ep = await G.escribirGuion(datos, 1, { guardar: async () => { guardados++; } });
  assert.equal(ep.estado, 'completo');
  assert.deepEqual(ep.bloques[0].escenas.map(e => e.id), ['e1', 'e2']);
  assert.ok(ep.segundos > 150);
  assert.ok(guardados >= 3);
});

test('un bloque rechazado se vuelve a pedir explicando por qué', async () => {
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'ocre' }, episodios: { 1: { estado: 'escribiendo', plan: P.planDelEpisodio(formulario), bloques: [], nota: { objetivo: 'a' } } } };
  const corto = bloqueValido(); corto.escenas[1].lineas = corto.escenas[1].lineas.slice(0, 3);
  respuestas = [texto(corto), texto(bloqueValido())];
  await G.escribirGuion(datos, 1, {});
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[1].cuerpo.mensaje, /REINTENTO OBLIGATORIO: .*demasiado corto/);
});

test('si no cabe en el tiempo, el bloque se parte en dos más pequeños', async () => {
  const datos = { formulario: { ...formulario, duracion: 30 }, universo: universoValido(), biblia: { direccionVisual: 'ocre' },
    episodios: { 1: { estado: 'escribiendo', plan: P.planDelEpisodio({ ...formulario, duracion: 30 }), bloques: [], nota: { objetivo: 'a' } } } };
  respuestas = [{ estado: 504, cuerpo: { error: 'tarde', tipo: 'tiempo' } }];
  await assert.rejects(G.escribirGuion(datos, 1, {}));   // tras partir, la siguiente llamada no tiene respuesta simulada
  const plan = datos.episodios[1].plan;
  assert.equal(plan.length, 7);
  assert.equal(plan[0].parte, 'primera mitad');
  assert.equal(plan[0].palabras + plan[1].palabras, 725);
});

test('un bloqueo de seguridad no se reintenta nunca', async () => {
  respuestas = [{ estado: 422, cuerpo: { error: 'Google bloqueó', tipo: 'bloqueo' } }];
  await assert.rejects(pedirTexto({ mensaje: 'x' }), e => e.tipo === 'bloqueo');
  assert.equal(llamadas.length, 1);
});

test('una cuota espera, y Detener corta la espera en el acto', async () => {
  respuestas = [{ estado: 429, cuerpo: { error: 'espera', tipo: 'cuota' } }];
  const control = crearControl();
  const avisos = [];
  const inicio = Date.now();
  setTimeout(() => control.detener(), 600);
  await assert.rejects(pedirTexto({ mensaje: 'x' }, { control, aviso: a => avisos.push(a) }), e => e.detenido);
  assert.ok(Date.now() - inicio < 3000, 'no espera los 20 s');
  assert.ok(avisos.some(a => /Reintento en 20 s/.test(a)));
});

test('el JSON con saltos de línea sin escapar se repara', () => {
  assert.deepEqual(parsearJSON('```json\n{"a":"uno\ndos"}\n```'), { a: 'uno\ndos' });
});

// ─── Desglose de planos ───
import * as D from '../estudio/desglose.mjs';

function escenaDePrueba() {
  const { bloque } = G.validarBloque(bloqueValido(), ctx());
  return { ...bloque.escenas[0], id: 'e1' };
}
function desgloseValido(escena) {
  // Unidades de ancla EN ORDEN: la descripción inicial entera (de ahí el
  // ancla puede ser cualquier fragmento: no se habla) y las FRASES
  // COMPLETAS de cada línea (regla vigente: un ancla hablada no parte
  // una oración, o la validación la rechaza).
  const unidades = [escena.accion, ...escena.lineas.flatMap(l => D.frasesDelTexto(l.texto))].filter(Boolean);
  // Siete planos (si la escena los admite), para que la proporción 70/30 cuente.
  const n = Math.min(D.maximoPlanos(escena), Math.max(D.minimoPlanos(escena), 7));
  return { escenas: [{ id: escena.id, presentes: ['c1', 'c2'], planos: Array.from({ length: n }, (_, i) => ({
    tipo: i % 3 === 2 ? 'cobertura' : 'accion', encuadre: i === 0 ? 'general' : 'medio', ancla: unidades[Math.min(i, unidades.length - 1)],
    personajes: i === 0 ? ['c1', 'c2'] : ['c1'], entran: [], salen: [], peso: 3,
    estado: 'Lin Feng kneels on the stone floor of the courtyard; Wang Hu stands over him, two steps away.',
    cambio: i ? 'Lin Feng lifts his head a little more than in the previous shot.' : '',
    prompt: 'Scene with Lin Feng (short black hair, grey robe): medium shot, side view, kneeling in the stone courtyard at dawn.',
    movimiento: i % 3 !== 2 ? 'Lin Feng slowly raises his head.' : '', sistema: '' })) }] };
}

test('desglose: mínimos por palabras y por duración', () => {
  const e = escenaDePrueba();
  assert.ok(D.minimoPlanos(e) >= 3);
  assert.equal(D.minimoPlanos({ ...e, lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Sí.' }] }), 1);
  assert.ok(D.maximoPlanos(e) > D.minimoPlanos(e));
});

test('desglose bueno se acepta; anclas inventadas, desorden, pocos planos, mirar a cámara y proporción mala se rechazan', () => {
  const e = escenaDePrueba();
  const u = universoValido();
  assert.deepEqual(D.validarDesglose(desgloseValido(e), [e], u).problemas, []);
  const casos = [
    [j => { j.escenas[0].planos[0].ancla = 'esto no lo dijo nadie nunca'; }, 'no está copiada literalmente'],
    [j => { const p = j.escenas[0].planos; [p[0], p[2]] = [p[2], p[0]]; }, 'retrocede'],
    [j => { j.escenas[0].planos = j.escenas[0].planos.slice(0, 1); }, 'necesita al menos'],
    [j => { j.escenas[0].planos[1].prompt += ' He is looking at the camera.'; }, 'mira a cámara'],
    [j => { j.escenas[0].planos.forEach(p => { p.tipo = 'cobertura'; }); }, 'proporción'],
    [j => { j.escenas[0].planos[0].movimiento = ''; }, 'no dice qué movimiento'],
  ];
  for (const [romper, esperado] of casos) {
    const j = desgloseValido(e);
    romper(j);
    const { problemas } = D.validarDesglose(j, [e], u);
    assert.ok(problemas.some(p => p.includes(esperado)), `se esperaba «${esperado}»: ${problemas.join(' | ')}`);
  }
});

test('el director de arte corrige sin borrar: la imagen queda obsoleta y dice qué no revisó', async () => {
  const e = escenaDePrueba();
  e.planos = D.validarDesglose(desgloseValido(e), [e], universoValido()).resultado.e1.map((p, n) => ({ ...p, id: `e1-${n + 1}` }));
  e.planos[0].imagen = { ruta: 'x' };
  const e2 = { ...escenaDePrueba(), id: 'e2', planos: [] };
  const datos = { formulario, universo: universoValido(), biblia: {} };
  respuestas = [texto({ revisadas: ['e1'], correcciones: [{ escena: 'e1', plano: 1, prompt: 'Scene with Lin Feng (short black hair): kneeling on the stone floor, no table in this courtyard, dawn light.', motivo: 'había una mesa que el patio no tiene' }] })];
  const r = await D.revisar(datos, [e, e2], {});
  assert.equal(r.correcciones, 1);
  assert.equal(e.planos[0].imagenObsoleta, true);
  assert.equal(e.planos[0].imagen.ruta, 'x', 'no se borra nada');
  assert.deepEqual(r.sinRevisar, ['e2'], 'lo que no miró no se da por bueno');
});

test('desglose: las escenas se agrupan sin pasarse de 5 escenas ni de 24 planos por petición', () => {
  const corta = { ...escenaDePrueba(), lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Sí.' }] };
  const larga = { ...escenaDePrueba(), lineas: Array.from({ length: 40 }, () => ({ tipo: 'dialogo', personaje: 'c1', texto: 'Lo vi con mis propios ojos y no lo creo todavía.' })) };
  assert.deepEqual(D.agrupar(Array(7).fill(corta)).map(g => g.length), [5, 2]);
  const grupos = D.agrupar([corta, larga, corta]);
  assert.ok(grupos.every(g => g.length === 1 || g.reduce((n, e) => n + D.minimoPlanos(e), 0) <= 24));
  assert.equal(grupos.flat().length, 3);
});

test('primer plano: el estado que se manda a la imagen habla solo del visible', () => {
  const estado = "Lin Ye stands center holding Zhao's other wrist; Zhao Tigre is on his knees, screaming in agony, dropping the knife; Su Muxue is in the background. The contract is on the ground.";
  assert.equal(
    D.textoSoloVisibles(estado, ['Zhao Tigre'], ['Lin Ye', 'Su Muxue', 'Zhao Tigre']),
    'Zhao Tigre is on his knees, screaming in agony, dropping the knife.',
  );
  // Una frase que mezcla visible y fuera de cuadro se quita entera: describir
  // la acción del otro en un rostro es la contradicción que atascaba a Google.
  assert.equal(
    D.textoSoloVisibles('Zhao Tigre drops the knife as Lin Ye crushes his wrist further.', ['Zhao Tigre'], ['Lin Ye', 'Zhao Tigre']),
    '',
  );
});

test('desglose: si una escena sola se pasa de tiempo, se parte en dos llamadas completas, sin recortes', async () => {
  const u = universoValido();
  u.escenarios.forEach(e => { e.ficha = e.ficha || 'Exterior. Stone courtyard, wooden gate on the left, well on the right, dawn light.'; });
  const e = escenaDePrueba();
  const [primera, segunda] = D.partirEscena(e);
  assert.ok(primera.lineas.length >= 1 && segunda.lineas.length >= 1, 'la escena se parte por sus líneas');
  assert.equal(primera.lineas.length + segunda.lineas.length, e.lineas.length);
  // La segunda parte ancla solo en sus líneas (la «acción» ya pasó) y su
  // primer plano lleva «cambio», como manda el prompt de continuación.
  const parte2 = desgloseValido({ ...segunda, accion: '' });
  parte2.escenas[0].planos[0].cambio = 'Lin Feng lifts his head a little more than in the previous shot.';
  // La primera parte trae 7 planos y la escena admite 13 en total: la
  // segunda parte trae 6, como manda su objetivo.
  parte2.escenas[0].planos = parte2.escenas[0].planos.slice(0, 6);
  const datos = { formulario, universo: u, biblia: {}, episodios: { 1: { bloques: [{ escenas: [e] }] } } };
  respuestas = [
    { estado: 504, cuerpo: { error: 'Google tardó más de 50 s', tipo: 'tiempo' } },
    { estado: 504, cuerpo: { error: 'Google tardó más de 50 s', tipo: 'tiempo' } },
    texto(desgloseValido(primera)),
    texto(parte2),
    texto({ revisadas: ['e1'], correcciones: [] }),
  ];
  await D.desglosar(datos, 1, { guardar: async () => {} });
  assert.ok(e.planos?.length >= D.minimoPlanos(e), 'la escena queda desglosada uniendo las dos partes');
  assert.equal(e.planos.at(-1).id, `e1-${e.planos.length}`, 'los planos quedan numerados como una sola escena');
  assert.match(llamadas[2].cuerpo.mensaje, /PRIMERA PARTE/, 'la primera llamada pide la primera mitad completa');
  assert.match(llamadas[3].cuerpo.mensaje, /SEGUNDA PARTE/, 'la segunda llamada continúa donde quedó la primera');
  assert.ok(!llamadas.some(l => /RESPUESTA BREVE|máximo 25 palabras/.test(l.cuerpo.mensaje || '')), 'ninguna llamada recorta descripciones: el modo breve ya no existe');
});

test('desglose: un fallo solo de un campo se corrige sin reescribir el desglose entero', async () => {
  const u = universoValido();
  u.escenarios.forEach(e => { e.ficha = e.ficha || 'Exterior. Stone courtyard, wooden gate on the left, well on the right, dawn light.'; });
  const e = escenaDePrueba();
  const roto = desgloseValido(e);
  // El estado del plano 6 olvida a Wang Hu: fallo de UN campo.
  roto.escenas[0].planos[5].estado = 'Lin Feng kneels alone in the courtyard, breathing hard and looking down at the floor.';
  const datos = { formulario, universo: u, biblia: {}, episodios: { 1: { bloques: [{ escenas: [e] }] } } };
  respuestas = [
    texto(roto),
    texto({ correcciones: [{ escena: 'e1', plano: 6, estado: 'Lin Feng kneels on the stone floor of the courtyard; Wang Hu stands over him, two steps away.' }] }),
    texto({ revisadas: ['e1'], correcciones: [] }),
  ];
  await D.desglosar(datos, 1, { guardar: async () => {} });
  assert.match(llamadas[1].cuerpo.mensaje, /CORRECCIÓN DIRIGIDA/, 'la segunda llamada es la corrección enfocada, no otro desglose');
  assert.ok(e.planos[5].estado.includes('Wang Hu'), 'el estado corregido nombra a todos los presentes');
  assert.equal(e.planos.length, roto.escenas[0].planos.length, 'el resto del desglose no se reescribió');
});

test('desglose: la clasificación separa fallos de campo de fallos estructurales', () => {
  assert.deepEqual(
    D.fallosDeCampo(['el estado del plano 6 de la escena e1 no dice dónde está Lin, Mei']).map(f => [f.escena, f.plano, f.campo]),
    [['e1', 6, 'estado']],
  );
  assert.equal(D.fallosDeCampo(['el ancla del plano 2 de la escena e1 no está copiada literalmente del texto']), null, 'un ancla mala es estructural');
  assert.equal(D.fallosDeCampo(['el estado del plano 6 de la escena e1 no dice dónde está Lin', 'la escena e1 tiene 2 planos y necesita al menos 5']), null, 'si hay algo estructural, no vale la corrección dirigida');
});

test('desglose: en una llamada de una sola escena se acepta la respuesta aunque la etiqueta difiera o venga en trozos', () => {
  const e = escenaDePrueba();
  const u = universoValido();
  const renombrada = desgloseValido(e);
  renombrada.escenas[0].id = 'e1-parte1';
  const r1 = D.validarDesglose(renombrada, [e], u);
  assert.deepEqual(r1.problemas, [], 'la etiqueta distinta no tumba una llamada de una escena');
  assert.equal(r1.resultado.e1.length, renombrada.escenas[0].planos.length);
  // En trozos: los planos de todos los trozos se unen en orden.
  const base = desgloseValido(e).escenas[0];
  const corte = Math.floor(base.planos.length / 2);
  const trozos = { escenas: [
    { id: 'e1a', presentes: base.presentes, planos: base.planos.slice(0, corte) },
    { id: 'e1b', presentes: base.presentes, planos: base.planos.slice(corte) },
  ] };
  const r2 = D.validarDesglose(trozos, [e], u);
  assert.deepEqual(r2.problemas, [], 'los trozos se unen como una sola escena');
  assert.equal(r2.resultado.e1.length, base.planos.length);
  // En una llamada de VARIAS escenas la etiqueta sigue siendo estricta.
  const e2 = { ...escenaDePrueba(), id: 'e2' };
  const grupo = { escenas: [renombrada.escenas[0], desgloseValido(e2).escenas[0]] };
  const r3 = D.validarDesglose(grupo, [e, e2], u);
  assert.ok(r3.problemas.some(p => p.includes('falta el desglose de la escena e1')), 'con varias escenas, una etiqueta distinta sí se rechaza');
});

test('guion: las escenas se piden cortas (25 a 55 palabras, unos 20 segundos)', () => {
  const datos = { formulario, universo: universoValido(), biblia: {}, episodios: {} };
  const { mensaje } = P.promptBloque(datos, 1, 0, P.planDelEpisodio(formulario));
  assert.match(mensaje, /ESCENAS CORTAS/);
  assert.match(mensaje, /25 a 55 palabras/);
  assert.ok(!mensaje.includes('40 a 150'), 'ya no se permiten escenas de hasta 150 palabras');
});

// ─── Videos ───
import * as V from '../estudio/videos.mjs';

test('prompt de video: bloques literales en orden, encuadre bloqueado solo sin movimiento de cámara, escenario en una frase', () => {
  const u = universoValido();
  const interior = u.escenarios[1];
  const p = V.promptVideo({ movimiento: 'Lin Feng grinds herbs in the mortar.' }, interior);
  assert.ok(p.startsWith(V.ESTILO), 'el estilo va primero');
  assert.ok(p.endsWith(V.AUDIO), 'el audio sin voces va al final');
  const orden = [V.ESTILO, 'MOTION — CRITICAL: animate EXACTLY', V.ENCUADRE_BLOQUEADO, 'SETTING — already built into the input image, do not redesign it: Interior.', 'THIS SHOT IS INTERIOR', V.ACTUACION, 'SHOT MOTION: Lin Feng grinds herbs in the mortar.', V.AUDIO].map(t => p.indexOf(t));
  assert.ok(orden.every(i => i >= 0), 'están todos los bloques: ' + orden);
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'y en su orden');
  assert.ok(!p.includes('Herb shelves'), 'del escenario solo la primera frase');
  const camara = V.promptVideo({ movimiento: 'The camera slowly pushes in on Lin Feng.' }, u.escenarios[0]);
  assert.ok(!camara.includes('FRAMING — LOCKED'), 'si el director pide cámara, no se le contradice');
  assert.ok(!camara.includes('THIS SHOT IS INTERIOR'));
  const negativo = V.negativoVideo({ movimiento: '' }, interior);
  assert.ok(!/\bno\b|\bdon't\b|\bnever\b/i.test(negativo), 'el negativo es una lista de cosas, sin órdenes');
  assert.match(negativo, /zoom in/);
  assert.match(negativo, /wet indoor floor/);
  assert.ok(!V.negativoVideo({ movimiento: 'camera pans left' }, interior).includes('whip pan'));
});

test('video: la operación se guarda en cuanto arranca, se sigue tras «recargar» y al terminar queda el clip', async () => {
  const datos = { formulario, universo: universoValido(), ajustes: { modeloVideo: 'veo-3.1-generate-001' } };
  const escena = { id: 'e1', escenario: 'l1' };
  const plano = { id: 'e1-1', tipo: 'accion', movimiento: 'Lin Feng stands up.', imagen: { ruta: 'r/plano-e1-1.png' } };
  const guardados = [];
  const guardar = async () => { guardados.push(JSON.parse(JSON.stringify(plano))); };
  respuestas = [{ cuerpo: { operacion: 'op/1', modelo: 'veo-3.1-generate-001', segundos: 4 } }, { cuerpo: { listo: false } }];
  // Primera vez: arranca, consulta una vez y se «recarga» (Detener).
  const control = crearControl();
  const avisos = [];
  setTimeout(() => control.detener(), 700);
  await assert.rejects(V.videoPlano({ proyectoId: 'pabc12345', datos, escena, plano, control, guardar, cada: 0.5, aviso: a => avisos.push(a) }), e => e.detenido);
  assert.equal(llamadas[0].url, '/api/video-inicio');
  assert.equal(llamadas[0].cuerpo.modelo, 'veo-3.1-generate-001');
  assert.equal(llamadas[0].cuerpo.clave, 'video-e1-1');
  assert.equal(llamadas[0].cuerpo.imagen, 'r/plano-e1-1.png');
  assert.equal(guardados[0].operacion.nombre, 'op/1', 'la operación se guarda antes de esperar');
  assert.equal(plano.operacion.nombre, 'op/1', 'Detener no tira la operación');
  // Segunda vez: no arranca otra, sigue la misma.
  llamadas = [];
  respuestas = [{ cuerpo: { listo: true, ruta: 'r/video-e1-1/9/sample_0.mp4', url: 'https://firmada', modelo: 'veo-3.1-generate-001' } }];
  const video = await V.videoPlano({ proyectoId: 'pabc12345', datos, escena, plano, control: crearControl(), guardar, cada: 0.25 });
  assert.deepEqual(llamadas.map(l => l.url), ['/api/video-estado']);
  assert.equal(llamadas[0].cuerpo.operacion, 'op/1');
  assert.equal(video.ruta, 'r/video-e1-1/9/sample_0.mp4');
  assert.equal(plano.operacion, undefined);
  assert.equal(guardados.at(-1).video.ruta, 'r/video-e1-1/9/sample_0.mp4');
});

test('video: un bloqueo cierra la operación sin reintentar; sin imagen no se arranca', async () => {
  const datos = { formulario, universo: universoValido() };
  const plano = { id: 'e1-2', tipo: 'accion', movimiento: 'x', imagen: { ruta: 'r/p.png' }, operacion: { nombre: 'op/2', inicio: Date.now() } };
  respuestas = [{ estado: 422, cuerpo: { error: 'Google bloqueó este video', tipo: 'bloqueo' } }];
  await assert.rejects(V.videoPlano({ proyectoId: 'pabc12345', datos, escena: { id: 'e1', escenario: 'l1' }, plano, control: crearControl(), guardar: async () => {}, cada: 0.25 }), e => e.tipo === 'bloqueo');
  assert.equal(llamadas.length, 1);
  assert.equal(plano.operacion, undefined, 'se puede arrancar otro después de cambiar el plano');
  await assert.rejects(V.videoPlano({ proyectoId: 'pabc12345', datos, escena: { id: 'e1', escenario: 'l1' }, plano: { id: 'e1-3' }, guardar: async () => {} }), /genérala primero/);
  assert.equal(llamadas.length, 1);
});


// ─── Géneros, subgéneros y ecchi en todo el recorrido ───
import * as I from '../estudio/imagenes.mjs';

test('cada bloque demuestra con una cita el género y cada subgénero elegido', () => {
  const huellas = P.huellasPedidas(formulario);
  assert.deepEqual(huellas.map(h => h.clave), ['genero', 'revenge', 'ecchi']);
  assert.deepEqual(G.validarBloque(bloqueValido(), ctx({ huellas })).problemas, []);
  const sinEcchi = bloqueValido();
  sinEcchi.huellas = sinEcchi.huellas.filter(h => h.de !== 'ecchi');
  assert.ok(G.validarBloque(sinEcchi, ctx({ huellas })).problemas.some(p => p.includes('fan service')));
  const inventada = bloqueValido();
  inventada.huellas[1].cita = 'una venganza que no aparece en el texto';
  assert.ok(G.validarBloque(inventada, ctx({ huellas })).problemas.some(p => p.includes('Revenge')));
  // Con «Para toda la familia» el ecchi no se pide.
  assert.deepEqual(P.huellasPedidas({ ...formulario, publico: 'familia' }).map(h => h.clave), ['genero', 'revenge']);
});

test('el ecchi y el reparto atractivo llegan al universo, al guion y a cada imagen', () => {
  const universo = P.promptUniverso(formulario, { titulo: 'x', concepto: 'y' }).mensaje;
  assert.ok(universo.includes(P.REPARTO_ATRACTIVO));
  assert.ok(universo.includes('MODIFICADOR ECCHI ACTIVO'));
  assert.match(universo, /"sexo": "mujer \| hombre"/);
  const familia = { ...formulario, publico: 'familia' };
  assert.ok(!P.promptUniverso(familia, { titulo: 'x', concepto: 'y' }).mensaje.includes('MODIFICADOR ECCHI'));
  assert.ok(P.contextoEleccion(formulario).includes(P.REGLA_DE_CAPAS));
  const datos = { formulario, universo: universoValido(), biblia: {}, episodios: { 1: { bloques: [] } } };
  assert.ok(P.promptBloque(datos, 1, 0, P.planDelEpisodio(formulario)).mensaje.includes('REGLAS ECCHI'));
  const aspecto = I.direccionDeAspecto(formulario);
  assert.ok(aspecto.includes(I.CASTING) && aspecto.includes(I.ASPECTO_GENERO.transmigracion) && aspecto.includes(I.ASPECTO_SUBGENERO.revenge) && aspecto.includes(I.ECCHI_VISUAL));
  assert.ok(!I.direccionDeAspecto(familia).includes(I.ECCHI_VISUAL));
  const ficha = I.promptFichaPersonaje({ nombre: 'Mei', sexo: 'mujer', edad: 24, rol: 'interés amoroso', appearance: 'long black hair, red silk dress' }, formulario);
  assert.match(ficha, /stunningly beautiful adult woman with the idol-like look/);
  assert.match(ficha, /curvy, alluring figure/);
  assert.match(ficha, /low neckline that shows cleavage/);
  assert.ok(!I.promptFichaPersonaje({ nombre: 'Mei', sexo: 'mujer', edad: 24, appearance: 'x' }, familia).includes('curvy'));
  assert.equal(G.validarUniverso({ ...universoCrudo, personajes: [{ ...universoCrudo.personajes[0], sexo: 'hombre' }, { ...universoCrudo.personajes[1], sexo: 'Mujer' }] }, formulario).universo.personajes[1].sexo, 'mujer');
});

test('ficha: un personaje antiguo sin sexo guardado se reconoce por su aspecto en español', () => {
  const ficha = I.promptFichaPersonaje({ nombre: 'Mei', edad: 24, aspecto: 'Mujer de pelo largo negro, vestido rojo de seda', appearance: 'long black hair, red silk dress' }, formulario);
  assert.match(ficha, /stunningly beautiful adult woman with the idol-like look/);
  assert.match(ficha, /curvy, alluring figure/);
  assert.match(ficha, /low neckline that shows cleavage/);
});


test('continuidad de escena: nadie aparece ni desaparece por arte de magia y cada plano dice quién está y qué cambió', () => {
  const e = escenaDePrueba();
  const u = universoValido();
  const bueno = D.validarDesglose(desgloseValido(e), [e], u);
  assert.deepEqual(bueno.problemas, []);
  assert.deepEqual(bueno.presentes.e1, ['c1', 'c2']);
  assert.deepEqual(bueno.resultado.e1[1].presentes, ['c1', 'c2'], 'cada plano sabe quién está, aunque no se vea');
  const casos = [
    [j => { j.escenas[0].presentes = ['c1']; }, 'sin estar en la escena'],
    [j => { j.escenas[0].presentes = ['c1']; j.escenas[0].planos[0].personajes = ['c1']; }, 'habla Wang Hu pero no está'],
    [j => { j.escenas[0].planos[0].personajes = ['c1']; }, 'deja fuera a Wang Hu'],
    [j => { j.escenas[0].planos[0].encuadre = 'medio'; }, 'primer plano tiene que ser general'],
    [j => { j.escenas[0].planos[2].estado = 'Lin Feng kneels on the floor, head down, breathing hard.'; }, 'no dice dónde está Wang Hu'],
    [j => { j.escenas[0].planos[3].cambio = ''; }, 'no dice en "cambio"'],
    [j => { j.escenas[0].planos[1].encuadre = 'cualquiera'; }, 'no dice su encuadre'],
    [j => { j.escenas[0].planos[1].salen = ['c2']; j.escenas[0].planos[3].personajes = ['c1', 'c2']; }, 'sin estar en la escena'],
  ];
  for (const [romper, esperado] of casos) {
    const j = desgloseValido(e);
    romper(j);
    const { problemas } = D.validarDesglose(j, [e], u);
    assert.ok(problemas.some(p => p.includes(esperado)), `se esperaba «${esperado}»: ${problemas.join(' | ')}`);
  }
  // Quien entra más tarde: se apunta en el plano en que entra y desde ahí está.
  const entra = desgloseValido(e);
  entra.escenas[0].presentes = ['c1'];
  entra.escenas[0].planos[0] = { ...entra.escenas[0].planos[0], personajes: ['c1'], estado: 'Lin Feng kneels alone on the stone floor of the courtyard.' };
  entra.escenas[0].planos[1].entran = ['c2'];
  entra.escenas[0].planos[1].personajes = ['c1', 'c2'];
  const r = D.validarDesglose(entra, [e], u);
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.resultado.e1[0].presentes, ['c1']);
  assert.deepEqual(r.resultado.e1[1].presentes, ['c1', 'c2']);
});

test('el director de arte puede corregir el estado y el cambio de un plano, y ve quién está en la escena', async () => {
  const e = escenaDePrueba();
  const r0 = D.validarDesglose(desgloseValido(e), [e], universoValido());
  e.planos = r0.resultado.e1.map((p, n) => ({ ...p, id: `e1-${n + 1}` }));
  e.presentes = r0.presentes.e1;
  e.planos[1].imagen = { ruta: 'x' };
  const datos = { formulario, universo: universoValido(), biblia: {} };
  assert.match(D.promptRevision(datos, [e]).mensaje, /presentes al empezar: Lin Feng, Wang Hu/);
  respuestas = [texto({ revisadas: ['e1'], correcciones: [{ escena: 'e1', plano: 2, estado: 'Lin Feng kneels on the floor; Wang Hu now stands right behind him, a hand on his shoulder.', motivo: 'Wang Hu desaparecía sin haber salido' }] })];
  const r = await D.revisar(datos, [e], {});
  assert.equal(r.correcciones, 1);
  assert.match(e.planos[1].estado, /Wang Hu now stands right behind him/);
  assert.equal(e.planos[1].imagenObsoleta, true);
});

import { pedirMedio, crearRitmo, fijarVentanaRitmo } from '../estudio/medios.mjs';
fijarVentanaRitmo(60); // en las pruebas la ventana de cuota es de 60 ms: el ritmo no frena la batería
test('medios: la espera dice el motivo real y un corte por tiempo no se repite solo', async () => {
  respuestas = [{ estado: 502, cuerpo: { error: 'Google no generó la imagen (código 503).', tipo: 'google', detalleGoogle: '503 — The model is overloaded.' } }, { cuerpo: { ruta: 'r/x.png' } }];
  const avisos = [];
  const r = await pedirMedio('/api/imagen', { a: 1 }, { control: crearControl(), aviso: a => avisos.push(a) });
  assert.equal(r.ruta, 'r/x.png');
  assert.ok(avisos.some(a => /Google está saturado ahora mismo \(código 503\)\. Se vuelve a intentar\. Reintento en/.test(a)), avisos.join(' | '));
  assert.ok(!avisos.some(a => /corte pasajero/.test(a)));
  llamadas = [];
  respuestas = [{ estado: 504, cuerpo: { error: 'Google tardó más de 47 s', tipo: 'tiempo' } }];
  await assert.rejects(pedirMedio('/api/imagen', { a: 1 }, { control: crearControl() }), e => e.tipo === 'tiempo');
  assert.equal(llamadas.length, 1, 'no se paga dos veces');
});

test('ritmo de cuota: las dos primeras salen seguidas, la tercera espera su hueco y el orden se conserva', async () => {
  const ritmo = crearRitmo({ maximo: 2, ventanaMs: 400 });
  const orden = [], marcas = [];
  const t0 = Date.now();
  await Promise.all([1, 2, 3].map(async n => { await ritmo.turno({}); orden.push(n); marcas.push(Date.now() - t0); }));
  assert.deepEqual(orden, [1, 2, 3], 'la cola conserva el orden de llegada (lote y manual comparten fila)');
  assert.ok(marcas[1] < 250, 'las dos primeras salen casi al instante');
  assert.ok(marcas[2] >= 350, 'la tercera espera a que la primera petición cumpla la ventana');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(ritmo.faltaMs(), 0, 'pasada la ventana hay hueco otra vez');
});

test('ritmo de cuota: Detener corta también la espera en cola y la fila sigue', async () => {
  const ritmo = crearRitmo({ maximo: 1, ventanaMs: 60000 });
  await ritmo.turno({});
  const control = crearControl();
  const enCola = ritmo.turno({ control });
  setTimeout(() => control.detener(), 60);
  await assert.rejects(enCola, e => e.detenido);
});

test('video: el audio prohíbe también gritos y jadeos, y el negativo los lista', () => {
  const u = universoValido();
  const p = V.promptVideo({ movimiento: 'Lin Feng shouts at the guard.' }, u.escenarios[0]);
  assert.ok(p.endsWith(V.AUDIO));
  assert.match(V.AUDIO, /^AUDIO: NO voice dialogue, NO narration, NO singing, NO human speech of any kind\. ONLY the diegetic sound of this shot/);
  assert.match(V.AUDIO, /no screams, shouts, yells, gasps/);
  const n = V.negativoVideo({ movimiento: '' }, u.escenarios[0]);
  assert.match(n, /screaming, shouting/);
  assert.match(n, /see-through clothing/);
});

test('video: Veo dice el texto exacto de la toma en español (diálogo en pantalla; pensamiento y Sistema en off)', () => {
  const u = universoValido();
  const datos = { universo: u };
  const escena = { lineas: [
    { tipo: 'dialogo', personaje: 'c1', texto: 'Te lo digo claro: no me voy.' },
    { tipo: 'pensamiento', personaje: 'c1', texto: 'Si me quedo, pierdo todo.' },
    { tipo: 'sistema', personaje: null, texto: 'Misión cumplida.' },
  ] };
  assert.equal(V.tipoDeAncla(escena, { ancla: 'Te lo digo claro' }), 'dialogo');
  assert.equal(V.tipoDeAncla(escena, { ancla: 'Si me quedo' }), 'pensamiento');
  assert.equal(V.tipoDeAncla(escena, { ancla: 'Misión cumplida' }), 'sistema');
  assert.equal(V.tipoDeAncla(escena, { ancla: 'palabras que no están' }), '');
  // Diálogo: quien habla, qué dice (su pedazo exacto) y en qué idioma.
  const vozD = V.vozDelPlano(datos, escena, { ancla: 'Te lo digo claro' });
  assert.equal(vozD.tipo, 'dialogo');
  assert.equal(vozD.nombre, 'Lin Feng');
  assert.equal(vozD.texto, 'Te lo digo claro');
  assert.match(vozD.descripcion, /a man's voice, in his twenties, deep, calm and confident/);
  // La descripción de voz del personaje es LA MISMA en diálogo y en
  // pensamiento: es la regla del dueño, una sola voz por personaje.
  assert.equal(V.vozDelPlano(datos, escena, { ancla: 'Si me quedo' }).descripcion, vozD.descripcion);
  assert.match(V.promptVideo({ movimiento: 'Lin Feng speaks.' }, u.escenarios[0], { voz: vozD }), /THE VOICE IS ALWAYS THIS EXACT VOICE/);
  const habla = V.promptVideo({ movimiento: 'Lin Feng speaks.' }, u.escenarios[0], { voz: vozD });
  assert.match(habla, /SPOKEN DIALOGUE — CRITICAL: Lin Feng speaks ALOUD/);
  assert.match(habla, /saying EXACTLY these words and nothing else: "Te lo digo claro"/);
  assert.ok(habla.endsWith(V.AUDIO_HABLA), 'con voz, el audio es la voz en español más los efectos');
  assert.ok(!V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozD }).includes('talking,'), 'en diálogo no se prohíbe hablar');
  assert.match(V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozD }), /chinese speech/, 'el habla en otro idioma sí se prohíbe');
  // Pensamiento: voz en off del protagonista, boca cerrada en pantalla.
  const vozP = V.vozDelPlano(datos, escena, { ancla: 'Si me quedo' });
  assert.equal(vozP.tipo, 'pensamiento');
  const piensa = V.promptVideo({ movimiento: 'Lin Feng thinks.' }, u.escenarios[0], { voz: vozP });
  assert.match(piensa, /VOICE-OVER NARRATION — CRITICAL/);
  assert.match(piensa, /NO SPEAKING PERFORMANCE/, 'en pantalla nadie habla');
  assert.match(V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozP }), /talking, speech, dialogue/, 'en off, hablar en pantalla sí se prohíbe');
  assert.ok(!V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozP }).includes('voice-over'), 'pero la narración en off no se prohíbe');
  // Sistema: voz sintética en off con su texto.
  const vozS = V.vozDelPlano(datos, escena, { ancla: 'Misión cumplida' });
  assert.equal(vozS.tipo, 'sistema');
  assert.equal(vozS.nombre, 'The System');
  assert.equal(vozS.texto, 'Misión cumplida');
  assert.equal(vozS.descripcion, V.VOZ_SISTEMA, 'el Sistema también tiene una sola voz fija');
  assert.match(V.VOZ_SISTEMA, /WOMAN's synthetic system voice/, 'el sexo de la voz del Sistema va escrito: sin él, Veo lo sorteaba en cada clip');
  assert.match(V.VOZ_SISTEMA, /never a male voice/);
  assert.match(V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozS }), /male system voice/, 'la voz de hombre se prohíbe en los planos del Sistema');
  assert.match(V.promptVideo({ movimiento: 'A panel glows.' }, u.escenarios[0], { voz: vozS }), /SYSTEM VOICE-OVER — CRITICAL/);
  // Sin línea localizada: sin voz, solo efectos, como siempre.
  assert.equal(V.vozDelPlano(datos, escena, { ancla: 'palabras que no están' }), null);
  const neutro = V.promptVideo({ movimiento: 'Lin Feng stands.' }, u.escenarios[0]);
  assert.ok(neutro.endsWith(V.AUDIO) && !neutro.includes('SPOKEN DIALOGUE') && !neutro.includes('VOICE-OVER'));
});

test('video: el prompt lleva el contexto completo del plano (reparto, posiciones, destinatario y final fijo)', () => {
  const u = universoValido();
  const datos = { universo: u };
  // Intercambio de dos: Wang Hu habla y Lin Feng le responde. La línea
  // de Lin Feng va dirigida A Wang Hu, esté quien esté a su lado en la
  // imagen (el fallo en vivo: la línea se decía a la persona equivocada).
  const escena = { lineas: [
    { tipo: 'dialogo', personaje: 'c2', texto: 'Ríndete de una vez, muchacho.' },
    { tipo: 'dialogo', personaje: 'c1', texto: 'Suéltala ahora mismo si quieres salir.' },
  ] };
  const voz = V.vozDelPlano(datos, escena, { ancla: 'Suéltala ahora mismo' });
  assert.equal(voz.tipo, 'dialogo');
  assert.equal(voz.destinatario?.nombre, 'Wang Hu', 'el destinatario es quien habló justo antes');
  const conDestino = V.promptVideo({ movimiento: 'Lin Feng points at Wang Hu.' }, u.escenarios[0], { voz });
  assert.match(conDestino, /talking TO Wang Hu/);
  assert.match(conDestino, /Nobody else speaks/, 'la línea no se reparte: los demás callan');
  // Contexto: reparto con identidades, posiciones (el estado que el
  // director ya escribe) e identidad cerrada para todo el clip.
  const plano = { personajes: ['c1', 'c2'], presentes: ['c1', 'c2'], encuadre: 'medio',
    estado: 'Lin Feng stands at the door pointing at Wang Hu; Wang Hu holds the girl by the arm beside the table.' };
  const contexto = V.contextoDelPlano(datos, plano);
  assert.deepEqual(contexto.reparto.map(r => r.nombre), ['Lin Feng', 'Wang Hu']);
  const conContexto = V.promptVideo({ movimiento: 'Lin Feng slowly raises his head.' }, u.escenarios[0], { contexto });
  assert.match(conContexto, /CAST AND STAGING/);
  assert.match(conContexto, /Wang Hu holds the girl by the arm/, 'las posiciones del estado llegan a Veo');
  assert.match(conContexto, /IDENTITY LOCK/, 'la identidad va cerrada para todo el clip');
  assert.match(conContexto, /HOLDS that final state/, 'el clip entero va dirigido, no solo el movimiento');
  assert.match(conContexto, /nobody leaves the frame/);
  // Encuadre cerrado: el estado se recorta a quien se ve (la misma regla
  // de las imágenes), para no describir a quien no sale en el plano.
  const cerrado = V.contextoDelPlano(datos, { personajes: ['c2'], presentes: ['c1', 'c2'], encuadre: 'primer_plano',
    estado: 'Lin Feng kneels on the stone floor; Wang Hu stands over him, two steps away.' });
  assert.ok(cerrado.estado.includes('Wang Hu'));
  assert.ok(!cerrado.estado.includes('kneels'), 'lo de quien no se ve no entra en el primer plano');
  // Negativos nuevos: la identidad siempre; las salidas y los saltos
  // solo cuando el guion no los pide.
  const neg = V.negativoVideo({ movimiento: '', salen: [] }, u.escenarios[0], {});
  assert.match(neg, /gender change/);
  assert.match(neg, /leaving the frame/);
  assert.ok(!V.negativoVideo({ movimiento: '', salen: ['c2'] }, u.escenarios[0], {}).includes('leaving the frame'), 'si el guion saca a alguien del plano, no se prohíbe salir');
  assert.ok(!V.negativoVideo({ movimiento: 'He stands up and leaves the room.' }, u.escenarios[0], {}).includes('leaving the frame'), 'si el movimiento escrito sale, no se prohíbe');
});

test('lugares: el director escribe una ficha detallada en inglés de cada lugar y va completa en cada plano', async () => {
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'ocre' } };
  const larga = n => Array.from({ length: n }, (_, i) => `the stone item ${i} with old wood`).join(', ');
  respuestas = [
    texto({ lugares: [{ id: 'l1', ficha: 'corta' }, { id: 'l2', ficha: larga(30) }] }),
    texto({ lugares: [{ id: 'l1', ficha: larga(30) }, { id: 'l2', ficha: larga(30) }] }),
  ];
  let guardados = 0;
  assert.equal(await G.asegurarLugares(datos, { guardar: async () => { guardados++; } }), 2);
  assert.match(llamadas[1].cuerpo.mensaje, /REINTENTO OBLIGATORIO.*demasiado corta/);
  assert.ok(datos.universo.escenarios.every(e => e.ficha.length > 200));
  assert.equal(guardados, 1);
  assert.equal(await G.asegurarLugares(datos, {}), 0, 'lo que ya tiene ficha no se repite');
  assert.ok(I.textoDelLugar(datos.universo.escenarios[0]).includes(datos.universo.escenarios[0].ficha));
  assert.match(D.promptDesglose({ ...datos, episodios: {} }, [{ ...escenaDePrueba(), id: 'e1' }]).mensaje, /LUGARES \(ficha de cada uno/);
});

// ─── Voces, música, subtítulos, montaje y episodios ───
import * as VZ from '../estudio/voces.mjs';
import * as MU from '../estudio/musica.mjs';
import * as SU from '../estudio/subtitulos.mjs';
import * as MO from '../estudio/montaje.mjs';

const VOCES = [{ nombre: 'Charon', genero: 'hombre' }, { nombre: 'Kore', genero: 'mujer' }, { nombre: 'Puck', genero: 'hombre' }, { nombre: 'Leda', genero: 'mujer' }];

test('voces: cada personaje recibe una voz distinta según su sexo y la escena se parte en tramos de una sola voz', () => {
  const u = universoValido();
  u.personajes[0].sexo = 'hombre'; u.personajes[1].sexo = 'mujer';
  u.tieneSistema = true;
  assert.equal(VZ.asignarVoces(u, VOCES), true);
  assert.equal(VOCES.find(v => v.nombre === u.personajes[0].voz).genero, 'hombre');
  assert.equal(VOCES.find(v => v.nombre === u.personajes[1].voz).genero, 'mujer');
  assert.ok(u.vozSistema && u.vozSistema !== u.personajes[0].voz && u.vozSistema !== u.personajes[1].voz);
  assert.equal(VZ.asignarVoces(u, VOCES), false, 'una voz asignada no se cambia sola');
  const escena = { lineas: [
    { tipo: 'dialogo', personaje: 'c1', texto: 'Uno.' }, { tipo: 'dialogo', personaje: 'c2', texto: 'Dos.' },
    { tipo: 'pensamiento', personaje: 'c1', texto: 'Tres.' }, { tipo: 'sistema', personaje: null, texto: 'Misión.' },
    { tipo: 'dialogo', personaje: 'extra', nombre: 'Criado', texto: 'Señor.' }] };
  VZ.asignarExtras(u, [escena], VOCES);
  const tramos = VZ.tramosDeEscena(escena, u);
  assert.deepEqual(tramos.map(t => t.lineas.map(l => l.indice)), [[0], [1], [2], [3], [4]], 'cada cambio de voz (o de pensar a hablar) es un tramo');
  assert.equal(tramos[0].voz, u.personajes[0].voz);
  assert.equal(tramos[1].voz, u.personajes[1].voz);
  assert.equal(tramos[2].pensamiento, true);
  const seguidas = VZ.tramosDeEscena({ lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'A.' }, { tipo: 'dialogo', personaje: 'c1', texto: 'B.' }] }, u);
  assert.equal(seguidas.length, 1, 'líneas seguidas de la misma voz van juntas');
});

test('voces: el Sistema siempre recibe voz de mujer y una de hombre guardada se sustituye sola', () => {
  const u = universoValido();
  u.personajes[0].sexo = 'hombre'; u.personajes[1].sexo = 'mujer';
  u.tieneSistema = true;
  VZ.asignarVoces(u, VOCES);
  assert.equal(VOCES.find(v => v.nombre === u.vozSistema).genero, 'mujer', 'la voz del Sistema es de mujer');
  // Proyecto antiguo: la voz del Sistema quedó guardada en una de hombre
  // (se eligió sin mirar el sexo) y regenerar no la cambiaba.
  const viejo = universoValido();
  viejo.personajes[0].sexo = 'hombre'; viejo.personajes[1].sexo = 'mujer';
  viejo.tieneSistema = true;
  viejo.personajes[0].voz = 'Puck'; viejo.personajes[1].voz = 'Kore';
  viejo.vozSistema = 'Charon';
  const conSistema = { lineas: [{ tipo: 'sistema', personaje: null, texto: 'Misión.' }], voz: { tramos: [{ ruta: 'r' }], version: VZ.VERSION_VOZ } };
  const sinSistema = { lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Hola.' }], voz: { tramos: [{ ruta: 'r' }], version: VZ.VERSION_VOZ } };
  assert.equal(VZ.asignarVoces(viejo, VOCES, [conSistema, sinSistema]), true, 'la sustitución cuenta como cambio');
  assert.equal(VOCES.find(v => v.nombre === viejo.vozSistema).genero, 'mujer', 'la voz de hombre se sustituye por una de mujer');
  assert.equal(conSistema.voz.obsoleta, true, 'la escena grabada con la voz vieja queda marcada para rehacer');
  assert.ok(!sinSistema.voz.obsoleta, 'una escena sin líneas del Sistema no se toca');
  assert.equal(VZ.asignarVoces(viejo, VOCES), false, 'una vez sustituida, no se cambia sola');
});

test('voces: la escena entera se genera por tramos y solo se guarda cuando están todos', async () => {
  const datos = { formulario, universo: universoValido() };
  datos.universo.personajes[0].sexo = 'hombre'; datos.universo.personajes[1].sexo = 'mujer';
  const escena = { id: 'e1', lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Hola.' }, { tipo: 'dialogo', personaje: 'c2', texto: 'Adiós.' }] };
  respuestas = [{ cuerpo: { voces: VOCES } }, { cuerpo: { ruta: 'r/voz-e1-1.wav', url: 'u', segundos: 2.4 } }, { cuerpo: { ruta: 'r/voz-e1-2.wav', url: 'u', segundos: 1.1 } }];
  let guardados = 0;
  await VZ.vozEscena({ proyectoId: 'pabc12345', datos, escena, control: crearControl(), guardar: async () => { guardados++; } });
  assert.equal(llamadas[1].url, '/api/voz');
  assert.equal(llamadas[1].cuerpo.registro, undefined, 'Chirp no lleva instrucción de estilo');
  assert.equal(llamadas[1].cuerpo.voz, datos.universo.personajes[0].voz);
  assert.deepEqual(llamadas[1].cuerpo.lineas, ['Hola.'], 'solo lo que se dice, sin nombres');
  assert.equal(llamadas[2].cuerpo.voz, datos.universo.personajes[1].voz);
  assert.equal(llamadas[1].cuerpo.clave, 'voz-e1-1');
  assert.deepEqual(escena.voz.tramos.map(t => t.lineas), [[0], [1]]);
  assert.equal(escena.voz.version, VZ.VERSION_VOZ);
  assert.ok(VZ.vozVigente(escena));
  assert.ok(!VZ.vozVigente({ voz: { tramos: [{}] } }), 'las voces de la versión anterior se rehacen');
  assert.ok(!VZ.vozVigente({ voz: { tramos: [{}], version: 2 } }), 'las voces de Gemini se rehacen con Chirp');
  assert.ok(guardados >= 1);
});

test('subtítulos: el texto del guion con los tiempos reales; si casa poco, reparto proporcional; frases cortas', () => {
  const t = SU.alinearTramo(['Arrodíllate, inútil.', 'Nunca lo haré.'], [
    { palabra: 'arrodíllate', inicio: 0.1, fin: 0.8 }, { palabra: 'inútil', inicio: 0.9, fin: 1.4 },
    { palabra: 'nunca', inicio: 2.0, fin: 2.3 }, { palabra: 'lo', inicio: 2.3, fin: 2.4 }, { palabra: 'haré', inicio: 2.4, fin: 2.9 }], 3.2);
  assert.deepEqual(t.map(x => [x.inicio, x.fin, x.metodo]), [[0.1, 1.4, 'alineado'], [2.0, 2.9, 'alineado']]);
  const p = SU.alinearTramo(['Uno dos tres.', 'Cuatro.'], [], 4);
  assert.deepEqual(p.map(x => [x.inicio, x.fin]), [[0, 3], [3, 4]]);
  const frases = SU.frasesDeLinea('Hoy pagas la deuda. ¿Me oyes?', 1, 3);
  assert.deepEqual(frases.map(f => f.texto), ['Hoy pagas la deuda.', '¿Me oyes?']);
  assert.equal(frases[0].inicio, 1);
  assert.ok(Math.abs(frases.at(-1).fin - 3) < 1e-9);
});

test('música: un acto por bloque (la prueba de 3 min se parte en dos); pieza larga en inglés con línea de tiempo y sin estilos prohibidos', () => {
  const ep = { bloques: [{ escenas: [{ id: 'e1', titulo: 'a', accion: 'x', lineas: [{ texto: 'uno dos' }] }, { id: 'e2', titulo: 'b', accion: 'y', lineas: [{ texto: 'tres' }] }] }] };
  const actos = MU.actosDelEpisodio(ep);
  assert.deepEqual(actos.map(a => a.escenas), [['e1'], ['e2']]);
  assert.ok(actos[0].segundosPieza >= 15 && actos[0].segundosPieza <= MU.MAX_PIEZA);
  assert.equal(actos[1].detalle[0].inicio, 0, 'cada acto empieza en 0:00 de su pieza');
  const largo = 'Modern cinematic score in the style of hit Chinese drama soundtracks, polished contemporary studio production. Guzheng, erhu and dizi over full strings and hybrid percussion, 84 BPM, D minor. 0:00-0:20 sparse guzheng and low string pad under the dialogue; 0:20-0:45 pulsing staccato cellos as the debt collector arrives; 0:45-1:05 hybrid percussion builds; 1:05 peak with full strings and taiko hits when he refuses to kneel; 1:15 sudden drop to a single erhu note held as a suspense sting. Leaves space for dialogue, no lead melody while characters speak, warm low end, wide stereo.';
  const r = MU.validarMusica({ pistas: [{ acto: 1, brief: largo }, { acto: 2, brief: 'Música épica con tambores, cuerdas graves y metales que crecen poco a poco hacia el triunfo final del protagonista en la plaza ' + largo }] }, actos);
  assert.ok(r.briefs[1], r.problemas.join('; '));
  assert.ok(r.problemas.some(p => p.includes('español')));
  const corto = MU.validarMusica({ pistas: [{ acto: 1, brief: 'Tense score with taiko drums, guzheng and low strings, slow tempo, rising toward a confrontation.' }] }, [actos[0]]);
  assert.ok(corto.problemas.some(p => p.includes('al menos 90')), 'una descripción corta se reescribe');
  const prohibida = MU.validarMusica({ pistas: [{ acto: 1, brief: largo + ' Never techno.' }] }, [actos[0]]);
  assert.ok(prohibida.problemas.some(p => p.includes('techno')), 'nombrar un estilo prohibido, ni para negarlo, se reescribe');
  const p = P.promptMusica({ formulario, universo: universoValido(), biblia: { identidadMusical: 'x' } }, actos);
  assert.match(p.mensaje, /SONIDO DE PARTIDA PARA ESTE GÉNERO/);
  assert.match(p.mensaje, /\[0:00\]/, 'el director ve el minuto de cada escena');
  assert.match(p.mensaje, /Premisa:/, 'y la historia entera');
});

test('montaje: cada escena dura su narración, los planos sin ancla se reparten por peso, voces y música en su instante, sin duplicar el Sistema', () => {
  const datos = { formulario, universo: universoValido(), episodios: { 1: { estado: 'completo', musica: { 1: { ruta: 'r/m1.mp3', brief: 'x', version: MU.VERSION_MUSICA } }, bloques: [{ escenas: [
    { id: 'e1', titulo: 'La deuda', lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Hola. ¿Me oyes?' }, { tipo: 'sistema', personaje: null, texto: 'Misión cumplida.' }],
      voz: { version: VZ.VERSION_VOZ, tramos: [{ ruta: 'r/v1.wav', segundos: 2, lineas: [0], tiempos: [{ inicio: 0.1, fin: 1.9 }] }, { ruta: 'r/v2.wav', segundos: 1, lineas: [1] }] },
      planos: [{ peso: 3, tipo: 'accion', imagen: { ruta: 'r/p1.png' }, video: { ruta: 'r/p1.mp4' }, sistema: 'Misión cumplida.' }, { peso: 1, tipo: 'cobertura', imagen: { ruta: 'r/p2.png' } }] },
  ] }] } } };
  const h = MO.hojaDeVideo(datos, 1);
  const D = MO.ENTRADA + 2 + MO.PAUSA + 1 + MO.COLA;
  assert.ok(Math.abs(h.planos.reduce((n, p) => n + p.duracion, 0) - D) < 0.01, 'la escena dura su narración');
  assert.deepEqual(h.planos.map(p => p.tipo), ['video', 'imagen']);
  assert.ok(h.planos[0].duracion > h.planos[1].duracion, 'el peso manda');
  assert.equal(h.planos[0].sistema, 'Misión cumplida.');
  assert.deepEqual(h.voces.map(v => v.inicio), [MO.ENTRADA, Number((MO.ENTRADA + 2 + MO.PAUSA).toFixed(3))]);
  assert.deepEqual(h.subtitulos.map(s => s.texto), ['Hola.', '¿Me oyes?'], 'el panel del Sistema no se repite abajo');
  assert.equal(h.subtitulos[0].inicio, Number((MO.ENTRADA + 0.1).toFixed(3)));
  assert.equal(h.musica.length, 1);
  assert.equal(h.musica[0].inicio, 0);
  // Sin imagen o sin voz no se monta, y se dice qué falta.
  datos.episodios[1].bloques[0].escenas[0].planos[1].imagenObsoleta = true;
  assert.throws(() => MO.hojaDeVideo(datos, 1), /Falta la imagen del plano 2/);
  const zip = MO.hojaDeZip(datos, 1);
  // Numeración global por toma: imagen y video de la misma toma comparten número.
  assert.ok(zip.archivos.some(a => a.nombre === 'videos/toma-001.mp4'));
  assert.ok(zip.archivos.some(a => a.nombre === 'imagenes/toma-001.png'));
  assert.ok(zip.archivos.some(a => a.nombre === 'musica/acto-1.mp3'));
  assert.ok(zip.textos.some(t => t.nombre === 'guion.txt' && /ESCENA 1 — La deuda/.test(t.contenido)));
  assert.ok(zip.textos.some(t => t.nombre === 'guia.txt' && /Toma 001/.test(t.contenido)));
  assert.ok(zip.textos.some(t => t.nombre === 'subtitulos.srt' && /Hola\./.test(t.contenido)), 'el SRT va siempre en el paquete, para CapCut');
  assert.ok(!zip.archivos.some(a => a.nombre.startsWith('voces/')), 'las voces sueltas no van en el ZIP');
  // Las voces van como PIEZAS para un solo audio CONTINUO: sin tiempos
  // por palabra, cada línea es una pieza con su corte dentro del tramo.
  assert.equal(zip.voces.length, 2, 'las voces van como piezas para un solo audio continuo');
  assert.deepEqual(zip.voces[0], { ruta: 'r/v1.wav', desde: 0.1, hasta: 1.9 });
  // Diálogos sueltos por línea, apuntando a su rango de piezas: el
  // servidor los arma uniendo las mismas piezas del audio continuo.
  assert.equal(zip.dialogos.length, 2);
  assert.deepEqual(zip.dialogos[0], { nombre: 'dialogos/dialogo-001.wav', piezas: [0, 0] });
  assert.equal(zip.dialogos[1].nombre, 'dialogos/dialogo-002.wav');
  assert.ok(zip.textos.some(t => t.nombre === 'guia.txt' && /Diálogo 001 — Lin Feng/.test(t.contenido) && /Diálogo 002 — Sistema/.test(t.contenido)), 'la guía lista los diálogos con su archivo');
});

test('montaje: el audio continuo parte cada línea por sus pausas internas (piezas)', () => {
  // Palabras con una pausa de 1,1 s en medio: la línea se parte en dos
  // piezas y cada borde conserva solo BORDE_PIEZA de la pausa.
  const palabras = [
    { inicio: 0.2, fin: 0.8 }, { inicio: 0.9, fin: 1.5 },
    { inicio: 2.6, fin: 3.2 }, { inicio: 3.3, fin: 4.0 },
  ];
  const piezas = MO.piezasDeLinea(palabras, 0, 4.5);
  assert.equal(piezas.length, 2, 'una pausa mayor que el corte parte la línea');
  assert.ok(Math.abs(piezas[0].desde - 0.14) < 0.001 && Math.abs(piezas[0].hasta - 1.56) < 0.001, 'la primera pieza llega hasta la última palabra antes de la pausa, más el borde');
  assert.ok(Math.abs(piezas[1].desde - 2.54) < 0.001 && Math.abs(piezas[1].hasta - 4.06) < 0.001, 'la segunda arranca en la palabra tras la pausa, menos el borde: entre piezas quedan 0,12 s, no 1,1');
  // Sin pausa larga, una sola pieza; sin palabras, la línea entera.
  assert.equal(MO.piezasDeLinea([{ inicio: 0.2, fin: 0.8 }, { inicio: 0.9, fin: 1.5 }], 0, 2).length, 1);
  assert.deepEqual(MO.piezasDeLinea([], 0.5, 2), [{ desde: 0.5, hasta: 2 }]);
  // En la hoja del ZIP, una línea con pausa interna aporta DOS piezas y
  // su diálogo suelto apunta a las dos.
  const datos = { formulario, universo: universoValido(), episodios: { 1: { estado: 'completo', musica: {}, bloques: [{ escenas: [
    { id: 'e1', titulo: 'La deuda', lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Primera parte. Segunda parte.' }],
      voz: { version: VZ.VERSION_VOZ, tramos: [{ ruta: 'r/v1.wav', segundos: 4.5, lineas: [0], tiempos: [{ inicio: 0, fin: 4.5 }], palabras }] },
      planos: [{ peso: 1, tipo: 'accion', imagen: { ruta: 'r/p1.png' } }] },
  ] }] } } };
  const zip = MO.hojaDeZip(datos, 1);
  assert.equal(zip.voces.length, 2, 'la línea partida aporta dos piezas al audio continuo');
  assert.deepEqual(zip.dialogos[0].piezas, [0, 1], 'y su diálogo suelto cubre las dos');
});

test('video: en pensamiento la narración no sale de nadie en pantalla (labios quietos)', () => {
  const u = universoValido();
  const datos = { universo: u };
  const escena = { lineas: [
    { tipo: 'dialogo', personaje: 'c2', texto: 'Ríndete de una vez.' },
    { tipo: 'pensamiento', personaje: 'c1', texto: 'Si me rindo ahora, lo pierdo todo.' },
  ] };
  const vozP = V.vozDelPlano(datos, escena, { ancla: 'Si me rindo ahora' });
  const piensa = V.promptVideo({ movimiento: 'Lin Feng looks down.' }, u.escenarios[0], { voz: vozP });
  assert.match(piensa, /voice INSIDE Lin Feng's head/, 'la narración es una voz dentro de la cabeza');
  assert.match(piensa, /lips pressed together and perfectly still/, 'labios pegados y quietos todo el clip');
  assert.ok(piensa.endsWith(V.AUDIO_EN_OFF), 'el audio se describe como voz en off que no sale de nadie visible');
  assert.match(V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozP }), /lip movement/, 'el movimiento de labios va prohibido por su nombre');
  const vozD = V.vozDelPlano(datos, escena, { ancla: 'Ríndete de una vez' });
  assert.ok(!V.negativoVideo({ movimiento: '' }, u.escenarios[0], { voz: vozD }).includes('lip movement'), 'en diálogo la boca SÍ se mueve: no se prohíbe');
});

test('desglose: un ancla que parte una frase se rechaza; la de frases completas pasa', () => {
  const u = universoValido();
  const escena = escenaDePrueba();
  escena.lineas = [
    { tipo: 'dialogo', personaje: 'c2', texto: 'Entrégame la caja ahora mismo. No tienes salida, muchacho.' },
    { tipo: 'pensamiento', personaje: 'c1', texto: 'Si la entrego, pierdo todo lo que tengo.' },
  ];
  const bueno = desgloseValido(escena);
  bueno.escenas[0].planos[0].ancla = 'Entrégame la caja ahora mismo.';
  assert.ok(!D.validarDesglose(bueno, [escena], u).problemas.some(p => p.includes('parte una frase')), 'una oración completa es un ancla válida');
  const partido = desgloseValido(escena);
  partido.escenas[0].planos[0].ancla = 'Entrégame la caja ahora';
  const r = D.validarDesglose(partido, [escena], u);
  assert.ok(r.problemas.some(p => p.includes('parte una frase')), 'media oración se rechaza: la narración completa no cabría en el plano');
  const fallos = D.fallosDeCampo(r.problemas.filter(p => p.includes('parte una frase')));
  assert.equal(fallos?.[0]?.campo, 'ancla', 'y el corrector dirigido puede arreglarla sin rehacer el desglose');
});

test('montaje anclado: la frase siguiente entra sobre la reacción y su plano llega un poco después', () => {
  const u = universoValido();
  const datos = { formulario, universo: u, episodios: { 1: { estado: 'completo', musica: {}, bloques: [{ escenas: [
    { id: 'e1', titulo: 'La deuda', lineas: [{ tipo: 'dialogo', personaje: 'c1', texto: 'Primera frase corta aquí.' }, { tipo: 'dialogo', personaje: 'c2', texto: 'Segunda frase corta aquí.' }],
      voz: { version: VZ.VERSION_VOZ, tramos: [{ ruta: 'r/v1.wav', segundos: 4, lineas: [0, 1], tiempos: [{ inicio: 0, fin: 2 }, { inicio: 2, fin: 4 }] }] },
      planos: [
        { peso: 1, tipo: 'accion', ancla: 'Primera frase corta', imagen: { ruta: 'r/p1.png' }, video: { ruta: 'r/p1.mp4' } },
        { peso: 1, tipo: 'cobertura', ancla: 'Segunda frase corta', imagen: { ruta: 'r/p2.png' } },
      ] },
  ] }] } } };
  const h = MO.hojaDeVideo(datos, 1);
  // Frase 1 empieza tras la entrada y dura 2 s; la frase 2 empieza cuando
  // termina la 1, pero su plano llega ADEL_VOZ después (la voz entra sobre
  // la reacción del plano 1). El primer plano dura hasta ese inicio
  // retrasado y el segundo cubre hasta el final de la escena.
  const inicioPlano2 = MO.ENTRADA + 2 + MO.ADEL_VOZ;
  assert.ok(Math.abs(h.planos[0].duracion - inicioPlano2) < 0.01, `el primer plano dura hasta que llega el segundo, salió ${h.planos[0].duracion}`);
  assert.ok(Math.abs(h.planos[1].duracion - (MO.ENTRADA + 4 + MO.COLA - inicioPlano2)) < 0.01, `el segundo plano cubre hasta el final, salió ${h.planos[1].duracion}`);
  assert.ok(Math.abs(h.planos.reduce((n, p) => n + p.duracion, 0) - (MO.ENTRADA + 4 + MO.COLA)) < 0.01);
  // Los huecos del montaje son la respiración mínima, no pausas muertas.
  assert.ok(MO.ENTRADA <= 0.2 && MO.PAUSA <= 0.1 && MO.COLA <= 0.2, 'entrada, pausa y cola cortas');
});

test('episodios encadenados: el episodio 2 conoce lo que pasó y sus escenas tienen ids propios (no hereda medios)', async () => {
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'ocre', ritmoNarrativo: 'rápido' }, episodioActual: 2, episodios: {
    1: { estado: 'completo', nota: { quedaAbierto: 'el padre sigue preso' }, bloques: [{ resumen: 'Lin Feng cura al hijo de Wang Hu.', escenas: [] }] } } };
  const p = P.promptNota(datos, 2).mensaje;
  assert.match(p, /LO QUE YA PASÓ EN LOS EPISODIOS ANTERIORES/);
  assert.match(p, /Episodio 1: Lin Feng cura al hijo de Wang Hu\. Quedó abierto: el padre sigue preso/);
  respuestas = [texto({ objetivo: 'a', curvaEmocional: 'b', imagenClave: 'c', notaDeDireccion: 'd', quedaAbierto: '' }), texto(bloqueValido())];
  const ep = await G.escribirGuion(datos, 2, { guardar: async () => {} });
  assert.match(llamadas[1].cuerpo.mensaje, /LO QUE YA PASÓ EN LOS EPISODIOS ANTERIORES/);
  assert.deepEqual(ep.bloques[0].escenas.map(e => e.id), ['ep2e1', 'ep2e2']);
});

test('montaje: los planos nunca bajan del mínimo; si no caben, la escena se alarga lo justo', () => {
  const r = MO.repartir([3, 1, 1], 6);
  assert.ok(Math.abs(r.durs.reduce((a, b) => a + b, 0) - 6) < 1e-9);
  assert.ok(r.durs[0] > r.durs[1]);
  const apretado = MO.repartir(Array(10).fill(1).concat([20]), 3);
  assert.ok(apretado.durs.every(d => d >= MO.MINIMO_PLANO - 1e-9));
  assert.equal(apretado.total, 11 * MO.MINIMO_PLANO);
  const u = universoValido();
  assert.equal(I.sexoDe({ appearance: 'a tall young man with short hair' }), 'hombre');
  assert.equal(I.sexoDe({ aspecto: 'Mujer de pelo largo' }), 'mujer');
  assert.equal(I.sexoDe({ appearance: 'short black hair' }), '');
});

test('guion: si un bloque sale corto en todos los intentos, el reintento dice cuánto falta y al final se escribe en dos partes', async () => {
  const datos = { formulario, universo: universoValido(), biblia: { direccionVisual: 'ocre', ritmoNarrativo: 'rápido' }, episodios: {} };
  const corto = () => texto(bloqueValido({ palabras: 100 }));
  respuestas = [texto({ objetivo: 'a', curvaEmocional: 'b', imagenClave: 'c', notaDeDireccion: 'd', quedaAbierto: '' }),
    corto(), corto(), corto(), corto(), texto(bloqueValido()), texto(bloqueValido({ apertura: false }))];
  const avisos = [];
  const ep = await G.escribirGuion(datos, 1, { guardar: async () => {}, aviso: a => avisos.push(a) });
  assert.match(llamadas[2].cuerpo.mensaje, /TE FALTARON \d+ PALABRAS/);
  assert.equal(ep.plan.length, 2, 'el bloque se partió en dos');
  assert.equal(ep.bloques.length, 2);
  assert.equal(ep.estado, 'completo');
  assert.ok(avisos.some(a => /lo escribo en dos partes/.test(a)));
  assert.match(llamadas[1].cuerpo.mensaje, /escribe entre \d+ y \d+ escenas completas/);
});

test('guion: en una historia con Sistema, sus propias líneas prueban el subgénero y el elemento especial', () => {
  const f = { ...formulario, genero: 'sistema_juego', subgeneros: ['sistema_awakening'] };
  const u = G.validarUniverso({ ...universoCrudo, sistema: { nombre: 'Sistema', reglaDelJuego: 'x' } }, f).universo;
  const b = bloqueValido();
  b.escenas[0].lineas.splice(1, 0, { tipo: 'sistema', personaje: null, texto: 'Sistema activado. Misión: sobrevive esta noche.' });
  delete b.huellas;
  b.apertura.citaElemento = 'una cita que no aparece en ningún sitio del texto';
  const { problemas } = G.validarBloque(b, ctx({ universo: u, genero: f.genero, huellas: P.huellasPedidas(f) }));
  assert.deepEqual(problemas, []);
});

test('guion: la apertura entra con la voz del protagonista desde el segundo 0', () => {
  // El bloque válido abre el antagonista y la segunda línea ya es el
  // protagonista pensando: se acepta. Si el protagonista no aparece ni
  // en las dos primeras líneas, se rechaza (apertura muda o ajena).
  assert.deepEqual(G.validarBloque(bloqueValido(), ctx()).problemas, []);
  const tarde = bloqueValido();
  tarde.escenas[0].lineas[1] = { ...tarde.escenas[0].lineas[3] };
  assert.ok(G.validarBloque(tarde, ctx()).problemas.some(p => p.includes('voz del protagonista')));
});

test('inspiración: Gemini mira el video COMPLETO en trozos de 20 min y se arma su historia, no un concepto', async () => {
  const INS = await import('../estudio/inspiracion.mjs');
  assert.equal(INS.TROZO_S, 1200, 'cada mirada dura 20 minutos');
  assert.deepEqual(INS.trozosDeVideo(3600), [[0, 1200], [1200, 2400], [2400, 3600]], 'una hora son 3 trozos');
  assert.equal(INS.trozosDeVideo(7839).length, 7, 'un video de 2 h 10 min se mira ENTERO: 7 trozos');
  assert.equal(INS.trozosDeVideo(999999).length, INS.MAX_TROZOS, 'con un tope de seguridad');
  const historiaLarga = 'El protagonista despierta arruinado en un pueblo que no conoce, con una libreta que convierte lo que escribe en objetos reales. Primero cambia comida por monedas, luego paga la deuda de su familia adoptiva, después el terrateniente intenta robarle la libreta y él lo desenmascara ante todo el pueblo. Cada ciclo gana más, pero la libreta se agota: al final del video sacrifica su última página para salvar a la muchacha que lo ayudó desde el primer día.';
  respuestas = [
    { cuerpo: { titulo: 'Video viral', duracion: 3600 } },
    { cuerpo: { resumen: 'Historia del primer trozo: el despertar y la primera ganancia con la libreta.' } },
    { cuerpo: { resumen: 'Historia del segundo trozo: paga la deuda y el mecanismo crece.' } },
    { cuerpo: { resumen: 'Historia del tercer trozo: el robo, la caída y el sacrificio final.' } },
    texto({ historia: historiaLarga }),
  ];
  const { texto: historia, titulo } = await INS.historiaDesdeEnlace('https://youtu.be/abcdefghijk', { aviso: () => {} });
  assert.equal(titulo, 'Video viral');
  assert.match(historia, /libreta/);
  assert.match(historia, /sacrifica su última página/, 'vuelve LA HISTORIA del video, en orden, no una premisa suelta');
  assert.equal(llamadas[0].url, '/api/inspiracion');
  assert.deepEqual(llamadas.slice(1, 4).map(l => [l.url, l.cuerpo.desde, l.cuerpo.hasta]), [
    ['/api/inspiracion', 0, 1200],
    ['/api/inspiracion', 1200, 2400],
    ['/api/inspiracion', 2400, 3600],
  ]);
});

test('inspiración: si el video dura menos, se piden solo los trozos que lo cubren', async () => {
  const INS = await import('../estudio/inspiracion.mjs');
  const historiaCorta = 'Una cocinera despedida abre un puesto callejero con la receta de su abuela, el dueño del restaurante que la despidió intenta cerrarlo dos veces y ella lo supera con la fila de clientes que crece cada día, hasta que al final del video le ofrecen sociedad en el local de enfrente y acepta con sus condiciones.';
  respuestas = [
    { cuerpo: { titulo: 'Video corto', duracion: 2000 } },
    { cuerpo: { resumen: 'Historia del primer trozo: el despido y el puesto.' } },
    { cuerpo: { resumen: 'Historia del segundo trozo: los dos intentos de cierre y la oferta.' } },
    texto({ historia: historiaCorta }),
  ];
  const { texto: historia } = await INS.historiaDesdeEnlace('https://youtu.be/abcdefghijk', { aviso: () => {} });
  assert.match(historia, /cocinera despedida/);
  assert.equal(llamadas.filter(l => l.cuerpo?.desde !== undefined).length, 2, 'un video de 2000 s son solo 2 trozos');
});

test('sesión: cada petición lleva el token vigente y un 401 fuerza uno nuevo y repite una vez', async () => {
  const red = await import('../estudio/red.mjs');
  const pedidos = [];
  red.usarToken(async forzar => (forzar ? 'nuevo.token.b' : 'viejo.token.a'));
  const cabeceras = [];
  globalThis.fetch = async (url, opciones) => {
    cabeceras.push(opciones.headers.Authorization);
    pedidos.push(url);
    return cabeceras.length === 1
      ? new Response(JSON.stringify({ error: 'Entra con tu cuenta de Google para continuar.' }), { status: 401 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const r = await red.llamar('/api/imagen', { metodo: 'POST', cuerpo: { a: 1 } });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(cabeceras, ['Bearer viejo.token.a', 'Bearer nuevo.token.b']);
    // Si el token nuevo también es rechazado, el error llega con su 401 (sin bucle).
    cabeceras.length = 0;
    globalThis.fetch = async (url, opciones) => { cabeceras.push(opciones.headers.Authorization); return new Response(JSON.stringify({ error: 'no' }), { status: 401 }); };
    await assert.rejects(red.llamar('/api/texto'), e => e.status === 401);
    assert.equal(cabeceras.length, 2);
  } finally {
    red.usarToken(null);
  }
});
