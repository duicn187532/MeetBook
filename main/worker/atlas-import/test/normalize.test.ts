import { describe, expect, it } from "vitest";
import { findOverlaps, normalizeBooking, normalizeUser, transform } from "../lib/normalize.ts";
import { FAKE_PASSWORD, legacyBookings, legacyUsers, modernBooking } from "./fixtures.ts";

const ms = (s: string) => new Date(s).getTime();

describe("normalizeBooking", () => {
  it("新版資料：欄位完整對應，時間轉成 epoch 毫秒", () => {
    const doc = modernBooking({ id: "b1", groupId: "g", isMulti: ["A102"] });
    const r = normalizeBooking(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toEqual({
      id: "b1",
      group_id: "g",
      created_time: ms("2026-12-01T08:00:00+08:00"),
      updated_time: null,
      title: "週會",
      user_id: "009876",
      user_name: "測試員甲",
      user_extension: "59999",
      user_department_code: "strategy",
      user_department_label: "數位策略部",
      user_group_code: "company",
      user_group_label: "法人產品",
      user_raw: null,
      room: "A101",
      participants_num: 4,
      cancelled: 0,
      start_time: ms("2026-12-01T10:00:00+08:00"),
      end_time: ms("2026-12-01T11:00:00+08:00"),
      edit_password: FAKE_PASSWORD,
      updated_count: 0,
      date: "2026-12-01",
      is_multi: '["A102"]',
    });
    expect(r.flags).toEqual([]);
  });

  it("user 是字串時存在 user_raw，其他 user 欄位為 NULL", () => {
    const r = normalizeBooking(modernBooking({ user: "王小明 51164" }));
    expect(r.ok && r.row.user_raw).toBe("王小明 51164");
    expect(r.ok && r.row.user_id).toBe(null);
    expect(r.flags).toContain("userString");
  });

  it("時間是字串：標準 ISO 不改變輸出格式，非標準格式另外標記", () => {
    const a = normalizeBooking(modernBooking({ startTime: "2026-12-01T02:00:00.000Z", endTime: "2026-12-01T03:00:00.000Z" }));
    expect(a.ok && a.row.start_time).toBe(ms("2026-12-01T02:00:00.000Z"));
    expect(a.flags).toEqual(expect.arrayContaining(["startTimeString", "endTimeString"]));
    expect(a.flags).not.toContain("timeStringNotCanonical");
    expect(a.flags).not.toContain("timeMixedTypes");

    const b = normalizeBooking(modernBooking({ startTime: "2026-12-01T02:00:00Z", endTime: new Date("2026-12-01T03:00:00Z") }));
    expect(b.flags).toEqual(expect.arrayContaining(["timeStringNotCanonical", "timeMixedTypes"]));
  });

  it("沒有 cancelled 時存 NULL（查詢 cancelled = 0 不會選到，與 MongoDB 相同）", () => {
    const doc = modernBooking();
    delete doc.cancelled;
    const r = normalizeBooking(doc);
    expect(r.ok && r.row.cancelled).toBe(null);
    expect(r.flags).toContain("cancelledMissing");
    expect(normalizeBooking(modernBooking({ cancelled: "false" })).flags).toContain("cancelledOther");
  });

  it("user.name 是 null、participantsNum 不是數字、isMulti 不是陣列", () => {
    const r = normalizeBooking(
      modernBooking({ user: { id: "1", name: null }, participantsNum: "3", isMulti: "A102" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.user_name).toBe("");
    expect(r.row.user_department_code).toBe("");
    expect(r.row.participants_num).toBe(null);
    expect(r.row.is_multi).toBe("[]");
    expect(r.flags).toEqual(expect.arrayContaining(["userNameNull", "participantsNotNumber", "isMultiNotArray"]));
  });

  it("無法轉換：時間無效、沒有 room、沒有 id", () => {
    expect(normalizeBooking(modernBooking({ startTime: "x" })).ok).toBe(false);
    expect(normalizeBooking(modernBooking({ room: "" })).ok).toBe(false);
    expect(normalizeBooking(modernBooking({ id: undefined })).ok).toBe(false);
  });

  it("沒有 groupId 的多會議室舊資料會被標記", () => {
    expect(normalizeBooking(modernBooking({ isMulti: ["A102"] })).flags).toContain("legacyMulti");
  });
});

describe("normalizeUser", () => {
  it("status／disabled 的各種組合", () => {
    const active = normalizeUser({ id: "000001", status: true }, 1);
    expect(active.ok && [active.row.status, active.row.disabled]).toEqual([1, 0]);
    const off = normalizeUser({ id: "000001", status: false }, 1);
    expect(off.ok && off.row.status).toBe(0);
    const legacy = normalizeUser({ id: "000001", disabled: true }, 1);
    expect(legacy.ok && [legacy.row.status, legacy.row.disabled]).toEqual([null, 1]);
    expect(legacy.flags).toEqual(expect.arrayContaining(["disabledTrue", "statusMissing"]));
  });

  it("name 是 null 時保持 NULL；行編、分機是數字時轉成字串並標記", () => {
    const r = normalizeUser({ id: 444, name: null, extension: 51164 }, 3);
    expect(r.ok && r.row).toMatchObject({ seq: 3, id: "444", name: null, extension: "51164" });
    expect(r.flags).toEqual(expect.arrayContaining(["nameNull", "idNumber", "extensionNumber", "idNotSixDigits"]));
  });

  it("department 不是物件時存空白", () => {
    const r = normalizeUser({ id: "000001", department: "數位策略部" }, 1);
    expect(r.ok && r.row.department_code).toBe("");
    expect(r.flags).toContain("orgNotObject");
  });
});

describe("transform", () => {
  it("統計各種舊格式、保留第一筆重複 id、列出無法轉換的資料", () => {
    const r = transform(legacyBookings(), legacyUsers());
    expect(r.bookingTotal).toBe(18);
    expect(r.bookings.length).toBe(15);
    expect(r.bookingProblems.map((p) => p.reason)).toEqual([
      "startTime／endTime 缺少或無法解析",
      "沒有 room",
      "預約 id 重複，保留第一筆",
    ]);
    expect(r.bookings.find((b) => b.id === "modern-1")?.title).toBe("週會");
    expect(r.bookingFlags.userString).toBe(1);
    expect(r.bookingFlags.startTimeString).toBe(2);
    expect(r.bookingFlags.endTimeString).toBe(3);
    expect(r.bookingFlags.timeMixedTypes).toBe(1);
    expect(r.bookingFlags.userNameNull).toBe(1);
    expect(r.bookingFlags.legacyMulti).toBe(2);
    expect(r.stats).toMatchObject({ cancelled: 1, cancelledUnknown: 1, activeWeekend: 1 });

    expect(r.userTotal).toBe(7);
    expect(r.users.length).toBe(6);
    expect(r.users.map((u) => u.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.userFlags.disabledTrue).toBe(1);
    expect(r.userFlags.nameNull).toBe(1);
    expect(r.userFlags.idDuplicate).toBe(1);
    expect(r.stats.usersDisabled).toBe(2);
    expect(r.overlaps).toEqual([{ room: "A101", a: "modern-1", b: "overlap-1" }]);
  });

  it("findOverlaps：緊接的時段不算重疊，已取消與 cancelled 為 NULL 的不算", () => {
    const base = transform(
      [
        modernBooking({ id: "a" }),
        modernBooking({ id: "b", startTime: new Date("2026-12-01T11:00:00+08:00"), endTime: new Date("2026-12-01T12:00:00+08:00") }),
        modernBooking({ id: "c", cancelled: true }),
        (() => {
          const d = modernBooking({ id: "d" });
          delete d.cancelled;
          return d;
        })(),
      ],
      [],
    );
    expect(findOverlaps(base.bookings)).toEqual([]);
  });
});
