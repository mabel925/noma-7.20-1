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
  const keyboardRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef({ onKeyPress, onBackspace, onSpace, onSend });

  React.useEffect(() => {
    actionsRef.current = { onKeyPress, onBackspace, onSpace, onSend };
  }, [onKeyPress, onBackspace, onSpace, onSend]);

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

  const performKeyboardAction = (button: HTMLButtonElement) => {
    const action = button.dataset.keyAction;
    const value = button.dataset.keyValue;

    if (action === "key" && value) {
      handleKeyInteraction(() => actionsRef.current.onKeyPress(value));
    } else if (action === "backspace") {
      handleKeyInteraction(actionsRef.current.onBackspace);
    } else if (action === "space") {
      handleKeyInteraction(actionsRef.current.onSpace);
    } else if (action === "send") {
      handleKeyInteraction(actionsRef.current.onSend);
    } else if (action === "noop") {
      handleKeyInteraction(() => {});
    }
  };

  React.useEffect(() => {
    const keyboard = keyboardRef.current;
    if (!keyboard) return;

    const findKeyButton = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const button = target.closest<HTMLButtonElement>("[data-key-action]");
      return button && keyboard.contains(button) ? button : null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const button = findKeyButton(event.target);
      if (!button) return;
      event.preventDefault();
      performKeyboardAction(button);
    };

    const handleKeyboardClick = (event: MouseEvent) => {
      if (event.detail !== 0) return;
      const button = findKeyButton(event.target);
      if (!button) return;
      performKeyboardAction(button);
    };

    keyboard.addEventListener("pointerdown", handlePointerDown);
    keyboard.addEventListener("click", handleKeyboardClick);

    return () => {
      keyboard.removeEventListener("pointerdown", handlePointerDown);
      keyboard.removeEventListener("click", handleKeyboardClick);
    };
  }, []);

  return (
    <div
      ref={keyboardRef}
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
            data-key-action="key"
            data-key-value={char}
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
            data-key-action="key"
            data-key-value={char}
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
          aria-label="Shift"
          data-key-action="noop"
          className="w-[11.5%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 duration-75 cursor-pointer"
        >
          <ArrowUp className="w-4 h-4 text-neutral-800 stroke-[2.5]" />
        </button>

        {row3.map((char) => (
          <button
            key={char}
            data-key-action="key"
            data-key-value={char}
            className="flex-1 h-10 bg-white hover:bg-white/90 active:bg-[#E2DDD5] rounded-[5px] text-[17px] font-normal text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center transition-transform active:scale-95 duration-75 cursor-pointer"
          >
            {char}
          </button>
        ))}

        {/* Backspace Button */}
        <button
          aria-label="Backspace"
          data-key-action="backspace"
          className="w-[11.5%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 duration-75 cursor-pointer"
        >
          <Delete className="w-4 h-4 text-neutral-800" />
        </button>
      </div>

      {/* Row 4 */}
      <div className="flex justify-between gap-1.5 w-full">
        {/* Number Mode Switch (123) */}
        <button
          aria-label="Switch to number keyboard"
          data-key-action="noop"
          className="w-[12%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] text-[14px] font-medium text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-pointer"
        >
          123
        </button>

        {/* Emoji Button */}
        <button
          aria-label="Emoji keyboard"
          data-key-action="noop"
          className="w-[10%] h-10 bg-[#D3CFC9] hover:bg-[#CBC7BF] active:bg-[#BFBBB3] rounded-[5px] flex items-center justify-center text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] cursor-pointer"
        >
          <Smile className="w-5 h-5 text-neutral-800" />
        </button>

        {/* Spacebar */}
        <button
          data-key-action="space"
          className="flex-1 h-10 bg-white hover:bg-white/95 active:bg-[#E2DDD5] rounded-[5px] text-[15px] text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-pointer"
        >
          space
        </button>

        {/* Action Button - Send */}
        <button
          data-key-action="send"
          className="w-[20%] h-10 bg-[#2D2A26] hover:bg-[#3E3A35] active:bg-[#1E1C1A] text-white font-medium text-[15px] rounded-[5px] flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] cursor-pointer transition-colors"
        >
          send
        </button>
      </div>

      {/* Virtual Bottom Navigation Mockup indicator */}
      <div className="virtual-keyboard-mock-indicator flex justify-between px-6 pt-1.5 text-black/40 text-[11px] font-light">
        <Globe aria-hidden="true" className="w-4 h-4 opacity-50" />
        <div className="w-1/3 h-1 bg-black/60 rounded-full mt-1.5" />
        <span className="opacity-0">Key</span>
      </div>
    </div>
  );
};
