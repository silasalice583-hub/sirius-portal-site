from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--per-sheet", type=int, default=15)
    args = parser.parse_args()

    pages = sorted(args.input_dir.glob("page-*.png"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    columns = 3
    rows = math.ceil(args.per_sheet / columns)
    thumb_w, thumb_h = 255, 330
    label_h, gap = 22, 10
    canvas_w = columns * thumb_w + (columns + 1) * gap
    canvas_h = rows * (thumb_h + label_h) + (rows + 1) * gap
    font = ImageFont.load_default()

    for sheet_index in range(math.ceil(len(pages) / args.per_sheet)):
        canvas = Image.new("RGB", (canvas_w, canvas_h), "#D9DEE5")
        draw = ImageDraw.Draw(canvas)
        chunk = pages[sheet_index * args.per_sheet : (sheet_index + 1) * args.per_sheet]
        for index, path in enumerate(chunk):
            row, column = divmod(index, columns)
            left = gap + column * (thumb_w + gap)
            top = gap + row * (thumb_h + label_h + gap)
            with Image.open(path) as image:
                page = image.convert("RGB")
                page.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                x = left + (thumb_w - page.width) // 2
                y = top + (thumb_h - page.height) // 2
                canvas.paste(page, (x, y))
            label = path.stem.replace("page-", "第") + "页"
            draw.text((left + 4, top + thumb_h + 3), label, fill="#1F2933", font=font)
        output = args.output_dir / f"contact-{sheet_index + 1:02d}.png"
        canvas.save(output, quality=92)
    print(f"pages={len(pages)} sheets={math.ceil(len(pages) / args.per_sheet)}")


if __name__ == "__main__":
    main()
