// 管理後台：啟用條件、登入、cookie、頻率限制、X-Admin、CSP nonce，以及使用者／預約紀錄／統計 API
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { api, insertRow, resetDb, rows, seedUser } from "./helpers.ts";

const PASSWORD = "test-admin-password";

async function login(ip = "9.9.9.9"): Promise<string> {
  const res = await api("POST", "/admin/api/login", { password: PASSWORD }, { "CF-Connecting-IP": ip });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

const authed = (cookie: string, write = false) => ({ Cookie: cookie, ...(write ? { "X-Admin": "1" } : {}) });

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("啟用條件", () => {
  it("ADMIN_PASSWORD 少於 8 個字元或未設定時，/admin 一律 404", async () => {
    for (const ADMIN_PASSWORD of ["short", "", undefined]) {
      const e = { ...env, ADMIN_PASSWORD } as typeof env;
      for (const path of ["/admin", "/admin/", "/admin/api/session", "/admin/api/login"]) {
        const res = await app.fetch(new Request(`https://w.test${path}`, { method: path.endsWith("login") ? "POST" : "GET" }), e);
        expect(res.status, `${ADMIN_PASSWORD} ${path}`).toBe(404);
        expect(await res.text()).toBe("Not Found");
      }
    }
  });
});

describe("頁面", () => {
  it("每次產生新的 CSP nonce，並加上安全標頭", async () => {
    const a = await api("GET", "/admin");
    const b = await api("GET", "/admin/");
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toContain("text/html");
    const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(a.headers.get("content-security-policy")!)![1];
    expect(a.text).toContain(`<script nonce="${nonce}">`);
    expect(a.text).not.toContain("__NONCE__");
    expect(b.headers.get("content-security-policy")).not.toContain(nonce);
    expect(a.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect(a.headers.get("x-frame-options")).toBe("DENY");
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
    expect(a.headers.get("referrer-policy")).toBe("no-referrer");
    expect(a.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("登入", () => {
  it("密碼正確時發 HttpOnly、SameSite=Strict 的簽章 cookie；登出清除", async () => {
    expect((await api("GET", "/admin/api/session")).json).toEqual({ loggedIn: false });
    const res = await api("POST", "/admin/api/login", { password: PASSWORD });
    expect(res.json).toEqual({ ok: true });
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^mb_admin=\d+\.[A-Za-z0-9_-]{43}; Path=\/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);
    const cookie = setCookie.split(";")[0];
    expect((await api("GET", "/admin/api/session", undefined, { Cookie: cookie })).json).toEqual({ loggedIn: true });
    const out = await api("POST", "/admin/api/logout");
    expect(out.headers.get("set-cookie")).toContain("mb_admin=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  });

  it("竄改的 cookie 無效", async () => {
    const cookie = await login();
    const bad = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    expect((await api("GET", "/admin/api/session", undefined, { Cookie: bad })).json).toEqual({ loggedIn: false });
  });

  it("密碼錯誤 401；同來源 5 次失敗後回 429 與 Retry-After（記錄存在 D1，不同 isolate 也共用）", async () => {
    const ip = { "CF-Connecting-IP": "1.2.3.4" };
    for (let i = 0; i < 5; i++) {
      const res = await api("POST", "/admin/api/login", { password: "wrong" }, ip);
      expect(res.status).toBe(401);
      expect(res.json).toEqual({ error: "密碼錯誤" });
    }
    const blocked = await api("POST", "/admin/api/login", { password: PASSWORD }, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.json).toEqual({ error: "嘗試太多次，請 15 分鐘後再試" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(890);
    // 其他來源不受影響
    expect((await api("POST", "/admin/api/login", { password: PASSWORD }, { "CF-Connecting-IP": "5.6.7.8" })).status)
      .toBe(200);
    const stored = await env.DB.prepare("SELECT fails FROM admin_login_attempts WHERE source = '1.2.3.4'").first();
    expect(stored).toEqual({ fails: 5 });
  });

  it("無法解析的登入請求回 400", async () => {
    expect((await api("POST", "/admin/api/login", "{bad")).json).toEqual({ error: "無法解析請求" });
  });

  it("API 需要登入；寫入需要 X-Admin 標頭", async () => {
    const no = await api("GET", "/admin/api/users");
    expect(no.status).toBe(401);
    expect(no.json).toEqual({ error: "請先登入" });
    expect(no.headers.get("cache-control")).toBe("no-store");
    const cookie = await login();
    const noHeader = await api("POST", "/admin/api/users", { id: "7777" }, { Cookie: cookie });
    expect(noHeader.status).toBe(403);
    expect(noHeader.json).toEqual({ error: "請求來源不正確" });
  });
});

describe("使用者", () => {
  it("列出使用者（依行編排序）與部門對照表", async () => {
    await seedUser({ id: "000099", name: null, extension: "", department_code: "strategy", department_label: "數位策略", group_code: "", group_label: "", status: 0 });
    const cookie = await login();
    const res = await api("GET", "/admin/api/users", undefined, authed(cookie));
    const data = res.json.data as Record<string, unknown>[];
    expect(data.map((u) => u.id)).toEqual(["000099", "001234"]);
    expect(data[0]).toEqual({
      id: "000099",
      name: "",
      extension: "",
      department: { code: "strategy", label: "數位策略部" },
      group: { code: "", label: "" },
      disabled: true,
    });
    expect((res.json.org as unknown[]).length).toBe(3);
  });

  it("新增：行編補零、重複時 409、分機重複時提醒；欄位錯誤 400", async () => {
    const cookie = await login();
    const res = await api(
      "POST",
      "/admin/api/users",
      { id: "5977", name: " 新同事 ", extension: "51164", department: { code: "strategy" }, group: { code: "company" } },
      authed(cookie, true),
    );
    expect(res.status).toBe(201);
    expect(res.json.data).toEqual({
      id: "005977",
      name: "新同事",
      extension: "51164",
      department: { code: "strategy", label: "數位策略部" },
      group: { code: "company", label: "法人產品" },
      disabled: false,
    });
    expect(res.json.warning).toBe("分機 51164 也登記給 測試員（1234）；用分機預約時只會對應到其中一人，建議改用行編預約");
    const row = await env.DB.prepare("SELECT * FROM users WHERE id = '005977'").first();
    expect(row).toMatchObject({ status: 1, disabled: 0, role_code: "user", role_label: "使用者", email: null });

    const dup = await api("POST", "/admin/api/users", { id: "005977" }, authed(cookie, true));
    expect(dup.status).toBe(409);
    expect(dup.json).toEqual({ error: "行編 005977 已存在" });
    const bad = await api("POST", "/admin/api/users", { id: "abc" }, authed(cookie, true));
    expect(bad.json).toEqual({ error: "行編只能是 1–6 位數字" });
  });

  it("修改：停用後不能預約，重新啟用後可以；早期的 disabled 標記會被清除", async () => {
    await env.DB.exec("UPDATE users SET disabled = 1");
    const cookie = await login();
    const enable = await api("PATCH", "/admin/api/users/001234", { disabled: false }, authed(cookie, true));
    expect(enable.status).toBe(200);
    expect(enable.json.data).toMatchObject({ id: "001234", disabled: false });
    expect(await env.DB.prepare("SELECT status, disabled FROM users").first()).toEqual({ status: 1, disabled: 0 });

    const disable = await api("PATCH", "/admin/api/users/001234", { disabled: true, name: "" }, authed(cookie, true));
    expect(disable.json.data).toMatchObject({ name: "", disabled: true });
    expect(await env.DB.prepare("SELECT name, status FROM users").first()).toEqual({ name: null, status: 0 });
    const booking = await api("POST", "/api/bookings/", {
      user: "1234",
      room: "A101",
      startTime: "2026-12-01T02:00:00Z",
      endTime: "2026-12-01T03:00:00Z",
    });
    expect(booking.status).toBe(404);

    expect((await api("PATCH", "/admin/api/users/000000", { name: "x" }, authed(cookie, true))).json).toEqual({
      error: "找不到這位使用者",
    });
    expect((await api("PATCH", "/admin/api/users/001234", {}, authed(cookie, true))).json).toEqual({
      error: "沒有要更新的欄位",
    });
  });
});

describe("預約紀錄與統計", () => {
  beforeEach(async () => {
    const day = (d: string, hm: string) => Date.parse(`${d}T${hm}:00+08:00`);
    await insertRow({ id: "a", room: "A101", start_time: day("2026-12-01", "10:00"), end_time: day("2026-12-01", "11:00"), created_time: day("2026-11-20", "09:00"), edit_password: "secret" });
    await insertRow({ id: "b", room: "A102", start_time: day("2026-12-02", "14:00"), end_time: day("2026-12-02", "16:00"), created_time: day("2026-11-25", "09:00"), cancelled: 1 });
    await insertRow({ id: "c", room: "A103", start_time: day("2026-12-20", "10:00"), end_time: day("2026-12-20", "10:30"), created_time: day("2026-12-01", "09:00") });
  });

  it("依送出時間（預設）或會議時間查詢，含已取消，不含編輯密碼", async () => {
    const cookie = await login();
    const byCreated = await api("GET", "/admin/api/bookings?from=2026-11-20&to=2026-11-30", undefined, authed(cookie));
    expect((byCreated.json.data as { id: string }[]).map((d) => d.id)).toEqual(["b", "a"]);
    expect(byCreated.json.truncated).toBe(false);
    expect(byCreated.text).not.toContain("secret");
    const byMeeting = await api("GET", "/admin/api/bookings?from=2026-12-01&to=2026-12-02&by=meeting", undefined, authed(cookie));
    const data = byMeeting.json.data as Record<string, unknown>[];
    expect(data.map((d) => d.id)).toEqual(["a", "b"]);
    expect(data[0]).toEqual({
      id: "a",
      title: "legacy",
      room: "A101",
      roomName: "Alpha",
      userId: "001234",
      name: "測試員",
      extension: "",
      department: "",
      group: "",
      participants: 2,
      startTime: "2026-12-01T02:00:00.000Z",
      endTime: "2026-12-01T03:00:00.000Z",
      createdTime: "2026-11-20T01:00:00.000Z",
      updatedTime: null,
      updatedCount: 1,
      cancelled: false,
      multi: [],
      source: "",
    });
    expect(byMeeting.json.rooms).toEqual([
      { key: "A101", name: "Alpha" },
      { key: "A102", name: "Beta" },
      { key: "A103", name: "StartUp" },
    ]);
    expect((await api("GET", "/admin/api/bookings?from=x&to=y", undefined, authed(cookie))).status).toBe(400);
  });

  it("統計：與 Deno 版的 computeStats 計算方式相同", async () => {
    const cookie = await login();
    const res = await api("GET", "/admin/api/stats?from=2026-12-01&to=2026-12-31", undefined, authed(cookie));
    expect(res.status).toBe(200);
    expect(res.json.totals).toEqual({
      bookings: 2,
      hours: 1.5,
      cancelled: 1,
      cancelRate: 0.333,
      utilization: expect.any(Number),
      bookers: 1,
      avgMinutes: 45,
      avgParticipants: 2,
    });
    expect(res.json.workdays).toBe(23);
    expect((res.json.heatmap as number[][]).length).toBe(5);
    expect((await api("GET", "/admin/api/stats", undefined, authed(cookie))).json).toEqual({ error: "請指定統計區間" });
  });

  it("後台查詢不影響 rows 資料", async () => {
    expect((await rows()).length).toBe(3);
  });
});
