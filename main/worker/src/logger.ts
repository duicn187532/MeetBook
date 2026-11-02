// 結構化 log：輸出 JSON 到 console，Cloudflare Workers Logs 會自動收集（格式與 Deno 版相同）

export type LogLevel = "debug" | "info" | "warning" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

// 以 LOG_LEVEL 控制最低輸出等級，預設 info（不輸出 debug）；每個請求開始時由 index.ts 設定
let minLevel: LogLevel = "info";

export function setLogLevel(level: string | undefined): void {
  minLevel = level && level in LEVEL_ORDER ? (level as LogLevel) : "info";
}

// 這些欄位不論出現在哪一層都會被遮蔽，避免密碼進入 log
const SENSITIVE_KEYS = new Set(["editPassword", "password"]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEYS.has(key) ? "***" : redact(v)]),
    );
  }
  return value;
}

// 共用的 log 寫入函式（同步、不會丟出例外）
export function logEvent(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "BookingService",
    ...(context ? { context: redact(context) } : {}),
  });

  if (level === "error") console.error(line);
  else if (level === "warning") console.warn(line);
  else console.log(line);
}
