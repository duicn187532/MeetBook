// src/components/RoomSelector.tsx

interface RoomSelectorProps {
  selectedRoom: string;
  onSelectRoom: (room: string) => void;
}

const RoomSelector = ({ selectedRoom, onSelectRoom }: RoomSelectorProps) => (
  <div className="flex bg-white mt-1">
    {["A101", "A102", "A103"].map((room) => (
      <button
        key={room}
        onClick={() => onSelectRoom(room)}
        className={`flex-1 py-2 text-center ${
          selectedRoom === room ? "bg-red-500 text-white" : "bg-gray-100 text-gray-700"
        }`}
      >
        {room}
      </button>
    ))}
  </div>
);

export default RoomSelector;
