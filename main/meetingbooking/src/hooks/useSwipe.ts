// hooks/useSwipe.ts
import { CSSProperties, TouchEvent, useEffect, useRef, useState } from "react";

// 水平滑動超過門檻、且明顯比垂直移動大時才算換頁，避免干擾上下捲動與點擊會議
const MIN_DISTANCE = 60;
const HORIZONTAL_RATIO = 1.5;
// 判斷手勢方向前允許的移動距離
const AXIS_LOCK_DISTANCE = 10;
const SLIDE_MS = 180;

/**
 * 左右滑動換頁：拖曳時內容跟著手指移動，放開後超過門檻就滑出、換頁、再從另一側滑入，否則彈回原位。
 * 回傳的 handlers 掛在外層容器，style 掛在要移動的內容上。
 */
export default function useSwipe(enabled: boolean, onSwipe: (direction: "prev" | "next") => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const width = useRef(0);
  const timers = useRef<number[]>([]);
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  // 換頁後新的一頁從哪一側滑入（CSS keyframes，定義在 globals.css）
  const [enter, setEnter] = useState<"next" | "prev" | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // 動畫：移到 to，結束後執行 then
  const slideTo = (to: number, then?: () => void) => {
    setAnimating(true);
    setOffset(to);
    later(() => {
      setAnimating(false);
      then?.();
    }, SLIDE_MS);
  };

  const reset = () => {
    start.current = null;
    axis.current = null;
  };

  const handlers = {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      if (!enabled || animating || enter || e.touches.length !== 1) {
        reset();
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      axis.current = null;
      width.current = e.currentTarget.clientWidth;
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      const from = start.current;
      if (!from || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - from.x;
      const dy = e.touches[0].clientY - from.y;
      if (!axis.current) {
        if (Math.abs(dx) < AXIS_LOCK_DISTANCE && Math.abs(dy) < AXIS_LOCK_DISTANCE) return;
        axis.current = Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_RATIO ? "x" : "y";
      }
      if (axis.current === "x") setOffset(dx);
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const from = start.current;
      const horizontal = axis.current === "x";
      reset();
      if (!from || !horizontal || e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - from.x;
      if (Math.abs(dx) < MIN_DISTANCE) {
        slideTo(0);
        return;
      }
      const w = width.current || window.innerWidth;
      const direction = dx < 0 ? "next" : "prev";
      // 滑出 → 換頁 → 新的一頁從另一側滑入
      slideTo(dx < 0 ? -w : w, () => {
        onSwipeRef.current(direction);
        setOffset(0);
        setEnter(direction);
        later(() => setEnter(null), SLIDE_MS);
      });
    },
    onTouchCancel: () => {
      reset();
      slideTo(0);
    },
  };

  const style: CSSProperties = enter
    ? { animation: `swipe-in-${enter} ${SLIDE_MS}ms ease-out` }
    : {
      transform: offset ? `translateX(${offset}px)` : undefined,
      transition: animating ? `transform ${SLIDE_MS}ms ease-out` : "none",
    };

  return { handlers, style };
}
