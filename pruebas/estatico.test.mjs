// Comprobaciones estáticas: todo parsea y las reglas del dueño se cumplen
// en el propio código (sección 23 de la especificación).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const IGNORAR = new Set(['.git', 'node_modules', '__pycache__']);

function archivos(carpeta = RAIZ) {
  const lista = [];
  for (const nombre of readdirSync(carpeta)) {
    if (IGNORAR.has(nombre)) continue;
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) lista.push(...archivos(ruta));
    else lista.push(ruta);
  }
  return lista;
}
const todos = archivos();
const de = (...extensiones) => todos.filter(r => extensiones.includes(extname(r)));
const rel = r => relative(RAIZ, r);
// Lo que ve el dueño: la página y los módulos del navegador.
const interfaz = todos.filter(r => /^(index\.html|entrar\/|estudio\/)/.test(rel(r)));

test('todo el JavaScript parsea', () => {
  for (const ruta of de('.js', '.mjs', '.cjs')) {
    execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' });
  }
});

test('todo el HTML está completo, en español y sus scripts parsean', () => {
  for (const ruta of de('.html')) {
    const html = readFileSync(ruta, 'utf8');
    assert.match(html, /^<!doctype html>/i, rel(ruta) + ': falta doctype');
    assert.match(html, /<html lang="es">/, rel(ruta) + ': idioma');
    assert.match(html, /<meta name="viewport" content="[^"]*width=device-width/, rel(ruta) + ': viewport de teléfono');
    assert.match(html, /<title>[^<]+<\/title>/, rel(ruta) + ': título');
    for (const etiqueta of ['html', 'head', 'body', 'main', 'section', 'div', 'nav', 'header', 'button', 'p', 'script', 'style']) {
      const abre = (html.match(new RegExp(`<${etiqueta}[\\s>]`, 'g')) || []).length;
      const cierra = (html.match(new RegExp(`</${etiqueta}>`, 'g')) || []).length;
      assert.equal(abre, cierra, `${rel(ruta)}: <${etiqueta}> abiertas ${abre}, cerradas ${cierra}`);
    }
    for (const [, codigo] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(codigo), rel(ruta) + ': script en línea');
    }
    for (const [, src] of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/[^"]+)"/g)) {
      assert.ok(existsSync(join(RAIZ, src)), `${rel(ruta)} enlaza ${src}, que no existe`);
    }
  }
});

test('los endpoints corren en Node.js, nunca en Edge, y caben en el límite de Vercel', () => {
  const funciones = readdirSync(join(RAIZ, 'api')).filter(n => n.endsWith('.js'));
  assert.ok(funciones.length <= 12, 'Vercel Hobby admite 12 funciones');
  for (const ruta of [...de('.js').filter(r => rel(r).startsWith('api/')), join(RAIZ, 'vercel.json')]) {
    assert.doesNotMatch(readFileSync(ruta, 'utf8'), /runtime['"]?\s*:\s*['"]edge/i, rel(ruta));
  }
  assert.ok(!existsSync(join(RAIZ, 'middleware.js')), 'sin middleware Edge');
  const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
  const limites = { 'salud.js': 15, 'texto.js': 60, 'proyectos.js': 30, 'imagen.js': 60, 'urls.js': 30, 'video-inicio.js': 60, 'video-estado.js': 30, 'voz.js': 60, 'musica.js': 300, 'transcripcion.js': 30, 'montaje.js': 30 };
  for (const nombre of funciones) {
    assert.ok(vercel.functions[`api/${nombre}`], `vercel.json no fija maxDuration de api/${nombre}`);
    if (limites[nombre]) assert.equal(vercel.functions[`api/${nombre}`].maxDuration, limites[nombre], nombre);
  }
  for (const clave of Object.keys(vercel.functions)) assert.ok(existsSync(join(RAIZ, clave)), clave + ' no existe');
});

test('solo los identificadores de modelo de la especificación', () => {
  const permitidos = new Set(['gemini-3.1-pro-preview', 'gemini-3.1-flash-image', 'gemini-3-pro-image',
    'veo-3.1-lite-generate-001', 'veo-3.1-fast-generate-001', 'veo-3.1-generate-001',
    // Música: Lyria 3 Pro, la de la parte de cortos del estudio de anime (decisión del dueño).
    'lyria-3-pro-preview']);
  for (const ruta of [...de('.js', '.mjs', '.cjs', '.html', '.py')]) {
    if (rel(ruta).startsWith('pruebas/')) continue;
    for (const [modelo] of readFileSync(ruta, 'utf8').matchAll(/\b(?:gemini|veo|lyria)-[a-z0-9][\w.-]*\b|\bimagen-\d[\w.-]*\b/g)) {
      assert.ok(permitidos.has(modelo), `${rel(ruta)} usa un modelo que no está en la especificación: ${modelo}`);
    }
  }
});

test('no existe ninguna pantalla de coste ni botón de aprobar', () => {
  for (const ruta of interfaz) {
    const texto = readFileSync(ruta, 'utf8');
    assert.doesNotMatch(texto, /\b(precio|presupuesto|saldo|tarifa|coste|costo|reserva de saldo|USD|€)\b/i, rel(ruta) + ': nada de costes');
    assert.doesNotMatch(texto, /\b(aprobar|aprobad[oa]s?|approve)\b/i, rel(ruta) + ': nada de aprobar');
  }
});

test('no hay botones de instalación ni de Cloud Shell dentro de la aplicación', () => {
  for (const ruta of interfaz) {
    const texto = readFileSync(ruta, 'utf8');
    assert.doesNotMatch(texto, /shell\.cloud\.google\.com|cloudshell/i, rel(ruta));
    assert.doesNotMatch(texto, /<textarea[^>]*(clave|json|key)/i, rel(ruta) + ': nada de pegar claves');
  }
});

test('el navegador nunca recibe credenciales: sin claves en la interfaz', () => {
  for (const ruta of interfaz) {
    assert.doesNotMatch(readFileSync(ruta, 'utf8'), /private_key|GCP_SERVICE_ACCOUNT\s*=|BEGIN PRIVATE KEY/, rel(ruta));
  }
});

test('el instalador se lanza con ./c y es ejecutable', () => {
  const modo = statSync(join(RAIZ, 'c')).mode;
  assert.ok(modo & 0o111, 'c debe ser ejecutable');
  execFileSync('bash', ['-n', join(RAIZ, 'c')]);
  execFileSync('python3', ['-m', 'py_compile', ...de('.py').filter(r => rel(r).startsWith('instalador/'))]);
});

test('una sola lista de CORS para el bucket, con subida desde el navegador', () => {
  const cors = JSON.parse(readFileSync(join(RAIZ, 'comun', 'cors-bucket.json'), 'utf8'));
  for (const metodo of ['GET', 'HEAD', 'PUT', 'OPTIONS']) assert.ok(cors[0].method.includes(metodo), metodo);
});

test('catálogo íntegro: 21 géneros, 23 subgéneros, 4 públicos y los dos formatos', async () => {
  const c = await import('../estudio/catalogo.mjs');
  const valores = lista => lista.map(x => x.valor);
  assert.deepEqual(valores(c.GENEROS), ['accion', 'fantasia', 'isekai', 'mecha', 'romcom', 'drama', 'slice_of_life',
    'terror', 'psicologico', 'misterio', 'deportes', 'sci_fi', 'aventura', 'sobrenatural', 'supervivencia', 'videojuego',
    'donghua', 'transmigracion', 'naufragio', 'ascenso_social', 'sistema_juego']);
  assert.deepEqual(valores(c.SUBGENEROS), ['psicologico', 'romance', 'ecchi', 'harem', 'harem_inverso', 'comedia', 'dark',
    'gore', 'misterio', 'revenge', 'overpowered', 'slice_of_life', 'musica', 'deporte', 'mafia', 'escolar', 'militar',
    'reencarnacion', 'viaje_tiempo', 'apocalipsis', 'idols', 'medicina', 'sistema_awakening']);
  assert.deepEqual(valores(c.PUBLICOS), ['masculino', 'femenino', 'adulto', 'familia']);
  assert.deepEqual(valores(c.FORMATOS), ['9:16', '16:9']);
  for (const lista of [c.GENEROS, c.SUBGENEROS, c.PUBLICOS]) assert.ok(lista.every(x => x.etiqueta && x.etiqueta.length > 3));
});
