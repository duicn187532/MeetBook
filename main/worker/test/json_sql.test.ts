// SQL 產生的 JSON 必須與原本 JavaScript 的轉換（toPublicBooking、toAdminBooking + JSON.stringify）逐字相同
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { toPublicBooking } from "../src/booking_rules.ts";
import { toAdminBooking } from "../src/admin_rules.ts";
import { type BookingRow, rowToBooking } from "../src/db.ts";
import { ADMIN_RECORD_JSON, isoSql, PUBLIC_BOOKING_JSON } from "../src/json_sql.ts";
import { ROOMS } from "../src/line_bot.ts";

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

// 刁鑽的字串：引號、反斜線、換行、tab、控制字元、emoji、中文、前後空白
const TRICKY = ["", "週會", 'He said "hi"', "back\\slash", "line\nbreak\ttab", "ctl\u0001\u001f", "😀 emoji", " 前後空白 ", "a/b", " sep"];

beforeAll(async () => {
  await env.DB.exec("DELETE FROM bookings");
  const r = rng(42);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const stmts = [];
  for (let i = 0; i < 600; i++) {
    const kind = pick(["obj", "obj", "obj", "raw", "none"]);
    const start = Math.floor(r() * 2_000_000_000_000) + 1;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO bookings (id, group_id, created_time, updated_time, title, user_id, user_name, user_extension,
           user_department_code, user_department_label, user_group_code, user_group_label, user_raw, room,
           participants_num, cancelled, start_time, end_time, edit_password, updated_count, date, is_multi, source)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'secret', ?, ?, ?, ?)`,
      ).bind(
        `id-${i}-${pick(TRICKY)}`,
        pick([null, start - 5000, 0]),
        pick([null, start + 1]),
        pick(TRICKY),
        kind === "obj" ? pick(["001234", "12", "", "000099"]) : null,
        kind === "obj" ? pick([...TRICKY, null]) : null,
        kind === "obj" ? pick(["", "52001", null]) : null,
        kind === "obj" ? pick(["", "strategy", "technology", "marketing", "other", null]) : null,
        kind === "obj" ? pick(["", "數位策略", "金融科技部", "其他", null]) : null,
        kind === "obj" ? pick(["", "company", "innovation", "x", null]) : null,
        kind === "obj" ? pick(["", "法人", "其他組", null]) : null,
        kind === "raw" ? pick(TRICKY) : null,
        pick(["A101", "A102", "A103", "Z9", "O'Room"]),
        pick([null, 0, 3, -1, 2.5, 12]),
        pick([0, 1, null]),
        start,
        start + Math.floor(r() * 36_000_000),
        Math.floor(r() * 5),
        pick(["2026-12-01", ""]),
        pick(["[]", '["A102"]', '["A101","A103"]', '["Z9"]']),
        pick([null, "web", "line", "ai-link", "mcp"]),
      ),
    );
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
});

async function pairs(jsonSql: string) {
  const { results } = await env.DB.prepare(`SELECT *, ${jsonSql} AS j FROM bookings ORDER BY rowid`).all<
    BookingRow & { j: string }
  >();
  return results;
}

describe("SQL 產生的 JSON 與 JavaScript 轉換逐字相同", () => {
  it("isoSql 與 toISOString 相同", async () => {
    const r = rng(7);
    for (let i = 0; i < 50; i++) {
      const ms = Math.floor(r() * 4_000_000_000_000);
      const row = await env.DB.prepare(`SELECT ${isoSql("?1")} AS s`).bind(ms).first<{ s: string }>();
      expect(row?.s).toBe(new Date(ms).toISOString());
    }
  });

  it("公開 API（toPublicBooking）", async () => {
    for (const row of await pairs(PUBLIC_BOOKING_JSON)) {
      expect(row.j, row.id).toBe(JSON.stringify(toPublicBooking(rowToBooking(row))));
    }
  });

  it("後台預約紀錄（toAdminBooking）", async () => {
    const rooms = ROOMS.map((r) => ({ key: r.key, name: r.name }));
    for (const row of await pairs(ADMIN_RECORD_JSON)) {
      expect(row.j, row.id).toBe(JSON.stringify(toAdminBooking(rowToBooking(row), rooms)));
    }
  });
});
