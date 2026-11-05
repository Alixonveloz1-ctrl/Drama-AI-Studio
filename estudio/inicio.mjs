// ════════════════════════════════════════════════════════════════
// ARRANQUE DEL ESTUDIO — comprueba la sesión, monta la interfaz una vez,
// vuelve a abrir el último proyecto y lee el diagnóstico.
// Abrir una pantalla solo lee recursos: nunca genera.
// ════════════════════════════════════════════════════════════════
import { protegerPagina, mostrarErrorSesion, cerrarSesion } from './acceso.mjs';
import { abrirApis, pedirSalud, resumen } from './salud.mjs';
import { abrirHoja, cerrarHoja, avisar, escapar } from './interfaz.mjs';
import { listar, ultimoAbierto, recordarAbierto, proyectoActual } from './proyectos.mjs';
import { montarHistoria, abrirProyecto, nuevoDrama, irAlFormulario } from './historia.mjs';
import { montarPersonajes, pintarPersonajes } from './personajes.mjs';
import { montarEscenas, pintarEscenas } from './escenas.mjs';
import { montarExportar, pintarExportar } from './exportar.mjs';
import { explicar } from './red.mjs';

const $ = selector => document.querySelector(selector);

function ponerPunto(estado) {
  const punto = $('#apiDot');
  if (punto) punto.className = 'dot ' + estado;
}

function irA(panel) {
  document.querySelectorAll('.nav-tab').forEach(b => {
    const activo = b.dataset.panel === panel;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-current', activo ? 'page' : 'false');
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + panel));
  try { localStorage.setItem('drama.panel', panel); } catch {}
  window.scrollTo({ top: 0 });
  // Cada área se pinta al mostrarla, con el proyecto abierto en ese momento.
  if (panel === 'personajes') pintarPersonajes();
  if (panel === 'escenas') pintarEscenas();
  if (panel === 'exportar') pintarExportar();
}

const fecha = ms => ms ? new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// La lista se reconstruye desde el bucket. Si no se pudo leer, se dice:
// nunca se muestra «no hay proyectos» por una lectura fallida.
async function abrirProyectos() {
  const hoja = abrirHoja(`
    <h3>Proyectos</h3>
    <div id="lista-proyectos"><span class="spinner"></span> Leyendo tus proyectos del bucket…</div>
    <button type="button" class="btn" id="btnNuevoDrama">Nuevo drama</button>
  `);
  hoja.querySelector('#btnNuevoDrama').addEventListener('click', () => { cerrarHoja(); irA('historia'); nuevoDrama(); });
  const caja = hoja.querySelector('#lista-proyectos');
  try {
    const { proyectos, ilegibles } = await listar();
    if (!caja.isConnected) return;
    const abierto = proyectoActual()?.id;
    caja.innerHTML = (proyectos.length ? proyectos.map(p => `
      <button type="button" class="fila-proyecto${p.id === abierto ? ' abierto' : ''}" data-id="${escapar(p.id)}">
        <span class="nombre">${escapar(p.nombre || 'Drama sin título')}</span>
        <span class="nota">${escapar(p.resumen?.fase || '')}${p.resumen?.segundos ? ' · ≈ ' + Math.max(1, Math.round(p.resumen.segundos / 60)) + ' min' : ''}${p.resumen?.formato ? ' · ' + escapar(p.resumen.formato) : ''} · ${escapar(fecha(p.actualizado))}</span>
      </button>`).join('') : '<p class="nota">Todavía no hay ningún drama guardado en tu bucket.</p>')
      + (ilegibles.length ? `<p class="caja-error">${ilegibles.length} proyecto(s) del bucket no se pudieron leer ahora mismo. No se borró nada; vuelve a abrir esta lista en un momento.</p>` : '');
    caja.querySelectorAll('.fila-proyecto').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        if (await abrirProyecto(b.dataset.id)) {
          cerrarHoja();
          irA('historia');
          avisar('Proyecto abierto.', 'success');
        }
      } catch (e) {
        b.disabled = false;
        avisar(explicar(e), 'error');
      }
    }));
  } catch (e) {
    if (caja.isConnected) caja.innerHTML = `<p class="caja-error">No se pudo leer la lista de proyectos: ${escapar(explicar(e))}</p>`;
  }
}

let cableado = false;
function cablear() {
  if (cableado) return;
  cableado = true;
  document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => irA(b.dataset.panel)));
  $('#btnApis').addEventListener('click', () => {
    abrirApis().then(s => ponerPunto(resumen(s))).catch(e => { ponerPunto('mal'); if (e.status === 401) mostrarErrorSesion(e); });
  });
  $('#btnProyectos').addEventListener('click', abrirProyectos);
  document.addEventListener('ir-a', evento => irA(evento.detail));
  $('#btnPortada').addEventListener('click', () => {
    if (proyectoActual()?.datos?.ideas?.length) nuevoDrama();
    else irAlFormulario();
  });
}

async function montar() {
  cablear();
  let panel = 'historia';
  try { panel = localStorage.getItem('drama.panel') || panel; } catch {}
  if (!document.getElementById('panel-' + panel)) panel = 'historia';
  montarHistoria($('#historia'));
  montarPersonajes($('#personajes'));
  montarEscenas($('#escenas'));
  montarExportar($('#exportar'));
  // Se vuelve a abrir el último proyecto leyéndolo del bucket (no del teléfono).
  const ultimo = ultimoAbierto();
  if (ultimo) {
    try {
      await abrirProyecto(ultimo);
    } catch (e) {
      if (e.status === 404) recordarAbierto(null);
      avisar('No se pudo abrir tu último proyecto: ' + explicar(e), 'error');
    }
  }
  irA(panel);
  // La pantalla de "comprobando" se quita cuando la interfaz ya está dibujada.
  $('#comprobando').hidden = true;
  $('#app').hidden = false;
  // Diagnóstico de solo lectura para el punto de color del botón de ajustes.
  pedirSalud()
    .then(s => {
      ponerPunto(resumen(s));
      if (s.version?.commit) $('#version').textContent = 'v' + s.version.commit;
      if (resumen(s) === 'mal') avisar('Hay algo pendiente en la configuración. Pulsa el engranaje para ver qué.', 'error');
    })
    .catch(e => { ponerPunto('mal'); avisar(e.message, 'error'); });
}

function fallo(error) {
  const texto = $('#comprobando-texto');
  if (texto && !$('#comprobando').hidden) {
    texto.textContent = error?.message || String(error);
    // Con una cuenta que no es la autorizada, el dueño necesita poder salir
    // y entrar con la buena sin quedarse atascado en esta pantalla.
    const reentrar = $('#btnReentrar');
    if (error?.status === 401 || error?.status === 403) {
      reentrar.hidden = false;
      reentrar.onclick = () => cerrarSesion();
    }
  } else {
    mostrarErrorSesion(error);
  }
}

protegerPagina(montar, fallo).catch(fallo);
