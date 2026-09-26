(() => {
  const title = document.getElementById("heroTitle");
  if (!title || !document.body.classList.contains("page-home")) return;
  // Clip the code texture to the actual DOM glyphs. A separately drawn canvas
  // cannot reliably match mobile fallback fonts, wrapping or custom title text.
  title.classList.add("has-code-title");
  let visible = true;
  let suspended = false;
  const syncMotion = () => title.classList.toggle("is-title-paused", !visible || document.hidden || suspended);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    }).observe(title);
  }
  document.addEventListener("visibilitychange", syncMotion);
  addEventListener("pagehide", () => { suspended = true; syncMotion(); });
  addEventListener("pageshow", () => { suspended = false; syncMotion(); });
  syncMotion();
})();
