import { Info, Trash2, Edit } from "lucide-react";

interface MeetingInfo {
  user: string;  // 預約者
  room: string;       // 會議室
  title: string;      // 會議名稱
  date: string;       // "YYYY-MM-DD"
  startTime: string;  // "HH:mm"
  endTime: string;    // "HH:mm"
  // 如果需要更多欄位可自行加上
}

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
      <div className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-80">
        {/* Modal 頂部：圖示與標題 */}
        <div className="flex flex-col items-center">
          <div className="bg-yellow-400 w-12 h-12 flex items-center justify-center rounded-2xl">
            <Info className="text-white w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mt-2">預約資訊</h3>
        </div>

        {/* 內容區塊 */}
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-gray-600 mb-1">預約者</label>
            <div className="w-full border rounded px-2 py-1 text-sm">{meetingInfo.user}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">會議室</label>
            <div className="w-full border rounded px-2 py-1 text-sm" >{meetingInfo.room}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">會議名稱</label>
            <div className="w-full border rounded px-2 py-1 text-sm">{meetingInfo.title}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">使用時間</label>
            <p className="text-sm text-gray-700">
              {meetingInfo.date} {meetingInfo.startTime} ~ {meetingInfo.endTime}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">編輯密碼</label>
            <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="未輸入則任何人皆可編輯"
            onChange={(e) => onEditPassword(e.target.value ? e.target.value : "")}/>
          </div>

        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-between items-center mt-6">
          <button
            className="bg-gray-300 border border-gray-300 rounded-xl w-full mx-2 py-2 text-sm text-gray-700"
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
