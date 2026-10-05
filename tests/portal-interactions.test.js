const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const paginationSource = app.slice(app.indexOf('  function renderPagination('), app.indexOf('  function isGeneratedComment('));
test('pagination follows every active page and preserves both endpoints', () => {
  for (let total = 2; total <= 100; total++) {
    for (let current = 1; current <= total; current++) {
      const box = { innerHTML: '' };
      vm.runInNewContext(paginationSource + `\nrenderPagination(${total});`, { $: () => box, currentPage: current });
      assert.match(box.innerHTML, new RegExp(`aria-current="page" data-page="${current}"`));
      assert.match(box.innerHTML, /data-page="1"/);
      assert.match(box.innerHTML, new RegExp(`data-page="${total}"`));
      if (current > 1) assert.match(box.innerHTML, new RegExp(`data-page="${current - 1}"`));
      if (current < total) assert.match(box.innerHTML, new RegExp(`data-page="${current + 1}"`));
      assert.ok([...box.innerHTML.matchAll(/<button/g)].length <= 11);
    }
  }
});
test('all live astronomical scenes have desktop and mobile images; Jupiter is not active', () => {
  const ui = fs.readFileSync(path.join(root, 'cosmic-ui.js'), 'utf8');
  assert.doesNotMatch(ui, /jupiter|pleiades-merope|andromeda-galex/);
  for (const name of ['earth','sirius-artwork','sirius-sky','milky-way-center','pleiades-cluster','gemini-sky','pillars-hd','andromeda-m31']) {
    for (const suffix of ['', '-mobile']) assert.ok(fs.existsSync(path.join(root, `assets/space/${name}${suffix}.webp`)));
  }
});
test('all public entry points receive final interaction styles and existing local resources', () => {
  for (const file of ['index.html','articles.html','about.html','meditation.html','collective-meditation.html','publisher.html','site-editor.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    if (!/publisher|site-editor/.test(file)) assert.match(html, /interaction-refinement.css\?v=20261005-art2/);
    for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)) {
      const resource = match[1];
      if (/^(?:https?:|#|mailto:|data:)/.test(resource)) continue;
      assert.ok(fs.existsSync(path.join(root, resource)), `${file}: missing ${resource}`);
    }
  }
});
test('returning from an article releases its document rather than retaining a hidden canvas', () => {
  const exit = app.slice(app.indexOf('  function exitReader()'), app.indexOf('  function bindEvents()'));
  assert.match(exit, /disposeWithin/);
  assert.match(exit, /replaceChildren/);
});
test('persisted PDF loading markers cannot suppress a fresh render', () => {
  const source = fs.readFileSync(path.join(root, 'pdf-inline-viewer.js'), 'utf8');
  assert.doesNotMatch(source, /\["loading", "done"\]\.includes\(element.dataset.pdfRendered\)/);
  assert.match(source, /controller.element === element && !controller.disposed/);
  assert.match(source, /这篇文章缺少原 PDF 附件地址/);
});
test('music uses actual playing state and explains a missing audio source', () => {
  assert.match(app, /addEventListener\("playing"/);
  assert.match(app, /尚未配置背景音乐。请在网页编辑器/);
  assert.doesNotMatch(app, /toggle.disabled = true/);
});

test('archive reader uses a full-width cover and safely restores text if the cover is absent or broken', () => {
  const source = app.slice(app.indexOf('    const hasCover ='), app.indexOf('    readerCover.alt ='));
  for (const category of ['门户更新','访谈','会议','文章更新','相关资料']) {
    for (const cover of ['cover.jpg', '']) {
      const classes = new Set();
      const reader = { dataset: {}, classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      } };
      const image = { removeAttribute(name) { delete this[name]; } };
      vm.runInNewContext(source, {
        article: { id: 'sample', category, cover }, reader, $: () => image,
        mobileCoverPath: () => 'small-cover.webp', mobileLayout: { matches: true },
        window: {}, defaultPage: { logoImage: 'logo.png' }, console,
      });
      const coverOnly = Boolean(cover) && ['门户更新','访谈','会议'].includes(category);
      assert.equal(classes.has('reader-cover-only'), coverOnly);
      assert.equal(image.hidden, !cover);
      if (coverOnly) assert.equal(image.src, 'cover.jpg');
      image.onerror();
      assert.equal(classes.has('reader-cover-only'), false);
      assert.equal(classes.has('reader-no-cover'), true);
      assert.equal(image.hidden, true);
    }
  }
});

test('latest sizing preserves 24px click art and removes reader title truncation', () => {
  const style = fs.readFileSync(path.join(root, 'interaction-refinement.css'), 'utf8');
  assert.match(style, /\.cosmic-click-symbol \{ width: 24px; height: 24px/);
  assert.match(style, /\.cosmic-pen \{ width: 36px; height: 54px/);
  assert.match(style, /#readerTitle \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible/);
  assert.match(style, /font-size: clamp\(58px,10\.8vw,160px\)/);
});

test('the selected background track is bundled and both player and editor share its default', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), { window, location: { hostname: 'localhost' } });
  assert.equal(window.SIRIUS_DEFAULT_MUSIC.title, '世界的一口气');
  const audio = fs.statSync(path.join(root, window.SIRIUS_DEFAULT_MUSIC.url));
  assert.ok(audio.size > 0 && audio.size < 25 * 1024 * 1024);
  assert.match(app, /window.SIRIUS_DEFAULT_MUSIC\?\.url/);
  assert.match(fs.readFileSync(path.join(root, 'site-editor.js'), 'utf8'), /window.SIRIUS_DEFAULT_MUSIC\?\.url/);
});
