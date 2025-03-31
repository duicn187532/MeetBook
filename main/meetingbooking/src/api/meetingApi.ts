// api/meetingApi.ts
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Meeting } from "../types/common";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const PRIMARY_API = import.meta.env.VITE_API_URL;
const BACKUP_API = import.meta.env.VITE_BACKUP_API_URL; // 在 .env 加這個

export async function fetchWithFallback(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const fullPrimary = PRIMARY_API + endpoint;
  const fullBackup = BACKUP_API + endpoint;

  try {
    const res = await fetch(fullPrimary, options);
    if (!res.ok) throw new Error("Primary API failed");
    return res;
  } catch (err) {
    console.warn("[⚠️ Fallback] Primary failed, trying backup...", err);
    try {
      const res = await fetch(fullBackup, options);
      if (!res.ok) throw new Error("Backup API responded but not OK");
      return res;
    } catch (backupErr) {
      // 🚨 無論是網路錯誤、CORS 或 HTTP 錯誤都會觸發這裡
      alert("伺服器掛了！請通知祐晨 #51164");
      throw backupErr;
    }
  }
}


export async function fetchEventsApi(room: string): Promise<Meeting[]> {
  const res = await fetchWithFallback(room);
  const data = await res.json();
  // 轉換後端資料
  const events: Meeting[] = data.data.map((event: any) => {
    const meetingDate = dayjs.utc(event.startTime).tz("Asia/Taipei").format("YYYY-MM-DD");
    return {
      id: event.id,
      title: event.title || `${dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm")} ~ ${dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm")}`,
      user: event.user,
      room,
      participantsNum: event.participantsNum,
      startTime: event.startTime,
      endTime: event.endTime,
      TaipeiStartTime: dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm"),
      TaipeiEndTime: dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm"),
      date: meetingDate,
      updatedCount: event.updatedCount,
    };
  });
  return events;
}

export async function submitBookingApi(bookingData: any): Promise<Response> {
  return fetchWithFallback("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookingData),
  });
}

export async function cancelMeetingApi(meetingId: string, editPassword: string): Promise<Response> {
  const url = `${meetingId}/${editPassword}`;
  return fetchWithFallback(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ cancelled: true }),
  });
}

export async function editMeetingApi(meetingId: string, editPassword: string, editData: any): Promise<Response> {
  const url = `${meetingId}/${editPassword}`;
  return fetchWithFallback(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(editData),
  });
}
