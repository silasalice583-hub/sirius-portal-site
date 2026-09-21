"""Repair derived PDFs in place; preserve the source and avoid ZIP/duplicate copies."""
import argparse
import io
import json
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject

import split_cobra_pdf as splitter
from pdf_footer_cleanup import erase_footer, footer_lines


def repair(folder, numbers=None):
    plan = json.loads((folder / "文章目录.json").read_text(encoding="utf-8"))
    catalog_path = folder / "导入索引.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    layout = splitter.load_layout()
    vector = folder.name.endswith("矢量高清版")
    records = []
    bytes_before = bytes_after = 0
    for index, article in enumerate(plan["articles"], 1):
        if numbers and article["number"] not in numbers:
            continue
        path = folder / article["file"]
        if not path.resolve().is_relative_to(folder.resolve()):
            raise ValueError("Unexpected PDF target")
        entry = catalog["articles"][path.name]
        page_footers = []
        expected_footer_count = 0
        for page_index, segment in enumerate(article["segments"]):
            verified = footer_lines(layout[segment["page"] - 1])
            expected_footer_count += sum(segment["top"] <= line["top"] and line["bottom"] <= segment["bottom"] for line in verified)
            hints = entry["pages"][page_index]
            page_footers.append([line for line in hints["lines"]
                                 if any(line["t"] == footer["text"]
                                        and abs(line["y"] + segment["top"] - footer["top"]) < 1
                                        for footer in verified)])
        original_size = path.stat().st_size
        reader = PdfReader(path)
        metadata = dict(reader.metadata or {})
        if not vector and not expected_footer_count and metadata.get("/Title") == article["title"]:
            reader.close()
            continue
        # Idempotent: index footer rows have already been removed after repair.
        if metadata.get("/SiriusFooterPolicy") == "source-verified-v1":
            entry["bytes"] = original_size
            entry["footerNumbersRemoved"] = True
            for page_index, footers in enumerate(page_footers):
                entry["pages"][page_index]["lines"] = [line for line in entry["pages"][page_index]["lines"] if line not in footers]
            records.append({"number": article["number"], "file": article["file"], "footerNumbers": expected_footer_count})
            reader.close()
            continue
        document = pdfium.PdfDocument(path)
        for page_index, footers in enumerate(page_footers):
            if not footers:
                continue
            page = document[page_index]
            crop_left, _, _, crop_top = page.get_cropbox()
            rectangles = [(crop_left + line["x"] - 3, crop_top - line["b"] - 3,
                           crop_left + line["x"] + len(line["t"]) * line["s"] * .7 + 4,
                           crop_top - line["y"] + 3) for line in footers]
            erase_footer(page, rectangles, mask_pixels=not vector)
            page.close()
        stream = io.BytesIO()
        document.save(stream)
        document.close()
        stream.seek(0)
        edited = PdfReader(stream)
        writer = PdfWriter()
        for page in edited.pages:
            if "/Annots" in page:
                page[NameObject("/Annots")] = ArrayObject([
                    ref for ref in page["/Annots"] if isinstance(ref.get_object(), DictionaryObject)
                    and (ref.get_object().get("/A") is None
                         or isinstance(ref.get_object()["/A"], DictionaryObject))])
            writer.add_page(page)
        metadata.update({"/Title": article["title"], "/SiriusFooterPolicy": "source-verified-v1"})
        writer.add_metadata(metadata)
        writer.compress_identical_objects()
        temp = path.with_suffix(".pdf.partial")
        with temp.open("wb") as output:
            writer.write(output)
        if len(PdfReader(temp).pages) != len(article["segments"]):
            raise ValueError(f"Page count changed: {path}")
        reader.close()
        temp.replace(path)
        entry["bytes"] = path.stat().st_size
        entry["footerNumbersRemoved"] = True
        for page_index, footers in enumerate(page_footers):
            entry["pages"][page_index]["lines"] = [line for line in entry["pages"][page_index]["lines"] if line not in footers]
        records.append({"number": article["number"], "file": article["file"], "footerNumbers": expected_footer_count})
        bytes_before += original_size
        bytes_after += path.stat().st_size
        if index % 50 == 0:
            print(f"{folder.name}: {index}/{len(plan['articles'])}", flush=True)
    # PDF markers allow interrupted runs to restore the index without re-editing.
    catalog_temp = catalog_path.with_suffix(".json.partial")
    catalog_temp.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    catalog_temp.replace(catalog_path)
    report = {"changedArticles": len(records), "removedFooterNumbers": sum(r["footerNumbers"] for r in records),
              "bytesBefore": bytes_before, "bytesAfter": bytes_after, "articles": records}
    if not numbers:
        (folder / "页码清理报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "articles"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--numbers", type=int, nargs="*")
    parser.add_argument("--collection", choices=["both", "vector", "legacy"], default="both")
    args = parser.parse_args()
    for name in ("科幻小说文章拆分-矢量高清版", "科幻小说文章拆分-可复制文字版"):
        if args.collection == "vector" and not name.endswith("矢量高清版"):
            continue
        if args.collection == "legacy" and not name.endswith("可复制文字版"):
            continue
        repair(splitter.ROOT / "output/pdf" / name, args.numbers)
