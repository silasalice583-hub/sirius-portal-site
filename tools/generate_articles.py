from pathlib import Path
import html
import json
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
ARTICLE_ROOT = ROOT / "content" / "articles"


META = {
    "1": {"category": "门户行动", "date": "2025-08-12", "cover": "assets/logo-vector-web.png", "music": "content/articles/1-8月，让它发生/12 21.mp3", "commentMode": "all"},
    "2": {"category": "访谈", "date": "2025-07-30", "cover": "assets/logo-vector-web.png", "commentMode": "featured"},
    "3": {"category": "门户更新", "date": "2025-08-04", "cover": "assets/logo-vector-web.png", "commentMode": "all"},
    "4": {"category": "门户更新", "date": "2025-07-29", "cover": "assets/logo-vector-web.png", "commentMode": "featured"},
    "5": {"category": "故事", "date": "2025-08-08", "cover": "assets/logo-vector-web.png", "commentMode": "all"},
    "6": {"category": "门户行动", "date": "2025-08-14", "cover": "assets/logo-vector-web.png", "commentMode": "all"},
    "7": {"category": "冥想", "date": "2025-08-16", "cover": "content/articles/7-聚精会神，塑造美好未来/1.png", "commentMode": "all"},
    "8": {"category": "指南", "date": "2025-08-17", "cover": "content/articles/8-助推说明/图/1.png", "commentMode": "featured"},
    "9": {"category": "观察", "date": "2025-08-18", "cover": "content/articles/9-由人们的生活想到的/1.png", "commentMode": "all"},
    "10": {"category": "科普", "date": "2025-08-19", "cover": "content/articles/10-相干信号——量变引发质变/1.png", "commentMode": "all"},
}


def docx_paragraphs(path: Path):
    with zipfile.ZipFile(path) as docx:
        xml = docx.read("word/document.xml").decode("utf-8", "ignore")
    paragraphs = []
    for block in re.findall(r"<w:p[\s\S]*?</w:p>", xml):
        texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", block)
        if texts:
            text = "".join(html.unescape(part) for part in texts)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                paragraphs.append(text)
    return paragraphs


def legacy_doc_paragraphs(path: Path):
    data = path.read_bytes()
    text = data.decode("utf-16le", "ignore")
    chunks = re.findall(r"[\u4e00-\u9fffA-Za-z0-9，。？！：；、“”‘’（）《》\-—…：\s]{8,}", text)
    ignored = {"redirect", "MERGEFORMAT"}
    paragraphs = []
    for chunk in chunks:
        value = re.sub(r"\s+", " ", chunk).strip()
        if len(value) < 8 or value in ignored or value.startswith("HYPERLINK"):
            continue
        if re.fullmatch(r"[A-Za-z0-9]{10,}", value):
            continue
        paragraphs.append(value)
    return paragraphs


def paragraph_text(path: Path):
    if path.suffix.lower() == ".docx":
        return docx_paragraphs(path)
    return legacy_doc_paragraphs(path)


def folder_order(path: Path):
    match = re.match(r"(\d+)-", path.name)
    return int(match.group(1)) if match else 999


def article_title(folder: Path):
    return re.sub(r"^\d+-", "", folder.name).strip()


def make_article(folder: Path):
    number = str(folder_order(folder))
    source = next(iter(sorted(folder.glob("*.docx"))), None) or next(iter(sorted(folder.glob("*.doc"))), None)
    pdf = next(iter(sorted(folder.glob("*.pdf"))), None)
    paragraphs = paragraph_text(source) if source else []
    clean = [p for p in paragraphs if p]
    excerpt = next((p for p in clean if len(p) > 24), clean[0] if clean else "")
    meta = META.get(number, {})
    images = [str(p.relative_to(ROOT)).replace("\\", "/") for p in sorted(folder.rglob("*.png"))]
    title = article_title(folder)
    cover = meta.get("cover", images[0] if images else "assets/logo-vector-web.png")
    if not (cover.startswith(("http://", "https://", "data:")) or (ROOT / cover).exists()):
        cover = images[0] if images else "assets/logo-vector-web.png"
    music = meta.get("music", "")
    if music and not (music.startswith(("http://", "https://", "data:")) or (ROOT / music).exists()):
        music = ""
    return {
        "id": f"article-{number}",
        "title": title,
        "category": meta.get("category", "文章"),
        "date": meta.get("date", "2025-08-01"),
        "cover": cover,
        "excerpt": excerpt[:160],
        "hot": 98 - folder_order(folder) * 4,
        "commentMode": meta.get("commentMode", "all"),
        "music": music,
        "sourceDoc": str(source.relative_to(ROOT)).replace("\\", "/") if source else "",
        "sourcePdf": str(pdf.relative_to(ROOT)).replace("\\", "/") if pdf else "",
        "images": images,
        "paragraphs": clean,
    }


def main():
    folders = sorted([p for p in ARTICLE_ROOT.iterdir() if p.is_dir() and re.match(r"\d+-", p.name)], key=folder_order)
    articles = [make_article(folder) for folder in folders]
    output = "window.SIRIUS_ARTICLES = " + json.dumps(articles, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "articles-data.js").write_text(output, encoding="utf-8")
    print(f"Generated {len(articles)} articles")


if __name__ == "__main__":
    main()
