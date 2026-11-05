// ════════════════════════════════════════════════════════════════
// APIs CONFIGURADAS — qué cuenta de Google Cloud, qué bucket, qué modelos
// y qué variable de Vercel cambia cada valor. Sirve para diagnosticar desde
// el teléfono sin abrir Vercel. Solo lee: no genera nada.
// ════════════════════════════════════════════════════════════════
import { escapar, abrirHoja } from './interfaz.mjs';
import { cerrarSesion } from './acceso.mjs';
import { llamar } from './red.mjs';

let ultimaSalud = null;

export async function pedirSalud() {
  // Por la misma vía que todo lo demás: lleva el token vigente de la cuenta.
  const datos = await llamar('/api/salud');
  ultimaSalud = datos;
  return datos;
}

// Resumen para el punto de color del botón APIS.
export function resumen(salud) {
  if (!salud) return 'mal';
  const malo = !salud.cuentaServicio?.configurada || !salud.bucket?.configurado ||
    salud.comprobaciones?.credenciales?.ok === false || salud.comprobaciones?.bucket?.ok === false ||
    salud.comprobaciones?.permisos?.ok === false || salud.servicios?.some(s => s.estado === 'apagada') || salud.acceso?.error;
  if (malo) return 'mal';
  const dudoso = salud.servicios?.some(s => s.estado !== 'habilitada') || salud.comprobaciones?.permisos?.ok == null || salud.comprobaciones?.montador?.ok === false ||
    salud.comprobaciones?.bucket?.aviso || salud.bucket?.aviso;
  return dudoso ? 'aviso' : 'ok';
}

const fila = (estado, titulo, valor, detalle) => {
  const icono = estado === true ? '✅' : estado === false ? '❌' : estado === 'aviso' ? '⚠️' : '•';
  return `<div class="salud-fila"><span class="icono">${icono}</span><span class="texto"><strong>${escapar(titulo)}</strong>${valor ? ' — ' + valor : ''}${detalle ? `<span class="detalle">${escapar(detalle)}</span>` : ''}</span></div>`;
};
const codigo = texto => `<code>${escapar(texto)}</code>`;

export function pintarSalud(s) {
  const partes = [];

  // ─── Inicio de sesión ───
  // Sin correos en pantalla (decisión del dueño: es su aplicación personal).
  const sesion = [];
  if (s.acceso?.error) sesion.push(fila(false, 'Acceso', '', s.acceso.error));
  if (s.acceso?.proyectoFirebase) sesion.push(fila(true, 'Inicio de sesión de Google', codigo(s.acceso.proyectoFirebase), 'Proyecto de Firebase · variable STUDIO_FIREBASE_WEB_CONFIG'));
  if (sesion.length) partes.push(`<div class="salud-bloque"><h4>Inicio de sesión</h4>${sesion.join('')}</div>`);

  // ─── Google Cloud ───
  const nube = [];
  if (!s.cuentaServicio?.configurada) {
    nube.push(fila(false, 'Cuenta de servicio', '', s.cuentaServicio?.error || 'No configurada.'));
  } else {
    nube.push(fila(true, 'Proyecto de Google Cloud', codigo(s.cuentaServicio.proyecto), 'Sale del project_id de GCP_SERVICE_ACCOUNT'));
    nube.push(fila(true, 'Cuenta de servicio', codigo(s.cuentaServicio.correo)));
  }
  const cred = s.comprobaciones?.credenciales;
  if (cred) nube.push(fila(cred.ok, 'Credenciales', cred.ok ? 'Google las acepta' : '', cred.error));
  const mont = s.comprobaciones?.montador;
  if (mont) nube.push(fila(mont.ok === null ? 'aviso' : mont.ok, 'Montador del episodio final', mont.ok ? codigo(mont.trabajo) : '', mont.error || mont.nota));
  partes.push(`<div class="salud-bloque"><h4>Google Cloud</h4>${nube.join('')}</div>`);

  // ─── Bucket ───
  const cubo = [];
  if (!s.bucket?.configurado) {
    cubo.push(fila(false, 'Bucket', '', s.bucket?.error || 'No configurado.'));
  } else {
    cubo.push(fila(s.bucket.aviso ? 'aviso' : true, 'Bucket', codigo(s.bucket.nombre), s.bucket.aviso || 'Variable GCS_OUTPUT_BUCKET'));
    cubo.push(fila(null, 'Carpeta del estudio', codigo(s.bucket.carpeta), 'Variable GCS_PREFIX'));
    const b = s.comprobaciones?.bucket;
    if (b) cubo.push(fila(b.ok ? (b.aviso ? 'aviso' : true) : false, 'Acceso al bucket', b.ok ? `accesible${b.ubicacion ? ' · ' + escapar(b.ubicacion) : ''}` : '', b.ok ? b.aviso : [b.error, b.detalleGoogle && 'Google: ' + b.detalleGoogle].filter(Boolean).join(' ')));
    const p = s.comprobaciones?.permisos;
    if (p) cubo.push(fila(p.ok === true ? true : p.ok === false ? false : 'aviso', 'Permisos de escritura', p.ok ? 'completos' : '', p.error || [p.nota, p.detalleGoogle && 'Google: ' + p.detalleGoogle].filter(Boolean).join(' ')));
  }
  partes.push(`<div class="salud-bloque"><h4>Bucket</h4>${cubo.join('')}</div>`);

  // ─── APIs del proyecto ───
  if (Array.isArray(s.servicios) && s.servicios.length) {
    // "desconocido" no es un fallo: la cuenta no puede leer la lista de APIs,
    // lo que no dice nada de si la API funciona.
    const filas = s.servicios.map(x => fila(x.estado === 'habilitada' ? true : x.estado === 'apagada' ? false : 'aviso',
      x.nombre, escapar(x.estado), [x.para, x.nota].filter(Boolean).join(' · ')));
    partes.push(`<div class="salud-bloque"><h4>APIs del proyecto</h4>${filas.join('')}</div>`);
  }

  // ─── Modelos y regiones ───
  if (Array.isArray(s.ajustes)) {
    const filas = s.ajustes.map(a => `<div class="ajuste">
      <div class="uso">${escapar(a.uso)}<span class="etiqueta ${a.propio ? 'propio' : 'defecto'}">${a.propio ? 'puesto en Vercel' : 'por defecto'}</span></div>
      <div class="valor">${codigo(a.valor)}${a.ubicacion ? ' · región ' + codigo(a.ubicacion) : ''}</div>
      ${a.opciones ? `<div class="var">En el selector: ${a.opciones.map(escapar).join(', ')}</div>` : ''}
      <div class="var">Lo cambia la variable ${codigo(a.variable)}</div>
    </div>`);
    partes.push(`<details class="salud-bloque plegado"><summary>Modelos, regiones y variables</summary>${filas.join('')}</details>`);
  }

  if (s.version?.commit) partes.push(`<p class="nota">Versión publicada: ${codigo(s.version.commit)}${s.version.entorno ? ' · ' + escapar(s.version.entorno) : ''}</p>`);
  return partes.join('');
}

export async function abrirApis() {
  const hoja = abrirHoja(`
    <h3>APIs configuradas</h3>
    <p class="nota" style="margin:0 0 14px">Qué cuenta de Google Cloud y qué bucket usa este despliegue, y qué variable de Vercel cambia cada valor. Esta pantalla solo lee: no genera nada.</p>
    <div class="salud" id="salud-contenido"><span class="spinner"></span> Comprobando…</div>
    <button class="btn" data-cerrar style="margin-top:6px">Entendido</button>
    <button class="btn-sec" id="btn-salir">Cerrar sesión</button>
  `);
  hoja.querySelector('#btn-salir').addEventListener('click', () => cerrarSesion());
  const caja = hoja.querySelector('#salud-contenido');
  try {
    const salud = await pedirSalud();
    if (caja.isConnected) caja.innerHTML = pintarSalud(salud);
    return salud;
  } catch (e) {
    if (caja.isConnected) caja.innerHTML = fila(false, 'Diagnóstico', '', e.message);
    throw e;
  }
}

export function saludGuardada() {
  return ultimaSalud;
}
