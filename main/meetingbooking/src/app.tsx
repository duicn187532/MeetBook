import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
// LIVE 設計稿的英數字型（打包進網站，不依賴外部字型服務）；中文沿用系統字型
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";

// Import MUI LocalizationProvider
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

const Home = lazy(() => import("./Home")); // Lazy load Home.tsx

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Suspense fallback={<div>載入中...</div>}>
        <Home />
      </Suspense>
    </LocalizationProvider>
  </React.StrictMode>
);
