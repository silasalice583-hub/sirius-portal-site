const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../pdf-import-core.js");
const vm = require("node:vm");

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

test("flow import preserves PDF line breaks and alignment without forcing justification", () => {
  const result = core.flowLinesToBlocks([
    { text: "示例标题", x: 180, top: 20, bottom: 45, width: 140, right: 320, size: 24, pageWidth: 500, bold: true, color: "#7030a0" },
    { text: "这是第一行文字，", x: 40, top: 70, bottom: 84, width: 410, right: 450, size: 12, pageWidth: 500, color: "#202020" },
    { text: "下一行应当连接成同一个段落。", x: 40, top: 88, bottom: 102, width: 260, right: 300, size: 12, pageWidth: 500, color: "#202020" },
  ], { title: "示例标题", skipTitle: true });
  assert.equal(result.blockCount, 1);
  assert.equal(result.textLength, "这是第一行文字，下一行应当连接成同一个段落。".replace(/\s/g, "").length);
  assert.match(result.html, /class="pdf-flow-paragraph"/);
  assert.match(result.html, /--pdf-font-size:12px/);
  assert.match(result.html, /text-align:left/);
  assert.match(result.html, /第一行文字，<br>下一行/);
  assert.doesNotMatch(result.html, /text-align:justify/);
  assert.match(result.html, /color:#202020/);
  assert.doesNotMatch(result.html, /示例标题/);
});

test("flow import keeps Latin word boundaries and heading hierarchy", () => {
  const result = core.flowLinesToBlocks([
    { text: "A PDF", x: 185, top: 20, bottom: 46, width: 130, right: 315, size: 24, pageWidth: 500, bold: true, color: "#205080" },
    { text: "editor", x: 190, top: 48, bottom: 74, width: 120, right: 310, size: 24, pageWidth: 500, bold: true, color: "#205080" },
    { text: "Body", x: 40, top: 100, bottom: 114, width: 200, right: 240, size: 12, pageWidth: 500, color: "#202020" },
    { text: "text", x: 40, top: 118, bottom: 132, width: 180, right: 220, size: 12, pageWidth: 500, color: "#202020" },
  ], { skipTitle: false });
  assert.match(result.html, /<p class="pdf-flow-heading"[^>]+color:#205080/);
  assert.match(result.html, />A PDF<br>editor<\/p>/);
  assert.match(result.html, />Body<br>text<\/p>/);
});

test("publisher loads editable PDF converter before the batch importer", () => {
  const publisher = fs.readFileSync(path.join(__dirname, "../publisher.html"), "utf8");
  assert.ok(publisher.indexOf("pdf-flow-import.js") > 0);
  assert.ok(publisher.indexOf("pdf-flow-import.js") < publisher.indexOf("pdf-batch-import.js"));
  assert.match(publisher, /id="pdfImportLayout"/);
  assert.match(publisher, /<select id="pdfImportLayout">\s*<option value="embedded">/);
  for (const filename of ["publisher.html", "articles.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    assert.ok(html.indexOf("pdf-vector-text.js") > 0);
    assert.ok(html.indexOf("pdf-vector-text.js") < html.indexOf("pdf-inline-viewer.js"));
  }
});

test("original-layout PDF viewer saves text edits and renders borderless linked pages", () => {
  const viewer = fs.readFileSync(path.join(__dirname, "../pdf-inline-viewer.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
  assert.match(viewer, /dataset\.pdfEdits = JSON\.stringify\(edits\)/);
  assert.match(viewer, /removeFooterNumbers\(pdfjs, textContent, renderViewport, context, transparentPaper\)/);
  assert.match(viewer, /trimmedVerticalBounds\(context, canvas, outputScale, viewport\.height\)/);
  assert.match(viewer, /await addLinks\(page, viewport, surface, textLayerElement\)/);
  assert.match(styles, /\.pdf-rendered-pages \{ display: block; width: 100%; \}/);
  assert.match(styles, /\.pdf-live-page \{[^}]*border: 0;[^}]*box-shadow: none;/s);
  assert.match(styles, /\.pdf-link-layer a \{[^}]*pointer-events: auto;/s);
});

test("split PDF index maps the five full-page-raster illustrations into separate crops", { skip: !catalog && "local split PDFs are not present" }, () => {
  const article = Object.values(catalog).find((entry) => entry.id === "cobra-pdf-0001");
  const rectangles = core.scaledCatalogImageRectangles(article.pages[0], 1190, 730);
  assert.equal(rectangles.length, 5);
  assert.ok(rectangles.every((rectangle) => rectangle.width > 100 && rectangle.height > 100));
  assert.ok(rectangles[0].top < rectangles[3].top);
  assert.ok(rectangles[0].left < rectangles[1].left && rectangles[1].left < rectangles[2].left);
});

test("mobile PDF styles enlarge small text and stack images without removing PDF line breaks", () => {
  const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
  assert.match(styles, /\.pdf-flow-page p \{ font-size: max\(16px, var\(--pdf-font-size, 16px\)\) !important; \}/);
  assert.match(styles, /\.pdf-flow-image-row \{ flex-direction: column/);
  const html = core.flowLinesToBlocks([
    { text: "第一行", x: 20, top: 20, bottom: 32, size: 11, pageWidth: 500 },
    { text: "第二行", x: 20, top: 36, bottom: 48, size: 11, pageWidth: 500 },
  ]).html;
  assert.match(html, /第一行<br>第二行/);
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

test("wrapped titles are completed without copying a trailing URL or footer", () => {
  const metadata = core.inferMetadata(
    { name: "0365_2012-04-06_2012 年 4 月 6 日讯息【抵抗运.pdf", size: 100 }, null,
    "【地球盟友】【柯博拉 Cobra】2012 年 4 月 6 日讯息【抵抗运\n动】:https://example.com/source\n原文:https://example.com/",
  );
  assert.equal(metadata.title, "2012 年 4 月 6 日讯息【抵抗运动】");
  assert.equal(metadata.titleNeedsReview, false);
  assert.equal(core.completeTitle("2013 年 5 月 24 日讯息【5",
    "2013 年 5 月 24 日讯息【5\n219\n月 25 日门户开启的最后更新】\n正文"),
  "2013 年 5 月 24 日讯息【5月 25 日门户开启的最后更新】");
  assert.equal(core.completeTitle("标题【未完", "完全不相关的正文\n下一行】"), "标题【未完");
});

test("an old catalog's multiline heading is repaired while preserving its article id", () => {
  const file = { name: "0057_文章.pdf", size: 123 };
  const entry = { file: file.name, bytes: 123, id: "cobra-pdf-0057", date: "2013-08-07", category: "会议",
    title: "【地球盟友】2013 年 8 月 7 日讯息【苏黎世的女",
    pages: [{ lines: [{ t: "【地球盟友】2013 年 8 月 7 日讯息【苏黎世的女" }, { t: "219" }] },
      { lines: [{ t: "神螺旋工作坊】" }, { t: "正文内容" }] }] };
  const metadata = core.inferMetadata(file, entry);
  assert.equal(metadata.title, "【地球盟友】2013 年 8 月 7 日讯息【苏黎世的女神螺旋工作坊】");
  assert.equal(metadata.id, entry.id);
  assert.equal(metadata.category, "会议");
});

test("a full PDF heading can repair a truncated filename without brackets", () => {
  const metadata = core.inferMetadata({ name: "0719_2024-04-08_2024年4月8日纽约罗彻斯特新亚特兰提斯工作坊课程笔记重点摘.pdf", size: 123 }, null,
    "2024年4月8日纽约罗彻斯特新亚特兰提斯工作坊课程笔记重点摘录\n正文内容");
  assert.equal(metadata.title, "2024年4月8日纽约罗彻斯特新亚特兰提斯工作坊课程笔记重点摘录");
});

test("footer recognition handles short crops while preserving body numbers", () => {
  const scope = { window: { location: { origin: "http://localhost" } }, URL };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../pdf-inline-viewer.js"), "utf8"), scope);
  const isFooter = scope.window.SiriusPdfInlineViewer.isFooterPosition;
  assert.equal(isFooter("1065", 287, 132, 9, 595, 151.5), true);
  assert.equal(isFooter("219", 290, 823, 9, 595, 842), true);
  assert.equal(isFooter("2012", 205, 18, 10.4, 595, 151.5), false);
  assert.equal(isFooter("2026", 60, 820, 10, 595, 842), false);
  assert.equal(isFooter("123", 287, 500, 10, 595, 842), false);
  assert.equal(isFooter("2026 年", 287, 823, 10, 595, 842), false);
});

test("vector glyph capture retains exact matrices and conservatively falls back", () => {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../pdf-vector-text.js"), "utf8"), scope);
  let painted = 0;
  const context = { fillText() { painted += 1; }, strokeText() { painted += 1; },
    font: "10px embedded-font", fillStyle: "#7030a0", globalAlpha: 1, globalCompositeOperation: "source-over",
    filter: "none", textBaseline: "alphabetic", getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 20, f: 40 }),
    measureText: () => ({ width: 10 }) };
  const capture = scope.window.SiriusPdfVectorText.capture(context, 2);
  context.fillText("字", 1, 2);
  context.fillText("限宽", 1, 2, 20);
  assert.equal(capture.calls[0].vector, true);
  assert.equal(capture.calls[0].matrix.join(), "1,0,0,1,10,20");
  assert.equal(capture.calls[0].color, "#7030a0");
  assert.equal(capture.calls[1].vector, false);
  capture.replay();
  context.fillText("字", 1, 2);
  context.fillText("限宽", 1, 2, 20);
  assert.equal(painted, 3);
  capture.restore();
  context.fillText("字", 1, 2);
  assert.equal(painted, 4);
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
