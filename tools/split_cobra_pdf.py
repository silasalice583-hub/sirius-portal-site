"""Split the supplied COBRA compilation into independently viewable article PDFs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"D:\办公\COBRA\COBRA文档\上传\导出页面自 科幻小说（更新至202608.08）后.pdf")
TMP = ROOT / "tmp" / "pdfs"
LAYOUT_PATH = TMP / "cobra-compilation-layout.jsonl"
CANDIDATES_PATH = TMP / "cobra-compilation-candidates.json"
PLAN_PATH = TMP / "cobra-compilation-plan-v2.json"
OCR_PATH = TMP / "cobra-image-ocr.json"
DEST = ROOT / "output" / "pdf" / "科幻小说文章拆分-可复制文字版"
ZIP_PATH = DEST.with_suffix(".zip")

# These are genuinely separate headings that use other title styles than the
# dominant 【地球盟友】 pattern. Locations were checked against the source layout.
EXTRA_TITLES = [
    (865, 83.03), (904, 448.67), (925, 83.03), (954, 440.87),
    (1330, 87.20), (1339, 161.60), (1346, 72.20), (1356, 72.15),
    (1359, 310.94), (1360, 608.97), (1366, 543.49), (1372, 720.29),
    (1377, 539.13), (1384, 214.95), (1414, 83.03), (1596, 247.20),
    (1721, 78.56), (1813, 82.09), (1853, 488.39), (1871, 737.99),
    (1881, 315.94), (1970, 303.11), (2040, 378.83), (2096, 727.31),
    (2115, 83.03), (2370, 75.23), (2376, 415.31), (2391, 670.31),
    (2432, 578.03), (2448, 744.23), (2465, 587.51), (2479, 100.07),
    (2495, 545.87), (2517, 149.63), (2530, 293.51), (2544, 450.11),
    (2571, 209.87), (2601, 268.57), (2675, 719.51), (2722, 282.80), (2756, 447.23),
    (2768, 182.27), (2775, 693.11), (2783, 207.11), (2796, 521.03),
    (2813, 487.67), (2859, 82.79), (2943, 82.79), (2963, 82.79),
    (2979, 82.79), (2988, 82.79), (2991, 82.79), (3023, 82.79),
    (3046, 731.87), (3052, 82.79), (3056, 82.79), (3057, 82.79),
    (3059, 133.79), (3060, 158.63),
]

TITLE_OVERRIDES = {
    1813: "2020 柯博拉紧急通知",
    1881: "2020 年 3 月柯博拉与蔷薇圣女团访谈",
    2115: "2021 年 3 月 11 日法国蔷薇圣女团主持的柯博拉访谈节目",
    2601: "2023 年 7 月 9 日会议笔记–第二天",
    2722: "2024 年 COBRA 凤凰城扬升会议：第二日",
    2963: "2025 年日本团队就安努塔拉对 C 进行访谈",
}

DATE_OVERRIDES = {3328: "2026-08-08"}


def compact(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", "", value).replace("·", "")


def candidate_kind(text: str, page_number: int, size: float) -> str | None:
    s = compact(text)
    if len(s) > 160:
        return None
    year = re.search(r"20(?:1[2-9]|2[0-6])", s[:75])
    if year and re.match(r"^(?:\(中译\))?【?地球盟友", s):
        return "earth-allies"
    if year and re.match(r"^【(?:柯博拉|Cobra|COBRA)", s, re.I):
        return "cobra-bracket"
    if year and page_number >= 2900 and re.match(r"^【?20(?:2[4-6])(?:年|[./-])", s):
        return "recent-date"
    if year and page_number >= 2900 and re.match(r"^故事连载[:：]20", s):
        return "recent-story"
    if page_number >= 2900 and size >= 15 and len(s) >= 8 and re.match(r"^(?:【|20(?:2[4-6])|柯博拉|COBRA|Cobra)", s):
        return "recent-large"
    return None


def scan() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    candidates = []
    sizes = Counter()
    with pdfplumber.open(SOURCE) as pdf, LAYOUT_PATH.open("w", encoding="utf-8") as output:
        for index, page in enumerate(pdf.pages):
            page_number = index + 1
            raw_lines = page.extract_text_lines() or []
            lines = []
            for raw in raw_lines:
                text = (raw.get("text") or "").strip()
                if not text:
                    continue
                size = round(max((float(char.get("size") or 0) for char in raw.get("chars", [])), default=0), 1)
                line = {
                    "text": text,
                    "top": round(float(raw["top"]), 2),
                    "bottom": round(float(raw["bottom"]), 2),
                    "size": size,
                }
                lines.append(line)
                sizes[size] += 1
                kind = candidate_kind(text, page_number, size)
                if kind:
                    candidates.append({"page": page_number, "line": len(lines) - 1, "kind": kind, **line})
            output.write(json.dumps({"page": page_number, "height": float(page.height), "lines": lines}, ensure_ascii=False) + "\n")
            if page_number % 200 == 0:
                print(f"scanned {page_number}/{len(pdf.pages)} pages; {len(candidates)} title candidates", flush=True)
    CANDIDATES_PATH.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "pages": page_number,
        "candidates": len(candidates),
        "byKind": dict(Counter(item["kind"] for item in candidates)),
        "commonFontSizes": sizes.most_common(12),
        "layout": str(LAYOUT_PATH),
        "candidatesFile": str(CANDIDATES_PATH),
    }, ensure_ascii=False, indent=2))


def load_layout() -> list[dict]:
    with LAYOUT_PATH.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream]


def date_from_title(title: str) -> tuple[str, str]:
    s = compact(title)
    full = re.search(r"(?<!\d)(20(?:1[2-9]|2[0-6]))(?:年|[./-])?(\d{1,2})?(?:月|[./-])?(\d{1,2})?", s)
    if full:
        year, month, day = full.groups()
        if month and day and 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
            return year, f"{year}-{int(month):02d}-{int(day):02d}"
        return year, year
    short = re.search(r"(?<!\d)(2[5-6])\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})(?!\d)",
                      unicodedata.normalize("NFKC", title))
    if short:
        year, month, day = short.groups()
        return "20" + year, f"20{year}-{int(month):02d}-{int(day):02d}"
    return "", ""


def category_for(title: str) -> str:
    s = compact(title).lower()
    if any(token in s for token in ("访谈", "采访", "专访", "interview")):
        return "访谈"
    if any(token in s for token in ("会议", "工作坊", "研讨会", "讲座", "峰会")):
        return "会议"
    return "门户更新"


def safe_name(title: str) -> str:
    title = re.sub(r"^【地球盟友】(?:【柯博拉\s*Cobra】)?", "", title, flags=re.I)
    title = re.sub(r"^【(?:柯博拉|Cobra)】", "", title, flags=re.I)
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", title)
    title = re.sub(r"\s+", " ", title).strip(" .-_—")
    return title[:128].rstrip(" .-_—") or "未命名文章"


def complete_heading(pages: list[dict], item: dict, minimum_lines: int = 1) -> str:
    """Join a wrapped heading using its own type size, including a page break."""
    title = item["text"].strip()
    page_index, line_index = item["page"] - 1, item["line"]
    previous = pages[page_index]["lines"][line_index]
    for continuation in range(6):
        if continuation + 1 >= minimum_lines and title.count("【") <= title.count("】") and len(compact(title)) >= len(compact(item.get("title", ""))):
            break
        line_index += 1
        crossed_page = False
        while page_index < len(pages):
            lines = pages[page_index]["lines"]
            while line_index < len(lines) and lines[line_index]["text"].strip().isdigit():
                line_index += 1
            if line_index < len(lines):
                break
            page_index += 1
            line_index = 0
            crossed_page = True
        if page_index >= len(pages):
            break
        nxt = pages[page_index]["lines"][line_index]
        if nxt["size"] < item["size"] * .88:
            break
        if not crossed_page and nxt["top"] - previous["bottom"] > max(36, item["size"] * 3):
            break
        value = nxt["text"].strip()
        if re.match(r"^(?:【地球盟友】|https?://|原文[:：])", value):
            break
        separator = " " if re.search(r"[A-Za-z0-9]$", title) and re.match(r"[A-Za-z]", value) else ""
        title += separator + value
        previous = nxt
    # The heading may be immediately followed by a source URL on the same line.
    return re.split(r"[:：]?\s*https?://|主讲者[:：]", title, maxsplit=1)[0].strip()


def make_plan() -> dict:
    pages = load_layout()
    raw = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    titles = []
    for item in raw:
        if item["kind"] == "recent-date" and item["size"] < 12:
            continue
        titles.append(item)
    for page_number, top in EXTRA_TITLES:
        page = pages[page_number - 1]
        matches = [(abs(line["top"] - top), i, line) for i, line in enumerate(page["lines"])]
        distance, line_index, line = min(matches)
        if distance > 0.5:
            raise ValueError(f"No title line at page {page_number}, y={top}; nearest gap {distance:.2f}")
        if any(t["page"] == page_number and abs(t["top"] - line["top"]) < 0.5 for t in titles):
            continue
        titles.append({"page": page_number, "line": line_index, "kind": "manual", **line})
    titles.sort(key=lambda item: (item["page"], item["top"]))

    for item in titles:
        page = pages[item["page"] - 1]
        lines = page["lines"]
        following = lines[item["line"] + 1] if item["line"] + 1 < len(lines) else None
        large_wrapped = ("【" not in item["text"] and len(compact(item["text"])) >= 28
                         and item["size"] >= 12.5 and following
                         and following["size"] >= item["size"] * .98
                         and following["top"] - item["bottom"] < 26)
        title = TITLE_OVERRIDES.get(item["page"], complete_heading(pages, item, minimum_lines=2 if large_wrapped else 1))
        # Preserve titles continued onto a second display line.
        i = item["line"]
        if item["page"] not in TITLE_OVERRIDES and i + 1 < len(lines):
            nxt = lines[i + 1]
            if (0 < nxt["top"] - item["bottom"] < 22
                    and nxt["size"] >= 13
                    and ("【" in title and title.count("【") > title.count("】")
                         or title.endswith(("灵魂家族", "黄金", "乔瑟夫·麦")))):
                title += " " + nxt["text"]
        item["title"] = title
        previous = [line for line in lines if line["bottom"] < item["top"] - 0.5]
        if not previous:
            item["cut"] = 0.0
        else:
            last = max(previous, key=lambda line: line["bottom"])
            item["cut"] = round((last["bottom"] + item["top"]) / 2, 2)
        year, date = date_from_title(title)
        date = DATE_OVERRIDES.get(item["page"], date)
        if not year:
            if item["page"] < 2370:
                year = "2020"
            elif item["page"] < 2900:
                year = "2024"
            else:
                year = "2025"
            date = year
            item["yearInferred"] = True
        item["year"] = year
        item["date"] = date
        item["category"] = category_for(title)

    # The cut at the next heading is also the previous article's endpoint.
    # A zero cut on the next page means the previous article ends on the prior page.
    for number, item in enumerate(titles, 1):
        next_item = titles[number] if number < len(titles) else {"page": len(pages) + 1, "cut": 0}
        segments = []
        for page_number in range(item["page"], next_item["page"] + 1):
            if page_number > len(pages):
                break
            top = item["cut"] if page_number == item["page"] else 0.0
            bottom = next_item["cut"] if page_number == next_item["page"] else pages[page_number - 1]["height"]
            if bottom - top >= 8:
                segments.append({"page": page_number, "top": top, "bottom": round(bottom, 2)})
        if not segments:
            raise ValueError(f"Empty article at {item['page']} {item['title']}")
        item["number"] = number
        item["segments"] = segments
        item["file"] = str(Path(item["category"]) / item["year"] / f"{number:04d}_{item['date']}_{safe_name(item['title'])}.pdf")
    if titles[0]["page"] != 1 or titles[0]["cut"] != 0:
        raise ValueError("The beginning of the source PDF is not covered")
    if titles[-1]["segments"][-1]["page"] != len(pages):
        raise ValueError("The end of the source PDF is not covered")
    plan = {
        "source": str(SOURCE),
        "sourcePages": len(pages),
        "articles": titles,
        "countsByCategory": dict(Counter(item["category"] for item in titles)),
        "countsByYear": dict(sorted(Counter(item["year"] for item in titles).items())),
    }
    TMP.mkdir(parents=True, exist_ok=True)
    PLAN_PATH.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: plan[key] for key in ("sourcePages", "countsByCategory", "countsByYear")}
                     | {"articleCount": len(titles), "plan": str(PLAN_PATH)}, ensure_ascii=False, indent=2))
    return plan


def cropped_page(pdfium_document, page_number: int, top: float, bottom: float,
                 page_width: float, page_height: float, source_lines: list[dict]):
    """Preserve the crop visually and restore its source text as a selectable layer."""
    import pypdfium2 as pdfium
    from PIL import Image
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas
    from pypdf import PdfReader

    page = pdfium_document[page_number - 1]
    bitmap = page.render(scale=2.0)
    image = bitmap.to_pil().convert("RGB")
    top_px = round(top / page_height * image.height)
    bottom_px = round(bottom / page_height * image.height)
    image = image.crop((0, max(0, top_px), image.width, min(image.height, bottom_px)))
    jpeg = io.BytesIO()
    image.save(jpeg, format="JPEG", quality=90, subsampling=0)
    jpeg.seek(0)
    result = io.BytesIO()
    height = bottom - top
    output = canvas.Canvas(result, pagesize=(page_width, height), pageCompression=1)
    output.drawImage(ImageReader(jpeg), 0, 0, width=page_width, height=height)
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    for line in source_lines:
        if line["top"] < top - 0.4 or line["bottom"] > bottom + 0.4:
            continue
        value = (line.get("text") or "").strip()
        if not value:
            continue
        size = max((float(char.get("size") or 0) for char in line.get("chars", [])), default=10.5)
        text = output.beginText()
        text.setTextOrigin(float(line.get("x0", 0)), height - (float(line["bottom"]) - top))
        text.setFont("STSong-Light", max(5, min(size, 32)))
        text.setTextRenderMode(3)  # Invisible, searchable/copyable text over the source pixels.
        text.textOut(value)
        output.drawText(text)
    output.showPage()
    output.save()
    result.seek(0)
    bitmap.close()
    page.close()
    return PdfReader(result).pages[0]


def ocr_lines_for(record: dict, page_width: float, page_height: float) -> list[dict]:
    width = record["imageWidth"]
    height = record["imageHeight"]
    lines = []
    for line in record["lines"]:
        top = float(line["top"]) / height * page_height
        bottom = float(line["bottom"]) / height * page_height
        lines.append({
            "text": line["text"],
            "x0": float(line["x0"]) / width * page_width,
            "top": top,
            "bottom": bottom,
            "chars": [{"size": max(7, min(bottom - top, 24))}],
        })
    return lines


def build(limit: int | None = None) -> None:
    import pypdfium2 as pdfium
    from pypdf import PdfReader, PdfWriter

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    ocr = json.loads(OCR_PATH.read_text(encoding="utf-8"))["pages"]
    selected = plan["articles"][:limit] if limit else plan["articles"]
    DEST.mkdir(parents=True, exist_ok=True)
    source = PdfReader(str(SOURCE), strict=False)
    source_text = pdfplumber.open(SOURCE)
    pdfium_document = pdfium.PdfDocument(str(SOURCE))
    cached_page_number = None
    cached_lines = []
    for index, article in enumerate(selected, 1):
        target = DEST / article["file"]
        if target.exists() and target.stat().st_size > 0:
            if index % 50 == 0:
                print(f"built or reused {index}/{len(selected)} PDFs; current source page {article['page']}", flush=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        writer = PdfWriter()
        for segment in article["segments"]:
            source_page = source.pages[segment["page"] - 1]
            height = float(source_page.mediabox.height)
            width = float(source_page.mediabox.width)
            ocr_record = ocr.get(str(segment["page"]))
            if ocr_record:
                writer.add_page(cropped_page(pdfium_document, segment["page"], segment["top"],
                                             segment["bottom"], width, height,
                                             ocr_lines_for(ocr_record, width, height)))
            elif segment["top"] <= 0.01 and segment["bottom"] >= height - 0.01:
                # Some source pages contain malformed annotation arrays. Drop
                # them only in the in-memory reader; the source file is untouched.
                if "/Annots" in source_page:
                    del source_page["/Annots"]
                writer.add_page(source_page)
            else:
                if cached_page_number != segment["page"]:
                    cached_lines = source_text.pages[segment["page"] - 1].extract_text_lines() or []
                    cached_page_number = segment["page"]
                writer.add_page(cropped_page(pdfium_document, segment["page"], segment["top"],
                                             segment["bottom"], width, height, cached_lines))
        writer.add_metadata({
            "/Title": article["title"],
            "/Subject": f"COBRA compilation; source pages {article['segments'][0]['page']}-{article['segments'][-1]['page']}",
        })
        with target.open("wb") as stream:
            writer.write(stream)
        if index % 50 == 0 or index == len(selected):
            print(f"built {index}/{len(selected)} PDFs; current source page {article['page']}", flush=True)
    pdfium_document.close()
    source_text.close()
    if limit:
        return
    metadata = {
        "source": str(SOURCE),
        "sourcePages": plan["sourcePages"],
        "articleCount": len(plan["articles"]),
        "countsByCategory": plan["countsByCategory"],
        "countsByYear": plan["countsByYear"],
        "articles": [{key: article[key] for key in ("number", "title", "category", "year", "date", "file", "segments")}
                     for article in plan["articles"]],
    }
    (DEST / "文章目录.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DEST / "图片页文字识别校对.json").write_text(json.dumps({
        "note": "以下图片页使用 OCR 生成可复制文字层；识别文字未经人工逐字校对，原图保持可见。",
        "pages": [{"sourcePage": int(page), "confidence": record["confidence"],
                   "lineCount": len(record["lines"]), "verified": record.get("verified", False)}
                  for page, record in ocr.items()],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (DEST / "文章目录.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(["序号", "文章类型", "年份", "日期", "文章标题", "源PDF起始页", "源PDF结束页", "文件路径"])
        for article in plan["articles"]:
            writer.writerow([article["number"], article["category"], article["year"], article["date"],
                             article["title"], article["segments"][0]["page"],
                             article["segments"][-1]["page"], article["file"]])


def validate() -> None:
    from pypdf import PdfReader

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    issues = []
    total_bytes = 0
    copyable_pages = 0
    for index, article in enumerate(plan["articles"], 1):
        path = DEST / article["file"]
        if not path.exists():
            issues.append(f"Missing {article['file']}")
            continue
        total_bytes += path.stat().st_size
        try:
            pages = PdfReader(str(path), strict=False).pages
            actual = len(pages)
            expected = len(article["segments"])
            if actual != expected:
                issues.append(f"Page count {actual} != {expected}: {article['file']}")
            for page_index, page in enumerate(pages):
                if (page.extract_text() or "").strip():
                    copyable_pages += 1
                else:
                    issues.append(f"No selectable text on page {page_index + 1}: {article['file']}")
        except Exception as exc:
            issues.append(f"Unreadable {article['file']}: {exc}")
        if index % 100 == 0:
            print(f"validated {index}/{len(plan['articles'])}", flush=True)
    report = {
        "source": str(SOURCE),
        "sourcePages": plan["sourcePages"],
        "articlesExpected": len(plan["articles"]),
        "articlesChecked": len(plan["articles"]) - len(issues),
        "pdfBytes": total_bytes,
        "copyablePages": copyable_pages,
        "issues": issues,
    }
    (DEST / "拆分校验报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if issues:
        raise RuntimeError(f"Validation found {len(issues)} problems")


def package() -> None:
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for path in sorted(DEST.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(DEST))
    print(f"ZIP {ZIP_PATH} ({ZIP_PATH.stat().st_size:,} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["scan", "plan", "build", "validate", "package"])
    parser.add_argument("--limit", type=int, default=None, help="Build the first N PDFs for a test run")
    args = parser.parse_args()
    if args.action == "scan":
        scan()
    elif args.action == "plan":
        make_plan()
    elif args.action == "build":
        build(args.limit)
    elif args.action == "validate":
        validate()
    elif args.action == "package":
        package()


if __name__ == "__main__":
    main()
