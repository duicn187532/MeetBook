// 電腦版日／週檢視：一天一欄，08:45 ~ 18:15 整天放進一個畫面
// 點會議看詳細資料；滑鼠移到空白處會出現建議時段，點下去直接預約
import { useState } from "react";
import dayjs from "dayjs";
import { Plus } from "lucide-react";
import { Meeting, RoomKey } from "../../types/common";
import useNow from "../../hooks/useNow";
import { taipeiHHmm } from "../../utils/bookingHelpers";
import { gridRatio, GRID_SPAN_MIN, GRID_START_MIN, pickSlot, PickedSlot } from "./slots";
import { meetingTitle, roomTheme, WEEK } from "./theme";

interface TimeGridProps {
  room: RoomKey;
  days: dayjs.Dayjs[];
  meetings: Meeting[]; // 這間會議室的預約
  onOpenMeeting: (meeting: Meeting) => void;
  onPickSlot: (date: string, times: { startTime: string; endTime: string }) => void;
}

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const pct = (minuteOfDay: number) => ((minuteOfDay - GRID_START_MIN) / GRID_SPAN_MIN) * 100;

const TimeGrid = ({ room, days, meetings, onOpenMeeting, onPickSlot }: TimeGridProps) => {
  const theme = roomTheme[room];
  const now = useNow(true);
  const today = dayjs(now).tz("Asia/Taipei").format("YYYY-MM-DD");
  const [hover, setHover] = useState<{ date: string; slot: PickedSlot } | null>(null);

  return (
    <div className="flex-1 min-h-[520px] flex flex-col">
      {/* 日期列（日檢視的日期已在上方標頭，不重複顯示，只留一點上緣空間） */}
      {days.length === 1 ? (
        <div className="h-4 shrink-0" />
      ) : (
      <div className="flex h-[58px] shrink-0 border-b border-[#ECECEC]">
        <div className="w-16 shrink-0" />
        {days.map((d) => {
          const isToday = d.format("YYYY-MM-DD") === today;
          return (
            <div
              key={d.format("YYYY-MM-DD")}
              className={`flex-1 min-w-0 border-l border-[#ECECEC] flex items-center justify-center gap-2 text-[13px] ${
                isToday ? "text-[#FF3F3F] font-medium" : "text-[#4D4D4D]"
              }`}
            >
              週{WEEK[d.day()]}
              <span
                className={`tabular-nums ${
                  isToday
                    ? "w-[34px] h-[34px] rounded-full bg-[#FF3F3F] text-white grid place-items-center text-[17px]"
                    : "text-[20px] font-medium text-[#212529]"
                }`}
              >
                {d.date()}
              </span>
            </div>
          );
        })}
      </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 時間刻度 */}
        <div className="w-16 shrink-0 relative">
          {HOURS.map((h) => (
            <span
              key={h}
              className="absolute right-2.5 -translate-y-1/2 text-[11.5px] text-[#9A9A9A] tabular-nums"
              style={{ top: `${pct(h * 60)}%` }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {days.map((d) => {
          const date = d.format("YYYY-MM-DD");
          const dayMeetings = meetings
            .filter((m) => m.date === date)
            .map((m) => ({ m, start: Date.parse(m.startTime), end: Date.parse(m.endTime) }))
            .filter((x) => x.start < x.end);
          const busy = dayMeetings.map(({ start, end }) => ({ start, end }));
          const preview = hover?.date === date ? hover.slot : null;
          return (
            <div
              key={date}
              className={`flex-1 min-w-0 relative border-l border-[#ECECEC] cursor-pointer ${date === today ? "bg-[#FCFCFD]" : ""}`}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const slot = pickSlot(date, (e.clientY - r.top) / r.height, busy, now);
                setHover(slot ? { date, slot } : null);
              }}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const slot = pickSlot(date, (e.clientY - r.top) / r.height, busy, now);
                if (slot) onPickSlot(date, { startTime: slot.startTime, endTime: slot.endTime });
              }}
            >
              {HOURS.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-[#F0F0F0]" style={{ top: `${pct(h * 60)}%` }} />
              ))}
              {preview && (
                <div
                  className="absolute left-1.5 right-1.5 rounded-[10px] border-[1.5px] border-dashed flex items-center justify-center gap-1 text-[12.5px] pointer-events-none"
                  style={{
                    top: `calc(${gridRatio(preview.start, date) * 100}% + 2px)`,
                    height: `calc(${(gridRatio(preview.end, date) - gridRatio(preview.start, date)) * 100}% - 4px)`,
                    borderColor: theme.main,
                    color: theme.main,
                    background: `${theme.main}0F`,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                  預約 {preview.startTime}–{preview.endTime}
                </div>
              )}
              {dayMeetings.map(({ m, start, end }) => {
                const top = gridRatio(start, date);
                const height = gridRatio(end, date) - top;
                const minutes = (end - start) / 60_000;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onMouseMove={(e) => {
                      e.stopPropagation();
                      setHover(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMeeting(m);
                    }}
                    className="absolute left-1.5 right-1.5 rounded-[10px] px-2.5 py-1.5 text-left overflow-hidden text-[12px] leading-[1.4] border-l-4 transition hover:brightness-[0.97] hover:shadow-md"
                    style={{
                      top: `calc(${top * 100}% + 2px)`,
                      height: `calc(${height * 100}% - 4px)`,
                      background: theme.soft,
                      borderColor: theme.main,
                      opacity: end <= now ? 0.5 : 1,
                    }}
                  >
                    <span className="block text-[13px] font-medium text-[#212529] truncate">{meetingTitle(m.title)}</span>
                    {minutes >= 30 && (
                      <span className="block tabular-nums truncate" style={{ color: theme.ink }}>
                        {taipeiHHmm(start)}–{taipeiHHmm(end)}
                      </span>
                    )}
                    {minutes >= 45 && <span className="block text-[#555] truncate">{m.user.name}</span>}
                    {minutes >= 90 && m.user.group?.label && (
                      <span className="inline-block mt-1 text-[11px] px-[7px] rounded-md bg-white/70" style={{ color: theme.ink }}>
                        {m.user.group.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimeGrid;
