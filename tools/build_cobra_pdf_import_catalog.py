"""Build import hints for the rasterized portions of the split COBRA PDFs.

The catalog contains extracted text and illustration rectangles, not the source
PDF bytes. It lets the browser import the previously split PDFs without OCR.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "tmp" / "pdfs" / "cobra-compilation-plan-v2.json"
PDF_DIR = ROOT / "output" / "pdf" / "科幻小说文章拆分-可复制文字版"
OUTPUT = PDF_DIR / "导入索引.json"
OCR = ROOT / "tmp" / "pdfs" / "cobra-image-ocr.json"


def color_hex(value) -> str:
    if not isinstance(value, (list, tuple)):
        return ""
    if len(value) == 1:
        rgb = [float(value[0])] * 3
    elif len(value) == 3:
        rgb = [float(channel) for channel in value]
    elif len(value) == 4:
        c, m, y, k = (float(channel) for channel in value)
        rgb = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
    else:
        return ""
    code = "#" + "".join(f"{round(max(0, min(1, channel)) * 255):02x}" for channel in rgb)
    return "" if code in {"#000000", "#ffffff"} else code


def extract_line(raw: dict, offset: float, page_height: float) -> dict | None:
    text = (raw.get("text") or "").strip()
    if not text:
        return None
    if raw["bottom"] > page_height - 16 and text.isdigit():
        return None  # printed source-page number, not article text
    chars = raw.get("chars") or []
    colors = Counter(color_hex(char.get("non_stroking_color")) for char in chars if char.get("text", "").strip())
    color = colors.most_common(1)[0][0] if colors else ""
    result = {
        "t": text,
        "y": round(float(raw["top"]) - offset, 1),
        "b": round(float(raw["bottom"]) - offset, 1),
        "x": round(float(raw.get("x0", 0)), 1),
        "s": round(max((float(char.get("size") or 0) for char in chars), default=10.5), 1),
    }
    if color:
        result["c"] = color
    if chars and sum("Bold" in str(char.get("fontname")) for char in chars) > len(chars) / 2:
        result["w"] = 1
    return result


def main() -> None:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    ocr = json.loads(OCR.read_text(encoding="utf-8"))["pages"]
    entries = {}
    by_page = defaultdict(list)
    for article in plan["articles"]:
        path = PDF_DIR / article["file"]
        if not path.is_file():
            raise FileNotFoundError(path)
        name = path.name
        if name in entries:
            raise ValueError(f"Duplicate PDF filename: {name}")
        entry = {
            "id": f"cobra-pdf-{article['number']:04d}",
            "file": name,
            "bytes": path.stat().st_size,
            "title": article["title"],
            "category": article["category"],
            "date": article["date"],
            "year": article["year"],
            "pages": [None] * len(article["segments"]),
        }
        entries[name] = entry
        for index, segment in enumerate(article["segments"]):
            by_page[segment["page"]].append((entry, index, segment))

    with pdfplumber.open(plan["source"]) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            raw_lines = page.extract_text_lines() or []
            images = page.images or []
            for entry, index, segment in by_page[page_number]:
                top, bottom = segment["top"], segment["bottom"]
                lines = [extract_line(raw, top, page.height) for raw in raw_lines
                         if raw["top"] >= top - 0.4 and raw["bottom"] <= bottom + 0.4]
                pictures = []
                for image in images:
                    image_top = float(image["top"])
                    image_bottom = float(image["bottom"])
                    if image_bottom <= top or image_top >= bottom:
                        continue
                    x0, x1 = float(image["x0"]), float(image["x1"])
                    y0, y1 = max(top, image_top), min(bottom, image_bottom)
                    if x1 - x0 < 24 or y1 - y0 < 24:
                        continue
                    pictures.append({"x": round(x0, 1), "y": round(y0 - top, 1),
                                     "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)})
                entry["pages"][index] = {
                    "w": round(float(page.width), 1),
                    "h": round(bottom - top, 1),
                    "lines": [line for line in lines if line],
                    "images": pictures,
                }
                if not entry["pages"][index]["lines"] and str(page_number) in ocr:
                    record = ocr[str(page_number)]
                    entry["pages"][index]["ocr"] = [{
                        "t": line["text"],
                        "x": round(line["x0"] / record["imageWidth"] * page.width, 1),
                        "y": round(line["top"] / record["imageHeight"] * page.height - top, 1),
                        "b": round(line["bottom"] / record["imageHeight"] * page.height - top, 1),
                        "s": 11,
                    } for line in record["lines"]]
            if page_number % 250 == 0:
                print(f"indexed {page_number}/{len(pdf.pages)} source pages", flush=True)

    if any(any(page is None for page in entry["pages"]) for entry in entries.values()):
        raise ValueError("At least one split-PDF page was not indexed")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"version": 1, "articles": entries}, ensure_ascii=False, separators=(",", ":")),
                      encoding="utf-8")
    print(f"catalog: {len(entries)} PDFs; {OUTPUT.stat().st_size:,} bytes; {OUTPUT}")


if __name__ == "__main__":
    main()
