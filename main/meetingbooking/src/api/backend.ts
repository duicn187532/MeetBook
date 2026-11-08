// 後端網址與自動切換：公司網路擋 *.workers.dev、*.pages.dev，但連得到舊的 Deno 網址（中繼，轉給同一個 Worker）。
// 先用平常的網址，連不上（網路錯誤或逾時）時改用中繼網址重送，成功後記住 12 小時，之後直接走中繼，
// 不用每次等逾時；過了 12 小時再試一次平常的網址。兩邊資料是同一份，切換不影響資料。
// 沒有設定中繼網址（VITE_API_URL_BRIDGE）時行為與原本相同。
import { loadPref, savePref } from "../utils/storage";

// 兩個網址都是 <後端>/api/bookings/
const PRIMARY = import.meta.env.VITE_API_URL;
const BRIDGE = import.meta.env.VITE_API_URL_BRIDGE || "";

const PREF_KEY = "bridgeUntil";
const REMEMBER_MS = 12 * 3600_000;
// 查詢請求等待平常網址的上限：被擋的網址有時不會回錯誤，只會一直等
const GET_TIMEOUT_MS = 8_000;

function remembered(): boolean {
  const until = Number(loadPref(PREF_KEY));
  return Number.isFinite(until) && until > Date.now();
}

let useBridge = BRIDGE !== "" && remembered();

function remember(bridge: boolean) {
  useBridge = bridge;
  savePref(PREF_KEY, bridge ? String(Date.now() + REMEMBER_MS) : "0");
}

/** 目前使用的後端網址（<後端>/api/bookings/），給行事曆連結等直接開啟的網址使用 */
export const apiBase = () => (useBridge ? BRIDGE : PRIMARY);

/** 以目前的後端網址解析出完整網址；path 相對於 <後端>/api/bookings/，例如 "../notices" */
export const backendUrl = (path: string, base = apiBase()) => new URL(path, new URL(base, window.location.href));

const isNetworkError = (e: unknown) =>
  e instanceof TypeError || (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"));

function withTimeout(init: RequestInit | undefined, ms: number): RequestInit {
  if (init?.signal || typeof AbortSignal.timeout !== "function") return init ?? {};
  return { ...init, signal: AbortSignal.timeout(ms) };
}

/**
 * 送出請求到後端；連不上時自動改用另一個網址。
 * 只有查詢（GET）會在逾時後重送；新增、修改只在「完全連不上」時重送，
 * 避免第一次其實已經送到、重送後變成重複預約。
 */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const first = apiBase();
  const second = BRIDGE === "" ? null : useBridge ? PRIMARY : BRIDGE;
  const isQuery = !init?.method || init.method.toUpperCase() === "GET";
  try {
    return await fetch(backendUrl(path, first), isQuery ? withTimeout(init, GET_TIMEOUT_MS) : init);
  } catch (e) {
    if (second === null || !isNetworkError(e)) throw e;
    if (!isQuery && !(e instanceof TypeError)) throw e;
    const res = await fetch(backendUrl(path, second), init);
    remember(second === BRIDGE);
    return res;
  }
}
