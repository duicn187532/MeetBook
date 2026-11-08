// 中繼模式：公司網路擋 *.workers.dev 與 *.pages.dev，但連得到這個舊的 Deno 網址。
// 在 Deno Deploy 設定環境變數 BRIDGE_TARGET=<Worker 網址>（例如 https://xxx.workers.dev）後，
// 這個服務不再使用 MongoDB，把所有請求（/api/*、/cal/*、/b/*、/admin…）原封不動轉給 Worker，
// 資料只有 Worker（D1）一份，不會有兩邊不同步的問題。未設定時行為完全不變。
// 網址中可能有編輯密碼，所以 log 不記錄網址，也不記錄錯誤訊息內容（錯誤訊息會帶網址）。
import { logEvent } from "./logger.ts";

/** 解析 BRIDGE_TARGET：只接受 https 網址，只取 origin（去掉結尾斜線與路徑）；不合格回傳 null */
export function parseBridgeTarget(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// 不轉送的標頭：連線層級的標頭，以及由 fetch 依實際內容重新產生的長度、壓縮
const DROP_REQUEST = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "accept-encoding",
];
const DROP_RESPONSE = ["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding"];

// Worker 一般在 1 秒內回應；超過這個時間視為轉送失敗
const TIMEOUT_MS = 25_000;

/** 建立轉送處理函式：同樣的路徑、查詢字串、方法、標頭與內容送到 target，回應原樣傳回（包含轉址） */
export function createBridge(target: string, fetchFn: typeof fetch = fetch): (req: Request) => Promise<Response> {
  return async (req) => {
    const incoming = new URL(req.url);
    const url = target + incoming.pathname + incoming.search;
    const headers = new Headers(req.headers);
    for (const name of DROP_REQUEST) headers.delete(name);
    // 要求不壓縮，回應交給 Deno 視情況重新壓縮，避免標頭與內容不一致
    headers.set("accept-encoding", "identity");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    try {
      const res = await fetchFn(url, {
        method: req.method,
        headers,
        body: hasBody ? await req.arrayBuffer() : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const out = new Headers(res.headers);
      for (const name of DROP_RESPONSE) out.delete(name);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
    } catch (error) {
      logEvent("warning", "中繼轉送失敗", { details: { method: req.method, error: (error as Error).name } });
      return Response.json({ error: "伺服器暫時無法連線，請稍後再試" }, { status: 502 });
    }
  };
}
