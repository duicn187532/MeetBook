// 對外網址：不寫在程式中（repo 為公開），部署時由 GitHub Secrets 透過 wrangler --var 提供
// - WEBSITE_URL：預約網站（GitHub Pages）
// - PUBLIC_BASE_URL：同事使用的後端網址（Cloudflare Pages 入口），用於 LINE 教學中的 /ai、/mcp 網址；未設定時用這次請求的網址
// - FRONTEND_ORIGIN：允許跨站請求的網站來源（CORS），見 env.ts
// 每個請求開始時由 index.ts 的 middleware 設定；同一個部署的所有請求都相同
import type { Env } from "./env.ts";

export interface SiteUrls {
  website: string; // 結尾有 /
  publicBase: string; // 結尾沒有 /
}

let current: SiteUrls = { website: "", publicBase: "" };

const withSlash = (s: string) => (s && !s.endsWith("/") ? `${s}/` : s);
const withoutSlash = (s: string) => s.replace(/\/+$/, "");

export function configureSite(env: Env, requestOrigin: string): void {
  current = {
    website: withSlash((env.WEBSITE_URL ?? "").trim()),
    publicBase: withoutSlash((env.PUBLIC_BASE_URL ?? "").trim() || requestOrigin),
  };
}

export const site = (): SiteUrls => current;
