// 加到行事曆：Google 行事曆連結、.ics 行事曆檔格式，以及預約結果頁 /b/ok 與 LINE 回覆中的入口
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { bookingEvent, googleCalendarUrl, icsFile, icsFileName } from "../src/calendar.ts";
import { api, resetDb, rows, seedUser } from "./helpers.ts";

const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);
const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
function nextWednesday(): string {
  let t = Date.now() + 7 * DAY;
  while (new Date(`${taipeiDate(t)}T00:00:00Z`).getUTCDay() !== 3) t += DAY;
  return taipeiDate(t);
}

const BOOKING = {
  rooms: ["Beta", "Alpha"],
  title: "週會; 進度, 報告",
  start: at("2026-11-11", "14:00"),
  end: at("2026-11-11", "15:30"),
  booker: "測試員",
  website: "https://frontend.test/app/",
};

describe("bookingEvent / googleCalendarUrl", () => {
  it("時間轉成 UTC；地點列出所有會議室；說明含預約人與網站", () => {
    const e = bookingEvent(BOOKING);
    expect(e.location).toBe("數金部 11F Beta、Alpha 會議室");
    expect(e.details).toBe("會議室：Beta、Alpha\n預約人：測試員\n修改或取消：https://frontend.test/app/");
    // 不論會議室順序，同一場會議的 UID 相同
    expect(e.uid).toBe("20261111T060000Z-Alpha-Beta@meetbook");
    expect(bookingEvent({ ...BOOKING, rooms: ["Alpha", "Beta"] }).uid).toBe(e.uid);

    const url = new URL(googleCalendarUrl(e));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("週會; 進度, 報告");
    expect(url.searchParams.get("dates")).toBe("20261111T060000Z/20261111T073000Z");
    expect(url.searchParams.get("ctz")).toBe("Asia/Taipei");
    expect(url.searchParams.get("details")).toContain("預約人：測試員");
  });

  it("未填會議名稱（資料庫存「HH:mm ~ HH:mm」）時改用「會議室預約」", () => {
    expect(bookingEvent({ ...BOOKING, title: "14:00 ~ 15:30" }).title).toBe("會議室預約（Beta、Alpha）");
    expect(bookingEvent({ ...BOOKING, title: "" }).title).toBe("會議室預約（Beta、Alpha）");
    expect(bookingEvent({ ...BOOKING, title: null, booker: undefined, website: undefined }).details).toBe("會議室：Beta、Alpha");
  });
});

describe("icsFile", () => {
  const ics = icsFile(bookingEvent(BOOKING), Date.UTC(2026, 10, 4, 1, 2, 3));
  const unfolded = ics.replace(/\r\n /g, "");

  it("以 CRLF 換行，包含完整的 VCALENDAR／VEVENT 與 10 分鐘前提醒", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    const lines = unfolded.trimEnd().split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("UID:20261111T060000Z-Alpha-Beta@meetbook");
    expect(lines).toContain("DTSTAMP:20261104T010203Z");
    expect(lines).toContain("DTSTART:20261111T060000Z");
    expect(lines).toContain("DTEND:20261111T073000Z");
    expect(lines).toContain("TRIGGER:-PT10M");
  });

  it("跳脫分號、逗號與換行", () => {
    expect(unfolded).toContain("SUMMARY:週會\\; 進度\\, 報告\r\n");
    expect(unfolded).toContain("DESCRIPTION:會議室：Beta、Alpha\\n預約人：測試員\\n修改或取消：https://frontend.test/app/\r\n");
  });

  it("每行不超過 75 bytes，且不會切斷中文字", () => {
    const long = icsFile(bookingEvent({ ...BOOKING, title: "很長的會議名稱".repeat(10) }));
    const enc = new TextEncoder();
    for (const line of long.split("\r\n")) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("\uFFFD");
    }
    expect(long.replace(/\r\n /g, "")).toContain(`SUMMARY:${"很長的會議名稱".repeat(10)}\r\n`);
  });

  it("檔名以台北時間命名", () => {
    expect(icsFileName(at("2026-11-11", "09:05"))).toBe("meeting-20261111-0905.ics");
  });
});

describe("預約結果頁 /b/ok 的「加到行事曆」", () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser();
  });

  async function bookAndOpen(fields: Record<string, string>) {
    const res = await app.fetch(
      new Request("https://w.test/b", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
        redirect: "manual",
      }),
      env,
    );
    expect(res.status).toBe(303);
    return api("GET", res.headers.get("location")!);
  }

  it("有 Google 行事曆連結與分享 .ics 的按鈕；檔案內容放在有 nonce 的 script 中，且 < 已跳脫", async () => {
    const date = nextWednesday();
    const done = await bookAndOpen({ room: "A101,A102", date, start: "14:00", end: "15:00", title: "</script><b>週會", people: "6", user: "001234", password: "" });
    const html = done.text;
    expect(html).toContain("<h3>加到行事曆</h3>");
    const href = /<a class="btn btn-outline" href="([^"]+)" target="_blank" rel="noopener">加到 Google 行事曆<\/a>/.exec(html)![1];
    const google = new URL(href.replace(/&amp;/g, "&"));
    expect(google.searchParams.get("text")).toBe("</script><b>週會");
    expect(google.searchParams.get("location")).toBe("數金部 11F Alpha、Beta 會議室");
    expect(google.searchParams.get("details")).toContain("預約人：測試員");
    expect(html).toContain('<button class="btn btn-outline" type="button" id="ics">分享 ics</button>');
    // 不顯示文字說明
    expect(html).not.toContain('id="ics-hint"');
    // 會議名稱只以跳脫後的形式出現，不會提早結束 <script> 或插入標籤
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("\\u003c/script>\\u003cb>週會");
    const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(done.headers.get("content-security-policy")!)![1];
    const script = html.split(`<script nonce="${nonce}">`)[1].split("</script>")[0];
    const ics = JSON.parse(/const ICS = (".*?");\n/.exec(script)![1]) as string;
    expect(ics).toContain(`DTSTART:${date.replace(/-/g, "")}T060000Z\r\n`);
    expect(ics).toContain("LOCATION:數金部 11F Alpha、Beta 會議室\r\n");
    expect(script).toContain(`const NAME = "meeting-${date.replace(/-/g, "")}-1400.ics";`);
    expect(script).toContain("navigator.share({ files: [file] })");
  });

  it("已取消的預約不顯示「加到行事曆」", async () => {
    const done = await bookAndOpen({ room: "A101", date: nextWednesday(), start: "10:00", end: "11:00", title: "x", people: "1", user: "001234", password: "" });
    expect(done.text).toContain("加到行事曆");
    const [row] = await rows();
    await env.DB.prepare("UPDATE bookings SET cancelled = 1 WHERE id = ?").bind(row.id).run();
    const again = await api("GET", `/b/ok?id=${row.id}`);
    expect(again.text).toContain("這筆預約已取消");
    expect(again.text).not.toContain("加到行事曆");
    expect(again.text).not.toContain("const ICS");
  });
});
