export async function onRequest(context) {
  const upstream = (context.env.RAILWAY_API_BASE || context.env.SIRIUS_API_BASE || "").replace(/\/$/, "");
  if (!upstream) {
    return Response.json({ error: "RAILWAY_API_BASE is not configured" }, { status: 500 });
  }

  const sourceUrl = new URL(context.request.url);
  const targetUrl = new URL(`${upstream}/api/${context.params.path || ""}`);
  targetUrl.search = sourceUrl.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");

  const init = {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
    redirect: "manual",
  };

  const response = await fetch(targetUrl.toString(), init);
  const outputHeaders = new Headers(response.headers);
  outputHeaders.set("Cache-Control", "no-store");
  outputHeaders.set("Access-Control-Allow-Origin", sourceUrl.origin);
  outputHeaders.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outputHeaders,
  });
}
