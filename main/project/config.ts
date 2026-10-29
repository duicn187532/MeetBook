// 統一載入環境變數：正式環境（Deno Deploy）直接讀取平台設定的環境變數，
// 本地開發則從 .env.development 載入（檔案已被 .gitignore 排除）
import { load } from "@std/dotenv";

export const ENV = Deno.env.get("ENV") || "development";

if (ENV !== "production") {
  await load({ envPath: ".env.development", export: true });
}

export const MONGODB_URI = Deno.env.get("MONGODB_URI") || "";
export const DB_NAME = Deno.env.get("DB_NAME") || "todo_db";
export const PORT = parseInt(Deno.env.get("PORT") || "8080");

export const CORS_ORIGIN = ENV === "production" ? "https://duicn187532.github.io" : "*";

// LINE 官方帳號（Messaging API）；未設定時 /line/webhook 回 503
export const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") || "";
export const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
// 只在本地測試時改成假的 LINE API
export const LINE_API_BASE = Deno.env.get("LINE_API_BASE") || "https://api.line.me";
