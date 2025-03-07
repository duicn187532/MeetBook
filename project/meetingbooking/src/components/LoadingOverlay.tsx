// src/components/LoadingOverlay.tsx
import React from "react";

interface LoadingOverlayProps {
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Loading..." }) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-50">
      <div className="text-lg font-semibold">{message}</div>
    </div>
  );
};

export default LoadingOverlay;
