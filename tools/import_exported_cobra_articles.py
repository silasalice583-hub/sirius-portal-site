from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ARTICLE_DATA_PATH = ROOT / "articles-data.js"
ASSET_ROOT = ROOT / "assets" / "articles" / "cobra-archive"
EXPORT_PATH = ROOT / "exports" / "cobra-archive-articles.json"
SUMMARY_PATH = ROOT / "exports" / "cobra-archive-import-summary.json"
DEFAULT_SOURCE = Path.home() / "Downloads" / "整理"
BACKGROUND_PATH = ASSET_ROOT / "cover-background.png"


def article_payload(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict) and isinstance(payload.get("article"), dict):
        return dict(payload["article"])
    if not isinstance(payload, dict):
        raise ValueError("文章导出文件必须包含一个 JSON 对象")
    return dict(payload)


def title_date(title: str) -> str:
    match = re.search(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", title)
    if not match:
        return ""
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
    except ValueError:
        return ""


def corrected_date(article: dict[str, object]) -> tuple[str, bool]:
    current = str(article.get("date") or "")
    detected = title_date(str(article.get("title") or ""))
    if not detected:
        return current, False
    try:
        current_date = date.fromisoformat(current)
        detected_date = date.fromisoformat(detected)
    except ValueError:
        return detected, detected != current
    # Preserve plausible one-day publication offsets while correcting obvious year/day mistakes.
    should_correct = current_date.year != detected_date.year or abs((current_date - detected_date).days) > 7
    return (detected if should_correct else current), should_correct


def cover_title(title: str) -> str:
    cleaned = re.sub(r"^(?:\s*【(?:地球盟友|柯博拉\s*Cobra)】\s*)+", "", title, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip() or title


def normalize_image_tags(html: str, article_title: str) -> str:
    sequence = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal sequence
        sequence += 1
        tag = match.group(0)
        class_match = re.search(r"\bclass=([\"'])(.*?)\1", tag, flags=re.IGNORECASE | re.DOTALL)
        if class_match:
            classes = class_match.group(2).split()
            if "article-content-image" not in classes:
                classes.append("article-content-image")
            replacement = f'class={class_match.group(1)}{" ".join(classes)}{class_match.group(1)}'
            tag = tag[: class_match.start()] + replacement + tag[class_match.end() :]
        else:
            tag = tag[:-1] + ' class="article-content-image">'
        if not re.search(r"\bloading=", tag, flags=re.IGNORECASE):
            tag = tag[:-1] + ' loading="lazy">'
        if not re.search(r"\bdecoding=", tag, flags=re.IGNORECASE):
            tag = tag[:-1] + ' decoding="async">'
        if not re.search(r"\balt=", tag, flags=re.IGNORECASE):
            safe_title = article_title.replace('"', "&quot;")
            tag = tag[:-1] + f' alt="{safe_title} 配图 {sequence}">'
        return tag

    normalized = re.sub(r"<img\b[^>]*>", replace, html or "", flags=re.IGNORECASE)

    def justify_block(match: re.Match[str]) -> str:
        tag_name, attributes = match.group(1), match.group(2)
        style_match = re.search(r"\bstyle=([\"'])(.*?)\1", attributes, flags=re.IGNORECASE | re.DOTALL)
        if style_match:
            declarations = "; ".join(
                declaration.strip()
                for declaration in style_match.group(2).split(";")
                if declaration.strip()
                and declaration.split(":", 1)[0].strip().lower() not in {"text-align", "text-align-last", "text-justify"}
            )
            alignment = "text-align: justify; text-align-last: auto; text-justify: inter-ideograph;"
            style = f"{declarations}; {alignment}" if declarations else alignment
            replacement = f'style={style_match.group(1)}{style}{style_match.group(1)}'
            attributes = attributes[: style_match.start()] + replacement + attributes[style_match.end() :]
        else:
            attributes += ' style="text-align: justify; text-align-last: auto; text-justify: inter-ideograph;"'
        return f"<{tag_name}{attributes}>"

    return re.sub(r"<(p|div|blockquote|li)\b([^>]*)>", justify_block, normalized, flags=re.IGNORECASE)


def load_existing_articles() -> list[dict[str, object]]:
    source = ARTICLE_DATA_PATH.read_text(encoding="utf-8").strip()
    prefix = "window.SIRIUS_ARTICLES ="
    if not source.startswith(prefix):
        raise ValueError("articles-data.js 不是预期格式")
    return json.loads(source[len(prefix) :].strip().removesuffix(";").strip())


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = ["msyhbd.ttc", "simhei.ttf"] if bold else ["msyh.ttc", "simkai.ttf"]
    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in text:
        candidate = current + character
        width = draw.textbbox((0, 0), candidate, font=font)[2]
        if current and width > max_width:
            lines.append(current.strip())
            current = character
        else:
            current = candidate
    if current.strip():
        lines.append(current.strip())
    return lines


def prepared_background() -> Image.Image:
    source = Image.open(BACKGROUND_PATH).convert("RGB")
    # Use the generated star field while removing its imperfect emblem; a deterministic 12-point mark is drawn below.
    clean_field = source.crop((0, 0, int(source.width * 0.64), source.height))
    background = ImageOps.fit(clean_field, (1440, 810), method=Image.Resampling.LANCZOS)
    background = ImageEnhance.Color(background).enhance(1.08)
    overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, 1440, 810), fill=(2, 19, 44, 38))
    for index in range(240, 0, -1):
        alpha = max(0, int(54 * (1 - index / 240) ** 1.8))
        draw.ellipse((1170 - index, 390 - index, 1170 + index, 390 + index), fill=(18, 214, 177, alpha))
    background = Image.alpha_composite(background.convert("RGBA"), overlay)

    emblem = Image.new("RGBA", background.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(emblem)
    center_x, center_y = 1170, 390
    aqua = (148, 246, 226, 190)
    faint = (148, 246, 226, 95)
    draw.ellipse((920, 140, 1420, 640), outline=aqua, width=4)
    draw.ellipse((982, 202, 1358, 578), outline=faint, width=2)
    points: list[tuple[float, float]] = []
    for index in range(24):
        radius = 206 if index % 2 == 0 else 88
        angle = -math.pi / 2 + index * math.pi / 12
        points.append((center_x + math.cos(angle) * radius, center_y + math.sin(angle) * radius))
    draw.line(points + [points[0]], fill=aqua, width=5, joint="curve")
    for tip in points[::2]:
        draw.line((center_x, center_y, tip[0], tip[1]), fill=faint, width=2)
    draw.ellipse((center_x - 7, center_y - 7, center_x + 7, center_y + 7), fill=(208, 255, 246, 225))
    return Image.alpha_composite(background, emblem).convert("RGB")


def draw_cover(master: Image.Image, article: dict[str, object], destination: Path) -> None:
    image = master.copy().convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((54, 50, 875, 755), radius=18, fill=(1, 16, 39, 74), outline=(159, 246, 226, 42), width=2)
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)

    title = cover_title(str(article.get("title") or "未命名文章"))
    category = str(article.get("category") or "门户更新")
    title_font: ImageFont.ImageFont | None = None
    title_lines: list[str] = []
    for size in range(58, 37, -2):
        candidate_font = load_font(size, bold=True)
        candidate_lines = wrap_text(draw, title, candidate_font, 730)
        if len(candidate_lines) <= 4:
            title_font = candidate_font
            title_lines = candidate_lines
            break
    if title_font is None:
        title_font = load_font(38, bold=True)
        title_lines = wrap_text(draw, title, title_font, 730)
    if len(title_lines) > 4:
        title_lines = title_lines[:4]
        title_lines[-1] = title_lines[-1][:-1] + "…"

    label_font = load_font(23, bold=True)
    date_font = load_font(26, bold=True)
    footer_font = load_font(20)
    draw.text((84, 88), f"SIRIUS PORTAL  ·  {category}", fill=(165, 248, 228, 255), font=label_font)
    top = 226 - (len(title_lines) - 2) * 20
    line_height = int(getattr(title_font, "size", 46) * 1.5)
    for index, line in enumerate(title_lines):
        draw.text((84, top + index * line_height), line, fill=(249, 255, 255, 255), font=title_font)
    draw.line((84, 632, 610, 632), fill=(151, 242, 222, 225), width=4)
    draw.text((84, 670), str(article.get("date") or ""), fill=(239, 255, 252, 238), font=date_font)
    draw.text((84, 719), "天狼星门户", fill=(165, 248, 228, 240), font=footer_font)

    destination.parent.mkdir(parents=True, exist_ok=True)
    rgb = image.convert("RGB")
    rgb.save(destination, "JPEG", quality=88, optimize=True, progressive=True)
    mobile = ImageOps.fit(rgb, (640, 360), method=Image.Resampling.LANCZOS)
    mobile.save(destination.with_name("cover-mobile.webp"), "WEBP", quality=80, method=6)


def normalize_article(article: dict[str, object], master: Image.Image) -> tuple[dict[str, object], bool]:
    title = str(article.get("title") or "导入文章").strip()
    normalized_date, date_changed = corrected_date(article)
    article_id = str(article.get("id") or "").strip()
    if not article_id:
        article_id = "cobra-" + hashlib.sha1(f"{normalized_date}|{title}".encode("utf-8")).hexdigest()[:16]
    slug_hash = hashlib.sha1(f"{normalized_date}|{title}".encode("utf-8")).hexdigest()[:10]
    slug = f"{normalized_date or 'undated'}-{slug_hash}"
    cover_path = ASSET_ROOT / slug / "cover.jpg"

    normalized = {
        **article,
        "id": article_id,
        "title": title,
        "category": str(article.get("category") or "门户更新").strip(),
        "date": normalized_date or date.today().isoformat(),
        "cover": cover_path.relative_to(ROOT).as_posix(),
        "coverMobile": cover_path.with_name("cover-mobile.webp").relative_to(ROOT).as_posix(),
        # These local exports contain a generated 160-character summary. Imported archive entries intentionally omit it.
        "excerpt": "",
        "commentMode": str(article.get("commentMode") or "all"),
        "contentType": str(article.get("contentType") or "article"),
        "html": normalize_image_tags(str(article.get("html") or ""), title),
        "archived": bool(article.get("archived", False)),
        "deleted": False,
    }
    draw_cover(master, normalized, cover_path)
    return normalized, date_changed


def main() -> None:
    parser = argparse.ArgumentParser(description="导入本地 Publisher JSON，并生成统一的星空十二芒星封面。")
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    source: Path = args.source
    if not source.exists():
        raise SystemExit(f"找不到导出目录：{source}")
    if not BACKGROUND_PATH.exists():
        raise SystemExit(f"找不到封面背景：{BACKGROUND_PATH}")

    files = sorted(source.glob("*.json"), key=lambda item: (item.stat().st_mtime_ns, item.name.lower()))
    latest_by_id: dict[str, tuple[Path, dict[str, object]]] = {}
    for path in files:
        article = article_payload(path)
        key = str(article.get("id") or "").strip() or f"file:{path.name}"
        latest_by_id[key] = (path, article)

    master = prepared_background()
    master.save(ASSET_ROOT / "cover-master.jpg", "JPEG", quality=90, optimize=True, progressive=True)
    imported: list[dict[str, object]] = []
    corrected_files: list[str] = []
    for path, article in latest_by_id.values():
        normalized, changed = normalize_article(article, master)
        imported.append(normalized)
        if changed:
            corrected_files.append(path.name)
    imported.sort(key=lambda item: (str(item.get("date") or ""), str(item.get("title") or "")), reverse=True)

    existing = load_existing_articles()
    imported_ids = {str(article["id"]) for article in imported}
    imported_signatures = {(str(article.get("date") or ""), str(article.get("title") or "")) for article in imported}
    retained = [
        article
        for article in existing
        if str(article.get("id") or "") not in imported_ids
        and (str(article.get("date") or ""), str(article.get("title") or "")) not in imported_signatures
    ]
    combined = retained + imported
    combined.sort(key=lambda item: (str(item.get("date") or ""), str(item.get("title") or "")), reverse=True)

    ARTICLE_DATA_PATH.write_text(
        "window.SIRIUS_ARTICLES = " + json.dumps(combined, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    EXPORT_PATH.write_text(json.dumps(imported, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "sourceDirectory": str(source),
        "sourceFileCount": len(files),
        "importedArticleCount": len(imported),
        "duplicateExportsRemoved": len(files) - len(imported),
        "clearedExcerptCount": sum(1 for article in imported if not article.get("excerpt")),
        "dateCorrections": corrected_files,
        "articleDataCount": len(combined),
        "coverBackground": BACKGROUND_PATH.relative_to(ROOT).as_posix(),
        "coverPromptMode": "OpenAI built-in image generation plus deterministic typography and exact 12-point geometry",
        "coverPrompt": "Create a reusable 16:9 article-cover background: deep navy-to-teal starfield and subtle nebula, luminous geometric 12-point star on the right, generous clean space on the left, refined editorial style, no text, no letters, no logo, no watermark.",
        "coverEditPrompt": "Change only the right-side geometric star emblem to exactly twelve distinct, evenly spaced points; preserve the entire starry navy-to-teal background, nebula, glow, circles, right-side placement, left-side negative space, 16:9 framing, and colors; no text, letters, logo, or watermark; do not crop the emblem; avoid eight-pointed or six-pointed stars and hexagrams.",
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
