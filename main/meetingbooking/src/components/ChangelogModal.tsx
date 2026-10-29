import { Megaphone } from "lucide-react";
import { ChangelogEntry } from "../config/changelog";

interface ChangelogModalProps {
  entries: ChangelogEntry[]; // 只傳入使用者還沒看過的
  onClose: () => void;
}

// 更新日誌：內容較長時在視窗內捲動
const ChangelogModal = ({ entries, onClose }: ChangelogModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* 半透明背景，點擊可關閉 */}
    <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
      className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-full max-w-sm m-8 flex flex-col max-h-[80vh]"
    >
      <div className="flex flex-col items-center">
        <div className="bg-[#F08B42] w-12 h-12 flex items-center justify-center rounded-2xl">
          <Megaphone className="text-white w-6 h-6" />
        </div>
        <h3 id="changelog-title" className="text-lg font-semibold mt-2">更新日誌</h3>
      </div>

      <div className="mt-3 overflow-y-auto overscroll-contain flex-1 min-h-0 pr-1 space-y-4">
        {entries.map((entry) => (
          <div key={entry.id}>
            <div className="text-xs text-gray-500 mb-2">{entry.date}</div>
            {entry.sections.map((section) => (
              <div key={section.title} className="mb-3">
                <div className="font-semibold text-gray-700 text-sm mb-1.5">{section.title}</div>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.text} className="text-sm text-gray-700 bg-[#F7F7F7] rounded-xl px-3 py-2">
                      {item.experimental && (
                        <span className="inline-block mb-1 mr-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FDEBDC] text-[#9A4A12]">
                          實驗性功能
                        </span>
                      )}
                      <span className="block">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button onClick={onClose} className="mt-4 bg-[#F08B42] text-white rounded-xl w-full py-2 text-sm">
        知道了
      </button>
    </div>
  </div>
);

export default ChangelogModal;
