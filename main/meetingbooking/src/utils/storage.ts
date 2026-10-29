// 記住使用者偏好（行編、會議室、檢視模式、看過的更新日誌）
// localStorage 不能用時退回 sessionStorage（只在這次開啟有效）；都不能用時靜默略過
const PREFIX = "meetbook.";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function loadPref<T extends string>(key: string, allowed?: readonly T[]): T | null {
  const value = read(() => localStorage, key) ?? read(() => sessionStorage, key);
  if (value === null) return null;
  if (allowed && !allowed.includes(value as T)) return null;
  return value as T;
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
    return;
  } catch {
    // 改存 sessionStorage
  }
  try {
    sessionStorage.setItem(PREFIX + key, value);
  } catch {
    // 無法儲存不影響使用
  }
}
