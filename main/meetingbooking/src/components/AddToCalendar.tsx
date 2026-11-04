import { CalendarPlus } from "lucide-react";
import { calendarFileUrl } from "../api/meetingApi";

// 加入行事曆：一個日曆小圖示，點一下開啟這筆預約的 .ics 行事曆檔（由後端 /cal/:id.ics 產生）。
// iPhone 會顯示「加入行事曆」；電腦下載後點開即可加入 Outlook 等公司行事曆；部分 Android 內建行事曆可直接開啟。
// 只顯示圖示，不加文字說明；position 決定圖示在視窗左上角或右上角。
const AddToCalendar = ({ bookingId, position }: { bookingId: string; position: "top-left" | "top-right" }) => (
  <a
    href={calendarFileUrl(bookingId)}
    className={`absolute z-20 top-3 ${position === "top-left" ? "left-3" : "right-3"} w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100`}
    aria-label="加入行事曆"
    title="加入行事曆"
  >
    <CalendarPlus size={20} />
  </a>
);

export default AddToCalendar;
