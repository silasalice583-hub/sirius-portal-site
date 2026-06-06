export async function onRequest(context) {
  const sourceUrl = new URL(context.request.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": sourceUrl.origin,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };

  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const upstream = (context.env.RAILWAY_API_BASE || context.env.SIRIUS_API_BASE || "").replace(/\/$/, "");
  if (!upstream) {
    return Response.json({ error: "RAILWAY_API_BASE is not configured in Cloudflare Pages" }, {
      status: 500,
      headers: corsHeaders,
    });
  }

  const pathParam = context.params.path || "";
  const apiPath = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
  const targetUrl = new URL(`${upstream}/api/${apiPath}`);
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

  let response;
  try {
    response = await fetch(targetUrl.toString(), init);
  } catch (error) {
    return Response.json({
      error: "Could not reach Railway API",
      upstream,
      message: error.message,
    }, {
      status: 502,
      headers: corsHeaders,
    });
  }
  const outputHeaders = new Headers(response.headers);
  if (apiPath.startsWith("media/")) {
    outputHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    outputHeaders.set("Cache-Control", "no-store");
  }
  Object.entries(corsHeaders).forEach(([key, value]) => outputHeaders.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outputHeaders,
  });
}
