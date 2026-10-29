// hooks/useMeetingData.ts
import { useRef, useState } from "react";
import {
  BookingApiResponse,
  BookingPayload,
  BookingUpdatePayload,
  DateRange,
  Meeting,
} from "../types/common";
import { fetchEventsApi, submitBookingApi, cancelMeetingApi, editMeetingApi } from "../api/meetingApi";

export default function useMeetingData() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 快速切換會議室或月份時，只採用最後一次請求的結果
  const latestRequest = useRef(0);

  async function fetchEvents(room: string, range: DateRange) {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const events = await fetchEventsApi(room, range);
      if (requestId === latestRequest.current) setMeetings(events);
    } catch (err) {
      console.error("取得會議資料失敗:", err);
      if (requestId === latestRequest.current) {
        setError("取得會議資料失敗");
        setMeetings([]);
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  async function submitBooking(bookingData: BookingPayload): Promise<BookingApiResponse> {
    setLoading(true);
    try {
      const response = await submitBookingApi(bookingData);
      return response;
    } catch (err) {
      console.error("提交預約失敗:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }
  async function cancelMeeting(meetingId: string, editPassword: string): Promise<Response> {
    setLoading(true);
    try {
      const response = await cancelMeetingApi(meetingId, editPassword);
      return response;
    } catch (err) {
      console.error("取消會議失敗:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function editMeeting(meetingId: string, editPassword: string, editData: BookingUpdatePayload): Promise<Response> {
    setLoading(true);
    try {
      const response = await editMeetingApi(meetingId, editPassword, editData);
      return response;
    } catch (err) {
      console.error("修改會議失敗:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    meetings,
    loading,
    error,
    fetchEvents,
    submitBooking,
    cancelMeeting,
    editMeeting,
  };
}
