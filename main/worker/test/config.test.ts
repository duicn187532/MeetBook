// 對外網址與萬用密碼都由部署時的設定提供（程式中沒有寫死的網址或密碼）：設定的值會被使用，沒設定時的行為也安全
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { masterPasswordMatches } from "../src/bookings.ts";
import { api, insertRow, resetDb, seedUser } from "./helpers.ts";

const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
let t = Date.now() + 7 * DAY;
while (new Date(`${taipeiDate(t)}T00:00:00Z`).getUTCDay() !== 3) t += DAY;
const WED = taipeiDate(t);
const at = (hhmm: string) => Date.parse(`${WED}T${hhmm}:00+08:00`);

function call(path: string, init: RequestInit = {}, overrides: Record<string, string | undefined> = {}) {
  return app.fetch(new Request(`https://w.test${path}`, init), { ...env, ...overrides } as typeof env);
}

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("萬用編輯密碼（MASTER_PASSWORD）", () => {
  it("設定時可以修改任何預約；密碼錯誤仍被拒絕", async () => {
    await insertRow({ id: "m1", room: "A101", start_time: at("10:00"), end_time: at("11:00"), edit_password: "owner-pw" });
    expect((await api("PATCH", "/api/bookings/m1/wrong", { title: "x" })).status).toBe(403);
    expect((await api("PATCH", "/api/bookings/m1/test-master-password", { title: "改名" })).status).toBe(200);
  });

  it("沒設定、或少於 8 個字元時不啟用", async () => {
    await insertRow({ id: "m2", room: "A101", start_time: at("10:00"), end_time: at("11:00"), edit_password: "owner-pw" });
    const patch = (pw: string, MASTER_PASSWORD?: string) =>
      call(`/api/bookings/m2/${pw}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"title":"x"}' }, { MASTER_PASSWORD });
    expect((await patch("anything", undefined)).status).toBe(403);
    expect((await patch("short", "short")).status).toBe(403);
    expect(masterPasswordMatches({}, "")).toBe(false);
    expect(masterPasswordMatches({ MASTER_PASSWORD: "" }, "")).toBe(false);
  });
});

describe("對外網址", () => {
  it("CORS：只允許 FRONTEND_ORIGIN；沒設定時不允許任何跨站請求", async () => {
    const res = await call("/api/notices", { headers: { Origin: "https://frontend.test" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://frontend.test");
    const unset = await call("/api/notices", { headers: { Origin: "https://evil.test" } }, { FRONTEND_ORIGIN: undefined });
    expect(unset.headers.get("access-control-allow-origin") ?? "").toBe("");
  });

  it("確認頁與 /ai 的網站連結使用 WEBSITE_URL", async () => {
    const page = await (await call(`/b?room=Beta&date=${WED}&start=14:00&end=15:00`)).text();
    expect(page).toContain('href="https://frontend.test/app/"');
    const ai = await (await call("/ai")).text();
    expect(ai).toContain("請使用者到網站 https://frontend.test/app/ 點選該筆預約");
  });

  it("LINE 教學的網址：有 PUBLIC_BASE_URL 時使用它；沒設定時用這次請求的網址", async () => {
    // 直接以模組函式檢查（LINE webhook 的完整流程在 line.test.ts）
    const { aiPageUrl } = await import("../src/line_bot.ts");
    await call("/healthz");
    expect(aiPageUrl()).toBe("https://public.test/ai");
    await call("/healthz", {}, { PUBLIC_BASE_URL: undefined });
    expect(aiPageUrl()).toBe("https://w.test/ai");
  });
});
