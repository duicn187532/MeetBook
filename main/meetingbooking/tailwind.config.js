// Tailwind CSS 在建置時產生（取代原本 index.html 載入的 cdn.tailwindcss.com）
// 版本與原本 CDN 相同（3.4.17）

// 文字大小設定（config/display.ts）：字級乘上 --text-scale（標準 1、大 1.25、特大 1.5），間距不變
// 行高改為倍數，與 Tailwind 預設的行高相同，字放大時一起變高。標準時與原本完全相同
const scaled = (rem) => `calc(${rem}rem * var(--text-scale, 1))`;
const fontSize = {
  "xs": [scaled(0.75), { lineHeight: "1.3333" }],
  // 內文：標準 16px、大 20px、特大 24px（原本為 14px）
  "sm": [scaled(1), { lineHeight: "1.5" }],
  "base": [scaled(1), { lineHeight: "1.5" }],
  "lg": [scaled(1.125), { lineHeight: "1.5556" }],
  "xl": [scaled(1.25), { lineHeight: "1.4" }],
  "2xl": [scaled(1.5), { lineHeight: "1.3333" }],
  "3xl": [scaled(1.875), { lineHeight: "1.2" }],
  "4xl": [scaled(2.25), { lineHeight: "1.1111" }],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { fontSize } },
  plugins: [],
};
