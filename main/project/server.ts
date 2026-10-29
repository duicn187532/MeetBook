import { CORS_ORIGIN, ENV, PORT } from "./config.ts";
import { Application, Router } from "oak";
import { oakCors } from "cors";
import { addBooking, getActiveBooked, updateBooking } from "./controller.ts";
import { dbConfigured, ensureConnected, ensureIndexes, pingDb } from "./db.ts";
import { logEvent } from "./logger.ts";

const app = new Application();
const router = new Router();

console.log("Environment:", ENV, "Timeline:", Deno.env.get("DENO_TIMELINE") ?? "-");
console.log("CORS Origin:", CORS_ORIGIN);

// 未預期的例外統一回 500，避免連線直接中斷
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const err = error as Error;
    logEvent("error", "未處理的例外", {
      details: { path: ctx.request.url.pathname, error: err.message },
      errorStack: err.stack,
    });
    ctx.response.status = 500;
    ctx.response.body = { error: "伺服器錯誤" };
  }
});

app.use(
  oakCors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type"],
  }),
);

// 資料庫未設定或連不上時 API 回 503，服務本身仍可啟動
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname.startsWith("/api/")) {
    if (!dbConfigured) {
      ctx.response.status = 503;
      ctx.response.body = { error: "資料庫未設定" };
      return;
    }
    try {
      await ensureConnected();
    } catch {
      ctx.response.status = 503;
      ctx.response.body = { error: "資料庫連線失敗" };
      return;
    }
  }
  await next();
});

router.get("/", (ctx) => {
  ctx.response.body = { ok: true };
});

// 部署後用來確認服務與資料庫狀態
router.get("/healthz", async (ctx) => {
  const db = await pingDb();
  ctx.response.status = db === "ok" ? 200 : 503;
  ctx.response.body = { ok: db === "ok", db };
});

// GET /api/bookings/:room?from=ISO&to=ISO
router.get("/api/bookings/:room?", getActiveBooked);
router.post("/api/bookings", addBooking);
router.patch("/api/bookings/:id/:editPassword?", updateBooking);

app.use(router.routes());
app.use(router.allowedMethods());

// 不阻塞啟動，失敗只記錄 warning
void ensureIndexes();

console.log(`Starting server on port ${PORT}...`);
await app.listen({ port: PORT, hostname: "0.0.0.0" });
