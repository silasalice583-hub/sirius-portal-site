"""Generate one category-aware cover beside every split COBRA PDF."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "tmp" / "pdfs" / "cobra-compilation-plan-v2.json"
PDF_ROOT = ROOT / "output" / "pdf" / "科幻小说文章拆分-可复制文字版"
BACKGROUND_ROOT = ROOT / "assets" / "articles" / "cobra-pdf-covers"
BACKGROUND_BY_CATEGORY = {
    "门户更新": BACKGROUND_ROOT / "background-portal-updates.png",
    "会议": BACKGROUND_ROOT / "background-meetings.png",
    "访谈": BACKGROUND_ROOT / "background-interviews.png",
}
PALETTE_BY_CATEGORY = {
    "门户更新": {"accent": (145, 246, 225), "soft": (93, 224, 209), "panel": (1, 20, 44)},
    "会议": {"accent": (248, 218, 145), "soft": (187, 164, 255), "panel": (12, 14, 51)},
    "访谈": {"accent": (255, 173, 222), "soft": (129, 224, 255), "panel": (15, 15, 53)},
}


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = ["msyhbd.ttc", "simhei.ttf"] if bold else ["msyh.ttc", "simkai.ttf"]
    for name in candidates:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def clean_title(value: str) -> str:
    title = re.sub(r"^(?:\s*【(?:地球盟友|柯博拉\s*Cobra|COBRA)】\s*)+", "", value, flags=re.I)
    return re.sub(r"\s+", " ", title).strip() or value


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in text:
        candidate = current + character
        if current and draw.textbbox((0, 0), candidate, font=font)[2] > width:
            lines.append(current.strip())
            current = character
        else:
            current = candidate
    if current.strip():
        lines.append(current.strip())
    return lines


def background_for(category: str) -> Image.Image:
    path = BACKGROUND_BY_CATEGORY[category]
    if not path.is_file():
        raise FileNotFoundError(path)
    source = Image.open(path).convert("RGB")
    base = ImageOps.fit(source, (1440, 810), method=Image.Resampling.LANCZOS)
    return ImageEnhance.Color(base).enhance(1.04).convert("RGBA")


def draw_twelve_point_mark(image: Image.Image, category: str) -> None:
    palette = PALETTE_BY_CATEGORY[category]
    draw = ImageDraw.Draw(image, "RGBA")
    center_x, center_y = 1170, 388
    accent = (*palette["accent"], 214)
    soft = (*palette["soft"], 112)
    draw.ellipse((918, 136, 1422, 640), outline=accent, width=4)
    draw.ellipse((982, 200, 1358, 576), outline=soft, width=2)
    points: list[tuple[float, float]] = []
    for index in range(24):
        radius = 204 if index % 2 == 0 else 88
        angle = -math.pi / 2 + index * math.pi / 12
        points.append((center_x + math.cos(angle) * radius, center_y + math.sin(angle) * radius))
    draw.line(points + [points[0]], fill=accent, width=5, joint="curve")
    for tip in points[::2]:
        draw.line((center_x, center_y, tip[0], tip[1]), fill=soft, width=2)
    if category == "会议":
        for index in range(12):
            angle = -math.pi / 2 + index * math.pi / 6
            x = center_x + math.cos(angle) * 245
            y = center_y + math.sin(angle) * 245
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=accent)
    elif category == "访谈":
        draw.arc((900, 118, 1440, 658), 205, 335, fill=(*palette["soft"], 170), width=4)
        draw.arc((900, 118, 1440, 658), 25, 155, fill=(*palette["accent"], 170), width=4)
    draw.ellipse((center_x - 7, center_y - 7, center_x + 7, center_y + 7), fill=(*palette["accent"], 238))


def make_cover(background: Image.Image, article: dict, destination: Path) -> None:
    category = str(article["category"])
    palette = PALETTE_BY_CATEGORY[category]
    image = background.copy()
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay, "RGBA")
    overlay_draw.rounded_rectangle(
        (54, 50, 875, 755), radius=18,
        fill=(*palette["panel"], 108), outline=(*palette["accent"], 60), width=2,
    )
    image = Image.alpha_composite(image, overlay)
    draw_twelve_point_mark(image, category)
    draw = ImageDraw.Draw(image)

    title = clean_title(str(article["title"]))
    title_font: ImageFont.ImageFont | None = None
    title_lines: list[str] = []
    for size in range(58, 35, -2):
        candidate = load_font(size, bold=True)
        lines = wrap_text(draw, title, candidate, 730)
        if len(lines) <= 4:
            title_font, title_lines = candidate, lines
            break
    if title_font is None:
        title_font = load_font(36, bold=True)
        title_lines = wrap_text(draw, title, title_font, 730)[:4]
        if title_lines:
            title_lines[-1] = title_lines[-1][:-1] + "…"

    accent = (*palette["accent"], 255)
    draw.text((84, 88), f"SIRIUS PORTAL  ·  {category}", fill=accent, font=load_font(23, bold=True))
    top = 226 - (len(title_lines) - 2) * 20
    line_height = int(getattr(title_font, "size", 46) * 1.5)
    for index, line in enumerate(title_lines):
        draw.text((84, top + index * line_height), line, fill=(249, 255, 255, 255), font=title_font)
    draw.line((84, 632, 610, 632), fill=accent, width=4)
    draw.text((84, 670), str(article.get("date") or article.get("year") or ""),
              fill=(242, 252, 255, 245), font=load_font(26, bold=True))
    draw.text((84, 719), "天狼星门户", fill=accent, font=load_font(20))

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(destination, "JPEG", quality=89, optimize=True, progressive=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="为拆分 PDF 批量生成同名星空十二芒星封面")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    articles = plan["articles"][:args.limit] if args.limit else plan["articles"]
    backgrounds = {category: background_for(category) for category in BACKGROUND_BY_CATEGORY}
    manifest = []
    for index, article in enumerate(articles, 1):
        pdf_path = PDF_ROOT / article["file"]
        if not pdf_path.is_file():
            raise FileNotFoundError(pdf_path)
        cover_path = pdf_path.with_suffix(".jpg")
        if args.overwrite or not cover_path.is_file():
            make_cover(backgrounds[article["category"]], article, cover_path)
        manifest.append({
            "id": f"cobra-pdf-{article['number']:04d}",
            "pdf": pdf_path.relative_to(PDF_ROOT).as_posix(),
            "cover": cover_path.relative_to(PDF_ROOT).as_posix(),
            "category": article["category"],
            "title": article["title"],
        })
        if index % 100 == 0 or index == len(articles):
            print(f"generated or reused {index}/{len(articles)} covers", flush=True)
    if not args.limit:
        (PDF_ROOT / "封面目录.json").write_text(
            json.dumps({"version": 1, "count": len(manifest), "covers": manifest}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
