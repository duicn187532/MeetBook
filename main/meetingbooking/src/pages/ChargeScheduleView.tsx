"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Components
import TitleDescription from "../components/TitleDescription";
import ViewToggle from "../components/ViewToggle";
import CalendarContent from "../components/CalendarContent";
import LoadingOverlay from "../components/LoadingOverlay";
import AlertModal from "../components/AlertModal";
import MeetingInfoModal from "../components/MeetingInfoModal";
import EditMeetingModal from "../components/EditMeetingModal";
import ConfirmationModal from "../components/ConfirmationModal";

// Types
import { Meeting, ViewMode } from "../types/common";

// 自訂 hook (建議複製 useMeetingData 成 useChargeData)
import useMeetingData from "../hooks/useMeetingData";
import ChargeStationSelector from "../components/ChargeStationSelector";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

interface ChargeScheduleViewProps {
    setMode: (mode: "room" | "charge") => void;
}

const ChargeScheduleView = ({ setMode }: ChargeScheduleViewProps) => {
    const [selectedView, setSelectedView] = useState<ViewMode>("Week");
    const [currentDate, setCurrentDate] = useState(dayjs());
    const [viewStartDate, setViewStartDate] = useState(dayjs());
    const [editPassword, setEditPassword] = useState("");
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [bookingForm, setBookingForm] = useState({
        title: "充電時段",
        user: "",
        room: "A104",
        participantsNum: 0,
        selectedDate: currentDate.format("YYYY-MM-DD"),
        startTime: dayjs().format("HH:mm"),
        endTime: dayjs().add(1, "hour").format("HH:mm"),
        editPassword: "",
    });
    const [errorMessage, setErrorMessage] = useState("");
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [modalProps, setModalProps] = useState({
        title: "",
        message: "",
        confirmLabel: "確定",
        cancelLabel: "取消",
        confirmColor: "bg-red-500",
        iconColor: "bg-red-500",
    });
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");
    const [alertType, setAlertType] = useState<"success" | "error">("success");

    const { meetings, loading, fetchEvents, submitBooking, cancelMeeting, editMeeting } = useMeetingData();

    useEffect(() => {
        fetchEvents("A104");
    }, []);

    const updateBookingDate = (date: dayjs.Dayjs) => {
        setBookingForm((prev) => ({
            ...prev,
            selectedDate: date.format("YYYY-MM-DD"),
        }));
    };

    const [confirmAction, setConfirmAction] = useState<() => void>(() => () => { });
    const handleConfirmAction = (action: () => void, modalConfig: any) => {
        setModalProps(modalConfig);
        setConfirmAction(() => action);
        setShowConfirmModal(true);
    };

    const showAlert = (type: "success" | "error", title: string, msg: string = "") => {
        setAlertType(type);
        setAlertTitle(title);
        setAlertMessage(msg);
        setShowAlertModal(true);
    };

    async function handleSubmitBooking() {
        const { user, selectedDate, startTime, endTime } = bookingForm;
        if (!selectedDate || !user || !startTime || !endTime) {
            setErrorMessage("請填寫所有欄位！");
            return;
        }
        const start = dayjs.tz(`${selectedDate}T${startTime}:00`, "Asia/Taipei");
        const end = dayjs.tz(`${selectedDate}T${endTime}:00`, "Asia/Taipei");

        if (!start.isValid() || !end.isValid() || !start.isBefore(end)) {
            setErrorMessage("時間格式錯誤或結束時間早於開始！");
            return;
        }

        setErrorMessage("");

        const bookingData = {
            ...bookingForm,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
        };

        try {
            const response = await submitBooking(bookingData);
            if (response.status === 400) {
                showAlert("error", "時段重複", "已經有人預約囉,請重新選擇時間");
            } else {
                showAlert("success", "預約成功");
                fetchEvents("A104");
                setCurrentDate(dayjs(bookingData.selectedDate));
                setViewStartDate(dayjs(bookingData.selectedDate));
            }
        } catch {
            showAlert("error", "提交失敗", "請稍後再試");
        } finally {
            setBookingForm({
                title: "充電時段",
                user: "",
                room: "A104",
                participantsNum: 0,
                selectedDate: currentDate.format("YYYY-MM-DD"),
                startTime: dayjs().format("HH:mm"),
                endTime: dayjs().add(1, "hour").format("HH:mm"),
                editPassword: "",
            });
        }
    }

    return (
        <div className="flex flex-col h-screen bg-yellow-300">
            <TitleDescription
                title="數金充電站 (11F)"
                subtitle="辛苦了，別忘了為自己充個電，立即預約舒壓時光！"
                onSwitch={() => setMode("room")}
                mode="charge"
            />
            <div className="px-6 mt-2">
                <ChargeStationSelector />
            </div>
            <ViewToggle
                selectedView={selectedView}
                onChangeView={setSelectedView}
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                updateBookingDate={updateBookingDate}
                viewStartDate={viewStartDate}
                setViewStartDate={setViewStartDate}
                selectedRoom="A104"
            />
            <div className="flex-1 overflow-y-auto">
                <CalendarContent
                    selectedView={selectedView}
                    currentDate={currentDate}
                    meetings={meetings}
                    mode="charge"
                    setSelectedMeeting={setSelectedMeeting}
                    setShowInfoModal={setShowInfoModal}
                    setCurrentDate={setCurrentDate}
                    setViewStartDate={setViewStartDate}
                    onChangeView={setSelectedView}
                />
            </div>
            {/* 預約充電區塊 */}
            <div className="bg-white">
                <div className="bg-white inset-shadow-sm p-4 rounded-t-2xl border-t border-gray-200">
                    <h2 className="text-lg font-bold text-center mb-3">預約充電</h2>

                    <div className="space-y-2">
                        <div>
                            <label className="text-sm font-semibold">預約者</label>
                            <input
                                className="w-full border border-gray-300 rounded px-3 py-1 text-sm"
                                placeholder="請輸入您的行編與分機"
                                value={bookingForm.user}
                                onChange={(e) =>
                                    setBookingForm((prev) => ({ ...prev, user: e.target.value }))
                                }
                            />
                        </div>

                        <div className="flex space-x-2">
                            <div className="flex-1">
                                <label className="text-sm font-semibold">預約日期</label>
                                <input
                                    type="date"
                                    className="w-full border border-gray-300 rounded px-3 py-1 text-sm"
                                    value={bookingForm.selectedDate}
                                    onChange={(e) =>
                                        setBookingForm((prev) => ({
                                            ...prev,
                                            selectedDate: e.target.value,
                                        }))
                                    }
                                />
                            </div>

                            <div className="flex-1">
                                <label className="text-sm font-semibold">預約時段</label>
                                <div className="flex space-x-2">
                                    {["17:30", "18:00", "18:30"].map((time) => (
                                        <button
                                            key={time}
                                            onClick={() =>
                                                setBookingForm((prev) => ({
                                                    ...prev,
                                                    startTime: time,
                                                    endTime: dayjs(`2000-01-01 ${time}`)
                                                        .add(30, "minute")
                                                        .format("HH:mm"),
                                                }))
                                            }
                                            className={`flex-1 py-1 rounded text-sm font-semibold ${bookingForm.startTime === time
                                                ? "bg-yellow-400 text-white"
                                                : "bg-gray-100 text-gray-600"
                                                }`}
                                        >
                                            {time}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-semibold">編輯密碼</label>
                            <input
                                className="w-full border border-gray-300 rounded px-3 py-1 text-sm"
                                placeholder="未輸入則任何人皆可編輯"
                                value={bookingForm.editPassword}
                                onChange={(e) =>
                                    setBookingForm((prev) => ({ ...prev, editPassword: e.target.value }))
                                }
                            />
                        </div>

                        {errorMessage && (
                            <div className="text-red-500 text-sm font-medium">{errorMessage}</div>
                        )}

                        <div className="flex justify-center pt-2">
                            <button
                                className="px-10 py-2 mx-2 border border-yellow-400 text-yellow-500 rounded-2xl font-semibold"
                                onClick={() =>
                                    setBookingForm((prev) => ({
                                        ...prev,
                                        user: "",
                                        editPassword: "",
                                        startTime: "",
                                        endTime: "",
                                    }))
                                }
                            >
                                取消
                            </button>
                            <button
                                className="px-10 py-2 mx-2 bg-yellow-400 text-white rounded-2xl font-semibold"
                                onClick={handleSubmitBooking}
                            >
                                預約
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showInfoModal && (
                <MeetingInfoModal
                    show={showInfoModal}
                    onClose={() => {
                        setSelectedMeeting(null);
                        setShowInfoModal(false);
                    }}
                    meetingInfo={selectedMeeting}
                    onCancel={() =>
                        handleConfirmAction(async () => {
                            if (selectedMeeting) {
                                const res = await cancelMeeting(selectedMeeting.id, editPassword);
                                if (res.ok) {
                                    showAlert("success", "刪除成功");
                                    fetchEvents("A104");
                                    setSelectedMeeting(null);
                                } else {
                                    showAlert("error", "密碼錯誤");
                                }
                            }
                        }, {
                            title: "確定刪除嗎？",
                            message: "刪除後無法恢復。",
                            confirmLabel: "確定",
                            cancelLabel: "取消",
                            confirmColor: "bg-red-500",
                            iconColor: "bg-red-500",
                        })
                    }
                    onOpenEditModal={(info) => {
                        setSelectedMeeting(info);
                        setShowInfoModal(false);
                        setShowEditModal(true);
                    }}
                    onEditPassword={setEditPassword}
                />
            )}

            {showEditModal && (
                <EditMeetingModal
                    show={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    MeetingInfo={selectedMeeting}
                    onSubmit={(editData, id, pw) =>
                        handleConfirmAction(() => {
                            editMeeting(id, pw, editData).then((res) => {
                                if (res.ok) {
                                    showAlert("success", "修改成功");
                                    fetchEvents("A104");
                                    setShowEditModal(false);
                                    setSelectedMeeting(null);
                                } else {
                                    showAlert("error", "修改失敗", "請確認密碼或時段是否衝突");
                                }
                            });
                        }, {
                            title: "確定修改嗎？",
                            message: "請確認修改內容。",
                            confirmLabel: "確定",
                            cancelLabel: "取消",
                            confirmColor: "bg-[#3F3F3F]",
                            iconColor: "bg-[#3F3F3F]",
                        })
                    }
                />
            )}

            <ConfirmationModal
                show={showConfirmModal}
                title={modalProps.title}
                confirmLabel={modalProps.confirmLabel}
                cancelLabel={modalProps.cancelLabel}
                confirmColor={modalProps.confirmColor}
                iconColor={modalProps.iconColor}
                onConfirm={() => {
                    confirmAction();
                    setShowConfirmModal(false);
                }}
                onCancel={() => setShowConfirmModal(false)}
            />

            {loading && <LoadingOverlay />}
            {showAlertModal && (
                <AlertModal
                    type={alertType}
                    title={alertTitle}
                    message={alertMessage}
                    onClose={() => setShowAlertModal(false)}
                />
            )}
        </div>
    );
};

export default ChargeScheduleView;
