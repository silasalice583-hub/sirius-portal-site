const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn, spawnSync } = require("node:child_process");
const { File } = require("node:buffer");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");

test("mobile PDF render budgets remain bounded for tall Xiumi export pages", () => {
  const scope = { window: { location: { origin: "http://localhost" }, devicePixelRatio: 3 },
    URL, matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(fs.readFileSync(path.join(root, "pdf-inline-viewer.js"), "utf8"), scope);
  for (const height of [842, 20000, 900000]) {
    const viewport = { width: 595, height };
    const scale = scope.window.SiriusPdfInlineViewer.renderScale(viewport, { clientWidth: 390 });
    assert.ok(scale > 0);
    assert.ok(viewport.width * viewport.height * scale * scale <= 3000001);
    assert.ok(Math.max(viewport.width, viewport.height) * scale <= 6001);
  }
});

function createApiScope({ uploadStatus = 200 } = {}) {
  const calls = [];
  const stored = new File(["%PDF-fixture"], "phone-export.pdf", { type: "" });
  const record = { id: "sample", name: stored.name, type: "application/octet-stream", blob: stored };
  const indexedDB = {
    open() {
      const request = {};
      setImmediate(() => {
        request.result = {
          transaction() {
            return { objectStore() { return { get() {
              const get = {};
              setImmediate(() => { get.result = record; get.onsuccess(); });
              return get;
            } }; } };
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  class FileReader {
    readAsDataURL(file) {
      file.arrayBuffer().then((buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload();
      });
    }
  }
  const scope = {
    window: { location: { origin: "https://site.example" }, indexedDB,
      SIRIUS_API_BASE: "https://api.example" },
    indexedDB, URL, File, FileReader, console,
    sessionStorage: { getItem: () => "", setItem() {}, removeItem() {} },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      if (url.endsWith("/api/media")) return {
        ok: uploadStatus === 200, status: uploadStatus,
        json: async () => ({ path: "/api/media/shared-pdf" }),
        text: async () => '{"error":"Upload denied"}',
      };
      return { ok: true, status: 200, json: async () => body };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "api-client.js"), "utf8"), scope);
  return { api: scope.window.SiriusAPI, calls, record };
}

test("publishing a local PDF migrates attachments once and retains the local original", async () => {
  const { api, calls, record } = createApiScope();
  const article = { id: "qa", sourcePdf: "local-media://sample", cover: "local-media://sample",
    html: '<section data-pdf-src="local-media://sample"></section>', images: ["local-media://sample"] };
  const saved = await api.saveArticle(article);
  assert.equal(calls.filter((call) => call.url.endsWith("/api/media")).length, 1);
  assert.equal(calls[0].body.contentType, "application/pdf");
  assert.equal(saved.sourcePdf, "https://api.example/api/media/shared-pdf");
  assert.doesNotMatch(JSON.stringify(saved), /local-media:/);
  assert.equal(article.sourcePdf, "local-media://sample");
  assert.equal(await record.blob.text(), "%PDF-fixture");
});

test("a failed attachment upload cannot publish a broken cross-device article", async () => {
  const { api, calls, record } = createApiScope({ uploadStatus: 401 });
  await assert.rejects(api.saveArticle({ id: "qa", sourcePdf: "local-media://sample" }), /Upload denied/);
  assert.equal(calls.some((call) => call.url.endsWith("/api/articles")), false);
  assert.equal(await record.blob.text(), "%PDF-fixture");
});

test("PDF worker starts when an older engine lacks the newer Promise helpers", () => {
  const workerURL = pathToFileURL(path.join(root, "pdf-worker-compat.mjs")).href;
  const script = `Promise.try=undefined;Promise.withResolvers=undefined;const w=await import(${JSON.stringify(workerURL)});if(typeof w.WorkerMessageHandler.setup!=='function'||typeof Promise.try!=='function'||typeof Promise.withResolvers!=='function')process.exit(1);`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

const pdfFixture = path.join(root, "content", "show_726640030_1789826675920.pdf");
test("local PDF delivery supports ranges, suffixes, HEAD and unsatisfiable requests", {
  skip: !fs.existsSync(pdfFixture) && "local PDF fixture is not present",
}, async () => {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, PORT: "18767", HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("preview server startup timed out")), 5000);
      server.once("error", reject);
      server.once("exit", (code) => reject(new Error(`preview server exited ${code}`)));
      server.stdout.on("data", (data) => {
        if (String(data).includes("18767")) { clearTimeout(timer); resolve(); }
      });
    });
    const url = "http://127.0.0.1:18767/content/show_726640030_1789826675920.pdf";
    const expected = fs.readFileSync(pdfFixture);
    const first = await fetch(url, { headers: { Range: "bytes=0-31" } });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get("accept-ranges"), "bytes");
    assert.equal(first.headers.get("content-range"), `bytes 0-31/${expected.length}`);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), expected.subarray(0, 32));
    const suffix = await fetch(url, { headers: { Range: "bytes=-16" } });
    assert.equal(suffix.status, 206);
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), expected.subarray(-16));
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), String(expected.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const invalid = await fetch(url, { headers: { Range: `bytes=${expected.length}-` } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), `bytes */${expected.length}`);
    const audio = await fetch("http://127.0.0.1:18767/content/audio/world-breath.mp3", { headers: { Range: "bytes=0-31" } });
    assert.equal(audio.status, 206);
    assert.equal(audio.headers.get("content-type"), "audio/mpeg");
    assert.equal((await audio.arrayBuffer()).byteLength, 32);
  } finally {
    server.kill();
  }
});
