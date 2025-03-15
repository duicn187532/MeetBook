import { MongoClient } from "npm:mongodb@5.6.0";

const env = Deno.env.get("ENV") || "development";

let MONGODB_URI = "";
let DB_NAME = "todo_db";

if (env === "production") {
  // 直接使用部署環境中的 Secrets
  MONGODB_URI = Deno.env.get("MONGODB_URI") || "";
  DB_NAME = Deno.env.get("DB_NAME") || "todo_db";
} else {
  // 本地開發時載入 .env 檔案
  const { load } = await import("https://deno.land/std@0.177.0/dotenv/mod.ts");
  const envVars = await load({ envPath: ".env.development" });
  MONGODB_URI = envVars.MONGODB_URI || "";
  DB_NAME = envVars.DB_NAME || "todo_db";
}

console.log("MONGODB_URI:", MONGODB_URI);
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB");
} catch (error) {
  console.error("Error connecting to MongoDB:", error);
  throw error;
}

const db = client.db(DB_NAME);
export const todos = db.collection("booked");
