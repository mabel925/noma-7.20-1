import React from "react";
import { Smile, Globe, Delete, ArrowUp } from "lucide-react";

interface VirtualKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onSend: () => void;
  className?: string;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  onKeyPress,
  onBackspace,
  onSpace,
  onSend,
  className = "",
}) => {
  const row1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const row3 = ["Z", "X", "C", "V", "B", "N", "M"];

  // Play a soft clicking audio feedback programmatically using Web Audio API (extremely hardware professional!)
  const playClickSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(320, audioCtx.currentTime); // Quick sleek tap tone
      oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.05);
      
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.06);
    } catch (e) {
      // Ignored if browser blocks audio context initially
    }
  };

  const handleKeyInteraction = (action: () => void) => {
    playClickSound();
    action();
  };

  return (
    <div
      className={`bg-[#E9E6E1] border-t border-black/5 px-1.5 pt-3 pb-2.5 flex flex-col gap-1.5 transition-colors duration-200 relative select-none ${className}`}
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Row 1 */}
      <div className="flex justify-between gap-1 w-full">
        {row1.map((char) => (
          <button
            key={char}
            onClick={() => handleKeyInteraction(() => onKeyPress(char))}
            className="flex-1 h-10 bg-white hover:bg-white/90 active:bg-[#E2DDD5] rounded-[5px] text-[17px] font-normal text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center transition-transform active:scale-95 duration-75 cursor-pointer"
          >
            {char}
          </button>
        ))}
      </div>

      {/* Row 2 */}
      <div className="flex justify-center gap-1 w-full px-[3.5%]">
        {row2.map((char) => (
          <button
            key={char}
            onClick={() => handleKeyInteraction(() => onKeyPress(char))}
            className="flex-1 h-10 bg-white hover:bg-white/90 active:bg-[#E2DDD5] rounded-[5px] text-[17px] font-normal text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center transition-transform active:scale-95 duration-75 cursor-pointer"
          >
            {char}
          </button>
        ))}
      </div>

      {/* Row 3 */}
      <div className="flex justify-between gap-1 w-full">
        {/* Left Shift Button */}
        <button
          onClick={() => playClickSound()}
          className="w-[11.5%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 duration-75 cursor-pointer"
        >
          <ArrowUp className="w-4 h-4 text-neutral-800 stroke-[2.5]" />
        </button>

        {row3.map((char) => (
          <button
            key={char}
            onClick={() => handleKeyInteraction(() => onKeyPress(char))}
            className="flex-1 h-10 bg-white hover:bg-white/90 active:bg-[#E2DDD5] rounded-[5px] text-[17px] font-normal text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center transition-transform active:scale-95 duration-75 cursor-pointer"
          >
            {char}
          </button>
        ))}

        {/* Backspace Button */}
        <button
          onClick={() => handleKeyInteraction(onBackspace)}
          className="w-[11.5%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 duration-75 cursor-pointer"
        >
          <Delete className="w-4 h-4 text-neutral-800" />
        </button>
      </div>

      {/* Row 4 */}
      <div className="flex justify-between gap-1.5 w-full">
        {/* Number Mode Switch (123) */}
        <button
          onClick={() => playClickSound()}
          className="w-[12%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] text-[14px] font-medium text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-pointer"
        >
          123
        </button>

        {/* Emoji Button */}
        <button
          onClick={() => playClickSound()}
          className="w-[10%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] cursor-pointer"
        >
          <Smile className="w-5 h-5 text-neutral-800" />
        </button>

        {/* Spacebar */}
        <button
          onClick={() => handleKeyInteraction(onSpace)}
          className="flex-1 h-10 bg-white hover:bg-white/95 active:bg-[#E2DDD5] rounded-[5px] text-[15px] text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-pointer"
        >
          space
        </button>

        {/* Action Button - Send */}
        <button
          onClick={() => handleKeyInteraction(onSend)}
          className="w-[20%] h-10 bg-[#2D2A26] hover:bg-[#3E3A35] active:bg-[#1E1C1A] text-white font-medium text-[15px] rounded-[5px] flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] cursor-pointer transition-colors"
        >
          send
        </button>
      </div>

      {/* Virtual Bottom Navigation Mockup indicator */}
      <div className="virtual-keyboard-mock-indicator flex justify-between px-6 pt-1.5 text-black/40 text-[11px] font-light">
        <Globe className="w-4 h-4 opacity-50" />
        <div className="w-1/3 h-1 bg-black/60 rounded-full mt-1.5" />
        <span className="opacity-0">Key</span>
      </div>
    </div>
  );
};
