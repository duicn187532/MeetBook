// api/meetingApi.ts
import dayjs from "dayjs";
import { CONTACT } from "../config/contact";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  ApiBooking,
  BookingApiResponse,
  BookingPayload,
  BookingResponseBody,
  BookingUpdatePayload,
  DateRange,
  Meeting,
} from "../types/common";
import type { Notices } from "../config/notices";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const API_URL = import.meta.env.VITE_API_URL;

// 網路錯誤或 5xx 時提示使用者（notify 為 false 時由呼叫端自行提示）；4xx 交給呼叫端處理
async function apiFetch(endpoint: string, options?: RequestInit, notify = true): Promise<Response> {
  try {
    const res = await fetch(API_URL + endpoint, options);
    if (res.status >= 500) throw new Error(`API server error: ${res.status}`);
    return res;
  } catch (err) {
    if (notify) alert(`伺服器掛了！請通知${CONTACT}`);
    throw err;
  }
}

// 不指定會議室：取得區間內所有會議室的預約
export async function fetchEventsApi(range: DateRange): Promise<Meeting[]> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  // 失敗時由畫面以提示視窗告知
  const res = await apiFetch(`?${query}`, undefined, false);
  if (!res.ok) throw new Error(`API 回應錯誤: ${res.status}`);
  const data: { data: ApiBooking[] } = await res.json();
  // 轉換後端資料
  return data.data.map((event) => {
    const start = dayjs.utc(event.startTime).tz("Asia/Taipei");
    const end = dayjs.utc(event.endTime).tz("Asia/Taipei");
    return {
      ...event,
      title: event.title || `${start.format("HH:mm")} ~ ${end.format("HH:mm")}`,
      date: start.format("YYYY-MM-DD"),
      TaipeiStartTime: start.format("HH:mm"),
      TaipeiEndTime: end.format("HH:mm"),
    };
  });
}

// 公告與更新日誌（目前在公告期間內的項目）；與預約 API 同一台後端，網址為 /api/notices
// 讀取失敗時不打擾使用者，視為沒有公告
export async function fetchNoticesApi(): Promise<Notices> {
  const res = await fetch(new URL("../notices", new URL(API_URL, window.location.href)));
  if (!res.ok) throw new Error(`API 回應錯誤: ${res.status}`);
  const body = await res.json();
  return {
    changelog: Array.isArray(body?.changelog) ? body.changelog : [],
    announcements: Array.isArray(body?.announcements) ? body.announcements : [],
  };
}

// 行事曆相關網址（API_URL 為 <後端>/api/bookings/）
const backendUrl = (path: string) => new URL(`../../${path}`, new URL(API_URL, window.location.href));

// openExternalBrowser=1：在 LINE 內建瀏覽器中改用手機預設瀏覽器直接開啟（LINE 內建瀏覽器打不開 .ics，也沒有登入 Google）；其他瀏覽器會忽略
function withExternal(url: URL): string {
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

// 這筆預約的 .ics 行事曆檔（<後端>/cal/<id>.ics）
export const calendarFileUrl = (bookingId: string) => withExternal(backendUrl(`cal/${encodeURIComponent(bookingId)}.ics`));

// 轉到 Google 行事曆新增活動頁（<後端>/cal/<id>/google）
export const calendarGoogleUrl = (bookingId: string) => withExternal(backendUrl(`cal/${encodeURIComponent(bookingId)}/google`));

// 取得 Google 行事曆新增活動頁的網址（calendar.google.com）。直接連到這個網址，iPhone 才會開 Google 日曆 App
export async function fetchGoogleCalendarUrl(bookingId: string): Promise<string> {
  const url = backendUrl(`cal/${encodeURIComponent(bookingId)}/google`);
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google 行事曆網址讀取失敗: ${res.status}`);
  const body = await res.json();
  if (typeof body?.url !== "string" || !body.url.startsWith("https://calendar.google.com/")) throw new Error("Google 行事曆網址格式不正確");
  return body.url;
}

// 讀取 .ics 行事曆檔，給「分享 ics」使用；檔名依開始時間（台北時間）命名，例如 meeting-20261111-1400.ics
export async function fetchCalendarFile(bookingId: string): Promise<File> {
  const res = await fetch(backendUrl(`cal/${encodeURIComponent(bookingId)}.ics`));
  if (!res.ok) throw new Error(`行事曆檔讀取失敗: ${res.status}`);
  const text = await res.text();
  const m = /DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}Z/.exec(text);
  let name = "meeting.ics";
  if (m) {
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 8 * 3600_000).toISOString();
    name = `meeting-${t.slice(0, 10).replace(/-/g, "")}-${t.slice(11, 16).replace(":", "")}.ics`;
  }
  return new File([text], name, { type: "text/calendar" });
}

export async function submitBookingApi(bookingData: BookingPayload): Promise<BookingApiResponse> {
  try {
    const res = await apiFetch("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });

    const body: BookingResponseBody = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      body, // ⬅️ 這裡才會帶有 .error 屬性
    };
  } catch {
    return {
      ok: false,
      status: 500,
      body: { error: "網路或伺服器錯誤" },
    };
  }
}

export async function cancelMeetingApi(
  meetingId: string,
  editPassword: string,
): Promise<Response> {
  const url = `${encodeURIComponent(meetingId)}/${encodeURIComponent(editPassword)}`;
  return apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ cancelled: true }),
  });
}

export async function editMeetingApi(
  meetingId: string,
  editPassword: string,
  editData: BookingUpdatePayload,
): Promise<Response> {
  const url = `${encodeURIComponent(meetingId)}/${encodeURIComponent(editPassword)}`;
  return apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(editData),
  });
}

// 讀取修改／刪除回應的內容；格式不正確時回傳空物件
export async function readResponseBody(res: Response): Promise<BookingResponseBody> {
  try {
    const body = await res.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
