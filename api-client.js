(function () {
  const articleKey = "siriusArticles";
  const settingsKey = "siriusSiteSettings";
  const commentsKey = "siriusComments";
  const editorAuthTokenKey = "siriusEditorAuthToken";
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
  const defaultCategories = ["门户更新", "会议", "访谈", "重要冥想", "文章更新", "相关资料"];

  function normalizeCategory(category) {
    return category === "冥想发布" ? "重要冥想" : category;
  }

  function isRetiredArticle(article) {
    return retiredArticleIds.has(article.id)
      || retiredArticleSignatures.has(`${article.date || ""}|${article.title || ""}`);
  }

  function normalizeCategories(categories) {
    const source = categories?.length ? categories : defaultCategories;
    const normalized = [...new Set(source.map(normalizeCategory).filter(Boolean))];
    if (!normalized.includes("重要冥想")) normalized.push("重要冥想");
    if (!normalized.includes("相关资料")) normalized.push("相关资料");
    return normalized;
  }

  function cleanState(state) {
    const articles = (state.articles || [])
      .filter((article) => !isRetiredArticle(article))
      .map((article) => ({ ...article, category: normalizeCategory(article.category) }));
    const settings = { ...(state.settings || {}) };
    settings.categories = normalizeCategories(settings.categories || []);
    if (settings.page?.heroTitle === "天狼星门户") {
      settings.page = { ...settings.page, heroTitle: "天狼星之光" };
    }
    return { ...state, articles, settings };
  }

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

  function editorAuthToken() {
    try {
      return sessionStorage.getItem(editorAuthTokenKey) || "";
    } catch (error) {
      return "";
    }
  }

  function setEditorAuthToken(token) {
    try {
      if (token) sessionStorage.setItem(editorAuthTokenKey, token);
      else sessionStorage.removeItem(editorAuthTokenKey);
    } catch (error) {
      console.warn("无法保存编辑器登录会话", error);
    }
  }

  async function request(path, options = {}) {
    if (!hasApi()) throw new Error("API is not configured");
    const { headers: optionHeaders = {}, ...fetchOptions } = options;
    const token = editorAuthToken();
    const response = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...optionHeaders,
      },
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      let detail = responseText;
      try {
        const payload = JSON.parse(responseText);
        detail = payload.error || payload.detail || responseText;
      } catch (error) {
        // 保留纯文本错误。
      }
      if (response.status === 401 && token && !path.startsWith("/api/editor-auth/")) {
        setEditorAuthToken("");
        window.dispatchEvent(new CustomEvent("sirius-editor-auth-required"));
      }
      const error = new Error(detail || `API ${response.status}`);
      error.status = response.status;
      error.responseText = responseText;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  function localState() {
    const storedArticles = JSON.parse(localStorage.getItem(articleKey) || "[]");
    const state = cleanState({
      articles: storedArticles,
      settings: JSON.parse(localStorage.getItem(settingsKey) || "{}"),
      comments: JSON.parse(localStorage.getItem(commentsKey) || "{}"),
      source: "local",
    });
    if (state.articles.length !== storedArticles.length) {
      localStorage.setItem(articleKey, JSON.stringify(state.articles));
    }
    return state;
  }

  function saveArticleLocal(article) {
    if (isRetiredArticle(article)) return article;
    article = { ...article, category: normalizeCategory(article.category) };
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
      return cleanState({ ...(await request("/api/state")), source: "api" });
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

  async function requestEditorCode(password) {
    if (!hasApi()) throw new Error("编辑器登录需要连接已部署的后端 API");
    return request("/api/editor-auth/password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  async function verifyEditorCode(challengeId, code) {
    const result = await request("/api/editor-auth/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, code }),
    });
    setEditorAuthToken(result.token);
    return result;
  }

  async function verifyEditorSession() {
    if (!editorAuthToken()) throw new Error("尚未登录");
    return request("/api/editor-auth/session");
  }

  async function logoutEditor() {
    if (editorAuthToken()) {
      await request("/api/editor-auth/logout", { method: "POST" }).catch(() => null);
    }
    setEditorAuthToken("");
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
    requestEditorCode,
    verifyEditorCode,
    verifyEditorSession,
    logoutEditor,
  };
})();
