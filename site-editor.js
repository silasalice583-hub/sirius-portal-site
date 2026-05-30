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
    logoImage: "logo抠图.png",
    logoMotion: "strong",
    backgroundImage: "",
    motionBackgroundImage: "",
    articleBannerImage: "assets/articles-banner-art.png",
    aboutImage: "assets/about-footer-art.png",
    hotSpeed: 4500,
    articlesPerPage: 7,
  };

  const state = await window.SiriusAPI.loadState();
  let settingsState = state.settings || {};
  let currentRegion = "global";
  const $ = (selector) => document.querySelector(selector);
  const frame = $("#sitePreviewFrame");
  const status = $("#siteEditorStatus");

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
    return { ...defaultPage, ...(settingsState.page || {}) };
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
    await window.SiriusAPI.saveSettings(settingsState);
    status.textContent = `已保存：${new Date().toLocaleTimeString()}`;
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
    doc.querySelectorAll(previewSelector(currentRegion)).forEach((node) => {
      node.classList.add("site-editor-selected-region");
    });
  }

  function injectPreviewTools() {
    const doc = frame.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = `
      .site-editor-selected-region {
        outline: 3px solid rgba(45, 212, 191, .95) !important;
        outline-offset: -3px !important;
        box-shadow: 0 0 0 9999px rgba(6, 24, 22, .16) !important;
      }
      html, body, body * { cursor: auto !important; }
      a, button, input, textarea, select, [role="button"] { cursor: pointer !important; }
    `;
    doc.head.appendChild(style);
    doc.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectRegion(regionFromElement(event.target));
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
})();
