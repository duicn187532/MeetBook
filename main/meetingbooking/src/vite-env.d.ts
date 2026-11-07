/// <reference types="vite/client" />

// 建置版本代號（vite.config.ts）
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // 中繼網址（舊 Deno 網址，轉給同一個 Worker），公司網路連不上 VITE_API_URL 時改用，見 src/api/backend.ts
  readonly VITE_API_URL_BRIDGE?: string;
  // 聯絡窗口，見 src/config/contact.ts
  readonly VITE_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
