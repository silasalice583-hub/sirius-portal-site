const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3000);
const apiVersion = 12;
const retiredArticleIds = new Set([
  "article-1", "article-2", "article-3", "article-4", "article-5",
  "article-6", "article-7", "article-8", "article-9", "article-10",
]);
const retiredArticleSignatures = new Set([
  "2025-08-19|相干信号——量变引发质变", "2025-08-18|由人们的生活想到的",
  "2025-08-17|助推说明", "2025-08-16|聚精会神，塑造美好未来",
  "2025-08-14|25.8.14 扬升门户开启第2部分", "2025-08-12|8月，让它发生",
  "2025-08-08|故事：简报", "2025-08-04|25.8.4 最终更新&新访谈",
  "2025-07-30|八月星象 访谈", "2025-07-29|25.7.29 门户更新&联合访谈",
]);
const defaultCategories = ["门户更新", "会议", "访谈", "重要冥想", "文章更新", "相关资料"];
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((item) => item.trim());
const databaseUrl = process.env.DATABASE_URL;
const editorEmail = (process.env.EDITOR_EMAIL || "2663158081@qq.com").trim().toLowerCase();
const defaultEditorPasswordHash = "cfece4ed04a0cf2bd6f0c365902927ca3c463d1171985900a34a11fa4ad153db";
const configuredEditorPasswordHash = String(process.env.EDITOR_PASSWORD_HASH || defaultEditorPasswordHash).trim().toLowerCase();
const editorPasswordHash = process.env.EDITOR_PASSWORD
  ? crypto.createHash("sha256").update(process.env.EDITOR_PASSWORD, "utf8").digest("hex")
  : configuredEditorPasswordHash;
const otpLifetimeMs = 10 * 60 * 1000;
const editorSessionLifetimeMs = 12 * 60 * 60 * 1000;
const editorChallenges = new Map();
const editorSessions = new Map();
const authRateLimits = new Map();
let mailTransporter = null;

if (!databaseUrl) {
  console.error("DATABASE_URL is missing. Add a Railway variable reference from the Postgres service to this API service.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "70mb" }));

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function normalizeCategory(category) {
  return category === "冥想发布" ? "重要冥想" : category;
}

function isRetiredArticle(article) {
  return retiredArticleIds.has(article.id)
    || retiredArticleSignatures.has(`${article.date || ""}|${article.title || ""}`);
}

function normalizeCategories(categories) {
  const source = categories?.length ? categories : defaultCategories;
  const normalized = [...new Set(source.map(normalizeCategory).filter(Boolean))];
  if (!normalized.includes("重要冥想")) normalized.push("重要冥想");
  if (!normalized.includes("相关资料")) normalized.push("相关资料");
  return normalized;
}

function normalizeSettings(settings = {}) {
  const next = { ...settings, categories: normalizeCategories(settings.categories || []) };
  if (next.page) {
    next.page = { ...next.page };
    if (next.page.brandName === "天狼星之光") next.page.brandName = "天狼星门户";
    if (["Sirius Portal Journal", "Light of Sirius Journal", "Light of Sirius"].includes(next.page.heroEyebrow)) next.page.heroEyebrow = "Sirius Portal";
    if (next.page.heroTitle === "天狼星之光") next.page.heroTitle = "天狼星门户";
    if ([
      "以博客杂志的方式整理门户更新、访谈、指南与观察。清晰分类、沉浸阅读、音乐伴随，让每篇文章都更容易被看见和收藏。",
      "我们是一群关注意识成长、公共福祉与人类共同未来的同行者。天狼星之光持续整理值得被看见的讯息、访谈与实践指引，愿以真诚、理性和行动连接更多心怀善意的人，一起为更清明、更和平、更有爱的未来贡献力量。",
    ].includes(next.page.heroDescription)) {
      next.page.heroDescription = "我们来自不同领域，因为对灵性成长、公共福祉与人类未来的关注而聚在一起，志愿协作，致力于本平台的资讯整理与共享。我们筛选、整理并传播具备启发性的文章与实践资料，倡导每一位读者保有独立判断，将所思所悟转化成清醒且心怀善意的行动。";
    }
    if (["关于门户", "关于天狼星之光"].includes(next.page.aboutTitle)) next.page.aboutTitle = "关于我们";
    if ([
      "这里持续收录经过整理与排版的文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
      "这里收录 10 篇已排版文章，并支持通过独立后台继续发布和编辑。前台只保留阅读入口，避免读者误入编辑区。",
      "天狼星之光由一群关注意识成长、公共福祉与人类共同未来的伙伴共同维护。我们相信，清晰的信息、独立的思考与善意的行动能够彼此照亮；愿在尊重差异、保持理性的前提下，连接更多愿意学习、分享并为美好未来付诸行动的人。",
    ].includes(next.page.aboutText)) {
      next.page.aboutText = "天狼星门户由一群关注意识成长、公共福祉与人类未来的志愿者共同维护。我们相信，明晰的信息、独立的思考与善意的行动能够彼此照亮；我们尊重差异、恪守理性，希望连结到更多乐于学习、喜欢分享，并愿意为正向转变付诸行动的同路人。";
    }
    if (/本网站所涉内容大多来自网络共享的资源和观点/.test(next.page.motionTitle || "")
      && /本网站坚决拥护依法治网/.test(next.page.motionTitle || "")) {
      next.page.motionTitle = "本网站所涉内容大多来自网络共享的资源和观点，内容性质属虚构和半虚构，由个人整理，不构成任何宗教立场、政治主张或价值倡导 -- 请读者运用自己的判断力进行理性思考，不迷信、不盲从，不参与任何形式的个人崇拜或迷信行为。\n\n若网站内容与任何地区的法律政策有所冲突，本网站将依法进行调整和删除，并保留修改变更、终止分享的所有权利。\n\n本网站坚决拥护依法治网，反对任何形式的违法宣扬，所呈内容仅作思维拓展和幻想作品参考使用。";
    }
  }
  return next;
}

function secureHexEqual(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function maskedEditorEmail() {
  const [local = "", domain = ""] = editorEmail.split("@");
  return `${local.slice(0, 4)}****@${domain}`;
}

function consumeRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = authRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    authRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function editorMailer() {
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  if (!user || !pass) return null;
  if (!mailTransporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.qq.com",
      port,
      secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
      auth: { user, pass },
    });
  }
  return mailTransporter;
}

function readEditorSession(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!match) return null;
  const sessionKey = hashText(match[1]);
  const session = editorSessions.get(sessionKey);
  if (!session || session.expiresAt <= Date.now()) {
    editorSessions.delete(sessionKey);
    return null;
  }
  return { sessionKey, ...session };
}

function requireEditorAuth(req, res, next) {
  const session = readEditorSession(req);
  if (!session) {
    res.status(401).json({ error: "编辑器登录已失效，请重新验证密码和邮件验证码", code: "EDITOR_AUTH_REQUIRED" });
    return;
  }
  req.editorSession = session;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, challenge] of editorChallenges) if (challenge.expiresAt <= now) editorChallenges.delete(key);
  for (const [key, session] of editorSessions) if (session.expiresAt <= now) editorSessions.delete(key);
  for (const [key, limit] of authRateLimits) if (limit.resetAt <= now) authRateLimits.delete(key);
}, 60_000).unref();

async function initDb() {
  await pool.query(`
    create table if not exists articles (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists site_settings (
      id integer primary key default 1,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      constraint single_settings_row check (id = 1)
    );

    create table if not exists comments (
      article_id text not null,
      id text not null,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (article_id, id)
    );

    create table if not exists article_upload_chunks (
      upload_id text not null,
      part_index integer not null,
      data text not null,
      created_at timestamptz not null default now(),
      primary key (upload_id, part_index)
    );

    create table if not exists site_state_meta (
      id integer primary key default 1,
      revision bigint not null default 1,
      updated_at timestamptz not null default now(),
      constraint single_state_meta_row check (id = 1)
    );

    create table if not exists collective_meditation_presence (
      viewer_id text primary key,
      seen_at timestamptz not null default now()
    );

    create table if not exists media_assets (
      id text primary key,
      filename text not null,
      content_type text not null,
      data bytea not null,
      created_at timestamptz not null default now()
    );

    insert into site_state_meta (id, revision)
    values (1, 1)
    on conflict (id) do nothing;
  `);

  const retiredIds = [...retiredArticleIds];
  const retiredSignatures = [...retiredArticleSignatures];
  await pool.query(`
    delete from comments
    where article_id in (
      select id from articles
      where id = any($1::text[]) or concat(data->>'date', '|', data->>'title') = any($2::text[])
    )
  `, [retiredIds, retiredSignatures]);
  const retired = await pool.query(`
    delete from articles
    where id = any($1::text[]) or concat(data->>'date', '|', data->>'title') = any($2::text[])
    returning id
  `, [retiredIds, retiredSignatures]);
  if (retired.rowCount) {
    await pool.query("update site_state_meta set revision = revision + 1, updated_at = now() where id = 1");
  }
}

async function ensureMetaSchema(client = pool) {
  await client.query(`
    create table if not exists site_state_meta (
      id integer primary key default 1,
      revision bigint not null default 1,
      updated_at timestamptz not null default now(),
      constraint single_state_meta_row check (id = 1)
    );

    insert into site_state_meta (id, revision)
    values (1, 1)
    on conflict (id) do nothing;
  `);
}

async function ensureChunkSchema(client = pool) {
  await client.query(`
    create table if not exists article_upload_chunks (
      upload_id text not null,
      part_index integer not null,
      data text not null,
      created_at timestamptz not null default now(),
      primary key (upload_id, part_index)
    );
  `);
}

function normalizeArticle(article) {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: article.id || `api-${Date.now()}`,
    title: article.title || "未命名文章",
    category: normalizeCategory(article.category || "未分类"),
    date: article.date || now,
    cover: article.cover || "assets/logo-vector-web.png",
    excerpt: article.excerpt || "",
    hot: Number(article.hot || 0),
    commentMode: article.commentMode || "all",
    contentType: article.contentType || "article",
    duration: article.duration || "",
    music: article.music || "",
    video: article.video || "",
    sourceDoc: article.sourceDoc || "",
    sourcePdf: article.sourcePdf || "",
    images: article.images || [],
    paragraphs: article.paragraphs || [],
    html: article.html || "",
    archived: Boolean(article.archived),
    archivedAt: article.archivedAt || "",
    deleted: Boolean(article.deleted),
  };
}

async function upsertArticle(article) {
  await pool.query(
    `insert into articles (id, data, updated_at)
     values ($1, $2, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [article.id, article],
  );
}

async function bumpRevision(client = pool) {
  await ensureMetaSchema(client);
  const result = await client.query(
    `insert into site_state_meta (id, revision, updated_at)
     values (1, 1, now())
     on conflict (id) do update set revision = site_state_meta.revision + 1, updated_at = now()
     returning revision, updated_at`,
  );
  return result.rows[0];
}

app.post("/api/editor-auth/password", async (req, res, next) => {
  try {
    const clientKey = `password:${req.ip}`;
    if (!consumeRateLimit(clientKey, 8, 15 * 60 * 1000)) {
      res.status(429).json({ error: "尝试次数过多，请 15 分钟后再试" });
      return;
    }
    const password = String(req.body?.password || "");
    const candidateHash = hashText(password);
    if (!secureHexEqual(candidateHash, editorPasswordHash)) {
      res.status(401).json({ error: "密码不正确" });
      return;
    }
    if (!consumeRateLimit(`email:${req.ip}`, 3, 15 * 60 * 1000)) {
      res.status(429).json({ error: "验证码发送过于频繁，请 15 分钟后再试" });
      return;
    }
    const transporter = editorMailer();
    if (!transporter) {
      res.status(503).json({ error: "邮件验证码服务尚未配置，请先设置 SMTP_USER 和 SMTP_PASS" });
      return;
    }
    const challengeId = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + otpLifetimeMs;
    for (const [key, existingChallenge] of editorChallenges) {
      if (existingChallenge.ip === req.ip) editorChallenges.delete(key);
    }
    editorChallenges.set(challengeId, {
      codeHash: hashText(`${challengeId}:${code}`),
      expiresAt,
      attempts: 0,
      ip: req.ip,
    });
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: editorEmail,
        subject: "天狼星门户编辑器登录验证码",
        text: `你的六位登录验证码是：${code}\n\n验证码 10 分钟内有效。若非本人操作，请忽略此邮件。`,
        html: `<p>你的六位登录验证码是：</p><p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#6d28d9">${code}</p><p>验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p>`,
      });
    } catch (mailError) {
      editorChallenges.delete(challengeId);
      console.error("Editor verification email failed", mailError);
      res.status(502).json({ error: "验证码邮件发送失败，请检查 QQ SMTP 授权码和邮件服务配置" });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json({ challengeId, email: maskedEditorEmail(), expiresIn: Math.floor(otpLifetimeMs / 1000) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/editor-auth/verify", (req, res) => {
  const challengeId = String(req.body?.challengeId || "");
  const code = String(req.body?.code || "").trim();
  const challenge = editorChallenges.get(challengeId);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    editorChallenges.delete(challengeId);
    res.status(400).json({ error: "验证码已失效，请重新输入密码获取" });
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "请输入六位数字验证码" });
    return;
  }
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    editorChallenges.delete(challengeId);
    res.status(429).json({ error: "验证码尝试次数过多，请重新获取" });
    return;
  }
  const candidateHash = hashText(`${challengeId}:${code}`);
  if (!secureHexEqual(candidateHash, challenge.codeHash)) {
    res.status(401).json({ error: "验证码不正确" });
    return;
  }
  editorChallenges.delete(challengeId);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + editorSessionLifetimeMs;
  editorSessions.set(hashText(token), { email: editorEmail, expiresAt });
  res.set("Cache-Control", "no-store");
  res.json({ token, expiresAt: new Date(expiresAt).toISOString(), email: maskedEditorEmail() });
});

app.get("/api/editor-auth/session", (req, res) => {
  const session = readEditorSession(req);
  if (!session) {
    res.status(401).json({ error: "尚未登录或会话已失效", code: "EDITOR_AUTH_REQUIRED" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, email: maskedEditorEmail(), expiresAt: new Date(session.expiresAt).toISOString() });
});

app.post("/api/editor-auth/logout", (req, res) => {
  const session = readEditorSession(req);
  if (session) editorSessions.delete(session.sessionKey);
  res.status(204).end();
});

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("select 1");
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, apiVersion, chunkedUploads: true, revisions: true, mediaUploads: true, articleDeletion: true, articleArchiving: true, editorAuth: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/capabilities", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ apiVersion, chunkedUploads: true, revisions: true, mediaUploads: true, articleDeletion: true, articleArchiving: true, editorAuth: true });
});

app.get("/api/version", async (req, res, next) => {
  try {
    await ensureMetaSchema();
    const result = await pool.query("select revision, updated_at from site_state_meta where id = 1");
    res.set("Cache-Control", "no-store");
    res.json(result.rows[0] || { revision: 1 });
  } catch (error) {
    next(error);
  }
});

app.get("/api/state", async (req, res, next) => {
  try {
    await ensureMetaSchema();
    const [articlesResult, settingsResult, commentsResult] = await Promise.all([
      pool.query("select data from articles order by updated_at desc"),
      pool.query("select data from site_settings where id = 1"),
      pool.query("select article_id, data from comments order by created_at asc"),
    ]);

    const comments = {};
    for (const row of commentsResult.rows) {
      comments[row.article_id] ||= [];
      comments[row.article_id].push(row.data);
    }

    const versionResult = await pool.query("select revision, updated_at from site_state_meta where id = 1");
    res.set("Cache-Control", "no-store");
    res.json({
      articles: articlesResult.rows
        .map((row) => row.data)
        .filter((article) => !isRetiredArticle(article))
        .map((article) => ({ ...article, category: normalizeCategory(article.category) })),
      settings: normalizeSettings(settingsResult.rows[0]?.data || {}),
      comments,
      revision: Number(versionResult.rows[0]?.revision || 1),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles", requireEditorAuth, async (req, res, next) => {
  try {
    const article = normalizeArticle(req.body || {});
    await upsertArticle(article);
    const meta = await bumpRevision();
    res.json({ ...article, revision: Number(meta.revision) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/articles/:articleId", requireEditorAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const articleId = String(req.params.articleId || "").slice(0, 240);
    if (!articleId) {
      res.status(400).json({ error: "articleId is required" });
      return;
    }
    await client.query("begin");
    await client.query("delete from comments where article_id = $1", [articleId]);
    await client.query("delete from articles where id = $1", [articleId]);
    if (req.body?.keepTombstone) {
      await client.query(
        "insert into articles (id, data, updated_at) values ($1, $2, now())",
        [articleId, { id: articleId, deleted: true }],
      );
    }
    const meta = await bumpRevision(client);
    await client.query("commit");
    res.json({ id: articleId, deleted: true, tombstone: Boolean(req.body?.keepTombstone), revision: Number(meta.revision) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/articles/chunked/init", requireEditorAuth, async (req, res, next) => {
  try {
    await ensureChunkSchema();
    const uploadId = req.body.uploadId || crypto.randomUUID();
    await pool.query("delete from article_upload_chunks where upload_id = $1", [uploadId]);
    res.json({ uploadId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles/chunked/part", requireEditorAuth, async (req, res, next) => {
  try {
    await ensureChunkSchema();
    const { uploadId, index, chunk } = req.body || {};
    if (!uploadId || !Number.isInteger(index) || typeof chunk !== "string") {
      res.status(400).json({ error: "Invalid chunk payload" });
      return;
    }
    await pool.query(
      `insert into article_upload_chunks (upload_id, part_index, data, created_at)
       values ($1, $2, $3, now())
       on conflict (upload_id, part_index) do update set data = excluded.data, created_at = now()`,
      [uploadId, index, chunk],
    );
    res.json({ ok: true, uploadId, index });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles/chunked/complete", requireEditorAuth, async (req, res, next) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await ensureChunkSchema(client);
    const { uploadId, total } = req.body || {};
    if (!uploadId || !Number.isInteger(total) || total < 1) {
      res.status(400).json({ error: "Invalid upload completion payload" });
      return;
    }
    const result = await client.query(
      "select part_index, data from article_upload_chunks where upload_id = $1 order by part_index asc",
      [uploadId],
    );
    if (result.rows.length !== total) {
      res.status(400).json({ error: `Missing chunks: received ${result.rows.length}, expected ${total}` });
      return;
    }
    result.rows.forEach((row, expectedIndex) => {
      if (row.part_index !== expectedIndex) throw new Error(`Chunk index mismatch at ${expectedIndex}`);
    });
    const article = normalizeArticle(JSON.parse(result.rows.map((row) => row.data).join("")));
    await client.query("begin");
    inTransaction = true;
    await client.query(
      `insert into articles (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [article.id, article],
    );
    await client.query("delete from article_upload_chunks where upload_id = $1", [uploadId]);
    const meta = await bumpRevision(client);
    await client.query("commit");
    inTransaction = false;
    res.json({ ...article, revision: Number(meta.revision) });
  } catch (error) {
    if (inTransaction) await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/articles/bulk", requireEditorAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const articles = (req.body.articles || []).map(normalizeArticle);
    await client.query("begin");
    for (const article of articles) {
      await client.query(
        `insert into articles (id, data, updated_at)
         values ($1, $2, now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [article.id, article],
      );
    }
    await bumpRevision(client);
    await client.query("commit");
    res.json(articles);
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/settings", requireEditorAuth, async (req, res, next) => {
  try {
    const settings = req.body || {};
    await pool.query(
      `insert into site_settings (id, data, updated_at)
       values (1, $1, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [settings],
    );
    const meta = await bumpRevision();
    res.json({ ...settings, revision: Number(meta.revision) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/media", requireEditorAuth, async (req, res, next) => {
  try {
    const filename = String(req.body.filename || "media").slice(0, 240);
    const contentType = String(req.body.contentType || "").slice(0, 120);
    if (!/^(audio|video)\//.test(contentType)) {
      res.status(400).json({ error: "仅支持上传音频或视频文件" });
      return;
    }
    const data = Buffer.from(String(req.body.base64 || ""), "base64");
    if (!data.length) {
      res.status(400).json({ error: "媒体文件为空" });
      return;
    }
    if (data.length > 48 * 1024 * 1024) {
      res.status(413).json({ error: "单个媒体文件不能超过 48MB" });
      return;
    }
    const id = crypto.randomUUID();
    await pool.query(
      "insert into media_assets (id, filename, content_type, data) values ($1, $2, $3, $4)",
      [id, filename, contentType, data],
    );
    res.json({ id, filename, contentType, path: `/api/media/${id}` });
  } catch (error) {
    next(error);
  }
});

app.get("/api/media/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      "select filename, content_type, data from media_assets where id = $1",
      [req.params.id],
    );
    const media = result.rows[0];
    if (!media) {
      res.status(404).json({ error: "媒体文件不存在" });
      return;
    }
    const data = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data);
    const total = data.length;
    res.set("Content-Type", media.content_type);
    res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).set("Content-Range", `bytes */${total}`).end();
        return;
      }
      const requestedStart = match[1] ? Number(match[1]) : 0;
      const requestedEnd = match[2] ? Number(match[2]) : total - 1;
      const start = Math.max(0, requestedStart);
      const end = Math.min(total - 1, requestedEnd);
      if (start > end || start >= total) {
        res.status(416).set("Content-Range", `bytes */${total}`).end();
        return;
      }
      const chunk = data.subarray(start, end + 1);
      res.status(206);
      res.set("Content-Range", `bytes ${start}-${end}/${total}`);
      res.set("Content-Length", String(chunk.length));
      res.send(chunk);
      return;
    }

    res.set("Content-Length", String(total));
    res.send(data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/collective-meditation/heartbeat", async (req, res, next) => {
  try {
    const viewerId = String(req.body.viewerId || "").slice(0, 160);
    if (!viewerId) {
      res.status(400).json({ error: "viewerId is required" });
      return;
    }
    await pool.query(
      `insert into collective_meditation_presence (viewer_id, seen_at)
       values ($1, now())
       on conflict (viewer_id) do update set seen_at = now()`,
      [viewerId],
    );
    await pool.query("delete from collective_meditation_presence where seen_at < now() - interval '45 seconds'");
    const result = await pool.query("select count(*)::integer as count from collective_meditation_presence");
    res.set("Cache-Control", "no-store");
    res.json({ count: Number(result.rows[0]?.count || 1) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles/:articleId/comments", async (req, res, next) => {
  try {
    const articleId = req.params.articleId;
    const comment = {
      id: req.body.id || `comment-${Date.now()}`,
      name: req.body.name || "匿名",
      body: req.body.body || "",
      featured: Boolean(req.body.featured),
      approved: Boolean(req.body.approved),
    };
    await pool.query(
      `insert into comments (article_id, id, data, updated_at)
       values ($1, $2, $3, now())
       on conflict (article_id, id) do update set data = excluded.data, updated_at = now()`,
      [articleId, comment.id, comment],
    );
    await bumpRevision();
    res.json(comment);
  } catch (error) {
    next(error);
  }
});

app.put("/api/articles/:articleId/comments", requireEditorAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const articleId = req.params.articleId;
    const comments = req.body.comments || [];
    await client.query("begin");
    await client.query("delete from comments where article_id = $1", [articleId]);
    for (const comment of comments) {
      const item = {
        id: comment.id || `comment-${Date.now()}`,
        name: comment.name || "匿名",
        body: comment.body || "",
        featured: Boolean(comment.featured),
        approved: Boolean(comment.approved),
      };
      await client.query(
        "insert into comments (article_id, id, data, updated_at) values ($1, $2, $3, now())",
        [articleId, item.id, item],
      );
    }
    await bumpRevision(client);
    await client.query("commit");
    res.json(comments);
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  const showDetail = process.env.NODE_ENV !== "production" || process.env.SHOW_ERROR_DETAIL === "true";
  res.status(error.status || 500).json({
    error: "服务器错误",
    code: error.code || "INTERNAL_ERROR",
    ...(showDetail ? { detail: error.message } : {}),
  });
});

initDb().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Sirius Portal API listening on ${port}`);
  });
}).catch((error) => {
  console.error("Database initialization failed", error);
  process.exit(1);
});
