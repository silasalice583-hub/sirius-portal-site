(function () {
  "use strict";

  const vendorBase = new URL("/vendor/", window.location.origin).href;
  let pdfjsPromise;

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

  function fitSurface(pageElement, surface, width, height) {
    const resize = () => {
      const targetWidth = pageElement.clientWidth || width;
      const scale = targetWidth / width;
      pageElement.style.height = `${height * scale}px`;
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

  async function renderPage(pdfjs, pdf, pageNumber, pagesElement) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const outputScale = Math.min(2.25, Math.max(1.5, window.devicePixelRatio || 1));
    const renderViewport = page.getViewport({ scale: outputScale });
    const pageElement = document.createElement("div");
    pageElement.className = "pdf-live-page";
    pageElement.dataset.pageNumber = String(pageNumber);
    pageElement.setAttribute("role", "group");
    pageElement.setAttribute("aria-label", `PDF 第 ${pageNumber} 页`);

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
    pagesElement.append(pageElement);
    fitSurface(pageElement, surface, viewport.width, viewport.height);

    await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
    const textLayer = new pdfjs.TextLayer({
      textContentSource: await page.getTextContent(),
      container: textLayerElement,
      viewport,
    });
    await textLayer.render();
    page.cleanup();
  }

  async function renderDocument(element) {
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
        await renderPage(pdfjs, pdf, pageNumber, pages);
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
    }
  }

  function renderWithin(root = document) {
    const documents = [];
    if (root.matches?.(".pdf-document")) documents.push(root);
    documents.push(...(root.querySelectorAll?.(".pdf-document") || []));
    return Promise.all(documents.map(renderDocument));
  }

  window.SiriusPdfInlineViewer = { renderWithin };
})();
