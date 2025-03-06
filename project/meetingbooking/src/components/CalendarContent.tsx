// src/components/CalendarContent.tsx
import { useState } from "react";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { Meeting, ViewMode } from "../types/common";
import MeetingInfoModal from "./MeetingInfoModal";

interface CalendarContentProps {
  selectedView: ViewMode;
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  bookingForm: { selectedDate: string };
}

const TIMELINE_START_HOUR = 9;
const TIMELINE_END_HOUR = 18;
const TIMELINE_DURATION_MIN =
  (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60; // 540 分鐘

const CalendarContent = ({
  selectedView,
  currentDate,
  meetings,
  bookingForm,
}: CalendarContentProps) => {
  // 狀態：用來存放被點擊的會議資料
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // 刪除與修改的回呼範例（你可以改成呼叫後端 API）
  const handleDelete = async () => {
    if (selectedMeeting) {
      console.log("刪除會議：", selectedMeeting.id);
      try{
      const res = await fetch(`https://meetingbooking.deno.dev/api/bookings/${selectedMeeting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("刪除失敗");
      }
      console.log("刪除會議：", selectedMeeting.id);
      setSelectedMeeting(null);
      } catch (error) {
        console.error("刪除會議錯誤：", error);
      }
    }
  };

  const handleUpdate = () => {
    if (selectedMeeting) {
      console.log("修改會議：", selectedMeeting.id);
      // 執行修改邏輯或呼叫後端 API ...
      setSelectedMeeting(null); // 關閉 Modal
    }
  };

  // 日視圖
  if (selectedView === "Day") {
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

    const dayMeetings = meetings.filter(
      (meeting) => meeting.date === currentDate.format("YYYY-MM-DD")
    );

    return (
      <div className="relative flex-1 overflow-hidden">
        {timeSlots.map((time) => (
          <div
            key={time}
            className="flex border-t border-gray-200"
            style={{ height: `${100 / (timeSlots.length - 1)}%` }}
          >
            <div className="w-12 py-1 px-1 text-xs text-gray-500">{time}</div>
            <div className="flex-1 border-l border-gray-200"></div>
          </div>
        ))}

        {/* 依據 dayMeetings 渲染每筆會議 */}
        {dayMeetings.map((meeting) => {
          const eventStart = dayjs.utc(meeting.originalStart).tz("Asia/Taipei");
          const eventEnd = dayjs.utc(meeting.originalEnd).tz("Asia/Taipei");
          const startMinutes =
            eventStart.hour() * 60 +
            eventStart.minute() -
            TIMELINE_START_HOUR * 60;
          const durationMinutes = eventEnd.diff(eventStart, "minute");
          const topPercent = (startMinutes / TIMELINE_DURATION_MIN) * 100;
          const heightPercent = (durationMinutes / TIMELINE_DURATION_MIN) * 100;

          return (
            <div
              key={meeting.id}
              className={`${meeting.color} absolute left-12 right-0 p-2 shadow-sm flex justify-between items-center`}
              style={{
                top: `${topPercent}%`,
                height: `${heightPercent}%`,
              }}
            >
              <div>
                <h3 className="text-xs font-medium">{meeting.title}</h3>
                <p className="text-xs text-gray-600">
                  預約者：{meeting.organizer}
                </p>
              </div>
              <button onClick={() => setSelectedMeeting(meeting)}>
                <ChevronRight className="w-4 h-4 text-white bg-black rounded-full" />
              </button>
            </div>
          );
        })}

        {/* Modal：顯示選取的會議資訊 */}
        <MeetingInfoModal
          show={!!selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          meetingInfo={selectedMeeting}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
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

        {/* 同樣放在最外層，方便在週視圖下也能顯示 Modal */}
        <MeetingInfoModal
          show={!!selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          meetingInfo={selectedMeeting}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
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

        <MeetingInfoModal
          show={!!selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          meetingInfo={selectedMeeting}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      </>
    );
  }

  // 預防 selectedView 沒有符合 Day/Week/Month
  return null;
};

export default CalendarContent;
