const path = require('path');
const { createRequire } = require('module');

// Miniaturas para la vista previa de los documentos (JPEG, 720 px de ancho máx.).
// Las librerías nativas se cargan solo cuando se necesitan: si alguna no estuviera
// disponible en el servidor, el resto del backend sigue funcionando y la app
// muestra un icono en lugar de la vista previa.

const THUMB_WIDTH = 720;
const THUMB_MAX_HEIGHT = 1400;
const PDF_TIMEOUT_MS = 20000;

async function imageThumbnail(buf) {
  const sharp = require('sharp');
  return sharp(buf, { failOn: 'none', limitInputPixels: 120000000 })
    .rotate() // respeta la orientación EXIF de las fotos tomadas con el celular
    .resize({
      width: THUMB_WIDTH,
      height: THUMB_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 78 })
    .toBuffer();
}

let pdfEnginePromise = null;
function loadPdfEngine() {
  if (!pdfEnginePromise) {
    pdfEnginePromise = (async () => {
      const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
      // Se usa la misma copia de @napi-rs/canvas que carga pdfjs-dist (dependencia
      // opcional suya); mezclar dos copias provoca errores al dibujar.
      const canvasLib = createRequire(path.join(pkgDir, 'package.json'))('@napi-rs/canvas');
      // Node < 20.16 no tiene process.getBuiltinModule, que pdfjs usa para leer
      // sus tipografías y preparar clases de dibujo.
      if (typeof process.getBuiltinModule !== 'function') {
        process.getBuiltinModule = (id) => require(String(id).replace(/^node:/, ''));
      }
      for (const name of ['DOMMatrix', 'Path2D', 'ImageData']) {
        if (!globalThis[name] && canvasLib[name]) globalThis[name] = canvasLib[name];
      }
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      return { pdfjs, pkgDir, createCanvas: canvasLib.createCanvas };
    })();
    pdfEnginePromise.catch(() => { pdfEnginePromise = null; });
  }
  return pdfEnginePromise;
}

async function pdfThumbnail(buf) {
  const { pdfjs, pkgDir, createCanvas } = await loadPdfEngine();

  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: path.join(pkgDir, 'standard_fonts') + path.sep,
    cMapUrl: path.join(pkgDir, 'cmaps') + path.sep,
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tiempo agotado al generar la miniatura')), PDF_TIMEOUT_MS);
  });

  const render = (async () => {
    const pdf = await task.promise;
    try {
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(THUMB_WIDTH / base.width, THUMB_MAX_HEIGHT / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toBuffer('image/jpeg', 78);
    } finally {
      await pdf.destroy();
    }
  })();

  try {
    return await Promise.race([render, timeout]);
  } finally {
    clearTimeout(timer);
    task.destroy().catch(() => {});
  }
}

/** Devuelve un Buffer JPEG con la miniatura, o null si no fue posible generarla. */
async function makeThumbnail(buf, mime) {
  try {
    if (mime === 'application/pdf') return await pdfThumbnail(buf);
    if (mime === 'image/png' || mime === 'image/jpeg') return await imageThumbnail(buf);
    return null;
  } catch (err) {
    console.warn('[miniatura] no se pudo generar:', err && err.message);
    return null;
  }
}

module.exports = { makeThumbnail };