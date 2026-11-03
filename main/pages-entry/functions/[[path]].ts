// 所有路徑（/api/*、/admin、/healthz…）都轉給 Worker；service binding 在 Cloudflare 內部呼叫，不經過 workers.dev 網址，
// 原本的標頭（含使用者 IP 的 CF-Connecting-IP、前端的 Origin）原樣保留，Worker 的 CORS 與登入次數限制照常運作
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => env.API.fetch(request);
