import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./Home";
import "./globals.css"; // 或者 import "./globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>
);
