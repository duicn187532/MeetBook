import React from "react";
import { Check, MessageSquareX } from "lucide-react";

interface AlertModalProps {
  type: "success" | "error";
  title: string;
  message?: string;
  onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ type, title, message, onClose }) => {
  const styles = {
    success: {
      bg: "bg-[#87CA5A]",
      text: "text-gray-800",
      icon: <Check className="w-8 h-8 text-white" />,
    },
    error: {
      bg: "bg-[#1E293B]",
      text: "text-gray-900",
      icon: <MessageSquareX className="w-8 h-8 text-white" />,
    },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* 半透明背景 */}
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

      {/* Modal 本體 */}
      <div className="relative bg-white p-6 rounded-2xl shadow-lg z-10 w-80 text-center">
        {/* 圖示區域 */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mx-auto ${styles[type].bg}`}>
          {styles[type].icon}
        </div>

        {/* 標題 */}
        <h2 className={`text-xl font-semibold mt-3 ${styles[type].text}`}>{title}</h2>

        {/* 訊息 */}
        {message && <p className="text-gray-500 text-sm mt-1">{message}</p>}

        {/* 按鈕 */}
        <button
          onClick={onClose}
          className="mt-4 bg-gray-300 text-gray-800 rounded-lg px-5 py-2 text-sm w-full"
        >
          確定
        </button>
      </div>
    </div>
  );
};

export default AlertModal;
