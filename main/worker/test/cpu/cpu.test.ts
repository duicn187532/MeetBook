// CPU 時間量測：Workers 免費方案每個請求的 CPU 上限是 10ms（等待 D1 的時間不算）。
// 以大量資料執行各 API 在 Worker 中實際做的事：解析 D1 回傳的資料、計算、組出回應。
// 實際資料約每年 770 筆預約；這裡用數倍到十倍的量，並要求中位數低於 5ms，保留一半給其他開銷。
// 這台機器比 Cloudflare 慢，Node 22 的 V8 也比 workerd 舊，實際 CPU 時間會更短；部署後再以 Cloudflare 的數據確認。
import { describe, expect, it } from "vitest";
import { type BookingRow, rowToBooking } from "../../src/db.ts";
import {
  addWindowMinutes,
  finishStats,
  MAX_RECORDS,
  newStatsState,
  parseStatsRange,
  roomEntry,
  toAdminBooking,
} from "../../src/admin_rules.ts";
import { toPublicBooking } from "../../src/booking_rules.ts";
import { joinJsonRows } from "../../src/json_sql.ts";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOMS = [{ key: "A101", name: "Alpha" }, { key: "A102", name: "Beta" }, { key: "A103", name: "StartUp" }];
// 一般資料量（2,000 筆，約目前 2.5 年以上的預約）要低於 5ms；極端上限（5,000 筆）要低於 10ms 的硬上限
const BUDGET_MS = 5;
const HARD_LIMIT_MS = 10;
const budget = (n: number) => (n <= 2000 ? BUDGET_MS : HARD_LIMIT_MS);

function makeRows(n: number, fromMs: number): BookingRow[] {
  return Array.from({ length: n }, (_, i) => {
    const start = fromMs + Math.floor(i / 6) * 86_400_000 + (i % 6) * 5_400_000 + 3_600_000;
    return {
      id: crypto.randomUUID(),
      group_id: i % 5 === 0 ? crypto.randomUUID() : null,
      created_time: start - 86_400_000,
      updated_time: i % 3 === 0 ? start : null,
      title: `會議 ${i} 專案討論與進度報告`,
      user_id: String(1000 + (i % 77)).padStart(6, "0"),
      user_name: i % 4 === 0 ? null : `同事${i % 77}`,
      user_extension: String(51000 + (i % 77)),
      user_department_code: ["technology", "strategy", "marketing"][i % 3],
      user_department_label: ["金融科技部", "數位策略部", "數位行銷部"][i % 3],
      user_group_code: "innovation",
      user_group_label: "創新研發",
      user_raw: null,
      room: ROOMS[i % 3].key,
      participants_num: (i % 8) + 1,
      cancelled: i % 10 === 0 ? 1 : 0,
      start_time: start,
      end_time: start + 3_600_000 * (1 + (i % 3)),
      edit_password: "1234",
      updated_count: i % 3,
      date: new Date(start + 8 * 3_600_000).toISOString().slice(0, 10),
      is_multi: i % 5 === 0 ? '["A102"]' : "[]",
    };
  });
}

// 中位數（毫秒）；先暖機，讓 V8 完成最佳化，與長時間運作的 Worker 相同
function medianMs(fn: () => unknown, runs = 25): number {
  for (let i = 0; i < 5; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

const report: string[] = [];
function measure(name: string, fn: () => unknown): number {
  const ms = medianMs(fn);
  report.push(`${name}：${ms.toFixed(2)} ms`);
  console.log(`[CPU] ${name}：${ms.toFixed(2)} ms`);
  return ms;
}

describe("CPU 時間（每個請求上限 10ms）", () => {
  const range = parseStatsRange("2025-11-01", "2026-12-04");
  const ROOM_LIST = ROOMS.map((r) => ({ key: r.key, name: r.name }));

  for (const n of [2000, 5000]) {
    it(`統計 /admin/api/stats：${n} 筆（彙總在 SQL，Worker 只處理彙總結果與熱力圖）`, () => {
      const rows = makeRows(n, range.from.getTime()).filter((r) => r.cancelled !== 1);
      // D1 回傳：彙總結果（數十列）與每筆的 room、s、e
      const segJson = JSON.stringify(rows.map((r) => ({ room: r.room, s: r.start_time, e: r.end_time })));
      const ms = measure(`統計 ${n} 筆`, () => {
        const state = newStatsState(range, ROOM_LIST);
        for (const r of JSON.parse(segJson) as { room: string; s: number; e: number }[]) {
          addWindowMinutes(state, roomEntry(state, r.room), r.s, r.e);
        }
        return JSON.stringify(finishStats(state, range, ROOM_LIST));
      });
      expect(ms).toBeLessThan(budget(n));
    });
  }

  // D1 回傳：每列一段由 SQL 產生的 JSON 文字（內容與 JavaScript 轉換的結果相同）
  function sqlJsonRows(rows: BookingRow[], toJson: (row: BookingRow) => unknown): string {
    return JSON.stringify(rows.map((r) => ({ j: JSON.stringify(toJson(r)) })));
  }

  for (const n of [2000, MAX_RECORDS + 1]) {
    it(`預約紀錄 /admin/api/bookings：${n} 筆`, () => {
      const json = sqlJsonRows(makeRows(n, range.from.getTime()), (r) => toAdminBooking(rowToBooking(r), ROOMS));
      const ms = measure(`預約紀錄 ${n} 筆`, () => {
        const rows = JSON.parse(json) as { j: string }[];
        return `{"data":${joinJsonRows(rows.slice(0, MAX_RECORDS))},"truncated":false,"rooms":${JSON.stringify(ROOMS)}}`;
      });
      expect(ms).toBeLessThan(budget(n));
    });
  }

  for (const n of [2000, 5000]) {
    it(`前端查詢 GET /api/bookings：${n} 筆`, () => {
      const json = sqlJsonRows(makeRows(n, range.from.getTime()), (r) => toPublicBooking(rowToBooking(r)));
      const ms = measure(`前端查詢 ${n} 筆`, () => {
        const rows = JSON.parse(json) as { j: string }[];
        return `{"data":${joinJsonRows(rows)},"range":${JSON.stringify(range)}}`;
      });
      expect(ms).toBeLessThan(budget(n));
    });
  }

  it("管理頁面：插入 CSP nonce", () => {
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../project/admin/index.html"), "utf8");
    const ms = measure("管理頁面", () => page.replaceAll("__NONCE__", crypto.randomUUID()));
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
