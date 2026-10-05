// Web delivery copies only: retain source pixels/alpha; never overwrite originals.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const runtime = process.env.SIRIUS_RENDER_RUNTIME;
const sharp = (runtime ? createRequire(path.resolve(runtime, 'package.json')) : require)('sharp');
const root = __dirname;
const input = path.join(root, 'assets/改图1');
const output = path.join(root, 'assets/artwork-october');
async function cutout(source, name, width, height) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 0) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  await sharp(source).extract({left, top, width: right-left+1, height: bottom-top+1})
    .resize({width, height, fit: 'inside', withoutEnlargement: true}).webp({lossless:true}).toFile(path.join(output, name+'.webp'));
}
(async () => {
  fs.mkdirSync(output, {recursive:true});
  for (const [file,name,width,height] of [
    ['Cache_74d7d1591e92bcce.png','portal-title',1200,400],
    ['Cache_-6d51e9dc47c298b5.png','nav-home',96,96],
    ['Cache_1f3f82f0133da511.png','nav-articles',96,96],
    ['7EC7EB8EFCFF6735226F2F6C8EDBE7C4.png','nav-meditation',96,96],
    ['594E2AF4667FF8A1525E2F88B5C7DA74.png','nav-about',96,96],
    ['Cache_-6b32942ee8b7fec2.png','flower-spectrum',1400,1400],
  ]) await cutout(path.join(input,file),name,width,height);
  if (process.env.SIRIUS_SWORD_SOURCE) await cutout(process.env.SIRIUS_SWORD_SOURCE,'excalibur-cursor',72,216);
  for (const [file,name] of [['C85D1AC4DC842F41F83E1B5A33A298FB.png','about-sakura'],['Cache_278e15043b963460.jpg','about-paris']]) {
    for (const [suffix,width] of [['',2400],['-mobile',1100]]) {
      await sharp(path.join(input,file)).resize({width,withoutEnlargement:true}).webp({quality:87}).toFile(path.join(root,`assets/space/${name}${suffix}.webp`));
    }
  }
  console.log('Artwork delivery copies ready. Original files unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
