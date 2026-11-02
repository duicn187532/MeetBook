// 電腦版會議室畫面：上方會議室資訊與日期切換，下方日／週／月行事曆
import dayjs from "dayjs";
import { Meeting, RoomKey, roomNames, ViewMode } from "../../types/common";
import { roomEquipment, roomPhotos, roomSeats } from "../../config/rooms";
import { weekWorkdays } from "../../utils/workdays";
import { DarkArrow } from "./DesktopLive";
import MonthGrid from "./MonthGrid";
import TimeGrid from "./TimeGrid";
import { roomTheme, WEEK } from "./theme";

interface DesktopRoomViewProps {
  room: RoomKey;
  view: ViewMode;
  currentDate: dayjs.Dayjs;
  meetings: Meeting[];
  onChangeView: (view: ViewMode) => void;
  onNavigate: (step: 1 | -1) => void;
  onToday: () => void;
  onOpenDay: (date: dayjs.Dayjs) => void;
  onOpenMeeting: (meeting: Meeting) => void;
  onPickSlot: (date: string, times: { startTime: string; endTime: string }) => void;
}

const VIEW_LABELS: [ViewMode, string][] = [["Day", "日"], ["Week", "週"], ["Month", "月"]];

function rangeLabel(view: ViewMode, d: dayjs.Dayjs) {
  if (view === "Month") return d.format("YYYY 年 M 月");
  if (view === "Day") return `${d.format("YYYY 年 M 月 D 日")} (${WEEK[d.day()]})`;
  const days = weekWorkdays(d);
  return `${days[0].format("M 月 D 日")} – ${days[4].format("M 月 D 日")}`;
}

const DesktopRoomView = (props: DesktopRoomViewProps) => {
  const { room, view, currentDate, meetings, onChangeView, onNavigate, onToday, onOpenDay, onOpenMeeting, onPickSlot } = props;
  const theme = roomTheme[room];
  const unit = view === "Day" ? "天" : view === "Week" ? "週" : "個月";
  return (
    <div className="font-live flex-1 min-h-0 flex flex-col bg-white">
      <div className="h-[72px] shrink-0 flex items-center gap-4 px-7 border-b border-[#ECECEC]">
        <img src={roomPhotos[room]} alt="" className="w-11 h-11 rounded-xl object-cover" />
        <div>
          <h2 className="text-[19px] font-bold m-0 leading-tight">{roomNames[room]}</h2>
          <div className="text-[12px] text-[#8A8A8A] mt-0.5">
            {roomSeats[room]} 人 · {roomEquipment[room]}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-7">
          <DarkArrow dir="prev" label={`上一${unit}`} onClick={() => onNavigate(-1)} />
          <span className="text-[16px] tabular-nums min-w-[11em] text-center">{rangeLabel(view, currentDate)}</span>
          <DarkArrow dir="next" label={`下一${unit}`} onClick={() => onNavigate(1)} />
          <button
            type="button"
            onClick={onToday}
            className="h-8 px-3.5 rounded-full border border-[#E2E2E2] bg-white text-[13px] hover:bg-[#F7F7F7]"
          >
            {view === "Day" ? "今天" : view === "Week" ? "本週" : "本月"}
          </button>
        </div>
        <div className="ml-auto flex bg-[#F2F2F2] rounded-full p-[3px]" role="tablist">
          {VIEW_LABELS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => onChangeView(v)}
              className={`text-[13px] px-4 py-[5px] rounded-full transition-colors ${
                view === v ? "text-white font-medium" : "text-[#4D4D4D] hover:text-[#212529]"
              }`}
              style={view === v ? { background: theme.main } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {view === "Month" ? (
          <MonthGrid room={room} month={currentDate} meetings={meetings} onOpenDay={onOpenDay} onOpenMeeting={onOpenMeeting} />
        ) : (
          <TimeGrid
            room={room}
            days={view === "Week" ? weekWorkdays(currentDate) : [currentDate]}
            meetings={meetings}
            onOpenMeeting={onOpenMeeting}
            onPickSlot={onPickSlot}
          />
        )}
      </div>
    </div>
  );
};

export default DesktopRoomView;
