"""Google Cloud: cuenta, proyecto, facturación, APIs, cuenta de servicio,
bucket y la clave que necesita Vercel.

Nada de proyecto, correo ni bucket escrito en el código: todo se detecta o se
elige por número en Cloud Shell, y lo elegido se recuerda para la próxima vez.
"""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import tempfile

import comun
from comun import FalloInstalacion, ErrorGoogle, limpiar

RAIZ = Path(__file__).resolve().parents[1]
NOMBRE_CUENTA_SERVICIO = 'drama-studio'
PREFIJO = 'drama-studio'
RUTA_ESTADO_BUCKET = PREFIJO + '/instalacion/estado.json'

# Sección 4.4 de la especificación, más lo que necesita el inicio de sesión
# (Firebase) y la gestión de la cuenta de servicio.
APIS = [
    'aiplatform.googleapis.com',
    'storage.googleapis.com',
    'speech.googleapis.com',
    'texttospeech.googleapis.com',
    'iam.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'serviceusage.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    # El montador del episodio final (Cloud Run Job con FFmpeg).
    'run.googleapis.com',
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
]

# Roles de la cuenta de servicio (sección 4.4). storage.admin porque el
# estudio aplica el CORS del bucket (storage.buckets.update).
ROLES = [
    'roles/aiplatform.user',
    'roles/storage.admin',
    'roles/serviceusage.serviceUsageConsumer',
    # Lanzar el montador y consultar cómo va. El montador se lanza con su
    # trabajo propio (overrides: carpeta y salida); run.invoker no basta para
    # eso (fallo visto: «run.jobs.runWithOverrides denied»). El rol es el
    # mismo que usa la parte de cortos del estudio de anime.
    'roles/run.jobsExecutorWithOverrides',
    'roles/run.invoker',
    'roles/run.viewer',
]


def cuenta_activa(s):
    cuentas = [c for c in s.gcloud('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)').splitlines() if c.strip()]
    if not cuentas:
        raise FalloInstalacion('Cloud Shell no tiene ninguna cuenta de Google con sesión iniciada. Abre Cloud Shell desde el enlace de la conversación.')
    cuenta = cuentas[0].strip().lower()
    if cuenta.endswith('.gserviceaccount.com'):
        raise FalloInstalacion('Cloud Shell está usando una cuenta de servicio, no tu cuenta personal. Abre Cloud Shell desde el enlace de la conversación.')
    return cuenta


def _proyectos(s):
    lista = s.gcloud('projects', 'list', json_salida=True) or []
    return [p for p in lista if p.get('lifecycleState', 'ACTIVE') == 'ACTIVE' and p.get('projectId')]


def _con_organizacion(proyecto):
    return (proyecto.get('parent') or {}).get('type') == 'organization'


def _tiene_instalacion(s, proyecto):
    """¿Hay ya una instalación de Drama guardada en algún bucket del proyecto?"""
    try:
        buckets = s.gcloud('storage', 'buckets', 'list', '--project', proyecto, json_salida=True) or []
    except FalloInstalacion:
        return False
    for b in buckets:
        try:
            anterior = leer_estado_bucket(s, _nombre_bucket(b))
        except FalloInstalacion:
            continue
        if anterior and anterior.get('proyecto') == proyecto:
            return True
    return False


def elegir_proyecto(s, estado):
    recordado = estado.get('proyecto')
    if recordado:
        if s.existe('projects', 'describe', recordado):
            s.decir(f'Proyecto: {recordado} (el de la instalación anterior)')
            return recordado
        s.decir(f'El proyecto de la instalación anterior ({recordado}) ya no está accesible con esta cuenta.')
    todos = _proyectos(s)
    # Un proyecto dentro de una organización suele tener prohibido crear claves
    # de cuentas de servicio, y Vercel necesita una. No se ofrece.
    proyectos = [p for p in todos if not _con_organizacion(p)]
    ocultos = len(todos) - len(proyectos)
    # Si ya hay una instalación (por ejemplo, Cloud Shell perdió su carpeta),
    # se usa sin preguntar.
    instalados = [p for p in proyectos if _tiene_instalacion(s, p['projectId'])]
    if len(instalados) == 1:
        elegido = instalados[0]
        s.decir(f'Encontré tu instalación en el proyecto {elegido.get("name") or ""} ({elegido["projectId"]}).')
        return elegido['projectId']
    if ocultos:
        s.decir(f'No muestro {ocultos} proyecto(s) que están dentro de una organización: '
                'su regla de seguridad no deja crear la clave que necesita Vercel.')
    opciones = [f'{p.get("name") or p["projectId"]} ({p["projectId"]})' for p in proyectos]
    opciones.append('Crear un proyecto nuevo solo para Drama AI Studio')
    indice = s.elegir('¿En qué proyecto de Google Cloud instalo Drama AI Studio?', opciones)
    if indice < len(proyectos):
        return proyectos[indice]['projectId']
    return crear_proyecto(s)


def crear_proyecto(s):
    for _ in range(5):
        identificador = 'drama-studio-' + secrets.token_hex(3)
        try:
            s.gcloud('projects', 'create', identificador, '--name=Drama AI Studio')
        except ErrorGoogle as error:
            if 'already' in error.errores.lower() or 'in use' in error.errores.lower():
                continue
            raise
        s.decir(f'Proyecto creado: {identificador}')
        vincular_facturacion(s, identificador)
        return identificador
    raise FalloInstalacion('Google no aceptó ningún nombre para el proyecto nuevo. Vuelve a escribir ./c.')


def vincular_facturacion(s, proyecto):
    cuentas = s.gcloud('billing', 'accounts', 'list', '--filter=open=true', json_salida=True) or []
    if not cuentas:
        raise FalloInstalacion('No tienes ninguna cuenta de facturación abierta en Google Cloud. Crea una en la consola '
                               '(Facturación) y vuelve a escribir ./c.')
    if len(cuentas) == 1:
        elegida = cuentas[0]
    else:
        elegida = cuentas[s.elegir('¿Qué cuenta de facturación usa el proyecto?', [c.get('displayName') or c['name'] for c in cuentas])]
    identificador = elegida['name'].split('/')[-1]
    s.gcloud('billing', 'projects', 'link', proyecto, '--billing-account=' + identificador, '--format=none')
    s.decir('Facturación vinculada al proyecto.')


def comprobar_facturacion(s, proyecto):
    """True si está activa; None si no se pudo comprobar (se avisa, no se inventa)."""
    try:
        datos = s.gcloud('billing', 'projects', 'describe', proyecto, json_salida=True) or {}
    except FalloInstalacion as error:
        s.decir('Aviso: no pude comprobar la facturación del proyecto. Sigo; si falta, Google lo dirá en el siguiente paso.')
        s.decir('  Detalle de Google: ' + (error.detalle or error.mensaje)[:300])
        return None
    if datos.get('billingEnabled'):
        return True
    if s.elegir('El proyecto no tiene facturación activa y Vertex AI la necesita.',
                ['Vincular ahora una cuenta de facturación', 'Salir']) == 1:
        raise FalloInstalacion('Instalación detenida: el proyecto no tiene facturación activa.')
    vincular_facturacion(s, proyecto)
    return True


def activar_apis(s, proyecto):
    s.gcloud('services', 'enable', *APIS, '--project', proyecto, tiempo=600)


def correo_cuenta_servicio(proyecto):
    return f'{NOMBRE_CUENTA_SERVICIO}@{proyecto}.iam.gserviceaccount.com'


def _reintentar_si_propaga(s, accion):
    """Una cuenta de servicio recién creada tarda en existir para IAM."""
    for intento in range(7):
        try:
            return accion()
        except ErrorGoogle as error:
            if intento == 6 or not re.search(r'does not exist|not found|INVALID_ARGUMENT', error.errores, re.I):
                raise
            s.decir('  Google todavía está registrando la cuenta de servicio; espero diez segundos…')
            s.esperar(10)


def preparar_cuenta_servicio(s, proyecto):
    correo = correo_cuenta_servicio(proyecto)
    if not s.existe('iam', 'service-accounts', 'describe', correo, '--project', proyecto):
        s.gcloud('iam', 'service-accounts', 'create', NOMBRE_CUENTA_SERVICIO, '--display-name=Drama AI Studio', '--project', proyecto)
        s.decir('Cuenta de servicio creada: ' + correo)
    for rol in ROLES:
        # --condition=None: sin él, gcloud se niega en modo no interactivo si
        # la política del proyecto ya tiene alguna condición (fallo real del
        # instalador del estudio de anime).
        _reintentar_si_propaga(s, lambda rol=rol: s.gcloud(
            'projects', 'add-iam-policy-binding', proyecto, '--member=serviceAccount:' + correo,
            '--role=' + rol, '--condition=None', '--format=none'))
    return correo


def _nombre_bucket(b):
    nombre = b.get('name') or ''
    if not nombre and b.get('storage_url'):
        nombre = b['storage_url'].replace('gs://', '').strip('/')
    return nombre


def _escribir_cors(s, bucket):
    with tempfile.TemporaryDirectory(prefix='drama-cors-') as carpeta:
        archivo = Path(carpeta) / 'cors.json'
        archivo.write_text((RAIZ / 'comun' / 'cors-bucket.json').read_text())
        s.gcloud('storage', 'buckets', 'update', 'gs://' + bucket, '--cors-file=' + str(archivo), '--format=none')


def leer_estado_bucket(s, bucket):
    ruta = f'gs://{bucket}/{RUTA_ESTADO_BUCKET}'
    if not s.existe('storage', 'objects', 'describe', ruta):
        return None
    try:
        return json.loads(s.gcloud('storage', 'cat', ruta) or 'null')
    except ValueError:
        return None


def guardar_estado_bucket(s, bucket, estado):
    publico = {k: v for k, v in estado.items() if k not in ('huellaVariables',)}
    with tempfile.TemporaryDirectory(prefix='drama-estado-') as carpeta:
        archivo = Path(carpeta) / 'estado.json'
        archivo.write_text(json.dumps(publico, indent=2, ensure_ascii=False))
        s.gcloud('storage', 'cp', str(archivo), f'gs://{bucket}/{RUTA_ESTADO_BUCKET}', '--format=none')


def preparar_bucket(s, proyecto, estado):
    recordado = estado.get('bucket') if estado.get('proyecto') == proyecto else None
    if recordado and s.existe('storage', 'buckets', 'describe', 'gs://' + recordado, '--project', proyecto):
        _escribir_cors(s, recordado)
        s.decir(f'Bucket: {recordado} (el de la instalación anterior)')
        return recordado

    buckets = [b for b in (s.gcloud('storage', 'buckets', 'list', '--project', proyecto, json_salida=True) or []) if _nombre_bucket(b)]
    # ¿Hay ya una instalación de Drama en alguno? (Cloud Shell pudo perder su
    # carpeta personal.) Se recupera en vez de crear otra.
    for b in buckets:
        try:
            anterior = leer_estado_bucket(s, _nombre_bucket(b))
        except FalloInstalacion:
            continue   # un bucket que no se puede leer no es el nuestro
        if anterior and anterior.get('proyecto') == proyecto:
            nombre = _nombre_bucket(b)
            s.decir(f'Encontré la instalación anterior en el bucket {nombre}; la reutilizo.')
            for clave in ('vercel', 'claveId', 'firebase'):
                if clave in anterior and clave not in estado:
                    estado[clave] = anterior[clave]
            _escribir_cors(s, nombre)
            return nombre

    nuevo = f'{proyecto}-drama-studio'[:63]
    opciones = [f'Crear uno nuevo para Drama: {nuevo} (recomendado)']
    opciones += [f'Usar {_nombre_bucket(b)} ({b.get("location", "ubicación desconocida")}); todo irá en su carpeta {PREFIJO}/' for b in buckets]
    # Sin buckets en el proyecto no hay nada que elegir: se crea el propio.
    indice = s.elegir('¿Dónde guardo los proyectos, imágenes y videos?', opciones) if buckets else 0
    if indice > 0:
        elegido = buckets[indice - 1]
        nombre = _nombre_bucket(elegido)
        if not str(elegido.get('location', 'US')).upper().startswith('US'):
            s.decir('Aviso: ese bucket no está en Estados Unidos; Veo trabaja en us-central1.')
        _escribir_cors(s, nombre)
        return nombre
    for intento in range(4):
        nombre = nuevo if intento == 0 else f'{proyecto}-drama-{secrets.token_hex(2)}'[:63]
        try:
            s.gcloud('storage', 'buckets', 'create', 'gs://' + nombre, '--project', proyecto, '--location=US',
                     '--uniform-bucket-level-access', '--public-access-prevention', '--format=none')
        except ErrorGoogle as error:
            if '409' in error.errores or 'already' in error.errores.lower() or 'not available' in error.errores.lower():
                continue
            raise
        s.decir('Bucket creado: ' + nombre + ' (privado, en US)')
        _escribir_cors(s, nombre)
        return nombre
    raise FalloInstalacion('Google no aceptó ningún nombre para el bucket nuevo. Vuelve a escribir ./c.')


def _claves_existentes(s, correo, proyecto):
    lista = s.gcloud('iam', 'service-accounts', 'keys', 'list', '--iam-account=' + correo, '--managed-by=user',
                     '--project', proyecto, json_salida=True) or []
    return {k.get('name', '').split('/')[-1] for k in lista if k.get('name')}


def preparar_clave(s, proyecto, correo, estado):
    """Devuelve (valor_base64, id_clave, nueva). La clave vive solo en la
    carpeta personal de Cloud Shell (permisos 600) y en Vercel; nunca se
    imprime ni se sube al repositorio ni al bucket."""
    archivo = comun.ARCHIVO_CLAVE
    existentes = _claves_existentes(s, correo, proyecto)
    if archivo.exists():
        try:
            datos = json.loads(archivo.read_text())
        except ValueError:
            datos = {}
        if datos.get('client_email') == correo and datos.get('private_key_id') in existentes and 'PRIVATE KEY' in str(datos.get('private_key')):
            s.decir('Clave de la cuenta de servicio: la misma de antes (no se crea otra).')
            return _base64(datos), datos['private_key_id'], False
    comun.DIRECTORIO_LOCAL.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(comun.DIRECTORIO_LOCAL, 0o700)
    temporal = archivo.with_suffix('.nueva')
    if temporal.exists():
        temporal.unlink()
    _reintentar_si_propaga(s, lambda: s.gcloud('iam', 'service-accounts', 'keys', 'create', str(temporal),
                                               '--iam-account=' + correo, '--project', proyecto, '--format=none'))
    os.chmod(temporal, 0o600)
    datos = json.loads(temporal.read_text())
    temporal.replace(archivo)
    os.chmod(archivo, 0o600)
    s.decir('Clave nueva creada para Vercel (guardada solo en tu Cloud Shell).')
    return _base64(datos), datos['private_key_id'], True


def borrar_clave_antigua(s, proyecto, correo, clave_id):
    """Solo borra una clave que creó este instalador y que ya no está en uso."""
    try:
        s.gcloud('iam', 'service-accounts', 'keys', 'delete', clave_id, '--iam-account=' + correo, '--project', proyecto, '--format=none')
        s.decir('Clave anterior retirada.')
    except FalloInstalacion as error:
        s.decir('Aviso: no pude retirar la clave anterior; no afecta al estudio. ' + limpiar(error.detalle or error.mensaje)[:200])


def _base64(datos):
    compacto = json.dumps(datos, separators=(',', ':')).encode()
    return base64.b64encode(compacto).decode('ascii')
