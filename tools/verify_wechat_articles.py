from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTICLE_DATA = ROOT / "articles-data.js"
BACKUP = ROOT / "exports" / "公众号文章备份-向明与苍焰-2026-08-30.json"
PREFIX = "window.SIRIUS_ARTICLES = "


def load_site_articles() -> list[dict[str, object]]:
    raw = ARTICLE_DATA.read_text(encoding="utf-8-sig").strip()
    assert raw.startswith(PREFIX) and raw.endswith(";"), "articles-data.js 外层格式错误"
    return json.loads(raw[len(PREFIX) : -1])


def main() -> None:
    backup = json.loads(BACKUP.read_text(encoding="utf-8"))
    articles = backup["articles"]
    site_by_id = {item["id"]: item for item in load_site_articles()}
    assert backup["articleCount"] == len(articles) == 33, "备份文章数量不正确"
    assert len({item["id"] for item in articles}) == 33, "文章 ID 重复"
    assert sum(item["canonicalAuthor"] == "向明" for item in articles) == 31, "向明文章数量不正确"
    assert sum(item["canonicalAuthor"] == "苍焰" for item in articles) == 2, "苍焰文章数量不正确"
    assert all(item["id"] in site_by_id for item in articles), "网站缺少备份文章"

    missing: list[str] = []
    invalid: list[str] = []
    for article in articles:
        site_article = site_by_id[article["id"]]
        if site_article["html"] != article["html"]:
            invalid.append(f'{article["title"]}: 网站正文与备份不一致')
        if "wechat-signature" not in article["html"]:
            invalid.append(f'{article["title"]}: 缺少正文署名')
        if re.search(r'<img[^>]+src="https?://', article["html"]):
            invalid.append(f'{article["title"]}: 正文仍引用远程图片')
        for reference in article["images"]:
            path = ROOT / reference
            if not path.is_file() or path.stat().st_size == 0:
                missing.append(str(reference))

    assert not missing, f"缺少本地图片：{missing[:5]}"
    assert not invalid, f"内容验证失败：{invalid[:5]}"
    print(
        f"验证通过：33篇公众号文章，向明31篇（含署名一目向明3篇），"
        f"苍焰2篇，本地原图{sum(len(item['images']) for item in articles)}个"
    )


if __name__ == "__main__":
    main()
