const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }
const root = path.resolve(__dirname, '..');
const generated = path.join(os.homedir(), '.codex/generated_images/01a07639-0c69-7703-ba7d-c59bdc9b9468');
const assets = {
  'iris-pen-illustration': ['199b95ae-7a99-4629-ba2d-57c902f21200', 252],
  'click-iris-illustration': ['46b8a934-a9f3-470b-aa2e-8cbb04993d8d', 96],
  'click-lion-illustration': ['e23aa9e4-8131-403b-8d63-bf193da3ab5e', 96],
  'click-dolphin-illustration': ['307f63f9-5df9-4609-8083-5ef8dc4d5eb2', 96],
  'click-star-illustration': ['2af686c9-3935-4648-bd58-f578bb12c81e', 96],
  'skywalker-emblem': ['f0f6ca88-3d5c-4420-b794-159a051d7692', 512],
};
(async () => {
  for (const [name, [id, size]] of Object.entries(assets)) {
    const input = path.join(generated, `exec-${id}.png`);
    const target = path.join(root, 'assets/icons', `${name}.webp`);
    await sharp(input).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toFile(target);
    const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = [3, (info.width - 1) * 4 + 3, (info.height - 1) * info.width * 4 + 3, data.length - 1].map(i => data[i]);
    if (alpha.some(a => a !== 0)) throw new Error(`Opaque corner in ${name}`);
    console.log(name, info.width, info.height, (await fs.stat(target)).size, 'corners:', alpha);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
