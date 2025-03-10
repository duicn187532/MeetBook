import React, { useState } from "react";
import dayjs from "dayjs";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import CustomTimeInput from "./CustomInput";
import { MeetingInfo } from "../types/common";
import { RefreshCw } from "lucide-react";

interface EditMeetingModalProps {
  show: boolean;
  onClose: () => void;
  MeetingInfo: MeetingInfo | null;
  EditPassword: string;
  onSubmit: (updatedInfo: MeetingInfo, id: string, pw: string) => void;
}

const EditMeetingModal: React.FC<EditMeetingModalProps> = ({
  show,
  onClose,
  MeetingInfo,
  onSubmit,
  EditPassword,
}) => {
  if (!show || !MeetingInfo) return null;

  // 取出並初始化各欄位的 state
  const id = MeetingInfo.id;
  const [user, setUser] = useState(MeetingInfo.user);
  const [room, setRoom] = useState(MeetingInfo.room);
  const [title, setTitle] = useState(MeetingInfo.title);
  const [date, setDate] = useState(MeetingInfo.date);
  const [startTime, setStartTime] = useState(
    new Date(`${MeetingInfo.date}T${MeetingInfo.startTime}:00`)
  );
  const [endTime, setEndTime] = useState(
    new Date(`${MeetingInfo.date}T${MeetingInfo.endTime}:00`)
  );
  const [editPassword, setEditPassword] = useState(EditPassword || "");

  // 當日期改變時，同步更新 startTime 與 endTime 的日期部分
  const handleDateChange = (newDateStr: string) => {
    setDate(newDateStr);
    const newStartTime = new Date(
      `${newDateStr}T${dayjs(startTime).format("HH:mm")}:00`
    );
    const newEndTime = new Date(
      `${newDateStr}T${dayjs(endTime).format("HH:mm")}:00`
    );
    setStartTime(newStartTime);
    setEndTime(newEndTime);
  };

  const handleSubmit = () => {
    const formattedStartTime = dayjs(startTime).toISOString();
    const formattedEndTime = dayjs(endTime).toISOString();

    onSubmit(
      {
        id,
        title,
        user,
        room,
        date,
        startTime: formattedStartTime,
        endTime: formattedEndTime,
      },
      MeetingInfo.id,
      editPassword
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 半透明背景，點擊可關閉 */}
      <div
        className="absolute inset-0 bg-black opacity-50"
        onClick={onClose}
      ></div>

      {/* Modal 內容容器 */}
      <div className="relative bg-white p-4 rounded-2xl shadow-lg z-10 w-80">
        {/* 頂部：Icon + 標題 */}
        <div className="flex flex-col items-center mb-4">
          <div className="bg-gray-700 text-white w-12 h-12 flex items-center justify-center rounded-2xl">
          <RefreshCw className="w-6 h-6" />
          {/* <RefreshCcw className="w-6 h-6" /> */}
          </div>
          <h3 className="text-lg font-semibold mt-2">修改預約</h3>
        </div>

        {/* 表單內容 */}
        <div className="mb-2">
          <label className="block text-xs text-gray-600 mb-1">預約者</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="請輸入您的姓名與分機"
          />
        </div>

        <div className="mb-2">
          <label className="block text-xs text-gray-600 mb-1">會議室</label>
          <select
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
          >
            <option value="">請選擇要預約的會議室</option>
            <option value="A101">A101</option>
            <option value="A102">A102</option>
            <option value="A103">A103</option>
          </select>
        </div>

        <div className="mb-2">
          <label className="block text-xs text-gray-600 mb-1">會議名稱</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="請輸入會議主題"
          />
        </div>

        <div className="mb-2">
          <label className="block text-xs text-gray-600 mb-1">使用日期</label>
          <input
            type="date"
            className="w-full border rounded px-2 py-1 text-sm"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            placeholder="請填寫會議日期"
          />
        </div>

        <div className="flex space-x-2 mb-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">開始時間</label>
            <DatePicker
              customInput={<CustomTimeInput />}
              shouldCloseOnSelect={true}
              selected={startTime}
              onChange={(date) => {
                if (date) setStartTime(date);
              }}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="HH:mm"
              minTime={new Date(1970, 0, 1, 8, 45)}
              maxTime={new Date(1970, 0, 1, 18, 15)}
              placeholderText="請選擇開始時間"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">結束時間</label>
            <DatePicker
              customInput={<CustomTimeInput />}
              shouldCloseOnSelect={true}
              selected={endTime}
              onChange={(date) => {
                if (date) setEndTime(date);
              }}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="HH:mm"
              minTime={new Date(1970, 0, 1, 8, 45)}
              maxTime={new Date(1970, 0, 1, 18, 15)}
              placeholderText="請選擇結束時間"
              className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-xs text-gray-600 mb-1">編輯密碼</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            placeholder="若有設定密碼，請輸入"
          />
        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-between mt-4">
          <button
            className="bg-gray-300 border border-gray-300 rounded-xl w-full mx-2 py-2 text-sm text-gray-700"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="bg-gray-700 text-white rounded-xl mx-2 w-full py-2 text-sm"
            onClick={handleSubmit}
          >
            更新
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditMeetingModal;
