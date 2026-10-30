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

const RoomSelector = ({ selectedRoom, onSelectRoom, todayMode, onSelectToday }: RoomSelectorProps) => (
  <div className="font-live flex gap-1 bg-white mt-2 px-4 border-b border-[#EFE9D2]">
    {/* LIVE：一次查看三間會議室某一天的狀況 */}
    <button
      onClick={() => setTimeout(onSelectToday, 200)}
      aria-current={todayMode ? "page" : undefined}
      className={`flex-1 py-2.5 rounded-t-xl inline-flex items-center justify-center gap-1.5 text-[15px] font-bold tracking-wider ${
        todayMode ? "bg-[#F5D46B] text-white [text-shadow:0_1px_1px_rgba(150,110,0,0.25)]" : "bg-gray-100 text-gray-700"
      }`}
    >
      <span className="relative flex w-2 h-2" aria-hidden="true">
        {todayMode && <span className="absolute inset-0 rounded-full bg-[#3BFF7A] opacity-70 animate-ping" />}
        <span className="relative w-2 h-2 rounded-full live-dot" />
      </span>
      LIVE
    </button>
    {rooms.map((room) => {
      const selectedClasses = !todayMode && selectedRoom === room ? roomStyle[room] : "bg-gray-100 text-gray-700";
      return (
        <button
          key={room}
          onClick={() => setTimeout(() => onSelectRoom(room), 200)}
          className={`flex-1 py-2.5 text-center text-[15px] font-medium rounded-t-xl ${selectedClasses}`}
        >
          {roomNames[room]}
        </button>
      );
    })}
  </div>
);

export default RoomSelector;
