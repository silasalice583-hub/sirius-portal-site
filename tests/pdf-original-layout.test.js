const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "pdf-inline-viewer.js"), "utf8");

function node(tag = "div") {
  const element = {
    tag, style: {}, dataset: {}, children: [], attributes: {}, clientWidth: 390,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.tag === selector ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    },
    querySelector() { return null; },
    closest() { return null; },
  };
  Object.defineProperty(element, "childElementCount", { get: () => element.children.length });
  return element;
}

function span(text, top) {
  const result = node("span");
  result.textContent = text;
  result.style = { left: "50%", top, fontSize: "10px", fontFamily: "serif" };
  return result;
}

function viewer(extra = {}) {
  const scope = {
    window: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {} },
    document: { createElement: node }, URL, console, matchMedia: () => ({ matches: true }), ...extra,
  };
  vm.runInNewContext(source.replace("  window.SiriusPdfInlineViewer =",
    "  window.testing = { renderPage, renderDocument, configureTextLayer, releasePage, disposeController, originalPageSlots, renderScale, limitTileSelection };\n  window.SiriusPdfInlineViewer ="), scope);
  return scope.window.testing;
}

test("original-layout pages retain full white paper, original text, footer and links in a single source render", async () => {
  const calls = { paints: [], contexts: [], cleanups: 0, clears: 0 };
  const textSpans = [span("12", "97%"), span("女神回归 原始内容", "25%")];
  const context = {
    clearRect() { calls.clears += 1; },
    getImageData() { throw new Error("Original margins must not be scanned or trimmed"); },
    fillRect() { throw new Error("Original page numbers must not be painted over"); },
  };
  const owner = node();
  owner.dataset = { pdfPreserveOriginal: "true", pdfEdits: JSON.stringify({ "1:1": { text: "不得出现的改写" } }) };
  const pageElement = node();
  const page = {
    getViewport({ scale }) { return { width: 595 * scale, height: 842 * scale, scale, transform: [scale, 0, 0, -scale, 0, 842 * scale] }; },
    render(options) { calls.paints.push(options); return { promise: Promise.resolve() }; },
    async getTextContent() { return { items: [{ str: "12", transform: [1, 0, 0, 10, 295, 826], width: 10 }] }; },
    async getAnnotations() { return [{ url: "https://example.com/source", rect: [20, 20, 200, 40] }]; },
    cleanup() { calls.cleanups += 1; },
  };
  const controller = { element: owner, preserveOriginal: true, transparentPaper: true, disposed: false, renderTasks: new Set(), pages: [pageElement], queue: [] };
  const api = viewer({
    window: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {},
      SiriusPdfVectorText: {
        capture() { throw new Error("Original drawing must not be intercepted or redrawn"); },
        restoreFonts() { throw new Error("Original mode must not use vector font patches"); },
      },
    },
    document: { createElement(tag) {
      const element = node(tag);
      if (tag === "canvas") element.getContext = (_type, options) => { calls.contexts.push(options); return context; };
      return element;
    } },
  });
  const pdfjs = {
    Util: { transform() { throw new Error("Footer detection must not alter original mode"); } },
    TextLayer: class {
      constructor(options) { this.container = options.container; }
      async render() { this.container.append(...textSpans); }
    },
  };
  await api.renderPage(pdfjs, { getPage: async () => page }, 1, pageElement, owner, false, controller);

  assert.equal(calls.paints.length, 1);
  assert.equal(calls.paints[0].background, "#fff");
  assert.equal(calls.contexts[0].alpha, false);
  assert.equal(calls.clears, 1);
  assert.equal(pageElement.style.aspectRatio, "595 / 842");
  assert.equal(pageElement.style.height, `${842 * 390 / 595}px`);
  assert.equal(pageElement.children[0].style.top, "0px");
  assert.equal(pageElement.dataset.pdfTextRendering, "original");
  assert.deepEqual(textSpans.map((item) => item.textContent), ["12", "女神回归 原始内容"]);
  for (const item of textSpans) {
    assert.equal(item.hidden, undefined);
    assert.equal(item.contentEditable, undefined);
    assert.equal(item.style.fontFamily, "serif");
    assert.equal(item.dataset.pdfEditKey, undefined);
  }
  assert.equal(pageElement.querySelectorAll("a")[0].href, "https://example.com/source");
  assert.equal(calls.cleanups, 1);
  assert.equal(controller.renderTasks.size, 0);
  const canvas = pageElement.querySelectorAll("canvas")[0];
  assert.ok(canvas.width * canvas.height < 3000001);
  api.disposeController(controller);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
  assert.equal(pageElement.children.length, 0);
  assert.equal(controller.disposed, true);
});

test("original-layout opt-in overrides transparent reading and edit mode while normal documents retain their paper options", async () => {
  const modes = [];
  const api = viewer();
  for (const [flag, editable, transparent, expected] of [
    ["true", false, true, false], ["true", true, true, false],
    ["false", false, true, true], [undefined, false, true, true], [undefined, true, true, false],
  ]) {
    const element = node();
    if (flag !== undefined) element.dataset.pdfPreserveOriginal = flag;
    element.classList.toggle = (name, enabled) => modes.push([name, enabled]);
    await api.renderDocument(element, editable, transparent);
    assert.deepEqual(modes.at(-1), ["pdf-transparent-paper", expected]);
  }
});

test("ordinary PDF selection layers still apply saved edits and hide detected page numbers", () => {
  const textSpans = [span("12", "97%"), span("原始内容", "25%")];
  const layer = node();
  layer.append(...textSpans);
  const owner = node();
  owner.dataset.pdfEdits = JSON.stringify({ "1:1": { text: "已有编辑内容" } });
  viewer().configureTextLayer(owner, layer, 1, false, { width: 595, height: 842 });
  assert.equal(textSpans[0].hidden, true);
  assert.equal(textSpans[1].textContent, "已有编辑内容");
  assert.equal(textSpans[1].dataset.pdfEditKey, "1:1");
});

test("96,000-point source pages use contiguous high-resolution slots and keep text and links at their original source coordinates", async () => {
  const fullWidth = 402, fullHeight = 96000;
  const calls = { sources: [], paints: [], textRequests: 0 };
  const owner = node();
  owner.dataset.pdfPreserveOriginal = "true";
  const context = { clearRect() {}, getImageData() { throw new Error("Original pages must not be cropped"); } };
  const api = viewer({ document: { createElement(tag) {
    const element = node(tag);
    if (tag === "canvas") element.getContext = () => context;
    return element;
  } } });
  const slots = api.originalPageSlots(3, { width: fullWidth, height: fullHeight });
  assert.equal(slots.length, Math.ceil(fullHeight / 804));
  assert.equal(slots.reduce((sum, slot) => sum + slot.height, 0), fullHeight);
  slots.forEach((slot, index) => {
    assert.equal(slot.top, index * 804);
    assert.equal(slot.sourcePageNumber, 3);
    const scale = api.renderScale(slot, { clientWidth: 390 });
    assert.ok(scale * slot.width >= 780, "Tall pages should retain phone-readable horizontal resolution");
    assert.ok(slot.width * slot.height * scale * scale <= 3000001);
  });
  const sourceTexts = [
    { text: "第一段正文", top: 120 },
    { text: "跨边界的一行正文", top: 801 },
    { text: "第二段正文", top: 1000 },
    { text: "12", top: fullHeight - 12 },
  ];
  const page = {
    getViewport({ scale, offsetY = 0 }) {
      return { width: fullWidth * scale, height: fullHeight * scale, scale, rotation: 0,
        rawDims: { pageWidth: fullWidth, pageHeight: fullHeight, pageX: 0, pageY: 0 },
        transform: [scale, 0, 0, -scale, 0, fullHeight * scale + offsetY] };
    },
    render(options) { calls.paints.push(options); return { promise: Promise.resolve() }; },
    async getTextContent() { calls.textRequests += 1; return { items: sourceTexts }; },
    async getAnnotations() { return [{ url: "https://example.com/second-tile", rect: [20, fullHeight - 864, 200, fullHeight - 844] }]; },
    cleanup() {},
  };
  const pdfjs = { TextLayer: class {
    constructor(options) { this.options = options; }
    async render() {
      const { viewport, container, textContentSource } = this.options;
      const top = fullHeight - viewport.rawDims.pageY - viewport.rawDims.pageHeight;
      for (const item of textContentSource.items) {
        container.append(span(item.text, `${100 * (item.top - top) / viewport.rawDims.pageHeight}%`));
      }
    }
  } };
  const controller = { element: owner, preserveOriginal: true, transparentPaper: true, disposed: false,
    slots, pages: [], queue: [], renderTasks: new Set() };
  for (const slotIndex of [0, 1, slots.length - 1]) {
    const pageElement = node();
    controller.pages.push(pageElement);
    await api.renderPage(pdfjs, { async getPage(sourcePageNumber) { calls.sources.push(sourcePageNumber); return page; } },
      slotIndex + 1, pageElement, owner, false, controller);
    const slot = slots[slotIndex];
    const paint = calls.paints.at(-1);
    assert.equal(paint.viewport.height, slot.height * paint.viewport.scale);
    assert.ok(Math.abs(paint.viewport.transform[5] - (fullHeight - slot.top) * paint.viewport.scale) < 1e-8);
    assert.equal(pageElement.style.aspectRatio, `${fullWidth} / ${slot.height}`);
  }
  const visibleText = controller.pages.flatMap((element) => element.querySelectorAll("span")
    .filter((item) => !item.hidden).map((item) => item.textContent));
  assert.deepEqual(visibleText, sourceTexts.map((item) => item.text));
  assert.deepEqual(calls.sources, [3, 3, 3]);
  assert.equal(calls.textRequests, 1, "Tile rendering must share the original text decode");
  assert.equal(controller.pages[0].querySelectorAll("a").length, 0);
  const link = controller.pages[1].querySelectorAll("a")[0];
  assert.equal(link.href, "https://example.com/second-tile");
  assert.equal(link.style.top, "40px");
  assert.equal(controller.pages[2].querySelectorAll("span").find((item) => item.textContent === "12").hidden, undefined);
  assert.equal(controller.textContents.size, 1);
  api.disposeController(controller);
  assert.equal(controller.textContents.size, 0);
});

test("rounded TextLayer percentages cannot duplicate a source line on a tile boundary", () => {
  const api = viewer();
  // PDF.js rounds CSS percentages to two decimals. These independently rounded
  // positions would both be classified as inside by CSS geometry alone.
  const firstSpan = span("连续正文", "99.37%"), secondSpan = span("连续正文", "-0.62%");
  const firstLayer = node(), secondLayer = node();
  firstLayer.append(firstSpan); secondLayer.append(secondSpan);
  const common = {
    textContent: { items: [{ str: "连续正文", transform: [1, 0, 0, 10, 80, 808] }] },
    pdfjs: { Util: { transform: (_viewport, transform) => transform } },
    fullViewport: { transform: [1, 0, 0, 1, 0, 0] },
  };
  api.limitTileSelection(firstLayer, { height: 804 }, 0, 804,
    { ...common, top: 0, textLayer: { textDivs: [firstSpan] } });
  api.limitTileSelection(secondLayer, { height: 804 }, 0, 804,
    { ...common, top: 804, textLayer: { textDivs: [secondSpan] } });
  assert.equal(firstSpan.hidden, true);
  assert.equal(secondSpan.hidden, undefined);
  assert.deepEqual([firstSpan, secondSpan].filter((item) => !item.hidden).map((item) => item.textContent), ["连续正文"]);
});
