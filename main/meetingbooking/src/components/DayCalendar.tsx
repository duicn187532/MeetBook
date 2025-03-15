// src/components/Calendar/DayCalendar.tsx
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Meeting } from "../types/common";
import { ChevronRight } from "lucide-react";

dayjs.extend(utc);
dayjs.extend(timezone);

interface DayCalendarProps {
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  setSelectedMeeting: (meeting: Meeting | null) => void;
  setShowInfoModal: (show: boolean) => void;
}

const colors: { [key: string]: string } = {
  A101: "bg-blue-200",
  A102: "bg-red-200",
  A103: "bg-green-200",
};

const DayCalendar = ({
  currentDate,
  meetings,
  setSelectedMeeting,
  setShowInfoModal,
}: DayCalendarProps) => {
  const dayString = currentDate.format("YYYY-MM-DD");
  const TIMELINE_START = dayjs.tz(`${dayString} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const TIMELINE_END = dayjs.tz(`${dayString} 18:15`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const TIMELINE_DURATION_MIN = TIMELINE_END.diff(TIMELINE_START, "minute");

  const timeSlots = [
    "09:00", "10:00", "11:00", "12:00", "13:00",
    "14:00", "15:00", "16:00", "17:00", "18:00",
  ];

  // 計算第一個時段的 offset
  const firstSlotTime = dayjs.tz(`${dayString} ${timeSlots[0]}`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const topOffsetMinutes = firstSlotTime.diff(TIMELINE_START, "minute");
  const topOffsetPercent = (topOffsetMinutes / TIMELINE_DURATION_MIN) * 100;

  // 篩選當日會議
  const dayMeetings = meetings.filter(
    (meeting) => meeting.date === currentDate.format("YYYY-MM-DD")
  );

  return (
    <div className="my-2 relative flex-1 overflow-y-auto h-[calc(100vh-64px)]">
      {/* 頂部空白區塊 */}
      <div className="flex mx-2" style={{ height: `${topOffsetPercent}%` }}>
        <div className="w-12 py-1 px-1 text-xs"></div>
        <div className="flex-1 border-l"></div>
      </div>

      {/* 時間區段 */}
      {timeSlots.map((time) => {
        const isLastSlot = time === "18:00";
        const lastSlotHeight = (15 / TIMELINE_DURATION_MIN) * 100;
        const slotHeightPercent = isLastSlot
          ? lastSlotHeight
          : (100 - topOffsetPercent - lastSlotHeight) / (timeSlots.length - 1);
        return (
          <div key={time} className="flex border-gray-200 mx-2" style={{ height: `${slotHeightPercent}%` }}>
            <div className="w-12 relative py-1 px-1">
              <span className="absolute top-0 left-0 transform -translate-y-1/2 text-xs">
                {time}
              </span>
            </div>
            <div className="flex-1 border-l border-t border-gray-200"></div>
          </div>
        );
      })}

      {/* 依據會議資料渲染會議 */}
      {dayMeetings.map((meeting) => {
        const eventStart = dayjs.utc(meeting.startTime).tz("Asia/Taipei");
        const eventEnd = dayjs.utc(meeting.endTime).tz("Asia/Taipei");
        const startMinutes = eventStart.diff(TIMELINE_START, "minute");
        const durationMinutes = eventEnd.diff(eventStart, "minute");
        const topPercent = (startMinutes / TIMELINE_DURATION_MIN) * 100;
        const heightPercent = (durationMinutes / TIMELINE_DURATION_MIN) * 100;
  
        return (
          <div
            key={meeting.id}
            className={`${colors[meeting.room]} rounded absolute left-12 right-0 mx-4 shadow-sm flex justify-between items-center`}
            style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
            onClick={() => {
              setSelectedMeeting(meeting);
              setShowInfoModal(true);
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
    </div>
  );
};

export default DayCalendar;
