import { Megaphone } from "lucide-react";
import { ChangelogEntry, slashDate } from "../config/notices";
import NoticeDialog from "./NoticeDialog";
import LinkifiedText from "./LinkifiedText";

interface ChangelogModalProps {
  entries: ChangelogEntry[]; // 只傳入使用者還沒看過的
  onClose: () => void;
}

const ChangelogModal = ({ entries, onClose }: ChangelogModalProps) => (
  <NoticeDialog icon={Megaphone} title="更新日誌" onClose={onClose}>
    {entries.map((entry) => (
      <div key={entry.version}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-[#C2410C]">{entry.version}</span>
          <span className="text-xs text-gray-500">{slashDate(entry.date)}</span>
        </div>
        {entry.sections.map((section, i) => (
          <div key={i} className="mb-3">
            <div className="font-semibold text-gray-700 text-sm mb-1.5">{section.title}</div>
            <ul className="space-y-2">
              {section.items.map((item, j) => (
                <li key={j} className="text-sm text-gray-700 bg-[#F7F7F7] rounded-xl px-3 py-2">
                  {item.experimental && (
                    <span className="inline-block mb-1 mr-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FDEBDC] text-[#9A4A12]">
                      實驗性功能
                    </span>
                  )}
                  <span className="block whitespace-pre-line break-words">
                    <LinkifiedText text={item.text} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ))}
  </NoticeDialog>
);

export default ChangelogModal;
