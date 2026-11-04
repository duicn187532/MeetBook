/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // 聯絡窗口，見 src/config/contact.ts
  readonly VITE_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
