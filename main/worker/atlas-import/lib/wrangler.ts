// 呼叫 wrangler 並取得輸出；輸出只回傳給程式，不會印到 log（查詢結果可能含個資）
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function wrangler(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await run("npx", ["--no-install", "wrangler", ...args], {
      cwd,
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return stdout;
  } catch (error) {
    const e = error as { code?: number; stderr?: string; stdout?: string };
    // wrangler 的錯誤訊息不含查詢結果，可以印出；仍限制長度
    const detail = `${e.stderr ?? ""}\n${(e.stdout ?? "").slice(0, 2000)}`.trim().slice(0, 4000);
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} 失敗（exit ${e.code}）：\n${detail}`);
  }
}

/** --json 的輸出前面可能有警告文字，取出第一個 JSON 值 */
export function parseJsonOutput<T>(stdout: string): T {
  const start = stdout.search(/[[{]/);
  if (start < 0) throw new Error("wrangler 沒有輸出 JSON");
  return JSON.parse(stdout.slice(start)) as T;
}

export interface D1QueryResult<R> {
  results: R[];
  success: boolean;
}

export async function d1Query<R>(
  database: string,
  sql: string,
  target: string[],
  cwd: string,
): Promise<R[]> {
  const out = await wrangler(["d1", "execute", database, ...target, "--json", "--command", sql], cwd);
  const parsed = parseJsonOutput<D1QueryResult<R>[]>(out);
  if (!Array.isArray(parsed) || !parsed[0]?.success) throw new Error("D1 查詢失敗");
  return parsed[0].results;
}
