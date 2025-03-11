// src/components/ConfirmationModal.tsx
import React from "react";
import { HelpCircle } from "lucide-react";

interface ConfirmationModalProps {
  show: boolean;
  title: string;
  message: string;
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
  message,
  confirmLabel = "確定",
  cancelLabel = "取消",
  confirmColor = "bg-red-500",
  iconColor = "bg-red-500",
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-lg w-80 p-5">
        {/* 关闭按钮 */}
        <button
          className="absolute top-3 right-3 text-gray-500"
          onClick={onCancel}
        >
          ✕
        </button>

        {/* 图标 */}
        <HelpCircle
          className={`w-12 h-12 text-white flex items-center justify-center rounded mx-auto mb-3 ${iconColor}`}/>

        {/* 标题 */}
        <h2 className="text-lg font-semibold text-center mb-2">{title}</h2>

        {/* 消息内容 */}
        <p className="text-gray-600 text-center">{message}</p>

        {/* 按钮区域 */}
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
