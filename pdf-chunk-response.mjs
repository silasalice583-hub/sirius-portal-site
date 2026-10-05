// Serve an unchanged oversized PDF from deployable static pieces, streaming
// one piece at a time. Supports native PDF viewers' byte-range requests.
export async function chunkedPdfResponse(request, assets, file) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const etag = `"${file.sha256}"`;
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', ETag: etag,
    'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename="goddess-return-01.pdf"' });
  if ((request.headers.get('If-None-Match') || '').split(/\s*,\s*/).some(value => value === etag || value === `W/${etag}` || value === '*')) {
    return new Response(null, { status: 304, headers });
  }
  let start = 0, end = file.bytes - 1, status = 200;
  const range = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  if (range && (!ifRange || ifRange === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return unsatisfiable();
    if (match[1]) {
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
    } else start = Math.max(0, file.bytes - Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start < 0 || start >= file.bytes) return unsatisfiable();
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${file.bytes}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const selected = file.parts.filter(part => part.offset <= end && part.offset + part.bytes > start);
  async function open(part) {
    const from = Math.max(start, part.offset) - part.offset, to = Math.min(end, part.offset + part.bytes - 1) - part.offset;
    const url = new URL(part.path, request.url);
    const response = await assets.fetch(new Request(url, { headers: { Range: `bytes=${from}-${to}` }, signal: request.signal }));
    if (![200, 206].includes(response.status) || !response.body) throw new Error('PDF source piece unavailable');
    return { reader: response.body.getReader(), skip: response.status === 206 ? 0 : from, left: to - from + 1 };
  }
  let current;
  try { current = await open(selected[0]); }
  catch (_) { return new Response('Original PDF temporarily unavailable', { status: 502 }); }
  let index = 0, cancelled = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (current.left === 0) {
            await current.reader.cancel();
            if (++index === selected.length) { controller.close(); return; }
            current = await open(selected[index]);
            if (cancelled) { await current.reader.cancel(); return; }
          }
          const { done, value } = await current.reader.read();
          if (cancelled) return;
          if (done) throw new Error('Incomplete PDF source piece');
          if (current.skip >= value.length) { current.skip -= value.length; continue; }
          const chunk = value.subarray(current.skip, current.skip + current.left);
          current.skip = 0; current.left -= chunk.length;
          if (chunk.length) { controller.enqueue(chunk); return; }
        }
      } catch (error) { if (!cancelled) controller.error(error); await current?.reader.cancel().catch(() => {}); }
    },
    async cancel() { cancelled = true; await current?.reader.cancel(); },
  });
  return new Response(stream, { status, headers });
  function unsatisfiable() {
    headers.set('Content-Range', `bytes */${file.bytes}`);
    return new Response(null, { status: 416, headers });
  }
}
