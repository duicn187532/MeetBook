// 更新日誌與公告：公開 API 的公告期間、管理後台的新增／修改／刪除與輸入檢查
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers.ts";
import { parseDate, parseSections, sortChangelog, taipeiDate } from "../src/notices.ts";

const PASSWORD = "test-admin-password";

async function login(): Promise<string> {
  const res = await api("POST", "/admin/api/login", { password: PASSWORD }, { "CF-Connecting-IP": "8.8.4.4" });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
}
const write = (cookie: string) => ({ Cookie: cookie, "X-Admin": "1" });

const day = (offset: number) => taipeiDate(Date.now(), offset);
const SECTIONS = [{ title: "改善", items: [{ text: "第一項" }, { text: "第二項", experimental: true }] }];

async function insertChangelog(version: string, date: string, sections: unknown = SECTIONS) {
  await env.DB.prepare("INSERT INTO changelog (version, date, sections, created_time, updated_time) VALUES (?, ?, ?, 0, 0)")
    .bind(version, date, JSON.stringify(sections)).run();
}
async function insertAnnouncement(id: string, start: string, end: string) {
  await env.DB.prepare(
    "INSERT INTO announcements (id, title, body, start_date, end_date, created_time, updated_time) VALUES (?, ?, ?, ?, ?, 0, 0)",
  ).bind(id, `標題 ${id}`, `內容 ${id}`, start, end).run();
}

describe("migration 帶入原本前端的更新日誌", () => {
  it("v2.1.0～v2.3.0 都在，內容格式正確", async () => {
    const { results } = await env.DB.prepare("SELECT * FROM changelog").all<{ version: string; date: string; sections: string }>();
    const list = sortChangelog(results);
    expect(list.map((r) => [r.version, r.date])).toEqual([
      ["v2.3.0", "2026-11-02"],
      ["v2.2.0", "2026-10-30"],
      ["v2.1.0", "2026-10-30"],
    ]);
    for (const r of list) expect(parseSections(JSON.parse(r.sections))).toEqual(JSON.parse(r.sections));
    // 實驗性功能標籤也保留
    expect(list[2].sections).toContain('"experimental":true');
  });
});

describe("GET /api/notices", () => {
  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM changelog"), env.DB.prepare("DELETE FROM announcements")]);
  });

  it("更新日誌：改版日當天起 7 天內；新的在前（同一天依版號，v2.10.0 比 v2.9.0 新）", async () => {
    await insertChangelog("v1.0.0", day(-7)); // 第 8 天：已過期
    await insertChangelog("v2.9.0", day(-6)); // 第 7 天：還在期間內
    await insertChangelog("v2.10.0", day(-6));
    await insertChangelog("v3.0.0", day(0));
    await insertChangelog("v9.0.0", day(1)); // 還沒到改版日
    const res = await api("GET", "/api/notices");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://duicn187532.github.io");
    const list = res.json.changelog as { version: string; date: string; sections: unknown }[];
    expect(list.map((e) => e.version)).toEqual(["v3.0.0", "v2.10.0", "v2.9.0"]);
    expect(list[0]).toEqual({ version: "v3.0.0", date: day(0), sections: SECTIONS });
  });

  it("公告：開始日 ≤ 今天 ≤ 結束日（含當天）；開始日新的在前", async () => {
    await insertAnnouncement("past", day(-10), day(-1));
    await insertAnnouncement("ends-today", day(-3), day(0));
    await insertAnnouncement("starts-today", day(0), day(6));
    await insertAnnouncement("future", day(1), day(5));
    const res = await api("GET", "/api/notices");
    const list = res.json.announcements as Record<string, string>[];
    expect(list.map((a) => a.id)).toEqual(["starts-today", "ends-today"]);
    expect(list[0]).toEqual({ id: "starts-today", title: "標題 starts-today", body: "內容 starts-today", startDate: day(0), endDate: day(6) });
  });

  it("沒有資料時回空陣列", async () => {
    expect((await api("GET", "/api/notices")).json).toEqual({ changelog: [], announcements: [] });
  });
});

describe("管理後台：更新日誌", () => {
  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM changelog"), env.DB.prepare("DELETE FROM admin_login_attempts")]);
  });

  it("需要登入；修改類請求需要 X-Admin", async () => {
    expect((await api("GET", "/admin/api/changelog")).status).toBe(401);
    expect((await api("POST", "/admin/api/changelog", {})).status).toBe(401);
    const cookie = await login();
    const res = await api("POST", "/admin/api/changelog", { version: "v1", date: day(0), sections: SECTIONS }, { Cookie: cookie });
    expect(res.status).toBe(403);
    expect((await api("DELETE", "/admin/api/changelog/v1", undefined, { Cookie: cookie })).status).toBe(403);
  });

  it("新增、列出、修改、刪除", async () => {
    const cookie = await login();
    const created = await api("POST", "/admin/api/changelog", {
      version: " v2.4.0 ",
      date: day(0).replaceAll("-", "/"),
      sections: [{ title: " 新功能 ", items: [{ text: "  第一行\r\n第二行 ", experimental: true }, { text: "B", experimental: "yes" }] }],
    }, write(cookie));
    expect(created.status).toBe(201);
    const expected = {
      version: "v2.4.0",
      date: day(0),
      sections: [{ title: "新功能", items: [{ text: "第一行\n第二行", experimental: true }, { text: "B" }] }],
    };
    expect(created.json.data).toMatchObject(expected);
    expect(created.headers.get("cache-control")).toBe("no-store");

    const dup = await api("POST", "/admin/api/changelog", { ...expected }, write(cookie));
    expect(dup.status).toBe(409);
    expect(dup.json.error).toBe("版號 v2.4.0 已存在");

    await insertChangelog("v2.3.0", day(-1));
    const list = await api("GET", "/admin/api/changelog", undefined, { Cookie: cookie });
    expect((list.json.data as { version: string }[]).map((e) => e.version)).toEqual(["v2.4.0", "v2.3.0"]);
    expect(list.json.announceDays).toBe(7);

    const updated = await api("PUT", "/admin/api/changelog/v2.4.0", { date: day(-2), sections: SECTIONS }, write(cookie));
    expect(updated.status).toBe(200);
    expect(updated.json.data).toMatchObject({ version: "v2.4.0", date: day(-2), sections: SECTIONS });
    expect((await api("GET", "/api/notices")).json.changelog).toEqual([
      { version: "v2.3.0", date: day(-1), sections: SECTIONS },
      { version: "v2.4.0", date: day(-2), sections: SECTIONS },
    ]);

    expect((await api("PUT", "/admin/api/changelog/nope", { date: day(0), sections: SECTIONS }, write(cookie))).status).toBe(404);
    expect((await api("DELETE", "/admin/api/changelog/v2.4.0", undefined, write(cookie))).json).toEqual({ ok: true });
    expect((await api("DELETE", "/admin/api/changelog/v2.4.0", undefined, write(cookie))).status).toBe(404);
  });

  it("輸入檢查：回 400 與原因", async () => {
    const cookie = await login();
    const cases: [unknown, string][] = [
      [{ date: day(0), sections: SECTIONS }, "請填寫版號"],
      [{ version: "v 1", date: day(0), sections: SECTIONS }, "版號只能使用英數字、點、底線與連字號，例如 v2.4.0"],
      [{ version: "v1", date: "2026-02-30", sections: SECTIONS }, "改版日格式不正確"],
      [{ version: "v1", date: day(0), sections: [] }, "至少要有一個分類"],
      [{ version: "v1", date: day(0), sections: [{ title: "", items: [{ text: "a" }] }] }, "請填寫第 1 個分類的名稱"],
      [{ version: "v1", date: day(0), sections: [{ title: "改善", items: [] }] }, "「改善」至少要有一個項目"],
      [{ version: "v1", date: day(0), sections: [{ title: "改善", items: [{ text: " " }] }] }, "請填寫「改善」第 1 個項目"],
      [{ version: "v1", date: day(0), sections: [{ title: "改善", items: [{ text: "字".repeat(601) }] }] }, "「改善」第 1 個項目不能超過 600 個字"],
      ["not json", "無法解析請求"],
    ];
    for (const [body, error] of cases) {
      const res = await api("POST", "/admin/api/changelog", body, write(cookie));
      expect(res.status, error).toBe(400);
      expect(res.json.error).toBe(error);
    }
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM changelog").first<{ n: number }>())!.n).toBe(0);
  });
});

describe("管理後台：公告", () => {
  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM announcements"), env.DB.prepare("DELETE FROM admin_login_attempts")]);
  });

  it("需要登入與 X-Admin", async () => {
    expect((await api("GET", "/admin/api/announcements")).status).toBe(401);
    const cookie = await login();
    const body = { title: "a", body: "b", startDate: day(0), endDate: day(0) };
    expect((await api("POST", "/admin/api/announcements", body, { Cookie: cookie })).status).toBe(403);
  });

  it("新增、列出、修改、刪除；公開 API 只回公告期間內的", async () => {
    const cookie = await login();
    const created = await api("POST", "/admin/api/announcements", {
      title: " A102 維修\n通知 ",
      body: " 11/5 下午 A102 冷氣維修\r\n請改用其他會議室 ",
      startDate: day(0),
      endDate: day(2),
    }, write(cookie));
    expect(created.status).toBe(201);
    const a = created.json.data as Record<string, string>;
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({ title: "A102 維修 通知", body: "11/5 下午 A102 冷氣維修\n請改用其他會議室", startDate: day(0), endDate: day(2) });

    const list = await api("GET", "/admin/api/announcements", undefined, { Cookie: cookie });
    expect((list.json.data as { id: string }[]).map((x) => x.id)).toEqual([a.id]);
    expect(list.json).toMatchObject({ defaultDays: 7, today: day(0) });
    expect((await api("GET", "/api/notices")).json.announcements).toEqual([
      { id: a.id, title: a.title, body: a.body, startDate: day(0), endDate: day(2) },
    ]);

    // 改成明天才開始：公開 API 不再回傳
    const updated = await api("PUT", `/admin/api/announcements/${a.id}`, { ...a, startDate: day(1), endDate: day(3) }, write(cookie));
    expect(updated.status).toBe(200);
    expect(updated.json.data).toMatchObject({ id: a.id, startDate: day(1), endDate: day(3) });
    expect((await api("GET", "/api/notices")).json.announcements).toEqual([]);

    const missing = await api("PUT", "/admin/api/announcements/nope", { ...a }, write(cookie));
    expect(missing.status).toBe(404);
    expect((await api("DELETE", `/admin/api/announcements/${a.id}`, undefined, write(cookie))).json).toEqual({ ok: true });
    expect((await api("DELETE", `/admin/api/announcements/${a.id}`, undefined, write(cookie))).status).toBe(404);
  });

  it("輸入檢查：回 400 與原因", async () => {
    const cookie = await login();
    const ok = { title: "標題", body: "內容", startDate: day(0), endDate: day(1) };
    const cases: [unknown, string][] = [
      [{ ...ok, title: " " }, "請填寫標題"],
      [{ ...ok, body: undefined }, "請填寫內容"],
      [{ ...ok, title: "字".repeat(41) }, "標題不能超過 40 個字"],
      [{ ...ok, body: "字".repeat(1001) }, "內容不能超過 1000 個字"],
      [{ ...ok, startDate: "11/05" }, "開始日期格式不正確"],
      [{ ...ok, endDate: "" }, "結束日期格式不正確"],
      [{ ...ok, startDate: day(2), endDate: day(1) }, "結束日期不能早於開始日期"],
    ];
    for (const [body, error] of cases) {
      const res = await api("POST", "/admin/api/announcements", body, write(cookie));
      expect(res.status, error).toBe(400);
      expect(res.json.error).toBe(error);
    }
  });
});

describe("純函式", () => {
  it("parseDate：接受 - 或 /，拒絕不存在的日期", () => {
    expect(parseDate("2026/11/03", "x")).toBe("2026-11-03");
    expect(parseDate(" 2028-02-29 ", "x")).toBe("2028-02-29");
    expect(() => parseDate("2027-02-29", "日期")).toThrow("日期格式不正確");
    expect(() => parseDate(20261103, "日期")).toThrow("日期格式不正確");
  });

  it("taipeiDate：以台北時間換日", () => {
    expect(taipeiDate(Date.parse("2026-11-02T15:59:59Z"))).toBe("2026-11-02");
    expect(taipeiDate(Date.parse("2026-11-02T16:00:00Z"))).toBe("2026-11-03");
    expect(taipeiDate(Date.parse("2026-11-02T16:00:00Z"), -7)).toBe("2026-10-27");
  });
});
