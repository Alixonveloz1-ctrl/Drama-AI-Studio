// ════════════════════════════════════════════════════════════════
// PERSONAJES — fichas de personajes con su imagen de referencia, sus
// variantes, y los escenarios (sección 10 y 20.1).
//
// Decisión del dueño: los escenarios NO tienen imagen. Una foto del lugar
// acababa pegada como fondo detrás de los personajes (la isla del naufragio
// no se integraba). El lugar va descrito en el texto de cada plano para que
// la imagen lo construya junto con las personas, con la misma luz.
//
//  · Cada personaje recurrente tiene UNA imagen de referencia limpia,
//    generada aquí (nunca se sube a mano).
//  · La última imagen generada es la que se usa, sin ningún paso de confirmación.
//  · Una variante (herido, otra ropa, años después) cuelga de su ficha madre,
//    comparte nombre y voz, y su imagen se genera EDITANDO la de la madre.
//    Si la madre se regenera, las variantes quedan marcadas como obsoletas y
//    no se regeneran solas.
//  · Abrir esta pantalla solo lee; generar es siempre un botón.
// ════════════════════════════════════════════════════════════════
import { proyectoActual, guardar } from './proyectos.mjs';
import { pedirMedio, tanda, resumenTanda, cargarImagenes, recordarUrl } from './medios.mjs';
import { promptFichaPersonaje, promptVariante, direccionDeAspecto } from './imagenes.mjs';
import { esEcchi } from './prompts.mjs';
import { vocesDisponibles, asignarVoces, muestraDeVoz, muestraGuardada } from './voces.mjs';
import { escenasDelEpisodio } from './desglose.mjs';
import { crearControl } from './texto.mjs';
import { explicar } from './red.mjs';
import { escapar, avisar, verImagen, sinMoverPantalla } from './interfaz.mjs';

const MODELOS = [
  { valor: 'gemini-3.1-flash-image', etiqueta: 'Nano Banana 2 (predeterminado)' },
  { valor: 'gemini-3-pro-image', etiqueta: 'Nano Banana Pro (más calidad)' },
];

let raiz = null;
let ocupado = null;      // { donde, control, aviso }
let ultimoError = null;  // { donde, texto }
let fila = Promise.resolve();
let voces = null;        // las voces que Google ofrece (se piden una vez)

export { MODELOS as MODELOS_IMAGEN };

export function modeloImagen(datos) {
  return MODELOS.some(m => m.valor === datos?.ajustes?.modeloImagen) ? datos.ajustes.modeloImagen : MODELOS[0].valor;
}

export function montarPersonajes(contenedor) {
  raiz = contenedor;
  raiz.addEventListener('click', alPulsar);
  raiz.addEventListener('change', evento => {
    if (evento.target.matches('[data-voz]')) {
      const d = proyectoActual()?.datos;
      const p = d?.universo?.personajes.find(x => x.id === evento.target.dataset.voz);
      if (!p) return;
      p.voz = evento.target.value;
      const ids = new Set([p.id, ...(d.universo.variantes || []).filter(v => v.madre === p.id).map(v => v.id)]);
      for (const n of Object.keys(d.episodios || {})) {
        for (const e of escenasDelEpisodio(d, Number(n))) if (e.voz && e.lineas.some(l => ids.has(l.personaje))) e.voz.obsoleta = true;
      }
      guardar().catch(e => avisar(explicar(e), 'error'));
      // Se redibuja para que aparezca la muestra (o el botón) de la voz nueva.
      pintarPersonajes();
      return;
    }
    if (evento.target.matches('[name="modeloImagen"]')) {
      const d = proyectoActual()?.datos;
      if (!d) return;
      d.ajustes = { ...(d.ajustes || {}), modeloImagen: evento.target.value };
      guardar().catch(e => avisar(explicar(e), 'error'));
    }
  });
}

export function pintarPersonajes() {
  fila = fila.then(() => new Promise(listo => requestAnimationFrame(() => { sinMoverPantalla(pintarAhora); listo(); })));
  return fila;
}

const caja = donde => (ultimoError?.donde === donde ? `<div class="caja-error" role="alert">${escapar(ultimoError.texto).replace(/\n/g, '<br>')}</div>` : '')
  + (ocupado?.donde === donde ? `<div class="progreso-caja"><div class="progreso-linea"><span class="spinner"></span><span class="aviso-vivo">${escapar(ocupado.aviso || 'Generando…')}</span></div>
      <button type="button" class="btn-sec" data-accion="detener" data-libre="1">Detener</button></div>` : '');

const marco = (ruta, alto, texto) => ruta
  ? `<div class="marco ${alto}"><img data-ruta="${escapar(ruta)}" alt="${escapar(texto)}" data-ver="1"></div>`
  : `<div class="marco ${alto} vacio"><span>${escapar(texto)}</span></div>`;

function pintarAhora() {
  if (!raiz) return;
  const p = proyectoActual();
  const d = p?.datos;
  const u = d?.universo;
  if (!u) {
    raiz.innerHTML = `<div class="seccion"><h3>Personajes</h3></div><div class="card"><div class="empty">
      <svg class="icono"><use href="#i-personas"/></svg><p>Primero crea la historia: los personajes y los escenarios salen del universo.</p></div></div>`;
    return;
  }
  const variantes = u.variantes || [];
  const faltan = u.personajes.filter(x => !x.referencia).length + variantes.filter(v => !v.referencia || v.obsoleta).length;
  raiz.innerHTML = `
  <div class="seccion"><h3>Personajes y escenarios</h3></div>
  <div class="card">
    <label class="campo-linea">Modelo de imagen<select name="modeloImagen">${MODELOS.map(m => `<option value="${m.valor}"${m.valor === modeloImagen(d) ? ' selected' : ''}>${m.etiqueta}</option>`).join('')}</select></label>
    <p class="nota">Cada personaje necesita su ficha de referencia antes de las escenas: así no cambia de cara entre planos.</p>
    ${caja('lote')}
    <button type="button" class="btn ancho" data-accion="lote"${faltan ? '' : ' disabled'}>${faltan ? `Generar las ${faltan} referencias que faltan` : 'Todas las referencias están hechas'}</button>
  </div>

  <div class="seccion"><h3>Personajes</h3></div>
  ${u.personajes.map(x => {
    const suyas = variantes.filter(v => v.madre === x.id);
    return `<div class="card ficha">
      <div class="ficha-fila">
        ${marco(x.referencia?.ruta, 'vertical', x.referencia ? x.nombre : 'Sin ficha todavía')}
        <div class="ficha-datos">
          <h2>${escapar(x.nombre)}</h2>
          <p class="nota">${escapar(x.rol)} · ${x.edad} años</p>
          <p class="corto">${escapar(x.aspecto)}</p>
          ${voces ? `<label class="campo-linea">Voz<select data-voz="${x.id}">${voces.map(v => `<option value="${v.nombre}"${v.nombre === x.voz ? ' selected' : ''}>${v.nombre}${v.genero ? ' · ' + v.genero : ''}</option>`).join('')}</select></label>
          ${caja('m-' + x.id)}${muestraGuardada(d, x.voz) ? `<audio data-ruta="${escapar(muestraGuardada(d, x.voz))}" controls preload="none"></audio>` : `<button type="button" class="btn-sec" data-accion="oir-voz" data-id="${x.id}">Escuchar esta voz</button>`}` : `<p class="nota">Voz: ${escapar(x.voz || 'se asigna sola')}</p>`}
        </div>
      </div>
      ${caja('p-' + x.id)}
      <button type="button" class="${x.referencia ? 'btn-sec' : 'btn ancho'}" data-accion="personaje" data-id="${x.id}">${x.referencia ? 'Regenerar la ficha' : 'Generar la ficha'}</button>
      ${suyas.map(v => `<div class="variante">
        <div class="ficha-fila">
          ${marco(v.referencia?.ruta, 'vertical mini', v.referencia ? v.nombre : 'Sin imagen')}
          <div class="ficha-datos"><h4>${escapar(v.nombre)}</h4><p class="corto">${escapar(v.cambio)}</p>
            ${v.obsoleta ? '<p class="aviso-obsoleta">La ficha madre cambió: esta imagen quedó obsoleta.</p>' : ''}</div>
        </div>
        ${caja('v-' + v.id)}
        <button type="button" class="btn-sec" data-accion="variante" data-id="${v.id}"${x.referencia ? '' : ' disabled'}>${v.referencia ? 'Regenerar la variante' : 'Generar la variante'}</button>
      </div>`).join('')}
      <details class="nueva-variante"><summary>Añadir una variante (herido, otra ropa, años después…)</summary>
        <label class="campo">Cómo cambia respecto a la ficha<textarea rows="2" data-cambio="${x.id}" placeholder="con la ropa rota y una herida en la frente"></textarea></label>
        <button type="button" class="btn-sec" data-accion="nueva-variante" data-id="${x.id}">Añadir variante</button>
      </details>
    </div>`;
  }).join('')}

  <div class="seccion"><h3>Escenarios</h3></div>
  <p class="nota">Los lugares no llevan imagen: el director escribe una ficha detallada de cada uno y esa ficha va en todos los planos de ese lugar, para que se construya junto con los personajes y coincida siempre.</p>
  ${u.escenarios.map(e => `<div class="card ficha">
    <h2>${escapar(e.nombre)}</h2>
    <p class="corto">${escapar(e.descripcion)}</p>
    ${e.ficha ? `<details class="plegado"><summary>Ver la ficha del lugar</summary><p class="corto">${escapar(e.ficha)}</p></details>` : '<p class="nota">El director escribe su ficha antes del desglose de planos.</p>'}
  </div>`).join('')}
  ${u.personajes.every(x => x.referencia) ? `<button type="button" class="btn ancho continuar" data-accion="continuar">Continuar: escenas</button>` : ''}`;
  raiz.querySelectorAll('[data-accion]').forEach(b => { if (ocupado && !b.dataset.libre) b.disabled = true; });
  cargarImagenes(raiz, p.id);
  if (!voces) {
    vocesDisponibles().then(lista => {
      voces = lista;
      if (asignarVoces(u, lista)) guardar().catch(() => {});
      pintarPersonajes();
    }).catch(() => { /* sin lista de voces: se ve la voz asignada en texto */ });
  }
}

function aviso(texto) {
  if (!ocupado) return;
  ocupado.aviso = texto;
  raiz.querySelectorAll('.aviso-vivo').forEach(s => { s.textContent = texto; });
}

// ─── Generación ───
async function generar(cuerpo, opciones) {
  const p = proyectoActual();
  const f = p.datos.formulario;
  const r = await pedirMedio('/api/imagen', { proyecto: p.id, modelo: modeloImagen(p.datos), ecchi: esEcchi(f), direccion: direccionDeAspecto(f), ...cuerpo }, opciones);
  recordarUrl(r.ruta, r.url);
  for (const a of r.avisos || []) avisar(a);
  return { ruta: r.ruta, modelo: r.modelo, fecha: Date.now() };
}

async function fichaPersonaje(x, opciones) {
  x.referencia = await generar({ clave: 'personaje-' + x.id, prompt: promptFichaPersonaje(x, proyectoActual().datos.formulario), formato: '9:16' }, opciones);
  // Las variantes de una madre regenerada quedan obsoletas; no se tocan solas.
  for (const v of proyectoActual().datos.universo.variantes || []) if (v.madre === x.id && v.referencia) v.obsoleta = true;
  await guardar();
}

async function fichaVariante(v, opciones) {
  const madre = proyectoActual().datos.universo.personajes.find(x => x.id === v.madre);
  if (!madre?.referencia) throw new Error(`Primero genera la ficha de ${madre?.nombre || 'la madre'}: la variante se hace editándola.`);
  v.referencia = await generar({ clave: 'variante-' + v.id, prompt: promptVariante(v), formato: '9:16', base: madre.referencia.ruta, nombreBase: madre.nombre }, opciones);
  v.obsoleta = false;
  await guardar();
}

async function trabajar(donde, tarea) {
  const control = crearControl();
  ocupado = { donde, control, aviso: 'Generando…' };
  ultimoError = null;
  await pintarPersonajes();
  try {
    const mensaje = await tarea({ control, aviso });
    if (mensaje) avisar(mensaje, 'success');
  } catch (e) {
    ultimoError = { donde, texto: e.detenido ? e.message + (e.cuenta ? ' ' + resumenTanda(e.cuenta) + '.' : '') : explicar(e) };
    if (!e.detenido) avisar(e.message, 'error');
  } finally {
    ocupado = null;
    await pintarPersonajes();
  }
}

async function alPulsar(evento) {
  const img = evento.target.closest('img[data-ver]');
  if (img?.src) { verImagen(img.src, img.alt); return; }
  const boton = evento.target.closest('[data-accion]');
  if (!boton || boton.disabled) return;
  const accion = boton.dataset.accion;
  if (accion === 'detener') { ocupado?.control.detener(); return; }
  if (ocupado) return;
  const d = proyectoActual()?.datos;
  const u = d?.universo;
  if (!u) return;
  const id = boton.dataset.id;
  if (accion === 'continuar') { document.dispatchEvent(new CustomEvent('ir-a', { detail: 'escenas' })); return; }
  if (accion === 'oir-voz') {
    const x = u.personajes.find(p => p.id === id);
    return trabajar('m-' + id, async o => {
      // Se graba una frase corta con esa voz y queda un reproductor debajo.
      await muestraDeVoz({ proyectoId: proyectoActual().id, datos: d, voz: x.voz, guardar: () => guardar() });
      return 'Muestra lista: pulsa reproducir.';
    });
  }
  if (accion === 'personaje') return trabajar('p-' + id, async o => { await fichaPersonaje(u.personajes.find(x => x.id === id), o); return 'Ficha lista.'; });
  if (accion === 'variante') return trabajar('v-' + id, async o => { await fichaVariante(u.variantes.find(x => x.id === id), o); return 'Variante lista.'; });
  if (accion === 'nueva-variante') {
    const campo = raiz.querySelector(`[data-cambio="${id}"]`);
    const cambio = campo?.value.trim();
    if (!cambio) { avisar('Escribe cómo cambia el personaje.', 'error'); return; }
    const madre = u.personajes.find(x => x.id === id);
    u.variantes ||= [];
    const n = u.variantes.filter(v => v.madre === id).length + 1;
    u.variantes.push({ id: `${id}v${n}`, madre: id, nombre: `${madre.nombre} (${cambio.slice(0, 40)})`, cambio });
    try { await guardar(); } catch (e) { avisar(explicar(e), 'error'); }
    return pintarPersonajes();
  }
  if (accion === 'lote') {
    return trabajar('lote', async o => {
      const elementos = [
        ...u.personajes.map(x => ({ tipo: 'personaje', x })),
        ...(u.variantes || []).map(x => ({ tipo: 'variante', x })),
      ];
      const cuenta = await tanda(elementos, {
        ...o,
        yaHecho: el => Boolean(el.x.referencia) && !(el.tipo === 'variante' && el.x.obsoleta),
        hacer: (el, op) => {
          op.aviso(`${el.x.nombre}…`);
          return el.tipo === 'personaje' ? fichaPersonaje(el.x, op) : fichaVariante(el.x, op);
        },
        alAvanzar: () => pintarPersonajes(),
      });
      if (cuenta.fallidos) {
        ultimoError = { donde: 'lote', texto: resumenTanda(cuenta) + '.\n' + cuenta.errores.map(e => `${e.elemento.x.nombre}: ${e.texto}`).join('\n') };
      }
      return resumenTanda(cuenta) + '.';
    });
  }
}

export function personajesOcupado() { return Boolean(ocupado); }
