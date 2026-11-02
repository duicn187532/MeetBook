// 匯入後驗證：讀回 D1 的全部資料，逐筆逐欄與預期資料比對（比抽查更完整）
//
//   node atlas-import/verify_d1.ts <expected.json> <報告輸出.md> --remote|--local
//
// 只輸出筆數、預約 id 與欄位名稱，不輸出資料內容。有任何差異時 exit 1。
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BookingRow, UserRow } from "./lib/normalize.ts";
import { compareBookings, compareUsers, isClean, type TableComparison } from "./lib/compare.ts";
import { d1Query } from "./lib/wrangler.ts";
import { D1_NAME } from "./d1_setup.ts";

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export function formatComparison(results: TableComparison[]): string {
  const lines = ["## 匯入後驗證", "", "| 資料表 | 預期筆數 | D1 筆數 | 缺少 | 多出 | 內容不同 | 結果 |", "|---|---:|---:|---:|---:|---:|---|"];
  for (const c of results) {
    lines.push(
      `| ${c.table} | ${c.expected} | ${c.actual} | ${c.missing.length} | ${c.extra.length} | ${c.mismatched.length} | ${
        isClean(c) ? "✅ 一致" : "❌ 不一致"
      } |`,
    );
  }
  lines.push("", "每一筆資料的每一個欄位都已和轉換結果比對。");
  for (const c of results) {
    const key = c.table === "users" ? "匯入順序" : "預約 id";
    for (const k of c.missing.slice(0, 20)) lines.push(`- ${c.table} 缺少 ${key} ${k}`);
    for (const k of c.extra.slice(0, 20)) lines.push(`- ${c.table} 多出 ${key} ${k}`);
    for (const m of c.mismatched.slice(0, 20)) lines.push(`- ${c.table} ${key} ${m.key} 欄位不同：${m.columns.join("、")}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const [expectedPath, reportPath] = process.argv.slice(2);
  const target = [process.argv.includes("--local") ? "--local" : "--remote"];
  if (!expectedPath || !reportPath) throw new Error("用法：verify_d1.ts <expected.json> <report.md> --remote|--local");
  const expected = JSON.parse(await readFile(expectedPath, "utf8")) as { bookings: BookingRow[]; users: UserRow[] };

  const bookings = await d1Query<Record<string, unknown>>(D1_NAME, "SELECT * FROM bookings", target, workerDir);
  const users = await d1Query<Record<string, unknown>>(D1_NAME, "SELECT * FROM users ORDER BY seq", target, workerDir);
  const results = [compareBookings(expected.bookings, bookings), compareUsers(expected.users, users)];
  await writeFile(reportPath, formatComparison(results));

  for (const c of results) console.log(`${c.table}：預期 ${c.expected}、D1 ${c.actual}、${isClean(c) ? "一致" : "不一致"}`);
  if (!results.every(isClean)) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
