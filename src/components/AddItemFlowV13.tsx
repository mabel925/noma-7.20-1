import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MemoryItem } from "./MemoryList";
import { COLOR_BLUR_IMAGE_URL, MatrixDotBackground } from "./MemoryList";
import { CameraIcon } from "./CameraIcon";
import { CaptureScanner } from "./CaptureScanner";
import { CancelIcon } from "./CancelIcon";
import { CloseIcon } from "./CloseIcon";
import { RestartIcon } from "./RestartIcon";
import { TagSwitchIcon } from "./TagSwitchIcon";
import { useLayoutGuard } from "../hooks/useLayoutGuard";
import { classifyEmojiText, recognizeImage } from "../services/aiService";
import { EMOJI_CATALOG, emojiAsset, type EmojiKind } from "../data/emojiCatalog";
import { getRoundedOutlineShadow, getStickerTitleStyle, isChineseTitle } from "./StickerTitle";

type Stage = "新增物品-默认" | "识别emoji" | "切换emoji" | "新增物品-拍摄模式" | "新增spaces" | "最终结果页";
type Mode = "emoji" | "camera";
type SpaceField = "sub" | "parent";
type DraftEntity = { name: string; iconKey: string; category: string; imageUrl?: string };
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
  { x: -130, y: -90, rotate: -8 },
  { x: 140, y: 15, rotate: 8 },
  { x: 140, y: 100, rotate: 8 },
  { x: -130, y: 110, rotate: -8 },
];

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
  reader.readAsDataURL(file);
});

const entityImage = (entity: DraftEntity) => entity.imageUrl || emojiAsset(entity.iconKey);

const emojiOutlineCache = new Map<string, string>();

const generateEmojiOutline = (imageUrl: string): Promise<string> => {
  const cached = emojiOutlineCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const renderScale = 3;
      const contentSize = 250 * renderScale;
      const border = 6 * renderScale;
      const size = contentSize + border * 2;
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

      const scale = Math.min(contentSize / image.naturalWidth, contentSize / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = border + (contentSize - width) / 2;
      const y = border + (contentSize - height) / 2;
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

const ModeSwitch = ({ mode, onChange, onClose }: { mode: Mode; onChange: (mode: Mode) => void; onClose: () => void }) => (
  <div className="noma-add-modebar">
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
  <div className={`noma-add-round-actions${reveal ? " is-revealing" : ""}`}>
    <button type="button" className="noma-add-round-button is-restart" onClick={onRestart} aria-label="Restart"><RestartIcon className="h-7 w-7" /></button>
    <button type="button" className="noma-add-round-button is-confirm" onClick={onConfirm} disabled={disabled} aria-label="Confirm">
      {loading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Check className="h-7 w-7" strokeWidth={2.2} />}
    </button>
    {onCancel && <button type="button" className="noma-add-round-button" onClick={onCancel} aria-label="Cancel"><CloseIcon className="h-6 w-6" /></button>}
  </div>
);

const ItemSticker = ({ item, compact = false, onImageClick, onTitleClick, reveal = false }: {
  item: DraftEntity;
  compact?: boolean;
  onImageClick?: () => void;
  onTitleClick?: () => void;
  reveal?: boolean;
}) => {
  const imageUrl = entityImage(item);
  const showEmojiOutline = !compact && !item.imageUrl;
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
      style={{ ...getStickerTitleStyle(compact ? 100 : 250), zIndex: 3 }}
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
  const [activeSpace, setActiveSpace] = useState<SpaceField>("sub");
  const [spaceInput, setSpaceInput] = useState("");
  const [spaceCameraTarget, setSpaceCameraTarget] = useState<SpaceField>("sub");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isItemReveal, setIsItemReveal] = useState(false);
  const [isActionReveal, setIsActionReveal] = useState(false);
  const [isEditingItemTitle, setIsEditingItemTitle] = useState(false);
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [stageHeight, setStageHeight] = useState(844);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const itemTitleEditRef = useRef<HTMLInputElement>(null);
  const itemCameraInputRef = useRef<HTMLInputElement>(null);
  const spaceCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    setStage("新增物品-默认");
    setItemMode("emoji");
    setSpaceMode("emoji");
    setItem(EMPTY_ITEM);
    setSubSpace(EMPTY_SUB);
    setParentSpace(EMPTY_PARENT);
    setActiveSpace("sub");
    setSpaceInput("");
    setSpaceCameraTarget("sub");
    setIsRecognizing(false);
    setIsSaving(false);
    setIsItemReveal(false);
    setIsActionReveal(false);
    setIsEditingItemTitle(false);
    setIsCategorySelectorOpen(false);
    setStageHeight(Math.min(844, window.innerHeight));
    const timer = window.setTimeout(() => itemInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

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
  }, [cameraVisible, spaceCameraTarget]);

  useEffect(() => {
    if (!isOpen) return;
    const updateKeyboard = () => {
      const viewport = window.visualViewport;
      if (!viewport) return setKeyboardInset(0);
      setKeyboardInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    };
    updateKeyboard();
    window.visualViewport?.addEventListener("resize", updateKeyboard);
    window.visualViewport?.addEventListener("scroll", updateKeyboard);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateKeyboard);
      window.visualViewport?.removeEventListener("scroll", updateKeyboard);
    };
  }, [isOpen]);

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

  const submitSpaceTitle = async (event: React.FormEvent) => {
    event.preventDefault();
    const kind: EmojiKind = activeSpace === "sub" ? "sub-space" : "parent-space";
    const result = await identifyText(spaceInput, kind);
    if (!result) return;
    const entity = { name: result.title, iconKey: result.icon_key, category: result.category };
    if (activeSpace === "sub") setSubSpace(entity);
    else setParentSpace(entity);
    setSpaceInput("");
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const activateSpace = (field: SpaceField) => {
    setActiveSpace(field);
    setSpaceInput(field === "sub" ? subSpace.name : parentSpace.name);
  };

  const acceptRecentSub = async () => {
    if (!recentSub) return;
    const result = await classifyEmojiText(recentSub.name, "sub-space");
    setSubSpace({ name: recentSub.name, iconKey: result.icon_key, category: result.category, imageUrl: recentSub.imageUrl });
    if (recentSub.parentName) {
      const parentResult = await classifyEmojiText(recentSub.parentName, "parent-space");
      setParentSpace({ name: recentSub.parentName, iconKey: parentResult.icon_key, category: parentResult.category, imageUrl: recentSub.parentImageUrl });
    }
  };

  const acceptRecentParent = async () => {
    if (!recentParent) return;
    const result = await classifyEmojiText(recentParent.name, "parent-space");
    setParentSpace({ name: recentParent.name, iconKey: result.icon_key, category: result.category, imageUrl: recentParent.imageUrl });
  };

  const recognizeSpacePhoto = async (file?: File) => {
    if (!file) return;
    setIsRecognizing(true);
    try {
      const imageUrl = await readFile(file);
      const recognized = await recognizeImage(file);
      const kind = spaceCameraTarget === "sub" ? "sub-space" : "parent-space";
      const classification = await classifyEmojiText(recognized.title, kind);
      const entity = { name: recognized.title, category: classification.category, iconKey: classification.icon_key, imageUrl };
      if (spaceCameraTarget === "sub") setSubSpace(entity);
      else setParentSpace(entity);
    } catch (error) {
      console.warn("[Noma 1.3] Space photo recognition failed:", error);
    } finally {
      setIsRecognizing(false);
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
    if (activeSpace === "sub") setSubSpace(EMPTY_SUB);
    else setParentSpace(EMPTY_PARENT);
    setSpaceInput("");
  };

  const saveItem = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onItemAdded({
        name: item.name.trim(),
        category: item.category,
        price: "",
        date: "Today",
        emoji: item.iconKey,
        stickerUrl: entityImage(item),
        parentLocationName: parentSpace.name.trim(),
        subLocationName: subSpace.name.trim(),
        parentLocationImg: parentSpace.name ? entityImage(parentSpace) : undefined,
        subLocationImg: subSpace.name ? entityImage(subSpace) : undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const hasSpace = Boolean(subSpace.name.trim() || parentSpace.name.trim());
  const stageStyle = { "--noma-add-height": `${stageHeight}px` } as React.CSSProperties;
  const spaceShift = keyboardInset > 100 ? -105 : 0;

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

        <AnimatePresence>
          {isCategorySelectorOpen && ITEM_CATEGORIES.filter((category) => category !== item.category).slice(0, 4).map((category, index) => {
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
                onClick={() => { setItem((current) => ({ ...current, category })); setIsCategorySelectorOpen(false); }}
              >
                <span>{category}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
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
            onConfirm={() => { setStage("新增spaces"); setSpaceMode("emoji"); setActiveSpace("sub"); }}
          />
        </div>
      )}
    </>
  );

  const renderSpaceEmoji = () => (
    <>
      <ModeSwitch mode={spaceMode} onChange={(mode) => { setSpaceMode(mode); (document.activeElement as HTMLElement | null)?.blur?.(); }} onClose={onClose} />
      <ItemSticker item={item} compact />
      <div className="noma-add-space-wrap" style={{ transform: `translateY(${spaceShift}px)` }}>
        <section className={`noma-add-space-card ${activeSpace === "parent" ? "is-active" : ""}`} onClick={() => activateSpace("parent")}>
          <div className="noma-add-parent-zone">
            {parentSpace.name ? (
              <div className="noma-add-space-value"><img src={entityImage(parentSpace)} alt="" /><strong>{parentSpace.name}</strong></div>
            ) : activeSpace === "parent" ? (
              <form onSubmit={submitSpaceTitle} className="noma-add-space-input-wrap">
                <img src={emojiAsset("home")} alt="" className="noma-add-space-placeholder-icon" />
              <input autoFocus value={spaceInput} onChange={(event) => setSpaceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="New Space" aria-label="New parent space" enterKeyHint="send" />
                {recentParent && <div className="noma-add-recent-bubble" onClick={(event) => event.stopPropagation()}><img src={recentParent.imageUrl || emojiAsset("home")} alt="" /><span>{recentParent.name}</span><button type="button" onClick={() => void acceptRecentParent()}><Check /></button></div>}
              </form>
            ) : <span className="noma-add-space-placeholder">New Space</span>}
          </div>

          <div className={`noma-add-sub-card ${activeSpace === "sub" ? "is-active" : ""}`} onClick={(event) => { event.stopPropagation(); activateSpace("sub"); }}>
            {subSpace.name ? (
              <div className="noma-add-sub-value"><img src={entityImage(subSpace)} alt="" /><strong>{subSpace.name}</strong></div>
            ) : (
              <form onSubmit={submitSpaceTitle} className="noma-add-space-input-wrap">
                <img src={emojiAsset("box")} alt="" className="noma-add-space-placeholder-icon" />
                {activeSpace === "sub" ? <><input autoFocus value={spaceInput} onChange={(event) => setSpaceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="" aria-label="New sub-space" enterKeyHint="send" />{!spaceInput && <span className="noma-add-sub-placeholder is-input-placeholder">New Sub-Space<br />eg. Nightstand</span>}</> : <span className="noma-add-sub-placeholder">New Sub-Space<br />eg. Nightstand</span>}
                {activeSpace === "sub" && recentSub && <div className="noma-add-recent-bubble" onClick={(event) => event.stopPropagation()}><img src={recentSub.imageUrl || emojiAsset("box")} alt="" /><span>{recentSub.name}</span><button type="button" onClick={() => void acceptRecentSub()}><Check /></button></div>}
              </form>
            )}
          </div>
        </section>
      </div>
      {hasSpace ? <RoundActions onRestart={resetSpace} onConfirm={() => setStage("最终结果页")} onCancel={onClose} disabled={isRecognizing} loading={isRecognizing} /> : <button type="button" className="noma-add-cancel-text" onClick={onClose}>Cancel</button>}
    </>
  );

  const renderSpaceCamera = () => {
    const target = spaceCameraTarget === "sub" ? subSpace : parentSpace;
    const hasTarget = Boolean(target.imageUrl);
    return (
      <>
        <ModeSwitch mode={spaceMode} onChange={setSpaceMode} onClose={onClose} />
        <ItemSticker item={item} compact />
        <div className="noma-add-space-camera-frame">
          {hasTarget ? <img src={target.imageUrl} alt="" /> : <video ref={videoRef} className="noma-add-live-video" autoPlay playsInline muted />}
          <strong>{spaceCameraTarget === "sub" ? "Sub-Space" : "Space"}</strong>
          {spaceCameraTarget === "parent" && subSpace.name && <button type="button" className="noma-add-camera-sub-bubble" onClick={() => setSpaceCameraTarget("sub")}><img src={entityImage(subSpace)} alt="" /><span>{subSpace.name}</span></button>}
        </div>
        {hasTarget ? (
          <RoundActions
            onRestart={() => { if (spaceCameraTarget === "sub") setSubSpace(EMPTY_SUB); else setParentSpace(EMPTY_PARENT); }}
            onConfirm={() => { if (spaceCameraTarget === "sub") setSpaceCameraTarget("parent"); else setStage("最终结果页"); }}
            onCancel={onClose}
          />
        ) : (
          <div className="noma-add-camera-controls is-space">
            <button type="button" onClick={() => spaceCameraInputRef.current?.click()} aria-label="Choose from photos"><ImageIcon /></button>
            <button type="button" className="noma-add-shutter" onClick={() => void captureCameraFrame(spaceCameraTarget)} disabled={isRecognizing} aria-label="Take photo">{isRecognizing ? <LoaderCircle className="animate-spin" /> : <span />}</button>
            <button type="button" className="noma-add-skip" onClick={() => { if (spaceCameraTarget === "sub") setSpaceCameraTarget("parent"); else if (hasSpace) setStage("最终结果页"); }}>Skip</button>
          </div>
        )}
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
            <button type="button" className="noma-add-final-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
            <main className="noma-add-final">
              <div className="noma-add-final-hero"><img className="noma-add-glow" src={COLOR_BLUR_IMAGE_URL} alt="" aria-hidden="true" referrerPolicy="no-referrer" /><ItemSticker item={item} /></div>
              <button type="button" className="noma-add-category">{item.category}<ChevronsUpDown className="h-4 w-4" /></button>
              <span className="noma-add-built">Build 3 days ago</span>
              {hasSpace && <section className="noma-add-final-location">
                <div className="noma-add-location-images">
                  {parentSpace.name && <img src={entityImage(parentSpace)} alt="" />}
                  {subSpace.name && <img src={entityImage(subSpace)} alt="" />}
                </div>
                <div className="noma-add-location-copy">
                  {parentSpace.name && <strong>📍{parentSpace.name}<ChevronsUpDown /></strong>}
                  {subSpace.name && <span>{subSpace.name}<ChevronsUpDown /></span>}
                </div>
              </section>}
              <button type="button" className="noma-add-final-confirm" onClick={() => void saveItem()} disabled={isSaving} aria-label="Save item">{isSaving ? <LoaderCircle className="animate-spin" /> : <Check />}</button>
              <span className="noma-add-final-hint">Tap title to adjust</span>
            </main>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
