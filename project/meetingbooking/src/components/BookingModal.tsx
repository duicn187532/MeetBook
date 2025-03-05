// src/components/BookingModal.tsx

interface BookingModalProps {
    bookingForm: {
      title: string;
      user: string;
      selectedDate: string;
      startTime: string;
      endTime: string;
    };
    setBookingForm: (form: any) => void;
    errorMessage: string;
    onSubmit: () => void;
    onClose: () => void;
  }
  
  const BookingModal = ({
    bookingForm,
    setBookingForm,
    errorMessage,
    onSubmit,
    onClose,
  }: BookingModalProps) => {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div
          className="absolute inset-0 bg-black opacity-50"
          onClick={onClose}
        ></div>
        <div className="relative bg-white p-4 rounded shadow-lg z-10 w-80">
          <h3 className="text-lg font-semibold mb-2">預約表單</h3>
          <div className="mb-2">
            <label className="block text-xs">會議名稱</label>
            <input
              type="text"
              value={bookingForm.title || ""}
              onChange={(e) =>
                setBookingForm((prev: any) => ({ ...prev, title: e.target.value }))
              }
              className="border px-2 py-1 w-full text-xs"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs">使用者</label>
            <input
              type="text"
              value={bookingForm.user}
              onChange={(e) =>
                setBookingForm((prev: any) => ({ ...prev, user: e.target.value }))
              }
              className="border px-2 py-1 w-full text-xs"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs">日期</label>
            <input
              type="date"
              value={bookingForm.selectedDate}
              onChange={(e) =>
                setBookingForm((prev: any) => ({
                  ...prev,
                  selectedDate: e.target.value,
                }))
              }
              className="border px-2 py-1 w-full text-xs"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs">開始時間</label>
            <input
              type="time"
              value={bookingForm.startTime}
              onChange={(e) =>
                setBookingForm((prev: any) => ({ ...prev, startTime: e.target.value }))
              }
              className="border px-2 py-1 w-full text-xs"
              min="08:00"
              max="18:00"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs">結束時間</label>
            <input
              type="time"
              value={bookingForm.endTime}
              onChange={(e) =>
                setBookingForm((prev: any) => ({ ...prev, endTime: e.target.value }))
              }
              className="border px-2 py-1 w-full text-xs"
              min="08:00"
              max="18:00"
            />
          </div>
          {errorMessage && (
            <p className="text-xs text-red-500">{errorMessage}</p>
          )}
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs bg-gray-200 rounded"
            >
              取消
            </button>
            <button
              onClick={onSubmit}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded"
            >
              送出預約
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  export default BookingModal;
  