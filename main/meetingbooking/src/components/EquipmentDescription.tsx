// src/components/Equipment.tsx
import { Users, Monitor, Square } from "lucide-react";

interface EquipmentProps {
  selectedRoom: string;
  imageUrl?: string; // 可選的圖片 URL
}

// 定義每個房間的設備資訊
const equipmentMapping: { 
  [room: string]: { seats: number; hasProjector: boolean; hasWhiteboard: boolean; imageUrl: string } 
} = {
  A101: { seats: 15, hasProjector: true, hasWhiteboard: true, imageUrl: "a101.jpeg" },
  A102: { seats: 10, hasProjector: false, hasWhiteboard: true, imageUrl: "a102.jpeg" },
  A103: { seats: 20, hasProjector: true, hasWhiteboard: true, imageUrl: "a103.jpeg" },
};

const Equipment = ({ selectedRoom, imageUrl }: EquipmentProps) => {
  // 取得對應房間的設備資訊，若找不到則使用完整預設值
  const equipment = equipmentMapping[selectedRoom] || { 
    seats: 20, 
    hasProjector: false, 
    hasWhiteboard: false, 
    imageUrl: "" 
  };

  // 確保 imageUrl 正確
  const imageUrlToUse = imageUrl || equipment.imageUrl;

  return (
    <div className="bg-white flex h-30 p-1 pl-6 mt-2 mb-2">
      {/* 只有在 imageUrl 存在時才渲染圖片 */}
      {imageUrlToUse && (
        <div className="w-20 h-20 mr-4 flex-shrink-0">
          <img 
            src={imageUrlToUse} 
            alt="Room Image" 
            className="w-full h-full object-cover rounded-xl"
          />
        </div>
      )}

      {/* 設備資訊區塊 */}
      <div className="flex flex-col justify-center">
        <h2 className="text-xs text-gray-600 mb-1">設備</h2>
        <div className="flex space-x-4">
          <div className="flex items-center space-x-1">
            <Users className="w-4 h-4" />
            <span className="text-xs">{equipment.seats} Seats</span>
          </div>
          {equipment.hasProjector && (
            <div className="flex items-center space-x-1">
              <Monitor className="w-4 h-4" />
              <span className="text-xs">投影機</span>
            </div>
          )}
          {equipment.hasWhiteboard && (
            <div className="flex items-center space-x-1">
              <Square className="w-4 h-4" />
              <span className="text-xs">Whiteboard</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Equipment;
