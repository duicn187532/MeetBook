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
}

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
}: ViewToggleProps) => {
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
  const displayedWeekDates = Array.from({ length: 7 }, (_, i) =>
    weekStart.add(i, "day")
  );

  return (
    <div className="p-2 flex flex-col bg-[#FFE6E6] items-center rounded-t-2xl">
      <div className="flex rounded-full bg-white w-fit p-0.5">
        {["Day", "Week", "Month"].map((view) => (
          <button
            key={view}
            onClick={() => onChangeView(view as ViewMode)}
            className={`px-3 py-0.5 rounded-full text-xs ${
              selectedView === view ? "bg-red-500 text-white" : "text-gray-700"
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
        <div className="flex justify-between items-center mt-2">
          <button
            onClick={() => setCurrentDate(currentDate.subtract(7, "day"))}
            className="p-1 rounded-full bg-white"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <div className="text-base font-semibold">
            {displayedWeekDates[0].format("MMM D")} -{" "}
            {displayedWeekDates[6].format("MMM D")}
          </div>
          <button
            onClick={() => setCurrentDate(currentDate.add(7, "day"))}
            className="p-1 rounded-full bg-white"
          >
            <ChevronRight className="w-3 h-3" />
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
