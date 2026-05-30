# Cloudflare Pages + Railway + PostgreSQL 部署

目标架构：

- 前端：Cloudflare Pages
- 后端：Railway Web Service
- 数据库：Railway PostgreSQL

## 1. 部署 Railway PostgreSQL

1. 打开 Railway，新建 Project。
2. 添加 `PostgreSQL` 服务。
3. Railway 会自动生成 `DATABASE_URL`。

## 2. 部署 Railway 后端

1. 在同一个 Railway Project 中添加一个 Web Service。
2. 选择本项目仓库。
3. Root Directory 填：

```text
backend
```

4. Railway 会使用 `backend/package.json` 和 `backend/railway.json`。
5. 给后端服务设置环境变量：

```text
DATABASE_URL=Railway PostgreSQL 自动提供的变量
CORS_ORIGIN=https://你的-cloudflare-pages域名.pages.dev
```

如果还没有 Cloudflare 域名，临时可以设置：

```text
CORS_ORIGIN=*
```

后端健康检查地址：

```text
https://你的-railway后端域名/api/health
```

返回 `{ "ok": true }` 即正常。

## 3. 配置前端 API 地址

打开前端根目录的 `config.js`，把 Railway 后端地址填进去：

```js
window.SIRIUS_API_BASE = "https://你的-railway后端域名";
```

不要在末尾加 `/`。

## 4. 部署 Cloudflare Pages 前端

1. 打开 Cloudflare Pages。
2. 新建 Pages 项目并连接仓库。
3. 构建设置：

```text
Framework preset: None
Build command: 留空
Build output directory: /
```

如果仓库根目录不是当前网站目录，就把 Root directory 设为当前网站目录。

## 5. 数据流

- 网站读取：Cloudflare Pages 前端请求 Railway `/api/state`
- 发布文章：后台编辑器请求 Railway `/api/articles`
- 页面设置：后台编辑器请求 Railway `/api/settings`
- 用户评论：前台提交到 Railway，默认 `approved=false`
- 评论审核：后台评论管理勾选“展示评论”后才会显示

## 6. 注意

当前后台编辑器是公开页面。正式上线后，建议再加登录鉴权，避免他人直接访问 `publisher.html` 修改内容。
