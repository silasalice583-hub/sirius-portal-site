const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 8088);
const host = process.env.HOST || "0.0.0.0";
const editorPasswordHash = String(
  process.env.EDITOR_PASSWORD_HASH ||
    (process.env.EDITOR_PASSWORD
      ? crypto.createHash("sha256").update(process.env.EDITOR_PASSWORD).digest("hex")
      : "cfece4ed04a0cf2bd6f0c365902927ca3c463d1171985900a34a11fa4ad153db"),
).toLowerCase();
const editorSessionLifetime = 12 * 60 * 60 * 1000;
const editorSessions = new Map();
const editorLoginAttempts = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeHashEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function readJson(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        tooLarge = true;
        reject(new Error("请求内容过大"));
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求格式无效"));
      }
    });
    req.on("error", reject);
  });
}

function getBearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function getEditorSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = hashText(token);
  const session = editorSessions.get(tokenHash);
  if (!session || session.expiresAt <= Date.now()) {
    editorSessions.delete(tokenHash);
    return null;
  }
  return { tokenHash, ...session };
}

function canAttemptEditorLogin(req) {
  const key = req.socket.remoteAddress || "local";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = (editorLoginAttempts.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= 8) {
    editorLoginAttempts.set(key, recent);
    return false;
  }
  recent.push(now);
  editorLoginAttempts.set(key, recent);
  return true;
}

async function handleLocalEditorAuth(req, res, url) {
  if (!url.pathname.startsWith("/api/local-editor-auth/")) return false;

  try {
    if (url.pathname === "/api/local-editor-auth/mode" && req.method === "GET") {
      sendJson(res, 200, { local: true, passwordOnly: true });
      return true;
    }

    if (url.pathname === "/api/local-editor-auth/password" && req.method === "POST") {
      if (!canAttemptEditorLogin(req)) {
        sendJson(res, 429, { error: "尝试次数过多，请稍后再试" });
        return true;
      }
      const body = await readJson(req);
      const submittedHash = hashText(body.password || "");
      if (!safeHashEqual(submittedHash, editorPasswordHash)) {
        sendJson(res, 401, { error: "密码不正确" });
        return true;
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + editorSessionLifetime;
      editorSessions.set(hashText(token), { expiresAt });
      sendJson(res, 200, { token, expiresAt });
      return true;
    }

    if (url.pathname === "/api/local-editor-auth/session" && req.method === "GET") {
      const session = getEditorSession(req);
      if (!session) {
        sendJson(res, 401, { error: "登录已失效" });
        return true;
      }
      sendJson(res, 200, { authenticated: true, expiresAt: session.expiresAt });
      return true;
    }

    if (url.pathname === "/api/local-editor-auth/logout" && req.method === "POST") {
      const session = getEditorSession(req);
      if (session) editorSessions.delete(session.tokenHash);
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 404, { error: "接口不存在" });
    return true;
  } catch (error) {
    sendJson(res, 400, { error: error.message || "请求处理失败" });
    return true;
  }
}

function safePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized);
  return filePath.startsWith(root) ? filePath : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (await handleLocalEditorAuth(req, res, url)) return;
  let requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safePath(requestPath);

  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError) {
      send(res, 404, "Not Found");
      return;
    }

    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    fs.readFile(finalPath, (readError, data) => {
      if (readError) {
        send(res, 404, "Not Found");
        return;
      }

      const ext = path.extname(finalPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": [".html", ".css", ".js"].includes(ext) ? "no-cache" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    });
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [tokenHash, session] of editorSessions) {
    if (session.expiresAt <= now) editorSessions.delete(tokenHash);
  }
}, 30 * 60 * 1000).unref();

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const base = `http://${displayHost}:${port}`;
  console.log("");
  console.log("天狼星之光服务器已启动");
  console.log(`前台网站: ${base}/index.html`);
  console.log(`后台编辑器: ${base}/publisher.html`);
  console.log("按 Ctrl+C 停止服务器");
  console.log("");
});
