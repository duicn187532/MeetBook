import { useMemo } from "react";
import { CalendarPlus } from "lucide-react";
import { BookingForCalendar, bookingEvent, icsFile, icsFileName } from "../utils/calendar";

// 加到行事曆：一個日曆小圖示，點一下就以手機的分享選單送出 .ics 行事曆檔
// （可寄到公司信箱加入公司行事曆；iPhone 也可直接加入手機行事曆）。
// 不支援分享檔案時（電腦、部分 Android 瀏覽器）改為下載檔案。只顯示圖示，不加文字說明。

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

// position 決定圖示在視窗左上角或右上角
const AddToCalendar = ({
  booking,
  position,
}: {
  booking: Omit<BookingForCalendar, "website">;
  position: "top-left" | "top-right";
}) => {
  const event = useMemo(() => bookingEvent({ ...booking, website: websiteUrl() }), [booking]);

  async function shareIcs() {
    const file = new File([icsFile(event)], icsFileName(event.start), { type: "text/calendar" });
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 使用者關閉分享選單
      }
    }
    download(file);
  }

  return (
    <button
      type="button"
      onClick={shareIcs}
      className={`absolute z-20 top-3 ${position === "top-left" ? "left-3" : "right-3"} w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100`}
      aria-label="分享 ics 行事曆檔"
      title="分享 ics 行事曆檔"
    >
      <CalendarPlus size={20} />
    </button>
  );
};

export default AddToCalendar;
