// src/components/Equipment.tsx
import { Users, Monitor, Square } from "lucide-react";

const Equipment = () => (
  <div className="p-2 bg-white">
    <h2 className="text-xs text-gray-600 mb-1">設備</h2>
    <div className="flex space-x-4">
      <div className="flex items-center space-x-1">
        <Users className="w-4 h-4" />
        <span className="text-xs">20 Seats</span>
      </div>
      <div className="flex items-center space-x-1">
        <Monitor className="w-4 h-4" />
        <span className="text-xs">投影機</span>
      </div>
      <div className="flex items-center space-x-1">
        <Square className="w-4 h-4" />
        <span className="text-xs">Whiteboard</span>
      </div>
    </div>
  </div>
);

export default Equipment;
