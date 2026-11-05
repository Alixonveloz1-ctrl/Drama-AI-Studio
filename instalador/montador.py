"""El montador del episodio final: un trabajo de Cloud Run con FFmpeg.

Se construye a partir de la carpeta montador/ del repositorio y se despliega
con la cuenta de servicio del estudio. Es idempotente: si la carpeta no ha
cambiado y el trabajo ya existe, no se vuelve a construir (tarda minutos).
"""
import hashlib
from pathlib import Path
import re

RAIZ = Path(__file__).resolve().parents[1]
CARPETA = RAIZ / 'montador'
TRABAJO = 'drama-studio-montage'
REGION = 'us-central1'
REPOSITORIO = 'drama-studio'

# La cuenta con la que Cloud Build construye la imagen necesita estos roles
# (en los proyectos nuevos ya no los trae de serie).
ROLES_CONSTRUCCION = [
    'roles/artifactregistry.writer',
    'roles/logging.logWriter',
    'roles/storage.objectViewer',
]


def huella_carpeta():
    h = hashlib.sha256()
    for archivo in sorted(p for p in CARPETA.rglob('*') if p.is_file()):
        h.update(archivo.relative_to(CARPETA).as_posix().encode())
        h.update(archivo.read_bytes())
    return h.hexdigest()


def _cuenta_construccion(s, proyecto):
    salida = s.gcloud('builds', 'get-default-service-account', '--project', proyecto, comprobar=False)
    m = re.search(r'([\w.-]+@[\w.-]+\.iam\.gserviceaccount\.com|[\w.-]+@developer\.gserviceaccount\.com|[\w.-]+@cloudbuild\.gserviceaccount\.com)', salida or '')
    return m.group(1) if m else ''


def preparar_montador(s, proyecto, correo_servicio, estado):
    imagen = f'{REGION}-docker.pkg.dev/{proyecto}/{REPOSITORIO}/montador:latest'
    huella = huella_carpeta()
    anterior = estado.get('montador') or {}
    existe = s.existe('run', 'jobs', 'describe', TRABAJO, '--region', REGION, '--project', proyecto)
    if existe and anterior.get('huella') == huella:
        s.decir('El montador ya está al día; no hace falta volver a construirlo.')
        return anterior

    if not s.existe('artifacts', 'repositories', 'describe', REPOSITORIO, '--location', REGION, '--project', proyecto):
        s.gcloud('artifacts', 'repositories', 'create', REPOSITORIO, '--repository-format=docker',
                 '--location', REGION, '--description=Montador de Drama AI Studio', '--project', proyecto)
    cuenta = _cuenta_construccion(s, proyecto)
    if cuenta:
        for rol in ROLES_CONSTRUCCION:
            s.gcloud('projects', 'add-iam-policy-binding', proyecto, '--member=serviceAccount:' + cuenta,
                     '--role=' + rol, '--condition=None', '--format=none', comprobar=False)

    s.decir('Construyendo el montador (FFmpeg). La primera vez tarda unos minutos…')
    s.gcloud('builds', 'submit', str(CARPETA), '--tag', imagen, '--project', proyecto, tiempo=2400)
    s.decir('Creando el trabajo de montaje en Cloud Run…')
    s.gcloud('run', 'jobs', 'deploy', TRABAJO, '--image', imagen, '--region', REGION,
             '--service-account', correo_servicio, '--cpu', '4', '--memory', '8Gi',
             '--task-timeout', '10800s', '--max-retries', '0', '--project', proyecto, tiempo=900)
    return {'huella': huella, 'imagen': imagen, 'trabajo': TRABAJO, 'region': REGION}
