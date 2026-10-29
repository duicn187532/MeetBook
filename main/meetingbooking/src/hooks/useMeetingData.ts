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
  // loading：新增／修改／刪除進行中（顯示全畫面讀取，避免重複送出）
  const [loading, setLoading] = useState(false);
  // fetching：取得預約資料中；loadedRange：目前 meetings 涵蓋的區間
  const [fetching, setFetching] = useState(false);
  const [loadedRange, setLoadedRange] = useState<DateRange | null>(null);
  // 載入失敗的次數；每次失敗遞增，畫面據此跳出提示
  const [loadFailures, setLoadFailures] = useState(0);
  // 快速切換月份時，只採用最後一次請求的結果
  const latestRequest = useRef(0);

  // 一次取得所有會議室的資料，切換會議室時不必重新讀取
  async function fetchEvents(range: DateRange) {
    const requestId = ++latestRequest.current;
    setFetching(true);
    try {
      const events = await fetchEventsApi(range);
      if (requestId === latestRequest.current) {
        setMeetings(events);
        setLoadedRange(range);
      }
    } catch (err) {
      console.error("取得會議資料失敗:", err);
      // 失敗時保留原本的資料，由畫面提示可能不完整
      if (requestId === latestRequest.current) setLoadFailures((n) => n + 1);
    } finally {
      if (requestId === latestRequest.current) setFetching(false);
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
    fetching,
    loadedRange,
    loadFailures,
    fetchEvents,
    submitBooking,
    cancelMeeting,
    editMeeting,
  };
}
