import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";

const Home = lazy(() => import("./Home")); // Lazy load Home.tsx

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div>載入中...</div>}>
      <Home />
    </Suspense>
  </React.StrictMode>
);
