const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("node:crypto");

const app = express();
const port = Number(process.env.PORT || 3000);
const apiVersion = 8;
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((item) => item.trim());
const databaseUrl = process.env.DATABASE_URL;

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
    category: article.category || "未分类",
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

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("select 1");
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, apiVersion, chunkedUploads: true, revisions: true, mediaUploads: true, articleDeletion: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/capabilities", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ apiVersion, chunkedUploads: true, revisions: true, mediaUploads: true, articleDeletion: true });
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
      articles: articlesResult.rows.map((row) => row.data),
      settings: settingsResult.rows[0]?.data || {},
      comments,
      revision: Number(versionResult.rows[0]?.revision || 1),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles", async (req, res, next) => {
  try {
    const article = normalizeArticle(req.body || {});
    await upsertArticle(article);
    const meta = await bumpRevision();
    res.json({ ...article, revision: Number(meta.revision) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/articles/:articleId", async (req, res, next) => {
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

app.post("/api/articles/chunked/init", async (req, res, next) => {
  try {
    await ensureChunkSchema();
    const uploadId = req.body.uploadId || crypto.randomUUID();
    await pool.query("delete from article_upload_chunks where upload_id = $1", [uploadId]);
    res.json({ uploadId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles/chunked/part", async (req, res, next) => {
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

app.post("/api/articles/chunked/complete", async (req, res, next) => {
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

app.post("/api/articles/bulk", async (req, res, next) => {
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

app.put("/api/settings", async (req, res, next) => {
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

app.post("/api/media", async (req, res, next) => {
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

app.put("/api/articles/:articleId/comments", async (req, res, next) => {
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
