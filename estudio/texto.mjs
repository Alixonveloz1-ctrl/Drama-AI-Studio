// ════════════════════════════════════════════════════════════════
// TEXTO (navegador) — pide texto al modelo con la política de esperas
// de la sección 18 de la especificación:
//
//  · Un BLOQUEO no se reintenta nunca: sale a la primera y se dice.
//  · Un 429 no es un fallo, es una espera: 20, 45, 90, 150 y 240 s, y la
//    pantalla dice cuánto falta. Después del último intento no se espera.
//  · Si la petición no cupo en el tiempo del servidor, NO se repite igual:
//    se devuelve al que llama para que la haga más pequeña.
//  · «Detener» corta de verdad, también en mitad de una espera de minutos.
// ════════════════════════════════════════════════════════════════
import { llamar, ErrorRed } from './red.mjs';

// Motivo de un fallo pasajero, dicho con palabras (no «corte pasajero» a secas).
function motivo(e) {
  if (e?.tipo === 'red') return 'Se cortó la conexión con el estudio (red del teléfono).';
  if (/\b503\b/.test(`${e?.message} ${e?.detalleGoogle || ''}`)) return 'Google está saturado ahora mismo (código 503).';
  return String(e?.message || 'Fallo pasajero.');
}

export const ESPERAS_CUOTA_TEXTO = [20, 45, 90, 150, 240];
const ESPERAS_PASAJERAS = [4, 8, 16];

const BLOQUEO = /bloquead|blocked|safety|prohibited|recitation/i;
const CUOTA = /\b429\b|resource_exhausted|exhausted|quota|rate limit|sin capacidad/i;

// Primero se mira si es bloqueo; solo si no lo es, si es cuota.
export function esBloqueo(e) {
  return e?.tipo === 'bloqueo' || BLOQUEO.test(`${e?.message || ''} ${e?.detalleGoogle || ''}`);
}
export function esCuota(e) {
  if (esBloqueo(e)) return false;
  return e?.tipo === 'cuota' || e?.status === 429 || CUOTA.test(`${e?.message || ''} ${e?.detalleGoogle || ''}`);
}

// Control compartido de una tanda: detener() corta la petición en curso y
// cualquier espera.
export function crearControl() {
  const control = {
    detenido: false,
    abortador: new AbortController(),
    detener() {
      control.detenido = true;
      control.abortador.abort();
    },
  };
  return control;
}

export function errorDetenido() {
  return new ErrorRed('Detenido. Lo ya hecho está guardado; puedes seguir cuando quieras.', { detenido: true });
}

async function esperar(segundos, control, aviso, motivo) {
  for (let restante = segundos * 4; restante > 0; restante--) {
    if (control?.detenido) throw errorDetenido();
    if (restante % 4 === 0) aviso?.(`${motivo} Reintento en ${restante / 4} s.`);
    await new Promise(listo => setTimeout(listo, 250));
  }
}

export async function pedirTexto({ sistema, mensaje, temperatura, maxTokens }, { control, aviso } = {}) {
  let cuota = 0, pasajero = 0;
  for (;;) {
    if (control?.detenido) throw errorDetenido();
    try {
      const datos = await llamar('/api/texto', {
        metodo: 'POST',
        cuerpo: { sistema, mensaje, temperatura, maxTokens },
        senal: control?.abortador.signal,
      });
      return datos.texto;
    } catch (e) {
      if (e.detenido || control?.detenido) throw errorDetenido();
      if (esBloqueo(e)) throw e;
      if (e.tipo === 'tiempo') throw e;
      if (esCuota(e) && cuota < ESPERAS_CUOTA_TEXTO.length) {
        await esperar(ESPERAS_CUOTA_TEXTO[cuota++], control, aviso, 'Google pide esperar por el límite de peticiones por minuto de tu cuenta.');
        continue;
      }
      if (e.reintentable && pasajero < ESPERAS_PASAJERAS.length) {
        await esperar(ESPERAS_PASAJERAS[pasajero++], control, aviso, `${motivo(e)} Se vuelve a intentar.`);
        continue;
      }
      throw e;
    }
  }
}

// El modelo a veces envuelve el JSON en ```json o deja saltos de línea sin
// escapar dentro de un texto largo: se repara antes de rendirse.
export function parsearJSON(crudo) {
  let s = String(crudo || '').replace(/```json\n?|\n?```/g, '').trim();
  const inicio = s.indexOf('{');
  const fin = s.lastIndexOf('}');
  if (inicio >= 0 && fin > inicio) s = s.slice(inicio, fin + 1);
  try {
    return JSON.parse(s);
  } catch {
    let salida = '', dentro = false, escape = false;
    for (const c of s) {
      if (escape) { salida += c; escape = false; continue; }
      if (c === '\\') { salida += c; escape = true; continue; }
      if (c === '"') { dentro = !dentro; salida += c; continue; }
      if (dentro && c === '\n') { salida += '\\n'; continue; }
      if (dentro && c === '\r') { salida += '\\r'; continue; }
      if (dentro && c === '\t') { salida += '\\t'; continue; }
      salida += c;
    }
    return JSON.parse(salida);
  }
}
