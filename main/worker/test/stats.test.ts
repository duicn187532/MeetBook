// 統計改在 SQL 彙總後，結果必須與 Deno 版逐筆計算的 computeStats 完全相同：以隨機資料反覆比對
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { computeStats, parseStatsRange } from "../src/admin_rules.ts";
import { type BookingRow, rowToBooking } from "../src/db.ts";
import { statsFromDb } from "../src/stats.ts";

const ROOMS = [{ key: "A101", name: "Alpha" }, { key: "A102", name: "Beta" }, { key: "A103", name: "StartUp" }];
const MIN = 60_000;

// 可重現的亂數
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

async function seed(n: number, seedValue: number) {
  const r = rng(seedValue);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const base = Date.parse("2026-10-25T00:00:00+08:00");
  const stmts = [];
  for (let i = 0; i < n; i++) {
    // 以分鐘為單位；含跨日、週末、可預約時段外、區間邊界、結束不晚於開始的異常資料
    const start = base + Math.floor(r() * 50 * 24 * 60) * MIN;
    const duration = pick([30, 60, 90, 120, 510, 0, -30, 26 * 60, 3 * 24 * 60]) * MIN;
    const userKind = pick(["obj", "obj", "obj", "obj", "noid", "raw", "rawspace", "none"]);
    const uid = pick(["001234", "005977", "000111", "009999"]);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO bookings (id, title, user_id, user_name, user_extension, user_department_code, user_department_label,
           user_group_code, user_group_label, user_raw, room, participants_num, cancelled, start_time, end_time)
         VALUES (?, 't', ?, ?, '', ?, ?, '', '', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `b${i}`,
        userKind === "obj" ? uid : userKind === "noid" ? "" : null,
        userKind === "obj" || userKind === "noid" ? pick(["", "王小明", "陳", `名字${uid}`]) : null,
        userKind === "obj" ? pick(["strategy", "technology", "", "other"]) : null,
        userKind === "obj" ? pick(["數位策略", "金融科技部", "", "其他"]) : null,
        userKind === "raw" ? "王小明 1234" : userKind === "rawspace" ? " 王小明 1234 " : null,
        pick(["A101", "A102", "A103", "A104"]),
        pick([null, 0, 3, 8, 2.5]),
        pick([0, 0, 0, 1, null]),
        start,
        start + duration,
      ),
    );
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
}

async function allDocs() {
  const { results } = await env.DB.prepare("SELECT * FROM bookings ORDER BY rowid").all<BookingRow>();
  return results.map(rowToBooking);
}

describe("SQL 彙總的統計與 computeStats 完全相同", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM bookings");
  });

  for (const seedValue of [1, 2, 3, 4, 5]) {
    it(`隨機資料 #${seedValue}`, async () => {
      await seed(400, seedValue);
      const docs = await allDocs();
      for (const [from, to] of [["2026-11-01", "2026-11-30"], ["2026-10-01", "2026-12-31"], ["2026-11-07", "2026-11-08"]]) {
        const range = parseStatsRange(from, to);
        expect(await statsFromDb(env.DB, range, ROOMS)).toEqual(computeStats(docs, range, ROOMS));
      }
    });
  }

  it("沒有資料時", async () => {
    const range = parseStatsRange("2026-11-01", "2026-11-30");
    expect(await statsFromDb(env.DB, range, ROOMS)).toEqual(computeStats([], range, ROOMS));
  });
});
