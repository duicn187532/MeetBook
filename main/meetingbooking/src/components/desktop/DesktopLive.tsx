// 電腦版 LIVE：上方三張會議室卡片，下方三間會議室的當日時間軸
import { useState } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { Meeting, RoomKey, roomNames } from "../../types/common";
import { roomEquipment, roomPhotos, roomSeats } from "../../config/rooms";
import { taipeiHHmm } from "../../utils/bookingHelpers";
import { isAfterHours, TodayOverview, TodayRoom } from "../../utils/todayStatus";
import { liveSummary, relativeDay } from "../TodayOverview";
import { gridRatio, pickSlot, PickedSlot } from "./slots";
import { meetingTitle, roomTheme, WEEK } from "./theme";

type Times = { startTime: string; endTime: string };

interface DesktopLiveProps {
  overview: TodayOverview;
  now: number;
  offset: number;
  updatedAt: number | null;
  onChangeDay: (delta: number) => void;
  onOpenRoom: (room: RoomKey) => void;
  onQuickBook: (room: RoomKey, times: Times) => void;
  onOpenMeeting: (meeting: Meeting) => void;
}

export const DarkArrow = ({ dir, label, onClick }: { dir: "prev" | "next"; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="w-[22px] h-[22px] rounded-full bg-[#212529] text-white grid place-items-center shrink-0 transition hover:bg-black active:scale-95"
  >
    {dir === "prev" ? <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.75} /> : <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.75} />}
  </button>
);

// 卡片左上角的狀態：今天營業時間內顯示即時狀態，其他日子顯示當天場數
function statusOf(room: TodayRoom, overview: TodayOverview, offset: number, now: number) {
  if (offset !== 0 || overview.phase !== "open" || isAfterHours(overview.date, now)) {
    if (offset === 0 && (overview.phase === "after" || isAfterHours(overview.date, now))) {
      return { dot: "#B5B5B5", text: "今日已結束" };
    }
    return { dot: "#B5B5B5", text: room.slots.length > 0 ? `${room.slots.length} 場會議` : "沒有預約" };
  }
  if (room.kind === "busy" && room.current) {
    return { dot: "#FF9114", text: `使用中 · ${taipeiHHmm(Date.parse(room.current.endTime))} 結束` };
  }
  if (room.kind === "soon") return { dot: "#FFC31D", text: room.statusLabel };
  return { dot: "#2BC24A", text: "空閒中" };
}

const AXIS_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const DesktopLive = ({ overview, now, offset, updatedAt, onChangeDay, onOpenRoom, onQuickBook, onOpenMeeting }: DesktopLiveProps) => {
  const d = dayjs(overview.date);
  const date = overview.date;
  const [hover, setHover] = useState<{ room: RoomKey; slot: PickedSlot } | null>(null);
  const axisPct = (h: number) => gridRatio(dayjs.tz(`${date} ${String(h).padStart(2, "0")}:00`, "Asia/Taipei").valueOf(), date) * 100;

  return (
    <div className="font-live flex-1 min-h-0 overflow-y-auto bg-[#FFFAE8] flex flex-col">
      {/* 日期與摘要 */}
      <div className="h-[72px] shrink-0 flex items-center gap-4 px-7">
        <DarkArrow dir="prev" label="前一天" onClick={() => onChangeDay(-1)} />
        <span className="font-system text-[22px] text-[#4D4D4D] tabular-nums">
          {d.format("YYYY.MM.DD")} ({WEEK[d.day()]})
        </span>
        <span
          className={`text-[12.5px] px-2.5 py-[3px] rounded-full bg-white border ${
            offset === 0 ? "border-[#E6DFC5] text-[#4D4D4D]" : "border-[#F3D19A] text-[#C77700] font-semibold"
          }`}
        >
          {relativeDay(d, offset)}
        </span>
        <DarkArrow dir="next" label="後一天" onClick={() => onChangeDay(1)} />
        <span className="live-pill ml-auto h-[30px] px-[22px] rounded-full bg-[#FFEB83] flex items-center text-[14px] text-[#484848] tabular-nums">
          {liveSummary(overview, now, offset, updatedAt)}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-[18px] px-7 pb-6 pt-1 min-h-[560px]">
        {/* 三張會議室卡片 */}
        <div className="grid grid-cols-3 gap-[18px]">
          {overview.rooms.map((room) => {
            const status = statusOf(room, overview, offset, now);
            const theme = roomTheme[room.room];
            return (
              <div
                key={room.room}
                className="relative bg-white rounded-[22px] shadow-[0_2px_0_#E0E0E0] overflow-hidden flex flex-col transition-shadow hover:shadow-[0_2px_0_#E0E0E0,0_8px_20px_rgba(0,0,0,0.07)]"
              >
                {/* 整張卡片可點，進入該會議室的週檢視；立即預約按鈕疊在上面 */}
                <button
                  type="button"
                  onClick={() => onOpenRoom(room.room)}
                  aria-label={`查看 ${roomNames[room.room]} 的週檢視`}
                  className="absolute inset-0 z-[1]"
                />
                <div className="h-[132px] relative">
                  <img src={roomPhotos[room.room]} alt="" decoding="async" className="w-full h-full object-cover" />
                  <span className="absolute left-3.5 top-3.5 h-[26px] px-[11px] rounded-full bg-white/95 flex items-center gap-1.5 text-[12.5px] font-medium">
                    <i className="w-[7px] h-[7px] rounded-full" style={{ background: status.dot }} />
                    {status.text}
                  </span>
                </div>
                <div className="px-[18px] pt-3.5 pb-[18px] flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="h-[22px] px-3.5 rounded-full inline-flex items-center text-[13.5px] font-medium text-[#222]" style={{ background: theme.soft }}>
                      {roomNames[room.room]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[13px] text-[#4D4D4D]">
                      <Users className="w-[15px] h-[15px]" strokeWidth={1.75} aria-hidden="true" />
                      <span className="tabular-nums">{roomSeats[room.room]}</span>
                      <span className="sr-only">人</span>
                    </span>
                    <span className="ml-auto text-[12px] text-[#8A8A8A] hidden min-[1280px]:inline whitespace-nowrap">{roomEquipment[room.room]}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 min-h-[40px]">
                    <div className="basis-full min-[1280px]:basis-0 flex-1 min-w-0 text-[14px] text-[#1E293B] tabular-nums leading-snug">
                      {room.availability}
                      {room.quickBook && (
                        <span className="block text-[12px] text-[#8A8A8A] mt-0.5">
                          最近空檔 {room.quickBook.startTime}–{room.quickBook.endTime}
                        </span>
                      )}
                    </div>
                    {room.quickBook && (
                      <button
                        type="button"
                        onClick={() => onQuickBook(room.room, room.quickBook!)}
                        aria-label={`立即預約 ${roomNames[room.room]}（${room.quickBook.startTime}–${room.quickBook.endTime}）`}
                        className="relative z-[2] shrink-0 ml-auto h-[34px] px-4 inline-flex items-center gap-1 rounded-full bg-[#FF9114] hover:bg-[#F28100] text-white text-[13.5px] font-medium shadow-[0_3px_6px_rgba(255,145,20,0.30)] active:scale-95 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
                        立即預約
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 當日時間軸 */}
        <div className="flex-1 bg-white rounded-[22px] shadow-[0_2px_0_#E0E0E0] px-[22px] pt-[18px] pb-4 flex flex-col min-h-[300px]">
          <h2 className="text-[15px] font-bold flex items-baseline gap-2.5 m-0">
            {offset === 0 ? "今日" : relativeDay(d, offset)}時間軸
            <small className="text-[12px] font-normal text-[#8A8A8A]">點空白處直接預約該時段，點會議看詳細資料</small>
          </h2>
          <div className="flex-1 grid grid-cols-[112px_1fr] grid-rows-[22px_repeat(3,minmax(0,1fr))] mt-3.5">
            <div />
            <div className="relative text-[12px] text-[#9A9A9A] tabular-nums">
              {AXIS_HOURS.map((h) => (
                <span key={h} className="absolute -translate-x-1/2" style={{ left: `${axisPct(h)}%` }}>
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
            {overview.rooms.map((room) => {
              const theme = roomTheme[room.room];
              const busy = room.slots.map(({ start, end }) => ({ start, end }));
              const preview = hover?.room === room.room ? hover.slot : null;
              return (
                <div key={room.room} className="contents">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium border-t border-[#ECECEC]">
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: theme.main }} />
                    {roomNames[room.room]}
                  </div>
                  <div
                    className="relative border-t border-[#ECECEC] cursor-pointer"
                    onMouseMove={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const slot = pickSlot(date, (e.clientX - r.left) / r.width, busy, now);
                      setHover(slot ? { room: room.room, slot } : null);
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const slot = pickSlot(date, (e.clientX - r.left) / r.width, busy, now);
                      if (slot) onQuickBook(room.room, { startTime: slot.startTime, endTime: slot.endTime });
                    }}
                  >
                    {AXIS_HOURS.map((h) => (
                      <div key={h} className="absolute inset-y-0 border-l border-[#F1F1F1]" style={{ left: `${axisPct(h)}%` }} />
                    ))}
                    {preview && (
                      <div
                        className="absolute top-2.5 bottom-2.5 rounded-xl border-[1.5px] border-dashed border-[#E4D29A] bg-[#FFFAE8]/60 flex items-center justify-center gap-1 text-[12px] text-[#A88A2C] pointer-events-none whitespace-nowrap overflow-hidden"
                        style={{
                          left: `${gridRatio(preview.start, date) * 100}%`,
                          width: `${(gridRatio(preview.end, date) - gridRatio(preview.start, date)) * 100}%`,
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                        {preview.startTime}–{preview.endTime}
                      </div>
                    )}
                    {room.slots.map(({ start, end, meeting }) => {
                      const left = gridRatio(start, date);
                      const width = gridRatio(end, date) - left;
                      return (
                        <button
                          key={meeting.id}
                          type="button"
                          onMouseMove={(e) => {
                            e.stopPropagation();
                            setHover(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenMeeting(meeting);
                          }}
                          className="absolute top-2.5 bottom-2.5 rounded-xl px-3 py-1.5 text-left overflow-hidden text-[12.5px] leading-[1.35] transition hover:shadow-md hover:brightness-[0.98]"
                          style={{
                            left: `calc(${left * 100}% + 1px)`,
                            width: `calc(${width * 100}% - 2px)`,
                            background: theme.soft,
                            boxShadow: `inset 3px 0 0 ${theme.bar}`,
                            opacity: end <= now ? 0.45 : 1,
                          }}
                        >
                          <span className="block text-[13.5px] font-medium text-[#212529] truncate">{meetingTitle(meeting.title)}</span>
                          {/* 窄螢幕上一小時以內的會議只放得下名稱 */}
                          <span className={`text-[#555] tabular-nums truncate ${end - start < 90 * 60_000 ? "hidden min-[1440px]:block" : "block"}`}>
                            {taipeiHHmm(start)}–{taipeiHHmm(end)}
                          </span>
                          <span className={`text-[#555] truncate ${end - start < 90 * 60_000 ? "hidden min-[1280px]:block" : "block"}`}>
                            {meeting.user.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopLive;
