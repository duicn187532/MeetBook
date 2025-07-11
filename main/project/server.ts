import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { getAllBooked, addBooking, updateBooking, getActiveBooked } from "./controller.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

const app = new Application();
const router = new Router();

// ✅ 启用 CORS
const env = Deno.env.get("ENV"); // 讀取 ENV 變數
console.log("Environment:", env);

const corsOrigin =
  env === "production"
    ? "https://duicn187532.github.io"
    : "*";

console.log("CORS Origin:", corsOrigin);

app.use(
  oakCors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type"],
  })
);

// ✅ 记录 API 请求
router.get("/api/bookings/:room?", async (ctx) => {
  return await getActiveBooked(ctx);
});

router.get("/api/allBookings", async (ctx) => {
  return await getAllBooked(ctx);
});

router.post("/api/bookings", async (ctx) => {
  return await addBooking(ctx);
});

router.patch("/api/bookings/:id/:editPassword?", async (ctx) => {
  return await updateBooking(ctx);
});

app.use(router.routes());
app.use(router.allowedMethods());

// ✅ 重要修复：读取 Cloud Run 提供的 PORT 环境变量
const port = parseInt(Deno.env.get("PORT") || "8080");
console.log(`Starting server on port ${port}...`);

await app.listen({ 
  port,
  hostname: "0.0.0.0"  // 必須綁定 0.0.0.0 才能在容器內被 Cloud Run 探測到
});

