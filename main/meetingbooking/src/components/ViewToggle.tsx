// src/components/ViewToggle.tsx
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ViewMode } from "../types/common";

interface ViewToggleProps {
  selectedView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  currentDate: dayjs.Dayjs;
  viewStartDate: dayjs.Dayjs
  setCurrentDate: (date: dayjs.Dayjs) => void;
  setViewStartDate: (date: dayjs.Dayjs) => void;
  updateBookingDate: (date: dayjs.Dayjs) => void;
  selectedRoom: string;
}
type RoomKey = "A101" | "A102" | "A103";

const roomBackgroundColors: Record<RoomKey, any> = {
  A101: {bg:"bg-[#D1E7FF]", dates: "bg-[#60AAFF]"}, // 浅蓝色
  A102: {bg: "bg-[#FFE6E6]", dates: "bg-[#FF3F3F]"}, // 浅红色
  A103: {bg: "bg-[#D7F3F1]", dates: "bg-[#17C2B6]"}, // 浅绿色
};


const MonthViewHeader = ({
  currentDate,
  setCurrentDate,
}: {
  currentDate: dayjs.Dayjs;
  setCurrentDate: (date: dayjs.Dayjs) => void;
}) => (
  <div className="mt-2">
    <div className="flex justify-between items-center mb-2">
      <button
        onClick={() => setCurrentDate(currentDate.subtract(1, "month"))}
        className="p-1 rounded-full bg-white"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      <div className="text-base font-semibold">{currentDate.format("MMMM YYYY")}</div>
      <button
        onClick={() => setCurrentDate(currentDate.add(1, "month"))}
        className="p-1 rounded-full bg-white"
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  </div>
);

const ViewToggle = ({
  selectedView,
  onChangeView,
  currentDate,
  viewStartDate,
  setCurrentDate,
  setViewStartDate,
  updateBookingDate,
  selectedRoom
}: ViewToggleProps) => {
  const backgroundColor = roomBackgroundColors[selectedRoom as RoomKey]["bg"] || "bg-gray-100";
  const datesBackgroundColor = roomBackgroundColors[selectedRoom as RoomKey]["dates"] || "bg-gray-100";
  // 日視圖：t ~ t+5
  const displayedDates = [0, 1, 2, 3, 4, 5].map((offset) =>
    viewStartDate.add(offset, "day")
  );

  const handlePrevDays = () => {
    const newDate = viewStartDate.subtract(6, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.subtract(6, "day"))
    updateBookingDate(newDate);
  };

  const handleNextDays = () => {
    const newDate = viewStartDate.add(6, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.add(6, "day"))
    updateBookingDate(newDate);
  };

  // 週視圖
  const weekStart = currentDate.startOf("week");
  const displayedWeekDates = Array.from({ length: 6 }, (_, i) =>
    weekStart.add(i, "day")
  );

  return (
    <div className={`p-2 flex flex-col ${backgroundColor} items-center rounded-t-2xl`}>
      <div className="flex rounded-full bg-white w-fit p-0.5">
        {["Day", "Week", "Month"].map((view) => (
          <button
            key={view}
            onClick={() => onChangeView(view as ViewMode)}
            className={`px-3 py-0.5 rounded-full text-xs ${
              selectedView === view ? `${datesBackgroundColor} text-white` : "text-gray-700"
            }`}
          >
            {view}
          </button>
        ))}
      </div>
      {selectedView === "Day" && (
        <div className="flex w-full justify-between items-center mt-2">
          <button onClick={handlePrevDays} className="p-1 rounded-full bg-black">
            <ChevronLeft className=" text-white w-3 h-3" />
          </button>
          <div className="flex space-x-3">
            {displayedDates.map((date) => (
              <button
                key={date.format("YYYY-MM-DD")}
                onClick={() => {
                  setCurrentDate(date);
                  updateBookingDate(date);
                }}
                className={`text-xl text-center px-2 py-1 rounded ${
                  date.isSame(currentDate, "day")
                    ? "bg-white text-red-500 rounded-lg"
                    : "text-gray-700"
                }`}
              >
                <div className="text-2xl font-semibold">{date.format("D")}</div>
                <div className="text-xs">{date.format("ddd")}</div>
              </button>
            ))}
          </div>
          <button onClick={handleNextDays} className="p-1 rounded-full bg-black">
            <ChevronRight className="w-3 h-3 text-white" />
          </button>
        </div>
      )}
      {selectedView === "Week" && (
        <div className="flex w-full justify-between items-center mt-2">
          <button 
            onClick={() => setCurrentDate(currentDate.subtract(7, "day"))} 
            className="p-1 rounded-full bg-black"
          >
            <ChevronLeft className="text-white w-3 h-3" />
          </button>
          <div className="flex space-x-3 bg-white rounded-lg">
            {displayedWeekDates.map((date) => (
              <button
                key={date.format("YYYY-MM-DD")}
                onClick={() => {
                  setCurrentDate(date);
                  updateBookingDate(date);
                }}
                className={`text-center px-2 py-1 rounded ${
                  date.isSame(currentDate, "day")
                    ? "text-red-500 rounded-lg"
                    : "text-gray-700"
                }`}
              >
                <div className="text-xs font-semibold">{date.format("D")}</div>
                <div className="text-xs">{date.format("ddd")}</div>
              </button>
            ))}
          </div>
          <button 
            onClick={() => setCurrentDate(currentDate.add(7, "day"))} 
            className="p-1 rounded-full bg-black"
          >
            <ChevronRight className="w-3 h-3 text-white" />
          </button>
        </div>
      )}
      {selectedView === "Month" && (
        <MonthViewHeader currentDate={currentDate} setCurrentDate={setCurrentDate} />
      )}
    </div>
  );
};

export default ViewToggle;
