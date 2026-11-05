// ════════════════════════════════════════════════════════════════
// SALUD — diagnóstico de solo lectura: ¿qué cuenta de Google Cloud y qué
// bucket está usando de verdad este despliegue?
//
// Existe para comprobar un cambio de cuenta desde la propia aplicación, sin
// abrir el panel de Vercel desde el iPhone. Nunca devuelve la clave privada
// ni el JSON de la cuenta de servicio: solo los campos que la identifican.
// No genera nada y no llama a ningún modelo: abrir esta pantalla no cuesta.
//
// Este mismo endpoint lleva el apretón de manos de la sesión (?acceso=…) para
// no gastar otra función del límite de Vercel.
// ════════════════════════════════════════════════════════════════
const { manejarSesion, configuracion } = require('./_lib/acceso');
const { cfg, describirAjustes, cargarCuentaServicio, tokenDeAcceso, ocultarCorreo } = require('./_lib/google');
const puerta = require('./_lib/puerta');

// APIs que el proyecto necesita (sección 4.4 de la especificación).
const SERVICIOS = [
  ['aiplatform.googleapis.com', 'Vertex AI', 'guion, imágenes, video, voces y música'],
  ['storage.googleapis.com', 'Cloud Storage', 'el bucket: proyectos y medios'],
  ['speech.googleapis.com', 'Speech-to-Text', 'subtítulos alineados'],
  ['texttospeech.googleapis.com', 'Text-to-Speech', 'voces'],
  ['run.googleapis.com', 'Cloud Run', 'el montador del episodio final'],
];

// Lo que la cuenta de servicio tiene que poder hacer en el bucket.
// storage.buckets.update hace falta porque el estudio aplica el CORS.
const PERMISOS_BUCKET = [
  ['storage.objects.create', 'guardar archivos'],
  ['storage.objects.get', 'leer archivos'],
  ['storage.objects.list', 'listar proyectos'],
  ['storage.objects.delete', 'borrar archivos sustituidos'],
  ['storage.buckets.update', 'poner el CORS del bucket'],
];

// Vercel corta esta función a los 15 s. Cada consulta tiene su límite y, si
// no queda tiempo, la comprobación se marca como NO hecha: nunca se informa
// "bien" de algo que no se llegó a mirar.
const LIMITE_TOTAL_MS = 11000;
const LIMITE_CONSULTA_MS = 3000;

async function consultar(url, token, proyecto) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': proyecto },
    signal: AbortSignal.timeout(LIMITE_CONSULTA_MS),
  });
  const datos = await r.json().catch(() => ({}));
  return { r, datos };
}

const textoGoogle = (r, datos) => `${r.status} — ${String(datos?.error?.message || 'sin detalle').slice(0, 220)}`;

const revisar = puerta({ metodos: ['GET'] }, async (req, { propietario }) => {
  const inicio = Date.now();
  const quedaTiempo = () => Date.now() - inicio < LIMITE_TOTAL_MS;

  const salida = {
    sesion: { correo: propietario.correo },
    version: {
      commit: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
      entorno: process.env.VERCEL_ENV || null,
    },
    acceso: {},
    cuentaServicio: { configurada: false },
    bucket: { configurado: false },
    comprobaciones: {},
    servicios: [],
    ajustes: describirAjustes(),
  };

  // Quién puede entrar y con qué proyecto de Firebase se inicia sesión.
  try {
    const { firebase, correos } = configuracion();
    salida.acceso = { proyectoFirebase: firebase.projectId, correosAutorizados: correos };
  } catch (e) {
    salida.acceso = { error: e.message };
  }

  // ─── GCS_OUTPUT_BUCKET ───
  if (cfg.bucket) {
    salida.bucket = { configurado: true, nombre: cfg.bucket, carpeta: cfg.prefijo + '/' };
    if (cfg.bucketCrudo.startsWith('gs://')) salida.bucket.aviso = 'GCS_OUTPUT_BUCKET lleva el prefijo gs://; se ignora, pero conviene poner solo el nombre.';
  } else {
    salida.bucket = { configurado: false, error: 'Falta la variable GCS_OUTPUT_BUCKET en Vercel. Sin bucket no se puede guardar nada.' };
  }

  // ─── GCP_SERVICE_ACCOUNT ───
  let cuenta;
  try {
    cuenta = cargarCuentaServicio();
  } catch (e) {
    salida.cuentaServicio = { configurada: false, error: e.message };
    return salida;
  }
  salida.cuentaServicio = { configurada: true, proyecto: cuenta.project_id, correo: ocultarCorreo(cuenta.client_email) };

  let token;
  try {
    token = await tokenDeAcceso(cuenta);
    salida.comprobaciones.credenciales = { ok: true };
  } catch (e) {
    salida.comprobaciones.credenciales = { ok: false, error: e.message };
    return salida;
  }
  const proyecto = cuenta.project_id;

  // ─── Bucket: existe, dónde está y qué puede hacer la cuenta de servicio ───
  if (salida.bucket.configurado) {
    const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cfg.bucket)}`;
    try {
      const { r, datos } = await consultar(base, token, proyecto);
      if (r.ok) {
        const ubicacion = String(datos.location || '').toUpperCase();
        salida.comprobaciones.bucket = { ok: true, ubicacion: ubicacion || null };
        if (ubicacion && !ubicacion.startsWith('US')) {
          salida.comprobaciones.bucket.aviso = 'El bucket no está en Estados Unidos. Veo trabaja en us-central1; conviene un bucket en US.';
        }
      } else {
        salida.comprobaciones.bucket = {
          ok: false,
          error: r.status === 404 ? 'Ese bucket no existe o pertenece a otro proyecto.'
            : r.status === 403 ? 'La cuenta de servicio no tiene permiso para ver ese bucket.'
            : 'Google no dejó leer el bucket.',
          detalleGoogle: textoGoogle(r, datos),
        };
      }
    } catch (e) {
      salida.comprobaciones.bucket = { ok: false, error: 'No se pudo consultar el bucket: ' + e.message };
    }

    if (salida.comprobaciones.bucket?.ok) {
      if (!quedaTiempo()) {
        salida.comprobaciones.permisos = { ok: null, nota: 'No comprobado: no quedó tiempo en esta consulta.' };
      } else {
        try {
          const consulta = PERMISOS_BUCKET.map(([p]) => 'permissions=' + encodeURIComponent(p)).join('&');
          const { r, datos } = await consultar(`${base}/iam/testPermissions?${consulta}`, token, proyecto);
          if (r.ok) {
            const tiene = new Set(datos.permissions || []);
            const faltan = PERMISOS_BUCKET.filter(([p]) => !tiene.has(p)).map(([p, para]) => `${p} (${para})`);
            salida.comprobaciones.permisos = faltan.length
              ? { ok: false, error: 'A la cuenta de servicio le faltan permisos en el bucket: ' + faltan.join(', ') + '. El instalador le da el rol roles/storage.admin.' }
              : { ok: true };
          } else {
            salida.comprobaciones.permisos = { ok: null, nota: 'Google no dejó comprobar los permisos.', detalleGoogle: textoGoogle(r, datos) };
          }
        } catch (e) {
          salida.comprobaciones.permisos = { ok: null, nota: 'No se pudieron comprobar los permisos: ' + e.message };
        }
      }
    }
  }

  // ─── Montador del episodio final (Cloud Run Job) ───
  if (quedaTiempo()) {
    try {
      const { r, datos } = await consultar(`https://run.googleapis.com/v2/projects/${proyecto}/locations/${cfg.regionMontaje}/jobs/${cfg.trabajoMontaje}`, token, proyecto);
      salida.comprobaciones.montador = r.ok ? { ok: true, trabajo: cfg.trabajoMontaje }
        : r.status === 404 ? { ok: false, error: 'Todavía no existe. Ejecuta el instalador (./c en Cloud Shell): es el que lo crea.' }
          : { ok: null, nota: 'No se pudo comprobar: ' + textoGoogle(r, datos) };
    } catch (e) {
      salida.comprobaciones.montador = { ok: null, nota: 'No se pudo comprobar: ' + String(e.message).slice(0, 120) };
    }
  }

  // ─── APIs habilitadas en el proyecto ───
  // Se pregunta a Service Usage si cada API está encendida: responde a la
  // pregunta real en vez de adivinarla con una llamada que cueste.
  for (const [id, nombre, para] of SERVICIOS) {
    if (!quedaTiempo()) {
      salida.servicios.push({ id, nombre, para, estado: 'sin comprobar', nota: 'no quedó tiempo en esta consulta' });
      continue;
    }
    try {
      const { r, datos } = await consultar(`https://serviceusage.googleapis.com/v1/projects/${proyecto}/services/${id}`, token, proyecto);
      if (r.ok) {
        salida.servicios.push({ id, nombre, para, estado: datos.state === 'ENABLED' ? 'habilitada' : 'apagada' });
      } else {
        // Un 403 aquí significa que la cuenta no puede LEER la lista de APIs;
        // no dice nada de si la API funciona. No es un fallo.
        salida.servicios.push({
          id, nombre, para, estado: 'desconocido',
          nota: r.status === 403 ? 'la cuenta de servicio no puede consultarlo (le falta roles/serviceusage.serviceUsageConsumer)' : textoGoogle(r, datos),
        });
      }
    } catch (e) {
      salida.servicios.push({ id, nombre, para, estado: 'desconocido', nota: String(e.message).slice(0, 120) });
    }
  }

  return salida;
});

module.exports = async function salud(req, res) {
  if (await manejarSesion(req, res)) return;
  return revisar(req, res);
};
