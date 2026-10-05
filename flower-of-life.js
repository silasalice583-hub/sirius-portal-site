/* Exact equal-radius hexagonal geometry, built once; motion is handled by CSS. */
(() => {
  "use strict";
  const supplied = document.querySelector(".supplied-flower");
  if (supplied) {
    const pause = () => supplied.closest(".flower-of-life-stage").classList.toggle("is-paused", document.hidden);
    document.addEventListener("visibilitychange", pause);
    pause();
    return;
  }
  const svg = document.querySelector("[data-flower-of-life]");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  const radius = 90;
  const points = [];
  const petalLayer = svg.querySelector(".life-petals");
  const lineLayer = svg.querySelector(".life-lattice");
  const lightLayer = svg.querySelector(".life-light-paths");
  const create = (tag, attrs) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
  };
  // Axial coordinates: q + s + t = 0. The first two rings contain 1 + 6 + 12 = 19 circles.
  // The third ring supplies only the continuation arcs at the clipped disk's edge.
  for (let q = -3; q <= 3; q += 1) {
    for (let s = -3; s <= 3; s += 1) {
      const ring = Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s));
      if (ring > 3) continue;
      const x = radius * (q + s / 2);
      const y = radius * Math.sqrt(3) * s / 2;
      points.push({ x, y, ring });
      const circle = create("circle", {
        cx: x, cy: y, r: radius,
        "data-life-circle": ring <= 2 ? "core" : "edge",
      });
      lineLayer.append(circle);
      if (ring <= 2) {
        const light = create("circle", { cx: x, cy: y, r: radius, pathLength: 1000 });
        light.style.setProperty("--life-delay", `${-(q * 3 + s * 5 + 19)}s`);
        lightLayer.append(light);
      }
    }
  }
  // Circle centers sqrt(3) radii apart create the narrow, one-radius-long petals.
  // Each petal is bounded by two exact 60-degree arcs from the underlying circles.
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const first = points[a];
      const second = points[b];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(distance - radius * Math.sqrt(3)) > .001) continue;
      const middleX = (first.x + second.x) / 2;
      const middleY = (first.y + second.y) / 2;
      const height = Math.sqrt(radius * radius - distance * distance / 4);
      const crossX = -dy / distance * height;
      const crossY = dx / distance * height;
      const x1 = middleX + crossX;
      const y1 = middleY + crossY;
      const x2 = middleX - crossX;
      const y2 = middleY - crossY;
      petalLayer.append(create("path", {
        d: `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} A ${radius} ${radius} 0 0 1 ${x1} ${y1} Z`,
      }));
    }
  }
  // Hidden documents stop all compositing work; the reduced-motion CSS remains the primary preference.
  const updateVisibility = () => {
    svg.closest(".flower-of-life-stage").classList.toggle("is-paused", document.hidden);
  };
  document.addEventListener("visibilitychange", updateVisibility);
  updateVisibility();
})();
