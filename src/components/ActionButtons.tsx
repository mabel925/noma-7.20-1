import React from "react";
import { Compass, Plus } from "lucide-react";

interface ActionButtonsProps {
  onChatToggle: () => void;
  onCaptureClick: () => void;
  isChatActive: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onChatToggle,
  onCaptureClick,
  isChatActive,
}) => {
  return (
    <div
      className={`home-action-buttons-fixed flex flex-col items-center gap-3.5 select-none ${
        isChatActive
          ? "opacity-0 translate-x-[120px] pointer-events-none"
          : "opacity-100 translate-x-0"
      }`}
      style={{
        transition: "transform 0.85s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      {/* 1. Chat toggle button (Upper option with custom icon-chat SVG, no black background, perfectly centered with the add button) */}
      <button
        onClick={onChatToggle}
        className="w-14 h-14 bg-transparent flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 text-white cursor-pointer group"
        title="Toggle Chat View"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 transition-transform duration-500 group-hover:scale-110"
        >
          <circle cx="19.5427" cy="14.5865" r="1.86255" fill="white" />
          <path
            d="M20.13 23.4473L17.0364 27.2714C16.5028 27.931 15.4969 27.931 14.9632 27.2714L12.2699 23.942C12.0167 23.6291 11.6358 23.4473 11.2333 23.4473H10.6665C6.24823 23.4473 2.6665 19.8655 2.6665 15.4473V11.4473C2.6665 7.02899 6.24823 3.44727 10.6665 3.44727H21.3332C25.7515 3.44727 29.3332 7.02899 29.3332 11.4473V16.3812C29.3332 17.8346 28.8913 19.2538 28.0663 20.4503C26.7921 22.2983 24.5736 23.3961 22.453 22.6602C16.7282 20.6736 13.0763 15.6976 14.7409 12.1216C16.4088 8.53868 22.7398 7.94738 24.0365 12.6404C25.3332 17.3333 20.13 23.4473 20.13 23.4473Z"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* 2. Photo/Capture button (Lower option: White background with custom black "+" SVG) */}
      <button
        onClick={onCaptureClick}
        className="w-14 h-14 bg-white hover:bg-neutral-100 rounded-full shadow-[0_6px_24px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 text-black cursor-pointer"
        title="Camera Scanner Action"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[18px] h-[18px]"
        >
          <path d="M2.36377 9H15.636" stroke="#232121" strokeWidth="2.25" strokeLinecap="round" />
          <path d="M9 15.6361L9 2.36389" stroke="#232121" strokeWidth="2.25" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};
