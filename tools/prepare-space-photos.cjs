/* Website photo delivery: preserve source colours and aspect ratio, never upscale. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));

async function main() {
  const [name, source] = process.argv.slice(2);
  if (!/^[a-z0-9-]+$/.test(name || '') || !source) throw new Error('Usage: node tools/prepare-space-photos.cjs asset-name source-image');
  const destination = path.resolve(__dirname, '../assets/space');
  const original = await sharp(source).metadata();
  const versions = [];
  for (const [suffix, edge, quality] of [['', 4096, 90], ['-mobile', 1600, 86]]) {
    const output = path.join(destination, `${name}${suffix}.webp`);
    await sharp(source).rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 5 }).toFile(output);
    const metadata = await sharp(output).metadata();
    versions.push({ file: path.basename(output), width: metadata.width, height: metadata.height, bytes: (await fs.stat(output)).size });
  }
  console.log(JSON.stringify({ name, original: { width: original.width, height: original.height }, versions }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
