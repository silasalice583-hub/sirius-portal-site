const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const ui = read('cosmic-ui.js');

test('home header stays above the equally positioned hero and mobile links keep touch targets', () => {
  const css=read('interaction-refinement.css');
  assert.match(css,/\.page-home \.site-header \{ position: absolute; z-index: 20;/);
  assert.match(css,/\.top-nav a \{ min-height: 44px;/);
});

test('supplied title survives saved page text and never receives the old code texture', () => {
  assert.match(read('index.html'), /<h1[^>]+has-artwork-title[^>]*><img[^>]+portal-title.webp[^>]+alt="天狼星门户"/);
  const source = read('app.js');
  const fn = source.slice(source.indexOf('  function applyPageText()'), source.indexOf('  function applyCustomTextStyles()'));
  const target = {textContent:'retained image',querySelector:()=>({})};
  vm.runInNewContext(fn+'\napplyPageText();', {page:{heroTitle:'old cached title'},document:{getElementById:()=>target}});
  assert.equal(target.textContent,'retained image');
  vm.runInNewContext(read('home-title.js'), {document:{getElementById:()=>target,body:{classList:{contains:()=>true}}}});
});
test('navigation symbols, sword and flower use compact local assets', () => {
  for (const name of ['nav-home','nav-articles','nav-meditation','nav-about','portal-title','flower-spectrum','excalibur-cursor','sirius-three-stars']) {
    assert.ok(fs.statSync(path.join(root,`assets/artwork-october/${name}.webp`)).size < (name==='flower-spectrum' ? 650000 : 100000));
  }
  for (const name of ['nav-home','nav-articles','nav-meditation','nav-about']) assert.ok(ui.includes(`"${name}"`));
  assert.match(ui,/excalibur-cursor.webp/); assert.doesNotMatch(ui,/iris-pen-illustration/);
  assert.match(read('meditation.html'),/>Meditation Space</);
  assert.doesNotMatch(read('articles.html'),/class="sirius-halo"/);
  assert.match(read('flower-of-life.css'),/color: #fff !important/);
});
test('rain uses only the requested repeating binary sequence', () => {
  const fn = ui.slice(ui.indexOf('  function runBinaryRain('), ui.indexOf('\n  if (!reducedMotion)'));
  const chars=[];
  const context={setTransform(){},clearRect(){},fillText(s){chars.push(s);}};
  const math=Object.create(Math); math.random=()=>0;
  const scope={Math:math,isMobile:false,devicePixelRatio:1,document:{hidden:false,addEventListener(){},removeEventListener(){}},
    setTimeout(){},clearTimeout(){},requestAnimationFrame(){},cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},
    ResizeObserver:class{observe(){}disconnect(){}},canvas:{getContext:()=>context,getBoundingClientRect:()=>({width:20,height:1600})}};
  vm.runInNewContext(fn+'\nrunBinaryRain(canvas,{fps:12,spacing:20,opacity:.94});',scope);
  assert.equal(chars.slice(0,14).join(''),'00101100010110');
});
test('sword is enlarged and tilted, blue three-star emblem replaces the purple emblem', () => {
  const css=read('interaction-refinement.css');
  assert.match(css,/\.cosmic-sword \{ width: 60px; height: 100px/);
  assert.match(css,/transform: rotate\(-28deg\); transform-origin: 50% 0/);
  assert.match(ui,/event.clientX - 30/);
  assert.match(read('articles.html'),/assets\/artwork-october\/sirius-three-stars.webp/);
  assert.doesNotMatch(read('articles.html'),/skywalker-emblem.webp/);
});

test('about keeps coloured artwork and white declaration with natural enumeration marks', () => {
  const about=read('about.html'), css=read('flower-of-life.css');
  assert.doesNotMatch(about,/丶/);
  assert.match(about,/资讯、图像、音频、影片/);
  assert.match(about,/「探索」、「学习」和「思想交流」/);
  assert.doesNotMatch(css,/grayscale\(1\) brightness\(1.8\)/);
  assert.match(css,/site-disclaimer-mark img \{ filter: drop-shadow/);
});

test('background inscriptions match rain glyph size and never animate position', () => {
  const css=read('interaction-refinement.css');
  assert.match(css,/\.portal-code-field \{ position: fixed; inset: 0; height: 100svh; z-index: 1/);
  assert.match(css,/font: 400 15px\/18px Consolas/);
  assert.match(css,/\.portal-code-signal \{ font-size: 13px; line-height: 17px/);
  const keyframes=css.slice(css.indexOf('@keyframes portalSignal'),css.indexOf('@media(max-width:760px)',css.indexOf('@keyframes portalSignal')));
  assert.match(keyframes,/opacity: .95/);
  assert.doesNotMatch(keyframes,/transform|left|top|font-size/);
});

test('denser fixed background inscriptions pause in hidden pages and respect reduced motion', () => {
  const code=ui.slice(ui.indexOf('  // One lightweight, intermittent'),ui.indexOf('\n  if (!isMobile && !reducedMotion)'));
  for (const reducedMotion of [false,true]) for (const isMobile of [false,true]) {
    const events={}, docEvents={}, classes=new Set(), signals=[]; let appended=0;
    const field={setAttribute(){},append:s=>signals.push(s),classList:{add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};
    const document={hidden:false,createElement:tag=>tag==='div'?field:{style:{setProperty(k,v){this[k]=v;}}},addEventListener:(k,v)=>docEvents[k]=v};
    vm.runInNewContext(code,{reducedMotion,isMobile,document,body:{matches:()=>true,prepend(){appended++;}},addEventListener:(k,v)=>events[k]=v});
    assert.equal(appended,reducedMotion?0:1);
    assert.equal(signals.length,reducedMotion?0:isMobile?6:8);
    if(reducedMotion) continue;
    signals.forEach(s=>assert.equal(s.textContent,'11:11:83'));
    assert.equal(signals[0].style['--signal-delay'],'1.1s');
    const initialPositions=JSON.stringify(signals.map(s=>[s.style.left,s.style.top]));
    document.hidden=true;docEvents.visibilitychange();assert.ok(classes.has('is-paused'));
    document.hidden=false;docEvents.visibilitychange();assert.ok(!classes.size);
    events.pagehide();assert.ok(classes.has('is-paused'));events.pageshow();assert.ok(!classes.size);
    assert.equal(JSON.stringify(signals.map(s=>[s.style.left,s.style.top])),initialPositions);
  }
});
