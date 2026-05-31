(async function () {
  const baseArticles = window.SIRIUS_ARTICLES || [];
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
    homeLatestEyebrow: "Signal",
    homeLatestTitle: "最新文章",
    motionEyebrow: "Portal Motion",
    motionTitle: "阅读、音乐、评论与编辑，被整理为一个可发布的门户系统。",
    aboutEyebrow: "About",
    aboutTitle: "关于门户",
    aboutText: "这里收录 10 篇已排版文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
    logoImage: "assets/logo-cutout-web.png",
    logoMotion: "strong",
    backgroundImage: "",
    motionBackgroundImage: "assets/home-footer-emerald.jpg",
    articleBannerImage: "assets/articles-emerald.jpg",
    aboutImage: "assets/about-emerald.jpg",
    fontFamily: "modern",
    hotSpeed: 4500,
    articlesPerPage: 7,
  };

  const state = await window.SiriusAPI.loadState();
  if (state.source === "api-error") {
    alert(`公网数据库连接失败，页面编辑不会读取本浏览器缓存作为网站数据。\n\n具体错误：${state.apiError}\n\n请先修复 Cloudflare /api 代理或 Railway 后端。`);
  }
  let settingsState = state.settings || {};
  let currentRegion = "global";
  let previewEditing = true;
  const $ = (selector) => document.querySelector(selector);
  const frame = $("#sitePreviewFrame");
  const status = $("#siteEditorStatus");
  if (state.source === "api") {
    status.textContent = `已连接公网内容库 · 版本 ${state.revision || 1}`;
  } else if (state.source === "local") {
    status.textContent = "本地预览模式 · 设置仅保存在当前浏览器";
  }

  function allArticles() {
    const saved = state.articles || [];
    const savedMap = new Map(saved.map((article) => [article.id, article]));
    return [
      ...saved.filter((article) => !baseArticles.some((base) => base.id === article.id)),
      ...baseArticles.map((article) => savedMap.get(article.id) || article),
    ].filter((article) => !article.deleted);
  }

  function articleCategories() {
    return settingsState.categories || [...new Set(allArticles().map((article) => article.category))];
  }

  function setField(id, value) {
    const target = document.getElementById(id);
    if (target) target.value = value || "";
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
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

  function pageSettings() {
    const page = { ...defaultPage, ...(settingsState.page || {}) };
    if (page.logoImage === "logo抠图.png") page.logoImage = defaultPage.logoImage;
    if (!page.motionBackgroundImage) page.motionBackgroundImage = defaultPage.motionBackgroundImage;
    if (page.articleBannerImage === "assets/articles-banner-art.png") page.articleBannerImage = defaultPage.articleBannerImage;
    if (page.aboutImage === "assets/about-footer-art.png") page.aboutImage = defaultPage.aboutImage;
    return page;
  }

  function loadForm() {
    const page = pageSettings();
    const map = {
      pageBrandName: page.brandName,
      pageHeroEyebrow: page.heroEyebrow,
      pageHeroTitle: page.heroTitle,
      pageHeroDescription: page.heroDescription,
      pageHomeLatestEyebrow: page.homeLatestEyebrow,
      pageHomeLatestTitle: page.homeLatestTitle,
      pageMotionEyebrow: page.motionEyebrow,
      pageMotionTitle: page.motionTitle,
      pageMotionBackgroundImage: page.motionBackgroundImage || page.footerImage,
      pagePopularEyebrow: page.popularEyebrow,
      pagePopularTitle: page.popularTitle,
      pageArticleBannerImage: page.articleBannerImage || page.heroBanner || defaultPage.articleBannerImage,
      pageLatestEyebrow: page.latestEyebrow,
      pageAllArticlesTitle: page.allArticlesTitle,
      pageArticlesPerPage: page.articlesPerPage || 7,
      pageAboutEyebrow: page.aboutEyebrow,
      pageAboutTitle: page.aboutTitle,
      pageAboutText: page.aboutText,
      pageAboutImage: page.aboutImage || page.footerImage || defaultPage.aboutImage,
      pageLogoImage: page.logoImage || defaultPage.logoImage,
      pageLogoMotion: page.logoMotion || defaultPage.logoMotion,
      pageBackgroundImage: page.backgroundImage,
      pageFontFamily: page.fontFamily || defaultPage.fontFamily,
      pageHotSpeed: page.hotSpeed || 4500,
      pageCategories: articleCategories().join("\n"),
      siteMusic: settingsState.siteMusic || defaultMusic,
    };
    Object.entries(map).forEach(([id, value]) => setField(id, value));
    $("#siteMusicPreview").src = settingsState.siteMusic || defaultMusic;
    document.querySelectorAll("[data-site-logo]").forEach((image) => {
      image.src = page.logoImage || defaultPage.logoImage;
    });
    renderHotPicker();
  }

  function renderHotPicker() {
    const selected = new Set(settingsState.hotArticleIds || []);
    $("#hotPicker").innerHTML = allArticles().map((article) => `
      <label>
        <input type="checkbox" value="${escapeHTML(article.id)}" ${selected.has(article.id) ? "checked" : ""} />
        <span>${escapeHTML(article.title)}</span>
        <small>${escapeHTML(article.category)}</small>
      </label>
    `).join("");
  }

  function collectSettings() {
    const existingPage = pageSettings();
    const categories = $("#pageCategories").value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const hotArticleIds = Array.from(document.querySelectorAll("#hotPicker input:checked")).map((input) => input.value);
    const page = {
      ...existingPage,
      brandName: $("#pageBrandName").value.trim() || defaultPage.brandName,
      heroEyebrow: $("#pageHeroEyebrow").value.trim() || defaultPage.heroEyebrow,
      heroTitle: $("#pageHeroTitle").value.trim() || defaultPage.heroTitle,
      heroDescription: $("#pageHeroDescription").value.trim() || defaultPage.heroDescription,
      homeLatestEyebrow: $("#pageHomeLatestEyebrow").value.trim() || defaultPage.homeLatestEyebrow,
      homeLatestTitle: $("#pageHomeLatestTitle").value.trim() || defaultPage.homeLatestTitle,
      motionEyebrow: $("#pageMotionEyebrow").value.trim() || defaultPage.motionEyebrow,
      motionTitle: $("#pageMotionTitle").value.trim() || defaultPage.motionTitle,
      motionBackgroundImage: $("#pageMotionBackgroundImage").value.trim(),
      popularEyebrow: $("#pagePopularEyebrow").value.trim() || defaultPage.popularEyebrow,
      popularTitle: $("#pagePopularTitle").value.trim() || defaultPage.popularTitle,
      articleBannerImage: $("#pageArticleBannerImage").value.trim() || defaultPage.articleBannerImage,
      latestEyebrow: $("#pageLatestEyebrow").value.trim() || defaultPage.latestEyebrow,
      allArticlesTitle: $("#pageAllArticlesTitle").value.trim() || defaultPage.allArticlesTitle,
      articlesPerPage: Number($("#pageArticlesPerPage").value || 7),
      aboutEyebrow: $("#pageAboutEyebrow").value.trim() || defaultPage.aboutEyebrow,
      aboutTitle: $("#pageAboutTitle").value.trim() || defaultPage.aboutTitle,
      aboutText: $("#pageAboutText").value.trim() || defaultPage.aboutText,
      aboutImage: $("#pageAboutImage").value.trim() || defaultPage.aboutImage,
      logoImage: $("#pageLogoImage").value.trim() || defaultPage.logoImage,
      logoMotion: $("#pageLogoMotion").value || defaultPage.logoMotion,
      backgroundImage: $("#pageBackgroundImage").value.trim(),
      fontFamily: $("#pageFontFamily").value || defaultPage.fontFamily,
      hotSpeed: Number($("#pageHotSpeed").value || 4500),
    };
    return {
      ...settingsState,
      page,
      categories,
      hotArticleIds,
      siteMusic: $("#siteMusic").value.trim(),
    };
  }

  async function saveSettings() {
    settingsState = collectSettings();
    const saved = await window.SiriusAPI.saveSettings(settingsState);
    status.textContent = window.SiriusAPI.hasApi()
      ? `已发布到公网内容库 · 版本 ${saved.revision || "最新"} · ${new Date().toLocaleTimeString()}`
      : `已保存到当前浏览器 · ${new Date().toLocaleTimeString()}`;
    reloadPreview();
  }

  function selectRegion(region) {
    currentRegion = region;
    document.querySelectorAll("#regionList button").forEach((button) => {
      button.classList.toggle("active", button.dataset.region === region);
    });
    document.querySelectorAll(".plugin-editor-panel .region-fields").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.regionPanel === region);
    });
    markPreviewRegion();
  }

  function regionFromElement(element) {
    if (!element) return "global";
    if (element.closest(".home-hero")) return "hero";
    if (element.closest(".home-section, .motion-band")) return "home";
    if (element.closest(".archive-hero, .hot-showcase, .article-band, .reader")) return "articles";
    if (element.closest(".about-page-hero, .about-cards, .site-footer")) return "about";
    return "global";
  }

  function previewSelector(region) {
    return {
      global: "body",
      hero: ".home-hero",
      home: ".home-section, .motion-band",
      articles: ".archive-hero, .hot-showcase, .article-band",
      about: ".about-page-hero, .about-cards, .site-footer",
    }[region] || "body";
  }

  function markPreviewRegion() {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll(".site-editor-selected-region").forEach((node) => {
      node.classList.remove("site-editor-selected-region");
    });
    if (!currentRegion) return;
    doc.querySelectorAll(previewSelector(currentRegion)).forEach((node) => {
      node.classList.add("site-editor-selected-region");
    });
  }

  const directTextFields = {
    brandName: "pageBrandName",
    heroEyebrow: "pageHeroEyebrow",
    heroTitle: "pageHeroTitle",
    heroDescription: "pageHeroDescription",
    homeLatestEyebrow: "pageHomeLatestEyebrow",
    homeLatestTitle: "pageHomeLatestTitle",
    motionEyebrow: "pageMotionEyebrow",
    motionTitle: "pageMotionTitle",
    popularEyebrow: "pagePopularEyebrow",
    popularTitle: "pagePopularTitle",
    latestEyebrow: "pageLatestEyebrow",
    aboutEyebrow: "pageAboutEyebrow",
    aboutTitle: "pageAboutTitle",
    aboutText: "pageAboutText",
  };

  function editableFieldFor(element) {
    if (!element) return "";
    const key = element.id || element.dataset.site;
    return directTextFields[key] || "";
  }

  function resetPreviewSelection() {
    currentRegion = "";
    document.querySelectorAll("#regionList button").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll(".plugin-editor-panel .region-fields").forEach((panel) => panel.classList.remove("active"));
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll(".site-editor-selected-region").forEach((node) => node.classList.remove("site-editor-selected-region"));
    doc.querySelectorAll("[contenteditable='true']").forEach((node) => node.removeAttribute("contenteditable"));
  }

  function updatePreviewMode() {
    const button = $("#togglePreviewMode");
    button.textContent = previewEditing ? "浏览页面" : "编辑页面";
    button.classList.toggle("active", !previewEditing);
    if (!previewEditing) resetPreviewSelection();
  }

  function injectPreviewTools() {
    const doc = frame.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = `
      .site-editor-selected-region {
        outline: 3px solid rgba(45, 212, 191, .95) !important;
        outline-offset: -3px !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .7), 0 0 22px rgba(45, 212, 191, .26) !important;
      }
      html, body, body * { cursor: auto !important; }
      a, button, input, textarea, select, [role="button"] { cursor: pointer !important; }
      [contenteditable="true"] {
        cursor: text !important;
        outline: 2px dashed rgba(251, 191, 36, .95) !important;
        outline-offset: 4px !important;
      }
    `;
    doc.head.appendChild(style);
    doc.addEventListener("click", (event) => {
      if (!previewEditing) return;
      event.preventDefault();
      event.stopPropagation();
      selectRegion(regionFromElement(event.target));
      const fieldId = editableFieldFor(event.target);
      if (fieldId) {
        event.target.setAttribute("contenteditable", "true");
        event.target.focus();
      }
    }, true);
    doc.addEventListener("input", (event) => {
      if (!previewEditing) return;
      const fieldId = editableFieldFor(event.target);
      if (fieldId) setField(fieldId, event.target.textContent.trim());
    }, true);
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetPreviewSelection();
      }
    }, true);
    markPreviewRegion();
  }

  function reloadPreview() {
    const value = $("#previewPage").value;
    frame.src = `${value}?editorPreview=${Date.now()}`;
  }

  async function setMediaField(inputId, file) {
    if (!file) return;
    setField(inputId, await readFileAsDataURL(file));
    status.textContent = "图片已载入，保存后生效";
  }

  $("#saveSiteButton").addEventListener("click", () => {
    saveSettings().catch((error) => {
      console.warn("保存页面失败", error);
      status.textContent = "保存失败，请检查后端或浏览器存储权限";
    });
  });
  $("#previewPage").addEventListener("change", reloadPreview);
  $("#togglePreviewMode").addEventListener("click", () => {
    previewEditing = !previewEditing;
    updatePreviewMode();
  });
  $("#clearPreviewSelection").addEventListener("click", resetPreviewSelection);
  $("#regionList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-region]");
    if (button) selectRegion(button.dataset.region);
  });
  $("#pageLogoImageFile").addEventListener("change", (event) => setMediaField("pageLogoImage", event.target.files[0]));
  $("#pageBackgroundImageFile").addEventListener("change", (event) => setMediaField("pageBackgroundImage", event.target.files[0]));
  $("#pageMotionBackgroundImageFile").addEventListener("change", (event) => setMediaField("pageMotionBackgroundImage", event.target.files[0]));
  $("#pageArticleBannerImageFile").addEventListener("change", (event) => setMediaField("pageArticleBannerImage", event.target.files[0]));
  $("#pageAboutImageFile").addEventListener("change", (event) => setMediaField("pageAboutImage", event.target.files[0]));
  $("#siteMusic").addEventListener("input", (event) => {
    $("#siteMusicPreview").src = event.target.value || defaultMusic;
  });
  frame.addEventListener("load", injectPreviewTools);

  loadForm();
  selectRegion("global");
  updatePreviewMode();
})();
