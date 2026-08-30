(async function () {
  const baseArticles = window.SIRIUS_ARTICLES || [];
  const retiredArticleIds = new Set([
    "article-1", "article-2", "article-3", "article-4", "article-5",
    "article-6", "article-7", "article-8", "article-9", "article-10",
  ]);
  const retiredArticleSignatures = new Set([
    "2025-08-19|相干信号——量变引发质变", "2025-08-18|由人们的生活想到的",
    "2025-08-17|助推说明", "2025-08-16|聚精会神，塑造美好未来",
    "2025-08-14|25.8.14 扬升门户开启第2部分", "2025-08-12|8月，让它发生",
    "2025-08-08|故事：简报", "2025-08-04|25.8.4 最终更新&新访谈",
    "2025-07-30|八月星象 访谈", "2025-07-29|25.7.29 门户更新&联合访谈",
  ]);
  const isRetiredArticle = (article) => retiredArticleIds.has(article.id)
    || retiredArticleSignatures.has(`${article.date || ""}|${article.title || ""}`);
  const defaultCategories = ["门户更新", "会议", "访谈", "重要冥想", "文章更新", "相关资料"];
  const normalizeCategory = (category) => category === "冥想发布" ? "重要冥想" : category;
  const normalizeCategories = (categories) => {
    const normalized = [...new Set((categories || []).map(normalizeCategory).filter(Boolean))];
    if (!normalized.includes("重要冥想")) normalized.push("重要冥想");
    if (!normalized.includes("相关资料")) normalized.push("相关资料");
    return normalized;
  };
  const defaultMusic = "";
  const defaultPage = {
    brandName: "天狼星之光",
    heroEyebrow: "Light of Sirius Journal",
    heroTitle: "天狼星之光",
    heroDescription: "以博客杂志的方式整理门户更新、访谈、指南与观察。清晰分类、沉浸阅读、音乐伴随，让每篇文章都更容易被看见和收藏。",
    popularEyebrow: "Popular",
    popularTitle: "热门文章",
    latestEyebrow: "Latest Articles",
    allArticlesTitle: "全部文章",
    homeLatestEyebrow: "Signal",
    homeLatestTitle: "最新文章",
    motionEyebrow: "声明：",
    motionTitle: "本网站所涉内容大多来自网络共享的资源和观点，内容性质属虚构和半虚构，由个人整理，不构成任何宗教立场、政治主张或价值倡导 -- 请读者运用自己的判断力进行理性思考，不迷信、不盲从，不参与任何形式的个人崇拜或迷信行为。\n\n若网站内容与任何地区的法律政策有所冲突，本网站将依法进行调整和删除，并保留修改变更、终止分享的所有权利。\n\n本网站坚决拥护依法治网，反对任何形式的违法宣扬，所呈内容仅作思维拓展和幻想作品参考使用。",
    aboutEyebrow: "About",
    aboutTitle: "关于天狼星之光",
    aboutText: "这里持续收录经过整理与排版的文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
    logoImage: "assets/logo-vector-web.png",
    heroLogoImage: "assets/logo-original.png",
    logoMotion: "strong",
    backgroundImage: "",
    motionBackgroundImage: "assets/home-footer-emerald.jpg",
    articleBannerImage: "assets/articles-emerald.jpg",
    aboutImage: "assets/about-emerald.jpg",
    fontFamily: "modern",
    hotSpeed: 4500,
    articlesPerPage: 7,
    colors: { motionEyebrow: "#b794f4" },
  };
  const legacyMotionTitle = "阅读、音乐、评论与编辑，被整理为一个可发布的门户系统。";
  const isSiteDeclaration = (value) => /本网站所涉内容大多来自网络共享的资源和观点/.test(value || "")
    && /本网站坚决拥护依法治网/.test(value || "");

  const state = await window.SiriusAPI.loadState();
  if (state.source === "api-error") {
    alert(`公网数据库连接失败，页面编辑不会读取本浏览器缓存作为网站数据。\n\n具体错误：${state.apiError}\n\n请先修复 Cloudflare /api 代理或 Railway 后端。`);
  }
  let settingsState = state.settings || {};
  let currentRegion = "global";
  let siteMusicPlaylistState = [];
  let meditationScheduleState = [];
  let fontSizesState = {};
  let colorsState = {};
  const $ = (selector) => document.querySelector(selector);
  const frame = $("#sitePreviewFrame");
  const previewViewport = $("#sitePreviewViewport");
  const previewStage = $("#sitePreviewStage");
  const status = $("#siteEditorStatus");
  const previewDesignWidth = 1440;
  let previewResizeObserver = null;
  let previewScaleFrame = 0;
  const textFieldDefinitions = {
    pageBrandName: { key: "brandName", selector: '[data-site="brandName"]' },
    pageHeroEyebrow: { key: "heroEyebrow", selector: "#heroEyebrow" },
    pageHeroTitle: { key: "heroTitle", selector: "#heroTitle" },
    pageHeroDescription: { key: "heroDescription", selector: "#heroDescription" },
    pageHomeLatestEyebrow: { key: "homeLatestEyebrow", selector: "#homeLatestEyebrow" },
    pageHomeLatestTitle: { key: "homeLatestTitle", selector: "#homeLatestTitle" },
    pageMotionEyebrow: { key: "motionEyebrow", selector: "#motionEyebrow" },
    pageMotionTitle: { key: "motionTitle", selector: "#motionTitle" },
    pagePopularEyebrow: { key: "popularEyebrow", selector: "#popularEyebrow" },
    pagePopularTitle: { key: "popularTitle", selector: "#popularTitle" },
    pageLatestEyebrow: { key: "latestEyebrow", selector: "#latestEyebrow" },
    pageAllArticlesTitle: { key: "allArticlesTitle", selector: "#listTitle" },
    pageAboutEyebrow: { key: "aboutEyebrow", selector: "#aboutEyebrow" },
    pageAboutTitle: { key: "aboutTitle", selector: "#aboutTitle" },
    pageAboutText: { key: "aboutText", selector: "#aboutText" },
  };
  const designFontSizes = {
    brandName: 22,
    heroEyebrow: 13,
    heroTitle: 68,
    heroDescription: 18,
    homeLatestEyebrow: 13,
    homeLatestTitle: 42,
    motionEyebrow: 13,
    motionTitle: 15,
    popularEyebrow: 13,
    popularTitle: 76,
    latestEyebrow: 13,
    allArticlesTitle: 42,
    aboutEyebrow: 13,
    aboutTitle: 76,
    aboutText: 16,
  };
  const designColors = {
    brandName: "#233067",
    heroEyebrow: "#0d7a69",
    heroTitle: "#233067",
    heroDescription: "#233067",
    homeLatestEyebrow: "#b7791f",
    homeLatestTitle: "#233067",
    motionEyebrow: "#b794f4",
    motionTitle: "#ffffff",
    popularEyebrow: "#0d7a69",
    popularTitle: "#233067",
    latestEyebrow: "#b7791f",
    allArticlesTitle: "#233067",
    aboutEyebrow: "#0d7a69",
    aboutTitle: "#233067",
    aboutText: "#233067",
  };
  const fontSizeSelectors = Object.fromEntries(
    Object.values(textFieldDefinitions).map(({ key, selector }) => [key, selector]),
  );
  if (state.source === "api") {
    status.textContent = `已连接公网内容库 · 版本 ${state.revision || 1}`;
  } else if (state.source === "local") {
    status.textContent = "本地预览模式 · 设置仅保存在当前浏览器";
  }

  function allArticles() {
    const saved = (state.articles || [])
      .filter((article) => !isRetiredArticle(article))
      .map((article) => ({ ...article, category: normalizeCategory(article.category) }));
    const savedMap = new Map(saved.map((article) => [article.id, article]));
    return [
      ...saved.filter((article) => !baseArticles.some((base) => base.id === article.id)),
      ...baseArticles.filter((article) => !isRetiredArticle(article)).map((article) => savedMap.get(article.id) || { ...article, category: normalizeCategory(article.category) }),
    ].filter((article) => !article.deleted && !article.archived);
  }

  function articleCategories() {
    const configured = settingsState.categories || [];
    return normalizeCategories(configured.length ? configured : defaultCategories);
  }

  function setField(id, value) {
    const target = document.getElementById(id);
    if (target) target.value = value || "";
  }

  function installTextStyleControls() {
    Object.entries(textFieldDefinitions).forEach(([fieldId, { key }]) => {
      const field = document.getElementById(fieldId);
      const textLabel = field?.closest("label");
      if (!field || !textLabel || textLabel.closest(".text-setting-row")) return;
      const row = document.createElement("div");
      row.className = "text-setting-row";
      textLabel.before(row);
      row.appendChild(textLabel);
      const sizeLabel = document.createElement("label");
      sizeLabel.className = "field-font-size";
      sizeLabel.innerHTML = `字号（px）<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-font-size-key="${key}" />`;
      row.appendChild(sizeLabel);
      const colorLabel = document.createElement("label");
      colorLabel.className = "field-color";
      colorLabel.innerHTML = `颜色<input type="color" data-color-key="${key}" aria-label="文字颜色" />`;
      row.appendChild(colorLabel);
    });
  }

  function preciseFontSize(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function normalizeFontSizes(rawSizes = {}) {
    const normalized = { ...designFontSizes };
    Object.values(textFieldDefinitions).forEach(({ key, selector }) => {
      const rawValue = Object.prototype.hasOwnProperty.call(rawSizes, key) ? rawSizes[key] : rawSizes[selector];
      const size = Number(rawValue);
      if (rawValue !== "" && Number.isFinite(size) && size >= 0 && size <= 100) normalized[key] = preciseFontSize(size);
    });
    return normalized;
  }

  function normalizeColors(rawColors = {}) {
    const normalized = { ...designColors };
    Object.values(textFieldDefinitions).forEach(({ key, selector }) => {
      const color = String(Object.prototype.hasOwnProperty.call(rawColors, key) ? rawColors[key] : rawColors[selector] || "").trim();
      if (/^#[0-9a-f]{6}$/i.test(color)) normalized[key] = color.toLowerCase();
    });
    return normalized;
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
    if (!page.brandName || page.brandName === "天狼星门户") page.brandName = defaultPage.brandName;
    if (!page.heroEyebrow || page.heroEyebrow === "Sirius Portal Journal") page.heroEyebrow = defaultPage.heroEyebrow;
    if (!page.heroTitle || page.heroTitle === "天狼星门户") page.heroTitle = defaultPage.heroTitle;
    if (!page.aboutTitle || page.aboutTitle === "关于门户") page.aboutTitle = defaultPage.aboutTitle;
    if (!page.motionTitle || page.motionTitle === legacyMotionTitle || isSiteDeclaration(page.motionTitle)) page.motionTitle = defaultPage.motionTitle;
    if (!page.motionEyebrow || page.motionEyebrow === "Portal Motion") page.motionEyebrow = defaultPage.motionEyebrow;
    if (page.logoImage === "logo抠图.png" || page.logoImage === "assets/logo-cutout-web.png") page.logoImage = defaultPage.logoImage;
    if (!page.heroLogoImage || ["logo抠图.png", "assets/logo-render-web.png", "assets/logo-cutout-web.png"].includes(page.heroLogoImage)) {
      page.heroLogoImage = defaultPage.heroLogoImage;
    }
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
      pageHeroLogoImage: page.heroLogoImage || defaultPage.heroLogoImage,
      pageLogoMotion: page.logoMotion || defaultPage.logoMotion,
      pageBackgroundImage: page.backgroundImage,
      pageFontFamily: page.fontFamily || defaultPage.fontFamily,
      pageHotSpeed: page.hotSpeed || 4500,
      pageCategories: articleCategories().join("\n"),
    };
    Object.entries(map).forEach(([id, value]) => setField(id, value));
    siteMusicPlaylistState = (settingsState.siteMusicPlaylist || [])
      .map((item, index) => typeof item === "string" ? { title: `背景音乐 ${index + 1}`, url: item } : item)
      .filter((item) => item?.url);
    if (!siteMusicPlaylistState.length) {
      siteMusicPlaylistState = [{ title: "背景音乐", url: settingsState.siteMusic || defaultMusic }];
    }
    meditationScheduleState = (settingsState.collectiveMeditationSchedule || []).map((item) => ({ ...item }));
    fontSizesState = normalizeFontSizes(page.fontSizes || {});
    colorsState = normalizeColors(page.colors || {});
    document.querySelectorAll("[data-font-size-key]").forEach((input) => {
      const size = fontSizesState[input.dataset.fontSizeKey];
      input.value = Number.isFinite(size) ? String(size) : "";
    });
    document.querySelectorAll("[data-color-key]").forEach((input) => {
      input.value = colorsState[input.dataset.colorKey] || designColors[input.dataset.colorKey] || "#233067";
    });
    renderSiteMusicPlaylist();
    renderMeditationSchedule();
    updateMusicPreview();
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

  function renderSiteMusicPlaylist() {
    $("#siteMusicPlaylist").innerHTML = siteMusicPlaylistState.map((item, index) => `
      <div class="playlist-row" data-music-index="${index}">
        <span class="playlist-order">${index + 1}</span>
        <input data-music-field="title" value="${escapeHTML(item.title || `背景音乐 ${index + 1}`)}" placeholder="音乐名称" />
        <input data-music-field="url" value="${escapeHTML(item.url || "")}" placeholder="MP3 地址或本地路径" />
        <button data-music-action="up" type="button" title="上移">↑</button>
        <button data-music-action="down" type="button" title="下移">↓</button>
        <button data-music-action="preview" type="button" title="试听">▶</button>
        <label class="inline-upload-action" title="上传音乐">⇧<input data-music-upload type="file" accept="audio/*" hidden /></label>
        <button data-music-action="remove" type="button" title="删除">×</button>
      </div>
    `).join("");
  }

  function collectSiteMusicPlaylist() {
    return Array.from(document.querySelectorAll(".playlist-row")).map((row, index) => ({
      title: row.querySelector('[data-music-field="title"]').value.trim() || `背景音乐 ${index + 1}`,
      url: row.querySelector('[data-music-field="url"]').value.trim(),
    })).filter((item) => item.url);
  }

  function updateMusicPreview(url) {
    $("#siteMusicPreview").src = url || collectSiteMusicPlaylist()[0]?.url || defaultMusic;
  }

  function timeToMinutes(value) {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    return (Number(hour) || 0) * 60 + (Number(minute) || 0);
  }

  function formatTimeFromMinutes(value) {
    const total = ((Math.round(value) % 1440) + 1440) % 1440;
    const hour = String(Math.floor(total / 60)).padStart(2, "0");
    const minute = String(total % 60).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  function readMediaDuration(source, type = "audio") {
    return new Promise((resolve) => {
      const media = document.createElement(type === "video" ? "video" : "audio");
      let objectUrl = "";
      const finish = (duration = 0) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        media.removeAttribute("src");
        media.load();
        resolve(Number.isFinite(duration) ? duration : 0);
      };
      media.preload = "metadata";
      media.muted = true;
      media.addEventListener("loadedmetadata", () => finish(media.duration), { once: true });
      media.addEventListener("error", () => finish(0), { once: true });
      if (source instanceof File) {
        objectUrl = URL.createObjectURL(source);
        media.src = objectUrl;
      } else {
        media.crossOrigin = "anonymous";
        media.src = String(source || "");
      }
      setTimeout(() => finish(0), 7000);
    });
  }

  function updateScheduleEndFromDuration(row) {
    const durationInput = row.querySelector('[data-schedule-field="durationSeconds"]');
    const duration = Number(durationInput?.value || 0);
    if (!duration) return;
    const start = row.querySelector('[data-schedule-field="start"]')?.value || "20:00";
    const endInput = row.querySelector('[data-schedule-field="end"]');
    if (endInput) endInput.value = formatTimeFromMinutes(timeToMinutes(start) + Math.ceil(duration / 60));
  }

  function renderMeditationSchedule() {
    $("#meditationSchedule").innerHTML = meditationScheduleState.map((item, index) => `
      <div class="schedule-row" data-schedule-index="${index}">
        <input data-schedule-field="title" value="${escapeHTML(item.title || "")}" placeholder="冥想名称" />
        <label>开始<input data-schedule-field="start" type="time" value="${escapeHTML(item.start || "20:00")}" /></label>
        <label>结束<input data-schedule-field="end" type="time" value="${escapeHTML(item.end || "20:30")}" /></label>
        <input data-schedule-field="music" value="${escapeHTML(item.music || "")}" placeholder="冥想音乐 MP3 地址" />
        <label class="inline-upload-action" title="上传冥想音乐">上传<input data-schedule-upload="music" type="file" accept="audio/*" hidden /></label>
        <input data-schedule-field="video" value="${escapeHTML(item.video || "")}" placeholder="可选：视频 MP4 地址" />
        <label class="inline-upload-action" title="上传冥想视频">上传<input data-schedule-upload="video" type="file" accept="video/*" hidden /></label>
        <input data-schedule-field="durationSeconds" type="hidden" value="${escapeHTML(item.durationSeconds || "")}" />
        <button data-schedule-action="remove" type="button" title="删除时段">×</button>
      </div>
    `).join("") || "<p class=\"muted-text\">尚未设置实时播放时段。</p>";
  }

  function collectMeditationSchedule() {
    return Array.from(document.querySelectorAll(".schedule-row")).map((row) => ({
      title: row.querySelector('[data-schedule-field="title"]').value.trim() || "集体冥想",
      start: row.querySelector('[data-schedule-field="start"]').value || "20:00",
      end: row.querySelector('[data-schedule-field="end"]').value || "20:30",
      music: row.querySelector('[data-schedule-field="music"]').value.trim(),
      video: row.querySelector('[data-schedule-field="video"]').value.trim(),
      durationSeconds: Number(row.querySelector('[data-schedule-field="durationSeconds"]')?.value || 0),
    }));
  }
  function collectSettings() {
    const existingPage = pageSettings();
    const categories = normalizeCategories($("#pageCategories").value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean));
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
      heroLogoImage: $("#pageHeroLogoImage").value.trim() || defaultPage.heroLogoImage,
      logoMotion: $("#pageLogoMotion").value || defaultPage.logoMotion,
      backgroundImage: $("#pageBackgroundImage").value.trim(),
      fontFamily: $("#pageFontFamily").value || defaultPage.fontFamily,
      hotSpeed: Number($("#pageHotSpeed").value || 4500),
      fontSizes: { ...fontSizesState },
      colors: { ...colorsState },
    };
    return {
      ...settingsState,
      page,
      categories,
      hotArticleIds,
      siteMusicPlaylist: collectSiteMusicPlaylist(),
      siteMusic: collectSiteMusicPlaylist()[0]?.url || defaultMusic,
      collectiveMeditationSchedule: collectMeditationSchedule(),
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
  }

  function updatePreviewScale() {
    if (!previewViewport || !previewStage) return;
    const viewportWidth = Math.max(1, previewViewport.clientWidth);
    const viewportHeight = Math.max(1, previewViewport.clientHeight);
    const scale = Math.min(1, viewportWidth / previewDesignWidth);
    frame.style.setProperty("--preview-scale", String(scale));
    frame.style.width = `${previewDesignWidth}px`;
    frame.style.height = `${Math.ceil(viewportHeight / scale)}px`;
    previewStage.style.width = "100%";
    previewStage.style.height = "100%";
  }

  function schedulePreviewScale() {
    if (previewScaleFrame) cancelAnimationFrame(previewScaleFrame);
    previewScaleFrame = requestAnimationFrame(() => {
      previewScaleFrame = 0;
      updatePreviewScale();
    });
  }

  function previewTextStyleRules() {
    return Object.entries(fontSizeSelectors).map(([key, selector]) => {
      const rawSize = fontSizesState[key];
      const size = Number(rawSize);
      const color = String(colorsState[key] || "").trim();
      const declarations = [];
      if (Number.isFinite(size) && size >= 0 && size <= 100) declarations.push(`font-size: ${size}px !important`);
      if (/^#[0-9a-f]{6}$/i.test(color)) declarations.push(`color: ${color} !important`);
      return declarations.length ? `${selector} { ${declarations.join("; ")}; }` : "";
    }).filter(Boolean).join("\n");
  }

  function applyTextStylesToPreview() {
    const doc = frame.contentDocument;
    if (!doc) return;
    let style = doc.getElementById("site-custom-text-styles");
    if (!style) {
      style = doc.createElement("style");
      style.id = "site-custom-text-styles";
      doc.head.appendChild(style);
    }
    style.textContent = previewTextStyleRules();
    schedulePreviewScale();
  }

  function updateFontSizeInput(key, size) {
    const input = document.querySelector(`[data-font-size-key="${key}"]`);
    if (input) input.value = String(preciseFontSize(size));
  }

  function colorToHex(value) {
    const match = String(value || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "";
    return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
  }

  function syncComputedTextStylesFromPreview() {
    const doc = frame.contentDocument;
    const view = frame.contentWindow;
    if (!doc || !view) return;
    Object.entries(fontSizeSelectors).forEach(([key, selector]) => {
      const target = doc.querySelector(selector);
      if (!target) return;
      const computedSize = preciseFontSize(parseFloat(view.getComputedStyle(target).fontSize));
      if (!Number.isFinite(computedSize) || computedSize < 0 || computedSize > 100) return;
      fontSizesState[key] = computedSize;
      updateFontSizeInput(key, computedSize);
      const computedColor = colorToHex(view.getComputedStyle(target).color);
      if (computedColor) {
        colorsState[key] = computedColor;
        const colorInput = document.querySelector(`[data-color-key="${key}"]`);
        if (colorInput) colorInput.value = computedColor;
      }
    });
  }

  function updatePreviewText(fieldId) {
    const doc = frame.contentDocument;
    const definition = textFieldDefinitions[fieldId];
    const field = document.getElementById(fieldId);
    if (!doc || !definition || !field) return;
    doc.querySelectorAll(definition.selector).forEach((target) => {
      target.textContent = field.value;
    });
    schedulePreviewScale();
  }

  function applyDraftTextToPreview() {
    Object.keys(textFieldDefinitions).forEach(updatePreviewText);
  }

  function setFieldFontSize(input) {
    const key = input.dataset.fontSizeKey;
    if (!fontSizeSelectors[key]) return;
    if (input.value === "") {
      status.textContent = "请输入 0–100 之间的精确字号";
      return;
    }
    const size = preciseFontSize(Math.min(100, Math.max(0, Number(input.value))));
    if (!Number.isFinite(size)) return;
    input.value = String(size);
    fontSizesState[key] = size;
    const doc = frame.contentDocument;
    doc?.querySelectorAll(fontSizeSelectors[key]).forEach((target) => {
      target.style.setProperty("font-size", `${size}px`, "important");
    });
    applyTextStylesToPreview();
    updateFontSizeInput(key, size);
    status.textContent = `预览已同步为 ${size}px，点击“保存页面”后发布`;
  }

  function restoreEmptyFontSize(input) {
    if (input.value !== "") return;
    const key = input.dataset.fontSizeKey;
    updateFontSizeInput(key, fontSizesState[key] ?? designFontSizes[key]);
  }

  function setFieldColor(input) {
    const key = input.dataset.colorKey;
    const selector = fontSizeSelectors[key];
    const color = String(input.value || "").toLowerCase();
    if (!selector || !/^#[0-9a-f]{6}$/i.test(color)) return;
    colorsState[key] = color;
    const doc = frame.contentDocument;
    doc?.querySelectorAll(selector).forEach((target) => {
      target.style.setProperty("color", color, "important");
    });
    applyTextStylesToPreview();
    status.textContent = `文字颜色已同步为 ${color}，点击“保存页面”后发布`;
  }

  function syncPreviewPageSelector() {
    try {
      const filename = frame.contentWindow.location.pathname.split("/").pop() || "index.html";
      const option = Array.from($("#previewPage").options).find((item) => item.value === filename);
      if (option) $("#previewPage").value = filename;
    } catch (error) {
      console.debug("无法同步预览页选择器", error);
    }
  }

  function enablePreviewNavigation(doc) {
    doc.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0) return;
      const url = new URL(link.href, doc.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      frame.src = `${url.pathname.split("/").pop() || "index.html"}${url.search}${url.hash}`;
    }, { capture: true });
  }

  function injectPreviewTools() {
    const doc = frame.contentDocument;
    if (!doc) return;
    syncPreviewPageSelector();
    enablePreviewNavigation(doc);
    applyDraftTextToPreview();
    applyTextStylesToPreview();
    syncComputedTextStylesFromPreview();
    doc.fonts?.ready.then(schedulePreviewScale).catch(() => {});
    schedulePreviewScale();
    window.setTimeout(() => {
      applyDraftTextToPreview();
      applyTextStylesToPreview();
      syncComputedTextStylesFromPreview();
      schedulePreviewScale();
    }, 300);
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

  async function uploadMedia(file) {
    if (!file) return "";
    status.textContent = `正在上传 ${file.name}...`;
    try {
      const url = await window.SiriusAPI.uploadMedia(file);
      status.textContent = `媒体已上传 · ${file.name} · 保存页面后发布`;
      return url;
    } catch (error) {
      status.textContent = "媒体上传失败";
      alert(`上传失败：${error.message}`);
      return "";
    }
  }

  installTextStyleControls();
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
  Object.keys(textFieldDefinitions).forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("input", () => updatePreviewText(fieldId));
  });
  document.querySelectorAll("[data-font-size-key]").forEach((input) => {
    input.addEventListener("input", () => setFieldFontSize(input));
    input.addEventListener("change", () => restoreEmptyFontSize(input));
  });
  document.querySelectorAll("[data-color-key]").forEach((input) => {
    input.addEventListener("input", () => setFieldColor(input));
  });
  $("#pageLogoImageFile").addEventListener("change", (event) => setMediaField("pageLogoImage", event.target.files[0]));
  $("#pageHeroLogoImageFile").addEventListener("change", (event) => setMediaField("pageHeroLogoImage", event.target.files[0]));
  $("#pageBackgroundImageFile").addEventListener("change", (event) => setMediaField("pageBackgroundImage", event.target.files[0]));
  $("#pageMotionBackgroundImageFile").addEventListener("change", (event) => setMediaField("pageMotionBackgroundImage", event.target.files[0]));
  $("#pageArticleBannerImageFile").addEventListener("change", (event) => setMediaField("pageArticleBannerImage", event.target.files[0]));
  $("#pageAboutImageFile").addEventListener("change", (event) => setMediaField("pageAboutImage", event.target.files[0]));
  $("#addSiteMusic").addEventListener("click", () => {
    siteMusicPlaylistState = collectSiteMusicPlaylist();
    siteMusicPlaylistState.push({ title: `背景音乐 ${siteMusicPlaylistState.length + 1}`, url: "" });
    renderSiteMusicPlaylist();
  });
  $("#siteMusicPlaylist").addEventListener("input", () => {
    siteMusicPlaylistState = collectSiteMusicPlaylist();
  });
  $("#siteMusicPlaylist").addEventListener("click", (event) => {
    const button = event.target.closest("[data-music-action]");
    if (!button) return;
    const row = button.closest(".playlist-row");
    const index = Number(row.dataset.musicIndex);
    const items = Array.from(document.querySelectorAll(".playlist-row")).map((item, itemIndex) => ({
      title: item.querySelector('[data-music-field="title"]').value.trim() || `背景音乐 ${itemIndex + 1}`,
      url: item.querySelector('[data-music-field="url"]').value.trim(),
    }));
    if (button.dataset.musicAction === "remove") items.splice(index, 1);
    if (button.dataset.musicAction === "up" && index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
    if (button.dataset.musicAction === "down" && index < items.length - 1) [items[index + 1], items[index]] = [items[index], items[index + 1]];
    if (button.dataset.musicAction === "preview") updateMusicPreview(items[index]?.url);
    siteMusicPlaylistState = items.length ? items : [{ title: "背景音乐", url: "" }];
    renderSiteMusicPlaylist();
  });
  $("#siteMusicPlaylist").addEventListener("change", async (event) => {
    if (!event.target.matches("[data-music-upload]")) return;
    const row = event.target.closest(".playlist-row");
    const url = await uploadMedia(event.target.files[0]);
    if (!url) return;
    row.querySelector('[data-music-field="url"]').value = url;
    siteMusicPlaylistState = collectSiteMusicPlaylist();
    updateMusicPreview(url);
  });
  $("#addMeditationSchedule").addEventListener("click", () => {
    meditationScheduleState = collectMeditationSchedule();
    meditationScheduleState.push({ title: "集体冥想", start: "20:00", end: "20:30", music: "", video: "" });
    renderMeditationSchedule();
  });
  $("#meditationSchedule").addEventListener("input", (event) => {
    if (event.target.matches('[data-schedule-field="start"]')) {
      updateScheduleEndFromDuration(event.target.closest(".schedule-row"));
    }
    meditationScheduleState = collectMeditationSchedule();
  });
  $("#meditationSchedule").addEventListener("click", (event) => {
    const button = event.target.closest("[data-schedule-action='remove']");
    if (!button) return;
    meditationScheduleState = collectMeditationSchedule();
    meditationScheduleState.splice(Number(button.closest(".schedule-row").dataset.scheduleIndex), 1);
    renderMeditationSchedule();
  });
  $("#meditationSchedule").addEventListener("change", async (event) => {
    const field = event.target.dataset.scheduleUpload;
    if (!field) {
      const row = event.target.closest(".schedule-row");
      if (row && event.target.matches('[data-schedule-field="music"]') && event.target.value.trim()) {
        const duration = await readMediaDuration(event.target.value.trim(), "audio");
        if (duration) {
          row.querySelector('[data-schedule-field="durationSeconds"]').value = String(Math.round(duration));
          updateScheduleEndFromDuration(row);
        }
        meditationScheduleState = collectMeditationSchedule();
      }
      return;
    }
    const row = event.target.closest(".schedule-row");
    const file = event.target.files[0];
    const duration = field === "music" ? await readMediaDuration(file, "audio") : 0;
    const url = await uploadMedia(event.target.files[0]);
    if (!url) return;
    row.querySelector(`[data-schedule-field="${field}"]`).value = url;
    if (duration) {
      row.querySelector('[data-schedule-field="durationSeconds"]').value = String(Math.round(duration));
      updateScheduleEndFromDuration(row);
    }
    meditationScheduleState = collectMeditationSchedule();
  });
  frame.addEventListener("load", injectPreviewTools);
  window.addEventListener("resize", schedulePreviewScale, { passive: true });
  if ("ResizeObserver" in window) {
    previewResizeObserver = new ResizeObserver(schedulePreviewScale);
    previewResizeObserver.observe(previewViewport);
  }

  loadForm();
  selectRegion("global");
})();
