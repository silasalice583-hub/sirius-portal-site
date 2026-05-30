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

## 推荐方式：Render

1. 把整个 `网站` 文件夹上传到 GitHub 仓库。
2. 打开 Render，新建 `Web Service`。
3. 选择刚才的仓库。
4. Render 会读取 `render.yaml`。
5. 部署完成后，Render 会给你一个公网网址。

启动命令：

```bash
npm start
```

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
