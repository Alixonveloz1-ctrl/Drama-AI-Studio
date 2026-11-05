// ════════════════════════════════════════════════════════════════
// ACCESO (navegador) — inicio de sesión con Google vía Firebase y montaje
// único del estudio.
//
// Esto solo coordina la interfaz. La protección real está en el servidor:
// cada endpoint comprueba al propietario por su cuenta.
// ════════════════════════════════════════════════════════════════
import { usarToken } from './red.mjs';

const RUTA = '/api/salud?acceso=';
const FIREBASE = 'https://www.gstatic.com/firebasejs/11.10.0/';
let cliente;

export async function pedirSesion(accion, token) {
  const envio = accion === 'sesion' || accion === 'salir';
  let respuesta;
  try {
    respuesta = await fetch(RUTA + accion, {
      method: envio ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
  } catch {
    const error = new Error('No hay conexión con el estudio. Comprueba la red y vuelve a intentarlo.');
    error.red = true;
    throw error;
  }
  const valor = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(valor.error || 'No se pudo comprobar tu acceso.');
    error.status = respuesta.status;
    throw error;
  }
  return valor;
}

export function obtenerCliente() {
  return cliente ||= (async () => {
    const config = await pedirSesion('config');
    const [app, sdk] = await Promise.all([
      import(FIREBASE + 'firebase-app.js'),
      import(FIREBASE + 'firebase-auth.js'),
    ]);
    const auth = sdk.getAuth(app.getApps()[0] || app.initializeApp(config.firebase));
    await auth.authStateReady();
    return { auth, sdk };
  })().catch(error => { cliente = undefined; throw error; });
}

export async function sincronizarSesion(usuario) {
  return pedirSesion('sesion', await usuario.getIdToken());
}

export function rutaEntrar() {
  return '/entrar/';
}

export async function cerrarSesion() {
  // Primero se borra la cookie del servidor, después la sesión de Firebase.
  await pedirSesion('salir').catch(() => {});
  try {
    const { auth, sdk } = await obtenerCliente();
    await sdk.signOut(auth);
  } catch {}
  location.replace(rutaEntrar());
}

// Monta el estudio UNA sola vez por usuario. En el estudio de anime el
// formulario de creación llegó a aparecer tres veces porque las
// notificaciones concurrentes de la sesión no compartían un único montaje.
// Aquí todas comparten la misma promesa, y un refresco del token (cada hora)
// solo renueva la cookie: nunca reconstruye ni borra lo que se está
// escribiendo.
export async function protegerPagina(alMontar, alFallar = mostrarErrorSesion) {
  const { auth, sdk } = await obtenerCliente();
  // Cada petición del estudio lleva el token vigente de la cuenta (ver red):
  // la sesión dura lo que dure la cuenta en el teléfono, no una hora.
  usarToken(forzar => auth.currentUser?.getIdToken(forzar === true));
  let montado, montando, reintento;
  const empezar = async usuario => {
    await sincronizarSesion(usuario);
    if (montado === usuario.uid) return;
    if (!montando || montando.uid !== usuario.uid) {
      const actual = { uid: usuario.uid };
      actual.promesa = Promise.resolve()
        .then(() => alMontar(usuario))
        .then(() => { montado = usuario.uid; })
        .finally(() => { if (montando === actual) montando = undefined; });
      montando = actual;
    }
    await montando.promesa;
  };
  // Un fallo suelto (un corte, un arranque en frío) dejaba la página vacía
  // hasta el siguiente refresco del token, una hora después. Se reintenta
  // con espera creciente; un acceso denegado es una respuesta, no un corte.
  const intentar = async (usuario, espera = 2000) => {
    clearTimeout(reintento);
    try { await empezar(usuario); }
    catch (e) {
      // Con el estudio ya abierto, un corte al renovar la sesión no es motivo
      // para tapar la pantalla con «Volver a entrar» (eso parecía que la
      // cuenta se había desconectado en mitad de un lote): se reintenta en
      // silencio, y las peticiones llevan su propio token igualmente.
      const denegado = e.status === 401 || e.status === 403;
      if (!montado || denegado) alFallar(e);
      if (denegado) return;
      reintento = setTimeout(() => intentar(usuario, Math.min(espera * 2, 30000)), espera);
    }
  };
  sdk.onIdTokenChanged(auth, async usuario => {
    if (!usuario) {
      await pedirSesion('salir').catch(() => {});
      location.replace(rutaEntrar());
      return;
    }
    await intentar(usuario);
  });
  // Safari suspende los temporizadores en segundo plano. Al volver se renueva
  // la sesión y se termina un montaje que un fallo dejó a medias; nunca se
  // repite una generación ni se recarga un proyecto abierto.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && auth.currentUser) intentar(auth.currentUser);
  });
}

export function mostrarErrorSesion(error) {
  let aviso = document.querySelector('#aviso-acceso');
  if (!aviso) {
    aviso = document.createElement('dialog');
    aviso.id = 'aviso-acceso';
    aviso.style.cssText = 'max-width:28rem;padding:24px;border:1px solid rgba(180,140,255,.3);border-radius:18px;background:#0f0f2e;color:#f0eeff;font:15px/1.6 "M PLUS Rounded 1c",sans-serif';
    const texto = document.createElement('p');
    aviso.append(texto);
    const entrar = document.createElement('a');
    entrar.textContent = 'Volver a entrar';
    entrar.href = rutaEntrar();
    entrar.style.cssText = 'color:#00e5ff;display:inline-block;margin-right:18px';
    aviso.append(entrar);
    const cerrar = document.createElement('button');
    cerrar.textContent = 'Cerrar';
    cerrar.style.cssText = 'margin-top:16px;padding:10px 16px;border-radius:11px;border:1px solid rgba(180,140,255,.3);background:transparent;color:inherit';
    cerrar.onclick = () => aviso.close();
    aviso.append(cerrar);
    document.body.append(aviso);
  }
  aviso.querySelector('p').textContent = error?.message || String(error);
  if (!aviso.open) aviso.showModal();
}
