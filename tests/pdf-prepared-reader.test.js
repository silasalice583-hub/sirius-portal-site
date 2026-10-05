const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pdf-prepared-reader.js'), 'utf8');
function element(tag = 'div') {
  return { tag, children: [], style: {}, dataset: {}, isConnected: true, classList: { add() {} },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; },
    remove() { this.removed = true; }, setAttribute() {}, removeAttribute() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    getBoundingClientRect() { return { top: 0, bottom: 500 }; } };
}
function fixture() {
  const pending = [], observers = [];
  const tiles = Array.from({ length: 10 }, (_, i) => ({ src: `${i}.webp`, mobile: `${i}-mobile.webp`, top: i * 600, height: 600, text: [{ text: 'Original text', x: 4, y: 4, size: 10, width: 80, eol: true }], links: [] }));
  const scope = { URL, AbortController, DOMException, innerHeight: 800, location: { origin: 'https://site.test' }, console,
    matchMedia: () => ({ matches: true }), document: { baseURI: 'https://site.test/articles.html', createElement: element },
    fetch: async () => ({ ok: true, json: async () => ({ version: 1, transparent: true, width: 400, tiles }) }),
    Image: class { constructor() { Object.assign(this, element('img')); pending.push(this); } },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  };
  vm.runInNewContext(source.replace(/export /g, '') + '\nthis.reader = { render, disposeWithin };', scope);
  const owner = element(); owner.dataset = { pdfPreviewSrc: 'assets/reader.json' };
  return { ...scope, scope, pending, owner, observers };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('PDF slices override the legacy 760px important cap and fill their reserved geometry', () => {
  // Important declarations inside site-base outrank even more specific
  // unlayered rules: exclude prepared slices from ordinary illustration caps.
  const base = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(base, /\.reader-body img:not\(\.pdf-prepared-image\),\s*\.reader-body \.article-content-image:not\(\.pdf-prepared-image\)\s*\{[^}]*max-width:\s*min\(100%, 760px\)\s*!important/);
  const css = fs.readFileSync(path.join(root, 'cosmic-refinement.css'), 'utf8');
  const rule = /\.reader-body \.pdf-prepared-tile \.pdf-prepared-image\s*\{([^}]+)\}/.exec(css)?.[1];
  assert.ok(rule);
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /(?:^|;)\s*width:\s*100%\s*!important/);
  assert.match(rule, /(?:^|;)\s*height:\s*100%\s*!important/);
  assert.match(rule, /max-width:\s*none\s*!important/);
  assert.match(css, /\.pdf-prepared-tile\s*\{[^}]*position:\s*relative/);
});
test('prepared reader uses mobile tiles, limits concurrent loading and releases distant images', async () => {
  const f = fixture(); await f.reader.render(f.owner);
  const nodes = f.owner.children[0].children;
  f.observers[0].callback(nodes.map(target => ({ target, isIntersecting: true })));
  assert.equal(f.pending.length, 2);
  assert.match(f.pending[0].src, /0-mobile.webp$/);
  for (let i = 0; i < 10; i++) { f.pending[i].onload(); await tick(); }
  assert.equal(nodes.filter(n => n.dataset.renderState === 'ready').length, 10);
  nodes.slice(0, 7).forEach(n => n.getBoundingClientRect = () => ({ top: -3000, bottom: -2500 }));
  f.observers[0].callback([]);
  assert.equal(nodes.filter(n => n.dataset.renderState === 'ready').length, 3);
  assert.ok(nodes.slice(0, 7).every(n => n.children.length === 0));
  f.reader.disposeWithin(f.owner);
  assert.ok(f.observers[0].disconnected);
  assert.ok(nodes.every(n => n.children.length === 0));
});
test('failed tile can retry and navigation aborts pending image work', async () => {
  const f = fixture(); await f.reader.render(f.owner);
  const first = f.owner.children[0].children[0];
  f.pending[0].onerror(); await tick();
  assert.equal(first.dataset.renderState, 'error');
  first.children[0].onclick();
  assert.equal(f.pending.length, 2);
  f.pending[1].onload(); await tick();
  assert.equal(first.dataset.renderState, 'ready');
  f.reader.disposeWithin(f.owner);
  assert.equal(first.children.length, 0);
});
test('all prepared articles preserve full height/text and point to compact cache-versioned assets', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'exports/女神回归-2026-09-09至2026-09-21-文章配置.json'), 'utf8'));
  for (const article of config.articles) {
    const src = /data-pdf-preview-src="([^"]+)"/.exec(article.html)?.[1];
    assert.ok(src, article.id);
    const file = path.join(root, src), data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.transparent, true); assert.equal(data.omittedPaperOperations.length, 2);
    let top = 0, text = 0;
    for (const tile of data.tiles) {
      assert.ok(Math.abs(tile.top - top) < .001); top += tile.height; text += tile.text.length;
      for (const name of [tile.src, tile.mobile]) {
        assert.match(name, /^tile-\d{3}(?:-mobile)?-[a-f0-9]{12}\.webp$/);
        assert.ok(fs.statSync(path.join(path.dirname(file), name)).size < 25 * 1024 * 1024);
      }
    }
    assert.ok(Math.abs(top - data.height) < .001); assert.equal(text, data.textItems);
    assert.ok(data.tiles[0].mobileBytes < data.sourceBytes / 10);
  }
});
