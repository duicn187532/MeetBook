# Cloudflare Pages 入口（<後端網址>）

公司網路擋 `*.workers.dev`，但可以連 `*.pages.dev`。這個 Pages 專案只做一件事：把所有請求（`/api/*`、`/admin`、`/healthz`…）原封不動轉給 Worker。

- 轉送使用 service binding（Cloudflare 內部呼叫，不經過 workers.dev 網址），程式與資料都只有 Worker 一份。
- 原本的標頭原樣保留：前端的 `Origin`（CORS 照常檢查）、使用者 IP 的 `CF-Connecting-IP`（管理後台登入次數限制照常運作）。
- `functions/[[path]].ts`：轉送程式；`wrangler.jsonc`：Pages 設定（`services` 綁定 Worker；專案名稱與 Worker 名稱是佔位字 `__PAGES_PROJECT__`／`__WORKER_NAME__`，部署時由 GitHub Secrets `CF_PAGES_PROJECT`／`CF_WORKER_NAME` 填入）；`public/`：Pages 規定要有的靜態檔資料夾，只放 `robots.txt`。
- 部署：`.github/workflows/deploy-worker.yml` 在部署 Worker 之後接著部署這個專案，使用 `main/worker` 安裝的 wrangler。API token 需要 **Account → Cloudflare Pages → Edit** 權限。
- 放在 `main/worker` 之外：wrangler 會往上層資料夾找設定檔，放在 `main/worker` 底下會誤用 Worker 的 `wrangler.jsonc`。
- LINE webhook 仍使用 workers.dev 網址（LINE 的伺服器連得到）。

本機測試：先在 `main/worker` 執行 `wrangler dev`（Worker 名稱為 `app`），再把這個資料夾複製出來，把 `wrangler.jsonc` 的 `__PAGES_PROJECT__` 改成任意名稱、`__WORKER_NAME__` 改成 `app` 後執行 `wrangler pages dev`。
