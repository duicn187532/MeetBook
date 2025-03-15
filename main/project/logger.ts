// 使用 Logflare 作為 logger
const sourceToken = Deno.env.get("LOGFLARE_SOURCE_TOKEN") || "";
const api_key = Deno.env.get("LOGFLARE_API_KEY")
if (!sourceToken) {
  console.error("LOGFLARE_SOURCE_TOKEN is not set");
  Deno.exit(1);
}
if (!api_key) {
  console.error("LOGFLARE_API_KEY is not set")
}
const logflareUrl = `https://api.logflare.app/logs/json?api_key=${api_key}&source=${sourceToken}`;

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
    const response = await fetch(logflareUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: [logEntry] }),
    });

    if (!response.ok) {
      console.error("Failed to send log:", await response.text());
    } 
  }catch (error) {
    // log 寫入失敗不阻斷主要流程，只印出錯誤訊息
    console.error("Failed to write log:", error);
  }
}
