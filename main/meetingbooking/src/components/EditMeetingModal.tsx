import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { TimePicker, DatePicker } from "@mui/x-date-pickers";
import { MeetingInfo } from "../types/common";
import { RefreshCw } from "lucide-react";

// 初始化插件與設定預設台北時區
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");


interface EditMeetingModalProps {
  show: boolean;
  onClose: () => void;
  MeetingInfo: MeetingInfo | null;
  onSubmit: (updatedInfo: MeetingInfo, id: string, pw: string) => void;
}

const EditMeetingModal: React.FC<EditMeetingModalProps> = ({
  show,
  onClose,
  MeetingInfo,
  onSubmit,
  // EditPassword,
}) => {
  if (!show || !MeetingInfo) return null;

  // 取出並初始化各欄位的 state
  const id = MeetingInfo.id;
  const [user, setUser] = useState(MeetingInfo.user);
  const [room, setRoom] = useState(MeetingInfo.room);
  const [title, setTitle] = useState(MeetingInfo.title);
  const [participantsNum, setParticipantsNum] = useState(MeetingInfo.participantsNum);
  const [date, setDate] = useState(MeetingInfo.date);
  const [startTime, setStartTime] = useState(dayjs(MeetingInfo.startTime).tz("Asia/Taipei"));
  const [endTime, setEndTime] = useState(dayjs(MeetingInfo.endTime).tz("Asia/Taipei"));
  const [editPassword, setEditPassword] = useState("");

  // 當 MeetingInfo 變更時，確保狀態同步更新
  useEffect(() => {
    if (MeetingInfo) {
      setUser(MeetingInfo.user);
      setRoom(MeetingInfo.room);
      setTitle(MeetingInfo.title);
      setDate(MeetingInfo.date);
      setStartTime(dayjs(MeetingInfo.startTime).tz("Asia/Taipei"));
      setEndTime(dayjs(MeetingInfo.endTime).tz("Asia/Taipei"));
    }
  }, [MeetingInfo]);

  useEffect(() => {
    setStartTime((prev) =>
      dayjs.tz(date, "YYYY-MM-DD", "Asia/Taipei")
        .hour(prev.hour())
        .minute(prev.minute())
        .second(0)
    );
    setEndTime((prev) =>
      dayjs.tz(date, "YYYY-MM-DD", "Asia/Taipei")
        .hour(prev.hour())
        .minute(prev.minute())
        .second(0)
    );
  }, [date]);

  // 當日期改變時，更新 startTime 和 endTime 的日期部分
  const handleDateChange = (newDateStr: string) => {
    setDate(newDateStr);
  };

  const handleSubmit = () => {
    const updatedInfo = {
      id,
      user,
      title,
      participantsNum,
      room,
      date,
      startTime: startTime.toISOString(), // 確保是 ISO 格式
      endTime: endTime.toISOString(),
    };
    onSubmit(updatedInfo, MeetingInfo.id, editPassword);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 半透明背景，點擊可關閉 */}
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>

      {/* Modal 內容容器 */}
      <div className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-full m-8">
        {/* 頂部：Icon + 標題 */}
        <div className="flex flex-col items-center mb-4">
          <div className="bg-gray-700 text-white w-12 h-12 flex items-center justify-center rounded-2xl">
            <RefreshCw className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mt-2">修改預約</h3>
        </div>

        {/* 表單內容 */}
        <div className="mb-2">
          <label className="block font-semibold text-gray-600 mb-1">預約者</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={user.name || user.id}
            placeholder="請輸入您的姓名與分機"
            readOnly
          />
        </div>

        <div className="flex space-x-2 mb-2">
          <div className="flex-1">
            <label className="block font-semibold text-gray-600 mb-1">會議室</label>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            >
              <option value="A101">Alpha</option>
              <option value="A102">Beta</option>
              <option value="A103">StartUp</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block font-semibold text-gray-600 mb-1">與會人數</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={participantsNum}
              onChange={(e) => setParticipantsNum(e.target.valueAsNumber)}
              placeholder="請輸入與會人數"
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="block font-semibold text-gray-600 mb-1">會議名稱</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="請輸入會議主題"
          />
        </div>

        <div className="mb-2">
          <label className="block text-sm mb-1">使用日期</label>
          <DatePicker
            value={dayjs(date)}
            onChange={(newDate) => {
              if (newDate) {
                handleDateChange(newDate.format("YYYY-MM-DD"));
              }
            }}
            format="YYYY-MM-DD"
            slotProps={{
              textField: {
                size: "small",
                fullWidth: true,
                className: "text-sm",
              },
            }}
          />
        </div>


        <div className="flex space-x-2 mb-2">
          <div className="flex-1">
            <label className="block font-semibold text-gray-600 mb-1">開始時間</label>
            <TimePicker
              value={startTime}
              onChange={(newTime) => {
                if (newTime) {
                  setStartTime(newTime.tz("Asia/Taipei"));
                }
              }}
              ampm={false}
              minTime={dayjs().hour(8).minute(45)}
              maxTime={dayjs().hour(18).minute(15)}
              desktopModeMediaQuery="(max-width: 9999px)"
              timeSteps={{ hours: 1, minutes: 1 }}
            />
          </div>
          <div className="flex-1">
            <label className="block font-semibold text-gray-600 mb-1">結束時間</label>
            <TimePicker
              value={endTime}
              onChange={(newTime) => {
                if (newTime) {
                  setEndTime(newTime.tz("Asia/Taipei"));
                }
              }}
              ampm={false}
              minTime={dayjs().hour(8).minute(45)}
              maxTime={dayjs().hour(18).minute(15)}
              desktopModeMediaQuery="(max-width: 9999px)"
              timeSteps={{ hours: 1, minutes: 1 }}
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="block font-semibold text-gray-600 mb-1">編輯密碼</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={editPassword}
            onChange={(e) => {
              setEditPassword(e.target.value);
            }}
            placeholder="請輸入編輯密碼"
          />
        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-between mt-4">
          <button className="bg-gray-300 rounded-xl w-full mx-2 py-2 text-sm" onClick={onClose}>取消</button>
          <button className="bg-gray-700 text-white rounded-xl w-full mx-2 py-2 text-sm" onClick={handleSubmit}>更新</button>
        </div>
      </div>
    </div>
  );
};

export default EditMeetingModal;
