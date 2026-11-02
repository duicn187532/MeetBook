// 管理後台登入：密碼比對、簽章 session（由 Deno 版移植）、登入失敗次數限制（改存 D1）
const encoder = new TextEncoder();

export const SESSION_COOKIE = "mb_admin";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
// 密碼太短時不啟用後台，避免被暴力猜中
export const MIN_PASSWORD_LENGTH = 8;

export async function deriveKey(adminPassword: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(`meetbook-admin:v1:${adminPassword}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(key: CryptoKey, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 長度固定時逐位元比較，不因第一個不同的位置提早結束
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 比對輸入的密碼：兩邊都先做 HMAC，比較時間與內容無關 */
export async function passwordMatches(key: CryptoKey, input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(key, `pw:${input}`), hmac(key, `pw:${expected}`)]);
  return equalBytes(a, b);
}

/** session 內容只有到期時間；換管理密碼時 key 改變，所有舊 session 立即失效 */
export async function createSession(key: CryptoKey, now: number, ttlMs = SESSION_TTL_MS): Promise<string> {
  const exp = now + ttlMs;
  return `${exp}.${toBase64Url(await hmac(key, `session:${exp}`))}`;
}

export async function verifySession(key: CryptoKey, token: string | null | undefined, now: number): Promise<boolean> {
  if (!token) return false;
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1]);
  if (!(exp > now)) return false;
  const expected = toBase64Url(await hmac(key, `session:${exp}`));
  return equalBytes(encoder.encode(expected), encoder.encode(match[2]));
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

/**
 * 登入失敗次數限制：同一個來源 15 分鐘內最多 5 次失敗；
 * 所有來源合計 30 次失敗後整體暫停，避免換 IP 猜密碼。
 * Workers 沒有跨請求共享的記憶體，因此記錄存在 D1 的 admin_login_attempts（source = '*' 為所有來源合計）。
 */
export const GLOBAL_SOURCE = "*";

export class LoginLimiter {
  constructor(
    private readonly db: D1Database,
    private readonly maxPerSource = 5,
    private readonly maxGlobal = 30,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  /** 回傳需要等待的秒數；0 代表可以嘗試 */
  async retryAfter(source: string, now: number): Promise<number> {
    const { results } = await this.db
      .prepare("SELECT source, fails, reset_at FROM admin_login_attempts WHERE source IN (?1, ?2) AND reset_at > ?3")
      .bind(source, GLOBAL_SOURCE, now)
      .all<{ source: string; fails: number; reset_at: number }>();
    const waits: number[] = [];
    for (const r of results) {
      const max = r.source === GLOBAL_SOURCE ? this.maxGlobal : this.maxPerSource;
      if (r.fails >= max) waits.push(r.reset_at - now);
    }
    return waits.length ? Math.ceil(Math.max(...waits) / 1000) : 0;
  }

  async fail(source: string, now: number): Promise<void> {
    // 過期的紀錄重新計算；同時清掉其他已過期的紀錄，避免資料表無限成長
    const upsert = this.db.prepare(
      `INSERT INTO admin_login_attempts (source, fails, reset_at) VALUES (?1, 1, ?2 + ?3)
       ON CONFLICT (source) DO UPDATE SET
         fails = CASE WHEN reset_at <= ?2 THEN 1 ELSE fails + 1 END,
         reset_at = CASE WHEN reset_at <= ?2 THEN ?2 + ?3 ELSE reset_at END`,
    );
    await this.db.batch([
      upsert.bind(source, now, this.windowMs),
      upsert.bind(GLOBAL_SOURCE, now, this.windowMs),
      this.db.prepare("DELETE FROM admin_login_attempts WHERE reset_at <= ?1").bind(now),
    ]);
  }

  async succeed(source: string): Promise<void> {
    await this.db.prepare("DELETE FROM admin_login_attempts WHERE source = ?1").bind(source).run();
  }
}
