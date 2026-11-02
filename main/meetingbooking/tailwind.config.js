// Tailwind CSS 在建置時產生（取代原本 index.html 載入的 cdn.tailwindcss.com）
// 版本與原本 CDN 相同（3.4.17），使用預設設定，畫面不變
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
