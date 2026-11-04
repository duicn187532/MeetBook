// 加到行事曆：產生 .ics 行事曆檔（Outlook、Notes、Apple 都能讀）。
// 時間一律以 UTC（結尾 Z）表示，不需附時區定義，各家行事曆都會換成使用者自己的時區顯示。
// 前端 meetingbooking/src/utils/calendar.ts 有相同的邏輯，修改時請一併調整。

export interface CalendarEvent {
  uid: string;
  title: string;
  location: string;
  details: string;
  start: number; // epoch ms
  end: number;
}

export interface BookingForCalendar {
  rooms: string[]; // 會議室名稱，例如 Alpha
  title: string | null;
  start: number;
  end: number;
  booker?: string;
  website?: string;
}

// 未填會議名稱時，資料庫存的是「HH:mm ~ HH:mm」
const isPlaceholderTitle = (title: string | null) => !title?.trim() || /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title.trim());

/** 20261104T020000Z */
export const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function bookingEvent(b: BookingForCalendar): CalendarEvent {
  const rooms = b.rooms.join("、");
  const details = [
    `會議室：${rooms}`,
    ...(b.booker ? [`預約人：${b.booker}`] : []),
    ...(b.website ? [`修改或取消：${b.website}`] : []),
  ].join("\n");
  return {
    // 同一場會議（同時間、同會議室）不論從哪裡加入都是同一個 UID，重複匯入時行事曆會更新而不是多一筆
    uid: `${utcStamp(b.start)}-${[...b.rooms].sort().join("-")}@meetbook`,
    title: isPlaceholderTitle(b.title) ? `會議室預約（${rooms}）` : b.title!.trim(),
    location: `數金部 11F ${rooms} 會議室`,
    details,
    start: b.start,
    end: b.end,
  };
}

// RFC 5545 文字跳脫
const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// 每行最多 75 bytes，超過就換行並以一個空白開頭接續；不切斷中文字（UTF-8 多位元組）
const encoder = new TextEncoder();
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function icsFile(e: CalendarEvent, now = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MeetBook//Room Booking//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(e.details)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(e.title)}`,
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** meeting-20261104-1000.ics（台北時間） */
export function icsFileName(start: number): string {
  const t = new Date(start + 8 * 3600_000).toISOString();
  return `meeting-${t.slice(0, 10).replace(/-/g, "")}-${t.slice(11, 16).replace(":", "")}.ics`;
}
