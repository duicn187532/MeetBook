import React from "react";
import { HelpCircle } from "lucide-react";

interface ConfirmationModalProps {
  show: boolean;
  title: string;
  // message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  iconColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  show,
  title,
  // message,
  confirmLabel = "確定",
  cancelLabel = "取消",
  confirmColor = "bg-red-500",
  iconColor = "text-red-500",
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* 修正：讓 overlay 正確顯示 */}
      <div className="fixed inset-0 bg-black opacity-50 z-40" onClick={onCancel}></div>

      {/* 修正：確保 modal 在 overlay 之上，並調整大小 */}
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm m-8 p-5 z-50 relative">
        
        {/* 修正：確保 HelpCircle 圖示顯示正確 */}
        <HelpCircle className={`p-3 w-12 h-12 ${iconColor} text-white mx-auto mb-4 rounded-xl`} />

        {/* 標題 */}
        <h2 className="text-lg font-semibold text-center mb-4">{title}</h2>

        {/* 訊息 */}
        {/* <p className="text-gray-600 text-center">{message}</p> */}

        {/* 按鈕 */}
        <div className="flex justify-around mt-4">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded w-24"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`px-4 py-2 text-white rounded w-24 ${confirmColor}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
