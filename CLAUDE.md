# Cómo trabajar en este repositorio

## Lee primero la especificación

`docs/especificacion.md` es la especificación completa y cerrada del dueño.
Léela entera antes de cambiar nada. Los modelos, catálogos, textos de prompt
literales y errores ya resueltos están ahí. El repositorio de referencia es su
estudio de anime (`Alixonveloz1-ctrl/Anime-AI-Studio`): sus comentarios largos
explican fallos que costaron tiempo; léelos antes de cada fase.

Si algo no está en la especificación, **pregunta**. No asumas ni improvises.

## Al terminar cualquier cambio, da SIEMPRE el enlace de Cloud Shell

El dueño trabaja solo desde un iPhone y cada conversación empieza con Cloud
Shell cerrado. Todo mensaje que anuncie trabajo listo termina con este enlace y
los dos comandos, sin que haga falta pedirlo:

[Abrir Cloud Shell](https://shell.cloud.google.com/?authuser=3&cloudshell_git_repo=https://github.com/Alixonveloz1-ctrl/Drama-AI-Studio&cloudshell_git_branch=main&cloudshell_workspace=.)

```
git pull
./c
```

`authuser=3` es su cuenta de Google: sin ese número Cloud Shell abre otra
cuenta. Cloud Shell no deja pegar texto desde el móvil: lo que teclee tiene que
caber en esas dos líneas y el resto lo hace el instalador (`./c`).

## Trabaja en `main`

Lo pidió expresamente. No dejes el trabajo en una rama aparte.

## Escribe en español llano

Código, comentarios, nombres de archivo y textos de la interfaz en español. Los
prompts a los modelos de imagen y video, en inglés; los de texto, en español.
En las respuestas al dueño: qué arreglaste, qué está hecho y qué tiene que hacer
él. Corto, sin rutas ni nombres de archivo.

## Decisiones del dueño posteriores a la especificación

Mandan sobre la especificación donde la contradigan:

- **Aspecto visual:** negro y dorado, títulos con serifa, botones dorados en
  píldora, iconos de línea y portada nocturna (según una imagen que él mandó).
  Es SOLO el aspecto: la organización, los catálogos y las funciones siguen
  como en la especificación.
- **Público en vez de demografías:** las 6 demografías del anime (Shōnen,
  Shōjo…) no se usan. Se usan 4 públicos: masculino, femenino, adulto y para
  toda la familia (este último desactiva Ecchi, Harem, Harem inverso y Gore).
  Los 21 géneros y los 23 subgéneros se conservan íntegros.
- **Entrar:** un botón «Entrar con Google» (Firebase). Solo su cuenta.
- **Nada redundante ni obvio en pantalla:** no mostrar el correo con el que
  entró (es su app personal) ni dos botones que hagan lo mismo.
- **Google Cloud:** proyecto `drama-ai-studio-513501`, SIN organización (en un
  proyecto con organización no se pueden crear claves de cuenta de servicio).
  Antes de tocar un proyecto, comprobar si tiene organización y avisar.
- **La clave de la cuenta de servicio** la crea Cloud Shell (`./c`) y la
  escribe él mismo en Vercel. Nunca pasa por el chat ni por el código.
- La aplicación está en `https://drama-ai-studio-amber.vercel.app`.
- **Personajes atractivos y géneros que se notan:** las mujeres salen muy hermosas
  y los hombres atractivos en todos los proyectos. Con ecchi, harem o harem
  inverso (nunca con «familia»), las mujeres tienen figura voluptuosa y vestuario
  que la realza desde la ficha, el guion teje momentos de fan service en la acción
  y el desglose les da planos; siempre adultas y sin desnudez. El género y CADA
  subgénero elegido viajan a cada imagen como dirección de aspecto, y cada bloque
  del guion demuestra con una cita literal que todos se notan (si no, se reescribe).
- **Estilo de imagen (sustituye al texto literal 9.1):** el de las portadas y
  miniaturas de los dramas cortos asiáticos de éxito que mandó el dueño:
  semirrealista pero pulido y luminoso, piel de porcelana, colores vivos, caras
  de estrella de drama coreano o chino (rasgos de idol), no caras corrientes.
  Nunca anime. Va siempre primero y no se sustituye.
- **Lugares sin imagen:** los escenarios NO tienen imagen de referencia (la foto
  quedaba pegada como fondo). El director de arte escribe de cada lugar una ficha
  muy detallada en inglés (inventario cerrado y posiciones) y esa ficha va
  completa, palabra por palabra, en cada imagen de ese lugar. Todo lo hace el
  director; el dueño no coloca nada a mano.
- **Sin sonido de ambiente aparte:** el ambiente y los efectos los pone Veo en
  cada clip. La fase 6 son voces y música.
- **Voces Chirp 3 HD, no Gemini TTS:** las de Gemini sonaban horribles (pausas
  antinaturales, sin contexto). Chirp es más plano pero natural y es lo viral.
  Sin instrucción de estilo ni selector de registro; números y símbolos se
  pasan a palabras antes de enviarlos.
- **Música con Lyria 3 Pro, piezas largas:** una pieza por acto que dura todo el
  acto (hasta 184 s), pedida como en la parte de cortos del estudio de anime
  (`interactions`, MP3). El director musical recibe la historia entera del acto
  con el minuto de cada escena y escribe en inglés una línea de tiempo; sonido
  de banda sonora actual de drama asiático según el género, nunca techno,
  sintetizador viejo, chiptune ni fanfarrias. Lo que funciona en el estudio de
  anime se copia tal cual, sin ir a consultar a Google.
- **Conversación antes que código:** cuando el dueño está explicando algo, no se
  edita nada hasta que termine y diga que siga.

## Construcción por fases

Una fase, parar, y decirle qué puede probar desde el teléfono. Él dice si seguir.

1. Esqueleto, instalador, puerta, acceso privado y pantalla de salud — **hecha y probada por el dueño**.
2. Historia: formulario con el catálogo completo, tres ideas breves, universo y guion por bloques — **hecha y probada por el dueño (guion real de 3 min)**.
3. Personajes, escenarios y sus referencias — **hecha** (fichas, variantes editando la madre, escenarios, lote).
4. Escenas e imágenes: botón por plano, botón de lote y la cola con el manejo de cuotas — **hecha** (desglose del director de fotografía, revisión del director de arte cada 5 escenas, imagen por plano con continuidad).
5. Videos: arranque, consulta y audio nativo sin voces — **hecha** (botón por plano, lote de los planos de acción, la operación de Veo se guarda y se sigue tras recargar).
6. Voces y música (sin ambiente: lo pone Veo) — **hecha** (voz por escena en tramos de una sola voz con Chirp 3 HD, voces pedidas a Google y asignadas solas por sexo, muestra de cada voz; música por acto con Lyria 3 Pro: pieza larga con línea de tiempo en inglés).
7. Subtítulos alineados y montaje final en Cloud Run — **hecha** (alineación forzada con respaldo proporcional; hoja de montaje → guion de FFmpeg escrito por el servidor; montador genérico que crea el instalador; pestaña Exportar con un botón que hace lo que falte).
8. Capa del Sistema, episodios encadenados y export ZIP — **hecha** (paneles del Sistema dibujados en el montaje, «Escribir el episodio N» que continúa la historia con ids de escena propios, ZIP con todo el material).

## Mapa del código

- `api/` — endpoints de Vercel (Node.js, nunca Edge; máximo 12 funciones).
  Todos pasan por `api/_lib/puerta.js`: comprueba al propietario antes de
  tocar Google, firma el token de servicio y censura la respuesta.
- `api/_lib/google.js` — credenciales y todos los modelos/regiones por variable de entorno.
- `api/_lib/acceso.js` — inicio de sesión de Google (Firebase) + `STUDIO_ALLOWED_EMAILS`.
- `api/_lib/errores.js` — bloqueo antes que cuota; explicaciones en español.
- `api/texto.js` — único punto de texto (Gemini global, thinkingLevel LOW, corte a 50 s → «hazlo más pequeño»).
- `api/proyectos.js` + `api/_lib/almacen.js` — proyectos en el bucket con versión (ifGenerationMatch), historial y 404 real.
- `api/imagen.js` — contrato de estilo 9.1 primero, fichas con contrato 10.2 y continuidad 10.4 leídas del bucket en el servidor; guarda la imagen en el bucket y devuelve ruta + URL firmada. Bloqueo sin reintento.
- `api/video-inicio.js` + `api/video-estado.js` — Veo: arranca con la imagen del plano leída del bucket (4 s, audio nativo, MP4 directo al bucket) y consulta en el modelo que arrancó; URL firmada de 7 días.
- `api/voz.js` — Chirp 3 HD (Text-to-Speech). GET: voces Chirp 3 HD es-US con su género; POST: un tramo de una sola voz, texto pasado a palabras por `api/_lib/habla.js`, sin velocidad ni tono, WAV al bucket. Sin motor de respaldo.
- `api/musica.js` — Lyria 3 Pro (`interactions`, global, hasta 184 s, 300 s de función): brief solo en inglés (se comprueba antes), MP3 al bucket. Sin reintento automático.
- `api/transcripcion.js` — Speech-to-Text con tiempos por palabra (lee la voz del bucket).
- `api/montaje.js` + `api/_lib/hoja.js` — valida la hoja de montaje (datos), escribe el guion de FFmpeg y la lista de descargas (ningún texto del navegador entra en el guion: subtítulos y paneles van como archivos), lanza el trabajo de Cloud Run y consulta; también el ZIP.
- `montador/` — el contenedor genérico del montaje (FFmpeg, fuentes, zip). Lo construye y despliega el instalador (paso 5), solo si cambió.
- `api/urls.js` — URLs firmadas (ver y descargar con nombre) y comprobación de existencia, solo dentro de la carpeta del proyecto.
- `estudio/` — módulos del navegador; `index.html` y `entrar/` las páginas.
  - `imagenes.mjs` también guarda el aspecto visual de cada género y subgénero, el casting atractivo y el ecchi visual (`direccionDeAspecto`).
  - `voces.mjs` (asignación de voces, tramos de una voz, voz por escena, muestras), `musica.mjs` (actos con el minuto de cada escena, director musical, piezas por acto), `subtitulos.mjs` (alineación y frases), `montaje.mjs` (hoja de montaje, reparto por peso, ZIP, operación reanudable), `exportar.mjs` (pestaña Exportar).
  - `videos.mjs` (prompt de video por bloques literales en orden, negativo como lista, operación guardada y reanudable).
  - `desglose.mjs` (director de fotografía: planos de acción/cobertura anclados al texto, con puesta en escena —quién está desde el principio, quién entra y sale—, encuadre, estado de cada persona presente y qué cambió; primer plano general con todos; todo validado antes de pagar imágenes. Director de arte: corrige sin borrar y vigila apariciones, desapariciones y objetos que se esfuman), `escenas.mjs` (pestaña Escenas; las escenas abiertas siguen abiertas; cada imagen lleva estado, fuera de cuadro y el plano general como mapa).
  - `medios.mjs` (cola de imagen/video: esperas 60/120/180/240/300, tandas que saltan lo hecho), `imagenes.mjs` (prompts de imagen en inglés), `personajes.mjs` (pestaña Personajes).
  - `prompts.mjs` (textos de prompt), `guion.mjs` (ideas, universo, biblia, nota, bloques y su revisión),
    `texto.mjs` (esperas de cuota 20/45/90/150/240, bloqueo sin reintento, Detener), `historia.mjs` (pantalla),
    `proyectos.mjs` (proyecto abierto y guardado en fila), `catalogo.mjs` (géneros, subgéneros, públicos).
- `comun/cors-bucket.json` — la única lista de CORS del bucket (servidor e instalador).
- `instalador/` + `c` — instalador de Cloud Shell (idempotente, todo por número).
- `pruebas/` — `node --test pruebas/*.test.*` y `python3 -m unittest discover -s pruebas -p 'test_*.py'`.

## Lo que no está en la especificación sale del estudio de anime

Antes de preguntar al dueño algo técnico (un modelo, un parámetro, un
límite), búscalo en el repositorio del estudio de anime: él ya lo resolvió
allí y espera que se lea. Ejemplo: la voz es Chirp 3 HD como en su estudio
(`api/audio.js` y el README de allí: sin `speakingRate` ni `pitch`, texto
normalizado a palabras), SIN motor de respaldo (regla 2.7).

Pregunta solo lo que es una decisión suya (gustos, organización, cuentas).
