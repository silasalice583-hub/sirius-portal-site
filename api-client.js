(function () {
  const articleKey = "siriusArticles";
  const settingsKey = "siriusSiteSettings";
  const commentsKey = "siriusComments";

  function apiBase() {
    return (window.SIRIUS_API_BASE || "").replace(/\/$/, "");
  }

  function absoluteApiUrl(path) {
    const base = apiBase() || window.location.origin;
    return new URL(path, base).href;
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
      const error = new Error(`API ${response.status}${message ? `: ${message.slice(0, 220)}` : ""}`);
      error.status = response.status;
      error.responseText = message;
      throw error;
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
    let capabilities;
    try {
      capabilities = await request("/api/capabilities");
    } catch (error) {
      throw new Error(`文章体积较大，普通上传已被服务器拒绝；当前 Railway 后端不支持分块导入。请重新部署 backend 目录后再试。原始错误：${error.message}`);
    }
    if (!capabilities.chunkedUploads) {
      throw new Error(`文章体积较大，普通上传已被服务器拒绝；当前 Railway 后端版本 ${capabilities.apiVersion || "未知"} 不支持分块导入。请重新部署 backend 目录。`);
    }
    try {
      await request("/api/articles/chunked/init", {
        method: "POST",
        body: JSON.stringify({ uploadId }),
      });
    } catch (error) {
      if (error.status === 404 || error.status === 405) {
        throw new Error("文章体积较大，普通上传已被服务器拒绝；线上 Railway 后端缺少分块导入接口。请在 Railway 重新部署最新 backend 目录。");
      }
      throw error;
    }
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

  async function loadCapabilities() {
    if (!hasApi()) return null;
    return request(`/api/capabilities?ts=${Date.now()}`);
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

  async function deleteArticle(articleId, keepTombstone = false) {
    if (hasApi()) {
      return request(`/api/articles/${encodeURIComponent(articleId)}`, {
        method: "DELETE",
        body: JSON.stringify({ keepTombstone }),
      });
    }
    const saved = JSON.parse(localStorage.getItem(articleKey) || "[]").filter((item) => item.id !== articleId);
    if (keepTombstone) saved.unshift({ id: articleId, deleted: true });
    localStorage.setItem(articleKey, JSON.stringify(saved));
    const comments = JSON.parse(localStorage.getItem(commentsKey) || "{}");
    delete comments[articleId];
    localStorage.setItem(commentsKey, JSON.stringify(comments));
    return { id: articleId, deleted: true, tombstone: keepTombstone };
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

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadMedia(file) {
    if (!file) throw new Error("没有选择媒体文件");
    if (!hasApi()) throw new Error("本地预览模式不能上传媒体，请在部署后的网站后台操作");
    const result = await request("/api/media", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        base64: await fileToBase64(file),
      }),
    });
    return absoluteApiUrl(result.path);
  }

  window.SiriusAPI = {
    hasApi,
    loadState,
    loadVersion,
    loadCapabilities,
    watchVersion,
    saveArticle,
    saveArticles,
    hideArticle,
    deleteArticle,
    saveSettings,
    submitComment,
    saveComments,
    collectiveHeartbeat,
    uploadMedia,
    migrateLocalToApi,
  };
})();
