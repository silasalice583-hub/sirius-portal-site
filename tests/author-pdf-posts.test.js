const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const raw = fs.readFileSync(path.join(root, "articles-data.js"), "utf8").trim();
const prefix = "window.SIRIUS_ARTICLES = ";
assert.ok(raw.startsWith(prefix) && raw.endsWith(";"));
const articles = JSON.parse(raw.slice(prefix.length, -1));

for (const [id, title, author, figureCount] of [
  ["wechat-pdf-2026-09-20-fruit-basket", "水果锦囊：携带宇宙能量的珠宝", "苍焰", 3],
  ["wechat-pdf-2026-09-19-heaven-earth-keys", "新天新地密钥", "向明", 1],
]) {
  test(`${title} is published as text with local illustrations`, () => {
    const matches = articles.filter((article) => article.id === id);
    assert.equal(matches.length, 1);
    const article = matches[0];
    assert.equal(article.title, title);
    assert.equal(article.author, author);
    assert.equal(article.canonicalAuthor, author);
    assert.equal(article.category, "文章更新");
    assert.equal(article.excerpt, "");
    assert.equal(article.assetCount, figureCount);
    assert.equal(article.images.length, figureCount);
    assert.equal((article.html.match(/<figure class="wechat-figure">/g) || []).length, figureCount);
    assert.match(article.html, new RegExp(`<p class="wechat-signature">${author}</p>$`));
    assert.ok(article.paragraphs.length > 20);
    assert.doesNotMatch(article.html, /[\u2e80-\u2fff\x00]/u);
    assert.doesNotMatch(article.html, /交流Q群|收听来自光方的冥想音乐/);
    for (const image of article.images) {
      const imagePath = path.join(root, image);
      assert.ok(fs.existsSync(imagePath), `${image} is missing`);
      assert.ok(fs.statSync(imagePath).size > 1000, `${image} is empty`);
    }
  });
}

test("Xiangming's interview quotations retain the source PDF's gray hierarchy", () => {
  const article = articles.find((item) => item.id === "wechat-pdf-2026-09-19-heaven-earth-keys");
  assert.ok((article.html.match(/class="wechat-quote"/g) || []).length >= 10);
  assert.ok((article.html.match(/class="wechat-source-line"/g) || []).length >= 5);
});
