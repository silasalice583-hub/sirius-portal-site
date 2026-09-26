(() => {
  "use strict";

  const body = document.body;
  const isMobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const photograph = (name) => `assets/space/${name}${isMobile ? "-mobile" : ""}.webp`;
  const scenePairs = {
    "全部": ["sirius-sky", "milky-way-mountains", "milky-way-panorama", "milky-way-nevada", "milky-way-spitzer", "milky-way-center"],
    "门户更新": ["pleiades-cluster"],
    "会议": ["milky-way-center", "milky-way-panorama"],
    "访谈": ["medusa-nebula"],
    "重要冥想": ["earth", "sirius-sky"],
    "文章更新": ["pillars-hd"],
    "相关资料": ["andromeda-m31"],
  };

  if (body.matches(".page-home, .page-articles, .page-meditation, .page-about")) {
    const backdrop = document.createElement("div");
    backdrop.className = body.classList.contains("page-home") ? "cosmic-backdrop home-cosmos" : "cosmic-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.className = "cosmic-photo is-visible";
    second.className = "cosmic-photo";
    backdrop.append(first, second);
    body.prepend(backdrop);
    const layers = [first, second];
    let activeLayer = 0;
    let activePair = [];
    let photoIndex = 0;
    let sceneRevision = 0;
    let photoRequest = 0;
    let sceneKey = "";
    const showPhoto = (name, revision, priority = "auto") => {
      const request = ++photoRequest;
      const nextPhoto = photograph(name);
      const preload = new Image();
      preload.decoding = "async";
      preload.fetchPriority = backdrop.dataset.scene ? priority : "high";
      const reveal = () => {
        if (revision !== sceneRevision || request !== photoRequest) return;
        const incoming = 1 - activeLayer;
        // First paint should be immediate; only later slides crossfade.
        layers.forEach((layer) => { layer.style.transition = backdrop.dataset.scene ? "" : "none"; });
        layers[incoming].dataset.scene = name;
        layers[incoming].style.backgroundImage = `url("${nextPhoto}")`;
        layers[incoming].classList.add("is-visible");
        layers[activeLayer].classList.remove("is-visible");
        activeLayer = incoming;
        backdrop.dataset.scene = name;
      };
      // Decode before crossfading, but never let an older decode win a race.
      preload.onload = () => {
        if (typeof preload.decode === "function") preload.decode().then(reveal, reveal);
        else reveal();
      };
      preload.src = nextPhoto;
    };

    const setScene = () => {
      const nextKey = body.dataset.categoryTheme || "全部";
      if (sceneKey === nextKey) return;
      sceneKey = nextKey;
      sceneRevision += 1;
      activePair = body.classList.contains("page-home") ? ["earth", "sirius-artwork"] : body.classList.contains("page-articles")
        ? scenePairs[body.dataset.categoryTheme] || scenePairs["全部"]
        : body.classList.contains("page-about") ? ["notre-dame-paris"]
          : ["sirius-sky", "andromeda-m31", "milky-way-mountains", "milky-way-nevada", "milky-way-spitzer", "milky-way-panorama"];
      photoIndex = 0;
      showPhoto(activePair[0], sceneRevision);
    };
    setScene();
    if (body.classList.contains("page-articles")) {
      new MutationObserver(setScene).observe(body, { attributes: true, attributeFilter: ["data-category-theme"] });
    }
    if (!reducedMotion) {
      setInterval(() => {
        if (document.hidden || activePair.length < 2 || document.querySelector("#reader:not([hidden])")) return;
        photoIndex = (photoIndex + 1) % activePair.length;
        showPhoto(activePair[photoIndex], sceneRevision, "low");
      }, 16000);
    }
  }

  // A dense phosphor-green 0/1 curtain with independently advancing columns.
  // It renders at a restrained frame rate so the 4K photographs remain responsive.
  function runBinaryRain(canvas, { fps, spacing, opacity, fluid = false }) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return () => {};
    let frame = 0;
    let timer = 0;
    let suspended = false;
    let disposed = false;
    let columns = [];
    let width = 0;
    let height = 0;
    const lineHeight = isMobile ? 17 : 18;
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      const scale = Math.min(devicePixelRatio || 1, isMobile ? 1.3 : 1.8);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      columns = Array.from({ length: Math.ceil(width / spacing) }, (_, index) => ({
        x: index * spacing + spacing * .5,
        depth: height * (.16 + Math.random() * .82),
        speed: .4 + Math.random() * 1.25,
        brightness: .72 + Math.random() * .28,
        phase: Math.floor(Math.random() * 31),
      }));
    };
    const schedule = () => {
      if (disposed || suspended || document.hidden) return;
      timer = setTimeout(() => { frame = requestAnimationFrame(draw); }, 1000 / fps);
    };
    const draw = (time) => {
      frame = 0;
      if (disposed || suspended || document.hidden) return;
      context.clearRect(0, 0, width, height);
      context.font = `italic ${isMobile ? 13 : 15}px Consolas, "Courier New", monospace`;
      context.textAlign = "center";
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index];
        column.depth += column.speed;
        if (column.depth > height * 1.16) {
          column.depth = height * (.12 + Math.random() * .25);
          column.speed = .8 + Math.random() * 1.8;
        }
        for (let row = 0; row * lineHeight <= Math.min(height, column.depth); row += 1) {
          const y = row * lineHeight + 14;
          const fading = 1 - (y / Math.max(height, column.depth)) * .62;
          const head = column.depth - y < lineHeight * 1.5;
          const alpha = Math.min(1, opacity * column.brightness * fading * (head ? 1.08 : .86));
          const digit = (index * 17 + row * 29 + column.phase + Math.floor(time / (isMobile ? 480 : 240))) % 11 < 5 ? "1" : "0";
          context.fillStyle = fluid
            ? (head ? `rgba(0, 175, 103, ${alpha})` : `rgba(0, 117, 68, ${alpha})`)
            : (head ? `rgba(100, 255, 118, ${alpha})` : `rgba(32, 236, 58, ${alpha})`);
          context.shadowColor = fluid ? "#31f394" : (head ? "#55ff73" : "#10d232");
          context.shadowBlur = isMobile ? 0 : head ? 9 : 3;
          const flowX = fluid ? Math.sin(y / 75 + time / 1250 + index / 6) * 9 : 0;
          context.fillText(digit, column.x + flowX, y);
        }
      }
      context.shadowBlur = 0;
      schedule();
    };
    const pause = () => { clearTimeout(timer); cancelAnimationFrame(frame); frame = 0; };
    const resume = () => { pause(); schedule(); };
    const hide = () => { suspended = true; pause(); };
    const show = () => { suspended = false; resume(); };
    resize();
    // ResizeObserver ignores mobile browser-chrome scroll/resize noise.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    else addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", resume);
    addEventListener("pagehide", hide);
    addEventListener("pageshow", show);
    schedule();
    return () => {
      disposed = true;
      pause();
      observer?.disconnect();
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      removeEventListener("pagehide", hide);
      removeEventListener("pageshow", show);
      context.clearRect(0, 0, width, height);
    };
  }

  if (!reducedMotion) {
    const transition = document.createElement("div");
    transition.className = "matrix-transition";
    transition.setAttribute("aria-hidden", "true");
    transition.innerHTML = `<canvas class="matrix-rain-canvas"></canvas><div class="matrix-scanline"></div><div class="matrix-window"><div class="matrix-titlebar"><span class="matrix-title">✧ Sirius Portal</span><span class="matrix-controls"><span>−</span><span>□</span><span>×</span></span></div><div class="matrix-window-body"><span class="matrix-window-icon">✧</span><div><strong>星际信号已连接</strong><p>SIGNAL CONNECTED · 正在开启旅程</p></div></div><div class="matrix-progress"><span></span></div></div>`;
    body.append(transition);
    let stopTransitionRain = null;
    let transitionTimer = null;
    const playTransition = (duration) => {
      clearTimeout(transitionTimer);
      transition.classList.add("is-active");
      stopTransitionRain?.();
      stopTransitionRain = runBinaryRain(transition.querySelector("canvas"), { fps: isMobile ? 17 : 24, spacing: isMobile ? 17 : 18, opacity: .93 });
      transitionTimer = setTimeout(() => {
        transition.classList.remove("is-active");
        setTimeout(() => { stopTransitionRain?.(); stopTransitionRain = null; }, 280);
      }, duration);
    };
    // Do not cover every first paint with an artificial loading screen.
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || link.target || link.hasAttribute("download") || link.closest(".pdf-document")) return;
      const destination = new URL(link.href, location.href);
      if (destination.origin !== location.origin || destination.pathname === location.pathname) return;
      event.preventDefault();
      playTransition(520);
      setTimeout(() => { location.href = destination.href; }, isMobile ? 80 : 140);
    });
    const homeHero = document.querySelector(".page-home .home-hero");
    if (homeHero) {
      const codeLayer = document.createElement("canvas");
      codeLayer.className = "home-code-rain";
      codeLayer.setAttribute("aria-hidden", "true");
      body.append(codeLayer);
      let stopHomeRain = null;
      const observeHero = ([entry]) => {
        if (entry.isIntersecting && !stopHomeRain) {
          stopHomeRain = runBinaryRain(codeLayer, { fps: isMobile ? 6 : 11, spacing: isMobile ? 32 : 20, opacity: isMobile ? .36 : .68, fluid: true });
        } else if (!entry.isIntersecting && stopHomeRain) {
          stopHomeRain();
          stopHomeRain = null;
        }
      };
      if ("IntersectionObserver" in window) new IntersectionObserver(observeHero).observe(homeHero);
      else observeHero([{ isIntersecting: true }]);
    }
  }

  if (!isMobile && !reducedMotion) {
    const pen = document.createElement("div");
    pen.className = "cosmic-pen";
    pen.setAttribute("aria-hidden", "true");
    pen.innerHTML = `<img src="assets/icons/iris-pen-illustration.webp" width="36" height="54" alt="" decoding="async">`;
    body.append(pen);
    body.classList.add("cosmic-pointer");
    let lastSpark = 0;
    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      // The pen's upper nib, not its lower ornament, is the actual click point.
      pen.style.transform = `translate(${event.clientX - 4}px, ${event.clientY - 4}px)`;
      pen.classList.add("is-visible");
      const now = performance.now();
      if (now - lastSpark < 65) return;
      lastSpark = now;
      const spark = document.createElement("span");
      spark.className = "cosmic-spark";
      spark.style.left = `${event.clientX}px`;
      spark.style.top = `${event.clientY}px`;
      body.append(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }, { passive: true });
    document.addEventListener("pointerleave", () => pen.classList.remove("is-visible"));
  }

  if (!reducedMotion) {
    const symbols = [
      "click-iris-illustration.webp", "click-lion-illustration.webp", "click-dolphin-illustration.webp", "click-star-illustration.webp",
    ];
    let symbolIndex = 0;
    symbols.forEach((name) => { const preload = new Image(); preload.src = `assets/icons/${name}`; });
    document.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("input, textarea, select, [contenteditable], .pdf-text-layer")) return;
      if (document.querySelectorAll(".cosmic-click-symbol").length >= 6) return;
      const symbol = document.createElement("span");
      symbol.className = "cosmic-click-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.style.left = `${event.clientX}px`;
      symbol.style.top = `${event.clientY}px`;
      symbol.innerHTML = `<img src="assets/icons/${symbols[symbolIndex++ % symbols.length]}" width="24" height="24" alt="" decoding="async">`;
      body.append(symbol);
      symbol.addEventListener("animationend", () => symbol.remove(), { once: true });
    }, { passive: true });
  }

  // Delegation also covers article images inserted after loading or pagination.
  // Keep image clicks and all text-selection/context-menu behaviour intact.
  document.addEventListener("dragstart", (event) => {
    if (event.target.closest?.("img")) event.preventDefault();
  });

  const navPaths = {
    "index.html": '<path d="M12 2.5 22 12l-10 9.5L2 12Z"/><circle cx="12" cy="12" r="5"/><path d="M12 5v14M5 12h14"/>',
    "articles.html": '<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0Z M12 6v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',
    "meditation.html": '<path d="M12 3c5 5 5 10 0 15-5-5-5-10 0-15Z M12 18C5 18 2 13 2 8c6 0 10 4 10 10Zm0 0c7 0 10-5 10-10-6 0-10 4-10 10Z M4 21h16"/>',
    "about.html": '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="12" r="4.5"/><circle cx="15" cy="12" r="4.5"/><circle cx="12" cy="8" r="4.5"/><circle cx="12" cy="16" r="4.5"/>',
  };
  document.querySelectorAll(".top-nav a").forEach((link) => {
    const path = navPaths[link.getAttribute("href")];
    if (path) link.insertAdjacentHTML("afterbegin", `<svg class="celestial-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">${path}</svg>`);
  });
  document.querySelectorAll(".category-joystick, .hot-arrow").forEach((button) => {
    button.classList.add("celestial-arrow");
    if (/prev/i.test(button.id) || button.classList.contains("prev")) button.classList.add("is-prev");
    button.innerHTML = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="19" stroke="currentColor" stroke-width=".6" stroke-dasharray="26 5 2 5"/><path d="M22 15 31 24 22 33M12 24h19" stroke="currentColor" stroke-width="1.5"/><path d="m37 5 1.8 4.2L43 11l-4.2 1.8L37 17l-1.8-4.2L31 11l4.2-1.8Z" fill="currentColor"/></svg>';
  });
})();
