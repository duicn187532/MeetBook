// 唯讀模式：遷移到 Cloudflare 的切換期間，在 Deno Deploy 設定環境變數 READ_ONLY=true 後，
// 舊系統只能查詢，不能新增、修改、取消預約，也不能在管理後台修改使用者。
// 避免還開著舊頁面的同事把預約寫進舊資料庫（新系統看不到）。未設定時行為完全不變。

export const READ_ONLY_MESSAGE = "預約系統已搬到新主機，請重新整理頁面後再操作（若仍出現此訊息，請稍候幾分鐘再試）";

// 管理後台中不會修改資料的 POST
const ADMIN_ALLOWED = new Set(["/admin/api/login", "/admin/api/logout"]);

/** 唯讀模式下要擋下的請求：會修改資料的 API */
export function isBlockedWrite(readOnly: boolean, method: string, path: string): boolean {
  if (!readOnly) return false;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (path.startsWith("/api/")) return true;
  return path.startsWith("/admin/api/") && !ADMIN_ALLOWED.has(path);
}
