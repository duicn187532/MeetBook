// src/components/BookingModal.tsx
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import CustomTimeInput from "./CustomInput";
import { useEffect } from "react";

interface BookingModalProps {
  bookingForm: {
    title: string;
    user: string;
    room: string;
    selectedDate: string;
    startTime: string;
    endTime: string;
    editPassword: string;
  };
  setBookingForm: (form: any) => void;
  errorMessage: string;
  onSubmit: () => void;
  onClose: () => void;
}

// 輔助函式：將時間字串轉換成 Date 物件（使用固定日期作為基準）
const parseTime = (timeStr: string, defaultTime: Date): Date => {
  if (!timeStr) return defaultTime;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(1970, 0, 1, hours, minutes);
};

// 輔助函式：將 Date 物件轉換成 "HH:mm" 格式字串
const formatTime = (date: Date): string => {
  return date.toTimeString().slice(0, 5);
};

const BookingModal = ({
  bookingForm,
  setBookingForm,
  errorMessage,
  onSubmit,
  onClose,
}: BookingModalProps) => {
  const defaultStart = new Date();
  const defaultEnd = new Date(Date.now() + 3600000);

  useEffect(() => {
    // 將格式化後的時間字串存入狀態中，但保留 default*Date 為 Date 物件
    setBookingForm((prev: any) => ({
      ...prev,
      startTime: formatTime(defaultStart),
      endTime: formatTime(defaultEnd),
    }));
  }, []);


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

      {/* 表單容器 */}
      <div
        className="relative bg-white w-full max-w-sm rounded-2xl shadow-lg p-4"
        onClick={(e) => e.stopPropagation()} // 避免點擊表單本體關閉
      >
        {/* 頂部的「+」按鈕 */}
        <div className="flex justify-center my-1">
          <button className="bg-red-500 w-12 h-12 rounded-2xl flex items-center justify-center">
            <span className="text-white text-2xl leading-none">+</span>
          </button>
        </div>

        {/* 標題 */}
        <h2 className="text-xl font-bold text-center mb-4">新增預約</h2>

        {/* 預約者 */}
        <div className="mb-3">
          <label className="block text-sm mb-1">預約者</label>
          <input
            type="text"
            value={bookingForm.user}
            onChange={(e) =>
              setBookingForm((prev: any) => ({ ...prev, user: e.target.value }))
            }
            placeholder="請輸入您的姓名與分機"
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {/* 會議室 */}
        <div className="mb-3">
          <label className="block text-sm mb-1">會議室</label>
          <select
            value={bookingForm.room}
            onChange={(e) =>
              setBookingForm((prev: any) => ({ ...prev, room: e.target.value }))
            }
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          >
            <option value="">請選擇要預約的會議室</option>
            <option value="A101">A101</option>
            <option value="A102">A102</option>
            <option value="A103">A103</option>
          </select>
        </div>

        {/* 會議名稱 */}
        <div className="mb-3">
          <label className="block text-sm mb-1">會議名稱</label>
          <input
            type="text"
            // value={bookingForm.title}
            onChange={(e) =>
              setBookingForm((prev: any) => ({ ...prev, title: e.target.value }))
            }
            placeholder="請輸入會議主題"
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {/* 日期 */}
        <div className="mb-3">
          <label className="block text-sm mb-1">使用日期</label>
          <input
            type="date"
            value={bookingForm.selectedDate}
            onChange={(e) =>
              setBookingForm((prev: any) => ({
                ...prev,
                selectedDate: e.target.value,
              }))
            }
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {/* 時間選擇區塊 */}
        <div className="flex space-x-2 mb-3">
          {/* 開始時間 */}
          <div className="flex-1">
            <label className="block text-sm mb-1">開始時間</label>
            <DatePicker
              customInput={<CustomTimeInput />}
              shouldCloseOnSelect={true}
              selected={parseTime(bookingForm.startTime, defaultStart)}
              onChange={(date: Date | null) => {
                if (date) {
                  setBookingForm((prev: any) => ({
                    ...prev,
                    startTime: formatTime(date),
                  }));
                }
              }}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="HH:mm"
              minTime={new Date(1970, 0, 1, 8, 45)}
              maxTime={new Date(1970, 0, 1, 18, 15)}
              placeholderText="請選擇開始時間"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {/* 結束時間 */}
          <div className="flex-1">
            <label className="block text-sm mb-1">結束時間</label>
            <DatePicker
              customInput={<CustomTimeInput />}
              shouldCloseOnSelect={true}            
              selected={parseTime(bookingForm.endTime, defaultEnd)}
              onChange={(date: Date | null) => {
                if (date) {
                  setBookingForm((prev: any) => ({
                    ...prev,
                    endTime: formatTime(date),
                  }));
                }
              }}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="HH:mm"
              minTime={new Date(1970, 0, 1, 8, 45)}
              maxTime={new Date(1970, 0, 1, 18, 15)}
              placeholderText="請選擇結束時間"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>

        {/* 刪除密碼欄位 */}
        <div className="mb-3">
          <label className="block text-sm mb-1">編輯密碼</label>
          <input
            type="text"
            value={bookingForm.editPassword || ""}
            onChange={(e) =>
              setBookingForm((prev: any) => ({
                ...prev,
                editPassword: e.target.value,
              }))
            }
            placeholder="未輸入則任何人皆可編輯"
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {/* 錯誤訊息 */}
        {errorMessage && (
          <p className="text-sm text-red-500 mt-2">{errorMessage}</p>
        )}

        {/* 底部按鈕 */}
        <div className="flex justify-between mt-4">
          <button
            onClick={onClose}
            className="bg-gray-300 border border-gray-300 rounded-xl w-full mx-2 py-2 text-sm text-gray-700"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="bg-red-500 text-white rounded-xl mx-2 w-full py-2 text-sm"
          >
            預定
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingModal;
