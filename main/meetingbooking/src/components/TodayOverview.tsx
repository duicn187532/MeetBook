// src/components/TodayOverview.tsx
// LIVE 分頁：選定日期三間會議室的狀態卡（照片、可預約時段、立即預約、時間軸）
// 尺寸與顏色依設計稿（iPhone 390pt 寬）量測
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { RoomKey, roomNames } from "../types/common";
import { roomPhotos, roomSeats } from "../config/rooms";
import { taipeiHHmm, taipeiMs } from "../utils/bookingHelpers";
import { TodayOverview as Overview, TodayRoom } from "../utils/todayStatus";

// 卡片時間軸的範圍：09:00 ~ 18:00（刻度 09、12、15、18 平均分布）
const AXIS_START_MIN = 9 * 60;
const AXIS_END_MIN = 18 * 60;
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const roomStyle: Record<RoomKey, { chip: string; bar: string }> = {
  A101: { chip: "bg-[#D1E7FF]", bar: "#8CC3FF" },
  A102: { chip: "bg-[#FDE4E4]", bar: "#FF8787" },
  A103: { chip: "bg-[#D7F3F1]", bar: "#42E9DD" },
};

// 時間 → 時間軸上的位置（0 ~ 1）
function position(ms: number, date: string) {
  const start = taipeiMs(date, AXIS_START_MIN);
  const ratio = (ms - start) / ((AXIS_END_MIN - AXIS_START_MIN) * 60_000);
  return Math.min(1, Math.max(0, ratio));
}

// 今天／明天／昨天；其他日子顯示「週三」「下週一」「上週五」（一週從週一開始）
function relativeDay(date: dayjs.Dayjs, offset: number) {
  if (offset === 0) return "今天";
  if (offset === 1) return "明天";
  if (offset === -1) return "昨天";
  const monday = (d: dayjs.Dayjs) => d.subtract((d.day() + 6) % 7, "day").startOf("day");
  const today = date.subtract(offset, "day");
  const weeks = Math.round(monday(date).diff(monday(today), "day") / 7);
  const name = `週${WEEK[date.day()]}`;
  if (weeks === 0) return name;
  if (weeks === 1) return `下${name}`;
  if (weeks === -1) return `上${name}`;
  return offset > 0 ? `${offset} 天後` : `${-offset} 天前`;
}

// "09:24" → "9:24"
const shortTime = (ms: number) => taipeiHHmm(ms).replace(/^0/, "");

interface LiveHeaderProps {
  overview: Overview;
  offset: number; // 與今天相差幾天
  updatedAt: number | null; // 資料最後更新時間
  onChangeDay: (delta: number) => void;
}

const ArrowButton = ({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={dir === "prev" ? "前一天" : "後一天"}
    className="relative w-[18px] h-[18px] rounded-full bg-[#212529] text-white flex items-center justify-center active:scale-95 before:absolute before:-inset-3 before:content-['']"
  >
    {dir === "prev" ? (
      <ChevronLeft className="w-3 h-3" strokeWidth={2.75} />
    ) : (
      <ChevronRight className="w-3 h-3" strokeWidth={2.75} />
    )}
  </button>
);

// 上方標頭：切換日期、日期與摘要
export const TodayHeader = ({ overview, offset, updatedAt, onChangeDay }: LiveHeaderProps) => {
  const d = dayjs(overview.date);
  const busy = overview.counts.busy;
  const available = overview.rooms.filter((r) => r.kind !== "busy" && r.quickBook).length;
  const parts: string[] = [];
  if (updatedAt) parts.push(`${shortTime(updatedAt)}更新`);
  if (overview.phase === "after") {
    parts.push(`共${overview.total}場會議`);
  } else {
    parts.push(available > 0 ? `${available}間可預約` : "都已預約滿");
    if (overview.phase === "open" && busy > 0) parts.push(`${busy}間使用中`);
  }
  return (
    <div className="font-live bg-[#FFFAE8] pt-[17px] flex flex-col items-center">
      <div className="flex items-center justify-between w-[300px] max-w-[calc(100%-32px)]">
        <ArrowButton dir="prev" onClick={() => onChangeDay(-1)} />
        <div className="font-system flex items-baseline gap-4 text-[#4D4D4D]">
          <span className="text-[17px] tabular-nums">
            {d.format("YYYY.MM.DD")} ({WEEK[d.day()]})
          </span>
          <span className={`text-[13px] ${offset === 0 ? "" : "text-[#C77700] font-semibold"}`}>
            {relativeDay(d, offset)}
          </span>
        </div>
        <ArrowButton dir="next" onClick={() => onChangeDay(1)} />
      </div>
      <div className="live-pill mt-[17px] min-w-[275px] h-[27px] px-6 rounded-full bg-[#FFEB83] flex items-center justify-center text-[14px] text-[#484848] tabular-nums">
        {parts.join(" · ")}
      </div>
    </div>
  );
};

interface TodayOverviewProps {
  overview: Overview;
  now: number;
  onOpenRoom: (room: RoomKey) => void;
  onQuickBook: (room: RoomKey, times: { startTime: string; endTime: string }) => void;
}

const RoomCard = ({ room, overview, now, onOpenRoom, onQuickBook }: { room: TodayRoom } & TodayOverviewProps) => {
  const style = roomStyle[room.room];
  return (
    <div className="relative bg-white rounded-[22px] shadow-[0_2px_0_#E0E0E0] pt-[17px] pb-[14px] pl-[15px] pr-[15px]">
      {/* 整張卡片可點，進入該會議室的週檢視；立即預約按鈕疊在上面 */}
      <button
        type="button"
        onClick={() => onOpenRoom(room.room)}
        aria-label={`查看 ${roomNames[room.room]} 的週檢視`}
        className="absolute inset-0 rounded-[22px]"
      />
      <div className="flex gap-[11px] pointer-events-none">
        <img
          src={roomPhotos[room.room]}
          alt=""
          width={71}
          height={71}
          decoding="async"
          className="w-[71px] h-[71px] rounded-[16px] object-cover shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-[13px]">
          <div className="flex items-center gap-[13px]">
            <span className={`h-5 px-4 rounded-full inline-flex items-center text-[13px] font-medium text-[#222222] ${style.chip}`}>
              {roomNames[room.room]}
            </span>
            <span className="inline-flex items-center gap-1 text-[13px] text-[#212529]">
              <Users className="w-[15px] h-[15px]" strokeWidth={1.75} aria-hidden="true" />
              <span className="tabular-nums">{roomSeats[room.room]}</span>
              <span className="sr-only">人</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[13px] text-[#1E293B] tabular-nums leading-snug">{room.availability}</span>
            {room.quickBook && (
              <button
                type="button"
                onClick={() => onQuickBook(room.room, room.quickBook!)}
                aria-label={`立即預約 ${roomNames[room.room]}（${room.quickBook.startTime}–${room.quickBook.endTime}）`}
                className="pointer-events-auto relative shrink-0 w-[87px] h-[29px] inline-flex items-center justify-center gap-1 rounded-full bg-[#FF9114] text-white text-[13px] font-medium shadow-[0_3px_6px_rgba(255,145,20,0.30)] active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
                立即預約
              </button>
            )}
          </div>
        </div>
      </div>
      {/* 時間軸：09:00 ~ 18:00 */}
      <div className="mt-[14px] px-[3px] pointer-events-none" aria-hidden="true">
        <div className="relative h-[10px] rounded-full bg-[#F5F5F5]">
          {room.slots.map((slot) => {
            const left = position(slot.start, overview.date);
            const right = position(slot.end, overview.date);
            if (right <= left) return null;
            return (
              <span
                key={slot.meeting.id}
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  left: `${left * 100}%`,
                  width: `${(right - left) * 100}%`,
                  background: style.bar,
                  opacity: slot.end <= now ? 0.4 : 1,
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-[10px] pl-1.5 pr-2.5 text-[12px] leading-none text-[#999999] tabular-nums">
          <span>09</span>
          <span>12</span>
          <span>15</span>
          <span>18</span>
        </div>
      </div>
    </div>
  );
};

const TodayOverview = ({ overview, now, onOpenRoom, onQuickBook }: TodayOverviewProps) => (
  <div className="font-live min-h-full bg-[#FFFAE8] rounded-b-[24px] px-3 pt-[22px] pb-8 flex flex-col gap-4">
    {overview.rooms.map((room) => (
      <RoomCard key={room.room} room={room} overview={overview} now={now} onOpenRoom={onOpenRoom} onQuickBook={onQuickBook} />
    ))}
  </div>
);

export default TodayOverview;
