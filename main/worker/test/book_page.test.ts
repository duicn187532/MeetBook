// 預約連結的確認頁（/b）：打開不會預約、檢查時段與預約人、按確認才預約、結果頁、XSS 與 CSP
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { api, insertRow, resetDb, rows, seedUser } from "./helpers.ts";

const DAY = 86_400_000;
const taipeiDate = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);
function futureDay(wd: number): string {
  let t = Date.now() + 7 * DAY;
  while (weekday(taipeiDate(t)) !== wd) t += DAY;
  return taipeiDate(t);
}
const WED = futureDay(3);
const SLASH = WED.replaceAll("-", "/");
const LINK = `/b?room=Beta&date=${WED}&start=14:00&end=15:00&title=${encodeURIComponent("週會")}&people=6&user=001234`;

// 直接呼叫 app.fetch：不會自動跟隨轉址，才能檢查 303
async function post(fields: Record<string, string>) {
  const res = await app.fetch(
    new Request("https://w.test/b", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
    }),
    env,
  );
  return { status: res.status, headers: res.headers, text: await res.text() };
}
const FORM = { room: "A102", date: WED, start: "14:00", end: "15:00", title: "週會", people: "6", user: "001234", password: "" };

beforeEach(async () => {
  await resetDb();
  await seedUser();
});

describe("GET /b（確認頁）", () => {
  it("顯示預約內容與預約人姓名；打開不會預約；安全標頭與 CSP，沒有行內 style", async () => {
    const res = await api("GET", LINK);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const csp = res.headers.get("content-security-policy")!;
    const nonce = /style-src 'nonce-([0-9a-f]{32})'/.exec(csp)![1];
    expect(res.text).toContain(`<style nonce="${nonce}">`);
    expect(res.text).not.toContain('style="');
    expect(res.text).toContain('<span class="pill A102">Beta</span>');
    expect(res.text).toContain(`${SLASH}（三）14:00–15:00`);
    expect(res.text).toContain("預約人：測試員");
    expect(res.text).toContain('value="週會"');
    expect(res.text).toContain('value="6"');
    // 編輯密碼欄位是空的，而且不從網址帶入
    expect(res.text).toMatch(/<input id="password" name="password" placeholder="未輸入則任何人皆可編輯"/);
    expect(res.text).not.toMatch(/<button class="btn btn-primary" type="submit" disabled>/);
    expect((await api("GET", `${LINK}&password=9876`)).text).not.toContain("9876");
    expect((await rows()).length).toBe(0);
  });

  it("時段已被預約時列出衝突並停用確認按鈕；行編找不到時提示", async () => {
    await insertRow({ id: "c1", room: "A102", start_time: at(WED, "14:30"), end_time: at(WED, "15:30"), title: "既有會議" });
    const res = await api("GET", LINK.replace("user=001234", "user=999999"));
    expect(res.text).toContain("這個時段已被預約：\nBeta 14:30–15:30 既有會議");
    expect(res.text).toContain('type="submit" disabled');
    expect(res.text).toContain("找不到這個行編（或已停用）");
  });

  it("連結內容有誤時顯示錯誤頁（400）與到網站預約的按鈕", async () => {
    const cases: [string, string][] = [
      [`/b?room=Gamma&date=${WED}&start=14:00&end=15:00`, "會議室名稱無法辨識"],
      [`/b?date=${WED}&start=14:00&end=15:00`, "缺少會議室"],
      [`/b?room=Beta&date=${futureDay(6)}&start=14:00&end=15:00`, "週六、週日不開放預約"],
      [`/b?room=Beta&date=${WED}&start=08:00&end=09:00`, "可預約時段為 08:45–18:15"],
      [`/b?room=Beta&date=${WED}&start=14:03&end=15:00`, "時間需以 5 分鐘為單位"],
      [`/b?room=Beta&date=2020-01-06&start=14:00&end=15:00`, "開始時間已經過了"],
      [`/b?room=Beta&date=${WED}&start=2pm&end=15:00`, "時間格式有誤"],
    ];
    for (const [url, message] of cases) {
      const res = await api("GET", url);
      expect(res.status, url).toBe(400);
      expect(res.text, url).toContain(message);
      expect(res.text).toContain("到網站預約");
    }
  });

  it("連結中的文字一律跳脫（XSS）", async () => {
    const res = await api("GET", `/b?room=Beta&date=${WED}&start=14:00&end=15:00&title=${encodeURIComponent('"><script>alert(1)</script>')}&user=${encodeURIComponent("<img src=x>")}`);
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).not.toContain("<img src=x>");
    expect(res.text).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("POST /b（按下確認預約）", () => {
  it("成功：寫入預約（含自填的編輯密碼）並轉到結果頁；結果頁不顯示密碼", async () => {
    const res = await post({ ...FORM, password: "mypass" });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/^\/b\/ok\?id=[0-9a-f-]{36}$/);
    const [row] = await rows();
    expect(row).toMatchObject({ room: "A102", title: "週會", start_time: at(WED, "14:00"), end_time: at(WED, "15:00"), edit_password: "mypass", cancelled: 0 });
    const done = await api("GET", location);
    expect(done.status).toBe(200);
    expect(done.text).toContain("預約成功");
    expect(done.text).toContain(`${SLASH}（三）14:00–15:00`);
    expect(done.text).toContain("週會｜測試員");
    expect(done.text).toContain("已設定編輯密碼");
    expect(done.text).not.toContain("mypass");
  });

  it("沒填編輯密碼：與網站相同不設密碼，結果頁提醒任何人都能修改", async () => {
    const res = await post(FORM);
    const [row] = await rows();
    expect(row.edit_password).toBe("");
    expect((await api("GET", res.headers.get("location")!)).text).toContain("沒有設定編輯密碼：任何人都能在網站上修改或取消這筆預約");
  });

  it("連按兩次或時段被搶走：第二次回到確認頁並列出衝突，不會重複預約", async () => {
    expect((await post(FORM)).status).toBe(303);
    const again = await post(FORM);
    expect(again.status).toBe(409);
    expect(again.text).toContain("這個時段已被預約");
    expect((await rows()).length).toBe(1);
  });

  it("多間會議室：同一組預約，結果頁列出全部會議室", async () => {
    const res = await post({ ...FORM, room: "A101,A103" });
    const group = await rows();
    expect(group.map((r) => r.room)).toEqual(["A101", "A103"]);
    expect(group[0].group_id).toBe(group[1].group_id);
    const done = await api("GET", res.headers.get("location")!);
    expect(done.text).toContain('<span class="pill A101">Alpha</span><span class="pill A103">StartUp</span>');
  });

  it("行編錯誤、沒填行編、人數錯誤：回到確認頁並保留填寫的內容", async () => {
    const notFound = await post({ ...FORM, user: "999999" });
    expect(notFound.status).toBe(404);
    expect(notFound.text).toContain("找不到這個行編（或已停用），請確認後再試");
    expect(notFound.text).toContain('value="週會"');
    expect((await post({ ...FORM, user: "" })).text).toContain("請輸入預約者的行編");
    expect((await post({ ...FORM, people: "abc" })).text).toContain("與會人數請輸入 0–100 的整數");
    expect((await post({ ...FORM, date: futureDay(6) })).status).toBe(400);
    expect((await rows()).length).toBe(0);
  });
});

describe("GET /b/ok", () => {
  it("找不到的 id 顯示錯誤頁", async () => {
    expect((await api("GET", "/b/ok?id=nope")).status).toBe(400);
    expect((await api("GET", "/b/ok")).text).toContain("找不到這筆預約");
  });
});
