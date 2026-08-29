from __future__ import annotations

import hashlib
import html
import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from docx import Document
from docx.oxml.ns import qn
from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "content" / "待补充"
ASSET_ROOT = ROOT / "assets" / "articles" / "portal-updates"
EXPORT_ROOT = ROOT / "exports"
ARTICLE_DATA_PATH = ROOT / "articles-data.js"
CATEGORY = "门户更新"
SIMPLIFIED_RADICALS = str.maketrans({
    "⺟": "母", "⺠": "民", "⻅": "见", "⻆": "角", "⻋": "车", "⻓": "长", "⻔": "门",
    "⻘": "青", "⻙": "韦", "⻛": "风", "⻨": "麦",
    "⻝": "食", "⻜": "飞", "⻢": "马", "⻥": "鱼", "⻩": "黄", "⻬": "齐", "⻰": "龙",
    "戶": "户", "門": "门", "見": "见", "長": "长", "魚": "鱼", "黃": "黄", "龍": "龙",
    "齊": "齐", "車": "车", "飛": "飞", "馬": "马", "無": "无", "網": "网",
})


@dataclass(frozen=True)
class ArticleSpec:
    slug: str
    date: str
    title: str
    source_doc: str = ""
    source_pdf: str = ""
    start: str = ""
    end: str = ""


SPECS = [
    ArticleSpec("2025-12-26-situation-update", "2025-12-26", "近况更新", "2025.12.26.docx", "2025.12.26.pdf", r"2025[.年]12[.月]26.*近况更新"),
    ArticleSpec("2026-01-16-situation-update", "2026-01-16", "近况更新", "2026.1.16.docx", "2026.1.16.pdf", r"2026[.年]1[.月]16.*近况更新"),
    ArticleSpec("2026-01-17-fulford-c-interview", "2026-01-17", "本杰明・富尔福德与C访谈文字实录", "2026.1.17.docx", "2026.1.17.pdf", r"2026[.年]1[.月]17.*本杰明.*C访谈"),
    ArticleSpec("2026-01-25-golden-planetary-timeline", "2026-01-25", "行星黄金时间线", "2026.1.25.docx", "2026.1.25.pdf", r"2026[.年]1[.月]25.*行星黄金时间线"),
    ArticleSpec("2026-01-31-phoenix-conference", "2026-01-31", "凤凰城会议笔记", "2026.1.31.docx", "2026.1.31.pdf", r"2026[.年]1[.月]31.*凤凰城会议笔记"),
    ArticleSpec("2026-02-22-situation-update", "2026-02-22", "近况更新", "2026.2.22.docx", "2026.2.22.pdf", r"2026[.年]2[.月]22.*近况更新"),
    ArticleSpec("2026-02-25-message-to-surface-population", "2026-02-25", "给地表民众的简讯", "2026.2.25.docx", "2026.2.25.pdf", r"为了维护和平"),
    ArticleSpec("2026-03-07-sydney-day-one", "2026-03-07", "悉尼会议・第一天", "2026.3.7.docx", "2026.3.7.pdf", r"2026[.年]3[.月]7.*悉尼会议.*第一天"),
    ArticleSpec("2026-03-08-sydney-day-two", "2026-03-08", "悉尼会议・第二天", source_pdf="2026.3.8 悉尼会议 第二天.pdf", start=r"2026[.年]3[.月]8.*悉尼会议.*第二天"),
    ArticleSpec("2026-03-14-brisbane-conference", "2026-03-14", "布里斯班会议", source_pdf="2026.3.14 布里斯班会议.pdf", start=r"2026[.年]3[.月]14.*布里斯班会议"),
    ArticleSpec("2026-03-27-new-heaven", "2026-03-27", "新天堂", "2026.3.27.docx", "2026.3.27.pdf", r"2026[.年]3[.月]27.*新天堂"),
    ArticleSpec("2026-04-20-situation-update", "2026-04-20", "近况更新", source_pdf="2026.4.20 近况更新.pdf", start=r"2026[.年]4[.月]20.*近况更新"),
    ArticleSpec("2026-04-26-bogota-workshop", "2026-04-26", "波哥大研讨会", "待补充/待补充.docx", "待补充/6.9.pdf", r"2026[.年]4[.月]26.*波哥大研讨会", r"2026[.年]6[.月]9.*让它发生"),
    ArticleSpec("2026-06-09-ascension-portal-phase-two", "2026-06-09", "让它发生！7月25日12:21扬升门户开启第二阶段", "待补充/待补充.docx", "待补充/2026.6.9 让它发生！7月25日1221扬升门户开启第二阶段 (1).pdf", r"2026[.年]6[.月]9.*让它发生"),
    ArticleSpec("2026-07-25-ascension-portal-day-one", "2026-07-25", "12:21扬升门户开启当日笔记", "1221扬升门户开启笔记合集.docx", "2026.7.25 1221开启当日笔记.pdf", r"2026[.年]7[.月]25.*12:21扬升门户开启当日笔记", r"2026[.年]7[.月]26.*12:21扬升门户开启次日笔记"),
    ArticleSpec("2026-07-26-ascension-portal-day-two", "2026-07-26", "12:21扬升门户开启次日笔记", "1221扬升门户开启笔记合集.docx", "2026.7.26 1221开启次日笔记.pdf", r"2026[.年]7[.月]26.*12:21扬升门户开启次日笔记", r"2026[.年]8[.月]8.*12:21扬升门户开启报告"),
    ArticleSpec("2026-08-08-ascension-portal-report", "2026-08-08", "12:21扬升门户开启报告", "1221扬升门户开启笔记合集.docx", "2026.8.8 1221扬升门户开启报告.pdf", r"2026[.年]8[.月]8.*12:21扬升门户开启报告"),
]


def normalize_text(value: str) -> str:
    value = "".join(
        unicodedata.normalize("NFKC", char) if 0x2F00 <= ord(char) <= 0x2FD5 else char
        for char in (value or "")
    ).translate(SIMPLIFIED_RADICALS).replace("\x00", "")
    value = value.replace("⸺", "——").replace("﹣", "-")
    value = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", value)
    value = re.sub(r"\s+([，。！？；：、）》】])", r"\1", value)
    value = re.sub(r"([（《【])\s+", r"\1", value)
    return re.sub(r"\s+", " ", value).strip()


def relative(path: Path | None) -> str:
    return path.relative_to(ROOT).as_posix() if path else ""


def find_source(fragment: str) -> Path | None:
    return SOURCE_ROOT / fragment if fragment else None


def image_dimensions(blob: bytes) -> tuple[int, int]:
    try:
        from io import BytesIO

        with Image.open(BytesIO(blob)) as image:
            return image.size
    except Exception:
        return (0, 0)


def document_entries(path: Path) -> list[dict[str, object]]:
    document = Document(path)
    entries: list[dict[str, object]] = []
    for paragraph in document.paragraphs:
        images = []
        for blip in paragraph._p.xpath(".//a:blip"):
            relationship_id = blip.get(qn("r:embed"))
            if not relationship_id or relationship_id not in document.part.related_parts:
                continue
            part = document.part.related_parts[relationship_id]
            filename = Path(str(part.partname)).name
            images.append({"filename": filename, "blob": part.blob})
        text = normalize_text(paragraph.text)
        if text or images:
            entries.append({"text": text, "images": images})
    return entries


def entry_slice(entries: list[dict[str, object]], start: str, end: str) -> list[dict[str, object]]:
    start_index = 0
    if start:
        start_pattern = re.compile(start, re.IGNORECASE)
        start_index = next((index for index, item in enumerate(entries) if start_pattern.search(str(item["text"]))), -1)
        if start_index < 0:
            raise ValueError(f"找不到文章起点：{start}")
    end_index = len(entries)
    if end:
        end_pattern = re.compile(end, re.IGNORECASE)
        end_index = next(
            (index for index, item in enumerate(entries[start_index + 1 :], start_index + 1) if end_pattern.search(str(item["text"]))),
            len(entries),
        )
    return entries[start_index:end_index]


def save_entry_images(entries: list[dict[str, object]], spec: ArticleSpec) -> list[dict[str, object]]:
    output_dir = ASSET_ROOT / spec.slug
    output_dir.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    saved: list[dict[str, object]] = []
    sequence = 0
    for entry in entries:
        paths = []
        for image in entry["images"]:
            blob = image["blob"]
            digest = hashlib.sha1(blob).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            width, height = image_dimensions(blob)
            suffix = Path(str(image["filename"])).suffix.lower()
            if suffix not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                continue
            if width and height and width * height < 80_000:
                continue
            sequence += 1
            destination = output_dir / f"figure-{sequence:02d}{suffix}"
            destination.write_bytes(blob)
            paths.append(relative(destination))
            saved.append({"path": relative(destination), "width": width, "height": height})
        entry["saved_images"] = paths
    return saved


def pdf_entries(path: Path, start: str) -> list[dict[str, object]]:
    reader = PdfReader(path)
    raw = "\n".join(page.extract_text() or "" for page in reader.pages)
    lines = [normalize_text(line) for line in raw.splitlines()]
    lines = [line for line in lines if line]
    if start:
        pattern = re.compile(start, re.IGNORECASE)
        start_index = next((index for index, line in enumerate(lines) if pattern.search(line)), 0)
        lines = lines[start_index:]

    entries: list[dict[str, object]] = []
    buffer = ""
    terminal = re.compile(r"[。！？；]$|(?:[：:]$)")
    fresh_section = re.compile(r"^(?:问|答|译注|原文|翻译|步骤|练习步骤|黄金时间线|行星局势|地表局势|结语)[：:]?")

    def flush() -> None:
        nonlocal buffer
        text = normalize_text(buffer)
        if text:
            entries.append({"text": text, "images": []})
        buffer = ""

    for line in lines:
        if re.match(r"^https?://", line, re.IGNORECASE):
            flush()
            entries.append({"text": re.sub(r"\s+", "", line), "images": []})
            continue
        if fresh_section.match(line) and buffer:
            flush()
        separator = " " if buffer and re.search(r"[A-Za-z0-9]$", buffer) and re.match(r"^[A-Za-z0-9]", line) else ""
        buffer += separator + line
        if terminal.search(line) or len(buffer) >= 240:
            flush()
    flush()
    return entries


def split_title(value: str, limit: int = 17) -> list[str]:
    if len(value) <= limit:
        return [value]
    break_points = [index for index, char in enumerate(value) if char in "・｜：！—— "]
    split_at = min(break_points, key=lambda index: abs(index - limit)) if break_points else limit
    split_at = max(8, min(len(value) - 6, split_at + 1))
    return [value[:split_at].strip(), value[split_at:].strip()]


def write_cover(spec: ArticleSpec, index: int) -> str:
    output_dir = ASSET_ROOT / spec.slug
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / "cover.svg"
    palette = [
        ("#071f3d", "#0aa88f", "#9ff3dc"),
        ("#10275f", "#2475b8", "#bcecff"),
        ("#11352f", "#c88a34", "#ffdf9b"),
    ][index % 3]
    line_one, *rest = split_title(spec.title)
    line_two = rest[0] if rest else ""
    title_svg = f'<tspan x="128" dy="0">{html.escape(line_one)}</tspan>'
    if line_two:
        title_svg += f'<tspan x="128" dy="104">{html.escape(line_two)}</tspan>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="{html.escape(spec.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{palette[0]}"/><stop offset="1" stop-color="{palette[1]}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="{palette[2]}" stop-opacity=".56"/><stop offset="1" stop-color="{palette[2]}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1320" cy="110" r="420" fill="url(#glow)"/>
  <circle cx="1280" cy="460" r="242" fill="none" stroke="{palette[2]}" stroke-width="8" opacity=".7"/>
  <circle cx="1280" cy="460" r="176" fill="none" stroke="white" stroke-width="2" opacity=".42"/>
  <path d="M1280 186 1517 596 1043 596Z" fill="none" stroke="{palette[2]}" stroke-width="5" opacity=".72"/>
  <path d="M1043 324 1517 324 1280 734Z" fill="none" stroke="white" stroke-width="3" opacity=".34"/>
  <text x="128" y="148" fill="{palette[2]}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="28" font-weight="700" letter-spacing="8">SIRIUS PORTAL · 门户更新</text>
  <text x="128" y="360" fill="white" font-family="STKaiti, KaiTi, Microsoft YaHei, serif" font-size="76" font-weight="700">{title_svg}</text>
  <line x1="128" y1="670" x2="720" y2="670" stroke="{palette[2]}" stroke-width="4"/>
  <text x="128" y="750" fill="white" opacity=".9" font-family="Microsoft YaHei, sans-serif" font-size="34">{spec.date}</text>
  <text x="128" y="816" fill="{palette[2]}" font-family="Microsoft YaHei, sans-serif" font-size="24" letter-spacing="5">天狼星门户 JOURNAL</text>
</svg>'''
    destination.write_text(svg, encoding="utf-8")
    return relative(destination)


def linkify(value: str) -> str:
    url_pattern = re.compile(r"https?://[^\s，。；；）)]+", re.IGNORECASE)
    pieces = []
    cursor = 0
    for match in url_pattern.finditer(value):
        pieces.append(html.escape(value[cursor : match.start()]))
        url = match.group(0)
        pieces.append(f'<a href="{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(url)}</a>')
        cursor = match.end()
    pieces.append(html.escape(value[cursor:]))
    return "".join(pieces)


def clean_entries(entries: list[dict[str, object]], spec: ArticleSpec) -> list[dict[str, object]]:
    cleaned = []
    title_tokens = [normalize_text(spec.title), normalize_text(spec.date.replace("-", "."))]
    for entry in entries:
        text = normalize_text(str(entry.get("text", "")))
        is_title = text and title_tokens[0].replace("・", "") in text.replace("・", "") and len(text) < len(spec.title) + 32
        if is_title:
            text = ""
        if text or entry.get("saved_images") or entry.get("images"):
            cleaned.append({**entry, "text": text})
    return cleaned


def extract_credits(entries: list[dict[str, object]]) -> tuple[list[dict[str, object]], str, str]:
    cleaned: list[dict[str, object]] = []
    translator = ""
    original_url = ""
    expecting_original_url = False
    url_pattern = re.compile(r"https?://[^\s，。；；）)]+", re.IGNORECASE)

    for entry in entries:
        text = normalize_text(str(entry.get("text", "")))
        translator_match = re.match(r"^(?:翻译|译制)[：:]\s*(.+)$", text)
        if translator_match:
            translator = translator_match.group(1).strip()
            continue

        original_match = re.match(r"^原文[：:]?\s*(.*)$", text)
        if original_match:
            inline_url = url_pattern.search(original_match.group(1))
            if inline_url:
                original_url = re.sub(r"\s+", "", inline_url.group(0))
                expecting_original_url = False
            else:
                expecting_original_url = True
            continue

        if expecting_original_url and re.match(r"^https?://", text, re.IGNORECASE):
            original_url = re.sub(r"\s+", "", text)
            expecting_original_url = False
            continue

        cleaned.append(entry)

    return cleaned, translator, original_url


def render_html(entries: list[dict[str, object]], spec: ArticleSpec, translator: str, original_url: str) -> tuple[str, list[str]]:
    blocks = [
        '<div class="article-opening">',
        f'<span>{CATEGORY}</span><time datetime="{spec.date}">{spec.date}</time>',
        "</div>",
    ]
    plain: list[str] = []
    first_prose = True
    list_items: list[str] = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append('<ol class="article-steps">' + "".join(f"<li>{linkify(item)}</li>" for item in list_items) + "</ol>")
            list_items = []

    for entry_index, entry in enumerate(entries):
        text = normalize_text(str(entry.get("text", "")))
        if text:
            next_text = normalize_text(str(entries[entry_index + 1].get("text", ""))) if entry_index + 1 < len(entries) else ""
            introduces_reference = bool(re.match(r"^https?://", next_text, re.IGNORECASE))
            plain.append(text)
            numbered = re.match(r"^(\d+)[.、．]\s*(.+)$", text)
            if numbered:
                list_items.append(numbered.group(2))
            else:
                flush_list()
                if re.match(r"^https?://", text, re.IGNORECASE):
                    url = re.sub(r"\s+", "", text)
                    host = urlparse(url).netloc.replace("www.", "") or "参考链接"
                    blocks.append(f'<p class="article-source-link"><a href="{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">查看参考资料 · {html.escape(host)}</a></p>')
                elif text.startswith("译注："):
                    blocks.append(f'<aside class="article-note"><strong>译注</strong><p>{linkify(text[3:].strip())}</p></aside>')
                elif text.startswith("[") and text.endswith("]"):
                    blocks.append(f'<aside class="article-note article-scene">{linkify(text[1:-1])}</aside>')
                elif re.match(r"^(问|答|C|本|杜尔|黛布拉|克里斯(?:·杜尔)?)[：:]", text):
                    role, content = re.split(r"[：:]", text, maxsplit=1)
                    dialogue_class = "question" if role in {"问", "杜尔", "黛布拉", "克里斯", "克里斯·杜尔"} else "answer"
                    blocks.append(f'<div class="article-dialogue {dialogue_class}"><strong>{html.escape(role)}</strong><p>{linkify(content.strip())}</p></div>')
                elif len(text) <= 34 and (
                    (text.endswith(("：", ":")) and not introduces_reference)
                    or re.match(r"^(?:黄金时间线|行星局势|地表局势|结语|练习步骤|步骤)$", text)
                ):
                    blocks.append(f"<h2>{linkify(text.rstrip('：:'))}</h2>")
                else:
                    css_class = ' class="article-lead"' if first_prose else ""
                    blocks.append(f"<p{css_class}>{linkify(text)}</p>")
                    first_prose = False
        for image_path in entry.get("saved_images", []):
            flush_list()
            blocks.append(
                f'<figure class="article-figure"><img src="{html.escape(image_path, quote=True)}" alt="{html.escape(spec.title)} 配图" loading="lazy" />'
                f'<figcaption>{html.escape(spec.title)} · 资料配图</figcaption></figure>'
            )
    flush_list()

    if translator or original_url:
        blocks.append('<footer class="article-credits">')
        if translator:
            blocks.append(f'<p>翻译：{html.escape(translator)}</p>')
        if original_url:
            escaped_url = html.escape(original_url, quote=True)
            blocks.append(f'<p><a href="{escaped_url}" target="_blank" rel="noopener noreferrer">{html.escape(original_url)}</a></p>')
        blocks.append('</footer>')
    return "\n".join(blocks), plain


def make_article(spec: ArticleSpec, index: int) -> dict[str, object]:
    source_doc = find_source(spec.source_doc)
    source_pdf = find_source(spec.source_pdf)
    if source_doc and not source_doc.exists():
        raise FileNotFoundError(source_doc)
    if source_pdf and not source_pdf.exists():
        raise FileNotFoundError(source_pdf)

    if source_doc:
        entries = entry_slice(document_entries(source_doc), spec.start, spec.end)
        figures = save_entry_images(entries, spec)
    elif source_pdf:
        entries = pdf_entries(source_pdf, spec.start)
        figures = []
    else:
        raise ValueError(f"{spec.title} 没有来源文件")

    entries = clean_entries(entries, spec)
    entries, translator, original_url = extract_credits(entries)
    body_html, paragraphs = render_html(entries, spec, translator, original_url)
    substantive = [
        text for text in paragraphs
        if len(text) >= 24 and not text.startswith(("http://", "https://", "原文：", "翻译：", "译制："))
    ]
    excerpt = (substantive[0] if substantive else (paragraphs[0] if paragraphs else spec.title))[:180]
    cover = write_cover(spec, index)
    return {
        "id": f"portal-update-{spec.slug}",
        "title": spec.title,
        "category": CATEGORY,
        "date": spec.date,
        "cover": cover,
        "excerpt": excerpt,
        "hot": min(96, 72 + index),
        "commentMode": "all",
        "contentType": "article",
        "duration": "",
        "music": "",
        "video": "",
        "sourceDoc": relative(source_doc),
        "sourcePdf": relative(source_pdf),
        "images": [cover],
        "paragraphs": paragraphs,
        "html": body_html,
        "assetCount": len(figures),
    }


def load_existing_articles() -> list[dict[str, object]]:
    raw = ARTICLE_DATA_PATH.read_text(encoding="utf-8-sig").strip()
    prefix = "window.SIRIUS_ARTICLES = "
    if not raw.startswith(prefix) or not raw.endswith(";"):
        raise ValueError("articles-data.js 格式不符合预期")
    return json.loads(raw[len(prefix) : -1])


def write_exports(articles: list[dict[str, object]]) -> tuple[Path, Path, Path]:
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    export_path = EXPORT_ROOT / "门户更新-2025-12-26至2026-08-08.json"
    payload = {
        "exportedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "category": CATEGORY,
        "sortOrder": "date-descending",
        "articleCount": len(articles),
        "articles": sorted(articles, key=lambda item: item["date"], reverse=True),
    }
    export_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_path = EXPORT_ROOT / "门户更新-整理清单.md"
    lines = [
        "# 门户更新整理清单",
        "",
        f"共整理并上传 {len(articles)} 篇，网站默认按日期从新到旧显示。以下清单按时间从旧到新排列。",
        "",
        "| 日期 | 标题 | 来源 | 正文配图 |",
        "| --- | --- | --- | ---: |",
    ]
    for article in sorted(articles, key=lambda item: item["date"]):
        sources = " / ".join(Path(path).name for path in [article["sourceDoc"], article["sourcePdf"]] if path)
        lines.append(f'| {article["date"]} | {article["title"]} | {sources} | {article["assetCount"]} |')
    lines += [
        "",
        "## 去重说明",
        "",
        "- `1221扬升门户开启笔记合集`仅作为 2026-07-25、2026-07-26 和 2026-08-08 三篇文章的可编辑来源，不再额外发布合集文章。",
        "- 同名 DOCX/PDF 视为同一篇文章：DOCX 用于正文与配图，PDF 用于校对。",
        "- 2026-04-26 的两个同名 PDF 内容相同，仅保留一次发布。",
    ]
    manifest_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    bundle_path = EXPORT_ROOT / "门户更新-网站导出包.zip"
    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(export_path, export_path.name)
        archive.write(manifest_path, manifest_path.name)
        for asset in sorted(ASSET_ROOT.rglob("*")):
            if asset.is_file():
                archive.write(asset, asset.relative_to(ROOT).as_posix())
    return export_path, manifest_path, bundle_path


def main() -> None:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    articles = [make_article(spec, index) for index, spec in enumerate(SPECS)]
    existing = load_existing_articles()
    new_ids = {article["id"] for article in articles}
    merged = articles + [article for article in existing if article.get("id") not in new_ids]
    merged.sort(key=lambda item: (str(item.get("date", "")), str(item.get("id", ""))), reverse=True)
    ARTICLE_DATA_PATH.write_text(
        "window.SIRIUS_ARTICLES = " + json.dumps(merged, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    export_path, manifest_path, bundle_path = write_exports(articles)
    print(json.dumps({
        "articles": len(articles),
        "totalArticles": len(merged),
        "export": relative(export_path),
        "manifest": relative(manifest_path),
        "bundle": relative(bundle_path),
        "assets": sum(int(article["assetCount"]) + 1 for article in articles),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
