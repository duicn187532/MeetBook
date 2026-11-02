// 每個測試檔開始前套用 D1 migrations（與正式環境相同的資料表）
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
