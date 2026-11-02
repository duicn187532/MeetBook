// 電腦版月檢視：週一到週五五欄，每格列出當天的會議
import dayjs from "dayjs";
import { Meeting, RoomKey } from "../../types/common";
import { taipeiHHmm } from "../../utils/bookingHelpers";
import { meetingTitle, roomTheme } from "./theme";

interface MonthGridProps {
  room: RoomKey;
  month: dayjs.Dayjs;
  meetings: Meeting[];
  onOpenDay: (date: dayjs.Dayjs) => void;
  onOpenMeeting: (meeting: Meeting) => void;
}

const MAX_ITEMS = 3;

const MonthGrid = ({ room, month, meetings, onOpenDay, onOpenMeeting }: MonthGridProps) => {
  const theme = roomTheme[room];
  const today = dayjs().tz("Asia/Taipei").format("YYYY-MM-DD");
  // 從包含 1 號那週的週一，到包含月底那週的週五
  const first = month.startOf("month");
  const monday = first.subtract((first.day() + 6) % 7, "day");
  const last = month.endOf("month");
  const weeks: dayjs.Dayjs[][] = [];
  for (let w = monday; !w.isAfter(last, "day"); w = w.add(7, "day")) {
    weeks.push(Array.from({ length: 5 }, (_, i) => w.add(i, "day")));
  }

  return (
    <div className="flex-1 min-h-[520px] flex flex-col">
      <div className="grid grid-cols-5 h-[44px] shrink-0 border-b border-[#ECECEC] text-[13px] text-[#8A8A8A]">
        {["週一", "週二", "週三", "週四", "週五"].map((w) => (
          <div key={w} className="flex items-center px-4">{w}</div>
        ))}
      </div>
      <div className="flex-1 grid min-h-0" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week) => (
          <div key={week[0].format("YYYY-MM-DD")} className="grid grid-cols-5 border-b border-[#ECECEC] min-h-0">
            {week.map((d) => {
              const date = d.format("YYYY-MM-DD");
              const inMonth = d.month() === month.month();
              const list = meetings
                .filter((m) => m.date === date)
                .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
              return (
                <div
                  key={date}
                  onClick={() => onOpenDay(d)}
                  className={`border-l border-[#ECECEC] first:border-l-0 px-2.5 py-2 min-h-0 overflow-hidden cursor-pointer transition-colors hover:bg-[#FAFAFA] ${
                    inMonth ? "" : "bg-[#FBFBFB]"
                  }`}
                >
                  <div className="flex items-center mb-1">
                    <span
                      className={`text-[13px] tabular-nums ${
                        date === today
                          ? "w-6 h-6 rounded-full bg-[#FF3F3F] text-white grid place-items-center font-medium"
                          : inMonth
                          ? "text-[#212529] font-medium"
                          : "text-[#C4C4C4]"
                      }`}
                    >
                      {d.date()}
                    </span>
                    {list.length > 0 && <span className="ml-auto text-[11px] text-[#9A9A9A]">{list.length} 場</span>}
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    {list.slice(0, MAX_ITEMS).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMeeting(m);
                        }}
                        className="text-left text-[12px] leading-[1.35] px-1.5 py-[2px] rounded-md truncate hover:brightness-[0.97]"
                        style={{ background: theme.soft, opacity: inMonth ? 1 : 0.55 }}
                      >
                        <span className="tabular-nums" style={{ color: theme.ink }}>{taipeiHHmm(Date.parse(m.startTime))}</span>{" "}
                        <span className="text-[#212529]">{meetingTitle(m.title)}</span>
                      </button>
                    ))}
                    {list.length > MAX_ITEMS && (
                      <span className="text-[11.5px] text-[#8A8A8A] px-1.5">還有 {list.length - MAX_ITEMS} 場</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthGrid;
