"""Remove verified compilation footer numbers without rasterizing page content."""
import re
import pypdfium2 as pdfium


def footer_lines(source_page):
    return [line for line in source_page["lines"]
            if re.fullmatch(r"\s*\d{1,4}\s*", line["text"])
            and line["top"] > source_page["height"] * .94 and line["size"] <= 10]


def erase_footer(page, rectangles, mask_pixels=False):
    """Rectangles are PDF coordinates. Legacy screenshots also need a white mask."""
    removed = 0
    textpage = page.get_textpage()
    to_remove = []
    for obj in list(page.get_objects(max_depth=1, textpage=textpage)):
        if obj.type != pdfium.raw.FPDF_PAGEOBJ_TEXT:
            continue
        left, bottom, right, top = obj.get_bounds()
        if any(left >= r[0] and bottom >= r[1] and right <= r[2] and top <= r[3] for r in rectangles):
            if re.fullmatch(r"\s*\d{1,4}\s*", obj.extract()):
                to_remove.append(obj)
    textpage.close()
    for obj in to_remove:
        page.remove_obj(obj)
        obj.close()
        removed += 1
    if mask_pixels:
        for left, bottom, right, top in rectangles:
            raw = pdfium.raw.FPDFPageObj_CreateNewRect(left, bottom, right - left, top - bottom)
            pdfium.raw.FPDFPageObj_SetFillColor(raw, 255, 255, 255, 255)
            pdfium.raw.FPDFPath_SetDrawMode(raw, pdfium.raw.FPDF_FILLMODE_WINDING, 0)
            page.insert_obj(pdfium.PdfObject(raw))
    if removed or mask_pixels:
        page.gen_content()
    return removed
