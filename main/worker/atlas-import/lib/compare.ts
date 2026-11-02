// 比對預期資料與 D1 實際資料（純函式）；結果只含 id／欄位名稱，不含資料內容
import { BOOKING_COLUMNS, type BookingRow, USER_COLUMNS, type UserRow } from "./normalize.ts";

export interface TableComparison {
  table: string;
  expected: number;
  actual: number;
  missing: string[]; // 預期有、D1 沒有的 key
  extra: string[]; // D1 有、預期沒有的 key
  mismatched: { key: string; columns: string[] }[];
}

type Row = Record<string, unknown>;

function same(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return a === b;
}

function compareTable(
  table: string,
  columns: string[],
  key: string,
  expected: Row[],
  actual: Row[],
): TableComparison {
  const actualByKey = new Map(actual.map((r) => [String(r[key]), r]));
  const expectedKeys = new Set(expected.map((r) => String(r[key])));
  const result: TableComparison = {
    table,
    expected: expected.length,
    actual: actual.length,
    missing: [],
    extra: [],
    mismatched: [],
  };
  for (const exp of expected) {
    const k = String(exp[key]);
    const act = actualByKey.get(k);
    if (!act) {
      result.missing.push(k);
      continue;
    }
    const diff = columns.filter((c) => !same(exp[c], act[c]));
    if (diff.length > 0) result.mismatched.push({ key: k, columns: diff });
  }
  for (const k of actualByKey.keys()) if (!expectedKeys.has(k)) result.extra.push(k);
  return result;
}

export function compareBookings(expected: BookingRow[], actual: Row[]): TableComparison {
  return compareTable("bookings", BOOKING_COLUMNS, "id", expected as unknown as Row[], actual);
}

// users 的 key 是匯入順序（seq），避免在報告中出現行編
export function compareUsers(expected: UserRow[], actual: Row[]): TableComparison {
  return compareTable("users", USER_COLUMNS, "seq", expected as unknown as Row[], actual);
}

export function isClean(c: TableComparison): boolean {
  return c.expected === c.actual && c.missing.length === 0 && c.extra.length === 0 && c.mismatched.length === 0;
}
