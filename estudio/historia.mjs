// ════════════════════════════════════════════════════════════════
// HISTORIA — el único formulario de creación, las tres ideas, el universo
// y el guion (sección 20.1).
//
// Robustez heredada del estudio de anime (sección 20.3):
//  · Los redibujados van en fila: nunca se pinta el formulario dos veces.
//  · El formulario no se reconstruye mientras se escribe en él: se pinta al
//    abrir o cambiar de proyecto, no en cada refresco.
//  · Abrir una pantalla solo lee; generar es siempre un botón.
//  · Una acción principal por contexto.
// ════════════════════════════════════════════════════════════════
import { GENEROS, SUBGENEROS, PUBLICOS, FORMATOS, SUBGENEROS_ADULTOS, PARES_EXCLUYENTES } from './catalogo.mjs';
import { proyectoActual, empezar, guardar, abrir, cerrar, nombreDe } from './proyectos.mjs';
import { generarIdeas, generarUniverso, escribirGuion, segundosDelEpisodio, validarBiblia } from './guion.mjs';
import { crearControl, pedirTexto, parsearJSON } from './texto.mjs';
import { historiaDesdeEnlace } from './inspiracion.mjs';
import { promptBiblia } from './prompts.mjs';
import { explicar } from './red.mjs';
import { escapar, avisar } from './interfaz.mjs';

const VISIBLES = 8;   // subgéneros a la vista; el resto bajo «Más subgéneros»
let raiz = null;
let ocupado = null;    // { etiqueta, control, aviso, donde }
let ultimoError = null; // { donde, texto }
let formularioPintadoPara = undefined;
let fila = Promise.resolve();

const minutos = s => Math.max(1, Math.round(s / 60));
const nombrePersonaje = (u, id, nombre) => id === 'extra' ? (nombre || 'Extra') : (u.personajes.find(p => p.id === id)?.nombre || id);

export function montarHistoria(contenedor) {
  raiz = contenedor;
  raiz.addEventListener('click', alPulsar);
  raiz.addEventListener('change', alCambiar);
  pintar();
}

// ─── Pintado en fila ───
export function pintar() {
  fila = fila.then(() => new Promise(listo => requestAnimationFrame(() => { pintarAhora(); listo(); })));
  return fila;
}

function pintarAhora() {
  if (!raiz) return;
  const p = proyectoActual();
  const d = p?.datos;
  // El formulario solo se reconstruye al cambiar de proyecto.
  const clave = p ? p.id + (d?.universo ? ':u' : '') : null;
  if (formularioPintadoPara !== clave || !raiz.querySelector('#h-formulario')) {
    raiz.innerHTML = `<div id="h-formulario"></div><div id="h-ideas"></div><div id="h-universo"></div><div id="h-guion"></div>`;
    raiz.querySelector('#h-formulario').innerHTML = htmlFormulario(d);
    formularioPintadoPara = clave;
    aplicarReglasDeChips();
  }
  // Lo que cambia dentro del formulario se pinta aparte, sin tocar lo escrito.
  const estadoForm = raiz.querySelector('#h-form-estado');
  if (estadoForm) estadoForm.innerHTML = cajaError('formulario') + cajaProgreso('formulario');
  const botonIdeas = raiz.querySelector('#h-boton-ideas');
  if (botonIdeas) botonIdeas.textContent = d?.formulario?.importadaDe && !d?.universo
    ? 'Crear esta historia y escribir su guion'
    : d?.ideas?.length ? 'Otras tres ideas' : 'Generar tres ideas';
  raiz.querySelector('#h-ideas').innerHTML = htmlIdeas(d);
  raiz.querySelector('#h-universo').innerHTML = htmlUniverso(d);
  raiz.querySelector('#h-guion').innerHTML = htmlGuion(d);
  actualizarPortada();
  raiz.querySelectorAll('[data-accion]').forEach(b => { if (ocupado && !b.dataset.libre) b.disabled = true; });
}

function actualizarPortada() {
  const boton = document.getElementById('btnPortada');
  if (!boton) return;
  const abierto = Boolean(proyectoActual()?.datos?.ideas?.length);
  boton.querySelector('span').textContent = abierto ? 'Nuevo drama' : 'Comenzar ahora';
  boton.disabled = Boolean(ocupado);
}

function cajaError(donde) {
  if (ultimoError?.donde !== donde) return '';
  return `<div class="caja-error" role="alert">${escapar(ultimoError.texto).replace(/\n/g, '<br>')}</div>`;
}

function cajaProgreso(donde) {
  if (ocupado?.donde !== donde) return '';
  return `<div class="progreso-caja" aria-live="polite">
    <div class="progreso-linea"><span class="spinner"></span><span id="h-aviso">${escapar(ocupado.aviso || ocupado.etiqueta)}</span></div>
    ${ocupado.total ? `<div class="barra"><div style="width:${Math.round(100 * (ocupado.hecho || 0) / ocupado.total)}%"></div></div>` : ''}
    <button type="button" class="btn-sec" data-accion="detener" data-libre="1">Detener</button>
  </div>`;
}

// ─── Formulario ───
function htmlFormulario(d) {
  const f = d?.formulario || { publico: 'masculino', genero: 'transmigracion', subgeneros: [], formato: '9:16', duracion: 3, cierre: 'completo', concepto: '' };
  if (d?.universo) {
    const g = GENEROS.find(x => x.valor === f.genero)?.etiqueta.split(' — ')[0];
    const pub = PUBLICOS.find(x => x.valor === f.publico)?.etiqueta.split(' — ')[0];
    const subs = f.subgeneros.map(s => SUBGENEROS.find(x => x.valor === s)?.etiqueta.replace(/^[^\p{L}]+/u, '')).filter(Boolean);
    return `<div class="seccion"><h3>${escapar(nombreDe(d))}</h3></div>
      <p class="nota resumen-eleccion">${escapar(pub)} · ${escapar(g)}${subs.length ? ' · ' + escapar(subs.join(', ')) : ''} · ${f.formato} · ${f.duracion === 0.5 ? 'piloto de 30 s' : f.duracion === 3 ? 'prueba de 3 min' : '30 min'} · cierre ${f.cierre === 'suspenso' ? 'en suspenso' : 'completo'}</p>`;
  }
  const opcion = (lista, actual) => lista.map(x => `<option value="${x.valor}"${String(x.valor) === String(actual) ? ' selected' : ''}>${escapar(x.etiqueta)}</option>`).join('');
  const chip = s => `<label class="chip${f.subgeneros.includes(s.valor) ? ' activo' : ''}"><input type="checkbox" value="${s.valor}"${f.subgeneros.includes(s.valor) ? ' checked' : ''}><span>${escapar(s.etiqueta)}</span></label>`;
  return `<div class="seccion"><h3>Nuevo drama</h3></div>
  <div class="card formulario" id="h-form">
    <label class="campo">Público<select name="publico">${opcion(PUBLICOS, f.publico)}</select></label>
    <label class="campo">Género principal<select name="genero">${opcion(GENEROS, f.genero)}</select></label>
    <div class="campo">Subgéneros <span class="nota">(puedes marcar varios)</span>
      <div class="chips">${SUBGENEROS.slice(0, VISIBLES).map(chip).join('')}</div>
      <details class="mas"${f.subgeneros.some(s => SUBGENEROS.findIndex(x => x.valor === s) >= VISIBLES) ? ' open' : ''}><summary>Más subgéneros</summary>
        <div class="chips">${SUBGENEROS.slice(VISIBLES).map(chip).join('')}</div></details>
      <p class="nota" id="h-nota-familia" hidden>Con «Para toda la familia» no se pueden usar Ecchi, Harem, Harem inverso ni Gore.</p>
    </div>
    <label class="campo">Formato de pantalla<select name="formato">${opcion(FORMATOS, f.formato)}</select></label>
    <label class="campo">Duración<select name="duracion">
      <option value="0.5"${f.duracion === 0.5 ? ' selected' : ''}>Piloto de 30 segundos (prueba rápida)</option>
      <option value="3"${f.duracion === 3 ? ' selected' : ''}>Prueba de 3 minutos</option>
      <option value="30"${f.duracion === 30 ? ' selected' : ''}>Episodio de 30 minutos</option></select></label>
    <label class="campo">Cierre<select name="cierre">
      <option value="completo"${f.cierre !== 'suspenso' ? ' selected' : ''}>Completo: la historia termina</option>
      <option value="suspenso"${f.cierre === 'suspenso' ? ' selected' : ''}>En suspenso: gancho para el siguiente episodio</option></select></label>
    <label class="campo">Tu concepto <span class="nota">(opcional)</span><textarea name="concepto" rows="4" placeholder="Una situación, un personaje, una época…">${escapar(f.concepto)}</textarea></label>
    <div class="campo">¿Partir de un video que ya funciona? <span class="nota">(opcional)</span>
      <input type="url" name="enlace" placeholder="Pega aquí el enlace de YouTube" inputmode="url">
      <button type="button" class="btn-sec ancho" data-accion="inspiracion">Traer la historia de ese video</button>
      <p class="nota">Gemini mira ese video COMPLETO, en trozos de 20 minutos, y escribe su historia entera arriba, en «Tu concepto»: la misma historia, en su orden, con sus giros y recompensas. Con un video no hay tres ideas: el botón grande crea esta historia y escribe su guion directamente, con personajes y lugares nuevos. Puede tardar unos minutos.</p>
      ${f.importadaDe ? `<p class="nota oro">Historia traída${f.importadaDe.titulo ? ` de «${escapar(f.importadaDe.titulo)}»` : ''}: el botón grande produce ESTA historia, sin pasar por las tres ideas.</p>
      <button type="button" class="btn-sec ancho" data-accion="quitar-importada">Quitar el video y escribir mi propio concepto</button>` : ''}
    </div>
    <div id="h-form-estado"></div>
    <button type="button" class="btn ancho" data-accion="ideas" id="h-boton-ideas">Generar tres ideas</button>
  </div>`;
}

function leerFormulario() {
  const form = raiz.querySelector('#h-form');
  const valor = n => form.querySelector(`[name="${n}"]`).value;
  return {
    publico: valor('publico'), genero: valor('genero'),
    subgeneros: [...form.querySelectorAll('.chip input:checked')].map(c => c.value),
    formato: valor('formato'), duracion: Number(valor('duracion')), cierre: valor('cierre'),
    concepto: valor('concepto').trim(),
  };
}

function aplicarReglasDeChips(cambiado) {
  const form = raiz?.querySelector('#h-form');
  if (!form) return;
  const familia = form.querySelector('[name="publico"]').value === 'familia';
  form.querySelectorAll('.chip input').forEach(c => {
    if (cambiado?.checked) {
      for (const par of PARES_EXCLUYENTES) if (par.includes(cambiado.value) && par.includes(c.value) && c !== cambiado && c.checked) {
        c.checked = false;
        avisar(`Se quitó «${c.parentElement.textContent.trim()}»: no se puede combinar con «${cambiado.parentElement.textContent.trim()}».`);
      }
    }
    const adulto = SUBGENEROS_ADULTOS.includes(c.value);
    if (familia && adulto) c.checked = false;
    c.disabled = familia && adulto;
    c.parentElement.classList.toggle('activo', c.checked);
    c.parentElement.classList.toggle('apagado', c.disabled);
  });
  form.querySelector('#h-nota-familia').hidden = !familia;
}

// ─── Ideas ───
function htmlIdeas(d) {
  if (!d?.ideas?.length) return '';
  const tarjetas = d.ideas.map(i => {
    const elegida = d.ideaElegida === i.id;
    return `<div class="card idea${elegida ? ' elegida' : ''}">
      <span class="adorno"></span>
      <h2>${escapar(i.titulo)}</h2>
      <p>${escapar(i.concepto)}</p>
      ${d.universo ? (elegida ? '<p class="nota oro">La historia elegida</p>' : '')
        : `<button type="button" class="btn ancho" data-accion="elegir" data-id="${i.id}">Elegir esta historia</button>`}
    </div>`;
  }).join('');
  const titulo = `<div class="seccion"><h3>Tres ideas</h3></div>`;
  if (d.universo) return `<details class="plegado-ideas"><summary>Ver las ideas propuestas</summary>${tarjetas}</details>`;
  return titulo + cajaError('ideas') + cajaProgreso('ideas') + tarjetas;
}

// ─── Universo ───
function htmlUniverso(d) {
  const u = d?.universo;
  if (!u) return '';
  const lista = v => (Array.isArray(v) ? v : []);
  const b = d.biblia;
  return `<div class="seccion"><h3>Universo</h3></div>
  <div class="card universo">
    <h2>${escapar(u.titulo)}</h2>
    <p class="gancho">${escapar(u.gancho)}</p>
    <h4>Premisa</h4><p>${escapar(u.premisa)}</p>
    <h4>Mundo</h4><p>${escapar(u.mundo)}</p>
    ${u.reglas.length ? `<h4>Reglas</h4><ul>${u.reglas.map(r => `<li>${escapar(r)}</li>`).join('')}</ul>` : ''}
    <h4>La ventaja del protagonista</h4><p>${escapar(u.ventaja)}</p>
    ${u.tieneSistema && u.sistema ? `<h4>Sistema</h4><p><strong>${escapar(u.sistema.nombre)}</strong>: ${escapar(u.sistema.reglaDelJuego)}${u.sistema.cuentaAtras ? ` · Plazo: ${escapar(u.sistema.cuentaAtras)}` : ''}</p>` : ''}
    <h4>Personajes</h4>
    <ul class="personajes">${u.personajes.map(p => `<li><strong>${escapar(p.nombre)}</strong> <span class="nota">${escapar(p.rol)} · ${p.edad} años</span><br>${escapar(p.personalidad)}</li>`).join('')}</ul>
    <h4>Escenarios</h4>
    <ul class="personajes">${u.escenarios.map(e => `<li><strong>${escapar(e.nombre)}</strong><br>${escapar(e.descripcion)}</li>`).join('')}</ul>
    ${b ? `<details class="plegado"><summary>Biblia de la serie (director creativo)</summary>
      <h4>Dirección visual</h4><p>${escapar(b.direccionVisual)}</p>
      <h4>Identidad musical</h4><p>${escapar(b.identidadMusical)}</p>
      <h4>Ritmo narrativo</h4><p>${escapar(b.ritmoNarrativo)}</p>
      <h4>Ritmo de montaje</h4><p>${escapar(b.ritmoMontaje)}</p>
      <h4>Motivos recurrentes</h4><ul>${lista(b.motivosRecurrentes).map(m => `<li>${escapar(m)}</li>`).join('')}</ul>
      <h4>Reglas de oro</h4><ul>${lista(b.reglasDeOro).map(m => `<li>${escapar(m)}</li>`).join('')}</ul>
      <h4>Arco de la temporada</h4><ol>${lista(b.arcoTemporada).map(m => `<li>${escapar(m)}</li>`).join('')}</ol>
    </details>` : `${cajaError('biblia')}${cajaProgreso('biblia')}<p class="nota">Falta la biblia de la serie, que el guion necesita.</p>
      <button type="button" class="btn ancho" data-accion="biblia">Escribir la biblia</button>`}
    ${cajaError('universo')}${cajaProgreso('universo')}
  </div>`;
}

// ─── Guion ───
function htmlGuion(d) {
  const u = d?.universo;
  if (!u || !d.biblia) return '';
  const numero = d.episodioActual || 1;
  const ep = d.episodios?.[numero];
  const bloques = ep?.bloques || [];
  const escenas = bloques.flatMap(b => b.escenas);
  const ciclos = bloques.reduce((n, b) => n + (b.ciclos?.length || 0), 0);
  const total = ep?.plan?.length || 0;
  let accion = '';
  if (!ep || !bloques.length && ep.estado !== 'completo') accion = `<button type="button" class="btn ancho" data-accion="guion">Escribir el guion</button>`;
  else if (ep.estado !== 'completo') accion = `<button type="button" class="btn ancho" data-accion="guion">Seguir escribiendo (bloque ${bloques.length + 1} de ${total})</button>`;
  const resumen = escenas.length
    ? `<p class="nota">≈ ${minutos(segundosDelEpisodio(ep))} min · ${escenas.length} escenas · ${ciclos} ciclos de retención${ep.estado === 'completo' ? ' · guion completo' : ` · ${bloques.length} de ${total} bloques`}</p>` : '';
  const escenasHtml = escenas.map((e, n) => {
    const lugar = u.escenarios.find(x => x.id === e.escenario)?.nombre || '';
    return `<div class="escena">
      <div class="escena-cabeza"><span class="escena-num">Escena ${n + 1}</span><span class="escena-lugar">${escapar(lugar)}</span></div>
      <h4>${escapar(e.titulo)}</h4>
      <p class="accion">${escapar(e.accion)}</p>
      ${e.lineas.map(l => l.tipo === 'sistema'
        ? `<div class="linea sistema"><span class="quien">Sistema</span>${escapar(l.texto)}</div>`
        : `<div class="linea ${l.tipo}"><span class="quien">${escapar(nombrePersonaje(u, l.personaje, l.nombre))}${l.tipo === 'pensamiento' ? ' · piensa' : ''}</span>${escapar(l.texto)}</div>`).join('')}
    </div>`;
  }).join('');
  const numeros = Object.keys(d.episodios || {}).map(Number).sort((a, b) => a - b);
  const siguiente = (numeros.at(-1) || 1) + 1;
  return `<div class="seccion"><h3>Guion · episodio ${numero}</h3></div>
  <div class="card guion">
    ${numeros.length > 1 ? `<div class="episodios">${numeros.map(n => `<button type="button" data-accion="episodio" data-numero="${n}" class="${n === numero ? 'actual' : ''}">Episodio ${n}</button>`).join('')}</div>` : ''}
    ${ep?.nota ? `<details class="plegado"><summary>Nota del director para este episodio</summary>
      <h4>Objetivo</h4><p>${escapar(ep.nota.objetivo)}</p><h4>Curva emocional</h4><p>${escapar(ep.nota.curvaEmocional)}</p>
      <h4>Imagen clave</h4><p>${escapar(ep.nota.imagenClave)}</p><h4>Nota</h4><p>${escapar(ep.nota.notaDeDireccion)}</p></details>` : ''}
    ${resumen}
    ${cajaError('guion')}
    ${cajaProgreso('guion')}
    ${accion}
    ${escenasHtml}
    ${ep?.estado === 'completo' ? `<button type="button" class="btn ancho continuar" data-accion="continuar" data-libre="">Continuar: personajes y escenarios</button>
      ${numero === siguiente - 1 ? `<button type="button" class="btn-sec" data-accion="siguiente">Escribir el episodio ${siguiente}</button>` : ''}
      <button type="button" class="btn-sec" data-accion="rehacer">Rehacer el guion</button>` : ''}
  </div>`;
}

// ─── Acciones ───
function alCambiar(evento) {
  if (evento.target.matches('.chip input')) aplicarReglasDeChips(evento.target);
  if (evento.target.matches('[name="publico"]')) aplicarReglasDeChips();
}

async function alPulsar(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton || boton.disabled) return;
  const accion = boton.dataset.accion;
  if (accion === 'detener') { ocupado?.control.detener(); return; }
  if (ocupado) return;
  if (accion === 'continuar') { document.dispatchEvent(new CustomEvent('ir-a', { detail: 'personajes' })); return; }
  if (accion === 'ideas') {
    // Con una historia traída de un video no hay tres ideas: el botón
    // crea el universo de ESA historia y escribe su guion de una vez.
    const d0 = proyectoActual()?.datos;
    if (d0?.formulario?.importadaDe && !d0?.universo) return trabajar('formulario', 'Creando la historia de ese video', accionHistoriaImportada);
    return trabajar('formulario', 'Escribiendo tres ideas', accionIdeas);
  }
  if (accion === 'inspiracion') return trabajar('formulario', 'Leyendo la historia de ese video', accionInspiracion);
  if (accion === 'quitar-importada') {
    const d = proyectoActual()?.datos;
    if (d?.formulario) { delete d.formulario.importadaDe; d.formulario.concepto = ''; await guardar(); }
    formularioPintadoPara = undefined;
    return pintar();
  }
  if (accion === 'elegir') return trabajar('ideas', 'Desarrollando el universo', o => accionElegir(boton.dataset.id, o));
  if (accion === 'biblia') return trabajar('biblia', 'El director escribe la biblia de la serie', accionBiblia);
  if (accion === 'guion') return trabajar('guion', 'Escribiendo el guion', accionGuion);
  if (accion === 'episodio') {
    proyectoActual().datos.episodioActual = Number(boton.dataset.numero);
    guardar().catch(e => avisar(explicar(e), 'error'));
    return pintar();
  }
  if (accion === 'siguiente') {
    // Episodio nuevo: mismo universo, personajes, lugares y biblia; ningún
    // medio del anterior. Se escribe a continuación de lo que ya pasó.
    const d = proyectoActual().datos;
    d.episodioActual = Math.max(...Object.keys(d.episodios).map(Number)) + 1;
    return trabajar('guion', 'Escribiendo el episodio ' + d.episodioActual, accionGuion);
  }
  if (accion === 'rehacer') {
    if (!confirm('Se escribirá un guion nuevo para este episodio y el actual se sustituye. El universo y los personajes no se tocan. ¿Seguir?')) return;
    const d = proyectoActual().datos;
    const numero = d.episodioActual || 1;
    // El guion anterior no se tira: se guarda aparte por si el nuevo falla.
    d.episodiosAnteriores = [...(d.episodiosAnteriores || []), { numero, episodio: d.episodios[numero], sustituido: Date.now() }].slice(-3);
    delete d.episodios[numero];
    return trabajar('guion', 'Escribiendo el guion', accionGuion);
  }
}

async function trabajar(donde, etiqueta, tarea) {
  const control = crearControl();
  ocupado = { donde, etiqueta, control, aviso: etiqueta };
  ultimoError = null;
  await pintar();
  const opciones = {
    control,
    aviso: texto => { if (ocupado) { ocupado.aviso = texto; const caja = document.getElementById('h-aviso'); if (caja) caja.textContent = texto; } },
    guardar: () => guardar(),
  };
  let destino = null;
  try {
    destino = await tarea(opciones);
  } catch (e) {
    // Si el universo ya quedó creado, el fallo (la biblia) se cuenta allí.
    const lugar = donde === 'ideas' && proyectoActual()?.datos?.universo ? 'biblia' : donde;
    ultimoError = { donde: lugar, texto: e.detenido ? e.message : explicar(e) };
    if (!e.detenido) avisar(e.message, 'error');
  } finally {
    ocupado = null;
    await pintar();
  }
  // Lo recién generado se pone a la vista.
  if (destino) raiz.querySelector(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function accionInspiracion(opciones) {
  const form = raiz.querySelector('#h-form');
  const enlace = form.querySelector('[name="enlace"]').value.trim();
  if (!enlace) throw new Error('Pega primero el enlace del video en su casilla.');
  const { texto, titulo } = await historiaDesdeEnlace(enlace, opciones);
  // La historia queda en el formulario guardado, marcada como traída de
  // ese video: el botón grande la produce directa, sin tres ideas. El
  // formulario se repinta entero para enseñar la marca y el botón nuevo.
  const formulario = leerFormulario();
  formulario.concepto = texto;
  formulario.importadaDe = { enlace, titulo };
  let p = proyectoActual();
  if (!p) p = empezar({ version: 1, formulario });
  p.datos.formulario = formulario;
  await guardar();
  formularioPintadoPara = undefined;
  avisar(`Historia traída${titulo ? ` de «${titulo}»` : ''}. Quedó escrita en «Tu concepto»: revísala si quieres y pulsa «Crear esta historia y escribir su guion».`, 'success');
  return '#h-boton-ideas';
}

// La ruta del enlace: sin ideas. La historia traída ES la elegida: se
// crea su universo y se escribe el guion completo de una vez, como
// pidió el dueño («de una vez agarrar esa idea y generar el guión»).
async function accionHistoriaImportada(opciones) {
  const formulario = leerFormulario();
  let p = proyectoActual();
  if (!p) p = empezar({ version: 1, formulario });
  formulario.importadaDe = p.datos.formulario?.importadaDe;
  p.datos.formulario = formulario;
  const d = p.datos;
  if (!formulario.concepto) throw new Error('La historia del video está vacía: trae el enlace de nuevo o escribe un concepto propio.');
  const idea = { id: 'importada', titulo: formulario.importadaDe?.titulo || 'Historia del video', concepto: formulario.concepto };
  d.ideas = [idea];
  d.ideaElegida = 'importada';
  await guardar();
  await generarUniverso(d, idea, opciones);
  opciones.aviso?.('Universo creado. Escribiendo el guion completo de esta historia…');
  d.episodioActual = 1;
  await escribirGuion(d, 1, {
    ...opciones,
    alAvanzar: () => {
      const ep = d.episodios[1];
      if (ocupado && ep?.plan) { ocupado.total = ep.plan.length; ocupado.hecho = ep.bloques.length; }
      pintar();
    },
  });
  avisar('Guion terminado: es la historia del video, con personajes y lugares nuevos.', 'success');
  return '#h-guion';
}

async function accionIdeas(opciones) {
  const formulario = leerFormulario();
  let p = proyectoActual();
  if (!p) p = empezar({ version: 1, formulario });
  p.datos.formulario = formulario;
  await generarIdeas(p.datos, opciones);
  await guardar();
  avisar('Tres ideas listas. Elige una.', 'success');
  return '#h-ideas';
}

async function accionElegir(id, opciones) {
  const d = proyectoActual().datos;
  const idea = d.ideas.find(i => i.id === id);
  await generarUniverso(d, idea, opciones);
  avisar('Universo y biblia listos.', 'success');
  return '#h-universo';
}

async function accionBiblia(opciones) {
  const d = proyectoActual().datos;
  for (let intento = 0; intento < 3; intento++) {
    const json = parsearJSON(await pedirTexto(promptBiblia(d), opciones));
    const { problemas, biblia } = validarBiblia(json);
    if (!problemas.length) { d.biblia = biblia; await guardar(); return; }
  }
  throw new Error('El director no entregó una biblia completa después de tres intentos.');
}

async function accionGuion(opciones) {
  const d = proyectoActual().datos;
  const numero = d.episodioActual || 1;
  await escribirGuion(d, numero, {
    ...opciones,
    alAvanzar: () => {
      const ep = d.episodios[numero];
      if (ocupado) { ocupado.total = ep.plan.length; ocupado.hecho = ep.bloques.length; }
      pintar();
    },
  });
  avisar('Guion terminado.', 'success');
}

// ─── Proyectos ───
export async function abrirProyecto(id) {
  if (ocupado) { avisar('Espera a que termine lo que se está generando, o pulsa Detener.', 'error'); return false; }
  await abrir(id);
  ultimoError = null;
  formularioPintadoPara = undefined;
  await pintar();
  return true;
}

export function nuevoDrama() {
  if (ocupado) { avisar('Espera a que termine lo que se está generando, o pulsa Detener.', 'error'); return; }
  cerrar();
  ultimoError = null;
  formularioPintadoPara = undefined;
  pintar().then(() => raiz.querySelector('#h-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

export function irAlFormulario() {
  raiz?.querySelector('#h-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function estaOcupado() { return Boolean(ocupado); }
