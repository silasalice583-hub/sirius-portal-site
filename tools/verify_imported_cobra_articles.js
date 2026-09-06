const fs = require("fs");
const vm = require("vm");

const imported = JSON.parse(fs.readFileSync("exports/cobra-archive-articles.json", "utf8"));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("articles-data.js", "utf8"), context);

const ids = new Set(imported.map((article) => article.id));
const imageTags = imported.flatMap((article) => article.html.match(/<img\b[^>]*>/gi) || []);
const result = {
  staticArticleCount: context.window.SIRIUS_ARTICLES.length,
  importedCount: imported.length,
  uniqueIds: ids.size,
  nonBlankExcerpts: imported.filter((article) => String(article.excerpt || "").trim()).length,
  missingCovers: imported.filter((article) => !fs.existsSync(article.cover)).length,
  missingMobileCovers: imported.filter((article) => !fs.existsSync(article.coverMobile)).length,
  imageTags: imageTags.length,
  unnormalizedImages: imageTags.filter(
    (tag) =>
      !tag.includes("article-content-image") ||
      !tag.includes('loading="lazy"') ||
      !tag.includes('decoding="async"'),
  ).length,
};

console.log(JSON.stringify(result, null, 2));

if (
  result.staticArticleCount !== 166 ||
  result.importedCount !== 116 ||
  result.uniqueIds !== 116 ||
  result.nonBlankExcerpts ||
  result.missingCovers ||
  result.missingMobileCovers ||
  result.unnormalizedImages
) {
  process.exitCode = 1;
}
