// views/RoomScheduleView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Components
import TitleDescription from "../components/TitleDescription";
import RoomSelector from "../components/RoomSelector";
import Equipment from "../components/EquipmentDescription";
import ViewToggle from "../components/ViewToggle";
import CalendarContent from "../components/CalendarContent";
import BookingModal from "../components/BookingModal";
import LoadingOverlay from "../components/LoadingOverlay";
import AlertModal from "../components/AlertModal";
import MeetingInfoModal from "../components/MeetingInfoModal";
import EditMeetingModal from "../components/EditMeetingModal";
import ConfirmationModal from "../components/ConfirmationModal";
import ChangelogModal from "../components/ChangelogModal";
import TodayOverview, { TodayHeader } from "../components/TodayOverview";
import { changelog, isAnnouncing } from "../config/changelog";

// Types
import {
  BookingForm,
  BookingPayload,
  BookingUpdatePayload,
  ConfirmModalConfig,
  Meeting,
  RoomKey,
  roomNames,
  ViewMode,
} from "../types/common";

// 自訂 hook
import useMeetingData from "../hooks/useMeetingData";
import useSwipe from "../hooks/useSwipe";
import useNow from "../hooks/useNow";
import { readResponseBody } from "../api/meetingApi";
import {
  Alternatives,
  conflictMessage,
  defaultBookingTimes,
  describeConflicts,
  findAlternatives,
} from "../utils/bookingHelpers";
import { loadPref, savePref } from "../utils/storage";
import { buildTodayOverview } from "../utils/todayStatus";
import { addWorkdays, rollToWorkday, workdaysFrom, WORKDAYS_PER_WEEK } from "../utils/workdays";

const ROOMS: RoomKey[] = ["A101", "A102", "A103"];
const VIEWS: ViewMode[] = ["Day", "Week", "Month"];

// 還沒看過的更新日誌（記錄的是看過的最新一筆 id）
// 以某天為準的查詢範圍：前 1 個月初 ~ 後 3 個月底（約 5 個月，前後都留有好幾週的空檔）
function anchorRange(base: dayjs.Dayjs) {
  return { from: base.startOf("month").subtract(1, "month"), to: base.add(3, "month").endOf("month") };
}

// 沒看過、且還在公告期間內（改版日起 7 天，台北時間）的更新日誌
function unseenChangelog() {
  const seen = loadPref("changelogSeen");
  const index = changelog.findIndex((entry) => entry.id === seen);
  const unseen = index === -1 ? changelog : changelog.slice(0, index);
  return unseen.filter((entry) => isAnnouncing(entry.date, Date.now()));
}

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Taipei");

const RoomScheduleView = () => {
  // UI 狀態管理
  // 會議室、檢視模式與行編會記在瀏覽器，下次開啟沿用
  const [selectedRoom, setSelectedRoom] = useState<RoomKey>(() => loadPref("room", ROOMS) ?? "A101");
  const [selectedView, setSelectedView] = useState<ViewMode>(() => loadPref("view", VIEWS) ?? "Week");
  // Today 分頁（實驗性功能）
  const [todayMode, setTodayMode] = useState(() => loadPref("today") === "1");
  const now = useNow(todayMode);
  // 更新日誌只給沒看過的人看一次：一顯示就記為看過
  const [changelogEntries, setChangelogEntries] = useState(unseenChangelog);
  useEffect(() => {
    if (changelog.length > 0 && changelogEntries.length > 0) savePref("changelogSeen", changelog[0].id);
  }, [changelogEntries.length]);
  // 週末開啟時從下一個工作日開始（週六、週日不上班）
  const [currentDate, setCurrentDate] = useState(() => rollToWorkday(dayjs()));
  const [viewStartDate, setViewStartDate] = useState(() => rollToWorkday(dayjs()));
  const [editPassword, setEditPassword] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  // 最近一次自動帶入的預設時間；使用者沒改過時，開啟預約視窗會換成最新的預設值
  const defaultTimes = useRef(defaultBookingTimes(new Date()));
  const [bookingForm, setBookingForm] = useState<BookingForm>(() => ({
    title: "",
    user: loadPref("userId") ?? "",
    room: [selectedRoom],
    participantsNum: 0,
    selectedDate: currentDate.format("YYYY-MM-DD"),
    ...defaultTimes.current,
    editPassword: "",
  }));
  const [editError, setEditError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalProps, setModalProps] = useState<ConfirmModalConfig>({
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

  // 自訂 hook 提供的 API 與狀態
  const {
    meetings,
    loading,
    fetching,
    loadedRange,
    loadFailures,
    fetchEvents,
    submitBooking,
    cancelMeeting,
    editMeeting,
  } = useMeetingData();
  // 資料包含所有會議室，畫面只顯示目前選擇的會議室
  const roomMeetings = meetings.filter((m) => m.room === selectedRoom);

  useEffect(() => savePref("room", selectedRoom), [selectedRoom]);
  useEffect(() => savePref("view", selectedView), [selectedView]);
  useEffect(() => savePref("today", todayMode ? "1" : "0"), [todayMode]);

  // 按鈕背景色對應
  const buttonBGColors: Record<RoomKey, string> = {
    A101: "bg-[#3C97FF]",
    A102: "bg-[#FF3F3F]",
    A103: "bg-[#17C2B6]",
  };
  const buttonBGColor = todayMode ? "bg-[#F08B42]" : buttonBGColors[selectedRoom];

  // 當選擇房間改變時，同步更新預約表單的房間
  useEffect(() => {
    setBookingForm((prev) => ({ ...prev, room: [selectedRoom] }));
  }, [selectedRoom]);

  // 查詢範圍：目前畫面需要的區間（月檢視 3 個月、日／週檢視前後 3 週）還在已查詢的範圍內就不重查；
  // 超出時才以目前日期重新取「前 1 個月 ~ 後 3 個月」，換週、換月不會每次都重新讀取
  // Today 分頁一律以今天為準，確保今天的資料在查詢範圍內
  const rangeBase = todayMode ? dayjs() : currentDate;
  const needFrom = selectedView === "Month" && !todayMode
    ? rangeBase.startOf("month").subtract(7, "day")
    : (todayMode || rangeBase.isBefore(viewStartDate) ? rangeBase : viewStartDate).subtract(21, "day");
  const needTo = selectedView === "Month" && !todayMode
    ? rangeBase.add(2, "month").endOf("month").add(7, "day")
    : (todayMode || rangeBase.isAfter(viewStartDate.add(6, "day")) ? rangeBase : viewStartDate.add(6, "day")).add(21, "day");
  const [fetchRange, setFetchRange] = useState(() => anchorRange(rangeBase));
  if (needFrom.isBefore(fetchRange.from) || needTo.isAfter(fetchRange.to)) {
    // 依目前畫面推算的衍生狀態，在 render 中更新（React 會立即以新值重新 render）
    const next = anchorRange(rangeBase);
    // 保證涵蓋需要的區間（週起始日與目前日期相差很遠時），避免重複更新
    setFetchRange({
      from: needFrom.isBefore(next.from) ? needFrom : next.from,
      to: needTo.isAfter(next.to) ? needTo : next.to,
    });
  }
  const rangeFrom = fetchRange.from.toISOString();
  const rangeTo = fetchRange.to.toISOString();
  // 新增／修改／刪除後遞增，觸發重新取得資料
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadMeetings = () => setRefreshKey((key) => key + 1);

  // 查詢範圍改變或資料異動時取得會議資料（切換會議室不需重新讀取）
  useEffect(() => {
    fetchEvents({ from: rangeFrom, to: rangeTo });
  }, [rangeFrom, rangeTo, refreshKey]);
  // 畫面上的資料是否已涵蓋目前的區間；還沒涵蓋時以全畫面讀取遮住，避免誤以為沒有預約
  const rangeLoaded = loadedRange?.from === rangeFrom && loadedRange?.to === rangeTo;

  // Today 分頁開著時每 5 分鐘重新取得資料，反映其他人的新預約
  useEffect(() => {
    if (!todayMode) return;
    const timer = setInterval(reloadMeetings, 5 * 60_000);
    return () => clearInterval(timer);
  }, [todayMode]);

  const todayDate = dayjs(now).tz("Asia/Taipei").format("YYYY-MM-DD");
  const todayOverview = todayMode ? buildTodayOverview(meetings, ROOMS, todayDate, now) : null;

  // 點已選的會議室（或已在 Today 時點 Today）重新讀取資料；切換到其他會議室直接用已載入的資料
  function selectRoom(room: RoomKey) {
    if (!todayMode && room === selectedRoom) {
      reloadMeetings();
      return;
    }
    setTodayMode(false);
    setSelectedRoom(room);
  }

  function selectToday() {
    if (!todayMode) setTodayMode(true);
    reloadMeetings();
  }

  // 從 Today 卡片進入該會議室本週的週檢視
  function openRoomToday(room: RoomKey) {
    const today = rollToWorkday(dayjs());
    setTodayMode(false);
    setSelectedRoom(room);
    setSelectedView("Week");
    setCurrentDate(today);
    setViewStartDate(today);
    updateBookingDate(today);
  }

  // Today 卡片的「＋」：帶入該會議室、今天與最近的空檔
  function quickBook(room: RoomKey, times: { startTime: string; endTime: string }) {
    defaultTimes.current = times;
    setBookingForm((prev) => ({ ...prev, room: [room], selectedDate: todayDate, ...times }));
    setErrorMessage("");
    setShowBookingModal(true);
  }

  // 依目前已載入的預約推算替代方案；預約時間不在已載入的區間內時不提供，避免建議錯誤
  function alternativesFor(
    rooms: string[],
    date: string,
    start: number,
    end: number,
    excludeIds: string[] = [],
  ): Alternatives | null {
    if (!loadedRange || start < Date.parse(loadedRange.from) || end > Date.parse(loadedRange.to)) return null;
    return findAlternatives(meetings, { rooms, date, start, end, excludeIds, now: Date.now() }, ROOMS);
  }

  // 左右滑動行事曆：與上方箭頭相同的換頁方式；日檢視一次一天。畫面跟著手指移動，放開後滑出、新的一頁滑入
  const swipe = useSwipe(!todayMode, (direction) => {
    const step = direction === "next" ? 1 : -1;
    if (selectedView === "Month") {
      setCurrentDate(currentDate.add(step, "month"));
    } else if (selectedView === "Week") {
      const newStart = viewStartDate.add(7 * step, "day");
      setViewStartDate(newStart);
      setCurrentDate(currentDate.add(7 * step, "day"));
      updateBookingDate(newStart);
    } else {
      // 日檢視一次一個工作日，超出上方日期列時整列換頁
      const next = addWorkdays(currentDate, step);
      setCurrentDate(next);
      updateBookingDate(next);
      const strip = workdaysFrom(viewStartDate, WORKDAYS_PER_WEEK);
      if (next.isBefore(strip[0], "day")) setViewStartDate(addWorkdays(strip[0], -WORKDAYS_PER_WEEK));
      else if (next.isAfter(strip[strip.length - 1], "day")) setViewStartDate(addWorkdays(strip[0], WORKDAYS_PER_WEEK));
    }
  });

  const updateBookingDate = (date: dayjs.Dayjs) => {
    setBookingForm((prev) => ({
      ...prev,
      selectedDate: date.format("YYYY-MM-DD"),
    }));
  };

  // 關閉提示視窗後要執行的動作（例如載入失敗時重新載入）
  const afterAlertClose = useRef<(() => void) | null>(null);

  // 取得預約資料失敗：以既有的 OOPS 提示視窗告知，按確定後重新載入
  useEffect(() => {
    if (loadFailures === 0) return;
    showAlert(
      "error",
      "載入失敗",
      "預約資料載入失敗，畫面可能不完整，請勿依此判斷是否有空。\n按確定重新載入；若持續發生請通知祐晨 #51164",
    );
    afterAlertClose.current = reloadMeetings;
  }, [loadFailures]);

  // Alert 函式
  const showAlert = (type: "success" | "error", title: string, message = "") => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setShowAlertModal(true);
  };

  const showSuccessAlert = () => {
    setAlertType("success");
    setAlertTitle("預約成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };

  const showDeleteAlert = () => {
    setAlertType("success");
    setAlertTitle("刪除成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };

  const showPasswordErrorAlert = () => {
    setAlertType("error");
    setAlertTitle("密碼錯誤");
    setAlertMessage("請確認後重新輸入");
    setShowAlertModal(true);
  };


  const showUserNotFoundAlert = () => {
    setAlertType("error");
    setAlertTitle("無此使用者");
    setAlertMessage("行編錯囉，請確認輸入4碼行編。");
    setShowAlertModal(true);
  }

  const showUpdatedSuccessAlert = () => {
    setAlertType("success");
    setAlertTitle("修改成功");
    setAlertMessage("");
    setShowAlertModal(true);
  };

// 提交預約
async function handleSubmitBooking() {
  const { title, user, room, participantsNum, selectedDate, startTime, endTime, editPassword } = bookingForm;
  
  // 驗證必填欄位
  if (!selectedDate || !user || !room || !startTime || !endTime) {
    setErrorMessage("請填寫所有欄位！");
    return;
  }

  // 驗證時間格式和邏輯
  const start = dayjs.tz(`${selectedDate}T${startTime}:00`, "Asia/Taipei");
  const end = dayjs.tz(`${selectedDate}T${endTime}:00`, "Asia/Taipei");
  
  if (!start.isValid() || !end.isValid()) {
    setErrorMessage("無效的時間格式，請重新選擇！");
    return;
  }

  if (!start.isBefore(end)) {
    setErrorMessage("結束時間必須晚於開始時間！");
    return;
  }

  setErrorMessage("");

  // 準備預約資料
  const bookingData: BookingPayload = {
    title,
    user,
    room,
    participantsNum,
    date: selectedDate,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    editPassword,
  };

  try {
    const response = await submitBooking(bookingData);
    
    // 處理不同的回應狀態
    switch (response.status) {
      case 400: {
        // 時間衝突時不重置表單，讓使用者可以調整時間
        if (!Array.isArray(response.body.conflicts)) {
          setErrorMessage(response.body.error || "資料有誤，請檢查後再試");
          break;
        }
        const alternatives = alternativesFor(room, selectedDate, start.valueOf(), end.valueOf());
        showAlert("error", "時段重複", conflictMessage(describeConflicts(response.body.conflicts), alternatives));
        reloadMeetings();
        break;
      }
        
      case 404:
        showUserNotFoundAlert();
        // 使用者驗證錯誤時不重置表單，讓使用者可以修正使用者資訊
        break;
        
      default:
        if (response.ok) {
          handleSuccessfulBooking(bookingData);
        } else {
          console.error("預約失敗:", response.status);
          setErrorMessage("預約失敗，請稍後再試");
        }
        break;
    }
  } catch (error) {
    console.error("提交失敗:", error);
    setErrorMessage("網路連線問題，請稍後重試！");
  }
}

// 重置表單但保留使用者資訊（僅在成功預約後使用）
function resetFormExceptUser() {
  defaultTimes.current = defaultBookingTimes(new Date());
  setBookingForm(prev => ({
    title: "",
    user: prev.user, // 保留使用者不變
    room: [selectedRoom],
    participantsNum: 0,
    selectedDate: currentDate.format("YYYY-MM-DD"),
    ...defaultTimes.current,
    editPassword: "",
  }));
}

// 開啟預約視窗；時間沒被使用者改過時，換成以現在時間計算的預設值
function openBookingModal() {
  const fresh = defaultBookingTimes(new Date());
  const previous = defaultTimes.current;
  defaultTimes.current = fresh;
  setBookingForm((prev) =>
    prev.startTime === previous.startTime && prev.endTime === previous.endTime ? { ...prev, ...fresh } : prev
  );
  setShowBookingModal(true);
}

// 處理成功預約後的操作
function handleSuccessfulBooking(bookingData: BookingPayload) {
  savePref("userId", bookingData.user);
  showSuccessAlert();
  reloadMeetings();
  setCurrentDate(dayjs(bookingData.date));
  setViewStartDate(dayjs(bookingData.date));
  setSelectedRoom(bookingData.room[0] as RoomKey);
  setShowBookingModal(false);
  resetFormExceptUser();
}

  // 關閉預約資訊／修改視窗並清除暫存的密碼
  function closeMeetingModals() {
    setShowInfoModal(false);
    setShowEditModal(false);
    setSelectedMeeting(null);
    setEditPassword("");
    setEditError("");
  }

  // 取消會議
  async function handleCancel() {
    if (!selectedMeeting || !selectedMeeting.id) return;
    let res: Response;
    try {
      res = await cancelMeeting(selectedMeeting.id, editPassword);
    } catch (error) {
      // 網路錯誤或 5xx 已由 apiFetch 提示
      console.error("取消會議錯誤:", error);
      return;
    }
    if (res.ok) {
      reloadMeetings();
      closeMeetingModals();
      showDeleteAlert();
    } else if (res.status === 403) {
      // 預約資訊視窗保留，清空密碼讓使用者重新輸入
      showPasswordErrorAlert();
      setEditPassword("");
    } else if (res.status === 404) {
      reloadMeetings();
      closeMeetingModals();
      showAlert("error", "刪除失敗", "這筆預約已不存在，畫面已重新整理");
    } else {
      const body = await readResponseBody(res);
      showAlert("error", "刪除失敗", body.error || "請稍後再試");
    }
  }

  // 修改會議；失敗時修改視窗保留，錯誤顯示在視窗內，使用者不必重新填寫
  async function handleEdit(editData: BookingUpdatePayload, meeting: Meeting, password: string) {
    setEditError("");
    let res: Response;
    try {
      res = await editMeeting(meeting.id, password, editData);
    } catch (error) {
      console.error("修改會議錯誤:", error);
      setEditError("連線失敗，請稍後再試");
      return;
    }
    if (res.ok) {
      reloadMeetings();
      closeMeetingModals();
      setCurrentDate(dayjs(editData.date));
      setViewStartDate(dayjs(editData.date));
      setSelectedRoom(editData.room as RoomKey);
      showUpdatedSuccessAlert();
      return;
    }
    const body = await readResponseBody(res);
    if (res.status === 403) {
      setEditError("編輯密碼錯誤，請確認後重新輸入");
    } else if (res.status === 404) {
      reloadMeetings();
      setEditError("找不到這筆預約，可能已被取消，請關閉後重新整理");
    } else if (res.status === 400 && Array.isArray(body.conflicts)) {
      // 同組（同時預約）的會議會一起移動，推算空檔時排除自己與同組
      const rooms = [editData.room, ...meeting.isMulti];
      const groupIds = meetings
        .filter((m) =>
          meeting.isMulti.includes(m.room) && m.startTime === meeting.startTime && m.endTime === meeting.endTime
        )
        .map((m) => m.id);
      const start = Date.parse(editData.startTime);
      const end = Date.parse(editData.endTime);
      const alternatives = alternativesFor(rooms, editData.date, start, end, [meeting.id, ...groupIds]);
      setEditError(conflictMessage(describeConflicts(body.conflicts), alternatives));
      reloadMeetings();
    } else {
      setEditError(body.error || "儲存失敗，請稍後再試");
    }
  }

  // 彈窗確認操作（例如刪除、修改前確認）
  const handleConfirmAction = (action: () => void, modalConfig: ConfirmModalConfig) => {
    setModalProps(modalConfig);
    // 使用 confirmAction 來處理確認後動作
    setConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const [confirmAction, setConfirmAction] = useState<() => void>(() => () => { });


  // 同時預約多間時，提醒刪除只影響這一間
  function deleteConfirmMessage(meeting: Meeting | null) {
    const others = (meeting?.isMulti ?? []).map((r) => roomNames[r as RoomKey] ?? r);
    if (!meeting || others.length === 0) return "刪除後無法恢復。";
    const room = roomNames[meeting.room as RoomKey] ?? meeting.room;
    return `只會取消 ${room} 這一間，同時預約的 ${others.join("、")} 會保留。刪除後無法恢復。`;
  }

  // 以下為組合各個元件與 UI
  // 高度用 dvh，避免手機瀏覽器（含 LINE 內建瀏覽器）的工具列蓋住下方；
  // 畫面很矮時（手機橫放）改成整頁捲動，否則上方標題與切換列會把行事曆擠到只剩一條
  return (
    <div className="flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] [@media(max-height:500px)]:h-auto">
      <TitleDescription />
      <RoomSelector
        selectedRoom={selectedRoom}
        onSelectRoom={selectRoom}
        todayMode={todayMode}
        onSelectToday={selectToday}
      />
      {todayOverview ? (
        <div className="mt-2">
          <TodayHeader overview={todayOverview} now={now} />
        </div>
      ) : (
        <>
          <Equipment selectedRoom={selectedRoom} />
          <ViewToggle
            selectedView={selectedView}
            onChangeView={setSelectedView}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            updateBookingDate={updateBookingDate}
            viewStartDate={viewStartDate}
            setViewStartDate={setViewStartDate}
            selectedRoom={selectedRoom}
          />
        </>
      )}
      {/* 背景更新時在行事曆上緣顯示一條細進度線；0.4 秒內完成就不會出現 */}
      <div className="relative h-0 z-20" role="status" aria-live="polite">
        {fetching && rangeLoaded && (
          <>
            <div className="refresh-bar" aria-hidden="true" />
            <span className="sr-only">更新中</span>
          </>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden relative [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-y-visible"
        style={{ touchAction: "pan-y" }}
        {...swipe.handlers}
      >
        {todayOverview ? (
          <TodayOverview
            overview={todayOverview}
            now={now}
            onOpenRoom={openRoomToday}
            onQuickBook={quickBook}
            onSelectMeeting={(meeting) => {
              setSelectedMeeting(meeting);
              setShowInfoModal(true);
            }}
          />
        ) : (
          <div className="min-h-full" style={swipe.style}>
            <CalendarContent
              selectedView={selectedView}
              currentDate={currentDate}
              meetings={roomMeetings}
              setSelectedMeeting={setSelectedMeeting}
              setShowInfoModal={setShowInfoModal}
              setCurrentDate={setCurrentDate}
              setViewStartDate={setViewStartDate}
              onChangeView={setSelectedView}
            />
          </div>
        )}
      </div>
      <button
        onClick={() => setTimeout(()=>{
          openBookingModal();
        }, 250)}
        className={`fixed bottom-4 right-4 w-12 h-12 ${buttonBGColor} text-white rounded-[20px] flex items-center justify-center shadow-lg`}
      >
        <span className="text-3xl">+</span>
      </button>
      {showBookingModal && (
        <BookingModal
          bookingForm={bookingForm}
          setBookingForm={setBookingForm}
          errorMessage={errorMessage}
          onSubmit={handleSubmitBooking}
          onClose={() => setShowBookingModal(false)}
        />
      )}
      {showInfoModal && (
        <MeetingInfoModal
          show={showInfoModal}
          onClose={closeMeetingModals}
          meetingInfo={selectedMeeting}
          editPassword={editPassword}
          onCancel={() =>
            handleConfirmAction(handleCancel, {
              title: "確定刪除嗎？",
              message: deleteConfirmMessage(selectedMeeting),
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
      {showEditModal && selectedMeeting && (
        <EditMeetingModal
          onClose={closeMeetingModals}
          MeetingInfo={selectedMeeting}
          initialPassword={editPassword}
          errorMessage={editError}
          onSubmit={(editData, pw) =>
            handleConfirmAction(() => handleEdit(editData, selectedMeeting, pw), {
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
        message={modalProps.message}
        confirmLabel={modalProps.confirmLabel}
        cancelLabel={modalProps.cancelLabel}
        confirmColor={modalProps.confirmColor}
        iconColor={modalProps.iconColor}
        onConfirm={() => {
          // 執行確認後動作
          confirmAction();
          setShowConfirmModal(false);
        }}
        onCancel={() => setShowConfirmModal(false)}
      />
      {(loading || (fetching && !rangeLoaded)) && <LoadingOverlay />}
      {showAlertModal && (
        <AlertModal
          type={alertType}
          title={alertTitle}
          message={alertMessage}
          onClose={() => {
            setShowAlertModal(false);
            const next = afterAlertClose.current;
            afterAlertClose.current = null;
            next?.();
          }}
        />
      )}
      {changelogEntries.length > 0 && (
        <ChangelogModal entries={changelogEntries} onClose={() => setChangelogEntries([])} />
      )}
    </div>
  );
};

export default RoomScheduleView;
