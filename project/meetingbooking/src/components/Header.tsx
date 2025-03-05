// src/components/Header.tsx
import { ChevronLeft, Bell, Search } from "lucide-react";

const Header = () => {
  return (
    <header className="flex justify-between items-center p-2 bg-white">
      <ChevronLeft className="w-4 h-4" />
      <div className="flex space-x-2">
        <Bell className="w-4 h-4" />
        <Search className="w-4 h-4" />
      </div>
    </header>
  );
};

export default Header;
