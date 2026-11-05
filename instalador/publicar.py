"""Vercel: encontrar (o crear) el proyecto conectado a este repositorio,
guardar las variables de entorno y publicar main.

Se usa el cliente oficial de Vercel con la versión fijada que ya funciona en
el estudio de anime. Lecciones que vienen de allí:
  * Esa versión solo envía bien un OBJETO JSON por petición: con una lista
    manda "[object Object]" como texto. Una petición por variable.
  * Un error de Vercel se enseña sin valores ni tokens.
  * El inicio de sesión de Vercel es el oficial: un enlace que se abre en el
    navegador del teléfono.
"""
import json
import os
from pathlib import Path
import tempfile
import urllib.parse

from comun import FalloInstalacion, limpiar

CLI = ['npx', '--yes', 'vercel@59.25.4']
DUENO = 'Alixonveloz1-ctrl'
REPOSITORIO = 'Drama-AI-Studio'
RAMA = 'main'
ENTORNO_CLI = {'NO_UPDATE_NOTIFIER': '1', 'VERCEL_TELEMETRY_DISABLED': '1'}


def _detalle(salida, errores, secretos=()):
    mensaje = errores or ''
    try:
        cuerpo = json.loads(salida)
        error = cuerpo.get('error', {}) if isinstance(cuerpo, dict) else {}
        if isinstance(error, dict):
            mensaje += '\n' + ' '.join(str(error.get(k, '')) for k in ('code', 'message'))
    except (ValueError, TypeError):
        pass
    return limpiar(mensaje, secretos) or 'Vercel no devolvió detalles.'


class Vercel:
    def __init__(self, s):
        self.s = s

    def api(self, ruta, metodo='GET', datos=None, secretos=()):
        if datos is not None and not isinstance(datos, dict):
            raise ValueError('El cliente de Vercel fijado solo envía bien un objeto JSON por petición.')
        args = [*CLI, 'api', ruta, '--raw', '--method', metodo, '--non-interactive']
        with tempfile.TemporaryDirectory(prefix='drama-vercel-') as carpeta:
            if datos is not None:
                archivo = Path(carpeta) / 'cuerpo.json'
                archivo.write_text(json.dumps(datos))
                os.chmod(archivo, 0o600)
                args += ['--input', str(archivo)]
            codigo, salida, errores = self.s.ejecutar(args, entorno=ENTORNO_CLI, tiempo=180)
        if codigo:
            raise FalloInstalacion(f'Vercel no completó {metodo} {ruta.split("?")[0]}.', _detalle(salida, errores, secretos))
        try:
            valor = json.loads(salida or '{}')
        except ValueError as error:
            raise FalloInstalacion(f'Vercel devolvió una respuesta que no se entiende: {metodo} {ruta.split("?")[0]}.') from error
        if isinstance(valor, dict) and valor.get('error'):
            raise FalloInstalacion(f'Vercel rechazó {metodo} {ruta.split("?")[0]}.', _detalle(salida, '', secretos))
        return valor

    def preparar_cliente(self):
        self.s.decir('Preparando el cliente oficial de Vercel (la primera vez tarda un poco)…')
        codigo, _, errores = self.s.ejecutar([*CLI, '--version'], entorno=ENTORNO_CLI, tiempo=420)
        if codigo:
            raise FalloInstalacion('No se pudo preparar el cliente de Vercel en Cloud Shell.', limpiar(errores))

    def asegurar_sesion(self):
        try:
            return self.api('/v2/user')['user']
        except (FalloInstalacion, KeyError, TypeError):
            pass
        self.s.decir('\nHay que autorizar a Vercel una vez. Abre en el navegador el enlace que aparece')
        self.s.decir('a continuación, confirma con tu cuenta de Vercel y vuelve aquí.')
        self.s.ejecutar([*CLI, 'login'], capturar=False, interactivo=True, entorno=ENTORNO_CLI)
        try:
            return self.api('/v2/user')['user']
        except (KeyError, TypeError) as error:
            raise FalloInstalacion('Vercel no confirmó el inicio de sesión. Vuelve a escribir ./c.') from error

    @staticmethod
    def _consulta(equipo, **extra):
        valores = {**extra, **({'teamId': equipo} if equipo else {})}
        return ('?' + urllib.parse.urlencode(valores)) if valores else ''

    def _ambitos(self, usuario):
        equipos = self.api('/v2/teams?limit=100').get('teams', [])
        ambitos = [(None, 'Personal: ' + (usuario.get('username') or usuario.get('id', '')))]
        ambitos += [(t['id'], t.get('name') or t.get('slug') or t['id']) for t in equipos if t.get('id')]
        return ambitos

    def _es_nuestro(self, proyecto):
        enlace = proyecto.get('link') or {}
        return (enlace.get('type') == 'github' and str(enlace.get('org', '')).lower() == DUENO.lower()
                and str(enlace.get('repo', '')).lower() == REPOSITORIO.lower())

    def buscar_proyecto(self, usuario, estado):
        """Devuelve (proyecto, equipo)."""
        recordado = estado.get('vercel') or {}
        ambitos = self._ambitos(usuario)
        if recordado.get('proyectoId'):
            try:
                proyecto = self.api(f'/v9/projects/{recordado["proyectoId"]}' + self._consulta(recordado.get('equipo')))
                if self._es_nuestro(proyecto):
                    return proyecto, recordado.get('equipo')
            except FalloInstalacion:
                pass
        encontrados, vistos, fallos = [], set(), []
        for equipo, _ in ambitos:
            try:
                lista = self.api('/v9/projects' + self._consulta(equipo, limit=100)).get('projects', [])
            except FalloInstalacion as error:
                # Una cuenta de Vercel puede no dejar listar su ámbito personal;
                # eso no prueba que el proyecto no exista en otro.
                fallos.append(error)
                continue
            for proyecto in lista:
                if self._es_nuestro(proyecto) and proyecto['id'] not in vistos:
                    vistos.add(proyecto['id'])
                    encontrados.append((proyecto, equipo))
        if len(encontrados) == 1:
            return encontrados[0]
        if len(encontrados) > 1:
            indice = self.s.elegir('Hay varios proyectos de Vercel conectados a este repositorio. ¿Cuál es el del estudio?',
                                   [p['name'] for p, _ in encontrados])
            return encontrados[indice]
        if fallos and len(fallos) == len(ambitos):
            # Si no se pudo mirar ningún ámbito, no se asume que no exista.
            raise FalloInstalacion('Vercel no dejó ver tus proyectos; no se creó ninguno nuevo.', fallos[0].detalle)
        return self.crear_proyecto(ambitos, usuario)

    def crear_proyecto(self, ambitos, usuario):
        if self.s.elegir(f'No encontré en Vercel ningún proyecto conectado a {DUENO}/{REPOSITORIO}.',
                         ['Crearlo ahora, conectado a este repositorio (rama main)', 'Salir']) == 1:
            raise FalloInstalacion('Instalación detenida: falta el proyecto de Vercel.')
        equipo = ambitos[0][0]
        preferido = usuario.get('defaultTeamId')
        if len(ambitos) > 1:
            por_defecto = next((i for i, (e, _) in enumerate(ambitos) if e and e == preferido), None)
            if por_defecto is not None and len(ambitos) == 2:
                equipo = ambitos[por_defecto][0]
            else:
                equipo = ambitos[self.s.elegir('¿En qué cuenta de Vercel lo creo?', [n for _, n in ambitos])][0]
        for sufijo in ('', '-estudio', '-2', '-3'):
            datos = {'name': 'drama-ai-studio' + sufijo, 'framework': None,
                     'gitRepository': {'type': 'github', 'repo': f'{DUENO}/{REPOSITORIO}'}}
            try:
                proyecto = self.api('/v11/projects' + self._consulta(equipo), 'POST', datos)
                self.s.decir('Proyecto de Vercel creado: ' + proyecto['name'])
                return proyecto, equipo
            except FalloInstalacion as error:
                texto = (error.detalle or '').lower()
                if 'already exists' in texto or 'conflict' in texto or 'name' in texto and 'taken' in texto:
                    continue
                if 'github' in texto or 'repository' in texto or 'repo' in texto:
                    raise FalloInstalacion(
                        'Vercel no puede ver el repositorio en GitHub. Abre vercel.com/new en el teléfono, importa '
                        f'{REPOSITORIO} sin cambiar nada y vuelve a escribir ./c.', error.detalle) from error
                raise
        raise FalloInstalacion('Vercel no aceptó ningún nombre para el proyecto. Vuelve a escribir ./c.')

    def variables_presentes(self, proyecto, equipo):
        lista = self.api(f'/v9/projects/{proyecto["id"]}/env' + self._consulta(equipo)).get('envs', [])
        return {e.get('key') for e in lista if 'production' in (e.get('target') or [])}

    def poner_variables(self, proyecto, equipo, valores):
        consulta = self._consulta(equipo, upsert='true')
        for clave, valor in valores.items():
            self.s.decir('Guardando en Vercel: ' + clave)
            datos = {'key': clave, 'value': valor, 'type': 'encrypted', 'target': ['production']}
            resultado = self.api(f'/v10/projects/{proyecto["id"]}/env' + consulta, 'POST', datos, secretos=[valor])
            if isinstance(resultado, dict) and resultado.get('failed'):
                fallos = resultado['failed']
                primero = fallos[0] if isinstance(fallos, list) and fallos else {}
                raise FalloInstalacion(f'Vercel rechazó la variable {clave}; no se publicó nada nuevo.',
                                       limpiar(json.dumps(primero.get('error', {}) if isinstance(primero, dict) else {}), [valor]))

    def ultimo_despliegue_listo(self, proyecto, equipo):
        lista = self.api('/v6/deployments' + self._consulta(equipo, projectId=proyecto['id'], target='production',
                                                            state='READY', limit=1)).get('deployments', [])
        return lista[0] if lista else None

    def desplegar(self, proyecto, equipo):
        enlace = proyecto.get('link') or {}
        rama = enlace.get('productionBranch') or RAMA
        if rama != RAMA:
            raise FalloInstalacion(f'El proyecto de Vercel publica la rama «{rama}» y el estudio vive en «main». '
                                   'Cámbialo en Vercel (Settings → Git → Production Branch) y vuelve a escribir ./c.')
        datos = {'name': proyecto['name'], 'project': proyecto['id'], 'target': 'production',
                 'gitSource': {'type': 'github', 'repoId': str(enlace.get('repoId')), 'ref': RAMA}}
        consulta = self._consulta(equipo)
        self.s.decir('Publicando el estudio en Vercel…')
        despliegue = self.api('/v13/deployments' + consulta, 'POST', datos)
        for _ in range(200):
            estado = despliegue.get('readyState') or despliegue.get('status')
            if estado == 'READY':
                return despliegue
            if estado in ('ERROR', 'CANCELED'):
                raise FalloInstalacion('Vercel no pudo construir la página; sigue en línea la versión anterior.',
                                       limpiar(despliegue.get('errorMessage') or despliegue.get('inspectorUrl') or ''))
            self.s.decir('  Vercel está preparando la página: ' + str(estado or 'en cola'))
            self.s.esperar(5)
            despliegue = self.api(f'/v13/deployments/{despliegue["id"]}' + consulta)
        raise FalloInstalacion('La publicación sigue en marcha en Vercel. Vuelve a escribir ./c en unos minutos.')

    def dominios(self, proyecto, equipo):
        lista = self.api(f'/v9/projects/{proyecto["id"]}/domains' + self._consulta(equipo)).get('domains', [])
        nombres = [d['name'] for d in lista if d.get('name') and not d.get('redirect')]
        if not nombres:
            nombres = [proyecto['name'] + '.vercel.app']
        return nombres


def direccion_principal(dominios):
    propios = [d for d in dominios if not d.endswith('.vercel.app')]
    candidatos = propios or [d for d in dominios if '-git-' not in d] or dominios
    return 'https://' + min(candidatos, key=len)
