// src/components/CalendarContent.tsx
import { useState } from "react";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { Meeting, ViewMode } from "../types/common";
import MeetingInfoModal from "./MeetingInfoModal";
import EditMeetingModal from "./EditMeetingModal";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import ConfirmationModal from "./ConfirmationModal";


dayjs.extend(utc);
dayjs.extend(timezone);

interface CalendarContentProps {
  selectedView: ViewMode;
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  bookingForm: { selectedDate: string };
  onFetchEvents: (room: string) => void;
  setLoading: (any: any) => void;
  showPasswordErrorAlert: () => void;
  showDeleteAlert: () => void;
}

const CalendarContent = ({
  selectedView,
  currentDate,
  meetings,
  setLoading,
  // bookingForm,
  onFetchEvents,
  showPasswordErrorAlert,
  showDeleteAlert
}: CalendarContentProps) => {
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  // const [loading, setLoading] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMeetingInfo, setEditMeetingInfo] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => () => {});
  const [modalProps, setModalProps] = useState({
    title: "",
    message: "",
    confirmLabel: "確定",
    cancelLabel: "取消",
    confirmColor: "bg-red-500",
    iconColor: "bg-red-500",
  });

  const handleDeleteClick = () => {
    setModalProps({
      title: "確定刪除嗎？",
      message: "刪除後無法恢復。",
      confirmLabel: "確定",
      cancelLabel: "取消",
      confirmColor: "bg-red-500",
      iconColor: "bg-red-500",
    });
    setConfirmAction(() => handleCancel);
    setShowConfirmModal(true);
  };
  
  const handleEditClick = () => {
    setModalProps({
      title: "確定修改嗎？",
      message: "請確認修改內容。",
      confirmLabel: "確定",
      cancelLabel: "取消",
      confirmColor: "bg-[#3F3F3F]",
      iconColor: "bg-[#3F3F3F]",
    });
    setConfirmAction(() => () => handleEdit(editMeetingInfo, selectedMeeting!.id, editPassword));
    setShowConfirmModal(true);
  };
  

  const handleCancel = async () => {
    if (!selectedMeeting || !selectedMeeting.id) {
      console.error("沒有選擇會議或會議ID缺失");
      return;
    }

    const cancelled = { cancelled: true };
    setLoading(true);
    try {
      const url = `https://meetingbooking.deno.dev/api/bookings/${selectedMeeting.id}/${editPassword}`;
      console.log("發送取消請求到:", url);
      console.log("請求內容:", JSON.stringify(cancelled));

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cancelled),
      });

      if (!res.ok) {
        if (res.status === 403) {
          showPasswordErrorAlert()
        }
        throw new Error(`伺服器回應錯誤: ${res.status}`);
      }

      const result = await res.json();
      console.log("取消會議響應:", result);
      onFetchEvents(selectedMeeting.room);
      setSelectedMeeting(null);
      showDeleteAlert();
    } catch (error) {
      console.error("取消會議錯誤:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (info: any) => {
    setEditMeetingInfo(info);
    setShowInfoModal(false);
    setShowEditModal(true);
  };

  const handleEdit = async (e: any, id: string, pw: string) => {
    if (!id) {
      console.error("沒有選擇會議或會議ID缺失");
      return;
    }
    setLoading(true);
    try {
      const url = `https://meetingbooking.deno.dev/api/bookings/${id}/${pw}`;
      console.log("發送取消請求到:", url);
      console.log("請求內容:", JSON.stringify(e));

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(e),
      });

      if (!res.ok) {
        if (res.status === 403) {
          alert("編輯密碼不正確，請重新輸入！");
        }
        throw new Error(`伺服器回應錯誤: ${res.status}`);
      }

      const result = await res.json();
      console.log("修改會議響應:", result);
      onFetchEvents(selectedMeeting!.room);
      setSelectedMeeting(null);
      alert("修改預約成功 ✅");
    } catch (error) {
      console.error("修改會議錯誤:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseEditModal = async () => {
    setShowEditModal(false);
  };

  // 日視圖
  if (selectedView === "Day") {
    const dayString = currentDate.format("YYYY-MM-DD");
    const TIMELINE_START = dayjs.tz(`${dayString} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_END = dayjs.tz(`${dayString} 18:15`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_DURATION_MIN = TIMELINE_END.diff(TIMELINE_START, "minute");

    const timeSlots = [
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
    ];

    const firstSlotTime = dayjs.tz(`${dayString} ${timeSlots[0]}`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const topOffsetMinutes = firstSlotTime.diff(TIMELINE_START, "minute");
    const topOffsetPercent = (topOffsetMinutes / TIMELINE_DURATION_MIN) * 100;

    const dayMeetings = meetings.filter(
      (meeting) => meeting.date === currentDate.format("YYYY-MM-DD")
    );

    return (
      <div className="my-2 relative flex-1 overflow-y-auto h-[calc(100vh-64px)]">
        {/* 頂部空白區塊，對應 08:45~09:00 */}
        <div className="flex mx-2" style={{ height: `${topOffsetPercent}%` }}>
          <div className="w-12 py-1 px-1 text-xs"></div>
          <div className="flex-1 border-l"></div>
        </div>

        {/* 每個時間區段 */}
        {timeSlots.map((time) => {
          const isLastSlot = time === "18:00";
          const lastSlotHeight = (15 / TIMELINE_DURATION_MIN) * 100;
          const slotHeightPercent = isLastSlot
            ? lastSlotHeight
            : (100 - topOffsetPercent - lastSlotHeight) / (timeSlots.length - 1);
          return (
            <div
              key={time}
              className="flex border-gray-200 mx-2"
              style={{ height: `${slotHeightPercent}%` }}
            >
              <div className="w-12 relative py-1 px-1">
                <span className="absolute top-0 left-0 transform -translate-y-1/2 text-xs">
                  {time}
                </span>
              </div>
              <div className="flex-1 border-l border-t border-gray-200"></div>
            </div>
          );
        })}

        {/* 根據 dayMeetings 渲染每筆會議 */}
        {dayMeetings.map((meeting) => {
          const eventStart = dayjs.utc(meeting.originalStart).tz("Asia/Taipei");
          const eventEnd = dayjs.utc(meeting.originalEnd).tz("Asia/Taipei");
          const startMinutes = eventStart.diff(TIMELINE_START, "minute");
          const durationMinutes = eventEnd.diff(eventStart, "minute");
          const topPercent = (startMinutes / TIMELINE_DURATION_MIN) * 100;
          const heightPercent = (durationMinutes / TIMELINE_DURATION_MIN) * 100;

          return (
            <div
              onClick={() => {
                setSelectedMeeting(meeting);
                setShowInfoModal(true);
              }}
              key={meeting.id}
              className={`${meeting.color} rounded absolute left-12 right-0 mx-4 shadow-sm flex justify-between items-center`}
              style={{
                top: `${topPercent}%`,
                height: `${heightPercent}%`,
              }}
            >
              <div className="pl-2">
                <h3 className="text-xl font-medium">{meeting.title}</h3>
                <p className="text-xl text-gray-600">預約者：{meeting.user}</p>
              </div>
              <button className="bg-black rounded-full p-1 mr-2">
                <ChevronRight className="w-3 h-3 text-white" />
              </button>
            </div>
          );
        })}

        {showInfoModal && (
          <MeetingInfoModal
            show={showInfoModal}
            onClose={() => {
              setSelectedMeeting(null);
              setShowInfoModal(false);
            }}
            meetingInfo={selectedMeeting}
            onCancel={handleDeleteClick}
            onOpenEditModal={handleOpenEditModal}
            onEditPassword={setEditPassword}
          />
        )}
        {showEditModal && (
          <EditMeetingModal
            show={showEditModal}
            onClose={handleCloseEditModal}
            MeetingInfo={editMeetingInfo}
            EditPassword={editPassword}
            onSubmit={handleEditClick}
          />
        )}
        <ConfirmationModal
          show={showConfirmModal}
          title={modalProps.title}
          // message={modalProps.message}
          confirmLabel={modalProps.confirmLabel}
          cancelLabel={modalProps.cancelLabel}
          confirmColor={modalProps.confirmColor}
          iconColor={modalProps.iconColor}
          onConfirm={() => {
            confirmAction();
            setShowConfirmModal(false);
          }}
          onCancel={() => setShowConfirmModal(false)}
        />

        {/* {loading && <LoadingOverlay />} */}
      </div>
    );
  }

  // 週視圖
  if (selectedView === "Week") {
    const weekStart = currentDate.startOf("week").add(1,"day");
    const displayedWeekDates = Array.from({ length: 6 }, (_, i) =>
      weekStart.add(i, "day")
    );
    const dayString = currentDate.format("YYYY-MM-DD");
    const TIMELINE_START = dayjs.tz(`${dayString} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_END = dayjs.tz(`${dayString} 18:15`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_DURATION_MIN = TIMELINE_END.diff(TIMELINE_START, "minute");

    const timeSlots = [
      "09:00", "10:00", "11:00", "12:00", "13:00",
      "14:00", "15:00", "16:00", "17:00", "18:00"
    ];

    const firstSlotTime = dayjs.tz(`${dayString} ${timeSlots[0]}`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const topOffsetMinutes = firstSlotTime.diff(TIMELINE_START, "minute");
    const topOffsetPercent = (topOffsetMinutes / TIMELINE_DURATION_MIN) * 100;

    const lastSlotHeight = (15 / TIMELINE_DURATION_MIN) * 100;
    const regularSlotHeight = (100 - topOffsetPercent - lastSlotHeight) / (timeSlots.length - 1);

    return (
      <div className="flex flex-col flex-1 h-[calc(100vh-64px)]">
        {/* 日期表頭 */}
        {/* <div className="flex border-b">
          <div className="w-12 flex-shrink-0"></div>
          {displayedWeekDates.map((date) => (
            <div 
              key={date.format("YYYY-MM-DD")} 
              className={`flex-1 h-8 border-l text-center ${
                date.isSame(currentDate, "day") ? "text-red-500" : ""
              }`}
            >
              <div className="text-xs font-semibold">
                {date.format("ddd")}
              </div>
              <div className="text-xs">
                {date.format("D")}
              </div>
            </div>
          ))}
        </div> */}

        {/* 內容區域 */}
        <div className="flex flex-1 overflow-auto">
          {/* 時間軸 */}
          <div className="w-12 flex-shrink-0">
            <div style={{ height: `${topOffsetPercent}%` }}></div>
            {timeSlots.map((time) => {
              const isLastSlot = time === "18:00";
              const slotHeight = isLastSlot ? lastSlotHeight : regularSlotHeight;
              return (
                <div 
                  key={time} 
                  className="relative"
                  style={{ height: `${slotHeight}%` }}
                >
                  <span className="absolute top-0 left-0 text-xs transform -translate-y-1/2 px-1">
                    {time}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 日期與會議 */}
          <div className="flex flex-1 relative">
            {displayedWeekDates.map((date) => (
              <div 
                key={date.format("YYYY-MM-DD")} 
                className={`flex-1 border-l relative ${
                  date.isSame(currentDate, "day") ? "bg-gray-50" : ""
                }`}
              >
                <div style={{ height: `${topOffsetPercent}%` }}></div>
                {timeSlots.map((time) => {
                  const isLastSlot = time === "18:00";
                  const slotHeight = isLastSlot ? lastSlotHeight : regularSlotHeight;
                  return (
                    <div 
                      key={time} 
                      className="border-b border-gray-200"
                      style={{ height: `${slotHeight}%` }}
                    />
                  );
                })}

                {meetings
                  .filter(meeting => meeting.date === date.format("YYYY-MM-DD"))
                  .map((meeting) => {
                    const eventStart = dayjs.utc(meeting.originalStart).tz("Asia/Taipei");
                    const eventEnd = dayjs.utc(meeting.originalEnd).tz("Asia/Taipei");
                    const dayStart = dayjs.tz(`${date.format("YYYY-MM-DD")} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
                    
                    const startMinutes = eventStart.diff(dayStart, "minute");
                    const durationMinutes = eventEnd.diff(eventStart, "minute");
                    const topPercent = (startMinutes / TIMELINE_DURATION_MIN) * 100;
                    const heightPercent = (durationMinutes / TIMELINE_DURATION_MIN) * 100;

                    return (
                      <div
                        key={meeting.id}
                        className={`${meeting.color} rounded absolute left-1 right-1 shadow-sm`}
                        style={{
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                        }}
                        onClick={() => {
                          setSelectedMeeting(meeting);
                          setShowInfoModal(true);
                        }}
                      >
                        <div className="p-1">
                          <div className="text-xs font-medium truncate">
                            {meeting.title}
                          </div>
                          <div className="text-xs truncate">
                            {meeting.user}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        {showInfoModal && (
          <MeetingInfoModal
            show={showInfoModal}
            onClose={() => {
              setSelectedMeeting(null);
              setShowInfoModal(false);
            }}
            meetingInfo={selectedMeeting}
            onCancel={handleDeleteClick}
            onOpenEditModal={handleOpenEditModal}
            onEditPassword={setEditPassword}
          />
        )}
        {showEditModal && (
          <EditMeetingModal
            show={showEditModal}
            onClose={handleCloseEditModal}
            MeetingInfo={editMeetingInfo}
            EditPassword={editPassword}
            onSubmit={handleEditClick}
          />
        )}
        <ConfirmationModal
          show={showConfirmModal}
          title={modalProps.title}
          // message={modalProps.message}
          confirmLabel={modalProps.confirmLabel}
          cancelLabel={modalProps.cancelLabel}
          confirmColor={modalProps.confirmColor}
          iconColor={modalProps.iconColor}
          onConfirm={() => {
            confirmAction();
            setShowConfirmModal(false);
          }}
          onCancel={() => setShowConfirmModal(false)}
        />
      </div>
    );
  }

  // 月視圖
  if (selectedView === "Month") {
    const months = [0, 1, 2].map((offset) => currentDate.add(offset, "month"));

    return (
      <div className="flex-1 h-[calc(100vh-64px)] overflow-auto">
        <div className="flex flex-col p-6">
          {months.map((monthDate) => (
            <div key={monthDate.format("YYYY-MM")} className="mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">
                  {monthDate.format("MMMM")}
                </h2>
                <span className="text-2xl">
                  {monthDate.format("YYYY")}
                </span>
              </div>

              <div className="grid grid-cols-7 mb-2">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <div 
                    key={day} 
                    className={`text-center font-semibold text-sm ${
                      index === 0 || index === 6 ? "text-red-500" : "text-gray-500"
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 42 }, (_, i) => {
                  const date = monthDate.startOf("month").startOf("week").add(i, "day");
                  const isCurrentMonth = date.month() === monthDate.month();
                  const isWeekend = date.day() === 0 || date.day() === 6;
                  const dayMeetings = meetings.filter(
                    (meeting) => meeting.date === date.format("YYYY-MM-DD")
                  );

                  return (
                    <div
                      key={date.format("YYYY-MM-DD")}
                      className={`p-2 min-h-[80px] relative ${isCurrentMonth ? "" : "opacity-50"}`}
                    >
                      <div className="text-center">
                        <span
                          className={`text-sm ${
                            isWeekend
                              ? "text-red-500"
                              : isCurrentMonth
                              ? "text-gray-900"
                              : "text-gray-400"
                          }`}
                        >
                          {date.format("D")}
                        </span>
                      </div>

                      {dayMeetings.length > 0 && (
                        <div className="flex gap-1 mt-1 justify-center flex-wrap">
                          {dayMeetings.map((meeting) => (
                            <div
                              key={meeting.id}
                              className={`w-1.5 h-1.5 rounded-full ${
                                meeting.color || "bg-blue-400"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMeeting(meeting);
                                setShowInfoModal(true);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {showInfoModal && (
          <MeetingInfoModal
            show={showInfoModal}
            onClose={() => {
              setSelectedMeeting(null);
              setShowInfoModal(false);
            }}
            meetingInfo={selectedMeeting}
            onCancel={handleDeleteClick}
            onOpenEditModal={handleOpenEditModal}
            onEditPassword={setEditPassword}
          />
        )}
        {showEditModal && (
          <EditMeetingModal
            show={showEditModal}
            onClose={handleCloseEditModal}
            MeetingInfo={editMeetingInfo}
            EditPassword={editPassword}
            onSubmit={handleEditClick}
          />
        )}
        <ConfirmationModal
          show={showConfirmModal}
          title={modalProps.title}
          // message={modalProps.message}
          confirmLabel={modalProps.confirmLabel}
          cancelLabel={modalProps.cancelLabel}
          confirmColor={modalProps.confirmColor}
          iconColor={modalProps.iconColor}
          onConfirm={() => {
            confirmAction();
            setShowConfirmModal(false);
          }}
          onCancel={() => setShowConfirmModal(false)}
        />
      </div>
    );
  }

  return null;
};

export default CalendarContent;
