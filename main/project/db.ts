import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { MongoClient } from "npm:mongodb@5.6.0";

// 從環境變數中取得 MongoDB URI 與資料庫名稱
const MONGODB_URI = Deno.env.get("MONGODB_URI") || "";
const DB_NAME = Deno.env.get("DB_NAME") || "todo_db";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set");
  Deno.exit(1);
}

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB");
} catch (error) {
  console.error("Error connecting to MongoDB:", error);
  Deno.exit(1);
}

const db = client.db(DB_NAME);
export const todos = db.collection("booked");

// 使用 Logflare 作為 logger
const sourceToken = Deno.env.get("LOGFLARE_SOURCE_TOKEN") || "";
if (!sourceToken) {
  console.error("LOGFLARE_SOURCE_TOKEN is not set");
  Deno.exit(1);
}
const logflareUrl = `https://api.logflare.app/logs?source_token=${sourceToken}`;

/**
 * logger - 發送日誌到 Logflare
 * @param message - 日誌訊息
 * @param extraFields - 附加欄位 (可根據需求擴充)
 */
export async function logger(message: string, extraFields?: Record<string, unknown>) {
  const log = {
    message,
    timestamp: new Date().toISOString(),
    ...extraFields,
  };

  const response = await fetch(logflareUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Logflare 需要一個 logs 陣列包裹你的日誌訊息
    body: JSON.stringify({ logs: [log] }),
  });

  if (!response.ok) {
    console.error("Failed to send log:", await response.text());
  } else {
    console.log("Log sent successfully");
  }
}

// 將 db、todos 以及 logger 一併 export 出去
