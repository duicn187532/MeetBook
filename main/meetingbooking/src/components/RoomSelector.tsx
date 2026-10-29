import { RoomKey, roomNames } from "../types/common";

interface RoomSelectorProps {
  selectedRoom: string;
  onSelectRoom: (room: RoomKey) => void;
  todayMode: boolean;
  onSelectToday: () => void;
}

const roomStyle: Record<RoomKey, string> = {
  A101: "bg-[#60AAFF] text-white",
  A102: "bg-[#FF3F3F] text-white",
  A103: "bg-[#17C2B6] text-white",
}

const rooms: RoomKey[] = ["A101", "A102", "A103"];

const RoomSelector = ({ selectedRoom, onSelectRoom, todayMode, onSelectToday }: RoomSelectorProps) => (
  <div className="flex bg-white mt-1 pl-5 pr-4 drop-shadow-xs border-b">
    {rooms.map((room) => {
      const selectedClasses =
        !todayMode && selectedRoom === room ? roomStyle[room] : "bg-gray-100 text-gray-700";
      return (
        <button
          key={room}
          onClick={() => setTimeout(()=>{
            onSelectRoom(room);
          }, 200)}
          className={`flex-1 py-2 text-center rounded-t-xl ${selectedClasses}`}
        >
          {roomNames[room]}
        </button>
      );
    })}
    {/* Today 分頁（實驗性功能）：一次查看三間會議室今天的狀況 */}
    <button
      onClick={() => setTimeout(onSelectToday, 200)}
      aria-current={todayMode ? "page" : undefined}
      className={`w-20 ml-2 py-2 text-center rounded-t-xl ${todayMode ? "bg-[#3F3F3F] text-white" : "bg-gray-100 text-gray-700"}`}
    >
      Today
    </button>
  </div>
);

export default RoomSelector;
