(function () {
  const articleKey = "siriusArticles";
  const settingsKey = "siriusSiteSettings";
  const commentsKey = "siriusComments";

  function apiBase() {
    return (window.SIRIUS_API_BASE || "").replace(/\/$/, "");
  }

  function hasApi() {
    return Boolean(apiBase() || window.SIRIUS_USE_SAME_ORIGIN_API);
  }

  function canUseLocalFallback() {
    return !hasApi() || Boolean(window.SIRIUS_ALLOW_LOCAL_FALLBACK);
  }

  async function request(path, options = {}) {
    if (!hasApi()) throw new Error("API is not configured");
    const response = await fetch(`${apiBase()}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`API ${response.status}${message ? `: ${message.slice(0, 220)}` : ""}`);
    }
    return response.status === 204 ? null : response.json();
  }

  function localState() {
    return {
      articles: JSON.parse(localStorage.getItem(articleKey) || "[]"),
      settings: JSON.parse(localStorage.getItem(settingsKey) || "{}"),
      comments: JSON.parse(localStorage.getItem(commentsKey) || "{}"),
      source: "local",
    };
  }

  function saveArticleLocal(article) {
    const saved = JSON.parse(localStorage.getItem(articleKey) || "[]").filter((item) => item.id !== article.id);
    localStorage.setItem(articleKey, JSON.stringify([article, ...saved]));
    return article;
  }

  async function saveLargeArticle(article) {
    const payload = JSON.stringify(article);
    const chunkSize = 480000;
    const uploadId = `article-${article.id || Date.now()}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const total = Math.ceil(payload.length / chunkSize);
    await request("/api/articles/chunked/init", {
      method: "POST",
      body: JSON.stringify({ uploadId }),
    });
    for (let index = 0; index < total; index += 1) {
      await request("/api/articles/chunked/part", {
        method: "POST",
        body: JSON.stringify({
          uploadId,
          index,
          chunk: payload.slice(index * chunkSize, (index + 1) * chunkSize),
        }),
      });
    }
    return request("/api/articles/chunked/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId, total }),
    });
  }

  async function migrateLocalToApi() {
    if (!hasApi()) throw new Error("API is not configured");
    const state = localState();
    let articleCount = 0;
    for (const article of state.articles) {
      await saveArticle(article);
      articleCount += 1;
    }
    if (Object.keys(state.settings).length) await saveSettings(state.settings);
    await Promise.all(Object.entries(state.comments).map(([articleId, comments]) => saveComments(articleId, comments)));
    return {
      articles: articleCount,
      settings: Object.keys(state.settings).length ? 1 : 0,
      comments: Object.values(state.comments).reduce((total, comments) => total + comments.length, 0),
    };
  }

  async function loadState() {
    if (!hasApi()) return localState();
    try {
      return { ...(await request("/api/state")), source: "api" };
    } catch (error) {
      console.warn("Using local state because API failed:", error);
      if (canUseLocalFallback()) return localState();
      return { ...localState(), source: "api-error", apiError: error.message };
    }
  }

  async function saveArticle(article) {
    if (hasApi()) {
      const payload = JSON.stringify(article);
      if (payload.length > 900000) return saveLargeArticle(article);
      return request("/api/articles", { method: "POST", body: payload });
    }
    return saveArticleLocal(article);
  }

  async function saveArticles(articles) {
    if (hasApi()) {
      const saved = [];
      for (const article of articles) saved.push(await saveArticle(article));
      return saved;
    }
    const existing = JSON.parse(localStorage.getItem(articleKey) || "[]").filter((item) => !articles.some((article) => article.id === item.id));
    localStorage.setItem(articleKey, JSON.stringify([...articles, ...existing]));
    return articles;
  }

  async function hideArticle(article) {
    return saveArticle({ ...article, deleted: true });
  }

  async function saveSettings(settings) {
    if (hasApi()) return request("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    return settings;
  }

  async function submitComment(articleId, comment) {
    if (hasApi()) return request(`/api/articles/${encodeURIComponent(articleId)}/comments`, {
      method: "POST",
      body: JSON.stringify(comment),
    });
    const all = JSON.parse(localStorage.getItem(commentsKey) || "{}");
    all[articleId] = [...(all[articleId] || []), comment];
    localStorage.setItem(commentsKey, JSON.stringify(all));
    return comment;
  }

  async function saveComments(articleId, comments) {
    if (hasApi()) return request(`/api/articles/${encodeURIComponent(articleId)}/comments`, {
      method: "PUT",
      body: JSON.stringify({ comments }),
    });
    const all = JSON.parse(localStorage.getItem(commentsKey) || "{}");
    all[articleId] = comments;
    localStorage.setItem(commentsKey, JSON.stringify(all));
    return comments;
  }

  window.SiriusAPI = {
    hasApi,
    loadState,
    saveArticle,
    saveArticles,
    hideArticle,
    saveSettings,
    submitComment,
    saveComments,
    migrateLocalToApi,
  };
})();
