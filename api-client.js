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
      cache: "no-store",
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
    try {
      const capabilities = await request("/api/capabilities");
      if (!capabilities.chunkedUploads) throw new Error("Railway API does not support chunked uploads");
    } catch (error) {
      throw new Error(`Railway 后端版本过旧，无法导入较大文章。请重新部署 backend 目录后再试。原始错误：${error.message}`);
    }
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
      console.warn("API state load failed:", error);
      if (canUseLocalFallback()) return localState();
      return {
        articles: [],
        settings: {},
        comments: {},
        source: "api-error",
        apiError: error.message,
      };
    }
  }

  async function loadVersion() {
    if (!hasApi()) return null;
    return request(`/api/version?ts=${Date.now()}`);
  }

  function watchVersion(initialRevision, onChange, intervalMs = 8000) {
    if (!hasApi()) return () => {};
    let revision = Number(initialRevision || 0);
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped || document.hidden) return;
      try {
        const next = await loadVersion();
        const nextRevision = Number(next?.revision || 0);
        if (revision && nextRevision > revision) {
          revision = nextRevision;
          onChange(next);
          return;
        }
        if (nextRevision) revision = nextRevision;
      } catch (error) {
        console.warn("Version check failed:", error);
      }
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async function saveArticle(article) {
    if (hasApi()) {
      const payload = JSON.stringify(article);
      if (payload.length > 900000) return saveLargeArticle(article);
      try {
        return await request("/api/articles", { method: "POST", body: payload });
      } catch (error) {
        if (/API (413|500|502|503)/.test(error.message)) return saveLargeArticle(article);
        throw error;
      }
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

  async function collectiveHeartbeat(viewerId) {
    if (hasApi()) return request("/api/collective-meditation/heartbeat", {
      method: "POST",
      body: JSON.stringify({ viewerId }),
    });
    return { count: 1 };
  }

  window.SiriusAPI = {
    hasApi,
    loadState,
    loadVersion,
    watchVersion,
    saveArticle,
    saveArticles,
    hideArticle,
    saveSettings,
    submitComment,
    saveComments,
    collectiveHeartbeat,
    migrateLocalToApi,
  };
})();
