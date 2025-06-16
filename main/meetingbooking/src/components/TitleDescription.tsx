import { Zap, Calendar } from "lucide-react";

interface TitleDescriptionProps {
  title: string;
  subtitle: string;
  onSwitch?: () => void;
  mode: string;
}

const TitleDescription = ({ title, subtitle, onSwitch, mode }: TitleDescriptionProps) => {
  const isCharge = mode === "charge";

  return (
    <div className={`px-6 py-2 relative ${isCharge ? "bg-yellow-300 pl-16" : "bg-white"} transition`}>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-xs text-gray-600 my-1">{subtitle}</p>
      
      {onSwitch && (
        <button
          onClick={onSwitch}
          className={`absolute top-2 ${isCharge ? "left-0 rounded-r-full" : "right-0 rounded-l-full"} h-12 pl-2 pr-5 
            ${isCharge ? "bg-blue-400" : "bg-yellow-400"} 
            shadow flex items-center`}
        >
          {isCharge ? (
            <Calendar className="w-6 h-6 text-white" />
          ) : (
            <Zap className="w-6 h-6 text-white" />
          )}
        </button>
      )}
    </div>
  );
};

export default TitleDescription;
