// 測試用的假資料：涵蓋正式資料中出現過的各種舊格式（姓名、行編、分機都是虛構的）
export const FAKE_NAME = "測試員甲";
export const FAKE_USER_ID = "009876";
export const FAKE_EXTENSION = "59999";
export const FAKE_PASSWORD = "pw'1234";

const T = (hm: string, day = "2026-12-01") => new Date(`${day}T${hm}:00+08:00`);
const iso = (hm: string, day = "2026-12-01") => T(hm, day).toISOString();

export const modernUser = {
  id: FAKE_USER_ID,
  name: FAKE_NAME,
  extension: FAKE_EXTENSION,
  department: { code: "strategy", label: "數位策略部" },
  group: { code: "company", label: "法人產品" },
};

export function modernBooking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    createdTime: T("08:00"),
    title: "週會",
    user: modernUser,
    room: "A101",
    participantsNum: 4,
    cancelled: false,
    startTime: T("10:00"),
    endTime: T("11:00"),
    editPassword: FAKE_PASSWORD,
    updatedCount: 0,
    date: "2026-12-01",
    isMulti: [],
    ...over,
  };
}

export function legacyBookings(): Record<string, unknown>[] {
  const createdTime = T("07:00");
  return [
    modernBooking({ id: "modern-1" }),
    // 多會議室（新版，有 groupId）
    modernBooking({ id: "multi-1", groupId: "g-1", room: "A102", isMulti: ["A103"], startTime: T("13:00"), endTime: T("14:00") }),
    modernBooking({ id: "multi-2", groupId: "g-1", room: "A103", isMulti: ["A102"], startTime: T("13:00"), endTime: T("14:00") }),
    // 舊的多會議室：沒有 groupId，以 createdTime 對應
    modernBooking({ id: "legacy-multi-1", createdTime, room: "A101", isMulti: ["A102"], startTime: T("15:00"), endTime: T("16:00") }),
    modernBooking({ id: "legacy-multi-2", createdTime, room: "A102", isMulti: ["A101"], startTime: T("15:00"), endTime: T("16:00") }),
    // user 是字串（非常舊的資料）
    { ...modernBooking({ id: "user-string" }), user: `${FAKE_NAME} ${FAKE_EXTENSION}`, room: "A103", startTime: T("09:00"), endTime: T("09:30") },
    // 舊版 PATCH 存成 ISO 字串的時間
    modernBooking({ id: "string-times", room: "A102", startTime: iso("10:00"), endTime: iso("11:00"), updatedCount: 1 }),
    // 型別混用：一個 Date 一個字串
    modernBooking({ id: "mixed-times", room: "A103", startTime: T("11:00"), endTime: iso("12:00") }),
    // 非標準格式的時間字串
    modernBooking({ id: "noncanonical", room: "A101", startTime: "2026-12-02T02:00:00Z", endTime: "2026-12-02T03:00:00Z", date: "2026-12-02" }),
    // user.name 是 null
    modernBooking({ id: "name-null", user: { ...modernUser, name: null }, startTime: T("16:30"), endTime: T("17:00") }),
    // 沒有 cancelled、沒有 createdTime、participantsNum 不是數字、沒有 isMulti
    (() => {
      const d = modernBooking({ id: "sparse", participantsNum: "4" });
      delete d.cancelled;
      delete d.createdTime;
      delete d.isMulti;
      return d;
    })(),
    // 已取消
    modernBooking({ id: "cancelled-1", cancelled: true, updatedTime: T("09:00"), updatedCount: 1 }),
    // 與 modern-1 重疊的有效預約（正式資料曾發生的重複預約）
    modernBooking({ id: "overlap-1", startTime: T("10:30"), endTime: T("11:30") }),
    // 週末的預約
    modernBooking({ id: "weekend-1", startTime: T("10:00", "2026-12-05"), endTime: T("11:00", "2026-12-05"), date: "2026-12-05" }),
    // 單引號與換行（SQL 跳脫）
    modernBooking({ id: "quotes", title: "O'Neil 的\n會議 -- '; DROP TABLE bookings; --", room: "A103", startTime: T("17:00"), endTime: T("17:30") }),
    // 無法轉換：時間無效、沒有 room、重複 id
    modernBooking({ id: "bad-time", startTime: "not a date" }),
    (() => {
      const d = modernBooking({ id: "no-room" });
      delete d.room;
      return d;
    })(),
    modernBooking({ id: "modern-1", title: "重複 id" }),
  ];
}

export function legacyUsers(): Record<string, unknown>[] {
  return [
    { ...modernUser, email: null, lineId: null, role: { code: "user", label: "使用者" }, status: true, createdTime: T("08:00") },
    { id: "000111", name: null, extension: "51111", department: { code: "technology", label: "金融科技部" }, group: { code: "", label: "" }, status: false },
    { id: "000222", name: "舊停用", extension: "52222", disabled: true },
    { id: "000333", extension: 53333, status: null },
    { id: 444, name: "數字行編" },
    { id: "000222", name: "重複行編", extension: "52223" },
    { name: "沒有行編" },
  ];
}
