// ════════════════════════════════════════════════════════════════
// SERVIDOR — Drama AI Studio fuera de Vercel (Google Cloud Run).
//
// Un único proceso Node, sin dependencias, que hace lo que hacía Vercel:
//   · Sirve la parte pública: index.html, entrar/ y estudio/.
//   · Enruta /api/<nombre> a la función de api/<nombre>.js (solo las
//     doce conocidas; api/_lib nunca es una ruta pública).
//   · Le entrega a cada función lo que Vercel le entregaba: req.body
//     ya leído (JSON), req.query y res.status(...).json(...).
//
// Las funciones ni se enteran del cambio: mismas variables de entorno,
// misma cuenta de servicio, mismo bucket. Este archivo nació con la
// migración del 2026-11-13, cuando el equipo gratuito de Vercel agotó
// su cupo de transferencia y hubo que mudar el estudio a Cloud Run.
// Vercel queda intacto como respaldo; este servidor no lo necesita.
// ════════════════════════════════════════════════════════════════
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = __dirname;
const PUERTO = Number(process.env.PORT || 8080);
// Los medios suben y bajan directos del bucket con URLs firmadas; por
// aquí solo pasa JSON. 8 MB es de sobra y corta cualquier abuso.
const LIMITE_CUERPO = 8 * 1024 * 1024;

const ENDPOINTS = ['imagen', 'inspiracion', 'montaje', 'musica', 'proyectos', 'salud',
  'texto', 'transcripcion', 'urls', 'video-estado', 'video-inicio', 'voz'];
const funciones = {};
for (const nombre of ENDPOINTS) funciones[nombre] = require(path.join(RAIZ, 'api', nombre + '.js'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
// Lo único público como archivo: la portada, la entrada y el estudio.
// El código de api/, el instalador, las pruebas y la documentación no
// se sirven jamás: pedirlos es un 404, igual que en Vercel.
const ES_PUBLICO = /^\/$|^\/index\.html$|^\/entrar(?:\/index\.html)?\/?$|^\/estudio\/[\w.-]+(?:\/[\w.-]+)*$/;

function decorar(res) {
  res.status = codigo => { res.statusCode = codigo; return res; };
  res.json = valor => {
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(valor ?? null));
    return res;
  };
}

function fallo(res, estado, mensaje) {
  if (res.headersSent) return res.end();
  return res.status(estado).json({ error: mensaje, tipo: 'servidor' });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', trozo => {
      total += trozo.length;
      if (total > LIMITE_CUERPO) { reject(new Error('cuerpo demasiado grande')); req.destroy(); return; }
      partes.push(trozo);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

async function atenderApi(req, res, url, nombre) {
  const funcion = funciones[nombre];
  if (!funcion) return fallo(res, 404, 'Esa ruta de la API no existe.');
  const crudo = await leerCuerpo(req).catch(() => null);
  if (crudo === null) return fallo(res, 413, 'La petición es demasiado grande.');
  req.body = {};
  if (crudo.length && String(req.headers['content-type'] || '').includes('json')) {
    try { req.body = JSON.parse(crudo.toString('utf8')); } catch { return fallo(res, 400, 'El cuerpo de la petición no es JSON válido.'); }
  }
  req.query = Object.fromEntries(url.searchParams);
  try {
    await funcion(req, res);
    if (!res.writableEnded) res.end();
  } catch {
    return fallo(res, 500, 'El servidor tuvo un fallo inesperado.');
  }
}

function atenderEstatico(req, res, ruta) {
  if (!ES_PUBLICO.test(ruta)) return fallo(res, 404, 'No encontrado.');
  let relativa = ruta === '/' || ruta === '/index.html' ? 'index.html'
    : ruta.startsWith('/entrar') ? 'entrar/index.html'
    : ruta.slice(1);
  const archivo = path.join(RAIZ, relativa);
  if (!archivo.startsWith(RAIZ + path.sep)) return fallo(res, 404, 'No encontrado.');
  fs.stat(archivo, (error, datos) => {
    if (error || !datos.isFile()) return fallo(res, 404, 'No encontrado.');
    res.statusCode = 200;
    res.setHeader('Content-Type', TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream');
    // Las mismas cabeceras que ponía vercel.json, y sin caché de CDN:
    // tras cada despliegue el teléfono baja la copia fresca (en Vercel
    // la caché dejaba la app en blanco mezclando versiones).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(archivo).pipe(res);
  });
}

const servidor = http.createServer((req, res) => {
  decorar(res);
  let url;
  try { url = new URL(req.url, 'http://estudio.invalid'); } catch { return fallo(res, 400, 'Dirección no válida.'); }
  const ruta = decodeURIComponent(url.pathname);
  const api = /^\/api\/([\w-]+)$/.exec(ruta);
  if (api) return void atenderApi(req, res, url, api[1]);
  if (ruta.startsWith('/api/')) return fallo(res, 404, 'Esa ruta de la API no existe.');
  return void atenderEstatico(req, res, ruta);
});
// Los endpoints largos (música, inspiración) tardan minutos: el corte
// lo pone Cloud Run con su propio tiempo límite, no este proceso.
servidor.requestTimeout = 0;
servidor.headersTimeout = 120000;
servidor.listen(PUERTO, () => console.log(`Drama AI Studio escuchando en el puerto ${PUERTO}`));
