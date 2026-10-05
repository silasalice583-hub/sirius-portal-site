const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const base = '女神回归-2026-09-09至2026-09-21';
const config = JSON.parse(fs.readFileSync(path.join(root, 'exports', `${base}-文章配置.json`), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'exports', `${base}-校验清单.json`), 'utf8'));
const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'articles-data.js'), 'utf8'), scope);
const all = JSON.parse(JSON.stringify(scope.window.SIRIUS_ARTICLES));

test('all twelve Goddess Return articles have unique stable IDs and evenly assigned endpoint dates', () => {
  const dates = ['09','10','11','12','13','14','16','17','18','19','20','21'].map(day => `2026-09-${day}`);
  assert.equal(config.articleCount, 12);
  assert.equal(new Set(all.map(article => article.id)).size, all.length);
  for (const [index, article] of config.articles.entries()) {
    assert.equal(article.id, `goddess-return-${String(index + 1).padStart(2, '0')}`);
    assert.equal(article.date, dates[index]);
    assert.equal(article.category, '文章更新');
    assert.deepEqual(all.find(item => item.id === article.id), article);
  }
});

test('the series preserves original PDFs and full composition covers outside the ending cards', () => {
  for (const article of config.articles) {
    assert.match(article.html, /data-pdf-preserve-original="true"/);
    assert.match(article.html, /contenteditable="false"/);
    assert.ok(article.html.includes(`data-pdf-src="${article.sourcePdf}"`));
    assert.equal(article.showSourcePdf, false);
    assert.equal(article.pdfLayoutMode, 'embedded-pdf');
    const entry = manifest.articles.find(item => item.id === article.id);
    const bytes = article.id === 'goddess-return-01' && !fs.existsSync(path.join(root, article.sourcePdf))
      ? Buffer.concat(manifest.originalDownload.parts.map(part => fs.readFileSync(path.join(root, part.path.slice(1)))))
      : fs.readFileSync(path.join(root, article.sourcePdf));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, entry.websiteSha256);
    assert.equal(hash, entry.sourceSha256);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(entry.coverSource.beforeFooter, true);
    for (const cover of [article.cover, article.coverMobile]) assert.ok(fs.statSync(path.join(root, cover)).size > 0);
  }
});

test('explicit mobile covers and scoped series styling survive reading and returning to the list', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const imageFunction = app.slice(app.indexOf('  function coverImageAttributes('), app.indexOf('  function applyPageVisuals('));
  for (const matches of [true, false]) {
    const result = vm.runInNewContext(imageFunction + '\ncoverImageAttributes(article, "400px");', {
      article: config.articles[0], mobileLayout: { matches }, window: {},
      defaultPage: {}, mobileCoverPath: () => '', escapeHTML: text => text,
    });
    assert.ok(result.includes(config.articles[0].coverMobile));
    if (matches) assert.doesNotMatch(result, /srcset/);
    else assert.match(result, /srcset/);
  }
  assert.match(app, /reader\.classList\.toggle\("series-goddess-return"/);
  assert.match(app, /classList\.remove\([^\n]*"series-goddess-return"/);
  const css = fs.readFileSync(path.join(root, 'cosmic-refinement.css'), 'utf8');
  assert.match(css, /\.article-card\.series-goddess-return > img\s*\{[^}]*object-fit: contain/);
  assert.match(css, /\.reader\.series-goddess-return #readerCover\s*\{[^}]*object-fit: contain/);
  const html = fs.readFileSync(path.join(root, 'articles.html'), 'utf8');
  for (const resource of ['articles-data.js', 'app.js', 'pdf-inline-viewer.js', 'cosmic-refinement.css']) {
    const version = resource === 'cosmic-refinement.css' ? '20261005-seams1' : '20261005-fast1';
    assert.ok(html.includes(`${resource}?v=${version}`));
  }
});
