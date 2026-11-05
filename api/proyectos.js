// ════════════════════════════════════════════════════════════════
// PROYECTOS — lista, abre y guarda los proyectos del bucket.
//
//   GET  /api/proyectos                 → { proyectos, ilegibles }
//   GET  /api/proyectos?id=pXXXX        → { proyecto, generacion }
//   POST /api/proyectos  { id, datos, nombre, resumen, generacionBase }
//                                       → { id, nombre, actualizado, generacion }
//
// Un proyecto nuevo se guarda con generacionBase "0": si ese id ya existe
// (un reintento tras una respuesta perdida), Google lo rechaza y el
// navegador abre ese mismo registro en vez de crear otro.
// Abrir y listar solo leen: nunca generan nada.
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const almacen = require('./_lib/almacen');
const { ErrorEstudio } = require('./_lib/errores');

module.exports = puerta({ metodos: ['GET', 'POST'] }, async (req, { google }) => {
  const { token } = await google();
  if (req.method === 'GET') {
    const id = new URL(req.url, 'https://estudio.invalid').searchParams.get('id');
    if (!id) return almacen.listar(token);
    if (!almacen.idValido(id)) throw new ErrorEstudio('Ese identificador de proyecto no es válido.', { estado: 400, tipo: 'peticion' });
    const { manifiesto, generacion } = await almacen.leer(token, id);
    if (!manifiesto) throw new ErrorEstudio('Ese proyecto no está en el bucket.', { estado: 404, tipo: 'no_existe' });
    return { proyecto: manifiesto, generacion };
  }
  const { id } = req.body || {};
  if (!almacen.idValido(id)) throw new ErrorEstudio('Ese identificador de proyecto no es válido.', { estado: 400, tipo: 'peticion' });
  return almacen.guardar(token, id, req.body);
});
