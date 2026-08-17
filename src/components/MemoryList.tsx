import React, { useState } from "react";
import { Check, Image as ImageIcon, RotateCcw, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { getStickerTitleStyle } from "./StickerTitle";
import { TagSwitchIcon } from "./TagSwitchIcon";
import { EditPencilIcon } from "./EditPencilIcon";
import { CloseIcon } from "./CloseIcon";
import { CancelIcon } from "./CancelIcon";
import { CameraIcon } from "./CameraIcon";
import { CollapseLocationIcon, ExpandLocationIcon } from "./LocationViewIcons";

const COLOR_BLUR_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/colorblur.png";
const MATRIX_DOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png";
const LIGHTSPOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/lightspot.png";
const DETAIL_CATEGORIES = ["Electronics", "Apparel", "Docs", "Housewares", "Others"];

const preloadColorBlurImage = () => {
  if (typeof window === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.src = COLOR_BLUR_IMAGE_URL;
  image.decode?.().catch(() => undefined);
};

preloadColorBlurImage();

const DECODED_IMAGE_CACHE_KEY = "noma:decoded-image-urls:v1";
const MAX_DECODED_IMAGE_URLS = 120;

const readDecodedImageCache = () => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(DECODED_IMAGE_CACHE_KEY) || "[]");
    return new Set<string>(Array.isArray(cached) ? cached.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const decodedImageCache = readDecodedImageCache();

const rememberDecodedImage = (src: string) => {
  if (!src) return;
  decodedImageCache.delete(src);
  decodedImageCache.add(src);
  while (decodedImageCache.size > MAX_DECODED_IMAGE_URLS) {
    const oldest = decodedImageCache.values().next().value;
    if (typeof oldest !== "string") break;
    decodedImageCache.delete(oldest);
  }
  if (src.startsWith("data:") || src.startsWith("blob:")) return;
  try {
    window.sessionStorage.setItem(DECODED_IMAGE_CACHE_KEY, JSON.stringify(
      [...decodedImageCache].filter((value) => !value.startsWith("data:") && !value.startsWith("blob:")),
    ));
  } catch {
    // The in-memory cache still prevents repeated skeletons when storage is unavailable.
  }
};

const SkeletonImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  ...props
}) => {
  const imageSrc = typeof src === "string" ? src : "";
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    imageSrc && decodedImageCache.has(imageSrc) ? "ready" : "loading",
  );

  React.useEffect(() => {
    setStatus(imageSrc && decodedImageCache.has(imageSrc) ? "ready" : "loading");
  }, [imageSrc]);

  React.useLayoutEffect(() => {
    const image = imageRef.current;
    if (!imageSrc || !image?.complete || image.naturalWidth === 0) return;
    rememberDecodedImage(imageSrc);
    setStatus("ready");
  }, [imageSrc]);

  const handleLoad = React.useCallback(() => {
    rememberDecodedImage(imageSrc);
    setStatus("ready");
  }, [imageSrc]);

  return (
    <>
      {status === "loading" && <div className="noma-image-skeleton absolute inset-0 z-0" aria-hidden="true" />}
      {status === "error" && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#DDDAD5] text-[#232121]/25" aria-hidden="true">
          <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
        </div>
      )}
      {imageSrc && (
        <img
          ref={imageRef}
          {...props}
          src={imageSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={handleLoad}
          onError={() => setStatus("error")}
          className={`${className} relative z-[1] transition-opacity duration-150 ease-out ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </>
  );
};

export interface MemoryItem {
  id: string;
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
}

interface MemoryListProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  onMemoriesChange: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  isAuthenticated?: boolean;
  onRequireAuth?: (action?: () => void) => boolean;
  onLogin?: () => void;
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
  name: string;
  imgUrl: string;
  itemCount: number;
  subLocations: { name: string; itemCount: number }[];
  items: MemoryItem[];
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

type MemoryLocationField = "parent" | "sub";

type MemorySubLocationOption = {
  key: string;
  name: string;
  parentName: string;
  imgUrl: string;
  parentImgUrl?: string;
  itemCount: number;
  subLocationHighlight?: { x: number; y: number };
};

type MemoryParentLocationOption = {
  key: string;
  name: string;
  imgUrl: string;
  itemCount: number;
};

const DETAIL_MODAL_CONTENT_HEIGHT = 734;

const MatrixDotBackground: React.FC<{ rounded?: boolean }> = ({ rounded = false }) => (
  <img
    src={MATRIX_DOT_IMAGE_URL}
    alt=""
    aria-hidden="true"
    className={`absolute inset-0 z-0 h-full w-full object-cover pointer-events-none select-none ${rounded ? "rounded-[24px]" : ""}`}
    referrerPolicy="no-referrer"
  />
);

const MemorySelectedTabLine = () => (
  <motion.svg
    layoutId="tabSelectedUnderline"
    width="62"
    height="17"
    viewBox="0 0 62 17"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute bottom-[-5px] left-1/2 z-0 h-[17px] w-[62px] -translate-x-1/2 pointer-events-none select-none"
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
  >
    <path
      d="M31.1671 2.45151C32.3027 2.27348 33.4401 2.76032 34.0958 3.70444C34.7514 4.64862 34.8097 5.88422 34.2462 6.88608L33.0323 9.04233L57.0841 2.51987C58.6832 2.08621 60.3311 3.03113 60.7647 4.63022C61.1984 6.22932 60.2535 7.87723 58.6544 8.31089L27.6944 16.7074C26.5277 17.0238 25.2848 16.6085 24.5421 15.6546C23.7994 14.7009 23.7016 13.3948 24.294 12.3412L25.9825 9.33823L5.33408 12.5775C3.69728 12.8342 2.16214 11.7153 1.90537 10.0785C1.64866 8.44167 2.76759 6.90652 4.4044 6.64976L31.1671 2.45151Z"
      fill="url(#memory-tab-selected-line-gradient)"
    />
    <defs>
      <linearGradient
        id="memory-tab-selected-line-gradient"
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

const MemorySearchItem: React.FC<{ item: MemoryItem; compact?: boolean; size?: number; onClick?: () => void }> = ({
  item,
  compact = false,
  size,
  onClick,
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
        className="relative rotate-[-1.5deg] flex items-center justify-center overflow-visible"
        style={{ width: boxSize, height: boxSize }}
      >
        {item.stickerUrl ? (
          <img
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
          className="absolute left-1/2 z-20 -translate-x-1/2 text-center font-alkatra pointer-events-none select-none"
          style={getStickerTitleStyle(boxSize)}
        >
          {item.name}
        </div>
      </div>
    </div>
  );
};

const SubLocationItemPreview: React.FC<{ item: MemoryItem }> = ({ item }) => (
  <div className="relative flex h-[56px] w-[72px] min-w-[72px] shrink-0 flex-col items-center overflow-visible select-none">
    <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rotate-[-1.5deg]">
      {item.stickerUrl ? (
        <img
          src={item.stickerUrl}
          alt={item.name}
          className="block h-full w-full select-none object-contain"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center overflow-hidden text-[28px] select-none">
          {item.emoji || "📦"}
        </div>
      )}
    </div>
    <div
      className="absolute left-1/2 z-10 -translate-x-1/2 text-center font-alkatra pointer-events-none select-none"
      style={getStickerTitleStyle(48)}
    >
      {item.name}
    </div>
  </div>
);

const PriceTag: React.FC<{ price: string; className?: string }> = ({ price, className = "" }) => (
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
      <g clipPath="url(#clip0_283_2038_memory)">
        <path
          d="M19.0738 0H14.2594C12.7704 2.47955e-05 11.3486 0.621836 10.3385 1.71582L1.41561 11.3799C-0.47187 13.4241 -0.471871 16.5759 1.41561 18.6201L10.3385 28.2842C11.3486 29.3782 12.7704 30 14.2594 30H19.0738V0ZM8.19882 17C6.83613 17 5.73104 15.8807 5.73104 14.5C5.73104 13.1193 6.83613 12 8.19882 12C9.56152 12 10.6666 13.1193 10.6666 14.5C10.6666 15.8807 9.56152 17 8.19882 17Z"
          fill="#232121"
        />
      </g>
      <defs>
        <clipPath id="clip0_283_2038_memory">
          <rect width="19" height="30" fill="white" />
        </clipPath>
      </defs>
    </svg>
    <span className="h-[30px] max-w-[122px] rounded-r-[6px] rounded-l-none bg-[#232121] -ml-px pl-0 pr-3 flex items-center justify-center font-alkatra text-[15px] leading-none whitespace-nowrap overflow-hidden">
      {price || "+ Value"}
    </span>
  </div>
);

const ItemSticker: React.FC<{
  item: MemoryItem;
  size?: number;
  title?: string;
  titleSize?: number;
  stroke?: number;
  alignLeft?: boolean;
  onTitleClick?: (event: React.MouseEvent) => void;
  isTitleEditing?: boolean;
}> = ({
  item,
  size = 210,
  title,
  titleSize,
  stroke,
  alignLeft = false,
  onTitleClick,
  isTitleEditing = false,
}) => {
  const displayTitle = title ?? item.name;

  return (
    <div
      className={`relative rotate-[-1.5deg] flex items-center justify-center overflow-visible ${alignLeft ? "origin-left" : ""}`}
      style={{ width: size, height: size }}
    >
      {item.stickerUrl ? (
        <img
          src={item.stickerUrl}
          alt={item.name}
          className="w-full h-full object-contain block select-none"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="flex items-center justify-center overflow-visible select-none"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
        >
          {item.emoji || "📦"}
        </div>
      )}

      <div
        className={`absolute left-1/2 z-20 -translate-x-1/2 text-center font-alkatra select-none ${
          onTitleClick ? "pointer-events-auto cursor-text active:scale-[0.98] transition-transform" : "pointer-events-none"
        }`}
        style={{
          ...getStickerTitleStyle(size),
          ...(titleSize ? { fontSize: `${titleSize}px`, lineHeight: `${titleSize}px` } : {}),
          ...(stroke ? { WebkitTextStroke: `${stroke}px #ffffff` } : {}),
        }}
        onClick={onTitleClick}
      >
        <span>
          {displayTitle}
          {isTitleEditing && (
            <span className="ml-[2px] inline-block h-[0.72em] w-[2px] bg-[#232121] align-[-0.08em] animate-cursor-blink-black" />
          )}
        </span>
      </div>
    </div>
  );
};

const ParentSpaceResultCard: React.FC<{ space: SpaceSummary; onClick?: () => void }> = ({ space, onClick }) => (
  <div
    onClick={onClick}
    className="w-full h-[160px] rounded-[24px] bg-white overflow-hidden px-[14px] py-[18px] select-none cursor-pointer active:scale-[0.98] transition-transform"
  >
    <div className="flex items-center gap-[12px]">
      <div className="relative w-[56px] h-[56px] rounded-[8px] bg-neutral-100 overflow-hidden shrink-0">
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
          {space.itemCount} items inside
        </div>
      </div>
    </div>

    {space.subLocations.length > 0 && (
      <div className="-mr-[14px] mt-[24px] flex gap-[10px] overflow-x-auto pr-0 no-scrollbar">
        {space.subLocations.map((sub) => (
          <div
            key={`${space.name}-${sub.name}`}
            className="h-[38px] px-[25px] rounded-full bg-[#232121]/5 flex items-center justify-center text-[14px] font-sans font-medium text-neutral-500 whitespace-nowrap shrink-0"
          >
            {sub.name} ({sub.itemCount} items)
          </div>
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
        <div className="relative w-[56px] h-[56px] rounded-[8px] bg-neutral-100 overflow-hidden shrink-0">
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
            {space.name} ({space.itemCount} items)
          </div>
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
            aria-label="Switch parent location"
            title="Switch parent location"
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
            aria-label="Switch sub-location"
            title="Switch sub-location"
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

const MemorySelectorIcon: React.FC<{ selected: boolean }> = ({ selected }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className="h-6 w-6 shrink-0"
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
}> = ({ isEditing, onEditToggle, onCloseOrCancel }) => (
  <div className="absolute right-0 top-[-52px] z-30 flex items-center gap-[16px]">
    <MemoryActionButton
      label={isEditing ? "Confirm edits" : "Edit card"}
      onClick={onEditToggle}
      className={isEditing ? "!bg-[#232121] text-white" : "bg-white"}
    >
      {isEditing ? (
        <Check className="h-4 w-4 text-white stroke-[3]" />
      ) : (
        <EditPencilIcon />
      )}
    </MemoryActionButton>
    <MemoryActionButton
      label={isEditing ? "Cancel editing" : "Close detail"}
      onClick={onCloseOrCancel}
    >
      {isEditing ? (
        <CancelIcon className="h-4 w-4 text-[#232121]/50" />
      ) : (
        <CloseIcon className="h-4 w-4 text-[#232121]/50" />
      )}
    </MemoryActionButton>
  </div>
);

const RetakePhotoButton: React.FC<{
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label?: string;
}> = ({ onClick, label = "Retake photo" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/60 text-white active:scale-95 transition-transform"
  >
    <CameraIcon className="h-[22px] w-[22px]" />
  </button>
);

const ParentDetailEditIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M4.54301 13.2234C4.57813 13.2234 4.61325 13.2199 4.64837 13.2146L7.60213 12.6966C7.63725 12.6895 7.67062 12.6737 7.6952 12.6474L15.1393 5.2033C15.2078 5.13481 15.2078 5.02418 15.1393 4.95569L12.2207 2.0353C12.1873 2.00194 12.1434 1.98438 12.096 1.98438C12.0486 1.98438 12.0047 2.00194 11.9713 2.0353L4.5272 9.4794C4.50086 9.50574 4.48506 9.53735 4.47803 9.57247L3.95998 12.5262C3.92662 12.7212 3.98633 12.9108 4.12506 13.0495C4.24096 13.1619 4.38672 13.2234 4.54301 13.2234ZM5.72662 10.1608L12.096 3.79316L13.3832 5.08037L7.01384 11.448L5.45267 11.7237L5.72662 10.1608ZM15.4712 14.6985H2.54633C2.2355 14.6985 1.98438 14.9496 1.98438 15.2605V15.8927C1.98438 15.9699 2.04759 16.0332 2.12486 16.0332H15.8927C15.9699 16.0332 16.0332 15.9699 16.0332 15.8927V15.2605C16.0332 14.9499 15.782 14.6985 15.4712 14.6985Z"
      fill="#232121"
    />
  </svg>
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  React.useEffect(() => {
    if (phase !== "capture") {
      stopCamera();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable in this browser. You can still upload a photo.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setCameraError("");
      } catch {
        setCameraError("Could not start the camera. Check browser permissions or upload a photo.");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
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
      <div className="capture-top-prompt absolute top-[calc(max(56px,env(safe-area-inset-top))+36px)] inset-x-6 z-40 flex flex-col items-center pointer-events-none">
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
                aria-label="Upload photo instead"
                title="Upload photo instead"
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
              >
                Cancel
              </button>
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
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
    </motion.div>
  );
};

const MemoryLocationPicker: React.FC<{
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
            <div className="mb-2 px-1 text-[14px] font-sans font-normal tracking-tight text-[#232121]/50">
              Existing Space
            </div>
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
                      <img
                        src={option.imgUrl}
                        alt={option.name}
                        className="h-[60px] w-[60px] shrink-0 rounded-[12px] border-[3px] border-white object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-sans font-semibold text-[#232121]">
                          {option.name}
                        </span>
                        <span className="mt-1 block text-[14px] font-sans text-[#232121]/40">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </span>
                      </span>
                      <MemorySelectorIcon selected={isSelected} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[13px] font-sans text-[#232121]/45">
                No saved spaces yet
              </div>
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
          <p className="mt-3 text-[13px] font-sans leading-relaxed text-[#232121]/55">{message}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 flex-1 rounded-full bg-white text-[#232121]/70 text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="h-12 flex-1 rounded-full bg-[#232121] text-white text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >
              Delete
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const SubLocationListCard: React.FC<{
  space: SubLocationSummary;
  onClick: () => void;
}> = ({ space, onClick }) => {
  const previewItems = space.items.slice(0, 3);
  const remainingItems = Math.max(0, space.itemCount - previewItems.length);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-[160px] rounded-[28px] bg-white px-[14px] py-[18px] text-left select-none active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-[14px]">
        <div className="relative h-[56px] w-[56px] rounded-[9px] overflow-hidden bg-neutral-100 shrink-0">
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
            {space.name}
          </div>
          <div className="mt-[8px] text-[13px] font-sans font-normal text-[#232121]/50 leading-none">
            {space.itemCount} items
          </div>
        </div>
      </div>

      {(previewItems.length > 0 || remainingItems > 0) && (
        <div className="mt-[12px] flex h-[56px] min-h-[56px] items-center gap-[8px] overflow-visible">
          {previewItems.map((item) => (
            <SubLocationItemPreview key={item.id} item={item} />
          ))}
          {remainingItems > 0 && (
            <div className="ml-auto h-[50px] w-[50px] shrink-0 rounded-[16px] bg-[#F3F1EC] flex items-center justify-center text-[18px] font-sans font-bold text-[#232121]/55">
              +{remainingItems}
            </div>
          )}
        </div>
      )}
    </button>
  );
};

const SpaceDetailModal: React.FC<{
  space: SubLocationSummary;
  parentOptions: MemoryParentLocationOption[];
  onClose: () => void;
  onDeleteSpace: () => void;
  onDeleteItems: (itemIds: string[]) => void;
  onUpdateSpaceImage?: (imgUrl: string) => void;
  onSaveSpace: (updates: { parentName: string; subName: string; parentImgUrl?: string; imgUrl?: string }) => void;
}> = ({ space, parentOptions, onClose, onDeleteSpace, onDeleteItems, onUpdateSpaceImage, onSaveSpace }) => {
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
    setIsRetakeCaptureOpen(true);
  };

  const handleRetakeConfirm = (nextUrl: string) => {
    setSpaceImage(nextUrl);
    onUpdateSpaceImage?.(nextUrl);
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
                <span className="mt-[6px] text-[14px]">items</span>
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
                <button
                  type="button"
                  onClick={handleSelectAllSpaceItems}
                  className="flex h-[26px] items-center justify-center rounded-full px-[12px] text-[13px] font-sans font-semibold leading-none active:scale-[0.98]"
                  style={
                    isAllSpaceItemsSelected
                      ? {
                          background:
                            "linear-gradient(to bottom left, rgb(245, 181, 217) 0%, rgb(255, 199, 166) 66%, rgb(161, 235, 217) 100%)",
                          color: "#232121",
                        }
                      : {
                          backgroundColor: "#FFFFFF",
                          color: "rgba(35, 33, 33, 0.5)",
                        }
                  }
                >
                  Select All
                </button>
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
                  aria-label="Delete selected items"
                  title="Delete selected items"
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
                  className={`relative z-20 block h-[74px] w-[74px] border-0 bg-transparent p-0 rounded-[12px] ${isEditingItems ? "cursor-pointer pointer-events-auto" : "cursor-default"}`}
                  onPointerDown={(event) => {
                    if (isEditingItems) event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isEditingItems) return;
                    toggleItemSelection(item.id);
                  }}
                >
                  <ItemSticker item={item} size={74} stroke={3} />
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
              {helperText}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteRequest("space");
              }}
              aria-label="Delete sub-location"
              title="Delete sub-location"
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
          <LocationRetakeCapture
            initialImage={spaceImage}
            onCancel={() => setIsRetakeCaptureOpen(false)}
            onConfirm={handleRetakeConfirm}
            titleText="Retake this little home."
            promptText="Use this sub-location photo?"
            confirmText="Confirm sub-location photo"
            captureLabel="Capture sub-location photo"
            previewLabel="Retake sub-location photo"
          />
        )}
      </AnimatePresence>

      <MemoryConfirmModal
        open={deleteRequest !== null}
        title={deleteRequest === "items" ? "Delete selected items?" : `Delete ${space.name}?`}
        message={deleteRequest === "items"
          ? "This will permanently remove the selected items from this sub-location."
          : "This will delete the sub-location and all items inside it."}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />
    </motion.div>
  );
};

const MemoryDetailModal: React.FC<{
  item: MemoryItem;
  parentOptions: MemoryParentLocationOption[];
  subOptions: MemorySubLocationOption[];
  onClose: () => void;
  onDelete: () => void;
  onSave: (updates: Partial<MemoryItem>) => void;
}> = ({ item, parentOptions, subOptions, onClose, onDelete, onSave }) => {
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
  const [parentLocationImg, setParentLocationImg] = React.useState(item.parentLocationImg || "");
  const [subLocationImg, setSubLocationImg] = React.useState(item.subLocationImg || "");
  const [subLocationHighlight, setSubLocationHighlight] = React.useState(item.subLocationHighlight || { x: 70, y: 62 });
  const [locationPickerField, setLocationPickerField] = React.useState<MemoryLocationField | null>(null);
  const modalScale = useDetailModalScale();
  const editRestoreValueRef = React.useRef("");
  const pinchStartDistanceRef = React.useRef<number | null>(null);
  const locationPhotoRef = React.useRef<HTMLDivElement>(null);
  const isDraggingHighlightRef = React.useRef(false);
  const didDragHighlightRef = React.useRef(false);
  const locationImage = locationView === "sub"
    ? subLocationImg || parentLocationImg
    : parentLocationImg || subLocationImg;
  const fallbackLocationImage =
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=700&auto=format&fit=crop&q=80";
  const locationLabel = locationView === "sub" ? subLocationName : parentLocationName;
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
      });
      setIsCategorySelectorOpen(false);
      setLocationPickerField(null);
      setIsCardEditing(false);
      return;
    }
    setIsCardEditing(true);
  };

  const handleCardDeleteOrCancel = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCardEditing) {
      setItemTitle(item.name || "Item");
      setSelectedCategory(item.category || "Others");
      setParentLocationName(item.parentLocationName || "Main Bedroom");
      setSubLocationName(item.subLocationName || "Nightstand");
      setParentLocationImg(item.parentLocationImg || "");
      setSubLocationImg(item.subLocationImg || "");
      setSubLocationHighlight(item.subLocationHighlight || { x: 70, y: 62 });
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

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    pinchStartDistanceRef.current = getTouchDistance(event.touches);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const start = pinchStartDistanceRef.current;
    const current = getTouchDistance(event.touches);
    if (!start || !current) return;
    const delta = current - start;
    if (Math.abs(delta) < 34) return;
    setLocationView(delta < 0 ? "parent" : "sub");
    pinchStartDistanceRef.current = current;
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
              isEditing={isCardEditing}
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

        <motion.div
          className="relative w-full h-[586px] cursor-pointer"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 210, damping: 26 }}
          style={{ transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d", willChange: "transform" }}
          onClick={(event) => {
            if (didDragHighlightRef.current) {
              event.preventDefault();
              event.stopPropagation();
              didDragHighlightRef.current = false;
              return;
            }
            setIsFlipped((current) => !current);
          }}
        >
          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-visible px-[22px] pt-[82px] pb-[34px] flex flex-col items-center"
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
            <div className="absolute inset-0 z-[1] overflow-hidden rounded-[24px] pointer-events-none">
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

            <div className="relative z-10 w-[263px] h-[270px] flex items-center justify-center">
              <div className="relative z-10">
                <ItemSticker
                  item={item}
                  size={196}
                  title={itemTitle}
                  onTitleClick={isCardEditing && !isFlipped ? handleEditStart("title") : undefined}
                  isTitleEditing={isCardEditing && !isFlipped && editingField === "title"}
                />
                {isCardEditing && !isFlipped && (
                  <button
                    type="button"
                    onClick={handleEditStart("title")}
                    className="absolute bottom-[34px] right-[-10px] z-30 flex h-[24px] w-[24px] items-center justify-center active:scale-95"
                    aria-label="Edit item title"
                    title="Edit item title"
                  >
                    <EditPencilIcon />
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
                          {category}
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
                  {selectedCategory || "Other"}
                </span>
                {isCardEditing && <TagSwitchIcon />}
              </button>
              <div className="text-[14px] font-sans font-normal text-[#8B8780] tracking-tight">
                Built {item.date || "Today"}
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
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[14px] pt-[14px] pb-[26px] flex flex-col"
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
              className="relative z-10 w-full h-[444px] rounded-[20px] overflow-hidden bg-neutral-200 shrink-0"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
            >
              <SkeletonImage
                src={locationImage || fallbackLocationImage}
                alt={locationLabel || "Location"}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                loading="eager"
              />
              {locationView === "sub" && (
                <div
                  className={`absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
                    isCardEditing ? "pointer-events-auto cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"
                  }`}
                  style={{
                    left: `${subLocationHighlight.x}%`,
                    top: `${subLocationHighlight.y}%`,
                  }}
                  onPointerDown={handleHighlightPointerDown}
                  onPointerMove={handleHighlightPointerMove}
                  onPointerUp={handleHighlightPointerEnd}
                  onPointerCancel={handleHighlightPointerEnd}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    didDragHighlightRef.current = false;
                  }}
                >
                  <img
                    src={LIGHTSPOT_IMAGE_URL}
                    alt=""
                    aria-hidden="true"
                    className="block h-[84px] w-[84px] object-contain animate-pulse"
                  />
                </div>
              )}
              <div className="absolute left-3 top-3 h-8 px-3 rounded-full bg-black/45 text-white text-[12px] font-sans font-semibold flex items-center backdrop-blur-md">
                {locationView === "sub"
                  ? editingField === "sub"
                    ? subLocationName
                    : subLocationName || "Sub location"
                  : editingField === "parent"
                    ? parentLocationName
                    : parentLocationName || "Parent room"}
              </div>
              <button
                type="button"
                className="absolute bottom-[4px] left-[4px] z-20 flex h-[44px] w-[44px] items-center justify-center text-white active:scale-95 transition-transform"
                onClick={(event) => {
                  event.stopPropagation();
                  setLocationView((current) => (current === "sub" ? "parent" : "sub"));
                }}
                aria-label={locationView === "sub" ? "Show parent location" : "Show sub-location"}
                title={locationView === "sub" ? "Show parent location" : "Show sub-location"}
              >
                {locationView === "sub" ? (
                  <ExpandLocationIcon className="h-6 w-6 text-white" />
                ) : (
                  <CollapseLocationIcon className="h-6 w-6 text-white" />
                )}
              </button>
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
          </div>

          <div className="absolute left-0 top-[614px] z-10 h-[56px] w-[307px] flex items-center justify-center">
            <div className="text-center text-white text-[18px] leading-[1.25] font-sans font-bold tracking-tight max-w-[230px]">
              {helperText}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              aria-label="Delete item"
              title="Delete item"
              className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white active:scale-95 transition-transform"
            >
              <DeleteActionIcon color="#FFFFFF" opacity={1} size={20} />
            </button>
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

      <MemoryConfirmModal
        open={isDeleteConfirmOpen}
        title={`Delete ${itemTitle || item.name}?`}
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
  isAuthenticated = false,
  onRequireAuth,
  onLogin,
}) => {
  const [activeTab, setActiveTab] = useState<"spaces" | "items">("spaces");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isMemoryKeyboardOpen, setIsMemoryKeyboardOpen] = useState<boolean>(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<MemoryItem | null>(null);
  const [selectedParentSpace, setSelectedParentSpace] = useState<SpaceSummary | null>(null);
  const [selectedSpaceDetail, setSelectedSpaceDetail] = useState<SubLocationSummary | null>(null);
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

  if (!isOpen) return null;

  // Grouping by Spaces (Parent Locations)
  const spacesMap: { [key: string]: MemoryItem[] } = {};
  memories.forEach((item) => {
    const parent = item.parentLocationName || "Bedroom";
    if (!spacesMap[parent]) {
      spacesMap[parent] = [];
    }
    spacesMap[parent].push(item);
  });

  const spacesList = Object.keys(spacesMap).map((parentName) => {
    const spaceItems = spacesMap[parentName];
    // Find the first available parent image or fallback
    const parentImg =
      spaceItems.find((itm) => itm.parentLocationImg)?.parentLocationImg ||
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80";

    const subLocations = Array.from(
      spaceItems.reduce((map, item) => {
        if (!item.subLocationName) return map;
        const current = map.get(item.subLocationName) || 0;
        map.set(item.subLocationName, current + 1);
        return map;
      }, new Map<string, number>())
    ).map(([name, itemCount]) => ({ name, itemCount }));

    return {
      name: parentName,
      imgUrl: parentImg,
      itemCount: spaceItems.length,
      subLocations,
      items: spaceItems,
    };
  });

  const subLocationMap = memories.reduce((map, item) => {
      const subName = item.subLocationName || "Storage Spot";
      const parentName = item.parentLocationName || "Bedroom";
      const key = `${parentName}::${subName}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        existing.itemCount += 1;
        if (!existing.imgUrl && item.subLocationImg) existing.imgUrl = item.subLocationImg;
        if (!existing.subLocationHighlight && item.subLocationHighlight) {
          existing.subLocationHighlight = item.subLocationHighlight;
        }
        return map;
      }

      map.set(key, {
        name: subName,
        parentName,
        imgUrl: item.subLocationImg || "",
        parentImgUrl:
          item.parentLocationImg ||
          "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
        itemCount: 1,
        items: [item],
        subLocationHighlight: item.subLocationHighlight,
      });
      return map;
    }, new Map<string, SubLocationSummary>());
  const subLocationList: SubLocationSummary[] = Array.from(subLocationMap.values());

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
  const memoryParentLocationOptions: MemoryParentLocationOption[] = spacesList.map((space) => ({
    key: space.name,
    name: space.name,
    imgUrl: space.imgUrl,
    itemCount: space.itemCount,
  }));
  const memorySubLocationOptions: MemorySubLocationOption[] = subLocationList.map((space) => ({
    key: `${space.parentName}::${space.name}`,
    name: space.name,
    parentName: space.parentName,
    imgUrl: space.imgUrl || space.parentImgUrl,
    parentImgUrl: space.parentImgUrl,
    itemCount: space.itemCount,
    subLocationHighlight: space.subLocationHighlight,
  }));
  const filteredItemIds = filteredItems.map((item) => item.id);
  const hasSelectedItems = selectedItemsListIds.length > 0;
  const isAllFilteredSelected = filteredItemIds.length > 0 && filteredItemIds.every((id) => selectedItemsListIds.includes(id));

  // Helper to split Space Cards into 2 Columns for Waterfall View
  const col1: typeof spacesList = [];
  const col2: typeof spacesList = [];
  spacesList.forEach((space, idx) => {
    if (idx % 2 === 0) col1.push(space);
    else col2.push(space);
  });

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
    setIsEditingParentName(false);
    setIsEditingItemsList(false);
    setSelectedItemsListIds([]);
    setSearchQuery("");
    setIsSearchOpen(true);
    setIsMemoryKeyboardOpen(true);
  };

  const openDetail = (item?: MemoryItem) => {
    if (!item) return;
    setIsMemoryKeyboardOpen(false);
    setSelectedDetailItem(item);
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
    setSelectedParentSpace(space);
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
    setSelectedSpaceDetail(space);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: 0,
        transition: { duration: 0.12, ease: "linear" },
      }}
      transition={{
        type: "tween",
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="absolute inset-0 bg-[#E9E6E1] z-[120] flex flex-col overflow-hidden select-none"
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
        <div
          className="memory-header-nav w-full pb-0 px-[20px] flex items-center justify-between bg-transparent shrink-0 z-50 select-none"
          style={{
            height: "calc(var(--noma-statusbar-height) + 56px)",
            minHeight: "calc(var(--noma-statusbar-height) + 56px)",
            paddingTop: "var(--noma-statusbar-height)",
          }}
        >
          <button
            onClick={() => {
              cancelParentEdit();
              setSelectedParentSpace(null);
            }}
            className="w-[24px] h-[24px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.74009 17.5658L1.55258 11.4079L7.74009 5.25M1.55258 11.4079H16.4064C19.9661 11.4079 22.5175 14.8418 21.4901 18.25" stroke="black" strokeWidth="2.14584" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

          {isEditingParentName ? (
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
            <button
              onClick={startParentEdit}
              className="w-[24px] h-[24px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
              aria-label="Edit parent location"
              title="Edit parent location"
            >
              <ParentDetailEditIcon />
            </button>
          )}
        </div>
      ) : isSearchOpen ? (
        <div
          className="w-full px-[16px] bg-transparent shrink-0 z-50 select-none"
          style={{
            height: "calc(var(--noma-statusbar-height) + 89px)",
            paddingTop: "calc(var(--noma-statusbar-height) + 15px)",
          }}
        >
          <div className="flex items-center gap-[12px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "tween", duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={() => setIsMemoryKeyboardOpen(true)}
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
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="memory-header-nav w-full pb-0 px-[20px] flex items-center justify-between bg-transparent shrink-0 z-50 select-none"
          style={{
            height: "calc(var(--noma-statusbar-height) + 56px)",
            paddingTop: "var(--noma-statusbar-height)",
          }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-[24px] h-[24px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.74009 17.5658L1.55258 11.4079L7.74009 5.25M1.55258 11.4079H16.4064C19.9661 11.4079 22.5175 14.8418 21.4901 18.25" stroke="black" strokeWidth="2.14584" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="text-[24px] text-[#232121] tracking-tight leading-none font-sans font-bold" style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
              Memory
            </span>
          </div>

          <button
            onPointerDown={openMemorySearch}
            onClick={openMemorySearch}
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
          </button>
        </div>
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
        {!memories.length ? (
          <div className="flex h-full flex-col items-center justify-center px-8 pb-20 text-center text-[#232121]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70 text-[27px]">✦</div>
            <p className="mt-5 text-[16px] font-semibold">{isAuthenticated ? "暂无内容" : "暂无内容，请登录查看更多"}</p>
            <p className="mt-2 max-w-[250px] text-[13px] leading-5 text-[#232121]/45">
              {isAuthenticated ? "拍照添加你的第一个物品，开始建立专属记忆库。" : "登录后，你的物品和空间会安全保存在自己的记忆库中。"}
            </p>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={onLogin}
                className="mt-6 flex h-10 min-w-[96px] items-center justify-center rounded-full bg-[#232121] px-5 text-[14px] font-semibold text-white active:scale-95"
              >
                登录
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
                <motion.img
                  src={parentHeroImage}
                  alt={selectedParentSpace.name}
                  className={`relative z-10 rounded-[26px] border-[3px] border-white object-cover ${
                    isEditingParentName ? "shadow-none" : "shadow-[0_16px_32px_rgba(35,33,33,0.12)]"
                  }`}
                  referrerPolicy="no-referrer"
                  animate={{
                    width: isEditingParentName ? 228 : 114,
                    height: isEditingParentName ? 228 : 114,
                    rotate: isEditingParentName ? 0 : -9,
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                />
                {isEditingParentName && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <RetakePhotoButton
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsMemoryKeyboardOpen(false);
                        setIsParentRetakeCaptureOpen(true);
                      }}
                      label="Retake parent photo"
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
                  <span>Delete</span>
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
                <div className="py-20 text-center text-[14px] font-sans font-medium text-[#232121]/35">
                  No sub-locations yet
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : isSearchOpen ? (
          <div className="px-0 pt-0 select-none">
            <div className="flex flex-col gap-[20px]">
              {itemSearchResults.length > 0 && (
                <section className="pb-[20px]">
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">Items</h2>
                  <div className="mx-auto mt-[20px] grid w-full max-w-[352px] grid-cols-[repeat(3,100px)] justify-center gap-[26px] overflow-visible">
                    {itemSearchResults.map((item) => (
                      <MemorySearchItem key={item.id} item={item} size={100} onClick={() => openDetail(item)} />
                    ))}
                  </div>
                </section>
              )}

              {childSpaceSearchResults.length > 0 && (
                <section>
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">Sub-Spaces</h2>
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
                  <h2 className="text-[18px] font-sans font-semibold leading-none text-[#232121]">Space</h2>
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
        <div className="sticky top-0 z-40 -mx-[20px] mb-5 flex h-[32px] gap-8 items-center px-[21px] py-0 select-none">
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
            >
              Spaces
            </span>
            {activeTab === "spaces" && (
              <MemorySelectedTabLine />
            )}
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
            >
              Items
            </span>
            {activeTab === "items" && (
              <MemorySelectedTabLine />
            )}
          </div>
        </div>

        {/* Render Tab Contents */}
        {activeTab === "spaces" ? (
          /* Spaces: Column-based Waterfall Flow Layout */
          <div className="mt-0 flex gap-[8px] items-start select-none">
            {/* Column 1 */}
            <div className="flex-1 flex flex-col gap-[8px]">
              {col1.map((space) => (
                <div
                  key={space.name}
                  onClick={() => openParentSpace(space)}
                  className="bg-white rounded-[12px] p-[8px] pb-3 hover:shadow-[0_4px_12px_rgba(35,33,33,0.08)] active:scale-[0.98] transition-[transform,box-shadow] flex flex-col overflow-hidden select-none"
                >
                  {/* Space Parent Image with exact 4:5 aspect */}
                  <div className="relative rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <SkeletonImage
                      src={space.imgUrl}
                      alt={space.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Title & Info */}
                  <div className="mt-2.5 px-1 flex flex-col">
                    <div className="flex items-start text-[#232121]">
                      <span className="text-[14px] mt-[1.5px] mr-1 select-none shrink-0">📍</span>
                      <div className="flex flex-col">
                        <span className="font-sans font-bold text-[14px] tracking-tight leading-snug">
                          {space.name}
                        </span>
                        <span className="text-[11px] font-sans font-semibold text-neutral-400/80 mt-0.5 tracking-tight">
                          {space.itemCount} items
                        </span>
                      </div>
                    </div>

                    {/* Sub-location Tags (truncated intelligently, max 2 rows) */}
                    {space.subLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 pl-0">
                        {space.subLocations.slice(0, 3).map((sub, sidx) => (
                          <div
                            key={`${sub.name}-${sidx}`}
                            className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap"
                          >
                            {sub.name}
                          </div>
                        ))}
                        {space.subLocations.length > 3 && (
                          <div className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap">
                            +{space.subLocations.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Column 2 */}
            <div className="flex-1 flex flex-col gap-[8px]">
              {col2.map((space) => (
                <div
                  key={space.name}
                  onClick={() => openParentSpace(space)}
                  className="bg-white rounded-[12px] p-[8px] pb-3 hover:shadow-[0_4px_12px_rgba(35,33,33,0.08)] active:scale-[0.98] transition-[transform,box-shadow] flex flex-col overflow-hidden select-none"
                >
                  {/* Space Parent Image with exact 4:5 aspect */}
                  <div className="relative rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <SkeletonImage
                      src={space.imgUrl}
                      alt={space.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Title & Info */}
                  <div className="mt-2.5 px-1 flex flex-col">
                    <div className="flex items-start text-[#232121]">
                      <span className="text-[14px] mt-[1.5px] mr-1 select-none shrink-0">📍</span>
                      <div className="flex flex-col">
                        <span className="font-sans font-bold text-[14px] tracking-tight leading-snug">
                          {space.name}
                        </span>
                        <span className="text-[11px] font-sans font-semibold text-neutral-400/80 mt-0.5 tracking-tight">
                          {space.itemCount} items
                        </span>
                      </div>
                    </div>

                    {/* Sub-location Tags (truncated intelligently, max 2 rows) */}
                    {space.subLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 pl-0">
                        {space.subLocations.slice(0, 3).map((sub, sidx) => (
                          <div
                            key={`${sub.name}-${sidx}`}
                            className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap"
                          >
                            {sub.name}
                          </div>
                        ))}
                        {space.subLocations.length > 3 && (
                          <div className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap">
                            +{space.subLocations.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 2x2 Grid of Items */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 font-sans font-medium text-xs">
                No items found in this category.
              </div>
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
                      openDetail(item);
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
                      📍 {item.parentLocationName || "Bedroom"}
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
        </>
        )}
      </div>

      <AnimatePresence>
        {activeTab === "items" && isEditingItemsList && !isSearchOpen && (
          <motion.div
            key="memory-items-edit-bubble"
            className="pointer-events-none absolute bottom-[18px] left-1/2 z-[140] -translate-x-1/2"
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <div className="pointer-events-auto inline-flex h-[64px] items-center gap-[10px] rounded-full border border-white/35 bg-[#E9E6E1]/50 px-[18px] shadow-[0_12px_34px_rgba(0,0,0,0.16)] backdrop-blur-xl">
              <button
                type="button"
                onClick={handleItemsListSelectAll}
                className="flex h-[34px] w-auto min-w-0 items-center justify-center rounded-full px-[12px] text-[13px] font-sans font-semibold leading-none active:scale-[0.98]"
                style={
                  isAllFilteredSelected
                    ? {
                        background:
                          "linear-gradient(to bottom left, rgb(245, 181, 217) 0%, rgb(255, 199, 166) 66%, rgb(161, 235, 217) 100%)",
                        color: "#232121",
                      }
                    : {
                        backgroundColor: "#FFFFFF",
                        color: "rgba(35, 33, 33, 0.5)",
                    }
                }
              >
                Select All
              </button>
              <button
                type="button"
                onClick={requestDeleteSelectedItems}
                disabled={!hasSelectedItems}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full active:scale-[0.98] disabled:cursor-default"
                style={{
                  backgroundColor: hasSelectedItems ? "#ED435F" : "#FFFFFF",
                }}
                aria-label="Delete selected items"
                title="Delete selected items"
              >
                <DeleteActionIcon
                  color={hasSelectedItems ? "#FFFFFF" : "#232121"}
                  opacity={hasSelectedItems ? 1 : 0.5}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingItemsList(false);
                  setSelectedItemsListIds([]);
                }}
                className="flex h-[34px] w-[16px] shrink-0 items-center justify-center rounded-full active:scale-[0.98]"
                aria-label="Cancel editing"
                title="Cancel editing"
              >
                <CloseIcon className="h-4 w-4 text-[#232121]/50" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedParentSpace && isParentRetakeCaptureOpen && (
          <LocationRetakeCapture
            initialImage={parentImageDraft || selectedParentSpace.imgUrl}
            onCancel={() => setIsParentRetakeCaptureOpen(false)}
            onConfirm={handleParentRetakeConfirm}
            titleText="Retake this parent space."
            promptText="Use this parent photo?"
            confirmText="Confirm parent photo"
            captureLabel="Capture parent photo"
            previewLabel="Retake parent photo"
          />
        )}
      </AnimatePresence>

      {/* 综合设置面板 */}
      <AnimatePresence>
        {selectedDetailItem && (
          <MemoryDetailModal
            item={selectedDetailItem}
            parentOptions={memoryParentLocationOptions}
            subOptions={memorySubLocationOptions}
            onClose={() => setSelectedDetailItem(null)}
            onDelete={deleteSelectedDetailItem}
            onSave={saveSelectedDetailItem}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSpaceDetail && (
          <SpaceDetailModal
            space={selectedSpaceDetail}
            parentOptions={memoryParentLocationOptions}
            onClose={() => setSelectedSpaceDetail(null)}
            onDeleteSpace={deleteSubLocation}
            onDeleteItems={deleteSubLocationItems}
            onUpdateSpaceImage={updateSelectedSpaceImage}
            onSaveSpace={saveSelectedSpaceDetail}
          />
        )}
      </AnimatePresence>

      <MemoryConfirmModal
        open={pendingDeleteParentName !== null}
        title={`Delete ${pendingDeleteParentName || "parent location"}?`}
        message="This will delete the parent location, all sub-locations, and every item inside it."
        onCancel={() => setPendingDeleteParentName(null)}
        onConfirm={confirmDeleteParentSpace}
      />

      <MemoryConfirmModal
        open={pendingDeleteItemIds !== null}
        title="Delete selected items?"
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
