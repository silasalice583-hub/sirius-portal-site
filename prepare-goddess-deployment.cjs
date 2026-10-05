// Generate deployable binary pieces and refresh the portable article export.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = __dirname;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const writeJSON = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
const original = path.join(root, 'content/goddess-return/01/original.pdf');
const file = fs.existsSync(original) ? fs.readFileSync(original)
  : Buffer.concat(fs.readdirSync(path.dirname(original)).filter(name => /^original\.part-\d{2}\.bin$/.test(name)).sort()
    .map(name => fs.readFileSync(path.join(path.dirname(original), name))));
if (!file.length) throw new Error('Missing original PDF source');
const info = { bytes: file.length, sha256: hash(file), parts: [] };
for (let offset = 0, number = 1; offset < file.length; offset += 16 * 1024 * 1024, number++) {
  const bytes = file.subarray(offset, offset + 16 * 1024 * 1024);
  const name = `content/goddess-return/01/original.part-${String(number).padStart(2, '0')}.bin`;
  fs.writeFileSync(path.join(root, name), bytes);
  info.parts.push({ path: '/' + name, offset, bytes: bytes.length, sha256: hash(bytes) });
}
fs.writeFileSync(path.join(root, 'goddess-pdf-parts.mjs'), 'export default ' + JSON.stringify(info, null, 2) + ';\n');
const scope = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'articles-data.js'), 'utf8'), scope);
const articles = scope.window.SIRIUS_ARTICLES;
const base = 'exports/女神回归-2026-09-09至2026-09-21';
const manifest = JSON.parse(fs.readFileSync(path.join(root, base + '-校验清单.json'), 'utf8'));
const files = [];
for (const article of articles.filter(a => /^goddess-return-\d{2}$/.test(a.id))) {
  const directory = `assets/articles/goddess-return/${article.id.slice(-2)}`;
  const readers = fs.readdirSync(path.join(root, directory)).filter(name => /^reader-.*\.json$/.test(name));
  if (readers.length !== 1) throw new Error(`Expected one prepared reader: ${directory}`);
  const reader = `${directory}/${readers[0]}`;
  const data = JSON.parse(fs.readFileSync(path.join(root, reader), 'utf8'));
  const record = manifest.articles.find(a => a.id === article.id);
  if (record.sourceSha256 !== data.sourceSha256) throw new Error(`Source changed: ${article.id}`);
  article.html = article.html.replace(/ data-pdf-preview-src="[^"]*"/g, '').replace(' data-pdf-preserve-original=', ` data-pdf-preview-src="${reader}" data-pdf-preserve-original=`);
  record.preparedReader = reader;
  record.transparentPaper = true;
  files.push(article.sourcePdf, article.cover, article.coverMobile, reader);
  for (const tile of data.tiles) files.push(`${directory}/${tile.src}`, `${directory}/${tile.mobile}`);
}
files.push(...info.parts.map(part => part.path.slice(1)));
manifest.version = 2; manifest.originalDownload = info;
manifest.files = [...new Set(files)].map(name => {
  const bytes = name === 'content/goddess-return/01/original.pdf' ? file : fs.readFileSync(path.join(root, name));
  return { path: name, bytes: bytes.length, sha256: hash(bytes) };
});
fs.writeFileSync(path.join(root, 'articles-data.js'), 'window.SIRIUS_ARTICLES = ' + JSON.stringify(articles, null, 2) + ';\n');
writeJSON(base + '-校验清单.json', manifest);
const config = JSON.parse(fs.readFileSync(path.join(root, base + '-文章配置.json'), 'utf8'));
config.version = 2; config.exportedAt = new Date().toISOString();
config.articles = articles.filter(a => /^goddess-return-\d{2}$/.test(a.id)).sort((a, b) => a.id.localeCompare(b.id));
writeJSON(base + '-文章配置.json', config);
console.log(JSON.stringify({ articles: config.articles.length, assets: manifest.files.length, originalPdfBytes: info.bytes, parts: info.parts.length }));
