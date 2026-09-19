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

  function inferMetadata(file, catalogEntry = null, firstPageText = "") {
    if (catalogEntry && catalogEntry.file === file.name && catalogEntry.bytes === file.size) {
      const exact = /^\d{4}-\d{2}-\d{2}$/.test(catalogEntry.date);
      const year = catalogEntry.year || catalogEntry.date?.slice(0, 4);
      return {
        id: catalogEntry.id,
        title: catalogEntry.title,
        category: catalogEntry.category,
        date: exact ? catalogEntry.date : `${year}-01-01`,
        approximateDate: !exact,
        recognizedBy: "拆分PDF索引",
      };
    }
    const filenameTitle = cleanFilenameTitle(file.name);
    const firstLine = String(firstPageText || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const genericFilename = /^(?:scan|scanned|document|pdf|img|image|export|show|导出|未命名)[-_\s\d]*$/i.test(filenameTitle);
    const title = filenameTitle && !genericFilename && !/^\d{4}(?:-\d\d)?$/.test(filenameTitle)
      ? filenameTitle : firstLine || "未命名PDF文章";
    const dateInfo = findDate(`${file.name}\n${firstLine}\n${firstPageText}`);
    return {
      id: stableId(file.name, file.size),
      title,
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
    inferMetadata, isPDF, uniquePDFs, fileStem, isCoverImage, coverFileMap,
    joinWrappedText, linesToBlocks,
    catalogArticleHTML, pdfDocumentHTML,
  };
});
