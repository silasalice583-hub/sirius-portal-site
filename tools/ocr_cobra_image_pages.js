"use strict";

// Restore a selectable draft for the rare source pages that contain pictures
// only. Most shared-page crops use the exact source text instead of OCR.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createWorker } = require("tesseract.js");

const root = path.resolve(__dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "tmp/pdfs/cobra-compilation-plan-v2.json"), "utf8"));
const layout = fs.readFileSync(path.join(root, "tmp/pdfs/cobra-compilation-layout.jsonl"), "utf8")
  .trim().split(/\r?\n/).map((line) => JSON.parse(line));
const pages = layout.filter((page) => !page.lines.length).map((page) => page.page);
const destination = path.join(root, "tmp/pdfs/cobra-image-ocr.json");
const renderer = process.env.PDFTOPPM || "pdftoppm";

async function main() {
  const worker = await createWorker("chi_sim", 1, {
    langPath: path.join(root, "vendor/tesseract/lang"),
    corePath: path.join(root, "vendor/tesseract/core"),
    cacheMethod: "none",
  });
  const results = {};
  try {
    for (const number of pages) {
      const prefix = path.join(root, "tmp/pdfs", `ocr-source-${number}`);
      const png = `${prefix}.png`;
      if (!fs.existsSync(png)) {
        execFileSync(renderer, ["-f", String(number), "-l", String(number), "-r", "300",
          "-png", "-singlefile", plan.source, prefix], { stdio: "pipe" });
      }
      const bytes = fs.readFileSync(png);
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      const result = await worker.recognize(png, {}, { blocks: true });
      let lines = (result.data.blocks || []).flatMap((block) => block.paragraphs || [])
        .flatMap((paragraph) => paragraph.lines || [])
        .map((line) => ({
          text: String(line.text || "").trim(),
          x0: line.bbox.x0,
          top: line.bbox.y0,
          bottom: line.bbox.y1,
          confidence: Math.round(line.confidence || 0),
        })).filter((line) => line.text);
      // These two pages are illustrations with a short display caption. OCR
      // misreads the background texture, so transcribe the visible caption.
      const captions = {
        1485: ["银河中央太阳发出的", "带电蓝光"],
        2009: ["THE FINAL BATTLE"],
      };
      if (captions[number]) {
        lines = captions[number].map((text, index) => ({
          text, x0: Math.round(width * 0.2), top: Math.round(height * (number === 1485 ? 0.78 + index * 0.06 : 0.28)),
          bottom: Math.round(height * (number === 1485 ? 0.83 + index * 0.06 : 0.32)), confidence: 100,
        }));
      }
      results[number] = { imageWidth: width, imageHeight: height, lines,
        confidence: captions[number] ? 100 : Math.round(result.data.confidence || 0),
        verified: Boolean(captions[number]) };
      console.log(`OCR source page ${number}: ${lines.length} lines, confidence ${results[number].confidence}`);
    }
  } finally {
    await worker.terminate();
  }
  fs.writeFileSync(destination, JSON.stringify({ version: 1, pages: results }, null, 2), "utf8");
  console.log(`OCR draft: ${destination}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
