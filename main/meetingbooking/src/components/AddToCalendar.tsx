import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Share2 } from "lucide-react";
import { calendarFileUrl, calendarGoogleUrl, fetchCalendarFile } from "../api/meetingApi";

// 加入行事曆：一個日曆小圖示，點了展開三個選項（只顯示圖示與選項名稱，不加文字說明）。不會另開本系統的網頁。
// - 加入行事曆：在同一頁開啟這筆預約的 .ics（iPhone Safari 顯示行事曆畫面；電腦下載後點開）。
//   網址帶 openExternalBrowser=1：在 LINE 內建瀏覽器中直接交給手機預設瀏覽器開啟 .ics
// - Google：Google 行事曆新增活動頁；在 LINE 中同樣交給預設瀏覽器（才有已登入的 Google 帳號）
// - 分享 ics：以手機的分享選單送出 .ics（例如寄到公司信箱）；不支援分享檔案時（電腦、部分 Android）改為下載
// position 決定圖示在視窗左上角或右上角，選單也跟著靠左或靠右。

// LINE 內建瀏覽器只會攔截同一頁的網址切換；另開分頁（target=_blank）時改為同一頁開啟
const IN_LINE = / Line[/]/i.test(navigator.userAgent);

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

// Google 行事曆選項的圖示（單色 G，與其他圖示風格一致）
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 12h-8" />
  </svg>
);

const AddToCalendar = ({ bookingId, position }: { bookingId: string; position: "top-left" | "top-right" }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // 展開選單時先讀好 .ics：分享必須在點擊當下呼叫，等網路回應再分享會被瀏覽器擋下
  const fileRef = useRef<Promise<File> | null>(null);
  const ready = useRef<File | null>(null);

  useEffect(() => {
    fileRef.current = null;
    ready.current = null;
  }, [bookingId]);

  function preload() {
    if (fileRef.current) return;
    fileRef.current = fetchCalendarFile(bookingId);
    fileRef.current.then((f) => (ready.current = f)).catch(() => (fileRef.current = null));
  }

  // 點選單外面就收起
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function share() {
    try {
      const file = ready.current ?? (await (fileRef.current ?? fetchCalendarFile(bookingId)));
      if (canShareFile(file)) {
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
    } catch {
      // 讀取失敗時改為直接開啟行事曆檔
      window.location.href = calendarFileUrl(bookingId);
    }
  }

  const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 text-left hover:bg-gray-50";
  return (
    <div ref={menuRef} className={`absolute z-20 top-3 ${position === "top-left" ? "left-3" : "right-3"}`}>
      <button
        type="button"
        onClick={() => {
          preload();
          setOpen((v) => !v);
        }}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        aria-label="加入行事曆"
        aria-expanded={open}
        title="加入行事曆"
      >
        <CalendarPlus size={20} />
      </button>
      {open && (
        <div className={`absolute ${position === "top-left" ? "left-0" : "right-0"} top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden text-left`}>
          <a className={itemClass} href={calendarFileUrl(bookingId)} onClick={() => setOpen(false)}>
            <CalendarPlus size={16} className="shrink-0" />
            加入行事曆
          </a>
          <a
            className={itemClass}
            href={calendarGoogleUrl(bookingId)}
            {...(IN_LINE ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            onClick={() => setOpen(false)}
          >
            <GoogleIcon />
            Google
          </a>
          <button type="button" className={itemClass} onClick={share}>
            <Share2 size={16} className="shrink-0" />
            分享 ics
          </button>
        </div>
      )}
    </div>
  );
};

export default AddToCalendar;
