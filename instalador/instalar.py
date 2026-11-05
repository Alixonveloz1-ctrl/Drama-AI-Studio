#!/usr/bin/env python3
"""Instalador de Drama AI Studio para Cloud Shell.

El dueño solo teclea dos líneas cortas (Cloud Shell no deja pegar desde el
iPhone):

    git pull
    ./c

y esto hace el resto. Es idempotente: la segunda vez reutiliza lo que ya
existe y solo arregla lo que falte. Todo lo que hay que decidir se elige por
número. No se crean claves de más, no se borra nada que no haya creado este
instalador y no se llama a ningún modelo (instalar no genera contenido).
"""
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import comun  # noqa: E402
from comun import FalloInstalacion, Sistema, cargar_estado, guardar_estado, limpiar  # noqa: E402
import nube  # noqa: E402
import acceso  # noqa: E402
import montador  # noqa: E402
from publicar import Vercel, direccion_principal  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
PASOS = 8


def paso(s, numero, titulo):
    s.decir(f'\n── Paso {numero}/{PASOS} · {titulo}')


def comprobar_version(s):
    """El instalador viejo no debe instalar una versión vieja sin avisar."""
    codigo, _, _ = s.ejecutar(['git', 'fetch', '--quiet', 'origin', 'main'], cwd=str(RAIZ), tiempo=60)
    if codigo:
        s.decir('Aviso: no pude comprobar si hay una versión más nueva en GitHub. Sigo con la que tienes.')
        return
    _, local, _ = s.ejecutar(['git', 'rev-parse', 'HEAD'], cwd=str(RAIZ))
    _, remoto, _ = s.ejecutar(['git', 'rev-parse', 'FETCH_HEAD'], cwd=str(RAIZ))
    if local and remoto and local != remoto:
        atrasado, _, _ = s.ejecutar(['git', 'merge-base', '--is-ancestor', local, remoto], cwd=str(RAIZ))
        if atrasado == 0:
            raise FalloInstalacion('Tu copia del estudio no está al día. Escribe  git pull  y después  ./c')


def huella(valores):
    texto = json.dumps(valores, sort_keys=True).encode()
    return hashlib.sha256(texto).hexdigest()


def instalar(s):
    s.decir('Drama AI Studio · instalador')
    comprobar_version(s)
    estado = cargar_estado()

    # ─── 1. Cuenta y proyecto ───
    paso(s, 1, 'Cuenta de Google y proyecto')
    cuenta = nube.cuenta_activa(s)
    s.decir('Cuenta de Google: ' + cuenta)
    if estado.get('cuenta') and estado['cuenta'] != cuenta:
        s.decir(f'La instalación anterior se hizo con {estado["cuenta"]}.')
        if s.elegir('¿Qué hago?', [f'Instalar ahora con {cuenta}', 'Salir (abriré Cloud Shell con la otra cuenta)']) == 1:
            raise FalloInstalacion('Instalación detenida: Cloud Shell está abierto con otra cuenta de Google.')
        estado = {}
    estado['cuenta'] = cuenta
    proyecto = nube.elegir_proyecto(s, estado)
    if estado.get('proyecto') != proyecto:
        estado = {'cuenta': cuenta}
    estado['proyecto'] = proyecto
    guardar_estado(estado)

    # ─── 2. Facturación y APIs ───
    paso(s, 2, 'Facturación y APIs de Google')
    nube.comprobar_facturacion(s, proyecto)
    s.decir('Activando las APIs (si ya lo están, no cambia nada)…')
    nube.activar_apis(s, proyecto)

    # ─── 3. Cuenta de servicio ───
    paso(s, 3, 'Cuenta de servicio y permisos')
    correo_servicio = nube.preparar_cuenta_servicio(s, proyecto)
    estado['cuentaServicio'] = correo_servicio
    s.decir('Cuenta de servicio: ' + correo_servicio)

    # ─── 4. Bucket ───
    paso(s, 4, 'Bucket')
    bucket = nube.preparar_bucket(s, proyecto, estado)
    estado['bucket'] = bucket
    guardar_estado(estado)

    # ─── 5. Montador ───
    paso(s, 5, 'Montador del episodio final (Cloud Run)')
    estado['montador'] = montador.preparar_montador(s, proyecto, correo_servicio, estado)
    guardar_estado(estado)

    # ─── 6. Inicio de sesión ───
    paso(s, 6, 'Inicio de sesión con Google (Firebase)')
    firebase, app_id = acceso.preparar_firebase(s, proyecto, cuenta)
    estado['firebase'] = {'proyecto': firebase['projectId'], 'appId': app_id}
    guardar_estado(estado)

    # ─── 7. Vercel ───
    paso(s, 7, 'Vercel: variables y publicación')
    clave_b64, clave_id, clave_nueva = nube.preparar_clave(s, proyecto, correo_servicio, estado)
    clave_anterior = estado.get('claveId')
    vercel = Vercel(s)
    vercel.preparar_cliente()
    usuario = vercel.asegurar_sesion()
    proyecto_vercel, equipo = vercel.buscar_proyecto(usuario, estado)
    estado['vercel'] = {**(estado.get('vercel') or {}), 'proyectoId': proyecto_vercel['id'],
                        'nombre': proyecto_vercel['name'], 'equipo': equipo}
    guardar_estado(estado)
    s.decir('Proyecto de Vercel: ' + proyecto_vercel['name'])

    valores = {
        'GCP_SERVICE_ACCOUNT': clave_b64,
        'GCS_OUTPUT_BUCKET': bucket,
        'STUDIO_ALLOWED_EMAILS': cuenta,
        'STUDIO_FIREBASE_WEB_CONFIG': json.dumps(firebase, separators=(',', ':')),
    }
    presentes = vercel.variables_presentes(proyecto_vercel, equipo)
    cambian = huella(valores) != estado.get('huellaVariables') or not set(valores) <= presentes
    if cambian:
        vercel.poner_variables(proyecto_vercel, equipo, valores)
        estado['huellaVariables'] = huella(valores)
        estado['claveId'] = clave_id
        guardar_estado(estado)
    else:
        s.decir('Las variables de Vercel ya estaban bien; no se tocan.')

    if cambian or not vercel.ultimo_despliegue_listo(proyecto_vercel, equipo):
        vercel.desplegar(proyecto_vercel, equipo)
    else:
        s.decir('La página ya está publicada con esta configuración; no hace falta volver a publicar.')

    # La clave anterior solo se retira cuando la nueva ya está en línea.
    if clave_nueva and clave_anterior and clave_anterior != clave_id:
        nube.borrar_clave_antigua(s, proyecto, correo_servicio, clave_anterior)

    # ─── 8. Dominios y resumen ───
    paso(s, 8, 'Dominio autorizado y comprobación final')
    dominios = vercel.dominios(proyecto_vercel, equipo)
    acceso.autorizar_dominios(s, proyecto, dominios)
    direccion = direccion_principal(dominios)
    estado['vercel']['url'] = direccion
    guardar_estado(estado)
    try:
        nube.guardar_estado_bucket(s, bucket, estado)
    except FalloInstalacion as error:
        s.decir('Aviso: no pude guardar una copia del estado en el bucket: ' + limpiar(error.detalle or error.mensaje)[:200])

    s.decir('\n✅ Drama AI Studio está instalado.')
    s.decir('   Abre: ' + direccion)
    s.decir('   Entra con: ' + cuenta)
    s.decir(f'   Proyecto: {proyecto} · Bucket: {bucket}')
    s.decir('   Dentro, el botón APIS muestra la cuenta y el bucket que usa el estudio.')
    return estado


def principal():
    s = Sistema()
    try:
        instalar(s)
        return 0
    except FalloInstalacion as error:
        s.decir('\n❌ No se completó: ' + error.mensaje)
        if error.detalle:
            s.decir('   Detalle: ' + error.detalle)
        s.decir('   Lo ya hecho se conserva. Cuando lo arregles, vuelve a escribir ./c')
        return 1
    except KeyboardInterrupt:
        s.decir('\nDetenido. Lo ya hecho se conserva; vuelve a escribir ./c para seguir.')
        return 130


if __name__ == '__main__':
    sys.exit(principal())
