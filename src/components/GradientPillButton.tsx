import React from "react";

type GradientPillButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  compact?: boolean;
};

export const GradientPillButton: React.FC<GradientPillButtonProps> = ({
  selected = true, compact = false, className = "", children, ...props
}) => (
  <button
    type="button"
    {...props}
    className={`noma-gradient-pill ${className}`}
    data-selected={selected}
    data-compact={compact}
  >
    {children}
  </button>
);
