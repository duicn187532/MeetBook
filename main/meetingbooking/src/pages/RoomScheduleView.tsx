// views/RoomScheduleView.tsx
"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Components
import TitleDescription from "../components/TitleDescription";
import RoomSelector from "../components/RoomSelector";
import Equipment from "../components/EquipmentDescription";
import ViewToggle from "../components/ViewToggle";
import CalendarContent from "../components/CalendarContent";
import BookingModal from "../components/BookingModal";
import LoadingOverlay from "../components/LoadingOverlay";
import AlertModal from "../components/AlertModal";
import MeetingInfoModal from "../components/MeetingInfoModal";
import EditMeetingModal from "../components/EditMeetingModal";
import ConfirmationModal from "../components/ConfirmationModal";

// Types
import { Meeting, ViewMode, RoomKey } from "../types/common";

// 自訂 hook
import useMeetingData from "../hooks/useMeetingData";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const RoomScheduleView = () => {
  // UI 狀態管理
  const [selectedRoom, setSelectedRoom] = useState<RoomKey>("A101");
  const [selectedView, setSelectedView] = useState<ViewMode>("Week");
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [viewStartDate, setViewStartDate] = useState(dayjs());
  const [editPassword, setEditPassword] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [bookingForm, setBookingForm] = useState({
    title: "",
    user: "",
    room: selectedRoom,
    participantsNum: 0,
    selectedDate: currentDate.format("YYYY-MM-DD"),
    startTime: dayjs().format("HH:mm"),
    endTime: dayjs().add(1, "hour").format("HH:mm"),
    editPassword: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalProps, setModalProps] = useState({
    title: "",
    message: "",
    confirmLabel: "確定",
    cancelLabel: "取消",
    confirmColor: "bg-red-500",
    iconColor: "bg-red-500",
  });
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"success" | "error">("success");

  // 自訂 hook 提供的 API 與狀態
  const { meetings, loading, fetchEvents, submitBooking, cancelMeeting, editMeeting } = useMeetingData();

  // 按鈕背景色對應
  const buttonBGColors: Record<RoomKey, string> = {
    A101: "bg-[#3C97FF]",
    A102: "bg-[#FF3F3F]",
    A103: "bg-[#17C2B6]",
  };
  const buttonBGColor = buttonBGColors[selectedRoom];

  // 當選擇房間改變時，同步更新預約表單的房間
  useEffect(() => {
    setBookingForm((prev) => ({ ...prev, room: selectedRoom }));
  }, [selectedRoom]);

  // 初始與房間切換時取得會議資料
  useEffect(() => {
    fetchEvents(selectedRoom);
  }, [selectedRoom]);

  const updateBookingDate = (date: dayjs.Dayjs) => {
    setBookingForm((prev) => ({
      ...prev,
      selectedDate: date.format("YYYY-MM-DD"),
    }));
  };

  // Alert 函式
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
    setAlertTitle("儲存失敗");
    setAlertMessage("更新資料失敗,請再重新輸入");
    setShowAlertModal(true);
  };

  const showTimeConflictAlert = () => {
    setAlertType("error");
    setAlertTitle("時段重複");
    setAlertMessage("已經有人預約囉,請重新選擇時間");
    setShowAlertModal(true);
  };

  const showUpdatedSuccessAlert = () => {
    setAlertType("success");
    setAlertTitle("修改成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };

  // 提交預約
  async function handleSubmitBooking() {
    const { title, user, room, participantsNum, selectedDate, startTime, endTime, editPassword } = bookingForm;
    if (!selectedDate || !user || !room || !startTime || !endTime) {
      setErrorMessage("請填寫所有欄位！");
      return;
    }
    const start = dayjs.tz(`${selectedDate}T${startTime}:00`, "Asia/Taipei");
    const end = dayjs.tz(`${selectedDate}T${endTime}:00`, "Asia/Taipei");
    if (!start.isValid() || !end.isValid()) {
      setErrorMessage("無效的時間格式，請重新選擇！");
      return;
    }
    
    if (!start.isBefore(end)) {
      setErrorMessage("結束時間必須晚於開始時間！");
      return;
    }
      setErrorMessage("");

    const bookingData = {
      title,
      user,
      room,
      participantsNum,
      date: selectedDate,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      editPassword,
    };

    try {
      const response = await submitBooking(bookingData);
      if (response.status === 400) {
        showTimeConflictAlert();
      } else {
        showSuccessAlert();
        fetchEvents(bookingData.room);
        setCurrentDate(dayjs(bookingData.date));
        setViewStartDate(dayjs(bookingData.date));
        setSelectedRoom(bookingData.room)
        setShowBookingModal(false);
      }
    } catch (error) {
      console.error("提交失敗，請稍後重試！");
    } finally {
      // 重置預約表單
      setBookingForm({
        title: "",
        user: "",
        room: selectedRoom,
        participantsNum: 0,
        selectedDate: currentDate.format("YYYY-MM-DD"),
        startTime: dayjs().format("HH:mm"),
        endTime: dayjs().add(1, "hour").format("HH:mm"),
        editPassword: "",
      });
    }
  }

  // 取消會議
  async function handleCancel() {
    if (!selectedMeeting || !selectedMeeting.id) return;
    try {
      const res = await cancelMeeting(selectedMeeting.id, editPassword);
      if (!res.ok) {
        if (res.status === 403) {
          showPasswordErrorAlert();
          setEditPassword("");
        }
        throw new Error(`伺服器回應錯誤: ${res.status}`);
      }
      await res.json();
      fetchEvents(selectedMeeting.room);
      setSelectedMeeting(null);
      showDeleteAlert();
    } catch (error) {
      console.error("取消會議錯誤:", error);
    }
  }

  // 修改會議
  async function handleEdit(editData: any, meetingId: string, password: string) {
    if (!meetingId) return;
    try {
      const res = await editMeeting(meetingId, password, editData);
      if (!res.ok) {
        if (res.status === 403) {
          showPasswordErrorAlert();
          setEditPassword("");
        } else if (res.status === 404) {
          showUpdatedFailedAlert();
        } else if (res.status === 400) {
          showTimeConflictAlert();
        }
        throw new Error(`伺服器回應錯誤: ${res.status}`);
      }
      await res.json();
      fetchEvents(selectedMeeting!.room);
      setEditPassword("");
      setCurrentDate(dayjs(editData.date));
      setViewStartDate(dayjs(editData.date));
      setSelectedRoom(editData.room)
      showUpdatedSuccessAlert();
      setSelectedMeeting(null);
    } catch (error) {
      console.error("修改會議錯誤:", error);
    }
  }

  // 彈窗確認操作（例如刪除、修改前確認）
  const handleConfirmAction = (action: () => void, modalConfig: any) => {
    setModalProps(modalConfig);
    // 使用 confirmAction 來處理確認後動作
    setConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const [confirmAction, setConfirmAction] = useState<() => void>(() => () => {});


  // 以下為組合各個元件與 UI
  return (
    <div className="flex flex-col h-screen">
      <TitleDescription />
      <RoomSelector selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} />
      <Equipment selectedRoom={selectedRoom} />
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
          setSelectedMeeting={setSelectedMeeting}
          setShowInfoModal={setShowInfoModal}
          setCurrentDate={setCurrentDate}
          setViewStartDate={setViewStartDate}
          onChangeView={setSelectedView}
        />
      </div>
      <button
        onClick={() => setShowBookingModal(true)}
        className={`absolute bottom-4 right-4 w-10 h-10 ${buttonBGColor} text-white rounded-xl flex items-center justify-center shadow-lg`}
      >
        <span className="text-2xl">+</span>
      </button>
      {showBookingModal && (
        <BookingModal
          bookingForm={bookingForm}
          setBookingForm={setBookingForm}
          errorMessage={errorMessage}
          onSubmit={handleSubmitBooking}
          onClose={() => setShowBookingModal(false)}
        />
      )}
      {showInfoModal && (
        <MeetingInfoModal
          show={showInfoModal}
          onClose={() => {
            setSelectedMeeting(null);
            setShowInfoModal(false);
          }}
          meetingInfo={selectedMeeting}
          onCancel={() =>
            handleConfirmAction(handleCancel, {
              title: "確定刪除嗎？",
              message: "刪除後無法恢復。",
              confirmLabel: "確定",
              cancelLabel: "取消",
              confirmColor: "bg-red-500",
              iconColor: "bg-red-500",
            })
          }
          onOpenEditModal={(info) => {
            setSelectedMeeting(info);
            setShowInfoModal(false);
            setShowEditModal(true);
          }}
          onEditPassword={setEditPassword}
        />
      )}
      {showEditModal && (
        <EditMeetingModal
          show={showEditModal}
          onClose={() => setShowEditModal(false)}
          MeetingInfo={selectedMeeting}
          onSubmit={(editData: any, id: string, pw: string) =>
            handleConfirmAction(() => handleEdit(editData, id, pw), {
              title: "確定修改嗎？",
              message: "請確認修改內容。",
              confirmLabel: "確定",
              cancelLabel: "取消",
              confirmColor: "bg-[#3F3F3F]",
              iconColor: "bg-[#3F3F3F]",
            })
          }
        />
      )}
      <ConfirmationModal
        show={showConfirmModal}
        title={modalProps.title}
        confirmLabel={modalProps.confirmLabel}
        cancelLabel={modalProps.cancelLabel}
        confirmColor={modalProps.confirmColor}
        iconColor={modalProps.iconColor}
        onConfirm={() => {
          // 執行確認後動作
          confirmAction();
          setShowConfirmModal(false);
        }}
        onCancel={() => setShowConfirmModal(false)}
      />
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
