(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SiriusPdfImportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function compact(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  }

  function findDate(value) {
    const text = String(value || "").normalize("NFKC");
    let match = text.match(/(?:^|[^\d])(20(?:1\d|2\d))\s*(?:年|[.\/_-])\s*(\d{1,2})\s*(?:月|[.\/_-])\s*(\d{1,2})(?:日|号)?(?=$|[^\d])/);
    if (!match) match = text.match(/(?:^|[^\d])(2[0-9])\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})(?=$|[^\d])/);
    if (match) {
      const year = match[1].length === 2 ? `20${match[1]}` : match[1];
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = new Date(`${date}T00:00:00Z`);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31
        && !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() === Number(year)
        && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day) {
        return { date, approximate: false };
      }
    }
    match = text.match(/(?:^|[^\d])(20(?:1\d|2\d))\s*(?:年|[.\/_-])\s*(\d{1,2})(?:月)?(?=$|[^\d])/);
    if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
      return { date: `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-01`, approximate: true };
    }
    match = text.match(/(?:^|[^\d])(20(?:1\d|2\d))(?=$|[^\d])/);
    if (match) return { date: `${match[1]}-01-01`, approximate: true };
    return { date: "", approximate: true };
  }

  function categoryFromTitle(title, path = "") {
    const folder = String(path || "").match(/(?:^|[/\\])(门户更新|会议|访谈)(?=[/\\])/i);
    if (folder) return folder[1];
    const source = String(title || "").normalize("NFKC").toLowerCase();
    if (/访谈|采访|专访|interview/.test(source)) return "访谈";
    if (/会议|工作坊|研讨会|讲座|峰会/.test(source)) return "会议";
    return "门户更新";
  }

  function cleanFilenameTitle(filename) {
    return String(filename || "")
      .replace(/\.pdf$/i, "")
      .replace(/^\d{4,}[_\s]+(?=20\d\d)/, "")
      .replace(/^20\d\d(?:-\d\d(?:-\d\d)?)?[_\s-]+/, "")
      .replace(/[_]+/g, " ")
      .trim();
  }

  function stableId(name, bytes) {
    let hash = 2166136261;
    for (const char of `${name}|${bytes}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `pdf-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function incompleteTitle(value) {
    const title = String(value || "");
    return (title.match(/【/g) || []).length > (title.match(/】/g) || []).length;
  }

  function completeTitle(value, text = "") {
    let title = String(value || "").trim();
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const comparable = (line) => compact(line.replace(/^(?:【(?:地球盟友|柯博拉\s*Cobra|COBRA)】\s*)+/i, ""));
    const seed = comparable(title);
    if (!incompleteTitle(title)) {
      const longer = lines.slice(0, 2).find((line) => comparable(line).startsWith(seed)
        && comparable(line).length > seed.length && !incompleteTitle(line));
      return longer || title;
    }
    let started = false;
    for (let index = 0, appended = 0; index < lines.length && appended < 6; index += 1) {
      const line = lines[index];
      const normalized = comparable(line);
      if (!started) {
        if (normalized === seed || seed.startsWith(normalized)) started = true;
        else if (normalized.startsWith(seed) && !incompleteTitle(line)) return line.replace(/[:：]?\s*https?:\/\/.*$/, "").trim();
        continue;
      }
      if (/^\d{1,4}$/.test(line) || normalized === seed) continue;
      if (/^(?:https?:\/\/|原文[:：]|【地球盟友】)/i.test(line)) break;
      // A previous two-line title may already contain part of this line.
      if (seed.endsWith(normalized) || seed.includes(normalized)) continue;
      const separator = /[A-Za-z0-9]$/.test(title) && /^[A-Za-z]/.test(line) ? " " : "";
      title += separator + line;
      appended += 1;
      if (!incompleteTitle(title)) return title.split(/[:：]?\s*https?:\/\/|主讲者[:：]/)[0].trim();
    }
    return String(value || "").trim();
  }

  function inferMetadata(file, catalogEntry = null, firstPageText = "") {
    if (catalogEntry && catalogEntry.file === file.name && catalogEntry.bytes === file.size) {
      const exact = /^\d{4}-\d{2}-\d{2}$/.test(catalogEntry.date);
      const year = catalogEntry.year || catalogEntry.date?.slice(0, 4);
      const title = completeTitle(catalogEntry.title, (catalogEntry.pages || []).slice(0, 2)
        .flatMap((page) => (page.lines || []).map((line) => line.t)).join("\n"));
      return {
        id: catalogEntry.id,
        title,
        titleNeedsReview: incompleteTitle(title),
        category: catalogEntry.category,
        date: exact ? catalogEntry.date : `${year}-01-01`,
        approximateDate: !exact,
        recognizedBy: "拆分PDF索引",
      };
    }
    const filenameTitle = cleanFilenameTitle(file.name);
    const firstLine = String(firstPageText || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const genericFilename = /^(?:scan|scanned|document|pdf|img|image|export|show|导出|未命名)[-_\s\d]*$/i.test(filenameTitle);
    const seed = filenameTitle && !genericFilename && !/^\d{4}(?:-\d\d)?$/.test(filenameTitle)
      ? filenameTitle : firstLine || "未命名PDF文章";
    const title = completeTitle(seed, firstPageText);
    const dateInfo = findDate(`${file.name}\n${firstLine}\n${firstPageText}`);
    return {
      id: stableId(file.name, file.size),
      title,
      titleNeedsReview: incompleteTitle(title),
      category: categoryFromTitle(title, file.webkitRelativePath || ""),
      date: dateInfo.date,
      approximateDate: dateInfo.approximate,
      recognizedBy: "PDF文字/文件名",
    };
  }

  function isPDF(file) {
    return Boolean(file && (/\.pdf$/i.test(file.name) || file.type === "application/pdf"));
  }

  function fileStem(filename) {
    return String(filename || "")
      .normalize("NFKC")
      .replace(/^.*[/\\]/, "")
      .replace(/\.[^.]+$/, "")
      .trim()
      .toLowerCase();
  }

  function isCoverImage(file) {
    return Boolean(file && (/\.(?:jpe?g|png|webp)$/i.test(file.name)
      || /^(?:image\/jpeg|image\/png|image\/webp)$/i.test(file.type || "")));
  }

  function coverFileMap(files) {
    const priorities = { ".jpg": 4, ".jpeg": 3, ".png": 2, ".webp": 1 };
    const covers = new Map();
    for (const file of Array.from(files || []).filter(isCoverImage)) {
      const key = fileStem(file.name);
      const extension = (String(file.name).match(/\.[^.]+$/)?.[0] || "").toLowerCase();
      const previous = covers.get(key);
      const previousExtension = (String(previous?.name || "").match(/\.[^.]+$/)?.[0] || "").toLowerCase();
      if (!previous || (priorities[extension] || 0) > (priorities[previousExtension] || 0)) covers.set(key, file);
    }
    return covers;
  }

  function uniquePDFs(files) {
    return [...new Map(Array.from(files || []).filter(isPDF)
      .map((file) => [`${file.name}|${file.size}`, file])).values()];
  }

  function joinWrappedText(left, right) {
    const a = String(left || "").trimEnd();
    const b = String(right || "").trimStart();
    if (!a) return b;
    if (!b) return a;
    return /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : `${a}${b}`;
  }

  function lineIsTitle(line, title) {
    const text = compact(line?.t || "");
    const heading = compact(title);
    return Boolean(text && heading && (text === heading || (text.length > 12 && heading.startsWith(text))));
  }

  function blockHTML(lines) {
    if (!lines.length) return "";
    const text = lines.reduce((value, line) => joinWrappedText(value, line.t), "");
    const first = lines[0];
    const heading = Boolean(first.w && (first.s >= 11.5 || text.length < 24));
    const tag = heading ? "h3" : "p";
    const size = heading ? 21 : 18;
    const color = /^#[0-9a-f]{6}$/i.test(first.c || "") ? first.c : "#000000";
    return `<${tag} style="font-size:${size}px;color:${color};text-align:left;line-height:1.9">${escapeHTML(text)}</${tag}>`;
  }

  function pdfDocumentHTML(title) {
    return `<section class="pdf-document" data-pdf-title="${escapeHTML(title)}" contenteditable="false"><p class="pdf-loading">正在载入原 PDF 版式…</p></section>`;
  }

  function linesToBlocks(lines, title = "", skipFirstTitle = false) {
    const blocks = [];
    let group = [];
    let previous = null;
    for (const line of lines || []) {
      if (!line?.t?.trim()) continue;
      if (skipFirstTitle && !previous && lineIsTitle(line, title)) {
        previous = line;
        continue;
      }
      const gap = previous ? Number(line.y) - Number(previous.b) : Infinity;
      const sameParagraph = group.length && gap >= -1 && gap <= Math.max(9, Number(line.s || 10) * 0.85)
        && (line.c || "") === (group[0].c || "")
        && Math.abs(Number(line.x || 0) - Number(group[0].x || 0)) < 30
        && Boolean(line.w) === Boolean(group[0].w);
      if (!sameParagraph && group.length) {
        blocks.push(blockHTML(group));
        group = [];
      }
      group.push(line);
      previous = line;
    }
    if (group.length) blocks.push(blockHTML(group));
    return blocks.join("");
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 12;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#202020";
  }

  function safeFontFamily(value) {
    const family = String(value || "").replace(/[;{}<>]/g, "").trim();
    return family ? `;font-family:${escapeHTML(family)}` : "";
  }

  function joinFlowLines(lines) {
    return lines.reduce((text, line) => joinWrappedText(text, line.text), "").trim();
  }

  function flowLinesToBlocks(lines, options = {}) {
    const usable = (lines || []).filter((line) => String(line?.text || "").trim())
      .sort((a, b) => Number(a.top || 0) - Number(b.top || 0) || Number(a.x || 0) - Number(b.x || 0));
    if (!usable.length) return { html: "", textLength: 0, blockCount: 0, bodySize: 12 };

    const title = String(options.title || "");
    if (options.skipTitle === true) {
      const first = usable[0];
      if (lineIsTitle({ t: first.text }, title)) usable.shift();
    }
    if (!usable.length) return { html: "", textLength: 0, blockCount: 0, bodySize: 12 };

    const weightedSizes = [];
    for (const line of usable) {
      const size = Number(line.size || 12);
      const repeats = Math.max(1, Math.min(24, String(line.text || "").length));
      for (let index = 0; index < repeats; index += 1) weightedSizes.push(size);
    }
    let bodySize = median(weightedSizes);
    const sizeBuckets = new Map();
    for (const line of usable) {
      const bucket = Math.round(Number(line.size || 12) * 2) / 2;
      sizeBuckets.set(bucket, (sizeBuckets.get(bucket) || 0) + Math.max(1, String(line.text || "").length));
    }
    const rankedSizes = [...sizeBuckets].sort((a, b) => b[1] - a[1]);
    if (rankedSizes.length) {
      bodySize = rankedSizes[0][0];
      const credibleSmallerSize = rankedSizes
        .filter(([size, weight]) => size < bodySize * 0.82 && weight >= rankedSizes[0][1] * 0.45)
        .sort((a, b) => b[1] - a[1])[0];
      if (credibleSmallerSize) bodySize = credibleSmallerSize[0];
    }
    const contentLeft = Math.min(...usable.map((line) => Number(line.x || 0)));
    const contentRight = Math.max(...usable.map((line) => Number(line.right || (Number(line.x || 0) + Number(line.width || 0)))));
    const contentWidth = Math.max(1, contentRight - contentLeft);

    const isHeading = (line) => {
      const text = String(line.text || "").trim();
      const size = Number(line.size || bodySize);
      const centered = Math.abs((Number(line.x || 0) + Number(line.width || 0) / 2)
        - Number(line.pageWidth || 0) / 2) < Math.max(20, Number(line.pageWidth || 0) * 0.08);
      return size >= bodySize * 1.22
        || (Boolean(line.bold) && text.length <= 48 && size >= bodySize * 1.02)
        || (centered && text.length <= 36 && size >= bodySize * 1.08);
    };
    const startsNewThought = (text) => /^(?:[•●▪◆◇■□▶▷]|[-–—]\s|\d+[.、)]|[（(]?[一二三四五六七八九十]+[、）)])/u.test(text);
    const groups = [];
    let group = [];
    for (const line of usable) {
      const previous = group.at(-1);
      let split = false;
      if (previous) {
        const gap = Number(line.top || 0) - Number(previous.bottom || previous.top || 0);
        const normalGap = Math.max(5, Math.max(Number(line.size || bodySize), Number(previous.size || bodySize)) * 0.95);
        const previousWidth = Number(previous.width || 0);
        const previousShort = previousWidth > 0 && previousWidth < contentWidth * 0.72;
        const previousText = String(previous.text || "").trim();
        const currentText = String(line.text || "").trim();
        const headingChanged = isHeading(previous) !== isHeading(line);
        const styleChanged = safeColor(previous.color) !== safeColor(line.color)
          || Math.abs(Number(previous.cssSize || previous.size || bodySize) - Number(line.cssSize || line.size || bodySize)) > 1.25
          || Boolean(previous.bold) !== Boolean(line.bold)
          || Boolean(previous.italic) !== Boolean(line.italic);
        const indented = Math.abs(Number(line.x || 0) - Number(previous.x || 0)) > Math.max(28, bodySize * 2.2)
          && previousShort;
        split = gap > normalGap || headingChanged || styleChanged || indented
          || startsNewThought(currentText)
          || (previousShort && /[。！？.!?：:]$/.test(previousText));
      }
      if (split && group.length) {
        groups.push(group);
        group = [];
      }
      group.push(line);
    }
    if (group.length) groups.push(group);

    const html = groups.map((block) => {
      const first = block[0];
      const text = joinFlowLines(block);
      const heading = isHeading(first);
      const pixels = Math.round(Math.max(10, Math.min(48, Number(first.cssSize || first.size || 16))) * 10) / 10;
      const color = safeColor(first.color);
      const bold = first.bold ? ";font-weight:700" : "";
      const italic = first.italic ? ";font-style:italic" : "";
      const font = safeFontFamily(first.fontFamily);
      const pageWidth = Number(first.pageWidth || 0);
      const centered = pageWidth > 0 && block.every((line) => Math.abs((Number(line.x || 0) + Number(line.width || 0) / 2)
        - pageWidth / 2) < Math.max(22, pageWidth * 0.08));
      const rightAligned = pageWidth > 0 && block.every((line) => pageWidth - Number(line.right || 0) < Math.max(22, pageWidth * 0.08))
        && Number(first.x || 0) > pageWidth * 0.25;
      const alignment = centered ? "center" : (rightAligned ? "right" : "left");
      const firstIndent = block.length > 1 ? Number(first.x || 0) - Number(block[1].x || 0) : 0;
      const indentEm = firstIndent > Number(first.size || bodySize) * 0.8
        ? Math.min(4, firstIndent / Math.max(1, Number(first.size || bodySize))) : 0;
      const indent = indentEm ? `;text-indent:${Math.round(indentEm * 10) / 10}em` : "";
      const lineGaps = block.slice(1).map((line, index) => Number(line.top || 0) - Number(block[index].top || 0));
      const lineHeight = lineGaps.length
        ? Math.max(1.15, Math.min(2.4, median(lineGaps) / Math.max(1, Number(first.size || bodySize))))
        : 1.65;
      const exactLines = block.map((line) => escapeHTML(line.text)).join("<br>");
      return `<p class="pdf-flow-${heading ? "heading" : "paragraph"}" data-pdf-lines="${block.length}" style="--pdf-font-size:${pixels}px;font-size:var(--pdf-font-size);color:${color};text-align:${alignment};text-align-last:auto;line-height:${Math.round(lineHeight * 100) / 100}${bold}${italic}${font}${indent}">${exactLines}</p>`;
    }).join("");
    return {
      html,
      textLength: groups.reduce((total, block) => total + joinFlowLines(block).length, 0),
      blockCount: groups.length,
      bodySize,
    };
  }

  function scaledCatalogImageRectangles(pageEntry, canvasWidth, canvasHeight) {
    if (!pageEntry?.images?.length) return [];
    const scaleX = canvasWidth / Number(pageEntry.w || canvasWidth);
    const scaleY = canvasHeight / Number(pageEntry.h || canvasHeight);
    return pageEntry.images.map((image) => {
      const left = Math.max(0, Math.floor(Number(image.x || 0) * scaleX));
      const top = Math.max(0, Math.floor(Number(image.y || 0) * scaleY));
      const right = Math.min(canvasWidth, Math.ceil((Number(image.x || 0) + Number(image.w || 0)) * scaleX));
      const bottom = Math.min(canvasHeight, Math.ceil((Number(image.y || 0) + Number(image.h || 0)) * scaleY));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    }).filter((rectangle) => rectangle.width > 15 && rectangle.height > 15)
      .sort((a, b) => a.top - b.top || a.left - b.left);
  }

  async function catalogArticleHTML(entry, resolveImage) {
    let html = "";
    for (let pageIndex = 0; pageIndex < entry.pages.length; pageIndex += 1) {
      const page = entry.pages[pageIndex];
      const events = [
        ...(page.lines || []).map((line) => ({ type: "line", top: Number(line.y), item: line })),
        ...(page.images || []).map((image, index) => ({ type: "image", top: Number(image.y), item: image, index })),
      ].sort((a, b) => a.top - b.top || (a.type === "image" ? 1 : -1));
      let lines = [];
      let skipTitle = pageIndex === 0;
      for (const event of events) {
        if (event.type === "line") {
          lines.push(event.item);
          continue;
        }
        html += linesToBlocks(lines, entry.title, skipTitle);
        skipTitle = false;
        lines = [];
        const url = await resolveImage(pageIndex, event.item, event.index, page);
        if (url) html += `<figure class="pdf-import-figure"><img class="article-content-image" src="${escapeHTML(url)}" alt="${escapeHTML(entry.title)} 配图" loading="lazy" style="display:block;max-width:100%;height:auto;margin:24px auto" /></figure>`;
      }
      html += linesToBlocks(lines, entry.title, skipTitle);
      if (page.ocr?.length) {
        html += `<details class="pdf-ocr-text"><summary>图片页识别文字（需人工校对）</summary>${linesToBlocks(page.ocr)}</details>`;
      }
    }
    return html;
  }

  return {
    escapeHTML, findDate, categoryFromTitle, cleanFilenameTitle, stableId,
    inferMetadata, incompleteTitle, completeTitle, isPDF, uniquePDFs, fileStem, isCoverImage, coverFileMap,
    joinWrappedText, linesToBlocks, flowLinesToBlocks, scaledCatalogImageRectangles,
    catalogArticleHTML, pdfDocumentHTML,
  };
});
