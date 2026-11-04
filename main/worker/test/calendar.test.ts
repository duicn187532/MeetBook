// 加到行事曆：.ics 行事曆檔格式，以及預約結果頁 /b/ok 中的「分享 ics」按鈕
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { bookingEvent, icsFile, icsFileName } from "../src/calendar.ts";
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

describe("bookingEvent", () => {
  it("地點列出所有會議室；說明含預約人與網站；同一場會議的 UID 固定", () => {
    const e = bookingEvent(BOOKING);
    expect(e.location).toBe("數金部 11F Beta、Alpha 會議室");
    expect(e.details).toBe("會議室：Beta、Alpha\n預約人：測試員\n修改或取消：https://frontend.test/app/");
    // 不論會議室順序，同一場會議的 UID 相同
    expect(e.uid).toBe("20261111T060000Z-Alpha-Beta@meetbook");
    expect(bookingEvent({ ...BOOKING, rooms: ["Alpha", "Beta"] }).uid).toBe(e.uid);
    expect([e.start, e.end]).toEqual([BOOKING.start, BOOKING.end]);
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

describe("行事曆檔 /cal/:id.ics 與預約結果頁 /b/ok 的「加入行事曆」", () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser();
  });

  async function book(fields: Record<string, string>) {
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
    return res.headers.get("location")!;
  }

  it("/b/ok 有「加入行事曆」「Google」「分享 ics」；連結在同一頁開啟並帶 openExternalBrowser=1", async () => {
    const location = await book({ room: "A101,A102", date: nextWednesday(), start: "14:00", end: "15:00", title: "週會", people: "6", user: "001234", password: "" });
    const [first] = await rows();
    const html = (await api("GET", location)).text;
    expect(html).toContain(`<a class="btn btn-outline" href="/cal/${first.id}.ics?openExternalBrowser=1">加入行事曆</a>`);
    // Google 直接連到 calendar.google.com（iPhone 才會開 Google 日曆 App）
    const google = /<a class="btn btn-outline" href="(https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+)">Google<\/a>/.exec(html);
    expect(google).not.toBeNull();
    expect(new URL(google![1].replace(/&amp;/g, "&")).searchParams.get("text")).toBe("週會");
    expect(html).toContain('<button class="btn btn-outline" type="button" id="ics">分享 ics</button>');
    // 分享用的 .ics 放在有 nonce 的 script 中，與 /cal 回傳的內容相同（DTSTAMP 除外）
    // nonce 每次請求都不同，同一個回應中讀取
    const res2 = await api("GET", location);
    const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(res2.headers.get("content-security-policy")!)![1];
    const page2 = res2.text;
    const script = page2.split(`<script nonce="${nonce}">`)[1]?.split("</script>")[0] ?? "";
    const embedded = JSON.parse(/const ICS = (".*?");\n/.exec(script)![1]) as string;
    const served = (await api("GET", `/cal/${first.id}.ics`)).text;
    const noStamp = (t: string) => t.replace(/DTSTAMP:\d{8}T\d{6}Z/, "");
    expect(noStamp(embedded)).toBe(noStamp(served));
    expect(script).toContain("navigator.share({ files: [file] })");
    // 不再使用 data: 網址（iPhone Safari 會擋下）
    expect(script).not.toContain("data:text/calendar");
  });

  it("回傳 .ics：標頭正確；多間會議室列在地點；會議名稱與預約人；不含行編與編輯密碼", async () => {
    const date = nextWednesday();
    await book({ room: "A101,A102", date, start: "14:00", end: "15:00", title: "</script><b>週會", people: "6", user: "001234", password: "pw7788" });
    const list = await rows();
    // 用任一間的 id 都能取得整組
    for (const r of list) {
      // 連結帶的 openExternalBrowser=1 不影響結果
      const res = await api("GET", `/cal/${r.id}.ics?openExternalBrowser=1`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe(`inline; filename="meeting-${date.replace(/-/g, "")}-1400.ics"`);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      const ics = res.text.replace(/\r\n /g, "");
      expect(ics).toContain(`DTSTART:${date.replace(/-/g, "")}T060000Z\r\n`);
      expect(ics).toContain(`DTEND:${date.replace(/-/g, "")}T070000Z\r\n`);
      expect(ics).toContain("LOCATION:數金部 11F Alpha、Beta 會議室\r\n");
      expect(ics).toContain("SUMMARY:</script><b>週會\r\n");
      expect(ics).toContain("預約人：測試員");
      expect(ics).toContain("修改或取消：https://frontend.test/app/");
      expect(ics).not.toContain("001234");
      expect(ics).not.toContain("pw7788");
    }
  });

  it("/cal/:id/google 轉到 Google 行事曆的新增活動頁", async () => {
    const date = nextWednesday();
    await book({ room: "A101,A102", date, start: "14:00", end: "15:00", title: "週會", people: "6", user: "001234", password: "" });
    const [first] = await rows();
    const res = await app.fetch(new Request(`https://w.test/cal/${first.id}/google`, { redirect: "manual" }), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("週會");
    expect(url.searchParams.get("dates")).toBe(`${date.replace(/-/g, "")}T060000Z/${date.replace(/-/g, "")}T070000Z`);
    expect(url.searchParams.get("location")).toBe("數金部 11F Alpha、Beta 會議室");
    expect(url.searchParams.get("details")).toContain("預約人：測試員");
    expect(url.searchParams.get("details")).not.toContain("001234");
    expect((await api("GET", "/cal/nope/google")).status).toBe(404);
    // format=json：回傳同一個網址（網站用來直接連到 Google）
    const json = await api("GET", `/cal/${first.id}/google?format=json`);
    expect(json.status).toBe(200);
    expect(json.json).toEqual({ url: res.headers.get("location") });
    expect((await api("GET", "/cal/nope/google?format=json")).status).toBe(404);
    // 連結帶的 openExternalBrowser=1 不影響轉址
    const withParam = await app.fetch(new Request(`https://w.test/cal/${first.id}/google?openExternalBrowser=1`, { redirect: "manual" }), env);
    expect(withParam.status).toBe(302);
  });

  it("/b/ok?v=info 的標題是「預約資訊」", async () => {
    const location = await book({ room: "A103", date: nextWednesday(), start: "09:00", end: "10:00", title: "x", people: "1", user: "001234", password: "" });
    expect((await api("GET", location)).text).toContain("<h2>預約成功</h2>");
    const info = (await api("GET", `${location}&v=info`)).text;
    expect(info).toContain("<h2>預約資訊</h2>");
    expect(info).toContain("<title>預約資訊｜");
  });

  it("找不到、已取消、格式不對的 id 都回 404", async () => {
    await book({ room: "A101", date: nextWednesday(), start: "10:00", end: "11:00", title: "x", people: "1", user: "001234", password: "" });
    const [row] = await rows();
    expect((await api("GET", `/cal/${row.id}.ics`)).status).toBe(200);
    await env.DB.prepare("UPDATE bookings SET cancelled = 1 WHERE id = ?").bind(row.id).run();
    const cancelled = await api("GET", `/cal/${row.id}.ics`);
    expect(cancelled.status).toBe(404);
    expect(cancelled.text).toContain("找不到這筆預約");
    expect((await api("GET", `/b/ok?id=${row.id}`)).text).not.toContain("加入行事曆");
    expect((await api("GET", `/cal/${row.id}/google`)).status).toBe(404);
    expect((await api("GET", "/cal/nope.ics")).status).toBe(404);
    expect((await api("GET", `/cal/${"a".repeat(65)}.ics`)).status).toBe(404);
    expect((await api("GET", "/cal/a'b.ics")).status).toBe(404);
  });
});
