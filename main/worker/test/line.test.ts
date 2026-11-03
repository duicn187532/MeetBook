// LINE webhook：簽章驗證（Web Crypto）、快速查詢、快速預約、週末回覆、重送略過
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.ts";
import { AI_PAGE_URL, AI_TEMPLATE, HELP_REPLY, MCP_URL, WEEKEND_REPLY } from "../src/line_bot.ts";
import { api, resetDb, rows, seedUser } from "./helpers.ts";

async function sign(body: string, secret = "test-line-secret"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...sig));
}

function textEvent(text: string, extra: Record<string, unknown> = {}) {
  return { type: "message", replyToken: "rt", message: { type: "text", text }, ...extra };
}

let replies: { url: string; body: { replyToken: string; messages: { type: string; text: string }[] }; auth: string }[];

async function webhook(events: unknown[], signature?: string) {
  const body = JSON.stringify({ events });
  return api("POST", "/line/webhook", body, { "X-Line-Signature": signature ?? (await sign(body)) });
}

beforeEach(async () => {
  await resetDb();
  await seedUser();
  replies = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://line.test/")) return realFetch(input, init);
    replies.push({
      url,
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get("authorization") ?? "",
    });
    return new Response("{}", { status: 200 });
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  // 2026-12-01（週二）台北時間 10:00
  vi.setSystemTime(new Date("2026-12-01T10:00:00+08:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LINE webhook", () => {
  it("未設定 LINE secrets 時回 503", async () => {
    const e = { ...env, LINE_CHANNEL_SECRET: "" } as typeof env;
    const res = await app.fetch(new Request("https://w.test/line/webhook", { method: "POST", body: "{}" }), e);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "LINE 未設定" });
  });

  it("簽章錯誤回 401，不處理事件", async () => {
    const res = await webhook([textEvent("快速查詢")], await sign("other body"));
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: "簽章錯誤" });
    expect((await webhook([textEvent("快速查詢")], "not-base64!!")).status).toBe(401);
    expect(replies).toEqual([]);
  });

  it("簽章正確但內容不是 JSON 時回 400", async () => {
    const res = await api("POST", "/line/webhook", "{bad", { "X-Line-Signature": await sign("{bad") });
    expect(res.status).toBe(400);
  });

  it("快速查詢：回覆今天的預約", async () => {
    await api("POST", "/api/bookings/", {
      title: "晨會",
      user: "1234",
      room: "A102",
      startTime: "2026-12-01T09:00:00+08:00",
      endTime: "2026-12-01T09:30:00+08:00",
    });
    const res = await webhook([textEvent("快速查詢")]);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(replies).toHaveLength(1);
    expect(replies[0].url).toBe("https://line.test/v2/bot/message/reply");
    expect(replies[0].auth).toBe("Bearer test-line-token");
    expect(replies[0].body.replyToken).toBe("rt");
    expect(replies[0].body.messages[0].text).toContain("📅 今日（2026-12-01）會議室預約狀況：");
    expect(replies[0].body.messages[0].text).toContain("🕒 09:00 - 09:30｜主題：晨會");
  });

  it("快速預約：回覆說明與模板；週末回覆不開放", async () => {
    await webhook([textEvent("快速預約")]);
    expect(replies[0].body.messages).toHaveLength(2);
    expect(replies[0].body.messages[1].text).toContain("2️⃣ 開始時間:10:00");

    replies = [];
    vi.setSystemTime(new Date("2026-12-05T10:00:00+08:00"));
    await webhook([textEvent("快速預約")]);
    expect(replies[0].body.messages).toEqual([{ type: "text", text: WEEKEND_REPLY }]);
  });

  it("填好的預約表單：建立預約並回覆編輯密碼；時段衝突時列出衝突", async () => {
    const form = ["1️⃣ 會議名稱:專案討論", "2️⃣ 開始時間:14:00", "3️⃣ 會議時間:1hr", "4️⃣ 預約人:1234", "5️⃣ 會議室:A、b"].join("\n");
    await webhook([textEvent(form)]);
    const text = replies[0].body.messages[0].text;
    expect(text).toContain("✅ 預約成功！");
    expect(text).toContain("📋 會議室：Alpha、Beta");
    expect(text).toMatch(/🔑 編輯密碼：\d{4}/);
    const list = await rows();
    expect(list.map((r) => r.room)).toEqual(["A101", "A102"]);
    expect(list[0].edit_password).toMatch(/^\d{4}$/);

    replies = [];
    await webhook([textEvent(form)]);
    expect(replies[0].body.messages[0].text).toContain("❌ 預約失敗，時段已被預約");
    expect((await rows()).length).toBe(2);
  });

  it("找不到行編時提示", async () => {
    const form = ["開始時間:14:00", "會議時長:1hr", "預約人:9999", "會議室:S"].join("\n");
    await webhook([textEvent(form)]);
    expect(replies[0].body.messages[0].text).toContain("4️⃣ 找不到這個行編，請確認後重新輸入");
  });

  it("ai：回覆方法一（含優點）、可複製的範本、方法二（連接器）三則訊息；大小寫、全形與「ai預約」都可以", async () => {
    for (const text of ["ai", " AI ", "Ａｉ", "ai 預約", "AI教學"]) {
      replies = [];
      await webhook([textEvent(text)]);
      expect(replies.length, text).toBe(1);
      const [free, template, connector] = replies[0].body.messages;
      expect(replies[0].body.messages.length).toBe(3);
      expect(free.text).toContain("【好處】");
      expect(free.text).toContain("・同一個對話會記得你");
      expect(free.text).toContain("2. 複製下一則訊息，貼上");
      expect(template.text).toBe(AI_TEMPLATE);
      // 網址自成一行
      expect(template.text.split("\n").slice(0, 2)).toEqual(["請讀這個網址：", AI_PAGE_URL]);
      expect(template.text).toContain("\n行編：\n");
      expect(template.text).toContain("這次要訂：");
      expect(free.text).toContain("用 AI 預約｜方法一");
      expect(free.text).toContain("・不要把密碼告訴 AI");
      expect(connector.text).toContain("用 AI 預約｜方法二");
      expect(connector.text).toContain(MCP_URL);
    }
    replies = [];
    await webhook([textEvent("aim")]);
    expect(replies).toEqual([]);
  });

  it("一對一聊天收到看不懂的訊息時說明可用的指令（含 ai）；群組不回覆；預約表單照常處理", async () => {
    await webhook([textEvent("你好", { source: { type: "user", userId: "U1" } })]);
    expect(replies[0].body.messages).toEqual([{ type: "text", text: HELP_REPLY }]);
    expect(HELP_REPLY).toContain("・ai｜用 AI 預約的教學");
    replies = [];
    await webhook([textEvent("你好", { source: { type: "group", groupId: "G1" } })]);
    expect(replies).toEqual([]);
    const form = ["開始時間:14:00", "會議時長:1hr", "預約人:001234", "會議室:S"].join("\n");
    await webhook([textEvent(form, { source: { type: "user", userId: "U1" } })]);
    expect(replies[0].body.messages[0].text).toContain("✅ 預約成功！");
    // 管理後台顯示的來源
    expect((await env.DB.prepare("SELECT source FROM bookings").first<{ source: string }>())!.source).toBe("line");
  });

  it("重送的事件、一般聊天與非文字訊息不回覆", async () => {
    await webhook([
      textEvent("快速查詢", { deliveryContext: { isRedelivery: true } }),
      textEvent("大家好"),
      { type: "message", replyToken: "rt", message: { type: "sticker" } },
      { type: "follow", replyToken: "rt" },
    ]);
    expect(replies).toEqual([]);
  });
});
