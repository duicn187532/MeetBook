import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface NoticeDialogProps {
  icon: LucideIcon;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// 公告與更新日誌共用的視窗外框：內容較長時在視窗內捲動
const NoticeDialog = ({ icon: Icon, title, onClose, children }: NoticeDialogProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* 半透明背景，點擊可關閉 */}
    <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-title"
      className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-full max-w-sm m-8 flex flex-col max-h-[80vh]"
    >
      <div className="flex flex-col items-center">
        <div className="bg-[#F08B42] w-12 h-12 flex items-center justify-center rounded-2xl">
          <Icon className="text-white w-6 h-6" />
        </div>
        <h3 id="notice-title" className="text-lg font-semibold mt-2">{title}</h3>
      </div>

      <div className="mt-3 overflow-y-auto overscroll-contain flex-1 min-h-0 pr-1 space-y-4">{children}</div>

      {/* 尾：聯絡窗口 */}
      <p className="mt-3 text-center text-xs text-gray-500">
        有問題或建議，請聯繫負責人 <span className="font-semibold text-gray-700">#51164 祐晨</span>
      </p>

      <button onClick={onClose} className="mt-2 bg-[#F08B42] text-white rounded-xl w-full py-2 text-sm">
        知道了
      </button>
    </div>
  </div>
);

export default NoticeDialog;
