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
  for (const name of ['nav-home','nav-articles','nav-meditation','nav-about','portal-title','flower-spectrum','excalibur-cursor']) {
    assert.ok(fs.statSync(path.join(root,`assets/artwork-october/${name}.webp`)).size < (name==='flower-spectrum' ? 650000 : 60000));
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
test('ambient signal pauses in hidden pages and respects reduced motion', () => {
  const code=ui.slice(ui.indexOf('  // One lightweight, intermittent'),ui.indexOf('\n  if (!isMobile && !reducedMotion)'));
  for (const reducedMotion of [false,true]) {
    const timers=new Map(), events={}, docEvents={}, classes=new Set(); let appended=0,id=0;
    const signal={style:{},setAttribute(){},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},addEventListener(){}};
    const document={hidden:false,createElement:()=>signal,addEventListener:(k,v)=>docEvents[k]=v};
    vm.runInNewContext(code,{reducedMotion,document,body:{matches:()=>true,append(){appended++;}},
      addEventListener:(k,v)=>events[k]=v,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});
    assert.equal(appended,reducedMotion?0:1);
    if(reducedMotion) {assert.equal(timers.size,0);continue;}
    const show=timers.values().next().value;timers.clear();show();
    assert.equal(signal.textContent,'11:11:83'); assert.ok(classes.has('is-visible'));
    document.hidden=true;docEvents.visibilitychange();assert.equal(timers.size,0);assert.ok(!classes.size);
    document.hidden=false;docEvents.visibilitychange();assert.equal(timers.size,1);
    events.pagehide();assert.equal(timers.size,0);
  }
});
