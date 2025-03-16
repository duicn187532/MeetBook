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
    <div className="flex justify-between items-center mt-5">
      <button
        onClick={() => setCurrentDate(currentDate.subtract(1, "month"))}
        className="p-1 rounded-full bg-black"
      >
        <ChevronLeft className="w-3 h-3 text-white" />
      </button>
      <div className="text-2xl font-semibold p-3">{currentDate.format("MMMM YYYY")}</div>
      <button
        onClick={() => setCurrentDate(currentDate.add(1, "month"))}
        className="p-1 rounded-full bg-black"
      >
        <ChevronRight className="w-3 h-3 text-white" />
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

  const handlePrevDaysOnDay = () => {
    const newDate = viewStartDate.subtract(7, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.subtract(7, "day"))
    updateBookingDate(newDate);
  };

  const handleNextDaysOnDay = () => {
    const newDate = viewStartDate.add(7, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.add(7, "day"))
    updateBookingDate(newDate);
  };

  const handlePrevDaysOnWeek = () => {
    const newDate = viewStartDate.subtract(7, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.subtract(7, "day"))
    updateBookingDate(newDate);
  };

  const handleNextDaysOnWeek = () => {
    const newDate = viewStartDate.add(7, "day");
    setViewStartDate(newDate);
    setCurrentDate(currentDate.add(7, "day"))
    updateBookingDate(newDate);
  };

  // 週視圖
  const weekStart = currentDate.startOf("week").add(1, "day"); // 從週一開始
  const displayedWeekDates = Array.from({ length: 6 }, (_, i) =>
    weekStart.add(i, "day")
  );

  return (
    <div className={`p-2 flex flex-col ${backgroundColor} items-center rounded-t-2xl h-[150px]`}>
      <div className="flex rounded-full bg-white w-fit p-0.5 shadow-lg">
        {["Day", "Week", "Month"].map((view) => (
          <button
            key={view}
            onClick={() => onChangeView(view as ViewMode)}
            className={`px-3 py-0.5 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedView === view 
                ? `${datesBackgroundColor} text-white shadow-inner transform scale-60` 
                : 'text-gray-700 hover:bg-gray-50 active:scale-95'
            }`}
          >
            {view}
          </button>
        ))}
      </div>
      

      {selectedView === "Day" && (
        <>
        <div className="pt-2 text-2xl font-normal ">{currentDate.format("MMMM YYYY")}</div>

        <div className="flex w-full justify-between items-center">
          <button onClick={handlePrevDaysOnDay} className="p-1 rounded-full bg-black">
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
                {date.isSame(dayjs(), "day") ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mx-auto mt-1"></div>
                  ):<div className="w-1.5 h-1.5 rounded-full mx-auto mt-1"></div>
                  }
              </button>
            ))}
          </div>
          <button onClick={handleNextDaysOnDay} className="p-1 rounded-full bg-black">
            <ChevronRight className="w-3 h-3 text-white" />
          </button>
        </div>
        </>
      )}
      {selectedView === "Week" && (
        <>
          {/* 添加今天的日期顯示 */}
            <div className="pt-2 text-2xl font-normal">{currentDate.format("MMMM YYYY")}</div>


          <div className="flex w-full justify-between items-center mb-2">
            <button 
              onClick={handlePrevDaysOnWeek} 
              className="p-1 rounded-full bg-black"
            >
              <ChevronLeft className="text-white w-3 h-3" />
            </button>
            <div className="flex justify-between items-center h-full space-x-3 bg-white w-full mx-4 rounded-lg">
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
                  <div className="text-2xl font-semibold">{date.format("D")}</div>
                  <div className="text-xs">{date.format("ddd")}</div>
                  {date.isSame(dayjs(), "day") ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mx-auto mt-1"></div>
                  ):<div className="w-1.5 h-1.5 rounded-full mx-auto mt-1"></div>
                  }
                </button>
              ))}
            </div>
            <button 
              onClick={handleNextDaysOnWeek} 
              className="p-1 rounded-full bg-black"
            >
              <ChevronRight className="w-3 h-3 text-white" />
            </button>
          </div>
        </>
      )}
      {selectedView === "Month" && (
        <MonthViewHeader currentDate={currentDate} setCurrentDate={setCurrentDate} />
      )}
    </div>
  );
};

export default ViewToggle;
