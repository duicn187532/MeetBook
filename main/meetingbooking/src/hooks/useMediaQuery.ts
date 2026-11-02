// hooks/useMediaQuery.ts
import { useEffect, useState } from "react";

const query = (q: string) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false);

// 監聽 CSS media query，視窗大小改變時跟著切換
export default function useMediaQuery(q: string) {
  const [matches, setMatches] = useState(() => query(q));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(q);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [q]);
  return matches;
}

// 電腦版排版：寬 1024px 以上且高度足夠（手機橫放不算）
export const DESKTOP_QUERY = "(min-width: 1024px) and (min-height: 600px)";
