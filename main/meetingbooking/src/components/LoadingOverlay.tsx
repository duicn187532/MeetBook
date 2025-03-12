import React from "react";
import Lottie from "lottie-react";
import loadingAnimation from "../assets/loading.json"; // 你的 Lottie JSON 動畫

interface LoadingOverlayProps {
  // message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-80 z-50">
      {/* Lottie 動畫 */}
      <Lottie animationData={loadingAnimation} loop className="w-24 h-24" />
      
      {/* Loading 文字
      <div className="text-lg font-semibold text-gray-700 mt-2">{message}</div> */}
    </div>
  );
};

export default LoadingOverlay;
