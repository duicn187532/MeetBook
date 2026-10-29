// hooks/useNow.ts
import { useEffect, useState } from "react";

// 啟用時每 30 秒更新一次現在時間（epoch 毫秒），用於 Today 分頁的狀態
export default function useNow(active: boolean, intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
