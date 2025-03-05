import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { getAllBooked, addBooking } from "./controller.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

const app = new Application();
const router = new Router();

// ✅ 启用 CORS
app.use(oakCors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

// ✅ 记录 API 请求
router.get("/api/bookings", async (ctx) => {
  console.log("📥 收到 GET /api/bookings 请求");
  return await getAllBooked(ctx);
});

router.post("/api/bookings", async (ctx) => {
  console.log("📥 收到 POST /api/bookings 请求");
  return await addBooking(ctx);
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("✅ Server running on http://localhost:8000");
await app.listen({ port: 8000 });
