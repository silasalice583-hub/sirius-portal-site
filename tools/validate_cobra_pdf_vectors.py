"""Verify vector collection page counts, text, dimensions, metadata and covers."""
import argparse
import json
from pathlib import Path
import pypdfium2 as pdfium
from pypdf import PdfReader
import split_cobra_pdf as splitter
from pdf_footer_cleanup import footer_lines

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "output/pdf/科幻小说文章拆分-矢量高清版"


def main(destination=DEST):
    plan = json.loads((destination / "文章目录.json").read_text(encoding="utf-8"))
    catalog = json.loads((destination / "导入索引.json").read_text(encoding="utf-8"))["articles"]
    errors, sparse = [], []
    pages_total = 0
    visible_text_pages = 0
    layout = splitter.load_layout()
    footer_checks = 0
    for index, article in enumerate(plan["articles"], 1):
        path = destination / article["file"]
        entry = catalog.get(path.name)
        if not path.is_file() or not entry:
            errors.append(f"Missing article/index: {article['number']}")
            continue
        if path.stat().st_size != entry["bytes"] or not path.with_suffix(".jpg").is_file():
            errors.append(f"Size/cover mismatch: {article['number']}")
        if PdfReader(path).metadata.title != article["title"] or entry["title"] != article["title"]:
            errors.append(f"Title mismatch: {article['number']}")
        pdf = pdfium.PdfDocument(path)
        if len(pdf) != len(article["segments"]):
            errors.append(f"Page count mismatch: {article['number']}")
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            hint = entry["pages"][page_index]
            width, height = page.get_size()
            if abs(width - hint["w"]) > .3 or abs(height - hint["h"]) > .3:
                errors.append(f"Dimensions mismatch: {article['number']}:{page_index + 1}")
            textpage = page.get_textpage()
            text = textpage.get_text_bounded()
            segment = article["segments"][page_index]
            crop_left, _, _, crop_top = page.get_cropbox()
            for footer in footer_lines(layout[segment["page"] - 1]):
                if not segment["top"] <= footer["top"] <= segment["bottom"]:
                    continue
                footer_checks += 1
                footer_text = textpage.get_text_bounded(width * .45 + crop_left,
                    crop_top - (footer["bottom"] - segment["top"]) - 3,
                    width * .55 + crop_left, crop_top - (footer["top"] - segment["top"]) + 3)
                if footer_text.strip():
                    errors.append(f"Footer still present: {article['number']}:{page_index + 1}: {footer_text!r}")
            textpage.close()
            expected = "".join(line["t"] for line in hint["lines"])
            actual_count = len("".join(text.split()))
            if expected.strip() and actual_count == 0:
                errors.append(f"Missing text: {article['number']}:{page_index + 1}")
            elif len(expected) > 30 and actual_count < len(expected.replace(" ", "")) * .65:
                sparse.append({"article": article["number"], "page": page_index + 1, "expected": len(expected), "actual": actual_count})
            visible = any(obj.type == pdfium.raw.FPDF_PAGEOBJ_TEXT
                          and pdfium.raw.FPDFTextObj_GetTextRenderMode(obj) != 3
                          for obj in page.get_objects())
            visible_text_pages += int(visible)
            pages_total += 1
            page.close()
        pdf.close()
        if index % 100 == 0:
            print(f"validated {index}/{len(plan['articles'])}", flush=True)
    pdf_count = len(list(destination.rglob("*.pdf")))
    if pdf_count != len(plan["articles"]):
        errors.append(f"Unexpected PDF count: {pdf_count}")
    report = {"articles": len(plan["articles"]), "pages": pages_total, "pagesWithVisibleVectorText": visible_text_pages,
              "verifiedFooterLocations": footer_checks, "errors": errors, "textChecksToReview": sparse}
    (destination / "矢量校验报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors or sparse:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--legacy", action="store_true")
    args = parser.parse_args()
    main(splitter.DEST if args.legacy else DEST)
