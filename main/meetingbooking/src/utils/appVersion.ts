// 自動更新到最新版：LINE 等 App 的內建瀏覽器常把舊版網頁留在快取，部署新版後仍顯示舊畫面。
// 網站開啟時與回到頁面時，向伺服器讀取 version.json（不使用快取）比對；版本不同就以帶版本參數的網址
// 重新載入（網址不同，內建瀏覽器才會向伺服器重新取得網頁），載入後再把參數從網址列拿掉。
// version.json 由 vite.config.ts 在建置時產生。

const RELOADED_KEY = "meetbook.reloadedFor";
const PARAM = "v";

async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

function reloadTo(version: string) {
  // 同一個版本只自動重新載入一次，避免剛部署、伺服器尚未全部更新時一直重新整理
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === version) return;
    sessionStorage.setItem(RELOADED_KEY, version);
  } catch {
    return; // 無法記錄時不自動重新載入
  }
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, version);
  window.location.replace(url.toString());
}

// 把重新載入時加上的版本參數從網址列拿掉（不重新載入）
function cleanUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

// 使用者正在操作（開著視窗或正在輸入）時不打斷，下次回到頁面再檢查
function isBusy(): boolean {
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  // 網站的各種視窗（預約、預約資訊、提示、公告）都是 fixed inset-0 的遮罩
  return typing || document.querySelector(".fixed.inset-0") !== null;
}

export function startVersionCheck() {
  cleanUrl();
  if (__APP_VERSION__.startsWith("dev-")) return; // 本機建置不檢查

  const check = async (onStartup: boolean) => {
    const latest = await latestVersion();
    if (!latest || latest === __APP_VERSION__) return;
    if (!onStartup && isBusy()) return;
    reloadTo(latest);
  };

  void check(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check(false);
  });
  // iPhone 從上一頁快取還原時不一定會觸發 visibilitychange
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) void check(false);
  });
}
