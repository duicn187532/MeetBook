// src/components/TodayOverview.tsx
// LIVE 分頁：選定日期三間會議室的狀態卡（照片、可預約時段、立即預約、時間軸）
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { RoomKey, roomNames } from "../types/common";
import { roomPhotos, roomSeats } from "../config/rooms";
import { DAY_END_MIN, DAY_START_MIN, taipeiHHmm, taipeiMs } from "../utils/bookingHelpers";
import { TodayOverview as Overview, TodayRoom } from "../utils/todayStatus";

const TIMELINE_MIN = DAY_END_MIN - DAY_START_MIN; // 08:45 ~ 18:15，與日／週檢視相同
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 會議室名稱標籤用淡色底、時間軸用代表色
const roomStyle: Record<RoomKey, { chip: string; bar: string }> = {
  A101: { chip: "bg-[#DCE9FC] text-[#24456E]", bar: "#7DB5F5" },
  A102: { chip: "bg-[#FBE1E1] text-[#7A2E2E]", bar: "#E57B7B" },
  A103: { chip: "bg-[#D9F2EC] text-[#1E5E54]", bar: "#5ACDB9" },
};

// 時間 → 時間軸上的位置（0 ~ 1）
function position(ms: number, date: string) {
  const ratio = (ms - taipeiMs(date, DAY_START_MIN)) / (TIMELINE_MIN * 60_000);
  return Math.min(1, Math.max(0, ratio));
}

function relativeDay(offset: number) {
  if (offset === 0) return "今天";
  if (offset === 1) return "明天";
  if (offset === -1) return "昨天";
  return offset > 0 ? `${offset} 天後` : `${-offset} 天前`;
}

interface LiveHeaderProps {
  overview: Overview;
  offset: number; // 與今天相差幾天
  updatedAt: number | null; // 資料最後更新時間
  onChangeDay: (delta: number) => void;
}

// 上方標頭：切換日期、日期與摘要
export const TodayHeader = ({ overview, offset, updatedAt, onChangeDay }: LiveHeaderProps) => {
  const d = dayjs(overview.date);
  const busy = overview.counts.busy;
  const available = overview.rooms.filter((r) => r.kind !== "busy" && r.quickBook).length;
  const parts: string[] = [];
  if (updatedAt) parts.push(`${taipeiHHmm(updatedAt)} 更新`);
  if (overview.phase === "after") {
    parts.push(`共 ${overview.total} 場會議`);
  } else {
    parts.push(available > 0 ? `${available} 間可預約` : "都已預約滿");
    if (overview.phase === "open" && busy > 0) parts.push(`${busy} 間使用中`);
  }
  return (
    <div className="px-4 pt-4 pb-1 flex flex-col items-center gap-3 bg-[#FBF6E1]">
      <div className="flex items-center justify-between w-full max-w-sm">
        <button
          type="button"
          onClick={() => onChangeDay(-1)}
          aria-label="前一天"
          className="w-8 h-8 rounded-full bg-[#2B2B2B] text-white flex items-center justify-center active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-baseline gap-3">
          <span className="text-[22px] tabular-nums tracking-wide">
            {d.format("YYYY.MM.DD")} ({WEEK[d.day()]})
          </span>
          <span className={`text-sm ${offset === 0 ? "text-gray-700" : "text-[#B7791F] font-semibold"}`}>
            {relativeDay(offset)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChangeDay(1)}
          aria-label="後一天"
          className="w-8 h-8 rounded-full bg-[#2B2B2B] text-white flex items-center justify-center active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="rounded-full bg-[#EBDA6A] px-6 py-1.5 text-[15px] text-[#3D3A1F] tabular-nums">
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
  const showNow = overview.phase === "open";
  const nowPos = position(now, overview.date);
  return (
    <div className="relative bg-white rounded-3xl shadow-[0_2px_10px_rgba(120,100,40,0.10)] p-4">
      {/* 整張卡片可點，進入該會議室的週檢視；立即預約按鈕疊在上面 */}
      <button
        type="button"
        onClick={() => onOpenRoom(room.room)}
        aria-label={`查看 ${roomNames[room.room]} 的週檢視`}
        className="absolute inset-0 rounded-3xl"
      />
      <div className="flex items-center gap-3.5 pointer-events-none">
        <img
          src={roomPhotos[room.room]}
          alt=""
          width={72}
          height={72}
          decoding="async"
          className="w-[72px] h-[72px] rounded-2xl object-cover shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className={`px-3.5 py-0.5 rounded-full text-[15px] font-semibold ${style.chip}`}>
              {roomNames[room.room]}
            </span>
            <span className="inline-flex items-center gap-1 text-[15px] text-gray-700">
              <Users className="w-4 h-4" aria-hidden="true" />
              <span className="tabular-nums">{roomSeats[room.room]}</span>
              <span className="sr-only">人</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[14px] text-gray-800 tabular-nums leading-snug">{room.availability}</span>
            {room.quickBook && (
              <button
                type="button"
                onClick={() => onQuickBook(room.room, room.quickBook!)}
                aria-label={`立即預約 ${roomNames[room.room]}（${room.quickBook.startTime}–${room.quickBook.endTime}）`}
                className="pointer-events-auto relative shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[#E3893A] text-white text-[13px] font-medium pl-2.5 pr-3 py-1.5 shadow-[0_2px_6px_rgba(227,137,58,0.35)] active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                立即預約
              </button>
            )}
          </div>
        </div>
      </div>
      {/* 時間軸：08:45 ~ 18:15 */}
      <div className="mt-3.5 pointer-events-none" aria-hidden="true">
        <div className="relative h-2 rounded-full bg-[#F6F3EA]">
          {room.slots.map((slot) => {
            const left = position(slot.start, overview.date);
            const right = position(slot.end, overview.date);
            return (
              <span
                key={slot.meeting.id}
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  left: `${left * 100}%`,
                  width: `${Math.max(right - left, 0.01) * 100}%`,
                  background: style.bar,
                  opacity: slot.end <= now ? 0.35 : 1,
                }}
              />
            );
          })}
          {showNow && (
            <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[#2B2B2B]/60" style={{ left: `${nowPos * 100}%` }} />
          )}
        </div>
        <div className="relative h-4 mt-1.5 text-[12px] text-gray-500 tabular-nums">
          {[9, 12, 15, 18].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${position(taipeiMs(overview.date, h * 60), overview.date) * 100}%` }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const TodayOverview = ({ overview, now, onOpenRoom, onQuickBook }: TodayOverviewProps) => (
  <div className="min-h-full bg-[#FBF6E1] px-4 pt-3 pb-8 flex flex-col gap-4">
    {overview.rooms.map((room) => (
      <RoomCard key={room.room} room={room} overview={overview} now={now} onOpenRoom={onOpenRoom} onQuickBook={onQuickBook} />
    ))}
  </div>
);

export default TodayOverview;
