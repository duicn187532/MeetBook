import React, { useEffect, useRef, useState } from "react";
import { CalendarPlus, Share2 } from "lucide-react";
import { calendarFileUrl, calendarGoogleUrl, calendarPageUrl, fetchCalendarFile } from "../api/meetingApi";

// 加入行事曆：一個日曆小圖示，點了展開三個選項（只顯示圖示與選項名稱，不加文字說明）
// - 加入行事曆：iPhone 以檔案內容開啟（網址形式的 .ics 會被 iOS 當成「訂閱行事曆」）；
//   LINE 內建瀏覽器打不開 .ics，改用手機預設瀏覽器開啟這筆預約的資訊頁；電腦等其他裝置下載 .ics 後點開
// - Google：Google 行事曆新增活動頁（一定是新增單一活動）
// - 分享 ics：以手機的分享選單送出 .ics（例如寄到公司信箱）；不支援分享檔案時（電腦、部分 Android）改為下載
// position 決定圖示在視窗左上角或右上角，選單也跟著靠左或靠右。

const UA = navigator.userAgent;
const IN_LINE = / Line[/]/i.test(UA);
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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

  async function addToCalendar(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!IN_LINE && !IS_IOS) {
      setOpen(false); // 照連結下載 .ics
      return;
    }
    e.preventDefault();
    setOpen(false);
    if (IN_LINE) {
      window.location.href = calendarPageUrl(bookingId);
      return;
    }
    try {
      const file = ready.current ?? (await (fileRef.current ?? fetchCalendarFile(bookingId)));
      window.location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(await file.text());
    } catch {
      window.location.href = calendarFileUrl(bookingId);
    }
  }

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
          <a className={itemClass} href={calendarFileUrl(bookingId)} onClick={addToCalendar}>
            <CalendarPlus size={16} className="shrink-0" />
            加入行事曆
          </a>
          <a className={itemClass} href={calendarGoogleUrl(bookingId)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
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
