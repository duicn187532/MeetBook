import { assert, assertEquals } from "@std/assert";
import { createBridge, parseBridgeTarget } from "./bridge.ts";

const TARGET = "https://worker.example.com";

Deno.test("BRIDGE_TARGET 只接受 https 網址，只取 origin", () => {
  assertEquals(parseBridgeTarget(undefined), null);
  assertEquals(parseBridgeTarget(""), null);
  assertEquals(parseBridgeTarget("  "), null);
  assertEquals(parseBridgeTarget("not a url"), null);
  assertEquals(parseBridgeTarget("http://worker.example.com"), null);
  assertEquals(parseBridgeTarget("https://worker.example.com"), TARGET);
  assertEquals(parseBridgeTarget(" https://worker.example.com/ "), TARGET);
  assertEquals(parseBridgeTarget("https://worker.example.com/api/bookings/"), TARGET);
});

Deno.test("中繼轉送：路徑、查詢字串、方法、標頭與內容原樣送出，回應原樣傳回", async () => {
  let sent: { url: string; init: RequestInit } | null = null;
  const bridge = createBridge(TARGET, (input, init) => {
    sent = { url: String(input), init: init! };
    return Promise.resolve(
      new Response('{"ok":true}', {
        status: 201,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "https://site.example.com",
          "set-cookie": "s=1; Path=/admin; HttpOnly",
          "content-length": "11",
        },
      }),
    );
  });
  const res = await bridge(
    new Request("https://bridge.example.com/api/bookings/abc/secret?x=1&y=2", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://site.example.com", cookie: "s=1" },
      body: '{"title":"會議"}',
    }),
  );
  assert(sent);
  const { url, init } = sent as { url: string; init: RequestInit };
  assertEquals(url, "https://worker.example.com/api/bookings/abc/secret?x=1&y=2");
  assertEquals(init.method, "PATCH");
  assertEquals(init.redirect, "manual");
  const headers = new Headers(init.headers);
  assertEquals(headers.get("origin"), "https://site.example.com");
  assertEquals(headers.get("cookie"), "s=1");
  assertEquals(headers.get("host"), null);
  assertEquals(headers.get("accept-encoding"), "identity");
  assertEquals(new TextDecoder().decode(init.body as ArrayBuffer), '{"title":"會議"}');

  assertEquals(res.status, 201);
  assertEquals(await res.json(), { ok: true });
  assertEquals(res.headers.get("access-control-allow-origin"), "https://site.example.com");
  assertEquals(res.headers.get("set-cookie"), "s=1; Path=/admin; HttpOnly");
  assertEquals(res.headers.get("content-length"), null);
});

Deno.test("中繼轉送：GET 不帶內容，轉址原樣傳回（不自動跟隨）", async () => {
  let body: unknown = "unset";
  const bridge = createBridge(TARGET, (_input, init) => {
    body = init?.body;
    return Promise.resolve(
      new Response(null, { status: 302, headers: { location: "https://calendar.google.com/calendar/render?x" } }),
    );
  });
  const res = await bridge(new Request("https://bridge.example.com/cal/abc/google"));
  assertEquals(body, undefined);
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "https://calendar.google.com/calendar/render?x");
});

Deno.test("中繼轉送失敗時回 502，log 不含網址與錯誤訊息內容", async () => {
  const logs: string[] = [];
  const original = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  console.warn = console.log = console.error = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    const bridge = createBridge(
      TARGET,
      () =>
        Promise.reject(
          new TypeError("error sending request for url (https://worker.example.com/api/bookings/abc/secret)"),
        ),
    );
    const res = await bridge(
      new Request("https://bridge.example.com/api/bookings/abc/secret", { method: "PATCH", body: "{}" }),
    );
    assertEquals(res.status, 502);
    assert((await res.json()).error);
  } finally {
    console.warn = original;
    console.log = originalLog;
    console.error = originalError;
  }
  assert(logs.length > 0);
  for (const line of logs) {
    assert(!line.includes("secret"), line);
    assert(!line.includes("worker.example.com"), line);
  }
});
