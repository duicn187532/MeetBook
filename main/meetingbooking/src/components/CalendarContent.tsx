// src/components/CalendarContent.tsx
import { Meeting, ViewMode } from "../types/common";
import dayjs from "dayjs";
import DayCalendar from "./DayCalendar";
import WeekCalendar from "./WeekCalendar";
import MonthCalendar from "./MonthCalendar";

interface CalendarContentProps {
  selectedView: ViewMode;
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  onChangeView: (view: ViewMode) => void;
  setCurrentDate: (date: dayjs.Dayjs) => void;
  setViewStartDate: (date: dayjs.Dayjs) => void;
  setSelectedMeeting: (meeting: Meeting | null) => void;
  setShowInfoModal: (show: boolean) => void;
  // 可依需求擴充其他 alert 函式…
}

const CalendarContent = ({
  selectedView,
  currentDate,
  meetings,
  onChangeView,
  setCurrentDate,
  setViewStartDate,
  setSelectedMeeting,
  setShowInfoModal,
}: CalendarContentProps) => {
  if (selectedView === "Day") {
    return (
      <DayCalendar
        currentDate={currentDate}
        meetings={meetings}
        setSelectedMeeting={setSelectedMeeting}
        setShowInfoModal={setShowInfoModal}
      />
    );
  }
  if (selectedView === "Week") {
    return (
      <WeekCalendar
        currentDate={currentDate}
        meetings={meetings}
        setCurrentDate={setCurrentDate}
        setViewStartDate={setViewStartDate}
        setSelectedMeeting={setSelectedMeeting}
        setShowInfoModal={setShowInfoModal}
      />
    );
  }
  if (selectedView === "Month") {
    return (
      <MonthCalendar
        currentDate={currentDate}
        meetings={meetings}
        setCurrentDate={setCurrentDate}
        setViewStartDate={setViewStartDate}
        onChangeView={onChangeView}
      />
    );
  }
  return null;
};

export default CalendarContent;
