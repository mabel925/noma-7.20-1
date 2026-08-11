import React from "react";

export const CloseIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <g clipPath="url(#close-icon-clip)">
      <path
        d="M4.9292 19.0709L19.0713 4.92879"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19.0713 19.0709L4.92915 4.92879"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
    <defs>
      <clipPath id="close-icon-clip">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
