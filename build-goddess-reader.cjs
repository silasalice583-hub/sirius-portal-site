// Read-only PDF rasterization. Source PDFs are never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const runtimeRequire = process.env.SIRIUS_RENDER_RUNTIME
  ? createRequire(path.resolve(process.env.SIRIUS_RENDER_RUNTIME, 'package.json')) : require;
const { createCanvas, DOMMatrix, Path2D, ImageData, GlobalFonts } = runtimeRequire('@napi-rs/canvas');
const sharp = runtimeRequire('sharp');
Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
globalThis.FontFace = class {
  constructor(family, data) {
    this.family = family;
    if (!GlobalFonts.register(Buffer.from(data), family)) throw new Error(`Missing font ${family}`);
    this.loaded = Promise.resolve(this);
  }
  load() { return this.loaded; }
};
const document = { fonts: new Set(), createElement: name => name === 'canvas' ? createCanvas(1, 1) : { style: {} } };
globalThis.document = document;
class CanvasFactory {
  create(width, height) { const canvas = createCanvas(width, height); return { canvas, context: canvas.getContext('2d') }; }
  reset(target, width, height) { target.canvas.width = width; target.canvas.height = height; }
  destroy(target) { target.canvas.width = target.canvas.height = 0; target.canvas = target.context = null; }
}
const root = __dirname;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const round = value => Math.round(value * 10000) / 10000;

// Omit only early white filled rectangles covering the complete page. Keep
// white pixels inside photos and cards; never colour-key the rendered image.
function paperOperations(pdfjs, list, viewport) {
  const omitted = new Set(), stack = [];
  let matrix = [1, 0, 0, 1, 0, 0], fill = '', contentStarted = false;
  list.fnArray.forEach((op, index) => {
    const args = list.argsArray[index];
    if (op === pdfjs.OPS.save) stack.push({ matrix: [...matrix], fill });
    if (op === pdfjs.OPS.restore) ({ matrix, fill } = stack.pop() || { matrix, fill });
    if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
    if (op === pdfjs.OPS.setFillRGBColor) fill = args[0];
    if ([pdfjs.OPS.paintImageXObject, pdfjs.OPS.showText, pdfjs.OPS.showSpacedText].includes(op)) contentStarted = true;
    if (contentStarted || op !== pdfjs.OPS.constructPath || args[0] !== pdfjs.OPS.fill) return;
    if (!/^#(?:fc|fd|fe|ff){3}$/i.test(fill)) return;
    const bounds = Array.from(args[2] || []);
    if (bounds.length !== 4) return;
    const point = (x, y) => [x * matrix[0] + y * matrix[2] + matrix[4], x * matrix[1] + y * matrix[3] + matrix[5]];
    const a = point(bounds[0], bounds[1]), b = point(bounds[2], bounds[3]);
    if (Math.abs(b[0] - a[0]) >= viewport.width * .99 && Math.abs(b[1] - a[1]) >= viewport.height * .99) omitted.add(index);
  });
  if (omitted.size !== 2) throw new Error(`Expected two source paper rectangles, found ${omitted.size}`);
  return omitted;
}

async function main() {
  const pdfjs = await import(pathToFileURL(path.join(root, 'vendor/pdfjs/pdf.min.mjs')));
  const vendor = path.join(root, 'vendor/pdfjs') + path.sep;
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(vendor + 'pdf.worker.min.mjs').href;
  for (const number of process.argv.slice(2).length ? process.argv.slice(2) : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))) {
    const original = path.join(root, `content/goddess-return/${number}/original.pdf`);
    const source = fs.existsSync(original) ? fs.readFileSync(original)
      : Buffer.concat(fs.readdirSync(path.dirname(original)).filter(name => /^original\.part-\d{2}\.bin$/.test(name)).sort()
        .map(name => fs.readFileSync(path.join(path.dirname(original), name))));
    if (!source.length) throw new Error(`Missing PDF source ${number}`);
    const folder = path.join(root, `assets/articles/goddess-return/${number}`);
    const task = pdfjs.getDocument({ data: new Uint8Array(source), ownerDocument: document, CanvasFactory,
      disableFontFace: false, useSystemFonts: false, standardFontDataUrl: vendor + 'standard_fonts/',
      cMapUrl: vendor + 'cmaps/', cMapPacked: true, wasmUrl: vendor + 'wasm/' });
    try {
      const pdf = await task.promise;
      if (pdf.numPages !== 1) throw new Error('Unexpected source page count');
      const page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
      const omitted = paperOperations(pdfjs, await page.getOperatorList(), base);
      const text = await page.getTextContent(), annotations = await page.getAnnotations();
      const items = text.items.filter(item => typeof item.str === 'string' && item.str).map(item => {
        const m = pdfjs.Util.transform(base.transform, item.transform), size = Math.hypot(m[2], m[3]);
        const ascent = text.styles[item.fontName]?.ascent ?? .8;
        return { text: item.str, x: round(m[4]), y: round(m[5] - size * ascent), width: round(item.width),
          size: round(size), center: m[5] - size * .4, eol: !!item.hasEOL };
      });
      const links = annotations.filter(a => /^https?:/i.test(a.url || '')).map(a => {
        const r = base.convertToViewportRectangle(a.rect);
        return { url: a.url, x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), width: Math.abs(r[2] - r[0]), height: Math.abs(r[3] - r[1]) };
      });
      const result = { version: 1, sourceSha256: hash(source), sourceBytes: source.length, width: base.width,
        height: base.height, transparent: true, omittedPaperOperations: [...omitted], textItems: items.length, tiles: [] };
      for (let top = 0, index = 0; top < base.height; top += base.width * 1.5, index++) {
        const height = Math.min(base.width * 1.5, base.height - top), scale = 4;
        const viewport = page.getViewport({ scale, offsetY: -top * scale }); viewport.height = height * scale;
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d', { alpha: true });
        let filtered = 0;
        await page.render({ canvas: null, canvasContext: context, viewport, background: 'rgba(0,0,0,0)',
          operationsFilter: operation => { if (omitted.has(operation)) { filtered++; return false; } return true; } }).promise;
        if (index === 0 && (filtered !== 2 || context.getImageData(0, 0, 1, 1).data[3] !== 0)) throw new Error('Paper transparency verification failed');
        const png = canvas.toBuffer('image/png');
        const desktop = await sharp(png).webp({ lossless: true, effort: 4 }).toBuffer();
        const mobile = await sharp(png).resize({ width: Math.round(base.width * 2) }).webp({ lossless: true, effort: 4 }).toBuffer();
        const stem = String(index + 1).padStart(3, '0');
        const src = `tile-${stem}-${hash(desktop).slice(0, 12)}.webp`, small = `tile-${stem}-mobile-${hash(mobile).slice(0, 12)}.webp`;
        fs.writeFileSync(path.join(folder, src), desktop); fs.writeFileSync(path.join(folder, small), mobile);
        result.tiles.push({ top, height, src, mobile: small, bytes: desktop.length, mobileBytes: mobile.length,
          text: items.filter(item => item.center >= top && item.center < top + height).map(({ center, ...item }) => ({ ...item, y: round(item.y - top) })),
          links: links.filter(link => link.y < top + height && link.y + link.height > top).map(link => ({ ...link, y: link.y - top })) });
        canvas.width = canvas.height = 0;
      }
      if (result.tiles.reduce((sum, tile) => sum + tile.text.length, 0) !== items.length) throw new Error('Text omitted at a tile boundary');
      const json = JSON.stringify(result), manifest = `reader-${hash(json).slice(0, 12)}.json`;
      fs.writeFileSync(path.join(folder, manifest), json + '\n');
      const keep = new Set([manifest, ...result.tiles.flatMap(tile => [tile.src, tile.mobile])]);
      // These are generated outputs of this builder only; never source PDFs/covers.
      for (const name of fs.readdirSync(folder)) {
        if (/^(?:tile-\d{3}(?:-mobile)?-[a-f0-9]{12}\.webp|reader-[a-f0-9]{12}\.json)$/.test(name) && !keep.has(name)) {
          const stale = path.resolve(folder, name);
          if (path.dirname(stale) !== path.resolve(folder)) throw new Error('Invalid generated output path');
          fs.unlinkSync(stale);
        }
      }
      console.log(JSON.stringify({ number, manifest, tiles: result.tiles.length, sourceBytes: source.length,
        firstMobileBytes: result.tiles[0].mobileBytes, totalMobileBytes: result.tiles.reduce((sum, tile) => sum + tile.mobileBytes, 0) }));
    } finally { await task.destroy(); }
    global.gc?.();
  }
}
if (require.main === module) main().catch(error => { console.error(error.message, error.stack?.split('\n').slice(1, 4).join('\n')); process.exitCode = 1; });
module.exports = { paperOperations, CanvasFactory };
