import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Download } from "lucide-react";
import { BookingForCalendar, bookingEvent, googleCalendarUrl, icsFile, icsFileName } from "../utils/calendar";

// 加到行事曆（日曆圖示）：Google 行事曆用一鍵連結；「匯出 ics」以手機的分享選單送出 .ics 行事曆檔（可寄到公司信箱加入公司行事曆）。
// 不支援分享檔案時（電腦、部分 Android 瀏覽器）改為下載檔案，由使用者自行附加到信件。
// 只顯示圖示，不加文字說明。


const websiteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// 一個小日曆圖示；點了才展開兩個選項。position 決定圖示在視窗左上角或右上角，選單也跟著靠左或靠右
const AddToCalendar = ({
  booking,
  position,
}: {
  booking: Omit<BookingForCalendar, "website">;
  position: "top-left" | "top-right";
}) => {
  const event = useMemo(() => bookingEvent({ ...booking, website: websiteUrl() }), [booking]);
  const makeFile = () => new File([icsFile(event)], icsFileName(event.start), { type: "text/calendar" });
  const shareable = useMemo(() => canShareFile(new File([""], "meeting.ics", { type: "text/calendar" })), []);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 點選單外面就收起
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function sendToWork() {
    const file = makeFile();
    if (shareable && canShareFile(file)) {
      try {
        await navigator.share({ files: [file] });
        setOpen(false);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 使用者關閉分享選單
      }
    }
    download(file);
    setOpen(false);
  }

  const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 text-left hover:bg-gray-50";
  return (
    <div ref={menuRef} className={`absolute z-20 top-3 ${position === "top-left" ? "left-3" : "right-3"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        aria-label="加到行事曆"
        aria-expanded={open}
        title="加到行事曆"
      >
        <CalendarPlus size={20} />
      </button>
      {open && (
        <div className={`absolute ${position === "top-left" ? "left-0" : "right-0"} top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden text-left`}>
          <a className={itemClass} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <CalendarPlus size={16} className="shrink-0" />
            加到 Google 行事曆
          </a>
          <button type="button" className={itemClass} onClick={sendToWork}>
            <Download size={16} className="shrink-0" />
            匯出 ics
          </button>
        </div>
      )}
    </div>
  );
};

export default AddToCalendar;
