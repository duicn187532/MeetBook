// src/components/TodayOverview.tsx
// Today 分頁（實驗性功能）：三間會議室現在的狀態卡與今日時間表
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { Meeting, RoomKey, roomNames } from "../types/common";
import { DAY_END_MIN, DAY_START_MIN, taipeiHHmm, taipeiMs } from "../utils/bookingHelpers";
import { RoomStatusKind, TodayOverview as Overview, TodayRoom } from "../utils/todayStatus";

const TIMELINE_MIN = DAY_END_MIN - DAY_START_MIN; // 08:45 ~ 18:15，與日／週檢視相同

// 與既有畫面一致的會議室配色：淺色底 + 代表色圓點；文字用加深的同色系以確保對比
const roomStyle: Record<RoomKey, { chip: string; dot: string; bar: string; block: string }> = {
  A101: { chip: "bg-[#D1E7FF] text-[#1D5FA8]", dot: "bg-[#60AAFF]", bar: "#60AAFF", block: "bg-blue-200" },
  A102: { chip: "bg-[#FFE6E6] text-[#B42318]", dot: "bg-[#FF3F3F]", bar: "#FF3F3F", block: "bg-red-200" },
  A103: { chip: "bg-[#D7F3F1] text-[#0B7A72]", dot: "bg-[#17C2B6]", bar: "#17C2B6", block: "bg-green-200" },
};

// 與設備說明相同的座位數
const seats: Record<RoomKey, number> = { A101: 10, A102: 15, A103: 20 };

const statusStyle: Record<RoomStatusKind, string> = {
  busy: "bg-[#3F3F3F] text-white",
  soon: "bg-[#FDEBDC] text-[#9A4A12]",
  free: "bg-[#E4F3DA] text-[#2F6B18]",
  done: "bg-gray-100 text-gray-600",
};

// 時間 → 時間軸上的位置（0 ~ 1）
function position(ms: number, date: string) {
  const ratio = (ms - taipeiMs(date, DAY_START_MIN)) / (TIMELINE_MIN * 60_000);
  return Math.min(1, Math.max(0, ratio));
}

interface TodayHeaderProps {
  overview: Overview;
  now: number;
}

// 上方標頭：日期、現在時間與各狀態數量
export const TodayHeader = ({ overview, now }: TodayHeaderProps) => {
  const { phase, counts, total } = overview;
  const pill =
    phase === "before"
      ? `08:45 起可使用 · 今天共 ${total} 場會議`
      : phase === "after"
      ? `今天已結束 · 今天共 ${total} 場會議`
      : `現在 ${taipeiHHmm(now)}`;
  return (
    <div className="p-4 flex flex-col items-center gap-2.5 bg-[#F2F2F2] rounded-t-2xl">
      <div className="text-2xl font-normal">{dayjs(now).tz("Asia/Taipei").format("dddd, MMMM D")}</div>
      <div className="flex flex-wrap justify-center items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          {pill}
        </span>
        {phase === "open" && (
          <>
            {counts.busy > 0 && <span className={`rounded-full px-2.5 py-1 ${statusStyle.busy}`}>使用中 {counts.busy}</span>}
            {counts.soon > 0 && <span className={`rounded-full px-2.5 py-1 ${statusStyle.soon}`}>即將開始 {counts.soon}</span>}
            {counts.free > 0 && <span className={`rounded-full px-2.5 py-1 ${statusStyle.free}`}>空閒 {counts.free}</span>}
          </>
        )}
      </div>
    </div>
  );
};

interface TodayOverviewProps {
  overview: Overview;
  now: number;
  onOpenRoom: (room: RoomKey) => void;
  onQuickBook: (room: RoomKey, times: { startTime: string; endTime: string }) => void;
  onSelectMeeting: (meeting: Meeting) => void;
}

const RoomCard = ({
  room,
  overview,
  now,
  onOpenRoom,
  onQuickBook,
}: { room: TodayRoom } & Omit<TodayOverviewProps, "onSelectMeeting">) => {
  const style = roomStyle[room.room];
  const nowPos = position(now, overview.date);
  const showNow = overview.phase === "open";
  return (
    <div className="flex items-stretch bg-white border border-gray-200 rounded-2xl shadow-md">
      <button
        type="button"
        onClick={() => onOpenRoom(room.room)}
        aria-label={`查看 ${roomNames[room.room]} 今天的日檢視`}
        className="flex-1 min-w-0 text-left p-3.5 flex flex-col gap-2.5"
      >
        <span className="flex items-center gap-2 w-full">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-sm font-bold ${style.chip}`}>
            <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
            {roomNames[room.room]}
          </span>
          <span className="text-xs text-gray-500">{seats[room.room]} 人</span>
          <span className="flex-1"></span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle[room.kind]}`}>
            {room.statusLabel}
          </span>
        </span>
        <span className="flex items-center gap-2.5 w-full">
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold truncate">{room.headline}</span>
            {room.detail && <span className="text-[13px] text-gray-500">{room.detail}</span>}
          </span>
          <span className="bg-black rounded-full p-1 shrink-0" aria-hidden="true">
            <ChevronRight className="w-3 h-3 text-white" />
          </span>
        </span>
        <span className="block w-full">
          <span className="block relative h-2 rounded-full bg-[#EEEEEE] overflow-hidden">
            {room.slots.map((slot) => {
              const left = position(slot.start, overview.date);
              const right = position(slot.end, overview.date);
              return (
                <span
                  key={slot.meeting.id}
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{
                    left: `${left * 100}%`,
                    width: `${(right - left) * 100}%`,
                    background: style.bar,
                    opacity: slot.end <= now ? 0.35 : 1,
                  }}
                />
              );
            })}
            {showNow && (
              <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-red-500" style={{ left: `${nowPos * 100}%` }} />
            )}
          </span>
          <span className="flex justify-between mt-1 text-[10px] text-gray-500">
            <span>09</span>
            <span>12</span>
            <span>15</span>
            <span>18</span>
          </span>
        </span>
      </button>
      {room.quickBook && (
        <div className="flex items-center pr-3">
          <button
            type="button"
            onClick={() => onQuickBook(room.room, room.quickBook!)}
            aria-label={`立即預約 ${roomNames[room.room]}（${room.quickBook.startTime}–${room.quickBook.endTime}）`}
            className="w-11 h-11 rounded-2xl bg-[#FDDCC0] text-[#C2410C] flex items-center justify-center shadow-sm active:scale-95"
          >
            <span className="text-3xl leading-none">+</span>
          </button>
        </div>
      )}
    </div>
  );
};

// 今日時間表：三間會議室並排，每分鐘 1px
const Timetable = ({ overview, now, onSelectMeeting }: Pick<TodayOverviewProps, "overview" | "now" | "onSelectMeeting">) => {
  const hours = Array.from({ length: 10 }, (_, i) => 9 + i);
  const toPx = (ms: number) => Math.round(position(ms, overview.date) * TIMELINE_MIN);
  return (
    <div className="px-4 pb-24">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">今日時間表</h2>
        <span className="text-xs text-gray-500">點會議可查看詳情</span>
      </div>
      <div className="flex mt-2.5 pl-10 gap-1.5">
        {overview.rooms.map((r) => (
          <span key={r.room} className={`flex-1 text-center text-[13px] font-bold py-1 rounded-[10px] ${roomStyle[r.room].chip}`}>
            {roomNames[r.room]}
          </span>
        ))}
      </div>
      <div className="relative flex mt-2" style={{ height: TIMELINE_MIN }}>
        <div className="w-10 relative shrink-0">
          {hours.map((h) => (
            <span
              key={h}
              className="absolute left-0 text-[11px] text-gray-700 -translate-y-1/2"
              style={{ top: (h * 60 - DAY_START_MIN) }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="flex-1 relative flex gap-1.5">
          {hours.map((h) => (
            <span key={h} className="absolute left-0 right-0 border-t border-gray-200" style={{ top: (h * 60 - DAY_START_MIN) }} />
          ))}
          {overview.rooms.map((r) => (
            <div key={r.room} className="flex-1 relative border-l border-gray-200">
              {r.slots.map((slot) => {
                const top = toPx(slot.start);
                const height = Math.max(toPx(slot.end) - top, 14);
                const isCurrent = slot.start <= now && now < slot.end;
                const isShort = slot.end - slot.start < 45 * 60_000;
                return (
                  <button
                    key={slot.meeting.id}
                    type="button"
                    onClick={() => onSelectMeeting(slot.meeting)}
                    aria-label={`${roomNames[r.room]} ${slot.meeting.title} ${taipeiHHmm(slot.start)} 到 ${taipeiHHmm(slot.end)}`}
                    className={`absolute left-[3px] right-[3px] rounded-md px-1.5 py-0.5 text-left flex flex-col overflow-hidden shadow-sm ${roomStyle[r.room].block} ${isCurrent ? "ring-2 ring-[#3F3F3F] ring-inset" : ""}`}
                    style={{ top, height, opacity: slot.end <= now ? 0.5 : 1 }}
                  >
                    <span className={`font-bold truncate ${isShort ? "text-[10px] leading-tight" : "text-[11px]"}`}>
                      {slot.meeting.title}
                    </span>
                    {!isShort && (
                      <span className="text-[10px] text-[#444444]">
                        {taipeiHHmm(slot.start)}–{taipeiHHmm(slot.end)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {overview.phase === "open" && (
            <>
              <span className="absolute -left-1 right-0 border-t-2 border-red-500 pointer-events-none" style={{ top: toPx(now) }} />
              <span
                className="absolute -left-2 w-2 h-2 rounded-full bg-red-500 -translate-y-1/2 pointer-events-none"
                style={{ top: toPx(now) }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TodayOverview = ({ overview, now, onOpenRoom, onQuickBook, onSelectMeeting }: TodayOverviewProps) => (
  <div className="flex flex-col gap-1">
    <div className="p-4 flex flex-col gap-3">
      {overview.rooms.map((room) => (
        <RoomCard
          key={room.room}
          room={room}
          overview={overview}
          now={now}
          onOpenRoom={onOpenRoom}
          onQuickBook={onQuickBook}
        />
      ))}
    </div>
    <Timetable overview={overview} now={now} onSelectMeeting={onSelectMeeting} />
  </div>
);

export default TodayOverview;
