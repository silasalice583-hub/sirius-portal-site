// 公网部署时优先走 Cloudflare Pages Functions 的同域 /api 代理。
// 本地直接打开或本地静态服务预览时仍使用浏览器 localStorage，避免没有后端时无法编辑。
window.SIRIUS_API_BASE = "";
window.SIRIUS_USE_SAME_ORIGIN_API = !["localhost", "127.0.0.1", ""].includes(location.hostname);
