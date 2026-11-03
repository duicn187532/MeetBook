// 給 AI 助理讀的說明頁與查詢頁：內容、空檔計算、個資範圍、標頭
import { beforeEach, describe, expect, it } from "vitest";
import { api, insertRow, resetDb, seedUser } from "./helpers.ts";
import { freeIntervals, OVERVIEW_DAYS, upcomingWorkdays } from "../src/ai.ts";

const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);
const workdays = upcomingWorkdays(Date.now(), OVERVIEW_DAYS);
// 空檔總覽中「之後」的一個工作日（不是今天，避免受現在時間影響）
const DAY1 = workdays[2];
function futureDay(wd: number, minDays = 7): string {
  let t = Date.now() + minDays * DAY;
  while (weekday(taipeiDate(t)) !== wd) t += DAY;
  return taipeiDate(t);
}

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("GET /ai", () => {
  it("純文字、不快取、不被收錄；有現在時間、會議室、規則、預約連結格式", async () => {
    const res = await api("GET", "/ai");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const t = res.text;
    expect(t).toContain(`現在時間：${taipeiDate(Date.now())}`);
    expect(t).toContain("- Alpha（代碼 A101）：10 人，投影機、白板");
    expect(t).toContain("只能預約週一到週五 08:45–18:15");
    expect(t).toContain("https://w.test/b?room=Beta&date=");
    expect(t).toContain("行編一定要由使用者提供");
    expect(t).toContain("不要放編輯密碼");
  });

  it(`列出 ${OVERVIEW_DAYS} 個工作日的空檔與詳細網址（網址用請求的網域），不含預約者姓名與會議名稱`, async () => {
    await insertRow({ id: "a1", room: "A101", start_time: at(DAY1, "10:00"), end_time: at(DAY1, "11:00"), title: "機密專案" });
    await insertRow({ id: "a2", room: "A103", start_time: at(DAY1, "08:45"), end_time: at(DAY1, "18:15") });
    await insertRow({ id: "a3", room: "A102", start_time: at(DAY1, "12:00"), end_time: at(DAY1, "12:10") });
    await insertRow({ id: "a4", room: "A102", start_time: at(DAY1, "12:20"), end_time: at(DAY1, "13:00"), cancelled: 1 });
    const { text } = await api("GET", "/ai");
    for (const d of workdays) expect(text).toContain(`詳細：https://w.test/ai/day/${d}`);
    const section = text.split(`### ${DAY1}`)[1].split("###")[0];
    expect(section).toContain("- Alpha：08:45–10:00、11:00–18:15");
    // 12:00–12:10 的預約前後：08:45–12:00、12:10–18:15（已取消的不算）
    expect(section).toContain("- Beta：08:45–12:00、12:10–18:15");
    expect(section).toContain("- StartUp：已滿");
    expect(text).not.toContain("機密專案");
    expect(text).not.toContain("測試員");
  });
});

describe("GET /ai/day/:date", () => {
  it("列出空檔與預約（與網站公開的資料相同），不含行編與編輯密碼", async () => {
    const d = futureDay(3);
    await insertRow({ id: "b1", room: "A101", start_time: at(d, "10:00"), end_time: at(d, "11:30"), title: "週會", edit_password: "pw9999" });
    await insertRow({ id: "b2", room: "A101", start_time: at(d, "14:00"), end_time: at(d, "15:00"), title: "" });
    const res = await api("GET", `/ai/day/${d}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const t = res.text;
    expect(t).toContain("- Alpha：08:45–10:00、11:30–14:00、15:00–18:15");
    expect(t).toContain("- Beta：08:45–18:15");
    expect(t).toContain("- 10:00–11:30 週會｜預約者：測試員｜2 人");
    expect(t).toContain("- 14:00–15:00 （未命名）｜預約者：測試員｜2 人");
    expect(t).toContain("### Beta（15 人）\n- 沒有預約");
    expect(t).not.toContain("pw9999");
    expect(t).not.toContain("001234");
  });

  it("週末、格式錯誤、太久以前或太久以後", async () => {
    expect((await api("GET", `/ai/day/${futureDay(6)}`)).text).toContain("週六、週日不開放預約");
    const bad = await api("GET", "/ai/day/2026-02-30");
    expect(bad.status).toBe(400);
    expect(bad.text).toContain("日期格式不正確");
    expect((await api("GET", `/ai/day/${taipeiDate(Date.now() - 60 * DAY)}`)).status).toBe(400);
    expect((await api("GET", `/ai/day/${taipeiDate(Date.now() + 200 * DAY)}`)).status).toBe(400);
    // 也接受 YYYY/MM/DD（以 URL 編碼）
    expect((await api("GET", `/ai/day/${encodeURIComponent(futureDay(3).replaceAll("-", "/"))}`)).status).toBe(200);
  });
});

describe("輔助函式", () => {
  it("upcomingWorkdays：跳過週末；今天的時段結束後從下一個工作日開始", () => {
    const fri = "2026-11-06";
    expect(upcomingWorkdays(at(fri, "09:00"), 3)).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
    expect(upcomingWorkdays(at(fri, "18:30"), 2)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(upcomingWorkdays(at("2026-11-07", "10:00"), 1)).toEqual(["2026-11-09"]);
  });

  it("freeIntervals：今天從現在（進位到 5 分鐘）開始；短於 15 分鐘的空檔不列出", () => {
    const d = "2026-11-04";
    const fmt = (l: [number, number][]) => l.map(([s, e]) => `${new Date(s + 8 * 3600_000).toISOString().slice(11, 16)}-${new Date(e + 8 * 3600_000).toISOString().slice(11, 16)}`);
    const busy = [
      { start_time: at(d, "13:00"), end_time: at(d, "14:00") },
      { start_time: at(d, "14:10"), end_time: at(d, "15:00") },
    ];
    expect(fmt(freeIntervals(at(d, "08:45"), at(d, "18:15"), busy, at(d, "11:02")))).toEqual(["11:05-13:00", "15:00-18:15"]);
    expect(freeIntervals(at(d, "08:45"), at(d, "18:15"), [], at(d, "18:10"))).toEqual([]);
  });
});

describe("robots.txt", () => {
  it("允許 /ai，其他路徑不讓爬蟲讀取", async () => {
    const res = await api("GET", "/robots.txt");
    expect(res.text).toBe("User-agent: *\nAllow: /ai\nDisallow: /\n");
  });
});
