// 顯示設定：字體大小（標準 100%、大 125%、特大 150%）與字體風格（三種），記在這台裝置的瀏覽器
// 字體大小以 CSS 變數 --text-scale 調整：只放大文字，間距與版面不變（見 tailwind.config.js）
// 明體、楷體的字型打包在網站中（公司網路不一定能連外部字型服務），選用時才載入，且只下載畫面上用到的字
import { loadPref, savePref } from "../utils/storage";

export const FONT_SIZES = [
  { key: "100", label: "標準", scale: 1 }, // 原本的大小
  { key: "125", label: "大", scale: 1.25 },
  { key: "150", label: "特大", scale: 1.5 },
] as const;
export type FontSizeKey = (typeof FONT_SIZES)[number]["key"];
export const DEFAULT_FONT_SIZE: FontSizeKey = "100";

export const FONT_STYLES = [
  { key: "default", label: "預設" },
  { key: "serif", label: "明體" },
  { key: "kai", label: "楷體" },
] as const;
export type FontStyleKey = (typeof FONT_STYLES)[number]["key"];
export const DEFAULT_FONT_STYLE: FontStyleKey = "default";

// 各風格的字型檔（只在選用時載入一次）
const fontLoaders: Partial<Record<FontStyleKey, () => Promise<unknown>>> = {
  serif: () => import("@fontsource/noto-serif-tc/400.css"),
  kai: () => import("@fontsource/lxgw-wenkai-tc/400.css"),
};
const loaded = new Set<FontStyleKey>();

/** 打開設定視窗時載入各風格字型，讓「明體」「楷體」按鈕以該字體呈現（只會下載這幾個字） */
export function preloadFontStyles() {
  for (const key of Object.keys(fontLoaders) as FontStyleKey[]) {
    if (loaded.has(key)) continue;
    loaded.add(key);
    fontLoaders[key]?.().catch(() => loaded.delete(key));
  }
}

export interface DisplaySettings {
  fontSize: FontSizeKey;
  fontStyle: FontStyleKey;
}

export function loadDisplaySettings(): DisplaySettings {
  return {
    // 先前五級的設定（fontSize）不沿用，改用新的 textSize
    fontSize: loadPref("textSize", FONT_SIZES.map((s) => s.key)) ?? DEFAULT_FONT_SIZE,
    fontStyle: loadPref("fontStyle", FONT_STYLES.map((s) => s.key)) ?? DEFAULT_FONT_STYLE,
  };
}

/** 套用到頁面（不儲存）；預設值時移除設定，與原本完全相同 */
export function applyDisplaySettings({ fontSize, fontStyle }: DisplaySettings) {
  const root = document.documentElement;
  const scale = FONT_SIZES.find((s) => s.key === fontSize)?.scale ?? 1;
  if (scale === 1) root.style.removeProperty("--text-scale");
  else root.style.setProperty("--text-scale", String(scale));
  if (fontStyle === DEFAULT_FONT_STYLE) {
    delete root.dataset.font;
  } else {
    root.dataset.font = fontStyle;
    if (!loaded.has(fontStyle)) {
      loaded.add(fontStyle);
      fontLoaders[fontStyle]?.().catch(() => loaded.delete(fontStyle)); // 載入失敗時沿用系統字型，下次再試
    }
  }
}

export function saveDisplaySettings(settings: DisplaySettings) {
  savePref("textSize", settings.fontSize);
  savePref("fontStyle", settings.fontStyle);
  applyDisplaySettings(settings);
}
