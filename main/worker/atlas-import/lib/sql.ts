// 產生匯入 D1 的 SQL（純函式）
import { BOOKING_COLUMNS, type BookingRow, USER_COLUMNS, type UserRow } from "./normalize.ts";

// D1 單一 SQL 敘述上限 100 KB，保留餘裕
export const MAX_STATEMENT_BYTES = 90_000;

export function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("數值必須是有限數字");
    return String(value);
  }
  // SQLite 字串只需把單引號重複一次；NUL 字元無法放進 SQL 字串，直接拒絕
  if (value.includes("\0")) throw new Error("字串含有 NUL 字元");
  return `'${value.replaceAll("'", "''")}'`;
}

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).length;

/** 把多筆資料拆成數個 INSERT，每個不超過 maxBytes */
export function insertStatements<R>(
  table: string,
  columns: (keyof R)[],
  rows: R[],
  maxBytes = MAX_STATEMENT_BYTES,
): string[] {
  const head = `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n`;
  const statements: string[] = [];
  let values: string[] = [];
  let size = byteLength(head);
  for (const row of rows) {
    const tuple = `(${columns.map((c) => sqlLiteral(row[c] as string | number | null)).join(", ")})`;
    const tupleSize = byteLength(tuple) + 2;
    if (byteLength(head) + tupleSize + 1 > maxBytes) throw new Error(`單筆資料超過 ${maxBytes} bytes`);
    if (values.length > 0 && size + tupleSize + 1 > maxBytes) {
      statements.push(`${head}${values.join(",\n")};`);
      values = [];
      size = byteLength(head);
    }
    values.push(tuple);
    size += tupleSize;
  }
  if (values.length > 0) statements.push(`${head}${values.join(",\n")};`);
  return statements;
}

/** 先清空再匯入：可以重複執行 */
export function buildImportSql(bookings: BookingRow[], users: UserRow[]): string {
  return [
    "-- 由 atlas-import/transform.ts 產生；先清空資料表再匯入，可重複執行",
    "DELETE FROM bookings;",
    "DELETE FROM users;",
    ...insertStatements("bookings", BOOKING_COLUMNS, bookings),
    ...insertStatements("users", USER_COLUMNS, users),
    "",
  ].join("\n");
}

// 估計 D1「寫入列數」：每寫入或刪除一列，資料表本身與每個索引各算一列
// bookings：資料表 + 主鍵 + 2 個索引 + group_id 部分索引（只有 group_id 不是 NULL 才算）
// users：資料表 + 2 個索引（seq 是 rowid，不另外算）
export function estimateRowsWritten(bookings: BookingRow[], users: UserRow[]): number {
  const grouped = bookings.filter((b) => b.group_id !== null).length;
  return bookings.length * 4 + grouped + users.length * 3;
}
