const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'cosmic-ui.js'), 'utf8');

function background({ mobile = false, home = false, about = false } = {}) {
  const classes = () => { const set = new Set(); return { add: (v) => set.add(v), remove: (v) => set.delete(v), contains: (v) => set.has(v) }; };
  const element = () => ({ style: {}, dataset: {}, classList: classes(), setAttribute() {}, append(...nodes) { this.children = nodes; } });
  const body = { dataset: {}, matches: () => true, classList: { contains: (v) => v === (home ? 'page-home' : about ? 'page-about' : 'page-articles') }, prepend(node) { this.backdrop = node; } };
  let onCategory, tick;
  const images = [];
  const scope = { document: { body, createElement: element, hidden: false, querySelector: () => null },
    matchMedia: () => ({ matches: mobile }), Image: class { set src(value) { this.url = value; images.push(this); } },
    MutationObserver: class { constructor(callback) { onCategory = callback; } observe() {} },
    setInterval: (fn) => { tick = fn; } };
  // Exercise the real background implementation without unrelated pointer/UI effects.
  vm.runInNewContext(source.slice(0, source.indexOf('  // A dense phosphor-green')) + '\n})();', scope);
  return { body, images, change: (category) => { body.dataset.categoryTheme = category; onCategory(); }, tick };
}

test('all supplied new photos enter the rotation with desktop/mobile delivery', () => {
  for (const mobile of [false, true]) {
    const scene = background({ mobile });
    // Reduced motion uses the same media query in this small test harness.
    if (!mobile) for (let i = 0; i < 5; i++) scene.tick();
    const photos = ['milky-way-mountains', 'milky-way-panorama', 'milky-way-nevada', 'milky-way-spitzer'];
    for (const name of photos) {
      const file = `assets/space/${name}${mobile ? '-mobile' : ''}.webp`;
      assert.ok(fs.statSync(path.join(root, file)).size > 10000);
      if (!mobile) assert.ok(scene.images.some((image) => image.url === file));
    }
  }
});

test('Gemini uses the approved Medusa alternative on desktop and phone, without black side bands', () => {
  for (const mobile of [false, true]) {
    const scene = background({ mobile });
    scene.change('访谈');
    scene.images.at(-1).onload();
    let active = scene.body.backdrop.children.find((layer) => layer.classList.contains('is-visible'));
    assert.match(active.style.backgroundImage, new RegExp(`medusa-nebula${mobile ? '-mobile' : ''}\\.webp`));
    scene.change('相关资料');
    scene.images.at(-1).onload();
    active = scene.body.backdrop.children.find((layer) => layer.classList.contains('is-visible'));
    assert.equal(active.dataset.scene, 'andromeda-m31');
    // A slow prior image must not replace the current category.
    scene.images[0].onload();
    assert.equal(scene.body.backdrop.dataset.scene, 'andromeda-m31');
  }
  const css = fs.readFileSync(path.join(root, 'cosmic-refinement.css'), 'utf8');
  assert.match(css, /\.cosmic-photo \{ background-size: cover; background-repeat: no-repeat;/);
  assert.doesNotMatch(css, /data-fit="contain"/);
});

test('home continues using the requested Earth/Sirius pair', () => {
  const scene = background({ home: true });
  scene.tick(); scene.tick();
  assert.deepEqual(scene.images.map((image) => image.url), ['assets/space/earth.webp', 'assets/space/sirius-artwork.webp', 'assets/space/earth.webp']);
});

test('a slow previous slide cannot replace the newer requested photo', () => {
  const scene = background();
  scene.tick();
  scene.images[1].onload();
  assert.equal(scene.body.backdrop.dataset.scene, 'milky-way-mountains');
  scene.images[0].onload();
  assert.equal(scene.body.backdrop.dataset.scene, 'milky-way-mountains');
});

test('about uses the Paris photograph behind the existing vector Flower of Life', () => {
  for (const mobile of [false, true]) {
    const scene = background({ about: true, mobile });
    assert.equal(scene.images[0].url, `assets/space/notre-dame-paris${mobile ? '-mobile' : ''}.webp`);
    if (!mobile) { scene.tick(); assert.equal(scene.images.length, 1); }
    assert.ok(fs.existsSync(path.join(root, scene.images[0].url)));
  }
  const html = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
  assert.match(html, /data-flower-of-life/);
  assert.match(html, /flower-of-life.css\?v=20260926-scene2/);
  const css = fs.readFileSync(path.join(root, 'flower-of-life.css'), 'utf8');
  assert.match(css, /flower-of-life-stage::before\s*\{\s*display: none;/);
  assert.match(css, /width: max\(100svh, 76vw\)/);
  assert.match(css, /width: max\(145vw, 82svh\)/);
  assert.match(css, /\.life-petals \{ opacity: \.72;/);
  assert.doesNotMatch(css, /background: linear-gradient\(90deg, #04152c/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.page-about \.about-page-hero p,[^}]+color: #eef8ff/s);
});
