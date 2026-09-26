const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const ui = read('cosmic-ui.js');
const app = read('app.js');
const css = read('interaction-refinement.css');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    listeners,
  };
}
function clock() {
  let id = 0;
  const jobs = new Map();
  return { jobs, add(fn) { jobs.set(++id, fn); return id; }, remove(key) { jobs.delete(key); },
    tick(time = 1000) { const batch = [...jobs.values()]; jobs.clear(); batch.forEach((fn) => fn(time)); } };
}

test('title texture uses the real text and pauses offscreen, hidden and across history navigation', () => {
  const classes = new Set();
  const title = { textContent: '天狼星门户', classList: {
    add(v) { classes.add(v); }, toggle(v, on) { on ? classes.add(v) : classes.delete(v); },
  } };
  const document = { ...eventTarget(), hidden: false, getElementById: () => title, body: { classList: { contains: () => true } } };
  const events = eventTarget();
  let intersect;
  vm.runInNewContext(read('home-title.js'), {
    document, window: { IntersectionObserver: true }, addEventListener: events.addEventListener,
    IntersectionObserver: class { constructor(fn) { intersect = fn; } observe(node) { assert.equal(node, title); } },
  });
  assert.ok(classes.has('has-code-title'));
  assert.ok(!classes.has('is-title-paused'));
  intersect([{ isIntersecting: false }]);
  assert.ok(classes.has('is-title-paused'));
  intersect([{ isIntersecting: true }]);
  document.hidden = true; document.emit('visibilitychange');
  assert.ok(classes.has('is-title-paused'));
  document.hidden = false; document.emit('visibilitychange');
  assert.ok(!classes.has('is-title-paused'));
  events.emit('pagehide'); assert.ok(classes.has('is-title-paused'));
  events.emit('pageshow'); assert.ok(!classes.has('is-title-paused'));
  assert.equal(title.textContent, '天狼星门户');
  assert.doesNotMatch(read('home-title.js'), /requestAnimationFrame|getBoundingClientRect|fillText/);
  assert.match(css, /background-clip: text/);
  assert.match(css, /animation: titleCodeFlow 6\.5s linear infinite/);
  assert.match(css, /prefers-reduced-motion:reduce[^}]+has-code-title \{ animation: none/s);
});

test('rain wakes only at its requested cadence and releases timers/listeners when stopped', () => {
  const timers = clock(), frames = clock(), events = eventTarget();
  const document = { ...eventTarget(), hidden: false };
  let measurements = 0, glyphs = 0, disconnected = false;
  const context = { setTransform() {}, clearRect() {}, fillText() { glyphs++; } };
  const canvas = { getContext: () => context, getBoundingClientRect: () => { measurements++; return { width: 390, height: 844 }; } };
  const source = ui.slice(ui.indexOf('  function runBinaryRain('), ui.indexOf('\n  if (!reducedMotion)'));
  const scope = { document, isMobile: true, devicePixelRatio: 3,
    setTimeout: timers.add, clearTimeout: timers.remove,
    requestAnimationFrame: frames.add, cancelAnimationFrame: frames.remove,
    addEventListener: events.addEventListener, removeEventListener: events.removeEventListener,
    ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
  };
  vm.createContext(scope); vm.runInContext(source, scope);
  const stop = scope.runBinaryRain(canvas, { fps: 12, spacing: 19, opacity: .68, fluid: true });
  assert.ok(glyphs > 0, 'the first frame must not wait for a timer');
  assert.equal(timers.jobs.size, 1); assert.equal(frames.jobs.size, 0);
  timers.tick(); assert.equal(frames.jobs.size, 1);
  frames.tick(); assert.ok(glyphs > 0); assert.equal(timers.jobs.size, 1);
  assert.equal(measurements, 1, 'animation frames do not read layout');
  assert.ok(canvas.width <= 390 * 1.3 + 1);
  document.hidden = true; document.emit('visibilitychange');
  assert.equal(timers.jobs.size + frames.jobs.size, 0);
  document.hidden = false; document.emit('visibilitychange'); assert.equal(timers.jobs.size, 1);
  events.emit('pagehide'); assert.equal(timers.jobs.size, 0);
  events.emit('pageshow'); assert.equal(timers.jobs.size, 1);
  stop(); assert.equal(timers.jobs.size + frames.jobs.size, 0);
  assert.equal(document.listeners.size, 0); assert.equal(events.listeners.size, 0);
  assert.ok(disconnected);
  assert.match(ui, /IntersectionObserver\(observeHero\)\.observe\(homeHero\)/);
  assert.match(ui, /playTransition\(660\)/);
});

test('dynamic images cannot drag while ordinary text and linked image clicks stay available', () => {
  const document = eventTarget();
  const start = ui.indexOf('  // Delegation also covers');
  vm.runInNewContext(ui.slice(start, ui.indexOf('  const navPaths')), { document });
  let prevented = 0;
  document.emit('dragstart', { target: { closest: () => ({ tagName: 'IMG' }) }, preventDefault() { prevented++; } });
  document.emit('dragstart', { target: { closest: () => null }, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.deepEqual([...document.listeners.keys()], ['dragstart']);
  assert.match(css, /img \{[^}]*user-select: none;[^}]*-webkit-touch-callout: none/);
  assert.doesNotMatch(css, /(?:body|\*)\s*\{[^}]*user-select: none/);
  assert.match(css, /@media\(pointer:coarse\)[^}]*min-height: 44px; min-width: 44px/s);
});

test('default hero uses the compact original artwork while custom logos remain untouched', () => {
  const source = app.slice(app.indexOf('    const setResponsiveImage ='), app.indexOf('    document.querySelectorAll("[data-site-logo]")'));
  const scope = {};
  vm.createContext(scope); vm.runInContext(source + '\nglobalThis.setImage = setResponsiveImage;', scope);
  const image = { id: 'heroLogoImage', removeAttribute(key) { delete this[key]; } };
  scope.setImage(image, 'original.png', 'original.png', 'compact.webp', '340px', 640, 2048);
  assert.equal(image.src, 'compact.webp'); assert.equal(image.srcset, undefined);
  scope.setImage(image, 'custom.png', 'original.png', 'compact.webp', '340px', 640, 2048);
  assert.equal(image.src, 'custom.png');
  assert.match(read('index.html'), /id="heroLogoImage" src="assets\/mobile\/logo-original.webp" width="640" height="640"[^>]*fetchpriority="high"/);
});

test('first backgrounds preload by device, scripts defer in order, only article pages download the archive', () => {
  for (const page of ['index.html', 'about.html', 'articles.html', 'meditation.html', 'collective-meditation.html']) {
    const html = read(page);
    assert.equal([...html.matchAll(/rel="preload" as="image"/g)].length, 2);
    const scripts = [...html.matchAll(/<script([^>]+)src="([^"]+)"/g)];
    assert.ok(scripts.every((m) => /\bdefer\b/.test(m[1])), page);
    assert.ok(scripts[0][2].startsWith('cosmic-ui.js'), page);
    assert.ok(html.indexOf('config.js') < html.indexOf('api-client.js'));
    assert.ok(html.indexOf('api-client.js') < html.indexOf('app.js'));
    assert.equal(html.includes('articles-data.js'), ['articles.html', 'meditation.html'].includes(page));
  }
});

function carousel() {
  const timers = clock(), classes = new Set(), captures = new Set();
  const list = { ...eventTarget(), scrollLeft: 0, clientWidth: 300, scrollWidth: 900,
    classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) },
    getBoundingClientRect: () => ({ left: 0, width: 300 }),
    setPointerCapture: (id) => captures.add(id), hasPointerCapture: (id) => captures.has(id), releasePointerCapture: (id) => captures.delete(id),
  };
  list.children = ['全部','访谈','会议'].map((category, index) => ({ dataset: { category }, getBoundingClientRect: () => ({ left: index * 300 - list.scrollLeft, width: 300 }) }));
  let renders = 0;
  const scope = { categoryList: list, categoryScrollTimer: 0, categoryProgrammaticUntil: 0, currentCategory: '全部', currentPage: 7,
    performance: { now: () => 1000 }, setTimeout: timers.add, clearTimeout: timers.remove,
    renderCategories() {}, renderGrid() { renders++; },
  };
  const start = app.indexOf('      let drag = null;');
  const end = app.indexOf('\n    }\n    categoryList.querySelectorAll', start);
  vm.createContext(scope); vm.runInContext(app.slice(start, end), scope);
  return { list, scope, timers, classes, captures, renders: () => renders };
}

test('mouse carousel waits for release, suppresses accidental clicks and resets lost capture', () => {
  const c = carousel();
  c.list.emit('pointerdown', { pointerType: 'mouse', button: 0, clientX: 200, pointerId: 1 });
  c.list.emit('pointermove', { clientX: -100, pointerId: 1 });
  c.list.emit('scroll'); c.timers.tick();
  assert.equal(c.renders(), 0, 'do not change category under a held drag');
  c.list.emit('pointerup'); c.timers.tick();
  assert.equal(c.scope.currentCategory, '访谈'); assert.equal(c.scope.currentPage, 1);
  assert.equal(c.captures.size, 0); assert.equal(c.classes.size, 0);
  let blocked = false;
  c.list.emit('click', { preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
  assert.ok(blocked);
  c.list.emit('pointerdown', { pointerType: 'mouse', button: 0, clientX: 0, pointerId: 2 });
  c.list.emit('pointermove', { clientX: -20, pointerId: 2 });
  c.list.emit('lostpointercapture'); assert.equal(c.classes.size, 0);
});

test('touch carousel keeps native scrolling; wheel releases at the edges and accepts page deltas', () => {
  const c = carousel();
  c.list.emit('pointerdown', { pointerType: 'touch', button: 0, clientX: 10, pointerId: 1 });
  c.list.emit('pointermove', { clientX: -50, pointerId: 1 });
  assert.equal(c.list.scrollLeft, 0, 'no JS interception of touch');
  let blocked = 0;
  c.list.emit('wheel', { deltaY: -10, deltaX: 0, deltaMode: 0, preventDefault() { blocked++; } });
  assert.equal(blocked, 0, 'vertical page scrolling works at the start edge');
  c.list.emit('wheel', { deltaY: 1, deltaX: 0, deltaMode: 2, preventDefault() { blocked++; } });
  assert.equal(c.list.scrollLeft, 300); assert.equal(blocked, 1);
  c.list.scrollLeft = 600; c.list.emit('scroll'); c.timers.tick();
  assert.equal(c.scope.currentCategory, '会议');
  c.list.emit('wheel', { deltaY: 10, deltaX: 0, deltaMode: 0, preventDefault() { blocked++; } });
  assert.equal(blocked, 1, 'vertical page scrolling works at the end edge');
});

test('search batches typing and leaves Chinese IME composition uninterrupted', () => {
  const input = eventTarget(), timers = clock(); let renders = 0;
  const source = app.slice(app.indexOf('    let searchTimer;'), app.indexOf('    $("#sortSelect")?.addEventListener'));
  const scope = { $: () => input, currentQuery: '', currentPage: 7, setTimeout: timers.add, clearTimeout: timers.remove, renderGrid: () => renders++ };
  vm.createContext(scope); vm.runInContext(source, scope);
  input.emit('input', { isComposing: true, target: { value: 'tian' } });
  assert.equal(timers.jobs.size, 0);
  input.emit('input', { target: { value: '天' } });
  input.emit('input', { target: { value: '天狼星' } });
  assert.equal(timers.jobs.size, 1); assert.equal(renders, 0);
  timers.tick(); assert.equal(renders, 1); assert.equal(scope.currentQuery, '天狼星'); assert.equal(scope.currentPage, 1);
});

test('parallel page controllers share an in-flight state fetch but later visits always get fresh posts', async () => {
  const api = read('api-client.js');
  const source = api.slice(api.indexOf('  let pendingStateRequest'), api.indexOf('  async function loadVersion'));
  const requests = [];
  const scope = { hasApi: () => true, cleanState: (value) => value, canUseLocalFallback: () => false,
    console: { warn() {} }, request: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  };
  vm.createContext(scope); vm.runInContext(source, scope);
  const first = scope.loadState(), second = scope.loadState();
  assert.equal(requests.length, 1);
  requests[0].resolve({ revision: 1, articles: [{ id: 'a' }] });
  assert.equal((await first).revision, 1); assert.equal((await second).revision, 1);
  const third = scope.loadState(); assert.equal(requests.length, 2);
  requests[1].resolve({ revision: 2, articles: [{ id: 'b' }] });
  assert.equal((await third).articles[0].id, 'b');
  const failed = scope.loadState(); requests[2].reject(new Error('offline'));
  assert.equal((await failed).source, 'api-error');
  const retried = scope.loadState(); assert.equal(requests.length, 4);
  requests[3].resolve({ revision: 3 }); assert.equal((await retried).revision, 3);
});

test('mobile code effects override the legacy important motion reset only without reduced motion', () => {
  const legacy = read('styles.css');
  assert.match(legacy, /@media \(prefers-reduced-motion: reduce\), \(max-width: 760px\)[\s\S]*?animation-duration: \.001ms !important/);
  const exceptions = css.slice(css.indexOf('@media(max-width:760px) and (prefers-reduced-motion:no-preference)'), css.indexOf('@media(pointer:coarse)'));
  assert.match(exceptions, /h1\.has-code-title \{ animation-duration: 6\.5s !important; animation-iteration-count: infinite !important/);
  assert.match(exceptions, /\.matrix-transition \{ transition-duration: \.18s !important/);
  assert.match(exceptions, /\.matrix-progress span \{ animation-duration: \.65s !important/);
  const phone = css.slice(css.indexOf('@media(max-width:760px)'), css.indexOf('/* styles.css suppresses'));
  assert.match(phone, /\.home-code-rain \{ opacity: \.72; mask-image: none; -webkit-mask-image: none/);
  assert.doesNotMatch(phone, /opacity: \.32|animation-duration: 26s/);
  // Original title translated at time / 45: approximately 22 CSS pixels/s.
  assert.ok(Math.abs(144 / 6.5 - 1000 / 45) < .1);
});

function motionPage(reducedMotion = false) {
  const frames = clock(), events = eventTarget(), timers = new Map(), rains = [], nodes = [];
  let nextTimer = 0, intersect;
  const hero = {};
  const element = () => {
    const classes = new Set();
    return { classes, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
      setAttribute() {}, querySelector: () => ({}),
    };
  };
  const document = { ...eventTarget(), createElement: element, querySelector: () => hero };
  const location = { href: 'https://example.test/index.html', origin: 'https://example.test', pathname: '/index.html' };
  const scope = { reducedMotion, isMobile: true, document, location, URL,
    window: { IntersectionObserver: true }, body: { append: (node) => nodes.push(node) },
    requestAnimationFrame: frames.add, cancelAnimationFrame: frames.remove,
    addEventListener: events.addEventListener,
    setTimeout(fn, delay) { timers.set(++nextTimer, { fn, delay }); return nextTimer; }, clearTimeout: (id) => timers.delete(id),
    runBinaryRain(canvas, options) { const rain = { options, stopped: false }; rains.push(rain); return () => { rain.stopped = true; }; },
    IntersectionObserver: class { constructor(fn) { intersect = fn; } observe(node) { assert.equal(node, hero); } },
  };
  vm.runInNewContext(ui.slice(ui.indexOf('\n  if (!reducedMotion)'), ui.indexOf('\n  if (!isMobile && !reducedMotion)')), scope);
  const click = (href, extras = {}) => {
    const link = { href, target: '', hasAttribute: () => false, closest: () => null };
    let prevented = false;
    document.emit('click', { button: 0, target: { closest: () => link }, preventDefault() { prevented = true; }, ...extras });
    return prevented;
  };
  const fire = (delay) => {
    const entry = [...timers].find(([, job]) => job.delay === delay);
    assert.ok(entry, `missing ${delay}ms timer`);
    timers.delete(entry[0]); entry[1].fn();
  };
  return { frames, events, timers, rains, nodes, location, click, fire, intersect: (visible) => intersect?.([{ isIntersecting: visible }]) };
}

test('mobile entry and navigation visibly run rain before leaving, with cleanup on history navigation', () => {
  const page = motionPage();
  page.frames.tick();
  assert.ok(page.nodes[0].classes.has('is-active'));
  assert.equal(page.rains[0].options.fps, 17);
  page.fire(660); page.fire(280);
  assert.ok(page.rains[0].stopped);
  assert.ok(!page.nodes[0].classes.has('is-active'));
  assert.ok(page.click('https://example.test/articles.html'));
  assert.equal(page.location.pathname, '/index.html');
  assert.ok(page.nodes[0].classes.has('is-active'));
  assert.ok(page.click('https://example.test/about.html'));
  assert.equal([...page.timers.values()].filter((timer) => timer.delay === 420).length, 1, 'rapid clicks keep one navigation');
  page.fire(420);
  assert.equal(page.location.href, 'https://example.test/about.html');
  page.events.emit('pagehide');
  assert.equal(page.timers.size, 0);
  assert.ok(page.rains.at(-1).stopped);
  page.events.emit('pageshow', { persisted: true });
  assert.ok(!page.nodes[0].classes.has('is-active'), 'back/forward cannot leave an overlay stuck');
  assert.equal(page.click('https://other.test/page'), false);
  assert.equal(page.click('https://example.test/articles.html', { ctrlKey: true }), false);
});

test('mobile home rain keeps its original density and hidden/reduced-motion behaviour', () => {
  const page = motionPage();
  page.intersect(true);
  const rain = page.rains[0];
  assert.equal(rain.options.fps, 12); assert.equal(rain.options.spacing, 19); assert.equal(rain.options.opacity, .68);
  page.intersect(false); assert.ok(rain.stopped);
  page.intersect(true); assert.equal(page.rains.length, 2);
  const reduced = motionPage(true);
  assert.equal(reduced.nodes.length + reduced.timers.size + reduced.frames.jobs.size, 0);
  assert.equal(reduced.click('https://example.test/articles.html'), false);
});
