// 會議室的照片與座位數（LIVE 卡片與設備說明共用）
// 照片以 ?inline 打包進主程式：進入網站時就一起載好，切換不會再重新下載
import a101 from "../assets/rooms/a101.jpeg?inline";
import a102 from "../assets/rooms/a102.jpeg?inline";
import a103 from "../assets/rooms/a103.jpeg?inline";
import { RoomKey } from "../types/common";

export const roomPhotos: Record<RoomKey, string> = { A101: a101, A102: a102, A103: a103 };
export const roomSeats: Record<RoomKey, number> = { A101: 10, A102: 15, A103: 20 };

// 設備簡述（電腦版側欄與標頭使用）
export const roomEquipment: Record<RoomKey, string> = { A101: "投影機 · 白板", A102: "投影機 · 白板", A103: "電視 · 白板" };
