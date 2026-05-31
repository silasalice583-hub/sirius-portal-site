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
  const settings = state.settings || {};
  const page = { ...defaultPage, ...(settings.page || {}) };
  if (page.logoImage === "logo抠图.png") page.logoImage = defaultPage.logoImage;
  if (!page.motionBackgroundImage) page.motionBackgroundImage = defaultPage.motionBackgroundImage;
  if (page.articleBannerImage === "assets/articles-banner-art.png") page.articleBannerImage = defaultPage.articleBannerImage;
  if (page.aboutImage === "assets/about-footer-art.png") page.aboutImage = defaultPage.aboutImage;
  const savedArticles = state.articles || [];
  let commentsState = state.comments || {};
  const savedMap = new Map(savedArticles.map((article) => [article.id, article]));
  const articles = [
    ...savedArticles.filter((article) => !baseArticles.some((base) => base.id === article.id)),
    ...baseArticles.map((article) => savedMap.get(article.id) || article),
  ].filter((article) => !article.deleted);

  let currentCategory = "全部";
  let currentQuery = new URLSearchParams(location.search).get("q") || "";
  let currentPage = 1;
  let sortOrder = "newest";
  let hotIndex = 0;
  let hotTimer = null;

  const configuredCategories = settings.categories || [];
  const allCategories = configuredCategories.length ? configuredCategories : [...new Set(articles.map((article) => article.category))];

  const $ = (selector) => document.querySelector(selector);
  const backgroundAudio = $("#backgroundAudio");
  if (backgroundAudio) backgroundAudio.src = settings.siteMusic || defaultMusic;

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function applyPageText() {
    Object.entries(page).forEach(([key, value]) => {
      const target = document.getElementById(key) || document.querySelector(`[data-site="${key}"]`);
      if (target) target.textContent = value;
    });
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

  function applyPageVisuals() {
    document.body.style.backgroundImage = page.backgroundImage ? `url("${page.backgroundImage}")` : "";
    document.body.classList.toggle("custom-background", Boolean(page.backgroundImage));
    document.body.dataset.siteFont = page.fontFamily || defaultPage.fontFamily;
    document.documentElement.dataset.logoMotion = page.logoMotion || "strong";
    document.querySelectorAll("[data-site-logo]").forEach((image) => {
      image.src = page.logoImage || defaultPage.logoImage;
    });
    const heroLogo = document.getElementById("heroLogoImage");
    if (heroLogo) heroLogo.src = page.logoImage || defaultPage.logoImage;
    const motionBand = $(".motion-band");
    if (motionBand) {
      const motionImage = page.motionBackgroundImage || page.footerImage;
      if (motionImage) {
        motionBand.style.backgroundImage = `linear-gradient(135deg, rgba(6, 95, 78, .68), rgba(10, 63, 59, .56)), url("${motionImage}")`;
        motionBand.style.backgroundSize = "cover";
        motionBand.style.backgroundPosition = "center";
      } else {
        motionBand.style.backgroundImage = "";
        motionBand.style.backgroundSize = "";
        motionBand.style.backgroundPosition = "";
      }
    }
    const articleBanner = document.getElementById("articleBannerImage");
    if (articleBanner) articleBanner.src = page.articleBannerImage || page.heroBanner || defaultPage.articleBannerImage;
    const aboutVisual = document.getElementById("aboutVisualImage");
    if (aboutVisual) aboutVisual.src = page.aboutImage || page.footerImage || defaultPage.aboutImage;
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
      .slice(0, 3)
      .map((article) => `
        <a class="home-feature-card" href="articles.html?article=${encodeURIComponent(article.id)}">
          <img src="${escapeHTML(article.cover)}" alt="${escapeHTML(article.title)}" loading="lazy" decoding="async" />
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
    const hot = hotArticles();
    if (!hot.length) {
      hotCarousel.innerHTML = "";
      hotDots.innerHTML = "";
      return;
    }
    hotCarousel.innerHTML = hot.map((article, index) => `
      <article class="hot-slide ${index === hotIndex ? "active" : ""}" data-id="${article.id}">
        <img src="${escapeHTML(article.cover)}" alt="${escapeHTML(article.title)}" loading="${index === hotIndex ? "eager" : "lazy"}" decoding="async" />
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
    const perPage = Math.max(1, Number(page.articlesPerPage || 7));
    const totalPages = Math.max(1, Math.ceil(result.length / perPage));
    currentPage = Math.min(currentPage, totalPages);
    const pageItems = result.slice((currentPage - 1) * perPage, currentPage * perPage);
    listTitle.textContent = currentCategory === "全部" ? page.allArticlesTitle : currentCategory;
    articleCount.textContent = `${result.length} 篇 · 第 ${currentPage}/${totalPages} 页`;
    grid.innerHTML = pageItems.map((article) => `
      <article class="article-card" data-id="${article.id}" tabindex="0">
        <img src="${escapeHTML(article.cover)}" alt="${escapeHTML(article.title)}" loading="lazy" />
        <div class="card-body">
          <div class="meta-row">${escapeHTML(article.category)} · ${escapeHTML(article.date)}</div>
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

  function defaultComments(articleId) {
    return [
      { name: "星门读者", body: "这篇整理得很清楚，适合回看重点。", featured: true, approved: true },
      { name: "晨光", body: "已收藏，准备转给同修一起阅读。", featured: false, approved: true },
    ].map((comment) => ({ ...comment, id: `${articleId}-${comment.name}` }));
  }

  function getComments(articleId) {
    return commentsState[articleId] || defaultComments(articleId);
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
    reader.hidden = false;
    $("#readerCover").src = article.cover;
    $("#readerCover").alt = article.title;
    $("#readerMeta").textContent = `${article.category} · ${article.date}`;
    $("#readerTitle").textContent = article.title;
    $("#readerExcerpt").textContent = article.excerpt;
    $("#readerBody").innerHTML = (article.html || (article.paragraphs || []).map((p) => `<p>${escapeHTML(p)}</p>`).join("")) +
      (article.images || []).slice(1).map((src) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(article.title)} 配图" loading="lazy" />`).join("");
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
        await backgroundAudio.play();
        $("#musicToggle").classList.add("playing");
      } else {
        backgroundAudio.pause();
        $("#musicToggle").classList.remove("playing");
      }
    });

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
  renderHomeFeatures();
  renderCategories();
  renderHotShowcase();
  startHotRotation();
  renderGrid();
  bindEvents();
  bindPointerEffects();

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
