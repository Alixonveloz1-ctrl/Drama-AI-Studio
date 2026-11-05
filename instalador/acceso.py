"""Inicio de sesión con Google para el estudio, mediante Firebase
Authentication (el mismo mecanismo que el estudio de anime).

Lo único que Google no deja hacer por API es activar el proveedor «Google»
la primera vez: Firebase crea él mismo el cliente OAuth desde su consola.
Para eso se muestra un enlace y se pregunta por número cuándo está hecho.
Nunca se pide pegar una clave, un JSON ni un identificador largo.
"""
import json
import urllib.parse

from comun import FalloInstalacion, limpiar

FIREBASE = 'https://firebase.googleapis.com/v1beta1'
IDENTIDAD = 'https://identitytoolkit.googleapis.com/admin/v2'
NOMBRE_APP = 'Drama AI Studio'


def _fallo(operacion, estado, cuerpo):
    error = cuerpo.get('error', {}) if isinstance(cuerpo, dict) else {}
    if not isinstance(error, dict):
        error = {'message': str(error)}
    detalle = limpiar(f'{estado} {error.get("status", "")} — {error.get("message", "sin detalle")}')
    return FalloInstalacion(f'Google rechazó {operacion}.', detalle)


def _con_cuenta(url, cuenta):
    separador = '&' if '?' in url else '?'
    return url + separador + 'authuser=' + urllib.parse.quote(cuenta)


def _esperar_operacion(s, proyecto, operacion):
    for _ in range(90):
        if operacion.get('done'):
            if operacion.get('error'):
                raise FalloInstalacion('Firebase no terminó la configuración.', limpiar(json.dumps(operacion['error'])))
            return operacion.get('response', {})
        s.esperar(2)
        estado, operacion = s.http('GET', f'{FIREBASE}/{operacion["name"]}', proyecto=proyecto)
        if estado != 200:
            raise _fallo('la consulta de una operación de Firebase', estado, operacion)
    raise FalloInstalacion('Firebase sigue preparando el proyecto. Vuelve a escribir ./c dentro de un minuto.')


def _asegurar_proyecto_firebase(s, proyecto, cuenta):
    while True:
        estado, _ = s.http('GET', f'{FIREBASE}/projects/{proyecto}', proyecto=proyecto)
        if estado == 200:
            return
        estado, cuerpo = s.http('POST', f'{FIREBASE}/projects/{proyecto}:addFirebase', {}, proyecto=proyecto)
        if estado == 200:
            _esperar_operacion(s, proyecto, cuerpo)
            s.decir('Firebase activado en el proyecto (solo para el inicio de sesión).')
            return
        # La primera vez Google puede exigir aceptar las condiciones de
        # Firebase en su consola. Se explica y se espera.
        fallo = _fallo('activar Firebase en el proyecto', estado, cuerpo)
        s.decir('\nGoogle no deja activar Firebase desde aquí todavía.')
        s.decir('  Detalle de Google: ' + fallo.detalle)
        s.decir('Abre este enlace, pulsa «Crear un proyecto» y, abajo, «Añadir Firebase a un proyecto de Google Cloud».')
        s.decir(f'Elige el proyecto {proyecto}, acepta las condiciones y termina (Google Analytics no hace falta):')
        s.decir('  ' + _con_cuenta('https://console.firebase.google.com/', cuenta))
        if s.elegir('Cuando termines en el navegador:', ['Ya está, comprobar de nuevo', 'Salir']) == 1:
            raise FalloInstalacion('Instalación detenida: falta activar Firebase para el inicio de sesión.')


def _aplicacion_web(s, proyecto):
    estado, cuerpo = s.http('GET', f'{FIREBASE}/projects/{proyecto}/webApps', proyecto=proyecto)
    if estado != 200:
        raise _fallo('la lista de aplicaciones de Firebase', estado, cuerpo)
    app = next((a for a in cuerpo.get('apps', []) if a.get('displayName') == NOMBRE_APP and a.get('state', 'ACTIVE') == 'ACTIVE'), None)
    if app:
        return app
    estado, cuerpo = s.http('POST', f'{FIREBASE}/projects/{proyecto}/webApps', {'displayName': NOMBRE_APP}, proyecto=proyecto)
    if estado != 200:
        raise _fallo('crear la aplicación web en Firebase', estado, cuerpo)
    app = _esperar_operacion(s, proyecto, cuerpo)
    s.decir('Aplicación web de Firebase creada: ' + NOMBRE_APP)
    return app


def _configuracion(s, proyecto, app):
    # Justo después de crear la aplicación, Google puede tardar unos segundos
    # en tener lista su clave pública de navegador.
    for _ in range(10):
        estado, cuerpo = s.http('GET', f'{FIREBASE}/{app["name"]}/config', proyecto=proyecto)
        if estado != 200:
            raise _fallo('la configuración de la aplicación de Firebase', estado, cuerpo)
        if all(cuerpo.get(k) for k in ('apiKey', 'authDomain', 'projectId', 'appId')):
            return {k: cuerpo[k] for k in ('apiKey', 'authDomain', 'projectId', 'appId')}
        s.esperar(3)
    raise FalloInstalacion('Firebase todavía no entregó la configuración de inicio de sesión. Vuelve a escribir ./c dentro de un minuto.')


def _google_activado(s, proyecto):
    estado, cuerpo = s.http('GET', f'{IDENTIDAD}/projects/{proyecto}/defaultSupportedIdpConfigs/google.com', proyecto=proyecto)
    return estado == 200 and bool(cuerpo.get('enabled'))


def preparar_firebase(s, proyecto, cuenta):
    """Devuelve la configuración pública del cliente (no es una credencial)."""
    _asegurar_proyecto_firebase(s, proyecto, cuenta)
    app = _aplicacion_web(s, proyecto)
    configuracion = _configuracion(s, proyecto, app)
    while not _google_activado(s, proyecto):
        s.decir('\nFalta un paso que Google solo permite en el navegador: activar «Google» como forma de entrar.')
        s.decir('Abre este enlace. Si ves «Comenzar», tócalo. Después elige «Google», actívalo,')
        s.decir('escoge tu correo como correo de asistencia y pulsa «Guardar»:')
        s.decir('  ' + _con_cuenta(f'https://console.firebase.google.com/project/{proyecto}/authentication/providers', cuenta))
        if s.elegir('Cuando lo hayas guardado:', ['Ya está, comprobar de nuevo', 'Salir']) == 1:
            raise FalloInstalacion('Instalación detenida: falta activar el inicio de sesión con Google en Firebase.')
    s.decir('Inicio de sesión con Google: activado.')
    return configuracion, app.get('appId')


def autorizar_dominios(s, proyecto, dominios):
    """Añade los dominios del estudio a los permitidos para entrar, sin
    quitar ninguno de los que ya hubiera."""
    url = f'{IDENTIDAD}/projects/{proyecto}/config'
    estado, cuerpo = s.http('GET', url, proyecto=proyecto)
    if estado != 200:
        raise _fallo('la lista de dominios autorizados para entrar', estado, cuerpo)
    actuales = cuerpo.get('authorizedDomains', [])
    nuevos = sorted(set(actuales) | {d for d in dominios if d})
    if set(nuevos) == set(actuales):
        return False
    estado, cuerpo = s.http('PATCH', url + '?updateMask=authorizedDomains',
                            {'name': f'projects/{proyecto}/config', 'authorizedDomains': nuevos}, proyecto=proyecto)
    if estado != 200:
        raise _fallo('autorizar el dominio del estudio para entrar', estado, cuerpo)
    s.decir('Dominio del estudio autorizado para entrar con Google.')
    return True
