// hooks/useSwipe.ts
import { TouchEvent, useRef } from "react";

// 水平滑動超過門檻、且明顯比垂直移動大時才算換頁，避免干擾上下捲動與點擊會議
const MIN_DISTANCE = 60;
const HORIZONTAL_RATIO = 1.5;

export default function useSwipe(onSwipe: (direction: "prev" | "next") => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - from.x;
      const dy = e.changedTouches[0].clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;
      onSwipe(dx < 0 ? "next" : "prev");
    },
  };
}
