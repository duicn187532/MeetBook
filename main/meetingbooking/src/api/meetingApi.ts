// api/meetingApi.ts
import dayjs from "dayjs";
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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const API_URL = import.meta.env.VITE_API_URL;

// 網路錯誤或 5xx 時提示使用者；4xx 交給呼叫端處理
async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(API_URL + endpoint, options);
    if (res.status >= 500) throw new Error(`API server error: ${res.status}`);
    return res;
  } catch (err) {
    alert("伺服器掛了！請通知祐晨 #51164");
    throw err;
  }
}

export async function fetchEventsApi(room: string, range: DateRange): Promise<Meeting[]> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  const res = await apiFetch(`${room}?${query}`);
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
