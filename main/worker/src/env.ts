// Worker 的 bindings、環境變數與 secrets
export interface Env {
  DB: D1Database;
  // wrangler.jsonc 的 vars
  ENV?: string;
  LOG_LEVEL?: string;
  // 只在測試時改成假的 LINE API
  LINE_API_BASE?: string;
  // secrets（由 GitHub Actions 部署時寫入）
  ADMIN_PASSWORD?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
}

export const PRODUCTION_ORIGIN = "https://duicn187532.github.io";

export function corsOrigin(env: Env): string {
  return env.ENV === "production" ? PRODUCTION_ORIGIN : "*";
}
