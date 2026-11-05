// ════════════════════════════════════════════════════════════════
// HOJA DE MONTAJE — de ella salen a la vez el guion de FFmpeg y la lista de
// descargas (sección 3). El navegador manda una hoja con DATOS (rutas del
// proyecto, duraciones, textos); el guion lo escribe el servidor. Nunca se
// ejecuta una orden escrita en el navegador: los nombres de archivo del
// guion los pone este código y los textos (subtítulos, paneles del Sistema)
// viajan como archivos, no dentro del guion.
//
// Reglas de montaje (sección 16.1), cada una corrige un fallo real:
//  · Cada escena dura exactamente su narración: la hoja ya trae los
//    tiempos de cada plano repartidos por su peso.
//  · Los clips se RETIMAN a la duración de su toma, sin bucle: se mide la
//    duración real (Veo no siempre da los segundos pedidos), R = hueco ÷
//    duración y setpts con ese factor. Ralentizar admite hasta 3×; lo que
//    sobre se sostiene en el último fotograma (tpad, stop_mode=clone).
//  · Se ajusta la velocidad, no se recorta.
//  · Nunca el mismo clip dos veces seguidas para rellenar: cada plano usa
//    su propio clip o su propia imagen.
//  · Las imágenes fijas reciben movimiento de cámara visible (zoompan a
//    doble resolución para que no pixele).
//  · loudnorm iguala las voces; cortes secos; la música va por debajo.
//  · Capa del Sistema (16.2): sus paneles se dibujan en los planos que
//    marcó el guion.
//  · SIN subtítulos quemados en el video final (decisión del dueño: los
//    pone en CapCut). Los subtítulos con tiempos siguen viajando como
//    archivo en el ZIP (subtitulos.srt), nunca quemados en el montaje.
// ════════════════════════════════════════════════════════════════
const { ErrorEstudio } = require('./errores');
const medios = require('./medios');

const FPS = 30;
const FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const num = (v, min, max, que) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ErrorEstudio(`La hoja de montaje trae un valor no válido en ${que}.`, { estado: 400, tipo: 'peticion' });
  return n;
};
const f3 = n => Number(n).toFixed(3);
const pad = (n, l = 3) => String(n).padStart(l, '0');

// Envuelve el texto de un panel en líneas cortas (drawtext no parte líneas).
// La música de Lyria 3 Pro llega en MP3; la de antes, en WAV.
const extMusica = ruta => (/\.mp3$/i.test(ruta) ? 'mp3' : 'wav');

function envolver(texto, ancho) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).replace(/\s+/g, ' ').trim().split(' ')) {
    if ((actual + ' ' + palabra).trim().length > ancho && actual) { lineas.push(actual); actual = palabra; } else actual = (actual + ' ' + palabra).trim();
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 5).join('\n');
}

const tiempoSrt = s => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sg = Math.floor(ms / 1000) % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(sg, 2)},${pad(ms % 1000)}`;
};
function srt(subtitulos) {
  return subtitulos.map((s, i) => `${i + 1}\n${tiempoSrt(s.inicio)} --> ${tiempoSrt(s.fin)}\n${s.texto}\n`).join('\n');
}

// Comprueba la hoja que llega del navegador y la deja limpia.
function validar(id, h) {
  const modo = h?.modo === 'zip' ? 'zip' : 'video';
  const episodio = Math.round(num(h?.episodio, 1, 999, 'el episodio'));
  const formato = h?.formato === '16:9' ? '16:9' : '9:16';
  const lista = (v, max, que) => {
    const a = Array.isArray(v) ? v : [];
    if (a.length > max) throw new ErrorEstudio(`La hoja de montaje trae demasiados elementos en ${que}.`, { estado: 400, tipo: 'peticion' });
    return a;
  };
  const texto = (v, max) => String(v ?? '').replace(/\r/g, '').slice(0, max);
  if (modo === 'zip') {
    const archivos = lista(h.archivos, 4000, 'los archivos').map(a => {
      const nombre = String(a?.nombre || '');
      if (!/^[a-z0-9][a-z0-9/_.-]{1,140}$/.test(nombre) || nombre.includes('..')) throw new ErrorEstudio('Un nombre de archivo del ZIP no es válido.', { estado: 400, tipo: 'peticion' });
      return { ruta: medios.exigirDelProyecto(id, a?.ruta), nombre };
    });
    const textos = lista(h.textos, 20, 'los textos').map(t => {
      const nombre = String(t?.nombre || '');
      if (!/^[a-z0-9][a-z0-9_.-]{1,60}\.(txt|srt|json)$/.test(nombre)) throw new ErrorEstudio('Un nombre de texto del ZIP no es válido.', { estado: 400, tipo: 'peticion' });
      return { nombre, contenido: texto(t?.contenido, 400000) };
    });
    // Voces para el audio único del paquete: en orden, con su inicio y su
    // duración. No van como archivos sueltos en el ZIP; el montador las
    // mezcla en un solo voces.wav (ver construir, modo zip).
    const voces = lista(h.voces, 4000, 'las voces').map((v, i) => ({
      ruta: medios.exigirDelProyecto(id, v?.ruta),
      inicio: num(v?.inicio, 0, 4 * 3600, `el inicio de la voz ${i + 1}`),
      segundos: num(v?.segundos, 0, 3600, `la duración de la voz ${i + 1}`),
    }));
    // Diálogos sueltos recortados al ras: cada línea, con su tramo y su
    // desde/hasta dentro de él (hojas antiguas no los traen: opcionales).
    const dialogos = lista(h.dialogos, 4000, 'los diálogos').map((d, i) => {
      const nombre = String(d?.nombre || '');
      if (!/^[a-z0-9][a-z0-9/_.-]{1,140}$/.test(nombre) || nombre.includes('..')) throw new ErrorEstudio('Un nombre de diálogo del ZIP no es válido.', { estado: 400, tipo: 'peticion' });
      const desde = num(d?.desde, 0, 3600, `el inicio del diálogo ${i + 1}`);
      const hasta = num(d?.hasta, 0, 3600, `el fin del diálogo ${i + 1}`);
      if (hasta <= desde) throw new ErrorEstudio(`El diálogo ${i + 1} del ZIP no tiene duración.`, { estado: 400, tipo: 'peticion' });
      return { ruta: medios.exigirDelProyecto(id, d?.ruta), desde, hasta, nombre };
    });
    if (!archivos.length && !textos.length) throw new ErrorEstudio('No hay nada que meter en el ZIP.', { estado: 400, tipo: 'peticion' });
    return { modo, episodio, archivos, textos, voces, dialogos };
  }
  const planos = lista(h.planos, 3000, 'los planos').map((p, i) => ({
    tipo: p?.tipo === 'video' ? 'video' : 'imagen',
    ruta: medios.exigirDelProyecto(id, p?.ruta),
    duracion: num(p?.duracion, 0.3, 60, `la duración del plano ${i + 1}`),
    sistema: texto(p?.sistema, 300).trim(),
  }));
  if (!planos.length) throw new ErrorEstudio('No hay planos que montar.', { estado: 400, tipo: 'peticion' });
  const total = planos.reduce((n, p) => n + p.duracion, 0);
  if (total > 4 * 3600) throw new ErrorEstudio('El episodio es demasiado largo para montarlo de una vez.', { estado: 400, tipo: 'peticion' });
  const voces = lista(h.voces, 4000, 'las voces').map((v, i) => ({ ruta: medios.exigirDelProyecto(id, v?.ruta), inicio: num(v?.inicio, 0, total, `el inicio de la voz ${i + 1}`) }));
  const musica = lista(h.musica, 200, 'la música').map((m, i) => ({ ruta: medios.exigirDelProyecto(id, m?.ruta), inicio: num(m?.inicio, 0, total, `el inicio de la música ${i + 1}`), duracion: num(m?.duracion, 1, total + 1, `la duración de la música ${i + 1}`) }));
  const subtitulos = lista(h.subtitulos, 20000, 'los subtítulos').map((s, i) => ({ inicio: num(s?.inicio, 0, total + 5, `el subtítulo ${i + 1}`), fin: num(s?.fin, 0, total + 5, `el subtítulo ${i + 1}`), texto: texto(s?.texto, 300).trim() })).filter(s => s.texto && s.fin > s.inicio);
  return { modo, episodio, formato, planos, voces, musica, subtitulos, total };
}

// Guion de FFmpeg + descargas + archivos de texto del trabajo.
// carpeta: ruta del trabajo en el bucket (sin gs://). Devuelve
// { script, descargas: [[origen, destino]], textos: [[ruta, contenido]], archivo }.
function construir(h, { bucket, carpeta }) {
  const gs = r => `gs://${bucket}/${r}`;
  const descargas = [];
  const textos = [];
  if (h.modo === 'zip') {
    for (const a of h.archivos) descargas.push([gs(a.ruta), 'material/' + a.nombre]);
    for (const t of h.textos) {
      textos.push([`${carpeta}/textos/${t.nombre}`, t.contenido]);
      descargas.push([gs(`${carpeta}/textos/${t.nombre}`), 'material/textos/' + t.nombre]);
    }
    // Audio único de voces: cada tramo normalizado y colocado en su
    // instante, mezclado en material/voces.wav. Los tramos sueltos NO
    // entran en el ZIP; solo entra este audio único, en orden.
    const voces = h.voces || [];
    const totalVoces = voces.reduce((n, v) => Math.max(n, v.inicio + v.segundos), 0);
    for (const [i, v] of voces.entries()) descargas.push([gs(v.ruta), `a/v${pad(i + 1, 4)}.wav`]);
    const vocesFiltro = voces.map((v, i) => `[${i}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.inicio * 1000)}:all=1[v${i}]`).join(';');
    const vocesEntradas = voces.map((_, i) => `-i a/v${pad(i + 1, 4)}.wav`).join(' ');
    // Diálogos sueltos: se cortan de su tramo (ya descargado como voz) y
    // se les quita el silencio del principio y del final (recorte al ras:
    // silenceremove al derecho y al revés), con la misma normalización
    // que el audio único, y van a material/dialogos/ dentro del ZIP.
    const indiceVoz = new Map(voces.map((v, i) => [v.ruta, i]));
    const lineasDialogos = (h.dialogos || []).map(d => {
      const i = indiceVoz.get(d.ruta);
      if (i === undefined) return '';
      const filtro = `atrim=start=${f3(d.desde)}:end=${f3(d.hasta)},asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB,areverse`;
      return `ffmpeg -nostdin -y -i a/v${pad(i + 1, 4)}.wav -af "${filtro}" -ar 48000 -ac 2 "material/${d.nombre}"`;
    }).filter(Boolean);
    const archivo = `material-ep${pad(h.episodio, 2)}.zip`;
    const script = `#!/usr/bin/env bash
set -Eeuo pipefail
${voces.length ? `ffmpeg -nostdin -y ${vocesEntradas} -filter_complex "${vocesFiltro};${voces.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voces.length}:normalize=0:dropout_transition=0,apad,atrim=0:${f3(totalVoces)}[o]" -map "[o]" -ar 48000 -ac 2 material/voces.wav
` : ''}${lineasDialogos.length ? `mkdir -p material/dialogos
${lineasDialogos.join('\n')}
` : ''}cd material
zip -r -0 -q "../${archivo}" .
`;
    return { script, descargas, textos, archivo };
  }

  const [W, H] = h.formato === '16:9' ? [1920, 1080] : [1080, 1920];
  const ancho = h.formato === '16:9' ? 40 : 24;
  const panel = { x: Math.round(W * 0.07), y: Math.round(H * 0.1), w: Math.round(W * 0.86), h: Math.round(H * (h.formato === '16:9' ? 0.26 : 0.16)), fs: Math.round(H * (h.formato === '16:9' ? 0.042 : 0.024)) };
  const lineas = [];
  h.planos.forEach((p, i) => {
    const n = pad(i + 1, 4);
    const ext = p.tipo === 'video' ? 'mp4' : (/\.jpe?g$/i.test(p.ruta) ? 'jpg' : 'png');
    descargas.push([gs(p.ruta), `m/p${n}.${ext}`]);
    let sis = '-';
    if (p.sistema) {
      textos.push([`${carpeta}/t/s${n}.txt`, envolver(p.sistema, ancho)]);
      descargas.push([gs(`${carpeta}/t/s${n}.txt`), `t/s${n}.txt`]);
      sis = `t/s${n}.txt`;
    }
    lineas.push(p.tipo === 'video'
      ? `segmento_video m/p${n}.${ext} seg/s${n}.mp4 ${f3(p.duracion)} ${sis}`
      : `segmento_imagen m/p${n}.${ext} seg/s${n}.mp4 ${f3(p.duracion)} ${i % 4} ${sis}`);
  });
  h.voces.forEach((v, i) => descargas.push([gs(v.ruta), `a/v${pad(i + 1, 4)}.wav`]));
  h.musica.forEach((m, i) => descargas.push([gs(m.ruta), `a/m${pad(i + 1)}.${extMusica(m.ruta)}`]));
  // Sin episodio.srt en el montaje final: no hay nada que quemar. Los
  // subtítulos con tiempos van solo en el ZIP (los genera el navegador
  // a partir de esta misma hoja de voces y tiempos).

  const T = f3(h.total);
  // Voces: cada tramo normalizado (loudnorm) y colocado en su instante.
  const vocesFiltro = h.voces.map((v, i) => `[${i}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.inicio * 1000)}:all=1[v${i}]`).join(';');
  const vocesEntradas = h.voces.map((_, i) => `-i a/v${pad(i + 1, 4)}.wav`).join(' ');
  // Música: cada pista en bucle durante su acto, con fundidos.
  const musicaFiltro = h.musica.map((m, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f3(m.duracion)},afade=t=in:d=1.2,afade=t=out:st=${f3(Math.max(0, m.duracion - 1.5))}:d=1.5,adelay=${Math.round(m.inicio * 1000)}:all=1[m${i}]`).join(';');
  const musicaEntradas = h.musica.map((m, i) => `-stream_loop -1 -i a/m${pad(i + 1)}.${extMusica(m.ruta)}`).join(' ');
  const script = `#!/usr/bin/env bash
# Guion generado por el servidor de Drama AI Studio a partir de la hoja de montaje.
set -Eeuo pipefail
W=${W}; H=${H}; FPS=${FPS}
mkdir -p seg
CODEC="-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r ${FPS} -c:a aac -b:a 160k -ar 48000 -ac 2"

# Capa del Sistema: panel con el texto del guion sobre el plano.
capa_sistema() {
  if [ "$1" = "-" ]; then echo "null"; return; fi
  echo "drawbox=x=${panel.x}:y=${panel.y}:w=${panel.w}:h=${panel.h}:color=0x0A1A3A@0.78:t=fill,drawbox=x=${panel.x}:y=${panel.y}:w=${panel.w}:h=${panel.h}:color=0x37E0FF@0.95:t=5,drawtext=fontfile=${FUENTE}:textfile=$1:fontcolor=0xE8FBFF:fontsize=${panel.fs}:line_spacing=${Math.round(panel.fs * 0.35)}:borderw=2:bordercolor=0x37E0FF@0.5:x=(w-text_w)/2:y=${panel.y}+(${panel.h}-text_h)/2"
}

# Plano de acción: el clip se retima a su hueco, sin bucle ni recorte.
segmento_video() {
  local in="$1" out="$2" d="$3" sis="$4"
  local real f tempo audio
  real=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  f=$(awk -v d="$d" -v r="$real" 'BEGIN{ x=d/r; if (x>3) x=3; printf "%.5f", x }')
  tempo=$(awk -v f="$f" 'BEGIN{ printf "%.5f", 1/f }')
  audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | awk 'NR==1')
  local vf="setpts=\${f}*PTS,tpad=stop_mode=clone:stop_duration=600,scale=\${W}:\${H}:force_original_aspect_ratio=increase,crop=\${W}:\${H},fps=\${FPS},$(capa_sistema "$sis"),format=yuv420p"
  if [ -n "$audio" ] && awk -v t="$tempo" 'BEGIN{ exit !(t>=0.5 && t<=2.0) }'; then
    ffmpeg -nostdin -y -i "$in" -filter_complex "[0:v]\${vf}[v];[0:a]atempo=\${tempo},aresample=48000,apad[a]" -map "[v]" -map "[a]" -t "$d" $CODEC "$out"
  elif [ -n "$audio" ]; then
    ffmpeg -nostdin -y -i "$in" -filter_complex "[0:v]\${vf}[v];[0:a]aresample=48000,apad[a]" -map "[v]" -map "[a]" -t "$d" $CODEC "$out"
  else
    ffmpeg -nostdin -y -i "$in" -f lavfi -i anullsrc=r=48000:cl=stereo -filter_complex "[0:v]\${vf}[v]" -map "[v]" -map 1:a -t "$d" $CODEC "$out"
  fi
}

# Plano de cobertura: imagen fija con movimiento de cámara visible.
segmento_imagen() {
  local in="$1" out="$2" d="$3" mov="$4" sis="$5"
  local z x y
  case "$mov" in
    0) z="min(zoom+0.0009,1.18)"; x="iw/2-(iw/zoom/2)"; y="ih/2-(ih/zoom/2)";;
    1) z="if(eq(on,0),1.18,max(zoom-0.0009,1.0))"; x="iw/2-(iw/zoom/2)"; y="ih/2-(ih/zoom/2)";;
    2) z="1.12"; x="(iw-iw/zoom)*on/(\${d}*\${FPS})"; y="ih/2-(ih/zoom/2)";;
    *) z="1.12"; x="(iw-iw/zoom)*(1-on/(\${d}*\${FPS}))"; y="ih/2-(ih/zoom/2)";;
  esac
  ffmpeg -nostdin -y -loop 1 -framerate \${FPS} -i "$in" -f lavfi -i anullsrc=r=48000:cl=stereo \\
    -filter_complex "[0:v]scale=$((W*2)):$((H*2)):force_original_aspect_ratio=increase,crop=$((W*2)):$((H*2)),zoompan=z='\${z}':x='\${x}':y='\${y}':d=1:s=\${W}x\${H}:fps=\${FPS},$(capa_sistema "$sis"),format=yuv420p[v]" \\
    -map "[v]" -map 1:a -t "$d" $CODEC "$out"
}

# 1. Cada plano, a su duración exacta.
${lineas.join('\n')}

# 2. Cortes secos: todos los planos, uno detrás de otro, en su orden.
: > lista.txt
for n in $(seq -f '%04g' 1 ${h.planos.length}); do echo "file 'seg/s$n.mp4'" >> lista.txt; done
ffmpeg -nostdin -y -f concat -safe 0 -i lista.txt -c copy planos.mp4

# 3. Voces del episodio (loudnorm por tramo, cada una en su instante).
${h.voces.length ? `ffmpeg -nostdin -y ${vocesEntradas} -filter_complex "${vocesFiltro};${h.voces.map((_, i) => `[v${i}]`).join('')}amix=inputs=${h.voces.length}:normalize=0:dropout_transition=0,apad,atrim=0:${T}[o]" -map "[o]" -ar 48000 -ac 2 voces.wav` : `ffmpeg -nostdin -y -f lavfi -i anullsrc=r=48000:cl=stereo -t ${T} voces.wav`}

# 4. Música por actos, en bucle y con fundidos.
${h.musica.length ? `ffmpeg -nostdin -y ${musicaEntradas} -filter_complex "${musicaFiltro};${h.musica.map((_, i) => `[m${i}]`).join('')}amix=inputs=${h.musica.length}:normalize=0:dropout_transition=0,apad,atrim=0:${T}[o]" -map "[o]" -ar 48000 -ac 2 musica.wav` : `ffmpeg -nostdin -y -f lavfi -i anullsrc=r=48000:cl=stereo -t ${T} musica.wav`}

# 5. Mezcla final (efectos de los clips + voces + música que baja cuando
#    hablan), SIN subtítulos quemados: el video sale limpio y los
#    subtítulos se ponen en CapCut con el subtitulos.srt del ZIP.
ffmpeg -nostdin -y -i planos.mp4 -i voces.wav -i musica.wav -filter_complex \\
  "[1:a]asplit=2[vz][vs];[2:a]volume=0.35[m0];[m0][vs]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[m];[0:a]volume=0.6[sfx];[sfx][vz][m]amix=inputs=3:normalize=0:duration=first[a]" \\
  -map 0:v -map "[a]" -t ${T} -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "episodio-${pad(h.episodio, 2)}.mp4"
`;
  return { script, descargas, textos, archivo: `episodio-${pad(h.episodio, 2)}.mp4` };
}

module.exports = { validar, construir, srt, envolver };
