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
EDITOR_EMAIL=2663158081@qq.com
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=2663158081@qq.com
SMTP_PASS=QQ邮箱设置中生成的SMTP授权码
SMTP_FROM=2663158081@qq.com
```

`SMTP_PASS` 必须填写 QQ 邮箱生成的 SMTP 授权码，不是 QQ 登录密码。请先在 QQ 邮箱的“设置 → 账号与安全 → SMTP/IMAP 服务”中开启 SMTP 并生成授权码。密码校验只在 Railway 后端进行，前端页面不保存管理密码。

如需以后更换编辑器密码，可在 Railway 增加：

```text
EDITOR_PASSWORD=新的管理密码
```

更推荐使用 `EDITOR_PASSWORD_HASH` 保存 SHA-256 摘要；设置 `EDITOR_PASSWORD` 时会覆盖代码中的默认密码摘要。

如果还没有 Cloudflare 域名，临时可以设置：

```text
CORS_ORIGIN=*
```

后端健康检查地址：

```text
https://你的-railway后端域名/api/health
https://你的-railway后端域名/api/capabilities
https://你的-railway后端域名/api/version
```

新版后端的健康接口应返回包含 `apiVersion: 9`、`chunkedUploads: true`、`revisions: true`、`mediaUploads: true`、`articleDeletion: true` 和 `editorAuth: true` 的 JSON。若 `/api/version` 或 `/api/capabilities` 返回旧版本，说明 Railway 仍在运行旧版后端，需要重新部署 `backend` 目录。

## 3. 配置 Cloudflare API 代理

前端会请求同域 `/api/*`，再由 Cloudflare Pages Functions 转发到 Railway 后端。

在 Cloudflare Pages 项目的环境变量中添加：

```text
RAILWAY_API_BASE=https://你的-railway后端域名
```

不要填写 PostgreSQL 地址；这里必须是 Railway 后端 Web Service 的公网域名，例如 `https://xxx.up.railway.app`。

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

部署完成后访问：

```text
https://你的-pages域名/index.html
https://你的-pages域名/publisher.html
https://你的-pages域名/site-editor.html
https://你的-pages域名/api/health
```

## 5. 数据流

- 网站读取：Cloudflare Pages 前端请求同域 `/api/state`
- Cloudflare Pages Function 将 `/api/*` 转发到 Railway 后端
- 发布文章：后台编辑器请求同域 `/api/articles`，最终写入 Railway PostgreSQL
- 页面设置：页面编辑器请求同域 `/api/settings`，最终写入 Railway PostgreSQL
- 用户评论：前台提交到 Railway，默认 `approved=false`
- 评论审核：后台评论管理勾选“展示评论”后才会显示
- 编辑器登录：先校验管理密码，再向指定邮箱发送六位验证码，成功后签发 12 小时会话
- 写入保护：文章发布、删除、页面设置、媒体上传和评论审核接口都要求有效编辑器会话

## 6. 注意

`publisher.html` 和 `site-editor.html` 会在验证完成前隐藏编辑界面。页面本身属于静态资源，但所有可修改线上数据的 API 均由 Railway 后端强制鉴权，不能通过绕过前端直接写入。
