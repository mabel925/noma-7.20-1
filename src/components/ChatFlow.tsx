import React from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ItemStickerVisual } from "./ItemStickerVisual";
import { MemoryCoreButton } from "./MemoryCoreButton";
import { CloseIcon } from "./CloseIcon";
import { classifyEmojiLocally, emojiAsset } from "../data/emojiCatalog";
import type { MemoryItem } from "./MemoryList";
import type { ChatMessage, ChatSpaceResult } from "../types/chat";

interface ChatFlowProps {
  inputValue: string;
  messages: ChatMessage[];
  onInputChange: (val: string) => void;
  onClearInput: () => void;
  onTriggerCamera: () => void;
  onMemoryCoreClick: () => void;
  isChatActive: boolean;
  isCaptureOpen: boolean;
  isSearching?: boolean;
  onItemResultClick: (item: MemoryItem) => void;
  onSpaceResultClick: (space: ChatSpaceResult) => void;
}

const ChatItemSticker: React.FC<{ item: MemoryItem; onClick?: () => void; compact?: boolean }> = ({
  item, onClick, compact = false,
}) => {
  const emojiKey = item.emoji && /^[a-z0-9-]+$/i.test(item.emoji) ? item.emoji : "";
  const emojiUrl = emojiKey ? emojiAsset(emojiKey) : "";
  const content = <ItemStickerVisual
    name={item.name}
    imageUrl={item.stickerUrl || emojiUrl}
    size={compact ? 50 : 78}
    showEmojiOutline={Boolean(emojiUrl && (!item.stickerUrl || item.stickerUrl === emojiUrl))}
    fallbackEmoji={emojiKey ? "📦" : item.emoji || "📦"}
  />;
  const className = `relative shrink-0 overflow-visible ${compact ? "h-[52px] w-[54px]" : "h-[88px] w-[78px]"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} active:scale-95 transition-transform`} aria-label={`Open ${item.name}`}>
      {content}
    </button>
  ) : <div className={className} aria-label={item.name}>{content}</div>;
};

const ChatItemResults: React.FC<{
  items: MemoryItem[];
  onItemClick: (item: MemoryItem) => void;
}> = ({ items, onItemClick }) => (
  <div className="ml-auto mr-[32px] mt-[27px] flex w-[270px] flex-wrap gap-x-[4px] gap-y-[2px] pr-1" aria-label={`${items.length} matching items`}>
    {items.map((item) => (
      <ChatItemSticker key={item.id} item={item} onClick={() => onItemClick(item)} />
    ))}
  </div>
);

const spaceImage = (space: ChatSpaceResult) => space.imageUrl || emojiAsset(
  classifyEmojiLocally(space.name, space.kind === "parent" ? "parent-space" : "sub-space").icon_key,
);

const ChatSpaceCard: React.FC<{
  space: ChatSpaceResult;
  onClick: () => void;
}> = ({ space, onClick }) => {
  const previewItems = space.items.slice(0, 3);
  const remaining = Math.max(0, space.itemCount - previewItems.length);

  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[154px] w-[272px] shrink-0 overflow-hidden rounded-[24px] bg-white px-[14px] py-[16px] text-left shadow-[0_8px_24px_rgba(35,33,33,0.08)] active:scale-[0.98] transition-transform"
      aria-label={`Open ${space.name}`}
    >
      <div className="flex items-center gap-[12px]">
        <img
          src={spaceImage(space)}
          alt=""
          className="h-[56px] w-[56px] shrink-0 rounded-[9px] bg-[#E9E6E1] object-cover"
          referrerPolicy="no-referrer"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-bold leading-tight text-[#232121]">
            {space.kind === "parent" && <span className="mr-1 text-[15px]">📍</span>}
            {space.name}{space.kind === "child" ? ` (${space.itemCount} items)` : ""}
          </div>
          <div className="mt-[8px] truncate text-[14px] font-medium leading-none text-[#232121]/50">
            {space.kind === "parent" ? `${space.itemCount} items inside` : <><span className="mr-1">📍</span>{space.parentName}</>}
          </div>
        </div>
      </div>

      {space.kind === "parent" ? (
        <div className="mt-[20px] flex gap-[9px] overflow-hidden">
          {space.subSpaces.length > 0 ? space.subSpaces.map((child) => (
            <span key={`${space.id}-${child.name}`} className="h-[38px] shrink-0 rounded-full bg-[#232121]/5 px-[20px] flex items-center text-[13px] font-medium text-neutral-500 whitespace-nowrap">
              {child.name} ({child.itemCount} items)
            </span>
          )) : (
            <span className="h-[38px] rounded-full bg-[#232121]/5 px-[20px] flex items-center text-[13px] font-medium text-neutral-500">No sub-spaces</span>
          )}
        </div>
      ) : (
        <div className="mt-[13px] flex h-[52px] items-center gap-[9px] overflow-hidden">
          {previewItems.map((item) => (
            <ChatItemSticker key={item.id} item={item} compact />
          ))}
          {remaining > 0 && (
            <span className="ml-auto flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[17px] bg-[#F3F1EC] text-[18px] font-bold text-[#232121]">+{remaining}</span>
          )}
        </div>
      )}
    </button>
  );
};

const ChatSpaceResults: React.FC<{
  spaces: ChatSpaceResult[];
  onSpaceClick: (space: ChatSpaceResult) => void;
}> = ({ spaces, onSpaceClick }) => (
  <div
    className="chat-space-results mt-[27px] w-full overflow-x-auto no-scrollbar pb-1 touch-pan-x"
    style={{
      WebkitOverflowScrolling: "touch",
      paddingLeft: "max(0px, calc(100% - 302px))",
    }}
    aria-label={`${spaces.length} matching spaces`}
  >
    <div className="flex w-max gap-[10px] pr-[32px]">
      {spaces.map((space) => (
        <ChatSpaceCard key={space.id} space={space} onClick={() => onSpaceClick(space)} />
      ))}
    </div>
  </div>
);

export const ChatFlow: React.FC<ChatFlowProps> = ({
  inputValue,
  messages,
  onInputChange,
  onClearInput,
  onTriggerCamera,
  onMemoryCoreClick,
  isChatActive,
  isCaptureOpen,
  isSearching = false,
  onItemResultClick,
  onSpaceResultClick,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const [showSearching, setShowSearching] = React.useState(false);

  React.useEffect(() => {
    if (!isSearching) {
      setShowSearching(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSearching(true), 300);
    return () => window.clearTimeout(timer);
  }, [isSearching]);

  React.useEffect(() => {
    if (!isChatActive || isCaptureOpen) return;
    const list = messagesRef.current;
    if (!list) return;
    // Only scroll this list: scrollIntoView also scrolls the app/keyboard shell.
    const scrollToLatest = () => list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    scrollToLatest();
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(list);
    return () => observer.disconnect();
  }, [messages, showSearching, isChatActive, isCaptureOpen]);

  return (
    <>
      {/* 1. 全屏独立的会话气泡图层 (Session Bubbles Layer) */}
      <AnimatePresence>
        {isChatActive && (
          <div 
            className="chat-messages-layer absolute inset-x-0 z-50 pointer-events-none flex flex-col justify-end"
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
              className="pointer-events-auto flex min-h-0 w-full flex-col"
              style={{
                maxHeight: "100%",
              }}
            >
              <div ref={messagesRef} className="min-h-0 w-full overflow-y-auto no-scrollbar flex flex-col overscroll-contain">
                <div className="mt-auto flex shrink-0 flex-col gap-[27px] pt-2 pb-3">
                  <AnimatePresence initial={false}>
                    {[...messages, ...(showSearching ? [{ id: "chat-searching", sender: "noma" as const, text: "Looking through your memory…" }] : [])].map((msg) => {
                      const isNoma = msg.sender === "noma";
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{
                            type: "tween",
                            duration: 0.25,
                            ease: "easeOut",
                          }}
                          className="w-full"
                        >
                          <div className="w-full">
                            <div className={`ml-auto mr-[32px] flex w-[270px] ${isNoma ? "justify-start" : "justify-end"}`}>
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
                                {isNoma ? (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="absolute bottom-[-11px] left-[24px] pointer-events-none">
                                    <path d="M 0 0 L 12 0 L 0 12 Z" fill="white" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="absolute bottom-[-11px] right-[24px] pointer-events-none">
                                    <path d="M 0 0 L 12 0 L 12 12 Z" fill="#E7F1FE" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            {isNoma && msg.items?.length ? <ChatItemResults items={msg.items} onItemClick={onItemResultClick} /> : null}
                            {isNoma && msg.spaces?.length ? <ChatSpaceResults spaces={msg.spaces} onSpaceClick={onSpaceResultClick} /> : null}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. 输入和交互图层 (Input & Interaction Layer) */}
      <div
        className={`chat-flow-container absolute inset-x-0 z-40 flex flex-col gap-4 select-none transform ${
          isChatActive ? "translate-y-0 opacity-100" : "translate-y-[242px] opacity-0 pointer-events-none"
        } ${isChatActive && !isCaptureOpen ? "chat-virtual-keyboard-active" : ""}`}
        style={{
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
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
