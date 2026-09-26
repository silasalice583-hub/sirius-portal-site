(() => {
  const title = document.getElementById("heroTitle");
  if (!title || !document.body.classList.contains("page-home")) return;
  const canvas = document.createElement("canvas");
  canvas.className = "fluid-title-canvas";
  canvas.setAttribute("aria-hidden", "true");
  title.after(canvas);
  const mask = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const ink = mask.getContext("2d");
  if (!ctx || !ink) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0, height = 0, frame = 0, last = 0;
  function resize() {
    const box = title.getBoundingClientRect();
    const parent = title.parentElement.getBoundingClientRect();
    const style = getComputedStyle(title);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = box.width; height = box.height;
    canvas.style.left = `${box.left - parent.left}px`;
    canvas.style.top = `${box.top - parent.top}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.width = mask.width = Math.ceil(width * dpr);
    canvas.height = mask.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink.clearRect(0, 0, width, height);
    ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ink.textBaseline = "middle";
    const chars = [...title.textContent.trim()];
    const gap = parseFloat(style.letterSpacing) || 0;
    const total = chars.reduce((sum, c) => sum + ink.measureText(c).width, 0) + gap * Math.max(0, chars.length - 1);
    let x = (width - total) / 2;
    for (const c of chars) { ink.fillText(c, x, height / 2); x += ink.measureText(c).width + gap; }
    draw(0);
  }
  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "bold 10px Consolas, monospace";
    for (let x = 0; x < width; x += 9) {
      const shift = reduced ? 0 : (time / 45 + x * .6) % 13;
      for (let y = -13; y < height; y += 13) {
        ctx.fillStyle = (x + y + Math.floor(time / 140)) % 4 ? "#35ffc2" : "#e6fff1";
        ctx.fillText((Math.floor(x / 9) + y + Math.floor(time / 170)) % 3 ? "1" : "0", x, y + shift);
      }
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }
  function animate(time) {
    frame = requestAnimationFrame(animate);
    if (document.hidden || title.getBoundingClientRect().bottom < 0 || time - last < 70) return;
    last = time; draw(time);
  }
  resize();
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(title);
  else addEventListener("resize", resize, { passive: true });
  new MutationObserver(resize).observe(title, { childList: true, characterData: true, subtree: true });
  if (!reduced) frame = requestAnimationFrame(animate);
  addEventListener("pagehide", () => cancelAnimationFrame(frame));
})();
