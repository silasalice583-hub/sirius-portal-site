# 天狼星门户网站

这是一个静态前端与独立内容 API 组合的网站项目。前端可直接本地预览；线上内容通过 Cloudflare Pages Functions 转发到 Railway + PostgreSQL。

正式网站：[https://sirius-portal-site.pages.dev/](https://sirius-portal-site.pages.dev/)

## 目录结构

```text
网站/
├─ assets/                 网站图片与原始视觉素材
│  └─ source/              未直接被页面引用的原始图片
├─ backend/                Railway / PostgreSQL 内容 API
├─ content/
│  ├─ articles/            文章原稿、PDF、配图和文章音乐
│  └─ audio/               其他音频原始资料
├─ docs/                   部署文档
├─ functions/              Cloudflare Pages API 转发函数
├─ tools/                  内容数据生成脚本
├─ index.html              首页
├─ articles.html           文章页
├─ meditation.html         冥想页
├─ about.html              关于页
├─ publisher.html          文章发布器
├─ site-editor.html        网页编辑器
├─ app.js                  前台通用逻辑
├─ articles-data.js        内置文章数据
├─ api-client.js           前端内容 API 客户端
└─ styles.css              全站样式
```

## 本地运行

```bash
npm start
```

然后访问 `http://localhost:8088/index.html`。文章发布器位于 `/publisher.html`，网页编辑器位于 `/site-editor.html`。本地编辑器只验证管理密码；线上编辑器采用“管理密码 + 邮件六位验证码”双重验证，并要求连接已部署的后端 API。修改本地服务器代码后，请先按 `Ctrl+C` 停止旧进程，再重新运行 `npm start`。

## 内容维护

- 页面设置和线上文章通过后端 API 保存。
- `content/articles/` 保存内置文章的原始资料。
- 修改原始文章资料后，可运行 `python tools/generate_articles.py` 重新生成 `articles-data.js`。
- 部署方式见 [`docs/CLOUDFLARE_RAILWAY_DEPLOY.md`](docs/CLOUDFLARE_RAILWAY_DEPLOY.md) 和 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

### 批量导入 PDF 文章

在 `/publisher.html` 中点击“批量导入 PDF 与封面”选择多份文件，或点击“选择 PDF 与封面文件夹”选择解压后的整批文章目录。导入器会把与 PDF 主文件名完全相同的 `.jpg`、`.jpeg`、`.png` 或 `.webp` 自动识别为该文封面，表格会逐篇显示匹配结果；也可以先选 PDF，再单独补选一批同名封面。导入前可以逐篇核对、修改标题、发布日期、分类并取消勾选。默认先存入归档栏，确认无误后再公开；“直接公开发布”可在导入前选择。JSON 文章仍可批量导入。

此次拆分的 786 篇 PDF 使用新版目录 `output/pdf/科幻小说文章拆分-可复制文字版/`，仅分为“门户更新、会议、访谈”三类，并按年份保存。每篇 PDF 旁边都有一张主文件名完全一致的 JPG 封面：门户更新使用青绿星云、会议使用紫金星云与环形节点、访谈使用紫红/青色星云与对话弧线；三类都保留统一的星空、十二芒星、标题和日期模板。`封面目录.json` 记录全部对应关系。共享源页的截取内容保留原图外观，同时从源 PDF 恢复可复制文字层；源 PDF 原本只有图片的 8 页有 OCR 或人工转写文字层，其中 6 页的 OCR 结果仍需人工核对，具体见目录内的 `图片页文字识别校对.json`。旧版拆分目录没有覆盖。新版配套索引 `导入索引.json` 也包含在新版 ZIP 中。选择解压后的整批文章文件夹时会自动读取；如单独挑选 PDF，可先点“单独选择导入索引”。索引仅在浏览器本机读取，不作为网站静态资源部署。文件名和大小匹配时，可恢复标题、日期和分类。

PDF 正文使用“嵌入式 PDF”模式：导入器上传原 PDF 文件，阅读页再用 PDF.js 的画布层和可选择文字层逐页呈现，不把 PDF 重新拼成 HTML 段落，也不把正文仅转换成图片。因此 PDF 的物理换行、字体颜色、图片与文字相对位置都会保留，文字仍可选择、复制和搜索，导入时不会默认设置两端对齐；页面会在桌面端和手机端等比例缩放。原 PDF 上传失败会自动重试 3 次，并在仍然失败时保留该文章为失败状态供重试。简介始终为空；可选是否在文章末尾显示原 PDF 下载链接。附件单文件上限为 48 MB。本地预览模式把 PDF 与同名封面保存在 IndexedDB，大容量二进制文件不会再转成 Base64 塞入容量有限的 localStorage；文章记录只保存短引用，关闭并重新打开浏览器后仍可读取。正式批量导入仍建议在已连接线上后端的编辑器中进行。

导入会逐篇保存并显示进度和失败项；批量导入时请保持页面打开。重新导入同一个索引文件会更新同一篇文章。源 PDF 和拆分输出保存在本地 `output/`，不进入网站部署。运行 `node --test tests/pdf-import.test.js` 可校验标题、日期、分类、封面匹配、颜色和图片处理。重新生成时依次执行 `python tools/split_cobra_pdf.py plan`、`node tools/ocr_cobra_image_pages.js`（需要 `npm install`、Poppler 的 `pdftoppm`）、`python tools/split_cobra_pdf.py build`、`python tools/split_cobra_pdf.py validate`、`python tools/build_cobra_pdf_import_catalog.py`、`python tools/generate_cobra_pdf_covers.py --overwrite` 和 `python tools/split_cobra_pdf.py package`。
