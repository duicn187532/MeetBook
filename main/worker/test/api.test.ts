// API 行為測試：路由、狀態碼、回應格式與錯誤訊息須與 Deno 版相同（前端不需修改）
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { WEEKEND_MESSAGE } from "../src/booking_rules.ts";
import { api, insertRow, ORIGIN, resetDb, rows, seedUser } from "./helpers.ts";

const T = (hm: string, day = "2026-12-01") => `${day}T${hm}:00.000Z`;

function payload(over: Record<string, unknown> = {}) {
  return {
    title: "週會",
    user: "1234",
    room: ["A101"],
    participantsNum: 3,
    startTime: T("02:00"),
    endTime: T("03:00"),
    editPassword: "pw12",
    ...over,
  };
}

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("基本路由", () => {
  it("GET / 與 /healthz", async () => {
    expect((await api("GET", "/")).json).toEqual({ ok: true });
    const h = await api("GET", "/healthz");
    expect(h.status).toBe(200);
    expect(h.json).toEqual({ ok: true, db: "ok" });
  });

  it("沒有 D1 binding 時 API 回 503、healthz 回 not_configured", async () => {
    const noDb = { ...env, DB: undefined } as unknown as typeof env;
    const res = await app.fetch(new Request("https://w.test/api/bookings/"), noDb);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "資料庫未設定" });
    const h = await app.fetch(new Request("https://w.test/healthz"), noDb);
    expect(await h.json()).toEqual({ ok: false, db: "not_configured" });
  });

  it("CORS：正式環境只允許 GitHub Pages，預檢回 204", async () => {
    const res = await api("GET", "/api/bookings/");
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const pre = await api("OPTIONS", "/api/bookings/", undefined, {
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "content-type",
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET,POST,PATCH");
    expect(pre.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });
});

describe("GET /api/bookings", () => {
  it("回傳區間內未取消的預約，格式與 Deno 版相同（不含行編、密碼、代碼）", async () => {
    expect((await api("POST", "/api/bookings/", payload({ room: ["A101", "A102"] }))).status).toBe(201);
    await insertRow({ id: "gone", room: "A103", start_time: Date.parse(T("02:00")), end_time: Date.parse(T("03:00")), cancelled: 1 });
    const res = await api("GET", `/api/bookings/?from=${T("00:00")}&to=${T("00:00", "2026-12-02")}`);
    expect(res.status).toBe(200);
    expect(res.json.range).toEqual({ from: "2026-12-01T00:00:00.000Z", to: "2026-12-02T00:00:00.000Z" });
    const data = res.json.data as Record<string, unknown>[];
    expect(data.map((d) => d.room)).toEqual(["A101", "A102"]);
    expect(data[0]).toEqual({
      id: expect.any(String),
      title: "週會",
      user: { name: "測試員", extension: "52001", department: { label: "資訊部" }, group: { label: "開發組" } },
      room: "A101",
      participantsNum: 3,
      startTime: "2026-12-01T02:00:00.000Z",
      endTime: "2026-12-01T03:00:00.000Z",
      date: "2026-12-01",
      updatedCount: 0,
      isMulti: ["A102"],
    });
    expect(Object.keys(data[0])).toEqual([
      "id",
      "title",
      "user",
      "room",
      "participantsNum",
      "startTime",
      "endTime",
      "date",
      "updatedCount",
      "isMulti",
    ]);
    const text = res.text;
    expect(text).not.toContain("001234");
    expect(text).not.toContain("pw12");
  });

  it("可指定會議室；區間外的不回傳", async () => {
    await api("POST", "/api/bookings/", payload({ room: ["A101", "A102"] }));
    await api("POST", "/api/bookings/", payload({ startTime: T("02:00", "2026-12-08"), endTime: T("03:00", "2026-12-08") }));
    const res = await api("GET", `/api/bookings/A102?from=${T("00:00")}&to=${T("00:00", "2026-12-02")}`);
    expect((res.json.data as { room: string }[]).map((d) => d.room)).toEqual(["A102"]);
  });

  it("沒有姓名時以行編後 4 碼代替", async () => {
    await env.DB.exec("UPDATE users SET name = NULL");
    await api("POST", "/api/bookings/", payload());
    const res = await api("GET", `/api/bookings/?from=${T("00:00")}&to=${T("00:00", "2026-12-02")}`);
    expect((res.json.data as { user: { name: string } }[])[0].user.name).toBe("1234");
  });

  it("from／to 錯誤時回 400", async () => {
    expect((await api("GET", "/api/bookings/?from=bad")).json).toEqual({ error: "from / to 必須是有效的日期" });
    const tooLong = await api("GET", `/api/bookings/?from=${T("00:00", "2025-01-01")}&to=${T("00:00", "2026-12-01")}`);
    expect(tooLong.status).toBe(400);
    expect(tooLong.json.error).toBe("查詢範圍不可超過 400 天");
  });

  it("查詢只掃描結束時間在區間之後的資料（D1 依掃描列數計費）", async () => {
    const stmts = Array.from({ length: 500 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO bookings (id, title, room, cancelled, start_time, end_time) VALUES (?, 'old', 'A101', 0, ?, ?)",
      ).bind(`old-${i}`, Date.parse("2025-01-01") + i * 3600_000, Date.parse("2025-01-01") + i * 3600_000 + 1800_000)
    );
    await env.DB.batch(stmts);
    const r = await env.DB.prepare("SELECT * FROM bookings WHERE cancelled = 0 AND end_time > ? AND start_time < ?")
      .bind(Date.parse("2026-11-01"), Date.parse("2026-12-31"))
      .all();
    expect(r.results.length).toBe(0);
    expect(r.meta.rows_read).toBeLessThan(10);
  });
});

describe("POST /api/bookings", () => {
  it("成功時回 201，網址結尾有沒有 / 都可以", async () => {
    const a = await api("POST", "/api/bookings/", payload());
    expect(a.status).toBe(201);
    expect(a.json).toEqual({ success: true, bookedRooms: ["A101"], message: "全部會議室預約成功 ✅" });
    const b = await api("POST", "/api/bookings", payload({ room: "A102" }));
    expect(b.status).toBe(201);
  });

  it("寫入的資料：台北日期、預約者、單間沒有 groupId", async () => {
    await api("POST", "/api/bookings/", payload({ startTime: T("16:30"), endTime: T("17:00"), participantsNum: -3 }));
    const [r] = await env.DB.prepare("SELECT * FROM bookings").all().then((x) => x.results as Record<string, unknown>[]);
    expect(r).toMatchObject({
      date: "2026-12-02",
      user_id: "001234",
      user_name: "測試員",
      user_department_label: "資訊部",
      participants_num: 0,
      cancelled: 0,
      updated_count: 0,
      group_id: null,
      is_multi: "[]",
      edit_password: "pw12",
    });
  });

  it("多間會議室：共用 groupId，isMulti 為其他會議室", async () => {
    await api("POST", "/api/bookings/", payload({ room: ["A101", "A102", "A103"] }));
    const list = await rows();
    expect(new Set(list.map((r) => r.group_id)).size).toBe(1);
    expect(list[0].group_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(list.map((r) => JSON.parse(r.is_multi))).toEqual([["A102", "A103"], ["A101", "A103"], ["A101", "A102"]]);
  });

  it("時段衝突時回傳衝突清單", async () => {
    await api("POST", "/api/bookings/", payload({ title: "先" }));
    const res = await api("POST", "/api/bookings/", payload({ room: ["A101", "A102"] }));
    expect(res.status).toBe(400);
    expect(res.json).toEqual({
      error: "有會議室時間衝突 ❌，整筆預約取消",
      conflicts: [{
        room: "A101",
        conflicts: [{
          id: expect.any(String),
          room: "A101",
          title: "先",
          startTime: "2026-12-01T02:00:00.000Z",
          endTime: "2026-12-01T03:00:00.000Z",
        }],
      }],
    });
  });

  it("預約者可用行編（補零／不補零／含檢查碼）或分機查找", async () => {
    for (const user of ["1234", "001234", "12345", "#52001", "王小明 1234"]) {
      await resetDb();
      await seedUser();
      expect((await api("POST", "/api/bookings/", payload({ user }))).status, user).toBe(201);
    }
  });

  it("找不到或停用的使用者回 404", async () => {
    expect((await api("POST", "/api/bookings/", payload({ user: "9999" }))).json).toEqual({
      error: "找不到使用者 ID：9999",
    });
    await env.DB.exec("UPDATE users SET status = 0");
    expect((await api("POST", "/api/bookings/", payload())).status).toBe(404);
    // 早期後台的停用標記 disabled 也算停用
    await env.DB.exec("UPDATE users SET status = NULL, disabled = 1");
    expect((await api("POST", "/api/bookings/", payload())).status).toBe(404);
    await env.DB.exec("UPDATE users SET status = 1, disabled = 0");
    expect((await api("POST", "/api/bookings/", payload())).status).toBe(201);
  });

  it("用分機查找時，停用的使用者不算；行編優先於分機", async () => {
    await seedUser({ id: "005555", name: "另一人", extension: "1234", status: 0 });
    const res = await api("POST", "/api/bookings/", payload({ user: "1234" }));
    expect(res.status).toBe(201);
    const [r] = await rows();
    expect(r).toBeDefined();
    const u = await env.DB.prepare("SELECT user_id FROM bookings").first<{ user_id: string }>();
    expect(u?.user_id).toBe("001234");
  });

  it("週六、週日不可預約（台北時間）", async () => {
    // 2026-12-05 是週六
    const res = await api("POST", "/api/bookings/", payload({ startTime: T("02:00", "2026-12-05"), endTime: T("03:00", "2026-12-05") }));
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: WEEKEND_MESSAGE });
  });

  it("欄位錯誤", async () => {
    expect((await api("POST", "/api/bookings/", payload({ room: [] }))).json).toEqual({ error: "缺少必要字段" });
    expect((await api("POST", "/api/bookings/", "{bad")).json).toEqual({ error: "無法解析請求體" });
    expect((await api("POST", "/api/bookings/", payload({ endTime: T("01:00") }))).json).toEqual({
      error: "結束時間必須晚於開始時間",
    });
  });
});

describe("PATCH /api/bookings/:id/:editPassword", () => {
  async function created(over: Record<string, unknown> = {}) {
    await api("POST", "/api/bookings/", payload(over));
    return (await rows())[0];
  }

  it("編輯密碼：錯誤 403、正確 200、萬用密碼（MASTER_PASSWORD 設定）200", async () => {
    const r = await created();
    expect((await api("PATCH", `/api/bookings/${r.id}/wrong`, { title: "x" })).json).toEqual({
      error: "編輯密碼錯誤，無法更新資料",
    });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, { title: "x" })).status).toBe(403);
    expect((await api("PATCH", `/api/bookings/${r.id}/pw12`, { title: "x" })).status).toBe(200);
    const m = await api("PATCH", `/api/bookings/${r.id}/test-master-password`, { title: "y" });
    expect(m.status).toBe(200);
    expect(m.json).toEqual({ success: true, message: "更新成功", updatedIds: [r.id] });
  });

  it("編輯密碼含特殊字元時會正確解碼", async () => {
    const r = await created({ editPassword: "a/b c%" });
    expect((await api("PATCH", `/api/bookings/${r.id}/${encodeURIComponent("a/b c%")}`, { title: "x" })).status).toBe(200);
  });

  it("沒有設定編輯密碼的預約不需要密碼", async () => {
    const r = await created({ editPassword: "" });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, { title: "x" })).status).toBe(200);
  });

  it("找不到、內容空白、無法解析", async () => {
    expect((await api("PATCH", "/api/bookings/nope/", { title: "x" })).json).toEqual({ error: "找不到該筆資料" });
    const r = await created({ editPassword: "" });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, { id: "x", user: "y" })).json).toEqual({
      error: "更新資料不能為空",
    });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, "{bad")).json).toEqual({ error: "無法解析請求體" });
  });

  it("取消：回 200，再取消一次 404", async () => {
    const r = await created({ editPassword: "" });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, { cancelled: true })).json).toEqual({
      success: true,
      message: "取消成功",
    });
    expect((await api("PATCH", `/api/bookings/${r.id}/`, { cancelled: true })).status).toBe(404);
    expect((await rows())[0]).toMatchObject({ cancelled: 1, updated_count: 1 });
  });

  it("修改同組時，名稱與時間套用到全部，room 只改這一筆；不能換到同組已有的會議室", async () => {
    await api("POST", "/api/bookings/", payload({ room: ["A101", "A102"], editPassword: "" }));
    const [a] = await rows("room = 'A101'");
    expect((await api("PATCH", `/api/bookings/${a.id}/`, { room: "A102" })).json).toEqual({
      error: "同一組預約已包含該會議室，請選擇其他會議室",
    });
    const res = await api("PATCH", `/api/bookings/${a.id}/`, {
      title: "改名",
      room: "A103",
      startTime: T("05:00"),
      endTime: T("06:00"),
      user: "hacker",
    });
    expect(res.status).toBe(200);
    const list = await rows();
    expect(list.map((r) => [r.room, r.title, r.start_time, JSON.parse(r.is_multi)])).toEqual([
      ["A103", "改名", Date.parse(T("05:00")), ["A102"]],
      ["A102", "改名", Date.parse(T("05:00")), ["A103"]],
    ]);
  });

  it("修改後衝突時回傳衝突清單（扁平陣列）", async () => {
    await created({ title: "a", editPassword: "" });
    await api("POST", "/api/bookings/", payload({ title: "b", startTime: T("05:00"), endTime: T("06:00"), editPassword: "" }));
    const [b] = await rows("title = 'b'");
    const res = await api("PATCH", `/api/bookings/${b.id}/`, { startTime: T("02:30"), endTime: T("03:30") });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("更新後時段存在衝突 ❌，請選擇其他時間");
    expect((res.json.conflicts as { title: string }[]).map((c) => c.title)).toEqual(["a"]);
  });

  it("週末的舊預約：時間不變可以改名稱，改時間時才檢查週末", async () => {
    const sat = (hm: string) => Date.parse(T(hm, "2026-12-05"));
    await insertRow({ id: "wk", room: "A101", start_time: sat("02:00"), end_time: sat("03:00") });
    const same = await api("PATCH", "/api/bookings/wk/", {
      title: "改名",
      startTime: T("02:00", "2026-12-05"),
      endTime: T("03:00", "2026-12-05"),
    });
    expect(same.status).toBe(200);
    const moved = await api("PATCH", "/api/bookings/wk/", { startTime: T("04:00", "2026-12-05"), endTime: T("05:00", "2026-12-05") });
    expect(moved.json).toEqual({ error: WEEKEND_MESSAGE });
    const weekday = await api("PATCH", "/api/bookings/wk/", { startTime: T("04:00"), endTime: T("05:00") });
    expect(weekday.status).toBe(200);
  });

  it("沒有 groupId 的舊多會議室預約：以 createdTime 找到同組，修改後補上 groupId，取消後更新 isMulti", async () => {
    const created = Date.parse("2025-06-01T00:00:00Z");
    const base = { start_time: Date.parse(T("02:00")), end_time: Date.parse(T("03:00")), created_time: created };
    await insertRow({ id: "l1", room: "A101", is_multi: '["A102"]', ...base });
    await insertRow({ id: "l2", room: "A102", is_multi: '["A101"]', ...base });
    // 另一位使用者同時間建立的預約不屬於同組
    await insertRow({ id: "other", room: "A103", is_multi: '["A101"]', ...base });
    await env.DB.exec("UPDATE bookings SET user_id = '009999' WHERE id = 'other'");

    const res = await api("PATCH", "/api/bookings/l1/", { startTime: T("04:00"), endTime: T("05:00") });
    expect(res.json).toEqual({ success: true, message: "更新成功", updatedIds: ["l1", "l2"] });
    const list = await rows("id IN ('l1', 'l2')");
    expect(list[0].group_id).toBe(list[1].group_id);
    expect(list[0].group_id).not.toBeNull();

    expect((await api("PATCH", "/api/bookings/l2/", { cancelled: true })).status).toBe(200);
    const [l1] = await rows("id = 'l1'");
    expect(JSON.parse(l1.is_multi)).toEqual([]);
  });
});

describe("其他", () => {
  it("未知路徑回 404", async () => {
    expect((await api("GET", "/nope")).status).toBe(404);
  });
});
