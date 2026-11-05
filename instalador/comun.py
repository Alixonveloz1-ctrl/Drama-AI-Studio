"""Piezas comunes del instalador: ejecutar comandos, preguntar por número,
llamar a APIs REST con el token de gcloud y guardar el estado local.

Reglas que vienen del estudio de anime:
  * Cloud Shell no permite pegar desde el iPhone: todo se elige por número.
  * Nunca se imprime una clave, un token ni un JSON de credenciales, ni
    siquiera dentro de un error de Google.
  * Un error al comprobar algo NO es prueba de que no exista: solo un
    "no encontrado" explícito cuenta como ausencia.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request

DIRECTORIO_LOCAL = Path(os.environ.get('DRAMA_STUDIO_HOME', str(Path.home() / '.drama-studio')))
ARCHIVO_ESTADO = DIRECTORIO_LOCAL / 'estado.json'
ARCHIVO_CLAVE = DIRECTORIO_LOCAL / 'clave-cuenta-servicio.json'

# «Cannot find job» es como responde gcloud run jobs describe cuando el
# montador aún no existe (fallo real de la primera instalación del montador).
NO_ENCONTRADO = re.compile(r'\bNOT_FOUND\b|\b404\b|not found|does not exist|matched no objects|was not found|cannot find|could not find', re.I)


class FalloInstalacion(Exception):
    """Un fallo explicado en español, con el detalle del proveedor aparte."""

    def __init__(self, mensaje, detalle=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.detalle = detalle


def limpiar(texto, secretos=()):
    """Quita claves, tokens y credenciales de un texto antes de mostrarlo."""
    mensaje = str(texto or '')
    for secreto in sorted({s for s in secretos if s}, key=len, reverse=True):
        mensaje = mensaje.replace(secreto, '[omitido]')
    mensaje = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', mensaje)
    mensaje = re.sub(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)', '[clave omitida]', mensaje, flags=re.S)
    mensaje = re.sub(r'(?i)(bearer\s+)[^\s"\']+', r'\1[omitido]', mensaje)
    mensaje = re.sub(r'ya29\.[A-Za-z0-9._~-]+', '[token omitido]', mensaje)
    mensaje = re.sub(r'vc[a-z]_[A-Za-z0-9_-]{10,}', '[token omitido]', mensaje)
    mensaje = re.sub(r'(?i)(["\']?(?:access_token|refresh_token|id_token|private_key|private_key_id|client_secret|token)["\']?\s*[:=]\s*)("[^"]*"|\'[^\']*\'|[^\s,}]+)', r'\1[omitido]', mensaje)
    return mensaje.strip()[:3000]


class Sistema:
    """Todo lo que toca el mundo exterior pasa por aquí (las pruebas lo sustituyen)."""

    def __init__(self):
        self._token = None
        self._token_hora = 0

    # ─── Pantalla y teclado ───
    def decir(self, texto=''):
        print(texto, flush=True)

    def leer(self, pregunta):
        try:
            return input(pregunta)
        except EOFError as error:
            raise FalloInstalacion('No se pudo leer la respuesta del teclado. Vuelve a escribir ./c.') from error

    def esperar(self, segundos):
        time.sleep(segundos)

    def elegir(self, titulo, opciones):
        """Devuelve el índice (desde 0) de la opción elegida por número."""
        if not opciones:
            raise FalloInstalacion('No hay opciones para elegir: ' + titulo)
        self.decir('\n' + titulo)
        for i, opcion in enumerate(opciones, 1):
            self.decir(f'  {i}. {opcion}')
        while True:
            respuesta = self.leer('Escribe el número y pulsa Enter: ').strip()
            if respuesta.isdigit() and 1 <= int(respuesta) <= len(opciones):
                return int(respuesta) - 1
            self.decir('Ese número no está en la lista.')

    # ─── Comandos ───
    def ejecutar(self, args, capturar=True, cwd=None, entorno=None, tiempo=300, interactivo=False):
        """Ejecuta un comando. Devuelve (código, salida, errores)."""
        hecho = threading.Event()
        if capturar and not interactivo:
            threading.Thread(target=self._latido, args=(hecho,), daemon=True).start()
        try:
            resultado = subprocess.run(
                args, cwd=cwd, text=True,
                stdin=None if interactivo else subprocess.DEVNULL,
                stdout=subprocess.PIPE if capturar else None,
                stderr=subprocess.PIPE if capturar else None,
                timeout=None if interactivo else tiempo,
                env={**os.environ, **(entorno or {})},
            )
        except subprocess.TimeoutExpired as error:
            raise FalloInstalacion('Google o Vercel tardaron demasiado en responder. La operación puede seguir en marcha; '
                                   'no se repite sola. Vuelve a escribir ./c dentro de un minuto.') from error
        except FileNotFoundError as error:
            raise FalloInstalacion(f'Falta la herramienta "{args[0]}" en este Cloud Shell. Abre Cloud Shell desde el enlace de la conversación.') from error
        finally:
            hecho.set()
        return resultado.returncode, (resultado.stdout or '').strip(), (resultado.stderr or '').strip()

    def _latido(self, hecho):
        while not hecho.wait(20):
            self.decir('  …esperando respuesta…')

    def gcloud(self, *args, json_salida=False, comprobar=True, tiempo=300):
        argumentos = ['gcloud', *args, '--quiet']
        if json_salida:
            argumentos.append('--format=json')
        codigo, salida, errores = self.ejecutar(argumentos, tiempo=tiempo)
        if codigo and comprobar:
            raise ErrorGoogle(' '.join(args[:3]), errores)
        if json_salida:
            try:
                return json.loads(salida or 'null')
            except ValueError as error:
                raise FalloInstalacion('Google devolvió una respuesta que no se entiende al pedir: ' + ' '.join(args[:3])) from error
        return salida

    def existe(self, *args):
        """True si existe; False solo si Google dice explícitamente que no."""
        codigo, _, errores = self.ejecutar(['gcloud', *args, '--quiet', '--format=none'], tiempo=120)
        if codigo == 0:
            return True
        if NO_ENCONTRADO.search(errores or ''):
            return False
        raise FalloInstalacion('No se pudo comprobar si existe: ' + ' '.join(args[:3]) + '. No se dio por vacío.', limpiar(errores))

    # ─── REST de Google con el token de la cuenta de Cloud Shell ───
    def token_google(self):
        if not self._token or time.time() - self._token_hora > 2400:
            self._token = self.gcloud('auth', 'print-access-token')
            self._token_hora = time.time()
        return self._token

    def http(self, metodo, url, datos=None, proyecto=None, tiempo=30):
        """Devuelve (estado, cuerpo_json). No lanza por códigos HTTP."""
        cabeceras = {'Authorization': 'Bearer ' + self.token_google(), 'Content-Type': 'application/json'}
        if proyecto:
            cabeceras['x-goog-user-project'] = proyecto
        peticion = urllib.request.Request(url, method=metodo, headers=cabeceras,
                                          data=None if datos is None else json.dumps(datos).encode())
        try:
            with urllib.request.urlopen(peticion, timeout=tiempo) as respuesta:
                texto = respuesta.read().decode() or '{}'
                return respuesta.status, json.loads(texto)
        except urllib.error.HTTPError as error:
            try:
                cuerpo = json.loads(error.read(65536).decode() or '{}')
            except ValueError:
                cuerpo = {}
            return error.code, cuerpo
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise FalloInstalacion('No hubo conexión con Google al llamar a ' + url.split('/')[2] + '.', limpiar(str(error))) from error


class ErrorGoogle(FalloInstalacion):
    """Fallo de un comando gcloud, explicado en palabras."""

    def __init__(self, operacion, errores):
        detalle = limpiar(errores) or 'Google no devolvió detalles.'
        super().__init__(explicar_google(operacion, detalle), detalle)
        self.errores = errores or ''


def explicar_google(operacion, detalle):
    texto = detalle.lower()
    if 'billing' in texto and ('enable' in texto or 'not found' in texto or 'disabled' in texto or 'must' in texto):
        return 'Google exige facturación activa en el proyecto para esto. Actívala en la consola de Google Cloud (Facturación) y vuelve a escribir ./c.'
    if 'constraints/iam.disableserviceaccountkeycreation' in texto or 'key creation is not allowed' in texto:
        return ('Tu organización de Google Cloud prohíbe crear claves de cuentas de servicio, y Vercel necesita una. '
                'Hay que quitar esa restricción de la organización (política iam.disableServiceAccountKeyCreation).')
    if 'permission' in texto or 'denied' in texto or '403' in texto:
        return f'Google negó el permiso para «{operacion}». La cuenta de Cloud Shell necesita ser propietaria del proyecto.'
    if 'quota' in texto or 'exceeded' in texto:
        return f'Google rechazó «{operacion}» por un límite de la cuenta.'
    return f'Google no pudo completar «{operacion}».'


# ─── Estado local (la carpeta personal de Cloud Shell se conserva) ───
def cargar_estado():
    try:
        return json.loads(ARCHIVO_ESTADO.read_text())
    except FileNotFoundError:
        return {}
    except (ValueError, OSError):
        return {}


def guardar_estado(estado):
    DIRECTORIO_LOCAL.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(DIRECTORIO_LOCAL, 0o700)
    temporal = ARCHIVO_ESTADO.with_suffix('.tmp')
    temporal.write_text(json.dumps(estado, indent=2, ensure_ascii=False))
    temporal.replace(ARCHIVO_ESTADO)
