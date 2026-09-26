(function () {
  "use strict";

  const core = window.SiriusPdfImportCore;
  if (!core) return;
  const scriptBase = new URL(".", window.document?.currentScript?.src || window.location.href || window.location.origin + "/");
  const vendorBase = new URL("vendor/", scriptBase).href;
  let pdfjsPromise;
  let ocrWorkerPromise;

  function loadPdfJs() {
    if (!pdfjsPromise) {
      if (!Promise.try) Promise.try = (fn, ...args) => Promise.resolve().then(() => fn(...args));
      if (!Promise.withResolvers) Promise.withResolvers = function () {
        let resolve, reject;
        const promise = new this((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
      };
      pdfjsPromise = import(`${vendorBase}pdfjs/pdf.min.mjs?v=20260926-legacy1`).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf-worker-compat.mjs?v=20260926-legacy1", scriptBase).href;
        return pdfjs;
      }).catch((error) => {
        pdfjsPromise = null;
        throw error;
      });
    }
    return pdfjsPromise;
  }

  async function readLocalCatalog(file) {
    if (file.size > 100 * 1024 * 1024) throw new Error("索引文件超过 100 MB");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !data.articles || typeof data.articles !== "object" || Array.isArray(data.articles)) {
      throw new Error("索引格式不受支持");
    }
    return data.articles;
  }

  async function openPdf(file) {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${vendorBase}pdfjs/cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${vendorBase}pdfjs/standard_fonts/`,
      wasmUrl: `${vendorBase}pdfjs/wasm/`, iccUrl: `${vendorBase}pdfjs/iccs/`,
    });
    try {
      return { pdfjs, pdf: await task.promise, task };
    } catch (error) {
      await task.destroy().catch(() => {});
      throw error;
    }
  }

  async function renderPage(pdf, pageNumber, scale = 2) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    scale = Math.min(scale, 6000 / Math.max(base.width, base.height), Math.sqrt(3000000 / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvasContext: context, canvas, viewport }).promise;
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      throw error;
    }
    return { page, canvas, context, viewport };
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function saveMediaFile(file, api, label) {
    if (!api.hasApi()) {
      try {
        return await api.storeLocalMedia(file);
      } catch (error) {
        throw new Error(`${label}写入浏览器本地大文件存储失败：${error?.message || error}`);
      }
    }
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await api.uploadMedia(new File([file], file.name, { type: file.type || "application/octet-stream" }));
      } catch (error) {
        lastError = error;
        if ([400, 401, 403, 413].includes(error.status)) break;
        if (attempt < 3) await wait(attempt * 900);
      }
    }
    throw new Error(`${label}上传失败：${lastError?.message || lastError}`);
  }

  function loadTesseractScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
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

  async function previewGenericPDF(file) {
    const { pdf, task } = await openPdf(file);
    try {
      const metadata = await pdf.getMetadata().catch(() => null);
      const documentTitle = String(metadata?.info?.Title || "").trim();
      const contents = [];
      for (let number = 1; number <= Math.min(2, pdf.numPages); number += 1) {
        const page = await pdf.getPage(number);
        contents.push(await page.getTextContent());
      }
      let heading = "";
      const words = contents.map((content, pageIndex) => {
        const rows = [];
        for (const item of content.items) {
          if (!item.str?.trim() || !item.transform) continue;
          const y = Math.round(item.transform[5] / 4) * 4;
          let row = rows.find((candidate) => candidate.y === y);
          if (!row) { row = { y, parts: [], size: 0 }; rows.push(row); }
          row.size = Math.max(row.size, Math.hypot(item.transform[2], item.transform[3]));
          row.parts.push({ x: item.transform[4], text: item.str });
        }
        rows.sort((a, b) => b.y - a.y);
        const texts = rows.map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(""));
        if (pageIndex === 0 && rows[0]?.size >= 12.5) {
          heading = texts[0];
          for (let i = 1; i < Math.min(4, rows.length); i += 1) {
            if (heading.length < 28 || rows[i].size < rows[0].size * .97
              || rows[i - 1].y - rows[i].y > rows[0].size * 3.5 || /[】”）)]$/.test(heading)) break;
            heading += texts[i];
          }
        }
        return texts.join("\n").trim();
      }).join("\n");
      const prefix = [heading, documentTitle && !/^(?:untitled|无标题|未命名)$/i.test(documentTitle) ? documentTitle : ""].filter(Boolean).join("\n") + "\n";
      if (words.length >= 16) return `${prefix}${words}`;
      const rendered = await renderPage(pdf, 1, 1.25);
      try {
        const worker = await ocrWorker();
        return `${prefix}${String((await worker.recognize(rendered.canvas)).data?.text || "").trim()}`.trim();
      } finally {
        rendered.canvas.width = 0;
        rendered.canvas.height = 0;
        rendered.page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  }

  function init(hooks) {
    const panel = document.getElementById("pdfBatchPanel");
    const tbody = document.getElementById("pdfBatchRows");
    const summary = document.getElementById("pdfBatchSummary");
    const progress = document.getElementById("pdfImportProgress");
    const startButton = document.getElementById("pdfImportStart");
    const cancelButton = document.getElementById("pdfImportCancel");
    const selectAll = document.getElementById("pdfSelectAll");
    let rows = [];
    let catalog = {};
    let busy = false;
    let cancelRequested = false;

    function setSummary(value) { summary.textContent = value; }

    function renderRows() {
      tbody.innerHTML = rows.map((row, index) => `
        <tr data-index="${index}" data-status="${row.status}">
          <td><input type="checkbox" data-field="selected" ${row.selected ? "checked" : ""} ${busy ? "disabled" : ""} aria-label="导入 ${core.escapeHTML(row.file.name)}" /></td>
          <td>${core.escapeHTML(row.file.name)}</td>
          <td class="${row.coverFile ? "pdf-cover-matched" : "pdf-batch-warning"}" title="${core.escapeHTML(row.coverFile?.name || "")}">${row.coverFile ? `已匹配 ${core.escapeHTML(row.coverFile.name)}` : "未找到同名封面"}</td>
          <td><input type="text" data-field="title" value="${core.escapeHTML(row.title)}" ${busy ? "disabled" : ""} /></td>
          <td><input type="date" data-field="date" value="${core.escapeHTML(row.date)}" ${busy ? "disabled" : ""} /></td>
          <td><input type="text" data-field="category" value="${core.escapeHTML(row.category)}" list="categoryOptions" ${busy ? "disabled" : ""} /></td>
          <td class="${row.approximateDate || row.titleNeedsReview ? "pdf-batch-warning" : ""}">${core.escapeHTML(row.message || (row.titleNeedsReview ? "标题可能不完整，请核对" : row.approximateDate ? "仅识别到部分日期，请核对" : row.recognizedBy))}</td>
        </tr>
      `).join("");
      startButton.disabled = busy || !rows.some((row) => row.selected);
      cancelButton.disabled = !busy;
    }

    function updateRow(row) {
      const element = tbody.querySelector(`tr[data-index="${rows.indexOf(row)}"]`);
      if (!element) return;
      element.dataset.status = row.status;
      const statusCell = element.lastElementChild;
      statusCell.textContent = row.message || row.recognizedBy;
      statusCell.classList.toggle("pdf-batch-warning", row.approximateDate || row.titleNeedsReview);
      element.querySelector('[data-field="selected"]').checked = row.selected;
    }

    async function selectFiles(fileList) {
      if (busy) return;
      const chosen = Array.from(fileList || []);
      const indexFile = chosen.find((file) => /^(?:导入索引|cobra-pdf-catalog)\.json$/i.test(file.name));
      if (indexFile) {
        try {
          catalog = await readLocalCatalog(indexFile);
        } catch (error) {
          panel.hidden = false;
          setSummary(`无法读取本地导入索引：${error.message || error}`);
          return;
        }
      }
      const files = core.uniquePDFs(chosen);
      const coverFiles = core.coverFileMap(chosen);
      if (!files.length) {
        panel.hidden = false;
        if (coverFiles.size && rows.length) {
          let matched = 0;
          rows.forEach((row) => {
            const coverFile = coverFiles.get(core.fileStem(row.file.name));
            if (coverFile) { row.coverFile = coverFile; matched += 1; }
          });
          renderRows();
          setSummary(`已补充匹配 ${matched} 张同名封面；未匹配的文章仍会沿用原封面或默认封面。`);
          return;
        }
        if (indexFile && rows.length) {
          renderRows();
          setSummary(`已读取本地索引（${Object.keys(catalog).length} 篇）；现有文章列表保持不变。`);
          return;
        }
        setSummary(indexFile ? `已读取本地索引（${Object.keys(catalog).length} 篇）。现在选择 PDF、同名封面或整个文件夹。` : "所选内容中没有 PDF 文件。");
        return;
      }
      panel.hidden = false;
      setSummary(`正在准备 ${files.length} 个 PDF 的导入信息…`);
      const existingIds = new Set(hooks.getArticles().map((article) => article.id));
      rows = files.map((file) => {
        const indexed = catalog[file.name];
        const entry = indexed?.bytes === file.size ? indexed : null;
        const metadata = core.inferMetadata(file, entry);
        return { file, coverFile: coverFiles.get(core.fileStem(file.name)) || null,
          entry, ...metadata, selected: true, status: "ready",
          message: existingIds.has(metadata.id) ? "已有同源文章：导入将更新" : "" };
      });
      renderRows();
      const indexedCount = rows.filter((row) => row.entry).length;
      const coveredCount = rows.filter((row) => row.coverFile).length;
      setSummary(`已选择 ${files.length} 个 PDF；${indexedCount} 个匹配拆分索引，${coveredCount} 个匹配同名封面。请核对后开始导入。`);
      for (const row of rows.filter((item) => !item.entry)) {
        setSummary(`正在读取未匹配索引的 PDF 标题：${row.file.name}`);
        try {
          const text = await previewGenericPDF(row.file);
          const metadata = core.inferMetadata(row.file, null, text);
          Object.assign(row, metadata);
          row.message = metadata.titleNeedsReview ? "标题可能不完整，请核对"
            : metadata.approximateDate ? "日期不完整，请核对" : "PDF文字/OCR";
        } catch (error) {
          row.message = `无法预览 PDF：${error.message || error}`;
          row.status = "error";
        }
        updateRow(row);
      }
      if (ocrWorkerPromise) {
        const worker = await ocrWorkerPromise.catch(() => null);
        ocrWorkerPromise = null;
        await worker?.terminate();
      }
      renderRows();
      setSummary(`已选择 ${files.length} 个 PDF；${indexedCount} 个匹配拆分索引，${coveredCount} 个匹配同名封面。请核对标题、日期与分类，再开始导入。`);
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function startImport() {
      if (busy) return;
      const selected = rows.filter((row) => row.selected);
      if (!selected.length) return;
      const invalid = selected.find((row) => !row.title.trim() || !row.category.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.date));
      if (invalid) {
        setSummary(`请先填写“${invalid.file.name}”的标题、分类和有效发布日期。`);
        return;
      }
      const approximate = selected.filter((row) => row.approximateDate).length;
      if (approximate && !confirm(`${approximate} 篇文章仅识别到年份或月份，表格中的日期是临时补足的月初/年初日期。确定按当前日期导入吗？`)) return;
      busy = true;
      cancelRequested = false;
      progress.hidden = false;
      progress.max = selected.length;
      progress.value = 0;
      renderRows();
      const api = hooks.api;
      const showOriginal = document.getElementById("pdfImportKeepOriginal").checked;
      const archived = document.getElementById("pdfImportVisibility").value === "archived";
      const layoutMode = document.getElementById("pdfImportLayout")?.value || "embedded";
      let succeeded = 0;
      let failed = 0;
      const categories = new Set();
      for (const row of selected) {
        if (cancelRequested) break;
        row.status = "working";
        row.message = layoutMode === "flow" ? "正在解析可编辑文字与正文图片…"
          : (api.hasApi() ? "正在上传可编辑原版式 PDF…" : "正在保存可编辑原版式 PDF…");
        updateRow(row);
        setSummary(`正在导入 ${succeeded + failed + 1}/${selected.length}：${row.file.name}`);
        try {
          const previous = hooks.getArticles().find((article) => article.id === row.id) || {};
          let html;
          let conversion = null;
          if (layoutMode === "flow") {
            if (!window.SiriusPdfFlowImport?.convert) throw new Error("可编辑 PDF 转换组件没有加载，请刷新页面后重试");
            conversion = await window.SiriusPdfFlowImport.convert(row.file, {
              title: row.title,
              catalogEntry: row.entry,
              saveMedia: (file, label) => saveMediaFile(file, api, label),
              onProgress: ({ message }) => {
                row.message = message;
                updateRow(row);
              },
            });
            html = conversion.html;
          } else {
            html = core.pdfDocumentHTML(row.title);
          }
          if (!html.trim()) throw new Error("PDF 没有可识别的正文或图片");

          let sourcePdf = "";
          if (layoutMode === "embedded" || showOriginal) {
            row.message = api.hasApi() ? "正在上传原 PDF…" : "正在保存原 PDF…";
            updateRow(row);
            sourcePdf = await saveMediaFile(row.file, api, "原 PDF");
          }
          let importedCover = "";
          if (row.coverFile) {
            row.message = "正在上传同名封面…";
            updateRow(row);
            importedCover = await saveMediaFile(row.coverFile, api, "封面");
          }
          const article = {
            ...previous,
            id: row.id,
            title: row.title.trim(),
            category: row.category.trim(),
            date: row.date,
            cover: importedCover || previous.cover || "assets/logo-vector-web.png",
            coverMobile: importedCover ? "" : (previous.coverMobile || ""),
            excerpt: "",
            html,
            paragraphs: [],
            images: [],
            pdfLayoutMode: layoutMode === "flow" ? "flow-html" : "embedded-pdf",
            contentType: "article",
            commentMode: previous.commentMode || "all",
            hot: Number(previous.hot || 0),
            sourcePdf,
            showSourcePdf: Boolean(showOriginal && sourcePdf),
            archived,
            archivedAt: archived ? (previous.archivedAt || new Date().toISOString()) : "",
          };
          const saved = await api.saveArticle(article);
          hooks.onSaved(saved || article, succeeded + failed + 1);
          categories.add(article.category);
          row.status = "done";
          const conversionNote = conversion
            ? `，可编辑正文 ${conversion.textLength} 字、图片 ${conversion.imageCount} 张${conversion.warnings.length ? `；${conversion.warnings.length} 页使用 OCR` : ""}`
            : "，原 PDF 版式（文字层可在编辑器修改）";
          row.message = `${archived ? "已保存到归档栏" : "已公开保存"}${conversionNote}${importedCover ? "（含同名封面）" : ""}`;
          row.selected = false;
          succeeded += 1;
        } catch (error) {
          console.warn(`PDF 导入失败：${row.file.name}`, error);
          row.status = "error";
          row.message = `失败：${error.message || error}`;
          failed += 1;
        }
        progress.value = succeeded + failed;
        updateRow(row);
      }
      if (categories.size) await hooks.onCategories([...categories]).catch((error) => console.warn("保存分类列表失败", error));
      busy = false;
      renderRows();
      hooks.onDone();
      setSummary(`导入结束：成功 ${succeeded} 篇，失败 ${failed} 篇${cancelRequested ? "，其余已取消" : ""}。失败行可保留勾选后重试；简介均未自动生成。`);
    }

    document.getElementById("pdfImportFilesButton").addEventListener("click", () => document.getElementById("pdfImportFiles").click());
    document.getElementById("pdfImportFolderButton").addEventListener("click", () => document.getElementById("pdfImportFolder").click());
    document.getElementById("pdfImportIndexButton").addEventListener("click", () => document.getElementById("pdfImportIndex").click());
    ["pdfImportFiles", "pdfImportFolder", "pdfImportIndex"].forEach((id) => {
      const input = document.getElementById(id);
      input.addEventListener("change", (event) => { selectFiles(event.target.files); input.value = ""; });
    });
    tbody.addEventListener("change", (event) => {
      const index = Number(event.target.closest("tr")?.dataset.index);
      const field = event.target.dataset.field;
      if (!rows[index] || !field || busy) return;
      rows[index][field] = field === "selected" ? event.target.checked : event.target.value;
      if (field === "date") rows[index].approximateDate = false;
      if (field === "title") rows[index].titleNeedsReview = core.incompleteTitle(rows[index].title);
      startButton.disabled = !rows.some((row) => row.selected);
    });
    selectAll.addEventListener("change", () => {
      rows.forEach((row) => { row.selected = selectAll.checked; });
      renderRows();
    });
    startButton.addEventListener("click", startImport);
    cancelButton.addEventListener("click", () => { cancelRequested = true; setSummary("将在当前文章保存后停止。"); });
    cancelButton.disabled = true;
  }

  window.SiriusPdfBatchImport = { init };
})();
