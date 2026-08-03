import React, { useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VirtualKeyboard } from "./VirtualKeyboard";
import lightspotImage from "../assets/images/lightspot.png";
import { getStickerTitleStyle } from "./StickerTitle";

const COLOR_BLUR_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/colorblur.png";
const MATRIX_DOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png";
const DETAIL_CATEGORIES = ["Electronics", "Apparel", "Docs", "Housewares", "Others"];
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
}

interface MemoryListProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  onMemoriesChange: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
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
}> = ({
  item,
  size = 210,
  title,
  titleSize,
  stroke,
  alignLeft = false,
  onTitleClick,
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
        {displayTitle}
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
      <div className="w-[56px] h-[56px] rounded-[8px] bg-neutral-100 overflow-hidden shrink-0">
        <img
          src={space.imgUrl}
          alt={space.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
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
        <div className="w-[56px] h-[56px] rounded-[8px] bg-neutral-100 overflow-hidden shrink-0">
          {space.imgUrl ? (
            <img
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

const StaticLocationTextGroup: React.FC<{
  parentName: string;
  subName: string;
  className?: string;
  textMaxWidth?: number;
}> = ({ parentName, subName, className = "", textMaxWidth = 244 }) => (
  <div className={`text-left overflow-visible ${className}`}>
    <div
      className="relative block text-left text-[22px] font-sans font-semibold text-[#232121] tracking-tight leading-tight"
      style={{ maxWidth: `${textMaxWidth}px` }}
    >
      <span
        className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-[18px] leading-none"
        aria-hidden="true"
      >
        📍
      </span>
      <span className="block truncate">{parentName || "Main Bedroom"}</span>
    </div>
    <div
      className="mt-[2px] block text-left text-[18px] font-sans font-normal text-[#232121]/50 leading-tight truncate"
      style={{ maxWidth: `${textMaxWidth}px` }}
    >
      {subName || "Nightstand"}
    </div>
  </div>
);

const EditActionIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4.54301 13.2234C4.57813 13.2234 4.61325 13.2199 4.64837 13.2146L7.60213 12.6966C7.63725 12.6895 7.67062 12.6737 7.6952 12.6474L15.1393 5.2033C15.2078 5.13481 15.2078 5.02418 15.1393 4.95569L12.2207 2.0353C12.1873 2.00194 12.1434 1.98438 12.096 1.98438C12.0486 1.98438 12.0047 2.00194 11.9713 2.0353L4.5272 9.4794C4.50086 9.50574 4.48506 9.53735 4.47803 9.57247L3.95998 12.5262C3.92662 12.7212 3.98633 12.9108 4.12506 13.0495C4.24096 13.1619 4.38672 13.2234 4.54301 13.2234ZM5.72662 10.1608L12.096 3.79316L13.3832 5.08037L7.01384 11.448L5.45267 11.7237L5.72662 10.1608ZM15.4712 14.6985H2.54633C2.2355 14.6985 1.98438 14.9496 1.98438 15.2605V15.8927C1.98438 15.9699 2.04759 16.0332 2.12486 16.0332H15.8927C15.9699 16.0332 16.0332 15.9699 16.0332 15.8927V15.2605C16.0332 14.9496 15.782 14.6985 15.4712 14.6985Z" fill="#232121" fillOpacity="0.5" />
  </svg>
);

const DeleteActionIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16.2193 4.40684H12.9375V3.75117C12.9375 2.30098 11.7615 1.125 10.3131 1.125H7.68691C6.23848 1.125 5.0625 2.30098 5.0625 3.74941V4.40508H1.78066C1.41855 4.40684 1.125 4.70039 1.125 5.0625C1.125 5.42461 1.41855 5.71816 1.78066 5.71816H3.09375V14.2488C3.09375 15.699 4.26973 16.8732 5.71816 16.8732H12.2801C13.7303 16.8732 14.9045 15.6973 14.9045 14.2488V5.71816H16.2176C16.5797 5.71816 16.8732 5.42461 16.8732 5.0625C16.875 4.70039 16.5814 4.40684 16.2193 4.40684ZM6.37559 3.74941C6.37559 3.0252 6.96269 2.43633 7.68867 2.43633H10.3131C11.0373 2.43633 11.6262 3.02344 11.6262 3.74941V4.40508H6.37559V3.74941ZM13.5932 14.2506C13.5932 14.9748 13.0061 15.5637 12.2801 15.5637H5.71816C4.99394 15.5637 4.40508 14.9766 4.40508 14.2506V5.71816H13.5932V14.2506Z" fill="#232121" fillOpacity="0.5" />
    <path d="M10.9688 7.61328C10.6067 7.61328 10.3131 7.90684 10.3131 8.26895V12.8621C10.3131 13.2242 10.6067 13.5178 10.9688 13.5178C11.3309 13.5178 11.6244 13.2242 11.6244 12.8621V8.26895C11.6244 7.90684 11.3309 7.61328 10.9688 7.61328ZM7.03127 7.61328C6.66916 7.61328 6.37561 7.90684 6.37561 8.26895V12.8621C6.37561 13.2242 6.66916 13.5178 7.03127 13.5178C7.39338 13.5178 7.68694 13.2242 7.68694 12.8621V8.26895C7.68694 7.90684 7.39338 7.61328 7.03127 7.61328Z" fill="#232121" fillOpacity="0.5" />
  </svg>
);

const MemoryActionButton: React.FC<{
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="w-[36px] h-[36px] rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
  >
    {children}
  </button>
);

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
        <div className="h-[56px] w-[56px] rounded-[9px] overflow-hidden bg-neutral-100 shrink-0">
          {space.imgUrl ? (
            <img
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
  onClose: () => void;
  onDeleteSpace: () => void;
  onDeleteItems: (itemIds: string[]) => void;
}> = ({ space, onClose, onDeleteSpace, onDeleteItems }) => {
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [isEditingItems, setIsEditingItems] = React.useState(false);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [deleteRequest, setDeleteRequest] = React.useState<"space" | "items" | null>(null);
  const modalScale = useDetailModalScale();
  const helperText = isFlipped ? "Flip card to see the location" : "Flip card to see all items";

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

  const handleEdit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsEditingItems((current) => !current);
    setSelectedItemIds([]);
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
          <div className="relative z-10 w-[307px] h-[586px]" style={{ perspective: "1200px" }}>
            <div className="absolute right-0 top-[-52px] z-30 flex items-center gap-[8px]">
              {isFlipped && (
                <MemoryActionButton
                  label={isEditingItems ? "Finish selecting items" : "Edit items"}
                  onClick={handleEdit}
                >
                  <EditActionIcon />
                </MemoryActionButton>
              )}
              <MemoryActionButton
                label={isEditingItems && selectedItemIds.length > 0 ? "Delete selected items" : "Delete sub-location"}
                onClick={handleDelete}
              >
                <DeleteActionIcon />
              </MemoryActionButton>
            </div>

            <motion.div
              className="relative w-full h-[586px] cursor-pointer"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 210, damping: 26 }}
              style={{ transformStyle: "preserve-3d" }}
              onClickCapture={(event) => {
                if (!isEditingItems || !(event.target instanceof Element)) return;
                const itemButton = event.target.closest("[data-memory-item-id]") as HTMLElement | null;
                if (!itemButton) return;
                event.stopPropagation();
                const itemId = itemButton.dataset.memoryItemId;
                if (itemId) toggleItemSelection(itemId);
              }}
              onClick={() => {
                if (isEditingItems) return;
                setIsFlipped((current) => !current);
              }}
            >
          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[14px] pt-[14px] pb-[26px]"
            style={{ backfaceVisibility: "hidden" }}
          >
            <MatrixDotBackground />
            <div className="relative z-10 w-full h-[444px] rounded-[20px] overflow-hidden bg-neutral-200">
              {space.imgUrl ? (
                <img
                  src={space.imgUrl}
                  alt={space.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-[#DDDAD5]" aria-label="Sub-location photo unavailable" />
              )}
              <div className="absolute left-[70%] top-[62%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <img
                  src={lightspotImage}
                  alt=""
                  aria-hidden="true"
                  className="block h-[84px] w-[84px] object-contain animate-pulse"
                />
              </div>
            </div>

            <StaticLocationTextGroup
              parentName={space.parentName}
              subName={space.name}
              className="absolute left-[42px] bottom-[36px] z-10"
              textMaxWidth={170}
            />

            <div className="absolute right-[28px] bottom-[36px] h-[44px] min-w-[86px] px-[15px] rounded-[16px] bg-[#DDDAD5] flex items-center justify-center text-[#232121] text-[18px] font-sans font-semibold tracking-tight leading-none whitespace-nowrap">
              {space.itemCount} items
            </div>
          </div>

          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[36px] pt-[82px] pb-[36px]"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <MatrixDotBackground />
            <div className="relative z-10 grid grid-cols-2 justify-items-center gap-x-[28px] gap-y-[34px]">
              {space.items.map((item) => {
                return (
                <button
                  type="button"
                  key={item.id}
                  data-memory-item-id={item.id}
                  className={`relative z-20 block border-0 bg-transparent p-0 rounded-[12px] ${isEditingItems ? "cursor-pointer pointer-events-auto" : "cursor-default"}`}
                  onPointerDown={(event) => {
                    if (isEditingItems) event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isEditingItems) return;
                    toggleItemSelection(item.id);
                  }}
                >
                  <ItemSticker item={item} size={88} stroke={3.5} />
                </button>
                );
              })}
            </div>

            <StaticLocationTextGroup
              parentName={space.parentName}
              subName={space.name}
              className="absolute left-[42px] bottom-[36px] z-10"
              textMaxWidth={190}
            />
            </div>
            </motion.div>

            {isFlipped && isEditingItems && (
              <div className="absolute inset-0 z-50 pointer-events-auto px-[36px] pt-[82px] pb-[36px]">
                <div className="grid grid-cols-2 justify-items-center gap-x-[28px] gap-y-[34px]">
                  {space.items.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <button
                        type="button"
                        key={`selection-${item.id}`}
                        aria-label={`Select ${item.name}`}
                        className="relative h-[88px] w-[88px] border-0 bg-transparent p-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleItemSelection(item.id);
                        }}
                      >
                        <div
                          className={`pointer-events-none absolute right-[-4px] top-[-4px] z-10 flex h-[20px] w-[20px] items-center justify-center rounded-full text-[12px] font-bold ${isSelected ? "bg-[#232121] text-white" : "bg-white text-[#232121]"}`}
                        >
                          {isSelected ? "✓" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="absolute left-0 top-[614px] z-10 h-[56px] w-[307px] flex items-center justify-center">
            <div className="text-center text-white text-[20px] leading-[1.25] font-sans font-bold tracking-tight max-w-[250px]">
              {helperText}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/65 active:scale-95 transition-transform"
            >
              <X className="w-[18px] h-[18px] stroke-[2.4]" />
            </button>
          </div>
        </div>
      </div>

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
  onClose: () => void;
  onDelete: () => void;
}> = ({ item, onClose, onDelete }) => {
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [locationView, setLocationView] = React.useState<"sub" | "parent">("sub");
  const [selectedCategory, setSelectedCategory] = React.useState(item.category || "Others");
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = React.useState(false);
  const [itemTitle, setItemTitle] = React.useState(item.name || "Item");
  const [parentLocationName, setParentLocationName] = React.useState(item.parentLocationName || "Main Bedroom");
  const [subLocationName, setSubLocationName] = React.useState(item.subLocationName || "Nightstand");
  const [editingField, setEditingField] = React.useState<"title" | "parent" | "sub" | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const modalScale = useDetailModalScale();
  const editRestoreValueRef = React.useRef("");
  const pinchStartDistanceRef = React.useRef<number | null>(null);
  const locationImage =
    locationView === "sub"
      ? item.subLocationImg || item.parentLocationImg
      : item.parentLocationImg || item.subLocationImg;
  const fallbackLocationImage =
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=700&auto=format&fit=crop&q=80";
  const locationLabel = locationView === "sub" ? subLocationName : parentLocationName;
  const helperText = isFlipped
    ? locationView === "sub"
      ? "Pinch to see the whole room"
      : "Pinch to zoom back in"
    : "Flip card to see the location";
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

  const handleEditStart = (field: "title" | "parent" | "sub") => (event: React.MouseEvent) => {
    event.stopPropagation();
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

  const handleModalClickCapture = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!editingField || activeEditValue.trim() || target?.closest("[data-detail-keyboard='true']")) return;
    handleEditCancel();
  };

  const LocationTextGroup = ({
    className = "",
    textMaxWidth = 244,
  }: {
    className?: string;
    textMaxWidth?: number;
  }) => {
    const parentDisplayName = editingField === "parent" ? parentLocationName : parentLocationName || "Main Bedroom";
    const subDisplayName = editingField === "sub" ? subLocationName : subLocationName || "Nightstand";
    const parentIsEditing = editingField === "parent";
    const subIsEditing = editingField === "sub";

    return (
    <div className={`text-left overflow-visible ${className}`}>
      <button
        type="button"
        className="relative block text-left text-[22px] font-sans font-semibold text-[#232121] tracking-tight leading-tight active:scale-[0.98] transition-transform"
        style={{ maxWidth: `${textMaxWidth}px` }}
        onClick={handleEditStart("parent")}
      >
        <span
          className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-[18px] leading-none"
          aria-hidden="true"
        >
          📍
        </span>
        <span className="block truncate min-h-[28px]">
          {parentDisplayName}
          {parentIsEditing && (
            <span className="inline-block ml-[2px] w-[2px] h-[23px] bg-[#232121] align-[-3px] animate-cursor-blink-black" />
          )}
        </span>
      </button>
      <button
        type="button"
        className="mt-[2px] block text-left text-[18px] font-sans font-normal text-[#232121]/50 leading-tight truncate active:scale-[0.98] transition-transform"
        style={{ maxWidth: `${textMaxWidth}px` }}
        onClick={handleEditStart("sub")}
      >
        {subDisplayName}
        {subIsEditing && (
          <span className="inline-block ml-[2px] w-[2px] h-[19px] bg-[#232121]/50 align-[-3px] animate-cursor-blink-black" />
        )}
      </button>
    </div>
  );
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
            style={{ perspective: "1200px" }}
          >
            <div className="absolute right-0 top-[-52px] z-30 flex items-center gap-[8px]">
              <MemoryActionButton
                label="Delete item"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsDeleteConfirmOpen(true);
                }}
              >
                <DeleteActionIcon />
              </MemoryActionButton>
            </div>

        <motion.div
          className="relative w-full h-[586px] cursor-pointer"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 210, damping: 26 }}
          style={{ transformStyle: "preserve-3d" }}
          onClick={() => setIsFlipped((current) => !current)}
        >
          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-visible px-[22px] pt-[82px] pb-[34px] flex flex-col items-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <MatrixDotBackground rounded />
            <div className="absolute inset-0 z-[1] overflow-hidden rounded-[24px] pointer-events-none">
              <div className="absolute left-1/2 top-[220px] aspect-square w-full max-w-none -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
                <img
                  src={COLOR_BLUR_IMAGE_URL}
                  alt=""
                  aria-hidden="true"
                  className="block h-full w-full object-contain"
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
                  onTitleClick={handleEditStart("title")}
                />
              </div>
            </div>

            <div className="relative z-10 mt-[6px] h-[70px] flex flex-col items-center gap-[10px]">
              <AnimatePresence>
                {isCategorySelectorOpen &&
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
                className="h-[30px] px-5 rounded-full bg-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsCategorySelectorOpen((current) => !current);
                }}
              >
                <span className="text-[14px] font-sans font-normal text-black/45 tracking-tight leading-none">
                  {selectedCategory || "Other"}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-black/35" />
              </button>
              <div className="text-[14px] font-sans font-normal text-[#8B8780] tracking-tight">
                Built {item.date || "Today"}
              </div>
            </div>

            <LocationTextGroup className="absolute left-[42px] bottom-[36px] z-10" />
          </div>

          <div
            className="absolute inset-0 rounded-[24px] bg-[#E9E6E1] overflow-hidden px-[14px] pt-[14px] pb-[26px] flex flex-col"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <MatrixDotBackground rounded />
            <div
              className="relative z-10 w-full h-[444px] rounded-[20px] overflow-hidden bg-neutral-200 shrink-0"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={locationImage || fallbackLocationImage}
                alt={locationLabel || "Location"}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute left-[70%] top-[62%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <img
                  src={lightspotImage}
                  alt=""
                  aria-hidden="true"
                  className="block h-[84px] w-[84px] object-contain animate-pulse"
                />
              </div>
              <div className="absolute left-3 top-3 h-8 px-3 rounded-full bg-black/45 text-white text-[12px] font-sans font-semibold flex items-center backdrop-blur-md">
                {locationView === "sub"
                  ? editingField === "sub"
                    ? subLocationName
                    : subLocationName || "Sub location"
                  : editingField === "parent"
                    ? parentLocationName
                    : parentLocationName || "Parent room"}
              </div>
            </div>

            <LocationTextGroup className="absolute left-[42px] bottom-[36px] z-10" textMaxWidth={146} />
          </div>
          </motion.div>
          </div>

          <div className="absolute left-0 top-[614px] z-10 h-[56px] w-[307px] flex items-center justify-center">
            <div className="text-center text-white text-[20px] leading-[1.25] font-sans font-bold tracking-tight max-w-[230px]">
              {helperText}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/65 active:scale-95 transition-transform"
            >
              <X className="w-[18px] h-[18px] stroke-[2.4]" />
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
  const [pendingDeleteParentName, setPendingDeleteParentName] = useState<string | null>(null);

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
  };

  const openMemorySearch = () => {
    setSelectedParentSpace(null);
    setSelectedSpaceDetail(null);
    setIsEditingParentName(false);
    setSearchQuery("");
    setIsSearchOpen(true);
    setIsMemoryKeyboardOpen(true);
  };

  const openDetail = (item?: MemoryItem) => {
    if (!item) return;
    setIsMemoryKeyboardOpen(false);
    setSelectedDetailItem(item);
  };

  const deleteSelectedDetailItem = () => {
    if (!selectedDetailItem) return;
    const itemId = selectedDetailItem.id;
    onMemoriesChange((currentMemories) => currentMemories.filter((item) => item.id !== itemId));
    setSelectedDetailItem(null);
  };

  const openParentSpace = (space: SpaceSummary) => {
    setSearchQuery("");
    setIsMemoryKeyboardOpen(false);
    setIsSearchOpen(false);
    setSelectedParentSpace(space);
  };

  const startParentEdit = () => {
    if (!selectedParentSpace) return;
    setParentNameDraft(selectedParentSpace.name);
    setIsEditingParentName(true);
    setIsMemoryKeyboardOpen(true);
  };

  const cancelParentEdit = () => {
    setParentNameDraft(selectedParentSpace?.name || "");
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
            ? { ...item, parentLocationName: nextName }
            : item
        )
      );
      setSelectedParentSpace((current) =>
        current
          ? {
              ...current,
              name: nextName,
              items: current.items.map((item) =>
                item.parentLocationName === previousName
                  ? { ...item, parentLocationName: nextName }
                  : item
              ),
            }
          : current
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
      <img
        src={MATRIX_DOT_IMAGE_URL}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-100 pointer-events-none select-none"
        referrerPolicy="no-referrer"
      />

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

          <button
            onPointerDown={openMemorySearch}
            onClick={openMemorySearch}
            className="w-[22px] h-[22px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
            aria-label="Search memories"
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
            : "calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {selectedParentSpace ? (
          <motion.div
            key={`parent-space-${selectedParentSpace.name}`}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ type: "tween", duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="px-0 select-none"
          >
            <div className="sticky top-0 z-40 -mx-[20px] flex items-center justify-between bg-[#E9E6E1]/90 px-[20px] pb-[20px] pt-[4px] text-[#232121] backdrop-blur-sm">
              <div className="flex items-center min-w-0">
                <span className="text-[20px] mr-[8px] select-none">📍</span>
                <span
                  className="relative text-[24px] font-sans font-extrabold tracking-tight leading-none truncate"
                  onClick={isEditingParentName ? undefined : startParentEdit}
                >
                  {isEditingParentName ? parentNameDraft : selectedParentSpace.name}
                  {isEditingParentName && (
                    <span className="inline-block ml-[3px] w-[2px] h-[25px] bg-[#232121] align-[-3px] animate-cursor-blink-black" />
                  )}
                </span>
              </div>
              <div className="flex items-center gap-[8px] shrink-0">
                <MemoryActionButton label="Edit parent location" onClick={(event) => { event.stopPropagation(); startParentEdit(); }}>
                  <EditActionIcon />
                </MemoryActionButton>
                <MemoryActionButton label="Delete parent location" onClick={(event) => { event.stopPropagation(); deleteParentSpace(); }}>
                  <DeleteActionIcon />
                </MemoryActionButton>
              </div>
            </div>

            <div className="flex flex-col gap-[8px]">
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
            </div>
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
        <div className="sticky top-0 z-40 -mx-[20px] mb-5 flex h-[32px] gap-8 items-center bg-[#E9E6E1]/90 px-[21px] py-0 backdrop-blur-sm select-none">
          {/* Spaces Tab */}
          <div className="relative cursor-pointer" onClick={() => setActiveTab("spaces")}>
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "spaces" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              Spaces
            </span>
            {activeTab === "spaces" && (
              <motion.img
                layoutId="tabSelectedUnderline"
                src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/selected-line.png"
                alt="Selected"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-[62px] h-[17px] object-contain pointer-events-none select-none z-0"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {/* Items Tab */}
          <div className="relative cursor-pointer" onClick={() => setActiveTab("items")}>
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "items" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              Items
            </span>
            {activeTab === "items" && (
              <motion.img
                layoutId="tabSelectedUnderline"
                src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/selected-line.png"
                alt="Selected"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-[62px] h-[17px] object-contain pointer-events-none select-none z-0"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                referrerPolicy="no-referrer"
              />
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
                  <div className="rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <img
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
                  <div className="rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <img
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
                    className={`h-[30px] px-4 py-0 text-[12px] font-sans font-bold rounded-full transition-all shrink-0 cursor-pointer border-0 outline-none ${
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
                    onClick={() => openDetail(item)}
                    className="relative flex flex-col items-center justify-center overflow-visible select-none h-[160px] cursor-pointer hover:scale-105 active:scale-95 transition-all"
                  >
                    <div className="absolute left-0 top-0 z-30 max-w-[calc(100%-8px)] truncate text-[14px] font-sans font-semibold leading-none tracking-tight text-[#232121]">
                      📍 {item.parentLocationName || "Bedroom"}
                    </div>

                    {/* Sticker Display Area - transparent background, centered */}
                    <div className="relative w-full h-full flex items-center justify-start select-none overflow-visible">
                      <ItemSticker item={item} size={120} alignLeft />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* 综合设置面板 */}
      <AnimatePresence>
        {selectedDetailItem && (
          <MemoryDetailModal
            item={selectedDetailItem}
            onClose={() => setSelectedDetailItem(null)}
            onDelete={deleteSelectedDetailItem}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSpaceDetail && (
          <SpaceDetailModal
            space={selectedSpaceDetail}
            onClose={() => setSelectedSpaceDetail(null)}
            onDeleteSpace={deleteSubLocation}
            onDeleteItems={deleteSubLocationItems}
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
