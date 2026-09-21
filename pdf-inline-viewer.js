(function () {
  "use strict";

  const vendorBase = new URL("/vendor/", window.location.origin).href;
  let pdfjsPromise;
  let activeText = null;

  function storedEdits(element) {
    try {
      const edits = JSON.parse(element.dataset.pdfEdits || "{}");
      return edits && typeof edits === "object" && !Array.isArray(edits) ? edits : {};
    } catch (error) {
      console.warn("PDF 文字修改记录无法读取", error);
      return {};
    }
  }

  function editKey(pageNumber, index) {
    return `${pageNumber}:${index}`;
  }

  function setVisibleFont(span) {
    if (!span.dataset.pdfOriginalFont) span.dataset.pdfOriginalFont = span.style.fontFamily || "";
    if (span._pdfStyleOverrides?.fontFamily) return;
    const original = span.dataset.pdfOriginalFont;
    span.style.fontFamily = /^(?:monospace|serif)$/i.test(original)
      ? '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif'
      : original;
  }

  function applyAlignment(span, alignment) {
    const surface = span.closest(".pdf-page-surface");
    if (!surface) return;
    if (!span.dataset.pdfOriginalLeft) span.dataset.pdfOriginalLeft = span.style.left;
    if (alignment === "left") {
      span.style.left = span.dataset.pdfOriginalLeft;
      return;
    }
    const pageWidth = parseFloat(surface.style.width) || surface.clientWidth;
    const textWidth = span.offsetWidth;
    const originalLeft = span.dataset.pdfOriginalLeft.endsWith("%")
      ? pageWidth * parseFloat(span.dataset.pdfOriginalLeft) / 100
      : parseFloat(span.dataset.pdfOriginalLeft);
    span.style.left = `${Math.max(0, alignment === "center"
      ? (pageWidth - textWidth) / 2
      : pageWidth - textWidth - (Number.isFinite(originalLeft) ? originalLeft : 0))}px`;
  }

  function showEdit(span, edit) {
    span.textContent = edit.text;
    span._pdfStyleOverrides = { ...(edit.style || {}) };
    for (const [property, value] of Object.entries(span._pdfStyleOverrides)) {
      if (["color", "fontFamily", "fontSize", "fontWeight", "fontStyle"].includes(property)) {
        span.style[property] = value;
      }
    }
    span.classList.add("pdf-edited-text");
    setVisibleFont(span);
    if (edit.style?.textAlign) applyAlignment(span, edit.style.textAlign);
  }

  function saveTextEdit(span, announce = false) {
    const documentElement = span.closest(".pdf-document");
    if (!documentElement) return;
    const edits = storedEdits(documentElement);
    const key = span.dataset.pdfEditKey;
    const style = span._pdfStyleOverrides || {};
    const changed = span.textContent !== span.dataset.pdfOriginalText || Object.keys(style).length > 0;
    if (changed) {
      edits[key] = { text: span.textContent, style };
      span.classList.add("pdf-edited-text");
    } else {
      delete edits[key];
      span.classList.remove("pdf-edited-text");
    }
    if (!style.color && !span.classList.contains("pdf-editing-text")) span.style.color = "";
    if (!changed && !span.classList.contains("pdf-editing-text") && span.dataset.pdfOriginalFont) {
      span.style.fontFamily = span.dataset.pdfOriginalFont;
    } else if (changed) {
      setVisibleFont(span);
    }
    if (announce && style.textAlign) applyAlignment(span, style.textAlign);
    const previous = documentElement.dataset.pdfEdits || "";
    if (Object.keys(edits).length) documentElement.dataset.pdfEdits = JSON.stringify(edits);
    else documentElement.removeAttribute("data-pdf-edits");
    if (announce && (span._pdfDirty || previous !== (documentElement.dataset.pdfEdits || ""))) {
      span._pdfDirty = false;
      documentElement.dispatchEvent(new CustomEvent("sirius-pdf-edits-changed", { bubbles: true }));
    }
  }

  function configureTextLayer(documentElement, textLayerElement, pageNumber, editable, viewport) {
    const edits = storedEdits(documentElement);
    const spans = [...textLayerElement.querySelectorAll("span")].filter((span) => !span.closest(".markedContent"));
    spans.forEach((span, index) => {
      const key = editKey(pageNumber, index);
      span.dataset.pdfEditKey = key;
      span.dataset.pdfOriginalText = span.textContent;
      const left = span.style.left.endsWith("%") ? parseFloat(span.style.left) / 100 : parseFloat(span.style.left) / viewport.width;
      const top = span.style.top.endsWith("%") ? parseFloat(span.style.top) / 100 : parseFloat(span.style.top) / viewport.height;
      const fontSize = parseFloat(span.style.fontSize) || 10;
      if (isFooterPosition(span.textContent, left * viewport.width, top * viewport.height + fontSize,
        fontSize, viewport.width, viewport.height)) {
        span.hidden = true;
        return;
      }
      const edit = edits[key];
      if (edit && typeof edit.text === "string") showEdit(span, edit);
      if (!editable) return;
      span.classList.add("pdf-editable-text");
      span.contentEditable = "true";
      span.spellcheck = false;
      span.addEventListener("focus", () => {
        activeText = span;
        span.classList.add("pdf-editing-text");
        setVisibleFont(span);
      });
      span.addEventListener("input", () => {
        span._pdfDirty = true;
        saveTextEdit(span);
      });
      span.addEventListener("blur", () => {
        span.classList.remove("pdf-editing-text");
        saveTextEdit(span, true);
      });
      span.addEventListener("paste", (event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || "");
      });
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          document.execCommand("insertText", false, "\n");
        }
      });
    });
  }

  function activeEditableText(root) {
    return activeText?.isConnected && root?.contains(activeText) ? activeText : null;
  }

  function formatActive(root, command, value) {
    const span = activeEditableText(root);
    if (!span) return null;
    if (["undo", "redo"].includes(command)) {
      span.focus();
      document.execCommand(command);
      saveTextEdit(span, true);
      return "handled";
    }
    const style = span._pdfStyleOverrides ||= {};
    if (command === "bold") style.fontWeight = style.fontWeight === "bold" ? "normal" : "bold";
    else if (command === "italic") style.fontStyle = style.fontStyle === "italic" ? "normal" : "italic";
    else if (command === "fontName") style.fontFamily = String(value || "").slice(0, 80);
    else if (command === "fontSize") style.fontSize = `${Math.max(8, Math.min(100, Number(value) || 18))}px`;
    else if (command === "foreColor" && /^#[0-9a-f]{6}$/i.test(value)) style.color = value;
    else if ({ justifyLeft: 1, justifyCenter: 1, justifyRight: 1 }[command]) {
      style.textAlign = { justifyLeft: "left", justifyCenter: "center", justifyRight: "right" }[command];
    } else return "unsupported";
    if (style.color) span.style.color = style.color;
    if (style.fontFamily) span.style.fontFamily = style.fontFamily;
    if (style.fontSize) span.style.fontSize = style.fontSize;
    if (style.fontWeight) span.style.fontWeight = style.fontWeight;
    if (style.fontStyle) span.style.fontStyle = style.fontStyle;
    if (style.textAlign) applyAlignment(span, style.textAlign);
    saveTextEdit(span, true);
    return "handled";
  }

  function loadPdfJs() {
    if (!pdfjsPromise) {
      if (!Promise.try) Promise.try = (fn, ...args) => Promise.resolve().then(() => fn(...args));
      pdfjsPromise = import(`${vendorBase}pdfjs/pdf.min.mjs`).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = `${vendorBase}pdfjs/pdf.worker.min.mjs`;
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  function fitSurface(pageElement, surface, width, height, cropTop = 0, cropBottom = height) {
    const resize = () => {
      const targetWidth = pageElement.clientWidth || width;
      const scale = targetWidth / width;
      pageElement.style.height = `${(cropBottom - cropTop) * scale}px`;
      surface.style.top = `${-cropTop * scale}px`;
      surface.style.transform = `scale(${scale})`;
    };
    resize();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(resize);
      observer.observe(pageElement);
    } else {
      window.addEventListener("resize", resize, { passive: true });
    }
  }

  function renderScale(viewport, pageElement) {
    const displayScale = (pageElement.clientWidth || Math.min(820, viewport.width)) / viewport.width;
    const requested = displayScale * Math.max(2.4, (window.devicePixelRatio || 1) * 1.5);
    const dimensionLimit = 16000 / Math.max(viewport.width, viewport.height);
    const pixelLimit = Math.sqrt(24000000 / (viewport.width * viewport.height));
    return Math.max(1, Math.min(requested, dimensionLimit, pixelLimit));
  }

  function footerNumber(text) {
    const value = String(text || "").trim();
    return /^(?:第\s*)?[-—]?\s*\d{1,4}(?:\s*[\/／]\s*\d{1,4})?\s*[-—]?(?:\s*页)?$/.test(value);
  }

  function isFooterPosition(text, x, baseline, fontHeight, width, height) {
    // A short article can be a small crop of an A4 page. Its original 20pt
    // footer margin no longer falls inside the bottom 10% of the cropped page.
    const margin = Math.max(height * .1, Math.min(40, width * .065));
    return footerNumber(text) && fontHeight <= width * .027
      && baseline >= height - margin && x >= width * .35 && x <= width * .65;
  }

  function removeFooterNumbers(pdfjs, textContent, viewport, context) {
    const rectangles = [];
    for (const item of textContent.items || []) {
      if (!item.transform || !footerNumber(item.str)) continue;
      const transform = pdfjs.Util.transform(viewport.transform, item.transform);
      const x = transform[4];
      const baseline = transform[5];
      const fontHeight = Math.max(8, Math.hypot(transform[2], transform[3]));
      if (!isFooterPosition(item.str, x, baseline, fontHeight, viewport.width, viewport.height)) continue;
      context.fillStyle = "#fff";
      context.fillRect(Math.max(0, x - 5), Math.max(0, baseline - fontHeight * 1.25),
        Math.min(viewport.width - x + 5, (item.width || fontHeight) * viewport.scale + 12), fontHeight * 1.7);
      rectangles.push({ left: (x - 5) / viewport.scale, right: (x + (item.width || fontHeight) * viewport.scale + 7) / viewport.scale,
        top: (baseline - fontHeight * 1.25) / viewport.scale, bottom: (baseline + fontHeight * .45) / viewport.scale });
    }
    return rectangles;
  }

  function trimmedVerticalBounds(context, canvas, outputScale, pageHeight) {
    const width = canvas.width;
    const threshold = Math.max(3, Math.floor(width / 350));
    const rowHasContent = (y) => {
      const pixels = context.getImageData(0, y, width, 1).data;
      let colored = 0;
      for (let x = 0; x < width; x += 2) {
        const index = x * 4;
        if (pixels[index] < 246 || pixels[index + 1] < 246 || pixels[index + 2] < 246) {
          if (++colored >= threshold) return true;
        }
      }
      return false;
    };
    let first = 0;
    while (first < canvas.height - 1 && !rowHasContent(first)) first += 1;
    let last = canvas.height - 1;
    while (last > first && !rowHasContent(last)) last -= 1;
    if (first >= last) return { top: 0, bottom: pageHeight };
    return {
      top: Math.max(0, (first - 2) / outputScale),
      bottom: Math.min(pageHeight, (last + 3) / outputScale),
    };
  }

  function safeLink(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  async function addLinks(page, viewport, surface, textLayerElement) {
    const layer = document.createElement("div");
    layer.className = "pdf-link-layer";
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;
    const add = (href, rectangle) => {
      const url = safeLink(href);
      if (!url || rectangle.width < 4 || rectangle.height < 4) return;
      if (rectangle.left + rectangle.width <= 0 || rectangle.top + rectangle.height <= 0
        || rectangle.left >= viewport.width || rectangle.top >= viewport.height) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `打开链接：${url}`);
      Object.assign(link.style, {
        left: `${rectangle.left}px`, top: `${rectangle.top}px`,
        width: `${rectangle.width}px`, height: `${rectangle.height}px`,
      });
      layer.append(link);
    };
    const annotations = await page.getAnnotations({ intent: "display" });
    for (const annotation of annotations) {
      if (!annotation.rect || !annotation.url) continue;
      const [a, b, c, d, e, f] = viewport.transform;
      const [left, bottom, right, top] = annotation.rect;
      const [x1, y1, x2, y2] = [a * left + c * bottom + e, b * left + d * bottom + f,
        a * right + c * top + e, b * right + d * top + f];
      add(annotation.url, {
        left: Math.min(x1, x2), top: Math.min(y1, y2),
        width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
      });
    }
    for (const span of textLayerElement.querySelectorAll("span")) {
      const match = span.textContent?.match(/https?:\/\/[^\s<>"'，。]+/i);
      if (!match) continue;
      const href = match[0].replace(/[),;；）]+$/, "");
      const left = span.style.left.endsWith("%") ? viewport.width * parseFloat(span.style.left) / 100 : parseFloat(span.style.left);
      const top = span.style.top.endsWith("%") ? viewport.height * parseFloat(span.style.top) / 100 : parseFloat(span.style.top);
      add(href, { left, top, width: span.offsetWidth, height: span.offsetHeight });
    }
    if (layer.childElementCount) surface.append(layer);
  }

  async function renderPage(pdfjs, pdf, pageNumber, pagesElement, documentElement, editable) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageElement = document.createElement("div");
    pageElement.className = "pdf-live-page";
    pageElement.dataset.pageNumber = String(pageNumber);
    pageElement.setAttribute("role", "group");
    pageElement.setAttribute("aria-label", `PDF 第 ${pageNumber} 页`);
    pagesElement.append(pageElement);
    const outputScale = renderScale(viewport, pageElement);
    const renderViewport = page.getViewport({ scale: outputScale });

    const surface = document.createElement("div");
    surface.className = "pdf-page-surface";
    surface.style.width = `${viewport.width}px`;
    surface.style.height = `${viewport.height}px`;
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const textLayerElement = document.createElement("div");
    textLayerElement.className = "pdf-text-layer textLayer";
    textLayerElement.style.width = `${viewport.width}px`;
    textLayerElement.style.height = `${viewport.height}px`;
    surface.append(canvas, textLayerElement);
    pageElement.append(surface);

    const vectorCapture = window.SiriusPdfVectorText?.capture(context, outputScale);
    try {
      await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
    } catch (error) {
      vectorCapture?.restore();
      throw error;
    }
    const textContent = await page.getTextContent();
    const footerRects = removeFooterNumbers(pdfjs, textContent, renderViewport, context);
    const crop = trimmedVerticalBounds(context, canvas, outputScale, viewport.height);
    if (vectorCapture) {
      try {
        const vectorLayer = window.SiriusPdfVectorText.makeLayer(vectorCapture, viewport, footerRects, documentElement);
        if (vectorLayer) {
          vectorCapture.replay();
          await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
          removeFooterNumbers(pdfjs, textContent, renderViewport, context);
          surface.insertBefore(vectorLayer, textLayerElement);
          pageElement.dataset.pdfTextRendering = "vector";
        } else pageElement.dataset.pdfTextRendering = "source-image";
      } catch (error) {
        vectorCapture.restore();
        console.warn("PDF 矢量文字暂不可用，保留原页面显示", error);
        await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
        removeFooterNumbers(pdfjs, textContent, renderViewport, context);
      } finally {
        vectorCapture.restore();
      }
    }
    fitSurface(pageElement, surface, viewport.width, viewport.height, crop.top, crop.bottom);
    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container: textLayerElement,
      viewport,
    });
    await textLayer.render();
    configureTextLayer(documentElement, textLayerElement, pageNumber, editable, viewport);
    if (!editable) {
      try {
        await addLinks(page, viewport, surface, textLayerElement);
      } catch (error) {
        console.warn(`PDF 第 ${pageNumber} 页链接无法读取`, error);
      }
    }
    page.cleanup();
  }

  async function renderDocument(element, editable) {
    if (!element || ["loading", "done"].includes(element.dataset.pdfRendered)) return;
    const storedSource = element.dataset.pdfSrc;
    if (!storedSource) return;
    element.dataset.pdfRendered = "loading";
    const loading = element.querySelector(":scope > .pdf-loading");
    const pages = document.createElement("div");
    pages.className = "pdf-rendered-pages";
    let task;
    try {
      const source = await (window.SiriusAPI?.resolveMediaURL?.(storedSource) || storedSource);
      const pdfjs = await loadPdfJs();
      task = pdfjs.getDocument({
        url: source,
        cMapUrl: `${vendorBase}pdfjs/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${vendorBase}pdfjs/standard_fonts/`,
        wasmUrl: `${vendorBase}pdfjs/wasm/`,
        iccUrl: `${vendorBase}pdfjs/iccs/`,
      });
      const pdf = await task.promise;
      element.append(pages);
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (loading) loading.textContent = `正在载入原 PDF 版式 ${pageNumber}/${pdf.numPages}…`;
        await renderPage(pdfjs, pdf, pageNumber, pages, element, editable);
      }
      loading?.remove();
      element.dataset.pdfRendered = "done";
    } catch (error) {
      console.warn("嵌入式 PDF 渲染失败", error);
      pages.remove();
      element.dataset.pdfRendered = "error";
      const message = document.createElement("p");
      message.className = "pdf-viewer-error";
      message.textContent = `PDF 无法显示：${error.message || error}`;
      loading?.replaceWith(message);
    } finally {
      await task?.destroy().catch(() => {});
      window.SiriusPdfVectorText?.restoreFonts(element);
    }
  }

  function renderWithin(root = document, options = {}) {
    const documents = [];
    if (root.matches?.(".pdf-document")) documents.push(root);
    documents.push(...(root.querySelectorAll?.(".pdf-document") || []));
    return Promise.all(documents.map((element) => renderDocument(element, Boolean(options.editable))));
  }

  window.SiriusPdfInlineViewer = { renderWithin, formatActive, activeEditableText, isFooterPosition };
})();
