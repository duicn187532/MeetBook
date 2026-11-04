// Worker 的 bindings、環境變數與 secrets
export interface Env {
  DB: D1Database;
  // wrangler.jsonc 的 vars
  ENV?: string;
  LOG_LEVEL?: string;
  // 只在測試時改成假的 LINE API
  LINE_API_BASE?: string;
  // 對外網址（部署時由 GitHub Secrets 以 wrangler --var 提供，不寫在程式中；見 site.ts）
  WEBSITE_URL?: string;
  PUBLIC_BASE_URL?: string;
  FRONTEND_ORIGIN?: string;
  // secrets（由 GitHub Actions 部署時寫入）
  ADMIN_PASSWORD?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  // 萬用編輯密碼：可修改或取消任何預約；未設定或少於 8 個字元時不啟用
  MASTER_PASSWORD?: string;
}

// 正式環境只允許預約網站（FRONTEND_ORIGIN）跨站呼叫；未設定時不允許任何跨站請求
export function corsOrigin(env: Env): string {
  return env.ENV === "production" ? (env.FRONTEND_ORIGIN ?? "").trim() : "*";
}
