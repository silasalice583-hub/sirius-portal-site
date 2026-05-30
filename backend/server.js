const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((item) => item.trim());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
app.use(express.json({ limit: "50mb" }));

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
  `);
}

function normalizeArticle(article) {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: article.id || `api-${Date.now()}`,
    title: article.title || "未命名文章",
    category: article.category || "未分类",
    date: article.date || now,
    cover: article.cover || "logo抠图.png",
    excerpt: article.excerpt || "",
    hot: Number(article.hot || 0),
    commentMode: article.commentMode || "all",
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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", async (req, res, next) => {
  try {
    const [articlesResult, settingsResult, commentsResult] = await Promise.all([
      pool.query("select data from articles order by coalesce((data->>'date')::date, '1970-01-01'::date) desc"),
      pool.query("select data from site_settings where id = 1"),
      pool.query("select article_id, data from comments order by created_at asc"),
    ]);

    const comments = {};
    for (const row of commentsResult.rows) {
      comments[row.article_id] ||= [];
      comments[row.article_id].push(row.data);
    }

    res.json({
      articles: articlesResult.rows.map((row) => row.data),
      settings: settingsResult.rows[0]?.data || {},
      comments,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles", async (req, res, next) => {
  try {
    const article = normalizeArticle(req.body || {});
    await pool.query(
      `insert into articles (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [article.id, article],
    );
    res.json(article);
  } catch (error) {
    next(error);
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
    res.json(settings);
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
