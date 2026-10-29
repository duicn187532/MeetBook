import { assertEquals } from "@std/assert";
import { planTimeMigration } from "./migrate_string_times.ts";

Deno.test("planTimeMigration 只轉換字串時間", () => {
  const date = new Date("2026-10-29T01:00:00.000Z");
  const { updates, invalid } = planTimeMigration([
    { id: "both", startTime: "2026-10-29T01:00:00.000Z", endTime: "2026-10-29T02:00:00.000Z" },
    { id: "mixed", cancelled: true, startTime: "2026-10-29T03:00:00.000Z", endTime: date },
    { id: "dates", startTime: date, endTime: date },
  ]);
  assertEquals(invalid, []);
  assertEquals(updates, [
    {
      id: "both",
      cancelled: false,
      set: { startTime: new Date("2026-10-29T01:00:00.000Z"), endTime: new Date("2026-10-29T02:00:00.000Z") },
      original: { startTime: "2026-10-29T01:00:00.000Z", endTime: "2026-10-29T02:00:00.000Z" },
    },
    {
      id: "mixed",
      cancelled: true,
      set: { startTime: new Date("2026-10-29T03:00:00.000Z") },
      original: { startTime: "2026-10-29T03:00:00.000Z" },
    },
  ]);
});

Deno.test("planTimeMigration 接受時區偏移，無法解析的字串略過", () => {
  const { updates, invalid } = planTimeMigration([
    { id: "offset", startTime: "2026-10-29T09:00:00+08:00", endTime: "bad" },
    { id: "empty", startTime: "", endTime: "2026-13-40T99:00:00Z" },
  ]);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].set, { startTime: new Date("2026-10-29T01:00:00.000Z") });
  assertEquals(invalid.map((v) => `${v.id}.${v.field}`), ["offset.endTime", "empty.startTime", "empty.endTime"]);
});
