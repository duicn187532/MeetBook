// src/components/Calendar/MonthCalendar.tsx
import dayjs from "dayjs";
import { Meeting } from "../types/common";

interface MonthCalendarProps {
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  setCurrentDate: (date: dayjs.Dayjs) => void;
  setViewStartDate: (date: dayjs.Dayjs) => void;
  onChangeView: (view: "Day" | "Week" | "Month") => void;
}

const colors: { [key: string]: string } = {
    A101: "bg-[#60AAFF]",
    A102: "bg-[#FF3F3F]",
    A103: "bg-[#17C2B6]",
  };
  

const MonthCalendar = ({
  currentDate,
  meetings,
  setCurrentDate,
  setViewStartDate,
  onChangeView,
}: MonthCalendarProps) => {
  const months = [0, 1, 2].map((offset) => currentDate.add(offset, "month"));
  
  return (
    <div className="flex-1 min-h-screen">
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
            <div className="grid grid-cols-7 pb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentDate(dayjs(date));
                      setViewStartDate(dayjs(date));
                      onChangeView("Day");
                    }}
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
                            className={`w-1.5 h-1.5 rounded-full ${colors[meeting.room]}`}
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
    </div>
  );
};

export default MonthCalendar;
