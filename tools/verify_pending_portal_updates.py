from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "exports" / "门户更新-2025-12-26至2026-08-08.json"
ARTICLE_DATA = ROOT / "articles-data.js"


def load_static_articles() -> list[dict[str, object]]:
    raw = ARTICLE_DATA.read_text(encoding="utf-8-sig").strip()
    prefix = "window.SIRIUS_ARTICLES = "
    if not raw.startswith(prefix) or not raw.endswith(";"):
        raise AssertionError("articles-data.js 外层格式错误")
    return json.loads(raw[len(prefix) : -1])


def local_references(article: dict[str, object]) -> list[str]:
    references = [str(article.get("cover", "")), str(article.get("sourceDoc", "")), str(article.get("sourcePdf", ""))]
    references += re.findall(r'(?:src|href)="([^"#]+)"', str(article.get("html", "")))
    return [value for value in references if value and not re.match(r"^(?:https?:|data:)", value)]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    payload = json.loads(EXPORT.read_text(encoding="utf-8"))
    articles = payload["articles"]
    static_articles = load_static_articles()
    static_by_id = {item["id"]: item for item in static_articles}

    assert payload["articleCount"] == 17 == len(articles), "文章数量不是17"
    assert len({item["id"] for item in articles}) == 17, "文章ID有重复"
    assert all(item["category"] == "门户更新" for item in articles), "分类不统一"
    dates = [item["date"] for item in articles]
    assert dates == sorted(dates, reverse=True), "导出包未按日期倒序排列"
    assert all(item["id"] in static_by_id for item in articles), "文章未全部写入静态网站数据"
    assert all(static_by_id[item["id"]]["html"] == item["html"] for item in articles), "网站正文与导出包不一致"

    missing = []
    radicals = []
    too_short = []
    for article in articles:
        for reference in local_references(article):
            clean = reference.split("?", 1)[0]
            if not (ROOT / clean).exists():
                missing.append((article["title"], clean))
        combined = article["title"] + "\n" + article["excerpt"] + "\n" + article["html"]
        unusual = sorted({char for char in combined if 0x2E80 <= ord(char) <= 0x2FFF})
        if unusual:
            radicals.append((article["title"], "".join(unusual)))
        visible = re.sub(r"<[^>]+>", "", article["html"])
        if len(visible.strip()) < 120:
            too_short.append(article["title"])

    assert not missing, f"缺少本地引用：{missing[:5]}"
    assert not radicals, f"仍有兼容部首字符：{radicals}"
    assert not too_short, f"正文过短：{too_short}"

    print(f"验证通过：{len(articles)}篇门户更新，网站文章总数{len(static_articles)}篇")
    for article in sorted(articles, key=lambda item: item["date"]):
        print(
            f'{article["date"]} | {article["title"]} | '
            f'正文{len(article["paragraphs"])}段 | 配图{article.get("assetCount", 0)}张'
        )


if __name__ == "__main__":
    main()
