import { type ClientSession, MongoClient, MongoServerError } from "mongodb";
import { DB_NAME, MONGODB_URI } from "./config.ts";
import { logEvent } from "./logger.ts";
import type { BookingDoc, RoomLockDoc, UserDoc } from "./types.ts";

// 不在啟動時等待連線：Deno Deploy 的 warm up 只等 HTTP server 起來，
// 連不到資料庫時應該讓服務先啟動，由 /healthz 與 log 回報問題，而不是卡住整個部署。
// driver 會在第一次操作時自動連線。
export const dbConfigured = MONGODB_URI !== "";
if (!dbConfigured) {
  logEvent("error", "MONGODB_URI is not set，API 將回傳 503");
}

const client = new MongoClient(dbConfigured ? MONGODB_URI : "mongodb://127.0.0.1:27017", {
  serverSelectionTimeoutMS: 10_000,
});

let connecting: Promise<unknown> | null = null;

// 第一次使用時連線；失敗會記錄真正的錯誤，並在下一次呼叫時重試
export function ensureConnected(): Promise<unknown> {
  if (!connecting) {
    connecting = client.connect().catch((error) => {
      connecting = null;
      logEvent("error", "MongoDB 連線失敗", { details: { error: (error as Error).message } });
      throw error;
    });
  }
  return connecting;
}

// 回傳資料庫狀態；詳細錯誤只寫入 log，不回給呼叫端
export async function pingDb(): Promise<"ok" | "not_configured" | "unreachable"> {
  if (!dbConfigured) return "not_configured";
  try {
    await ensureConnected();
    await client.db("admin").command({ ping: 1 });
    return "ok";
  } catch (error) {
    logEvent("error", "MongoDB ping 失敗", { details: { error: (error as Error).message } });
    return "unreachable";
  }
}

const db = client.db(DB_NAME);
export const bookings = db.collection<BookingDoc>("booked");
export const users = db.collection<UserDoc>("users");
// 每間會議室一筆，只用來在交易中序列化同一會議室的寫入
const roomLocks = db.collection<RoomLockDoc>("roomLocks");

// 建立查詢會用到的索引（已存在時 MongoDB 會直接略過）
export async function ensureIndexes(): Promise<void> {
  if (!dbConfigured) return;
  try {
    await ensureConnected();
    await Promise.all([
      bookings.createIndex({ room: 1, cancelled: 1, startTime: 1 }),
      bookings.createIndex({ id: 1 }, { unique: true }),
      bookings.createIndex({ groupId: 1 }, { sparse: true }),
      users.createIndex({ id: 1 }),
      users.createIndex({ extension: 1 }),
    ]);
  } catch (error) {
    const err = error as Error;
    logEvent("warning", "建立索引失敗", { details: { error: err.message } });
  }
}

async function ensureLockDoc(room: string): Promise<void> {
  try {
    await roomLocks.updateOne({ _id: room }, { $setOnInsert: { version: 0 } }, { upsert: true });
  } catch (error) {
    // 兩個請求同時建立同一筆鎖時，其中一個會撞到 duplicate key，可以忽略
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
  }
}

/**
 * 在交易中執行 fn，並先對所有相關會議室的鎖文件寫入一次。
 * 同時操作同一間會議室的交易會因為寫到同一筆鎖文件而發生 WriteConflict，
 * 由 withTransaction 自動重試，重試時就能讀到對方已寫入的預約。
 * fn 可能被執行多次，因此除了資料庫操作外不應有其他副作用。
 */
export async function withRoomLocks<T>(
  rooms: string[],
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const sortedRooms = [...new Set(rooms)].sort();
  await Promise.all(sortedRooms.map(ensureLockDoc));

  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      for (const room of sortedRooms) {
        await roomLocks.updateOne({ _id: room }, { $inc: { version: 1 } }, { session });
      }
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
