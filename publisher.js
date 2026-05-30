(async function () {
  const baseArticles = window.SIRIUS_ARTICLES || [];
  const defaultCover = "logo抠图.png";
  const defaultMusic = "1-8月，让它发生/12 21.mp3";
  const defaultPage = {
    brandName: "天狼星门户",
    heroEyebrow: "Sirius Portal Journal",
    heroTitle: "天狼星门户",
    heroDescription: "以博客杂志的方式整理门户更新、访谈、指南与观察。清晰分类、沉浸阅读、音乐伴随，让每篇文章都更容易被看见和收藏。",
    popularEyebrow: "Popular",
    popularTitle: "热门文章",
    latestEyebrow: "Latest Articles",
    allArticlesTitle: "全部文章",
    aboutEyebrow: "About",
    aboutTitle: "关于门户",
    aboutText: "这里收录 10 篇已排版文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
    backgroundImage: "",
    heroBanner: "",
    heroVideo: "",
    footerImage: "",
    aboutVideo: "",
    hotSpeed: 4500,
    articlesPerPage: 7,
  };

  const editor = document.getElementById("editor");
  const previewCover = document.getElementById("previewCover");
  const state = await window.SiriusAPI.loadState();
  let savedArticlesState = state.articles || [];
  let settingsState = state.settings || {};
  let commentsState = state.comments || {};
  let coverData = defaultCover;
  let editingId = null;
  let editingComments = [];
  let copiedFormat = null;

  function getSavedArticles() {
    return savedArticlesState;
  }

  function getSettings() {
    return settingsState;
  }

  function saveSettingsObject(next) {
    settingsState = next;
    window.SiriusAPI.saveSettings(next).catch((error) => console.warn("保存设置失败", error));
  }

  function allArticles() {
    const saved = getSavedArticles();
    const savedMap = new Map(saved.map((article) => [article.id, article]));
    return [
      ...saved.filter((article) => !baseArticles.some((base) => base.id === article.id)),
      ...baseArticles.map((article) => savedMap.get(article.id) || article),
    ].filter((article) => !article.deleted);
  }

  function articleCategories() {
    const settings = getSettings();
    return settings.categories || [...new Set(allArticles().map((article) => article.category))];
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function defaultComments(articleId) {
    return [
      { id: `${articleId}-星门读者`, name: "星门读者", body: "这篇整理得很清楚，适合回看重点。", featured: true, approved: true },
      { id: `${articleId}-晨光`, name: "晨光", body: "已收藏，准备转给同修一起阅读。", featured: false, approved: true },
    ];
  }

  function getAllComments() {
    return commentsState;
  }

  function getArticleComments(articleId) {
    const all = getAllComments();
    return all[articleId] || defaultComments(articleId);
  }

  function saveArticleComments(articleId, comments) {
    commentsState = { ...commentsState, [articleId]: comments };
    window.SiriusAPI.saveComments(articleId, comments).catch((error) => console.warn("保存评论失败", error));
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function mediaEmbed(url) {
    if (!url) return "";
    const safe = escapeHTML(url);
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url) || url.startsWith("data:video/")) {
      return `<video src="${safe}" controls playsinline></video>`;
    }
    if (/youtube\.com|youtu\.be|bilibili\.com|vimeo\.com/i.test(url)) {
      return `<iframe src="${safe}" loading="lazy" allowfullscreen></iframe>`;
    }
    return `<video src="${safe}" controls playsinline></video>`;
  }

  function audioEmbed(url) {
    if (!url) return "";
    return `<div class="inline-audio"><audio src="${escapeHTML(url)}" controls></audio></div>`;
  }

  function setField(id, value) {
    document.getElementById(id).value = value || "";
  }

  function refreshPreview() {
    const coverUrl = document.getElementById("coverUrl").value.trim();
    const title = document.getElementById("postTitle").value || "文章预览";
    const excerpt = document.getElementById("postExcerpt").value.trim();
    if (coverUrl) {
      coverData = coverUrl;
      previewCover.src = coverUrl;
    }
    document.getElementById("previewTitle").textContent = title;
    document.getElementById("previewExcerpt").textContent = excerpt;
    document.getElementById("previewBody").innerHTML = editor.innerHTML;
  }

  function command(name, value = null) {
    editor.focus();
    document.execCommand(name, false, value);
    refreshPreview();
  }

  function selectedElement() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    let node = selection.anchorNode;
    if (!editor.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node;
  }

  function blockFor(node) {
    return node?.closest?.("p,h1,h2,h3,h4,h5,h6,li,blockquote,div") || editor;
  }

  function copyCurrentFormat() {
    const block = blockFor(selectedElement());
    const style = window.getComputedStyle(block);
    copiedFormat = {
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textAlign: style.textAlign,
      lineHeight: style.lineHeight,
    };
    document.getElementById("formatBrushButton").classList.add("active");
  }

  function applyCopiedFormat() {
    if (!copiedFormat) {
      copyCurrentFormat();
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      const block = blockFor(selectedElement());
      applyStyle(block, copiedFormat);
    } else {
      const range = selection.getRangeAt(0);
      const blocks = Array.from(editor.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,div"))
        .filter((block) => range.intersectsNode(block));
      if (blocks.length) {
        blocks.forEach((block) => applyStyle(block, copiedFormat));
      } else {
        const span = document.createElement("span");
        applyStyle(span, copiedFormat);
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    copiedFormat = null;
    document.getElementById("formatBrushButton").classList.remove("active");
    refreshPreview();
  }

  function applyStyle(element, style) {
    element.style.color = style.color;
    element.style.fontFamily = style.fontFamily;
    element.style.fontSize = style.fontSize;
    element.style.fontWeight = style.fontWeight;
    element.style.fontStyle = style.fontStyle;
    element.style.textAlign = style.textAlign;
    element.style.lineHeight = style.lineHeight;
  }

  async function setCover(file) {
    if (!file) return;
    coverData = await readFileAsDataURL(file);
    document.getElementById("coverUrl").value = "";
    previewCover.src = coverData;
  }

  async function setMediaField(inputId, file) {
    if (!file) return;
    setField(inputId, await readFileAsDataURL(file));
  }

  function makeArticle() {
    const original = allArticles().find((article) => article.id === editingId) || {};
    const title = document.getElementById("postTitle").value.trim() || "未命名文章";
    const category = document.getElementById("postCategory").value.trim() || "未分类";
    const coverUrl = document.getElementById("coverUrl").value.trim();
    const text = editor.textContent.replace(/\s+/g, " ").trim();
    const excerpt = document.getElementById("postExcerpt").value.trim() || text.slice(0, 160);
    return {
      id: editingId || `local-${Date.now()}`,
      title,
      category,
      date: document.getElementById("postDate").value || new Date().toISOString().slice(0, 10),
      cover: coverUrl || coverData || defaultCover,
      excerpt,
      hot: Number(document.getElementById("hotScore").value || 0),
      commentMode: document.getElementById("commentMode").value,
      music: document.getElementById("articleMusic").value.trim(),
      video: document.getElementById("articleVideo").value.trim(),
      sourceDoc: original.sourceDoc || "",
      sourcePdf: original.sourcePdf || "",
      images: original.images || [],
      paragraphs: [],
      html: editor.innerHTML,
    };
  }

  function saveArticle() {
    const next = makeArticle();
    savedArticlesState = [next, ...getSavedArticles().filter((article) => article.id !== next.id)];
    window.SiriusAPI.saveArticle(next).catch((error) => console.warn("保存文章失败", error));
    editingId = next.id;
    renderManager();
    renderCategoryOptions();
    renderHotPicker();
    alert("已保存。门户首页刷新后会显示最新内容。");
  }

  function autoSaveArticle() {
    const next = makeArticle();
    savedArticlesState = [next, ...getSavedArticles().filter((article) => article.id !== next.id)];
    window.SiriusAPI.saveArticle(next).catch((error) => console.warn("自动保存文章失败", error));
    editingId = next.id;
    renderManager();
    renderCategoryOptions();
    renderHotPicker();
  }

  function loadArticle(article) {
    editingId = article.id;
    coverData = article.cover || defaultCover;
    setField("postTitle", article.title);
    setField("postCategory", article.category);
    setField("coverUrl", article.cover && article.cover.startsWith("data:") ? "" : article.cover);
    setField("articleMusic", article.music);
    setField("articleVideo", article.video);
    setField("postDate", article.date);
    setField("hotScore", article.hot || 0);
    setField("postExcerpt", article.excerpt);
    document.getElementById("commentMode").value = article.commentMode || "all";
    editor.innerHTML = article.html || (article.paragraphs || []).map((p) => `<p>${escapeHTML(p)}</p>`).join("");
    previewCover.src = coverData;
    refreshPreview();
    renderCommentAdmin();
    showPanel("articlesPanel");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newArticle() {
    editingId = null;
    coverData = defaultCover;
    setField("postTitle", "");
    setField("postCategory", "");
    setField("coverUrl", "");
    setField("articleMusic", "");
    setField("articleVideo", "");
    setField("postDate", new Date().toISOString().slice(0, 10));
    setField("hotScore", "80");
    setField("postExcerpt", "");
    document.getElementById("commentMode").value = "all";
    editor.innerHTML = "<h2>在这里输入文章正文</h2><p>可以设置字体、字号、段落、对齐方式，也可以插入图片和文中播放音乐。</p>";
    previewCover.src = coverData;
    refreshPreview();
    document.getElementById("commentAdmin").hidden = true;
    showPanel("articlesPanel");
  }

  function renderCommentAdmin() {
    const box = document.getElementById("commentAdmin");
    const list = document.getElementById("commentEditorList");
    if (!editingId) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    editingComments = getArticleComments(editingId);
    list.innerHTML = editingComments.map((comment) => `
      <div class="comment-edit-row" data-comment-id="${escapeHTML(comment.id)}">
        <label>昵称<input data-comment-field="name" value="${escapeHTML(comment.name)}" /></label>
        <label class="comment-body-field">评论<textarea data-comment-field="body">${escapeHTML(comment.body)}</textarea></label>
        <label class="featured-check"><input type="checkbox" data-comment-field="approved" ${comment.approved ? "checked" : ""} /> 展示评论</label>
        <label class="featured-check"><input type="checkbox" data-comment-field="featured" ${comment.featured ? "checked" : ""} /> 精选评论</label>
        <button type="button" data-comment-delete="${escapeHTML(comment.id)}">删除</button>
      </div>
    `).join("") || "<p class=\"muted-text\">暂无评论。</p>";
  }

  function collectCommentAdmin() {
    if (!editingId) return [];
    return Array.from(document.querySelectorAll(".comment-edit-row")).map((row) => ({
      id: row.dataset.commentId,
      name: row.querySelector('[data-comment-field="name"]').value.trim() || "匿名",
      body: row.querySelector('[data-comment-field="body"]').value.trim(),
      approved: row.querySelector('[data-comment-field="approved"]').checked,
      featured: row.querySelector('[data-comment-field="featured"]').checked,
    })).filter((comment) => comment.body);
  }

  function saveCurrentComments() {
    if (!editingId) return;
    saveArticleComments(editingId, collectCommentAdmin());
    renderCommentAdmin();
    alert("评论已保存。");
  }

  function deleteArticle(id) {
    if (!confirm("确定要从本地门户中隐藏这篇文章吗？")) return;
    const base = baseArticles.find((article) => article.id === id);
    const existing = allArticles().find((article) => article.id === id);
    const hidden = { ...(existing || base), id, deleted: true };
    savedArticlesState = [hidden, ...getSavedArticles().filter((article) => article.id !== id)];
    window.SiriusAPI.hideArticle(hidden).catch((error) => console.warn("隐藏文章失败", error));
    if (editingId === id) newArticle();
    renderManager();
    renderHotPicker();
  }

  function renderManager() {
    document.getElementById("articleManager").innerHTML = `
      <table>
        <thead><tr><th>标题</th><th>分类</th><th>简介</th><th>评论</th><th>操作</th></tr></thead>
        <tbody>
          ${allArticles().map((article) => `
            <tr>
              <td>${escapeHTML(article.title)}</td>
              <td>${escapeHTML(article.category)}</td>
              <td>${escapeHTML(article.excerpt || "").slice(0, 42)}</td>
              <td>${article.commentMode === "closed" ? "关闭" : article.commentMode === "featured" ? "精选" : "全部"}</td>
              <td>
                <button type="button" data-edit="${article.id}">编辑</button>
                <button type="button" data-delete="${article.id}">隐藏</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderCategoryOptions() {
    document.getElementById("categoryOptions").innerHTML = articleCategories()
      .map((category) => `<option value="${escapeHTML(category)}"></option>`)
      .join("");
  }

  function loadPageEditor() {
    const settings = getSettings();
    const page = { ...defaultPage, ...(settings.page || {}) };
    const map = {
      pageBrandName: page.brandName,
      pageHeroEyebrow: page.heroEyebrow,
      pageHeroTitle: page.heroTitle,
      pageHeroDescription: page.heroDescription,
      pagePopularEyebrow: page.popularEyebrow,
      pagePopularTitle: page.popularTitle,
      pageLatestEyebrow: page.latestEyebrow,
      pageAllArticlesTitle: page.allArticlesTitle,
      pageArticlesPerPage: page.articlesPerPage || 7,
      pageAboutEyebrow: page.aboutEyebrow,
      pageAboutTitle: page.aboutTitle,
      pageAboutText: page.aboutText,
      pageBackgroundImage: page.backgroundImage,
      pageHeroBanner: page.heroBanner,
      pageHeroVideo: page.heroVideo,
      pageFooterImage: page.footerImage,
      pageAboutVideo: page.aboutVideo,
      pageHotSpeed: page.hotSpeed || 4500,
      pageCategories: (settings.categories || articleCategories()).join("\n"),
    };
    Object.entries(map).forEach(([id, value]) => setField(id, value));
    renderHotPicker();
  }

  function savePage() {
    const settings = getSettings();
    const categories = document.getElementById("pageCategories").value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const hotArticleIds = Array.from(document.querySelectorAll("#hotPicker input:checked")).map((input) => input.value);
    const page = {
      brandName: document.getElementById("pageBrandName").value.trim() || defaultPage.brandName,
      heroEyebrow: document.getElementById("pageHeroEyebrow").value.trim() || defaultPage.heroEyebrow,
      heroTitle: document.getElementById("pageHeroTitle").value.trim() || defaultPage.heroTitle,
      heroDescription: document.getElementById("pageHeroDescription").value.trim() || defaultPage.heroDescription,
      popularEyebrow: document.getElementById("pagePopularEyebrow").value.trim() || defaultPage.popularEyebrow,
      popularTitle: document.getElementById("pagePopularTitle").value.trim() || defaultPage.popularTitle,
      latestEyebrow: document.getElementById("pageLatestEyebrow").value.trim() || defaultPage.latestEyebrow,
      allArticlesTitle: document.getElementById("pageAllArticlesTitle").value.trim() || defaultPage.allArticlesTitle,
      articlesPerPage: Number(document.getElementById("pageArticlesPerPage").value || 7),
      aboutEyebrow: document.getElementById("pageAboutEyebrow").value.trim() || defaultPage.aboutEyebrow,
      aboutTitle: document.getElementById("pageAboutTitle").value.trim() || defaultPage.aboutTitle,
      aboutText: document.getElementById("pageAboutText").value.trim() || defaultPage.aboutText,
      backgroundImage: document.getElementById("pageBackgroundImage").value.trim(),
      heroBanner: document.getElementById("pageHeroBanner").value.trim(),
      heroVideo: document.getElementById("pageHeroVideo").value.trim(),
      footerImage: document.getElementById("pageFooterImage").value.trim(),
      aboutVideo: document.getElementById("pageAboutVideo").value.trim(),
      hotSpeed: Number(document.getElementById("pageHotSpeed").value || 4500),
    };
    saveSettingsObject({ ...settings, page, categories, hotArticleIds });
    renderCategoryOptions();
    alert("页面设置已保存。刷新门户首页即可查看。");
  }

  function renderHotPicker() {
    const settings = getSettings();
    const selected = new Set(settings.hotArticleIds || []);
    document.getElementById("hotPicker").innerHTML = allArticles().map((article) => `
      <label>
        <input type="checkbox" value="${article.id}" ${selected.has(article.id) ? "checked" : ""} />
        <span>${escapeHTML(article.title)}</span>
        <small>${escapeHTML(article.category)}</small>
      </label>
    `).join("");
  }

  function saveSettings() {
    const settings = getSettings();
    const siteMusic = document.getElementById("siteMusic").value.trim();
    saveSettingsObject({ ...settings, siteMusic });
    document.getElementById("siteMusicPreview").src = siteMusic || defaultMusic;
    alert("站点设置已保存。");
  }

  function loadSettings() {
    const settings = getSettings();
    document.getElementById("siteMusic").value = settings.siteMusic || defaultMusic;
    document.getElementById("siteMusicPreview").src = settings.siteMusic || defaultMusic;
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(makeArticle(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sirius-article.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : [data];
        const normalized = imported.map((article) => ({
          ...article,
          id: article.id || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: article.title || "导入文章",
          category: article.category || "未分类",
          date: article.date || new Date().toISOString().slice(0, 10),
          cover: article.cover || defaultCover,
          excerpt: article.excerpt || "",
          commentMode: article.commentMode || "all",
          html: article.html || (article.paragraphs || []).map((p) => `<p>${escapeHTML(p)}</p>`).join(""),
        }));
        const existing = getSavedArticles().filter((article) => !normalized.some((item) => item.id === article.id));
        savedArticlesState = [...normalized, ...existing];
        window.SiriusAPI.saveArticles(normalized).catch((error) => console.warn("导入文章保存失败", error));
        renderManager();
        renderCategoryOptions();
        renderHotPicker();
        if (normalized[0]) loadArticle(normalized[0]);
        alert(`已导入 ${normalized.length} 篇文章。`);
      } catch (error) {
        alert("JSON 文件格式不正确，无法导入。");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function showPanel(panelId) {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.panel === panelId);
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
    if (panelId === "pagePanel") loadPageEditor();
    if (panelId === "settingsPanel") loadSettings();
  }

  function showRegion(region) {
    document.querySelectorAll(".editable-region").forEach((button) => {
      button.classList.toggle("active", button.dataset.region === region);
    });
    document.querySelectorAll(".region-fields").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.regionPanel === region);
    });
  }

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => command(button.dataset.command));
  });
  document.getElementById("fontName").addEventListener("change", (event) => command("fontName", event.target.value));
  document.getElementById("fontSize").addEventListener("change", (event) => command("fontSize", event.target.value));
  document.getElementById("undoButton").addEventListener("click", () => command("undo"));
  document.getElementById("redoButton").addEventListener("click", () => command("redo"));
  document.getElementById("formatBrushButton").addEventListener("click", applyCopiedFormat);
  document.getElementById("fontColor").addEventListener("input", (event) => command("foreColor", event.target.value));
  document.getElementById("paragraphButton").addEventListener("click", () => command("formatBlock", "p"));
  document.getElementById("imageButton").addEventListener("click", () => document.getElementById("bodyImageInput").click());
  document.getElementById("videoButton").addEventListener("click", () => {
    const url = prompt("输入视频地址（MP4/WebM/视频页面链接）");
    if (!url) return;
    command("insertHTML", mediaEmbed(url));
    autoSaveArticle();
  });
  document.getElementById("audioButton").addEventListener("click", () => {
    const url = prompt("输入音乐地址（MP3 或音频链接）");
    if (!url) return;
    command("insertHTML", audioEmbed(url));
    autoSaveArticle();
  });
  document.getElementById("bodyImageInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    command("insertImage", await readFileAsDataURL(file));
    autoSaveArticle();
  });
  document.getElementById("coverInput").addEventListener("change", (event) => setCover(event.target.files[0]));
  ["coverUrl", "postTitle", "postExcerpt"].forEach((id) => document.getElementById(id).addEventListener("input", refreshPreview));
  document.getElementById("pageBackgroundImageFile").addEventListener("change", (event) => setMediaField("pageBackgroundImage", event.target.files[0]));
  document.getElementById("pageHeroBannerFile").addEventListener("change", (event) => setMediaField("pageHeroBanner", event.target.files[0]));
  document.getElementById("pageHeroVideoFile").addEventListener("change", (event) => setMediaField("pageHeroVideo", event.target.files[0]));
  document.getElementById("pageFooterImageFile").addEventListener("change", (event) => setMediaField("pageFooterImage", event.target.files[0]));
  document.getElementById("pageAboutVideoFile").addEventListener("change", (event) => setMediaField("pageAboutVideo", event.target.files[0]));
  editor.addEventListener("input", refreshPreview);
  document.getElementById("previewButton").addEventListener("click", refreshPreview);
  document.getElementById("publishButton").addEventListener("click", saveArticle);
  document.getElementById("exportButton").addEventListener("click", exportJSON);
  document.getElementById("importButton").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", (event) => importJSON(event.target.files[0]));
  document.getElementById("clearButton").addEventListener("click", newArticle);
  document.getElementById("newPostButton").addEventListener("click", newArticle);
  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("savePageButton").addEventListener("click", savePage);
  document.getElementById("saveCommentsButton").addEventListener("click", saveCurrentComments);
  document.getElementById("siteMusic").addEventListener("input", (event) => {
    document.getElementById("siteMusicPreview").src = event.target.value || defaultMusic;
  });

  document.getElementById("articleManager").addEventListener("click", (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) loadArticle(allArticles().find((article) => article.id === editId));
    if (deleteId) deleteArticle(deleteId);
  });

  document.getElementById("commentEditorList").addEventListener("click", (event) => {
    const deleteId = event.target.dataset.commentDelete;
    if (!deleteId) return;
    editingComments = collectCommentAdmin().filter((comment) => comment.id !== deleteId);
    saveArticleComments(editingId, editingComments);
    renderCommentAdmin();
  });

  document.querySelectorAll(".admin-tab").forEach((button) => {
    button.addEventListener("click", () => showPanel(button.dataset.panel));
  });
  document.querySelectorAll("[data-panel-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showPanel(link.dataset.panelLink);
      history.replaceState(null, "", `#${link.dataset.panelLink}`);
    });
  });
  document.querySelectorAll(".editable-region").forEach((button) => {
    button.addEventListener("click", () => showRegion(button.dataset.region));
  });

  renderManager();
  renderCategoryOptions();
  loadPageEditor();
  loadSettings();
  newArticle();
})();
