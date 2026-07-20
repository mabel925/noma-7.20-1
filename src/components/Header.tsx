import React, { useState } from "react";
import { createPortal } from "react-dom";

interface HeaderProps {
  onMemoryCoreClick?: () => void;
  isChatActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onMemoryCoreClick,
  isChatActive = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

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
      <div
        className="pointer-events-auto cursor-pointer flex items-center justify-center relative w-11 h-11 transition-all duration-200"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onMemoryCoreClick}
      >
        {/* Ambient background glow ring */}
        <div 
          className={`absolute inset-0 bg-cyan-400/20 rounded-full blur-md transition-all duration-500 scale-75 ${
            isHovered ? "scale-110 opacity-100" : "scale-75 opacity-40"
          }`}
        />

        {/* 3D Polyhedron memory icon-memory SVG with dynamic transition properties */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`w-[30px] h-[30px] text-white transition-transform duration-[1000ms] ${
            isHovered ? "rotate-[120deg] scale-105" : "rotate-0"
          }`}
        >
          <g clipPath="url(#clip0_66_764)">
            <path
              d="M29.1911 18.4354C29.6692 19.8577 29.1397 21.4242 27.8968 22.2647L16.8683 29.7233C15.6587 30.5413 14.0579 30.4784 12.9163 29.568L2.85144 21.5415C1.7339 20.6503 1.30767 19.1466 1.79136 17.8015L6.32408 5.1966C6.71738 4.10286 7.65121 3.29239 8.78942 3.05692L20.1334 0.710116C21.7873 0.367953 23.4363 1.31486 23.9744 2.91581L29.1911 18.4354ZM4.92693 19.4713C4.41854 19.6975 4.33095 20.3822 4.76603 20.7292L13.6031 27.7764C14.0053 28.0972 14.6041 27.9211 14.7686 27.4336L19.1298 14.5123C19.3365 13.8999 18.7157 13.3344 18.1252 13.5972L4.92693 19.4713ZM17.3165 25.6038C17.0894 26.2768 17.8467 26.8535 18.4351 26.4556L26.8826 20.7426C27.2463 20.4966 27.318 19.9903 27.0369 19.653L22.3969 14.0854C22.0255 13.6398 21.3095 13.7735 21.124 14.3231L17.3165 25.6038ZM4.23804 16.4022C4.01696 17.017 4.64099 17.5968 5.23788 17.3311L17.6803 11.7934C18.249 11.5403 18.272 10.7417 17.7189 10.4563L8.90381 5.90681C8.50542 5.7012 8.01709 5.89318 7.86539 6.31505L4.23804 16.4022ZM22.198 10.6257C22.1734 10.8288 22.2337 11.0329 22.3646 11.19L23.9555 13.0989C24.4811 13.7297 25.4903 13.1659 25.2287 12.3876L23.8894 8.40304C23.6375 7.65376 22.5447 7.76542 22.4496 8.55015L22.198 10.6257ZM12.4117 4.17516C11.727 4.31681 11.6004 5.24033 12.2217 5.561L19.5063 9.32055C19.9658 9.5577 20.5208 9.26385 20.5831 8.75051L21.2377 3.34853C21.2988 2.84491 20.8477 2.42995 20.3509 2.53272L12.4117 4.17516Z"
              fill="url(#paint0_radial_66_764)"
            />
            <path
              d="M29.1911 18.4354C29.6692 19.8577 29.1397 21.4242 27.8968 22.2647L16.8683 29.7233C15.6587 30.5413 14.0579 30.4784 12.9163 29.568L2.85144 21.5415C1.7339 20.6503 1.30767 19.1466 1.79136 17.8015L6.32408 5.1966C6.71738 4.10286 7.65121 3.29239 8.78942 3.05692L20.1334 0.710116C21.7873 0.367953 23.4363 1.31486 23.9744 2.91581L29.1911 18.4354ZM15.091 27.5626C15.2386 28.0378 15.8029 28.2358 16.2151 27.957L25.9641 21.3638C26.443 21.0399 26.3839 20.3171 25.8588 20.0753L12.0908 13.7361C11.5073 13.4674 10.8813 14.0168 11.072 14.6302L15.091 27.5626ZM3.85485 19.0307C3.58727 19.3502 3.63523 19.8274 3.96105 20.0872L11.2358 25.8886C11.8073 26.3443 12.6238 25.7863 12.4069 25.0883L9.12317 14.5218C8.94887 13.961 8.22298 13.8154 7.84588 14.2656L3.85485 19.0307ZM11.8367 10.4066C11.3924 10.746 11.4689 11.4363 11.9768 11.6702L25.8087 18.0389C26.3995 18.311 27.0295 17.7452 26.8223 17.1286L22.2932 3.65433C22.1312 3.17246 21.5436 2.99252 21.1396 3.3011L11.8367 10.4066ZM5.3706 13.2526C5.23036 13.6426 5.73798 13.934 6.00407 13.6163L7.8815 11.3747C8.02657 11.2015 8.08481 10.9717 8.03971 10.7503L7.66431 8.90736C7.58943 8.53979 7.07867 8.50288 6.95173 8.85587L5.3706 13.2526ZM9.44663 4.78857C9.04624 4.8714 8.78833 5.26255 8.86994 5.6632L9.46351 8.57714C9.5728 9.11366 10.2057 9.35102 10.6409 9.01866L16.0936 4.8539C16.7207 4.37492 16.2657 3.37788 15.493 3.53774L9.44663 4.78857Z"
              fill="currentColor"
            />
          </g>
          <defs>
            <radialGradient
              id="paint0_radial_66_764"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(20.7672 12.6476) rotate(105.958) scale(19.1902 17.9702)"
            >
              <stop offset="0.30755" stopColor="currentColor" stopOpacity="0.39" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <clipPath id="clip0_66_764">
              <rect width="30" height="30" fill="currentColor" />
            </clipPath>
          </defs>
        </svg>
      </div>
    </header>,
    document.body
  );
};
