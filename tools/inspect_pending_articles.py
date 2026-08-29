from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "content" / "待补充"


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(path))]


def inspect_docx(path: Path) -> dict[str, object]:
    document = Document(path)
    paragraphs = []
    for paragraph in document.paragraphs:
        text = re.sub(r"\s+", " ", paragraph.text).strip()
        if text:
            paragraphs.append({"style": paragraph.style.name, "text": text})
    return {
        "paragraph_count": len(paragraphs),
        "image_count": len(document.inline_shapes),
        "date_anchors": [
            {"index": index, "text": item["text"][:180]}
            for index, item in enumerate(paragraphs)
            if re.search(r"202[5-6][.年/-]\s*\d{1,2}", item["text"])
        ][:20],
        "sample": paragraphs[:5],
    }


def inspect_pdf(path: Path) -> dict[str, object]:
    reader = PdfReader(path)
    samples = []
    total_characters = 0
    for index, page in enumerate(reader.pages):
        text = re.sub(r"\s+", " ", page.extract_text() or "").strip()
        total_characters += len(text)
        if text and len(samples) < 2:
            samples.append({"page": index + 1, "text": text[:320]})
    return {
        "page_count": len(reader.pages),
        "character_count": total_characters,
        "sample": samples,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    records = []
    for path in sorted(SOURCE_ROOT.rglob("*"), key=natural_key):
        if not path.is_file() or path.suffix.lower() not in {".docx", ".pdf"}:
            continue
        record = {
            "path": path.relative_to(ROOT).as_posix(),
            "size": path.stat().st_size,
            "type": path.suffix.lower(),
        }
        try:
            record.update(inspect_docx(path) if path.suffix.lower() == ".docx" else inspect_pdf(path))
        except Exception as error:  # Inspection should continue for remaining files.
            record["error"] = str(error)
        records.append(record)
    print(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
