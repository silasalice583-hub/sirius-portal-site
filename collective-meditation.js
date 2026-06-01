(async function () {
  const $ = (selector) => document.querySelector(selector);
  const state = await window.SiriusAPI.loadState();
  const schedule = state.settings?.collectiveMeditationSchedule || [];
  const viewerId = sessionStorage.getItem("siriusCollectiveViewerId") || crypto.randomUUID();
  sessionStorage.setItem("siriusCollectiveViewerId", viewerId);

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

  function activeMeditation() {
    const minute = minuteOfDay();
    return schedule.find((item) => {
      const start = timeToMinutes(item.start);
      const end = timeToMinutes(item.end);
      return end > start ? minute >= start && minute < end : minute >= start || minute < end;
    });
  }

  function elapsedSeconds(item, date = new Date()) {
    const current = minuteOfDay(date) * 60 + date.getSeconds();
    const start = timeToMinutes(item.start) * 60;
    return current >= start ? current - start : current + 24 * 60 * 60 - start;
  }

  function syncMedia(item) {
    const audio = $("#sessionAudio");
    audio.src = item.music || "";
    audio.hidden = !item.music;
    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration) audio.currentTime = elapsedSeconds(item) % audio.duration;
      audio.play().catch(() => {
        $("#sessionStatus").textContent = "点击播放即可从北京时间同步进度进入";
      });
    }, { once: true });
    $("#sessionVideo").innerHTML = item.video ? `<video src="${escapeHTML(item.video)}" controls playsinline preload="metadata"></video>` : "";
    const video = $("#sessionVideo video");
    video?.addEventListener("loadedmetadata", () => {
      if (video.duration) video.currentTime = elapsedSeconds(item) % video.duration;
    }, { once: true });
  }

  async function updateParticipantCount() {
    try {
      const result = await window.SiriusAPI.collectiveHeartbeat(viewerId);
      $("#participantCount").textContent = result.count || 1;
    } catch (error) {
      $("#participantCount").textContent = "1";
    }
  }

  const active = activeMeditation();
  if (active) {
    $("#sessionTitle").textContent = active.title || "集体冥想";
    $("#sessionTime").textContent = `${active.start} - ${active.end} · 北京时间`;
    $("#sessionStatus").textContent = "当前冥想正在进行";
    syncMedia(active);
  } else {
    $("#sessionTitle").textContent = "当前没有进行中的集体冥想";
    $("#sessionTime").textContent = "请返回冥想空间查看下一场排期";
    $("#sessionStatus").textContent = "等待下一场集体冥想";
    $("#sessionAudio").hidden = true;
  }

  updateParticipantCount();
  setInterval(updateParticipantCount, 15000);
})();
