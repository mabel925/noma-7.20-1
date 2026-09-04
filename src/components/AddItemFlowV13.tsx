import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MemoryItem, MemoryLocationField, MemoryParentLocationOption, MemorySubLocationOption } from "./MemoryList";
import { COLOR_BLUR_IMAGE_URL, MatrixDotBackground, MemoryLocationPicker, PriceTag } from "./MemoryList";
import { CameraIcon } from "./CameraIcon";
import { CaptureScanner } from "./CaptureScanner";
import { CancelIcon } from "./CancelIcon";
import { CloseIcon } from "./CloseIcon";
import { RestartIcon } from "./RestartIcon";
import { TagSwitchIcon } from "./TagSwitchIcon";
import { PhotoUploadIcon } from "./PhotoUploadIcon";
import { CaptureShutterButton } from "./CaptureShutterButton";
import { useLayoutGuard } from "../hooks/useLayoutGuard";
import { classifyEmojiText, recognizeImage } from "../services/aiService";
import { classifyEmojiLocally, EMOJI_CATALOG, emojiAsset, type EmojiKind } from "../data/emojiCatalog";
import { getRoundedOutlineShadow, getStickerTitleStyle, isChineseTitle } from "./StickerTitle";

type Stage = "新增物品-默认" | "识别emoji" | "切换emoji" | "新增物品-拍摄模式" | "新增spaces" | "最终结果页";
type Mode = "emoji" | "camera";
type SpaceField = "sub" | "parent";
type DraftEntity = {
  name: string;
  iconKey: string;
  category: string;
  imageUrl?: string;
  emojiImageUrl?: string;
  cameraImageUrl?: string;
  emojiIconKey?: string;
  lastSkinMode?: Mode;
};
type DraftItem = Omit<MemoryItem, "id">;

interface AddItemFlowV13Props {
  isOpen: boolean;
  onClose: () => void;
  existingMemories?: MemoryItem[];
  onItemAdded: (item: DraftItem) => void | Promise<void>;
}

const EMPTY_ITEM: DraftEntity = { name: "", iconKey: "box", category: "家居日用" };
const EMPTY_SUB: DraftEntity = { name: "", iconKey: "box", category: "子级空间" };
const EMPTY_PARENT: DraftEntity = { name: "", iconKey: "home", category: "父级空间" };
const ITEM_CATEGORIES = ["数码用品", "衣物鞋包", "药品健康", "文具办公", "家居日用", "食品厨房", "工具杂物", "爱好运动"];
const CATEGORY_FAN_POSITIONS = [
  { x: -134, y: -248, rotate: -8 },
  { x: 138, y: -196, rotate: 8 },
  { x: -106, y: -76, rotate: -8 },
  { x: 126, y: -104, rotate: 8 },
];

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
  reader.readAsDataURL(file);
});

const entityImage = (entity: DraftEntity) => entity.imageUrl || emojiAsset(entity.iconKey);

const spaceSkinUrl = (entity: DraftEntity, mode: Mode) => mode === "emoji"
  ? entity.emojiImageUrl || (entity.emojiIconKey ? emojiAsset(entity.emojiIconKey) : undefined)
  : entity.cameraImageUrl;

const spaceHasSkin = (entity: DraftEntity, mode: Mode) => Boolean(spaceSkinUrl(entity, mode));

const imageUrlIsPhoto = (imageUrl?: string) => {
  if (!imageUrl) return false;
  try {
    return !new URL(imageUrl, window.location.origin).pathname.startsWith("/emoji/");
  } catch {
    return true;
  }
};

const spaceFallbackSkinUrl = (entity: DraftEntity, mode: Mode) => spaceSkinUrl(entity, mode)
  || spaceSkinUrl(entity, mode === "emoji" ? "camera" : "emoji");

const spaceDisplayMode = (entity: DraftEntity, preferredMode: Mode): Mode | null => {
  if (entity.lastSkinMode && spaceHasSkin(entity, entity.lastSkinMode)) return entity.lastSkinMode;
  if (spaceHasSkin(entity, preferredMode)) return preferredMode;
  const fallbackMode = preferredMode === "emoji" ? "camera" : "emoji";
  return spaceHasSkin(entity, fallbackMode) ? fallbackMode : null;
};

const spaceDisplaySkinUrl = (entity: DraftEntity, preferredMode: Mode) => {
  const displayMode = spaceDisplayMode(entity, preferredMode);
  return displayMode ? spaceSkinUrl(entity, displayMode) : undefined;
};

const clearSpaceSkin = (entity: DraftEntity, mode: Mode): DraftEntity => {
  const next = mode === "emoji"
    ? { ...entity, emojiImageUrl: undefined, emojiIconKey: undefined }
    : { ...entity, cameraImageUrl: undefined };
  const fallbackMode = mode === "emoji" ? "camera" : "emoji";
  return {
    ...next,
    lastSkinMode: spaceHasSkin(next, fallbackMode) ? fallbackMode : undefined,
  };
};

const setSpaceSkin = (entity: DraftEntity, mode: Mode, imageUrl: string, options?: { iconKey?: string }): DraftEntity => mode === "emoji"
  ? { ...entity, emojiImageUrl: imageUrl, emojiIconKey: options?.iconKey, lastSkinMode: mode }
  : { ...entity, cameraImageUrl: imageUrl, lastSkinMode: mode };

const resolveSpaceSkin = (entity: DraftEntity, mode: Mode) => spaceFallbackSkinUrl(entity, mode);

const commitSpaceSkin = (entity: DraftEntity, mode: Mode): DraftEntity => {
  if (spaceHasSkin(entity, mode)) {
    const committed = clearSpaceSkin(entity, mode === "emoji" ? "camera" : "emoji");
    return { ...committed, lastSkinMode: mode };
  }
  const fallbackMode = mode === "emoji" ? "camera" : "emoji";
  return spaceHasSkin(entity, fallbackMode) ? { ...entity, lastSkinMode: fallbackMode } : entity;
};

const emojiOutlineCache = new Map<string, string>();

const generateEmojiOutline = (imageUrl: string): Promise<string> => {
  const cached = emojiOutlineCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const renderScale = 3;
      const size = 250 * renderScale;
      const border = 8 * renderScale;
      const source = document.createElement("canvas");
      const sourceContext = source.getContext("2d");
      const outline = document.createElement("canvas");
      const outlineContext = outline.getContext("2d");
      source.width = outline.width = size;
      source.height = outline.height = size;
      if (!sourceContext || !outlineContext) {
        resolve("");
        return;
      }

      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (size - width) / 2;
      const y = (size - height) / 2;
      sourceContext.drawImage(image, x, y, width, height);

      const sourcePixels = sourceContext.getImageData(0, 0, size, size);
      for (let index = 3; index < sourcePixels.data.length; index += 4) {
        sourcePixels.data[index] = sourcePixels.data[index] >= 96 ? 255 : 0;
      }
      sourceContext.putImageData(sourcePixels, 0, 0);

      outlineContext.save();
      for (let angle = 0; angle < 360; angle += 1) {
        const radians = angle * Math.PI / 180;
        outlineContext.drawImage(source, Math.cos(radians) * border, Math.sin(radians) * border);
      }
      outlineContext.globalCompositeOperation = "source-in";
      outlineContext.fillStyle = "#fff";
      outlineContext.fillRect(0, 0, size, size);
      outlineContext.restore();
      outlineContext.globalCompositeOperation = "destination-out";
      outlineContext.drawImage(source, 0, 0);

      const result = outline.toDataURL("image/png");
      emojiOutlineCache.set(imageUrl, result);
      resolve(result);
    };
    image.onerror = () => resolve("");
    image.src = imageUrl;
  });
};

const ModeSwitch = ({ mode, onChange, onClose, hidden = false }: { mode: Mode; onChange: (mode: Mode) => void; onClose: () => void; hidden?: boolean }) => (
  <div className={`noma-add-modebar${hidden ? " is-keyboard-hidden" : ""}`}>
    <div className="noma-add-segmented" role="tablist" aria-label="Capture mode">
      <button type="button" role="tab" aria-selected={mode === "emoji"} className={mode === "emoji" ? "is-active" : ""} onClick={() => onChange("emoji")}>
        <span aria-hidden="true">🦄</span><span>Emoji Mode</span>
      </button>
      <button type="button" role="tab" aria-selected={mode === "camera"} className={mode === "camera" ? "is-active" : ""} onClick={() => onChange("camera")}>
        <CameraIcon className="h-7 w-7" /><span>Camera</span>
      </button>
    </div>
    <button type="button" className="noma-add-top-close" onClick={onClose} aria-label="Close"><CloseIcon className="h-4 w-4" /></button>
  </div>
);

const RoundActions = ({ onRestart, onConfirm, onCancel, disabled = false, loading = false, reveal = false }: {
  onRestart: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  loading?: boolean;
  reveal?: boolean;
}) => (
  <div className={`noma-add-round-actions${reveal ? " is-revealing" : ""}${onCancel ? " is-three" : ""}`}>
    <button type="button" className="noma-add-round-button is-restart" onClick={onRestart} aria-label="Restart"><RestartIcon className="h-7 w-7" /></button>
    <button type="button" className="noma-add-round-button is-confirm" onClick={onConfirm} disabled={disabled} aria-label="Confirm">
      {loading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Check className="h-7 w-7" strokeWidth={2.2} />}
    </button>
    {onCancel && <button type="button" className="noma-add-round-button" onClick={onCancel} aria-label="Cancel"><CloseIcon className="h-6 w-6" /></button>}
  </div>
);

const CategoryFan = ({ open, current, onSelect }: { open: boolean; current: string; onSelect: (category: string) => void }) => (
  <AnimatePresence>
    {open && ITEM_CATEGORIES.filter((category) => category !== current).slice(0, 4).map((category, index) => {
      const position = CATEGORY_FAN_POSITIONS[index];
      return (
        <motion.button
          key={category}
          type="button"
          className="noma-add-category-option"
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
          animate={{ x: position.x, y: position.y, scale: 1, opacity: 1, rotate: position.rotate }}
          exit={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 22, delay: index * 0.03 }}
          onClick={() => onSelect(category)}
        >
          <span>{category}</span>
        </motion.button>
      );
    })}
  </AnimatePresence>
);

const ItemSticker = ({ item, compact = false, onImageClick, onTitleClick, reveal = false }: {
  item: DraftEntity;
  compact?: boolean;
  onImageClick?: () => void;
  onTitleClick?: () => void;
  reveal?: boolean;
}) => {
  const imageUrl = entityImage(item);
  const showEmojiOutline = !item.imageUrl;
  const [emojiOutline, setEmojiOutline] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!showEmojiOutline) {
      setEmojiOutline("");
      return;
    }
    void generateEmojiOutline(imageUrl).then((result) => {
      if (!cancelled) setEmojiOutline(result);
    });
    return () => { cancelled = true; };
  }, [imageUrl, showEmojiOutline]);

  return (
  <div className={compact ? "noma-add-item-sticker is-compact" : "noma-add-item-sticker"}>
    <button type="button" className={`noma-add-emoji-media${reveal ? " is-revealing" : ""}`} onClick={onImageClick} aria-label={onImageClick ? "Change emoji" : undefined} tabIndex={onImageClick ? 0 : -1}>
      {showEmojiOutline && emojiOutline && <img className="noma-add-emoji-outline" src={emojiOutline} alt="" aria-hidden="true" />}
      <img className="noma-add-emoji-image" src={imageUrl} alt="" />
    </button>
    <button
      type="button"
      className={`noma-add-item-title ${isChineseTitle(item.name) ? "font-zihun-biantao" : "font-alkatra"}`}
      style={{ ...getStickerTitleStyle(250), zIndex: 3 }}
      onClick={onTitleClick}
      tabIndex={onTitleClick ? 0 : -1}
      aria-label={onTitleClick ? "Edit item title" : undefined}
    >
      {item.name || "New Item"}
    </button>
  </div>
  );
};

export const AddItemFlowV13: React.FC<AddItemFlowV13Props> = ({ isOpen, onClose, existingMemories = [], onItemAdded }) => {
  useLayoutGuard(isOpen);
  const [stage, setStage] = useState<Stage>("新增物品-默认");
  const [itemMode, setItemMode] = useState<Mode>("emoji");
  const [spaceMode, setSpaceMode] = useState<Mode>("emoji");
  const [item, setItem] = useState<DraftEntity>(EMPTY_ITEM);
  const [subSpace, setSubSpace] = useState<DraftEntity>(EMPTY_SUB);
  const [parentSpace, setParentSpace] = useState<DraftEntity>(EMPTY_PARENT);
  const [activeSpace, setActiveSpace] = useState<SpaceField | null>(null);
  const [spaceInput, setSpaceInput] = useState("");
  const [spaceCameraTarget, setSpaceCameraTarget] = useState<SpaceField>("sub");
  const [spaceCameraActions, setSpaceCameraActions] = useState<"capture" | "review">("capture");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSpaceProcessingSlow, setIsSpaceProcessingSlow] = useState(false);
  const [pressedSpace, setPressedSpace] = useState<SpaceField | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isItemReveal, setIsItemReveal] = useState(false);
  const [isActionReveal, setIsActionReveal] = useState(false);
  const [isSpaceActionReveal, setIsSpaceActionReveal] = useState(false);
  const [isFinalReveal, setIsFinalReveal] = useState(false);
  const [finalTransitionSource, setFinalTransitionSource] = useState<Mode | null>(null);
  const [price, setPrice] = useState("");
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [isEditingItemTitle, setIsEditingItemTitle] = useState(false);
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState(false);
  const [editingFinalSpace, setEditingFinalSpace] = useState<SpaceField | null>(null);
  const [locationPickerField, setLocationPickerField] = useState<MemoryLocationField | null>(null);
  const [parentTitleWidth, setParentTitleWidth] = useState(184);
  const [editingSpace, setEditingSpace] = useState<SpaceField | null>(null);
  const editingSpaceRef = useRef<SpaceField | null>(null);
  const spaceInputBlurTimerRef = useRef<number | null>(null);
  const [stageHeight, setStageHeight] = useState(844);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const itemTitleEditRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const itemCameraInputRef = useRef<HTMLInputElement>(null);
  const spaceCameraInputRef = useRef<HTMLInputElement>(null);
  const spaceRecognitionRequestRef = useRef(0);
  const parentSpaceEditRef = useRef<HTMLInputElement>(null);
  const subSpaceEditRef = useRef<HTMLInputElement>(null);
  const parentSpaceTitleRef = useRef<HTMLElement>(null);
  const finalSpaceEditRestoreRef = useRef("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const hadSpaceInfoRef = useRef(false);
  const spaceActionRevealTimerRef = useRef<number | null>(null);

  const updateEditingSpace = (field: SpaceField | null) => {
    editingSpaceRef.current = field;
    setEditingSpace(field);
  };

  const triggerSpaceActionReveal = () => {
    if (spaceActionRevealTimerRef.current !== null) window.clearTimeout(spaceActionRevealTimerRef.current);
    setIsSpaceActionReveal(false);
    window.requestAnimationFrame(() => {
      setIsSpaceActionReveal(true);
      spaceActionRevealTimerRef.current = window.setTimeout(() => {
        setIsSpaceActionReveal(false);
        spaceActionRevealTimerRef.current = null;
      }, 700);
    });
  };

  const goToFinalResult = () => {
    setParentSpace((current) => commitSpaceSkin(current, spaceMode));
    setSubSpace((current) => commitSpaceSkin(current, spaceMode));
    setFinalTransitionSource(spaceMode);
    setIsFinalReveal(true);
    setStage("最终结果页");
    window.setTimeout(() => setIsFinalReveal(false), 1150);
  };

  const recentSub = useMemo(() => {
    const source = [...existingMemories].reverse().find((memory) => memory.subLocationName?.trim());
    if (!source) return null;
    return {
      name: source.subLocationName.trim(),
      imageUrl: source.subLocationImg,
      parentName: source.parentLocationName?.trim() || "",
      parentImageUrl: source.parentLocationImg,
    };
  }, [existingMemories]);

  const recentParent = useMemo(() => {
    const source = [...existingMemories].reverse().find((memory) => memory.parentLocationName?.trim());
    if (!source) return null;
    return { name: source.parentLocationName.trim(), imageUrl: source.parentLocationImg };
  }, [existingMemories]);

  const parentLocationOptions = useMemo<MemoryParentLocationOption[]>(() => {
    const options = new Map<string, MemoryParentLocationOption>();
    existingMemories.forEach((memory) => {
      const name = memory.parentLocationName?.trim();
      if (!name) return;
      const current = options.get(name);
      if (current) {
        current.itemCount += 1;
        if (!current.imgUrl && memory.parentLocationImg) current.imgUrl = memory.parentLocationImg;
        return;
      }
      const classification = classifyEmojiLocally(name, "parent-space");
      options.set(name, {
        key: name,
        name,
        imgUrl: memory.parentLocationImg || emojiAsset(classification.icon_key),
        itemCount: 1,
      });
    });
    return [...options.values()];
  }, [existingMemories]);

  const subLocationOptions = useMemo<MemorySubLocationOption[]>(() => {
    const options = new Map<string, MemorySubLocationOption>();
    existingMemories.forEach((memory) => {
      const name = memory.subLocationName?.trim();
      if (!name) return;
      const parentName = memory.parentLocationName?.trim() || "";
      const key = `${parentName}::${name}`;
      const current = options.get(key);
      if (current) {
        current.itemCount += 1;
        if (!current.imgUrl && memory.subLocationImg) current.imgUrl = memory.subLocationImg;
        return;
      }
      const classification = classifyEmojiLocally(name, "sub-space");
      options.set(key, {
        key,
        name,
        parentName,
        imgUrl: memory.subLocationImg || emojiAsset(classification.icon_key),
        parentImgUrl: memory.parentLocationImg,
        itemCount: 1,
        subLocationHighlight: memory.subLocationHighlight,
      });
    });
    return [...options.values()];
  }, [existingMemories]);

  useEffect(() => {
    if (!isOpen) return;
    setStage("新增物品-默认");
    setItemMode("emoji");
    setSpaceMode("emoji");
    setItem(EMPTY_ITEM);
    setSubSpace(EMPTY_SUB);
    setParentSpace(EMPTY_PARENT);
    setActiveSpace(null);
    setSpaceInput("");
    setSpaceCameraTarget("sub");
    setSpaceCameraActions("capture");
    setIsRecognizing(false);
    setIsSpaceProcessingSlow(false);
    setPressedSpace(null);
    setIsSaving(false);
    setIsItemReveal(false);
    setIsActionReveal(false);
    setIsSpaceActionReveal(false);
    hadSpaceInfoRef.current = false;
    setIsFinalReveal(false);
    setFinalTransitionSource(null);
    setPrice("");
    setIsEditingPrice(false);
    setIsEditingItemTitle(false);
    setIsCategorySelectorOpen(false);
    setEditingFinalSpace(null);
    setLocationPickerField(null);
    updateEditingSpace(null);
    setStageHeight(Math.min(844, window.innerHeight));
    const timer = window.setTimeout(() => itemInputRef.current?.focus(), 80);
    return () => {
      spaceRecognitionRequestRef.current += 1;
      window.clearTimeout(timer);
      if (spaceInputBlurTimerRef.current !== null) {
        window.clearTimeout(spaceInputBlurTimerRef.current);
        spaceInputBlurTimerRef.current = null;
      }
      if (spaceActionRevealTimerRef.current !== null) {
        window.clearTimeout(spaceActionRevealTimerRef.current);
        spaceActionRevealTimerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const hasAnySpaceInfo = Boolean(parentSpace.name.trim() || spaceHasSkin(parentSpace, "emoji") || spaceHasSkin(parentSpace, "camera") || subSpace.name.trim() || spaceHasSkin(subSpace, "emoji") || spaceHasSkin(subSpace, "camera"));
    if (isOpen && hasAnySpaceInfo && !hadSpaceInfoRef.current) {
      setIsSpaceActionReveal(true);
      const timer = window.setTimeout(() => setIsSpaceActionReveal(false), 700);
      hadSpaceInfoRef.current = true;
      return () => window.clearTimeout(timer);
    }
    hadSpaceInfoRef.current = hasAnySpaceInfo;
  }, [isOpen, parentSpace.name, parentSpace.emojiImageUrl, parentSpace.cameraImageUrl, parentSpace.emojiIconKey, subSpace.name, subSpace.emojiImageUrl, subSpace.cameraImageUrl, subSpace.emojiIconKey]);

  useEffect(() => {
    if (!isItemReveal && !isActionReveal) return;
    const timer = window.setTimeout(() => {
      setIsItemReveal(false);
      setIsActionReveal(false);
    }, 1650);
    return () => window.clearTimeout(timer);
  }, [isItemReveal, isActionReveal]);

  const cameraVisible = isOpen && stage === "新增spaces" && spaceMode === "camera";

  useEffect(() => {
    if (!cameraVisible || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (error) {
        console.warn("[Noma 1.3] Camera preview unavailable; photo picker remains available:", error);
      }
    };
    void start();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraVisible]);

  // The parent and sub-space views use one stream. Rebind it to the newly
  // rendered video element when the capture focus changes without restarting
  // the camera permission flow or causing a preview flash.
  useEffect(() => {
    if (!cameraVisible || !cameraStreamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraVisible, spaceCameraTarget, parentSpace.cameraImageUrl, subSpace.cameraImageUrl]);

  useLayoutEffect(() => {
    const title = parentSpaceTitleRef.current;
    if (!title) return;
    const updateWidth = () => {
      const rectWidth = title.getBoundingClientRect().width;
      const measuredWidth = Math.min(230, Math.max(1, Math.ceil(rectWidth || title.scrollWidth || title.offsetWidth)));
      // Font metrics can settle after the first layout pass. Never replace a
      // useful measurement with the transient 1px fallback.
      if (measuredWidth > 1 || parentTitleWidth <= 1) setParentTitleWidth(measuredWidth);
    };
    updateWidth();
    const frame = window.requestAnimationFrame(updateWidth);
    const timer = window.setTimeout(updateWidth, 120);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWidth);
    observer?.observe(title);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [parentSpace.name, parentTitleWidth]);

  if (!isOpen) return null;

  const identifyText = async (title: string, kind: EmojiKind) => {
    const clean = title.trim();
    if (!clean || isRecognizing) return null;
    setIsRecognizing(true);
    try {
      return await classifyEmojiText(clean, kind);
    } finally {
      setIsRecognizing(false);
    }
  };

  const submitItemTitle = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await identifyText(item.name, "item");
    if (!result) return;
    setItem((current) => ({ ...current, name: result.title, iconKey: result.icon_key, category: result.category }));
    itemInputRef.current?.blur();
    setIsActionReveal(false);
    setIsItemReveal(true);
    setStage("识别emoji");
  };

  const changeItemMode = (mode: Mode) => {
    if (mode === itemMode) return;
    setItemMode(mode);
    setItem(EMPTY_ITEM);
    setIsItemReveal(false);
    setIsActionReveal(false);
    setIsEditingItemTitle(false);
    setIsCategorySelectorOpen(false);
    if (mode === "camera") {
      setStage("新增物品-拍摄模式");
      itemInputRef.current?.blur();
    } else {
      setStage("新增物品-默认");
      window.setTimeout(() => itemInputRef.current?.focus(), 60);
    }
  };

  const beginItemTitleEdit = () => {
    setIsCategorySelectorOpen(false);
    setIsEditingItemTitle(true);
    window.setTimeout(() => {
      const input = itemTitleEditRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 30);
  };

  const finishItemTitleEdit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!item.name.trim()) return;
    setItem((current) => ({ ...current, name: current.name.trim() }));
    setIsEditingItemTitle(false);
    itemTitleEditRef.current?.blur();
  };

  const beginFinalSpaceEdit = (field: SpaceField) => {
    const entity = field === "parent" ? parentSpace : subSpace;
    finalSpaceEditRestoreRef.current = entity.name;
    setIsCategorySelectorOpen(false);
    setLocationPickerField(null);
    setEditingFinalSpace(field);
    window.setTimeout(() => {
      const input = field === "parent" ? parentSpaceEditRef.current : subSpaceEditRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 30);
  };

  const finishFinalSpaceEdit = (field: SpaceField) => {
    const setter = field === "parent" ? setParentSpace : setSubSpace;
    setter((current) => ({ ...current, name: current.name.trim() || finalSpaceEditRestoreRef.current }));
    setEditingFinalSpace((current) => current === field ? null : current);
  };

  const openFinalLocationPicker = (field: MemoryLocationField) => {
    if (editingFinalSpace) finishFinalSpaceEdit(editingFinalSpace);
    setIsCategorySelectorOpen(false);
    setLocationPickerField(field);
  };

  const chooseFinalParentLocation = (option: MemoryParentLocationOption) => {
    const classification = classifyEmojiLocally(option.name, "parent-space");
    const mode = finalTransitionSource || spaceMode;
    setParentSpace((current) => setSpaceSkin({ ...current, name: option.name, iconKey: classification.icon_key, category: classification.category }, mode, option.imgUrl || emojiAsset(classification.icon_key), { iconKey: classification.icon_key }));
    setLocationPickerField(null);
  };

  const chooseFinalSubLocation = (option: MemorySubLocationOption) => {
    const subClassification = classifyEmojiLocally(option.name, "sub-space");
    const mode = finalTransitionSource || spaceMode;
    setSubSpace((current) => setSpaceSkin({ ...current, name: option.name, iconKey: subClassification.icon_key, category: subClassification.category }, mode, option.imgUrl || emojiAsset(subClassification.icon_key), { iconKey: subClassification.icon_key }));
    if (option.parentName) {
      const parentClassification = classifyEmojiLocally(option.parentName, "parent-space");
      setParentSpace((current) => setSpaceSkin({ ...current, name: option.parentName, iconKey: parentClassification.icon_key, category: parentClassification.category }, mode, option.parentImgUrl || emojiAsset(parentClassification.icon_key), { iconKey: parentClassification.icon_key }));
    }
    setLocationPickerField(null);
  };

  const recognizeItemPhoto = async (file?: File) => {
    if (!file) return;
    setIsRecognizing(true);
    try {
      const imageUrl = await readFile(file);
      const recognized = await recognizeImage(file);
      const classification = await classifyEmojiText(recognized.title, "item");
      setItem({ name: recognized.title, category: recognized.category || classification.category, iconKey: classification.icon_key, imageUrl });
      setIsActionReveal(false);
      setIsItemReveal(true);
      setStage("识别emoji");
    } catch (error) {
      console.warn("[Noma 1.3] Item photo recognition failed:", error);
    } finally {
      setIsRecognizing(false);
      if (itemCameraInputRef.current) itemCameraInputRef.current.value = "";
    }
  };

  const submitSpaceTitle = (event: React.FormEvent) => {
    event.preventDefault();
    const field = activeSpace;
    if (!field) return;
    const title = spaceInput.trim();
    if (!title) return;
    const kind: EmojiKind = field === "sub" ? "sub-space" : "parent-space";
    const currentEntity = field === "sub" ? subSpace : parentSpace;
    const localResult = classifyEmojiLocally(title, kind);
    const localEntity = spaceMode === "emoji"
      ? setSpaceSkin({ ...currentEntity, name: localResult.title, iconKey: localResult.icon_key, category: localResult.category }, "emoji", emojiAsset(localResult.icon_key), { iconKey: localResult.icon_key })
      : { ...currentEntity, name: title };
    if (field === "sub") setSubSpace(localEntity);
    else setParentSpace(localEntity);
    setSpaceInput("");
    updateEditingSpace(null);
    (document.activeElement as HTMLElement | null)?.blur?.();

    if (spaceMode !== "emoji") return;
    void classifyEmojiText(title, kind).then((result) => {
      const setter = field === "sub" ? setSubSpace : setParentSpace;
      setter((current) => current.name === localEntity.name
        ? setSpaceSkin({ ...current, name: result.title, iconKey: result.icon_key, category: result.category }, "emoji", emojiAsset(result.icon_key), { iconKey: result.icon_key })
        : current);
    }).catch((error) => {
      console.warn("[Noma 1.3] Space emoji refinement failed; keeping the local fallback:", error);
    });
  };

  const handleSpaceInputFocus = () => {
    if (spaceInputBlurTimerRef.current !== null) {
      window.clearTimeout(spaceInputBlurTimerRef.current);
      spaceInputBlurTimerRef.current = null;
    }
  };

  const handleSpaceInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const blurredField: SpaceField = event.currentTarget.getAttribute("aria-label") === "New parent space" ? "parent" : "sub";
    if (spaceInputBlurTimerRef.current !== null) window.clearTimeout(spaceInputBlurTimerRef.current);
    spaceInputBlurTimerRef.current = window.setTimeout(() => {
      spaceInputBlurTimerRef.current = null;
      if (editingSpaceRef.current !== blurredField) return;
      const active = document.activeElement;
      const remainsInSpaceInput = active instanceof HTMLInputElement
        && (active.getAttribute("aria-label") === "New parent space" || active.getAttribute("aria-label") === "New sub-space");
      if (!remainsInSpaceInput) updateEditingSpace(null);
    }, 50);
  };

  const activateSpace = (field: SpaceField) => {
    const targetName = field === "sub" ? subSpace.name : parentSpace.name;
    if (editingSpace !== null) {
      handleSpaceInputFocus();
      setActiveSpace(field);
      updateEditingSpace(field);
      setSpaceInput(targetName);
      return;
    }

    if (activeSpace !== field) {
      setActiveSpace(field);
      setSpaceInput(targetName);
      return;
    }

    handleSpaceInputFocus();
    updateEditingSpace(field);
    setActiveSpace(field);
    setSpaceInput(targetName);
  };

  const handleSpaceCardPointerDown = (event: React.PointerEvent<HTMLElement>, field: SpaceField) => {
    if (field === "sub") event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest("input, button, .noma-add-recent-bubble")) return;
    if (activeSpace === field) setPressedSpace(field);
    activateSpace(field);
  };

  const releaseSpacePress = (field: SpaceField) => {
    setPressedSpace((current) => current === field ? null : current);
  };

  const beginSpaceTitleEdit = (event: React.PointerEvent<HTMLElement>, field: SpaceField) => {
    event.preventDefault();
    event.stopPropagation();
    const targetName = field === "sub" ? subSpace.name : parentSpace.name;
    handleSpaceInputFocus();
    setActiveSpace(field);
    updateEditingSpace(field);
    setSpaceInput(targetName);
  };

  const switchSpaceCameraTarget = (field: SpaceField) => {
    const entity = field === "sub" ? subSpace : parentSpace;
    setSpaceCameraTarget(field);
    setActiveSpace(field);
    setSpaceCameraActions(spaceHasSkin(entity, "camera") ? "review" : "capture");
    if (editingSpace !== null) {
      if (spaceHasSkin(entity, "camera")) {
        handleSpaceInputFocus();
        updateEditingSpace(field);
        setSpaceInput(entity.name);
      } else {
        updateEditingSpace(null);
        setSpaceInput("");
      }
    }
  };

  const beginSpaceCameraTitleEdit = (event: React.PointerEvent<HTMLElement>, field: SpaceField) => {
    const entity = field === "sub" ? subSpace : parentSpace;
    if (!spaceHasSkin(entity, "camera")) return;
    event.preventDefault();
    event.stopPropagation();
    handleSpaceInputFocus();
    setSpaceCameraTarget(field);
    setActiveSpace(field);
    setSpaceCameraActions("capture");
    updateEditingSpace(field);
    setSpaceInput(entity.name);
  };

  const acceptRecentSub = () => {
    if (!recentSub) return;
    const result = classifyEmojiLocally(recentSub.name, "sub-space");
    setSubSpace((current) => setSpaceSkin({ ...current, name: recentSub.name, iconKey: result.icon_key, category: result.category, emojiIconKey: result.icon_key }, spaceMode, recentSub.imageUrl || emojiAsset(result.icon_key), { iconKey: result.icon_key }));
    if (recentSub.parentName) {
      const parentResult = classifyEmojiLocally(recentSub.parentName, "parent-space");
      setParentSpace((current) => setSpaceSkin({ ...current, name: recentSub.parentName, iconKey: parentResult.icon_key, category: parentResult.category, emojiIconKey: parentResult.icon_key }, spaceMode, recentSub.parentImageUrl || emojiAsset(parentResult.icon_key), { iconKey: parentResult.icon_key }));
    }
    setActiveSpace("sub");
    setSpaceCameraTarget("sub");
    setSpaceCameraActions("review");
    setSpaceInput("");
    updateEditingSpace(null);
  };

  const acceptRecentParent = () => {
    if (!recentParent) return;
    const result = classifyEmojiLocally(recentParent.name, "parent-space");
    setParentSpace((current) => setSpaceSkin({ ...current, name: recentParent.name, iconKey: result.icon_key, category: result.category, emojiIconKey: result.icon_key }, spaceMode, recentParent.imageUrl || emojiAsset(result.icon_key), { iconKey: result.icon_key }));
    setActiveSpace("parent");
    setSpaceCameraTarget("parent");
    setSpaceCameraActions("review");
    setSpaceInput("");
    updateEditingSpace(null);
  };

  const recognizeSpacePhoto = async (file?: File) => {
    if (!file) return;
    const requestId = ++spaceRecognitionRequestRef.current;
    const targetField = spaceCameraTarget;
    const currentEntity = targetField === "sub" ? subSpace : parentSpace;
    const fallbackName = currentEntity.name.trim() || (targetField === "sub" ? "New Sub-Space" : "New Space");
    setIsRecognizing(true);
    setIsSpaceProcessingSlow(false);
    const slowTimer = window.setTimeout(() => setIsSpaceProcessingSlow(true), 1000);
    const previewUrl = URL.createObjectURL(file);
    let hasPersistentImage = false;
    const setter = targetField === "sub" ? setSubSpace : setParentSpace;
    setter((current) => setSpaceSkin({ ...current, name: current.name.trim() || fallbackName }, "camera", previewUrl));
    triggerSpaceActionReveal();
    setSpaceCameraActions("review");
    try {
      const imageUrl = await readFile(file);
      if (requestId !== spaceRecognitionRequestRef.current) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      hasPersistentImage = true;

      // Location capture is photo-only. It intentionally does not run the
      // item's vision recognizer or Emoji classifier; an empty card keeps its
      // design default title until the user edits it explicitly.
      setter((current) => current.cameraImageUrl === previewUrl
        ? { ...current, cameraImageUrl: imageUrl, lastSkinMode: "camera" }
        : current);
    } catch (error) {
      console.warn("[Noma 1.3] Space photo recognition failed:", error);
      setter((current) => current.cameraImageUrl === previewUrl
        ? { ...current, cameraImageUrl: undefined, lastSkinMode: spaceHasSkin(current, "emoji") ? "emoji" : undefined }
        : current);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);
    } finally {
      window.clearTimeout(slowTimer);
      if (hasPersistentImage) window.setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);
      if (requestId === spaceRecognitionRequestRef.current) setIsRecognizing(false);
      if (requestId === spaceRecognitionRequestRef.current) setIsSpaceProcessingSlow(false);
      if (spaceCameraInputRef.current) spaceCameraInputRef.current.value = "";
    }
  };

  const captureCameraFrame = async (target: "item" | SpaceField) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      const input = target === "item" ? itemCameraInputRef.current : spaceCameraInputRef.current;
      input?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    const file = new File([blob], `noma-${target}-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (target === "item") await recognizeItemPhoto(file);
    else await recognizeSpacePhoto(file);
  };

  const resetSpace = () => {
    if (!activeSpace) return;
    const setter = activeSpace === "sub" ? setSubSpace : setParentSpace;
    setter((current) => clearSpaceSkin(current, spaceMode));
    setSpaceInput("");
    updateEditingSpace(null);
    if (spaceMode === "camera") {
      setIsSpaceProcessingSlow(false);
      setSpaceCameraActions("capture");
    }
  };

  const skipToAvailableCameraSpace = () => {
    const nextTarget: SpaceField = spaceCameraTarget === "sub" ? "parent" : "sub";
    const nextEntity = nextTarget === "sub" ? subSpace : parentSpace;
    if (!nextEntity.name && !spaceHasSkin(nextEntity, "emoji") && !spaceHasSkin(nextEntity, "camera")) return;
    setSpaceCameraTarget(nextTarget);
    setActiveSpace(nextTarget);
    setSpaceCameraActions("review");
  };

  const returnToItemResult = () => {
    spaceRecognitionRequestRef.current += 1;
    setIsRecognizing(false);
    setIsSpaceProcessingSlow(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
    setActiveSpace(null);
    setSpaceInput("");
    updateEditingSpace(null);
    setSpaceCameraActions("capture");
    setStage("识别emoji");
  };

  const saveItem = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onItemAdded({
        name: item.name.trim(),
        category: item.category,
        price: price.trim(),
        date: "Today",
        emoji: item.iconKey,
        stickerUrl: entityImage(item),
        parentLocationName: parentSpace.name.trim(),
        subLocationName: subSpace.name.trim(),
        parentLocationImg: parentSpace.name ? resolveSpaceSkin(parentSpace, finalTransitionSource || spaceMode) : undefined,
        subLocationImg: subSpace.name ? resolveSpaceSkin(subSpace, finalTransitionSource || spaceMode) : undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const beginPriceEdit = () => {
    setIsEditingPrice(true);
    window.setTimeout(() => {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }, 30);
  };

  const finishPriceEdit = () => {
    setPrice((current) => current.trim());
    setIsEditingPrice(false);
  };

  const hasSpaceInfo = (entity: DraftEntity) => Boolean(entity.name.trim() || spaceHasSkin(entity, "emoji") || spaceHasSkin(entity, "camera"));
  const hasSpace = hasSpaceInfo(subSpace) || hasSpaceInfo(parentSpace);
  const selectedParentKey = parentSpace.name.trim();
  const selectedSubKey = `${parentSpace.name.trim()}::${subSpace.name.trim()}`;
  const hasOtherParentLocations = parentLocationOptions.some((option) => option.key !== selectedParentKey);
  const hasOtherSubLocations = subLocationOptions.some((option) => option.key !== selectedSubKey);
  const stageStyle = { "--noma-add-height": `${stageHeight}px` } as React.CSSProperties;
  const isSpaceKeyboardOpen = editingSpace !== null;
  const spaceShift = isSpaceKeyboardOpen ? -105 : 0;
  const shouldShowRecentSpace = (mode: Mode, entity: DraftEntity, field: SpaceField) => {
    const recent = field === "parent" ? recentParent : recentSub;
    return Boolean(recent && activeSpace === field && editingSpace === null && !spaceHasSkin(entity, mode));
  };
  const renderRecentSpace = (mode: Mode, entity: DraftEntity, field: SpaceField) => {
    if (!shouldShowRecentSpace(mode, entity, field)) return null;
    const recent = field === "parent" ? recentParent : recentSub;
    if (!recent) return null;
    const accept = field === "parent" ? acceptRecentParent : acceptRecentSub;
    return (
      <div
        className={`noma-add-recent-bubble is-${mode} is-${field}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <img src={recent.imageUrl || emojiAsset(field === "parent" ? "home" : "box")} alt="" />
        <span>{recent.name}</span>
        <button
          type="button"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={accept}
          aria-label={`Use existing ${field} location`}
        >
          <Check />
        </button>
      </div>
    );
  };
  const renderSpaceReviewActions = (onRestart: () => void) => (
    <div className="noma-add-space-camera-actions-layer">
      <div className="noma-add-space-camera-action-state">
        <RoundActions
          reveal={isSpaceActionReveal}
          onRestart={onRestart}
          onConfirm={goToFinalResult}
          onCancel={returnToItemResult}
          disabled={isRecognizing}
          loading={isRecognizing}
        />
      </div>
    </div>
  );

  const renderItemResult = () => (
    <>
      <ModeSwitch mode={itemMode} onChange={changeItemMode} onClose={onClose} />
      {(stage === "切换emoji" || isCategorySelectorOpen) && (
        <button
          type="button"
          className="noma-add-result-dismiss"
          onClick={() => { setStage("识别emoji"); setIsCategorySelectorOpen(false); }}
          aria-label="Close selection"
        />
      )}
      <main className={`noma-add-item-result${isItemReveal ? " is-revealing" : ""}${isEditingItemTitle ? " is-editing-title" : ""}`}>
        {isItemReveal && <span className="noma-add-result-underline" aria-hidden="true" />}
        <img className="noma-add-glow" src={COLOR_BLUR_IMAGE_URL} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
        <ItemSticker
          item={item}
          reveal={isItemReveal}
          onImageClick={itemMode === "emoji" ? () => {
            setIsCategorySelectorOpen(false);
            setStage((current) => current === "切换emoji" ? "识别emoji" : "切换emoji");
          } : undefined}
          onTitleClick={() => { setStage("识别emoji"); beginItemTitleEdit(); }}
        />
        {isEditingItemTitle && (
          <form className="noma-add-title-edit" onSubmit={finishItemTitleEdit}>
            <input
              ref={itemTitleEditRef}
              className={isChineseTitle(item.name) ? "font-zihun-biantao" : "font-alkatra"}
              style={getStickerTitleStyle(250)}
              value={item.name}
              onChange={(event) => setItem((current) => ({ ...current, name: event.target.value }))}
              onBlur={() => finishItemTitleEdit()}
              aria-label="Edit item title input"
              enterKeyHint="done"
            />
          </form>
        )}

        <CategoryFan open={isCategorySelectorOpen} current={item.category} onSelect={(category) => { setItem((current) => ({ ...current, category })); setIsCategorySelectorOpen(false); }} />
        <button type="button" className="noma-add-category" onClick={() => { setStage("识别emoji"); setIsCategorySelectorOpen((open) => !open); }}>
          {item.category}<TagSwitchIcon />
        </button>
      </main>
      {stage === "切换emoji" ? (
        <div className="noma-add-emoji-picker" aria-label="Choose emoji" onClick={(event) => event.stopPropagation()}>
          {EMOJI_CATALOG.filter((entry) => entry.kind === "item").map((entry) => (
            <button key={entry.key} type="button" onClick={() => { setItem((current) => ({ ...current, iconKey: entry.key, category: entry.category, imageUrl: undefined })); setStage("识别emoji"); }} aria-label={entry.key}>
              <img src={emojiAsset(entry.key)} alt="" />
            </button>
          ))}
        </div>
      ) : (
        <div className="noma-add-item-actions">
          <RoundActions
            reveal={isItemReveal || isActionReveal}
            onRestart={() => { setIsItemReveal(false); setIsActionReveal(false); setItem((current) => ({ ...EMPTY_ITEM, name: current.name })); setStage(itemMode === "camera" ? "新增物品-拍摄模式" : "新增物品-默认"); if (itemMode === "emoji") window.setTimeout(() => itemInputRef.current?.focus(), 50); }}
            onConfirm={() => { setStage("新增spaces"); setSpaceMode("emoji"); setActiveSpace("sub"); setSpaceCameraTarget("sub"); updateEditingSpace(null); setSpaceInput(""); (document.activeElement as HTMLElement | null)?.blur?.(); }}
          />
        </div>
      )}
    </>
  );

  const renderSpaceEmoji = () => (
    <>
        <ModeSwitch mode={spaceMode} onChange={(mode) => {
          if (mode === spaceMode) return;
          if (mode === "camera") {
            const selectedField = activeSpace || spaceCameraTarget;
            setSpaceCameraTarget(selectedField);
            setSpaceCameraActions("capture");
          } else {
            const selectedField = activeSpace || spaceCameraTarget;
            setActiveSpace(selectedField);
          }
          setSpaceInput("");
          updateEditingSpace(null);
          setSpaceMode(mode);
          (document.activeElement as HTMLElement | null)?.blur?.();
        }} onClose={onClose} hidden={isSpaceKeyboardOpen} />
      <div className="noma-add-space-composition" style={{ transform: `translateY(${spaceShift}px)` }}>
        <ItemSticker item={item} compact />
        <div className="noma-add-space-wrap">
          <section className={`noma-add-space-card ${activeSpace === "parent" ? "is-active" : ""}${pressedSpace === "parent" ? " is-pressed" : ""}`} onPointerDown={(event) => handleSpaceCardPointerDown(event, "parent")} onPointerUp={() => releaseSpacePress("parent")} onPointerCancel={() => releaseSpacePress("parent")} onPointerLeave={() => releaseSpacePress("parent")}>
            <div className="noma-add-parent-zone">
              {parentSpace.name ? (
                <div className={`noma-add-space-value${imageUrlIsPhoto(activeSpace === "parent" ? spaceSkinUrl(parentSpace, "emoji") : spaceDisplaySkinUrl(parentSpace, "emoji")) ? " is-photo" : ""}${!(activeSpace === "parent" ? spaceHasSkin(parentSpace, "emoji") : spaceDisplaySkinUrl(parentSpace, "emoji")) ? " is-empty" : ""}${editingSpace === "parent" ? " is-editing" : ""}`} style={{ "--noma-parent-title-width": `${parentTitleWidth}px` } as React.CSSProperties}>
                  <div className="noma-add-parent-visual">
                    <img src={(activeSpace === "parent" ? spaceSkinUrl(parentSpace, "emoji") : spaceDisplaySkinUrl(parentSpace, "emoji")) || emojiAsset(parentSpace.emojiIconKey || parentSpace.iconKey)} alt="" className={imageUrlIsPhoto(activeSpace === "parent" ? spaceSkinUrl(parentSpace, "emoji") : spaceDisplaySkinUrl(parentSpace, "emoji")) ? "is-photo" : undefined} />
                    <strong ref={parentSpaceTitleRef} className="noma-add-space-title-hotspot" onPointerDown={(event) => beginSpaceTitleEdit(event, "parent")}>{parentSpace.name}</strong>
                  </div>
                  {editingSpace === "parent" && (
                    <form onSubmit={submitSpaceTitle} className="noma-add-space-input-wrap">
                      <input autoFocus value={spaceInput} onFocus={handleSpaceInputFocus} onBlur={handleSpaceInputBlur} onChange={(event) => setSpaceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="New Space" aria-label="New parent space" enterKeyHint="send" />
                    </form>
                  )}
                </div>
              ) : editingSpace === "parent" ? (
                <form onSubmit={submitSpaceTitle} className="noma-add-space-input-wrap">
                  <img src={spaceSkinUrl(parentSpace, "emoji") || emojiAsset(parentSpace.emojiIconKey || parentSpace.iconKey || "home")} alt="" className="noma-add-space-placeholder-icon" />
                  <input autoFocus value={spaceInput} onFocus={handleSpaceInputFocus} onBlur={handleSpaceInputBlur} onChange={(event) => setSpaceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="New Space" aria-label="New parent space" enterKeyHint="send" />
                </form>
              ) : activeSpace === "parent" ? (
                <div className="noma-add-space-input-wrap is-preview">
                  {!shouldShowRecentSpace("emoji", parentSpace, "parent") && <img src={emojiAsset("home")} alt="" className="noma-add-space-placeholder-icon" />}
                  {!shouldShowRecentSpace("emoji", parentSpace, "parent") && <span className="noma-add-parent-input-preview noma-add-space-title-hotspot" onPointerDown={(event) => beginSpaceTitleEdit(event, "parent")}>New Space</span>}
                  {renderRecentSpace("emoji", parentSpace, "parent")}
                </div>
              ) : (
                <div className="noma-add-space-input-wrap is-preview">
                  <span className="noma-add-space-placeholder noma-add-space-title-hotspot" onPointerDown={(event) => beginSpaceTitleEdit(event, "parent")}>New Space</span>
                </div>
              )}
            </div>

            <div className={`noma-add-sub-card ${activeSpace === "sub" ? "is-active" : ""}${pressedSpace === "sub" ? " is-pressed" : ""}`} onPointerDown={(event) => handleSpaceCardPointerDown(event, "sub")} onPointerUp={() => releaseSpacePress("sub")} onPointerCancel={() => releaseSpacePress("sub")} onPointerLeave={() => releaseSpacePress("sub")}>
              {editingSpace === "sub" ? (
                <form onSubmit={submitSpaceTitle} className="noma-add-space-input-wrap">
                  <img src={spaceSkinUrl(subSpace, "emoji") || emojiAsset(subSpace.emojiIconKey || subSpace.iconKey)} alt="" className={`noma-add-space-placeholder-icon${spaceHasSkin(subSpace, "emoji") ? " is-filled" : ""}`} />
                  <input autoFocus value={spaceInput} onFocus={handleSpaceInputFocus} onBlur={handleSpaceInputBlur} onChange={(event) => setSpaceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="" aria-label="New sub-space" enterKeyHint="send" />
                  {!spaceInput && <span className="noma-add-sub-placeholder is-input-placeholder">New Sub-Space<br />eg. Nightstand</span>}
                </form>
              ) : subSpace.name ? (
                <div className={`noma-add-sub-value${imageUrlIsPhoto(activeSpace === "sub" ? spaceSkinUrl(subSpace, "emoji") : spaceDisplaySkinUrl(subSpace, "emoji")) ? " is-photo" : ""}${!(activeSpace === "sub" ? spaceHasSkin(subSpace, "emoji") : spaceDisplaySkinUrl(subSpace, "emoji")) ? " is-empty" : ""}`}><img src={(activeSpace === "sub" ? spaceSkinUrl(subSpace, "emoji") : spaceDisplaySkinUrl(subSpace, "emoji")) || emojiAsset(subSpace.emojiIconKey || subSpace.iconKey)} alt="" className={imageUrlIsPhoto(activeSpace === "sub" ? spaceSkinUrl(subSpace, "emoji") : spaceDisplaySkinUrl(subSpace, "emoji")) ? "is-photo" : undefined} /><strong className="noma-add-space-title-hotspot" onPointerDown={(event) => beginSpaceTitleEdit(event, "sub")}>{subSpace.name}</strong></div>
              ) : (
                <div className="noma-add-space-input-wrap is-preview">
                  {!shouldShowRecentSpace("emoji", subSpace, "sub") && <img src={emojiAsset("box")} alt="" className="noma-add-space-placeholder-icon" />}
                  {!shouldShowRecentSpace("emoji", subSpace, "sub") && <span className="noma-add-sub-placeholder noma-add-space-title-hotspot" onPointerDown={(event) => beginSpaceTitleEdit(event, "sub")}>New Sub-Space<br />eg. Nightstand</span>}
                  {renderRecentSpace("emoji", subSpace, "sub")}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      {hasSpace ? (
        editingSpace === null && renderSpaceReviewActions(resetSpace)
      ) : <button type="button" className="noma-add-cancel-text" onClick={returnToItemResult}>Cancel</button>}
    </>
  );

  const renderSpaceCamera = () => {
    const otherTarget = spaceCameraTarget === "sub" ? parentSpace : subSpace;
    const isSubCamera = spaceCameraTarget === "sub";
    const effectiveCameraActions = spaceCameraActions;
    const isParentEmojiContext = !spaceHasSkin(parentSpace, "camera") && spaceHasSkin(parentSpace, "emoji");
    const canSkip = hasSpaceInfo(otherTarget);
    const renderCameraTitle = (entity: DraftEntity, field: SpaceField) => {
      const label = entity.name || (field === "parent" ? "New Space" : "New Sub-Space");
      if (editingSpace === field && spaceHasSkin(entity, "camera")) {
        return (
          <form className={`noma-add-space-camera-title-form is-${field}`} onSubmit={submitSpaceTitle} onPointerDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={spaceInput}
              onFocus={handleSpaceInputFocus}
              onBlur={handleSpaceInputBlur}
              onChange={(event) => setSpaceInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              aria-label={field === "parent" ? "New parent space" : "New sub-space"}
              enterKeyHint="send"
            />
          </form>
        );
      }
      return spaceHasSkin(entity, "camera") ? (
        <button type="button" className={`noma-add-space-camera-title is-${field}`} onPointerDown={(event) => beginSpaceCameraTitleEdit(event, field)}>{label}</button>
      ) : <strong>{label}</strong>;
    };
    const renderInactiveLocation = (entity: DraftEntity, field: SpaceField) => {
      const isParent = field === "parent";
      const displayedSkin = spaceDisplaySkinUrl(entity, "camera");
      const isEmpty = !displayedSkin;
      const image = displayedSkin || emojiAsset(isParent ? "home" : "box");
      const isPhoto = imageUrlIsPhoto(displayedSkin);
      return (
        <div
          className={`noma-add-space-camera-placeholder is-${field}${isEmpty ? " is-empty" : " is-filled"}${isPhoto ? " is-photo" : " is-emoji"}`}
          onClick={(event) => { event.stopPropagation(); switchSpaceCameraTarget(field); }}
        >
          {(!isEmpty || !isParent) && <img src={image} alt="" />}
          {isEmpty && field === "sub" ? <strong>New Sub-Space<br />eg. Nightstand</strong> : renderCameraTitle(entity, field)}
        </div>
      );
    };
    return (
      <>
      <ModeSwitch mode={spaceMode} onChange={(mode) => {
        if (mode === spaceMode) return;
        spaceRecognitionRequestRef.current += 1;
        setIsRecognizing(false);
        setIsSpaceProcessingSlow(false);
        setSpaceMode(mode);
        // Mode is only the input method. Keep the selected card, its title,
        // and any captured/accepted media when moving between Emoji and Camera.
        const selectedField = activeSpace || spaceCameraTarget;
        setSpaceCameraTarget(selectedField);
        setSpaceCameraActions("capture");
        setSpaceInput("");
        updateEditingSpace(null);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }} onClose={onClose} hidden={isSpaceKeyboardOpen} />
        <ItemSticker item={item} compact />
        <div className={`noma-add-space-camera-wrap${isSubCamera ? " is-sub" : " is-parent"}`} style={{ transform: `translateY(${spaceShift}px)` }}>
          <div className={`noma-add-space-camera-parent-frame${pressedSpace === "parent" ? " is-pressed" : ""}`} onPointerDown={(event) => { if (activeSpace === "parent" && !(event.target as HTMLElement).closest("input, button, .noma-add-recent-bubble")) setPressedSpace("parent"); }} onPointerUp={() => releaseSpacePress("parent")} onPointerCancel={() => releaseSpacePress("parent")} onPointerLeave={() => releaseSpacePress("parent")} onClick={() => switchSpaceCameraTarget("parent")}>
            {isSubCamera ? (
              renderInactiveLocation(parentSpace, "parent")
            ) : (
              <>
                {spaceHasSkin(parentSpace, "camera") ? <img src={spaceSkinUrl(parentSpace, "camera")} alt="" /> : <video ref={videoRef} className="noma-add-live-video" autoPlay playsInline muted />}
                {renderCameraTitle(parentSpace, "parent")}
              </>
            )}
            {renderRecentSpace("camera", parentSpace, "parent")}
            <div className={`noma-add-space-camera-sub-frame${isParentEmojiContext ? " is-parent-emoji-context" : ""}${pressedSpace === "sub" ? " is-pressed" : ""}`} onPointerDown={(event) => { event.stopPropagation(); if (activeSpace === "sub" && !(event.target as HTMLElement).closest("input, button, .noma-add-recent-bubble")) setPressedSpace("sub"); }} onPointerUp={() => releaseSpacePress("sub")} onPointerCancel={() => releaseSpacePress("sub")} onPointerLeave={() => releaseSpacePress("sub")} onClick={(event) => { event.stopPropagation(); switchSpaceCameraTarget("sub"); }}>
              {isSubCamera ? (
                spaceHasSkin(subSpace, "camera") ? (
                  <>
                    <img src={spaceSkinUrl(subSpace, "camera")} alt="" />
                    {renderCameraTitle(subSpace, "sub")}
                  </>
                ) : <><video ref={videoRef} className="noma-add-live-video" autoPlay playsInline muted />{renderCameraTitle(subSpace, "sub")}</>
              ) : renderInactiveLocation(subSpace, "sub")}
              {renderRecentSpace("camera", subSpace, "sub")}
            </div>
          </div>
        </div>
        <div className="noma-add-space-camera-actions-layer">
          <AnimatePresence mode="wait" initial={false}>
            {editingSpace === null && effectiveCameraActions === "capture" && (
              <motion.div key="space-capture-actions" className="noma-add-space-camera-action-state" initial={{ opacity: 0, scale: 0.78 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.78 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
              <div className="noma-add-camera-controls is-space">
                <button type="button" onClick={() => spaceCameraInputRef.current?.click()} aria-label="Choose from photos"><PhotoUploadIcon /></button>
                <CaptureShutterButton onClick={() => void captureCameraFrame(spaceCameraTarget)} disabled={isRecognizing} loading={isRecognizing} />
                <button type="button" className="noma-add-skip" onClick={skipToAvailableCameraSpace} disabled={!canSkip}>Skip</button>
              </div>
              </motion.div>
            )}
            {editingSpace === null && effectiveCameraActions === "review" && (
              <div key="space-review-actions" className="noma-add-space-camera-action-state">
                <RoundActions
                  reveal={isSpaceActionReveal}
                  onRestart={resetSpace}
                  onConfirm={goToFinalResult}
                  onCancel={returnToItemResult}
                  disabled={isRecognizing}
                  loading={isSpaceProcessingSlow}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
        <input ref={spaceCameraInputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => void recognizeSpacePhoto(event.target.files?.[0])} />
      </>
    );
  };

  return createPortal(
    <div className="noma-add-overlay" style={stageStyle} role="dialog" aria-modal="true" aria-label="Add item">
      <div className="noma-add-screen" data-board={stage}>
        <MatrixDotBackground />
        {stage === "新增物品-默认" && (
          <>
            <ModeSwitch mode={itemMode} onChange={changeItemMode} onClose={onClose} />
            <form className="noma-add-title-form" onSubmit={submitItemTitle}>
              <input
                ref={itemInputRef}
                className={isChineseTitle(item.name) ? "font-zihun-biantao" : "font-alkatra"}
                style={{ textShadow: `${getRoundedOutlineShadow(6)}, 0 5px 0 rgba(35, 33, 33, 0.1)` }}
                value={item.name}
                onChange={(event) => setItem((current) => ({ ...current, name: event.target.value }))}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
                placeholder="New Item"
                aria-label="New item title"
                enterKeyHint="send"
                autoComplete="off"
              />
              <span />
            </form>
          </>
        )}

        {(stage === "识别emoji" || stage === "切换emoji") && renderItemResult()}

        {stage === "新增物品-拍摄模式" && (
          <CaptureScanner
            isOpen
            layer={20020}
            existingMemories={existingMemories.map((memory) => ({
              parentLocationName: memory.parentLocationName || "",
              subLocationName: memory.subLocationName || "",
              parentLocationImg: memory.parentLocationImg,
              subLocationImg: memory.subLocationImg,
            }))}
            onClose={onClose}
            onSwitchToEmoji={() => changeItemMode("emoji")}
            onCutoutComplete={({ name, category, stickerUrl }) => {
              setItem((current) => ({ ...current, name, category, imageUrl: stickerUrl }));
              setIsItemReveal(false);
              setIsActionReveal(true);
              setStage("识别emoji");
            }}
          />
        )}

        {stage === "新增spaces" && (spaceMode === "emoji" ? renderSpaceEmoji() : renderSpaceCamera())}

        {stage === "最终结果页" && (
          <>
            {isFinalReveal && hasSpace && <div className="noma-add-final-exit" aria-hidden="true">{finalTransitionSource === "camera" ? renderSpaceCamera() : renderSpaceEmoji()}</div>}
            <button type="button" className="noma-add-top-close noma-add-final-close" onClick={onClose} aria-label="Close"><CloseIcon className="h-4 w-4" /></button>
            {isCategorySelectorOpen && (
              <button
                type="button"
                className="noma-add-result-dismiss"
                onClick={() => setIsCategorySelectorOpen(false)}
                aria-label="Close category selection"
              />
            )}
            <main className={`noma-add-final${isFinalReveal ? " is-revealing" : ""}`}>
              <div className="noma-add-final-hero">
                <img className="noma-add-glow" src={COLOR_BLUR_IMAGE_URL} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
                {isEditingPrice ? (
                  <div className="noma-add-final-price noma-add-final-price-editing">
                    <PriceTag price={price || "0.00"} />
                    <input
                      ref={priceInputRef}
                      value={price}
                      onChange={(event) => {
                        const clean = event.target.value.replace(/[^0-9.]/g, "");
                        const [integer = "", ...decimals] = clean.split(".");
                        setPrice(decimals.length ? `${integer}.${decimals.join("")}` : integer);
                      }}
                      onBlur={finishPriceEdit}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishPriceEdit(); } }}
                      inputMode="decimal"
                      pattern="[0-9.]*"
                      enterKeyHint="done"
                      autoComplete="off"
                      aria-label="Item value"
                    />
                  </div>
                ) : (
                  <button type="button" className="noma-add-final-price-button" onClick={beginPriceEdit} aria-label="Edit item value">
                    <PriceTag price={price} />
                  </button>
                )}
                <ItemSticker item={item} />
              </div>
              <CategoryFan open={isCategorySelectorOpen} current={item.category} onSelect={(category) => { setItem((current) => ({ ...current, category })); setIsCategorySelectorOpen(false); }} />
              <button type="button" className="noma-add-category" onClick={() => { setLocationPickerField(null); setEditingFinalSpace(null); setIsCategorySelectorOpen((open) => !open); }}>{item.category}<TagSwitchIcon /></button>
              <span className="noma-add-built">Build 3 days ago</span>
              {hasSpace && <section className="noma-add-final-location">
                <div className="noma-add-location-images">
                  {parentSpace.name && (() => { const image = resolveSpaceSkin(parentSpace, finalTransitionSource || spaceMode) || emojiAsset(parentSpace.emojiIconKey || parentSpace.iconKey); return <img className={!imageUrlIsPhoto(image) ? "is-emoji" : undefined} src={image} alt="" />; })()}
                  {subSpace.name && (() => { const image = resolveSpaceSkin(subSpace, finalTransitionSource || spaceMode) || emojiAsset(subSpace.emojiIconKey || subSpace.iconKey); return <img className={!imageUrlIsPhoto(image) ? "is-emoji" : undefined} src={image} alt="" />; })()}
                </div>
                <div className="noma-add-location-copy">
                  {parentSpace.name && <div className="noma-add-location-row is-parent">
                    <span className="noma-add-location-pin" aria-hidden="true">📍</span>
                    {editingFinalSpace === "parent" ? (
                      <input
                        ref={parentSpaceEditRef}
                        value={parentSpace.name}
                        onChange={(event) => setParentSpace((current) => ({ ...current, name: event.target.value }))}
                        onBlur={() => finishFinalSpaceEdit("parent")}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        aria-label="Edit parent space title"
                        enterKeyHint="done"
                      />
                    ) : <button type="button" className="noma-add-location-title" onClick={() => beginFinalSpaceEdit("parent")}>{parentSpace.name}</button>}
                    {hasOtherParentLocations && <button type="button" className="noma-add-location-switch" onClick={() => openFinalLocationPicker("parent")} aria-label="Switch parent location"><TagSwitchIcon /></button>}
                  </div>}
                  {subSpace.name && <div className="noma-add-location-row is-sub">
                    {editingFinalSpace === "sub" ? (
                      <input
                        ref={subSpaceEditRef}
                        value={subSpace.name}
                        onChange={(event) => setSubSpace((current) => ({ ...current, name: event.target.value }))}
                        onBlur={() => finishFinalSpaceEdit("sub")}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        aria-label="Edit sub-space title"
                        enterKeyHint="done"
                      />
                    ) : <button type="button" className="noma-add-location-title" onClick={() => beginFinalSpaceEdit("sub")}>{subSpace.name}</button>}
                    {hasOtherSubLocations && <button type="button" className="noma-add-location-switch" onClick={() => openFinalLocationPicker("sub")} aria-label="Switch sub-location"><TagSwitchIcon /></button>}
                  </div>}
                </div>
              </section>}
              <div className="noma-add-final-actions">
                <button
                  type="button"
                  className="noma-add-final-cancel"
                  onClick={() => {
                    setIsCategorySelectorOpen(false);
                    setEditingFinalSpace(null);
                    setLocationPickerField(null);
                    setActiveSpace(null);
                    updateEditingSpace(null);
                    setSpaceInput("");
                    setIsFinalReveal(false);
                    setStage("新增spaces");
                  }}
                  aria-label="Cancel and return to spaces"
                >
                  <CloseIcon />
                </button>
                <button type="button" className="noma-add-final-confirm" onClick={() => void saveItem()} disabled={isSaving} aria-label="Save item">{isSaving ? <LoaderCircle className="animate-spin" /> : <Check />}</button>
              </div>
            </main>
            {locationPickerField && (
              <MemoryLocationPicker
                field={locationPickerField}
                parentOptions={parentLocationOptions}
                subOptions={subLocationOptions}
                selectedParentKey={selectedParentKey}
                selectedSubKey={selectedSubKey}
                onChooseParent={chooseFinalParentLocation}
                onChooseSub={chooseFinalSubLocation}
                onClose={() => setLocationPickerField(null)}
              />
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
