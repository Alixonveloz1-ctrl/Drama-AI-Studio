# Drama AI Studio

Estudio personal para producir dramas cortos de estilo asiático con
inteligencia artificial, en español y operado íntegramente desde un iPhone.
Estilo visual semirrealista cinematográfico. La especificación completa está en
[docs/especificacion.md](docs/especificacion.md).

## Estado

Fase 1 de 8: esqueleto, instalador, puerta común de los endpoints, acceso
privado y pantalla de salud («APIs configuradas»).

## Instalar o actualizar desde el iPhone

[Abrir Cloud Shell](https://shell.cloud.google.com/?authuser=3&cloudshell_git_repo=https://github.com/Alixonveloz1-ctrl/Drama-AI-Studio&cloudshell_git_branch=main&cloudshell_workspace=.)

En Cloud Shell escribe solamente:

```
git pull
./c
```

El instalador, con la cuenta de Google de Cloud Shell:

1. Te deja elegir por número el proyecto de Google Cloud (o crear uno).
2. Comprueba la facturación y activa las APIs (Vertex AI, Cloud Storage,
   Speech-to-Text, Text-to-Speech, Firebase).
3. Crea o reutiliza la cuenta de servicio `drama-studio` con sus tres roles.
4. Crea un bucket privado en US (o usa uno existente, en su carpeta
   `drama-studio/`) y le pone el CORS.
5. Activa el inicio de sesión con Google (Firebase). La primera vez Google pide
   un paso en el navegador; el instalador da el enlace y espera.
6. Encuentra (o crea) el proyecto de Vercel conectado a este repositorio, guarda
   las variables de entorno y publica `main`.
7. Autoriza el dominio del estudio para entrar con Google.

Es idempotente: la segunda vez no pregunta nada y solo arregla lo que falte. La
clave de la cuenta de servicio vive solo en la carpeta personal de Cloud Shell
(permisos 600) y en Vercel; nunca se imprime ni se sube a GitHub ni al bucket.

## Variables de entorno

Las pone el instalador. Obligatorias:

| Variable | Contenido |
|---|---|
| `GCP_SERVICE_ACCOUNT` | JSON de la cuenta de servicio, o el mismo JSON en base64 |
| `GCS_OUTPUT_BUCKET` | Nombre del bucket, sin `gs://` |
| `STUDIO_ALLOWED_EMAILS` | Correos autorizados, separados por comas |
| `STUDIO_FIREBASE_WEB_CONFIG` | Configuración pública del inicio de sesión (Firebase) |

Opcionales, una por cosa configurable (la pantalla «APIs configuradas» muestra
el valor resuelto de cada una):

| Variable | Valor por defecto |
|---|---|
| `GCP_LOCATION` | `us-central1` |
| `SCRIPT_MODEL` | `gemini-3.1-pro-preview` |
| `SCRIPT_LOCATION` | `global` |
| `IMAGE_MODEL` | `gemini-3.1-flash-image` |
| `IMAGE_REGIONS` | `us-central1,europe-west4,us-east4` |
| `IMAGE_MODEL_LOCATIONS` | JSON `{"modelo":"region"}` |
| `VEO_MODEL` | `veo-3.1-lite-generate-001` |
| `TTS_LANGUAGE` | `es-US` (voces Chirp 3 HD de Text-to-Speech, sin respaldo automático) |
| `MUSIC_MODEL` | `lyria-3-pro-preview` (piezas de hasta 184 s, la de la parte de cortos del estudio de anime) |
| `MUSIC_LOCATION` | `global` |
| `STT_MODEL` / `STT_LANGUAGE` | `latest_long` / `es-US` |
| `GCS_PREFIX` | `drama-studio` |
| `MONTAJE_JOB` | `drama-studio-montage` |
| `MONTAJE_REGION` | `us-central1` |

El modelo elegido es el que se usa: si falla, se muestra el error de Google tal
cual y nunca se cambia por otro.

## Arquitectura

```
Navegador (iPhone)          ← orquestador: cola, estado, progreso. Nunca ve una credencial.
   ├─→ Endpoints en Vercel  ← puerta única: comprueba al propietario, firma el token
   │      └─→ Vertex AI        de servicio y censura toda respuesta.
   ├─→ Google Cloud Storage ← única fuente de verdad
   └─→ Cloud Run Job        ← montaje final con FFmpeg (fase 7)
```

## Pruebas

```
node --test pruebas/*.test.mjs pruebas/*.test.cjs
python3 -m unittest discover -s pruebas -p 'test_*.py'
```
