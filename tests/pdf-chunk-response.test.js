const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const load = () => import(pathToFileURL(path.join(__dirname, '../pdf-chunk-response.mjs')));
const bytes = Buffer.from('%PDF-1.7\nA complete unchanged original document.\n%%EOF');
const file = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  parts: [0, 16, 32, 48].filter(offset => offset < bytes.length).map((offset, i) => ({ path: `/part-${i}`, offset, bytes: Math.min(16, bytes.length - offset) })) };
function assets(supportRange) {
  return { async fetch(request) {
    const part = file.parts.find(p => new URL(request.url).pathname === p.path);
    if (!part) return new Response(null, { status: 404 });
    const data = bytes.subarray(part.offset, part.offset + part.bytes);
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.get('Range'));
    return new Response(supportRange ? data.subarray(Number(start), Number(end) + 1) : data, { status: supportRange ? 206 : 200 });
  } };
}
test('unchanged PDF streaming, cross-piece ranges, open and suffix ranges', async () => {
  const { chunkedPdfResponse } = await load();
  for (const supportRange of [true, false]) {
    for (const [range, from, to] of [[null, 0, bytes.length], ['bytes=13-37', 13, 38], ['bytes=0-0', 0, 1], ['bytes=45-', 45, bytes.length], ['bytes=-7', bytes.length - 7, bytes.length]]) {
      const response = await chunkedPdfResponse(new Request('https://site.test/original.pdf', { headers: range ? { Range: range } : {} }), assets(supportRange), file);
      assert.equal(response.status, range ? 206 : 200);
      assert.equal(Number(response.headers.get('Content-Length')), to - from);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(from, to));
    }
  }
});
test('HEAD, conditional caching, invalid range and missing piece responses', async () => {
  const { chunkedPdfResponse } = await load();
  const request = (headers = {}, method = 'GET') => new Request('https://site.test/original.pdf', { headers, method });
  const head = await chunkedPdfResponse(request({}, 'HEAD'), assets(true), file);
  assert.equal(await head.text(), ''); assert.equal(Number(head.headers.get('Content-Length')), bytes.length);
  assert.equal((await chunkedPdfResponse(request({ 'If-None-Match': `"${file.sha256}"` }), assets(true), file)).status, 304);
  for (const Range of ['bytes=900-', 'bytes=9-2', 'bytes=-0', 'bytes=0-2,6-8', 'bytes=-', 'invalid']) {
    assert.equal((await chunkedPdfResponse(request({ Range }), assets(true), file)).status, 416);
  }
  const changed = await chunkedPdfResponse(request({ Range: 'bytes=0-4', 'If-Range': '"old"' }), assets(true), file);
  assert.equal(changed.status, 200); assert.deepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
  assert.equal((await chunkedPdfResponse(request(), { fetch: async () => new Response(null, { status: 404 }) }, file)).status, 502);
});
test('deployed binary pieces reconstruct the exact first original PDF below the asset limit', async () => {
  const { default: actual } = await import(pathToFileURL(path.join(__dirname, '../goddess-pdf-parts.mjs')));
  const parts = actual.parts.map(part => {
    assert.ok(part.bytes < 25 * 1024 * 1024);
    const data = fs.readFileSync(path.join(__dirname, '..', part.path.slice(1)));
    assert.equal(data.length, part.bytes);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), part.sha256);
    return data;
  });
  const joined = Buffer.concat(parts);
  assert.equal(joined.length, actual.bytes);
  assert.equal(crypto.createHash('sha256').update(joined).digest('hex'), actual.sha256);
});
