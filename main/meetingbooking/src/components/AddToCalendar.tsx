import { useMemo, useState } from "react";
import { CalendarPlus, Mail } from "lucide-react";
import { BookingForCalendar, bookingEvent, googleCalendarUrl, icsFile, icsFileName } from "../utils/calendar";

// 加到行事曆：Google 行事曆用一鍵連結；公司行事曆用手機的分享選單把 .ics 行事曆檔寄到公司信箱。
// 不支援分享檔案時（電腦、部分 Android 瀏覽器）改為下載檔案，由使用者自行附加到信件。

const SHARE_HINT = "會開啟手機的分享選單：選信箱 App 寄給自己的公司信箱，在公司信箱點開附件就能加入行事曆。";
const DOWNLOAD_HINT = "下載後在信箱 App 新增郵件、附加這個檔案，寄到公司信箱後點開附件就能加入行事曆。";
const DOWNLOADED_HINT = "已下載行事曆檔：在信箱 App 新增郵件、附加這個檔案，寄到公司信箱後點開附件就能加入行事曆。";

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

const AddToCalendar = ({ booking }: { booking: Omit<BookingForCalendar, "website"> }) => {
  const event = useMemo(() => bookingEvent({ ...booking, website: websiteUrl() }), [booking]);
  const makeFile = () => new File([icsFile(event)], icsFileName(event.start), { type: "text/calendar" });
  const shareable = useMemo(() => canShareFile(new File([""], "meeting.ics", { type: "text/calendar" })), []);
  const [hint, setHint] = useState(shareable ? SHARE_HINT : DOWNLOAD_HINT);

  async function sendToWork() {
    const file = makeFile();
    if (shareable && canShareFile(file)) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 使用者關閉分享選單
      }
    }
    download(file);
    setHint(DOWNLOADED_HINT);
  }

  const buttonClass =
    "flex flex-1 items-center justify-center gap-1 border-2 border-[#DFBB00] bg-white rounded-xl py-2 text-sm text-gray-700";
  return (
    <div className="mt-4 pt-3 border-t border-gray-200 text-center">
      <div className="text-sm font-semibold text-gray-600 mb-2">加到行事曆</div>
      <div className="flex gap-2">
        <a className={buttonClass} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
          <CalendarPlus size={16} />
          Google 行事曆
        </a>
        <button type="button" className={buttonClass} onClick={sendToWork}>
          <Mail size={16} />
          {shareable ? "寄到公司信箱" : "下載 .ics 檔"}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2 text-left">{hint}</p>
    </div>
  );
};

export default AddToCalendar;
