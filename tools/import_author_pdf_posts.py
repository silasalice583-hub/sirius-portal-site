"""Import the two September WeChat PDF exports as editable site articles.

The exports contain a real text layer and separate image objects.  This script
normalizes PDF-only radical glyphs, keeps paragraph/quotation boundaries, and
omits the promotional banner at the end of each PDF.
"""

from __future__ import annotations

import html
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SITE_DATA = ROOT / "articles-data.js"
ASSET_ROOT = ROOT / "assets" / "articles" / "wechat"
PREFIX = "window.SIRIUS_ARTICLES = "
SOURCES = (
    {
        "path": Path(r"D:\办公\COBRA\网站\公众号上传\show_726996429_1789904766150.pdf"),
        "id": "wechat-pdf-2026-09-20-fruit-basket",
        "title": "水果锦囊：携带宇宙能量的珠宝",
        "author": "苍焰",
        "date": "2026-09-20",
        "figure_count": 3,
    },
    {
        "path": Path(r"D:\办公\COBRA\网站\公众号上传\show_726640030_1789828580174.pdf"),
        "id": "wechat-pdf-2026-09-19-heaven-earth-keys",
        "title": "新天新地密钥",
        "author": "向明",
        "date": "2026-09-19",
        "figure_count": 1,
    },
)

# These U+2E** characters are graphical CJK radicals used in the PDF's font
# encoding.  NFKC covers Kangxi radicals but not this small subset.
RADICALS = str.maketrans({
    "⻅": "见", "⻆": "角", "⻓": "长", "⻘": "青", "⻛": "风",
    "⻢": "马", "⻩": "黄", "⻔": "门", "⻝": "食",
})


def clean_line(value: str) -> str:
    value = value.replace("\x00", "——")
    value = "".join(
        unicodedata.normalize("NFKC", char) if 0x2E80 <= ord(char) <= 0x2FFF else char
        for char in value
    ).translate(RADICALS)
    value = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", value)
    value = re.sub(r"\s+([，。！？：；、）”])", r"\1", value)
    return value.strip()


def is_source_line(text: str) -> bool:
    return bool(re.match(r"^——\s*20\d{2}年", text))


def is_quote_start(text: str) -> bool:
    return bool(re.match(r"^(?:Terry|黛布拉|问|答)\s*[:：]", text))


def is_sentence_end(text: str) -> bool:
    return bool(re.search(r"[。！？][”’]?\s*$", text))


def join_lines(lines: list[str]) -> str:
    # Visual wraps in this 402pt-wide export are not paragraph breaks.
    text = "".join(lines).strip().replace("门戶", "门户")
    # The PDF text layer occasionally inserts layout spaces within a word.
    text = text.replace("叫它 “ 印度珠宝”。 直到 1940 年代", "叫它“印度珠宝”。直到1940年代")
    text = text.replace("2164 万港元成交， 比拍前", "2164万港元成交，比拍前")
    text = text.replace("CollierHindou", "Collier Hindou")
    return text


def blocks_from_pdf(page: pdfplumber.page.Page, figure_paths: list[str]) -> list[dict[str, str]]:
    lines = page.extract_text_lines()
    figures = [image for image in page.images[:len(figure_paths)]]
    blocks: list[dict[str, str]] = []
    pending: list[str] = []
    pending_kind = "paragraph"
    figure_index = 0

    def flush() -> None:
        nonlocal pending
        if pending:
            blocks.append({"type": pending_kind, "text": join_lines(pending)})
            pending = []

    for index, line in enumerate(lines):
        text = clean_line(line["text"])
        if index == 0:  # The site reader displays the title in its own hero.
            continue
        if text in {"苍焰", "向明"}:
            flush()
            blocks.append({"type": "signature", "text": text})
            break  # The PDF's blue call-to-action and banner are footer chrome.
        while figure_index < len(figures) and figures[figure_index]["top"] < line["top"]:
            flush()
            blocks.append({"type": "image", "src": figure_paths[figure_index]})
            figure_index += 1

        if is_source_line(text):
            flush()
            text = re.sub(r"(?<=月)(研讨会|会议|访谈)$", r" \1", text)
            text = re.sub(r"(?<=日)(研讨会|会议|访谈)$", r" \1", text)
            blocks.append({"type": "source", "text": text})
            continue

        rgb = line["chars"][0].get("non_stroking_color") or (0, 0, 0)
        is_quote = isinstance(rgb, tuple) and rgb[0] > 0.5
        kind = "quote" if is_quote else "paragraph"
        if pending and (kind != pending_kind or (kind == "quote" and is_quote_start(text))):
            flush()
        pending_kind = kind
        pending.append(text)
        if kind == "paragraph" and is_sentence_end(text):
            flush()

    flush()
    return blocks


def extract_figures(pdf_path: Path, folder: Path, count: int) -> list[str]:
    folder.mkdir(parents=True, exist_ok=True)
    images = PdfReader(pdf_path).pages[0].images
    if len(images) < count:
        raise ValueError(f"{pdf_path.name}: expected {count} illustrations, found {len(images)}")
    paths: list[str] = []
    for index, image in enumerate(images[:count], 1):
        suffix = Path(image.name).suffix.lower() or ".png"
        target = folder / f"figure-{index:02d}{suffix}"
        if not target.exists() or target.read_bytes() != image.data:
            target.write_bytes(image.data)
        paths.append(target.relative_to(ROOT).as_posix())
    return paths


def build_article(source: dict[str, object]) -> dict[str, object]:
    pdf_path = Path(source["path"])
    folder = ASSET_ROOT / str(source["id"])
    figure_paths = extract_figures(pdf_path, folder, int(source["figure_count"]))
    with pdfplumber.open(pdf_path) as pdf:
        blocks = blocks_from_pdf(pdf.pages[0], figure_paths)
    if not blocks or blocks[-1] != {"type": "signature", "text": source["author"]}:
        raise ValueError(f"{pdf_path.name}: author signature not found")
    paragraphs = [block["text"] for block in blocks if block["type"] != "image"]
    markup: list[str] = []
    for block in blocks:
        if block["type"] == "image":
            markup.append(
                f'<figure class="wechat-figure"><img src="{html.escape(block["src"], quote=True)}" '
                f'alt="{html.escape(str(source["title"]), quote=True)} 配图" loading="lazy" /></figure>'
            )
            continue
        css_class = {
            "quote": "wechat-quote", "source": "wechat-source-line", "signature": "wechat-signature"
        }.get(block["type"], "")
        class_attr = f' class="{css_class}"' if css_class else ""
        markup.append(f'<p{class_attr}>{html.escape(block["text"], quote=False)}</p>')
    return {
        "id": source["id"], "title": source["title"], "category": "文章更新",
        "date": source["date"], "cover": figure_paths[0], "excerpt": "",
        "hot": 86, "commentMode": "all", "contentType": "article",
        "author": source["author"], "canonicalAuthor": source["author"],
        "sourceAccount": "PDF 导入", "sourceDocument": pdf_path.name,
        "images": figure_paths, "paragraphs": paragraphs,
        "html": "\n".join(markup), "assetCount": len(figure_paths),
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    imports = [build_article(source) for source in SOURCES]
    raw = SITE_DATA.read_text(encoding="utf-8-sig").strip()
    if not raw.startswith(PREFIX) or not raw.endswith(";"):
        raise ValueError("articles-data.js has an unexpected wrapper")
    articles = json.loads(raw[len(PREFIX):-1])
    imported_ids = {item["id"] for item in imports}
    articles = [item for item in articles if item["id"] not in imported_ids]
    articles = imports + articles
    SITE_DATA.write_text(PREFIX + json.dumps(articles, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({
        "articles": [{"id": item["id"], "title": item["title"],
                      "paragraphs": len(item["paragraphs"]), "figures": item["assetCount"]}
                     for item in imports],
        "site_total": len(articles),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
