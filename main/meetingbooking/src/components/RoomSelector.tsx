import { RoomKey, roomNames } from "../types/common";

interface RoomSelectorProps {
  selectedRoom: string;
  onSelectRoom: (room: RoomKey) => void;
}

const roomStyle: Record<RoomKey, any> = {
  A101: "bg-[#60AAFF] text-white",
  A102: "bg-[#FF3F3F] text-white",
  A103: "bg-[#17C2B6] text-white",
}

const rooms: RoomKey[] = ["A101", "A102", "A103"];

const RoomSelector = ({ selectedRoom, onSelectRoom }: RoomSelectorProps) => (
  <div className="flex bg-white mt-1 pl-5 pr-28 drop-shadow-xs border-b">
    {rooms.map((room) => {
      const selectedClasses =
        selectedRoom === room ? roomStyle[room] : "bg-gray-100 text-gray-700";
      return (
        <button
          key={room}
          onClick={() => onSelectRoom(room)}
          className={`flex-1 py-2 text-center rounded-t-xl ${selectedClasses}`}
        >
          {roomNames[room]}
        </button>
      );
    })}
  </div>
);

export default RoomSelector;
