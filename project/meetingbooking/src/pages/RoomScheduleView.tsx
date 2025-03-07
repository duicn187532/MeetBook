// src/pages/RoomScheduleView.tsx
"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import TitleDescription from "../components/TitleDescription";
import RoomSelector from "../components/RoomSelector";
import Equipment from "../components/EquipmentDescription";
import ViewToggle from "../components/ViewToggle";
import CalendarContent from "../components/CalendarContent";
import BookingModal from "../components/BookingModal";
import LoadingOverlay from "../components/LoadingOverlay";


import { Meeting, ViewMode } from "../types/common";

dayjs.extend(utc);
dayjs.extend(timezone);

const API_URL = "https://meetingbooking.deno.dev/api/bookings";

const RoomScheduleView = () => {
  const [selectedRoom, setSelectedRoom] = useState("A101");
  const [selectedView, setSelectedView] = useState<ViewMode>("Day");
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [loading, setLoading] = useState(false); // 新增 loading state
  const [bookingForm, setBookingForm] = useState({
    title: "",
    user: "",
    room: selectedRoom,
    selectedDate: currentDate.format("YYYY-MM-DD"),
    startTime: "",
    endTime: "",
    editPassword: "",
  });
  useEffect(() => {
    setBookingForm((prev) => ({ ...prev, room: selectedRoom }));
  }, [selectedRoom]);

  const [errorMessage, setErrorMessage] = useState("");

  const getRoomColor = (room: string) => {
    const colors: { [key: string]: string } = {
      A101: "bg-blue-200",
      A102: "bg-red-200",
      A103: "bg-green-200",
    };
    return colors[room] || "bg-gray-200";
  };

  async function fetchEvents(room: string) {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      const events: Meeting[] = data.data
        .filter((event: any) => event.room === room)
        .map((event: any) => {
          const originalStart = event.startTime;
          const originalEnd = event.endTime;
          const meetingDate = dayjs.utc(event.startTime).tz("Asia/Taipei").format("YYYY-MM-DD");
          return {
            id: event.id,
            title: event.title || `${dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm")} ~ ${dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm")}`,
            organizer: event.user,
            room: room,
            startTime: dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm"),
            endTime: dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm"),
            date: meetingDate,
            originalStart,
            originalEnd,
            color: getRoomColor(event.room),
          };
        });

      setMeetings(events);
    } catch (err) {
      console.error("取得會議資料失敗:", err);
      setErrorMessage("取得會議資料失敗:");
      setMeetings([]);
    }finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents(selectedRoom);
  }, [selectedRoom]);

  const updateBookingDate = (date: dayjs.Dayjs) => {
    setBookingForm((prev) => ({
      ...prev,
      selectedDate: date.format("YYYY-MM-DD"),
    }));
  };

  async function submitBooking() {
    const {title, user, room, selectedDate, startTime, endTime, editPassword } = bookingForm;
    if (!selectedDate || !user || !room || !startTime || !endTime) {
      setErrorMessage("請填寫所有欄位！");
      return;
    }
    const start = new Date(`${selectedDate}T${startTime}:00`);
    const end = new Date(`${selectedDate}T${endTime}:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setErrorMessage("無效的時間格式，請重新選擇！");
      return;
    }
    if (start >= end) {
      setErrorMessage("結束時間必須晚於開始時間！");
      return;
    }
    setErrorMessage("");

    const bookingData = {
      title,
      user,
      room,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      editPassword
    };

    setLoading(true);
    
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });
      const result = await response.json();
      if (result.error) {
        alert("預訂失敗: " + result.error);
      } else {
        alert("預訂成功 ✅");
        fetchEvents(selectedRoom);
        setShowBookingModal(false);
      }
    } catch (error) {
      alert("提交失敗，請稍後重試！");
    } finally{
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white text-sm relative">
      <TitleDescription />
      <RoomSelector
        selectedRoom={selectedRoom}
        onSelectRoom={(room) => {
          setSelectedRoom(room);
        }}
      />
      <Equipment />
      <ViewToggle
        selectedView={selectedView}
        onChangeView={setSelectedView}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        updateBookingDate={updateBookingDate}
      />
      <CalendarContent
        selectedView={selectedView}
        currentDate={currentDate}
        meetings={meetings}
        bookingForm={bookingForm}
        onFetchEvents={fetchEvents} // 傳入父元件的 fetchEvents

      />
      <button
        onClick={() => setShowBookingModal(true)}
        className="absolute bottom-4 right-4 w-10 h-10 bg-red-500 text-white rounded-xl flex items-center justify-center shadow-lg"
      >
        <span className="text-xl">+</span>
      </button>
      {showBookingModal && (
        <BookingModal
          bookingForm={bookingForm}
          setBookingForm={setBookingForm}
          errorMessage={errorMessage}
          onSubmit={submitBooking}
          onClose={() => setShowBookingModal(false)}
        />
      )}
      {loading && <LoadingOverlay />}
    </div>
  );
};

export default RoomScheduleView;
