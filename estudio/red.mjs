// ════════════════════════════════════════════════════════════════
// RED — una sola forma de hablar con los endpoints del estudio.
// Todo error sale con palabras (error.message), su tipo (cuota, bloqueo,
// tiempo, conflicto…) y, si lo hay, el mensaje de Google tal cual.
// ════════════════════════════════════════════════════════════════

export class ErrorRed extends Error {
  constructor(mensaje, extra = {}) {
    super(mensaje);
    Object.assign(this, extra);
  }
}

// La sesión de Google. El token de Firebase caduca cada hora: si solo viajaba
// la cookie, un lote largo se cortaba con «Entra con tu cuenta» en cuanto
// caducaba (el teléfono no siempre renueva a tiempo con la pantalla quieta).
// Ahora cada petición lleva el token vigente (Firebase lo renueva solo si va
// a caducar) y, si aun así el servidor dice 401, se fuerza uno nuevo y se
// repite UNA vez. La página de acceso registra aquí de dónde sacarlo.
let pedirToken = null;
export function usarToken(funcion) { pedirToken = funcion; }
async function tokenVigente(forzar) {
  if (!pedirToken) return '';
  try { return (await pedirToken(forzar)) || ''; } catch { return ''; }
}

export async function llamar(ruta, { metodo = 'GET', cuerpo, senal } = {}) {
  const enviar = async token => {
    const cabeceras = cuerpo ? { 'Content-Type': 'application/json' } : {};
    if (token) cabeceras.Authorization = 'Bearer ' + token;
    try {
      return await fetch(ruta, {
        method: metodo,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: cabeceras,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: senal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw new ErrorRed('Detenido.', { detenido: true });
      throw new ErrorRed('No hay conexión con el estudio. Comprueba la red; se volverá a intentar.', { tipo: 'red', reintentable: true });
    }
  };
  let respuesta = await enviar(await tokenVigente(false));
  if (respuesta.status === 401 && pedirToken) {
    const nuevo = await tokenVigente(true);
    if (nuevo) respuesta = await enviar(nuevo);
  }
  const crudo = await respuesta.text();
  let datos;
  try {
    datos = crudo ? JSON.parse(crudo) : {};
  } catch {
    // El 504 propio de Vercel llega en texto plano: la petición no cupo en
    // 60 s. Repetirla igual solo repite el corte; hay que hacerla más pequeña.
    if (respuesta.status === 504 || /FUNCTION_INVOCATION_TIMEOUT/.test(crudo)) {
      throw new ErrorRed('El servidor se quedó sin tiempo para esta petición. Hay que hacerla más pequeña.', { tipo: 'tiempo', status: 504 });
    }
    throw new ErrorRed(`El estudio respondió algo que no se entiende (código ${respuesta.status}).`, { status: respuesta.status, reintentable: respuesta.status >= 500 });
  }
  if (!respuesta.ok) {
    throw new ErrorRed(datos.error || `El estudio respondió con un error (código ${respuesta.status}).`, {
      status: respuesta.status,
      tipo: datos.tipo || (respuesta.status === 429 ? 'cuota' : undefined),
      detalleGoogle: datos.detalleGoogle,
      reintentable: respuesta.status >= 500 && datos.tipo !== 'bloqueo' && datos.tipo !== 'configuracion' && datos.tipo !== 'tiempo',
    });
  }
  return datos;
}

// Texto para el usuario: la explicación y, debajo, lo que dijo Google.
export function explicar(error) {
  if (!error) return '';
  return error.detalleGoogle ? `${error.message}\nGoogle: ${error.detalleGoogle}` : error.message;
}
