(function () {
  "use strict";

  const core = window.SiriusPdfImportCore;
  if (!core) return;

  const vendorBase = new URL("/vendor/", window.location.origin).href;
  let pdfjsPromise;
  let ocrWorkerPromise;

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

  function loadTesseractScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-sirius-tesseract="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Tesseract), { once: true });
        existing.addEventListener("error", () => reject(new Error("OCR 组件加载失败")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.dataset.siriusTesseract = "true";
      script.src = `${vendorBase}tesseract/tesseract.min.js`;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error("OCR 组件加载失败"));
      document.head.appendChild(script);
    });
  }

  async function ocrWorker() {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = loadTesseractScript().then((tesseract) => tesseract.createWorker(["chi_sim", "eng"], 1, {
        workerPath: `${vendorBase}tesseract/worker.min.js`,
        corePath: `${vendorBase}tesseract/core/`,
        langPath: `${vendorBase}tesseract/lang`,
      }));
    }
    return ocrWorkerPromise;
  }

  async function openPdf(file) {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${vendorBase}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${vendorBase}pdfjs/standard_fonts/`,
      wasmUrl: `${vendorBase}pdfjs/wasm/`,
      iccUrl: `${vendorBase}pdfjs/iccs/`,
    });
    return { pdfjs, pdf: await task.promise, task };
  }

  async function renderPage(page, scale = 1.65) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "#ffffff",
      recordImages: true,
    }).promise;
    return { canvas, context, viewport };
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 12;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function appendText(previous, current, gap, averageCharacterWidth) {
    const left = String(previous || "");
    const right = String(current || "");
    if (!left) return right;
    if (!right || /\s$/.test(left) || /^\s/.test(right)) return left + right;
    const latinBoundary = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
    return latinBoundary && gap > averageCharacterWidth * 0.25 ? `${left} ${right}` : left + right;
  }

  function buildTextLines(textContent, viewport, pdfjs) {
    const fragments = [];
    for (const item of textContent.items || []) {
      if (!item?.str?.trim() || !item.transform) continue;
      const transform = pdfjs.Util.transform(viewport.transform, item.transform);
      const horizontalSize = Math.hypot(transform[0], transform[1]);
      const verticalSize = Math.hypot(transform[2], transform[3]);
      const size = Math.max(1, verticalSize || horizontalSize);
      const style = textContent.styles?.[item.fontName] || {};
      const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.82;
      const x = transform[4];
      const baseline = transform[5];
      const top = baseline - size * ascent;
      const width = Math.max(1, Math.abs(Number(item.width || 0) * viewport.scale));
      const fontFamily = String(style.fontFamily || "").trim();
      const fontLabel = `${item.fontName || ""} ${fontFamily}`;
      fragments.push({
        text: item.str,
        x,
        right: x + width,
        top,
        bottom: top + size,
        baseline,
        width,
        size,
        fontFamily,
        bold: /bold|black|heavy|semibold|demi/i.test(fontLabel),
        italic: /italic|oblique/i.test(fontLabel),
        hasEOL: Boolean(item.hasEOL),
      });
    }
    fragments.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
    const rows = [];
    for (const fragment of fragments) {
      let row = rows.findLast((candidate) => Math.abs(candidate.baseline - fragment.baseline)
        <= Math.max(2.5, Math.min(candidate.size, fragment.size) * 0.32));
      if (!row) {
        row = { baseline: fragment.baseline, size: fragment.size, fragments: [] };
        rows.push(row);
      }
      row.fragments.push(fragment);
      row.baseline = (row.baseline * (row.fragments.length - 1) + fragment.baseline) / row.fragments.length;
      row.size = Math.max(row.size, fragment.size);
    }
    return rows.map((row) => {
      row.fragments.sort((a, b) => a.x - b.x);
      let text = "";
      let previous = null;
      for (const fragment of row.fragments) {
        const averageCharacterWidth = fragment.width / Math.max(1, [...fragment.text].length);
        text = appendText(text, fragment.text, previous ? fragment.x - previous.right : 0, averageCharacterWidth);
        previous = fragment;
      }
      const sizes = row.fragments.flatMap((fragment) => Array(Math.min(12, Math.max(1, fragment.text.length))).fill(fragment.size));
      const x = Math.min(...row.fragments.map((fragment) => fragment.x));
      const right = Math.max(...row.fragments.map((fragment) => fragment.right));
      const top = Math.min(...row.fragments.map((fragment) => fragment.top));
      const bottom = Math.max(...row.fragments.map((fragment) => fragment.bottom));
      const styleFragment = row.fragments.reduce((best, fragment) => (
        fragment.text.trim().length > best.text.trim().length ? fragment : best
      ), row.fragments[0]);
      return {
        text: text.trim(),
        x,
        right,
        top,
        bottom,
        width: right - x,
        size: median(sizes),
        cssSize: median(sizes) / viewport.scale * (96 / 72),
        fontFamily: styleFragment.fontFamily,
        bold: row.fragments.some((fragment) => fragment.bold),
        italic: row.fragments.some((fragment) => fragment.italic),
        hasEOL: row.fragments.some((fragment) => fragment.hasEOL),
        pageWidth: viewport.width,
      };
    }).filter((line) => line.text);
  }

  function sampleTextColor(line, pixels, canvasWidth, canvasHeight) {
    const left = Math.max(0, Math.floor(line.x - 2));
    const right = Math.min(canvasWidth, Math.ceil(line.right + 2));
    const top = Math.max(0, Math.floor(line.top - 2));
    const bottom = Math.min(canvasHeight, Math.ceil(line.bottom + 2));
    if (left >= right || top >= bottom) return "#202020";
    const counts = new Map();
    const step = Math.max(1, Math.floor(Math.sqrt(((right - left) * (bottom - top)) / 9000)));
    for (let y = top; y < bottom; y += step) {
      for (let x = left; x < right; x += step) {
        const offset = (y * canvasWidth + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        if (alpha < 80 || (red > 244 && green > 244 && blue > 244)) continue;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        if (luminance > 235) continue;
        const key = `${Math.round(red / 24) * 24},${Math.round(green / 24) * 24},${Math.round(blue / 24) * 24}`;
        const contrastWeight = 1 + (255 - luminance) / 255;
        counts.set(key, (counts.get(key) || 0) + contrastWeight);
      }
    }
    if (!counts.size) return "#202020";
    const [winner] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const [red, green, blue] = winner.split(",").map((value) => Math.max(0, Math.min(255, Number(value))));
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function addTextColors(lines, context, canvas) {
    let pixels;
    try {
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (error) {
      lines.forEach((line) => { line.color = "#202020"; });
      return;
    }
    lines.forEach((line) => {
      line.color = sampleTextColor(line, pixels, canvas.width, canvas.height);
    });
  }

  function intersectionOverUnion(left, right) {
    const x1 = Math.max(left.left, right.left);
    const y1 = Math.max(left.top, right.top);
    const x2 = Math.min(left.right, right.right);
    const y2 = Math.min(left.bottom, right.bottom);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = left.width * left.height + right.width * right.height - intersection;
    return union ? intersection / union : 0;
  }

  function imageRectangles(imageCoordinates, canvas, hasUsefulText) {
    const rectangles = [];
    const values = imageCoordinates || [];
    for (let index = 0; index + 5 < values.length; index += 6) {
      const point1 = { x: values[index] * canvas.width, y: values[index + 1] * canvas.height };
      const point2 = { x: values[index + 2] * canvas.width, y: values[index + 3] * canvas.height };
      const point3 = { x: values[index + 4] * canvas.width, y: values[index + 5] * canvas.height };
      const point4 = { x: point2.x + point3.x - point1.x, y: point2.y + point3.y - point1.y };
      const left = Math.max(0, Math.floor(Math.min(point1.x, point2.x, point3.x, point4.x)));
      const top = Math.max(0, Math.floor(Math.min(point1.y, point2.y, point3.y, point4.y)));
      const right = Math.min(canvas.width, Math.ceil(Math.max(point1.x, point2.x, point3.x, point4.x)));
      const bottom = Math.min(canvas.height, Math.ceil(Math.max(point1.y, point2.y, point3.y, point4.y)));
      const width = right - left;
      const height = bottom - top;
      const pageShare = width * height / (canvas.width * canvas.height);
      if (width < 28 || height < 28 || width * height < 1800) continue;
      if (pageShare > 0.76 && hasUsefulText) continue;
      if (pageShare > 0.88) continue;
      const rectangle = { left, top, right, bottom, width, height, pageShare };
      if (rectangles.some((existing) => intersectionOverUnion(existing, rectangle) > 0.88)) continue;
      rectangles.push(rectangle);
    }
    return rectangles.sort((a, b) => a.top - b.top || a.left - b.left).slice(0, 30);
  }

  function fullPageImage(imageCoordinates) {
    const values = imageCoordinates || [];
    for (let index = 0; index + 5 < values.length; index += 6) {
      const xs = [values[index], values[index + 2], values[index + 4]];
      const ys = [values[index + 1], values[index + 3], values[index + 5]];
      if ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) > 0.84) return true;
    }
    return false;
  }

  function fallbackImageRectangles(lines, canvas) {
    const margin = Math.max(10, Math.round(canvas.height * 0.018));
    const sorted = [...lines].sort((a, b) => a.top - b.top);
    const boundaries = [0, ...sorted.flatMap((line) => [Math.max(0, line.top - margin), Math.min(canvas.height, line.bottom + margin)]), canvas.height]
      .sort((a, b) => a - b);
    const candidates = [];
    for (let index = 0; index + 1 < boundaries.length; index += 2) {
      const top = Math.max(0, Math.ceil(boundaries[index]));
      const bottom = Math.min(canvas.height, Math.floor(boundaries[index + 1]));
      if (bottom - top < canvas.height * 0.12) continue;
      candidates.push({ left: 0, top, right: canvas.width, bottom, width: canvas.width, height: bottom - top });
    }
    if (!candidates.length && sorted.length < 2) {
      candidates.push({ left: 0, top: 0, right: canvas.width, bottom: canvas.height,
        width: canvas.width, height: canvas.height });
    }
    return candidates;
  }

  function trimWhiteMargins(rectangle, context, canvas) {
    const { left, top, width, height } = rectangle;
    const data = context.getImageData(left, top, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const step = Math.max(1, Math.round(Math.max(width, height) / 1400));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const offset = (y * width + x) * 4;
        if (data[offset] > 244 && data[offset + 1] > 244 && data[offset + 2] > 244) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const pad = 3;
    const trimmedLeft = Math.max(left, left + minX - pad);
    const trimmedTop = Math.max(top, top + minY - pad);
    const right = Math.min(left + width, left + maxX + step + pad);
    const bottom = Math.min(top + height, top + maxY + step + pad);
    if ((right - trimmedLeft) * (bottom - trimmedTop) < canvas.width * canvas.height * 0.008) return null;
    return { left: trimmedLeft, top: trimmedTop, right, bottom,
      width: right - trimmedLeft, height: bottom - trimmedTop };
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function cropImage(pageCanvas, rectangle, filename) {
    const canvas = document.createElement("canvas");
    canvas.width = rectangle.width;
    canvas.height = rectangle.height;
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(pageCanvas, rectangle.left, rectangle.top, rectangle.width, rectangle.height,
      0, 0, rectangle.width, rectangle.height);
    let blob = await canvasBlob(canvas, "image/webp", 0.93);
    let extension = "webp";
    if (!blob) {
      blob = await canvasBlob(canvas, "image/png");
      extension = "png";
    }
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("无法从 PDF 中生成图片文件");
    return new File([blob], `${filename}.${extension}`, { type: blob.type || `image/${extension}` });
  }

  function imageHTML(source, title, widthPercent, number, inRow = false) {
    const safeSource = core.escapeHTML(source);
    const localAttribute = window.SiriusAPI?.isLocalMediaURL?.(source)
      ? ` data-local-media-src="${safeSource}"` : "";
    const width = Math.max(20, Math.min(100, Math.round(widthPercent)));
    return `<figure class="pdf-import-figure" style="width:${width}%;max-width:100%;margin:${inRow ? "0" : "24px auto"};text-align:center"><img class="article-content-image" src="${safeSource}"${localAttribute} alt="${core.escapeHTML(title)} 配图 ${number}" loading="lazy" decoding="async" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto" /></figure>`;
  }

  function ocrHTML(text) {
    const blocks = String(text || "").replace(/\r/g, "").split(/\n\s*\n+/)
      .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
      .filter((block) => block.length);
    return blocks.map((block) => `<p class="pdf-flow-paragraph pdf-flow-ocr" style="font-size:16px;color:#202020;text-align:left;line-height:1.65">${block.map(core.escapeHTML).join("<br>")}</p>`).join("");
  }

  async function convertPage(page, pageNumber, title, pdfjs, saveMedia, onProgress, pageEntry) {
    const rendered = await renderPage(page);
    try {
      const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      const lines = buildTextLines(textContent, rendered.viewport, pdfjs);
      const selectableLength = lines.reduce((total, line) => total + line.text.length, 0);
      if (selectableLength < 12) {
        onProgress?.(`第 ${pageNumber} 页没有完整文字层，正在 OCR…`);
        const worker = await ocrWorker();
        const result = await worker.recognize(rendered.canvas);
        const html = ocrHTML(result.data?.text || "");
        return {
          html,
          textLength: String(result.data?.text || "").trim().length,
          imageCount: 0,
          warning: `第 ${pageNumber} 页没有完整文字层，已使用 OCR，建议人工校对`,
        };
      }

      addTextColors(lines, rendered.context, rendered.canvas);
      const indexed = core.scaledCatalogImageRectangles(pageEntry, rendered.canvas.width, rendered.canvas.height);
      let rectangles = indexed.length ? indexed : imageRectangles(page.imageCoordinates, rendered.canvas, true);
      if (!rectangles.length && fullPageImage(page.imageCoordinates)) {
        rectangles = fallbackImageRectangles(lines, rendered.canvas)
          .map((rectangle) => trimWhiteMargins(rectangle, rendered.context, rendered.canvas))
          .filter(Boolean);
      }
      const imageEvents = [];
      for (let index = 0; index < rectangles.length; index += 1) {
        const rectangle = rectangles[index];
        onProgress?.(`第 ${pageNumber} 页：正在提取图片 ${index + 1}/${rectangles.length}…`);
        const stem = core.fileStem(title).replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 70) || "article";
        const file = await cropImage(rendered.canvas, rectangle, `${stem}-p${pageNumber}-image${index + 1}`);
        const source = await saveMedia(file, "正文图片");
        imageEvents.push({
          top: rectangle.top,
          rectangle,
          source,
          number: index + 1,
        });
      }

      const imageRows = [];
      for (const image of imageEvents) {
        const lastRow = imageRows.at(-1);
        if (lastRow && Math.abs(lastRow.top - image.top) < Math.max(12, image.rectangle.height * 0.13)) {
          lastRow.images.push(image);
        } else {
          imageRows.push({ top: image.top, images: [image] });
        }
      }

      let html = "";
      let cursor = 0;
      let textLength = 0;
      for (const row of imageRows) {
        const segment = lines.slice(cursor).filter((line) => line.top < row.top - 3);
        cursor += segment.length;
        const converted = core.flowLinesToBlocks(segment, { title, skipTitle: false });
        const rowImages = row.images.sort((a, b) => a.rectangle.left - b.rectangle.left);
        const gap = rowImages.length > 1
          ? Math.max(0, Math.min(8, (rowImages[1].rectangle.left - rowImages[0].rectangle.right)
            / rendered.canvas.width * 100)) : 0;
        const rowHTML = rowImages.map((image) => imageHTML(image.source, title,
          image.rectangle.width / rendered.canvas.width * 100, image.number, rowImages.length > 1)).join("");
        html += converted.html + (rowImages.length > 1
          ? `<div class="pdf-flow-image-row" style="gap:${Math.round(gap * 10) / 10}%;margin:24px auto">${rowHTML}</div>`
          : rowHTML);
        textLength += converted.textLength;
      }
      const converted = core.flowLinesToBlocks(lines.slice(cursor), { title, skipTitle: false });
      html += converted.html;
      textLength += converted.textLength;
      return { html, textLength, imageCount: imageEvents.length, warning: "" };
    } finally {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
      page.cleanup();
    }
  }

  async function convert(file, options = {}) {
    if (!file) throw new Error("没有选择 PDF 文件");
    if (typeof options.saveMedia !== "function") throw new Error("缺少正文图片保存函数");
    const title = String(options.title || core.fileStem(file.name) || "PDF 文章");
    const { pdfjs, pdf, task } = await openPdf(file);
    let html = '<section class="pdf-flow-article">';
    let textLength = 0;
    let imageCount = 0;
    const warnings = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        options.onProgress?.({ pageNumber, pageCount: pdf.numPages, message: `正在解析第 ${pageNumber}/${pdf.numPages} 页…` });
        const page = await pdf.getPage(pageNumber);
        const converted = await convertPage(page, pageNumber, title, pdfjs, options.saveMedia, (message) => {
          options.onProgress?.({ pageNumber, pageCount: pdf.numPages, message });
        }, options.catalogEntry?.pages?.[pageNumber - 1]);
        html += `<section class="pdf-flow-page" data-pdf-page="${pageNumber}">${converted.html}</section>`;
        textLength += converted.textLength;
        imageCount += converted.imageCount;
        if (converted.warning) warnings.push(converted.warning);
      }
      html += "</section>";
      if (textLength < 8 && imageCount === 0) throw new Error("PDF 没有可识别的文字或可提取图片");
      return { html, textLength, imageCount, warnings, pageCount: pdf.numPages };
    } finally {
      await task.destroy();
    }
  }

  window.SiriusPdfFlowImport = { convert };
})();
