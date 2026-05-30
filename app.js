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

  const state = await window.SiriusAPI.loadState();
  const settings = state.settings || {};
  const page = { ...defaultPage, ...(settings.page || {}) };
  const savedArticles = state.articles || [];
  let commentsState = state.comments || {};
  const savedMap = new Map(savedArticles.map((article) => [article.id, article]));
  const articles = [
    ...savedArticles.filter((article) => !baseArticles.some((base) => base.id === article.id)),
    ...baseArticles.map((article) => savedMap.get(article.id) || article),
  ].filter((article) => !article.deleted);

  const configuredCategories = settings.categories || [];
  const allCategories = configuredCategories.length
    ? configuredCategories
    : [...new Set(articles.map((article) => article.category))];
  let currentCategory = "全部";
  let currentQuery = "";
  let currentPage = 1;
  let sortOrder = "newest";
  let hotIndex = 0;
  let hotTimer = null;

  const grid = document.getElementById("articleGrid");
  const categoryList = document.getElementById("categoryList");
  const hotCarousel = document.getElementById("hotCarousel");
  const hotDots = document.getElementById("hotDots");
  const hotPrev = document.getElementById("hotPrev");
  const hotNext = document.getElementById("hotNext");
  const listTitle = document.getElementById("listTitle");
  const articleCount = document.getElementById("articleCount");
  const articleSearchInput = document.getElementById("articleSearchInput");
  const sortSelect = document.getElementById("sortSelect");
  const pagination = document.getElementById("pagination");
  const reader = document.getElementById("reader");
  const articleBand = document.querySelector(".article-band");
  const hotShowcase = document.querySelector(".hot-showcase");
  const backgroundAudio = document.getElementById("backgroundAudio");
  backgroundAudio.src = settings.siteMusic || defaultMusic;

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
    if (isVideoSource(url)) {
      return `<video src="${escapeHTML(url)}" controls playsinline></video>`;
    }
    return `<img src="${escapeHTML(url)}" alt="${escapeHTML(title || "页面图片")}" loading="lazy" />`;
  }

  function applyPageVisuals() {
    document.body.style.backgroundImage = page.backgroundImage ? `url("${page.backgroundImage}")` : "";
    document.body.classList.toggle("custom-background", Boolean(page.backgroundImage));

    const heroMedia = document.getElementById("heroMedia");
    const heroSource = page.heroVideo || page.heroBanner;
    if (heroSource) {
      heroMedia.hidden = false;
      heroMedia.innerHTML = mediaHTML(heroSource, page.heroTitle);
    }

    const footerMedia = document.getElementById("footerMedia");
    const footerSource = page.aboutVideo || page.footerImage;
    if (footerSource) {
      footerMedia.hidden = false;
      footerMedia.innerHTML = mediaHTML(footerSource, page.aboutTitle);
    }
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
    const selected = (settings.hotArticleIds || [])
      .map((id) => articles.find((article) => article.id === id))
      .filter(Boolean);
    return selected.length ? selected : [...articles].sort((a, b) => (b.hot || 0) - (a.hot || 0)).slice(0, 5);
  }

  function renderCategories() {
    const categories = ["全部", ...allCategories];
    categoryList.innerHTML = categories.map((category) => (
      `<button type="button" class="${category === currentCategory ? "active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`
    )).join("");
  }

  function renderHotShowcase() {
    const hot = hotArticles();
    if (!hot.length) {
      hotCarousel.innerHTML = "";
      hotDots.innerHTML = "";
      return;
    }
    hotCarousel.innerHTML = hot.map((article, index) => `
      <article class="hot-slide ${index === hotIndex ? "active" : ""}" data-id="${article.id}">
        <img src="${escapeHTML(article.cover)}" alt="${escapeHTML(article.title)}" />
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
    const box = document.getElementById("comments");
    if (article.commentMode === "closed") {
      box.innerHTML = "<h3>评论区未开启</h3><p>本文当前不开放评论。</p>";
      return;
    }
    const visible = getComments(article.id).filter((comment) => {
      if (!comment.approved) return false;
      return article.commentMode === "all" || comment.featured;
    });
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
    document.getElementById("commentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveComment(article.id, {
        id: Date.now().toString(),
        name: document.getElementById("commentName").value,
        body: document.getElementById("commentBody").value,
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
    if (!article) return;
    articleBand.hidden = true;
    hotShowcase.hidden = true;
    reader.hidden = false;
    document.getElementById("readerCover").src = article.cover;
    document.getElementById("readerCover").alt = article.title;
    document.getElementById("readerMeta").textContent = `${article.category} · ${article.date}`;
    document.getElementById("readerTitle").textContent = article.title;
    document.getElementById("readerExcerpt").textContent = article.excerpt;
    document.getElementById("readerBody").innerHTML = (article.html || (article.paragraphs || []).map((p) => `<p>${escapeHTML(p)}</p>`).join("")) +
      (article.images || []).slice(1).map((src) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(article.title)} 配图" loading="lazy" />`).join("");
    document.getElementById("inlineMusic").innerHTML = article.music
      ? `<div class="audio-card"><p class="eyebrow">Article Music</p><audio src="${escapeHTML(article.music)}" controls></audio></div>`
      : "";
    if (article.video) {
      document.getElementById("inlineMusic").innerHTML += `<div class="audio-card media-card"><p class="eyebrow">Article Video</p>${mediaHTML(article.video, article.title)}</div>`;
    }
    renderComments(article);
    location.hash = `article-${id}`;
    reader.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    currentCategory = button.dataset.category;
    currentPage = 1;
    renderCategories();
    renderGrid();
  });

  hotCarousel.addEventListener("click", (event) => {
    const slide = event.target.closest("[data-id]");
    if (slide) showArticle(slide.dataset.id);
  });

  hotDots.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hot-index]");
    if (!button) return;
    hotIndex = Number(button.dataset.hotIndex);
    renderHotShowcase();
    startHotRotation();
  });

  hotPrev.addEventListener("click", () => shiftHot(-1));
  hotNext.addEventListener("click", () => shiftHot(1));

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".article-card");
    if (card) showArticle(card.dataset.id);
  });

  grid.addEventListener("keydown", (event) => {
    if (event.key === "Enter") showArticle(event.target.closest(".article-card")?.dataset.id);
  });

  document.getElementById("backButton").addEventListener("click", () => {
    exitReader();
    location.hash = "articles";
  });

  function exitReader() {
    reader.hidden = true;
    articleBand.hidden = false;
    hotShowcase.hidden = false;
  }

  document.querySelector(".top-nav").addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    event.preventDefault();
    exitReader();
    const target = document.querySelector(link.getAttribute("href"));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", link.getAttribute("href"));
    }
  });

  document.getElementById("searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentQuery = document.getElementById("searchInput").value.trim();
    articleSearchInput.value = currentQuery;
    currentPage = 1;
    exitReader();
    renderGrid();
    document.getElementById("articles").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    currentQuery = event.target.value.trim();
    articleSearchInput.value = currentQuery;
    currentPage = 1;
    renderGrid();
  });

  articleSearchInput.addEventListener("input", (event) => {
    currentQuery = event.target.value.trim();
    document.getElementById("searchInput").value = currentQuery;
    currentPage = 1;
    renderGrid();
  });

  sortSelect.addEventListener("change", (event) => {
    sortOrder = event.target.value;
    currentPage = 1;
    renderGrid();
  });

  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    renderGrid();
    document.getElementById("articles").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("musicToggle").addEventListener("click", async () => {
    if (backgroundAudio.paused) {
      await backgroundAudio.play();
      document.getElementById("musicToggle").classList.add("playing");
    } else {
      backgroundAudio.pause();
      document.getElementById("musicToggle").classList.remove("playing");
    }
  });

  applyPageText();
  applyPageVisuals();
  renderCategories();
  renderHotShowcase();
  startHotRotation();
  renderGrid();
})();
