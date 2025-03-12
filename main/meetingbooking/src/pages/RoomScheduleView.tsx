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
import AlertModal from "../components/AlertModal";


dayjs.extend(utc);
dayjs.extend(timezone);

const API_URL = "https://meetingbooking.deno.dev/api/bookings";

const RoomScheduleView = () => {
  const [selectedRoom, setSelectedRoom] = useState("A101");
  const [selectedView, setSelectedView] = useState<ViewMode>("Day");
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [viewStartDate, setViewStartDate] = useState(dayjs());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"success" | "error">("success");
  const showSuccessAlert = () => {
    setAlertType("success");
    setAlertTitle("預約成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };
  const showDeleteAlert = () => {
    setAlertType("success");
    setAlertTitle("刪除成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };
  
  const showPasswordErrorAlert = () => {
    setAlertType("error");
    setAlertTitle("密碼錯誤");
    setAlertMessage("請確認後重新輸入");
    setShowAlertModal(true);
  };

  const showUpdatedFailedAlert = () => {
    setAlertType("error");
    setAlertTitle("資料更新失敗");
    setAlertMessage("無更新資料或資料庫出錯");
    setShowAlertModal(true);
  }

  const showTimeConflictAlert = () => {
    setAlertType("error");
    setAlertTitle("預約時段重複");
    setAlertMessage("請嘗試其他時間或其他會議室");
    setShowAlertModal(true);
  }

  const showUpdatedSuccessAlert = () => {
    setAlertType("success");
    setAlertTitle("修改成功");
    setAlertMessage("");
    setShowAlertModal(true);
  }
  
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
          const startTime = event.startTime;
          const endTime = event.endTime;
          const meetingDate = dayjs.utc(event.startTime).tz("Asia/Taipei").format("YYYY-MM-DD");
          return {
            id: event.id,
            title: event.title || `${dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm")} ~ ${dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm")}`,
            user: event.user,
            room: room,
            startTime,
            endTime,
            TaipeiStartTime: dayjs.utc(event.startTime).tz("Asia/Taipei").format("HH:mm"),
            TaipeiEndTime: dayjs.utc(event.endTime).tz("Asia/Taipei").format("HH:mm"),
            date: meetingDate,
            color: getRoomColor(event.room),
            updatedCount: event.updatedCount,
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
  
  type RoomKey = "A101" | "A102" | "A103";

  const buttonBGColors: Record<RoomKey, string> = {
    A101: "bg-[#3C97FF]", // 浅蓝色
    A102: "bg-[#FF3F3F]", // 浅红色
    A103: "bg-[#17C2B6]", // 浅绿色
  };
  const buttonBGColor = buttonBGColors[selectedRoom as RoomKey]

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
      date: selectedDate,
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
      if (response.status === 400) {
        // alert("預訂失敗: " + result.error);
        showTimeConflictAlert();
      } else {
        showSuccessAlert();      
        setSelectedRoom(bookingData.room);
        fetchEvents(selectedRoom);
        setCurrentDate(dayjs(bookingData.date));
        setViewStartDate(dayjs(bookingData.date));
        setShowBookingModal(false);
      }
    } catch (error) {
      console.log("提交失敗，請稍後重試！");
    } finally{
      setLoading(false);
      setBookingForm(() => ({
        title: "",
        user: "",
        room: selectedRoom,
        selectedDate: currentDate.format("YYYY-MM-DD"),
        startTime: "",
        endTime: "",
        editPassword: "",
      }));
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <TitleDescription />
      <RoomSelector
        selectedRoom={selectedRoom}
        onSelectRoom={(room) => {
          setSelectedRoom(room);
        }}
      />
      <Equipment
        selectedRoom={selectedRoom} 
      />
      <ViewToggle
        selectedView={selectedView}
        onChangeView={setSelectedView}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        updateBookingDate={updateBookingDate}
        viewStartDate={viewStartDate}
        setViewStartDate={setViewStartDate}
        selectedRoom={selectedRoom}
      />
      <div className="flex-1 overflow-y-auto">
      <CalendarContent
        selectedView={selectedView}
        currentDate={currentDate}
        meetings={meetings}
        onFetchEvents={fetchEvents} // 傳入父元件的 fetchEvents
        setLoading={setLoading}
        showPasswordErrorAlert={showPasswordErrorAlert}
        showDeleteAlert={showDeleteAlert}
        showUpdatedFailedAlert={showUpdatedFailedAlert}
        showUpdatedSuccessAlert={showUpdatedSuccessAlert}
        showTimeConflictAlert={showTimeConflictAlert}
        />
      </div>
      <button
        onClick={() => setShowBookingModal(true)}
        className={`absolute bottom-4 right-4 w-10 h-10 ${buttonBGColor} text-white rounded-xl flex items-center justify-center shadow-lg`}
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
      {showAlertModal && (
        <AlertModal 
          type={alertType}
          title={alertTitle}
          message={alertMessage}
          onClose={() => setShowAlertModal(false)}
          />
      )}
    </div>
  );
};

export default RoomScheduleView;
