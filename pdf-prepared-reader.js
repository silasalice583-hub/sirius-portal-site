// Prepared original-layout articles: no PDF worker, full-file fetch or canvas.
const controllers = new Map();
const near = node => {
  const rect = node.getBoundingClientRect();
  return rect.bottom >= -450 && rect.top <= innerHeight + 450;
};
const mobile = () => matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const localURL = (path, base) => {
  const url = new URL(path, base);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) throw new Error('阅读附件地址无效');
  return url.href;
};

export function disposeWithin(root) {
  for (const [element, controller] of controllers) {
    if (!element.isConnected || root === element || root?.contains?.(element)) {
      controller.abort.abort();
      controller.observer?.disconnect();
      controller.cleanup?.();
      controller.nodes.forEach(node => node.replaceChildren());
      controllers.delete(element);
    }
  }
}

export async function render(element) {
  if (controllers.has(element)) return;
  const c = { abort: new AbortController(), nodes: [], queue: [], active: 0, observer: null };
  controllers.set(element, c);
  const signal = c.abort.signal;
  element.classList.add('pdf-transparent-paper', 'pdf-prepared-document');
  element.dataset.pdfRendered = 'loading';
  element.querySelectorAll(':scope > .pdf-rendered-pages,:scope > .pdf-viewer-error').forEach(node => node.remove());
  const loading = element.querySelector(':scope > .pdf-loading');
  const trim = () => {
    const limit = mobile() ? 3 : 5;
    const ready = c.nodes.filter(node => node.dataset.renderState === 'ready');
    ready.sort((a, b) => Math.abs(b.getBoundingClientRect().top) - Math.abs(a.getBoundingClientRect().top));
    let count = ready.length;
    for (const node of ready) {
      const rect = node.getBoundingClientRect();
      if (count <= limit) break;
      if (rect.bottom < -innerHeight || rect.top > innerHeight * 2) {
        node.replaceChildren(); node.dataset.renderState = 'waiting'; count--;
      }
    }
  };
  try {
    const url = localURL(element.dataset.pdfPreviewSrc, document.baseURI);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`阅读附件暂不可用 (${response.status})`);
    const data = await response.json();
    if (data.version !== 1 || !data.transparent || !(data.width > 0) || !data.tiles?.length) throw new Error('阅读附件格式无效');
    if (signal.aborted || !element.isConnected) return;
    const pages = document.createElement('div'); pages.className = 'pdf-rendered-pages';
    element.append(pages);
    const paint = async (node, tile, index) => {
      const img = new Image(); img.alt = ''; img.draggable = false; img.decoding = 'async';
      img.className = 'pdf-prepared-image';
      img.width = data.width * (mobile() ? 2 : 4); img.height = Math.ceil(tile.height * (mobile() ? 2 : 4));
      img.fetchPriority = index === 0 ? 'high' : 'auto';
      const loaded = new Promise((resolve, reject) => {
        const abort = () => { img.removeAttribute('src'); reject(new DOMException('Aborted', 'AbortError')); };
        signal.addEventListener('abort', abort, { once: true });
        img.onload = () => { signal.removeEventListener('abort', abort); resolve(); };
        img.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error('图片载入失败')); };
      });
      img.src = localURL(mobile() ? tile.mobile : tile.src, url);
      await loaded;
      if (signal.aborted) return;
      const text = document.createElement('div'); text.className = 'pdf-prepared-text';
      for (const item of tile.text || []) {
        const span = document.createElement('span'); span.textContent = item.text;
        span.style.left = `${item.x / data.width * 100}%`;
        span.style.top = `${item.y / tile.height * 100}%`;
        span.style.fontSize = `${item.size / data.width * 100}cqw`;
        span.style.width = `${item.width / data.width * 100}%`;
        if (item.eol) span.append(document.createElement('br'));
        text.append(span);
      }
      const links = document.createElement('div'); links.className = 'pdf-prepared-links';
      for (const item of tile.links || []) {
        if (!/^https?:\/\//i.test(item.url)) continue;
        const a = document.createElement('a'); a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', `打开原文链接：${item.url}`);
        Object.assign(a.style, { left: `${item.x / data.width * 100}%`, top: `${item.y / tile.height * 100}%`,
          width: `${item.width / data.width * 100}%`, height: `${item.height / tile.height * 100}%` });
        links.append(a);
      }
      node.replaceChildren(img, text, links); node.dataset.renderState = 'ready';
      element.dataset.pdfRendered = 'done'; loading?.remove();
    };
    const pump = () => {
      if (signal.aborted) return;
      while (c.active < 2 && c.queue.length) {
        const index = c.queue.shift(), node = c.nodes[index];
        if (!near(node) && index !== 0) { node.dataset.renderState = 'waiting'; continue; }
        c.active++; node.dataset.renderState = 'loading';
        paint(node, data.tiles[index], index).catch(error => {
          if (signal.aborted) return;
          node.dataset.renderState = 'error';
          const button = document.createElement('button'); button.type = 'button'; button.className = 'pdf-page-retry';
          button.textContent = '这部分未能载入，点击重试'; button.onclick = () => enqueue(index);
          node.replaceChildren(button); loading?.remove();
          console.warn('文章阅读分片载入失败', error.message);
        }).finally(() => { c.active--; trim(); pump(); });
      }
    };
    const enqueue = index => {
      if (signal.aborted || !['waiting', 'error'].includes(c.nodes[index].dataset.renderState)) return;
      c.nodes[index].dataset.renderState = 'queued'; c.queue.push(index); pump();
    };
    data.tiles.forEach((tile, index) => {
      const node = document.createElement('div'); node.className = 'pdf-live-page pdf-prepared-tile';
      node.style.aspectRatio = `${data.width} / ${tile.height}`;
      node.dataset.renderState = 'waiting'; node.dataset.tileIndex = index;
      node.setAttribute('role', 'group'); node.setAttribute('aria-label', `原文连续阅读，第 ${index + 1} 段`);
      pages.append(node); c.nodes.push(node);
    });
    if (typeof IntersectionObserver === 'function') {
      c.observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) enqueue(Number(entry.target.dataset.tileIndex));
        trim();
      }, { rootMargin: '450px 0px' });
      c.nodes.forEach(node => c.observer.observe(node));
    } else {
      let frame;
      const check = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { c.nodes.forEach((node, index) => { if (near(node)) enqueue(index); }); trim(); });
      };
      window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
      c.cleanup = () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
      check();
    }
    enqueue(0);
  } catch (error) {
    if (signal.aborted) return;
    disposeWithin(element);
    const box = document.createElement('p'); box.className = 'pdf-viewer-error';
    box.textContent = '高清阅读附件暂未载入，可重试或使用下方的原始 PDF 链接。';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新载入';
    retry.onclick = () => render(element); box.append(retry); element.append(box);
    loading?.remove(); element.dataset.pdfRendered = 'error';
    console.warn('文章阅读附件载入失败', error.message);
  }
}
