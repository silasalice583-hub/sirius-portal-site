const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pdf-inline-viewer.js'), 'utf8');

function viewer(extra = {}) {
  const scope = { window: { location: { origin: 'http://localhost' }, addEventListener() {}, removeEventListener() {} },
    URL, console, matchMedia: () => ({ matches: false }), ...extra };
  vm.runInNewContext(source.replace('  window.SiriusPdfInlineViewer =',
    '  window.testing = { removeFooterNumbers, trimmedVerticalBounds, renderPage, renderDocument };\n  window.SiriusPdfInlineViewer ='), scope);
  return scope.window.testing;
}

test('transparent footer cleanup clears pixels instead of painting a white patch', () => {
  const calls = [];
  const context = { fillRect: (...args) => calls.push(['fill', ...args]), clearRect: (...args) => calls.push(['clear', ...args]) };
  const pdfjs = { Util: { transform: (_viewport, transform) => transform } };
  const content = { items: [{ str: '1', transform: [1, 0, 0, 10, 295, 820], width: 6 }] };
  const viewport = { width: 595, height: 842, scale: 1 };
  const { removeFooterNumbers } = viewer();
  const transparent = removeFooterNumbers(pdfjs, content, viewport, context, true);
  const opaque = removeFooterNumbers(pdfjs, content, viewport, context, false);
  assert.equal(calls[0][0], 'clear');
  assert.equal(calls[1][0], 'fill');
  assert.deepEqual(transparent, opaque);
});

test('transparent black RGB pixels are empty margins, not page content', () => {
  const width = 100, height = 128;
  for (const alpha of [0, 255]) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = alpha;
      pixels[i + 3] = alpha;
    }
    for (let y = 40; y <= 80; y++) for (let x = 20; x <= 50; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; pixels[i + 3] = 255;
    }
    const context = { getImageData: (_x, y, w, h) => ({ data: pixels.slice(y * w * 4, (y + h) * w * 4) }) };
    const bounds = viewer().trimmedVerticalBounds(context, { width, height }, 1, height);
    assert.equal(bounds.top, 38); assert.equal(bounds.bottom, 83);
  }
});

test('empty transparent pages retain a valid aspect ratio', () => {
  const context = { getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  const bounds = viewer().trimmedVerticalBounds(context, { width: 100, height: 128 }, 1, 128);
  assert.equal(bounds.top, 0); assert.equal(bounds.bottom, 128);
});

test('reader opts in, editor stays opaque, and retry preserves the transparent mode', async () => {
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /renderWithin\(readerBody, \{ transparentPaper: true \}\)/);
  const modes = [];
  const element = { dataset: {}, classList: { toggle: (_name, enabled) => modes.push(enabled) },
    querySelectorAll: () => [], querySelector: () => null, append() {} };
  const api = viewer({ document: { createElement: () => ({}) } });
  await api.renderDocument(element, false, true);
  await api.renderDocument(element, true, true);
  await api.renderDocument(element, false);
  assert.deepEqual(modes, [true, false, false]);
  assert.match(source, /renderDocument\(element, editable, transparentPaper\)/);
});

test('reader styles preserve decorative border, opaque art and invisible selection text', () => {
  const css = fs.readFileSync(path.join(root, 'cosmic-refinement.css'), 'utf8');
  assert.match(css, /pdf-transparent-paper[^}]+background: transparent/s);
  assert.match(css, /reader-body:has\(> .pdf-document\)[^}]+border-block: 1px/s);
  assert.match(css, /pdf-transparent-paper .pdf-vector-text[^}]+drop-shadow/s);
  assert.doesNotMatch(css, /pdf-transparent-paper[^}]+(?:mix-blend-mode|opacity):/s);
  assert.match(source, /context.clearRect\(0, 0, canvas.width, canvas.height\)/);
  assert.match(source, /alpha: transparentPaper/);
  assert.match(source, /background: transparentPaper \? "rgba\(0,0,0,0\)" : "#fff"/);
});
