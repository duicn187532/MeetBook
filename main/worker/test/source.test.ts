// 預約來源：網站、AI 預約連結（/b）、AI 連接器（MCP）新增的預約各自記錄來源，管理後台的預約紀錄會顯示
// （LINE 的來源在 line.test.ts 檢查）
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { api, insertRow, resetDb, seedUser } from "./helpers.ts";

const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
let t = Date.now() + 7 * DAY;
while (new Date(`${taipeiDate(t)}T00:00:00Z`).getUTCDay() !== 3) t += DAY;
const WED = taipeiDate(t);
const at = (hhmm: string) => `${WED}T${hhmm}:00+08:00`;

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

async function sources(): Promise<Record<string, string | null>> {
  const { results } = await env.DB.prepare("SELECT room, source FROM bookings ORDER BY rowid").all<{ room: string; source: string | null }>();
  return Object.fromEntries(results.map((r) => [r.room, r.source]));
}

describe("預約來源", () => {
  it("網站、預約連結、MCP 各自記錄；修改預約不會改變來源；管理後台顯示來源", async () => {
    // 網站（POST /api/bookings）
    const web = await api("POST", "/api/bookings", {
      title: "網站", user: "001234", room: ["A101"], startTime: new Date(at("09:00")).toISOString(),
      endTime: new Date(at("10:00")).toISOString(), editPassword: "pw",
    });
    expect(web.status).toBe(201);
    // AI 預約連結的確認頁（POST /b）
    const link = await app.fetch(new Request("https://w.test/b", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ room: "A102", date: WED, start: "09:00", end: "10:00", user: "001234", title: "連結" }).toString(),
      redirect: "manual",
    }), env);
    expect(link.status).toBe(303);
    // AI 連接器（MCP）
    const mcp = await api("POST", "/mcp", {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "create_booking", arguments: { employee_id: "001234", rooms: ["StartUp"], date: WED, start_time: "09:00", end_time: "10:00" } },
    });
    expect((mcp.json as { result: { isError?: boolean } }).result.isError).toBeUndefined();
    // 加上來源欄位之前的舊預約
    await insertRow({ id: "old", room: "Z9", start_time: Date.parse(at("09:00")), end_time: Date.parse(at("10:00")) });

    expect(await sources()).toEqual({ A101: "web", A102: "ai-link", A103: "mcp", Z9: null });

    // 修改預約（網站 PATCH）不會改變來源
    const id = (await env.DB.prepare("SELECT id FROM bookings WHERE room = 'A101'").first<{ id: string }>())!.id;
    const patch = await api("PATCH", `/api/bookings/${id}/pw`, { title: "改名" });
    expect(patch.status).toBe(200);
    expect((await sources()).A101).toBe("web");

    // 管理後台的預約紀錄
    const login = await api("POST", "/admin/api/login", { password: "test-admin-password" }, { "CF-Connecting-IP": "7.7.7.7" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const records = await api("GET", `/admin/api/bookings?from=${WED}&to=${WED}&by=meeting`, undefined, { Cookie: cookie });
    const byRoom = Object.fromEntries((records.json.data as { room: string; source: string }[]).map((r) => [r.room, r.source]));
    expect(byRoom).toEqual({ A101: "web", A102: "ai-link", A103: "mcp", Z9: "" });
  });
});
