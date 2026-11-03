// hooks/usePageVisible.ts
import { useEffect, useState } from "react";

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * 頁面目前是否看得到（不是在背景分頁、縮到最小或手機切到其他 App），
 * 以及「回到頁面」的次數 resumes：每次從看不到變成看得到、或從瀏覽器的上一頁快取還原時加 1
 */
export default function usePageVisible() {
  const [state, setState] = useState(() => ({ visible: isVisible(), resumes: 0 }));
  useEffect(() => {
    const update = (restored: boolean) =>
      setState((prev) => {
        const visible = isVisible();
        const resumes = visible && (restored || !prev.visible) ? prev.resumes + 1 : prev.resumes;
        return visible === prev.visible && resumes === prev.resumes ? prev : { visible, resumes };
      });
    const onVisibilityChange = () => update(false);
    // iPhone Safari 從上一頁快取還原時不一定會觸發 visibilitychange
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) update(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return state;
}
