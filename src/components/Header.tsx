import React from "react";
import { createPortal } from "react-dom";
import { MemoryCoreButton } from "./MemoryCoreButton";

interface HeaderProps {
  onMemoryCoreClick?: () => void;
  isChatActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onMemoryCoreClick,
  isChatActive = false,
}) => {
  return createPortal(
    <header 
      className={`home-header-fixed flex justify-between items-center pointer-events-none select-none transition-all duration-300 ${
        isChatActive ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* 1. Brand Logo: Noma image with elegant scale */}
      <div 
        className="pointer-events-auto cursor-pointer transition-all duration-200"
      >
        <img
          src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/logo-noma.png"
          alt="Noma"
          className="w-[139px] h-[28px] object-contain"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* 2. Interactive Memory Crystal Core (High-end 3D Polyhedron SVG) */}
      <MemoryCoreButton onClick={onMemoryCoreClick} />
    </header>,
    document.body
  );
};
