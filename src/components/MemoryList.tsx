import { t } from "../i18n/language";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Image as ImageIcon, RotateCcw, Search } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { generateEmojiOutline, getStickerTitleStyle, isChineseTitle } from "./StickerTitle";
import { TagSwitchIcon } from "./TagSwitchIcon";
import { EditPencilIcon } from "./EditPencilIcon";
import { CloseIcon } from "./CloseIcon";
import { MemoryBackIcon } from "./MemoryBackIcon";
import { PageNavigation } from "./PageNavigation";
import { GradientPillButton } from "./GradientPillButton";
import { CancelIcon } from "./CancelIcon";
import { CameraIcon } from "./CameraIcon";
import { RestartIcon } from "./RestartIcon";
import { PhotoUploadIcon } from "./PhotoUploadIcon";
import { CaptureShutterButton } from "./CaptureShutterButton";
import { CaptureScanner } from "./CaptureScanner";
import { CollapseLocationIcon, ExpandLocationIcon } from "./LocationViewIcons";
import { classifyEmojiLocally, EMOJI_CATALOG, emojiAsset, refreshEmojiAssetUrl, type EmojiKind } from "../data/emojiCatalog";
import type { MemoryOpenTarget } from "../types/chat";
import { itemBelongsToLocation, reconcileLocationSnapshot, updateLocationItem, updateLocationSnapshot } from "../services/locationSnapshot";
import { PersistentImage as SharedImage, SkeletonImage } from "./PersistentImage";
import { acquireCamera, playCameraPreview, type CameraLease } from "../services/cameraSession";

const PersistentImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => <SharedImage loading="lazy" {...props} />;

export const COLOR_BLUR_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/colorblur.png";
export const MATRIX_DOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png";
const LIGHTSPOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/lightspot.png";
const DETAIL_CATEGORIES = ["Electronics", "Apparel", "Docs", "Housewares", "Others"];
const MAX_LOCATION_TITLE_LENGTH = 18;

const limitLocationTitle = (value: string) => Array.from(value).slice(0, MAX_LOCATION_TITLE_LENGTH).join("");
const truncateLocationTitle = (value: string) => {
  const chars = Array.from(value);
  return chars.length > MAX_LOCATION_TITLE_LENGTH
    ? `${chars.slice(0, MAX_LOCATION_TITLE_LENGTH).join("")}…`
    : value;
};

const ResetEditIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M5.81553 2.27371C5.97016 2.12898 6.22429 2.12479 6.3751 2.28543L6.76085 2.69363C6.90541 2.84783 6.90954 3.10022 6.7501 3.25125L6.75108 3.25223L4.79405 5.13309H10.336C13.3022 5.13319 15.7153 7.56092 15.6866 10.5345C15.6577 13.4804 13.2152 15.8341 10.2726 15.8343H4.5919C4.37509 15.8343 4.19738 15.6575 4.19737 15.4407V14.8782C4.19754 14.6615 4.37519 14.4846 4.5919 14.4846H10.2726C12.4702 14.4845 14.3019 12.7385 14.336 10.5452C14.37 8.30913 12.5654 6.4828 10.336 6.4827H4.79405L6.75108 8.35672L6.75206 8.3577C6.90807 8.51371 6.90727 8.76009 6.76085 8.91629L6.37413 9.32449L6.37315 9.32547C6.21714 9.48148 5.97076 9.48069 5.81456 9.33426L2.43272 6.09305L2.43077 6.09109C2.27454 5.9347 2.27454 5.68108 2.43077 5.52469L2.43272 5.52273L5.81358 2.27469L5.81553 2.27371Z"
      fill="#232121"
      fillOpacity="0.5"
    />
  </svg>
);

const preloadColorBlurImage = () => {
  if (typeof window === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.src = COLOR_BLUR_IMAGE_URL;
  image.decode?.().catch(() => undefined);
};

preloadColorBlurImage();

const isEmojiImageUrl = (src?: string) => Boolean(src && /(?:^|\/)emoji\/[^/?#]+\.png(?:[?#]|$)/i.test(src));
const emojiKeyFromImageUrl = (src?: string) => {
  if (!src) return "";
  const match = src.match(/(?:^|\/)emoji\/([^/?#]+)\.png(?:[?#]|$)/i);
  return match?.[1] || "";
};

export interface MemoryItem {
  id: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  category: string;
  price: string;
  date: string;
  emoji: string;
  stickerUrl?: string;
  parentLocationName: string;
  subLocationName: string;
  parentLocationImg?: string;
  subLocationImg?: string;
  subLocationHighlight?: { x: number; y: number };
  aliases?: string[];
  attributes?: {
    colors?: string[];
    materials?: string[];
    features?: string[];
    brand?: string;
  };
}

interface MemoryListProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  onMemoriesChange: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  isLoading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
  isAuthenticated?: boolean;
  onRequireAuth?: (action?: () => void) => boolean;
  onLogin?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  openTarget?: MemoryOpenTarget | null;
  onOpenTargetHandled?: () => void;
}

const normalizeCategory = (cat: string): string => {
  const clean = (cat || "").toLowerCase().trim();
  if (clean === "all" || clean === "全部") return "all";
  if (clean.includes("electron") || clean.includes("数码") || clean.includes("家电") || clean.includes("设备") || clean.includes("电子") || clean.includes("tech")) {
    return "electronics";
  }
  if (clean.includes("apparel") || clean.includes("衣物") || clean.includes("配饰") || clean.includes("clothing") || clean.includes("coat") || clean.includes("scarf")) {
    return "apparel";
  }
  if (clean.includes("doc") || clean.includes("书籍") || clean.includes("文档") || clean.includes("证件") || clean.includes("paper") || clean.includes("book") || clean.includes("passport")) {
    return "docs";
  }
  if (clean.includes("house") || clean.includes("百货") || clean.includes("日用") || clean.includes("necessities") || clean.includes("goods") || clean.includes("mug") || clean.includes("cup") || clean.includes("key") || clean.includes("glasses")) {
    return "housewares";
  }
  return "others";
};

type SpaceSummary = {
  key: string;
  name: string;
  imgUrl: string;
  itemCount: number;
  subLocations: SubLocationSummary[];
  items: MemoryItem[];
  directItems: MemoryItem[];
  sourceField: "parent" | "sub";
  parentName: string;
};

type SubLocationSummary = {
  name: string;
  parentName: string;
  imgUrl: string;
  parentImgUrl: string;
  itemCount: number;
  items: MemoryItem[];
  subLocationHighlight?: { x: number; y: number };
};

export type MemoryLocationField = "parent" | "sub";

export type MemorySubLocationOption = {
  key: string;
  name: string;
  parentName: string;
  imgUrl: string;
  parentImgUrl?: string;
  itemCount: number;
  subLocationHighlight?: { x: number; y: number };
};

export type MemoryParentLocationOption = {
  key: string;
  name: string;
  imgUrl: string;
  itemCount: number;
};

const DETAIL_MODAL_CONTENT_HEIGHT = 734;

export const MatrixDotBackground: React.FC<{ rounded?: boolean }> = ({ rounded = false }) => (
  <img
    src={MATRIX_DOT_IMAGE_URL}
    alt=""
    aria-hidden="true"
    className={`absolute inset-0 z-0 h-full w-full object-cover pointer-events-none select-none ${rounded ? "rounded-[36px]" : ""}`}
    referrerPolicy="no-referrer"
  />
);

const LocationHeaderGradientCard: React.FC<{ className?: string }> = ({ className = "" }) => {
  const gradientId = React.useId().replace(/:/g, "");

  return (
    <svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        width="90.8981"
        height="90.8981"
        rx="16"
        transform="matrix(-0.988228 -0.152986 -0.152986 0.988228 101.477 11.6489)"
        fill={`url(#${gradientId})`}
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="75.7484"
          y1="11.222"
          x2="16.833"
          y2="85.8482"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F5B4D9" />
          <stop offset="0.655616" stopColor="#FEC7A7" />
          <stop offset="1" stopColor="#A1EBD8" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const MemorySelectedTabLine: React.FC<{ isSelected: boolean }> = ({ isSelected }) => {
  const gradientId = `memory-tab-selected-line-${React.useId().replace(/:/g, "")}`;

  return (
  <motion.svg
    width="62"
    height="17"
    viewBox="0 0 62 17"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute bottom-[-5px] left-1/2 z-0 h-[17px] w-[62px] -translate-x-1/2 pointer-events-none select-none"
    initial={false}
    animate={{
      clipPath: isSelected
        ? ["inset(0% 100% 0% 0%)", "inset(0% 0% 0% 0%)"]
        : ["inset(0% 0% 0% 0%)", "inset(0% 0% 0% 100%)"],
    }}
    transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    aria-hidden="true"
  >
    <path
      d="M31.1671 2.45151C32.3027 2.27348 33.4401 2.76032 34.0958 3.70444C34.7514 4.64862 34.8097 5.88422 34.2462 6.88608L33.0323 9.04233L57.0841 2.51987C58.6832 2.08621 60.3311 3.03113 60.7647 4.63022C61.1984 6.22932 60.2535 7.87723 58.6544 8.31089L27.6944 16.7074C26.5277 17.0238 25.2848 16.6085 24.5421 15.6546C23.7994 14.7009 23.7016 13.3948 24.294 12.3412L25.9825 9.33823L5.33408 12.5775C3.69728 12.8342 2.16214 11.7153 1.90537 10.0785C1.64866 8.44167 2.76759 6.90652 4.4044 6.64976L31.1671 2.45151Z"
      fill={`url(#${gradientId})`}
    />
    <defs>
      <linearGradient
        id={gradientId}
        x1="57.98"
        y1="2.79004"
        x2="49.5873"
        y2="25.5213"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#E9B4F5" />
        <stop offset="0.487511" stopColor="#FEC7A7" />
        <stop offset="1" stopColor="#A1EBD8" />
      </linearGradient>
    </defs>
  </motion.svg>
  );
};

const useDetailModalScale = () => {
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const updateScale = () => {
      const frame = document.getElementById("noma-iphone-frame");
      const viewportHeight = frame?.clientHeight || window.innerHeight;
      const nextScale = Math.min(1, Math.max(0.42, (viewportHeight - 24) / DETAIL_MODAL_CONTENT_HEIGHT));
      setScale(nextScale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    const frame = document.getElementById("noma-iphone-frame");
    const observer = frame && "ResizeObserver" in window ? new ResizeObserver(updateScale) : null;
    if (observer && frame) observer.observe(frame);

    return () => {
      window.removeEventListener("resize", updateScale);
      observer?.disconnect();
    };
  }, []);

  return scale;
};

const matchesText = (value: string | undefined, query: string): boolean =>
  Boolean(value && value.toLowerCase().includes(query));

const MemorySearchItem: React.FC<{ item: MemoryItem; compact?: boolean; size?: number; onClick?: () => void; tilted?: boolean }> = ({
  item,
  compact = false,
  size,
  onClick,
  tilted = true,
}) => {
  const boxSize = size ?? (compact ? 76 : 124);
  const tileWidth = size ?? (compact ? 76 : 150);
  const tileHeight = size ?? (compact ? 86 : 150);
  const emojiSize = size ? Math.round(size * 0.52) : compact ? 46 : 64;

  return (
    <div
      onClick={onClick}
      style={{ width: tileWidth, height: tileHeight }}
      className={`relative flex flex-col items-center justify-center overflow-visible select-none ${
        onClick ? "cursor-pointer active:scale-95 transition-transform" : ""
      }`}
    >
      <div
        className={`relative flex items-center justify-center overflow-visible ${tilted ? "rotate-[-1.5deg]" : ""}`}
        style={{ width: boxSize, height: boxSize }}
      >
        {item.stickerUrl ? (
          <PersistentImage
            src={item.stickerUrl}
            alt={item.name}
            className="w-full h-full object-contain block select-none"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex items-center justify-center overflow-visible select-none"
            style={{ width: boxSize, height: boxSize, fontSize: emojiSize }}
          >
            {item.emoji || "📦"}
          </div>
        )}

        <div
          className={`absolute left-1/2 z-20 -translate-x-1/2 text-center pointer-events-none select-none ${isChineseTitle(item.name) ? "font-zihun-biantao" : "font-alkatra"}`}
          style={getStickerTitleStyle(boxSize)}
        >
          {item.name}
        </div>
      </div>
    </div>
  );
};

export const PriceTag: React.FC<{ price: string; className?: string }> = ({ price, className = "" }) => (
  <div className={`h-[30px] text-white flex items-stretch justify-center select-none ${className}`}>
    <svg
      width="19"
      height="30"
      viewBox="0 0 19 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-[30px] w-[19px] shrink-0"
      aria-hidden="true"
    >
      <path
        d="M19.0738 0H14.2594C12.7704 2.47955e-05 11.3486 0.621836 10.3385 1.71582L1.41561 11.3799C-0.47187 13.4241 -0.471871 16.5759 1.41561 18.6201L10.3385 28.2842C11.3486 29.3782 12.7704 30 14.2594 30H19.0738V0ZM8.19882 17C6.83613 17 5.73104 15.8807 5.73104 14.5C5.73104 13.1193 6.83613 12 8.19882 12C9.56152 12 10.6666 13.1193 10.6666 14.5C10.6666 15.8807 9.56152 17 8.19882 17Z"
        fill="#232121"
      />
    </svg>
    <span className="h-[30px] max-w-[122px] rounded-r-[6px] rounded-l-none bg-[#232121] -ml-px pl-0 pr-3 flex items-center justify-center font-alkatra text-[15px] leading-none whitespace-nowrap overflow-hidden">
      {price || t("+ Value")}
    </span>
  </div>
);

const ItemSticker: React.FC<{
  item: MemoryItem;
  size?: number;
  title?: string;
  titleSize?: number;
  alignLeft?: boolean;
  onTitleClick?: (event: React.MouseEvent) => void;
  isTitleEditing?: boolean;
  titleTrailingAction?: React.ReactNode;
}> = ({
  item,
  size = 210,
  title,
  titleSize,
  alignLeft = false,
  onTitleClick,
  isTitleEditing = false,
  titleTrailingAction,
}) => {
  const displayTitle = title ?? item.name;
  const scale = size / 250;
  const emojiKey = item.emoji && /^[a-z0-9-]+$/i.test(item.emoji) ? item.emoji : "";
  const emojiImageUrl = emojiKey ? emojiAsset(emojiKey) : "";
  const isEmojiSticker = Boolean(emojiImageUrl && (!item.stickerUrl || item.stickerUrl === emojiImageUrl));
  const [emojiOutline, setEmojiOutline] = React.useState("");

  React.useEffect(() => {
    if (!isEmojiSticker) {
      setEmojiOutline("");
      return;
    }
    let cancelled = false;
    void generateEmojiOutline(emojiImageUrl).then((result) => {
      if (!cancelled) setEmojiOutline(result);
    });
    return () => { cancelled = true; };
  }, [emojiImageUrl, isEmojiSticker]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-visible ${alignLeft ? "origin-left items-start justify-start" : ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className="relative h-[250px] w-[250px] shrink-0 overflow-visible"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {isEmojiSticker && emojiOutline && (
          <img
            src={emojiOutline}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 z-[1] block h-[250px] w-[250px] object-contain select-none"
          />
        )}
        {item.stickerUrl && !isEmojiSticker ? (
          <PersistentImage
            src={item.stickerUrl}
            alt={item.name}
            className="absolute inset-0 z-[2] block h-[250px] w-[250px] object-contain select-none"
            referrerPolicy="no-referrer"
          />
        ) : isEmojiSticker ? (
          <PersistentImage
            src={emojiImageUrl}
            alt=""
            className="absolute inset-0 z-[2] block h-[250px] w-[250px] object-contain select-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 z-[2] flex h-[250px] w-[250px] items-center justify-center overflow-visible text-[130px] leading-none select-none">
            {item.emoji || "📦"}
          </div>
        )}

        <div
          className={`absolute left-0 z-20 text-center select-none ${isChineseTitle(displayTitle) ? "font-zihun-biantao" : "font-alkatra"} ${
            onTitleClick ? "pointer-events-auto cursor-text active:scale-[0.98] transition-transform" : "pointer-events-none"
          }`}
          style={{
            ...getStickerTitleStyle(250),
            ...(titleSize ? { fontSize: `${titleSize / scale}px`, lineHeight: `${titleSize / scale}px` } : {}),
          }}
          onClick={onTitleClick}
        >
          <span className="relative inline-block">
            {displayTitle}
            {isTitleEditing && (
              <span className="ml-[2px] inline-block h-[0.72em] w-[2px] bg-[#232121] align-[-0.08em] animate-cursor-blink-black" />
            )}
            {titleTrailingAction && (
              <span className="absolute left-full top-1/2 ml-[6px] flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center">
                {titleTrailingAction}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

const SUB_LOCATION_EMOJI_COLORS = ["#AFE9E3", "#FAA9D2", "#FFBA7B", "#E6BAFF"] as const;
const SPACE_LIST_ACCENT_COLORS = ["#D6A4F7", "#FFA6D3", "#84CAC2"] as const;
const SPACE_LIST_SURFACE_COLORS = ["#CBAEE3", "#E3978D", "#7CBFBB"] as const;

const stableColorForLocation = (value: string) => {
  const hash = Array.from(value).reduce((total, char) => ((total * 31) + (char.codePointAt(0) || 0)) >>> 0, 0);
  return SUB_LOCATION_EMOJI_COLORS[hash % SUB_LOCATION_EMOJI_COLORS.length];
};

const getRecentSpaceItems = (items: MemoryItem[], limit = 3) => items
  .map((item, index) => {
    const timestamp = Date.parse(item.createdAt || "");
    return { item, index, timestamp: Number.isFinite(timestamp) ? timestamp : null };
  })
  .sort((left, right) => (
    left.timestamp !== null && right.timestamp !== null
      ? right.timestamp - left.timestamp
      : left.index - right.index
  ))
  .slice(0, limit)
  .map(({ item }) => item);

const MemorySpaceFolderCard: React.FC<{
  space: SpaceSummary;
  onClick: () => void;
  footerMode?: "space" | "sub-summary";
  accentColor?: string;
  onLongPress?: () => void;
  isEditing?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}> = ({ space, onClick, footerMode = "space", accentColor = SPACE_LIST_ACCENT_COLORS[0], onLongPress, isEditing = false, isSelected = false, onToggle }) => {
  const recentItems = getRecentSpaceItems(space.items);
  const visibleSubLocations = footerMode === "space" ? space.subLocations.slice(0, 4) : [];
  const remainingSubLocations = Math.max(0, space.subLocations.length - visibleSubLocations.length);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = React.useRef(false);
  const previewLayouts = recentItems.length === 1
    ? [{ left: -18, top: -7, rotate: -14.73 }]
    : recentItems.length === 2
      ? [
          { left: -14, top: -4, rotate: -15.46 },
          { left: 75, top: 1, rotate: 9.02 },
        ]
      : [
          { left: -14, top: -4, rotate: -15.46 },
          { left: 24, top: 7, rotate: 23.26 },
          { left: 76, top: 1, rotate: 9.02 },
        ];
  const locationIsEmoji = isEmojiImageUrl(space.imgUrl);
  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    pressStartRef.current = null;
  };

  React.useEffect(() => clearLongPress, []);

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        didLongPressRef.current = false;
        clearLongPress();
        if (isEditing || !onLongPress || !event.isPrimary || event.button !== 0) return;
        event.stopPropagation();
        pressStartRef.current = { x: event.clientX, y: event.clientY };
        longPressTimerRef.current = setTimeout(() => {
          clearLongPress();
          didLongPressRef.current = true;
          onLongPress();
        }, 320);
      }}
      onPointerMove={(event) => {
        const start = pressStartRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
          clearLongPress();
          didLongPressRef.current = true;
        }
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onClick={() => {
        clearLongPress();
        if (didLongPressRef.current) {
          didLongPressRef.current = false;
          return;
        }
        if (isEditing) onToggle?.();
        else onClick();
      }}
      className={`memory-space-folder-card relative block ${footerMode === "space" ? "h-[212px]" : "h-[180px]"} w-[176px] min-w-0 overflow-visible text-left select-none active:scale-[0.98] transition-transform`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      aria-label={isEditing ? `Select ${space.name}` : `${space.name}, ${space.itemCount} ${t("items")}`}
      aria-pressed={isEditing ? isSelected : undefined}
    >
      <div className="memory-space-item-previews absolute left-[-8px] top-0 z-[2] h-[84px] w-[192px] overflow-visible" aria-hidden="true">
        {recentItems.map((item, index) => {
          const layout = previewLayouts[index];
          return (
            <div
              key={item.id}
              className="absolute h-[100px] w-[100px] origin-center"
              style={{
                left: layout.left + 8,
                top: layout.top,
                zIndex: index + 1,
                transform: `rotate(${layout.rotate}deg)`,
              }}
            >
              <div className="-translate-x-[6px] -translate-y-[6px]">
                <MemorySearchItem item={item} size={112} tilted={false} />
              </div>
            </div>
          );
        })}
      </div>

      <img
        src="/assets/memory-folder.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-[7px] top-[19px] z-[1] h-[161px] w-[162px] select-none opacity-70"
        draggable={false}
      />

      <div className="memory-space-folder-frost pointer-events-none absolute left-[7px] top-[62px] z-20 h-[118px] w-[162px] rounded-[24px]" />

      {footerMode === "space" && visibleSubLocations.length > 0 && (
        <div className="absolute left-[15px] top-[141px] z-30 flex items-center">
          {visibleSubLocations.map((subLocation, index) => {
            const isEmoji = isEmojiImageUrl(subLocation.imgUrl);
            return (
              <div
                key={`${space.key}-${subLocation.parentName}-${subLocation.name}`}
                className="relative mr-[-7.5px] flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-white"
                style={{
                  backgroundColor: isEmoji ? stableColorForLocation(`${subLocation.parentName}:${subLocation.name}`) : "#E9E6E1",
                  zIndex: index + 1,
                }}
                title={subLocation.name}
              >
                <SkeletonImage
                  src={subLocation.imgUrl}
                  alt={subLocation.name}
                  className={`h-full w-full rounded-full ${isEmoji ? "object-contain p-[3px]" : "object-cover"}`}
                  referrerPolicy="no-referrer"
                />
              </div>
            );
          })}
          {remainingSubLocations > 0 && (
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#F0EEEB] text-[13px] font-sans font-semibold leading-none text-[#232121]/50">
              +{remainingSubLocations}
            </div>
          )}
        </div>
      )}

      <div className="absolute left-[99px] top-[62px] z-30 flex h-[66px] w-[66px] items-center justify-center">
        <div
          className={`flex h-[58px] w-[58px] -rotate-9 items-center justify-center overflow-hidden rounded-[12px] shadow-[2px_2px_4px_rgba(0,0,0,0.08)] ${locationIsEmoji ? "memory-space-emoji-cover border border-[#FFB775] p-[9px]" : "border-[2.5px] border-white bg-[#E9E6E1]"}`}
        >
          <SkeletonImage
            src={space.imgUrl}
            alt={space.name}
            className={`h-full w-full rounded-[9px] ${locationIsEmoji ? "object-contain" : "object-cover"}`}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <img
        src="/assets/memory-pin@3x.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-[122px] top-[54px] z-40 h-[30px] w-[30px] select-none object-contain"
        draggable={false}
      />

      {footerMode === "space" ? (
        <div className="absolute left-1/2 top-[194px] flex w-[176px] -translate-x-1/2 items-end justify-center px-[2px] text-center font-sans text-[14px] leading-[17px] tracking-[0]">
          {space.sourceField === "parent" && <span className="mb-[1px] mr-[4px] shrink-0 text-[14px] leading-[17px]" aria-hidden="true">📍</span>}
          <span className="memory-space-folder-name min-w-0 font-semibold text-[#080808]">{space.name}</span>
          <span className="ml-[2px] shrink-0 whitespace-nowrap font-normal leading-[17px] text-[#232121]/50">({space.itemCount})</span>
        </div>
      ) : (
        <div className="absolute bottom-[13px] left-[23px] z-30 max-w-[120px] text-left font-sans tracking-[0]">
          <div className="truncate text-[16px] font-semibold leading-[20px] text-[#080808]">{space.name}</div>
          <div className="mt-[3px] flex items-center gap-[5px] whitespace-nowrap text-[14px] font-normal leading-[18px] text-[#232121]/50">
            <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
            <span>{space.itemCount} {space.itemCount === 1 ? t("item") : t("items")}</span>
          </div>
        </div>
      )}
      {isEditing && (
        <div className="pointer-events-none absolute right-[2px] top-[20px] z-50">
          <MemorySelectorIcon selected={isSelected} />
        </div>
      )}
    </button>
  );
};

const MemorySpaceShelfCard: React.FC<{ space: SpaceSummary; index: number; onClick: () => void }> = ({ space, index, onClick }) => {
  const accentColor = SPACE_LIST_ACCENT_COLORS[index % SPACE_LIST_ACCENT_COLORS.length];
  const surfaceColor = SPACE_LIST_SURFACE_COLORS[index % SPACE_LIST_SURFACE_COLORS.length];
  const recentItems = getRecentSpaceItems(space.items, 5);
  const visibleSubLocations = space.subLocations.slice(0, 4);
  const remainingSubLocations = Math.max(0, space.subLocations.length - visibleSubLocations.length);
  const locationIsEmoji = isEmojiImageUrl(space.imgUrl);
  // Centers and rotations from Figma 672:4242, with the first 1–5 slots recentered as a group.
  const itemTemplate = [
    { centerX: 61.908, centerY: 61.908, size: 100, rotate: -15.46, zIndex: 1 },
    { centerX: 111.802, centerY: 82.802, size: 100, rotate: 23.26, zIndex: 2 },
    { centerX: 165.548, centerY: 73.348, size: 100, rotate: 9.02, zIndex: 4 },
    { centerX: 227.58, centerY: 69.577, size: 78.4, rotate: -8.52, zIndex: 3 },
    { centerX: 291.218, centerY: 75.218, size: 100, rotate: 9.02, zIndex: 5 },
  ];
  const itemLayouts = itemTemplate.slice(0, recentItems.length);
  const itemBounds = itemLayouts.map((layout) => {
    const angle = layout.rotate * Math.PI / 180;
    const halfWidth = layout.size * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) / 2;
    return { left: layout.centerX - halfWidth, right: layout.centerX + halfWidth };
  });
  const itemCenterOffset = itemBounds.length > 0
    ? 180 - (Math.min(...itemBounds.map((bounds) => bounds.left)) + Math.max(...itemBounds.map((bounds) => bounds.right))) / 2
    : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block h-[197px] w-[360px] max-w-full overflow-hidden bg-transparent text-left active:scale-[0.99] transition-transform"
      aria-label={`${space.name}, ${space.itemCount} ${t("items")}`}
    >
      <div className="absolute left-1/2 top-[-19px] h-[164px] w-[360px] -translate-x-1/2 overflow-hidden rounded-[24px]">
        <div className="memory-space-shelf-item-previews pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          {recentItems.map((item, itemIndex) => {
            const layout = itemLayouts[itemIndex];
            return (
              <div
                key={item.id}
                className="absolute"
                style={{ left: layout.centerX + itemCenterOffset - layout.size / 2, top: layout.centerY - layout.size / 2, width: layout.size, height: layout.size, zIndex: layout.zIndex, transform: `rotate(${layout.rotate}deg)` }}
              >
                <MemorySearchItem item={item} size={layout.size} tilted={false} />
              </div>
            );
          })}
        </div>

        <div className="memory-space-shelf-surface pointer-events-none absolute left-0 top-[83px] z-10 h-[81px] w-[360px] rounded-[24px]" style={{ backgroundColor: `${surfaceColor}99` }} />

        <div className="absolute left-[6px] top-[82px] z-20 flex h-[66px] w-[66px] items-center justify-center">
          <div className={`flex h-[58px] w-[58px] -rotate-9 items-center justify-center overflow-hidden rounded-[12px] shadow-[2px_2px_4px_rgba(0,0,0,0.08)] ${locationIsEmoji ? "memory-space-emoji-cover border border-[#FFB775] p-[9px]" : "border-[2.5px] border-white bg-[#E9E6E1]"}`}>
            <SkeletonImage src={space.imgUrl} alt={space.name} className={`h-full w-full rounded-[9px] ${locationIsEmoji ? "object-contain" : "object-cover"}`} referrerPolicy="no-referrer" />
          </div>
        </div>
        <img src="/assets/memory-pin@3x.png" alt="" aria-hidden="true" className="pointer-events-none absolute left-[29px] top-[74px] z-30 h-[30px] w-[30px] select-none object-contain" draggable={false} />

        {visibleSubLocations.length > 0 && (
          <div className="absolute right-[20px] top-[108px] z-20 flex items-center -space-x-[8px]">
            {visibleSubLocations.map((subLocation, subIndex) => {
              const isEmoji = isEmojiImageUrl(subLocation.imgUrl);
              return (
                <div
                  key={`${space.key}-${subLocation.parentName}-${subLocation.name}`}
                  className="relative flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white"
                  style={{ backgroundColor: isEmoji ? stableColorForLocation(`${subLocation.parentName}:${subLocation.name}`) : "#E9E6E1", zIndex: subIndex + 1 }}
                  title={subLocation.name}
                >
                  <SkeletonImage src={subLocation.imgUrl} alt={subLocation.name} className={`h-full w-full rounded-full ${isEmoji ? "object-contain p-[3px]" : "object-cover"}`} referrerPolicy="no-referrer" />
                </div>
              );
            })}
            {remainingSubLocations > 0 && (
              <div className="relative z-10 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-[#F0EEEB] text-[14px] font-sans font-semibold leading-none text-[#232121]/50">
                +{remainingSubLocations}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute left-[calc(50%-7.5px)] top-[159px] flex w-[250px] -translate-x-1/2 flex-col items-center font-sans tracking-[0]">
        <div className="memory-space-shelf-name max-w-full text-center text-[16px] font-semibold leading-[20px] text-[#080808]">
          {space.sourceField === "parent" ? "📍" : ""}{space.name}
        </div>
        <div className="mt-[1px] flex items-center justify-center gap-[4px] whitespace-nowrap text-[14px] font-normal leading-[18px] text-[#232121]/50">
          <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
          <span>{space.itemCount} {space.itemCount === 1 ? t("item") : t("items")}</span>
        </div>
      </div>
    </button>
  );
};

const ParentSpaceResultCard: React.FC<{ space: SpaceSummary; onClick?: () => void }> = ({ space, onClick }) => (
  <div
    onClick={onClick}
    className="w-full h-[160px] rounded-[24px] bg-white overflow-hidden px-[14px] py-[18px] select-none cursor-pointer active:scale-[0.98] transition-transform"
  >
    <div className="flex items-center gap-[12px]">
      <div className={`relative w-[56px] h-[56px] rounded-[8px] overflow-hidden shrink-0 ${isEmojiImageUrl(space.imgUrl) ? "bg-[#E9E6E1]" : "bg-neutral-100"}`}>
        <SkeletonImage
          src={space.imgUrl}
          alt={space.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="eager"
        />
      </div>
      <div className="min-w-0 pt-[1px] pl-[21px]">
        <div className="relative text-[#232121] text-[18px] leading-none font-sans font-bold tracking-tight">
          <span className="absolute left-[-21px] top-0 text-[16px] leading-none">📍</span>
          <span className="block truncate">{space.name}</span>
        </div>
        <div className="mt-[8px] text-[#232121]/50 text-[14px] leading-none font-sans font-medium">
          {space.itemCount}{" "}{t("items inside")}{" "}</div>
      </div>
    </div>

    {space.subLocations.length > 0 && (
      <div className="-mr-[14px] mt-[24px] flex gap-[10px] overflow-x-auto pr-0 no-scrollbar">
        {space.subLocations.map((sub) => (
          <div
            key={`${space.name}-${sub.name}`}
            className="h-[38px] px-[25px] rounded-full bg-[#232121]/5 flex items-center justify-center text-[14px] font-sans font-medium text-neutral-500 whitespace-nowrap shrink-0"
          >
            {sub.name} ({sub.itemCount}{" "}{t("items)")}{" "}</div>
        ))}
      </div>
    )}
  </div>
);

const ChildSpaceResultCard: React.FC<{ space: SubLocationSummary; onClick?: () => void }> = ({ space, onClick }) => {
  const previewItems = space.items.slice(0, 3);
  const remaining = Math.max(0, space.itemCount - previewItems.length);

  return (
    <div
      onClick={onClick}
      className="w-full h-[160px] rounded-[24px] bg-white overflow-hidden px-[14px] py-[18px] select-none cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start gap-[12px]">
        <div className={`relative w-[56px] h-[56px] rounded-[8px] overflow-hidden shrink-0 ${isEmojiImageUrl(space.imgUrl) ? "bg-[#E9E6E1]" : "bg-neutral-100"}`}>
          {space.imgUrl ? (
            <SkeletonImage
              src={space.imgUrl}
              alt={space.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-[#DDDAD5]" aria-label="Sub-location photo unavailable" />
          )}
        </div>
        <div className="min-w-0 pt-[8px]">
          <div className="text-[#232121] text-[18px] leading-none font-sans font-semibold tracking-tight truncate">
            {space.name} ({space.itemCount}{" "}{t("items)")}{" "}</div>
          <div className="mt-[13px] text-[#232121]/50 text-[14px] leading-none font-sans font-medium truncate">
            <span className="text-[14px] mr-[3px] align-[1px]">📍</span>
            {space.parentName}
          </div>
        </div>
      </div>

      <div className="mt-[17px] flex items-center justify-between gap-[14px]">
        {previewItems.map((item) => (
          <MemorySearchItem key={item.id} item={item} compact />
        ))}
        {remaining > 0 && (
          <div className="ml-auto w-[50px] h-[50px] rounded-[17px] bg-[#F3F1EC] flex items-center justify-center text-[#232121] text-[18px] font-sans font-bold shrink-0">
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
};

const ModalLocationTextGroup: React.FC<{
  parentName: string;
  subName: string;
  className?: string;
  textMaxWidth?: number;
  isEditing?: boolean;
  editingField?: "parent" | "sub" | null;
  onParentClick?: () => void;
  onSubClick?: () => void;
  onParentSwitch?: () => void;
  onSubSwitch?: () => void;
  showEditableUnderline?: boolean;
}> = ({
  parentName,
  subName,
  className = "",
  textMaxWidth = 244,
  isEditing = false,
  editingField = null,
  onParentClick,
  onSubClick,
  onParentSwitch,
  onSubSwitch,
  showEditableUnderline = false,
}) => {
  const parentCanEdit = isEditing && Boolean(onParentClick);
  const subCanEdit = isEditing && Boolean(onSubClick);
  const parentSwitchAction = onParentSwitch;
  const subSwitchAction = onSubSwitch;

  return (
    <div className={`text-left overflow-visible ${className}`}>
      <div className="relative">
        <div className="flex min-h-[28px] items-center">
        <span
          className="pointer-events-none absolute left-[-20px] top-[3px] text-[18px] leading-none"
          aria-hidden="true"
        >
          📍
        </span>
        {parentCanEdit ? (
          <button
            type="button"
            className={`min-w-0 truncate text-left text-[22px] font-sans font-semibold text-[#232121] tracking-tight leading-tight cursor-text active:scale-[0.98] transition-transform ${
              showEditableUnderline ? "border-b border-[#CCC4BE] pb-[3px]" : ""
            }`}
            style={{ maxWidth: `${textMaxWidth}px` }}
            onClick={(event) => {
              event.stopPropagation();
              onParentClick?.();
            }}
          >
            <span className="block min-h-[28px] truncate">
              {parentName || "Main Bedroom"}
              {editingField === "parent" && (
                <span className="ml-[2px] inline-block h-[23px] w-[2px] bg-[#232121] align-[-3px] animate-cursor-blink-black" />
              )}
            </span>
          </button>
        ) : (
          <span
            className="block min-w-0 truncate text-[22px] font-sans font-semibold text-[#232121] tracking-tight leading-tight"
            style={{ maxWidth: `${textMaxWidth}px` }}
          >
            {parentName || "Main Bedroom"}
          </span>
        )}
        {isEditing && parentSwitchAction && (
          <button
            type="button"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              parentSwitchAction();
            }}
            aria-label={t("Switch parent location")}
            title={t("Switch parent location")}
          >
            <TagSwitchIcon className="translate-y-[2px]" />
          </button>
        )}
        </div>

        <div className="mt-[2px] flex min-h-[23px] items-center">
        {subCanEdit ? (
          <button
            type="button"
            className={`min-w-0 truncate text-left text-[18px] font-sans font-normal text-[#232121]/50 leading-tight cursor-text active:scale-[0.98] transition-transform ${
              showEditableUnderline ? "border-b border-[#CCC4BE] pb-[3px]" : ""
            }`}
            style={{ maxWidth: `${textMaxWidth}px` }}
            onClick={(event) => {
              event.stopPropagation();
              onSubClick?.();
            }}
          >
            <span className="block truncate">
              {subName || "Nightstand"}
              {editingField === "sub" && (
                <span className="ml-[2px] inline-block h-[19px] w-[2px] bg-[#232121]/50 align-[-3px] animate-cursor-blink-black" />
              )}
            </span>
          </button>
        ) : (
          <span
            className="block min-w-0 truncate text-left text-[18px] font-sans font-normal text-[#232121]/50 leading-tight"
            style={{ maxWidth: `${textMaxWidth}px` }}
          >
            {subName || "Nightstand"}
          </span>
        )}
        {isEditing && subSwitchAction && (
          <button
            type="button"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              subSwitchAction();
            }}
            aria-label={t("Switch sub-location")}
            title={t("Switch sub-location")}
          >
            <TagSwitchIcon className="translate-y-[2px]" />
          </button>
        )}
        </div>
      </div>
    </div>
  );
};

const DeleteActionIcon: React.FC<{ color?: string; opacity?: number; size?: number }> = ({
  color = "#232121",
  opacity = 0.5,
  size = 18,
}) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16.2193 4.40684H12.9375V3.75117C12.9375 2.30098 11.7615 1.125 10.3131 1.125H7.68691C6.23848 1.125 5.0625 2.30098 5.0625 3.74941V4.40508H1.78066C1.41855 4.40684 1.125 4.70039 1.125 5.0625C1.125 5.42461 1.41855 5.71816 1.78066 5.71816H3.09375V14.2488C3.09375 15.699 4.26973 16.8732 5.71816 16.8732H12.2801C13.7303 16.8732 14.9045 15.6973 14.9045 14.2488V5.71816H16.2176C16.5797 5.71816 16.8732 5.42461 16.8732 5.0625C16.875 4.70039 16.5814 4.40684 16.2193 4.40684ZM6.37559 3.74941C6.37559 3.0252 6.96269 2.43633 7.68867 2.43633H10.3131C11.0373 2.43633 11.6262 3.02344 11.6262 3.74941V4.40508H6.37559V3.74941ZM13.5932 14.2506C13.5932 14.9748 13.0061 15.5637 12.2801 15.5637H5.71816C4.99394 15.5637 4.40508 14.9766 4.40508 14.2506V5.71816H13.5932V14.2506Z" fill={color} fillOpacity={opacity} />
    <path d="M10.9688 7.61328C10.6067 7.61328 10.3131 7.90684 10.3131 8.26895V12.8621C10.3131 13.2242 10.6067 13.5178 10.9688 13.5178C11.3309 13.5178 11.6244 13.2242 11.6244 12.8621V8.26895C11.6244 7.90684 11.3309 7.61328 10.9688 7.61328ZM7.03127 7.61328C6.66916 7.61328 6.37561 7.90684 6.37561 8.26895V12.8621C6.37561 13.2242 6.66916 13.5178 7.03127 13.5178C7.39338 13.5178 7.68694 13.2242 7.68694 12.8621V8.26895C7.68694 7.90684 7.39338 7.61328 7.03127 7.61328Z" fill={color} fillOpacity={opacity} />
  </svg>
);

const MemorySelectorIcon: React.FC<{ selected: boolean; size?: number }> = ({ selected, size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className="shrink-0"
    style={{ width: size, height: size }}
  >
    <rect width="24" height="24" rx="12" fill={selected ? "#FFBA7B" : "#FFFFFF"} />
    {selected && (
      <path
        d="M8 12.1739L10.7931 16L17 8"
        stroke="#232121"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const MemoryActionButton: React.FC<{
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
}> = ({ label, onClick, children, className = "" }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`w-[36px] h-[36px] rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform ${className}`}
  >
    {children}
  </button>
);

const DetailCardActionGroup: React.FC<{
  isEditing: boolean;
  onEditToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCloseOrCancel: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}> = ({ isEditing, onEditToggle, onCloseOrCancel, className = "" }) => (
  <div className={`absolute right-0 top-[-52px] z-30 flex items-center gap-[16px] ${className}`}>
    {isEditing ? (
      <>
        <MemoryActionButton label="Cancel editing" onClick={onCloseOrCancel}>
          <CancelIcon className="h-4 w-4 text-[#232121]/50" />
        </MemoryActionButton>
        <MemoryActionButton label="Confirm edits" onClick={onEditToggle} className="!bg-[#232121] text-white">
          <Check className="h-4 w-4 text-white stroke-[3]" />
        </MemoryActionButton>
      </>
    ) : (
      <>
        <MemoryActionButton label="Edit card" onClick={onEditToggle}>
          <EditPencilIcon />
        </MemoryActionButton>
        <MemoryActionButton label="Close detail" onClick={onCloseOrCancel}>
          <CloseIcon className="h-4 w-4 text-[#232121]/50" />
        </MemoryActionButton>
      </>
    )}
  </div>
);

const RetakePhotoButton: React.FC<{
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  icon?: React.ReactNode;
}> = ({ onClick, label = "Retake photo", icon }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/60 text-white active:scale-95 transition-transform"
  >
    {icon || <CameraIcon className="h-[22px] w-[22px]" />}
  </button>
);

const LocationRetakeCapture: React.FC<{
  initialImage?: string;
  onCancel: () => void;
  onConfirm: (imgUrl: string) => void;
  titleText: string;
  promptText: string;
  confirmText: string;
  captureLabel: string;
  previewLabel: string;
}> = ({
  initialImage,
  onCancel,
  onConfirm,
  titleText,
  promptText,
  confirmText,
  captureLabel,
  previewLabel,
}) => {
  const [phase, setPhase] = React.useState<"capture" | "preview">("capture");
  const [capturedImage, setCapturedImage] = React.useState(initialImage || "");
  const [cameraActive, setCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState("");
  const [shutterFlash, setShutterFlash] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cameraLeaseRef = React.useRef<CameraLease | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const stopCamera = React.useCallback(() => {
    cameraLeaseRef.current?.release();
    cameraLeaseRef.current = null;
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  React.useEffect(() => {
    if (phase !== "capture") {
      stopCamera();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable in this browser. You can still upload a photo.");
        return;
      }

      try {
        const lease = await acquireCamera(controller.signal);
        if (cancelled) {
          lease.release();
          return;
        }
        const stream = lease.stream;
        cameraLeaseRef.current = lease;
        streamRef.current = stream;
        if (videoRef.current) {
          await playCameraPreview(videoRef.current, stream, controller.signal);
        }
        if (cancelled) return;
        setCameraActive(true);
        setCameraError("");
      } catch {
        if (cancelled) return;
        stopCamera();
        setCameraError("Could not start the camera. Check browser permissions or upload a photo.");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      controller.abort();
      stopCamera();
    };
  }, [phase, stopCamera]);

  const handleCapture = () => {
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 180);

    let nextImage = "";
    const video = videoRef.current;
    if (video && cameraActive && video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      nextImage = canvas.toDataURL("image/jpeg", 0.92);
    }

    setCapturedImage(
      nextImage ||
        initialImage ||
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=600&auto=format&fit=crop"
    );
    setPhase("preview");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      setPhase("preview");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    stopCamera();
    onConfirm(capturedImage);
  };

  return (
    <motion.div
      className="camera-page-container camera-wrapper absolute inset-0 z-[260] overflow-hidden bg-[#161616] select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="capture-top-prompt absolute inset-x-6 z-40 flex flex-col items-center pointer-events-none">
        <h3 className="max-w-[300px] text-center text-[20px] font-sans font-semibold leading-snug tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {phase === "capture" ? titleText : promptText}
        </h3>
      </div>

      <div className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden">
        {phase === "capture" ? (
          <>
            <video
              ref={videoRef}
              className={`absolute inset-0 block h-full w-full object-cover object-center ${cameraActive ? "opacity-100" : "opacity-0"}`}
              autoPlay
              playsInline
              muted
            />
            {!cameraActive && <div className="absolute inset-0 bg-[#161616]" />}
            {cameraError && (
              <div className="absolute inset-x-8 top-1/2 z-40 flex -translate-y-1/2 items-center justify-center text-center">
                <p className="max-w-[300px] text-[20px] font-sans leading-snug text-white/80">{cameraError}</p>
              </div>
            )}
            <div className={`absolute inset-x-0 top-0 z-20 flex h-full items-center justify-center pointer-events-none ${cameraError ? "hidden" : ""}`}>
              <svg width="164" height="164" viewBox="0 0 164 164" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                <path d="M0 150.5V142.375H3V150.5C3 156.299 7.70101 161 13.5 161H21.625V164H13.5C6.04416 164 0 157.956 0 150.5ZM161 150.5V142.375H164V150.5C164 157.956 157.956 164 150.5 164H142.375V161H150.5C156.299 161 161 156.299 161 150.5ZM0 13.5C0 6.04416 6.04416 0 13.5 0H21.625V3H13.5C7.70101 3 3 7.70101 3 13.5V21.625H0V13.5ZM161 13.5C161 7.70101 156.299 3 150.5 3H142.375V0H150.5C157.956 0 164 6.04416 164 13.5V21.625H161V13.5Z" fill="white" />
              </svg>
            </div>
          </>
        ) : (
          <div className="relative h-full w-full overflow-hidden bg-[#E9E6E1]">
            <img src={capturedImage} alt="Sub-location captured preview" className="h-full w-full object-cover" />
            <img
              src={MATRIX_DOT_IMAGE_URL}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-[0.15] mix-blend-overlay pointer-events-none select-none"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>

      {shutterFlash && <div className="pointer-events-none absolute inset-0 z-[80] bg-white/85" />}

      <div className="storage-capture-drawer absolute bottom-0 left-0 right-0 z-50 flex h-[213px] w-full flex-col items-center justify-center rounded-t-[60px] bg-[#E9E6E1] px-6 shadow-[0_-12px_40px_rgba(0,0,0,0.15)]">
        <div className="absolute top-[8px] h-1 w-12 rounded-full bg-neutral-300 opacity-70" />
        <div className="flex w-full items-center justify-center gap-12">
          {phase === "capture" ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-12 w-12 items-center justify-center rounded-full text-[#3A3938] active:scale-95"
                aria-label={t("Upload photo instead")}
                title={t("Upload photo instead")}
              >
                <ImageIcon className="h-6 w-6 text-[#3A3938]" />
              </button>
              <button
                type="button"
                onClick={handleCapture}
                className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.15)] active:scale-95"
                aria-label={captureLabel}
                title={captureLabel}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-orange-400 to-red-400 opacity-90 blur-[2px]" />
                <div className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-white bg-[#F3F1EC] shadow-inner">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-[#181817]">
                    <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex h-12 w-12 items-center justify-center text-[13px] font-sans font-normal text-neutral-500 active:scale-95"
              >{" "}{t("Cancel")}{" "}</button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPhase("capture")}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#232121] active:scale-95"
                aria-label={previewLabel}
                title={previewLabel}
              >
                <RotateCcw className="h-5 w-5 stroke-[2]" />
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#232121] text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] active:scale-95"
                aria-label={confirmText}
                title={confirmText}
              >
                <Check className="h-[22px] w-[22px] stroke-[3]" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex h-12 w-12 items-center justify-center text-[13px] font-sans font-normal text-neutral-500 active:scale-95"
              >{" "}{t("Cancel")}{" "}</button>
            </>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
    </motion.div>
  );
};

/**
 * Memory-only location image replacement flow. Unlike the add-location flow,
 * this intentionally has no title input: it only replaces the selected
 * location skin. Parent and child details both use this same component.
 */
const LocationImageEditFlow: React.FC<{
  initialImage?: string;
  initialMode?: "emoji" | "camera";
  emojiKind: EmojiKind;
  onCancel: () => void;
  onConfirm: (imageUrl: string) => void;
}> = ({ initialImage = "", initialMode, emojiKind, onCancel, onConfirm }) => {
  const [mode, setMode] = React.useState<"emoji" | "camera">(
    initialMode || (isEmojiImageUrl(initialImage) ? "emoji" : "camera"),
  );
  const [workingImage, setWorkingImage] = React.useState(initialImage);
  const [phase, setPhase] = React.useState<"capture" | "preview">("capture");
  const [cameraActive, setCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState("");
  const [shutterFlash, setShutterFlash] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cameraLeaseRef = React.useRef<CameraLease | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const stopCamera = React.useCallback(() => {
    cameraLeaseRef.current?.release();
    cameraLeaseRef.current = null;
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  React.useEffect(() => {
    if (mode !== "camera" || phase !== "capture") {
      stopCamera();
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is unavailable. You can upload a photo instead.");
        return;
      }
      try {
        const lease = await acquireCamera(controller.signal);
        if (cancelled) {
          lease.release();
          return;
        }
        const stream = lease.stream;
        cameraLeaseRef.current = lease;
        streamRef.current = stream;
        if (videoRef.current) await playCameraPreview(videoRef.current, stream, controller.signal);
        if (cancelled) return;
        setCameraActive(true);
        setCameraError("");
      } catch {
        if (cancelled) return;
        stopCamera();
        setCameraError("Could not start the camera. You can upload a photo instead.");
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      controller.abort();
      stopCamera();
    };
  }, [mode, phase, stopCamera]);

  const changeMode = (nextMode: "emoji" | "camera") => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPhase("capture");
    setWorkingImage((current) => {
      if (!current) return "";
      return nextMode === "emoji" && isEmojiImageUrl(current) ? current :
        nextMode === "camera" && !isEmojiImageUrl(current) ? current : "";
    });
  };

  const resetImage = () => {
    stopCamera();
    setWorkingImage("");
    setPhase("capture");
    setCameraError("");
  };

  const captureFrame = () => {
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 180);
    const video = videoRef.current;
    if (!video || !cameraActive || video.videoWidth <= 0 || video.videoHeight <= 0) {
      fileInputRef.current?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const nextImage = canvas.toDataURL("image/jpeg", 0.92);
    setWorkingImage(nextImage);
    setPhase("preview");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setWorkingImage(String(reader.result || ""));
      setPhase("preview");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const confirmImage = () => {
    if (!workingImage) return;
    stopCamera();
    onConfirm(workingImage);
  };

  return (
    <motion.div
      className="absolute inset-0 z-[270] overflow-hidden bg-[#E9E6E1] select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="noma-add-modebar">
        <div className="noma-add-segmented" role="tablist" aria-label="Location image mode">
          <button type="button" role="tab" aria-selected={mode === "emoji"} className={mode === "emoji" ? "is-active" : ""} onClick={() => changeMode("emoji")}>
            <span aria-hidden="true">🦄</span><span>{t("Emoji Mode")}</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === "camera"} className={mode === "camera" ? "is-active" : ""} onClick={() => changeMode("camera")}>
            <CameraIcon className="h-7 w-7" /><span>{t("Camera")}</span>
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[126px] bottom-[178px] flex items-center justify-center px-4">
        {mode === "emoji" ? (
          <div className="flex h-[424px] w-[350px] flex-col items-center justify-center rounded-[36px] bg-white/55 p-5 shadow-[0_12px_32px_rgba(35,33,33,0.08)]">
            <div className="flex h-[228px] w-[228px] items-center justify-center rounded-[32px] bg-[#E9E6E1]">
              {workingImage ? (
                <SkeletonImage src={workingImage} alt="Selected emoji" className="h-[186px] w-[186px] object-contain" referrerPolicy="no-referrer" />
              ) : (
                <img src={emojiAsset(emojiKind === "parent-space" ? "home" : "box")} alt="Choose an emoji" className="h-[186px] w-[186px] object-contain opacity-40" />
              )}
            </div>
            <div className="mt-4 grid max-h-[150px] w-full grid-cols-6 gap-2 overflow-y-auto px-2" aria-label="Choose emoji">
              {EMOJI_CATALOG.filter((entry) => entry.kind === emojiKind).map((entry) => (
                <button key={entry.key} type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white active:scale-95" onClick={() => setWorkingImage(emojiAsset(entry.key))} aria-label={entry.key}>
                  <img src={emojiAsset(entry.key)} alt="" className="h-9 w-9 object-contain" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative h-[424px] w-[350px] overflow-hidden rounded-[36px] bg-[#1b1b1b] shadow-[0_12px_32px_rgba(35,33,33,0.14)]">
            {phase === "capture" ? (
              <>
                <video ref={videoRef} className={`absolute inset-0 h-full w-full object-cover ${cameraActive ? "opacity-100" : "opacity-0"}`} autoPlay playsInline muted />
                {!cameraActive && <div className="absolute inset-0 bg-[#1b1b1b]" />}
                {cameraError && <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-[16px] leading-snug text-white/75">{cameraError}</p>}
                {!cameraError && <div className="pointer-events-none absolute inset-8 rounded-[28px] border-2 border-white/80" />}
              </>
            ) : (
              <SkeletonImage src={workingImage} alt="Captured location" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            )}
          </div>
        )}
      </div>

      {shutterFlash && <div className="pointer-events-none absolute inset-0 z-[80] bg-white/85" />}
      <div className="noma-add-space-camera-actions-layer">
        <div className="noma-add-space-camera-action-state">
        {mode === "camera" && phase === "capture" ? (
          <div className="noma-add-camera-controls is-space">
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Choose from photos"><PhotoUploadIcon /></button>
            <CaptureShutterButton onClick={captureFrame} label="Take photo" />
            <button type="button" className="noma-add-skip" onClick={onCancel}>{t("Cancel")}</button>
          </div>
        ) : (
          <div className="noma-add-round-actions is-three">
            <button type="button" className="noma-add-round-button is-restart" onClick={resetImage} aria-label="Reset image"><RestartIcon className="h-7 w-7" /></button>
            <button type="button" className="noma-add-round-button is-confirm" onClick={confirmImage} disabled={!workingImage} aria-label="Confirm image"><Check className="h-7 w-7" strokeWidth={2.5} /></button>
            <button type="button" className="noma-add-round-button" onClick={onCancel} aria-label={t("Cancel")}><CloseIcon className="h-5 w-5 text-[#232121]/50" /></button>
          </div>
        )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
    </motion.div>
  );
};

export const MemoryLocationPicker: React.FC<{
  field: MemoryLocationField;
  parentOptions: MemoryParentLocationOption[];
  subOptions: MemorySubLocationOption[];
  selectedParentKey: string;
  selectedSubKey: string;
  onChooseParent: (option: MemoryParentLocationOption) => void;
  onChooseSub: (option: MemorySubLocationOption) => void;
  onClose: () => void;
}> = ({
  field,
  parentOptions,
  subOptions,
  selectedParentKey,
  selectedSubKey,
  onChooseParent,
  onChooseSub,
  onClose,
}) => {
  const options = field === "parent" ? parentOptions : subOptions;
  const selectedKey = field === "parent" ? selectedParentKey : selectedSubKey;
  const title = field === "parent" ? "Space" : "Sub-Space";

  return (
    <AnimatePresence>
      <motion.div
        key={`memory-location-picker-${field}`}
        className="absolute inset-0 z-[240] flex items-end justify-center bg-black/20 px-[15px] pb-8 backdrop-blur-[5px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="max-h-[78%] w-full max-w-[382px] overflow-hidden rounded-[30px] bg-[#F4F1EB] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[20px] font-sans font-bold tracking-tight text-[#232121]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#232121]/55 active:scale-95"
              aria-label="Close space picker"
            >
              <CloseIcon className="h-[18px] w-[18px] text-[#232121]/55" />
            </button>
          </div>

          <div className="max-h-[calc(78vh-115px)] space-y-2 overflow-y-auto no-scrollbar">
            <div className="mb-2 px-1 text-[14px] font-sans font-normal tracking-tight text-[#232121]/50">{" "}{t("Existing Space")}{" "}</div>
            {options.length > 0 ? (
              <div className="space-y-2">
                {options.map((option) => {
                  const isSelected = selectedKey === option.key;
                  const itemCount = option.itemCount;
                  return (
                    <button
                      type="button"
                      key={option.key}
                      onClick={() => {
                        if (field === "parent") {
                          onChooseParent(option as MemoryParentLocationOption);
                        } else {
                          onChooseSub(option as MemorySubLocationOption);
                        }
                      }}
                      className={`flex w-full items-center gap-3 rounded-[18px] border border-transparent px-3 py-2 text-left active:scale-[0.99] ${
                        isSelected ? "bg-white" : "bg-white/50"
                      }`}
                    >
                      <span className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[12px] border-[3px] border-white bg-neutral-100">
                        <SkeletonImage
                          src={option.imgUrl}
                          alt={option.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-sans font-semibold text-[#232121]">
                          {option.name}
                        </span>
                        <span className="mt-1 block text-[14px] font-sans text-[#232121]/40">
                          {itemCount} {itemCount === 1 ? t("item") : t("items")}
                        </span>
                      </span>
                      <MemorySelectorIcon selected={isSelected} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[13px] font-sans text-[#232121]/45">{" "}{t("No saved spaces yet")}{" "}</div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const MemoryConfirmModal: React.FC<{
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, title, message, onCancel, onConfirm }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        key="memory-delete-confirm"
        className="absolute inset-0 z-[220] flex items-center justify-center bg-black/35 px-8 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-[320px] rounded-[28px] bg-[#F4F1EB] p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
          initial={{ scale: 0.94, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.94, y: 12 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          onClick={(event) => event.stopPropagation()}
        >
          <h3 className="text-[20px] font-sans font-bold text-[#232121] tracking-tight">{title}</h3>
          <p className="mt-3 text-[13px] font-sans leading-relaxed text-[#232121]/55">{t(message)}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 flex-1 rounded-full bg-white text-[#232121]/70 text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >{" "}{t("Cancel")}{" "}</button>
            <button
              type="button"
              onClick={onConfirm}
              className="h-12 flex-1 rounded-full bg-[#232121] text-white text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >{" "}{t("Delete")}{" "}</button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const MemoryItemsEditBubble: React.FC<{
  open: boolean;
  allSelected: boolean;
  hasSelected: boolean;
  onSelectAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
  deleteLabel?: string;
}> = ({ open, allSelected, hasSelected, onSelectAll, onDelete, onCancel, deleteLabel = "Delete selected items" }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        key="memory-items-edit-bubble"
        className="pointer-events-none absolute bottom-[18px] left-1/2 z-[140] -translate-x-1/2"
        initial={{ opacity: 0, y: 16, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        <div className="pointer-events-auto inline-flex h-[64px] items-center gap-[10px] rounded-full border border-white/35 bg-[#E9E6E1]/50 px-[18px] shadow-[0_12px_34px_rgba(0,0,0,0.16)] backdrop-blur-xl">
          <GradientPillButton
            onClick={onSelectAll}
            selected={allSelected}
          >{" "}{t("Select All")}{" "}</GradientPillButton>
          <button
            type="button"
            onClick={onDelete}
            disabled={!hasSelected}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full active:scale-[0.98] disabled:cursor-default"
            style={{ backgroundColor: hasSelected ? "#ED435F" : "#FFFFFF" }}
            aria-label={t(deleteLabel)}
            title={t(deleteLabel)}
          >
            <DeleteActionIcon color={hasSelected ? "#FFFFFF" : "#232121"} opacity={hasSelected ? 1 : 0.5} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[34px] w-[16px] shrink-0 items-center justify-center rounded-full active:scale-[0.98]"
            aria-label={t("Cancel editing")}
            title={t("Cancel editing")}
          >
            <CloseIcon className="h-4 w-4 text-[#232121]/50" />
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const SubLocationListCard: React.FC<{
  space: SubLocationSummary;
  onClick: () => void;
  onLongPress?: () => void;
  isEditing?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}> = ({ space, onClick, onLongPress, isEditing = false, isSelected = false, onToggle }) => {
  const hasOverflow = space.itemCount > 5;
  const previewItems = space.items.slice(0, hasOverflow ? 4 : 5);
  const remainingItems = Math.max(0, space.itemCount - previewItems.length);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = React.useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    pressStartRef.current = null;
  };

  React.useEffect(() => clearLongPress, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    clearLongPress();
    didLongPressRef.current = false;
    if (isEditing || !onLongPress || !event.isPrimary || event.button !== 0) return;
    pressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = setTimeout(() => {
      clearLongPress();
      didLongPressRef.current = true;
      onLongPress();
    }, 320);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pressStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
      clearLongPress();
      didLongPressRef.current = true;
    }
  };

  return (
    <div className="relative h-[160px] w-full overflow-hidden rounded-[28px] bg-white">
      <button
        type="button"
        onClick={() => {
          clearLongPress();
          if (didLongPressRef.current) {
            didLongPressRef.current = false;
            return;
          }
          if (isEditing) onToggle?.();
          else onClick();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        aria-label={`${isEditing ? "Select" : "Open"} ${space.name}`}
        aria-pressed={isEditing ? isSelected : undefined}
        className="relative z-10 h-[160px] w-full rounded-[28px] bg-white px-[14px] py-[18px] text-left select-none transition-transform duration-200"
      >
        <div className="flex items-center gap-[14px]">
          <div className={`relative h-[56px] w-[56px] rounded-[9px] overflow-hidden shrink-0 ${isEmojiImageUrl(space.imgUrl) ? "bg-[#E9E6E1]" : "bg-neutral-100"}`}>
            {space.imgUrl ? (
              <SkeletonImage
                src={space.imgUrl}
                alt={space.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-[#DDDAD5]" aria-label="Sub-location photo unavailable" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[18px] font-sans font-semibold text-[#232121] tracking-tight leading-tight truncate">
              {truncateLocationTitle(space.name)}
            </div>
            <div className="mt-[8px] text-[13px] font-sans font-normal text-[#232121]/50 leading-none">
              {space.itemCount}{" "}{t("items")}{" "}</div>
          </div>
        </div>

        {(previewItems.length > 0 || remainingItems > 0) && (
          <div className="mt-[12px] grid h-[55px] min-h-[55px] w-full grid-cols-5 items-center gap-0 overflow-visible">
            {previewItems.map((item) => (
              <div key={item.id} className="h-[55px] w-[55px] min-w-0 shrink-0 overflow-visible">
                <ItemSticker item={item} size={55} alignLeft />
              </div>
            ))}
            {remainingItems > 0 && (
              <div className="h-[55px] w-[55px] shrink-0 rounded-[16px] bg-[#F3F1EC] flex items-center justify-center text-[18px] font-sans font-bold text-[#232121]/55">
                +{remainingItems}
              </div>
            )}
          </div>
        )}
        {isEditing && (
          <div className="pointer-events-none absolute right-[14px] top-[14px] z-20">
            <MemorySelectorIcon selected={isSelected} />
          </div>
        )}
      </button>
    </div>
  );
};

const DirectLocationItemsCard: React.FC<{
  items: MemoryItem[];
  onItemClick: (item: MemoryItem) => void;
  isEditing?: boolean;
  selectedItemIds?: string[];
  onToggleItem?: (itemId: string) => void;
  onLongPressItem?: (itemId: string) => void;
}> = ({ items, onItemClick, isEditing = false, selectedItemIds = [], onToggleItem, onLongPressItem }) => {
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = React.useRef(false);
  const clearLongPress = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  React.useEffect(() => clearLongPress, []);

  return (
    <div className="relative w-full overflow-visible">
      <div className="relative z-10 grid grid-cols-4 justify-items-center gap-x-[16px] gap-y-[14px]">
        {items.map((item) => {
          const isSelected = selectedItemIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation();
                if (isEditing || !onLongPressItem) return;
                didLongPressRef.current = false;
                clearLongPress();
                longPressTimerRef.current = setTimeout(() => {
                  didLongPressRef.current = true;
                  longPressTimerRef.current = null;
                  onLongPressItem(item.id);
                }, 320);
              }}
              onPointerUp={(event) => { event.stopPropagation(); clearLongPress(); }}
              onPointerCancel={(event) => { event.stopPropagation(); clearLongPress(); }}
              onPointerLeave={clearLongPress}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                clearLongPress();
                if (didLongPressRef.current) {
                  didLongPressRef.current = false;
                  return;
                }
                if (isEditing) onToggleItem?.(item.id);
                else onItemClick(item);
              }}
              className="relative h-[74px] w-[74px] border-0 bg-transparent p-0 select-none active:scale-95 transition-transform"
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
              aria-label={isEditing ? `Select ${item.name}` : `Open ${item.name}`}
            >
              <ItemSticker item={item} size={74} alignLeft />
              {isEditing && (
                <div className="pointer-events-none absolute right-[-2px] top-[-2px] z-20 flex h-4 w-4 items-center justify-center">
                  <MemorySelectorIcon selected={isSelected} size={16} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SpaceDetailModal: React.FC<{
  space: SubLocationSummary;
  parentOptions: MemoryParentLocationOption[];
  onClose: () => void;
  onDeleteSpace: () => void;
  onDeleteItems: (itemIds: string[]) => void;
  onSaveSpace: (updates: { parentName: string; subName: string; parentImgUrl?: string; imgUrl?: string }) => void;
}> = ({ space, parentOptions, onClose, onDeleteSpace, onDeleteItems, onSaveSpace }) => {
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [isEditingItems, setIsEditingItems] = React.useState(false);
  const [editingField, setEditingField] = React.useState<"sub" | null>(null);
  const [locationPickerField, setLocationPickerField] = React.useState<MemoryLocationField | null>(null);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [deleteRequest, setDeleteRequest] = React.useState<"space" | "items" | null>(null);
  const [spaceImage, setSpaceImage] = React.useState(space.imgUrl);
  const [parentName, setParentName] = React.useState(space.parentName);
  const [parentImgUrl, setParentImgUrl] = React.useState(space.parentImgUrl);
  const [subName, setSubName] = React.useState(space.name);
  const [isRetakeCaptureOpen, setIsRetakeCaptureOpen] = React.useState(false);
  const [replacementMode, setReplacementMode] = React.useState<"emoji" | "camera">(isEmojiImageUrl(space.imgUrl) ? "emoji" : "camera");
  const modalScale = useDetailModalScale();
  const helperText = isFlipped ? "Flip card to see the location" : "Flip card to see all items";
  const locationImage = spaceImage || space.parentImgUrl;
  const selectedParentKey = parentName.trim() || space.parentName;
  const editRestoreValueRef = React.useRef("");
  const isAllSpaceItemsSelected =
    space.items.length > 0 && space.items.every((item) => selectedItemIds.includes(item.id));

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isEditingItems && selectedItemIds.length > 0) {
      setDeleteRequest("items");
      return;
    }
    setDeleteRequest("space");
  };

  const confirmDelete = () => {
    if (deleteRequest === "items") {
      onDeleteItems(selectedItemIds);
    } else if (deleteRequest === "space") {
      onDeleteSpace();
    }
    setDeleteRequest(null);
  };

  const handleEditConfirm = () => {
    if (editingField && !subName.trim()) {
      setSubName(editRestoreValueRef.current);
    }
    setEditingField(null);
  };

  const handleEditCancel = () => {
    if (editingField) {
      setSubName(editRestoreValueRef.current);
    }
    setEditingField(null);
  };

  const handleEdit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isEditingItems) {
      handleEditConfirm();
      onSaveSpace({
        parentName: parentName.trim() || space.parentName,
        subName: subName.trim() || space.name,
        parentImgUrl,
        imgUrl: spaceImage,
      });
      setLocationPickerField(null);
      setIsEditingItems(false);
      setSelectedItemIds([]);
      return;
    }
    setIsEditingItems((current) => !current);
    setSelectedItemIds([]);
  };

  const handleCancelEditing = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setParentName(space.parentName);
    setParentImgUrl(space.parentImgUrl);
    setSubName(space.name);
    setSpaceImage(space.imgUrl);
    setEditingField(null);
    setLocationPickerField(null);
    setSelectedItemIds([]);
    setIsEditingItems(false);
  };

  const handleSubNameEditStart = () => {
    if (!isEditingItems) return;
    editRestoreValueRef.current = subName;
    setEditingField("sub");
  };

  const chooseParentLocation = (option: MemoryParentLocationOption) => {
    setParentName(option.name);
    setParentImgUrl(option.imgUrl);
    setLocationPickerField(null);
  };

  const handleSelectAllSpaceItems = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSelectedItemIds((current) =>
      isAllSpaceItemsSelected ? [] : space.items.map((item) => item.id)
    );
  };

  const handleRetakeSpacePhoto = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setReplacementMode(isEmojiImageUrl(spaceImage) ? "emoji" : "camera");
    setIsRetakeCaptureOpen(true);
  };

  const handleRetakeConfirm = (nextUrl: string) => {
    setSpaceImage(nextUrl);
    setIsRetakeCaptureOpen(false);
  };

  const handleModalClickCapture = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!editingField || target?.closest("[data-detail-keyboard='true']")) return;
    setEditingField(null);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  };

  return (
    <motion.div
      className="absolute inset-0 z-[180] overflow-y-auto overscroll-contain"
      initial={false}
      exit={{ opacity: 0 }}
      onClickCapture={handleModalClickCapture}
    >
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[18px]"
        style={{
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
        aria-label="Close space detail"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: "linear" }}
      />

      <div
        className="absolute left-1/2 z-10"
        style={{
          top: "calc(50% + (env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2)",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div style={{ transform: `scale(${modalScale})`, transformOrigin: "center center" }}>
          <div
            className="relative z-10 w-[307px] h-[586px]"
            style={{ perspective: "1200px", WebkitPerspective: "1200px" }}
          >
            <DetailCardActionGroup
              isEditing={isEditingItems}
              onEditToggle={handleEdit}
              onCloseOrCancel={(event) => {
                event.stopPropagation();
                if (isEditingItems) {
                  handleCancelEditing(event);
                  return;
                }
                onClose();
              }}
            />

            <motion.div
              className="relative w-full h-[586px] cursor-pointer"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 210, damping: 26 }}
              style={{ transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d", willChange: "transform" }}
              onClick={() => {
                setIsFlipped((current) => !current);
              }}
            >
          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[14px] pt-[14px] pb-[26px]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0.1px)",
              WebkitTransform: "translateZ(0.1px)",
              visibility: isFlipped ? "hidden" : "visible",
              transition: "visibility 0s linear 180ms",
              pointerEvents: isFlipped ? "none" : "auto",
            }}
          >
            <MatrixDotBackground />
            <div className="relative z-10 w-full h-[444px] rounded-[20px] overflow-hidden bg-neutral-200">
              {locationImage ? (
                <SkeletonImage
                  src={locationImage}
                  alt={subName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="eager"
                />
              ) : (
                <div className="w-full h-full bg-[#DDDAD5]" aria-label="Sub-location photo unavailable" />
              )}
              {isEditingItems && (
                <div className="absolute right-[10px] bottom-[10px] z-20">
                  <RetakePhotoButton onClick={handleRetakeSpacePhoto} />
                </div>
              )}
            </div>

            <ModalLocationTextGroup
              parentName={parentName}
              subName={subName}
              className="absolute left-[38px] bottom-[36px] z-10"
              textMaxWidth={170}
              isEditing={isEditingItems}
              editingField={editingField}
              onSubClick={handleSubNameEditStart}
              onParentSwitch={parentOptions.length > 0 ? () => setLocationPickerField("parent") : undefined}
              showEditableUnderline
            />

            {!isEditingItems && (
              <div className="absolute right-[28px] bottom-[30px] h-[64px] w-[64px] rounded-[16px] bg-[#DDDAD5] flex flex-col items-center justify-center text-[#232121] font-sans font-semibold tracking-tight leading-none">
                <span className="text-[20px]">{space.itemCount}</span>
                <span className="mt-[6px] text-[14px]">{t("items")}</span>
              </div>
            )}
          </div>

          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[20px] pt-[30px] pb-[36px]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(0.1px)",
              WebkitTransform: "rotateY(180deg) translateZ(0.1px)",
              visibility: isFlipped ? "visible" : "hidden",
              transition: "visibility 0s linear 180ms",
              pointerEvents: isFlipped ? "auto" : "none",
            }}
          >
            <MatrixDotBackground />
            {isEditingItems && (
              <div className="absolute left-[20px] right-[20px] top-[28px] z-40 flex items-center justify-between">
                <GradientPillButton
                  onClick={handleSelectAllSpaceItems}
                  selected={isAllSpaceItemsSelected}
                  compact
                >{" "}{t("Select All")}{" "}</GradientPillButton>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectedItemIds.length > 0) setDeleteRequest("items");
                  }}
                  className="flex h-[26px] w-[34px] items-center justify-center rounded-full active:scale-95"
                  style={{
                    backgroundColor: selectedItemIds.length > 0 ? "#ED435F" : "#FFFFFF",
                  }}
                  aria-label={t("Delete selected items")}
                  title={t("Delete selected items")}
                >
                  <DeleteActionIcon
                    color={selectedItemIds.length > 0 ? "#FFFFFF" : "#232121"}
                    opacity={selectedItemIds.length > 0 ? 1 : 0.5}
                  />
                </button>
              </div>
            )}
            <motion.div
              className="relative z-10 grid grid-cols-3 justify-items-center gap-[16px]"
              animate={{ y: isEditingItems ? 52 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              {space.items.map((item) => {
                const isSelected = selectedItemIds.includes(item.id);
                return (
                <button
                  type="button"
                  key={item.id}
                  data-memory-item-id={item.id}
                  className={`relative z-20 block h-[74px] w-[74px] border-0 bg-transparent p-0 rounded-[12px] select-none ${isEditingItems ? "cursor-pointer pointer-events-auto" : "cursor-default"}`}
                  style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
                  onPointerDown={(event) => {
                    if (isEditingItems) event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isEditingItems) return;
                    toggleItemSelection(item.id);
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <ItemSticker item={item} size={74} alignLeft />
                  {isEditingItems && (
                    <div
                      className={`pointer-events-none absolute right-[-2px] top-[-2px] z-10 flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] font-bold ${isSelected ? "bg-[#FFBA7B] text-[#232121]" : "bg-white text-[#232121]"}`}
                    >
                      {isSelected ? "✓" : ""}
                    </div>
                  )}
                </button>
                );
              })}
            </motion.div>

            <ModalLocationTextGroup
              parentName={parentName}
              subName={subName}
              className="absolute left-[38px] bottom-[36px] z-10"
              textMaxWidth={190}
              isEditing={isEditingItems}
              editingField={editingField}
              onSubClick={handleSubNameEditStart}
              onParentSwitch={parentOptions.length > 0 ? () => setLocationPickerField("parent") : undefined}
              showEditableUnderline
            />
            </div>
            </motion.div>

          </div>

          <div className="absolute left-0 top-[614px] z-10 h-[56px] w-[307px] flex items-center justify-center">
            <div className="text-center text-white text-[18px] leading-[1.25] font-sans font-bold tracking-tight max-w-[250px]">
              {t(helperText)}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteRequest("space");
              }}
              aria-label={t("Delete sub-location")}
              title={t("Delete sub-location")}
              className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white active:scale-95 transition-transform"
            >
              <DeleteActionIcon color="#FFFFFF" opacity={1} size={20} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {editingField === "sub" && (
          <motion.div
            key="space-detail-keyboard"
            data-detail-keyboard="true"
            className="absolute bottom-0 inset-x-0 z-[60] h-[205px] pointer-events-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <VirtualKeyboard
              value={subName}
              onChange={setSubName}
              onKeyPress={() => {}}
              onBackspace={() => {}}
              onSpace={() => {}}
              onSend={handleEditConfirm}
              onDismiss={handleEditCancel}
              sendLabel="OK"
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {locationPickerField === "parent" && (
        <MemoryLocationPicker
          field="parent"
          parentOptions={parentOptions}
          subOptions={[]}
          selectedParentKey={selectedParentKey}
          selectedSubKey=""
          onChooseParent={chooseParentLocation}
          onChooseSub={() => undefined}
          onClose={() => setLocationPickerField(null)}
        />
      )}

      <AnimatePresence>
        {isRetakeCaptureOpen && (
          <LocationImageEditFlow
            initialImage={spaceImage}
            initialMode={replacementMode}
            emojiKind="sub-space"
            onCancel={() => { setSpaceImage(space.imgUrl); setIsRetakeCaptureOpen(false); }}
            onConfirm={handleRetakeConfirm}
          />
        )}
      </AnimatePresence>

      <MemoryConfirmModal
        open={deleteRequest !== null}
        title={deleteRequest === "items" ? t("Delete selected items?") : t("Delete {name}?", { name: space.name })}
        message={deleteRequest === "items"
          ? "This will permanently remove the selected items from this sub-location."
          : "This will delete the sub-location and all items inside it."}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />
    </motion.div>
  );
};

/** Shared location detail. Parent spaces reuse the Memory folder cards for
 *  their children, with each child's name and item count inside the folder.
 */
const LocationDetailModal: React.FC<{
  location: SpaceSummary;
  onClose: () => void;
  onOpenItem: (item: MemoryItem) => void;
  onOpenSubLocation: (space: SubLocationSummary) => void;
  onSaveLocation: (location: SpaceSummary, updates: { name: string; imgUrl?: string }) => void;
  onDeleteItems: (itemIds: string[]) => void;
  onDeleteSubLocation: (space: SubLocationSummary) => void;
  onDeleteLocation: () => void;
  canEditLocation: boolean;
  nameExists: (name: string) => boolean;
}> = ({ location, onClose, onOpenItem, onOpenSubLocation, onSaveLocation, onDeleteItems, onDeleteSubLocation, onDeleteLocation, canEditLocation, nameExists }) => {
  const isParentLocation = location.sourceField === "parent";
  const locationKind = location.sourceField === "sub" ? "sub-space" : "parent-space";
  const image = refreshEmojiAssetUrl(location.imgUrl) || emojiAsset(classifyEmojiLocally(location.name, locationKind).icon_key);
  const locationItems = location.directItems;
  const [isEditing, setIsEditing] = React.useState(false);
  const [isEditingItems, setIsEditingItems] = React.useState(false);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isLocationDeleteConfirmOpen, setIsLocationDeleteConfirmOpen] = React.useState(false);
  const [isEditingSubLocations, setIsEditingSubLocations] = React.useState(false);
  const [selectedSubLocationNames, setSelectedSubLocationNames] = React.useState<string[]>([]);
  const [isSubLocationDeleteConfirmOpen, setIsSubLocationDeleteConfirmOpen] = React.useState(false);
  const [draftImage, setDraftImage] = React.useState(image);
  const [draftName, setDraftName] = React.useState(location.name);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameError, setNameError] = React.useState("");
  const [replacementMode, setReplacementMode] = React.useState<"emoji" | "camera">(isEmojiImageUrl(image) ? "emoji" : "camera");
  const [isRetakeCaptureOpen, setIsRetakeCaptureOpen] = React.useState(false);

  const finishEditing = () => {
    if (!canEditLocation) return;
    const name = draftName.trim();
    if (!name) {
      setNameError("Please enter a location name.");
      setIsEditingName(true);
      return;
    }
    if (name !== location.name && nameExists(name)) {
      setNameError("A location with this name already exists.");
      setIsEditingName(true);
      return;
    }
    if (draftImage !== image || name !== location.name) {
      onSaveLocation(location, { name, imgUrl: draftImage });
    }
    setDraftName(name);
    setNameError("");
    setIsEditingName(false);
    setIsEditing(false);
  };

  const resetEditing = () => {
    setDraftName(location.name);
    setDraftImage(image);
    setIsEditingName(false);
    setNameError("");
    setIsRetakeCaptureOpen(false);
  };

  const cancelEditing = () => {
    resetEditing();
    setIsEditing(false);
  };

  const startEditing = () => {
    resetEditing();
    setReplacementMode(isEmojiImageUrl(image) ? "emoji" : "camera");
    setIsEditingItems(false);
    setSelectedItemIds([]);
    setIsEditingSubLocations(false);
    setSelectedSubLocationNames([]);
    setIsEditing(true);
  };

  const toggleItemsEditing = () => {
    setIsEditingItems((current) => !current);
    setSelectedItemIds([]);
  };

  const selectAllItems = () => {
    setSelectedItemIds((current) => current.length === locationItems.length ? [] : locationItems.map((item) => item.id));
  };

  const confirmDeleteItems = () => {
    if (selectedItemIds.length > 0) onDeleteItems(selectedItemIds);
    setSelectedItemIds([]);
    setIsEditingItems(false);
    setIsDeleteConfirmOpen(false);
  };

  return (
    <div
      className="absolute inset-0 z-[180] overflow-hidden bg-[#E9E6E1]"
    >
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
      <MatrixDotBackground />
      <div className={`relative z-10 min-h-full px-[15px] ${isEditingItems || isEditingSubLocations ? "pb-[112px]" : "pb-[28px]"}`}>
        <div
          className="flex items-center justify-between px-[5px]"
          style={{
            height: "calc(var(--noma-navigation-top) + 56px)",
            paddingTop: "var(--noma-navigation-top)",
          }}
        >
            <button type="button" onClick={isEditing ? cancelEditing : onClose} className="flex h-6 w-6 items-center justify-center active:scale-95" aria-label={isEditing ? "Cancel location edits" : t("Back")}>
              <MemoryBackIcon />
            </button>
          {isEditing ? (
            <div className="flex items-center gap-[20px]">
              <button type="button" onClick={resetEditing} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 active:scale-95" aria-label="Reset location edits">
                <ResetEditIcon />
              </button>
              <button type="button" onClick={finishEditing} disabled={!canEditLocation} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#232121] text-white active:scale-95 disabled:opacity-40" aria-label="Confirm location edits">
                <Check className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <MemoryActionButton
              label="Edit location"
              onClick={(event) => {
                event.stopPropagation();
                startEditing();
              }}
            >
              <EditPencilIcon />
            </MemoryActionButton>
          )}
        </div>

        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "tween", duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              layout
              initial={false}
              className={`relative flex items-center justify-center ${isEditing ? "mt-[47px]" : isParentLocation ? "-mt-[20px]" : "mt-[17px]"}`}
              animate={{ width: isEditing ? 228 : isParentLocation ? 114 : 174, height: isEditing ? 228 : isParentLocation ? 114 : 128 }}
            >
              {!isEditing && !isParentLocation && <LocationHeaderGradientCard className="absolute left-[55px] top-[22px] z-[1] h-[100px] w-[100px]" />}
              <div className={`relative z-10 overflow-hidden ${isEditing ? "h-[228px] w-[228px] rounded-[32px] border-[6px]" : isParentLocation ? "h-[114px] w-[114px] rounded-[25px] border-[3px]" : "h-[114px] w-[114px] -translate-x-[10px] rotate-[-9deg] rounded-[20px] border-[3px]"} border-white ${isEmojiImageUrl(draftImage) ? "bg-[#E9E6E1]" : "bg-neutral-100"}`}>
                <SkeletonImage src={draftImage} alt={location.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                {isEditing && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <RetakePhotoButton onClick={(event) => { event.stopPropagation(); setIsEditingName(false); setIsRetakeCaptureOpen(true); }} label="Retake location photo" icon={<RestartIcon className="h-[22px] w-[22px]" color="#FFFFFF" />} />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "tween", duration: 0.38, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            <div className={`${isEditing ? "mt-[70px]" : "mt-[12px]"} relative flex max-w-[320px] items-center justify-center ${!isEditing && isParentLocation ? "text-[20px]" : "text-[24px]"} font-sans font-extrabold leading-tight tracking-tight text-[#232121]`}>
              {location.sourceField === "parent" && <span className="absolute right-full top-1/2 mr-[4px] -translate-y-1/2 text-[21px]">📍</span>}
              {isEditing ? (
                isEditingName ? (
                  <input
                    autoFocus
                    aria-label={t("Location name")}
                    value={draftName}
                    onChange={(event) => { setDraftName(event.target.value); setNameError(""); }}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                      if (event.key === "Escape") { setDraftName(location.name); event.currentTarget.blur(); }
                    }}
                    className="min-w-0 max-w-[270px] border-0 border-b border-[#CCC4BE] bg-transparent p-0 pb-[3px] text-center text-inherit font-inherit outline-none"
                    style={{ width: `${Math.max(4, Array.from(draftName).length + 1)}ch` }}
                  />
                ) : (
                  <button type="button" onClick={() => setIsEditingName(true)} aria-label="Edit location name" className="max-w-[270px] truncate border-b border-[#CCC4BE] pb-[3px] text-inherit">
                    {draftName || t("Location name")}
                  </button>
                )
              ) : <span className="max-w-[270px] truncate">{truncateLocationTitle(location.name)}</span>}
            </div>
            {isEditing && nameError && <p role="alert" className="mt-2 max-w-[280px] text-[13px] text-red-700">{nameError}</p>}
            {location.parentName && location.sourceField === "sub" && (
              <div className="mt-[6px] text-[14px] font-sans text-[#232121]/50">{t("in")}{" "}{location.parentName}</div>
            )}
          </motion.div>
          {isEditing && (
            <>
              <button
                type="button"
                onClick={() => { setIsEditingName(false); setIsLocationDeleteConfirmOpen(true); }}
                disabled={!canEditLocation}
                aria-label="Delete location"
                className="mt-[108px] flex h-[34px] items-center justify-center gap-[8px] rounded-full bg-white px-[12px] text-[14px] font-sans leading-none text-[#232121]/50 active:scale-95 disabled:opacity-40"
              >
                <span>{t("Delete")}</span>
                <DeleteActionIcon color="#232121" opacity={0.5} size={16} />
              </button>
              {!canEditLocation && <p role="status" className="mt-3 max-w-[270px] text-[13px] text-[#232121]/50">{t("Finish syncing Memory before saving or deleting this location.")}</p>}
            </>
          )}
        </div>

        {!isEditing && (
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "tween", duration: 0.38, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={`${isParentLocation ? "mt-[37px]" : "mt-[26px]"} flex flex-col gap-[32px]`}
        >
          {locationItems.length > 0 && (
            <section inert={isEditingSubLocations}>
              <DirectLocationItemsCard
                items={locationItems}
                onItemClick={onOpenItem}
                isEditing={isEditingItems}
                selectedItemIds={selectedItemIds}
                onToggleItem={(itemId) => setSelectedItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId])}
                onLongPressItem={(itemId) => { setIsEditingItems(true); setSelectedItemIds([itemId]); }}
              />
            </section>
          )}

          {location.subLocations.length > 0 && !isEditingItems && (
            <section>
              <div className="memory-space-waterfall">
                {location.subLocations.map((sub, index) => (
                  <MemorySpaceFolderCard
                    key={`${location.key}-${sub.name}`}
                    space={{ key: `${sub.parentName}::${sub.name}`, name: sub.name, imgUrl: sub.imgUrl, itemCount: sub.itemCount, items: sub.items, directItems: sub.items, subLocations: [], sourceField: "sub", parentName: sub.parentName }}
                    footerMode="sub-summary"
                    accentColor={SPACE_LIST_ACCENT_COLORS[index % SPACE_LIST_ACCENT_COLORS.length]}
                    onClick={() => onOpenSubLocation(sub)}
                    onLongPress={() => { setIsEditingSubLocations(true); setSelectedSubLocationNames([sub.name]); }}
                    isEditing={isEditingSubLocations}
                    isSelected={selectedSubLocationNames.includes(sub.name)}
                    onToggle={() => setSelectedSubLocationNames((current) => current.includes(sub.name) ? current.filter((name) => name !== sub.name) : [...current, sub.name])}
                  />
                ))}
              </div>
            </section>
          )}
        </motion.div>
        )}
      </div>
      </div>

      <MemoryItemsEditBubble
        open={isEditingItems}
        allSelected={selectedItemIds.length === locationItems.length && locationItems.length > 0}
        hasSelected={selectedItemIds.length > 0}
        onSelectAll={selectAllItems}
        onDelete={() => selectedItemIds.length > 0 && setIsDeleteConfirmOpen(true)}
        onCancel={toggleItemsEditing}
      />

      <MemoryItemsEditBubble
        open={isEditingSubLocations}
        allSelected={location.subLocations.length > 0 && selectedSubLocationNames.length === location.subLocations.length}
        hasSelected={selectedSubLocationNames.length > 0}
        onSelectAll={() => setSelectedSubLocationNames((current) => current.length === location.subLocations.length ? [] : location.subLocations.map((sub) => sub.name))}
        onDelete={() => selectedSubLocationNames.length > 0 && setIsSubLocationDeleteConfirmOpen(true)}
        onCancel={() => { setIsEditingSubLocations(false); setSelectedSubLocationNames([]); }}
        deleteLabel="Delete selected sub-locations"
      />

      <AnimatePresence>
        {isRetakeCaptureOpen && (
          <LocationImageEditFlow
            initialImage={draftImage}
            initialMode={replacementMode}
            emojiKind={location.sourceField === "parent" ? "parent-space" : "sub-space"}
            onCancel={() => setIsRetakeCaptureOpen(false)}
            onConfirm={(imgUrl) => {
              setDraftImage(imgUrl);
              setIsRetakeCaptureOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      <MemoryConfirmModal
        open={isLocationDeleteConfirmOpen}
        title={t("Delete {name}?", { name: location.name })}
        message={location.sourceField === "parent"
          ? "This will delete this location, all sub-locations, and every item inside it."
          : "This will delete this location and all items inside it."}
        onCancel={() => setIsLocationDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (!canEditLocation) return;
          setIsLocationDeleteConfirmOpen(false);
          onDeleteLocation();
        }}
      />

      <MemoryConfirmModal
        open={isDeleteConfirmOpen}
        title={t("Delete selected items?")}
        message="This will permanently remove the selected items from this location."
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteItems}
      />

      <MemoryConfirmModal
        open={isSubLocationDeleteConfirmOpen}
        title={selectedSubLocationNames.length === 1
          ? t("Delete {name}?", { name: selectedSubLocationNames[0] })
          : t("Delete selected sub-locations?")}
        message="This will delete the selected sub-locations and all items inside them."
        onCancel={() => setIsSubLocationDeleteConfirmOpen(false)}
        onConfirm={() => {
          location.subLocations.filter((sub) => selectedSubLocationNames.includes(sub.name)).forEach(onDeleteSubLocation);
          setIsSubLocationDeleteConfirmOpen(false);
          setIsEditingSubLocations(false);
          setSelectedSubLocationNames([]);
        }}
      />
    </div>
  );
};

type MemoryDetailModalProps = {
  item: MemoryItem;
  parentOptions: MemoryParentLocationOption[];
  subOptions: MemorySubLocationOption[];
  siblingItems?: MemoryItem[];
  onNavigateItem?: (item: MemoryItem) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: (updates: Partial<MemoryItem>) => void;
};

// Reuse the detail card over its caller without opening the Memory page.
export const MemoryItemDetailOverlay: React.FC<Omit<MemoryDetailModalProps, "parentOptions" | "subOptions"> & {
  memories: MemoryItem[];
}> = ({ memories, ...props }) => {
  const reduceMotion = useReducedMotion();
  const { parentOptions, subOptions } = React.useMemo(() => {
    const parents = new Map<string, MemoryParentLocationOption>();
    const children = new Map<string, MemorySubLocationOption>();
    for (const item of memories) {
      const parentName = item.parentLocationName?.trim() || "";
      const subName = item.subLocationName?.trim() || "";
      const name = parentName || subName;
      if (!name) continue;
      const parentKey = parentName ? `parent:${parentName}` : `sub:${subName}`;
      const parent = parents.get(parentKey) || { key: name, name, imgUrl: "", itemCount: 0 };
      parent.itemCount += 1;
      parent.imgUrl ||= (parentName ? item.parentLocationImg : refreshEmojiAssetUrl(item.subLocationImg)) || "";
      parents.set(parentKey, parent);
      if (!subName) continue;
      const key = `${parentName}::${subName}`;
      const child: MemorySubLocationOption = children.get(key) || { key, name: subName, parentName, imgUrl: "", parentImgUrl: "", itemCount: 0 };
      child.itemCount += 1;
      child.imgUrl ||= refreshEmojiAssetUrl(item.subLocationImg) || "";
      child.parentImgUrl ||= item.parentLocationImg || "";
      child.subLocationHighlight ||= item.subLocationHighlight;
      children.set(key, child);
    }
    return {
      parentOptions: [...parents.values()].map((option) => ({ ...option, imgUrl: option.imgUrl || emojiAsset(classifyEmojiLocally(option.name, "parent-space").icon_key) })),
      subOptions: [...children.values()].map((option) => ({ ...option, imgUrl: option.imgUrl || emojiAsset(classifyEmojiLocally(option.name, "sub-space").icon_key) })),
    };
  }, [memories]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${props.item.name} details`}
      className="fixed inset-0 z-[30000] overflow-hidden md:inset-auto md:left-1/2 md:top-1/2 md:h-[852px] md:w-[393px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[36px]"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[36px] bg-black/20"
        style={{ backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
      />
      <MemoryDetailModal {...props} parentOptions={parentOptions} subOptions={subOptions} />
    </div>,
    document.body,
  );
};

const MemoryDetailModal: React.FC<MemoryDetailModalProps> = ({
  item,
  parentOptions,
  subOptions,
  siblingItems = [],
  onNavigateItem,
  onClose,
  onDelete,
  onSave,
}) => {
  const reduceMotion = useReducedMotion();
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [locationView, setLocationView] = React.useState<"sub" | "parent">("sub");
  const [selectedCategory, setSelectedCategory] = React.useState(item.category || "Others");
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = React.useState(false);
  const [itemTitle, setItemTitle] = React.useState(item.name || "Item");
  const [parentLocationName, setParentLocationName] = React.useState(item.parentLocationName || "Main Bedroom");
  const [subLocationName, setSubLocationName] = React.useState(item.subLocationName || "Nightstand");
  const [editingField, setEditingField] = React.useState<"title" | "parent" | "sub" | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isCardEditing, setIsCardEditing] = React.useState(false);
  const [isItemRetakeOpen, setIsItemRetakeOpen] = React.useState(false);
  const [itemTransitionDirection, setItemTransitionDirection] = React.useState<-1 | 0 | 1>(0);
  const [itemImageDraft, setItemImageDraft] = React.useState(item.stickerUrl || (item.emoji ? emojiAsset(item.emoji) : ""));
  const [itemAliases, setItemAliases] = React.useState(item.aliases);
  const [itemAttributes, setItemAttributes] = React.useState(item.attributes);
  const [parentLocationImg, setParentLocationImg] = React.useState(refreshEmojiAssetUrl(item.parentLocationImg) || "");
  const [subLocationImg, setSubLocationImg] = React.useState(refreshEmojiAssetUrl(item.subLocationImg) || "");
  const [subLocationHighlight, setSubLocationHighlight] = React.useState(item.subLocationHighlight || { x: 70, y: 62 });
  const [locationPickerField, setLocationPickerField] = React.useState<MemoryLocationField | null>(null);
  const modalScale = useDetailModalScale();
  const editRestoreValueRef = React.useRef("");
  const locationPhotoRef = React.useRef<HTMLDivElement>(null);
  const isDraggingHighlightRef = React.useRef(false);
  const didDragHighlightRef = React.useRef(false);
  const didSwipeItemRef = React.useRef(false);
  const previousItemIdRef = React.useRef(item.id);
  const isSwitchingItem = previousItemIdRef.current !== item.id;
  const siblingIndex = siblingItems.findIndex((candidate) => candidate.id === item.id);
  const canSwipeItems = siblingItems.length > 1
    && siblingIndex >= 0
    && Boolean(onNavigateItem)
    && !isCardEditing
    && !editingField
    && !isCategorySelectorOpen
    && !locationPickerField
    && !isItemRetakeOpen
    && !isDeleteConfirmOpen;

  React.useLayoutEffect(() => {
    if (previousItemIdRef.current === item.id) return;
    previousItemIdRef.current = item.id;
    setIsFlipped(false);
    setLocationView("sub");
    setSelectedCategory(item.category || "Others");
    setIsCategorySelectorOpen(false);
    setItemTitle(item.name || "Item");
    setParentLocationName(item.parentLocationName || "Main Bedroom");
    setSubLocationName(item.subLocationName || "Nightstand");
    setEditingField(null);
    setIsDeleteConfirmOpen(false);
    setIsCardEditing(false);
    setIsItemRetakeOpen(false);
    setItemImageDraft(item.stickerUrl || (item.emoji ? emojiAsset(item.emoji) : ""));
    setItemAliases(item.aliases);
    setItemAttributes(item.attributes);
    setParentLocationImg(refreshEmojiAssetUrl(item.parentLocationImg) || "");
    setSubLocationImg(refreshEmojiAssetUrl(item.subLocationImg) || "");
    setSubLocationHighlight(item.subLocationHighlight || { x: 70, y: 62 });
    setLocationPickerField(null);
    editRestoreValueRef.current = "";
    isDraggingHighlightRef.current = false;
    didDragHighlightRef.current = false;
  }, [item]);
  const fallbackLocationImage =
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=700&auto=format&fit=crop&q=80";
  const parentDisplayImage = parentLocationImg || subLocationImg || fallbackLocationImage;
  const subDisplayImage = subLocationImg || parentLocationImg || fallbackLocationImage;
  const parentIsEmoji = isEmojiImageUrl(parentDisplayImage);
  const subIsEmoji = isEmojiImageUrl(subDisplayImage);
  const activeLocationImage = locationView === "sub" ? subDisplayImage : parentDisplayImage;
  const activeLocationIsEmoji = locationView === "sub" ? subIsEmoji : parentIsEmoji;
  const activeLocationName = locationView === "sub" ? subLocationName : parentLocationName;
  const hasParentLocation = Boolean(item.parentLocationName?.trim() || parentLocationName.trim() !== "Main Bedroom");
  const hasSubLocation = Boolean(item.subLocationName?.trim() || subLocationName.trim() !== "Nightstand");
  const canToggleLocationView = hasParentLocation && hasSubLocation;
  const helperText = isFlipped
    ? "Tap to flip card for item"
    : "Tap to flip card for space";
  const categoryOptions = DETAIL_CATEGORIES.includes(selectedCategory)
    ? DETAIL_CATEGORIES.filter((category) => category !== selectedCategory)
    : DETAIL_CATEGORIES.slice(0, 4);
  const activeEditValue =
    editingField === "title"
      ? itemTitle
      : editingField === "parent"
        ? parentLocationName
        : subLocationName;
  const categoryFanPositions = [
    { x: -96, y: -88, r: -10 },
    { x: -98, y: -184, r: -4 },
    { x: 92, y: -148, r: 5 },
    { x: 138, y: -68, r: 10 },
  ];
  const selectedParentKey = parentLocationName.trim() || item.parentLocationName || "";
  const selectedSubKey = `${parentLocationName.trim() || item.parentLocationName || ""}::${subLocationName.trim() || item.subLocationName || ""}`;
  const displayItem = itemImageDraft === (item.stickerUrl || (item.emoji ? emojiAsset(item.emoji) : ""))
    ? item
    : { ...item, stickerUrl: itemImageDraft || undefined, emoji: emojiKeyFromImageUrl(itemImageDraft) || item.emoji };
  const resetItemImageDraft = () => setItemImageDraft(item.stickerUrl || (item.emoji ? emojiAsset(item.emoji) : ""));
  const openItemImageEditor = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!isCardEditing) return;
    setIsCategorySelectorOpen(false);
    setEditingField(null);
    setIsItemRetakeOpen(true);
  };

  const setEditingValue = (field: "title" | "parent" | "sub", value: string) => {
    if (field === "title") {
      setItemTitle(value);
      return;
    }
    if (field === "parent") {
      setParentLocationName(value);
      return;
    }
    setSubLocationName(value);
  };

  const handleEditStart = (field: "title" | "parent" | "sub") => (event?: React.MouseEvent) => {
    if (!isCardEditing) return;
    event?.stopPropagation();
    const currentValue =
      field === "title"
        ? itemTitle
        : field === "parent"
          ? parentLocationName
          : subLocationName;
    editRestoreValueRef.current = currentValue;
    setEditingField(field);
    setEditingValue(field, "");
    setIsCategorySelectorOpen(false);
  };

  const handleEditKeyboardChange = (nextValue: string) => {
    if (!editingField) return;
    setEditingValue(editingField, nextValue);
  };

  const handleEditConfirm = () => {
    if (editingField && !activeEditValue.trim()) {
      setEditingValue(editingField, editRestoreValueRef.current);
    }
    setEditingField(null);
  };

  const handleEditCancel = () => {
    if (editingField) {
      setEditingValue(editingField, editRestoreValueRef.current);
    }
    setEditingField(null);
  };

  const openLocationPicker = (field: MemoryLocationField) => {
    if (editingField) handleEditCancel();
    setIsCategorySelectorOpen(false);
    setLocationPickerField(field);
  };

  const handleCardEditToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCardEditing) {
      handleEditConfirm();
      onSave({
        name: itemTitle.trim() || item.name,
        category: selectedCategory,
        parentLocationName: parentLocationName.trim() || item.parentLocationName,
        subLocationName: subLocationName.trim() || item.subLocationName,
        parentLocationImg: parentLocationImg || undefined,
        subLocationImg: subLocationImg || undefined,
        subLocationHighlight,
        stickerUrl: itemImageDraft || undefined,
        emoji: emojiKeyFromImageUrl(itemImageDraft) || item.emoji,
        aliases: itemAliases,
        attributes: itemAttributes,
      });
      setIsCategorySelectorOpen(false);
      setLocationPickerField(null);
      setIsCardEditing(false);
      return;
    }
    setIsCardEditing(true);
    resetItemImageDraft();
  };

  const handleCardDeleteOrCancel = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCardEditing) {
      setItemTitle(item.name || "Item");
      setSelectedCategory(item.category || "Others");
      setParentLocationName(item.parentLocationName || "Main Bedroom");
      setSubLocationName(item.subLocationName || "Nightstand");
      setParentLocationImg(refreshEmojiAssetUrl(item.parentLocationImg) || "");
      setSubLocationImg(refreshEmojiAssetUrl(item.subLocationImg) || "");
      setSubLocationHighlight(item.subLocationHighlight || { x: 70, y: 62 });
      resetItemImageDraft();
      setItemAliases(item.aliases);
      setItemAttributes(item.attributes);
      setIsItemRetakeOpen(false);
      setEditingField(null);
      setIsCategorySelectorOpen(false);
      setLocationPickerField(null);
      setIsCardEditing(false);
      return;
    }
    setIsDeleteConfirmOpen(true);
  };

  const updateHighlightFromPointer = (clientX: number, clientY: number) => {
    const rect = locationPhotoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setSubLocationHighlight({ x, y });
  };

  const handleHighlightPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCardEditing || locationView !== "sub") return;
    event.preventDefault();
    event.stopPropagation();
    isDraggingHighlightRef.current = true;
    didDragHighlightRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHighlightPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCardEditing || locationView !== "sub" || !isDraggingHighlightRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    didDragHighlightRef.current = true;
    updateHighlightFromPointer(event.clientX, event.clientY);
  };

  const handleHighlightPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingHighlightRef.current) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
    updateHighlightFromPointer(event.clientX, event.clientY);
    isDraggingHighlightRef.current = false;
  };

  const chooseParentLocation = (option: MemoryParentLocationOption) => {
    setParentLocationName(option.name);
    setParentLocationImg(option.imgUrl);
    setLocationView("parent");
    setLocationPickerField(null);
  };

  const chooseSubLocation = (option: MemorySubLocationOption) => {
    setSubLocationName(option.name);
    setSubLocationImg(option.imgUrl);
    setParentLocationName(option.parentName);
    setParentLocationImg(option.parentImgUrl || option.imgUrl);
    setSubLocationHighlight(option.subLocationHighlight || { x: 70, y: 62 });
    setLocationView("sub");
    setLocationPickerField(null);
  };

  const handleModalClickCapture = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!editingField || activeEditValue.trim() || target?.closest("[data-detail-keyboard='true']")) return;
    handleEditCancel();
  };

  const navigateSiblingItem = (direction: -1 | 1) => {
    if (!canSwipeItems) return;
    const nextItem = siblingItems[siblingIndex + direction];
    if (!nextItem) return;
    setItemTransitionDirection(direction);
    onNavigateItem?.(nextItem);
  };

  return (
    <motion.div
      className="absolute inset-0 z-[200] overflow-y-auto overscroll-contain"
      initial={false}
      exit={{ opacity: 0 }}
      onClickCapture={handleModalClickCapture}
    >
      <motion.button
        type="button"
        className="absolute inset-0"
        aria-label="Close memory detail"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: "linear" }}
      />

      <div
        className="absolute left-1/2 z-10"
        style={{
          top: "calc(50% - 10px + (env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2)",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div>
        <div style={{ transform: `scale(${modalScale})`, transformOrigin: "center center" }}>
          <div className="relative h-[534px] w-[350px]">
            <div
            className="relative z-10 w-[350px] h-[534px]"
            style={{ perspective: "1200px", WebkitPerspective: "1200px" }}
          >
            <motion.div
              className="relative z-30"
              initial={{ opacity: reduceMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
            >
            <DetailCardActionGroup
              isEditing={isCardEditing}
              className="-translate-y-[20px]"
              onEditToggle={handleCardEditToggle}
              onCloseOrCancel={(event) => {
                event.stopPropagation();
                if (isCardEditing) {
                  handleCardDeleteOrCancel(event);
                  return;
                }
                onClose();
              }}
            />
            </motion.div>

        <AnimatePresence initial custom={itemTransitionDirection}>
        <motion.div
          key={item.id}
          custom={itemTransitionDirection}
          className="absolute inset-0 h-[534px] w-[350px]"
          variants={{
            enter: (direction: number) => ({ x: direction * 390, opacity: 1, scale: 1, rotateY: 0 }),
            center: (direction: number) => ({
              x: 0,
              opacity: 1,
              scale: 1,
              rotateY: 0,
              transition: {
                type: "tween",
                duration: reduceMotion ? 0 : direction === 0 ? 0.5 : 0.28,
                ease: [0.22, 0.61, 0.36, 1],
              },
            }),
            exit: (direction: number) => ({
              x: direction * -390,
              opacity: 1,
              scale: 1,
              rotateY: 0,
              transition: { type: "tween", duration: reduceMotion ? 0 : 0.28, ease: [0.22, 0.61, 0.36, 1] },
            }),
          }}
          initial={isSwitchingItem ? "enter" : reduceMotion ? false : { opacity: 0, scale: 0.5, rotateY: -180, x: 0 }}
          animate="center"
          exit="exit"
          drag={canSwipeItems ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          dragMomentum={false}
          onDragStart={() => {
            didSwipeItemRef.current = false;
          }}
          onDragEnd={(_, info) => {
            const isHorizontalSwipe = Math.abs(info.offset.x) >= 56
              && Math.abs(info.offset.x) > Math.abs(info.offset.y);
            if (!isHorizontalSwipe) return;
            didSwipeItemRef.current = true;
            navigateSiblingItem(info.offset.x < 0 ? 1 : -1);
            window.setTimeout(() => {
              didSwipeItemRef.current = false;
            }, 0);
          }}
          style={{
            transformPerspective: 1200,
            transformOrigin: "center center",
            touchAction: canSwipeItems ? "pan-y" : "auto",
          }}
        >

        <motion.div
          className="relative w-full h-[534px] cursor-pointer"
          animate={{ rotateY: isSwitchingItem ? 0 : isFlipped ? 180 : 0 }}
          transition={isSwitchingItem ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 26 }}
          style={{ transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d", willChange: "transform" }}
          onClick={(event) => {
            if (didDragHighlightRef.current || didSwipeItemRef.current) {
              event.preventDefault();
              event.stopPropagation();
              didDragHighlightRef.current = false;
              didSwipeItemRef.current = false;
              return;
            }
            if (isFlipped) setLocationView("sub");
            setIsFlipped((current) => !current);
          }}
        >
          <div
            className="absolute inset-0 rounded-[36px] bg-[#E9E6E1] overflow-visible px-[22px] pt-[82px] pb-[34px] flex flex-col items-center"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0.1px)",
              WebkitTransform: "translateZ(0.1px)",
              visibility: isFlipped ? "hidden" : "visible",
              transition: "visibility 0s linear 180ms",
              pointerEvents: isFlipped ? "none" : "auto",
            }}
          >
            <MatrixDotBackground rounded />
            <div className="absolute inset-0 z-[1] overflow-hidden rounded-[36px] pointer-events-none">
              <div className="absolute left-1/2 top-[220px] aspect-square w-full max-w-none -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
                <img
                  src={COLOR_BLUR_IMAGE_URL}
                  alt=""
                  aria-hidden="true"
                  className="block h-full w-full object-contain"
                  loading="eager"
                  decoding="sync"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <PriceTag price={item.price} className="absolute left-[44px] top-[124px] z-20 rotate-[-14deg]" />

            <div className="relative z-10 flex h-[270px] w-full items-center justify-center">
              <div className="relative z-10 flex w-full translate-x-[25px] translate-y-[26px] justify-center">
                <ItemSticker
                  item={displayItem}
                  size={196}
                  title={itemTitle}
                  onTitleClick={isCardEditing && !isFlipped ? handleEditStart("title") : undefined}
                  isTitleEditing={isCardEditing && !isFlipped && editingField === "title"}
                  titleTrailingAction={isCardEditing && !isFlipped ? (
                    <button
                      type="button"
                      onClick={handleEditStart("title")}
                      className="flex h-full w-full items-center justify-center active:scale-95"
                      aria-label={t("Edit item title")}
                      title={t("Edit item title")}
                    >
                      <EditPencilIcon />
                    </button>
                  ) : undefined}
                />
                {isCardEditing && !isFlipped && (
                  <button
                    type="button"
                    onClick={openItemImageEditor}
                    className="absolute left-1/2 top-[36px] z-30 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/60 text-white active:scale-95"
                    style={{ transform: "translateX(calc(-50% - 25px))" }}
                    aria-label={t("Reset item image")}
                    title={t("Reset item image")}
                  >
                    <RestartIcon className="h-[22px] w-[22px]" color="#FFFFFF" />
                  </button>
                )}
              </div>
            </div>

            <div className="relative z-10 mt-[6px] h-[70px] flex flex-col items-center gap-[10px]">
              <AnimatePresence>
                {isCardEditing && isCategorySelectorOpen &&
                  categoryOptions.slice(0, 4).map((category, index) => {
                    const pos = categoryFanPositions[index] || { x: 0, y: 0, r: 0 };
                    return (
                      <motion.div
                        key={category}
                        className="absolute left-1/2 top-[15px] z-30 cursor-pointer pointer-events-auto"
                        initial={{ x: 0, y: 0, scale: 0.35, opacity: 0, rotate: 0 }}
                        animate={{ x: pos.x, y: pos.y, scale: 1, opacity: 1, rotate: pos.r }}
                        exit={{ x: 0, y: 0, scale: 0.35, opacity: 0, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 280, damping: 22, delay: index * 0.025 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCategory(category);
                          setIsCategorySelectorOpen(false);
                        }}
                      >
                        <div className="-translate-x-1/2 -translate-y-1/2 h-[30px] px-4 rounded-full bg-white flex items-center justify-center text-[14px] font-sans font-normal text-black/60 whitespace-nowrap">
                          {t(category)}
                        </div>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
              <button
                type="button"
                disabled={!isCardEditing}
                className={`h-[30px] rounded-full bg-white flex items-center justify-center ${
                  isCardEditing ? "gap-1.5 pl-5 pr-2 active:scale-95 transition-transform" : "px-5 cursor-default"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isCardEditing) return;
                  setIsCategorySelectorOpen((current) => !current);
                }}
              >
                <span className="text-[14px] font-sans font-normal text-black/45 tracking-tight leading-none">
                  {selectedCategory || t("Other")}
                </span>
                {isCardEditing && <TagSwitchIcon />}
              </button>
              <div className="text-[14px] font-sans font-normal text-[#8B8780] tracking-tight">{" "}{t("Built")}{" "}{item.date || t("Today")}
              </div>
            </div>

            <ModalLocationTextGroup
              parentName={parentLocationName}
              subName={subLocationName}
              className="absolute left-[38px] bottom-[36px] z-10"
              isEditing={isCardEditing}
              editingField={null}
              onParentSwitch={parentOptions.length > 0 ? () => openLocationPicker("parent") : undefined}
              onSubSwitch={subOptions.length > 0 ? () => openLocationPicker("sub") : undefined}
            />
          </div>

          <div
            className="absolute inset-0 rounded-[36px] bg-[#E9E6E1] overflow-hidden px-[15px] pt-[18px] pb-[26px] flex flex-col items-center"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(0.1px)",
              WebkitTransform: "rotateY(180deg) translateZ(0.1px)",
              visibility: isFlipped ? "visible" : "hidden",
              transition: "visibility 0s linear 180ms",
              pointerEvents: isFlipped ? "auto" : "none",
            }}
          >
            <MatrixDotBackground rounded />
            <div
              ref={locationPhotoRef}
              className="relative z-10 h-[390px] w-[320px] shrink-0 rounded-[28px] bg-[rgba(204,196,190,0.5)]"
            >
              <div
                className={`absolute inset-0 z-10 overflow-hidden rounded-[28px] ${activeLocationIsEmoji ? "bg-[#E9E6E1]" : "bg-neutral-200"}`}
              >
                <SkeletonImage
                  src={activeLocationImage}
                  alt={activeLocationName || (locationView === "sub" ? "Sub-location" : "Parent location")}
                  className={activeLocationIsEmoji
                    ? "absolute left-1/2 top-1/2 block h-[186px] w-[186px] -translate-x-1/2 -translate-y-1/2 object-contain"
                    : "block h-full w-full object-cover"}
                  referrerPolicy="no-referrer"
                  loading="eager"
                />
                {locationView === "sub" && !subIsEmoji && (
                  <div
                    className={`absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center ${isCardEditing ? "pointer-events-auto cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"}`}
                    style={{ left: `${subLocationHighlight.x}%`, top: `${subLocationHighlight.y}%` }}
                    onPointerDown={handleHighlightPointerDown}
                    onPointerMove={handleHighlightPointerMove}
                    onPointerUp={handleHighlightPointerEnd}
                    onPointerCancel={handleHighlightPointerEnd}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); didDragHighlightRef.current = false; }}
                  >
                    <img src={LIGHTSPOT_IMAGE_URL} alt="" aria-hidden="true" className="block h-[70px] w-[70px] object-contain animate-pulse" />
                  </div>
                )}
              </div>

              {canToggleLocationView && (
                <button
                  type="button"
                  className="absolute bottom-[16px] right-[16px] z-40 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/55 text-white transition-transform active:scale-95"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLocationView((current) => current === "sub" ? "parent" : "sub");
                  }}
                  aria-label={locationView === "sub" ? "Show parent location" : "Show sub-location"}
                  title={locationView === "sub" ? "Show parent location" : "Show sub-location"}
                >
                  {locationView === "sub" ? (
                    <ExpandLocationIcon className="h-6 w-6" />
                  ) : (
                    <CollapseLocationIcon className="h-6 w-6" />
                  )}
                </button>
              )}
            </div>

            <ModalLocationTextGroup
              parentName={parentLocationName}
              subName={subLocationName}
              className="absolute left-[38px] bottom-[36px] z-10"
              textMaxWidth={146}
              isEditing={isCardEditing}
              editingField={null}
              onParentSwitch={parentOptions.length > 0 ? () => openLocationPicker("parent") : undefined}
              onSubSwitch={subOptions.length > 0 ? () => openLocationPicker("sub") : undefined}
            />
          </div>
          </motion.div>
          </motion.div>
          </AnimatePresence>
          </div>

          <motion.div
            className="absolute left-0 top-[562px] z-10 flex w-[350px] flex-col items-center"
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
          >
            <div className="flex h-[56px] w-full items-center justify-center text-center text-white text-[18px] leading-[1.25] font-sans font-bold tracking-tight max-w-[250px]">
              {t(helperText)}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              aria-label={t("Delete item")}
              title={t("Delete item")}
              className="mt-[20px] flex h-8 w-8 shrink-0 items-center justify-center text-white active:scale-95 transition-transform"
            >
              <DeleteActionIcon color="#FFFFFF" opacity={1} size={20} />
            </button>
          </motion.div>
          </div>
        </div>
        </div>
      </div>

      <AnimatePresence>
        {editingField && (
          <motion.div
            key="detail-edit-keyboard"
            data-detail-keyboard="true"
            className="absolute bottom-0 inset-x-0 z-[60] h-[205px] pointer-events-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <VirtualKeyboard
              value={activeEditValue}
              onChange={handleEditKeyboardChange}
              onKeyPress={() => {}}
              onBackspace={() => {}}
              onSpace={() => {}}
              onSend={handleEditConfirm}
              onDismiss={handleEditCancel}
              sendLabel="OK"
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {locationPickerField && (
        <MemoryLocationPicker
          field={locationPickerField}
          parentOptions={parentOptions}
          subOptions={subOptions}
          selectedParentKey={selectedParentKey}
          selectedSubKey={selectedSubKey}
          onChooseParent={chooseParentLocation}
          onChooseSub={chooseSubLocation}
          onClose={() => setLocationPickerField(null)}
        />
      )}

      {isItemRetakeOpen && (
        <CaptureScanner
          isOpen
          layer={30020}
          onClose={() => setIsItemRetakeOpen(false)}
          onCutoutComplete={({ name, category, stickerUrl, labels, attributes }) => {
            if (stickerUrl) setItemImageDraft(stickerUrl);
            setItemTitle(name);
            setSelectedCategory(category);
            setItemAliases(labels);
            setItemAttributes(attributes);
            setIsItemRetakeOpen(false);
          }}
        />
      )}

      <MemoryConfirmModal
        open={isDeleteConfirmOpen}
        title={t("Delete {name}?", { name: itemTitle || item.name })}
        message="This will permanently remove this item from memory."
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          setIsDeleteConfirmOpen(false);
          onDelete();
        }}
      />
    </motion.div>
  );
};

export const MemoryList: React.FC<MemoryListProps> = ({
  isOpen,
  onClose,
  memories,
  onMemoriesChange,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isAuthenticated = false,
  onRequireAuth,
  onLogin,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  openTarget = null,
  onOpenTargetHandled,
}) => {
  const [activeTab, setActiveTab] = useState<"spaces" | "items">("spaces");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isMemoryKeyboardOpen, setIsMemoryKeyboardOpen] = useState<boolean>(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<MemoryItem | null>(null);
  const [selectedDetailSource, setSelectedDetailSource] = useState<"items" | "other">("other");
  const [selectedParentSpace, setSelectedParentSpace] = useState<SpaceSummary | null>(null);
  const [selectedSpaceDetail, setSelectedSpaceDetail] = useState<SubLocationSummary | null>(null);
  const [selectedLocationDetail, setSelectedLocationDetail] = useState<SpaceSummary | null>(null);
  const [parentLocationDetail, setParentLocationDetail] = useState<SpaceSummary | null>(null);
  const [isEditingParentName, setIsEditingParentName] = useState(false);
  const [parentNameDraft, setParentNameDraft] = useState("");
  const [parentImageDraft, setParentImageDraft] = useState("");
  const [isParentRetakeCaptureOpen, setIsParentRetakeCaptureOpen] = useState(false);
  const [pendingDeleteParentName, setPendingDeleteParentName] = useState<string | null>(null);
  const [isEditingItemsList, setIsEditingItemsList] = useState(false);
  const [selectedItemsListIds, setSelectedItemsListIds] = useState<string[]>([]);
  const [pendingDeleteItemIds, setPendingDeleteItemIds] = useState<string[] | null>(null);
  const itemsLongPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didItemsLongPressRef = React.useRef(false);
  const didCompleteInitialOpenRef = React.useRef(false);
  const previousDetailMemoriesRef = React.useRef(memories);

  React.useLayoutEffect(() => {
    const previousItems = previousDetailMemoriesRef.current;
    previousDetailMemoriesRef.current = memories;
    if (previousItems === memories) return;
    setSelectedLocationDetail((location) => reconcileLocationSnapshot(location, previousItems, memories));
    setParentLocationDetail((location) => reconcileLocationSnapshot(location, previousItems, memories));
    setSelectedParentSpace((location) => reconcileLocationSnapshot(location, previousItems, memories));
  }, [memories]);

  // Build location summaries without inventing fallback names. A record with
  // only a second-level location is promoted to a first-level entry; records
  // with a parent remain grouped under that parent.
  const subLocationMap = memories.reduce((map, item) => {
      const subName = item.subLocationName?.trim() || "";
      if (!subName) return map;
      const parentName = item.parentLocationName?.trim() || "";
      const key = `${parentName}::${subName}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        existing.itemCount += 1;
        if (!existing.imgUrl && item.subLocationImg) existing.imgUrl = refreshEmojiAssetUrl(item.subLocationImg) || "";
        if (!existing.subLocationHighlight && item.subLocationHighlight) {
          existing.subLocationHighlight = item.subLocationHighlight;
        }
        return map;
      }

      map.set(key, {
        name: subName,
        parentName,
        imgUrl: refreshEmojiAssetUrl(item.subLocationImg) || "",
        parentImgUrl: item.parentLocationImg || "",
        itemCount: 1,
        items: [item],
        subLocationHighlight: item.subLocationHighlight,
      });
      return map;
    }, new Map<string, SubLocationSummary>());
  const subLocationList: SubLocationSummary[] = (Array.from(subLocationMap.values()) as SubLocationSummary[]).map((space) => (
    space.imgUrl
      ? space
      : {
          ...space,
          // Older memories may contain a sub-location name without a saved
          // image. Keep the space card populated with its deterministic Emoji
          // skin instead of rendering an empty thumbnail.
          imgUrl: emojiAsset(classifyEmojiLocally(space.name, "sub-space").icon_key),
        }
  ));

  const spacesMap = new Map<string, MemoryItem[]>();
  memories.forEach((item) => {
    const parentName = item.parentLocationName?.trim() || "";
    const subName = item.subLocationName?.trim() || "";
    const key = parentName || (subName ? `sub:${subName}` : "");
    if (!key) return;
    const current = spacesMap.get(key) || [];
    current.push(item);
    spacesMap.set(key, current);
  });

  const spacesList: SpaceSummary[] = Array.from(spacesMap.entries()).map(([key, spaceItems]) => {
    const promotedSub = key.startsWith("sub:");
    const name = promotedSub ? (spaceItems[0]?.subLocationName?.trim() || "") : key;
    const directItems = spaceItems.filter((item) => promotedSub || !item.subLocationName?.trim());
    const childSpaces = promotedSub
      ? []
      : subLocationList.filter((space) => space.parentName === name);
    const imgUrl = promotedSub
      ? (refreshEmojiAssetUrl(spaceItems.find((item) => item.subLocationImg)?.subLocationImg) || emojiAsset(classifyEmojiLocally(name, "sub-space").icon_key))
      : (spaceItems.find((item) => item.parentLocationImg)?.parentLocationImg || emojiAsset(classifyEmojiLocally(name, "parent-space").icon_key));
    return {
      key,
      name,
      imgUrl,
      itemCount: spaceItems.length,
      subLocations: childSpaces,
      items: spaceItems,
      directItems,
      sourceField: promotedSub ? "sub" : "parent",
      parentName: promotedSub ? "" : name,
    };
  });

  React.useLayoutEffect(() => {
    if (!isOpen || !openTarget) return;
    setIsMemoryKeyboardOpen(false);
    setIsSearchOpen(false);
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setParentLocationDetail(null);

    if (openTarget.kind === "item") {
      setSelectedLocationDetail(null);
      setSelectedDetailSource("other");
      setSelectedDetailItem(openTarget.item);
      onOpenTargetHandled?.();
      return;
    }

    setSelectedDetailItem(null);
    const result = openTarget.space;
    if (result.kind === "child") {
      setSelectedLocationDetail({
        key: result.id,
        name: result.name,
        imgUrl: result.imageUrl || emojiAsset(classifyEmojiLocally(result.name, "sub-space").icon_key),
        itemCount: result.itemCount,
        subLocations: [],
        items: result.items,
        directItems: result.items,
        sourceField: "sub",
        parentName: result.parentName,
      });
      onOpenTargetHandled?.();
      return;
    }

    const subLocations: SubLocationSummary[] = result.subSpaces.map((subSpace) => {
      const items = result.items.filter((item) => item.subLocationName === subSpace.name);
      return {
        name: subSpace.name,
        parentName: result.name,
        imgUrl: items.find((item) => item.subLocationImg)?.subLocationImg || "",
        parentImgUrl: result.imageUrl,
        itemCount: subSpace.itemCount,
        items,
        subLocationHighlight: items.find((item) => item.subLocationHighlight)?.subLocationHighlight,
      };
    });
    setSelectedLocationDetail({
      key: result.id,
      name: result.name,
      imgUrl: result.imageUrl || emojiAsset(classifyEmojiLocally(result.name, "parent-space").icon_key),
      itemCount: result.itemCount,
      subLocations,
      items: result.items,
      directItems: result.items.filter((item) => !item.subLocationName?.trim()),
      sourceField: "parent",
      parentName: result.name,
    });
    onOpenTargetHandled?.();
  }, [isOpen, onOpenTargetHandled, openTarget]);

  // Filtered Items for Items tab
  const itemsCategories = ["All", "Electronics", "Apparel", "Docs", "Housewares", "Others"];
  
  const filteredItems = memories.filter((item) => {
    // Category match
    const itemNorm = normalizeCategory(item.category);
    const activeNorm = normalizeCategory(activeCategory);
    const categoryMatch = activeNorm === "all" || itemNorm === activeNorm;
    
    // Search match
    const searchMatch =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.parentLocationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subLocationName.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const itemSearchResults = normalizedSearchQuery
    ? memories.filter((item) =>
        matchesText(item.name, normalizedSearchQuery) ||
        matchesText(item.parentLocationName, normalizedSearchQuery) ||
        matchesText(item.subLocationName, normalizedSearchQuery)
      )
    : [];
  const parentSpaceSearchResults = normalizedSearchQuery
    ? spacesList.filter((space) => matchesText(space.name, normalizedSearchQuery))
    : [];
  const childSpaceSearchResults = normalizedSearchQuery
    ? subLocationList.filter((space) => matchesText(space.name, normalizedSearchQuery))
    : [];
  const selectedParentSubLocations = selectedParentSpace
    ? subLocationList.filter((space) => space.parentName === selectedParentSpace.name)
    : [];
  const parentHeroImage = isEditingParentName ? parentImageDraft || selectedParentSpace?.imgUrl || "" : selectedParentSpace?.imgUrl || "";
  const filteredItemIds = filteredItems.map((item) => item.id);
  const hasSelectedItems = selectedItemsListIds.length > 0;
  const isAllFilteredSelected = filteredItemIds.length > 0 && filteredItemIds.every((id) => selectedItemsListIds.includes(id));

  const handleCancelSearch = () => {
    setSearchQuery("");
    setIsMemoryKeyboardOpen(false);
    setIsSearchOpen(false);
    setIsEditingItemsList(false);
    setSelectedItemsListIds([]);
  };

  const openMemorySearch = () => {
    if (onRequireAuth && !onRequireAuth(openMemorySearch)) return;
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setSelectedLocationDetail(null);
    setIsEditingParentName(false);
    setIsEditingItemsList(false);
    setSelectedItemsListIds([]);
    setSearchQuery("");
    setIsSearchOpen(true);
    setIsMemoryKeyboardOpen(true);
  };

  const openDetail = (item?: MemoryItem, source: "items" | "other" = "other") => {
    if (!item) return;
    setIsMemoryKeyboardOpen(false);
    setSelectedDetailSource(source);
    setSelectedDetailItem(item);
  };

  const saveLocationName = (
    location: SpaceSummary,
    updates: { name: string; imgUrl?: string }
  ) => {
    if (hasMore || isLoading || loadError) return;
    const next = { name: updates.name.trim() || location.name, imgUrl: updates.imgUrl || location.imgUrl };
    onMemoriesChange((current) => current.map((item) => updateLocationItem(item, location, next)));
    setSelectedLocationDetail((current) => updateLocationSnapshot(current, location, next));
    setParentLocationDetail((current) => updateLocationSnapshot(current, location, next));
  };

  const deleteCurrentLocation = () => {
    if (!selectedLocationDetail || hasMore || isLoading || loadError) return;
    const location = selectedLocationDetail;
    onMemoriesChange((current) => current.filter((item) => !itemBelongsToLocation(item, location)));
    if (location.sourceField === "sub" && parentLocationDetail) {
      setSelectedLocationDetail({
        ...parentLocationDetail,
        subLocations: parentLocationDetail.subLocations.filter((sub) => !(sub.name === location.name && sub.parentName === location.parentName)),
      });
    } else {
      setSelectedLocationDetail(null);
    }
    setParentLocationDetail(null);
  };

  const clearItemsLongPressTimer = () => {
    if (!itemsLongPressTimerRef.current) return;
    clearTimeout(itemsLongPressTimerRef.current);
    itemsLongPressTimerRef.current = null;
  };

  const toggleItemsListSelection = (itemId: string) => {
    setSelectedItemsListIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  };

  const startItemsListEditing = (itemId: string) => {
    setIsEditingItemsList(true);
    setSelectedItemsListIds((current) => current.includes(itemId) ? current : [...current, itemId]);
  };

  const handleItemsListSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedItemsListIds((current) => current.filter((id) => !filteredItemIds.includes(id)));
      return;
    }

    setSelectedItemsListIds((current) => Array.from(new Set([...current, ...filteredItemIds])));
  };

  const requestDeleteSelectedItems = () => {
    if (!hasSelectedItems) return;
    setPendingDeleteItemIds(selectedItemsListIds);
  };

  const confirmDeleteSelectedItems = () => {
    if (!pendingDeleteItemIds?.length) return;
    const ids = new Set(pendingDeleteItemIds);
    onMemoriesChange((currentMemories) => currentMemories.filter((item) => !ids.has(item.id)));
    setPendingDeleteItemIds(null);
    setSelectedItemsListIds([]);
    setIsEditingItemsList(false);
  };

  React.useEffect(() => {
    return () => clearItemsLongPressTimer();
  }, []);

  const deleteSelectedDetailItem = () => {
    if (!selectedDetailItem) return;
    const itemId = selectedDetailItem.id;
    onMemoriesChange((currentMemories) => currentMemories.filter((item) => item.id !== itemId));
    setSelectedDetailSource("other");
    setSelectedDetailItem(null);
  };

  const saveSelectedDetailItem = (updates: Partial<MemoryItem>) => {
    if (!selectedDetailItem) return;
    const itemId = selectedDetailItem.id;
    onMemoriesChange((currentMemories) =>
      currentMemories.map((item) => (item.id === itemId ? { ...item, ...updates } : item))
    );
    setSelectedDetailItem((current) => (current ? { ...current, ...updates } : current));
  };

  const openParentSpace = (space: SpaceSummary) => {
    setSearchQuery("");
    setIsMemoryKeyboardOpen(false);
    setIsSearchOpen(false);
    setIsEditingItemsList(false);
    setSelectedItemsListIds([]);
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setParentLocationDetail(null);
    setSelectedLocationDetail(space);
  };

  const startParentEdit = () => {
    if (!selectedParentSpace) return;
    setParentNameDraft(selectedParentSpace.name);
    setParentImageDraft(selectedParentSpace.imgUrl);
    setIsEditingParentName(true);
    setIsMemoryKeyboardOpen(true);
  };

  const cancelParentEdit = () => {
    setParentNameDraft(selectedParentSpace?.name || "");
    setParentImageDraft(selectedParentSpace?.imgUrl || "");
    setIsParentRetakeCaptureOpen(false);
    setIsEditingParentName(false);
    setIsMemoryKeyboardOpen(false);
  };

  const confirmParentEdit = () => {
    if (!selectedParentSpace) return;
    const previousName = selectedParentSpace.name;
    const nextName = parentNameDraft.trim();
    if (nextName && nextName !== previousName) {
      onMemoriesChange((currentMemories) =>
        currentMemories.map((item) =>
          item.parentLocationName === previousName
            ? {
                ...item,
                parentLocationName: nextName,
                parentLocationImg: parentImageDraft || item.parentLocationImg,
              }
            : item
        )
      );
      setSelectedParentSpace((current) =>
        current
          ? {
              ...current,
              name: nextName,
              imgUrl: parentImageDraft || current.imgUrl,
              items: current.items.map((item) =>
                item.parentLocationName === previousName
                  ? {
                      ...item,
                      parentLocationName: nextName,
                      parentLocationImg: parentImageDraft || item.parentLocationImg,
                    }
                  : item
              ),
            }
          : current
      );
    } else if (selectedParentSpace) {
      onMemoriesChange((currentMemories) =>
        currentMemories.map((item) =>
          item.parentLocationName === previousName
            ? { ...item, parentLocationImg: parentImageDraft || item.parentLocationImg }
            : item
        )
      );
      setSelectedParentSpace((current) =>
        current ? { ...current, imgUrl: parentImageDraft || current.imgUrl } : current
      );
    }
    cancelParentEdit();
  };

  const deleteParentSpace = () => {
    if (!selectedParentSpace) return;
    const parentName = selectedParentSpace.name;
    setPendingDeleteParentName(parentName);
  };

  const confirmDeleteParentSpace = () => {
    if (!pendingDeleteParentName) return;
    const parentName = pendingDeleteParentName;
    onMemoriesChange((currentMemories) =>
      currentMemories.filter((item) => item.parentLocationName !== parentName)
    );
    setSelectedParentSpace(null);
    setIsEditingParentName(false);
    setIsMemoryKeyboardOpen(false);
    setPendingDeleteParentName(null);
  };

  const deleteSubLocation = () => {
    if (!selectedSpaceDetail) return;
    const { parentName, name } = selectedSpaceDetail;
    onMemoriesChange((currentMemories) =>
      currentMemories.filter(
        (item) => !(item.parentLocationName === parentName && item.subLocationName === name)
      )
    );
    setSelectedSpaceDetail(null);
  };

  const deleteSubLocationItems = (itemIds: string[]) => {
    if (!selectedSpaceDetail || itemIds.length === 0) return;
    const ids = new Set(itemIds);
    onMemoriesChange((currentMemories) => currentMemories.filter((item) => !ids.has(item.id)));
    setSelectedSpaceDetail(null);
  };

  const deleteLocationSubLocation = (space: SubLocationSummary) => {
    const ids = new Set(space.items.map((item) => item.id));
    onMemoriesChange((currentMemories) => currentMemories.filter((item) => !ids.has(item.id)));
    setSelectedLocationDetail((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => !ids.has(item.id));
      return {
        ...current,
        items,
        subLocations: current.subLocations.filter((sub) => !(sub.parentName === space.parentName && sub.name === space.name)),
        itemCount: Math.max(0, current.itemCount - (current.items.length - items.length)),
      };
    });
  };

  const updateSelectedSpaceImage = (imgUrl: string) => {
    if (!selectedSpaceDetail) return;
    const { parentName, name } = selectedSpaceDetail;
    onMemoriesChange((currentMemories) =>
      currentMemories.map((item) =>
        item.parentLocationName === parentName && item.subLocationName === name
          ? { ...item, subLocationImg: imgUrl }
          : item
      )
    );
    setSelectedSpaceDetail((current) => (current ? { ...current, imgUrl } : current));
  };

  const handleParentRetakeConfirm = (imgUrl: string) => {
    setParentImageDraft(imgUrl);
    setIsParentRetakeCaptureOpen(false);
  };

  const saveSelectedSpaceDetail = (updates: { parentName: string; subName: string; parentImgUrl?: string; imgUrl?: string }) => {
    if (!selectedSpaceDetail) return;
    const previousParentName = selectedSpaceDetail.parentName;
    const previousSubName = selectedSpaceDetail.name;
    const nextParentName = updates.parentName.trim() || previousParentName;
    const nextSubName = updates.subName.trim() || previousSubName;

    onMemoriesChange((currentMemories) =>
      currentMemories.map((item) =>
        item.parentLocationName === previousParentName && item.subLocationName === previousSubName
          ? {
              ...item,
              parentLocationName: nextParentName,
              subLocationName: nextSubName,
              parentLocationImg: updates.parentImgUrl || item.parentLocationImg,
              subLocationImg: updates.imgUrl || item.subLocationImg,
            }
          : item
      )
    );

    setSelectedSpaceDetail((current) =>
      current
        ? {
            ...current,
            parentName: nextParentName,
            name: nextSubName,
            parentImgUrl: updates.parentImgUrl || current.parentImgUrl,
            imgUrl: updates.imgUrl || current.imgUrl,
          }
        : current
    );
  };

  const openSpaceDetail = (space?: SubLocationSummary) => {
    if (!space) return;
    setIsMemoryKeyboardOpen(false);
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setParentLocationDetail(null);
    setSelectedLocationDetail({
      key: `${space.parentName}::${space.name}`,
      name: space.name,
      imgUrl: space.imgUrl || emojiAsset(classifyEmojiLocally(space.name, "sub-space").icon_key),
      itemCount: space.itemCount,
      subLocations: [],
      items: space.items,
      directItems: space.items,
      sourceField: "sub",
      parentName: space.parentName,
    });
  };

  const openNestedSpaceDetail = (space: SubLocationSummary) => {
    if (selectedLocationDetail) setParentLocationDetail(selectedLocationDetail);
    setIsMemoryKeyboardOpen(false);
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setSelectedLocationDetail({
      key: `${space.parentName}::${space.name}`,
      name: space.name,
      imgUrl: space.imgUrl || emojiAsset(classifyEmojiLocally(space.name, "sub-space").icon_key),
      itemCount: space.itemCount,
      subLocations: [],
      items: space.items,
      directItems: space.items,
      sourceField: "sub",
      parentName: space.parentName,
    });
  };

  const closeLocationDetail = () => {
    if (parentLocationDetail) {
      setSelectedLocationDetail(parentLocationDetail);
      setParentLocationDetail(null);
      return;
    }
    setSelectedLocationDetail(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: isOpen ? 1 : 0, y: 0 }}
      transition={{
        type: "tween",
        duration: didCompleteInitialOpenRef.current ? 0 : 0.45,
        ease: [0.16, 1, 0.3, 1],
      }}
      onAnimationComplete={() => {
        if (isOpen) didCompleteInitialOpenRef.current = true;
      }}
      className="absolute inset-0 bg-[#E9E6E1] z-[120] flex flex-col overflow-hidden select-none"
      style={{
        pointerEvents: isOpen ? "auto" : "none",
        visibility: isOpen ? "visible" : "hidden",
      }}
      aria-hidden={!isOpen}
    >
      {!selectedParentSpace ? (
        <img
          src={MATRIX_DOT_IMAGE_URL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-0 h-full w-full object-cover opacity-100 pointer-events-none select-none"
          referrerPolicy="no-referrer"
        />
      ) : null}

      {selectedParentSpace ? (
        <PageNavigation
          className="memory-header-nav"
          onBack={() => {
            cancelParentEdit();
            setSelectedParentSpace(null);
          }}
          actions={isEditingParentName ? (
            <div className="flex items-center gap-[12px]">
              <MemoryActionButton
                label="Confirm edits"
                onClick={(event) => {
                  event.stopPropagation();
                  confirmParentEdit();
                }}
                className="!bg-[#232121] text-white"
              >
                <Check className="h-4 w-4 text-white stroke-[3]" />
              </MemoryActionButton>
              <MemoryActionButton
                label="Cancel editing"
                onClick={(event) => {
                  event.stopPropagation();
                  cancelParentEdit();
                }}
              >
                <CloseIcon className="h-4 w-4 text-[#232121]/50" />
              </MemoryActionButton>
            </div>
          ) : (
            <MemoryActionButton
              label={t("Edit parent location")}
              onClick={(event) => {
                event.stopPropagation();
                startParentEdit();
              }}
            >
              <EditPencilIcon />
            </MemoryActionButton>
          )}
        />
      ) : isSearchOpen ? (
        <div
          className="w-full px-[16px] bg-transparent shrink-0 z-50 select-none"
          style={{
            height: "calc(var(--noma-navigation-top) + 89px)",
            paddingTop: "calc(var(--noma-navigation-top) + 15px)",
          }}
        >
          <div className="flex items-center gap-[12px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "tween", duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setIsMemoryKeyboardOpen(true)}
              className="flex-1 min-w-0 h-[50px] rounded-full bg-white flex items-center px-[27px] gap-[22px] cursor-text"
            >
              <Search className="w-[25px] h-[25px] text-[#232121] stroke-[2.6] shrink-0" />
              <div className="flex-1 min-w-0 flex items-center text-[#232121] text-[18px] leading-none font-sans font-bold tracking-tight">
                <span className="truncate">{searchQuery || ""}</span>
                <span className="ml-[2px] h-[24px] border-r-[2px] border-[#232121] animate-cursor-blink-black" />
              </div>
            </motion.div>

            <button
              onClick={handleCancelSearch}
              className="h-[50px] px-[1px] flex items-center justify-center text-[#232121] text-[16px] font-sans font-semibold tracking-tight active:scale-95 transition-transform cursor-pointer"
            >{" "}{t("Cancel")}{" "}</button>
          </div>
        </div>
      ) : (
        <PageNavigation
          className="memory-header-nav"
          onBack={onClose}
          backLabel="Back to home"
          title={t("Memory")}
          actions={<button
            type="button"
            onClick={openMemorySearch}
            aria-label={t("Search memories")}
            className="w-[22px] h-[22px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
          >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_176_2470)">
                  <path d="M16.1901 16.5905C17.9855 14.9705 19.114 12.6253 19.114 10.0166C19.114 5.12803 15.1511 1.16504 10.2625 1.16504C5.37388 1.16504 1.41089 5.12803 1.41089 10.0166C1.41089 14.9052 5.37388 18.8682 10.2625 18.8682C10.9228 18.8682 11.5662 18.7959 12.1853 18.6588" stroke="black" strokeWidth="1.96702" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16.3304 16.5767L20.5891 20.8353" stroke="black" strokeWidth="1.96702" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
                <defs>
                  <clipPath id="clip0_176_2470">
                    <rect width="22" height="22" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
          </button>}
        />
      )}

      {/* Scrollable container inside device bounds (starts under fixed header) */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-[20px] pt-0 no-scrollbar"
        style={{
          paddingBottom: isMemoryKeyboardOpen
            ? "calc(225px + env(safe-area-inset-bottom, 0px))"
            : activeTab === "items" && isEditingItemsList
              ? "calc(104px + env(safe-area-inset-bottom, 0px))"
              : "calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {isAuthenticated && (isLoading || loadError) ? (
          <div className="flex h-full flex-col items-center justify-center px-8 pb-20 text-center text-[#232121]" role="status">
            <p className="text-[14px] leading-5">{isLoading ? t("Loading your memories…") : loadError}</p>
            {!isLoading && <button type="button" onClick={onRetryLoad} className="mt-5 rounded-full bg-[#232121] px-6 py-3 text-[14px] font-semibold text-white active:scale-95">{t("Try again")}</button>}
          </div>
        ) : !memories.length ? (
          <div className="flex h-full flex-col items-center justify-center px-8 pb-20 text-center text-[#232121]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70 text-[27px]">✦</div>
            <p className="mt-5 text-[16px] font-semibold">{t(isAuthenticated ? "No memories yet" : "No memories yet. Log in to see more.")}</p>
            <p className="mt-2 max-w-[250px] text-[13px] leading-5 text-[#232121]/45">
              {t(isAuthenticated ? "Snap your first item to start building your memory." : "Log in to keep your items and spaces safely in your own memory.")}
            </p>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={onLogin}
                className="mt-6 flex h-10 min-w-[96px] items-center justify-center rounded-full bg-[#232121] px-5 text-[14px] font-semibold text-white active:scale-95"
              >
                {t("Log in")}
              </button>
            )}
          </div>
        ) : selectedParentSpace ? (
          <motion.div
            key={`parent-space-${selectedParentSpace.name}`}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ type: "tween", duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="px-0 select-none"
          >
            <motion.div
              className="-mx-[20px] flex flex-col items-center px-0 text-center text-[#232121]"
              animate={{ y: isEditingParentName ? 48 : 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              style={{ paddingBottom: isEditingParentName ? 220 : 42, paddingTop: 10 }}
            >
              <motion.div
                className="relative flex items-center justify-center overflow-visible"
                animate={{
                  width: isEditingParentName ? 228 : 174,
                  height: isEditingParentName ? 228 : 136,
                  x: isEditingParentName ? 0 : -10,
                }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
              >
                <motion.div
                  className="absolute h-[94px] w-[112px] rotate-[8deg] rounded-[26px] bg-[linear-gradient(135deg,#FFB0B0_0%,#FFD2B4_50%,#8DEBD9_100%)] opacity-95"
                  animate={{
                    left: 55,
                    top: isEditingParentName ? 84 : 32,
                    opacity: isEditingParentName ? 0 : 0.95,
                    y: isEditingParentName ? 200 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                />
                <motion.div
                  className={`relative z-10 overflow-hidden rounded-[26px] border-[3px] border-white object-cover ${
                    isEditingParentName ? "shadow-none" : "shadow-[0_16px_32px_rgba(35,33,33,0.12)]"
                  } ${
                    isEmojiImageUrl(parentHeroImage) ? "bg-[#E9E6E1]" : ""
                  }`}
                  animate={{
                    width: isEditingParentName ? 228 : 114,
                    height: isEditingParentName ? 228 : 114,
                    rotate: isEditingParentName ? 0 : -9,
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                >
                  <PersistentImage src={parentHeroImage} alt={selectedParentSpace.name} loading="eager" className="h-full w-full rounded-[23px] object-cover" referrerPolicy="no-referrer" />
                </motion.div>
                {isEditingParentName && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <RetakePhotoButton
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsMemoryKeyboardOpen(false);
                        setIsParentRetakeCaptureOpen(true);
                      }}
                      label="Retake parent photo"
                      icon={<RestartIcon className="h-7 w-7" color="#FFFFFF" />}
                    />
                  </div>
                )}
              </motion.div>
              <div
                className={`flex max-w-[270px] items-center justify-center text-center ${isEditingParentName ? "mt-[70px]" : "mt-[20px]"}`}
                style={isEditingParentName ? { transform: "translateX(-6px)" } : undefined}
              >
                <span className="mr-[8px] text-[24px] leading-none select-none">📍</span>
                <span
                  className={`relative truncate font-sans font-extrabold leading-none tracking-tight ${
                    isEditingParentName ? "border-b border-[#CCC4BE] pb-[4px]" : ""
                  }`}
                  style={{ fontSize: isEditingParentName ? "24px" : "34px" }}
                >
                  {isEditingParentName ? parentNameDraft : selectedParentSpace.name}
                  {isEditingParentName && (
                    <span className="ml-[3px] inline-block h-[32px] w-[2px] animate-cursor-blink-black bg-[#232121] align-[-4px]" />
                  )}
                </span>
              </div>
              {isEditingParentName && (
                <motion.button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsMemoryKeyboardOpen(false);
                    deleteParentSpace();
                  }}
                  className="mt-[56px] flex h-[34px] w-[89px] items-center justify-center gap-[6px] rounded-full bg-white px-[14px] text-[14px] font-sans font-semibold leading-none text-[#232121]/50 active:scale-95 transition-transform"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "tween", duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span>{t("Delete")}</span>
                  <DeleteActionIcon color="#232121" opacity={0.5} size={16} />
                </motion.button>
              )}
            </motion.div>

            <motion.div
              className="flex flex-col gap-[8px]"
              animate={{ opacity: isEditingParentName ? 0 : 1, y: isEditingParentName ? 18 : 0 }}
              transition={{ type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ pointerEvents: isEditingParentName ? "none" : "auto" }}
              aria-hidden={isEditingParentName}
            >
              {selectedParentSubLocations.length > 0 ? (
                selectedParentSubLocations.map((space) => (
                  <SubLocationListCard
                    key={`${space.parentName}-${space.name}`}
                    space={space}
                    onClick={() => openSpaceDetail(space)}
                  />
                ))
              ) : (
                <div className="py-20 text-center text-[14px] font-sans font-medium text-[#232121]/35">{" "}{t("No sub-locations yet")}{" "}</div>
              )}
            </motion.div>
          </motion.div>
        ) : isSearchOpen ? (
          <div className="px-0 pt-0 select-none">
            <div className="flex flex-col gap-[20px]">
              {itemSearchResults.length > 0 && (
                <section className="pb-[20px]">
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">{t("Items")}</h2>
                  <div className="mx-auto mt-[20px] grid w-full max-w-[352px] grid-cols-[repeat(3,100px)] justify-center gap-[26px] overflow-visible">
                    {itemSearchResults.map((item) => (
                      <MemorySearchItem key={item.id} item={item} size={100} onClick={() => openDetail(item)} />
                    ))}
                  </div>
                </section>
              )}

              {childSpaceSearchResults.length > 0 && (
                <section>
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">{t("Sub-Spaces")}</h2>
                  <div className="mt-[20px] flex flex-col gap-[8px]">
                    {childSpaceSearchResults.map((space) => (
                      <SubLocationListCard
                        key={`child-${space.parentName}-${space.name}`}
                        space={space}
                        onClick={() => openSpaceDetail(space)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {parentSpaceSearchResults.length > 0 && (
                <section>
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">{t("Space")}</h2>
                  <div className="mt-[20px] flex flex-col gap-[8px]">
                    {parentSpaceSearchResults.map((space) => (
                      <ParentSpaceResultCard
                        key={`parent-${space.name}`}
                        space={space}
                        onClick={() => openParentSpace(space)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
        <>
        
        {/* Spaces vs Items Primary Toggle Tab Panel */}
        <div className="sticky top-0 z-40 -mx-[20px] mb-5 flex h-[32px] gap-[var(--memory-tab-gap)] items-center px-[21px] py-0 select-none">
          {/* Spaces Tab */}
          <div
            className="relative cursor-pointer"
            onClick={() => {
              setActiveTab("spaces");
              setIsEditingItemsList(false);
              setSelectedItemsListIds([]);
            }}
          >
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "spaces" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >{" "}{t("Spaces")}{" "}</span>
            <MemorySelectedTabLine isSelected={activeTab === "spaces"} />
          </div>

          {/* Items Tab */}
          <div
            className="relative cursor-pointer"
            onClick={() => {
              if (activeTab === "items" && isEditingItemsList) {
                setIsEditingItemsList(false);
                setSelectedItemsListIds([]);
                return;
              }
              setActiveTab("items");
            }}
          >
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "items" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >{" "}{t("Items")}{" "}</span>
            <MemorySelectedTabLine isSelected={activeTab === "items"} />
          </div>
        </div>

        {/* Render Tab Contents */}
        {activeTab === "spaces" ? (
          <div className="memory-space-shelf-list select-none">
            {spacesList.map((space, index) => (
              <MemorySpaceShelfCard key={space.key} space={space} index={index} onClick={() => openParentSpace(space)} />
            ))}
          </div>
        ) : (
          /* Items: Category tabs and 2x2 grid */
          <div className="flex flex-col select-none">
            
            {/* Secondary category horizontal slider */}
            <div className="-ml-[20px] -mr-[20px] flex h-[30px] gap-2 items-center overflow-x-auto no-scrollbar pl-[20px] pr-[20px] pb-0 select-none">
              {itemsCategories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`h-[30px] px-4 py-0 text-[14px] font-sans font-normal rounded-full transition-all shrink-0 cursor-pointer border-0 outline-none ${
                      isActive
                        ? "bg-white text-black"
                        : "bg-white/40 text-neutral-500"
                    }`}
                  >
                    {t(cat)}
                  </button>
                );
              })}
            </div>

            {/* 2x2 Grid of Items */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 font-sans font-medium text-xs">{" "}{t("No items found in this category.")}{" "}</div>
            ) : (
              <div className="mx-auto mt-[44px] grid w-[310px] max-w-full grid-cols-[120px_120px] gap-x-[70px] gap-y-[32px] select-none">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={(event) => {
                      if (didItemsLongPressRef.current) {
                        didItemsLongPressRef.current = false;
                        return;
                      }
                      if (isEditingItemsList) {
                        event.stopPropagation();
                        toggleItemsListSelection(item.id);
                        return;
                      }
                      openDetail(item, "items");
                    }}
                    className="relative flex flex-col items-center justify-center overflow-visible select-none h-[160px] cursor-pointer hover:scale-105 active:scale-95 transition-all"
                    onPointerDown={() => {
                      if (isEditingItemsList) return;
                      clearItemsLongPressTimer();
                      didItemsLongPressRef.current = false;
                      itemsLongPressTimerRef.current = window.setTimeout(() => {
                        didItemsLongPressRef.current = true;
                        startItemsListEditing(item.id);
                        itemsLongPressTimerRef.current = null;
                      }, 320);
                    }}
                    onPointerUp={clearItemsLongPressTimer}
                    onPointerCancel={clearItemsLongPressTimer}
                    onPointerLeave={clearItemsLongPressTimer}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <div className="absolute left-0 top-0 z-30 max-w-[calc(100%-8px)] truncate text-[14px] font-sans font-semibold leading-none tracking-tight text-[#232121]">
                      📍 {item.parentLocationName || item.subLocationName}
                    </div>

                    {/* Sticker Display Area - transparent background, centered */}
                    <div className="relative w-full h-full flex items-center justify-start select-none overflow-visible">
                      <ItemSticker item={item} size={120} alignLeft />
                    </div>
                    {isEditingItemsList && (
                      <div className="pointer-events-none absolute right-[-2px] top-[-2px] z-40">
                        <MemorySelectorIcon selected={selectedItemsListIds.includes(item.id)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center pb-8 pt-7">
            <button
              type="button"
              onClick={() => onLoadMore?.()}
              disabled={isLoadingMore}
              className="rounded-full bg-white px-5 py-2 text-[13px] font-sans font-semibold text-[#232121] shadow-sm disabled:cursor-wait disabled:opacity-55"
            >
              {isLoadingMore ? t("Loading…") : t("Load more memories")}
            </button>
          </div>
        )}
        </>
        )}
      </div>

      <MemoryItemsEditBubble
        open={activeTab === "items" && isEditingItemsList && !isSearchOpen}
        allSelected={isAllFilteredSelected}
        hasSelected={hasSelectedItems}
        onSelectAll={handleItemsListSelectAll}
        onDelete={requestDeleteSelectedItems}
        onCancel={() => {
          setIsEditingItemsList(false);
          setSelectedItemsListIds([]);
        }}
      />

      <AnimatePresence>
        {selectedParentSpace && isParentRetakeCaptureOpen && (
          <LocationImageEditFlow
            initialImage={parentImageDraft || selectedParentSpace.imgUrl}
            initialMode={isEmojiImageUrl(parentImageDraft || selectedParentSpace.imgUrl) ? "emoji" : "camera"}
            emojiKind="parent-space"
            onCancel={() => { setParentImageDraft(selectedParentSpace.imgUrl); setIsParentRetakeCaptureOpen(false); }}
            onConfirm={handleParentRetakeConfirm}
          />
        )}
      </AnimatePresence>

      {/* 综合设置面板 */}
      <>
        {selectedDetailItem && (
          <MemoryItemDetailOverlay
            item={selectedDetailItem}
            memories={memories}
            siblingItems={
              selectedLocationDetail?.sourceField === "sub"
              && selectedLocationDetail.directItems.some((item) => item.id === selectedDetailItem.id)
                ? selectedLocationDetail.directItems
                : selectedDetailSource === "items"
                  && activeTab === "items"
                  && !isSearchOpen
                  && filteredItems.some((item) => item.id === selectedDetailItem.id)
                  ? filteredItems
                  : undefined
            }
            onNavigateItem={setSelectedDetailItem}
            onClose={() => {
              setSelectedDetailSource("other");
              setSelectedDetailItem(null);
            }}
            onDelete={deleteSelectedDetailItem}
            onSave={saveSelectedDetailItem}
          />
        )}
      </>

      <AnimatePresence>
        {selectedLocationDetail && (
          <LocationDetailModal
            key={`${selectedLocationDetail.sourceField}:${selectedLocationDetail.key}`}
            location={selectedLocationDetail}
            onClose={closeLocationDetail}
            onOpenItem={openDetail}
            onOpenSubLocation={openNestedSpaceDetail}
            onSaveLocation={saveLocationName}
            onDeleteLocation={deleteCurrentLocation}
            canEditLocation={!hasMore && !isLoading && !loadError}
            nameExists={(name) => memories.some((item) => selectedLocationDetail.sourceField === "parent"
              ? item.parentLocationName.trim() === name
              : item.parentLocationName.trim() === selectedLocationDetail.parentName && item.subLocationName.trim() === name)}
            onDeleteSubLocation={deleteLocationSubLocation}
            onDeleteItems={(itemIds) => {
              const ids = new Set(itemIds);
              onMemoriesChange((currentMemories) => currentMemories.filter((item) => !ids.has(item.id)));
            }}
          />
        )}
      </AnimatePresence>

      <MemoryConfirmModal
        open={pendingDeleteParentName !== null}
        title={t("Delete {name}?", { name: pendingDeleteParentName || "parent location" })}
        message="This will delete the parent location, all sub-locations, and every item inside it."
        onCancel={() => setPendingDeleteParentName(null)}
        onConfirm={confirmDeleteParentSpace}
      />

      <MemoryConfirmModal
        open={pendingDeleteItemIds !== null}
        title={t("Delete selected items?")}
        message="This will permanently remove the selected items from Memory."
        onCancel={() => setPendingDeleteItemIds(null)}
        onConfirm={confirmDeleteSelectedItems}
      />

      <AnimatePresence>
        {isMemoryKeyboardOpen && (
          <motion.div
            key="memory-search-keyboard"
            className="absolute bottom-0 inset-x-0 z-[130] h-[205px] pointer-events-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <VirtualKeyboard
              value={isEditingParentName ? parentNameDraft : searchQuery}
              onChange={(value) => isEditingParentName ? setParentNameDraft(value) : setSearchQuery(value)}
              onKeyPress={(char) => isEditingParentName
                ? setParentNameDraft((prev) => `${prev}${char}`)
                : setSearchQuery((prev) => `${prev}${char}`)}
              onBackspace={() => isEditingParentName
                ? setParentNameDraft((prev) => prev.slice(0, -1))
                : setSearchQuery((prev) => prev.slice(0, -1))}
              onSpace={() => isEditingParentName
                ? setParentNameDraft((prev) => `${prev} `)
                : setSearchQuery((prev) => `${prev} `)}
              onSend={isEditingParentName ? confirmParentEdit : () => setIsMemoryKeyboardOpen(false)}
              onDismiss={isEditingParentName ? cancelParentEdit : handleCancelSearch}
              sendLabel={isEditingParentName ? "OK" : undefined}
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
