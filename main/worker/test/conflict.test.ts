// 衝突檢查整合測試：由 Deno 版 conflict_integration_test.ts 移植（MongoDB 交易 → D1 條件式寫入 + 整批回復）
// 情境與預期結果相同；「舊版修改過（字串時間）」的預約改成「從 Atlas 匯入的舊資料」
import { beforeEach, describe, expect, it } from "vitest";
import { api, countOverlaps, insertRow, resetDb, rows, seedUser } from "./helpers.ts";

const T = (hm: string) => `2026-12-01T${hm}:00.000Z`;
const ms = (hm: string) => new Date(T(hm)).getTime();

let seq = 0;
async function add(rooms: string | string[], s: string, e: string, title = `b${++seq}`) {
  const res = await api("POST", "/api/bookings/", {
    title,
    user: "1234",
    room: Array.isArray(rooms) ? rooms : [rooms],
    participantsNum: 2,
    startTime: T(s),
    endTime: T(e),
    editPassword: "",
  });
  return res.status;
}

// 與前端修改視窗送出的內容相同；可指定同組中的某一間
async function edit(title: string, patch: { room?: string; s?: string; e?: string; of?: string }) {
  const [doc] = await rows(
    `title = ? AND cancelled = 0${patch.of ? " AND room = ?" : ""}`,
    title,
    ...(patch.of ? [patch.of] : []),
  );
  expect(doc, `找不到預約 ${title}`).toBeDefined();
  const res = await api("PATCH", `/api/bookings/${doc.id}/`, {
    title,
    participantsNum: 2,
    room: patch.room ?? doc.room,
    date: "2026-12-01",
    startTime: patch.s ? T(patch.s) : new Date(doc.start_time).toISOString(),
    endTime: patch.e ? T(patch.e) : new Date(doc.end_time).toISOString(),
  });
  return res.status;
}

async function cancel(title: string) {
  const [doc] = await rows("title = ? AND cancelled = 0", title);
  return (await api("PATCH", `/api/bookings/${doc.id}/`, { cancelled: true })).status;
}

async function addLegacy(room: string, s: string, e: string, title: string) {
  await insertRow({ id: crypto.randomUUID(), title, room, start_time: ms(s), end_time: ms(e) });
}

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

const probes: [string, string, string, number][] = [
  ["完全相同", "10:00", "11:00", 400],
  ["後段重疊", "10:30", "11:30", 400],
  ["前段重疊", "09:30", "10:30", 400],
  ["被包含", "10:15", "10:45", 400],
  ["完全包住", "09:00", "12:00", 400],
  ["只重疊 1 分鐘", "10:59", "11:30", 400],
  ["緊接在後", "11:00", "12:00", 201],
  ["緊接在前", "09:00", "10:00", 201],
];

describe("新增 vs 一般預約", () => {
  for (const [name, s, e, want] of probes) {
    it(name, async () => {
      await add("A101", "10:00", "11:00", "base");
      expect(await add("A101", s, e)).toBe(want);
    });
  }
  it("不同會議室同時段可預約", async () => {
    await add("A101", "10:00", "11:00", "base");
    expect(await add("A102", "10:00", "11:00")).toBe(201);
  });
  it("已取消的時段可再預約", async () => {
    await add("A101", "10:00", "11:00", "base");
    expect(await cancel("base")).toBe(200);
    expect(await add("A101", "10:00", "11:00")).toBe(201);
  });
});

describe("新增 vs 從 Atlas 匯入的舊資料", () => {
  for (const [name, s, e, want] of probes) {
    it(name, async () => {
      await addLegacy("A101", "10:00", "11:00", "base");
      expect(await add("A101", s, e)).toBe(want);
    });
  }
  it("舊資料沒有 cancelled 欄位（NULL）時與舊系統相同：不算衝突", async () => {
    await insertRow({ id: "no-cancelled", room: "A101", start_time: ms("10:00"), end_time: ms("11:00"), cancelled: null });
    expect(await add("A101", "10:00", "11:00")).toBe(201);
  });
});

describe("新增 vs 修改過的預約", () => {
  for (const [name, s, e, want] of probes) {
    it(name, async () => {
      await add("A101", "08:00", "09:00", "base");
      expect(await edit("base", { s: "10:00", e: "11:00" })).toBe(200);
      expect(await add("A101", s, e)).toBe(want);
    });
  }
});

describe("修改", () => {
  it("自己、時間不變", async () => {
    await add("A101", "10:00", "11:00", "base");
    expect(await edit("base", {})).toBe(200);
  });
  it("自己、與原時段重疊", async () => {
    await add("A101", "10:00", "11:00", "base");
    expect(await edit("base", { s: "10:30", e: "11:30" })).toBe(200);
  });
  it("改到別人的時段", async () => {
    await add("A101", "10:00", "11:00", "base");
    await add("A101", "13:00", "14:00", "x");
    expect(await edit("x", { s: "10:30", e: "11:30" })).toBe(400);
  });
  it("改到舊資料的時段", async () => {
    await addLegacy("A101", "10:00", "11:00", "base");
    await add("A101", "13:00", "14:00", "x");
    expect(await edit("x", { s: "10:30", e: "11:30" })).toBe(400);
  });
  it("舊資料再修改，與自己原時段重疊", async () => {
    await addLegacy("A101", "10:00", "11:00", "base");
    expect(await edit("base", { s: "10:30", e: "11:30" })).toBe(200);
    const [doc] = await rows("title = 'base'");
    expect(doc.start_time).toBe(ms("10:30"));
    expect(doc.updated_count).toBe(2);
  });
  it("換到已被佔用的會議室", async () => {
    await add("A101", "10:00", "11:00", "base");
    await add("A102", "10:00", "11:00", "x");
    expect(await edit("x", { room: "A101" })).toBe(400);
  });
});

describe("多會議室", () => {
  it("其中一間衝突 → 整筆不寫入", async () => {
    await add("A102", "10:00", "11:00", "base");
    expect(await add(["A101", "A102"], "10:00", "11:00", "multi")).toBe(400);
    expect((await rows("room = 'A101' AND cancelled = 0")).length).toBe(0);
  });
  it("修改同組時間撞到另一間的預約", async () => {
    await add(["A101", "A102"], "13:00", "14:00", "multi");
    await add("A102", "10:00", "11:00", "y");
    expect(await edit("multi", { of: "A101", s: "10:00", e: "11:00" })).toBe(400);
    expect(await countOverlaps()).toBe(0);
  });
  it("同組互相不算衝突，修改後兩間一起移動", async () => {
    await add(["A101", "A102"], "13:00", "14:00", "multi");
    expect(await edit("multi", { of: "A101", s: "13:30", e: "14:30" })).toBe(200);
    const docs = await rows("title = 'multi'");
    expect(docs.every((d) => d.start_time === ms("13:30"))).toBe(true);
  });
});

describe("同時送出（併發寫入）", () => {
  it("20 個相同時段只有 1 個成功", async () => {
    const st: number[] = await Promise.all(Array.from({ length: 20 }, () => add("A101", "10:00", "11:00")));
    expect(st.filter((s) => s === 201).length).toBe(1);
    expect(st.filter((s) => s === 400).length).toBe(19);
    expect(await countOverlaps()).toBe(0);
  });
  it("10 個互相重疊的不同時段只有 1 個成功", async () => {
    const slots: [string, string][] = [
      ["10:00", "11:00"],
      ["10:30", "11:30"],
      ["10:45", "12:00"],
      ["09:30", "10:50"],
      ["10:10", "10:50"],
      ["10:20", "11:10"],
      ["09:50", "10:55"],
      ["10:05", "11:45"],
      ["10:35", "10:50"],
      ["10:25", "10:46"],
    ];
    const st: number[] = await Promise.all(slots.map(([s, e]) => add("A101", s, e)));
    expect(st.filter((s) => s === 201).length).toBe(1);
    expect(await countOverlaps()).toBe(0);
  });
  it("3 組多會議室互相共用一間，只有 1 組成功", async () => {
    const st: number[] = await Promise.all([
      add(["A101", "A102"], "10:00", "11:00"),
      add(["A102", "A103"], "10:00", "11:00"),
      add(["A103", "A101"], "10:00", "11:00"),
    ]);
    expect(st.filter((s) => s === 201).length).toBe(1);
    expect(await countOverlaps()).toBe(0);
  });
  it("兩筆預約同時改到同一個空時段，只有 1 筆成功", async () => {
    await add("A101", "13:00", "14:00", "p");
    await add("A101", "15:00", "16:00", "q");
    const st: number[] = await Promise.all([edit("p", { s: "10:00", e: "11:00" }), edit("q", { s: "10:00", e: "11:00" })]);
    expect(st.filter((s) => s === 200).length).toBe(1);
    expect(await countOverlaps()).toBe(0);
  });
  it("新增與修改搶同一時段，只有 1 個成功", async () => {
    await add("A101", "13:00", "14:00", "p");
    const [a, e]: number[] = await Promise.all([add("A101", "10:00", "11:00"), edit("p", { s: "10:00", e: "11:00" })]);
    expect((a === 201 ? 1 : 0) + (e === 200 ? 1 : 0)).toBe(1);
    expect(await countOverlaps()).toBe(0);
  });
  it("同一筆預約同時修改與取消，結果一致", async () => {
    await add(["A101", "A102"], "13:00", "14:00", "g");
    const [doc] = await rows("title = 'g' AND room = 'A101'");
    const [e, c]: number[] = await Promise.all([
      edit("g", { of: "A101", s: "10:00", e: "11:00" }),
      api("PATCH", `/api/bookings/${doc.id}/`, { cancelled: true }).then((r) => r.status),
    ]);
    expect(c).toBe(200);
    expect([200, 404]).toContain(e);
    const [sibling] = await rows("title = 'g' AND room = 'A102'");
    // 取消後同組的另一間不再列出被取消的會議室
    expect(JSON.parse(sibling.is_multi)).toEqual([]);
  });
  it("壓力測試：150 筆隨機新增／修改分批同時送出後沒有重疊", async () => {
    const rooms = ["A101", "A102", "A103"];
    const rnd = (n: number) => Math.floor(Math.random() * n);
    const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    await addLegacy("A102", "12:00", "13:00", "legacy");
    for (let batch = 0; batch < 5; batch++) {
      const titles = (await rows("cancelled = 0")).map((d) => d.title);
      await Promise.all(Array.from({ length: 30 }, () => {
        const start = 9 * 60 + rnd(16) * 30;
        const [s, e] = [hm(start), hm(start + 30 * (1 + rnd(4)))];
        if (titles.length > 0 && Math.random() < 0.4) {
          return edit(titles[rnd(titles.length)], { s, e, room: rooms[rnd(3)] }).catch(() => 0);
        }
        const rs = Math.random() < 0.3 ? [rooms[rnd(3)], rooms[rnd(3)]] : [rooms[rnd(3)]];
        return add([...new Set(rs)], s, e);
      }));
    }
    expect(await countOverlaps()).toBe(0);
  });
});

describe("資料庫層的保證", () => {
  it("即使衝突查詢讀到舊資料（模擬兩個請求同時通過檢查），寫入時仍會被擋下", async () => {
    const { env } = await import("cloudflare:test");
    const { createBooking } = await import("../src/bookings.ts");
    // 讓衝突查詢永遠回傳「沒有衝突」，只剩寫入時的條件式檢查
    const staleDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop !== "prepare") return Reflect.get(target, prop).bind?.(target) ?? Reflect.get(target, prop);
        return (sql: string) => {
          const stmt = target.prepare(sql);
          if (!sql.startsWith("SELECT * FROM bookings WHERE room = ?")) return stmt;
          return { bind: () => ({ all: async () => ({ results: [] }) }) };
        };
      },
    }) as D1Database;
    const input = { title: "t", user: "1234", rooms: ["A101"], startTime: T("10:00"), endTime: T("11:00"), editPassword: "" };
    expect((await createBooking(staleDb, input)).ok).toBe(true);
    await expect(createBooking(staleDb, input)).rejects.toThrow("重試後仍無法完成");
    expect((await rows("cancelled = 0")).length).toBe(1);
  });
});
