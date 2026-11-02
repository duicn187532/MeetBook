// 將 MongoDB 匯出的文件正規化成 D1 的資料列（純函式，方便單元測試）
// 原則：在 D1 上查詢的結果要和舊系統在 MongoDB 上一樣；做不到時標記出來列在報告中，由人決定怎麼處理。

export const KNOWN_ROOMS = ["A101", "A102", "A103"];

export interface BookingRow {
  id: string;
  group_id: string | null;
  created_time: number | null;
  updated_time: number | null;
  title: string;
  user_id: string | null;
  user_name: string | null;
  user_extension: string | null;
  user_department_code: string | null;
  user_department_label: string | null;
  user_group_code: string | null;
  user_group_label: string | null;
  user_raw: string | null;
  room: string;
  participants_num: number | null;
  cancelled: 0 | 1 | null;
  start_time: number;
  end_time: number;
  edit_password: string;
  updated_count: number;
  date: string;
  is_multi: string;
}

export interface UserRow {
  seq: number;
  id: string;
  name: string | null;
  extension: string;
  department_code: string;
  department_label: string;
  group_code: string;
  group_label: string;
  email: string | null;
  line_id: string | null;
  role_code: string;
  role_label: string;
  status: 0 | 1 | null;
  disabled: 0 | 1;
  created_time: number | null;
  updated_time: number | null;
}

// 欄位順序與 migrations/0001_init.sql 相同
export const BOOKING_COLUMNS: (keyof BookingRow)[] = [
  "id",
  "group_id",
  "created_time",
  "updated_time",
  "title",
  "user_id",
  "user_name",
  "user_extension",
  "user_department_code",
  "user_department_label",
  "user_group_code",
  "user_group_label",
  "user_raw",
  "room",
  "participants_num",
  "cancelled",
  "start_time",
  "end_time",
  "edit_password",
  "updated_count",
  "date",
  "is_multi",
];

export const USER_COLUMNS: (keyof UserRow)[] = [
  "seq",
  "id",
  "name",
  "extension",
  "department_code",
  "department_label",
  "group_code",
  "group_label",
  "email",
  "line_id",
  "role_code",
  "role_label",
  "status",
  "disabled",
  "created_time",
  "updated_time",
];

// 報告中各種舊格式／異常的說明；key 用於統計
export const BOOKING_FLAGS = {
  userString: "user 是字串（非常舊的資料）",
  userMissing: "沒有 user",
  userOther: "user 不是物件也不是字串（視為沒有 user）",
  userNameNull: "user.name 是 null",
  userFieldNotString: "user 內有欄位不是字串（已轉成字串）",
  startTimeString: "startTime 是字串",
  endTimeString: "endTime 是字串",
  timeNumber: "startTime／endTime 是數字（已視為 epoch 毫秒）",
  timeMixedTypes: "startTime 與 endTime 型別不同（舊系統的重疊查詢查不到這筆，新系統查得到）",
  timeStringNotCanonical: "時間字串不是標準 ISO 格式（時間點相同，但 API 回傳的字串格式會改變）",
  endNotAfterStart: "結束時間沒有晚於開始時間",
  cancelledMissing: "沒有 cancelled 欄位（舊系統不顯示、不算衝突；新系統維持相同行為）",
  cancelledOther: "cancelled 不是布林值（舊系統不顯示、不算衝突；新系統維持相同行為）",
  createdTimeMissing: "沒有 createdTime（預約送出時間）",
  participantsNotNumber: "participantsNum 不是數字",
  updatedCountNotNumber: "updatedCount 不是數字（存成 0）",
  titleNotString: "title 不是字串",
  editPasswordNotString: "editPassword 不是字串（已轉成字串）",
  dateNotString: "date 不是字串",
  isMultiNotArray: "isMulti 不是陣列（存成 []）",
  isMultiNonString: "isMulti 內有非字串的值（已略過）",
  groupIdNotString: "groupId 不是字串（已轉成字串）",
  legacyMulti: "多會議室預約但沒有 groupId（舊資料，以 createdTime 對應同組）",
  unknownRoom: "room 不在目前的會議室清單（A101／A102／A103）",
  unknownField: "有未知欄位（見下方欄位清單）",
} as const;

export const USER_FLAGS = {
  nameNull: "name 是 null",
  nameMissing: "沒有 name",
  nameNotString: "name 不是字串（已轉成字串）",
  idNumber: "行編是數字（舊系統用字串比對，查不到這位使用者；新系統查得到）",
  idNotSixDigits: "行編不是 6 位數字（舊系統用補零後的 6 碼比對，可能查不到）",
  idDuplicate: "行編重複（與前面的使用者相同；查找時以先匯入的為準，與舊系統相同）",
  extensionNumber: "分機是數字（舊系統用字串比對，查不到；新系統查得到）",
  extensionNotString: "分機不是字串或數字（存成空字串）",
  statusFalse: "status: false（停用）",
  statusMissing: "沒有 status（視為啟用）",
  statusOther: "status 不是布林值（視為啟用）",
  disabledTrue: "disabled: true（早期後台的停用標記）",
  disabledOther: "disabled 不是布林值（視為未停用）",
  orgNotObject: "department／group／role 不是 { code, label } 物件（存成空白）",
  unknownField: "有未知欄位（見下方欄位清單）",
} as const;

export type BookingFlag = keyof typeof BOOKING_FLAGS;
export type UserFlag = keyof typeof USER_FLAGS;

const BOOKING_FIELDS = new Set([
  "_id",
  "id",
  "groupId",
  "createdTime",
  "updatedTime",
  "title",
  "user",
  "room",
  "participantsNum",
  "cancelled",
  "startTime",
  "endTime",
  "editPassword",
  "updatedCount",
  "date",
  "isMulti",
]);

const USER_FIELDS = new Set([
  "_id",
  "id",
  "name",
  "extension",
  "department",
  "group",
  "email",
  "lineId",
  "role",
  "status",
  "disabled",
  "createdTime",
  "updatedTime",
]);

type Doc = Record<string, unknown>;

export type Normalized<R, F> =
  | { ok: true; row: R; flags: F[]; unknownFields: string[] }
  | { ok: false; reason: string; flags: F[]; unknownFields: string[] };

// ===== 時間 =====

interface ParsedTime {
  ms: number;
  kind: "date" | "string" | "number";
  canonical: boolean;
}

export function parseTime(value: unknown): ParsedTime | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? { ms, kind: "date", canonical: true } : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    return { ms, kind: "string", canonical: new Date(ms).toISOString() === value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ms: value, kind: "number", canonical: false };
  }
  return null;
}

function optionalTime(value: unknown): number | null {
  return value === undefined || value === null ? null : parseTime(value)?.ms ?? null;
}

// 物件內的字串欄位：沒有值時為空字串，數字等轉成字串
function str(value: unknown, onConvert: () => void): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  onConvert();
  return typeof value === "object" ? "" : String(value);
}

function labelCode(value: unknown, onBad: () => void): { code: string; label: string } {
  if (value === undefined || value === null) return { code: "", label: "" };
  if (typeof value !== "object" || Array.isArray(value)) {
    onBad();
    return { code: "", label: "" };
  }
  const v = value as Doc;
  return { code: str(v.code, onBad), label: str(v.label, onBad) };
}

function unknownFieldsOf(doc: Doc, known: Set<string>): string[] {
  return Object.keys(doc).filter((k) => !known.has(k));
}

/** 文件的識別字串：只用 _id（ObjectId）或預約 id，不含個資 */
export function docRef(doc: Doc): string {
  const raw = doc._id as { toHexString?: () => string } | string | undefined;
  if (raw && typeof raw === "object" && typeof raw.toHexString === "function") return `_id ${raw.toHexString()}`;
  if (typeof raw === "string") return `_id ${raw}`;
  return "_id（無）";
}

// ===== 預約 =====

export function normalizeBooking(doc: Doc): Normalized<BookingRow, BookingFlag> {
  const flags = new Set<BookingFlag>();
  const flag = (f: BookingFlag) => flags.add(f);
  const unknownFields = unknownFieldsOf(doc, BOOKING_FIELDS);
  if (unknownFields.length > 0) flag("unknownField");
  const fail = (reason: string) => ({ ok: false as const, reason, flags: [...flags], unknownFields });

  if (typeof doc.id !== "string" || doc.id === "") return fail("沒有 id");
  if (typeof doc.room !== "string" || doc.room === "") return fail("沒有 room");
  if (!KNOWN_ROOMS.includes(doc.room)) flag("unknownRoom");

  const start = parseTime(doc.startTime);
  const end = parseTime(doc.endTime);
  if (!start || !end) return fail("startTime／endTime 缺少或無法解析");
  if (start.kind === "string") flag("startTimeString");
  if (end.kind === "string") flag("endTimeString");
  if (start.kind === "number" || end.kind === "number") flag("timeNumber");
  if (start.kind !== end.kind) flag("timeMixedTypes");
  if ((start.kind === "string" && !start.canonical) || (end.kind === "string" && !end.canonical)) {
    flag("timeStringNotCanonical");
  }
  if (end.ms <= start.ms) flag("endNotAfterStart");

  // user
  let user: Pick<
    BookingRow,
    | "user_id"
    | "user_name"
    | "user_extension"
    | "user_department_code"
    | "user_department_label"
    | "user_group_code"
    | "user_group_label"
    | "user_raw"
  > = {
    user_id: null,
    user_name: null,
    user_extension: null,
    user_department_code: null,
    user_department_label: null,
    user_group_code: null,
    user_group_label: null,
    user_raw: null,
  };
  if (typeof doc.user === "string") {
    flag("userString");
    user.user_raw = doc.user;
  } else if (doc.user === undefined || doc.user === null) {
    flag("userMissing");
  } else if (typeof doc.user !== "object" || Array.isArray(doc.user)) {
    flag("userOther");
  } else {
    const u = doc.user as Doc;
    const bad = () => flag("userFieldNotString");
    if (u.name === null) flag("userNameNull");
    const dept = labelCode(u.department, bad);
    const group = labelCode(u.group, bad);
    user = {
      user_id: str(u.id, bad),
      user_name: str(u.name, bad),
      user_extension: str(u.extension, bad),
      user_department_code: dept.code,
      user_department_label: dept.label,
      user_group_code: group.code,
      user_group_label: group.label,
      user_raw: null,
    };
  }

  let cancelled: 0 | 1 | null;
  if (doc.cancelled === true) cancelled = 1;
  else if (doc.cancelled === false) cancelled = 0;
  else {
    cancelled = null;
    flag(doc.cancelled === undefined ? "cancelledMissing" : "cancelledOther");
  }

  const createdTime = optionalTime(doc.createdTime);
  if (createdTime === null) flag("createdTimeMissing");

  let participants: number | null = null;
  if (typeof doc.participantsNum === "number" && Number.isFinite(doc.participantsNum)) {
    participants = doc.participantsNum;
  } else flag("participantsNotNumber");

  let updatedCount = 0;
  if (typeof doc.updatedCount === "number" && Number.isFinite(doc.updatedCount)) {
    updatedCount = Math.trunc(doc.updatedCount);
  } else if (doc.updatedCount !== undefined) flag("updatedCountNotNumber");

  if (typeof doc.title !== "string") flag("titleNotString");
  const title = typeof doc.title === "string" ? doc.title : str(doc.title, () => {});

  let editPassword = "";
  if (typeof doc.editPassword === "string") editPassword = doc.editPassword;
  else if (doc.editPassword !== undefined && doc.editPassword !== null) {
    flag("editPasswordNotString");
    editPassword = String(doc.editPassword);
  }

  if (typeof doc.date !== "string") flag("dateNotString");

  let isMulti: string[] = [];
  if (Array.isArray(doc.isMulti)) {
    isMulti = doc.isMulti.filter((r): r is string => typeof r === "string");
    if (isMulti.length !== doc.isMulti.length) flag("isMultiNonString");
  } else flag("isMultiNotArray");

  let groupId: string | null = null;
  if (typeof doc.groupId === "string") groupId = doc.groupId;
  else if (doc.groupId !== undefined && doc.groupId !== null) {
    flag("groupIdNotString");
    groupId = String(doc.groupId);
  }
  if (groupId === null && isMulti.length > 0) flag("legacyMulti");

  return {
    ok: true,
    row: {
      id: doc.id,
      group_id: groupId,
      created_time: createdTime,
      updated_time: optionalTime(doc.updatedTime),
      title,
      ...user,
      room: doc.room,
      participants_num: participants,
      cancelled,
      start_time: start.ms,
      end_time: end.ms,
      edit_password: editPassword,
      updated_count: updatedCount,
      date: typeof doc.date === "string" ? doc.date : "",
      is_multi: JSON.stringify(isMulti),
    },
    flags: [...flags],
    unknownFields,
  };
}

// ===== 使用者 =====

export function normalizeUser(doc: Doc, seq: number): Normalized<UserRow, UserFlag> {
  const flags = new Set<UserFlag>();
  const flag = (f: UserFlag) => flags.add(f);
  const unknownFields = unknownFieldsOf(doc, USER_FIELDS);
  if (unknownFields.length > 0) flag("unknownField");

  let id: string;
  if (typeof doc.id === "string" && doc.id !== "") id = doc.id;
  else if (typeof doc.id === "number" && Number.isFinite(doc.id)) {
    flag("idNumber");
    id = String(doc.id);
  } else {
    return { ok: false, reason: "沒有行編（id）", flags: [...flags], unknownFields };
  }
  if (!/^\d{6}$/.test(id)) flag("idNotSixDigits");

  let name: string | null;
  if (typeof doc.name === "string") name = doc.name;
  else if (doc.name === null) {
    flag("nameNull");
    name = null;
  } else if (doc.name === undefined) {
    flag("nameMissing");
    name = null;
  } else {
    flag("nameNotString");
    name = String(doc.name);
  }

  let extension = "";
  if (typeof doc.extension === "string") extension = doc.extension;
  else if (typeof doc.extension === "number") {
    flag("extensionNumber");
    extension = String(doc.extension);
  } else if (doc.extension !== undefined && doc.extension !== null) flag("extensionNotString");

  const badOrg = () => flag("orgNotObject");
  const dept = labelCode(doc.department, badOrg);
  const group = labelCode(doc.group, badOrg);
  const role = labelCode(doc.role, badOrg);

  let status: 0 | 1 | null;
  if (doc.status === true) status = 1;
  else if (doc.status === false) {
    status = 0;
    flag("statusFalse");
  } else {
    status = null;
    flag(doc.status === undefined || doc.status === null ? "statusMissing" : "statusOther");
  }

  let disabled: 0 | 1 = 0;
  if (doc.disabled === true) {
    disabled = 1;
    flag("disabledTrue");
  } else if (doc.disabled !== undefined && doc.disabled !== false && doc.disabled !== null) flag("disabledOther");

  const optText = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? null : String(v));

  return {
    ok: true,
    row: {
      seq,
      id,
      name,
      extension,
      department_code: dept.code,
      department_label: dept.label,
      group_code: group.code,
      group_label: group.label,
      email: optText(doc.email),
      line_id: optText(doc.lineId),
      role_code: role.code,
      role_label: role.label,
      status,
      disabled,
      created_time: optionalTime(doc.createdTime),
      updated_time: optionalTime(doc.updatedTime),
    },
    flags: [...flags],
    unknownFields,
  };
}

// ===== 整體轉換 =====

export interface Problem {
  ref: string;
  reason: string;
}

export interface OverlapPair {
  room: string;
  a: string;
  b: string;
}

export interface TransformResult {
  bookings: BookingRow[];
  users: UserRow[];
  bookingTotal: number;
  userTotal: number;
  bookingFlags: Record<BookingFlag, number>;
  userFlags: Record<UserFlag, number>;
  bookingUnknownFields: Record<string, number>;
  userUnknownFields: Record<string, number>;
  bookingProblems: Problem[];
  userProblems: Problem[];
  overlaps: OverlapPair[];
  stats: {
    active: number;
    cancelled: number;
    cancelledUnknown: number;
    activeWeekend: number;
    maxDurationMinutes: number;
    earliestStart: number | null;
    latestEnd: number | null;
    duplicateUserIds: number;
    usersDisabled: number;
    usersStatusFalseAndDisabled: number;
  };
}

function zeroCounts<K extends string>(keys: Record<K, string>): Record<K, number> {
  return Object.fromEntries(Object.keys(keys).map((k) => [k, 0])) as Record<K, number>;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
function isTaipeiWeekend(ms: number): boolean {
  const day = new Date(ms + TAIPEI_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

/** 同一會議室中互相重疊的有效預約（cancelled = 0），回傳每一組重疊的兩筆 */
export function findOverlaps(rows: BookingRow[]): OverlapPair[] {
  const byRoom = new Map<string, BookingRow[]>();
  for (const r of rows) {
    if (r.cancelled !== 0 || r.end_time <= r.start_time) continue;
    const list = byRoom.get(r.room) ?? [];
    list.push(r);
    byRoom.set(r.room, list);
  }
  const pairs: OverlapPair[] = [];
  for (const [room, list] of byRoom) {
    list.sort((x, y) => x.start_time - y.start_time || x.end_time - y.end_time);
    // 依開始時間掃描，open 中只保留尚未結束的預約
    let open: BookingRow[] = [];
    for (const r of list) {
      open = open.filter((o) => o.end_time > r.start_time);
      for (const o of open) pairs.push({ room, a: o.id, b: r.id });
      open.push(r);
    }
  }
  return pairs;
}

export function transform(bookingDocs: Doc[], userDocs: Doc[]): TransformResult {
  const bookingFlags = zeroCounts(BOOKING_FLAGS);
  const userFlags = zeroCounts(USER_FLAGS);
  const bookingUnknownFields: Record<string, number> = {};
  const userUnknownFields: Record<string, number> = {};
  const bookingProblems: Problem[] = [];
  const userProblems: Problem[] = [];
  const bookings: BookingRow[] = [];
  const users: UserRow[] = [];

  const seenBookingIds = new Set<string>();
  for (const doc of bookingDocs) {
    const result = normalizeBooking(doc);
    for (const f of result.unknownFields) bookingUnknownFields[f] = (bookingUnknownFields[f] ?? 0) + 1;
    if (!result.ok) {
      for (const f of result.flags) bookingFlags[f]++;
      bookingProblems.push({ ref: docRef(doc), reason: result.reason });
      continue;
    }
    if (seenBookingIds.has(result.row.id)) {
      // 舊系統 findOne({ id }) 會取到第一筆，因此保留第一筆
      bookingProblems.push({ ref: `${docRef(doc)}（預約 id ${result.row.id}）`, reason: "預約 id 重複，保留第一筆" });
      continue;
    }
    seenBookingIds.add(result.row.id);
    for (const f of result.flags) bookingFlags[f]++;
    bookings.push(result.row);
  }

  const seenUserIds = new Set<string>();
  let duplicateUserIds = 0;
  for (const doc of userDocs) {
    const result = normalizeUser(doc, users.length + 1);
    for (const f of result.unknownFields) userUnknownFields[f] = (userUnknownFields[f] ?? 0) + 1;
    for (const f of result.flags) userFlags[f]++;
    if (!result.ok) {
      userProblems.push({ ref: docRef(doc), reason: result.reason });
      continue;
    }
    if (seenUserIds.has(result.row.id)) {
      userFlags.idDuplicate++;
      duplicateUserIds++;
    }
    seenUserIds.add(result.row.id);
    users.push(result.row);
  }

  let active = 0, cancelled = 0, cancelledUnknown = 0, activeWeekend = 0, maxDuration = 0;
  let earliest: number | null = null, latest: number | null = null;
  for (const r of bookings) {
    if (r.cancelled === 1) cancelled++;
    else if (r.cancelled === 0) {
      active++;
      if (isTaipeiWeekend(r.start_time)) activeWeekend++;
    } else cancelledUnknown++;
    maxDuration = Math.max(maxDuration, r.end_time - r.start_time);
    earliest = earliest === null ? r.start_time : Math.min(earliest, r.start_time);
    latest = latest === null ? r.end_time : Math.max(latest, r.end_time);
  }

  return {
    bookings,
    users,
    bookingTotal: bookingDocs.length,
    userTotal: userDocs.length,
    bookingFlags,
    userFlags,
    bookingUnknownFields,
    userUnknownFields,
    bookingProblems,
    userProblems,
    overlaps: findOverlaps(bookings),
    stats: {
      active,
      cancelled,
      cancelledUnknown,
      activeWeekend,
      maxDurationMinutes: Math.round(maxDuration / 60_000),
      earliestStart: earliest,
      latestEnd: latest,
      duplicateUserIds,
      usersDisabled: users.filter((u) => u.status === 0 || u.disabled === 1).length,
      usersStatusFalseAndDisabled: users.filter((u) => u.status === 0 && u.disabled === 1).length,
    },
  };
}
