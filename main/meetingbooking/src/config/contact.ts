// 聯絡窗口（例如「分機 姓名」）：由建置時的 VITE_CONTACT 提供（GitHub Secret CONTACT_LABEL；repo 為公開，不寫在程式中）
// 沒設定時顯示「系統負責人」
export const CONTACT = (import.meta.env.VITE_CONTACT ?? "").trim() || "系統負責人";
