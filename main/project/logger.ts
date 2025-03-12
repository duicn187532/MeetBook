import { logger } from "./db.ts"; // 引入你的 MongoDB logger collection

// 定義可用的 log 等級
export type LogLevel = "debug" | "info" | "warning" | "error";

// 定義 log 的資料結構
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  service: string;
  requestId?: string;
  userId?: string;
  context?: Record<string, any>;
  errorStack?: string;
}

// 共用的 log 寫入函式
export async function logEvent(
  level: LogLevel,
  message: string,
  context?: Record<string, any>
): Promise<void> {
  const logEntry: LogEntry = {
    timestamp: new Date(),
    level,
    message,
    service: "BookingService",
    context,
  };

  try {
    await logger.insertOne(logEntry);
  } catch (error) {
    // log 寫入失敗不阻斷主要流程，只印出錯誤訊息
    console.error("Failed to write log:", error);
  }
}
