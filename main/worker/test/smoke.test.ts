import { exports } from "cloudflare:workers";
import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("GET / 回傳 { ok: true }", async () => {
  const res = await exports.default.fetch("https://w.test/");
  expect(await res.json()).toEqual({ ok: true });
});

it("migrations 已套用", async () => {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings").first<{ n: number }>();
  expect(r?.n).toBe(0);
});

it("管理頁面已打包", async () => {
  const res = await exports.default.fetch("https://w.test/admin");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("MeetBook 管理後台");
});
