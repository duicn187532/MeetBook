// api/meetingApi.ts
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Meeting } from "../types/common";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const API_URL = import.meta.env.VITE_API_URL;

export async function fetchEventsApi(room: string): Promise<Meeting[]> {
  const res = await fetch(API_URL + room);
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
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookingData),
  });
}

export async function cancelMeetingApi(meetingId: string, editPassword: string): Promise<Response> {
  const url = `${API_URL}${meetingId}/${editPassword}`;
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ cancelled: true }),
  });
}

export async function editMeetingApi(meetingId: string, editPassword: string, editData: any): Promise<Response> {
  const url = `${API_URL}${meetingId}/${editPassword}`;
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(editData),
  });
}
