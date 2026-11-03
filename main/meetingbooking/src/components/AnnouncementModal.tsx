import { Bell } from "lucide-react";
import { Announcement } from "../config/notices";
import NoticeDialog from "./NoticeDialog";
import LinkifiedText from "./LinkifiedText";

interface AnnouncementModalProps {
  announcements: Announcement[]; // 只傳入使用者還沒看過的
  onClose: () => void;
}

// 公告：外觀與更新日誌相同，每則顯示標題與內容（保留換行）
const AnnouncementModal = ({ announcements, onClose }: AnnouncementModalProps) => (
  <NoticeDialog icon={Bell} title="公告" onClose={onClose}>
    {announcements.map((a) => (
      <div key={a.id} className="bg-[#F7F7F7] rounded-xl px-3 py-2.5">
        <div className="text-sm font-bold text-[#C2410C]">{a.title}</div>
        <p className="mt-1 text-sm text-gray-700 whitespace-pre-line break-words">
          <LinkifiedText text={a.body} />
        </p>
      </div>
    ))}
  </NoticeDialog>
);

export default AnnouncementModal;
