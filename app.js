(async function () {
  const baseArticles = window.SIRIUS_ARTICLES || [];
  const retiredArticleIds = new Set([
    "article-1", "article-2", "article-3", "article-4", "article-5",
    "article-6", "article-7", "article-8", "article-9", "article-10",
  ]);
  const retiredArticleSignatures = new Set([
    "2025-08-19|相干信号——量变引发质变",
    "2025-08-18|由人们的生活想到的",
    "2025-08-17|助推说明",
    "2025-08-16|聚精会神，塑造美好未来",
    "2025-08-14|25.8.14 扬升门户开启第2部分",
    "2025-08-12|8月，让它发生",
    "2025-08-08|故事：简报",
    "2025-08-04|25.8.4 最终更新&新访谈",
    "2025-07-30|八月星象 访谈",
    "2025-07-29|25.7.29 门户更新&联合访谈",
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
    brandName: "天狼星门户",
    heroEyebrow: "Sirius Portal",
    heroTitle: "天狼星门户",
    heroDescription: "我们来自不同领域，因为对灵性成长、公共福祉与人类未来的关注而聚在一起，志愿协作，致力于本平台的资讯整理与共享。我们筛选、整理并传播具备启发性的文章与实践资料，倡导每一位读者保有独立判断，将所思所悟转化成清醒且心怀善意的行动。",
    popularEyebrow: "Popular",
    popularTitle: "热门文章",
    latestEyebrow: "Latest Articles",
    allArticlesTitle: "全部文章",
    categoryTranslations: "全部文章 All Articles\n门户更新 Portal Updates\n会议 Conferences\n访谈 Interviews\n重要冥想 Key Meditations\n文章更新 Article Updates\n相关资料 Resources",
    homeLatestEyebrow: "Signal",
    homeLatestTitle: "最新文章",
    motionEyebrow: "声明：",
    motionTitle: "本网站所涉内容大多来自网络共享的资源和观点，内容性质属虚构和半虚构，由个人整理，不构成任何宗教立场、政治主张或价值倡导 -- 请读者运用自己的判断力进行理性思考，不迷信、不盲从，不参与任何形式的个人崇拜或迷信行为。\n\n若网站内容与任何地区的法律政策有所冲突，本网站将依法进行调整和删除，并保留修改变更、终止分享的所有权利。\n\n本网站坚决拥护依法治网，反对任何形式的违法宣扬，所呈内容仅作思维拓展和幻想作品参考使用。",
    aboutEyebrow: "About",
    aboutTitle: "关于我们",
    aboutText: "天狼星门户由一群关注意识成长、公共福祉与人类未来的志愿者共同维护。我们相信，明晰的信息、独立的思考与善意的行动能够彼此照亮；我们尊重差异、恪守理性，希望连结到更多乐于学习、喜欢分享，并愿意为正向转变付诸行动的同路人。",
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
  const legacyHeroDescriptions = new Set([
    "以博客杂志的方式整理门户更新、访谈、指南与观察。清晰分类、沉浸阅读、音乐伴随，让每篇文章都更容易被看见和收藏。",
    "我们是一群关注意识成长、公共福祉与人类共同未来的同行者。天狼星之光持续整理值得被看见的讯息、访谈与实践指引，愿以真诚、理性和行动连接更多心怀善意的人，一起为更清明、更和平、更有爱的未来贡献力量。",
  ]);
  const legacyAboutTexts = new Set([
    "这里持续收录经过整理与排版的文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
    "这里收录 10 篇已排版文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
    "天狼星之光由一群关注意识成长、公共福祉与人类共同未来的伙伴共同维护。我们相信，清晰的信息、独立的思考与善意的行动能够彼此照亮；愿在尊重差异、保持理性的前提下，连接更多愿意学习、分享并为美好未来付诸行动的人。",
  ]);
  const isSiteDeclaration = (value) => /本网站所涉内容大多来自网络共享的资源和观点/.test(value || "")
    && /本网站坚决拥护依法治网/.test(value || "");
  const fontSizeSelectors = {
    brandName: '[data-site="brandName"]',
    heroEyebrow: "#heroEyebrow",
    heroTitle: "#heroTitle",
    heroDescription: "#heroDescription",
    homeLatestEyebrow: "#homeLatestEyebrow",
    homeLatestTitle: "#homeLatestTitle",
    motionEyebrow: "#motionEyebrow",
    motionTitle: "#motionTitle",
    popularEyebrow: "#popularEyebrow",
    popularTitle: "#popularTitle",
    latestEyebrow: "#latestEyebrow",
    allArticlesTitle: "#listTitle",
    aboutEyebrow: "#aboutEyebrow",
    aboutTitle: "#aboutTitle",
    aboutText: "#aboutText",
  };

  const state = await window.SiriusAPI.loadState();
  const settings = state.settings || {};
  const page = { ...defaultPage, ...(settings.page || {}) };
  if (!page.brandName || page.brandName === "天狼星之光") page.brandName = defaultPage.brandName;
  if (!page.heroEyebrow || ["Sirius Portal Journal", "Light of Sirius Journal", "Light of Sirius"].includes(page.heroEyebrow)) page.heroEyebrow = defaultPage.heroEyebrow;
  if (!page.heroTitle || page.heroTitle === "天狼星之光") page.heroTitle = defaultPage.heroTitle;
  if (!page.heroDescription || legacyHeroDescriptions.has(page.heroDescription)) page.heroDescription = defaultPage.heroDescription;
  if (!page.aboutTitle || ["关于门户", "关于天狼星之光"].includes(page.aboutTitle)) page.aboutTitle = defaultPage.aboutTitle;
  if (!page.aboutText || legacyAboutTexts.has(page.aboutText)) page.aboutText = defaultPage.aboutText;
  if (!page.motionTitle || page.motionTitle === legacyMotionTitle || isSiteDeclaration(page.motionTitle)) page.motionTitle = defaultPage.motionTitle;
  if (!page.motionEyebrow || page.motionEyebrow === "Portal Motion") page.motionEyebrow = defaultPage.motionEyebrow;
  if (page.logoImage === "logo抠图.png" || page.logoImage === "assets/logo-cutout-web.png") page.logoImage = defaultPage.logoImage;
  if (!page.heroLogoImage || ["logo抠图.png", "assets/logo-render-web.png", "assets/logo-cutout-web.png"].includes(page.heroLogoImage)) {
    page.heroLogoImage = defaultPage.heroLogoImage;
  }
  if (!page.motionBackgroundImage) page.motionBackgroundImage = defaultPage.motionBackgroundImage;
  if (page.articleBannerImage === "assets/articles-banner-art.png") page.articleBannerImage = defaultPage.articleBannerImage;
  if (page.aboutImage === "assets/about-footer-art.png") page.aboutImage = defaultPage.aboutImage;
  const savedArticles = (state.articles || [])
    .filter((article) => !isRetiredArticle(article))
    .map((article) => ({ ...article, category: normalizeCategory(article.category) }));
  let commentsState = state.comments || {};
  const savedMap = new Map(savedArticles.map((article) => [article.id, article]));
  const articles = [
    ...savedArticles.filter((article) => !baseArticles.some((base) => base.id === article.id)),
    ...baseArticles.filter((article) => !isRetiredArticle(article)).map((article) => savedMap.get(article.id) || { ...article, category: normalizeCategory(article.category) }),
  ].filter((article) => !article.deleted && !article.archived && article.contentType !== "meditation");

  let currentCategory = "全部";
  let currentQuery = new URLSearchParams(location.search).get("q") || "";
  let currentPage = 1;
  let sortOrder = "newest";
  let hotIndex = 0;
  let hotTimer = null;
  const mobileLayout = window.matchMedia("(max-width: 760px)");

  const configuredCategories = settings.categories || [];
  const allCategories = normalizeCategories(configuredCategories.length ? configuredCategories : defaultCategories);

  const $ = (selector) => document.querySelector(selector);
  const gekaThemeCache = new WeakMap();
  const backgroundAudio = $("#backgroundAudio");
  const siteMusicPlaylist = (settings.siteMusicPlaylist || [])
    .map((item, index) => typeof item === "string" ? { title: `背景音乐 ${index + 1}`, url: item } : item)
    .filter((item) => item?.url);
  if (!siteMusicPlaylist.length && (settings.siteMusic || defaultMusic)) {
    siteMusicPlaylist.push({ title: "背景音乐", url: settings.siteMusic || defaultMusic });
  }
  const backgroundMusicStateKey = "siriusBackgroundMusicState";
  let siteMusicIndex = 0;
  let isLeavingPage = false;

  function loadBackgroundMusicState() {
    try {
      return JSON.parse(localStorage.getItem(backgroundMusicStateKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function saveBackgroundMusicState(overrides = {}) {
    if (!backgroundAudio) return;
    const state = {
      wantsPlayback: !backgroundAudio.paused,
      index: siteMusicIndex,
      url: siteMusicPlaylist[siteMusicIndex]?.url || backgroundAudio.currentSrc || backgroundAudio.src || "",
      currentTime: Number(backgroundAudio.currentTime || 0),
      volume: Number(backgroundAudio.volume || 1),
      updatedAt: Date.now(),
      ...overrides,
    };
    localStorage.setItem(backgroundMusicStateKey, JSON.stringify(state));
  }

  function playlistIndexFromState(state) {
    const byUrl = siteMusicPlaylist.findIndex((item) => item.url === state.url);
    if (byUrl >= 0) return byUrl;
    const index = Number(state.index || 0);
    return siteMusicPlaylist[index] ? index : 0;
  }

  function setMusicTogglePlaying(isPlaying) {
    $("#musicToggle")?.classList.toggle("playing", Boolean(isPlaying));
  }

  function prepareBackgroundAudio() {
    if (!backgroundAudio || !siteMusicPlaylist.length) {
      if (backgroundAudio) backgroundAudio.removeAttribute("src");
      const toggle = $("#musicToggle");
      if (toggle) {
        toggle.disabled = true;
        toggle.title = "尚未配置背景音乐";
      }
      return;
    }
    const saved = loadBackgroundMusicState();
    siteMusicIndex = playlistIndexFromState(saved);
    backgroundAudio.src = siteMusicPlaylist[siteMusicIndex].url;
    backgroundAudio.volume = Number.isFinite(Number(saved.volume)) ? Number(saved.volume) : 1;

    backgroundAudio.addEventListener("loadedmetadata", () => {
      const savedAgain = loadBackgroundMusicState();
      if (playlistIndexFromState(savedAgain) !== siteMusicIndex) return;
      let targetTime = Number(savedAgain.currentTime || 0);
      if (savedAgain.wantsPlayback) {
        targetTime += Math.max(0, (Date.now() - Number(savedAgain.updatedAt || Date.now())) / 1000);
      }
      if (backgroundAudio.duration && Number.isFinite(backgroundAudio.duration)) {
        targetTime %= backgroundAudio.duration;
      }
      if (targetTime > 0) backgroundAudio.currentTime = targetTime;
    }, { once: true });

    if (saved.wantsPlayback) {
      setMusicTogglePlaying(true);
      backgroundAudio.play().then(() => {
        saveBackgroundMusicState({ wantsPlayback: true });
      }).catch(() => {
        setMusicTogglePlaying(false);
      });
    }
  }

  prepareBackgroundAudio();

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function isCangyanArticle(article) {
    return [article?.canonicalAuthor, article?.author].includes("苍焰");
  }

  function isXiangmingArticle(article) {
    return article?.canonicalAuthor === "向明" || ["向明", "一目向明"].includes(article?.author);
  }

  function isGekaArticle(article) {
    if (!article || typeof article !== "object") return false;
    if (gekaThemeCache.has(article)) return gekaThemeCache.get(article);
    if (/^GeKa$/i.test(String(article?.translator || "").trim())) return true;
    const content = [article?.html, article?.excerpt, ...(article?.paragraphs || [])].filter(Boolean).join(" ");
    const matches = /翻译\s*[：:]\s*GeKa\b/i.test(content);
    gekaThemeCache.set(article, matches);
    return matches;
  }

  function authorThemeClass(article) {
    if (isGekaArticle(article)) return "translator-geka";
    if (isCangyanArticle(article)) return "author-cangyan";
    if (isXiangmingArticle(article)) return "author-xiangming";
    return "";
  }

  function categoryTranslationMap() {
    return new Map(String(page.categoryTranslations || defaultPage.categoryTranslations)
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^(\S+)\s+(.+)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]));
  }

  function categoryEnglishLabel(chineseTitle) {
    const translations = categoryTranslationMap();
    return translations.get(chineseTitle) || translations.get(currentCategory) || page.latestEyebrow || defaultPage.latestEyebrow;
  }

  function applyPageText() {
    Object.entries(page).forEach(([key, value]) => {
      const target = document.getElementById(key) || document.querySelector(`[data-site="${key}"]`);
      if (target) target.textContent = value;
    });
  }

  function applyCustomTextStyles() {
    const style = document.createElement("style");
    style.id = "site-custom-text-styles";
    const rules = [];
    Object.entries(fontSizeSelectors).forEach(([key, selector]) => {
      const rawSize = page.fontSizes?.[key];
      const size = Number(rawSize);
      const color = String(page.colors?.[key] || "").trim();
      const declarations = [];
      if (Number.isFinite(size) && size >= 0 && size <= 100) declarations.push(`font-size: ${size}px !important`);
      if (/^#[0-9a-f]{6}$/i.test(color)) declarations.push(`color: ${color} !important`);
      if (declarations.length) rules.push(`${selector} { ${declarations.join("; ")}; }`);
    });
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  function isVideoSource(url) {
    return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url || "") || String(url || "").startsWith("data:video/");
  }

  function mediaHTML(url, title) {
    if (!url) return "";
    if (/youtube\.com|youtu\.be|bilibili\.com|vimeo\.com/i.test(url)) {
      return `<iframe src="${escapeHTML(url)}" title="${escapeHTML(title || "视频")}" loading="lazy" allowfullscreen></iframe>`;
    }
    if (isVideoSource(url)) return `<video src="${escapeHTML(url)}" controls playsinline></video>`;
    return `<img src="${escapeHTML(url)}" alt="${escapeHTML(title || "页面图片")}" loading="lazy" />`;
  }

  function mobileCoverPath(cover) {
    const match = String(cover || "").match(/^(assets\/articles\/wechat\/[^/]+)\/cover\.(?:jpe?g|png|webp)(?:\?.*)?$/i);
    return match ? `${match[1]}/cover-mobile.webp` : "";
  }

  function coverImageAttributes(article, sizes) {
    const cover = String(article.cover || defaultPage.logoImage);
    const mobileCover = mobileCoverPath(cover);
    if (mobileLayout.matches && mobileCover) return `src="${escapeHTML(mobileCover)}"`;
    return `src="${escapeHTML(cover)}"${mobileCover ? ` srcset="${escapeHTML(mobileCover)} 480w, ${escapeHTML(cover)} 1080w" sizes="${sizes}"` : ""}`;
  }

  function applyPageVisuals() {
    document.body.style.backgroundImage = page.backgroundImage ? `url("${page.backgroundImage}")` : "";
    document.body.classList.toggle("custom-background", Boolean(page.backgroundImage));
    document.body.dataset.siteFont = page.fontFamily || defaultPage.fontFamily;
    document.documentElement.dataset.logoMotion = page.logoMotion || "strong";
    const setResponsiveImage = (image, source, defaultSource, mobileSource, sizes, mobileWidth, desktopWidth) => {
      if (!image) return;
      image.src = source;
      if (source === defaultSource) {
        image.srcset = `${mobileSource} ${mobileWidth}w, ${defaultSource} ${desktopWidth}w`;
        image.sizes = sizes;
      } else {
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
      }
    };
    document.querySelectorAll("[data-site-logo]").forEach((image) => {
      setResponsiveImage(image, page.logoImage || defaultPage.logoImage, defaultPage.logoImage, "assets/mobile/logo-vector.webp", "(max-width: 760px) 40px, 58px", 160, 640);
    });
    const heroLogo = document.getElementById("heroLogoImage");
    setResponsiveImage(heroLogo, page.heroLogoImage || defaultPage.heroLogoImage, defaultPage.heroLogoImage, "assets/mobile/logo-original.webp", "(max-width: 760px) 180px, 360px", 640, 2048);
    const disclaimer = $(".site-disclaimer");
    if (disclaimer) {
      const motionImage = page.motionBackgroundImage || page.footerImage;
      if (motionImage && motionImage !== defaultPage.motionBackgroundImage) {
        disclaimer.style.setProperty("--disclaimer-image", `url("${motionImage}")`);
      } else {
        disclaimer.style.removeProperty("--disclaimer-image");
      }
    }
    const articleBanner = document.getElementById("articleBannerImage");
    setResponsiveImage(articleBanner, page.articleBannerImage || page.heroBanner || defaultPage.articleBannerImage, defaultPage.articleBannerImage, "assets/mobile/articles-emerald.webp", "100vw", 960, 1882);
    const aboutVisual = document.getElementById("aboutVisualImage");
    setResponsiveImage(aboutVisual, page.aboutImage || page.footerImage || defaultPage.aboutImage, defaultPage.aboutImage, "assets/mobile/about-emerald.webp", "100vw", 960, 1586);
  }

  function articleText(article) {
    return [article.title, article.category, article.excerpt, article.html, ...(article.paragraphs || [])].join(" ").toLowerCase();
  }

  function filteredArticles() {
    return articles.filter((article) => {
      const inCategory = currentCategory === "全部" || article.category === currentCategory;
      const inSearch = !currentQuery || articleText(article).includes(currentQuery.toLowerCase());
      return inCategory && inSearch;
    }).sort((a, b) => {
      const left = new Date(a.date || 0).getTime();
      const right = new Date(b.date || 0).getTime();
      return sortOrder === "oldest" ? left - right : right - left;
    });
  }

  function hotArticles() {
    const selected = (settings.hotArticleIds || []).map((id) => articles.find((article) => article.id === id)).filter(Boolean);
    return selected.length ? selected : [...articles].sort((a, b) => (b.hot || 0) - (a.hot || 0)).slice(0, 5);
  }

  function renderHomeFeatures() {
    const grid = $("#homeFeatureGrid");
    if (!grid) return;
    grid.innerHTML = [...articles]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, mobileLayout.matches ? 2 : 3)
      .map((article) => `
        <a class="home-feature-card ${authorThemeClass(article)}" href="articles.html?article=${encodeURIComponent(article.id)}">
          <img ${coverImageAttributes(article, "(max-width: 760px) 104px, 380px")} alt="${escapeHTML(article.title)}" loading="lazy" decoding="async" />
          <span>${escapeHTML(article.category)} · ${escapeHTML(article.date)}</span>
          <h3>${escapeHTML(article.title)}</h3>
          <p>${escapeHTML(article.excerpt || "暂无简介")}</p>
        </a>
      `).join("");
  }

  function renderCategories() {
    const categoryList = $("#categoryList");
    if (!categoryList) return;
    const categories = ["全部", ...allCategories];
    categoryList.innerHTML = categories.map((category) => (
      `<button type="button" class="${category === currentCategory ? "active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`
    )).join("");
  }

  function renderHotShowcase() {
    const hotCarousel = $("#hotCarousel");
    const hotDots = $("#hotDots");
    if (!hotCarousel || !hotDots) return;
    if (mobileLayout.matches) {
      hotCarousel.innerHTML = "";
      hotDots.innerHTML = "";
      return;
    }
    const hot = hotArticles();
    if (!hot.length) {
      hotCarousel.innerHTML = "";
      hotDots.innerHTML = "";
      return;
    }
    hotCarousel.innerHTML = hot.map((article, index) => `
      <article class="hot-slide ${index === hotIndex ? "active" : ""} ${authorThemeClass(article)}" data-id="${article.id}">
        <img ${coverImageAttributes(article, "1180px")} alt="${escapeHTML(article.title)}" loading="${index === hotIndex ? "eager" : "lazy"}" decoding="async" />
        <div class="hot-overlay">
          <span>${escapeHTML(article.category)} · ${escapeHTML(article.date)}</span>
          <h3>${escapeHTML(article.title)}</h3>
          <p>${escapeHTML(article.excerpt)}</p>
        </div>
      </article>
    `).join("");
    hotDots.innerHTML = hot.map((_, index) => (
      `<button type="button" class="${index === hotIndex ? "active" : ""}" data-hot-index="${index}" aria-label="查看第 ${index + 1} 篇热门文章"></button>`
    )).join("");
  }

  function startHotRotation() {
    const hot = hotArticles();
    if (hotTimer) clearInterval(hotTimer);
    if (mobileLayout.matches) return;
    if (hot.length < 2) return;
    hotTimer = setInterval(() => {
      hotIndex = (hotIndex + 1) % hot.length;
      renderHotShowcase();
    }, Math.max(1200, Number(page.hotSpeed || 4500)));
  }

  function shiftHot(direction) {
    const hot = hotArticles();
    if (!hot.length) return;
    hotIndex = (hotIndex + direction + hot.length) % hot.length;
    renderHotShowcase();
    startHotRotation();
  }

  function renderGrid() {
    const grid = $("#articleGrid");
    const listTitle = $("#listTitle");
    const articleCount = $("#articleCount");
    const pagination = $("#pagination");
    if (!grid || !listTitle || !articleCount || !pagination) return;
    const result = filteredArticles();
    const configuredPerPage = Math.max(1, Number(page.articlesPerPage || 7));
    const perPage = mobileLayout.matches ? Math.min(5, configuredPerPage) : configuredPerPage;
    const totalPages = Math.max(1, Math.ceil(result.length / perPage));
    currentPage = Math.min(currentPage, totalPages);
    const pageItems = result.slice((currentPage - 1) * perPage, currentPage * perPage);
    const chineseTitle = currentCategory === "全部" ? page.allArticlesTitle : currentCategory;
    listTitle.textContent = chineseTitle;
    const latestEyebrow = $("#latestEyebrow");
    if (latestEyebrow) latestEyebrow.textContent = categoryEnglishLabel(chineseTitle);
    articleCount.textContent = `${result.length} 篇 · 第 ${currentPage}/${totalPages} 页`;
    grid.innerHTML = pageItems.map((article) => `
      <article class="article-card ${authorThemeClass(article)}" data-id="${article.id}" tabindex="0">
        <img ${coverImageAttributes(article, "(max-width: 760px) 108px, 400px")} alt="${escapeHTML(article.title)}" loading="lazy" decoding="async" />
        <div class="card-body">
          <div class="meta-row">
            <span>${escapeHTML(article.category)} · ${escapeHTML(article.date)}</span>
            ${article.author ? `<span class="card-author"> · ${escapeHTML(article.author)}</span>` : ""}
            ${isGekaArticle(article) ? `<span class="card-translator"> · 翻译：GeKa</span>` : ""}
          </div>
          <h3>${escapeHTML(article.title)}</h3>
          <p>${escapeHTML(article.excerpt || "暂无简介")}</p>
        </div>
      </article>
    `).join("");
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const pagination = $("#pagination");
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
    pagination.innerHTML = `
      <button type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>上一页</button>
      ${pages.map((pageNumber) => `<button type="button" class="${pageNumber === currentPage ? "active" : ""}" data-page="${pageNumber}">${pageNumber}</button>`).join("")}
      <button type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  function isGeneratedComment(comment, articleId) {
    return comment?.id === `${articleId}-星门读者` || comment?.id === `${articleId}-晨光`;
  }

  function getComments(articleId) {
    return (commentsState[articleId] || []).filter((comment) => !isGeneratedComment(comment, articleId));
  }

  async function saveComment(articleId, comment) {
    const saved = await window.SiriusAPI.submitComment(articleId, comment);
    commentsState[articleId] = [...getComments(articleId), saved || comment];
  }

  function renderComments(article) {
    const box = $("#comments");
    if (!box) return;
    if (article.commentMode === "closed") {
      box.innerHTML = "<h3>评论区未开启</h3><p>本文当前不开放评论。</p>";
      return;
    }
    const visible = getComments(article.id).filter((comment) => comment.approved && (article.commentMode === "all" || comment.featured));
    box.innerHTML = `
      <h3>${article.commentMode === "featured" ? "精选评论" : "评论区"}</h3>
      ${visible.map((comment) => `
        <div class="comment-item">
          <strong>${escapeHTML(comment.name)}</strong>
          <p>${escapeHTML(comment.body)}</p>
        </div>
      `).join("")}
      <form class="comment-form" id="commentForm">
        <input id="commentName" placeholder="昵称" required />
        <textarea id="commentBody" placeholder="写下评论" required></textarea>
        <button type="submit">提交评论</button>
      </form>
    `;
    $("#commentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveComment(article.id, {
        id: Date.now().toString(),
        name: $("#commentName").value,
        body: $("#commentBody").value,
        featured: false,
        approved: false,
      });
      event.target.reset();
      const notice = document.createElement("p");
      notice.className = "comment-notice";
      notice.textContent = "评论已提交，等待后台审核后展示。";
      box.appendChild(notice);
    });
  }

  function showArticle(id) {
    const article = articles.find((item) => item.id === id);
    const reader = $("#reader");
    const articleBand = $(".article-band");
    const hotShowcase = $(".hot-showcase");
    if (!article || !reader || !articleBand || !hotShowcase) return;
    articleBand.hidden = true;
    hotShowcase.hidden = true;
    document.documentElement.classList.add("article-reading");
    document.body.classList.add("article-reading");
    reader.hidden = false;
    const themeClass = authorThemeClass(article);
    reader.classList.toggle("author-cangyan", themeClass === "author-cangyan");
    reader.classList.toggle("author-xiangming", themeClass === "author-xiangming");
    reader.classList.toggle("translator-geka", themeClass === "translator-geka");
    const readerMobileCover = mobileCoverPath(article.cover);
    $("#readerCover").src = mobileLayout.matches && readerMobileCover ? readerMobileCover : article.cover;
    if (!mobileLayout.matches && readerMobileCover) {
      $("#readerCover").srcset = `${readerMobileCover} 480w, ${article.cover} 1080w`;
      $("#readerCover").sizes = "(max-width: 760px) 100vw, 390px";
    } else {
      $("#readerCover").removeAttribute("srcset");
      $("#readerCover").removeAttribute("sizes");
    }
    $("#readerCover").alt = article.title;
    $("#readerMeta").innerHTML = [
      escapeHTML(article.category),
      escapeHTML(article.date),
      article.author ? `<span class="reader-author">作者：${escapeHTML(article.author)}</span>` : "",
      isGekaArticle(article) ? `<span class="reader-translator">翻译：GeKa</span>` : "",
    ].filter(Boolean).join(" · ");
    $("#readerTitle").textContent = article.title;
    $("#readerExcerpt").textContent = article.excerpt;
    const articleBodyHTML = article.html || (article.paragraphs || []).map((p) => `<p>${escapeHTML(p)}</p>`).join("");
    const fallbackImagesHTML = article.html ? "" : (article.images || []).slice(1)
      .map((src) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(article.title)} 配图" loading="lazy" />`).join("");
    $("#readerBody").innerHTML = articleBodyHTML + fallbackImagesHTML;
    $("#inlineMusic").innerHTML = article.music ? `<div class="audio-card"><p class="eyebrow">Article Music</p><audio src="${escapeHTML(article.music)}" controls></audio></div>` : "";
    if (article.video) $("#inlineMusic").innerHTML += `<div class="audio-card media-card"><p class="eyebrow">Article Video</p>${mediaHTML(article.video, article.title)}</div>`;
    renderComments(article);
    history.replaceState(null, "", `articles.html?article=${encodeURIComponent(id)}`);
    reader.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exitReader() {
    const reader = $("#reader");
    const articleBand = $(".article-band");
    const hotShowcase = $(".hot-showcase");
    if (reader) reader.hidden = true;
    reader?.classList.remove("author-cangyan", "author-xiangming", "translator-geka");
    document.documentElement.classList.remove("article-reading");
    document.body.classList.remove("article-reading");
    if (articleBand) articleBand.hidden = false;
    if (hotShowcase) hotShowcase.hidden = false;
  }

  function bindEvents() {
    $("#searchForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = $("#searchInput")?.value.trim() || "";
      location.href = `articles.html?q=${encodeURIComponent(query)}`;
    });

    $("#musicToggle")?.addEventListener("click", async () => {
      if (!backgroundAudio) return;
      if (backgroundAudio.paused) {
        try {
          await backgroundAudio.play();
          setMusicTogglePlaying(true);
          saveBackgroundMusicState({ wantsPlayback: true });
        } catch (error) {
          setMusicTogglePlaying(false);
          console.warn("Background music playback was blocked", error);
        }
      } else {
        backgroundAudio.pause();
        setMusicTogglePlaying(false);
        saveBackgroundMusicState({ wantsPlayback: false });
      }
    });

    backgroundAudio?.addEventListener("ended", async () => {
      siteMusicIndex = (siteMusicIndex + 1) % siteMusicPlaylist.length;
      backgroundAudio.src = siteMusicPlaylist[siteMusicIndex].url;
      try {
        await backgroundAudio.play();
        setMusicTogglePlaying(true);
        saveBackgroundMusicState({ wantsPlayback: true, currentTime: 0 });
      } catch (error) {
        console.warn("背景音乐续播失败", error);
      }
    });

    backgroundAudio?.addEventListener("play", () => {
      setMusicTogglePlaying(true);
      saveBackgroundMusicState({ wantsPlayback: true });
    });

    backgroundAudio?.addEventListener("pause", () => {
      if (isLeavingPage) return;
      setMusicTogglePlaying(false);
      saveBackgroundMusicState();
    });

    backgroundAudio?.addEventListener("timeupdate", () => {
      saveBackgroundMusicState();
    });

    window.addEventListener("pagehide", () => {
      isLeavingPage = true;
      saveBackgroundMusicState();
    });

    document.addEventListener("play", (event) => {
      if (!backgroundAudio || event.target === backgroundAudio) return;
      if (event.target.matches("audio, video")) {
        saveBackgroundMusicState({ wantsPlayback: false });
        backgroundAudio.pause();
        setMusicTogglePlaying(false);
      }
    }, true);

    $("#categoryList")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-category]");
      if (!button) return;
      currentCategory = button.dataset.category;
      currentPage = 1;
      renderCategories();
      renderGrid();
    });

    $("#hotCarousel")?.addEventListener("click", (event) => {
      const slide = event.target.closest("[data-id]");
      if (slide) showArticle(slide.dataset.id);
    });

    $("#hotDots")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-hot-index]");
      if (!button) return;
      hotIndex = Number(button.dataset.hotIndex);
      renderHotShowcase();
      startHotRotation();
    });

    $("#hotPrev")?.addEventListener("click", () => shiftHot(-1));
    $("#hotNext")?.addEventListener("click", () => shiftHot(1));

    $("#articleGrid")?.addEventListener("click", (event) => {
      const card = event.target.closest(".article-card");
      if (card) showArticle(card.dataset.id);
    });

    $("#backButton")?.addEventListener("click", () => {
      exitReader();
      history.replaceState(null, "", "articles.html");
    });

    $("#articleSearchInput")?.addEventListener("input", (event) => {
      currentQuery = event.target.value.trim();
      currentPage = 1;
      renderGrid();
    });

    $("#sortSelect")?.addEventListener("change", (event) => {
      sortOrder = event.target.value;
      currentPage = 1;
      renderGrid();
    });

    $("#pagination")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-page]");
      if (!button || button.disabled) return;
      currentPage = Number(button.dataset.page);
      renderGrid();
      $("#articles")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindPointerEffects() {
    if (mobileLayout.matches || window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lastMove = 0;
    const icons = ["\u{1F42C}", "\u{1F40B}", "\u269C", "\u{1F981}"];
    const root = document.documentElement;

    document.addEventListener("pointermove", (event) => {
      const now = performance.now();
      if (now - lastMove < 24) return;
      lastMove = now;
      root.style.setProperty("--mouse-x", `${event.clientX}px`);
      root.style.setProperty("--mouse-y", `${event.clientY}px`);
    }, { passive: true });

    document.addEventListener("click", (event) => {
      if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const icon = document.createElement("span");
      icon.className = "click-icon";
      icon.textContent = icons[Math.floor(Math.random() * icons.length)];
      icon.style.left = `${event.clientX}px`;
      icon.style.top = `${event.clientY}px`;
      icon.style.setProperty("--drift-x", `${Math.round(Math.random() * 46 - 23)}px`);
      icon.style.setProperty("--drift-y", `${Math.round(-34 - Math.random() * 34)}px`);
      icon.style.setProperty("--spin", `${Math.round(Math.random() * 40 - 20)}deg`);
      document.body.appendChild(icon);
      icon.addEventListener("animationend", () => icon.remove(), { once: true });
    });
  }

  applyPageText();
  applyPageVisuals();
  applyCustomTextStyles();
  renderHomeFeatures();
  renderCategories();
  renderHotShowcase();
  startHotRotation();
  renderGrid();
  bindEvents();
  bindPointerEffects();

  mobileLayout.addEventListener?.("change", () => {
    applyPageVisuals();
    renderHomeFeatures();
    renderHotShowcase();
    startHotRotation();
    renderGrid();
  });

  const params = new URLSearchParams(location.search);
  if ($("#articleSearchInput") && currentQuery) {
    $("#articleSearchInput").value = currentQuery;
    renderGrid();
  }
  if (params.get("article")) showArticle(params.get("article"));

  window.SiriusAPI.watchVersion(state.revision, () => {
    location.reload();
  });
})();
