(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const liveFonts = new Map();
  let fontObserver;

  function retainFonts(owner, fonts) {
    const retained = owner._pdfVectorFonts ||= new Set();
    for (const font of fonts) retained.add(font);
    liveFonts.set(owner, retained);
    if (!fontObserver) {
      fontObserver = new MutationObserver(() => {
        for (const [element, faces] of liveFonts) {
          if (element.isConnected) continue;
          for (const face of faces) document.fonts.delete(face);
          liveFonts.delete(element);
        }
      });
      fontObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // Record the actual glyphs, embedded font, colour and matrices used by PDF.js.
  // Using the selection layer's approximate Unicode metrics would change layout.
  function capture(context, scale) {
    const originals = { fillText: context.fillText, strokeText: context.strokeText };
    const calls = [];
    let replay = false;
    let cursor = 0;
    for (const method of Object.keys(originals)) {
      context[method] = function (text, x, y, maxWidth) {
        const index = cursor++;
        if (replay) {
          if (calls[index]?.vector) return;
          return originals[method].apply(this, arguments);
        }
        const color = method === "fillText" ? this.fillStyle : this.strokeStyle;
        const transform = this.getTransform();
        const matrix = [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f].map((v) => v / scale);
        const metrics = this.measureText(text);
        const call = {
          text, x, y, method, matrix, font: this.font, color,
          width: metrics.width, lineWidth: this.lineWidth,
          vector: typeof color === "string" && this.globalAlpha === 1
            && this.globalCompositeOperation === "source-over"
            && (!this.filter || this.filter === "none")
            && this.textBaseline === "alphabetic" && maxWidth === undefined,
        };
        calls.push(call);
        return originals[method].apply(this, arguments);
      };
    }
    return {
      calls,
      replay() { replay = true; cursor = 0; },
      restore() { Object.assign(context, originals); },
    };
  }

  function makeLayer(captureResult, viewport, footerRects, owner) {
    const svg = document.createElementNS(NS, "svg");
    svg.classList.add("pdf-vector-text");
    svg.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
    svg.setAttribute("width", viewport.width);
    svg.setAttribute("height", viewport.height);
    svg.setAttribute("aria-hidden", "true");
    const fonts = new Set();
    let batch = null;
    let count = 0;
    for (const call of captureResult.calls) {
      if (!call.vector) continue;
      const [a, b, c, d, e, f] = call.matrix;
      const baseline = { x: a * call.x + c * call.y + e, y: b * call.x + d * call.y + f };
      if (footerRects.some((r) => baseline.x >= r.left && baseline.x <= r.right
        && baseline.y >= r.top && baseline.y <= r.bottom)) continue;
      for (const face of document.fonts) {
        if (call.font.includes(face.family.replace(/^['"]|['"]$/g, ""))) fonts.add(face);
      }
      const key = JSON.stringify([call.matrix, call.font, call.color, call.method, call.lineWidth, call.y]);
      const single = [...call.text].length === 1;
      if (!batch || batch.key !== key || !single || batch.length >= 100) {
        const text = document.createElementNS(NS, "text");
        text.setAttribute("transform", `matrix(${call.matrix.join(" ")})`);
        text.style.font = call.font;
        text.style.fontKerning = "none";
        text.style.fontVariantLigatures = "none";
        text.style.whiteSpace = "pre";
        text.setAttribute("fill", call.method === "fillText" ? call.color : "none");
        if (call.method === "strokeText") {
          text.setAttribute("stroke", call.color);
          text.setAttribute("stroke-width", call.lineWidth);
        }
        text.setAttribute("y", call.y);
        svg.append(text);
        batch = { key, text, xs: [], length: 0 };
      }
      batch.xs.push(call.x);
      batch.text.setAttribute("x", batch.xs.join(" "));
      batch.text.textContent += call.text;
      batch.length += [...call.text].length;
      count += [...call.text].length;
      if (!single) batch = null;
    }
    retainFonts(owner, fonts);
    svg.dataset.glyphCount = String(count);
    return count ? svg : null;
  }

  function restoreFonts(owner) {
    if (owner.isConnected) for (const face of owner._pdfVectorFonts || []) document.fonts.add(face);
  }

  window.SiriusPdfVectorText = { capture, makeLayer, restoreFonts };
})();
