from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
ARTICLE_DATA = ROOT / "articles-data.js"
ASSET_ROOT = ROOT / "assets" / "articles" / "wechat"
EXPORT = ROOT / "exports" / "公众号文章备份-向明与苍焰-2026-08-30.json"
MANIFEST = ROOT / "exports" / "公众号文章备份-向明与苍焰-2026-08-30.md"
PREFIX = "window.SIRIUS_ARTICLES = "


def load_site_articles() -> list[dict[str, object]]:
    raw = ARTICLE_DATA.read_text(encoding="utf-8-sig").strip()
    if not raw.startswith(PREFIX) or not raw.endswith(";"):
        raise ValueError("articles-data.js 格式不符合预期")
    return json.loads(raw[len(PREFIX) : -1])


def clean_title(value: str) -> str:
    return re.sub(r"\s+(?:原创|已修改|第\d+次修改).*$", "", value).strip()


def parse_date(value: str) -> str:
    match = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日", value)
    if not match:
        raise ValueError(f"无法解析日期：{value}")
    return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def article_id(source_url: str, date: str) -> str:
    token = urlparse(source_url).path.rstrip("/").split("/")[-1]
    safe = re.sub(r"[^A-Za-z0-9_-]", "", token)[:28]
    if not safe:
        safe = hashlib.sha1(source_url.encode()).hexdigest()[:12]
    return f"wechat-{date}-{safe}"


def suffix_for(url: str, default: str = ".jpg") -> str:
    lowered = url.lower()
    fmt = re.search(r"(?:wx_fmt|format)=([a-z0-9]+)", lowered)
    ext = fmt.group(1) if fmt else Path(urlparse(url).path).suffix.lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    return f".{ext}" if ext in {"jpg", "png", "gif", "webp"} else default


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        return
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        destination.write_bytes(response.read())


def escape_text(value: str) -> str:
    return html.escape(value, quote=False)


def build_article(source: dict[str, object]) -> dict[str, object]:
    title = clean_title(str(source["title"]))
    date = parse_date(str(source["dateText"]))
    source_url = str(source["sourceUrl"])
    item_id = article_id(source_url, date)
    folder = ASSET_ROOT / item_id
    cover_url = str(source["coverUrl"])
    cover_path = folder / f"cover{suffix_for(cover_url)}"
    download(cover_url, cover_path)

    local_images: list[str] = []
    url_to_local: dict[str, str] = {}
    for index, url in enumerate(source.get("imageUrls", []), 1):
        url = str(url)
        image_path = folder / f"figure-{index:02d}{suffix_for(url)}"
        download(url, image_path)
        relative = image_path.relative_to(ROOT).as_posix()
        local_images.append(relative)
        url_to_local[url] = relative

    blocks: list[str] = []
    paragraphs: list[str] = []
    for block in source.get("blocks", []):
        block_type = str(block.get("type", "paragraph"))
        if block_type == "image":
            local = url_to_local.get(str(block.get("url", "")))
            if local:
                blocks.append(
                    f'<figure class="wechat-figure"><img src="{html.escape(local, quote=True)}" '
                    f'alt="{html.escape(title, quote=True)} 配图" loading="lazy" /></figure>'
                )
            continue
        text = str(block.get("text", "")).strip()
        if not text:
            continue
        paragraphs.append(text)
        css_class = {
            "quote": "wechat-quote",
            "source": "wechat-source-line",
            "signature": "wechat-signature",
        }.get(block_type, "")
        class_attr = f' class="{css_class}"' if css_class else ""
        blocks.append(f"<p{class_attr}>{escape_text(text)}</p>")

    signature = str(source.get("signature") or source.get("author") or "").strip()
    canonical_author = str(source.get("author") or signature).strip()
    return {
        "id": item_id,
        "title": title,
        "category": "文章更新",
        "date": date,
        "cover": cover_path.relative_to(ROOT).as_posix(),
        "excerpt": str(source.get("excerpt") or (paragraphs[0] if paragraphs else title))[:180],
        "hot": 86,
        "commentMode": "all",
        "contentType": "article",
        "author": signature or canonical_author,
        "canonicalAuthor": canonical_author,
        "sourceAccount": "晶彩未来",
        "sourceUrl": source_url,
        "sourcePublishedAt": str(source["dateText"]),
        "sourceCoverUrl": cover_url,
        "sourceImageUrls": [str(url) for url in source.get("imageUrls", [])],
        "images": [cover_path.relative_to(ROOT).as_posix(), *local_images],
        "paragraphs": paragraphs,
        "html": "\n".join(blocks),
        "assetCount": len(local_images),
    }


def main() -> None:
    if len(sys.argv) > 1:
        source_articles = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        sys.stdin.reconfigure(encoding="utf-8")
        source_articles = json.load(sys.stdin)
    if len(source_articles) != 33:
        raise ValueError(f"预期 33 篇，实际收到 {len(source_articles)} 篇")
    with ThreadPoolExecutor(max_workers=8) as pool:
        imported = list(pool.map(build_article, source_articles))
    ids = {item["id"] for item in imported}
    urls = {item["sourceUrl"] for item in imported}
    existing = [
        item for item in load_site_articles()
        if item.get("id") not in ids and item.get("sourceUrl") not in urls
    ]
    merged = imported + existing
    merged.sort(key=lambda item: (str(item.get("date", "")), str(item.get("id", ""))), reverse=True)
    ARTICLE_DATA.write_text(PREFIX + json.dumps(merged, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")

    payload = {
        "exportedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceAccount": "晶彩未来",
        "authors": ["向明", "苍焰"],
        "articleCount": len(imported),
        "articles": imported,
    }
    EXPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# 公众号文章备份：向明与苍焰",
        "",
        f"共同步 {len(imported)} 篇公开文章。删除和无法查看的重复记录未收入。",
        "",
        "| 日期 | 作者署名 | 标题 | 正文图片 |",
        "| --- | --- | --- | ---: |",
    ]
    for item in sorted(imported, key=lambda value: str(value["date"]), reverse=True):
        lines.append(f'| {item["date"]} | {item["author"]} | {item["title"]} | {item["assetCount"]} |')
    MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "synced": len(imported),
        "siteTotal": len(merged),
        "images": sum(1 + int(item["assetCount"]) for item in imported),
        "backup": EXPORT.relative_to(ROOT).as_posix(),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
