import React from "react";
import { MemoryBackIcon } from "./MemoryBackIcon";

type PageNavigationProps = {
  onBack: () => void;
  backLabel?: string;
  title?: string;
  iconColor?: string;
  actions?: React.ReactNode;
  className?: string;
};

export const PageNavigation: React.FC<PageNavigationProps> = ({
  onBack, backLabel = "Back", title, iconColor = "black", actions, className = "",
}) => (
  <nav className={`noma-page-navigation ${className}`} aria-label={title ? `${title} navigation` : "Page navigation"}>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="flex h-[24px] w-[24px] items-center justify-center border-0 bg-transparent outline-none transition-transform active:scale-95 hover:opacity-70 cursor-pointer"
      >
        <MemoryBackIcon color={iconColor} />
      </button>
      {title && <span className="text-[24px] text-[#232121] tracking-tight leading-none font-sans font-bold">{title}</span>}
    </div>
    {actions}
  </nav>
);
