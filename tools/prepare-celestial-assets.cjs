#!/usr/bin/env node
/* Resize generated RGBA art without flattening, colour keying, or removing dark detail. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
}

const root = path.resolve(__dirname, '..');
const sourceDirectory = process.argv[2] || path.join(os.homedir(), '.codex/generated_images/01a07639-0c69-7703-ba7d-c59bdc9b9468');
const qaDirectory = path.join(root, 'output/qa/celestial-assets');
const constellationSources = {
  pleiades: 'df5e7cc5-1ebd-4295-8cb2-e5d62ac1d761',
  cassiopeia: '4b76f08d-97c3-42f8-accf-9261ec7c9f66',
  gemini: 'cd1bed91-40b2-43ed-9f98-9bcadc55719c',
  cygnus: '33451eda-6922-480b-8b3a-1bbf15413fc1',
  perseus: 'ddc0a1e3-6a02-4c0b-9eb9-131972b6d154',
  andromeda: 'e3888175-3188-4aa2-a227-2920130eafb4',
  atlas: 'b93720d4-1210-43ab-8dc6-a019ba83011d',
};

function alphaReport(data, info) {
  const { width, height, channels } = info;
  let transparent = 0;
  let partial = 0;
  let darkOpaque = 0;
  let interiorTransparent = 0;
  let interiorCount = 0;
  const corners = [[], [], [], []];
  const cornerSize = Math.min(12, width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const alpha = data[offset + 3];
      if (alpha === 0) transparent += 1;
      else if (alpha < 255) partial += 1;
      if (alpha > 240 && Math.max(data[offset], data[offset + 1], data[offset + 2]) < 24) darkOpaque += 1;
      if (x >= width * .2 && x < width * .8 && y >= height * .2 && y < height * .8) {
        interiorCount += 1;
        if (alpha === 0) interiorTransparent += 1;
      }
      if (x < cornerSize && y < cornerSize) corners[0].push(alpha);
      if (x >= width - cornerSize && y < cornerSize) corners[1].push(alpha);
      if (x < cornerSize && y >= height - cornerSize) corners[2].push(alpha);
      if (x >= width - cornerSize && y >= height - cornerSize) corners[3].push(alpha);
    }
  }
  const percentage = (value, total = width * height) => Number((100 * value / total).toFixed(2));
  return {
    width, height,
    transparentPercent: percentage(transparent),
    softAlphaPercent: percentage(partial),
    interiorTransparentPercent: percentage(interiorTransparent, interiorCount),
    nearBlackOpaquePercent: percentage(darkOpaque),
    cornerMaxAlpha: corners.map((values) => Math.max(...values)),
  };
}

function checkerboard(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = (Math.floor(x / 14) + Math.floor(y / 14)) % 2 ? [202, 216, 230] : [245, 249, 253];
      const offset = (y * width + x) * 3;
      pixels[offset] = shade[0]; pixels[offset + 1] = shade[1]; pixels[offset + 2] = shade[2];
    }
  }
  return { input: pixels, raw: { width, height, channels: 3 } };
}

async function main() {
  await fs.mkdir(path.join(root, 'assets/constellations'), { recursive: true });
  await fs.mkdir(qaDirectory, { recursive: true });
  const jobs = Object.entries(constellationSources).map(([name, id]) => ({
    name, input: path.join(sourceDirectory, `exec-${id}.png`),
    output: path.join(root, 'assets/constellations', `${name}.webp`), size: 640,
  }));
  for (const name of ['iris', 'lion', 'dolphin', 'twelve-star']) {
    jobs.push({
      name: `click-${name}`, input: path.join(root, 'assets/icons', `click-${name}-ai.png`),
      output: path.join(root, 'assets/icons', `click-${name}-ai.webp`), size: 256,
    });
  }
  const reports = [];
  const compositions = [];
  const tileWidth = 320;
  const tileHeight = 286;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const sourceMetadata = await sharp(job.input).metadata();
    if (!sourceMetadata.hasAlpha) throw new Error(`Source has no alpha: ${job.input}`);
    await sharp(job.input).rotate().resize({ width: job.size, height: job.size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(job.output);
    const { data, info } = await sharp(job.output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const report = alphaReport(data, info);
    if (report.transparentPercent < 1) throw new Error(`Output has no useful transparent region: ${job.output}`);
    reports.push({
      name: job.name, source: job.input, output: path.relative(root, job.output).replaceAll('\\', '/'),
      inputBytes: (await fs.stat(job.input)).size, outputBytes: (await fs.stat(job.output)).size, ...report,
    });
    const art = await sharp(job.output).resize(300, 242, { fit: 'contain', background: '#00000000' }).png().toBuffer();
    const label = Buffer.from(`<svg width="320" height="34"><rect width="320" height="34" fill="#102c46"/><text x="12" y="23" fill="white" font-family="sans-serif" font-size="17">${job.name}</text></svg>`);
    const board = checkerboard(tileWidth, tileHeight);
    const tile = await sharp(board.input, { raw: board.raw }).composite([{ input: art, top: 37, left: 10 }, { input: label, top: 0, left: 0 }]).png().toBuffer();
    compositions.push({ input: tile, top: Math.floor(index / 4) * tileHeight, left: (index % 4) * tileWidth });
  }
  await sharp({ create: { width: tileWidth * 4, height: tileHeight * Math.ceil(jobs.length / 4), channels: 3, background: '#e7f0f7' } })
    .composite(compositions).png().toFile(path.join(qaDirectory, 'checkerboard.png'));
  await fs.writeFile(path.join(qaDirectory, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    policy: 'Original alpha preserved; no black/white chroma key, no flattening, no source deletion.',
    assets: reports,
  }, null, 2));
  console.table(reports.map(({ name, width, height, outputBytes, transparentPercent, interiorTransparentPercent, nearBlackOpaquePercent, cornerMaxAlpha }) => ({
    name, dimensions: `${width}x${height}`, kilobytes: Math.round(outputBytes / 1024), transparentPercent,
    interiorTransparentPercent, nearBlackOpaquePercent, cornerMaxAlpha: cornerMaxAlpha.join('/'),
  })));
  console.log(`QA contact sheet: ${path.join(qaDirectory, 'checkerboard.png')}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
