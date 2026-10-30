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
};

const rooms: RoomKey[] = ["A101", "A102", "A103"];

// 四個分頁等寬、滿版，下緣一條灰線
const RoomSelector = ({ selectedRoom, onSelectRoom, todayMode, onSelectToday }: RoomSelectorProps) => (
  <div className="font-live flex gap-px bg-white mt-3 border-b border-[#B3B3B3]">
    {/* LIVE：一次查看三間會議室某一天的狀況 */}
    <button
      onClick={() => setTimeout(onSelectToday, 200)}
      aria-current={todayMode ? "page" : undefined}
      className={`flex-1 h-[43px] rounded-t-[12px] inline-flex items-center justify-center gap-2 text-[15px] font-bold tracking-wide ${
        todayMode ? "bg-[#FFC31D] text-white" : "bg-[#EAEAEA] text-[#222222]"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full live-dot" aria-hidden="true" />
      LIVE
    </button>
    {rooms.map((room) => {
      const selectedClasses = !todayMode && selectedRoom === room ? roomStyle[room] : "bg-[#EAEAEA] text-[#222222]";
      return (
        <button
          key={room}
          onClick={() => setTimeout(() => onSelectRoom(room), 200)}
          className={`flex-1 h-[43px] text-center text-[15px] rounded-t-[12px] ${selectedClasses}`}
        >
          {roomNames[room]}
        </button>
      );
    })}
  </div>
);

export default RoomSelector;
