// hooks/useMeetingData.ts
import { useState } from "react";
import { Meeting } from "../types/common";
import { fetchEventsApi, submitBookingApi, cancelMeetingApi, editMeetingApi } from "../api/meetingApi";

export default function useMeetingData() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchEvents(room: string) {
    setLoading(true);
    try {
      const events = await fetchEventsApi(room);
      setMeetings(events);
    } catch (err) {
      console.error("取得會議資料失敗:", err);
      setError("取得會議資料失敗");
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitBooking(bookingData: any): Promise<Response> {
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

  async function editMeeting(meetingId: string, editPassword: string, editData: any): Promise<Response> {
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
