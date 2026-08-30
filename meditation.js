(async function () {
  const $ = (selector) => document.querySelector(selector);
  const state = await window.SiriusAPI.loadState();
  const settings = state.settings || {};
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
  const savedArticles = (state.articles || []).filter((article) => !isRetiredArticle(article));
  const savedMap = new Map(savedArticles.map((article) => [article.id, article]));
  const articles = [
    ...savedArticles.filter((article) => !baseArticles.some((base) => base.id === article.id)),
    ...baseArticles.filter((article) => !isRetiredArticle(article)).map((article) => savedMap.get(article.id) || article),
  ].filter((article) => !article.deleted && !article.archived);
  const meditations = articles
    .filter((article) => article.contentType === "meditation")
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const schedule = settings.collectiveMeditationSchedule || [];
  const beijingFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function minuteOfDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(value.hour) * 60 + Number(value.minute);
  }

  function timeToMinutes(value) {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    return hour * 60 + minute;
  }

  function isActive(item, minute) {
    const start = timeToMinutes(item.start);
    const end = timeToMinutes(item.end);
    return end > start ? minute >= start && minute < end : minute >= start || minute < end;
  }

  function renderArchive() {
    $("#meditationCount").textContent = `${meditations.length} 项`;
    $("#meditationGrid").innerHTML = meditations.length ? meditations.map((item) => `
      <button class="meditation-card" type="button" data-meditation-id="${escapeHTML(item.id)}">
        <img src="${escapeHTML(item.cover || "assets/logo-cutout-web.png")}" alt="${escapeHTML(item.title)}" loading="lazy" />
        <span>${escapeHTML(item.category || "冥想")} · ${escapeHTML(item.date || "")}</span>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.excerpt || "进入冥想内容")}</p>
        <b>${escapeHTML(item.duration || "音频 / 视频")}</b>
      </button>
    `).join("") : `
      <div class="meditation-empty">
        <p class="eyebrow">Archive Empty</p>
        <h3>冥想合集正在准备中</h3>
        <p>在后台文章编辑器中将内容类型设为“冥想”，保存后会出现在这里。</p>
      </div>
    `;
  }

  function mediaHTML(item) {
    const music = item.music ? `<div class="audio-card"><p class="eyebrow">Meditation Audio</p><audio src="${escapeHTML(item.music)}" controls preload="none"></audio></div>` : "";
    const video = item.video ? `<div class="audio-card media-card"><p class="eyebrow">Meditation Video</p><video src="${escapeHTML(item.video)}" controls playsinline preload="metadata"></video></div>` : "";
    return music + video;
  }

  function openMeditation(id) {
    const item = meditations.find((meditation) => meditation.id === id);
    if (!item) return;
    $(".meditation-archive").hidden = true;
    $("#meditationReader").hidden = false;
    $("#meditationCover").src = item.cover || "assets/logo-cutout-web.png";
    $("#meditationCover").alt = item.title;
    $("#meditationMeta").textContent = `${item.category || "冥想"} · ${item.date || ""}${item.duration ? ` · ${item.duration}` : ""}`;
    $("#meditationTitle").textContent = item.title;
    $("#meditationExcerpt").textContent = item.excerpt || "";
    $("#meditationMedia").innerHTML = mediaHTML(item);
    $("#meditationBody").innerHTML = item.html || (item.paragraphs || []).map((text) => `<p>${escapeHTML(text)}</p>`).join("");
    $("#meditationReader").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderCollective() {
    const minute = minuteOfDay();
    const active = schedule.find((item) => isActive(item, minute));
    const upcoming = schedule
      .map((item) => ({ ...item, startMinute: timeToMinutes(item.start) }))
      .sort((a, b) => a.startMinute - b.startMinute)
      .find((item) => item.startMinute > minute) || schedule[0];
    $("#beijingClock").textContent = `${beijingFormatter.format(new Date())} 北京时间`;
    if (active) {
      $("#collectiveStatus").textContent = "当前时段已进入集体冥想";
      $("#collectiveTitle").textContent = active.title || "集体冥想";
      $("#collectiveTime").textContent = `${active.start} - ${active.end} · 北京时间`;
      $("#collectiveEnter").textContent = "进入正在进行的集体冥想";
      $("#collectiveEnter").classList.remove("disabled");
    } else {
      $("#collectiveStatus").textContent = "当前时段没有正在进行的集体冥想";
      $("#collectiveTitle").textContent = "等待下一场集体冥想";
      $("#collectiveTime").textContent = "";
      $("#collectiveEnter").textContent = "查看集体冥想界面";
      $("#collectiveEnter").classList.add("disabled");
    }
    $("#collectiveNext").innerHTML = upcoming
      ? `<span>下一场</span><strong>${escapeHTML(upcoming.title || "集体冥想")}</strong><b>${escapeHTML(upcoming.start || "")} - ${escapeHTML(upcoming.end || "")}</b>`
      : "<span>排期</span><strong>后台尚未设置播放时段</strong>";
  }

  $("#meditationGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-meditation-id]");
    if (card) openMeditation(card.dataset.meditationId);
  });
  $("#collective").addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    location.href = "collective-meditation.html";
  });
  $("#meditationBack").addEventListener("click", () => {
    $("#meditationReader").hidden = true;
    $(".meditation-archive").hidden = false;
  });

  renderArchive();
  renderCollective();
  setInterval(renderCollective, 1000);
})();
