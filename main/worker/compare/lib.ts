// 比對新舊後端回應的純函式（方便單元測試）
// 報告只輸出路徑、欄位名稱、預約 id 與序號，不輸出資料內容（可能含個資）

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** 兩個 JSON 值不同的位置，例如 ["data[3].title", "range.from"]；鍵順序不影響結果 */
export function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    if (a.length !== b.length) out.push(`${path}.length`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(...diffPaths(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: string[] = [];
    for (const k of keys) {
      out.push(...diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
    }
    return out;
  }
  return [path || "(根)"];
}

/**
 * 已知且不影響使用的差異：
 * - date：舊資料中有 17 筆的 date 不是字串（舊 API 回傳 null 或沒有這個欄位），新 API 回傳空字串；
 *   前端一律以 startTime 重新計算日期，LINE 也不會把這兩種值當成今天
 */
export function isKnownDifference(field: string, oldValue: unknown, newValue: unknown): boolean {
  return field === "date" && (oldValue === null || oldValue === undefined) && newValue === "";
}

export interface ListComparison {
  oldCount: number;
  newCount: number;
  onlyOld: string[];
  onlyNew: string[];
  changed: { id: string; fields: string[] }[];
  known: { id: string; fields: string[] }[];
  sameOrder: boolean;
}

/** 以 id 比對兩份清單（預約）；順序不同另外標示 */
export function compareById(oldList: Record<string, unknown>[], newList: Record<string, unknown>[]): ListComparison {
  const oldById = new Map(oldList.map((x) => [String(x.id), x]));
  const newById = new Map(newList.map((x) => [String(x.id), x]));
  const result: ListComparison = {
    oldCount: oldList.length,
    newCount: newList.length,
    onlyOld: [...oldById.keys()].filter((id) => !newById.has(id)),
    onlyNew: [...newById.keys()].filter((id) => !oldById.has(id)),
    changed: [],
    known: [],
    sameOrder: oldList.map((x) => String(x.id)).join("\n") === newList.map((x) => String(x.id)).join("\n"),
  };
  for (const [id, o] of oldById) {
    const n = newById.get(id);
    if (!n) continue;
    const fields = diffPaths(o, n);
    if (fields.length === 0) continue;
    const top = (f: string) => f.split(/[.[]/)[0];
    const real = fields.filter((f) => !isKnownDifference(top(f), o[top(f)], n[top(f)]));
    if (real.length > 0) result.changed.push({ id, fields: real });
    else result.known.push({ id, fields });
  }
  return result;
}

export function listIsEqual(c: ListComparison): boolean {
  return c.onlyOld.length === 0 && c.onlyNew.length === 0 && c.changed.length === 0;
}

// ===== 時間區間（台北時間） =====

const TAIPEI_OFFSET = 8 * 3600_000;
const DAY = 86_400_000;

/** 台北時間某月第一天 00:00 的 UTC 時間；monthOffset 可以是負數 */
export function taipeiMonthStart(now: number, monthOffset: number): Date {
  const t = new Date(now + TAIPEI_OFFSET);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + monthOffset, 1) - TAIPEI_OFFSET);
}

export function taipeiDayStart(now: number, dayOffset = 0): Date {
  const t = new Date(now + TAIPEI_OFFSET);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dayOffset) - TAIPEI_OFFSET);
}

/** 台北日期 YYYY-MM-DD（管理後台 API 用） */
export function taipeiYmd(date: Date): string {
  return new Date(date.getTime() + TAIPEI_OFFSET).toISOString().slice(0, 10);
}

/** 前端的預設查詢範圍：上個月 1 日到 3 個月後的月底（見 RoomScheduleView.tsx） */
export function frontendRange(now: number): { from: string; to: string } {
  return {
    from: taipeiMonthStart(now, -1).toISOString(),
    to: new Date(taipeiMonthStart(now, 4).getTime() - 1).toISOString(),
  };
}

export { DAY };
