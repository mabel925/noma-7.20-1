import React from "react";
import { LoaderCircle } from "lucide-react";

interface CaptureShutterButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  label?: string;
}

export const CaptureShutterButton: React.FC<CaptureShutterButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  className = "",
  label = "Take photo",
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`capture-shutter-button group relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-transparent shadow-none transition-all duration-300 hover:scale-105 active:scale-95 disabled:cursor-wait ${className}`}
    aria-label={label}
  >
    <span
      className="pointer-events-none absolute -inset-[2px] rounded-full"
      style={{
        background: "linear-gradient(to bottom left, #F5B5D9 0%, #FFC7A6 66%, #A1EBD9 100%)",
        filter: "blur(2px) saturate(1.18)",
      }}
    />
    <span
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{ background: "linear-gradient(to bottom left, #F5B5D9 0%, #FFC7A6 66%, #A1EBD9 100%)" }}
    />
    <span className="absolute inset-[5px] flex items-center justify-center rounded-full border-2 border-white bg-[#F3F1EC]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-[#181817]">
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
      </span>
    </span>
    {loading && <LoaderCircle className="absolute z-10 h-7 w-7 animate-spin text-[#232121]" />}
  </button>
);
