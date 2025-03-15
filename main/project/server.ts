import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { getAllBooked, addBooking, updateBooking, getActiveBooked } from "./controller.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

const app = new Application();
const router = new Router();

// ✅ 启用 CORS
app.use(oakCors({
  origin: "*",
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type"],
}));

// ✅ 记录 API 请求
router.get("/api/bookings/:room?", async (ctx) => {
  console.log("📥 收到 GET /api/bookings 请求");
  return await getActiveBooked(ctx);
});

router.get("/api/allBookings", async (ctx) => {
  console.log("📥 收到 GET /api/activeBookings 请求");
  return await getAllBooked(ctx);
});

router.post("/api/bookings", async (ctx) => {
  console.log("📥 收到 POST /api/bookings 请求");
  return await addBooking(ctx);
});

router.patch("/api/bookings/:id/:editPassword?", async (ctx) => {
  console.log("📥 收到 PATCH /api/bookings 请求, id:", ctx.params.id);
  return await updateBooking(ctx);
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("✅ Server running on http://localhost:8000");
await app.listen({ port: 8000 });
