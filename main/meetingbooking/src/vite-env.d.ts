/// <reference types="vite/client" />

// 建置版本代號（vite.config.ts）
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // 聯絡窗口，見 src/config/contact.ts
  readonly VITE_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
