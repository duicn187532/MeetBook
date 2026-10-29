// 記住使用者偏好（行編、會議室、檢視模式）；瀏覽器不允許儲存時（例如無痕模式）靜默略過
const PREFIX = "meetbook.";

export function loadPref<T extends string>(key: string, allowed?: readonly T[]): T | null {
  try {
    const value = localStorage.getItem(PREFIX + key);
    if (value === null) return null;
    if (allowed && !allowed.includes(value as T)) return null;
    return value as T;
  } catch {
    return null;
  }
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // 無法儲存不影響使用
  }
}
