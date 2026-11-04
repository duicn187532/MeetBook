// src/components/TitleDescription.tsx
import DisplaySettings from "./DisplaySettings";

const TitleDescription = () => (
  <div className="relative font-live mt-4 px-[15px] py-1 pr-12 bg-white">
    <DisplaySettings />
    <h1 className="text-[length:calc(1.25rem*var(--text-scale,1))] leading-tight font-bold text-[#212529]">數金部會議室 (11F)</h1>
    {/* 說明文字固定標準大小（11px），不隨字體大小設定放大，避免換行讓下方版面變小 */}
    <p className="text-[0.6875rem] text-[#495057] mt-1.5 mb-1">
      在這裡，您可以選擇合適的會議室，預訂<span className="text-[#FF3F3F]">並邀請夥伴參加會議</span>。
    </p>
  </div>
);

export default TitleDescription;
