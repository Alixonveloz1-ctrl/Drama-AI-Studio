// ════════════════════════════════════════════════════════════════
// ERRORES — todo fallo se explica en pantalla con palabras.
//
// Reglas que costaron días en el estudio de anime:
//
//  · Un BLOQUEO de seguridad NO es una cuota. Reintentar un prompt bloqueado
//    lo vuelve a bloquear (allí llegó a hacerlo ocho veces) y cada intento
//    gasta cuota de verdad. Por eso se mira PRIMERO si es bloqueo, y solo si
//    no lo es se mira si es cuota.
//  · Un 429 no es un fallo: es una espera. Lo decide el llamador con su
//    escalera de esperas; aquí solo se etiqueta.
//  · Cuidado con las coincidencias amplias: buscar "resource" a secas casaba
//    con cualquier mensaje que llevara esa palabra.
//  · El modelo elegido nunca se cambia por otro: el error de Google se
//    devuelve tal cual, junto a la explicación en español.
// ════════════════════════════════════════════════════════════════

const BLOQUEO = /bloquead|blocked|safety|prohibited|recitation/i;
const CUOTA = /\b429\b|resource_exhausted|exhausted|quota|rate limit|sin capacidad/i;

function clasificar(texto) {
  const t = String(texto || '');
  if (BLOQUEO.test(t)) return 'bloqueo';
  if (CUOTA.test(t)) return 'cuota';
  return 'otro';
}

class ErrorEstudio extends Error {
  // estado: código HTTP de la respuesta del estudio.
  // tipo: 'bloqueo' | 'cuota' | 'configuracion' | 'google' | 'peticion' | 'fallo'
  // detalle: el texto de Google tal cual, cuando lo hay.
  constructor(mensaje, { estado = 500, tipo = 'fallo', detalle } = {}) {
    super(mensaje);
    this.estado = estado;
    this.tipo = tipo;
    if (detalle) this.detalle = String(detalle).slice(0, 1500);
  }
}

// Convierte una respuesta de error de Google en un ErrorEstudio con una
// explicación en español y el mensaje original de Google.
function errorDeGoogle(servicio, estadoHttp, cuerpo) {
  const mensajeGoogle = typeof cuerpo === 'string'
    ? cuerpo
    : (cuerpo?.error?.message || cuerpo?.error?.status || JSON.stringify(cuerpo || {})).toString();
  const detalle = `${estadoHttp} — ${mensajeGoogle}`.slice(0, 1500);
  const tipo = clasificar(`${detalle} ${cuerpo?.error?.status || ''}`);
  if (tipo === 'bloqueo') {
    return new ErrorEstudio(`Google bloqueó esta petición de ${servicio} con su filtro de seguridad. Reintentar no sirve: hay que cambiar el texto y volver a generar.`, { estado: 422, tipo, detalle });
  }
  if (tipo === 'cuota') {
    return new ErrorEstudio(`Google pide esperar: se alcanzó el límite de peticiones por minuto de tu cuenta para ${servicio}.`, { estado: 429, tipo, detalle });
  }
  const explicacion = {
    400: `Google rechazó la petición de ${servicio} porque algo en ella no es válido.`,
    401: `Google no aceptó las credenciales para ${servicio}. Vuelve a ejecutar el instalador.`,
    403: `Google negó el permiso para ${servicio}: la API puede estar apagada o a la cuenta de servicio le falta un rol. Abre Cloud Shell y ejecuta el instalador: él activa las APIs y pone los roles.`,
    404: `Google no encuentra el modelo o el recurso de ${servicio} en esa región, o tu proyecto no tiene acceso a él.`,
    500: `Google tuvo un fallo interno con ${servicio}.`,
    503: `El servicio de Google para ${servicio} no está disponible ahora mismo.`,
  }[estadoHttp] || `Google devolvió un error con ${servicio} (código ${estadoHttp}).`;
  // Siempre 502 hacia el navegador: un 401/403 del estudio significa "tu
  // sesión no vale" y mandaría al dueño a la pantalla de entrar por un
  // problema que es de Google, no suyo.
  return new ErrorEstudio(explicacion, { estado: 502, tipo: 'google', detalle });
}

module.exports = { BLOQUEO, CUOTA, clasificar, ErrorEstudio, errorDeGoogle };
