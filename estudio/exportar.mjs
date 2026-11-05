// ════════════════════════════════════════════════════════════════
// EXPORTAR — montaje final, descarga del MP4 y ZIP con todo (sección 16.3).
//
//  · «Montar el episodio» hace lo que falte de lo barato —las voces de cada
//    escena, la música de cada acto y los subtítulos alineados— y lanza el
//    montador. Las imágenes no las genera: son lo caro y lo que el dueño
//    revisa en Escenas. Un plano de acción sin video entra como imagen con
//    movimiento de cámara.
//  · El montaje tarda minutos en Google: se puede salir o recargar y al
//    volver se sigue esperando el mismo trabajo (no se lanza otro).
// ════════════════════════════════════════════════════════════════
import { proyectoActual, guardar } from './proyectos.mjs';
import { tanda, urlsDe } from './medios.mjs';
import { escenasDelEpisodio } from './desglose.mjs';
import { vozEscena, vozVigente } from './voces.mjs';
import { generarMusica } from './musica.mjs';
import { alinearEscena } from './subtitulos.mjs';
import { montar, estadoDelEpisodio } from './montaje.mjs';
import { crearControl } from './texto.mjs';
import { explicar, llamar } from './red.mjs';
import { escapar, avisar, sinMoverPantalla } from './interfaz.mjs';

let raiz = null, ocupado = null, ultimoError = null, enlaces = {};
let fila = Promise.resolve();

export function montarExportar(contenedor) {
  raiz = contenedor;
  raiz.addEventListener('click', alPulsar);
}

export function pintarExportar() {
  fila = fila.then(() => new Promise(listo => requestAnimationFrame(() => { sinMoverPantalla(pintarAhora).finally(listo); })));
  return fila;
}

const caja = () => (ultimoError ? `<div class="caja-error" role="alert">${escapar(ultimoError).replace(/\n/g, '<br>')}</div>` : '')
  + (ocupado ? `<div class="progreso-caja"><div class="progreso-linea"><span class="spinner"></span><span class="aviso-vivo">${escapar(ocupado.aviso || 'Trabajando…')}</span></div>
      <button type="button" class="btn-sec" data-accion="detener" data-libre="1">Detener</button></div>` : '');

const fila2 = (ok, texto) => `<li class="${ok ? 'hecho' : 'falta'}"><span>${ok ? '✓' : '○'}</span> ${escapar(texto)}</li>`;

async function pintarAhora() {
  if (!raiz) return;
  const p = proyectoActual();
  const d = p?.datos;
  const numero = d?.episodioActual || 1;
  const ep = d?.episodios?.[numero];
  if (ep?.estado !== 'completo') {
    raiz.innerHTML = `<div class="seccion"><h3>Exportar</h3></div><div class="card"><div class="empty">
      <svg class="icono"><use href="#i-exportar"/></svg><p>Aquí se monta el episodio final cuando estén el guion y sus escenas.</p></div></div>`;
    return;
  }
  const e = estadoDelEpisodio(d, numero);
  const listoParaMontar = e.escenas && !e.sinDesglose && !e.sinImagen;
  const video = ep.resultados?.video, zip = ep.resultados?.zip;
  const enCurso = ep.trabajos || {};
  raiz.innerHTML = `
  <div class="seccion"><h3>Exportar · episodio ${numero}</h3></div>
  <div class="card">
    <ul class="lista-estado">
      ${fila2(!e.sinDesglose, e.sinDesglose ? `Desglose de planos: faltan ${e.sinDesglose} de ${e.escenas} escenas` : `Desglose de planos de las ${e.escenas} escenas`)}
      ${fila2(!e.sinImagen && e.planos, e.sinImagen ? `Imágenes: faltan ${e.sinImagen} de ${e.planos}` : `Imágenes de los ${e.planos} planos`)}
      ${fila2(!e.sinVideo, e.sinVideo ? `Videos de acción: faltan ${e.sinVideo} de ${e.accion} (esos planos irán como imagen con movimiento)` : `Videos de los ${e.accion} planos de acción`)}
      ${fila2(!e.sinVoz, e.sinVoz ? `Voces: faltan ${e.sinVoz} de ${e.escenas} escenas (se hacen al montar)` : `Voces de las ${e.escenas} escenas`)}
      ${fila2(!e.sinMusica, e.sinMusica ? `Música: faltan ${e.sinMusica} de ${e.actos} actos (se hace al montar)` : `Música de los ${e.actos} actos`)}
    </ul>
    ${caja()}
    ${!listoParaMontar ? `<p class="nota">Para montar hacen falta el desglose y las imágenes de todos los planos (en Escenas).</p>` : ''}
    ${video ? `<div class="resultado">
      <video data-ruta="${escapar(video.ruta)}" controls playsinline preload="metadata"></video>
      ${enlaces[video.ruta] ? `<a class="btn ancho" href="${escapar(enlaces[video.ruta])}">Descargar el episodio</a>` : ''}
    </div>` : ''}
    <button type="button" class="${video ? 'btn-sec' : 'btn ancho'}" data-accion="montar"${listoParaMontar ? '' : ' disabled'}>${enCurso.video ? 'Seguir el montaje en curso' : video ? 'Volver a montar el episodio' : 'Montar el episodio'}</button>
    <button type="button" class="btn-sec" data-accion="zip"${e.escenas && !e.sinDesglose ? '' : ' disabled'}>${enCurso.zip ? 'Seguir el ZIP en curso' : zip ? 'Volver a hacer el ZIP' : 'Descargar todo el material (ZIP)'}</button>
    ${zip && enlaces[zip.ruta] ? `<a class="btn-sec" href="${escapar(enlaces[zip.ruta])}">Descargar el ZIP</a>` : ''}
  </div>`;
  raiz.querySelectorAll('[data-accion]').forEach(b => { if (ocupado && !b.dataset.libre) b.disabled = true; });
  // URLs firmadas para ver y descargar (caducan; se piden al pintar).
  const rutas = [video?.ruta, zip?.ruta].filter(Boolean);
  if (rutas.length) {
    try {
      const urls = await urlsDe(p.id, rutas);
      const v = raiz.querySelector('video[data-ruta]');
      if (v && urls[v.dataset.ruta] && v.src !== urls[v.dataset.ruta]) v.src = urls[v.dataset.ruta];
      // Enlaces de descarga (con el nombre del archivo), una vez por sesión.
      const faltan = rutas.filter(r => !enlaces[r]);
      if (faltan.length) {
        const { descargas } = await llamar('/api/urls', { metodo: 'POST', cuerpo: { proyecto: p.id, descargar: faltan } });
        Object.assign(enlaces, descargas || {});
        if (Object.keys(descargas || {}).length) return pintarAhora();
      }
    } catch { /* sin URL todavía: se intenta al volver a pintar */ }
  }
}

function aviso(texto) {
  if (!ocupado) return;
  ocupado.aviso = texto;
  raiz.querySelectorAll('.aviso-vivo').forEach(s => { s.textContent = texto; });
}

async function trabajar(tarea) {
  const control = crearControl();
  ocupado = { control, aviso: 'Trabajando…' };
  ultimoError = null;
  await pintarExportar();
  try {
    const mensaje = await tarea({ control, aviso, guardar: () => guardar() });
    if (mensaje) avisar(mensaje, 'success');
  } catch (e) {
    ultimoError = e.detenido ? 'Detenido. Lo hecho está guardado; el montaje en Google sigue y al volver a pulsar se sigue esperando el mismo.' : explicar(e);
    if (!e.detenido) avisar(e.message, 'error');
  } finally {
    ocupado = null;
    await pintarExportar();
  }
}

// Lo que falta de lo barato antes de montar o de armar el ZIP: voces de
// cada escena, música de cada acto y subtítulos alineados con la voz real.
// Las imágenes no se generan aquí: son lo caro y lo que el dueño revisa.
async function completarParaMontar({ p, d, numero, ep, o, modo }) {
  if (ep.trabajos?.[modo]) return;
  const escenas = escenasDelEpisodio(d, numero);
  const cuenta = await tanda(escenas, {
    ...o, palabra: 'hechas',
    yaHecho: e => vozVigente(e),
    hacer: (e, op) => vozEscena({ proyectoId: p.id, datos: d, escena: e, control: op.control, aviso: op.aviso, guardar: o.guardar }),
    alAvanzar: () => pintarExportar(),
  });
  if (cuenta.fallidos) throw new Error(`No se pudo hacer la voz de ${cuenta.fallidos} escena(s): ${cuenta.errores.map(x => x.texto).join(' · ')}`);
  await generarMusica({ proyectoId: p.id, datos: d, numero, ...o, alAvanzar: () => pintarExportar() });
  for (const [i, e] of escenas.entries()) {
    o.aviso(`Subtítulos: escena ${i + 1} de ${escenas.length}…`);
    await alinearEscena({ proyectoId: p.id, escena: e, control: o.control, aviso: o.aviso });
  }
  await o.guardar();
}

async function alPulsar(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton || boton.disabled) return;
  const accion = boton.dataset.accion;
  if (accion === 'detener') { ocupado?.control.detener(); return; }
  if (ocupado) return;
  const p = proyectoActual();
  const d = p?.datos;
  if (!d) return;
  const numero = d.episodioActual || 1;
  const ep = d.episodios[numero];
  if (accion === 'montar') {
    return trabajar(async o => {
      await completarParaMontar({ p, d, numero, ep, o, modo: 'video' });
      const r = await montar({ proyectoId: p.id, datos: d, numero, modo: 'video', ...o });
      enlaces[r.ruta] = r.url;
      return 'Episodio montado.';
    });
  }
  if (accion === 'zip') {
    return trabajar(async o => {
      // El paquete va debajo de «Montar el episodio» y primero hace lo
      // que falte (voces, música, tiempos), igual que al montar, y luego
      // arma el ZIP numerado con su guía y su subtitulos.srt.
      await completarParaMontar({ p, d, numero, ep, o, modo: 'zip' });
      const r = await montar({ proyectoId: p.id, datos: d, numero, modo: 'zip', ...o });
      enlaces[r.ruta] = r.url;
      return 'ZIP listo para descargar.';
    });
  }
}

