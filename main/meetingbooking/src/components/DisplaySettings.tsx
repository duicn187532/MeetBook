import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import {
  DisplaySettings as Settings_,
  FONT_SIZES,
  FONT_STYLES,
  FONT_WEIGHTS,
  loadDisplaySettings,
  preloadFontStyles,
  saveDisplaySettings,
} from "../config/display";

// 右上角的齒輪：打開小視窗調整字體大小（標準、大、特大）、字體風格（五種）與字體粗細（三種），立即套用並記在這台裝置
const DisplaySettings = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings_>(loadDisplaySettings);
  const panelRef = useRef<HTMLDivElement>(null);

  // 點視窗外面或按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function update(next: Partial<Settings_>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    saveDisplaySettings(merged);
  }

  const option = (active: boolean) =>
    `flex-1 flex items-center justify-center rounded-lg border py-1.5 ${
      active ? "border-[#F08B42] bg-[#FFF4EC] text-[#C2601C]" : "border-gray-200 bg-white text-gray-700"
    }`;

  return (
    <div ref={panelRef} className="absolute top-2 right-2 z-30">
      <button
        type="button"
        onClick={() => {
          preloadFontStyles();
          setOpen((v) => !v);
        }}
        className="w-9 h-9 p-0 flex items-center justify-center rounded-lg bg-transparent shadow-none text-gray-500 hover:text-gray-700"
        aria-label="顯示設定"
        aria-expanded={open}
        title="顯示設定"
      >
        <Settings size={20} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="顯示設定"
          className="absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-1rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left"
        >
          <div className="text-sm font-semibold text-gray-600 mb-2">字體大小</div>
          <div className="flex gap-1.5 mb-3" role="radiogroup" aria-label="字體大小">
            {FONT_SIZES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={settings.fontSize === s.key}
                onClick={() => update({ fontSize: s.key })}
                className={`${option(settings.fontSize === s.key)} p-0 shadow-none h-9`}
              >
                {/* 以固定像素顯示，按鈕大小不隨設定改變 */}
                <span style={{ fontSize: `${13 + i * 2}px` }} className="leading-none">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold text-gray-600 mb-2">字體風格</div>
          <div className="flex gap-1.5 mb-3" role="radiogroup" aria-label="字體風格">
            {FONT_STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={settings.fontStyle === s.key}
                onClick={() => update({ fontStyle: s.key })}
                className={`${option(settings.fontStyle === s.key)} p-0 shadow-none h-9 font-style-${s.key}`}
              >
                {/* 以固定像素顯示，按鈕不隨字體大小設定改變 */}
                <span style={{ fontSize: "14px" }} className="leading-none">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="text-sm font-semibold text-gray-600 mb-2">字體粗細</div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="字體粗細">
            {FONT_WEIGHTS.map((w, i) => (
              <button
                key={w.key}
                type="button"
                role="radio"
                aria-checked={settings.fontWeight === w.key}
                onClick={() => update({ fontWeight: w.key })}
                className={`${option(settings.fontWeight === w.key)} p-0 shadow-none h-9`}
              >
                {/* 以各自的粗細與固定像素顯示，不受目前設定影響 */}
                <span style={{ fontSize: "14px", fontWeight: [400, 600, 800][i] }} className="leading-none">{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplaySettings;
