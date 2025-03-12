import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";

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
