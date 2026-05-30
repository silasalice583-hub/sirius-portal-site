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

  async function migrateLocalToApi() {
    if (!hasApi()) throw new Error("API is not configured");
    const state = localState();
    if (state.articles.length) await saveArticles(state.articles);
    if (Object.keys(state.settings).length) await saveSettings(state.settings);
    await Promise.all(Object.entries(state.comments).map(([articleId, comments]) => saveComments(articleId, comments)));
    return {
      articles: state.articles.length,
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
    if (hasApi()) return request("/api/articles", { method: "POST", body: JSON.stringify(article) });
    const saved = JSON.parse(localStorage.getItem(articleKey) || "[]").filter((item) => item.id !== article.id);
    localStorage.setItem(articleKey, JSON.stringify([article, ...saved]));
    return article;
  }

  async function saveArticles(articles) {
    if (hasApi()) return request("/api/articles/bulk", { method: "POST", body: JSON.stringify({ articles }) });
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
