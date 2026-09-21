"""Restore the split collection from source PDF objects; repair wrapped titles."""
from __future__ import annotations

import argparse
import copy
import io
import json
import re
import shutil
from collections import Counter
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject

import split_cobra_pdf as splitter
from pdf_footer_cleanup import erase_footer, footer_lines
from generate_cobra_pdf_covers import background_for, make_cover

ROOT = splitter.ROOT
OLD = splitter.DEST
DEST = ROOT / "output/pdf/科幻小说文章拆分-矢量高清版"


def fixed_plan():
    plan = json.loads(splitter.PLAN_PATH.read_text(encoding="utf-8"))
    layout = splitter.load_layout()
    catalog = json.loads((OLD / "导入索引.json").read_text(encoding="utf-8"))["articles"]
    corrections = []
    for article in plan["articles"]:
        article["previousFile"] = article["file"]
        lines = catalog[Path(article["file"]).name]["pages"][0]["lines"]
        large_wrapped = (len(lines) >= 2 and "【" not in article["title"]
                         and splitter.compact(article["title"]) == splitter.compact(lines[0]["t"])
                         and lines[0]["s"] >= 12.5 and lines[1].get("w")
                         and lines[1]["s"] >= lines[0]["s"] * .98 and lines[1]["y"] - lines[0]["b"] < 26)
        if article["title"].count("【") > article["title"].count("】") or large_wrapped:
            previous = article["title"]
            article["title"] = splitter.complete_heading(layout, article, minimum_lines=2 if large_wrapped else 1)
            if article["title"].count("【") != article["title"].count("】"):
                raise ValueError(f"Unresolved title: {article['number']} {article['title']}")
            # Keep all three existing category folders: this is a title correction,
            # not a reclassification of articles which mention meetings in passing.
            name = splitter.safe_name(article["title"])
            article["file"] = str(Path(article["category"]) / article["year"] / f"{article['number']:04d}_{article['date']}_{name}.pdf")
            corrections.append({"id": f"cobra-pdf-{article['number']:04d}", "previousTitle": previous,
                                "title": article["title"], "previousFile": article["previousFile"], "file": article["file"]})
    return plan, corrections


def source_page(document, source, segment, source_layout=None):
    """Copy and crop without screenshotting; discard off-crop text objects."""
    document.import_pages(source, [segment["page"] - 1])
    page = document[len(document) - 1]
    width, height = page.get_size()
    lower, upper = height - segment["bottom"], height - segment["top"]
    # Only visit top-level objects; form descendants belong to their form object.
    for obj in list(page.get_objects(max_depth=1)):
        left, bottom, right, top = obj.get_bounds()
        if top <= lower or bottom >= upper:
            page.remove_obj(obj)
            obj.close()
    if source_layout is not None:
        rectangles = [(width * .45, height - line["bottom"] - 3, width * .55, height - line["top"] + 3)
                      for line in footer_lines(source_layout)
                      if segment["top"] <= line["top"] and line["bottom"] <= segment["bottom"]]
        erase_footer(page, rectangles)
    page.set_mediabox(0, lower, width, upper)
    page.set_cropbox(0, lower, width, upper)
    page.gen_content()
    page.close()


def build_article(source, article, destination, ocr_pages, layout):
    document = pdfium.PdfDocument.new()
    for segment in article["segments"]:
        source_page(document, source, segment, layout[segment["page"] - 1])
    data = io.BytesIO()
    document.save(data)
    document.close()
    data.seek(0)
    writer = PdfWriter()
    reader = PdfReader(data)
    original = None
    for index, segment in enumerate(article["segments"]):
        if str(segment["page"]) in ocr_pages:
            # Real scanned source pages have no vector text to restore; preserve
            # their existing searchable OCR layer instead of silently losing it.
            if original is None:
                original = PdfReader(OLD / article["previousFile"])
            page = original.pages[index]
        else:
            page = reader.pages[index]
        if "/Annots" in page:
            annotations = []
            for reference in page["/Annots"]:
                annotation = reference.get_object()
                if not isinstance(annotation, DictionaryObject):
                    continue
                action = annotation.get("/A")
                if action is not None and not isinstance(action.get_object(), DictionaryObject):
                    continue
                annotations.append(reference)
            page[NameObject("/Annots")] = ArrayObject(annotations)
        writer.add_page(page)
    writer.add_metadata({"/Title": article["title"],
                         "/Subject": f"COBRA source vector objects; source pages {article['segments'][0]['page']}-{article['segments'][-1]['page']}",
                         "/Keywords": f"cobra-pdf-{article['number']:04d};{article['category']};{article['date']}"})
    writer.compress_identical_objects()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as stream:
        writer.write(stream)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--numbers", type=int, nargs="*")
    parser.add_argument("--repair-old-index", action="store_true")
    args = parser.parse_args()
    plan, corrections = fixed_plan()
    layout = splitter.load_layout()
    selected = [a for a in plan["articles"] if not args.numbers or a["number"] in args.numbers]
    catalog = json.loads((OLD / "导入索引.json").read_text(encoding="utf-8"))
    ocr_pages = json.loads(splitter.OCR_PATH.read_text(encoding="utf-8"))["pages"]
    entries, manifest = {}, []
    backgrounds = {}
    source = pdfium.PdfDocument(str(splitter.SOURCE))
    for index, article in enumerate(selected, 1):
        target = DEST / article["file"]
        previous_output = DEST / article["previousFile"]
        if target != previous_output and previous_output.exists():
            backup = ROOT / "output/pdf/矢量生成过程备份" / article["previousFile"]
            for old, saved in ((previous_output, backup), (previous_output.with_suffix(".jpg"), backup.with_suffix(".jpg"))):
                if old.exists() and not saved.exists():
                    if not old.resolve().is_relative_to(DEST.resolve()) or not saved.resolve().is_relative_to((ROOT / "output/pdf").resolve()):
                        raise ValueError("Unexpected backup target")
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(old, saved)
        if not target.exists():
            build_article(source, article, target, ocr_pages, layout)
        entry = copy.deepcopy(catalog["articles"][Path(article["previousFile"]).name])
        entry.update(file=target.name, title=article["title"], bytes=target.stat().st_size, vectorSource=True)
        for page_index, segment in enumerate(article["segments"]):
            footers = footer_lines(layout[segment["page"] - 1])
            entry["pages"][page_index]["lines"] = [line for line in entry["pages"][page_index]["lines"]
                if not any(line["t"] == footer["text"] and abs(line["y"] + segment["top"] - footer["top"]) < 1
                           for footer in footers)]
        entries[target.name] = entry
        cover = target.with_suffix(".jpg")
        old_cover = (OLD / article["previousFile"]).with_suffix(".jpg")
        changed = any(c["id"] == entry["id"] for c in corrections)
        if not cover.exists():
            if old_cover.exists() and not changed:
                shutil.copy2(old_cover, cover)
            else:
                category = article["category"]
                if category not in backgrounds:
                    backgrounds[category] = background_for(category)
                make_cover(backgrounds[category], article, cover)
        manifest.append({"id": entry["id"], "pdf": article["file"], "cover": str(Path(article["file"]).with_suffix(".jpg")),
                         "title": article["title"], "category": article["category"]})
        if index % 25 == 0 or index == len(selected):
            print(f"vector PDFs {index}/{len(selected)}", flush=True)
    source.close()
    if args.numbers:
        print(json.dumps({"samples": [a["file"] for a in selected]}, ensure_ascii=False))
        return
    (DEST / "导入索引.json").write_text(json.dumps({"version": 1, "articles": entries}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DEST / "文章目录.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    (DEST / "封面目录.json").write_text(json.dumps({"version": 1, "count": len(manifest), "covers": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    (DEST / "标题修复记录.json").write_text(json.dumps(corrections, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {"articles": len(entries), "correctedTitles": len(corrections), "sourceImagePages": sorted(map(int, ocr_pages)),
              "countsByCategory": dict(Counter(a["category"] for a in plan["articles"])), "source": str(splitter.SOURCE)}
    (DEST / "矢量恢复报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.repair_old_index:
        backup = ROOT / "output/pdf/标题修复前索引备份"
        backup.mkdir(exist_ok=True)
        for filename in ("导入索引.json", "文章目录.json", "封面目录.json"):
            path = OLD / filename
            if not path.exists():
                continue
            if not (backup / filename).exists():
                shutil.copy2(path, backup / filename)
            data = json.loads(path.read_text(encoding="utf-8"))
            items = data.get("articles", data.get("covers", []))
            values = items.values() if isinstance(items, dict) else items
            for entry in values:
                identifier = entry.get("id", f"cobra-pdf-{entry.get('number', 0):04d}")
                change = next((c for c in corrections if c["id"] == identifier), None)
                if change:
                    entry["title"] = change["title"]
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
