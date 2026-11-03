// MCP 伺服器：協定（初始化、通知、批次、錯誤）、查詢工具與新增預約的檢查
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, insertRow, resetDb, rows, seedUser } from "./helpers.ts";
import { freeIntervals, PROTOCOL_VERSIONS, resolveRoom } from "../src/mcp.ts";

const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);

// 至少 7 天後的某個星期幾（台北時間）
function futureDay(wd: number): string {
  let t = Date.now() + 7 * DAY;
  while (weekday(taipeiDate(t)) !== wd) t += DAY;
  return taipeiDate(t);
}
const WED = futureDay(3);
const SAT = futureDay(6);
// 過去的平日
function pastWeekday(): string {
  let t = Date.now() - 7 * DAY;
  while ([0, 6].includes(weekday(taipeiDate(t)))) t -= DAY;
  return taipeiDate(t);
}

let nextId = 1;
async function rpc(method: string, params?: unknown) {
  const res = await api("POST", "/mcp", { jsonrpc: "2.0", id: nextId++, method, params });
  expect(res.status).toBe(200);
  return res.json as { result?: Record<string, unknown>; error?: { code: number; message: string } };
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const { result, error } = await rpc("tools/call", { name, arguments: args });
  expect(error).toBeUndefined();
  const r = result as { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError === true };
}

async function expectToolError(name: string, args: Record<string, unknown>, contains: string) {
  const r = await call(name, args);
  expect(r.isError, r.text).toBe(true);
  expect(r.text).toContain(contains);
}

const BOOK = { employee_id: "001234", rooms: ["Beta"], date: WED, start_time: "14:00", end_time: "15:00", title: "MCP 測試" };

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("協定", () => {
  it("initialize：沿用用戶端要求的版本，不支援時回傳最新版本；提供 tools 能力與使用說明", async () => {
    const a = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(a.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "meetbook" },
    });
    expect(a.result!.instructions).toContain("週一到週五");
    const b = await rpc("initialize", { protocolVersion: "1999-01-01" });
    expect(b.result!.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("通知回 202 沒有內容；ping 回空物件", async () => {
    const res = await api("POST", "/mcp", { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(res.text).toBe("");
    expect((await rpc("ping")).result).toEqual({});
  });

  it("GET、DELETE 回 405；JSON 格式錯誤回 -32700；不認得的方法 -32601；不認得的工具 -32602", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await api(method, "/mcp");
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
    const bad = await api("POST", "/mcp", "{not json");
    expect(bad.status).toBe(400);
    expect((bad.json as { error: { code: number } }).error.code).toBe(-32700);
    expect((await rpc("resources/list")).error!.code).toBe(-32601);
    expect((await rpc("tools/call", { name: "delete_everything", arguments: {} })).error!.code).toBe(-32602);
  });

  it("批次：只回覆有 id 的訊息；全是通知時回 202", async () => {
    const res = await api("POST", "/mcp", [
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: "b", method: "tools/list" },
    ]);
    const list = res.json as unknown as { id: string }[];
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
    const notes = await api("POST", "/mcp", [{ jsonrpc: "2.0", method: "notifications/initialized" }]);
    expect(notes.status).toBe(202);
  });

  it("tools/list：第一階段只有查詢與新增，沒有修改或取消", async () => {
    const tools = (await rpc("tools/list")).result!.tools as { name: string; annotations: { readOnlyHint: boolean }; inputSchema: { required?: string[] } }[];
    expect(tools.map((t) => t.name)).toEqual(["list_rooms", "list_bookings", "find_free_slots", "create_booking"]);
    expect(tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name)).toEqual(["list_rooms", "list_bookings", "find_free_slots"]);
    expect(tools[3].inputSchema.required).toEqual(["employee_id", "rooms", "date", "start_time", "end_time"]);
  });
});

describe("查詢", () => {
  it("list_rooms：三間會議室與座位數", async () => {
    const { data } = await call("list_rooms");
    expect((data!.rooms as { name: string; code: string; seats: number }[]).map((r) => [r.name, r.code, r.seats])).toEqual([
      ["Alpha", "A101", 10],
      ["Beta", "A102", 15],
      ["StartUp", "A103", 20],
    ]);
  });

  it("list_bookings：與網站公開資料相同，不含編輯密碼與行編；可篩選會議室與天數", async () => {
    await insertRow({ id: "x1", room: "A101", start_time: at(WED, "10:00"), end_time: at(WED, "11:00"), title: "晨會", edit_password: "secret99" });
    await insertRow({ id: "x2", room: "A103", start_time: at(WED, "13:00"), end_time: at(WED, "14:30"), title: "" });
    await insertRow({ id: "x3", room: "A101", start_time: at(WED, "15:00"), end_time: at(WED, "16:00"), cancelled: 1 });
    const next = taipeiDate(Date.parse(`${WED}T00:00:00Z`) + DAY);
    await insertRow({ id: "x4", room: "A102", start_time: at(next, "09:00"), end_time: at(next, "10:00"), title: "隔天" });

    const { data, text } = await call("list_bookings", { date: WED });
    expect(data!.count).toBe(2);
    expect(data!.bookings).toEqual([
      { date: expect.stringContaining(WED), time: "10:00–11:00", room: "Alpha", title: "晨會", booked_by: "測試員", participants: 2 },
      { date: expect.stringContaining(WED), time: "13:00–14:30", room: "StartUp", title: "（未命名）", booked_by: "測試員", participants: 2 },
    ]);
    expect(text).not.toContain("secret99");
    expect(text).not.toContain("001234");
    expect((await call("list_bookings", { date: WED, days: 2 })).data!.count).toBe(3);
    expect((await call("list_bookings", { date: WED, days: 2, room: "b" })).data!.count).toBe(1);
    await expectToolError("list_bookings", { date: WED, days: 15 }, "days 必須是 1–14 的整數");
  });

  it("find_free_slots：列出可預約時段內的空檔，可指定最短長度；週末不開放", async () => {
    await insertRow({ id: "y1", room: "A101", start_time: at(WED, "10:00"), end_time: at(WED, "11:00") });
    await insertRow({ id: "y2", room: "A101", start_time: at(WED, "11:00"), end_time: at(WED, "12:30") });
    await insertRow({ id: "y3", room: "A101", start_time: at(WED, "17:30"), end_time: at(WED, "18:15") });
    const { data } = await call("find_free_slots", { date: WED, room: "Alpha" });
    expect(data!.rooms).toEqual([{ room: "Alpha", seats: 10, free: ["08:45–10:00", "12:30–17:30"] }]);
    const long = await call("find_free_slots", { date: WED, duration_minutes: 120 });
    expect((long.data!.rooms as { room: string; free: string[] }[]).map((r) => [r.room, r.free])).toEqual([
      ["Alpha", ["12:30–17:30"]],
      ["Beta", ["08:45–18:15"]],
      ["StartUp", ["08:45–18:15"]],
    ]);
    expect((await call("find_free_slots", { date: SAT })).data).toMatchObject({ note: "週六、週日不開放預約，請選擇週一到週五", rooms: [] });
  });

  it("freeIntervals：今天只列出現在以後的時間（進位到 5 分鐘）", () => {
    const d = "2026-11-04";
    const busy = [{ start_time: at(d, "13:00"), end_time: at(d, "14:00") }];
    const fmt = (list: [number, number][]) => list.map(([s, e]) => `${taipeiDate(s)} ${new Date(s + 8 * 3600_000).toISOString().slice(11, 16)}-${new Date(e + 8 * 3600_000).toISOString().slice(11, 16)}`);
    expect(fmt(freeIntervals(at(d, "08:45"), at(d, "18:15"), busy, at(d, "11:02")))).toEqual([`${d} 11:05-13:00`, `${d} 14:00-18:15`]);
    expect(freeIntervals(at(d, "08:45"), at(d, "18:15"), busy, at(d, "13:30")).length).toBe(1);
    expect(freeIntervals(at(d, "08:45"), at(d, "18:15"), [], at(d, "19:00"))).toEqual([]);
  });
});

describe("新增預約", () => {
  it("成功：寫入資料庫；編輯密碼不自動產生、不回傳；會議室可用名稱、代碼或字母", async () => {
    const { data, isError } = await call("create_booking", { ...BOOK, participants: 6 });
    expect(isError).toBe(false);
    expect(data).toMatchObject({ success: true, rooms: ["Beta"], time: "14:00–15:00", title: "MCP 測試", booked_by: "測試員", participants: 6 });
    // 沒有提供編輯密碼：不設密碼，並提醒
    expect(data!.edit_password_set).toBe(false);
    expect(data!.note).toContain("沒有設定編輯密碼：任何人都能在網站上修改或取消這筆預約，請提醒使用者");
    const [row] = await rows();
    expect(row).toMatchObject({ room: "A102", title: "MCP 測試", start_time: at(WED, "14:00"), end_time: at(WED, "15:00"), cancelled: 0 });
    expect(row.edit_password).toBe("");

    const multi = await call("create_booking", { ...BOOK, rooms: ["a", "A103"], start_time: "9:00", end_time: "10:30", edit_password: "pass1234" });
    expect(multi.data).toMatchObject({ rooms: ["Alpha", "StartUp"], time: "09:00–10:30", edit_password_set: true });
    expect(multi.text).not.toContain("pass1234");
    const group = await rows("start_time = ?", at(WED, "09:00"));
    expect(group.map((r) => r.edit_password)).toEqual(["pass1234", "pass1234"]);
    expect(group.map((r) => r.room)).toEqual(["A101", "A103"]);
    expect(group[0].group_id).toBeTruthy();
    expect(group[0].group_id).toBe(group[1].group_id);
  });

  it("時段衝突時整筆不預約，並說明衝突的預約", async () => {
    await insertRow({ id: "c1", room: "A101", start_time: at(WED, "14:30"), end_time: at(WED, "15:30"), title: "既有會議" });
    await expectToolError("create_booking", { ...BOOK, rooms: ["Beta", "Alpha"] }, "Alpha 14:30–15:30 已有「既有會議」");
    expect((await rows()).length).toBe(1);
  });

  it("人數超過座位數時仍可預約，但提醒", async () => {
    const { data } = await call("create_booking", { ...BOOK, rooms: ["Alpha"], participants: 12 });
    expect(data!.note).toContain("與會人數 12 人超過座位數 10 人");
  });

  it("輸入檢查：回傳原因，不寫入資料", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...BOOK, employee_id: "" }, "請提供預約人的行編"],
      [{ ...BOOK, employee_id: "999999" }, "找不到行編或分機「999999」的使用者"],
      [{ ...BOOK, rooms: [] }, "請提供要預約的會議室"],
      [{ ...BOOK, rooms: ["Gamma"] }, "不認得的會議室：Gamma"],
      [{ ...BOOK, date: undefined }, "請提供日期"],
      [{ ...BOOK, date: "2027-02-30" }, "日期格式不正確"],
      [{ ...BOOK, date: SAT }, "週六、週日不開放預約"],
      [{ ...BOOK, start_time: "2pm" }, "開始時間格式不正確"],
      [{ ...BOOK, end_time: "13:00" }, "結束時間必須晚於開始時間"],
      [{ ...BOOK, start_time: "14:03" }, "時間請以 5 分鐘為單位"],
      [{ ...BOOK, start_time: "08:30" }, "可預約時段為 08:45–18:15"],
      [{ ...BOOK, end_time: "18:30" }, "可預約時段為 08:45–18:15"],
      [{ ...BOOK, date: pastWeekday() }, "開始時間已經過了"],
      [{ ...BOOK, date: taipeiDate(Date.now() + 400 * DAY) }, ""],
      [{ ...BOOK, edit_password: "ab" }, "編輯密碼請用 4–20 個英文字母或數字"],
      [{ ...BOOK, participants: -1 }, "participants 必須是 0–100 的整數"],
    ];
    for (const [args, message] of cases) {
      const r = await call("create_booking", args);
      expect(r.isError, `${JSON.stringify(args)} → ${r.text}`).toBe(true);
      expect(r.text).toContain(message);
    }
    expect((await rows()).length).toBe(0);
  });

  it("停用的使用者不能預約（與網站相同）", async () => {
    await env.DB.prepare("UPDATE users SET status = 0").run();
    await expectToolError("create_booking", BOOK, "找不到行編或分機");
  });

  it("resolveRoom：大小寫不拘", () => {
    expect(["alpha", "A101", "a", "BETA", "b", "startup", "S"].map(resolveRoom)).toEqual(["A101", "A101", "A101", "A102", "A102", "A103", "A103"]);
    expect(() => resolveRoom("A104")).toThrow("不認得的會議室");
  });
});
