(async function () {
  const $ = (selector) => document.querySelector(selector);
  const viewerId = sessionStorage.getItem("siriusCollectiveViewerId") || crypto.randomUUID();
  sessionStorage.setItem("siriusCollectiveViewerId", viewerId);

  let state = await window.SiriusAPI.loadState();
  let schedule = state.settings?.collectiveMeditationSchedule || [];
  let currentSessionKey = "";

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function resolveMediaUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return url.startsWith("/") ? url : url;
  }

  function beijingParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function secondOfDay(date = new Date()) {
    const parts = beijingParts(date);
    return Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  }

  function timeToSeconds(value) {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    return (Number(hour) || 0) * 3600 + (Number(minute) || 0) * 60;
  }

  function sessionWindow(item) {
    const start = timeToSeconds(item.start);
    const end = timeToSeconds(item.end);
    return { start, end };
  }

  function isWithinWindow(now, start, end) {
    return end > start ? now >= start && now < end : now >= start || now < end;
  }

  function activeMeditation(items = schedule) {
    const now = secondOfDay();
    return items.find((item) => {
      const { start, end } = sessionWindow(item);
      return isWithinWindow(now, start, end);
    });
  }

  function elapsedSeconds(item, date = new Date()) {
    const current = secondOfDay(date);
    const start = timeToSeconds(item.start);
    return current >= start ? current - start : current + 24 * 60 * 60 - start;
  }

  function sessionKey(item) {
    return [
      item?.title || "",
      item?.start || "",
      item?.end || "",
      item?.music || "",
      item?.video || "",
      item?.durationSeconds || "",
    ].join("|");
  }

  function pauseBackgroundMusic() {
    const backgroundAudio = $("#backgroundAudio");
    if (backgroundAudio && !backgroundAudio.paused) backgroundAudio.pause();
    $("#musicToggle")?.classList.remove("playing");
  }

  function alignMediaToBeijing(media, item) {
    if (!media.duration || !Number.isFinite(media.duration)) return;
    const elapsed = elapsedSeconds(item);
    const target = Math.max(0, Math.min(elapsed, Math.max(media.duration - 0.25, 0)));
    if (Math.abs(media.currentTime - target) > 1.5) media.currentTime = target;
  }

  function playSessionAudio(audio, item) {
    alignMediaToBeijing(audio, item);
    pauseBackgroundMusic();
    audio.play().catch(() => {
      $("#sessionStatus").textContent = "点击播放器即可按北京时间同步进度播放";
    });
  }

  function syncMedia(item) {
    const audio = $("#sessionAudio");
    const music = resolveMediaUrl(item.music);
    audio.hidden = !music;
    if (music && audio.getAttribute("src") !== music) {
      audio.src = music;
      audio.load();
    }
    audio.onloadedmetadata = () => playSessionAudio(audio, item);
    audio.onplay = () => {
      alignMediaToBeijing(audio, item);
      pauseBackgroundMusic();
    };
    if (music && audio.readyState >= 1) playSessionAudio(audio, item);

    const videoUrl = resolveMediaUrl(item.video);
    $("#sessionVideo").innerHTML = videoUrl
      ? `<video src="${escapeHTML(videoUrl)}" controls playsinline preload="metadata"></video>`
      : "";
    const video = $("#sessionVideo video");
    if (video) {
      video.addEventListener("loadedmetadata", () => alignMediaToBeijing(video, item), { once: true });
      video.addEventListener("play", () => {
        alignMediaToBeijing(video, item);
        pauseBackgroundMusic();
      });
    }
  }

  function renderSession() {
    const active = activeMeditation();
    const nextKey = sessionKey(active);
    if (nextKey === currentSessionKey) return;
    currentSessionKey = nextKey;

    if (active) {
      $("#sessionTitle").textContent = active.title || "集体冥想";
      $("#sessionTime").textContent = `${active.start} - ${active.end} · 北京时间`;
      $("#sessionStatus").textContent = active.music ? "当前冥想正在进行" : "当前时段已开始，但还没有设置冥想音乐";
      syncMedia(active);
    } else {
      $("#sessionTitle").textContent = "当前没有进行中的集体冥想";
      $("#sessionTime").textContent = "请返回冥想空间查看下一场排期";
      $("#sessionStatus").textContent = "等待下一场集体冥想";
      $("#sessionAudio").pause();
      $("#sessionAudio").removeAttribute("src");
      $("#sessionAudio").hidden = true;
      $("#sessionVideo").innerHTML = "";
    }
  }

  async function refreshSchedule() {
    try {
      state = await window.SiriusAPI.loadState();
      schedule = state.settings?.collectiveMeditationSchedule || [];
      renderSession();
    } catch (error) {
      console.warn("Collective meditation refresh failed:", error);
    }
  }

  async function updateParticipantCount() {
    try {
      const result = await window.SiriusAPI.collectiveHeartbeat(viewerId);
      $("#participantCount").textContent = result.count || 1;
    } catch (error) {
      $("#participantCount").textContent = "1";
    }
  }

  renderSession();
  updateParticipantCount();
  setInterval(updateParticipantCount, 15000);
  setInterval(refreshSchedule, 10000);
  setInterval(() => {
    const active = activeMeditation();
    if (!active) {
      renderSession();
      return;
    }
    alignMediaToBeijing($("#sessionAudio"), active);
  }, 30000);
  window.SiriusAPI.watchVersion(state.revision, refreshSchedule, 5000);
})();
