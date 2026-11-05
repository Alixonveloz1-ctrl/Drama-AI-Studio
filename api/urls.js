// ════════════════════════════════════════════════════════════════
// URLS — firma URLs de corta vida para ver los medios del proyecto (GET) o
// subirlos desde el navegador (PUT), y comprueba si existen sin bajarlos.
//
//   POST { proyecto, ver: [rutas] }            → { urls: { ruta: url } }
//   POST { proyecto, comprobar: [rutas] }      → { existen: { ruta: true|false|null } }
//   POST { proyecto, descargar: [rutas] }      → { descargas: { ruta: url } } (se descarga con su nombre)
//
// Solo rutas dentro de la carpeta del proyecto. El bucket no es público.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, firmarUrl } = require('./_lib/google');
const medios = require('./_lib/medios');

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const { proyecto: id, ver = [], comprobar = [], descargar = [] } = req.body || {};
  const rutasDescargar = (Array.isArray(descargar) ? descargar : []).slice(0, 20).map(r => medios.exigirDelProyecto(id, r));
  const rutasVer = (Array.isArray(ver) ? ver : []).slice(0, 300).map(r => medios.exigirDelProyecto(id, r));
  const rutasComprobar = (Array.isArray(comprobar) ? comprobar : []).slice(0, 100).map(r => medios.exigirDelProyecto(id, r));
  const { cuenta, token } = await google();
  const urls = {};
  for (const ruta of rutasVer) urls[ruta] = firmarUrl(cuenta, cfg.bucket, ruta, { segundos: 6 * 3600 });
  const existen = {};
  for (const ruta of rutasComprobar) existen[ruta] = await medios.existe(token, ruta);
  const descargas = {};
  for (const ruta of rutasDescargar) descargas[ruta] = firmarUrl(cuenta, cfg.bucket, ruta, { segundos: 6 * 3600, descargarComo: ruta.split('/').pop() });
  return { urls, existen, descargas, caducan: Date.now() + 6 * 3600 * 1000 };
});
