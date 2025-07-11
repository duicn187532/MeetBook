// src/components/Calendar/WeekCalendar.tsx
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Meeting } from "../types/common";

dayjs.extend(utc);
dayjs.extend(timezone);

interface WeekCalendarProps {
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  setCurrentDate: (date: dayjs.Dayjs) => void;
  setViewStartDate: (date: dayjs.Dayjs) => void;
  setSelectedMeeting: (meeting: Meeting | null) => void;
  setShowInfoModal: (show: boolean) => void;
}

// const groupColorMap: { [key: string]: string } = {
//   company: "#D97706", // amber-600
//   person: "#059669", // emerald-500
//   analysis: "#3B82F6", // blue-500
//   promotion: "#8B5CF6", // violet-500
//   management: "#EC4899", // pink-500
//   innvation: "#F43F5E", // rose-500
//   header: "#10B981", // green-500
// };


const colors: { [key: string]: string } = {
  A101: "bg-blue-200",
  A102: "bg-red-200",
  A103: "bg-green-200",
};

const WeekCalendar = ({
  currentDate,
  meetings,
  setSelectedMeeting,
  setShowInfoModal,
}: WeekCalendarProps) => {
  const weekStart = currentDate.startOf("week").add(1, "day"); // 週一
  const displayedWeekDates = Array.from({ length: 6 }, (_, i) => weekStart.add(i, "day"));
  const dayString = currentDate.format("YYYY-MM-DD");
  const TIMELINE_START = dayjs.tz(`${dayString} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const TIMELINE_END = dayjs.tz(`${dayString} 18:15`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const TIMELINE_DURATION_MIN = TIMELINE_END.diff(TIMELINE_START, "minute");

  const timeSlots = [
    "09:00", "10:00", "11:00", "12:00", "13:00",
    "14:00", "15:00", "16:00", "17:00", "18:00",
  ];

  const firstSlotTime = dayjs.tz(`${dayString} ${timeSlots[0]}`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
  const topOffsetMinutes = firstSlotTime.diff(TIMELINE_START, "minute");
  const topOffsetPercent = (topOffsetMinutes / TIMELINE_DURATION_MIN) * 100;

  const lastSlotHeight = (15 / TIMELINE_DURATION_MIN) * 100;
  const regularSlotHeight = (100 - topOffsetPercent - lastSlotHeight) / (timeSlots.length - 1);

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-64px)]">
      <div className="flex flex-1">
        {/* 時間軸 */}
        <div className="w-12 flex-shrink-0">
          <div style={{ height: `${topOffsetPercent}%` }}></div>
          {timeSlots.map((time) => {
            const isLastSlot = time === "18:00";
            const slotHeight = isLastSlot ? lastSlotHeight : regularSlotHeight;
            return (
              <div key={time} className="relative" style={{ height: `${slotHeight}%` }}>
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
              className={`flex-1 border-l relative ${date.isSame(currentDate, "day") ? "bg-gray-50" : ""
                }`}
            >
              <div className="border-b" style={{ height: `${topOffsetPercent}%` }}></div>
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
                .filter((meeting) => meeting.date === date.format("YYYY-MM-DD"))
                .map((meeting) => {
                  const eventStart = dayjs.utc(meeting.startTime).tz("Asia/Taipei");
                  const eventEnd = dayjs.utc(meeting.endTime).tz("Asia/Taipei");
                  const dayStart = dayjs.tz(`${date.format("YYYY-MM-DD")} 08:45`, "YYYY-MM-DD HH:mm", "Asia/Taipei");
                  const startMinutes = eventStart.diff(dayStart, "minute");
                  const durationMinutes = eventEnd.diff(eventStart, "minute");
                  const topPercent = (startMinutes / TIMELINE_DURATION_MIN) * 100;
                  const heightPercent = (durationMinutes / TIMELINE_DURATION_MIN) * 100;
                  return (
                    <div
                      key={meeting.id}
                      className={`
                      ${colors[meeting.room]}
                      rounded absolute left-1 right-1 shadow-md
                      transition-transform duration-75 ease-in
                      active:scale-95
                      cursor-pointer
                    `}
                      style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
                      onClick={() => {
                        setTimeout(() => {
                          setSelectedMeeting(meeting);
                          setShowInfoModal(true);
                        }, 400);
                      }}
                    >
                      <div className="p-1">
                        <div className="text-xs font-bold truncate">
                          {meeting.title}
                        </div>
                        <div
                          className={`text-xs text-[#444444] font-normal ${meeting.user.name ? "truncate" : ""
                            }`}
                        >
                          {meeting.user.name || meeting.user.id.slice(-4)}
                        </div>
                        {/* <div className="text-xs text-[#444444] font-normal">
                          #{meeting.user.extension}
                        </div> */}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekCalendar;
