# 天狼星门户上线部署说明

## 本机预览

双击 `start-server.bat`，或在当前文件夹运行：

```bash
npm start
```

前台：

```text
http://localhost:8088/index.html
```

后台：

```text
http://localhost:8088/publisher.html
```

## 正式部署：Cloudflare Pages + Railway

正式网站地址：

```text
https://sirius-portal-site.pages.dev/
```

Cloudflare Pages 连接 GitHub 仓库 `silasalice583-hub/sirius-portal-site`，生产分支使用 `main`。提交并推送到 `main` 后，Cloudflare Pages 自动更新前端；Railway 使用同一仓库的 `backend` 目录部署 API。

Cloudflare Pages 设置：

```text
Framework preset: None
Build command: 留空
Build output directory: /
RAILWAY_API_BASE=https://你的-Railway-后端域名
```

Railway 设置：

```text
Root Directory: backend
CORS_ORIGIN=https://sirius-portal-site.pages.dev
```

完整步骤见 `docs/CLOUDFLARE_RAILWAY_DEPLOY.md`。

## Docker / 云服务器

在服务器中进入网站目录后运行：

```bash
docker build -t sirius-portal .
docker run -d --name sirius-portal -p 8088:8088 sirius-portal
```

访问：

```text
http://服务器IP:8088/index.html
```

## 普通 VPS

服务器安装 Node.js 后，上传整个网站目录，然后运行：

```bash
npm install
npm start
```

如需后台持续运行，可以使用 `pm2`：

```bash
npm install -g pm2
pm2 start server.js --name sirius-portal
pm2 save
```

## 注意

当前文章编辑器使用浏览器本地存储。也就是说，在后台编辑器里新增的文章会保存在当前浏览器中。若要把新增文章变成所有访客都能看到的正式内容，请使用“导出 JSON”，再把内容合并进站点数据，或后续升级成带数据库的后台。
