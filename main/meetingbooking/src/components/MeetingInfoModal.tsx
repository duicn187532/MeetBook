import { Info} from "lucide-react";
import dayjs from "dayjs";
import { MeetingInfo } from "../types/common";

interface MeetingInfoModalProps {
  show: boolean;                // 控制此 Modal 是否顯示
  onClose: () => void;          // 點擊背景或取消按鈕後關閉
  meetingInfo: MeetingInfo | null;  // 傳入要顯示的會議資料
  onCancel: () => void;         // 點擊「刪除」時執行的回呼函式
  onOpenEditModal: (info: any) => void; // <--- 新增這個 callback
  onEditPassword: (value: string) => void;
}

const MeetingInfoModal = ({
  show,
  onClose,
  meetingInfo,
  onCancel,
  onOpenEditModal,
  onEditPassword,
}: MeetingInfoModalProps) => {
  // 若未指定 show 或 meetingInfo 為 null，則不顯示 Modal
  if (!show || !meetingInfo) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* 半透明背景，點擊可關閉 */}
      <div
        className="absolute inset-0 bg-black opacity-50"
        onClick={onClose}
      ></div>

      {/* Modal 主體 */}
      <div className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-full m-8">
        {/* 關閉按鈕 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 transition"
        >
          X
        </button>
        {/* Modal 頂部：圖示與標題 */}
        <div className="flex flex-col items-center">
          <div className="bg-yellow-400 w-12 h-12 flex items-center justify-center rounded-2xl">
            <Info className="text-white w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mt-2">預約資訊</h3>
        </div>

        {/* 內容區塊 */}
        <div className="mt-4 space-y-3 font-semibold">
          <div>
            <label className="block font-semibold text-gray-600 mb-1">預約者</label>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm">{meetingInfo.user}</div>
          </div>
          <div>
            <label className="block font-semibold text-gray-600 mb-1">會議室</label>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm" >{meetingInfo.room}</div>
          </div>
          <div>
            <label className="block font-semibold text-gray-600 mb-1">會議名稱</label>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm">{meetingInfo.title}</div>
          </div>
          <div>
            <label className="block font-semibold text-gray-600 mb-1">與會人數</label>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm">{meetingInfo.participantsNum}</div>
          </div>
          <div>
            <label className="block font-semibold text-gray-600 mb-1">使用時間</label>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm mb-1">{meetingInfo.date}</div>
            <div className="w-full font-normal border rounded px-2 py-1 text-sm">{dayjs.utc(meetingInfo.startTime).tz("Asia/Taipei").format("HH:mm")} ~ {dayjs.utc(meetingInfo.endTime).tz("Asia/Taipei").format("HH:mm")}</div>
          </div>
          <div>
            <label className="block font-semibold text-gray-600 mb-1">編輯密碼</label>
            <input 
            className="w-full border font-normal rounded px-2 py-1 text-sm" 
            placeholder="請輸入您設定的編輯密碼"
            onChange={(e) => onEditPassword(e.target.value ? e.target.value : "")}/>
          </div>

        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-between items-center mt-6">
          <button
            className="border-2 border-[#DFBB00] bg-white rounded-xl w-full mx-2 py-2 text-sm text-gray-700"
            onClick={onCancel}
          >
            <span>刪除</span>
          </button>
          <button
            className="bg-yellow-300 rounded-xl mx-2 w-full py-2 text-sm"
            onClick={() => onOpenEditModal(meetingInfo)}
          >
            <span>修改</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingInfoModal;
