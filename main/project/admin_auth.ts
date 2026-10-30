// 管理後台登入：密碼比對、簽章 session、登入失敗次數限制（不依賴資料庫）
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
 * 所有來源合計 30 次失敗後整體暫停，避免換 IP 猜密碼
 */
export class LoginLimiter {
  private perSource = new Map<string, { fails: number; resetAt: number }>();
  private global = { fails: 0, resetAt: 0 };

  constructor(
    private readonly maxPerSource = 5,
    private readonly maxGlobal = 30,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  /** 回傳需要等待的秒數；0 代表可以嘗試 */
  retryAfter(source: string, now: number): number {
    if (this.global.resetAt <= now) this.global = { fails: 0, resetAt: 0 };
    const entry = this.perSource.get(source);
    if (entry && entry.resetAt <= now) this.perSource.delete(source);
    const waits: number[] = [];
    if (this.global.fails >= this.maxGlobal) waits.push(this.global.resetAt - now);
    const current = this.perSource.get(source);
    if (current && current.fails >= this.maxPerSource) waits.push(current.resetAt - now);
    return waits.length ? Math.ceil(Math.max(...waits) / 1000) : 0;
  }

  fail(source: string, now: number): void {
    const entry = this.perSource.get(source);
    if (!entry || entry.resetAt <= now) this.perSource.set(source, { fails: 1, resetAt: now + this.windowMs });
    else entry.fails++;
    if (this.global.resetAt <= now) this.global = { fails: 1, resetAt: now + this.windowMs };
    else this.global.fails++;
    // 避免記錄無限成長
    if (this.perSource.size > 1000) {
      for (const [k, v] of this.perSource) if (v.resetAt <= now) this.perSource.delete(k);
    }
  }

  succeed(source: string): void {
    this.perSource.delete(source);
  }
}
