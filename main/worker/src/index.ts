// MeetBook 後端（Cloudflare Workers + D1）
// 路由、狀態碼與回應格式與 Deno 版 server.ts 相同，前端不需要任何修改
import { Hono } from "hono";
import { cors } from "hono/cors";
import { corsOrigin, type Env } from "./env.ts";
import { logEvent, setLogLevel } from "./logger.ts";
import { configureSite } from "./site.ts";
import { addBooking, getActiveBooked, updateBooking } from "./bookings.ts";
import { lineWebhook } from "./line_webhook.ts";
import { adminGuard, adminRouter } from "./admin.ts";
import { getNotices } from "./notices.ts";
import { mcpHandler } from "./mcp.ts";
import { aiDay, aiGuide, robotsTxt } from "./ai.ts";
import { bookDone, calendarFile, bookPage, bookSubmit } from "./book_page.ts";

// strict: false：/api/bookings 與 /api/bookings/ 視為相同（前端送出的網址結尾有 /）
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.use("*", async (c, next) => {
  setLogLevel(c.env.LOG_LEVEL);
  configureSite(c.env, new URL(c.req.url).origin);
  await next();
});

// 未預期的例外統一回 500，避免連線直接中斷
app.onError((error, c) => {
  logEvent("error", "未處理的例外", {
    details: { path: c.req.path, error: error.message },
    errorStack: error.stack,
  });
  return c.json({ error: "伺服器錯誤" }, 500);
});

// 正式環境只允許 GitHub Pages 的前端
app.use(
  "*",
  cors({
    origin: (_origin, c) => corsOrigin(c.env as Env),
    allowMethods: ["GET", "POST", "PATCH"],
    allowHeaders: ["Content-Type"],
  }),
);

// 資料庫未設定時 API 回 503
app.use("/api/*", async (c, next) => {
  if (!c.env.DB) return c.json({ error: "資料庫未設定" }, 503);
  await next();
});

app.get("/", (c) => c.json({ ok: true }));

// 部署後用來確認服務與資料庫狀態；詳細錯誤只寫入 log，不回給呼叫端
app.get("/healthz", async (c) => {
  let db: "ok" | "not_configured" | "unreachable" = "not_configured";
  if (c.env.DB) {
    try {
      await c.env.DB.prepare("SELECT 1").first();
      db = "ok";
    } catch (error) {
      logEvent("error", "D1 ping 失敗", { details: { error: (error as Error).message } });
      db = "unreachable";
    }
  }
  return c.json({ ok: db === "ok", db }, db === "ok" ? 200 : 503);
});

// GET /api/bookings/:room?from=ISO&to=ISO
app.get("/api/bookings/:room?", getActiveBooked);
app.post("/api/bookings", addBooking);
app.patch("/api/bookings/:id/:editPassword?", updateBooking);

// 前端開啟網站時讀取：目前在公告期間內的更新日誌與公告（由管理後台維護）
app.get("/api/notices", getNotices);

// MCP 伺服器：讓 AI 助理查詢與預約會議室（見 mcp.ts）
app.all("/mcp", mcpHandler);

// 給 AI 助理讀的說明與查詢頁（純文字，只能讀取）：使用者在 ChatGPT 等對話貼上 /ai 網址，AI 查空檔並產生預填預約連結
app.get("/ai", aiGuide);
app.get("/ai/day/:date", aiDay);
app.get("/robots.txt", robotsTxt);
// 預約連結的確認頁：打開不會預約，使用者按「確認預約」才送出（見 book_page.ts）
app.get("/b", bookPage);
app.post("/b", bookSubmit);
app.get("/b/ok", bookDone);
app.get("/cal/:file", calendarFile);

// LINE 官方帳號 webhook（在 LINE Developers 設定為 https://<網域>/line/webhook）
app.post("/line/webhook", lineWebhook);

// 管理後台：未設定 ADMIN_PASSWORD 時 /admin 一律 404
app.use("/admin", adminGuard);
app.use("/admin/*", adminGuard);
app.route("/", adminRouter);

export default app;
