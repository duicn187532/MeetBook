import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import RoomScheduleView from "./pages/RoomScheduleView";
import ChargeScheduleView from "./pages/ChargeScheduleView";

export default function Home() {
  const [mode, setMode] = useState<"room" | "charge">("room");

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-gray-50">
      <AnimatePresence mode="sync">
        <motion.div
          key={mode}
          initial={{ x: mode === "room" ? "-100%" : "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: mode === "room" ? "-100%" : "100%", opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="absolute inset-0 z-10 bg-white"
          >
          {mode === "room" ? (
            <RoomScheduleView setMode={setMode} />
          ) : (
            <ChargeScheduleView setMode={setMode} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
