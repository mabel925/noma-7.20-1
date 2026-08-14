import React from "react";
import { createPortal } from "react-dom";
import type { AuthUser } from "../auth/AuthContext";

interface HeaderProps {
  onUserClick?: () => void;
  user?: AuthUser | null;
  isChatActive?: boolean;
}

const UserIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M12 3C12.7417 3 13.4667 3.21993 14.0834 3.63199C14.7001 4.04404 15.1807 4.62971 15.4645 5.31494C15.7484 6.00016 15.8226 6.75416 15.6779 7.48159C15.5333 8.20902 15.1761 8.8772 14.6517 9.40165C14.1272 9.9261 13.459 10.2833 12.7316 10.4279C12.0042 10.5726 11.2502 10.4984 10.5649 10.2145C9.87971 9.93072 9.29404 9.45007 8.88199 8.83339C8.46993 8.2167 8.25 7.49168 8.25 6.75C8.25 5.75544 8.64509 4.80161 9.34835 4.09835C10.0516 3.39509 11.0054 3 12 3ZM12 1.5C10.9616 1.5 9.94661 1.80791 9.08326 2.38478C8.2199 2.96166 7.54699 3.7816 7.14963 4.74091C6.75227 5.70022 6.64831 6.75582 6.85088 7.77422C7.05345 8.79262 7.55346 9.72808 8.28769 10.4623C9.02192 11.1965 9.95738 11.6966 10.9758 11.8991C11.9942 12.1017 13.0498 11.9977 14.0091 11.6004C14.9684 11.203 15.7883 10.5309 16.3652 9.66674C16.9421 8.80339 17.25 7.78835 17.25 6.75C17.25 5.35761 16.6969 4.02226 15.7123 3.03769C14.7277 2.05312 13.3924 1.5 12 1.5ZM16.5 15C17.2956 15 18.0587 15.3161 18.6213 15.8787C19.1839 16.4413 19.5 17.2044 19.5 18C19.5 18.7956 19.1839 19.5587 18.6213 20.1213C18.0587 20.6839 17.2956 21 16.5 21H7.5C6.70435 21 5.94129 20.6839 5.37868 20.1213C4.81607 19.5587 4.5 18.7956 4.5 18C4.5 17.2044 4.81607 17.2044 5.37868 15.8787C5.94129 15.3161 6.70435 15 7.5 15H16.5ZM16.5 13.5H7.5C6.30653 13.5 5.16193 13.9741 4.31802 14.818C3.47411 15.6619 3 16.8065 3 18C3 19.1935 3.47411 20.3381 4.31802 21.182C5.16193 22.0259 6.30653 22.5 7.5 22.5H16.5C17.6935 22.5 18.8381 22.0259 19.682 21.182C20.5259 22.0259 21 19.1935 21 18C21 16.8065 20.5259 15.6619 19.682 14.818C18.8381 13.9741 17.6935 13.5 16.5 13.5Z"
      fill="white"
      stroke="white"
    />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  onUserClick,
  user: _user,
  isChatActive = false,
}) => {
  return createPortal(
    <header
      className={`home-header-fixed flex items-center justify-between pointer-events-none select-none transition-all duration-300 ${
        isChatActive ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="pointer-events-auto cursor-pointer transition-all duration-200">
        <img
          src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/logo-noma.png"
          alt="Noma"
          className="h-[28px] w-[139px] object-contain"
          referrerPolicy="no-referrer"
        />
      </div>

      <button
        type="button"
        aria-label="Log in"
        title="Log in"
        onClick={onUserClick}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-0 bg-black/[0.12] shadow-none transition-transform active:scale-95"
      >
        <UserIcon />
      </button>
    </header>,
    document.body,
  );
};
