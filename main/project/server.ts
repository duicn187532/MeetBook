import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { getAllBooked, addBooking, updateBooking, getActiveBooked } from "./controller.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

const app = new Application();
const router = new Router();

// ✅ 启用 CORS
const env = Deno.env.get("ENV"); // 讀取 ENV 變數
console.log(env);  // 這裡應該會顯示 "production"

const corsOrigin =
  env === "production"
    ? "https://duicn187532.github.io"
    : "*";

console.log(corsOrigin);

app.use(
  oakCors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type"],
  })
);
// ✅ 记录 API 请求
router.get("/api/bookings/:room?", async (ctx) => {
  // console.log("📥 收到 GET /api/bookings 请求");
  return await getActiveBooked(ctx);
});

router.get("/api/allBookings", async (ctx) => {
  // console.log("📥 收到 GET /api/activeBookings 请求");
  return await getAllBooked(ctx);
});

router.post("/api/bookings", async (ctx) => {
  // console.log("📥 收到 POST /api/bookings 请求");
  return await addBooking(ctx);
});

router.patch("/api/bookings/:id/:editPassword?", async (ctx) => {
  // console.log("📥 收到 PATCH /api/bookings 请求, id:", ctx.params.id);
  return await updateBooking(ctx);
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("✅ Server running on http://localhost:8000");
await app.listen({ port: 8080 });
