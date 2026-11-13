// ════════════════════════════════════════════════════════════════
// VIDEO (consulta) — pregunta a Veo cómo va una operación ya arrancada.
//
//  · Se consulta con fetchPredictOperation EN EL MODELO QUE LA ARRANCÓ: la
//    operación pertenece a ese modelo y preguntar a otro falla (en el estudio
//    de anime estuvo fijo al modelo Lite y rompía Fast y Calidad).
//  · La operación se guarda en el proyecto del bucket: si el dueño recarga,
//    la consulta sigue donde estaba y no se paga un clip repetido.
//  · Terminado, devuelve la ruta del MP4 dentro de la carpeta del proyecto y
//    una URL firmada de 7 días para verlo sin bucket público.
//  · Un clip bloqueado por el filtro se dice como bloqueo (no se reintenta).
// ════════════════════════════════════════════════════════════════
const puerta = require('./_lib/puerta');
const { cfg, urlVertex, firmarUrl, MODELOS_VIDEO } = require('./_lib/google');
const { ErrorEstudio, errorDeGoogle, clasificar } = require('./_lib/errores');
const medios = require('./_lib/medios');

const SIETE_DIAS = 7 * 24 * 3600;
const MENSAJE_BLOQUEO = 'Google bloqueó este video con su filtro de seguridad. Reintentar igual no sirve: cambia el plano.';
// El filtro de caras/personas (código 3 de Google) actúa sobre la FOTO,
// no sobre el texto: a veces confunde una cara fotorrealista generada
// por IA con la foto de una persona real. No depende de lo que pida el
// plano ni se puede apagar (la app ya le dice a Google que son
// adultos): el remedio que funciona es regenerar la imagen del plano,
// porque la nueva versión de la cara suele pasar.
const esFiltroDeCaras = texto => /person\/face|face generation|17301594/i.test(String(texto || ''));
const MENSAJE_CARAS = 'Google bloqueó este video porque su filtro de caras creyó ver a una persona real en la foto del plano. La foto es normal: ese filtro se equivoca a veces con las caras fotorrealistas y no se puede apagar. Reintentar con la misma imagen no sirve: regenera la imagen de este plano (la nueva versión de la cara suele pasar) y vuelve a generar el video.';
const OPERACION = /^projects\/[\w-]+\/locations\/[\w-]+\/publishers\/google\/models\/([\w.-]+)\/operations\/[\w-]+$/;
// Omni no arranca una «operación» de Veo sino una interacción (global).
const INTERACCION = /^projects\/[\w-]+\/locations\/global\/interactions\/[\w-]+$/;

module.exports = puerta({ metodos: ['POST'] }, async (req, { google }) => {
  const b = req.body || {};
  const id = b.proyecto;
  medios.carpeta(id);
  const operacion = String(b.operacion || '');

  // ─── Omni: la interacción se consulta por su nombre y el clip llega
  // dentro de la respuesta (no lo escribe Google en el bucket como Veo):
  // terminado, se guarda aquí en la ruta del plano y se devuelve igual.
  if (INTERACCION.test(operacion)) {
    const { cuenta, token } = await google();
    let rO;
    try {
      rO = await fetch(`https://aiplatform.googleapis.com/v1beta1/${operacion}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': operacion.split('/')[1] },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new ErrorEstudio('No hubo conexión con Google para consultar el video: ' + e.message, { estado: 502, tipo: 'google' });
    }
    const crudoO = await rO.text();
    let dO;
    try { dO = JSON.parse(crudoO); } catch { dO = { error: { message: crudoO.slice(0, 300) || `HTTP ${rO.status}` } }; }
    if (!rO.ok) throw errorDeGoogle('la consulta del video (Omni)', rO.status, dO);
    const estadoO = String(dO.status || '').toLowerCase();
    if (dO.error || estadoO === 'failed') {
      const errO = dO.error || {};
      const detalle = `${errO.code || ''} — ${errO.message || JSON.stringify(errO)}`.slice(0, 1500);
      if (clasificar(detalle) === 'bloqueo') throw new ErrorEstudio(esFiltroDeCaras(detalle) ? MENSAJE_CARAS : MENSAJE_BLOQUEO, { estado: 422, tipo: 'bloqueo', detalle });
      throw new ErrorEstudio('Omni terminó la interacción con un error y no hizo el video.', { estado: 502, tipo: 'veo_fallo', detalle });
    }
    if (estadoO !== 'completed') return { listo: false };
    // DÓNDE VIAJA EL VIDEO (documentación oficial de Google y respuesta
    // real del 2026-11-12): el campo «output_video» es SOLO de los SDK;
    // por REST el video viene dentro de los pasos de la interacción — el
    // paso «model_output» trae partes y la de tipo «video» lleva los
    // bytes («data») o la dirección de entrega («uri»). La primera
    // versión buscaba output_video y por eso la app decía «terminó pero
    // no devolvió el video» aunque Google sí lo había generado.
    let parteVideo = null, textoModelo = '';
    for (const paso of (Array.isArray(dO.steps) ? dO.steps : [])) {
      if (!Array.isArray(paso?.content)) continue;
      if (!textoModelo) { const t = paso.content.find(x => x?.type === 'text' && x.text); if (t) textoModelo = String(t.text); }
      if (paso.type !== 'model_output') continue;
      parteVideo = paso.content.find(x => x?.type === 'video') || parteVideo;
      if (parteVideo) break;
    }
    const salida = parteVideo || dO.output_video || dO.output?.output_video || dO.response?.output_video || {};
    const prefijo = `gs://${cfg.bucket}/`;
    const gs = String(salida.gcs_uri || salida.gcsUri || (String(salida.uri || '').startsWith('gs://') ? salida.uri : ''));
    let ruta;
    const guardarBytes = async bytes => {
      if (typeof b.clave !== 'string' || !b.clave) throw new ErrorEstudio('Falta la clave del plano para guardar el video de Omni.', { estado: 400, tipo: 'peticion' });
      ruta = medios.rutaMedio(id, b.clave, 'mp4');
      await medios.guardar(token, ruta, bytes, 'video/mp4', { espera: 25000 });
    };
    if (gs.startsWith(prefijo)) {
      ruta = medios.exigirDelProyecto(id, gs.slice(prefijo.length));
    } else if (typeof salida.data === 'string' && salida.data) {
      await guardarBytes(Buffer.from(salida.data, 'base64'));
    } else if (gs || (typeof salida.uri === 'string' && salida.uri)) {
      // Entrega por dirección (otro cubo de Google o una URL): se
      // descargan los bytes y el clip se guarda en la ruta del plano.
      let bytes = null;
      try {
        let rD;
        if (gs) {
          const resto = gs.slice(5); const corte = resto.indexOf('/');
          rD = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(resto.slice(0, corte))}/o/${encodeURIComponent(resto.slice(corte + 1))}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
        } else {
          rD = await fetch(salida.uri, { signal: AbortSignal.timeout(20000) });
        }
        if (rD.ok) bytes = Buffer.from(await rD.arrayBuffer());
      } catch { bytes = null; }
      if (!bytes?.length) throw new ErrorEstudio('Omni hizo el video pero no se pudo descargar de su dirección de entrega.', { estado: 502, tipo: 'veo_fallo' });
      await guardarBytes(bytes);
    } else {
      throw new ErrorEstudio('Omni terminó pero no devolvió el video.', { estado: 502, tipo: 'veo_fallo', detalle: (textoModelo || JSON.stringify(dO)).slice(0, 300) });
    }
    return { listo: true, ruta, url: firmarUrl(cuenta, cfg.bucket, ruta, { segundos: SIETE_DIAS }) };
  }

  const coincide = operacion.match(OPERACION);
  if (!coincide || !MODELOS_VIDEO.includes(coincide[1])) throw new ErrorEstudio('Esa operación de video no es válida.', { estado: 400, tipo: 'peticion' });
  const modelo = coincide[1];

  const { cuenta, proyecto, token } = await google();
  let r;
  try {
    r = await fetch(urlVertex(proyecto, cfg.region, modelo, 'fetchPredictOperation'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify({ operationName: operacion }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new ErrorEstudio('No hubo conexión con Google para consultar el video: ' + e.message, { estado: 502, tipo: 'google' });
  }
  const crudo = await r.text();
  let d;
  try { d = JSON.parse(crudo); } catch { d = { error: { message: crudo.slice(0, 300) || `HTTP ${r.status}` } }; }
  if (!r.ok) throw errorDeGoogle(`la consulta del video (${modelo})`, r.status, d);
  if (!d.done) return { listo: false };

  // Terminada con error: se explica y la operación se da por cerrada.
  if (d.error) {
    const detalle = `${d.error.code || ''} — ${d.error.message || JSON.stringify(d.error)}`.slice(0, 1500);
    if (clasificar(detalle) === 'bloqueo') throw new ErrorEstudio(esFiltroDeCaras(detalle) ? MENSAJE_CARAS : MENSAJE_BLOQUEO, { estado: 422, tipo: 'bloqueo', detalle });
    throw new ErrorEstudio('Veo terminó la operación con un error y no hizo el video.', { estado: 502, tipo: 'veo_fallo', detalle });
  }
  const videos = d.response?.videos || [];
  if (!videos.length && d.response?.raiMediaFilteredCount > 0) {
    const motivo = (d.response.raiMediaFilteredReasons || []).join(' · ');
    throw new ErrorEstudio(esFiltroDeCaras(motivo) ? MENSAJE_CARAS : MENSAJE_BLOQUEO, { estado: 422, tipo: 'bloqueo', detalle: `blocked ${motivo}`.trim() });
  }
  const gcs = String(videos[0]?.gcsUri || '');
  const prefijo = `gs://${cfg.bucket}/`;
  if (!gcs.startsWith(prefijo)) throw new ErrorEstudio('Veo terminó pero no devolvió un video en tu bucket.', { estado: 502, tipo: 'veo_fallo', detalle: gcs || JSON.stringify(d.response || {}).slice(0, 300) });
  const ruta = medios.exigirDelProyecto(id, gcs.slice(prefijo.length));
  return { listo: true, ruta, url: firmarUrl(cuenta, cfg.bucket, ruta, { segundos: SIETE_DIAS }), modelo };
});
