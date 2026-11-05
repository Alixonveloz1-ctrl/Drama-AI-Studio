// ════════════════════════════════════════════════════════════════
// PUERTA — la única forma de entrar a Google desde el estudio.
//
// Todo endpoint se escribe como  puerta({ metodos }, async (req, ctx) => …)
// y la puerta hace, en este orden y siempre:
//
//   1. Cabeceras privadas (sin caché, sin adivinar tipos).
//   2. Comprueba el método.
//   3. Comprueba que quien llama es el propietario. ANTES de esto no existe
//      ninguna credencial: el manejador no puede tocar Google sin pasar aquí.
//   4. Entrega al manejador el token de la cuenta de servicio, firmado aquí
//      mismo. El navegador nunca ve una credencial.
//   5. Censura la respuesta (y los errores) antes de devolverla: ninguna
//      clave privada, token OAuth ni campo de credencial sale del servidor,
//      aunque Google lo repita dentro de un mensaje de error.
//   6. Convierte cualquier fallo en una explicación en español, con el
//      mensaje de Google tal cual al lado. Nada de silencios ni códigos crudos.
// ════════════════════════════════════════════════════════════════
const { exigirPropietario, cabecerasPrivadas } = require('./acceso');
const { credenciales, ErrorConfiguracion } = require('./google');
const { ErrorEstudio } = require('./errores');

const CAMPOS_SECRETOS = /^(private_key|private_key_id|access_token|refresh_token|id_token|client_secret|assertion|token)$/i;
const PATRONES_SECRETOS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[clave omitida]'],
  [/ya29\.[A-Za-z0-9._~-]+/g, '[token omitido]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[token omitido]'],
  [/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[omitido]'],
];

function censurarTexto(texto) {
  let limpio = String(texto);
  for (const [patron, reemplazo] of PATRONES_SECRETOS) limpio = limpio.replace(patron, reemplazo);
  return limpio;
}

function censurar(valor, profundidad = 0) {
  if (profundidad > 40) return '[omitido]';
  if (typeof valor === 'string') return censurarTexto(valor);
  if (Array.isArray(valor)) return valor.map(v => censurar(v, profundidad + 1));
  if (valor && typeof valor === 'object') {
    const limpio = {};
    for (const [clave, v] of Object.entries(valor)) {
      if (CAMPOS_SECRETOS.test(clave)) continue;
      limpio[clave] = censurar(v, profundidad + 1);
    }
    return limpio;
  }
  return valor;
}

function explicar(error) {
  if (error instanceof ErrorEstudio) {
    const cuerpo = { error: error.message, tipo: error.tipo };
    if (error.detalle) cuerpo.detalleGoogle = error.detalle;
    return { estado: error.estado, cuerpo };
  }
  if (error instanceof ErrorConfiguracion) {
    return { estado: 500, cuerpo: { error: error.message, tipo: 'configuracion' } };
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { estado: 504, cuerpo: { error: 'Google tardó demasiado en responder y se cortó la espera. No se completó la acción.', tipo: 'tiempo' } };
  }
  return { estado: 500, cuerpo: { error: 'Algo falló en el servidor del estudio: ' + String(error?.message || error || 'sin detalle'), tipo: 'fallo' } };
}

function responder(res, estado, cuerpo) {
  res.status(estado).json(censurar(cuerpo));
}

function puerta({ metodos = ['POST'] } = {}, manejador) {
  return async function endpoint(req, res) {
    cabecerasPrivadas(res);
    if (!metodos.includes(req.method)) {
      return responder(res, 405, { error: 'Esta acción del estudio no admite ese tipo de petición.', tipo: 'peticion' });
    }
    if (await exigirPropietario(req, res)) return;
    let pendientes;
    const ctx = {
      propietario: req.propietario,
      // Las credenciales se piden solo si el manejador las necesita, y una vez.
      google: () => (pendientes ||= credenciales()),
    };
    try {
      const resultado = await manejador(req, ctx);
      return responder(res, 200, resultado ?? {});
    } catch (error) {
      const { estado, cuerpo } = explicar(error);
      return responder(res, estado, cuerpo);
    }
  };
}

module.exports = puerta;
module.exports.puerta = puerta;
module.exports.censurar = censurar;
module.exports.explicar = explicar;
