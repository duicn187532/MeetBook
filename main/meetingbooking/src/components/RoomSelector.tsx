import { RoomKey } from "../types/common";

interface RoomSelectorProps {
  selectedRoom: string;
  onSelectRoom: (room: string) => void;
}

const roomInfo: Record<RoomKey, any> = {
  A101: {name: "Alpha", style: "bg-blue-500 text-white",},
  A102: {name: "Beta", style:"bg-red-500 text-white",},
  A103: {name: "StartUp", style:"bg-[#17C2B6] text-white",},
};

const rooms: RoomKey[] = ["A101", "A102", "A103"];

const RoomSelector = ({ selectedRoom, onSelectRoom }: RoomSelectorProps) => (
  <div className="flex bg-white mt-1 pl-5 pr-28 drop-shadow-xs border-b">
    {rooms.map((room) => {
      const selectedClasses =
        selectedRoom === room ? roomInfo[room].style : "bg-gray-100 text-gray-700";
      return (
        <button
          key={room}
          onClick={() => onSelectRoom(room)}
          className={`flex-1 py-2 text-center rounded-t-xl ${selectedClasses}`}
        >
          {roomInfo[room].name}
        </button>
      );
    })}
  </div>
);

export default RoomSelector;
