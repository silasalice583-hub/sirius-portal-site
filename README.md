# 天狼星门户网站

这是一个静态前端与独立内容 API 组合的网站项目。前端可直接本地预览；线上内容通过 Cloudflare Pages Functions 转发到 Railway + PostgreSQL。

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

然后访问 `http://localhost:8088/index.html`。文章发布器位于 `/publisher.html`，网页编辑器位于 `/site-editor.html`。

## 内容维护

- 页面设置和线上文章通过后端 API 保存。
- `content/articles/` 保存内置文章的原始资料。
- 修改原始文章资料后，可运行 `python tools/generate_articles.py` 重新生成 `articles-data.js`。
- 部署方式见 [`docs/CLOUDFLARE_RAILWAY_DEPLOY.md`](docs/CLOUDFLARE_RAILWAY_DEPLOY.md) 和 [`docs/DEPLOY.md`](docs/DEPLOY.md)。
