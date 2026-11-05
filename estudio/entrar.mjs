// Página de entrar: Google mediante Firebase, y después el servidor
// comprueba que la cuenta es la autorizada.
import { obtenerCliente, sincronizarSesion, pedirSesion } from './acceso.mjs';

const boton = document.querySelector('#entrar');
const estado = document.querySelector('#estado');

async function pasar(usuario) {
  estado.textContent = 'Comprobando tu acceso…';
  await sincronizarSesion(usuario);
  location.replace('/');
}

async function olvidar(sdk, auth) {
  await pedirSesion('salir').catch(() => {});
  await sdk.signOut(auth).catch(() => {});
}

function explicar(error) {
  const codigo = error?.code || '';
  if (codigo === 'auth/popup-blocked') return 'Safari bloqueó la ventana de Google. Permite ventanas emergentes para este sitio y vuelve a pulsar Entrar.';
  if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request') return 'Se cerró la ventana de Google antes de terminar. Puedes intentarlo otra vez.';
  if (codigo === 'auth/unauthorized-domain') return 'Este dominio todavía no está autorizado para iniciar sesión. Vuelve a ejecutar el instalador en Cloud Shell: él lo autoriza.';
  if (codigo === 'auth/operation-not-allowed') return 'El inicio de sesión con Google no está activado en Firebase. El instalador de Cloud Shell te muestra el enlace para activarlo.';
  if (codigo === 'auth/network-request-failed') return 'No hay conexión con Google. Comprueba la red y vuelve a intentarlo.';
  if (codigo) return 'No se completó el acceso con Google. Puedes intentarlo otra vez.';
  return error?.message || 'No se pudo entrar.';
}

async function arrancar() {
  const { auth, sdk } = await obtenerCliente();
  const proveedor = new sdk.GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  boton.onclick = async () => {
    boton.disabled = true;
    try {
      const resultado = await sdk.signInWithPopup(auth, proveedor);
      await pasar(resultado.user);
    } catch (e) {
      estado.textContent = explicar(e);
      // Una cuenta que no es la autorizada no se queda medio dentro.
      if (e.status === 401 || e.status === 403) await olvidar(sdk, auth);
    } finally {
      boton.disabled = false;
    }
  };
  if (auth.currentUser) {
    try { await pasar(auth.currentUser); return; }
    catch (e) {
      estado.textContent = explicar(e);
      // Solo una cuenta rechazada se olvida. Un corte de red o de Google al
      // comprobar NO cierra la sesión de Google (antes sí, y había que
      // volver a elegir la cuenta por un simple fallo pasajero).
      if (e.status === 401 || e.status === 403) await olvidar(sdk, auth);
    }
  } else {
    estado.textContent = '';
  }
  boton.disabled = false;
}

arrancar().catch(error => { estado.textContent = explicar(error); });
