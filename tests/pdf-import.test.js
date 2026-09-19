const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../pdf-import-core.js");

const catalogPath = path.join(__dirname, "../output/pdf/科幻小说文章拆分-可复制文字版/导入索引.json");
const catalog = fs.existsSync(catalogPath)
  ? JSON.parse(fs.readFileSync(catalogPath, "utf8")).articles : null;

test("publication dates are parsed without confusing following numbers", () => {
  assert.deepEqual(core.findDate("2026.8.8 12:21 扬升门户开启报告"), {
    date: "2026-08-08", approximate: false,
  });
  assert.deepEqual(core.findDate("25.8.22 1221 扬升门户开启成果报告"), {
    date: "2025-08-22", approximate: false,
  });
  assert.deepEqual(core.findDate("2024 年 10 月会议"), {
    date: "2024-10-01", approximate: true,
  });
  assert.deepEqual(core.findDate("2024-02-31 文稿"), {
    date: "2024-02-01", approximate: true,
  });
});

test("all split PDFs have importable metadata", { skip: !catalog && "local split PDFs are not present" }, () => {
  const entries = Object.values(catalog);
  assert.equal(entries.length, 786);
  assert.deepEqual([...new Set(entries.map((entry) => entry.category))].sort(), ["会议", "访谈", "门户更新"].sort());
  for (const entry of entries) {
    const actual = core.inferMetadata({ name: entry.file, size: entry.bytes }, entry);
    assert.equal(actual.id, entry.id);
    assert.match(actual.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(actual.title);
    assert.ok(actual.category);
    assert.equal(entry.pages.length > 0, true);
  }
});

test("legacy text fallback no longer forces justified alignment", async () => {
  const fixture = {
    title: "示例文章",
    pages: [{ w: 500, h: 700, lines: [{ t: "彩色正文", x: 20, y: 50, b: 68, s: 11, c: "#7030a0" }],
      images: [{ x: 20, y: 100, w: 400, h: 200 }] }],
  };
  const html = await core.catalogArticleHTML(fixture, async () => "/test-image.jpg");
  assert.match(html, /font-size:18px/);
  assert.match(html, /text-align:left/);
  assert.match(html, /color:#7030a0/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.doesNotMatch(html, /excerpt|简介/);
});

test("PDF insertion stores the original document instead of page images", () => {
  const html = core.pdfDocumentHTML("示例文章");
  assert.match(html, /class="pdf-document"/);
  assert.match(html, /data-pdf-title="示例文章"/);
  assert.match(html, /contenteditable="false"/);
  assert.doesNotMatch(html, /data-pdf-src|<img|text-align:justify/);
});

test("local split PDF catalog has matching images and colors", { skip: !catalog && "local split PDFs are not present" }, async () => {
  const first = Object.values(catalog).find((entry) => entry.id === "cobra-pdf-0001");
  const meeting = Object.values(catalog).find((entry) => entry.id === "cobra-pdf-0692");
  const firstHTML = await core.catalogArticleHTML(first, async () => "/test-image.jpg");
  const meetingHTML = await core.catalogArticleHTML(meeting, async () => "/test-image.jpg");
  assert.equal((firstHTML.match(/<img /g) || []).length, 5);
  assert.match(firstHTML, /font-size:18px/);
  assert.match(firstHTML, /text-align:left/);
  assert.match(meetingHTML, /color:#7030a0/);
  assert.doesNotMatch(firstHTML, /excerpt|简介/);
  const illustrated = Object.values(catalog).find((entry) => entry.id === "cobra-pdf-0565");
  const illustratedHTML = await core.catalogArticleHTML(illustrated, async () => "/test-image.jpg");
  assert.match(illustratedHTML, /图片页识别文字（需人工校对）/);
});

test("generic PDFs infer type from their title", () => {
  assert.equal(core.categoryFromTitle("2026 年凤凰城会议笔记"), "会议");
  assert.equal(core.categoryFromTitle("2025 年柯博拉专访"), "访谈");
  assert.equal(core.categoryFromTitle("2025 年集体冥想"), "门户更新");
  assert.equal(core.categoryFromTitle("会议纪要", "科幻小说文章拆分/会议/2026/会议纪要.pdf"), "会议");
});

test("Xiumi show filenames use the PDF metadata title instead of the export id", () => {
  const metadata = core.inferMetadata(
    { name: "show_726640030_1789826675920.pdf", size: 2711018 },
    null,
    "新天新地密钥\n2026 年 3 月 8 日讯息",
  );
  assert.equal(metadata.title, "新天新地密钥");
  assert.equal(metadata.date, "2026-03-08");
});

test("same-stem cover images are matched to PDFs deterministically", () => {
  const files = [
    { name: "0001_文章.pdf", type: "application/pdf", size: 100 },
    { name: "0001_文章.png", type: "image/png", size: 200 },
    { name: "0001_文章.jpg", type: "image/jpeg", size: 150 },
    { name: "另一篇.jpg", type: "image/jpeg", size: 160 },
  ];
  const covers = core.coverFileMap(files);
  assert.equal(core.fileStem(files[0].name), "0001_文章");
  assert.equal(covers.get(core.fileStem(files[0].name)).name, "0001_文章.jpg");
  assert.equal(covers.has("不存在"), false);
  assert.equal(core.isCoverImage({ name: "封面.webp", type: "" }), true);
  assert.equal(core.isCoverImage(files[0]), false);
});
