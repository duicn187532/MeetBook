// src/components/ViewToggle.tsx
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ViewMode } from "../types/common";
import { addWorkdays, weekWorkdays, workdaysFrom, WORKDAYS_PER_WEEK } from "../utils/workdays";

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

const roomBackgroundColors: Record<RoomKey, { bg: string; dates: string }> = {
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
        aria-label="上個月"
        className="p-1 rounded-full bg-black relative shrink-0 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
      >
        <ChevronLeft className="w-3 h-3 text-white" />
      </button>
      <div className="text-2xl font-semibold p-3">{currentDate.format("MMMM YYYY")}</div>
      <button
        onClick={() => setCurrentDate(currentDate.add(1, "month"))}
        aria-label="下個月"
        className="p-1 rounded-full bg-black relative shrink-0 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
      >
        <ChevronRight className="w-3 h-3 text-white" />
      </button>
    </div>
  </div>
);

// 圓形黑底箭頭（日／週切換用）
const RoundArrow = ({ dir, label, onClick, className = "" }: { dir: "prev" | "next"; label: string; onClick: () => void; className?: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={`p-1 rounded-full bg-black relative shrink-0 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] ${className}`}
  >
    {dir === "prev" ? <ChevronLeft className="text-white w-3 h-3" /> : <ChevronRight className="text-white w-3 h-3" />}
  </button>
);

// 月份標題；平板、電腦（md 以上）把左右箭頭放在標題兩側，
// 讓下面的日期列可以和行事曆的欄位對齊
const TitleWithArrows = ({ title, onPrev, onNext, prevLabel, nextLabel }: { title: string; onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string }) => (
  <div className="pt-2 flex items-center gap-4">
    <RoundArrow dir="prev" label={prevLabel} onClick={onPrev} className="hidden md:inline-flex" />
    <div className="text-2xl font-normal">{title}</div>
    <RoundArrow dir="next" label={nextLabel} onClick={onNext} className="hidden md:inline-flex" />
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
  // 日視圖：從 viewStartDate 起連續 5 個工作日（跳過週六、週日）
  const displayedDates = workdaysFrom(viewStartDate, WORKDAYS_PER_WEEK);

  const handlePrevDaysOnDay = () => {
    const newDate = addWorkdays(viewStartDate, -WORKDAYS_PER_WEEK);
    setViewStartDate(newDate);
    setCurrentDate(addWorkdays(currentDate, -WORKDAYS_PER_WEEK));
    updateBookingDate(newDate);
  };

  const handleNextDaysOnDay = () => {
    const newDate = addWorkdays(viewStartDate, WORKDAYS_PER_WEEK);
    setViewStartDate(newDate);
    setCurrentDate(addWorkdays(currentDate, WORKDAYS_PER_WEEK));
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

  // 週視圖：週一到週五
  const displayedWeekDates = weekWorkdays(currentDate);

  return (
    <div className={`p-2 flex flex-col ${backgroundColor} items-center rounded-t-2xl h-[150px]`}>
      <div className="flex rounded-full bg-white w-fit p-0.5 shadow-lg">
        {["Day", "Week", "Month"].map((view) => (
          <button
            key={view}
            onClick={() => onChangeView(view as ViewMode)}
            className={`relative before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] px-3 py-0.5 rounded-full text-sm font-medium transition-all duration-200 ${
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
        <TitleWithArrows
          title={currentDate.format("MMMM YYYY")}
          onPrev={handlePrevDaysOnDay}
          onNext={handleNextDaysOnDay}
          prevLabel="前幾天"
          nextLabel="後幾天"
        />

        <div className="flex w-full justify-between items-center">
          <RoundArrow dir="prev" label="前幾天" onClick={handlePrevDaysOnDay} className="md:hidden" />
          <div className="flex w-full min-w-0 mx-2 min-[360px]:mx-3 md:ml-10 md:-mr-2 justify-between">
            {displayedDates.map((date) => (
              <button
                key={date.format("YYYY-MM-DD")}
                onClick={() => {
                  setCurrentDate(date);
                  updateBookingDate(date);
                }}
                className={`text-xl text-center px-1 min-[360px]:px-2 py-1 rounded md:flex-1 ${
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
          <RoundArrow dir="next" label="後幾天" onClick={handleNextDaysOnDay} className="md:hidden" />
        </div>
        </>
      )}
      {selectedView === "Week" && (
        <>
          {/* 添加今天的日期顯示 */}
          <TitleWithArrows
            title={currentDate.format("MMMM YYYY")}
            onPrev={handlePrevDaysOnWeek}
            onNext={handleNextDaysOnWeek}
            prevLabel="上一週"
            nextLabel="下一週"
          />

          {/* md 以上：日期列左邊讓出時間欄（48px）、右邊貼齊，五天剛好對齊下方五欄 */}
          <div className="flex w-full justify-between items-center mb-2">
            <RoundArrow dir="prev" label="上一週" onClick={handlePrevDaysOnWeek} className="md:hidden" />
            <div className="flex justify-between items-center h-full bg-white w-full min-w-0 mx-2 min-[360px]:mx-3 md:ml-10 md:-mr-2 md:rounded-r-none rounded-lg">
              {displayedWeekDates.map((date) => (
                <button
                  key={date.format("YYYY-MM-DD")}
                  onClick={() => {
                    setCurrentDate(date);
                    updateBookingDate(date);
                  }}
                  className={`text-center px-1 min-[360px]:px-2 py-1 rounded md:flex-1 ${
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
            <RoundArrow dir="next" label="下一週" onClick={handleNextDaysOnWeek} className="md:hidden" />
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
