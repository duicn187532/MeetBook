// src/components/CalendarContent.tsx
import { useState } from "react";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { Meeting, ViewMode } from "../types/common";
import MeetingInfoModal from "./MeetingInfoModal"
import EditMeetingModal from "./EditMeetingModal";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import LoadingOverlay from "./LoadingOverlay";

dayjs.extend(utc);
dayjs.extend(timezone);

interface CalendarContentProps {
  selectedView: ViewMode;
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  bookingForm: { selectedDate: string };
  onFetchEvents: (room: string) => void;
}

const CalendarContent = ({
  selectedView,
  currentDate,
  meetings,
  bookingForm,
  onFetchEvents,
}: CalendarContentProps) => {
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMeetingInfo, setEditMeetingInfo] = useState<any>(null);
  const handleCancel = async () => {
    if (!selectedMeeting || !selectedMeeting.id) {
      console.error("沒有選擇會議或會議ID缺失");
      return;
    }
    
    const cancelled = { "cancelled": true };
    setLoading(true)
    try {
      const url = `https://meetingbooking.deno.dev/api/bookings/${selectedMeeting.id}/${editPassword}`;
      console.log("發送取消請求到:", url);
      console.log("請求內容:", JSON.stringify(cancelled));
      
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(cancelled),
      });
      
      if (!res.ok) {
        if (res.status === 403) {
          // 當返回 401 時，顯示編輯密碼錯誤的提示
          alert("編輯密碼不正確，請重新輸入！");
        }
        throw new Error(`伺服器回應錯誤: ${res.status}`);
      }
      
      const result = await res.json();
      console.log("取消會議響應:", result);
      onFetchEvents(selectedMeeting.room);
      setSelectedMeeting(null);
      alert("刪除預約成功 ✅");
    } catch (error) {
      console.error("取消會議錯誤:", error);
    } finally{
      setLoading(false)
    }
  };
  
  const handleOpenEditModal = (info: any) => {
    // 如果需要，可以在這裡把 bookingForm 的資料帶給 editMeetingInfo
    setEditMeetingInfo(info);
    setShowInfoModal(false);
    // 再打開 EditMeetingModal
    setShowEditModal(true);
  };

  // EditMeetingModal 裡按「更新」時
  const handleEdit = async (e: any, id: string, pw: string) => {
      console.log("送出修改資料：", e, id, pw);
      // ... 做更新的動作 ...
    if (!id) {
      console.error("沒有選擇會議或會議ID缺失");
      return;
    }
    setLoading(true)
    try {
      const url = `https://meetingbooking.deno.dev/api/bookings/${id}/${pw}`;
      console.log("發送取消請求到:", url);
      console.log("請求內容:", JSON.stringify(e));
      
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(e),
      });
      
      if (!res.ok) {
        if (res.status === 403) {
          // 當返回 401 時，顯示編輯密碼錯誤的提示
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
    } finally{
      setLoading(false)
    }

    };
  
    // EditMeetingModal 裡按「取消」時
    const handleCloseEditModal = async () => {
      setShowEditModal(false);
    };

  if (selectedView === "Day") {
    // 組合當天日期與時間字串
    const dayString = currentDate.format("YYYY-MM-DD");
    const TIMELINE_START = dayjs.tz(`${dayString} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_END = dayjs.tz(`${dayString} 18:15`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const TIMELINE_DURATION_MIN = TIMELINE_END.diff(TIMELINE_START, "minute"); // 570 分鐘
  
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
    
    // 依然組合完整日期時間字串
    const firstSlotTime = dayjs.tz(`${dayString} ${timeSlots[0]}`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
    const topOffsetMinutes = firstSlotTime.diff(TIMELINE_START, "minute"); // 例如 15 分鐘
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
          // 15 分鐘的高度百分比
          const lastSlotHeight = (15 / TIMELINE_DURATION_MIN) * 100;
          // 若不是 "18:00"，則平均分配剩下的高度（扣除頂部空白與最後 15 分鐘）
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
    
          // 計算從 TIMELINE_START 開始的分鐘數差距
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
            onCancel={handleCancel}
            onOpenEditModal={handleOpenEditModal}
            onEditPassword={setEditPassword}
          />
        )}
        {showEditModal && (
        <EditMeetingModal
          show={showEditModal}
          onClose={handleCloseEditModal}
          MeetingInfo={editMeetingInfo}
          // setEditMeetingInfo={setEditMeetingInfo}
          EditPassword={editPassword}
          onSubmit={handleEdit}
        />
      )}
      </div>
    );
  }
  
  // 週視圖
  if (selectedView === "Week") {
    const weekStart = currentDate.startOf("week");
    const displayedWeekDates = Array.from({ length: 7 }, (_, i) =>
      weekStart.add(i, "day")
    );
    return (
      <>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-2">
            {displayedWeekDates.map((date) => (
              <div key={date.format("YYYY-MM-DD")} className="border p-2">
                <div className="text-xs font-semibold text-center">
                  {date.format("ddd")}
                </div>
                <div className="text-sm text-center">{date.format("D")}</div>
                <div className="mt-1 space-y-1">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="bg-blue-100 text-xs rounded text-center p-1"
                    >
                      {meeting.title}
                    </div>
                  ))}
                </div>
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
          onCancel={handleCancel}
          onOpenEditModal={handleOpenEditModal}
          onEditPassword={setEditPassword}
        />
      )}
      {showEditModal && (
        <EditMeetingModal
          show={showEditModal}
          onClose={handleCloseEditModal}
          MeetingInfo={editMeetingInfo}
          // setEditMeetingInfo={setEditMeetingInfo}
          EditPassword={editPassword}
          onSubmit={handleEdit}
        />
      )}
      </>
    );
  }

  // 月視圖
  if (selectedView === "Month") {
    const monthStart = currentDate.startOf("month");
    const monthGridStart = monthStart.startOf("week");
    const daysInMonthView = Array.from({ length: 42 }, (_, i) =>
      monthGridStart.add(i, "day")
    );
    return (
      <>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center font-semibold text-xs">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysInMonthView.map((date) => (
              <div
                key={date.format("YYYY-MM-DD")}
                className={`border h-16 p-1 ${
                  date.month() !== currentDate.month() ? "bg-gray-100" : ""
                }`}
              >
                <div className="text-xs">{date.format("D")}</div>
                {meetings
                  .filter(() => 
                    date.format("YYYY-MM-DD") === bookingForm.selectedDate
                  )
                  .map((meeting) => (
                    <div
                      key={meeting.id}
                      className="bg-blue-100 text-xs rounded mt-1 text-center"
                    >
                      {meeting.title}
                    </div>
                  ))}
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
          onCancel={handleCancel}
          onOpenEditModal={handleOpenEditModal}
          onEditPassword={setEditPassword}
        />
      )}
      {showEditModal && (
        <EditMeetingModal
          show={showEditModal}
          onClose={handleCloseEditModal}
          MeetingInfo={editMeetingInfo}
          // setEditMeetingInfo={setEditMeetingInfo}
          EditPassword={editPassword}
          onSubmit={handleEdit}
        />
      )}
        {loading && <LoadingOverlay />}
      </>
    );
  }
  
  return null;
};

export default CalendarContent;
