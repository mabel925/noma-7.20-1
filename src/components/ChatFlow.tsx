import React from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useKeyboardReset } from "../hooks/useKeyboardReset";
import { MemoryCoreButton } from "./MemoryCoreButton";
import { CloseIcon } from "./CloseIcon";

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
  onMemoryCoreClick: () => void;
  isChatActive: boolean;
  isCaptureOpen: boolean;
  onPresetSearch: (preset: string) => void;
  isAuthenticated?: boolean;
}

export const ChatFlow: React.FC<ChatFlowProps> = ({
  inputValue,
  messages,
  onInputChange,
  onClearInput,
  onTriggerCamera,
  onMemoryCoreClick,
  isChatActive,
  isCaptureOpen,
  onPresetSearch,
  isAuthenticated = false,
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
              <div className="w-full h-full overflow-y-auto no-scrollbar flex flex-col justify-end gap-4 py-2 px-0">
                <div className="flex flex-col gap-[27px]">
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
                          style={
                            index === 0
                              ? {
                                  marginTop: "auto",
                                  marginBottom: messages.length === 1 && isNoma ? "30px" : undefined,
                                }
                              : undefined
                          }
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
        } ${isChatActive && !isCaptureOpen ? "chat-virtual-keyboard-active" : ""}`}
        style={{
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {/* 1. Quick Suggestion Pills wrapped in fixed-height container to prevent layout shifts */}
        <div className="h-[40px] relative w-full flex items-center shrink-0">
          <AnimatePresence>
            {isChatActive && isAuthenticated && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: inputValue ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  type: "tween",
                  duration: 0.3,
                  ease: "easeOut",
                }}
                className="chat-recommendation-layer absolute inset-0 flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar py-1 w-full justify-start items-center pl-[20px] pr-6"
                style={{ pointerEvents: inputValue ? "none" : "auto" }}
              >
                {["keys 🔑", "coffee ☕", "candle 🕯️", "book 📖"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onPresetSearch(tag.split(" ")[0])}
                    className="chat-recommendation-chip bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white font-sans text-[13px] px-3.5 py-1.5 rounded-full shadow-sm transition-all focus:outline-none cursor-pointer whitespace-nowrap"
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
              className="flex gap-5 items-center w-full px-5"
            >
              {/* White Pill Capsule */}
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-full px-4 h-[54px] flex items-center gap-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.12)] border border-white/40">
                
                {/* Add item button */}
                <button
                  onClick={onTriggerCamera}
                  className="w-8 h-8 flex items-center justify-center text-neutral-800 hover:text-neutral-900 active:scale-90 transition-all cursor-pointer shrink-0"
                  aria-label="Add item"
                  title="Add item"
                >
                  <Plus className="h-7 w-7" strokeWidth={2.25} />
                </button>
  
                {/* Text Input with visual custom details */}
                <div className="flex-1 relative flex items-center ml-1">
                  <input
                    type="text"
                    inputMode="none"
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    onFocus={() => {
                      setIsFocused(true);
                    }}
                    onBlur={() => {
                      setIsFocused(false);
                    }}
                    placeholder=""
                    className="w-full min-w-0 bg-transparent border-none outline-none text-[16px] text-neutral-800 placeholder-transparent font-sans overflow-hidden whitespace-nowrap"
                    style={{
                      caretColor: "black",
                      WebkitUserSelect: "text",
                      userSelect: "text",
                    }}
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
                  <CloseIcon className="w-3 h-3 text-neutral-600" />
                </button>
              </div>
  
              <MemoryCoreButton onClick={onMemoryCoreClick} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
