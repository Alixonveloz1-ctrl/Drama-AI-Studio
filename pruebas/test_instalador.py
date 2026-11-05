"""Pruebas del instalador con un Cloud Shell simulado.

No se toca ninguna cuenta real: gcloud, Firebase y Vercel se sustituyen por
un "mundo" en memoria que responde como lo harían. Se comprueba el recorrido
completo, que la segunda ejecución no pregunta ni cambia nada, que nunca se
imprime una clave y los fallos aprendidos del estudio de anime.
"""
import base64
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / 'instalador'))

import comun  # noqa: E402
import nube  # noqa: E402
import acceso  # noqa: E402
import publicar  # noqa: E402
import instalar  # noqa: E402

CLAVE_FALSA = '-----BEGIN PRIVATE KEY-----\nMIIfalso\n-----END PRIVATE KEY-----\n'
CUENTA = 'dueno@example.com'
PROYECTO = 'mi-proyecto-123'


class Mundo:
    """Estado simulado de Google Cloud, Firebase y Vercel."""

    def __init__(self):
        self.proyectos = [{'projectId': PROYECTO, 'name': 'Mi proyecto', 'lifecycleState': 'ACTIVE'},
                          {'projectId': 'de-una-organizacion', 'name': 'Drama AI Studio', 'lifecycleState': 'ACTIVE',
                           'parent': {'type': 'organization', 'id': '123'}}]
        self.facturacion = True
        self.cuentas_servicio = set()
        self.buckets = {}
        self.objetos = {}
        self.claves = []
        self.bloquear_claves = False
        self.firebase = True
        self.apps = []
        self.google_activado = True
        self.dominios_autorizados = ['localhost', PROYECTO + '.firebaseapp.com']
        self.vercel_sesion = True
        self.vercel_proyectos = [{'id': 'prj_1', 'name': 'drama-ai-studio', 'link': {
            'type': 'github', 'org': 'Alixonveloz1-ctrl', 'repo': 'Drama-AI-Studio', 'repoId': 99, 'productionBranch': 'main'}}]
        self.vercel_env = {}
        self.despliegues = []
        self.cuerpos_vercel = []
        self.llamadas = []
        self.trabajo = False
        self.repositorio = False
        self.construcciones = 0

    # ─── gcloud ───
    def gcloud(self, args):
        a = [x for x in args if x not in ('--quiet', '--format=json', '--format=none')]
        texto = ' '.join(a)
        if a[:2] == ['auth', 'list']:
            return 0, CUENTA, ''
        if a[:2] == ['auth', 'print-access-token']:
            return 0, 'ya29.tokenfalso', ''
        if a[:2] == ['projects', 'list']:
            return 0, json.dumps(self.proyectos), ''
        if a[:2] == ['projects', 'describe']:
            return (0, '{}', '') if any(p['projectId'] == a[2] for p in self.proyectos) else (1, '', 'NOT_FOUND')
        if a[:3] == ['billing', 'projects', 'describe']:
            return 0, json.dumps({'billingEnabled': self.facturacion}), ''
        if a[:2] == ['services', 'enable']:
            return 0, '', ''
        if a[:3] == ['iam', 'service-accounts', 'describe']:
            return (0, '{}', '') if a[3] in self.cuentas_servicio else (1, '', 'NOT_FOUND: does not exist')
        if a[:3] == ['iam', 'service-accounts', 'create']:
            self.cuentas_servicio.add(f'{a[3]}@{PROYECTO}.iam.gserviceaccount.com')
            return 0, '', ''
        if a[:2] == ['projects', 'add-iam-policy-binding']:
            assert '--condition=None' in a, 'falta --condition=None'
            return 0, '', ''
        if a[:3] == ['storage', 'buckets', 'list']:
            return 0, json.dumps([{'name': n, 'location': 'US'} for n in self.buckets]), ''
        if a[:3] == ['storage', 'buckets', 'describe']:
            return (0, '{}', '') if a[3].replace('gs://', '') in self.buckets else (1, '', '404 not found')
        if a[:3] == ['storage', 'buckets', 'create']:
            self.buckets[a[3].replace('gs://', '')] = {'cors': None}
            return 0, '', ''
        if a[:3] == ['storage', 'buckets', 'update']:
            ruta = next(x for x in a if x.startswith('--cors-file='))[len('--cors-file='):]
            self.buckets[a[3].replace('gs://', '')]['cors'] = json.loads(Path(ruta).read_text())
            return 0, '', ''
        if a[:3] == ['storage', 'objects', 'describe']:
            return (0, '{}', '') if a[3] in self.objetos else (1, '', 'matched no objects')
        if a[:2] == ['storage', 'cat']:
            return 0, self.objetos[a[2]], ''
        if a[:2] == ['storage', 'cp']:
            self.objetos[a[3]] = Path(a[2]).read_text()
            return 0, '', ''
        if a[:4] == ['iam', 'service-accounts', 'keys', 'list']:
            correo = next(x for x in a if x.startswith('--iam-account=')).split('=', 1)[1]
            return 0, json.dumps([{'name': f'projects/{PROYECTO}/serviceAccounts/{correo}/keys/{k}'} for k in self.claves]), ''
        if a[:4] == ['iam', 'service-accounts', 'keys', 'create']:
            if self.bloquear_claves:
                return 1, '', 'FAILED_PRECONDITION: Key creation is not allowed on this service account. constraints/iam.disableServiceAccountKeyCreation'
            identificador = f'clave{len(self.claves) + 1}'
            self.claves.append(identificador)
            correo = next(x for x in a if x.startswith('--iam-account=')).split('=', 1)[1]
            Path(a[4]).write_text(json.dumps({'type': 'service_account', 'project_id': PROYECTO, 'private_key_id': identificador,
                                              'private_key': CLAVE_FALSA, 'client_email': correo}))
            return 0, '', ''
        if a[:4] == ['iam', 'service-accounts', 'keys', 'delete']:
            self.claves.remove(a[4])
            return 0, '', ''
        if a[:3] == ['run', 'jobs', 'describe']:
            # El mensaje real de gcloud cuando el trabajo aún no existe.
            return (0, '{}', '') if self.trabajo else (1, '', 'ERROR: (gcloud.run.jobs.describe) Cannot find job [drama-studio-montage].')
        if a[:3] == ['artifacts', 'repositories', 'describe']:
            return (0, '{}', '') if self.repositorio else (1, '', 'NOT_FOUND: Repository not found')
        if a[:3] == ['artifacts', 'repositories', 'create']:
            self.repositorio = True
            return 0, '', ''
        if a[:2] == ['builds', 'get-default-service-account']:
            return 0, f'projects/{PROYECTO}/serviceAccounts/123-compute@developer.gserviceaccount.com', ''
        if a[:2] == ['builds', 'submit']:
            self.construcciones += 1
            return 0, '', ''
        if a[:3] == ['run', 'jobs', 'deploy']:
            assert '--service-account' in a and '--max-retries' in a
            self.trabajo = True
            return 0, '', ''
        raise AssertionError('gcloud inesperado: ' + texto)

    # ─── Firebase / Identity Toolkit ───
    def http(self, metodo, url, datos):
        if url.endswith(f'/projects/{PROYECTO}') and metodo == 'GET':
            return (200, {}) if self.firebase else (404, {'error': {'status': 'NOT_FOUND'}})
        if url.endswith(':addFirebase'):
            self.firebase = True
            return 200, {'name': 'operations/a', 'done': True, 'response': {}}
        if url.endswith('/webApps') and metodo == 'GET':
            return 200, {'apps': self.apps}
        if url.endswith('/webApps') and metodo == 'POST':
            app = {'name': f'projects/{PROYECTO}/webApps/1:web', 'appId': '1:web', 'displayName': datos['displayName']}
            self.apps.append(app)
            return 200, {'name': 'operations/b', 'done': True, 'response': app}
        if url.endswith('/config') and 'webApps' in url:
            return 200, {'apiKey': 'AIzaPublica', 'authDomain': PROYECTO + '.firebaseapp.com', 'projectId': PROYECTO, 'appId': '1:web'}
        if 'defaultSupportedIdpConfigs/google.com' in url:
            return (200, {'enabled': True}) if self.google_activado else (404, {})
        if url.endswith('/config') and metodo == 'GET':
            return 200, {'authorizedDomains': list(self.dominios_autorizados)}
        if '/config?updateMask=authorizedDomains' in url:
            self.dominios_autorizados = datos['authorizedDomains']
            return 200, {}
        raise AssertionError(f'http inesperado: {metodo} {url}')

    # ─── Vercel (cliente oficial) ───
    def vercel(self, args):
        if args[3] == '--version':
            return 0, '59.25.4', ''
        if args[3] == 'login':
            self.vercel_sesion = True
            return 0, '', ''
        ruta, metodo = args[4], args[args.index('--method') + 1]
        datos = None
        if '--input' in args:
            datos = json.loads(Path(args[args.index('--input') + 1]).read_text())
            self.cuerpos_vercel.append((ruta, datos))
        if not self.vercel_sesion:
            return 1, '', 'Error: No existing credentials found.'
        base = ruta.split('?')[0]
        if base == '/v2/user':
            return 0, json.dumps({'user': {'id': 'u1', 'username': 'dueno'}}), ''
        if base == '/v2/teams':
            return 0, json.dumps({'teams': []}), ''
        if base == '/v9/projects':
            return 0, json.dumps({'projects': self.vercel_proyectos}), ''
        if base.startswith('/v9/projects/') and base.endswith('/env'):
            return 0, json.dumps({'envs': [{'key': k, 'target': ['production']} for k in self.vercel_env]}), ''
        if base.startswith('/v9/projects/') and base.endswith('/domains'):
            return 0, json.dumps({'domains': [{'name': 'drama-ai-studio.vercel.app'}, {'name': 'drama-ai-studio-git-main-dueno.vercel.app'}]}), ''
        if base.startswith('/v9/projects/'):
            proyecto = next((p for p in self.vercel_proyectos if p['id'] == base.split('/')[3]), None)
            return (0, json.dumps(proyecto), '') if proyecto else (1, '', 'not_found')
        if base == '/v11/projects':
            proyecto = {'id': 'prj_nuevo', 'name': datos['name'], 'link': {'type': 'github', 'org': 'Alixonveloz1-ctrl',
                                                                           'repo': 'Drama-AI-Studio', 'repoId': 99, 'productionBranch': 'main'}}
            self.vercel_proyectos.append(proyecto)
            return 0, json.dumps(proyecto), ''
        if base.endswith('/env') and metodo == 'POST':
            assert isinstance(datos, dict), 'el cliente fijado solo envía bien objetos'
            self.vercel_env[datos['key']] = datos['value']
            return 0, json.dumps({'created': {'key': datos['key']}}), ''
        if base == '/v6/deployments':
            return 0, json.dumps({'deployments': self.despliegues[-1:]}), ''
        if base == '/v13/deployments' and metodo == 'POST':
            despliegue = {'id': f'dpl_{len(self.despliegues) + 1}', 'readyState': 'BUILDING'}
            self.despliegues.append(despliegue)
            return 0, json.dumps(despliegue), ''
        if base.startswith('/v13/deployments/'):
            despliegue = next(d for d in self.despliegues if d['id'] == base.split('/')[-1])
            despliegue['readyState'] = 'READY'
            return 0, json.dumps(despliegue), ''
        raise AssertionError('vercel inesperado: ' + ' '.join(args))


class SistemaFalso(comun.Sistema):
    def __init__(self, mundo, respuestas=()):
        super().__init__()
        self.mundo = mundo
        self.respuestas = list(respuestas)
        self.preguntas = 0
        self.texto = []

    def decir(self, texto=''):
        self.texto.append(str(texto))

    def leer(self, pregunta):
        self.preguntas += 1
        if not self.respuestas:
            raise AssertionError('Se preguntó algo inesperado:\n' + '\n'.join(self.texto[-6:]))
        return self.respuestas.pop(0)

    def esperar(self, segundos):
        pass

    def sin_respuestas_sobrantes(self):
        assert not self.respuestas, 'Sobraron respuestas: ' + repr(self.respuestas)

    def ejecutar(self, args, capturar=True, cwd=None, entorno=None, tiempo=300, interactivo=False):
        self.mundo.llamadas.append(list(args))
        if args[0] == 'gcloud':
            return self.mundo.gcloud(args[1:])
        if args[0] == 'npx':
            return self.mundo.vercel(args)
        if args[0] == 'git':
            return 0, 'abc', ''
        raise AssertionError('comando inesperado: ' + ' '.join(args))

    def http(self, metodo, url, datos=None, proyecto=None, tiempo=30):
        return self.mundo.http(metodo, url, datos)


class BaseInstalador(unittest.TestCase):
    def setUp(self):
        self.carpeta = Path(tempfile.mkdtemp(prefix='drama-prueba-'))
        self.originales = (comun.DIRECTORIO_LOCAL, comun.ARCHIVO_ESTADO, comun.ARCHIVO_CLAVE)
        comun.DIRECTORIO_LOCAL = self.carpeta / '.drama-studio'
        comun.ARCHIVO_ESTADO = comun.DIRECTORIO_LOCAL / 'estado.json'
        comun.ARCHIVO_CLAVE = comun.DIRECTORIO_LOCAL / 'clave-cuenta-servicio.json'
        self.mundo = Mundo()

    def tearDown(self):
        comun.DIRECTORIO_LOCAL, comun.ARCHIVO_ESTADO, comun.ARCHIVO_CLAVE = self.originales
        shutil.rmtree(self.carpeta, ignore_errors=True)

    def comprobar_sin_secretos(self, s):
        salida = '\n'.join(s.texto)
        self.assertNotIn('PRIVATE KEY', salida)
        self.assertNotIn('ya29.', salida)
        self.assertNotIn('eyJ0eXBlIjoi', salida)   # el JSON de la cuenta en base64
        for valor in self.mundo.vercel_env.values():
            if len(valor) > 40:
                self.assertNotIn(valor, salida)


class RecorridoCompleto(BaseInstalador):
    def test_primera_instalacion_y_segunda_sin_preguntas(self):
        # Primera vez: proyecto 1. Sin buckets en el proyecto, el propio se
        # crea sin preguntar.
        s = SistemaFalso(self.mundo, ['1'])
        estado = instalar.instalar(s)
        s.sin_respuestas_sobrantes()
        self.comprobar_sin_secretos(s)
        self.assertEqual(estado['proyecto'], PROYECTO)
        self.assertEqual(estado['bucket'], PROYECTO + '-drama-studio')
        self.assertEqual(estado['vercel']['url'], 'https://drama-ai-studio.vercel.app')
        # Las cuatro variables, una petición (objeto) por variable.
        self.assertEqual(set(self.mundo.vercel_env), {'GCP_SERVICE_ACCOUNT', 'GCS_OUTPUT_BUCKET', 'STUDIO_ALLOWED_EMAILS', 'STUDIO_FIREBASE_WEB_CONFIG'})
        self.assertTrue(all(isinstance(c, dict) for _, c in self.mundo.cuerpos_vercel))
        self.assertTrue(all(c.get('type') == 'encrypted' and c.get('target') == ['production'] for r, c in self.mundo.cuerpos_vercel if r.split('?')[0].endswith('/env')))
        self.assertEqual(self.mundo.vercel_env['STUDIO_ALLOWED_EMAILS'], CUENTA)
        self.assertEqual(self.mundo.vercel_env['GCS_OUTPUT_BUCKET'], PROYECTO + '-drama-studio')
        cuenta = json.loads(base64.b64decode(self.mundo.vercel_env['GCP_SERVICE_ACCOUNT']))
        self.assertEqual(cuenta['client_email'], f'drama-studio@{PROYECTO}.iam.gserviceaccount.com')
        self.assertEqual(json.loads(self.mundo.vercel_env['STUDIO_FIREBASE_WEB_CONFIG'])['projectId'], PROYECTO)
        # La clave vive solo en Cloud Shell con permisos 600.
        modo = stat.S_IMODE(os.stat(comun.ARCHIVO_CLAVE).st_mode)
        self.assertEqual(modo, 0o600)
        # CORS: la misma lista que usa el servidor.
        cors = self.mundo.buckets[PROYECTO + '-drama-studio']['cors']
        self.assertEqual(cors, json.loads((RAIZ / 'comun' / 'cors-bucket.json').read_text()))
        self.assertIn('PUT', cors[0]['method'])
        # Dominio estable autorizado; sin direcciones de despliegue sueltas.
        self.assertIn('drama-ai-studio.vercel.app', self.mundo.dominios_autorizados)
        self.assertIn('localhost', self.mundo.dominios_autorizados)
        # Bucket privado y en US.
        creacion = next(c for c in self.mundo.llamadas if c[:4] == ['gcloud', 'storage', 'buckets', 'create'])
        self.assertIn('--location=US', creacion)
        self.assertIn('--public-access-prevention', creacion)
        # Estado en el bucket sin secretos.
        guardado = self.mundo.objetos[f'gs://{PROYECTO}-drama-studio/drama-studio/instalacion/estado.json']
        self.assertNotIn('PRIVATE KEY', guardado)
        self.assertEqual(len(self.mundo.despliegues), 1)
        # El montador se construye y se despliega como trabajo de Cloud Run.
        self.assertTrue(self.mundo.trabajo)
        self.assertEqual(self.mundo.construcciones, 1)
        roles = [c for c in self.mundo.llamadas if c[:3] == ['gcloud', 'projects', 'add-iam-policy-binding']]
        self.assertTrue(any('--role=roles/run.invoker' in c for c in roles))
        self.assertTrue(any('--role=roles/run.jobsExecutorWithOverrides' in c for c in roles), 'el montador se lanza con overrides')

        # Segunda vez: nada que preguntar, ninguna clave nueva, nada que publicar.
        llamadas_antes = len(self.mundo.cuerpos_vercel)
        s2 = SistemaFalso(self.mundo, [])
        instalar.instalar(s2)
        self.assertEqual(s2.preguntas, 0)
        self.assertEqual(self.mundo.claves, ['clave1'])
        self.assertEqual(len(self.mundo.despliegues), 1)
        self.assertEqual(len(self.mundo.cuerpos_vercel), llamadas_antes)
        self.assertEqual(self.mundo.construcciones, 1, 'el montador al día no se vuelve a construir')
        self.comprobar_sin_secretos(s2)

    def test_clave_perdida_crea_otra_y_retira_la_vieja_tras_publicar(self):
        instalar.instalar(SistemaFalso(self.mundo, ['1']))
        comun.ARCHIVO_CLAVE.unlink()
        instalar.instalar(SistemaFalso(self.mundo, []))
        self.assertEqual(self.mundo.claves, ['clave2'])
        self.assertEqual(len(self.mundo.despliegues), 2)
        cuenta = json.loads(base64.b64decode(self.mundo.vercel_env['GCP_SERVICE_ACCOUNT']))
        self.assertEqual(cuenta['private_key_id'], 'clave2')

    def test_crea_el_proyecto_de_vercel_si_no_existe(self):
        self.mundo.vercel_proyectos = []
        s = SistemaFalso(self.mundo, ['1', '1'])
        estado = instalar.instalar(s)
        s.sin_respuestas_sobrantes()
        self.assertEqual(estado['vercel']['proyectoId'], 'prj_nuevo')
        creacion = next(c for r, c in self.mundo.cuerpos_vercel if r.startswith('/v11/projects'))
        self.assertEqual(creacion['gitRepository'], {'type': 'github', 'repo': 'Alixonveloz1-ctrl/Drama-AI-Studio'})

    def test_firebase_sin_google_activado_espera_al_dueno(self):
        self.mundo.google_activado = False
        s = SistemaFalso(self.mundo, ['1', '2'])
        with self.assertRaises(comun.FalloInstalacion) as error:
            instalar.instalar(s)
        self.assertIn('Firebase', error.exception.mensaje)
        enlace = next(t for t in s.texto if 'authentication/providers' in t)
        self.assertIn('authuser=' + CUENTA.replace('@', '%40'), enlace)
        self.assertEqual(self.mundo.vercel_env, {}, 'no se publica nada sin inicio de sesión')

    def test_vercel_sin_sesion_usa_el_login_oficial(self):
        self.mundo.vercel_sesion = False
        instalar.instalar(SistemaFalso(self.mundo, ['1']))
        self.assertTrue(any(c[:4] == ['npx', '--yes', 'vercel@59.25.4', 'login'] for c in self.mundo.llamadas))


    def test_con_buckets_existentes_pregunta_y_respeta_el_elegido(self):
        self.mundo.buckets['bucket-viejo'] = {'cors': None}
        s = SistemaFalso(self.mundo, ['1', '2'])
        estado = instalar.instalar(s)
        s.sin_respuestas_sobrantes()
        self.assertEqual(estado['bucket'], 'bucket-viejo')
        self.assertEqual(self.mundo.vercel_env['GCS_OUTPUT_BUCKET'], 'bucket-viejo')
        self.assertFalse(any(c[:4] == ['gcloud', 'storage', 'buckets', 'create'] for c in self.mundo.llamadas))

    def test_recupera_la_instalacion_si_cloud_shell_perdio_su_carpeta(self):
        instalar.instalar(SistemaFalso(self.mundo, ['1']))
        comun.ARCHIVO_ESTADO.unlink()
        s = SistemaFalso(self.mundo, [])   # encuentra la instalación sin preguntar
        estado = instalar.instalar(s)
        s.sin_respuestas_sobrantes()
        self.assertEqual(estado['bucket'], PROYECTO + '-drama-studio')
        self.assertEqual(len(self.mundo.buckets), 1)


    def test_no_ofrece_proyectos_dentro_de_una_organizacion(self):
        s = SistemaFalso(self.mundo, ['1'])
        instalar.instalar(s)
        menu = '\n'.join(s.texto)
        self.assertNotIn('de-una-organizacion', menu)
        self.assertIn('dentro de una organización', menu)


class Fallos(BaseInstalador):
    def test_clave_prohibida_por_la_organizacion_se_explica(self):
        self.mundo.bloquear_claves = True
        s = SistemaFalso(self.mundo, ['1'])
        with self.assertRaises(comun.FalloInstalacion) as error:
            instalar.instalar(s)
        self.assertIn('prohíbe crear claves', error.exception.mensaje)

    def test_un_error_de_permiso_no_cuenta_como_inexistente(self):
        s = SistemaFalso(self.mundo)
        s.ejecutar = lambda *a, **k: (1, '', 'PERMISSION_DENIED: caller lacks permission')
        with self.assertRaises(comun.FalloInstalacion):
            s.existe('storage', 'buckets', 'describe', 'gs://x')

    def test_copia_atrasada_pide_git_pull(self):
        s = SistemaFalso(self.mundo)
        respuestas = {('git', 'fetch'): (0, '', ''), ('git', 'rev-parse', 'HEAD'): (0, 'viejo', ''),
                      ('git', 'rev-parse', 'FETCH_HEAD'): (0, 'nuevo', ''), ('git', 'merge-base'): (0, '', '')}
        s.ejecutar = lambda args, **k: next(v for c, v in respuestas.items() if tuple(args[:len(c)]) == c)
        with self.assertRaises(comun.FalloInstalacion) as error:
            instalar.comprobar_version(s)
        self.assertIn('git pull', error.exception.mensaje)

    def test_el_cliente_de_vercel_no_acepta_listas(self):
        with self.assertRaises(ValueError):
            publicar.Vercel(SistemaFalso(self.mundo)).api('/v10/projects/x/env', 'POST', [{'key': 'A'}])

    def test_error_de_vercel_no_muestra_el_valor(self):
        v = publicar.Vercel(SistemaFalso(self.mundo))
        v.s.ejecutar = lambda *a, **k: (1, json.dumps({'error': {'code': 'bad', 'message': 'valor supersecreto rechazado'}}), '')
        with self.assertRaises(comun.FalloInstalacion) as error:
            v.api('/v10/projects/x/env', 'POST', {'key': 'A', 'value': 'supersecreto'}, secretos=['supersecreto'])
        self.assertNotIn('supersecreto', error.exception.detalle)

    def test_limpiar_quita_claves_y_tokens(self):
        texto = f'{CLAVE_FALSA} Authorization: Bearer ya29.abc "private_key": "x" vcp_abcdefghijklmnop'
        limpio = comun.limpiar(texto)
        for prohibido in ('MIIfalso', 'ya29.abc', 'vcp_abcdefghijklmnop'):
            self.assertNotIn(prohibido, limpio)

    def test_facturacion_apagada_se_dice_y_se_puede_salir(self):
        self.mundo.facturacion = False
        s = SistemaFalso(self.mundo, ['1', '2'])
        with self.assertRaises(comun.FalloInstalacion) as error:
            instalar.instalar(s)
        self.assertIn('facturación', error.exception.mensaje)


if __name__ == '__main__':
    unittest.main()
