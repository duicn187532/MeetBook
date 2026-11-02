// 驗證原子寫入的基礎機制：db.batch() 整批回復，以及 changes() 檢查
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { atomicWrites, isWriteConflict } from "../src/db.ts";

const insertIfFree = (id: string, start: number, end: number) =>
  env.DB.prepare(
    `INSERT INTO bookings (id, title, room, cancelled, start_time, end_time)
     SELECT ?1, 't', 'A101', 0, ?2, ?3
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE room = 'A101' AND cancelled = 0 AND start_time < ?3 AND end_time > ?2)`,
  ).bind(id, start, end);

const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings").first<{ n: number }>())!.n;

describe("atomicWrites", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM bookings");
  });

  it("全部寫入成功時提交", async () => {
    await atomicWrites(env.DB, [insertIfFree("a", 0, 10), insertIfFree("b", 10, 20)]);
    expect(await count()).toBe(2);
  });

  it("條件不成立（時段已被佔用）時丟出 write_conflict，且同一批先前的寫入全部回復", async () => {
    await atomicWrites(env.DB, [insertIfFree("a", 0, 10)]);
    let error: unknown;
    try {
      // b 可以寫入，但 c 與 a 重疊：整批（包括 b）都必須回復
      await atomicWrites(env.DB, [insertIfFree("b", 20, 30), insertIfFree("c", 5, 15)]);
    } catch (e) {
      error = e;
    }
    expect(isWriteConflict(error)).toBe(true);
    const ids = (await env.DB.prepare("SELECT id FROM bookings ORDER BY id").all<{ id: string }>()).results;
    expect(ids.map((r) => r.id)).toEqual(["a"]);
  });

  it("UPDATE 沒有改到任何列時也視為衝突", async () => {
    await atomicWrites(env.DB, [insertIfFree("a", 0, 10)]);
    const update = env.DB.prepare("UPDATE bookings SET title = 'x' WHERE id = 'missing'");
    await expect(atomicWrites(env.DB, [update])).rejects.toSatisfy(isWriteConflict);
  });

  it("其他錯誤不會被當成衝突", async () => {
    await expect(atomicWrites(env.DB, [env.DB.prepare("INSERT INTO no_such_table VALUES (1)")])).rejects.not
      .toSatisfy(isWriteConflict);
  });
});
