# Drama AI Studio — Especificación completa de construcción

Documento de entrega para el agente de código. Todo lo que está aquí es
decisión cerrada del dueño salvo donde diga explícitamente lo contrario.

**Fecha:** 1 de noviembre de 2026
**Dueño:** Alixon
**Repositorio de referencia:** `Alixonveloz1-ctrl/Anime-AI-Studio` (su estudio de
anime, ya en producción). Este proyecto es **nuevo y separado**, pero reutiliza su
arquitectura, su interfaz y, sobre todo, los problemas que ese código ya resolvió.

---

## 0. Cómo usar este documento

1. Antes de escribir una línea, **lee el repositorio Anime-AI-Studio completo**.
   No solo los nombres de modelo: lee los comentarios. Ese código lleva meses de
   fallos corregidos y cada comentario largo explica un error que costó tiempo.
   La sección 18 resume los que ya están identificados, pero no es exhaustiva.
2. La sección 2 son restricciones del dueño. No se negocian ni se "mejoran".
3. Donde este documento da un texto de prompt literal, úsalo literal. Esos textos
   son el resultado de iteración real, no una sugerencia.
4. Todo el código, los comentarios, los nombres de archivo y los mensajes de la
   interfaz van **en español**. Los prompts a los modelos de imagen y video van
   **en inglés** (los modelos obedecen mejor); los de texto, en español.

---

## 1. Qué se construye

Una aplicación web para producir **dramas cortos de estilo asiático con
inteligencia artificial**, en español, operada íntegramente desde un iPhone.

El dueño escribe un concepto, elige género y subgéneros, y la aplicación produce
un episodio de ~30 minutos completo: historia, personajes, imágenes, videos,
voces, música, efectos, subtítulos y el MP4 final montado.

Puede encadenar episodios: terminado el 1, un botón genera el 2 conservando
personajes, escenarios y los hilos abiertos. Puede generar cuatro seguidos y
publicarlos juntos como una película de dos horas.

**Esto no es anime.** El estilo visual es semirrealista cinematográfico. Es
deliberado: los modelos de video están entrenados sobre fotografía y video real,
así que el semirrealismo es su terreno natural y sale consistente. El anime 2D
dibujado es lo contrario de su instinto y se degrada. El estudio de anime del
dueño existe aparte y no se toca.

### Referencias del formato

Dos videos que el dueño quiere igualar. Fueron analizados plano a plano y de
ellos salen todas las decisiones de las secciones 6 a 16:

- **Drama de transmigración** (`youtu.be/rf9ZsJ9WeP0`) — 2 h 10 min. Hombre
  moderno muere y despierta en un cuerpo de otra época, con un supermercado
  entero encima. Ciclo de recompensa cada 2–3 minutos. 85% diálogo, 15%
  pensamiento interno.
- **Supervivencia en isla** (`youtu.be/zXtD_Ojr4xU`) — 1 h 45 min, vertical, en
  español. Naufragio con "Sistema de Supervivencia" gamificado. Giro cada 45–90
  segundos. 100% diálogo entre personajes; la única voz en off es la del Sistema.
  Planos de 2–4 segundos. 70% video generado, 30% imagen con movimiento de cámara.

---

## 2. Restricciones del dueño (no negociables)

Estas vienen de su forma real de trabajar y de decisiones que ya tomó en el
estudio de anime. Violar una de estas hace la aplicación inservible para él.

### 2.1 Solo trabaja desde el iPhone

No tiene terminal, ni computadora, ni entorno local. Edita en el editor web de
GitHub y despliega con Vercel. **Toda la aplicación tiene que ser usable en la
pantalla de un teléfono**: generar, revisar imágenes, ver videos, montar, descargar.
Ninguna pantalla puede quedar solo para escritorio.

### 2.2 La instalación tiene que caber en dos líneas tecleables

Cloud Shell **no permite pegar texto desde el móvil**. Todo lo que haya que
teclear ahí debe caber en dos líneas cortas, y el resto lo hace un instalador del
repositorio. Patrón del estudio de anime, que funciona:

```
git pull
./c
```

### 2.3 Nada de costes en la interfaz

Decisión explícita y anterior del dueño (regla U001 de su estudio): consulta su
facturación directamente en Google Cloud. **No se construyen** precios,
estimaciones, presupuestos, saldos, reservas ni bloqueos por falta de saldo. No
se esconden: no existen.

### 2.4 Nada de botones de instalación dentro de la aplicación

Regla U004. Sin botón de Cloud Shell, sin panel de instalación, sin pegar claves
ni JSON en pantalla. El enlace de instalación se entrega en la conversación.

### 2.5 Acceso privado

Solo su cuenta de Google puede usar la aplicación. Comprobación de propietario en
**todos** los endpoints, no solo en la entrada: un endpoint abierto gasta sus
créditos igual. Variable `STUDIO_ALLOWED_EMAILS`. Un inicio de sesión de Google
válido de otra persona no basta.

### 2.6 Sin botones de aprobación

**La última generación de cada cosa queda aprobada y en uso automáticamente.**
Imagen generada = imagen utilizada. Video generado = video utilizado. Si el dueño
regenera, es porque lo anterior salió mal: lo nuevo pasa a estar en uso sin que
nadie apruebe nada. Esta regla ya existe en su código para los efectos de sonido
("el último archivo subido es el que se usa, sin botón de aprobar") y aquí se
aplica a todo.

### 2.7 Nunca cambiar de modelo en silencio

Si el modelo elegido falla, se devuelve el error de Google tal cual y se dice en
pantalla con palabras. Jamás se sustituye por otro modelo a espaldas del dueño.

### 2.8 Todo fallo se explica en pantalla con palabras

Nada de códigos crudos ni de silencios. Si algo no se pudo hacer, la pantalla
dice qué y por qué, en español llano.

### 2.9 No se pide trabajo manual innecesario

No se le pide pegar guiones, subir archivos ni copiar datos que la aplicación
puede obtener sola. Su trabajo manual es solo el inevitable: mirar lo generado y
mandar a regenerar lo que salió mal.

---

## 3. Arquitectura

La misma del estudio de anime, porque está probada y funciona desde el teléfono.

```
Navegador (iPhone)          ← orquestador: cola, estado, progreso.
   │                           NUNCA ve una credencial.
   ├─→ Endpoints en Vercel  ← puerta única. Firma el token de servicio
   │                           y censura toda respuesta.
   │      └─→ Vertex AI     ← texto, imagen, video, voz, música
   │
   ├─→ Google Cloud Storage ← única fuente de verdad
   │
   └─→ Cloud Run Job        ← montaje final con FFmpeg
```

Reglas de la arquitectura:

- **El navegador es el orquestador.** Lleva la cola, el estado y el progreso. No
  ve nunca una credencial.
- **Un endpoint en Vercel es la puerta única.** Firma el token de la cuenta de
  servicio y censura toda respuesta antes de devolverla.
- **Google Cloud Storage es la única fuente de verdad.** Proyectos, guiones,
  personajes y estado se guardan como manifiestos en el bucket. Imágenes, audios,
  música, operaciones y referencias se reflejan al bucket en cuanto se generan.
- **`localStorage` e IndexedDB son solo caché del dispositivo activo.** La
  aplicación borra la caché de proyectos inactivos para que el iPhone no se llene.
  La lista de proyectos se reconstruye desde el bucket, así que el mismo proyecto
  aparece al abrir desde otro teléfono o computadora.
- **El montador de Cloud Run no conoce ningún archivo por su nombre.** Recibe un
  manifiesto origen→destino y ejecuta el guion de FFmpeg que generó la aplicación.
- **Nada de project id, bucket, modelo ni región escrito en el código.** Todo por
  variable de entorno; el proyecto sale del `project_id` de la cuenta de servicio.
- **Una "hoja de montaje" compartida** de la que salen a la vez el guion de FFmpeg
  y la lista de descargas.

### 3.1 Límites de plataforma que condicionan el diseño

- **Los endpoints serverless mueren a los 60 segundos.** Toda operación larga se
  parte: el video se arranca y se consulta después (dos endpoints), el texto se
  pide por bloques.
- **Petición y respuesta ≤ 4,5 MB.** Por eso los medios suben al bucket con URLs
  firmadas desde el navegador y no pasan por los endpoints.
- **Runtime Node.js, nunca Edge.** Las funciones Edge de Vercel están obsoletas y
  cortan la respuesta a los 25 segundos aunque `vercel.json` diga otra cosa.
- `maxDuration` por endpoint, como en el estudio de anime: 60 s para texto,
  imagen, video-start y ensamblado; 30 s para audio, música, transcripción y
  URLs firmadas; 15 s para salud, voces y descarga.

---

## 4. Modelos exactos y variables de entorno

Verificados leyendo el código del estudio de anime. **Usar estos identificadores,
no inventar ninguno.**

### 4.1 Modelos

| Uso | Modelo | Notas |
|---|---|---|
| Texto | `gemini-3.1-pro-preview` | Región `global` obligatoria |
| Imagen (por defecto) | `gemini-3.1-flash-image` | Nano Banana 2, el económico |
| Imagen (calidad) | `gemini-3-pro-image` | Nano Banana Pro, a mano cuando haga falta |
| Video (por defecto) | `veo-3.1-lite-generate-001` | El económico |
| Video (equilibrado) | `veo-3.1-fast-generate-001` | |
| Video (máxima calidad) | `veo-3.1-generate-001` | |
| Música | `lyria-002` | |
| Voz | Gemini TTS por Vertex AI | 30 voces, ver 14.1 |
| Subtítulos | Speech-to-Text `latest_long` | Idioma `es-US` |

**La familia Imagen de Google queda descartada por completo: no acepta imágenes
de referencia.**

### 4.2 Convenciones técnicas de Vertex que ya están resueltas

- Los modelos **Gemini 3.x solo se sirven desde el endpoint `global`**. Pedirlos a
  una región concreta devuelve un 404 que parece falta de acceso y no lo es.
- **Imagen** se pide por `:generateContent`.
- **Video** se pide por `:predictLongRunning` y se consulta con
  `fetchPredictOperation`, con `storageUri` apuntando al bucket para que el MP4
  no pase por el endpoint.
- **Imagen tiene conmutación de región ante 429**: `us-central1` →
  `europe-west4` → `us-east4`.
- **Veo acepta solo 4, 6 u 8 segundos.** No existe un clip de 3 segundos.
- **Veo tiene el mismo filtro de seguridad que el generador de imagen.** Un clip
  bloqueado cuesta bastante más que una imagen bloqueada, así que el prompt se
  revisa antes de enviarlo.
- **Lyria solo acepta inglés.** Con prompt en español rechaza la petición entera
  con "Unsupported language detected". El brief musical se escribe en inglés
  aunque todo el resto del proyecto esté en español.
- Las operaciones de Veo ya iniciadas **se guardan** y se pueden seguir
  consultando después de recargar la página.

### 4.3 Variables de entorno

Obligatorias:

| Variable | Contenido |
|---|---|
| `GCP_SERVICE_ACCOUNT` | JSON completo de la cuenta de servicio, **o el mismo JSON en base64** — base64 es preferible desde iPhone porque es una sola línea sin retornos |
| `GCS_OUTPUT_BUCKET` | Nombre del bucket, sin `gs://` |
| `STUDIO_ALLOWED_EMAILS` | Correos autorizados |

Opcionales, una por cosa configurable:

| Variable | Valor por defecto |
|---|---|
| `GCP_LOCATION` | `us-central1` |
| `SCRIPT_MODEL` | `gemini-3.1-pro-preview` |
| `SCRIPT_LOCATION` | `global` |
| `IMAGE_MODEL` | `gemini-3.1-flash-image` |
| `IMAGE_REGIONS` | `us-central1,europe-west4,us-east4` |
| `IMAGE_MODEL_LOCATIONS` | JSON `{"modelo":"region"}` |
| `VEO_MODEL` | `veo-3.1-lite-generate-001` |
| `MUSIC_MODEL` | `lyria-002` |
| `MUSIC_LOCATION` | según modelo |
| `STT_MODEL` / `STT_LANGUAGE` | `latest_long` / `es-US` |
| `GCS_PREFIX` | `drama-studio` (carpeta propia dentro del bucket) |
| `MONTAJE_JOB` | `drama-studio-montage` |
| `MONTAJE_REGION` | `us-central1` |

Debe existir una pantalla de "APIs configuradas" que muestre todos los valores
resueltos y qué variable cambia cada uno. Esto ya existe en el estudio de anime y
le sirve para diagnosticar sin abrir Vercel.

### 4.4 Requisitos de la cuenta de Google Cloud

- Facturación activa.
- APIs habilitadas: `aiplatform.googleapis.com`, `storage.googleapis.com`,
  `speech.googleapis.com`, `texttospeech.googleapis.com`.
- Roles de la cuenta de servicio: `roles/aiplatform.user`,
  `roles/storage.admin` (hace falta `storage.buckets.update` porque el endpoint
  de estado de video aplica CORS al bucket) y
  `roles/serviceusage.serviceUsageConsumer`.
- Bucket creado en US (Veo corre en `us-central1`).

---

## 5. Catálogo creativo

Se conservan **íntegros** los catálogos del estudio de anime y se añaden los
propios del formato drama. El dueño pidió expresamente que no falte ninguno de
los que ya conoce.

### 5.1 Géneros (17 heredados + 4 nuevos)

Heredados tal cual:

`accion`, `fantasia`, `isekai`, `mecha`, `romcom`, `drama`, `slice_of_life`,
`terror`, `psicologico`, `misterio`, `deportes`, `sci_fi`, `aventura`,
`sobrenatural`, `supervivencia`, `videojuego` (Videojuego / Sistema),
`donghua` (Donghua / Cultivación).

Nuevos, propios del formato:

| Valor | Etiqueta |
|---|---|
| `transmigracion` | Transmigración — Despierta en otra época o en otro cuerpo |
| `naufragio` | Naufragio — Aislamiento, isla desierta, rescate imposible |
| `ascenso_social` | Ascenso social — De despreciado a respetado |
| `sistema_juego` | Sistema de niveles — Pantallas, puntos, desbloqueos |

### 5.2 Subgéneros (los 23 heredados, íntegros)

`psicologico`, `romance`, `ecchi`, `harem`, `harem_inverso`, `comedia`, `dark`,
`gore`, `misterio`, `revenge`, `overpowered`, `slice_of_life`, `musica`,
`deporte`, `mafia`, `escolar`, `militar`, `reencarnacion`, `viaje_tiempo`,
`apocalipsis`, `idols`, `medicina`, `sistema_awakening`.

Se muestran como chips marcables, los primeros visibles y el resto bajo "Más
subgéneros", igual que hoy.

Regla heredada que se mantiene: **todos los personajes son adultos (18+)**. Si el
subgénero `escolar` está activo, el entorno académico es universitario o academia
de adultos, nunca secundaria. Esta regla anula cualquier otra lectura y es
obligatoria con contenido `ecchi` o `harem`.

### 5.3 Demografías (las 6 heredadas)

`shonen`, `shojo`, `seinen`, `josei`, `kodomomuke`, `donghua`.

### 5.4 Formato de pantalla

Selector con dos opciones, elige el dueño por proyecto:

- **9:16 vertical** — para TikTok, Reels, Shorts y apps de microdrama. Es el
  formato de los dos referentes.
- **16:9 horizontal** — para YouTube normal.

Los encuadres del desglose se adaptan al formato elegido.

### 5.5 Idioma

**Solo español.** Decisión del dueño: YouTube y Facebook ya traducen los videos
subidos, así que no se construye nada bilingüe. Voces en español, subtítulos en
español quemados en pantalla.

Consecuencia de diseño que se mantiene aunque haya un solo idioma: el video se
genera **sin voces** y las voces se añaden encima (ver 13.3 y 14). Eso permite
regenerar una línea de diálogo sin volver a pagar el video.

---

## 6. Anatomía del formato

Esto sale del análisis plano a plano de los dos referentes. Es la parte que el
dueño quiere igualar y la que hay que respetar con más exactitud.

### 6.1 La apertura

Empieza **dentro del conflicto**, sin presentación y sin contexto. El referente de
supervivencia abre con una discusión y una bofetada en el segundo cero, y a los
doce segundos ya ha aparecido el elemento que define la historia. El de
transmigración abre con el protagonista muriendo atropellado.

Regla: en los **primeros 15 segundos** tiene que haber un conflicto visible, y en
los **primeros 30** el elemento que hace especial a esta historia (el Sistema, la
ventaja, el recurso imposible).

### 6.2 El ciclo de retención

Es el motor del formato y se repite durante todo el episodio:

1. **Aparece un problema** — escasez, una amenaza, una humillación, un enemigo.
2. **El protagonista lo resuelve** con una habilidad, un conocimiento de su mundo
   de origen o algo que el Sistema le entrega.
3. **Los demás reaccionan** con asombro, incredulidad o sumisión. Esta reacción
   es obligatoria y es la mitad del gancho.
4. **Gana algo visible** — dinero, respeto, un aliado, puntos, una tecnología.

Cadencia: **un ciclo cada 45 a 90 segundos**. En un episodio de 30 minutos son
**entre 20 y 40 ciclos**. El generador de guion no acepta un bloque que no
contenga al menos un ciclo completo.

El pensamiento interno del protagonista va **antes** de ejecutar la jugada, no
después: el espectador sabe lo que va a pasar y se queda a ver la cara de los
demás. Esa anticipación es deliberada.

### 6.3 Voces del episodio

- **Diálogo entre personajes: la gran mayoría.** Este formato se actúa, no se
  narra.
- **Pensamiento interno del protagonista: una parte pequeña**, con su propia voz.
- **Narrador que cuenta la historia: no existe.** La única voz en off permitida es
  la del Sistema, cuando el proyecto lo tiene activo.

### 6.4 Duración y cierre

Objetivo 30 minutos, con holgura de un par de minutos arriba o abajo. **El
director usa esa holgura para cerrar bien la historia**; no se recorta un ciclo a
mitad para cuadrar un número.

Al generar, el dueño elige:

- **Cierre completo** — la historia termina.
- **Cierre en suspenso** — queda un gancho explícito para el episodio siguiente.

---

## 7. Motor de guion

### 7.1 Flujo

1. El dueño elige demografía, género, subgéneros y formato, y escribe su concepto.
2. La aplicación genera **tres ideas**, cada una solo con **título y concepto
   breve**. No se desarrollan las tres (regla U011 del estudio de anime: no quiere
   leer tres historias para elegir una).
3. Elegida una, se desarrolla el universo: premisa, mundo, reglas, personajes,
   escenarios y la biblia de dirección.
4. Se escribe el episodio **por bloques**, guardando cada bloque terminado. Un
   episodio de 30 minutos no cabe en una llamada de 60 segundos.

### 7.2 Reglas de escritura heredadas que siguen vigentes

Están en el estudio de anime porque cada una corrigió un fallo real:

- **Prohibido el resumen escolar.** Nada de "durante los días siguientes entrenó y
  mejoró mucho". Si ese crecimiento importa, se muestran dos o tres hechos
  concretos que lo prueben.
- **Cada solución produce una consecuencia o una necesidad nueva.** Un problema
  resuelto que no cambia nada es un ciclo desperdiciado.
- **Las revelaciones reciben reacción antes de cambiar de asunto.**
- **Español oral**: frases cortas, diálogo directo, punto de vista cercano,
  microcambios frecuentes. Se rechaza automáticamente la prosa literaria y el
  texto que suena a IA antes de aceptar un bloque.
- **Un bloque demasiado corto no se acepta como éxito.** Se vuelve a pedir.
- **La división en escenas nunca rellena con escenas vacías.**
- **El episodio no se confirma** si faltan escenas, texto, título o dirección
  visual.
- **El director no puede cambiar el género.** Recibe un contrato de fidelidad: su
  trabajo es que ese género se sienta excelente, no reinterpretarlo.

### 7.3 La capa de dirección

Se hereda del estudio de anime, adaptada al formato. Son cinco niveles:

1. **Biblia de la serie** — se escribe al crear el universo: dirección visual
   (paleta y luz concretas), identidad musical, ritmo narrativo, ritmo de montaje,
   motivos recurrentes, reglas de oro y arco de la temporada. Se inyecta en todos
   los prompts posteriores.
2. **Nota del episodio** — antes de escribirlo: qué debe lograr en el arco, curva
   emocional, imagen clave y qué queda abierto.
3. **Dirección musical** — el brief de cada pista (en inglés, por Lyria).
4. **Desglose de planos** — ver sección 11.
5. **Revisión de puesta en escena** — un pase que lee los prompts ya escritos y
   los contrasta con el escenario y la narración, para cazar atrezzo imposible o
   clima de exterior dentro de una habitación. Corre solo cada 5 escenas y a mano
   con un botón. Cuando corrige un plano **no borra nada**: dice qué imágenes y
   qué clips quedaron obsoletos y deja decidir. Si no consigue revisar por límite
   de peticiones, lo dice: nunca reporta "sin fallos" sobre algo que no miró.

### 7.4 Equipo de revisión

Tres roles, cada uno existe porque atrapa un fallo concreto:

| Rol | Qué hace | Qué error evita |
|---|---|---|
| Director creativo | Biblia, nota de episodio, dirección musical | Episodios de plantilla |
| Director de fotografía | Cuántos planos, qué muestra cada uno, el movimiento | Planos de relleno, saltos entre planos |
| Director de arte | Lee los prompts escritos y los contrasta con escenario y narración | Atrezzo imposible, clima imposible |

---

## 8. La capa del Sistema

**Solo cuando la historia es de sistema.** Decisión del dueño: si el género o el
concepto no tienen nada que ver con un sistema, esta capa no aparece en ninguna
parte.

Cuando está activa, es una capa de gráficos **dibujada en el montaje**, no
generada por IA. No cuesta generación.

Elementos:

- **Panel de apertura** — aparece en los primeros 30 segundos y establece la
  regla del juego (el referente usa "Sistema de Supervivencia" con una cuenta
  atrás de 72 horas).
- **Notificaciones** — objeto desbloqueado, misión cumplida, nivel alcanzado.
- **Contadores** — puntos, días, recursos, facción.
- **Cuentas atrás** — cuando hay un plazo.

Tres funciones, todas deliberadas:

1. Da identidad al género.
2. **Hace visible la recompensa del ciclo.** El espectador ve subir el número.
3. **Tapa las transiciones donde la IA falla.** Un panel encima de un corte
   difícil lo esconde. Los dos referentes lo usan constantemente para eso.

El guion marca en qué plano entra cada elemento del Sistema, y el montador lo
dibuja con FFmpeg sobre el video ya montado.

---

## 9. Contrato de estilo visual

Este es el cambio más importante respecto al estudio de anime: **se invierte por
completo**. Donde el anime prohíbe el 3D, el drama lo pide.

El contrato va **en inglés**, como primera parte del mensaje al modelo de imagen,
para que enmarque todo lo que sigue.

### 9.1 Texto del contrato (literal)

```
ART STYLE (non-negotiable, applies to the ENTIRE image and every character in
it): CINEMATIC SEMI-REALISTIC LIVE-ACTION DRAMA FRAME, in the visual language of
a high-budget Asian historical or survival drama. Photographic skin with real
texture, pores and subsurface detail. Volumetric cinematic lighting with
motivated sources: golden-hour sun, cold morning light, firelight, shafts through
gaps. Real fabric weave and material response — worn linen, wet cotton, oiled
leather, weathered wood, rusted metal. Shallow depth of field with natural lens
falloff and gentle bokeh. Colour grading of a graded film: rich but controlled
contrast, filmic highlight rolloff, no crushed blacks. Faces are adult, grounded
and anatomically correct, with human-sized eyes and readable micro-expression.
Full-frame cinematic composition with real perspective and atmospheric depth.
STRICTLY FORBIDDEN: 2D anime, cel shading, hand-drawn linework, ink outlines,
flat graphic shadow shapes, manga styling, cartoon proportions, chibi, oversized
eyes, Disney/Pixar stylisation, illustration, painterly brushwork, plastic or
waxy skin, videogame cutscene plastic shading, over-sharpened AI portrait look.
The result must look like a frame grabbed from a professionally shot and graded
drama series.
```

### 9.2 Reglas de estilo que se mantienen del estudio de anime

- El contrato de estilo se **añade siempre**, nunca se sustituye por la elección
  del usuario. En el estudio de anime hubo un fallo exactamente por esto y la
  solución fue concatenar las prohibiciones a todos los estilos, no reemplazarlas.
- **Fan service dirigido por la escena, no permanente.** Si la escena pide un
  momento sugestivo, se dibuja con confianza; si la escena es duelo, combate,
  exposición o conversación corriente, **no** se fuerza escote, rubor, ropa
  ajustada ni poses sugestivas que nadie pidió.
- El pelo de cada personaje se dibuja exactamente como está descrito: nunca se
  alarga, acorta o reestiliza para encajar en una convención.
- El contrato de estilo **no se nombra en el prompt de video**. El primer
  fotograma ya está en el estilo correcto, y nombrar un estilo ahí le pide al
  generador cambiarlo a mitad del clip. En el prompt de video se dice únicamente:
  *preserve the exact rendering of the first frame* y se prohíbe explícitamente
  que lo convierta en otra cosa mientras se mueve.
- **Cuidado con los adjetivos del contrato de imagen dentro del prompt de video.**
  En el estudio de anime, "wet-surface reflections" —escrito para dar brillo
  cinematográfico a las imágenes— se leía en el prompt de video como una orden
  literal de mojar el suelo, y aparecía lluvia dentro de un pasillo. El contrato
  de imagen y el de video son textos distintos.

---

## 10. Personajes y referencias

### 10.1 Ficha maestra

Cada personaje recurrente tiene **una sola imagen de referencia limpia**,
generada dentro de la aplicación. Nunca se sube a mano.

Una toma con un personaje recurrente nombrado **se bloquea** si falta su
referencia. Esto evita que el personaje cambie de cara entre planos.

### 10.2 Contrato de referencia (literal, en inglés)

Cada imagen de referencia va seguida de una línea que dice **qué copiar de ella**.
Sin esa línea el modelo copia el encuadre en vez de la identidad. Texto:

```
CHARACTER REFERENCE above: this is {nombre}. Use it ONLY as the identity anchor:
same face shape, facial proportions, hair colour/style, eye colour, adult body
proportions and distinctive traits. DO NOT copy the reference pose, framing,
neutral background or reference-sheet composition. WARDROBE IS CONTROLLED BY THE
CURRENT SCENE TEXT: if this shot specifies a different outfit, use the shot's
outfit while preserving identity. Redraw {nombre} in the ART STYLE stated at the
top of this message at the body pose, camera angle and scale required by this
scene, grounded in the environment and sharing its perspective and light. Never
turn the reference into a collage or duplicate the person. Do not mix up
characters.
```

### 10.3 Variantes del mismo personaje

Un personaje puede necesitar más de un aspecto: herido, con otra ropa, años
después, disfrazado. Se modela como **sub-identidad colgada de la ficha madre**:

- Comparte nombre, voz y lugar en el proyecto.
- Guarda solo una descripción del cambio respecto a la madre y su propia imagen.
- Su imagen se genera **editando** la de la madre, con la descripción del cambio
  como instrucción de edición.
- Si se regenera la imagen de la madre, las variantes quedan marcadas como
  obsoletas y **no se regeneran solas**.
- **La voz pertenece a la identidad madre.** Si cambia la voz, es otro personaje.

### 10.4 Continuidad dentro de la escena

El plano anterior de la misma cadena se pasa como referencia de continuidad, con
este contrato (literal, en inglés):

```
This reference is the immediately preceding physical state, not a loose mood
board. Keep the SAME location identity (architecture, palette, time of day),
lighting, character identity, clothing, hairstyle, injuries and object state.
Preserve spatial continuity: a character remains at the same place until the
CURRENT scene text moves them; an open door stays open; an object already held
stays held until the text changes it. A camera cut changes framing, NOT reality.
A character may be off-camera only when the CURRENT prompt deliberately frames
something else — do not erase, teleport or relocate them just because the angle
changed. This new image is a LATER moment, so actions may advance ONLY as
described by the current scene text. If the current text explicitly changes state
(door opens, character falls, object is picked up), the current text wins.
```

---

## 11. Desglose de planos

### 11.1 Dos tipos de plano

El ritmo del formato no sale de que todos los clips sean cortos, sino de alternar
dos tipos:

**Plano de acción** — alguien camina, pelea, construye, nada, conduce, manipula
un objeto. Se genera con Veo. Dura **4 segundos** (es el mínimo de Veo y está
dentro del rango del formato, que es de 2 a 4 segundos).

**Plano de cobertura** — una cara que reacciona, una mano, un objeto, un plano
general de paisaje. Es **imagen fija con movimiento de cámara** añadido en el
montaje. Dura lo que haga falta: **1,5 a 3 segundos**. Cuesta una fracción de un
video y se genera en segundos.

**Proporción objetivo: 70% de acción, 30% de cobertura**, medida en número de
planos. Es la proporción real del referente de supervivencia.

### 11.2 Reglas del desglose

- El desglose lo hace el director **solo, sin pantalla de aprobación**. El dueño
  no quiere aprobar planos ni listas: solo puede pedir que se rehaga el desglose
  de una escena concreta.
- Cada plano queda **anclado a un fragmento literal y ordenado** de la escena,
  para que no pueda adelantar acontecimientos.
- Dentro de una escena se conserva entre tomas: posición, ropa, lesiones, objetos
  y estado físico.
- Cada plano recibe un **peso editorial de 1 a 5**. El audio de la escena se
  reparte proporcionalmente a esos pesos, de modo que un detalle o una reacción
  rápida duren menos que la frase o la acción principal. Sin esto, el audio se
  divide en tercios iguales y el montaje queda mecánico.
- Como proxy antes de generar la voz: menos de 18 palabras admite 1 plano, de 18
  a 35 exige al menos 2, y 36 o más exige 3.

### 11.3 Los trucos de encubrimiento

Esto va **dentro del desglose**, no es decoración. Los dos referentes lo hacen
constantemente y es la razón por la que no se notan los fallos:

- **Cortar antes de que el movimiento termine.** Cuando un plano tiene movimiento
  complejo de manos o de cuerpo entero, el director corta antes del final y pone
  a continuación un primer plano de reacción. Las manos deformadas son el fallo
  más frecuente de estos modelos y así no se llegan a ver.
- **Primer plano de reacción como comodín.** Es barato (es cobertura), tapa
  cualquier fallo del plano anterior y además refuerza el paso 3 del ciclo.
- **El Sistema encima de las transiciones difíciles**, cuando el proyecto lo tiene.
- **Cartela de texto y plano general de paisaje** para los saltos de tiempo. Así
  se reinicia la escena sin tener que generar una transición.

---

## 12. Imágenes

- Modelo por defecto `gemini-3.1-flash-image`; `gemini-3-pro-image` disponible en
  el selector, de último, para elegirlo a mano.
- Una imagen por plano, en el formato del proyecto (9:16 o 16:9).
- Conmutación de región ante 429: `us-central1` → `europe-west4` → `us-east4`.
- Las referencias que acompañan al prompt son: la ficha del personaje (con su
  contrato), el plano anterior de la cadena (con el contrato de continuidad) y,
  si existe, la referencia del escenario.
- **Ningún error de referencia genera en silencio sin identidad.** Si la
  referencia no se pudo adjuntar, se dice y no se genera.
- Un **bloqueo de seguridad no se reintenta** (ver 18.2).

---

## 13. Video

### 13.1 Parámetros

- Modelo por defecto `veo-3.1-lite-generate-001`, con los otros dos en el selector.
- **Duración 4 segundos** para los planos de acción. Veo acepta solo 4, 6 u 8.
- Se arranca con `:predictLongRunning` y se consulta con `fetchPredictOperation`.
- `storageUri` apuntando al bucket, para que el MP4 no pase por el endpoint.
- La operación iniciada se guarda: si el dueño recarga la página, la consulta
  continúa.
- Se devuelve una URL firmada de 7 días para poder verlo sin bucket público.

### 13.2 El prompt de video

Son varios bloques y el orden importa. Textos literales en inglés:

**Actuación** — la regla que evita el fallo de mirar a cámara:

```
PERFORMANCE — CRITICAL: the characters are acting inside the scene and stay in
the story — never posing, never turning toward the lens, never making eye
contact with the camera, never addressing the viewer. The angle on them is
ALREADY set by the first frame; keep that relationship to them for the whole clip.
```

**Encuadre bloqueado** — cuando el director no pidió movimiento de cámara:

```
FRAMING — LOCKED: the first frame sets the camera position, the lens and the shot
size for the ENTIRE clip. Hold that exact framing from first frame to last: same
distance to the subject, same lens, same shot size, same headroom, same amount of
the room visible. The camera sits on a locked tripod unless the SHOT MOTION line
names a camera move — if it names none, there is no zoom, no push-in, no pull-back
and no reframing at any point.
```

**Estilo** — sin nombrar el contrato de imagen:

```
STYLE — ABSOLUTELY MANDATORY: preserve the exact rendering of the first frame,
pixel for pixel in look. Do not restyle it, do not turn it into animation,
illustration or a videogame cinematic while moving.
```

**Movimiento** — con la acción escrita por el director, o conservador si no la hay.

**Escenario** — solo la primera frase de la descripción del escenario, para que
sepa si es interior o exterior, sin darle sustantivos nuevos que dibujar que la
imagen no contenga. Este fallo es real: sin esta línea el modelo infería la
geografía de la imagen y lo único que leía era "hay lluvia".

**Lección importante sobre el orden**: en el estudio de anime hubo una regla que
decía a la vez "no mires a la cámara, usa ángulos laterales" y "no muevas la
cámara". En video el ángulo ya está fijado por el primer fotograma, así que la
única forma de obedecer la primera era mover la cámara, peleando con la segunda,
y ganaba la que estaba escrita más cerca del final. De ahí venía la deriva a
primer plano. **Dos reglas que se contradicen producen el comportamiento de la
última.**

### 13.3 El audio del video

Aquí está la solución al problema de los efectos de sonido, que es lo que el
dueño no sabía cómo resolver.

**Veo genera el audio junto al video, mirando el video que él mismo está
creando.** Si se le pide audio **sin voces**, lo que devuelve es el ambiente y
los efectos de la acción, sincronizados al milisegundo. Nadie puede sincronizar
un golpe mejor que el modelo que generó el golpe.

Regla de audio en el prompt (literal, en inglés), adaptada de la que ya usa el
estudio de anime:

```
AUDIO: NO voice dialogue, NO narration, NO singing, NO human speech of any kind.
ONLY the diegetic sound of this shot: ambience of the location and the sound
effects of the action actually visible in frame.
```

Consecuencias y límites:

- Resuelve la precisión que no se lograba generando efectos aparte y subiéndolos
  a mano.
- **Riesgo aceptado por el dueño**: a veces Veo cuela una voz de fondo que nadie
  pidió. No hay forma de garantizarlo al cien por cien. Si pasa en un plano, se
  regenera ese plano y no pasa nada. No se construye separación de voz ni
  detección automática.
- Los **planos de cobertura no tienen audio propio** porque son imágenes. Para
  esos se usa una cama de ambiente por escenario (ver 14.3).

---

## 14. Audio

### 14.1 Voces — Gemini TTS

- Las voces se piden a Google, no se escriben en el código. El estudio de anime
  tenía una lista a mano y estaba mal: ofrecía una voz que no existe y solo cuatro
  de las muchas disponibles. **Un endpoint pregunta qué voces puede usar este
  proyecto.**
- Gemini TTS tiene 30 voces. Los identificadores llevan prefijo `gemini_`.
- Gemini TTS **no tiene control numérico de expresión**: el registro se fija con
  una instrucción de estilo en texto. Hay tres registros definidos (plana, normal,
  dramática) y se escriben como instrucción, no como parámetro.
- En las voces de Cloud TTS tipo Chirp **no se envían los parámetros de tono y
  velocidad**: con ellos la voz sale metálica y hueca. El ritmo tiene que venir de
  la voz misma.

### 14.2 La deriva de tono, y cómo se contiene

Problema conocido del dueño, arrastrado de varios proyectos: **Gemini TTS cambia
el tono de voz en cada llamada** y nunca lo ha conseguido arreglar con prompts.

Defensa que ya funciona en su estudio y que hay que replicar entera:

1. **Una llamada por escena, no por línea.**
2. **Los dos hablantes de una escena van en la misma llamada.**
3. **Nunca se regenera una línea sola.** Si hay que rehacerla, se rehace la escena.
4. **Instrucción de estilo idéntica** en todas las llamadas del proyecto.
5. **`loudnorm` en el montaje** para igualar volumen entre escenas.

### 14.3 Ambiente para los planos de cobertura

Una cama de ambiente por escenario, generada una vez y reutilizada en bucle
mientras duren los planos de cobertura de ese escenario. Se distingue del efecto
puntual:

- **Efecto puntual** — tiene un instante exacto de contacto (un golpe, un paso,
  una puerta). Máximo 15 segundos. En este proyecto los genera Veo dentro del
  clip; no se suben archivos.
- **Ambiente** — lecho continuo (lluvia, mar, selva, ciudad) del que basta un
  bucle corto que la aplicación repite.

**Regla heredada y obligatoria: una voz humana NUNCA es un efecto de sonido.** Un
grito, un gemido, una respiración, un suspiro, una risa, un llanto o un jadeo son
diálogo del personaje, generados con su propia voz en Gemini TTS. Nunca un
archivo de efecto.

### 14.4 Música — Lyria

- Modelo `lyria-002`. Devuelve un clip instrumental de unos 30 segundos.
- **El brief se escribe en inglés.** Lyria rechaza la petición entera con
  "Unsupported language detected" si el prompt va en español.
- Una pista por acto, con el brief escrito por el director a partir de la
  identidad musical de la biblia y de lo que ocurre en ese acto.
- Banda sonora continua, como en los dos referentes: oscila entre tensión,
  aventura y fanfarria de triunfo según la escena.

---

## 15. Subtítulos

- **Alineación forzada con Speech-to-Text.** Ya se sabe lo que se dijo (la
  aplicación generó el diálogo); lo que se pide son los **tiempos de cada
  palabra**.
- Modelo `latest_long`, idioma `es-US`.
- Respaldo proporcional por escena si la transcripción falla.
- **Quemados en el video**, centrados en el tercio inferior, tipografía clara con
  fondo contrastado. Así están en los dos referentes.
- Se cortan en los signos de puntuación finales (`.`, `!`, `?`, `…`) y se reparten
  dentro de los límites de su escena.

---

## 16. Montaje

Cloud Run Job con FFmpeg. El montador recibe un manifiesto y no conoce ningún
archivo por su nombre.

### 16.1 Reglas de montaje heredadas

Todas corrigen un fallo real:

- **Cada escena dura exactamente su narración.** La música se mezcla y los
  subtítulos se queman.
- **Los clips se retiman a la duración de su toma, sin bucle.** El montador mide
  la duración real del clip (Veo no siempre devuelve los segundos pedidos),
  calcula `R = hueco ÷ duración real` y aplica `setpts` con ese factor. Un plano
  de 3 segundos sacado de un clip de 4 corre un poco más rápido.
- **Se ajusta la velocidad, no se recorta.** Recortar el final tira el fotograma
  de enganche; repetir el clip lo devuelve a su primer fotograma, que es peor.
- La ralentización automática admite hasta 3×. Lo que exceda se sostiene en el
  último fotograma con `tpad=stop_mode=clone`.
- **El montador nunca usa el mismo clip dos veces seguidas** para rellenar tiempo.
- **Las imágenes fijas reciben movimiento de cámara visible**: `zoompan` con
  escalado y recorte al doble de resolución para que el movimiento no pixele.
  Esto es lo que convierte un plano de cobertura en un plano vivo.
- `loudnorm` para igualar el volumen de las voces entre escenas.
- Los **cortes son secos por defecto**. Solo se interpola entre fotogramas cuando
  una acción necesita continuidad física.

### 16.2 La capa del Sistema en el montaje

Cuando el proyecto tiene Sistema activo, sus paneles, contadores y notificaciones
se dibujan con FFmpeg sobre el video montado, en los planos que marcó el guion.

### 16.3 Entrega

- MP4 final en el bucket, descargable con URL firmada de corta vida.
- **Export ZIP** con todo el material por si prefiere montar fuera: imágenes,
  videos, audios, música, subtítulos `.srt` y la dirección creativa.

---

## 17. Episodios encadenados

- Terminado un episodio, un botón **Continuar** genera el siguiente.
- El episodio nuevo conserva: personajes con sus fichas e imágenes, escenarios,
  identidad musical, biblia de la serie y los hilos que quedaron abiertos.
- **Un episodio regenerado no hereda las imágenes, voces ni videos del anterior.**
  Esto fue un fallo real en el estudio de anime: al regenerar un episodio, el
  nuevo arrastraba el material del viejo.
- Numeración visible y continua. El dueño puede generar cuatro episodios seguidos
  y montarlos juntos como película.
- Cada episodio es una unidad de montaje independiente, con su propio MP4.

---

## 18. Cola, cuotas y errores

Esta sección es la que más tiempo ahorra. Todo esto está resuelto en el estudio de
anime y volver a descubrirlo cuesta días.

### 18.1 Nada en paralelo

**La cuenta del dueño es nueva y tiene cuotas bajas.** Google limita peticiones
por minuto en todo: texto, imagen, video, voz.

- **Un elemento a la vez.** Termina uno, arranca el siguiente, automáticamente.
- Esto aplica a **todas** las tandas: todas las imágenes, todos los videos, todas
  las voces.
- Nunca se lanzan varias peticiones del mismo tipo a la vez, por tentador que sea.

### 18.2 Un 429 no es un fallo: es una espera

Google devuelve 429 (`RESOURCE_EXHAUSTED`) cuando se le pide más rápido de lo que
su cuota permite. Tratarlo como error hace que una tanda de 40 imágenes se caiga
por la mitad y haya que relanzarla a mano averiguando cuáles faltan.

**Se espera y se reintenta la misma petición.** Escaleras de espera, en segundos,
tal como están hoy:

- **Texto:** 20, 45, 90, 150, 240
- **Imagen y video:** 60, 120, 180, 240, 300

Durante la espera, la pantalla dice cuánto falta. El último intento no espera: no
hay nada después que aprovechara la espera.

### 18.3 Un bloqueo NO es una cuota

Confundirlos sale caro: **reintentar un prompt bloqueado lo vuelve a bloquear
ocho veces, y cada intento gasta cuota de verdad.**

**Se mira primero si es bloqueo, y solo si no lo es se mira cuota.**

Un bloqueo se reconoce por las palabras `bloquead`, `blocked`, `safety`,
`prohibited`, `recitation`. Una cuota, por `429`, `resource_exhausted`,
`exhausted`, `quota`, `rate limit`, `sin capacidad`.

Cuidado con las coincidencias demasiado amplias: buscar la palabra "resource" a
secas casaba con cualquier mensaje que la llevara.

Un prompt bloqueado **sale a la primera**: esperar cinco minutos no lo desbloquea.
Se dice en pantalla y se deja que el dueño cambie el plano.

### 18.4 El límite de 60 segundos del endpoint

Si una petición de texto es demasiado lenta para los 60 segundos, **el llamador
debe hacerla más pequeña** (menos escenas por bloque). Reenviarla igual la repite
y vuelve a fallar.

### 18.5 Comportamiento de las tandas

- **Se salta lo que ya está hecho.** Referencias, imágenes, audios, música y
  videos ya terminados se omiten al continuar una tanda.
- **Un elemento que falla no tumba la tanda.** Se cuenta, se sigue, y al final se
  informa de cuántos se generaron, cuántos ya existían y cuántos fallaron.
- **Botón de detener que corta de verdad**, incluso en mitad de una espera de
  cinco minutos. No se deja al dueño mirando una barra parada.
- Los borradores de generación se guardan para cualquier duración, de modo que una
  tanda interrumpida se pueda reanudar.

### 18.6 Lecturas y escrituras

- **Una lectura fallida no equivale a un recurso que nunca se generó.** Si no se
  pudo leer, se dice; no se asume vacío ni se regenera encima.
- **Una lectura fallida no purga otras copias** ni anuncia éxito.
- Saber **si** algo fue generado no debe costar su descarga: se comprueba la
  existencia, no se baja el archivo.

---

## 19. Botones y modos de generación

### 19.1 Por plano

Cada plano tiene, visibles:

- **Generar imagen** — genera o regenera la imagen de ese plano.
- **Generar video** — genera o regenera el clip de ese plano.

Lo generado queda en uso de inmediato. Sin aprobar.

### 19.2 En lote

Arriba de la lista:

- **Generar todas las imágenes** — recorre todos los planos que no tengan imagen,
  uno por uno.
- **Generar todos los videos** — recorre todos los planos de acción que no tengan
  clip, uno por uno.

Las dos tandas respetan íntegramente la sección 18.

### 19.3 Revisión

El dueño revisa **después**, mirando el resultado, y manda a regenerar lo que
salió mal con el botón del plano. No hay pantalla de aprobación en ningún punto
del recorrido.

---

## 20. Interfaz

El dueño conoce y quiere conservar la organización de su estudio de anime. Esto no
es una preferencia estética: es lo que le permite trabajar rápido. Regla U010 de
su propio proyecto: *conservar el diseño incluye la organización y los controles
conocidos, no solo la paleta*.

### 20.1 Organización

- **Proyectos** — lista compacta que se abre desde el encabezado.
- **Navegación inferior** con cuatro áreas:
  - **Historia** — el único formulario de creación, las tres ideas generadas, el
    universo y el guion.
  - **Personajes** — fichas de personajes, y también escenarios y objetos.
  - **Escenas** — los planos con sus imágenes y videos visibles, la voz junto al
    texto, y la música y el ambiente en su apartado.
  - **Exportar** — montaje final, descarga y ZIP.
- Las referencias y las tomas se muestran **directamente**. El historial y los
  ajustes avanzados van plegados.
- Una acción principal por contexto.
- **No se muestran JSON ni identificadores** como instrucciones al usuario. Las
  etiquetas llevan nombres y estados comprensibles en español.

### 20.2 Diseño visual

El mismo de su estudio: fondo azul oscuro, magenta, cian y rosa, sus tipografías,
tarjetas con brillo, degradados, estrellas y cometas, y sus transiciones. Se
respeta la preferencia del dispositivo de reducir movimiento.

### 20.3 Robustez de la interfaz

Fallos reales de su proyecto que no hay que repetir:

- **El formulario de creación apareció tres veces** porque las notificaciones
  concurrentes de la sesión no compartían un único montaje. Los redibujados se
  serializan.
- **Un refresco del token no debe reconstruir ni borrar lo que se está
  escribiendo.**
- **Un proyecto creado conserva su identificador**; un reintento abre ese
  registro en vez de crear otro. Ante una respuesta desconocida, se revisa la
  lista antes de crear nada.
- **Abrir una pantalla solo lee recursos, nunca genera.**
- **Que el nombre aparezca en la lista no es haber recuperado el proyecto.** Hay
  que abrir el contenido real sin regenerarlo.
- Un título vacío se identifica como "Drama sin título", no se deja en blanco.
- La confirmación de carga espera al renderizado real de personajes y escenas.

---

## 21. Almacenamiento

- **El bucket es la única fuente de verdad.** Manifiestos de proyecto, guiones,
  personajes y estado.
- Carpeta propia dentro del bucket: `GCS_PREFIX`, por defecto `drama-studio`.
- Los medios suben **directamente desde el navegador** con URLs firmadas V4 de
  tipo PUT. Un episodio lleva cientos de imágenes más audio, música y subtítulos;
  nada de eso puede pasar por un endpoint serverless.
- Los MP4 se alcanzan con URLs firmadas de corta vida, no con enlaces guardados.
- `localStorage` e IndexedDB son caché del dispositivo. Se limpia la caché de
  proyectos inactivos.
- La lista de proyectos se reconstruye desde el bucket.

---

## 22. Lo que NO se debe construir

Resumen, por si algo se pasó por alto:

- Pantallas, estimaciones o avisos de coste.
- Botones de aprobación de imágenes, videos o cualquier otra cosa.
- Botones de Cloud Shell o paneles de instalación dentro de la aplicación.
- Sustitución automática de un modelo por otro.
- Narrador que cuente la historia (solo la voz del Sistema, cuando aplique).
- La capa del Sistema en historias que no son de sistema.
- Generación en paralelo de nada.
- Reintentos de prompts bloqueados por seguridad.
- Nada bilingüe: solo español.
- Efectos de sonido subidos a mano.
- Encadenado de fotogramas extraídos de un video generado (ver nota al final).
- Pantallas que solo funcionen en escritorio.

---

## 23. Criterios de aceptación

Una versión está lista cuando:

**Automático**

- Todo el JavaScript y el HTML parsean; los scripts de instalación pasan `bash -n`.
- El guion de montaje generado es un shell válido.
- Existen los dos formatos de pantalla, 9:16 y 16:9.
- Están los 21 géneros, los 23 subgéneros y las 6 demografías.
- Un 429 de Vertex usa espera y reintento central, no falla.
- Un bloqueo de seguridad no se reintenta nunca.
- Ninguna tanda lanza dos peticiones del mismo tipo a la vez.
- Las tandas omiten lo ya generado.
- Las operaciones de Veo iniciadas sobreviven a una recarga.
- No existe ningún botón de aprobar.
- No existe ninguna pantalla de coste.
- El contrato de estilo semirrealista es el predeterminado y no se puede sustituir.
- Ningún error de referencia genera en silencio sin identidad.
- El montador no usa el mismo clip dos veces seguidas.
- Los clips se retiman sin bucle; las imágenes fijas reciben movimiento de cámara.

**Prueba creativa mínima**

Antes de producir 30 minutos, generar una prueba de **3 minutos** con el mismo
motor y comprobar:

- La apertura tiene conflicto visible en los primeros 15 segundos.
- Hay al menos dos ciclos completos de retención, con su reacción y su recompensa.
- El protagonista mantiene la misma cara en todos los planos.
- Ningún personaje mira a la cámara.
- El resultado se ve semirrealista cinematográfico, no ilustración ni videojuego.
- Los planos de acción duran 4 segundos y los de cobertura entre 1,5 y 3.
- Los efectos de sonido van sincronizados con lo que ocurre en pantalla.
- No se cuela ninguna voz en el audio nativo de los clips.
- Los subtítulos están alineados con lo que se oye.
- La prueba se completó íntegra desde el iPhone.

---

## Nota final: el encadenado de fotogramas

El estudio de anime pasa a Veo la imagen fija del plano siguiente como último
fotograma, para que el clip termine donde empieza el siguiente. **En este proyecto
no se usa.**

Dos razones. La primera es que con planos de 4 segundos y cortes secos no hace
falta: el formato corta, no empalma. La segunda es que el dueño no tiene evidencia
de que funcione bien y hay motivos documentados para dudarlo.

Y queda prohibido lo otro, que es distinto y peor: **extraer el último fotograma
del MP4 que devolvió Veo y usarlo como primer fotograma del clip siguiente.** Ese
fotograma sale casi siempre con desenfoque de movimiento, ojos cerrados o deriva
de composición, y el error se acumula clip a clip. No se implementa en ninguna
variante.

Si en algún momento se quiere continuidad real entre dos planos, el camino es la
**función nativa de extensión de video de Veo**, que continúa un video a partir
de su último segundo sin que nadie extraiga fotogramas. Está disponible en Vertex
AI. No entra en esta primera versión, y antes de usarla hay que comprobar si
funciona con la variante Lite, que es la que el proyecto usa por defecto.
