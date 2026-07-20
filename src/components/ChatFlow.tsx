import React from "react";
import { Camera, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useKeyboardReset } from "../hooks/useKeyboardReset";

interface ChatMessage {
  sender: "noma" | "user";
  text: string;
}

interface ChatFlowProps {
  inputValue: string;
  messages: ChatMessage[];
  onInputChange: (val: string) => void;
  onClearInput: () => void;
  onTriggerCamera: () => void;
  isChatActive: boolean;
  isCaptureOpen: boolean;
  onPresetSearch: (preset: string) => void;
}

export const ChatFlow: React.FC<ChatFlowProps> = ({
  inputValue,
  messages,
  onInputChange,
  onClearInput,
  onTriggerCamera,
  isChatActive,
  isCaptureOpen,
  onPresetSearch,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const outerRef = React.useRef<HTMLDivElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = React.useState(844);

  // Call the global aggressive keyboard reset logic
  useKeyboardReset(isChatActive, isCaptureOpen);

  // Monitor frame dimensions dynamically to perfectly align above Noma's head
  React.useEffect(() => {
    if (!outerRef.current) return;
    const parent = outerRef.current.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) {
          setFrameHeight(h);
        }
      }
    });
    observer.observe(parent);
    const rect = parent.getBoundingClientRect();
    if (rect.height > 0) {
      setFrameHeight(rect.height);
    }
    return () => observer.disconnect();
  }, []);

  // Smoothly scroll to the newest message whenever history updates
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatActive]);

  // Synchronized keyboard and background tracking logic
  React.useEffect(() => {
    const shouldBeActive = isChatActive && !isCaptureOpen;

    const updateKeyboardHeight = () => {
      if (!shouldBeActive) {
        document.body.classList.remove("keyboard-active");
        document.documentElement.style.setProperty("--keyboard-height", "0px");
        return;
      }

      const visualViewport = window.visualViewport;
      if (!visualViewport) return;

      let keyboardHeight = window.innerHeight - visualViewport.height;

      // 性能兜底：如果在计算出的 shift 值在 0 到 10px 之间，请强制设为 0，避免键盘收起过程中产生微小的背景抖动。
      if (keyboardHeight >= 0 && keyboardHeight <= 10) {
        keyboardHeight = 0;
      }

      if (keyboardHeight > 0) {
        document.body.classList.add("keyboard-active");
        document.documentElement.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
      } else {
        document.body.classList.add("keyboard-active");
        document.documentElement.style.setProperty("--keyboard-height", "242px"); // 242px virtual keyboard
      }
    };

    if (shouldBeActive) {
      document.body.classList.add("keyboard-active");
      updateKeyboardHeight();
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateKeyboardHeight);
        window.visualViewport.addEventListener("scroll", updateKeyboardHeight);
        window.visualViewport.onresize = updateKeyboardHeight;
        window.visualViewport.onscroll = updateKeyboardHeight;
      }
    } else {
      document.body.classList.remove("keyboard-active");
      document.documentElement.style.setProperty("--keyboard-height", "0px");
    }

    return () => {
      // 生命期保证：确保移除 .keyboard-active 类，并将 --keyboard-height 重置为 0px，确保页面返回首页时没有任何状态残留。
      document.body.classList.remove("keyboard-active");
      document.documentElement.style.setProperty("--keyboard-height", "0px");
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateKeyboardHeight);
        window.visualViewport.removeEventListener("scroll", updateKeyboardHeight);
        window.visualViewport.onresize = null;
        window.visualViewport.onscroll = null;
      }
    };
  }, [isChatActive, isCaptureOpen]);

  // Defensive Layout Alignment: Use lossless resize/visualViewport triggers
  // when returning to Chat page (whenever isChatActive is true and isCaptureOpen is false)
  React.useEffect(() => {
    if (isChatActive && !isCaptureOpen) {
      console.log("[LayoutGuard] Triggering lossless resize compensation for pristine Chat page layout.");
      
      // 触发窗口尺寸变化事件，强制已有布局逻辑重算
      window.dispatchEvent(new Event('resize'));
      
      // 检查视图窗口对象：如果布局逻辑依赖 visualViewport，添加触发
      if (window.visualViewport) {
        window.visualViewport.dispatchEvent(new Event('resize'));
      }

      // 延迟 50ms 再次调用，确保 DOM 已经完全恢复并重写算正确坐标
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (window.visualViewport) {
          window.visualViewport.dispatchEvent(new Event('resize'));
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isChatActive, isCaptureOpen]);



  const scaleMultiplier = frameHeight / 1376;
  // Position chat bubble container perfectly above Noma's head in coordinate space
  const chatBubbleBottom = 525 * scaleMultiplier;

  return (
    <>
      {/* 1. 全屏独立的会话气泡图层 (Session Bubbles Layer) */}
      <AnimatePresence>
        {isChatActive && (
          <div 
            className="absolute inset-x-0 top-0 bottom-[354px] z-50 pointer-events-none flex flex-col justify-end px-4 pb-2"
          >
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{
                type: "tween",
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="self-end pointer-events-auto flex flex-col"
              style={{
                width: "270px",
                maxHeight: "100%",
              }}
            >
              <div className="w-full h-full overflow-y-auto no-scrollbar flex flex-col justify-end gap-3 py-2 px-0">
                <div className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => {
                      const isNoma = msg.sender === "noma";
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{
                            type: "tween",
                            duration: 0.25,
                            ease: "easeOut",
                          }}
                          className={`flex w-full ${isNoma ? "justify-start" : "justify-end"}`}
                          style={index === 0 ? { marginTop: "auto" } : undefined}
                        >
                          <div
                            className={`relative max-w-[222px] px-[18px] py-[12px] transition-all duration-300 ${
                              isNoma
                                ? "bg-white text-[#1F2937] rounded-[20px]"
                                : "bg-[#E7F1FE] text-[#1F2937] rounded-[20px]"
                            }`}
                            style={{
                              fontSize: "14px",
                              lineHeight: "19px",
                              fontFamily: "Inter, sans-serif",
                              filter: "drop-shadow(0px 6px 15px rgba(0, 0, 0, 0.05))",
                            }}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            
                            {/* Custom bottom pointed tail (right-angled triangle) */}
                            {isNoma ? (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                className="absolute bottom-[-11px] left-[24px] pointer-events-none"
                              >
                                <path d="M 0 0 L 12 0 L 0 12 Z" fill="white" />
                              </svg>
                            ) : (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                className="absolute bottom-[-11px] right-[24px] pointer-events-none"
                              >
                                <path d="M 0 0 L 12 0 L 12 12 Z" fill="#E7F1FE" />
                              </svg>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
                <div ref={messagesEndRef} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. 输入和交互图层 (Input & Interaction Layer) */}
      <div
        ref={outerRef}
        className={`chat-flow-container absolute inset-x-0 bottom-[254px] z-40 flex flex-col gap-4 select-none transform ${
          isChatActive ? "translate-y-0 opacity-100" : "translate-y-[242px] opacity-0 pointer-events-none"
        }`}
        style={{
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {/* 1. Quick Suggestion Pills wrapped in fixed-height container to prevent layout shifts */}
        <div className="h-[40px] relative w-full flex items-center shrink-0">
          <AnimatePresence>
            {isChatActive && !inputValue && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  type: "tween",
                  duration: 0.3,
                  ease: "easeOut",
                }}
                className="absolute inset-0 flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar py-1 w-full justify-start items-center pl-[20px] pr-6"
              >
                {["keys 🔑", "coffee ☕", "candle 🕯️", "book 📖"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onPresetSearch(tag.split(" ")[0])}
                    className="bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-md border border-white/20 text-white font-sans text-[13px] px-3.5 py-1.5 rounded-full shadow-sm transition-all focus:outline-none cursor-pointer whitespace-nowrap"
                  >
                    {tag}
                  </button>
                ))}
                {/* Trailing item spacer to prevent any scrolling truncation or cuts at right edge */}
                <div className="w-4 shrink-0 h-1" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 2. Chat Search Input Pill Bar */}
        <AnimatePresence>
          {isChatActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                type: "tween",
                duration: 0.3,
                ease: "easeOut",
              }}
              className="flex gap-6 items-center w-full px-5"
            >
              {/* White Pill Capsule */}
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-full px-4 h-[54px] flex items-center gap-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.12)] border border-white/40">
                
                {/* Custom Camera Icon Button */}
                <button
                  onClick={onTriggerCamera}
                  className="w-8 h-8 flex items-center justify-center text-neutral-800 hover:text-neutral-900 active:scale-90 transition-all cursor-pointer shrink-0"
                >
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21.2329 7.46649V8.71823H22.8276V7.46649V6.21475H21.2329V7.46649ZM25.8223 10.4611H24.5705V18.667H25.8223H27.074V10.4611H25.8223ZM21.1556 23.3337V22.0819H8.01139V23.3337V24.5854H21.1556V23.3337ZM3.34473 18.667H4.59646V10.4606H3.34473H2.09299V18.667H3.34473ZM6.33887 7.46649V8.71823H7.93311V7.46649V6.21475H6.33887V7.46649ZM10.7329 4.66669V5.91843H18.4331V4.66669V3.41495H10.7329V4.66669ZM9.33301 6.06659H10.5847C10.5847 5.98476 10.6511 5.91843 10.7329 5.91843V4.66669V3.41495C9.26845 3.41495 8.08127 4.60213 8.08127 6.06659H9.33301ZM7.93311 7.46649V8.71823C9.39757 8.71823 10.5847 7.53105 10.5847 6.06659H9.33301H8.08127C8.08127 6.14842 8.01493 6.21475 7.93311 6.21475V7.46649ZM3.34473 10.4606H4.59646C4.59646 9.49833 5.37656 8.71823 6.33887 8.71823V7.46649V6.21475C3.99393 6.21475 2.09299 8.1157 2.09299 10.4606H3.34473ZM8.01139 23.3337V22.0819C6.12538 22.0819 4.59646 20.553 4.59646 18.667H3.34473H2.09299C2.09299 21.9357 4.74275 24.5854 8.01139 24.5854V23.3337ZM25.8223 18.667H24.5705C24.5705 20.553 23.0416 22.0819 21.1556 22.0819V23.3337V24.5854C24.4242 24.5854 27.074 21.9357 27.074 18.667H25.8223ZM22.8276 7.46649V8.71823C23.7902 8.71823 24.5705 9.49855 24.5705 10.4611H25.8223H27.074C27.074 8.11592 25.1728 6.21475 22.8276 6.21475V7.46649ZM19.833 6.06659H18.5813C18.5813 7.53105 19.7684 8.71823 21.2329 8.71823V7.46649V6.21475C21.1511 6.21475 21.0847 6.14842 21.0847 6.06659H19.833ZM19.833 6.06659H21.0847C21.0847 4.60213 19.8976 3.41495 18.4331 3.41495V4.66669V5.91843C18.5149 5.91843 18.5813 5.98476 18.5813 6.06659H19.833Z" fill="#232121"/>
                    <circle cx="14.5833" cy="14.5833" r="4.08333" stroke="#232121" strokeWidth="2.50348" strokeLinecap="round"/>
                  </svg>
                </button>
  
                {/* Text Input with visual custom details */}
                <div className="flex-1 relative flex items-center ml-1">
                  <input
                    type="text"
                    inputMode="none"
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder=""
                    className="w-full bg-transparent border-none outline-none text-[16px] text-neutral-800 placeholder-transparent font-sans"
                    style={{ caretColor: "black" }}
                  />
                  {/* Custom placeholder + blinking black caret line when empty and not focused */}
                  {!inputValue && !isFocused && (
                    <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none select-none">
                      {/* Black blinking input line */}
                      <span className="w-[1.5px] h-[17px] bg-black animate-cursor-blink-black mr-1" />
                      {/* Default text */}
                      <span className="text-[16px] text-neutral-400 font-sans">Talk to Noma</span>
                    </div>
                  )}
                  {/* Custom placeholder when focused and empty (showing native black caret on the left) */}
                  {!inputValue && isFocused && (
                    <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none select-none">
                      <span className="text-[16px] text-neutral-400 font-sans ml-[1.5px]">Talk to Noma</span>
                    </div>
                  )}
                </div>
  
                {/* Quick Clear "X" button (only visible when text exists) */}
                <button
                  onClick={onClearInput}
                  className={`w-6 h-6 rounded-full bg-neutral-200 hover:bg-neutral-300 flex items-center justify-center transition-all ${
                    inputValue ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"
                  } cursor-pointer`}
                >
                  <X className="w-3 h-3 text-neutral-600 stroke-[3]" />
                </button>
              </div>
  
              {/* Memory jewel button with transparent layout (no background circle) */}
              <button
                onClick={onTriggerCamera}
                className="w-[28px] h-[28px] flex items-center justify-center active:scale-95 transition-all cursor-pointer text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:scale-105 shrink-0"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 30 30"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-[28px] h-[28px] text-white"
                >
                  <g clipPath="url(#clip0_66_764_chat)">
                    <path
                      d="M29.1911 18.4354C29.6692 19.8577 29.1397 21.4242 27.8968 22.2647L16.8683 29.7233C15.6587 30.5413 14.0579 30.4784 12.9163 29.568L2.85144 21.5415C1.7339 20.6503 1.30767 19.1466 1.79136 17.8015L6.32408 5.1966C6.71738 4.10286 7.65121 3.29239 8.78942 3.05692L20.1334 0.710116C21.7873 0.367953 23.4363 1.31486 23.9744 2.91581L29.1911 18.4354ZM4.92693 19.4713C4.41854 19.6975 4.33095 20.3822 4.76603 20.7292L13.6031 27.7764C14.0053 28.0972 14.6041 27.9211 14.7686 27.4336L19.1298 14.5123C19.3365 13.8999 18.7157 13.3344 18.1252 13.5972L4.92693 19.4713ZM17.3165 25.6038C17.0894 26.2768 17.8467 26.8535 18.4351 26.4556L26.8826 20.7426C27.2463 20.4966 27.318 19.9903 27.0369 19.653L22.3969 14.0854C22.0255 13.6398 21.3095 13.7735 21.124 14.3231L17.3165 25.6038ZM4.23804 16.4022C4.01696 17.017 4.64099 17.5968 5.23788 17.3311L17.6803 11.7934C18.249 11.5403 18.272 10.7417 17.7189 10.4563L8.90381 5.90681C8.50542 5.7012 8.01709 5.89318 7.86539 6.31505L4.23804 16.4022ZM22.198 10.6257C22.1734 10.8288 22.2337 11.0329 22.3646 11.19L23.9555 13.0989C24.4811 13.7297 25.4903 13.1659 25.2287 12.3876L23.8894 8.40304C23.6375 7.65376 22.5447 7.76542 22.4496 8.55015L22.198 10.6257ZM12.4117 4.17516C11.727 4.31681 11.6004 5.24033 12.2217 5.561L19.5063 9.32055C19.9658 9.5577 20.5208 9.26385 20.5831 8.75051L21.2377 3.34853C21.2988 2.84491 20.8477 2.42995 20.3509 2.53272L12.4117 4.17516ZM29.1911 18.4354C29.6692 19.8577 29.1397 21.4242 27.8968 22.2647L16.8683 29.7233C15.6587 30.5413 14.0579 30.4784 12.9163 29.568L2.85144 21.5415C1.7339 20.6503 1.30767 19.1466 1.79136 17.8015L6.32408 5.1966C6.71738 4.10286 7.65121 3.29239 8.78942 3.05692L20.1334 0.710116C21.7873 0.367953 23.4363 1.31486 23.9744 2.91581L29.1911 18.4354ZM15.091 27.5626C15.2386 28.0378 15.8029 28.2358 16.2151 27.957L25.9641 21.3638C26.443 21.0399 26.3839 20.3171 25.8588 20.0753L12.0908 13.7361C11.5073 13.4674 10.8813 14.0168 11.072 14.6302L15.091 27.5626ZM3.85485 19.0307C3.58727 19.3502 3.63523 19.8274 3.96105 20.0872L11.2358 25.8886C11.8073 26.3443 12.6238 25.7863 12.4069 25.0883L9.12317 14.5218C8.94887 13.961 8.22298 13.8154 7.84588 14.2656L3.85485 19.0307ZM11.8367 10.4066C11.3924 10.746 11.4689 11.4363 11.9768 11.6702L25.8087 18.0389C26.3995 18.311 27.0295 17.7452 26.8223 17.1286L22.2932 3.65433C22.1312 3.17246 21.5436 2.99252 21.1396 3.3011L11.8367 10.4066ZM5.3706 13.2526C5.23036 13.6426 5.73798 13.934 6.00407 13.6163L7.8815 11.3747C8.02657 11.2015 8.08481 10.9717 8.03971 10.7503L7.66431 8.90736C7.58943 8.53979 7.07867 8.50288 6.95173 8.85587L5.3706 13.2526ZM9.44663 4.78857C9.04624 4.8714 8.78833 5.26255 8.86994 5.6632L9.46351 8.57714C9.5728 9.11366 10.2057 9.35102 10.6409 9.01866L16.0936 4.8539C16.7207 4.37492 16.2657 3.37788 15.493 3.53774L9.44663 4.78857Z"
                      fill="currentColor"
                    />
                  </g>
                  <defs>
                    <radialGradient
                      id="paint0_radial_66_764_chat"
                      cx="0"
                      cy="0"
                      r="1"
                      gradientUnits="userSpaceOnUse"
                      gradientTransform="translate(20.7672 12.6476) rotate(105.958) scale(19.1902 17.9702)"
                    >
                      <stop offset="0.30755" stopColor="currentColor" stopOpacity="0.39" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </radialGradient>
                    <clipPath id="clip0_66_764_chat">
                      <rect width="30" height="30" fill="currentColor" />
                    </clipPath>
                  </defs>
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
