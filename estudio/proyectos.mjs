// ════════════════════════════════════════════════════════════════
// PROYECTOS (navegador) — el proyecto abierto y su guardado en el bucket.
//
//  · El bucket es la única fuente de verdad. En el teléfono solo se recuerda
//    qué proyecto estaba abierto.
//  · Un proyecto creado conserva su identificador desde el primer momento:
//    un reintento abre ese mismo registro en vez de crear otro.
//  · Los guardados van en fila, uno detrás de otro, siempre con la versión
//    que se leyó: nunca se pisa trabajo más nuevo.
//  · Abrir solo lee: nunca genera nada.
// ════════════════════════════════════════════════════════════════
import { llamar } from './red.mjs';

const CLAVE_ABIERTO = 'drama.proyectoAbierto';
let actual = null;          // { id, generacion, datos }
let fila = Promise.resolve();

export function proyectoActual() { return actual; }

export function nuevoId() {
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
  return 'p' + Date.now().toString(36) + azar;
}

export function recordarAbierto(id) {
  try { id ? localStorage.setItem(CLAVE_ABIERTO, id) : localStorage.removeItem(CLAVE_ABIERTO); } catch {}
}
export function ultimoAbierto() {
  try { return localStorage.getItem(CLAVE_ABIERTO); } catch { return null; }
}

export function nombreDe(datos) {
  return datos?.universo?.titulo || datos?.ideas?.find(i => i.id === datos?.ideaElegida)?.titulo || 'Drama sin título';
}

export function resumenDe(datos) {
  const episodio = datos?.episodios?.[datos?.episodioActual || 1];
  const escenas = (episodio?.bloques || []).reduce((n, b) => n + (b.escenas?.length || 0), 0);
  const fase = episodio?.estado === 'completo' ? 'guion completo'
    : escenas ? 'guion a medias'
    : datos?.universo ? 'universo listo'
    : datos?.ideas?.length ? 'ideas'
    : 'nuevo';
  return { fase, escenas, segundos: Math.round(episodio?.segundos || 0), formato: datos?.formulario?.formato || '' };
}

export async function listar() {
  return llamar('/api/proyectos');
}

export async function abrir(id) {
  const { proyecto, generacion } = await llamar('/api/proyectos?id=' + encodeURIComponent(id));
  actual = { id, generacion, datos: proyecto.datos };
  recordarAbierto(id);
  return actual;
}

export function cerrar() {
  actual = null;
  recordarAbierto(null);
}

// Empieza un proyecto nuevo en memoria; se crea en el bucket al guardarlo.
export function empezar(datos) {
  actual = { id: nuevoId(), generacion: '0', datos };
  return actual;
}

async function guardarAhora() {
  if (!actual) return;
  const objetivo = actual;
  try {
    const r = await llamar('/api/proyectos', {
      metodo: 'POST',
      cuerpo: { id: objetivo.id, datos: objetivo.datos, nombre: nombreDe(objetivo.datos), resumen: resumenDe(objetivo.datos), generacionBase: objetivo.generacion },
    });
    if (r.generacion) objetivo.generacion = r.generacion;
    recordarAbierto(objetivo.id);
    return r;
  } catch (e) {
    // Proyecto nuevo cuyo primer guardado ya había llegado (respuesta
    // perdida): se abre ese mismo registro en vez de crear otro.
    if (e.status === 409 && objetivo.generacion === '0') {
      const leido = await llamar('/api/proyectos?id=' + encodeURIComponent(objetivo.id)).catch(() => null);
      if (leido?.proyecto) {
        objetivo.generacion = leido.generacion;
        objetivo.datos = { ...leido.proyecto.datos, ...objetivo.datos };
        return guardarAhora();
      }
    }
    throw e;
  }
}

// Guarda en fila: cada guardado espera al anterior.
export function guardar() {
  const tarea = fila.then(guardarAhora, guardarAhora);
  fila = tarea.catch(() => {});
  return tarea;
}
