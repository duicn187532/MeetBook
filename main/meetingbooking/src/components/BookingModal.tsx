import { useEffect } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { TimePicker } from "@mui/x-date-pickers";
import { BookingForm } from "../types/common";

interface BookingModalProps {
  bookingForm: BookingForm
  setBookingForm: (form: any) => void;
  errorMessage: string;
  onSubmit: () => void;
  onClose: () => void;
}

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");



const BookingModal = ({
  bookingForm,
  setBookingForm,
  errorMessage,
  onSubmit,
  onClose,
}: BookingModalProps) => {
  const defaultStart = dayjs();
  const defaultEnd = defaultStart.add(1, "hour");

  useEffect(() => {
    setBookingForm((prev: any) => ({
      ...prev,
      startTime: defaultStart.format("HH:mm"),
      endTime: defaultEnd.format("HH:mm"),
    }));
  }, []);

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

        <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-lg p-4 m-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center my-1">
            <button className="bg-[#F08B42] w-12 h-12 rounded-2xl flex items-center justify-center">
              <span className="text-white text-4xl leading-none">+</span>
            </button>
          </div>

          <h2 className="text-xl font-bold text-center mb-4">新增預約</h2>

          {/* 預約者 */}
          <div className="mb-2">
            <label className="block text-sm mb-1">預約者</label>
            <input
              type="text"
              value={bookingForm.user}
              onChange={(e) => setBookingForm((prev: any) => ({ ...prev, user: e.target.value }))}
              placeholder="請輸入您的行編與分機"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div className="flex space-x-2 mb-3">
            {/* 會議室 */}
            <div className="flex-1">
              <label className="block text-sm mb-1">會議室</label>
              <select
                value={bookingForm.room}
                onChange={(e) => setBookingForm((prev: any) => ({ ...prev, room: e.target.value }))}
                className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">請選擇要預約的會議室</option>
                <option value="A101">Alpha</option>
                <option value="A102">Beta</option>
                <option value="A103">StartUp</option>
              </select>
            </div>

            {/* 會議人數 */}
            <div className="flex-1">
              <label className="block text-sm mb-1">與會人數</label>
              <input
                type="number"
                value={bookingForm.participantsNum}
                onChange={(e) =>
                  setBookingForm((prev: any) => ({ ...prev, participantsNum: e.target.valueAsNumber }))
                }
                placeholder="請輸入與會人數"
                className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>


          {/* 會議名稱 */}
          <div className="mb-2">
            <label className="block text-sm mb-1">會議名稱</label>
            <input
              type="text"
              value={bookingForm.title}
              onChange={(e) =>
                setBookingForm((prev: any) => ({ ...prev, title: e.target.value }))
              }
              placeholder="請輸入會議主題"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {/* 日期 */}
          <div className="mb-2">
            <label className="block text-sm mb-1">使用日期</label>
            <input
              type="date"
              value={bookingForm.selectedDate}
              onChange={(e) => setBookingForm((prev: any) => ({ ...prev, selectedDate: e.target.value }))}
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {/* 時間選擇區塊 */}
          <div className="flex space-x-2 mb-2">
            {/* 開始時間 */}
            <div className="flex-1">
              <label className="block text-sm mb-1">開始時間</label>
              <TimePicker
              value={dayjs.tz(`1970-01-01T${bookingForm.startTime}`, "Asia/Taipei")}
              onChange={(newTime) => {
                if (newTime) {
                  setBookingForm((prev: any) => ({
                    ...prev,
                    startTime: newTime.format("HH:mm"),
                  }));
                }
              }}
              ampm={false}
              minTime={dayjs().hour(8).minute(45)}
              maxTime={dayjs().hour(18).minute(15)}
              desktopModeMediaQuery="(max-width: 9999px)"
              timeSteps={{ hours: 1, minutes: 1 }}
              // slotProps={{
              //   paper: {
              //     sx: {
              //       backgroundColor: '#f0f0f0', // 修改這裡以變更背景色
              //     },
              //   },
              // }}
            />
          </div>

          {/* 結束時間 */}
          <div className="flex-1">
            <label className="block text-sm mb-1">結束時間</label>
              <TimePicker
                value={dayjs.tz(`1970-01-01T${bookingForm.endTime}`, "Asia/Taipei")}
                onChange={(newTime) => {
                  if (newTime) {
                    setBookingForm((prev: any) => ({
                      ...prev,
                      endTime: newTime.format("HH:mm"),
                    }));
                  }
                }}
                ampm={false}
                minTime={dayjs().hour(8).minute(45)}
                maxTime={dayjs().hour(18).minute(15)}
                desktopModeMediaQuery="(max-width: 9999px)"
                timeSteps={{ hours: 1, minutes: 1 }}
                // slotProps={{
                //   paper: {
                //     sx: {
                //       backgroundColor: '#f0f0f0', // 同上
                //     },
                //   },
                // }}
              />
            </div>
          </div>

        {/* 刪除密碼欄位 */}
        <div className="mb-2">
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
          {errorMessage && <p className="text-sm text-red-500 mt-2">{errorMessage}</p>}

          {/* 底部按鈕 */}
          <div className="flex justify-between mt-4">
            <button onClick={onClose} className="bg-gray-300 border border-gray-300 rounded-xl w-full mx-2 py-2 text-sm text-gray-700">
              取消
            </button>
            <button onClick={onSubmit} className="bg-[#F08B42] text-white rounded-xl mx-2 w-full py-2 text-sm">
              預定
            </button>
          </div>
        </div>
      </div>
  );
};

export default BookingModal;
