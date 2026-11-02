// 電腦版左側欄：標題、新增預約、LIVE／會議室切換、小月曆、聯絡資訊
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Meeting, RoomKey, roomNames } from "../../types/common";
import { roomEquipment, roomPhotos, roomSeats } from "../../config/rooms";
import { isWorkday } from "../../utils/workdays";
import { ROOMS, roomTheme } from "./theme";

interface DesktopSidebarProps {
  todayMode: boolean;
  selectedRoom: RoomKey;
  activeDate: dayjs.Dayjs; // 目前畫面上的日期（LIVE 的日期或行事曆的日期）
  highlightWeek: boolean; // 週檢視時把整週標起來
  meetings: Meeting[]; // 小月曆的圓點（LIVE 為全部，會議室為該間）
  loadedRange: { from: string; to: string } | null;
  version: string;
  onNewBooking: () => void;
  onSelectToday: () => void;
  onSelectRoom: (room: RoomKey) => void;
  onPickDate: (date: dayjs.Dayjs) => void;
  onOpenChangelog: () => void;
}

const MiniCalendar = ({
  activeDate,
  highlightWeek,
  meetings,
  loadedRange,
  onPickDate,
}: Pick<DesktopSidebarProps, "activeDate" | "highlightWeek" | "meetings" | "loadedRange" | "onPickDate">) => {
  const [month, setMonth] = useState(() => activeDate.startOf("month"));
  // 畫面上的日期換月時，小月曆跟著換
  const activeMonth = activeDate.format("YYYY-MM");
  useEffect(() => setMonth(activeDate.startOf("month")), [activeMonth]);

  const today = dayjs().tz("Asia/Taipei").format("YYYY-MM-DD");
  const active = activeDate.format("YYYY-MM-DD");
  const weekStart = activeDate.subtract((activeDate.day() + 6) % 7, "day");
  const days = new Set(meetings.map((m) => m.date));
  // 只在已讀取的區間內顯示圓點，避免把「還沒讀取」誤看成「沒有預約」
  const loaded = (d: dayjs.Dayjs) =>
    !!loadedRange && d.valueOf() >= Date.parse(loadedRange.from) && d.endOf("day").valueOf() <= Date.parse(loadedRange.to);

  const first = month.startOf("month");
  const start = first.subtract((first.day() + 6) % 7, "day");
  const cells = Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  const rows = cells[35].month() === month.month() ? 6 : 5;

  return (
    <div className="border border-[#ECECEC] rounded-[14px] px-3 pt-3 pb-2">
      <div className="flex items-center justify-between text-[13.5px] font-medium mb-1.5 px-0.5">
        <span className="tabular-nums">{month.format("YYYY 年 M 月")}</span>
        <div className="flex gap-1.5">
          <button type="button" aria-label="上個月" onClick={() => setMonth(month.subtract(1, "month"))} className="w-[22px] h-[22px] rounded-full bg-[#F2F2F2] hover:bg-[#E6E6E6] grid place-items-center">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" aria-label="下個月" onClick={() => setMonth(month.add(1, "month"))} className="w-[22px] h-[22px] rounded-full bg-[#F2F2F2] hover:bg-[#E6E6E6] grid place-items-center">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] gap-y-0.5">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <div key={w} className="text-[11px] text-[#8A8A8A] py-1">{w}</div>
        ))}
        {cells.slice(0, rows * 7).map((d) => {
          const key = d.format("YYYY-MM-DD");
          const inMonth = d.month() === month.month();
          const workday = isWorkday(d);
          const isActive = key === active;
          const inWeek = highlightWeek && !d.isBefore(weekStart, "day") && d.isBefore(weekStart.add(5, "day"), "day");
          const isToday = key === today;
          const hasMeetings = workday && days.has(key) && loaded(d);
          let cls = "text-[#212529]";
          if (!inMonth) cls = "text-[#DADADA]";
          else if (!workday) cls = "text-[#C9C9C9]";
          let bg = "";
          if (inWeek) bg = `bg-[#F2F2F2] ${d.day() === 1 ? "rounded-l-[9px]" : ""} ${d.day() === 5 ? "rounded-r-[9px]" : ""}`;
          if (isActive && !highlightWeek) bg = "bg-[#212529] rounded-[9px]";
          if (isActive && !highlightWeek) cls = "text-white font-bold";
          return (
            <button
              key={key}
              type="button"
              disabled={!workday}
              onClick={() => onPickDate(d)}
              aria-label={d.format("M月D日")}
              aria-current={isActive ? "date" : undefined}
              className={`relative h-[30px] grid place-items-center tabular-nums ${cls} ${bg} ${
                workday && !(isActive && !highlightWeek) ? "hover:bg-[#EAEAEA] rounded-[9px]" : ""
              } disabled:cursor-default`}
            >
              <span className={isToday && !(isActive && !highlightWeek) ? "text-[#FF3F3F] font-bold" : ""}>{d.date()}</span>
              {hasMeetings && (
                <span
                  className={`absolute bottom-[3px] w-1 h-1 rounded-full ${isActive && !highlightWeek ? "bg-[#FFEB83]" : "bg-[#FF9114]"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const DesktopSidebar = (props: DesktopSidebarProps) => {
  const { todayMode, selectedRoom, version, onNewBooking, onSelectToday, onSelectRoom, onOpenChangelog } = props;
  return (
    <aside className="font-live w-[272px] shrink-0 bg-white border-r border-[#ECECEC] flex flex-col gap-[18px] px-[18px] pt-[22px] pb-4 overflow-y-auto">
      <div>
        <h1 className="text-[19px] font-bold text-[#212529] leading-tight m-0">數金部會議室 (11F)</h1>
        <p className="text-[12px] text-[#8A8A8A] mt-1.5 mb-0 leading-relaxed">
          選擇合適的會議室，預訂<span className="text-[#FF3F3F]">並邀請夥伴參加會議</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onNewBooking}
        className="h-[42px] rounded-xl bg-[#FF9114] hover:bg-[#F28100] text-white text-[15px] font-medium flex items-center justify-center gap-1.5 shadow-[0_4px_10px_rgba(255,145,20,0.28)] active:scale-[0.98] transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        新增預約
      </button>

      <nav>
        <div className="text-[11px] text-[#8A8A8A] tracking-widest mb-1.5 ml-1.5">檢視</div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onSelectToday}
            aria-current={todayMode ? "page" : undefined}
            className={`relative flex items-center gap-[11px] px-2.5 py-2 rounded-xl text-left transition-colors ${
              todayMode ? "bg-[#FFFAE8]" : "hover:bg-[#F7F7F7]"
            }`}
          >
            {todayMode && <span className="absolute -left-[18px] top-2.5 bottom-2.5 w-1 rounded-r bg-[#FFC31D]" />}
            <span className="w-9 h-9 rounded-[10px] bg-[#FFC31D] grid place-items-center shrink-0">
              <span className="w-2 h-2 rounded-full live-dot" />
            </span>
            <span>
              <span className="block text-[14px] font-medium text-[#212529]">LIVE</span>
              <span className="block text-[11.5px] text-[#8A8A8A]">三間會議室即時狀況</span>
            </span>
          </button>
          {ROOMS.map((room) => {
            const on = !todayMode && selectedRoom === room;
            const theme = roomTheme[room];
            return (
              <button
                key={room}
                type="button"
                onClick={() => onSelectRoom(room)}
                aria-current={on ? "page" : undefined}
                className={`relative flex items-center gap-[11px] px-2.5 py-2 rounded-xl text-left transition-colors ${on ? "" : "hover:bg-[#F7F7F7]"}`}
                style={on ? { background: theme.nav } : undefined}
              >
                {on && <span className="absolute -left-[18px] top-2.5 bottom-2.5 w-1 rounded-r" style={{ background: theme.main }} />}
                <img src={roomPhotos[room]} alt="" className="w-9 h-9 rounded-[10px] object-cover shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#212529]">{roomNames[room]}</span>
                  <span className="block text-[11.5px] text-[#8A8A8A] truncate">
                    {roomSeats[room]} 人 · {roomEquipment[room]}
                  </span>
                </span>
                <span className="ml-auto w-[7px] h-[7px] rounded-full shrink-0" style={{ background: theme.main }} />
              </button>
            );
          })}
        </div>
      </nav>

      <MiniCalendar {...props} />

      <div className="mt-auto text-[11.5px] text-[#8A8A8A] leading-relaxed px-1.5">
        有問題或建議，請聯繫負責人 #51164 祐晨
        <br />
        <button type="button" onClick={onOpenChangelog} className="underline text-[#4D4D4D] hover:text-[#212529]">
          {version} 更新內容
        </button>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
