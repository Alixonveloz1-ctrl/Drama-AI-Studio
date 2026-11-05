// ════════════════════════════════════════════════════════════════
// GOOGLE CLOUD — credenciales y configuración, en un único sitio.
//
// Los archivos de api/_lib/ NO se publican como funciones (Vercel salta
// todo lo que empieza por "_"): son módulos compartidos por los endpoints.
//
// Dos trabajos:
//   1. Convertir GCP_SERVICE_ACCOUNT en credenciales. En el estudio de anime
//      este código estaba copiado en cinco endpoints; aquí vive solo aquí.
//   2. Resolver modelos y regiones. No hay proyecto, bucket, modelo ni región
//      escrito en el código: cada valor sale de una variable de entorno con
//      su valor por defecto, y el proyecto sale SIEMPRE del project_id de la
//      cuenta de servicio. Cambiar de cuenta o esquivar un modelo sin acceso
//      nunca debe exigir tocar código.
// ════════════════════════════════════════════════════════════════
const crypto = require('node:crypto');

// La única lista de CORS del bucket, compartida con el instalador.
// En el estudio de anime había dos listas distintas y un PATCH (que
// reemplaza el array entero) borraba en silencio el permiso de subida:
// la subida moría con un "Load failed" que no señalaba a nada.
const CORS_BUCKET = require('../../comun/cors-bucket.json');

const leer = (nombre, porDefecto) => {
  const valor = String(process.env[nombre] || '').trim();
  return valor || porDefecto;
};

// ─── Modelos permitidos en los selectores (sección 4.1) ───
// El primero de cada lista es el predeterminado. El modelo elegido es el que
// se usa: si falla, se devuelve el error de Google tal cual y NUNCA se cambia
// por otro a espaldas del dueño.
const MODELOS_IMAGEN = ['gemini-3.1-flash-image', 'gemini-3-pro-image'];
const MODELOS_VIDEO = ['veo-3.1-lite-generate-001', 'veo-3.1-fast-generate-001', 'veo-3.1-generate-001'];

// Los modelos Gemini 3.x solo se sirven desde el endpoint "global". Pedirlos
// a una región concreta devuelve un 404 que parece falta de acceso y no lo es.
const UBICACION_IMAGEN_BASE = {
  'gemini-3.1-flash-image': 'global',
  'gemini-3-pro-image': 'global',
};
// Lyria 3 Pro se sirve en global (como en la parte de cortos del estudio de anime).
const UBICACION_MUSICA_BASE = {
  'lyria-3-pro-preview': 'global',
};

function ubicacionesImagen() {
  try {
    const propias = JSON.parse(leer('IMAGE_MODEL_LOCATIONS', '{}'));
    return { ...UBICACION_IMAGEN_BASE, ...(propias && typeof propias === 'object' ? propias : {}) };
  } catch {
    return { ...UBICACION_IMAGEN_BASE };
  }
}
// Un modelo desconocido va a "global": ahí se sirven los modelos de imagen
// Gemini recientes, así que uno nuevo funciona sin publicar código.
function ubicacionImagen(modelo) {
  return ubicacionesImagen()[modelo] || 'global';
}

// Se lee process.env en cada acceso (no al cargar el módulo), así el valor
// resuelto refleja siempre el entorno actual y las pruebas pueden variarlo.
const cfg = {
  get region()          { return leer('GCP_LOCATION', 'us-central1'); },
  get modeloTexto()     { return leer('SCRIPT_MODEL', 'gemini-3.1-pro-preview'); },
  get ubicacionTexto()  { return leer('SCRIPT_LOCATION', 'global'); },
  get modeloImagen()    { return leer('IMAGE_MODEL', MODELOS_IMAGEN[0]); },
  get regionesImagen()  { return leer('IMAGE_REGIONS', 'us-central1,europe-west4,us-east4').split(',').map(s => s.trim()).filter(Boolean); },
  get modeloVideo()     { return leer('VEO_MODEL', MODELOS_VIDEO[0]); },
  // Voz: Chirp 3 HD de Text-to-Speech (decisión del dueño; lo mismo que
  // acabó usando su estudio de anime). SIN motor de respaldo (regla 2.7).
  get idiomaVoz()       { return leer('TTS_LANGUAGE', 'es-US'); },
  get modeloMusica()    { return leer('MUSIC_MODEL', 'lyria-3-pro-preview'); },
  get ubicacionMusica() { return leer('MUSIC_LOCATION', UBICACION_MUSICA_BASE[this.modeloMusica] || this.region); },
  get modeloSubtitulos(){ return leer('STT_MODEL', 'latest_long'); },
  get idiomaSubtitulos(){ return leer('STT_LANGUAGE', 'es-US'); },
  get bucketCrudo()     { return leer('GCS_OUTPUT_BUCKET', ''); },
  get bucket()          { return this.bucketCrudo.replace(/^gs:\/\//, '').replace(/\/+$/, ''); },
  // TODO lo que escribe este estudio vive bajo este prefijo, para poder
  // compartir bucket con otros proyectos sin mezclarse con sus carpetas.
  get prefijo()         { return leer('GCS_PREFIX', 'drama-studio').replace(/^\/+|\/+$/g, '') || 'drama-studio'; },
  get trabajoMontaje()  { return leer('MONTAJE_JOB', 'drama-studio-montage'); },
  get regionMontaje()   { return leer('MONTAJE_REGION', 'us-central1'); },
};

// Tabla para la pantalla "APIs configuradas": cada valor resuelto, la
// variable que lo cambia y si viene de Vercel o es el valor por defecto.
function describirAjustes() {
  const fila = (uso, variable, valor, extra = {}) => ({
    uso, variable, valor, propio: Boolean(String(process.env[variable] || '').trim()), ...extra,
  });
  return [
    fila('Texto: guion, universo y dirección', 'SCRIPT_MODEL', cfg.modeloTexto),
    fila('Región del texto', 'SCRIPT_LOCATION', cfg.ubicacionTexto),
    fila('Imagen (predeterminado)', 'IMAGE_MODEL', cfg.modeloImagen, { opciones: MODELOS_IMAGEN, ubicacion: ubicacionImagen(cfg.modeloImagen) }),
    fila('Regiones de imagen ante un 429', 'IMAGE_REGIONS', cfg.regionesImagen.join(' → ')),
    fila('Región por modelo de imagen', 'IMAGE_MODEL_LOCATIONS', JSON.stringify(ubicacionesImagen())),
    fila('Video (predeterminado)', 'VEO_MODEL', cfg.modeloVideo, { opciones: MODELOS_VIDEO, ubicacion: cfg.region }),
    fila('Región general (video)', 'GCP_LOCATION', cfg.region),
    fila('Voces (Chirp 3 HD): idioma', 'TTS_LANGUAGE', cfg.idiomaVoz),
    fila('Música', 'MUSIC_MODEL', cfg.modeloMusica),
    fila('Región de la música', 'MUSIC_LOCATION', cfg.ubicacionMusica),
    fila('Subtítulos: modelo', 'STT_MODEL', cfg.modeloSubtitulos),
    fila('Subtítulos: idioma', 'STT_LANGUAGE', cfg.idiomaSubtitulos),
    fila('Carpeta propia en el bucket', 'GCS_PREFIX', cfg.prefijo + '/'),
    fila('Montador en Cloud Run', 'MONTAJE_JOB', cfg.trabajoMontaje),
    fila('Región del montador', 'MONTAJE_REGION', cfg.regionMontaje),
  ];
}

// ─── Credenciales ───
class ErrorConfiguracion extends Error {}

function cargarCuentaServicio() {
  const crudo = String(process.env.GCP_SERVICE_ACCOUNT || '').trim();
  if (!crudo) throw new ErrorConfiguracion('Falta la variable GCP_SERVICE_ACCOUNT en Vercel. La pone el instalador de Cloud Shell.');
  // Acepta el JSON tal cual o el mismo JSON en base64. Base64 existe por una
  // razón práctica: desde un iPhone, copiar un JSON largo mete retornos y
  // espacios; base64 es una sola línea.
  let cuenta = null;
  try {
    cuenta = JSON.parse(crudo);
  } catch {
    try {
      cuenta = JSON.parse(Buffer.from(crudo, 'base64').toString('utf8').trim());
    } catch {
      throw new ErrorConfiguracion('GCP_SERVICE_ACCOUNT no es un JSON ni un base64 válido. Vuelve a ejecutar el instalador para reponerla.');
    }
  }
  if (!cuenta || typeof cuenta !== 'object') throw new ErrorConfiguracion('GCP_SERVICE_ACCOUNT está vacía por dentro.');
  if (!cuenta.project_id) throw new ErrorConfiguracion('GCP_SERVICE_ACCOUNT no dice a qué proyecto pertenece (falta project_id).');
  if (!cuenta.client_email) throw new ErrorConfiguracion('GCP_SERVICE_ACCOUNT no tiene el correo de la cuenta de servicio (falta client_email).');
  if (!String(cuenta.private_key || '').includes('PRIVATE KEY')) throw new ErrorConfiguracion('GCP_SERVICE_ACCOUNT no trae una clave privada válida.');
  if (!cuenta.token_uri) cuenta.token_uri = 'https://oauth2.googleapis.com/token';
  return cuenta;
}

// Los tokens de acceso duran una hora. Vercel reutiliza instancias calientes,
// así que guardarlo ahorra una ida y vuelta a OAuth en casi cada llamada.
let tokenGuardado = { clave: null, token: null, caduca: 0 };

function firmarJwt(cuenta, carga) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const entrada = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(carga)}`;
  // Firma nativa: el PEM va directo a createSign, que entiende cabeceras y
  // retornos. Una decodificación previa con atob() fallaba en Vercel en
  // cuanto la clave traía espacios sueltos.
  const firma = crypto.createSign('RSA-SHA256').update(entrada).sign(cuenta.private_key, 'base64url');
  return `${entrada}.${firma}`;
}

async function tokenDeAcceso(cuenta) {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenGuardado.token && tokenGuardado.clave === cuenta.client_email && tokenGuardado.caduca > ahora + 60) {
    return tokenGuardado.token;
  }
  const asercion = firmarJwt(cuenta, {
    iss: cuenta.client_email, sub: cuenta.client_email, aud: cuenta.token_uri,
    iat: ahora, exp: ahora + 3600, scope: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const r = await fetch(cuenta.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${asercion}`,
    signal: AbortSignal.timeout(8000),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) {
    throw new ErrorConfiguracion(`Google no aceptó la cuenta de servicio: ${d.error_description || d.error || 'sin detalle'}. Si borraste su clave, vuelve a ejecutar el instalador.`);
  }
  tokenGuardado = { clave: cuenta.client_email, token: d.access_token, caduca: ahora + (d.expires_in || 3600) };
  return d.access_token;
}

// Credenciales + proyecto + token en una llamada. Solo la usa la puerta,
// DESPUÉS de comprobar que quien llama es el propietario.
async function credenciales() {
  const cuenta = cargarCuentaServicio();
  const token = await tokenDeAcceso(cuenta);
  return { cuenta, proyecto: cuenta.project_id, token };
}

// Endpoint de modelo de Vertex AI. "global" usa el host sin región.
function urlVertex(proyecto, ubicacion, modelo, metodo) {
  const host = ubicacion === 'global' ? 'https://aiplatform.googleapis.com' : `https://${ubicacion}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${proyecto}/locations/${ubicacion}/publishers/google/models/${modelo}:${metodo}`;
}

// ─── URL firmada V4 de Cloud Storage ───
// Sirve para ver (GET) y para subir desde el navegador (PUT): los medios
// nunca pasan por una función de Vercel (límite de 4,5 MB).
function firmarUrl(cuenta, bucket, ruta, { metodo = 'GET', segundos = 6 * 3600, descargarComo = '' } = {}) {
  const ahora = new Date();
  const fechaHora = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fecha = fechaHora.slice(0, 8);
  const alcance = `${fecha}/auto/storage/goog4_request`;
  const params = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', `${cuenta.client_email}/${alcance}`],
    ['X-Goog-Date', fechaHora],
    ['X-Goog-Expires', String(Math.min(604800, segundos))],
    ['X-Goog-SignedHeaders', 'host'],
  ];
  // Sin esta cabecera firmada el navegador abre el archivo en vez de bajarlo.
  if (descargarComo) params.push(['response-content-disposition', `attachment; filename="${String(descargarComo).replace(/[^\w.-]+/g, '_').slice(0, 120)}"`]);
  // RFC 3986: encodeURIComponent deja pasar !'()* y la firma canónica no los admite.
  const cod = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const consulta = params.map(([k, v]) => `${cod(k)}=${cod(v)}`).sort().join('&');
  const camino = ruta.split('/').map(cod).join('/');
  const canonica = [metodo, `/${bucket}/${camino}`, consulta, 'host:storage.googleapis.com', '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const resumen = crypto.createHash('sha256').update(canonica).digest('hex');
  const aFirmar = ['GOOG4-RSA-SHA256', fechaHora, alcance, resumen].join('\n');
  const firma = crypto.createSign('RSA-SHA256').update(aFirmar).sign(cuenta.private_key, 'hex');
  return `https://storage.googleapis.com/${bucket}/${camino}?${consulta}&X-Goog-Signature=${firma}`;
}

// bot@proyecto.iam.gserviceaccount.com → bot…@proyecto.iam.gserviceaccount.com
function ocultarCorreo(correo) {
  const texto = String(correo || '');
  const arroba = texto.indexOf('@');
  if (arroba < 1) return '';
  const local = texto.slice(0, arroba);
  const dominio = texto.slice(arroba);
  if (local.length <= 6) return local[0] + '…' + dominio;
  return local.slice(0, 5) + '…' + local.slice(-2) + dominio;
}

module.exports = {
  cfg, describirAjustes, ubicacionImagen, ubicacionesImagen,
  MODELOS_IMAGEN, MODELOS_VIDEO, CORS_BUCKET,
  ErrorConfiguracion, cargarCuentaServicio, tokenDeAcceso, credenciales, urlVertex, ocultarCorreo, firmarUrl,
};
