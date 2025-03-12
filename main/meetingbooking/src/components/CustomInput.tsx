import React from "react";

const CustomTimeInput = React.forwardRef<HTMLInputElement, { value?: string; onClick?: () => void }>(
    ({ value, onClick }, ref) => (
      <input
        type="text"
        value={value}
        onClick={onClick}
        onFocus={(e) => e.target.blur()} // 立即失焦避免鍵盤彈出
        ref={ref}
        className="border border-gray-300 rounded w-full px-3 py-2 text-sm focus:outline-none"
        readOnly // 類似效果，也可以加上
      />
    )
  );
  
  export default CustomTimeInput;
  