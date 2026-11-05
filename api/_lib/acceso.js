// ════════════════════════════════════════════════════════════════
// ACCESO PRIVADO — una sola frontera de propietario para todo el estudio.
//
// Ninguna llamada a Google con la cuenta de servicio ocurre antes de esta
// comprobación, tampoco las hechas desde fuera del navegador: un endpoint
// abierto gasta los créditos del dueño igual que uno usado desde la app.
//
// El inicio de sesión es de Google mediante Firebase Authentication (igual
// que en el estudio de anime). Un inicio de sesión de Google VÁLIDO de otra
// persona no basta: el correo tiene que estar en STUDIO_ALLOWED_EMAILS.
// ════════════════════════════════════════════════════════════════
const { verify } = require('node:crypto');

const COOKIE = '__Host-drama_sesion';
const CERTIFICADOS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

class ErrorAcceso extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}
const sinSesion = () => new ErrorAcceso(401, 'Entra con tu cuenta de Google para continuar.');

// Configuración pública del cliente de Firebase (no es ninguna credencial de
// servicio) y lista de correos autorizados. Si falta cualquiera, todo queda
// cerrado: nunca se abre "por defecto".
function configuracion(entorno = process.env) {
  let firebase;
  try { firebase = JSON.parse(entorno.STUDIO_FIREBASE_WEB_CONFIG || 'null'); } catch {}
  const correos = String(entorno.STUDIO_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!firebase || !/^[a-z0-9-]+$/.test(firebase.projectId || '') ||
      typeof firebase.apiKey !== 'string' || !firebase.apiKey || !firebase.authDomain || !firebase.appId) {
    throw new ErrorAcceso(503, 'El inicio de sesión todavía no está configurado (falta STUDIO_FIREBASE_WEB_CONFIG en Vercel). Lo configura el instalador de Cloud Shell. Mientras tanto no se puede generar nada.');
  }
  if (!correos.length) {
    throw new ErrorAcceso(503, 'No hay ningún correo autorizado (falta STUDIO_ALLOWED_EMAILS en Vercel). Lo configura el instalador de Cloud Shell. Mientras tanto no se puede generar nada.');
  }
  const publica = Object.fromEntries(['apiKey', 'authDomain', 'projectId', 'appId'].map(k => [k, firebase[k]]));
  return { firebase: publica, correos };
}

function crearVerificador({ pedir = (...a) => fetch(...a), ahora = () => Date.now() } = {}) {
  let claves = {}, caducan = 0;
  return async function verificarPropietario(token, ajustes = configuracion()) {
    if (typeof token !== 'string' || token.length > 3800 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw sinSesion();
    const [cabeza, cuerpo, firma] = token.split('.');
    let cabecera, datos;
    try {
      cabecera = JSON.parse(Buffer.from(cabeza, 'base64url'));
      datos = JSON.parse(Buffer.from(cuerpo, 'base64url'));
    } catch { throw sinSesion(); }
    const segundos = Math.floor(ahora() / 1000);
    const { firebase, correos } = ajustes;
    if (!cabecera || !datos || cabecera.alg !== 'RS256' || typeof cabecera.kid !== 'string' ||
        datos.aud !== firebase.projectId || datos.iss !== 'https://securetoken.google.com/' + firebase.projectId ||
        typeof datos.sub !== 'string' || !datos.sub.length || datos.sub.length > 128 ||
        !Number.isInteger(datos.exp) || datos.exp <= segundos ||
        !Number.isInteger(datos.iat) || datos.iat > segundos || datos.iat < 0 || datos.iat >= datos.exp ||
        !Number.isInteger(datos.auth_time) || datos.auth_time > segundos || datos.auth_time < 0 ||
        datos.email_verified !== true || datos.firebase?.sign_in_provider !== 'google.com') throw sinSesion();
    try {
      if (caducan <= ahora()) {
        const r = await pedir(CERTIFICADOS, { signal: AbortSignal.timeout(4000), redirect: 'error' });
        if (!r.ok) throw new Error('certificados');
        claves = await r.json();
        const edad = Number(/(?:^|,)\s*max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1] || 0);
        caducan = ahora() + Math.min(edad, 21600) * 1000;
      }
      if (!Object.hasOwn(claves, cabecera.kid) ||
          !verify('RSA-SHA256', Buffer.from(cabeza + '.' + cuerpo), claves[cabecera.kid], Buffer.from(firma, 'base64url'))) throw sinSesion();
      const correo = String(datos.email || '').toLowerCase();
      if (!correos.includes(correo)) throw new ErrorAcceso(403, 'Este estudio es privado. Entra con la cuenta de Google autorizada.');
      // En cada petición se comprueba la cuenta actual: deshabilitada, borrada
      // o con la sesión revocada. Nada de caché larga de identidad.
      const r = await pedir('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebase.apiKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      if (r.status === 400 || r.status === 401) throw sinSesion();
      if (!r.ok) throw new Error('identidad no disponible');
      const cuenta = (await r.json()).users?.[0];
      if (!cuenta || cuenta.localId !== datos.sub || cuenta.disabled || cuenta.emailVerified !== true ||
          String(cuenta.email || '').toLowerCase() !== correo ||
          !Number.isFinite(Number(cuenta.validSince || 0)) || Number(cuenta.validSince || 0) > datos.auth_time) throw sinSesion();
      return { uid: datos.sub, correo, exp: datos.exp };
    } catch (e) {
      if (e instanceof ErrorAcceso) throw e;
      // Una caída de Google nunca abre la puerta ni filtra su diagnóstico.
      throw new ErrorAcceso(503, 'No se pudo comprobar tu acceso con Google en este momento. No se inició nada; vuelve a intentarlo en un momento.');
    }
  };
}
const verificarPropietario = crearVerificador();

function tokenDe(req) {
  const portador = req.headers.authorization;
  if (portador) return portador.startsWith('Bearer ') ? portador.slice(7) : '';
  return String(req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}

// El origen servido es el Host, nunca una cabecera de reenvío del cliente.
function mismoOrigen(req) {
  return req.headers.origin === 'https://' + req.headers.host && req.headers['sec-fetch-site'] !== 'cross-site';
}

function cabecerasPrivadas(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function rechazar(res, error) {
  const estado = error instanceof ErrorAcceso ? error.estado : 503;
  res.status(estado).json({
    error: error instanceof ErrorAcceso ? error.message : 'No se pudo comprobar tu acceso.',
    tipo: estado === 503 ? 'acceso_no_disponible' : 'acceso_denegado',
  });
  return true;
}

// Devuelve true si ya respondió (acceso denegado); false si puede seguir.
async function exigirPropietario(req, res) {
  cabecerasPrivadas(res);
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !mismoOrigen(req)) {
      throw new ErrorAcceso(403, 'Petición rechazada: no viene del propio estudio.');
    }
    req.propietario = await verificarPropietario(tokenDe(req));
    return false;
  } catch (e) { return rechazar(res, e); }
}

function ponerCookie(res, token = '', segundos = 0) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${segundos}`);
}

// El apretón de manos de la sesión vive dentro del endpoint de salud: así no
// gasta una función más del límite de Vercel. Solo la configuración pública y
// el propio inicio de sesión son accesibles sin sesión.
async function manejarSesion(req, res) {
  const accion = new URL(req.url, 'https://estudio.invalid').searchParams.get('acceso');
  if (!accion) return false;
  cabecerasPrivadas(res);
  try {
    if (!['config', 'estado', 'sesion', 'salir'].includes(accion)) throw new ErrorAcceso(404, 'Esa ruta de acceso no existe.');
    const metodo = accion === 'sesion' || accion === 'salir' ? 'POST' : 'GET';
    if (req.method !== metodo) throw new ErrorAcceso(405, 'Esta acción no admite ese tipo de petición.');
    if (metodo === 'POST' && !mismoOrigen(req)) throw new ErrorAcceso(403, 'Petición rechazada: no viene del propio estudio.');
    if (accion === 'salir') { ponerCookie(res); res.status(200).json({ salida: true }); return true; }
    if (accion === 'config') { res.status(200).json({ firebase: configuracion().firebase }); return true; }
    // La sesión solo se crea con el token recién emitido en la cabecera, nunca
    // con una cookie que ya estuviera puesta.
    if (accion === 'sesion' && !req.headers.authorization?.startsWith('Bearer ')) throw sinSesion();
    const identidad = await verificarPropietario(tokenDe(req));
    if (accion === 'sesion') ponerCookie(res, tokenDe(req), Math.max(0, identidad.exp - Math.floor(Date.now() / 1000)));
    res.status(200).json({ uid: identidad.uid, correo: identidad.correo });
    return true;
  } catch (e) { return rechazar(res, e); }
}

module.exports = {
  COOKIE, CERTIFICADOS, ErrorAcceso, configuracion, crearVerificador, verificarPropietario,
  exigirPropietario, manejarSesion, tokenDe, mismoOrigen, cabecerasPrivadas,
};
