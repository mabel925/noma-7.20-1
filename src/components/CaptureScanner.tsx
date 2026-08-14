import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Image as ImageIcon, RotateCcw } from "lucide-react";
import { recognizeImage, classifyLocation, prepareImage } from "../services/aiService";
import { remove_background, REMOVE_BG_CONFIG } from "../services/removeBackgroundService";
import { motion, AnimatePresence } from "motion/react";
import { useKeyboardReset } from "../hooks/useKeyboardReset";
import { useLayoutGuard } from "../hooks/useLayoutGuard";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { TagSwitchIcon } from "./TagSwitchIcon";
import { EditPencilIcon } from "./EditPencilIcon";
import { CloseIcon } from "./CloseIcon";
import {
  getStickerTitleStyle,
  STICKER_BASE_SIZE,
  STICKER_TITLE_FONT_SIZE,
} from "./StickerTitle";

const LIGHTSPOT_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/lightspot.png";
const PRICE_CURRENCIES = ["$", "€", "£", "¥", "₩"] as const;
const COLOR_BLUR_SIZE = "min(100vw, 512px)";

interface CaptureScannerProps {
  isOpen: boolean;
  onClose: () => void;
  existingMemories?: ExistingMemoryLocationSource[];
  onItemAdded?: (item: {
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
  }) => void;
}

interface ExistingMemoryLocationSource {
  parentLocationName: string;
  subLocationName: string;
  parentLocationImg?: string;
  subLocationImg?: string;
}

type ExistingSubLocationOption = {
  key: string;
  name: string;
  parentName: string;
  imgUrl: string;
  parentImgUrl?: string;
  itemCount: number;
};

type ExistingParentLocationOption = {
  key: string;
  name: string;
  imgUrl: string;
  itemCount: number;
};

type ResultLocationField = "parent" | "sub";
type ResultLocationDraft = {
  name: string;
  imgUrl: string;
  parentName?: string;
  parentImgUrl?: string;
};

const SelectorSelectedIcon: React.FC<{ selected?: boolean }> = ({ selected = true }) => (
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
    <rect width="24" height="24" rx="12" fill={selected ? "#FFBA7B" : "rgba(255,255,255,0.5)"} />
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

// Pre-defined cozy item options that fit Noma's room
interface PredefinedItem {
  id: string;
  name: string;
  emoji: string;
  svgPath: string; // Draw beautiful SVG inside our sticker dilator
  color: string;
  searchResponse: string;
}

const MEMORY_ITEMS: PredefinedItem[] = [
  {
    id: "camera",
    name: "Retro Leica Camera",
    emoji: "📷",
    color: "#D97706",
    svgPath: `
      M 30,40 H 70 V 75 H 30 Z 
      M 40,40 V 32 H 60 V 40
      M 50,57 A 10,10 0 1,1 50,57.1
    `,
    searchResponse: "Your Retro Leica Camera is safely placed on the wooden desk. I can see the copper strap catching the light!",
  },
  {
    id: "mug",
    name: "Blue Ceramic Mug",
    emoji: "☕",
    color: "#2563EB",
    svgPath: `
      M 32,35 H 64 V 75 C 64,82 32,82 32,75 Z
      M 64,45 C 72,45 72,58 64,58
    `,
    searchResponse: "That stylish Blue Ceramic Mug is cooling down right on the copper tea table near your cozy armchair.",
  },
  {
    id: "keys",
    name: "Golden Keyring",
    emoji: "🔑",
    color: "#EAB308",
    svgPath: `
      M 48,32 A 10,10 0 1,1 47.9,32
      M 48,42 V 78 H 58 V 70 H 48 V 60 H 58 V 52 H 48
    `,
    searchResponse: "I noticed your Golden Keyring hanging on the second bookshelf shelf, near the small potted succulent.",
  },
  {
    id: "book",
    name: "Turquoise Fairy Tales",
    emoji: "📖",
    color: "#0D9488",
    svgPath: `
      M 32,30 H 68 V 76 H 32 Z
      M 32,76 C 40,76 60,78 68,76
      M 38,40 H 62 M 38,50 H 62 M 38,60 H 54
    `,
    searchResponse: "Your Turquoise Fairy Tale book is currently resting on the lower shelf of the side-table, next to Noma.",
  },
  {
    id: "glasses",
    name: "Horn-rimmed Glasses",
    emoji: "👓",
    color: "#DC2626",
    svgPath: `
      M 15,48 C 15,38 35,38 35,48 C 35,58 15,58 15,48 Z
      M 35,48 H 45
      M 45,48 C 45,38 65,38 65,48 C 65,58 45,58 45,48 Z
      M 15,45 L 8,50 M 65,45 L 72,50
    `,
    searchResponse: "Your Horn-rimmed glasses are resting right beside the sleeping Noma, catching the subtle window reflection.",
  }
];

const toTitleCase = (str: string) => {
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

const formatStickerTitleLines = (title: string): string[] => {
  const cleanTitle = title.trim().replace(/\s+/g, " ");
  if (!cleanTitle) return [];
  if (cleanTitle.length <= 15) return [cleanTitle];

  const words = cleanTitle.split(" ");
  if (words.length === 1) return [cleanTitle];

  const midpoint = cleanTitle.length / 2;
  let bestBreak = 1;
  let bestDistance = Infinity;
  let runningLength = 0;

  for (let i = 1; i < words.length; i++) {
    runningLength += words[i - 1].length + (i > 1 ? 1 : 0);
    const distance = Math.abs(runningLength - midpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestBreak = i;
    }
  }

  return [
    words.slice(0, bestBreak).join(" "),
    words.slice(bestBreak).join(" "),
  ].filter(Boolean);
};

const COLOR_BLUR_IMAGE_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/colorblur.png";
const FALLBACK_LOCATION_IMAGE_URL = "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80";

export const CaptureScanner: React.FC<CaptureScannerProps> = ({
  isOpen,
  onClose,
  existingMemories = [],
  onItemAdded,
}) => {
  // Call keyboard reset aggressively when capture page is open to guarantee layout restoration
  useKeyboardReset(false, isOpen);

  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [scanStep, setScanStep] = useState<"viewport" | "scanning" | "disintegrating" | "flight" | "sticker" | "done">("viewport");

  // Storage Location Flow States
  const [storageFlowStep, setStorageFlowStep] = useState<"none" | "sub_capture" | "sub_scanning" | "sub_spot" | "parent_capture" | "parent_scanning" | "parent_confirm" | "final_result">("none");
  const [subLocationImg, setSubLocationImg] = useState<string | null>(null);
  const [subLocationName, setSubLocationName] = useState<string>("");
  const [subLocationHighlight, setSubLocationHighlight] = useState<{ x: number; y: number } | null>(null);
  const [parentLocationImg, setParentLocationImg] = useState<string | null>(null);
  const [parentLocationName, setParentLocationName] = useState<string>("");
  const [selectedExistingSubKey, setSelectedExistingSubKey] = useState<string | null>(null);
  const [selectedExistingParentKey, setSelectedExistingParentKey] = useState<string | null>(null);
  const [isUsingExistingSubLocation, setIsUsingExistingSubLocation] = useState<boolean>(false);
  const [isUsingExistingParentLocation, setIsUsingExistingParentLocation] = useState<boolean>(false);
  const [newSubLocationDraft, setNewSubLocationDraft] = useState<ResultLocationDraft | null>(null);
  const [newParentLocationDraft, setNewParentLocationDraft] = useState<ResultLocationDraft | null>(null);
  const [resultLocationPicker, setResultLocationPicker] = useState<ResultLocationField | null>(null);
  const [editingResultLocationField, setEditingResultLocationField] = useState<ResultLocationField | null>(null);
  const [expandedExistingLocationPicker, setExpandedExistingLocationPicker] = useState<"sub" | "parent" | null>(null);
  const [frontLocationBubbleWidth, setFrontLocationBubbleWidth] = useState<number>(220);
  const storageScanCanvasRef = useRef<HTMLCanvasElement>(null);

  // Bottom drawer gesture drag-to-dismiss states
  const [drawerY, setDrawerY] = useState<number>(0);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const CAPTURE_DRAWER_HEIGHT = 213;
  const CAPTURE_VIEW_DRAWER_OVERLAP = 72;
  const RESULT_INPUT_BOTTOM_GAP = 130;
  const RESULT_BUTTON_INPUT_GAP = 26;
  const DISINTEGRATE_DURATION = 1850;
  const CUTOUT_FLIGHT_DELAY = DISINTEGRATE_DURATION * 0.35;
  const CUTOUT_FLIGHT_DURATION = DISINTEGRATE_DURATION * 0.52;
  const RESULT_TITLE_REVEAL_DELAY = CUTOUT_FLIGHT_DELAY + 220;
  const OUTLINE_TRACE_DURATION = 300;
  const OUTLINE_TRACE_COMMIT_LEAD = 1000 / 60;
  const OUTLINE_TRACE_MANUAL_LEAD = 60;
  const OUTLINE_TRACE_START_OFFSET = Math.max(
    0,
    CUTOUT_FLIGHT_DURATION - OUTLINE_TRACE_DURATION - OUTLINE_TRACE_COMMIT_LEAD - OUTLINE_TRACE_MANUAL_LEAD
  );
  const [browserChromeInset, setBrowserChromeInset] = useState<number>(0);
  const [isStandaloneDisplay, setIsStandaloneDisplay] = useState<boolean>(() =>
    typeof window !== "undefined" && (
      (window.navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches
    )
  );

  useEffect(() => {
    if (!isOpen) return;

    const updateBrowserChromeInset = () => {
      const isStandalone =
        (window.navigator as any).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const inset = isStandalone ? 0 : Math.max(0, window.innerHeight - visualViewportHeight);
      setIsStandaloneDisplay(isStandalone);
      setBrowserChromeInset(inset);
    };

    updateBrowserChromeInset();
    window.addEventListener("resize", updateBrowserChromeInset);
    window.visualViewport?.addEventListener("resize", updateBrowserChromeInset);

    return () => {
      window.removeEventListener("resize", updateBrowserChromeInset);
      window.visualViewport?.removeEventListener("resize", updateBrowserChromeInset);
    };
  }, [isOpen]);

  const resultInputBottomGap = isStandaloneDisplay
    ? RESULT_INPUT_BOTTOM_GAP
    : Math.max(0, RESULT_INPUT_BOTTOM_GAP - browserChromeInset - 70);

  // Apply our custom layout guard to guarantee layout/scroll scrubbing and dynamic app height calculation
  useLayoutGuard(isOpen);

  useEffect(() => {
    const frame = document.getElementById("noma-iphone-frame");
    if (frame) {
      if (isOpen && storageFlowStep !== "none" && storageFlowStep !== "final_result") {
        frame.classList.add("noma-frame-overflow-visible");
      } else {
        frame.classList.remove("noma-frame-overflow-visible");
      }
    }
    return () => {
      const f = document.getElementById("noma-iphone-frame");
      if (f) f.classList.remove("noma-frame-overflow-visible");
    };
  }, [isOpen, storageFlowStep]);
  
  // Custom uploaded image states for simulator
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string>("");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [tempIdentifiedCategory, setTempIdentifiedCategory] = useState<string>("");
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState<boolean>(false);
  const [isColorBlurReady, setIsColorBlurReady] = useState<boolean>(false);
  const [isResultDecorationVisible, setIsResultDecorationVisible] = useState<boolean>(false);
  const [isResultTitleRevealReady, setIsResultTitleRevealReady] = useState<boolean>(false);
  const [isOutlineTraceReady, setIsOutlineTraceReady] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preparedTitleRef = useRef("");
  const classificationPromiseRef = useRef<Promise<void> | null>(null);
  const classificationRequestIdRef = useRef(0);

  // Pre-defined list of categories for the interactive fan-out switcher
  const isChinese = false; // Temporarily forced to English as requested

  const CATEGORIES_CN = [
    "日用百货",
    "衣物配饰",
    "数码用品",
    "书籍文档",
    "其它"
  ];

  const CATEGORIES_EN = [
    "Housewares",
    "Apparel",
    "Electronics",
    "Docs",
    "Others"
  ];

  const ALL_CATEGORIES = isChinese ? CATEGORIES_CN : CATEGORIES_EN;

  const getLocalizedCategory = (rawCategory: string): string => {
    const clean = (rawCategory || "").toLowerCase().trim();
    let targetIndex = 4; // Default to Others
    if (clean.includes("electronic") || clean.includes("数码") || clean.includes("家电") || clean.includes("设备") || clean.includes("tech")) {
      targetIndex = 2; // 数码用品 / Electronics
    } else if (clean.includes("apparel") || clean.includes("衣物") || clean.includes("配饰") || clean.includes("cloth") || clean.includes("wear") || clean.includes("fashion")) {
      targetIndex = 1; // 衣物配饰 / Apparel
    } else if (clean.includes("daily") || clean.includes("goods") || clean.includes("essentials") || clean.includes("日用") || clean.includes("百货") || clean.includes("household") || clean.includes("life") || clean.includes("need") || clean.includes("houseware")) {
      targetIndex = 0; // 日用百货 / Housewares
    } else if (clean.includes("book") || clean.includes("file") || clean.includes("paper") || clean.includes("document") || clean.includes("书籍") || clean.includes("文档") || clean.includes("doc")) {
      targetIndex = 3; // 书籍文档 / Docs
    } else {
      targetIndex = 4; // 其它 / Others
    }
    return isChinese ? CATEGORIES_CN[targetIndex] : CATEGORIES_EN[targetIndex];
  };

  // Target position offsets (relative to center of the subject container) for 4 fanned-out categories
  const FAN_POSITIONS = [
    { x: -130, y: -90, r: -8 }, // Top-Left -> Daily Essentials (y up by 20px)
    { x: 140, y: 15, r: 8 },    // Mid-Right -> Apparel (x left by 20px)
    { x: 140, y: 100, r: 8 },   // Bottom-Right -> Electronics (tilt angle same as Apparel = 8)
    { x: -130, y: 110, r: -8 },  // Bottom-Left -> Books & Files (tilt angle same as Daily Essentials = -8)
  ];

  // High-fidelity generated physical white-outline sticker image URL
  const [generatedStickerUrl, setGeneratedStickerUrl] = useState<string | null>(null);
  
  // Local AI segmentation and load state tracker
  const [aiProgress, setAiProgress] = useState<string | null>(null);

  // Modern camera shutter screen flash overlay state
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);

  // Custom metadata input values
  const [priceInput, setPriceInput] = useState<string>("");
  const [priceCurrencyIndex, setPriceCurrencyIndex] = useState(0);
  const [customDate, setCustomDate] = useState<string>("Today");
  const [isEditingPrice, setIsEditingPrice] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  // Video feed references
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<boolean>(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string>("");
  const [cameraPermissionPending, setCameraPermissionPending] = useState<boolean>(false);

  const cameraPermissionUnavailable = cameraError && !cameraActive;
  const cameraViewportUnavailable = cameraPermissionUnavailable || cameraPermissionPending;

  // Canvases for animation effects
  const particlesCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelateCanvasRef = useRef<HTMLCanvasElement>(null);
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const outlineTraceCanvasRef = useRef<HTMLCanvasElement>(null);
  const cutoutFlightRef = useRef<HTMLDivElement>(null);
  const cutoutFlightAnimationRef = useRef<Animation | null>(null);
  const outlineTraceDeadlineRef = useRef<number | null>(null);
  const stickerSizeSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // States for advanced cinematic contour tracing
  const [alignedCutoutUrl, setAlignedCutoutUrl] = useState<string | null>(null);
  const [flightCutoutUrl, setFlightCutoutUrl] = useState<string | null>(null);
  const [transparentCutoutUrl, setTransparentCutoutUrl] = useState<string | null>(null);
  const [paddedCutoutUrl, setPaddedCutoutUrl] = useState<string | null>(null);
  const [isTracingContour, setIsTracingContour] = useState<boolean>(false);
  const [traceProgress, setTraceProgress] = useState<number>(0);
  const [traceCompleted, setTraceCompleted] = useState<boolean>(false);
  const [disintegrateStart, setDisintegrateStart] = useState<boolean>(false);
  const [cutoutFlightStartRect, setCutoutFlightStartRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [stickerSizeSettled, setStickerSizeSettled] = useState<boolean>(false);
  const [targetScale, setTargetScale] = useState<number>(0.42);
  const [coverWidth, setCoverWidth] = useState<number>(320);
  const [coverHeight, setCoverHeight] = useState<number>(450);
  const [containerHeight, setContainerHeight] = useState<number>(450);
  const [containerWidth, setContainerWidth] = useState<number>(320);
  const [fullStageHeight, setFullStageHeight] = useState<number>(450);
  const [uploadedNaturalWidth, setUploadedNaturalWidth] = useState<number>(0);
  const [uploadedNaturalHeight, setUploadedNaturalHeight] = useState<number>(0);
  const hasCaptureDrawer =
    (storageFlowStep === "none" && (scanStep === "viewport" || scanStep === "scanning")) ||
    (storageFlowStep !== "none" && storageFlowStep !== "final_result");
  const cameraViewBottomOffset = hasCaptureDrawer
    ? Math.max(0, CAPTURE_DRAWER_HEIGHT - CAPTURE_VIEW_DRAWER_OVERLAP)
    : 0;
  const focusReticleInsetBottom = hasCaptureDrawer ? CAPTURE_VIEW_DRAWER_OVERLAP : 0;

  const existingSubLocations = useMemo<ExistingSubLocationOption[]>(() => {
    const seen = new Map<string, ExistingSubLocationOption>();
    existingMemories.forEach((memory) => {
      const parentName = memory.parentLocationName?.trim();
      const subName = memory.subLocationName?.trim();
      const subImg = memory.subLocationImg;
      const parentImg = memory.parentLocationImg || FALLBACK_LOCATION_IMAGE_URL;
      if (!parentName || !subName || !subImg) return;

      const key = `${parentName}::${subName}`;
      const existing = seen.get(key);
      if (existing) {
        existing.itemCount += 1;
        return;
      }

      seen.set(key, {
        key,
        name: subName,
        parentName,
        imgUrl: subImg,
        parentImgUrl: parentImg,
        itemCount: 1,
      });
    });
    return Array.from(seen.values());
  }, [existingMemories]);

  const existingParentLocations = useMemo<ExistingParentLocationOption[]>(() => {
    const seen = new Map<string, ExistingParentLocationOption>();
    existingMemories.forEach((memory) => {
      const parentName = memory.parentLocationName?.trim();
      const parentImg = memory.parentLocationImg || memory.subLocationImg || FALLBACK_LOCATION_IMAGE_URL;
      if (!parentName) return;

      const existing = seen.get(parentName);
      if (existing) {
        existing.itemCount += 1;
        return;
      }

      seen.set(parentName, {
        key: parentName,
        name: parentName,
        imgUrl: parentImg,
        itemCount: 1,
      });
    });
    return Array.from(seen.values());
  }, [existingMemories]);

  const selectedExistingSubLocation =
    existingSubLocations.find((location) => location.key === selectedExistingSubKey) || existingSubLocations[0] || null;
  const selectedExistingParentLocation =
    existingParentLocations.find((location) => location.key === selectedExistingParentKey) || existingParentLocations[0] || null;

  // Measure camera-view dimensions dynamically to ensure perfect viewport layout
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const cameraView = document.getElementById("camera-view");
      const cameraPage = document.querySelector<HTMLElement>(".camera-page-container");
      if (cameraView) {
        setContainerWidth(cameraView.clientWidth);
        setContainerHeight(cameraView.clientHeight);
      }
      if (cameraPage) {
        setFullStageHeight(cameraPage.clientHeight);
      }
    };
    measure();
    const timer = setTimeout(measure, 100);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(timer);
    };
  }, [isOpen, cameraViewBottomOffset]);

  useEffect(() => {
    if (!existingSubLocations.length) {
      setSelectedExistingSubKey(null);
      return;
    }

    setSelectedExistingSubKey((current) => {
      if (current && existingSubLocations.some((location) => location.key === current)) return current;
      return existingSubLocations[0].key;
    });
  }, [existingSubLocations]);

  useEffect(() => {
    if (!existingParentLocations.length) {
      setSelectedExistingParentKey(null);
      return;
    }

    setSelectedExistingParentKey((current) => {
      if (current && existingParentLocations.some((location) => location.key === current)) return current;
      return existingParentLocations[0].key;
    });
  }, [existingParentLocations]);

  const getActiveLayout = () => {
    let aspect = 4 / 3; // Default portrait aspect ratio (height / width)
    if (uploadedImageUrl && uploadedNaturalWidth > 0 && uploadedNaturalHeight > 0) {
      aspect = uploadedNaturalHeight / uploadedNaturalWidth;
    } else if (cameraActive && videoRef.current) {
      const vw = videoRef.current.videoWidth || 480;
      const vh = videoRef.current.videoHeight || 640;
      if (vw > 0 && vh > 0) {
        aspect = vh / vw;
      }
    } else if (!uploadedImageUrl && !cameraActive) {
      aspect = 1.0;
    }
    
    const viewportWidth = containerWidth;
    const viewportHeight = Math.max(10, containerHeight);
    
    // We want proportional scaling to completely fill (cover) the entire viewport.
    let w = viewportWidth;
    let h = viewportWidth * aspect;
    let top = (viewportHeight - h) / 2;
    let left = 0;
    
    const viewportAspect = viewportHeight / viewportWidth;
    if (aspect < viewportAspect) {
      // Image is wider than viewport aspect ratio: set height to viewportHeight and scale width
      h = viewportHeight;
      w = viewportHeight / aspect;
      top = 0;
      left = (viewportWidth - w) / 2;
    }
    
    return { width: w, height: h, top, left, viewportWidth, viewportHeight };
  };

  const layout = getActiveLayout();
  const initialCenterY = layout.top + layout.height / 2;
  const targetCenterY = fullStageHeight * 0.37;
  const RESULT_STICKER_VISUAL_SIZE = STICKER_BASE_SIZE;
  const RESULT_STICKER_TITLE_WIDTH = RESULT_STICKER_VISUAL_SIZE;
  const RESULT_STICKER_TITLE_FONT_SIZE = STICKER_TITLE_FONT_SIZE;
  const finalStickerVisualSize = RESULT_STICKER_VISUAL_SIZE;
  const RESULT_STICKER_CENTER_OFFSET_X = -8;
  const finalStickerLeft = (containerWidth - finalStickerVisualSize) / 2 + RESULT_STICKER_CENTER_OFFSET_X;
  const finalStickerTop = targetCenterY - finalStickerVisualSize / 2;
  const cutoutFlightSourceRect = cutoutFlightStartRect ?? {
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
  };
  const cutoutFlightSourceCenterX = cutoutFlightSourceRect.left + cutoutFlightSourceRect.width / 2;
  const cutoutFlightSourceCenterY = cutoutFlightSourceRect.top + cutoutFlightSourceRect.height / 2;
  const cutoutFlightTargetCenterX = finalStickerLeft + finalStickerVisualSize / 2;
  const cutoutFlightTargetCenterY = finalStickerTop + finalStickerVisualSize / 2;
  const cutoutFlightTranslateX = cutoutFlightTargetCenterX - cutoutFlightSourceCenterX;
  const cutoutFlightTranslateY = cutoutFlightTargetCenterY - cutoutFlightSourceCenterY;
  const cutoutFlightTargetScale = finalStickerVisualSize / Math.max(1, cutoutFlightSourceRect.width, cutoutFlightSourceRect.height);
  const cutoutFlightImageUrl = flightCutoutUrl || alignedCutoutUrl || transparentCutoutUrl || paddedCutoutUrl;

  // Active item
  const activeItem = MEMORY_ITEMS[selectedItemIndex];
  const STICKER_CANVAS_SIZE = 256;
  const STICKER_BORDER_SIZE = 8;
  const stickerTitleText = customName.trim();
  const stickerTitleLines = formatStickerTitleLines(stickerTitleText);
  const stickerTitleStyle = getStickerTitleStyle(RESULT_STICKER_VISUAL_SIZE);
  const isResultTitleVisible = isResultTitleRevealReady && Boolean(stickerTitleText);
  const resultTitleOverlayStyle: React.CSSProperties = {
    ...stickerTitleStyle,
    left: "50%",
    width: `${RESULT_STICKER_TITLE_WIDTH}px`,
    maxWidth: `${RESULT_STICKER_TITLE_WIDTH}px`,
    marginLeft: `${-RESULT_STICKER_TITLE_WIDTH / 2}px`,
    flexDirection: "column",
    boxSizing: "border-box",
    opacity: isResultTitleVisible ? 1 : 0,
    transition: "opacity 520ms cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "opacity",
  };

  const commitPreparedTitle = (title: string) => {
    preparedTitleRef.current = title;
    setCustomName(title);
  };

  const waitForPreparedTitle = async () => {
    if (preparedTitleRef.current) return;
    const pendingClassification = classificationPromiseRef.current;

    if (pendingClassification) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 6500);
        pendingClassification.finally(() => {
          window.clearTimeout(timeout);
          resolve();
        });
      });
    }

    if (!preparedTitleRef.current) {
      classificationRequestIdRef.current += 1;
      classificationPromiseRef.current = null;
      commitPreparedTitle("Scanned Item");
    }
  };

  const getCoverLayoutFromDimensions = (sourceWidth?: number, sourceHeight?: number) => {
    if (!sourceWidth || !sourceHeight) return layout;

    const aspect = sourceHeight / sourceWidth;
    const viewportWidth = containerWidth;
    const viewportHeight = Math.max(10, containerHeight);
    let width = viewportWidth;
    let height = viewportWidth * aspect;
    let top = (viewportHeight - height) / 2;
    let left = 0;

    if (aspect < viewportHeight / viewportWidth) {
      height = viewportHeight;
      width = viewportHeight / aspect;
      top = 0;
      left = (viewportWidth - width) / 2;
    }

    return { ...layout, left, top, width, height };
  };

  const beginCutoutTransition = async (sourceWidth?: number, sourceHeight?: number, cutoutBounds?: CutoutBounds | null) => {
    await waitForPreparedTitle();
    const sourceLayout = getCoverLayoutFromDimensions(sourceWidth, sourceHeight);
    const boundsSourceWidth = cutoutBounds?.sourceWidth || sourceWidth || sourceLayout.width;
    const boundsSourceHeight = cutoutBounds?.sourceHeight || sourceHeight || sourceLayout.height;
    const flightRect = cutoutBounds
      ? {
          left: sourceLayout.left + (cutoutBounds.x / boundsSourceWidth) * sourceLayout.width,
          top: sourceLayout.top + (cutoutBounds.y / boundsSourceHeight) * sourceLayout.height,
          width: (cutoutBounds.width / boundsSourceWidth) * sourceLayout.width,
          height: (cutoutBounds.height / boundsSourceHeight) * sourceLayout.height,
        }
      : sourceLayout;

    const normalizedContentSize = STICKER_CANVAS_SIZE - Math.max(2, STICKER_BORDER_SIZE + 2) * 2;
    const normalizedContentRatio = normalizedContentSize / STICKER_CANVAS_SIZE;
    const normalizedFlightSize = Math.max(flightRect.width, flightRect.height) / normalizedContentRatio;
    const flightCenterX = flightRect.left + flightRect.width / 2;
    const flightCenterY = flightRect.top + flightRect.height / 2;

    setCutoutFlightStartRect({
      left: flightCenterX - normalizedFlightSize / 2,
      top: flightCenterY - normalizedFlightSize / 2,
      width: normalizedFlightSize,
      height: normalizedFlightSize,
    });
    setStickerSizeSettled(false);
    setTraceCompleted(false);
    setIsResultDecorationVisible(false);
    setIsResultTitleRevealReady(false);
    setIsOutlineTraceReady(false);
    outlineTraceDeadlineRef.current = null;
    setScanStep("disintegrating");
  };

  /**
   * Core cutout interface definition with deep logging.
   * Dispatched cleanly to our unified, decoupled background removal service.
   */
  const processImageForSticker = async (imageSrc: string): Promise<string> => {
    return remove_background(imageSrc, setAiProgress);
  };

  const drawContainCentered = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    targetSize: number,
    inset: number = 0
  ) => {
    const maxSize = Math.max(1, targetSize - inset * 2);
    const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const x = (targetSize - drawWidth) / 2;
    const y = (targetSize - drawHeight) / 2;
    ctx.drawImage(source, x, y, drawWidth, drawHeight);
  };

  type CutoutBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  };

  const cropTransparentBoundsWithMeta = (
    source: HTMLCanvasElement | HTMLImageElement,
    alphaThreshold: number = 8
  ): { source: HTMLCanvasElement | HTMLImageElement; bounds: CutoutBounds | null } => {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    if (!sourceWidth || !sourceHeight) return { source, bounds: null };

    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = sourceWidth;
    probeCanvas.height = sourceHeight;
    const probeCtx = probeCanvas.getContext("2d");
    if (!probeCtx) return { source, bounds: null };

    probeCtx.clearRect(0, 0, sourceWidth, sourceHeight);
    probeCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight);

    let imageData: ImageData;
    try {
      imageData = probeCtx.getImageData(0, 0, sourceWidth, sourceHeight);
    } catch (e) {
      return { source, bounds: null };
    }

    const data = imageData.data;
    let minX = sourceWidth;
    let minY = sourceHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        const alpha = data[(y * sourceWidth + x) * 4 + 3];
        if (alpha > alphaThreshold) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) return { source, bounds: null };

    const padding = Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.035);
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropRight = Math.min(sourceWidth, maxX + padding + 1);
    const cropBottom = Math.min(sourceHeight, maxY + padding + 1);
    const cropWidth = Math.max(1, cropRight - cropX);
    const cropHeight = Math.max(1, cropBottom - cropY);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return { source, bounds: null };
    cropCtx.clearRect(0, 0, cropWidth, cropHeight);
    cropCtx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return {
      source: cropCanvas,
      bounds: {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
        sourceWidth,
        sourceHeight,
      },
    };
  };

  const cropTransparentBounds = (
    source: HTMLCanvasElement | HTMLImageElement,
    alphaThreshold: number = 8
  ): HTMLCanvasElement | HTMLImageElement => {
    return cropTransparentBoundsWithMeta(source, alphaThreshold).source;
  };

  /**
   * Pure Frontend Canvas dilatation / crisp expansion algorithm with full visual fallback & CORS bypass.
   * Generates a solid uniform white border without aliasing by rendering 360 radial steps.
   */
  const generatePhysicalSticker = (
    transparentImgSrc: string,
    borderSize: number = STICKER_BORDER_SIZE,
    borderColor: string = "#FFFFFF",
    useFallbackMock: boolean = false
  ): Promise<string> => {
    console.log("[StickerEngine] generatePhysicalSticker starting...");
    console.log("[StickerEngine] Configuration parameters:", { borderSize, borderColor, useFallbackMock });
    
    return new Promise((resolve) => {
      const img = new Image();
      
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        console.log("[StickerEngine] Setting crossOrigin='anonymous' for safety.");
        img.crossOrigin = "anonymous";
      } else {
        console.log("[StickerEngine] Skipping crossOrigin for data/blob URL.");
      }
      
      let finalSrc = transparentImgSrc;
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        const separator = transparentImgSrc.includes("?") ? "&" : "?";
        finalSrc = transparentImgSrc + separator + "t=" + new Date().getTime();
        console.log("[StickerEngine] CORS Bypass: Cache-busting URL appended:", finalSrc.substring(0, 100));
      } else {
        console.log("[StickerEngine] Local base64 or blob URL cached. Direct load path active.");
      }
      
      img.src = finalSrc;
      console.log("[StickerEngine] Initiated image resource loading callback...");

      img.onload = () => {
        console.log(`[StickerEngine] Image loaded successfully inside onload queue. Dimensions: ${img.width}x${img.height}`);
        
        let sourceObject: HTMLCanvasElement | HTMLImageElement = img;

        // Optional circular crop fallback for local mock flows.
        if (useFallbackMock) {
          console.log("[StickerEngine] Generating elegant circular crop as high-fidelity visual mock.");
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.clearRect(0, 0, img.width, img.height);
            
            const cx = img.width / 2;
            const cy = img.height / 2;
            const r = Math.min(img.width, img.height) * 0.40;
            
            console.log(`[StickerEngine] Drawing circle cutout in canvas. center: (${cx}, ${cy}), radius: ${r}`);
            
            tempCtx.save();
            tempCtx.beginPath();
            tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
            tempCtx.closePath();
            tempCtx.clip();
            
            // Draw photo inside the clipped area
            tempCtx.drawImage(img, 0, 0, img.width, img.height);
            tempCtx.restore();

            // Overlay subtle warm vintage borders on the cutout sticker
            tempCtx.strokeStyle = "#8E7C66";
            tempCtx.lineWidth = Math.max(3, Math.min(img.width, img.height) * 0.012);
            tempCtx.beginPath();
            tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
            tempCtx.stroke();
            
            sourceObject = tempCanvas;
            console.log("[StickerEngine] Off-screen memory circle crop completed successfully.");
          }
        }

        sourceObject = cropTransparentBounds(sourceObject);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("[StickerEngine] Canvas 2D context acquisition failed.");
          resolve(transparentImgSrc);
          return;
        }

        const renderScale = 3;
        const size = STICKER_CANVAS_SIZE * renderScale;
        canvas.width = size;
        canvas.height = size;
        console.log(`[StickerEngine] Target canvas layout initialized containing fixed dimension: ${size}x${size}`);

        const normalizedSourceCanvas = document.createElement("canvas");
        normalizedSourceCanvas.width = size;
        normalizedSourceCanvas.height = size;
        const normalizedCtx = normalizedSourceCanvas.getContext("2d");
        if (!normalizedCtx) {
          resolve(transparentImgSrc);
          return;
        }
        normalizedCtx.imageSmoothingEnabled = true;
        normalizedCtx.imageSmoothingQuality = "high";
        normalizedCtx.clearRect(0, 0, size, size);
        drawContainCentered(
          normalizedCtx,
          sourceObject,
          sourceObject.width,
          sourceObject.height,
          size,
          Math.max(2, borderSize + 2) * renderScale
        );

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.clearRect(0, 0, size, size);

        console.log("[StickerEngine] Rendering dilated background cushion in progress (360 degrees, step 6)...");
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        // Iterate around 360 degrees to stamp a perfectly thick clean white uniform border
        // Step size 6 for highly detailed, beautiful and crisp border outlines
        for (let angle = 0; angle < 360; angle += 2) {
          const rad = (angle * Math.PI) / 180;
          const ox = Math.cos(rad) * borderSize * renderScale;
          const oy = Math.sin(rad) * borderSize * renderScale;
          ctx.drawImage(normalizedSourceCanvas, ox, oy);
        }

        // Composite source-in for solid border coloring
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();

        console.log("[StickerEngine] Overlaying original central cropped subject...");
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(normalizedSourceCanvas, 0, 0);
        ctx.restore();

        try {
          console.log("[StickerEngine] Exporting frame buffer...");
          const finalDataUrl = canvas.toDataURL("image/png");
          console.log("[StickerEngine] Final base64 generated successfully. length:", finalDataUrl.length);
          resolve(finalDataUrl);
        } catch (e) {
          console.error("[StickerEngine] Canvas export crashed. Likely cross-origin violation in sandbox. Reverting to original transparent source.", e);
          resolve(transparentImgSrc);
        }
      };

      img.onerror = (err) => {
        console.error("[StickerEngine] Error loading image from source:", finalSrc, err);
        resolve(transparentImgSrc);
      };
    });
  };

  /**
   * Helper to create a transparent padded version of the cutout image,
   * completely aligned in dimensions and offsets with the final sticker image
   * (e.g. padded by borderSize on all sides of the original transparent cutout).
   */
  const generateTransparentCutoutWithPadding = (
    transparentImgSrc: string,
    borderSize: number = STICKER_BORDER_SIZE,
    useFallbackMock: boolean = false
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      
      let finalSrc = transparentImgSrc;
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        const separator = transparentImgSrc.includes("?") ? "&" : "?";
        finalSrc = transparentImgSrc + separator + "t=" + new Date().getTime();
      }
      
      img.src = finalSrc;
      img.onload = () => {
        let sourceObject: HTMLCanvasElement | HTMLImageElement = img;

        if (useFallbackMock) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.clearRect(0, 0, img.width, img.height);
            const cx = img.width / 2;
            const cy = img.height / 2;
            const r = Math.min(img.width, img.height) * 0.40;
            
            tempCtx.save();
            tempCtx.beginPath();
            tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
            tempCtx.closePath();
            tempCtx.clip();
            tempCtx.drawImage(img, 0, 0, img.width, img.height);
            tempCtx.restore();

            tempCtx.strokeStyle = "#8E7C66";
            tempCtx.lineWidth = Math.max(3, Math.min(img.width, img.height) * 0.012);
            tempCtx.beginPath();
            tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
            tempCtx.stroke();
            
            sourceObject = tempCanvas;
          }
        }

        sourceObject = cropTransparentBounds(sourceObject);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(transparentImgSrc);
          return;
        }

        const size = STICKER_CANVAS_SIZE;
        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);

        drawContainCentered(ctx, sourceObject, sourceObject.width, sourceObject.height, size, Math.max(2, borderSize + 2));

        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          resolve(transparentImgSrc);
        }
      };
      img.onerror = () => {
        resolve(transparentImgSrc);
      };
    });
  };

  const generateFlightCutout = (
    transparentImgSrc: string,
    sourceWidth: number,
    sourceHeight: number,
    useFallbackMock: boolean = false
  ): Promise<{ url: string; bounds: CutoutBounds | null }> => {
    return new Promise((resolve) => {
      const targetWidth = Math.max(1, Math.round(sourceWidth || 500));
      const targetHeight = Math.max(1, Math.round(sourceHeight || 500));
      const img = new Image();
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }

      let finalSrc = transparentImgSrc;
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        const separator = transparentImgSrc.includes("?") ? "&" : "?";
        finalSrc = `${transparentImgSrc}${separator}t=${Date.now()}`;
      }

      img.src = finalSrc;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ url: transparentImgSrc, bounds: null });
          return;
        }

        ctx.clearRect(0, 0, targetWidth, targetHeight);

        if (useFallbackMock) {
          const cx = targetWidth / 2;
          const cy = targetHeight / 2;
          const r = Math.min(targetWidth, targetHeight) * 0.4;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          ctx.restore();
        } else {
          const imageWidth = img.naturalWidth || img.width;
          const imageHeight = img.naturalHeight || img.height;
          const sameCanvasAspect = Math.abs((imageWidth / imageHeight) - (targetWidth / targetHeight)) < 0.01;

          if (sameCanvasAspect) {
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          } else {
            const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
            const drawWidth = imageWidth * scale;
            const drawHeight = imageHeight * scale;
            const x = (targetWidth - drawWidth) / 2;
            const y = (targetHeight - drawHeight) / 2;
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
          }
        }

        const cropped = cropTransparentBoundsWithMeta(canvas);
        try {
          if (cropped.source instanceof HTMLCanvasElement) {
            resolve({ url: cropped.source.toDataURL("image/png"), bounds: cropped.bounds });
          } else {
            resolve({ url: transparentImgSrc, bounds: null });
          }
        } catch (e) {
          resolve({ url: transparentImgSrc, bounds: null });
        }
      };
      img.onerror = () => {
        resolve({ url: transparentImgSrc, bounds: null });
      };
    });
  };

  const generateViewportAlignedCutout = (
    transparentImgSrc: string,
    sourceWidth: number,
    sourceHeight: number,
    useFallbackMock: boolean = false
  ): Promise<string> => {
    return new Promise((resolve) => {
      const targetWidth = Math.max(1, Math.round(sourceWidth || 500));
      const targetHeight = Math.max(1, Math.round(sourceHeight || 500));
      const img = new Image();
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }

      let finalSrc = transparentImgSrc;
      if (!transparentImgSrc.startsWith("data:") && !transparentImgSrc.startsWith("blob:")) {
        const separator = transparentImgSrc.includes("?") ? "&" : "?";
        finalSrc = `${transparentImgSrc}${separator}t=${Date.now()}`;
      }

      img.src = finalSrc;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(transparentImgSrc);
          return;
        }

        ctx.clearRect(0, 0, targetWidth, targetHeight);

        if (useFallbackMock) {
          const cx = targetWidth / 2;
          const cy = targetHeight / 2;
          const r = Math.min(targetWidth, targetHeight) * 0.4;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          ctx.restore();
        } else {
          const imageWidth = img.naturalWidth || img.width;
          const imageHeight = img.naturalHeight || img.height;
          const sameCanvasAspect = Math.abs((imageWidth / imageHeight) - (targetWidth / targetHeight)) < 0.01;

          if (sameCanvasAspect) {
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          } else {
            const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
            const drawWidth = imageWidth * scale;
            const drawHeight = imageHeight * scale;
            const x = (targetWidth - drawWidth) / 2;
            const y = (targetHeight - drawHeight) / 2;
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
          }
        }

        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          resolve(transparentImgSrc);
        }
      };
      img.onerror = () => {
        resolve(transparentImgSrc);
      };
    });
  };

  // Capture frame chunk from standard webcam tag
  const captureVideoFrame = (): string | null => {
    if (!videoRef.current || !cameraActive) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      }
    } catch (e) {
      console.warn("Video snapshot interrupted:", e);
    }
    return null;
  };

  // Generate crisp vectors and emojis to custom transparent preset canvas
  const generatePresetTransparentImage = (): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const size = 180;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }
      
      ctx.clearRect(0, 0, size, size);
      
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(1.4, 1.4);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = activeItem.color;
      ctx.fillStyle = activeItem.color + "1A";
      
      const path = new Path2D(activeItem.svgPath.trim());
      ctx.translate(-50, -55);
      
      ctx.fill(path);
      ctx.stroke(path);
      
      ctx.font = "24px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(activeItem.emoji, 50, 56);
      ctx.restore();
      
      resolve(canvas.toDataURL("image/png"));
    });
  };

  // Pipeline execution orchestrator
  const runStickerPipeline = async (sourceUrl: string, width?: number, height?: number) => {
    try {
      console.log("[Pipeline] Starting runStickerPipeline for source URL of length:", sourceUrl.length);
      const transparentCutout = await processImageForSticker(sourceUrl);
      
      // If we are using standard preset SVGs, they are already transparent vectors, so we don't need fallback circular crop.
      // If client-side AI succeeds, it returns a new Base64 png. If it fails or is bypassed, it returns the original sourceUrl.
      const isPreset = !uploadedImageUrl && !cameraActive;
      const pipelineBypassed = (transparentCutout === sourceUrl);
      const useFallbackMock = pipelineBypassed && !isPreset;
      
      console.log(`[Pipeline] Pipeline classification -> isPreset: ${isPreset}, pipelineBypassed: ${pipelineBypassed}, useFallbackMock: ${useFallbackMock}`);

      // Determine dimensions synchronously to eliminate image-loading lag completely
      let iw = width || 500;
      let ih = height || 500;
      if (!width || !height) {
        if (uploadedImageUrl && uploadedNaturalWidth && uploadedNaturalHeight) {
          iw = uploadedNaturalWidth;
          ih = uploadedNaturalHeight;
        } else if (isPreset) {
          iw = 180;
          ih = 180;
        }
      }

      // 1. Calculate target scale synchronously and trigger instant transition
      calculateTargetScaleFromDimensions(iw, ih);

      const [alignedCutout, flightCutout, paddedCutout, finalSticker] = await Promise.all([
        generateViewportAlignedCutout(transparentCutout, iw, ih, useFallbackMock),
        generateFlightCutout(transparentCutout, iw, ih, useFallbackMock),
        generateTransparentCutoutWithPadding(transparentCutout, STICKER_BORDER_SIZE, useFallbackMock),
        generatePhysicalSticker(transparentCutout, STICKER_BORDER_SIZE, "#FFFFFF", useFallbackMock),
      ]);
      setAlignedCutoutUrl(alignedCutout);
      setFlightCutoutUrl(paddedCutout);
      setTransparentCutoutUrl(transparentCutout);
      setPaddedCutoutUrl(paddedCutout);
      setGeneratedStickerUrl(finalSticker);
      setTraceCompleted(false);
      await beginCutoutTransition(iw, ih, flightCutout.bounds);
      setAiProgress("Done");

    } catch (e) {
      console.error("[Pipeline] Pipeline broken, falling back directly to original source image:", e);
      
      let iw = width || 500;
      let ih = height || 500;
      calculateTargetScaleFromDimensions(iw, ih);

      const [flightCutout, alignedCutout, paddedCutout, finalSticker] = await Promise.all([
        generateFlightCutout(sourceUrl, iw, ih, false),
        generateViewportAlignedCutout(sourceUrl, iw, ih, false),
        generateTransparentCutoutWithPadding(sourceUrl, STICKER_BORDER_SIZE, false),
        generatePhysicalSticker(sourceUrl, STICKER_BORDER_SIZE, "#FFFFFF", false),
      ]);
      setAlignedCutoutUrl(alignedCutout);
      setFlightCutoutUrl(paddedCutout);
      setTransparentCutoutUrl(sourceUrl);
      setPaddedCutoutUrl(paddedCutout);
      setGeneratedStickerUrl(finalSticker);
      setTraceCompleted(false);
      await beginCutoutTransition(iw, ih, flightCutout.bounds);
      setAiProgress("Done");
    }
  };

  // Try to start live browser webcam stream if available
  useEffect(() => {
    const shouldRunCamera = 
      isOpen && (
        (storageFlowStep === "none" && scanStep === "viewport" && !uploadedImageUrl) ||
        (storageFlowStep === "sub_capture" && !subLocationImg) ||
        (storageFlowStep === "parent_capture" && !parentLocationImg)
      );

    let cancelled = false;
    let requestTimeout: number | null = null;

    if (shouldRunCamera) {
      setCameraError(false);
      setCameraErrorMessage("");
      setCameraPermissionPending(true);

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraActive(false);
        setCameraPermissionPending(false);
        setCameraError(true);
        setCameraErrorMessage(
          window.isSecureContext
            ? "Camera access is unavailable in this browser. You can still upload a photo."
            : "Camera requires HTTPS on mobile browsers. Open the app from an HTTPS URL, or add the HTTPS PWA to your home screen."
        );
      } else {
        const attachStream = async (stream: MediaStream) => {
          const video = videoRef.current;
          if (cancelled || !video) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
          cameraStreamRef.current = stream;
          video.srcObject = stream;
          video.muted = true;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");

          try {
            if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
              await new Promise<void>((resolve) => {
                video.addEventListener("loadedmetadata", () => resolve(), { once: true });
              });
            }
            await video.play();
            if (cancelled) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            if (requestTimeout !== null) window.clearTimeout(requestTimeout);
            setCameraActive(true);
            setCameraPermissionPending(false);
          } catch (err) {
            console.warn("Camera stream could not play:", err);
            stream.getTracks().forEach((track) => track.stop());
            cameraStreamRef.current = null;
            if (!cancelled) {
              setCameraActive(false);
              setCameraPermissionPending(false);
              setCameraError(true);
              setCameraErrorMessage("Could not start the camera. Check browser permissions or upload a photo.");
            }
          }
        };

        const requestCamera = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
            });
            await attachStream(stream);
          } catch (err) {
            if (cancelled) return;

            // Some mobile browsers reject camera constraints even when permission is available.
            if ((err as DOMException)?.name === "OverconstrainedError") {
              try {
                await attachStream(await navigator.mediaDevices.getUserMedia({ video: true }));
                return;
              } catch (fallbackError) {
                err = fallbackError;
              }
            }

            console.warn("Could not access physical camera, using cinematic fallback simulator:", err);
            setCameraActive(false);
            setCameraPermissionPending(false);
            setCameraError(true);
            setCameraErrorMessage(
              (err as DOMException)?.name === "NotAllowedError"
                ? "Camera permission was denied. Allow camera access in browser settings, or upload a photo."
                : "Could not start the camera. Check browser permissions or upload a photo."
            );
          }
        };

        requestTimeout = window.setTimeout(() => {
          if (cancelled) return;
          setCameraActive(false);
          setCameraPermissionPending(false);
          setCameraError(true);
          setCameraErrorMessage("Camera permission was not granted. Check browser permissions or upload a photo.");
        }, 5000);

        void requestCamera();
      }
    } else {
      setCameraPermissionPending(false);
    }

    return () => {
      cancelled = true;
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
      stopCamera();
    };
  }, [isOpen, scanStep, uploadedImageUrl, storageFlowStep, subLocationImg, parentLocationImg]);

  const stopCamera = () => {
    const stream = cameraStreamRef.current || (videoRef.current?.srcObject as MediaStream | null);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  /**
   * Helper to dynamically calculate target scale factor to perfectly match the size
   * of the subject in disintegrating phase with the final sticker in trace/done phase,
   * completely eliminating sudden resizing of the subject at different aspect ratios and device viewports.
   */
  const calculateTargetScaleFromDimensions = (iw: number, ih: number) => {
    if (!iw || !ih) {
      setTargetScale(0.42);
      return 0.42;
    }
    const aspect = iw / ih;

    // Get current layout dimensions synchronously
    const viewportWidth = containerWidth || 320;
    const viewportHeight = Math.max(10, containerHeight || 450);
    
    // We want proportional scaling to completely fill (cover) the entire viewport.
    let layoutW = viewportWidth;
    let layoutH = viewportWidth / aspect;
    
    const viewportAspect = viewportHeight / viewportWidth;
    const imgAspectHeightWidth = ih / iw;
    if (imgAspectHeightWidth < viewportAspect) {
      layoutH = viewportHeight;
      layoutW = viewportHeight / imgAspectHeightWidth;
    }

    setCoverWidth(layoutW);
    setCoverHeight(layoutH);

    // Inside sticker box 280 * 280
    const Sw = 280;
    const Sh = 280;
    let dw_sticker = 0;
    if (aspect >= 1) {
      dw_sticker = Sw;
    } else {
      dw_sticker = Sh * aspect;
    }

    const computedScale = dw_sticker / layoutW;
    console.log(`[TargetScale] Synchronously computed scale for dimensions ${iw}x${ih}, aspect ${aspect.toFixed(3)}, layoutW ${layoutW.toFixed(1)} is: ${computedScale.toFixed(4)}`);
    setTargetScale(computedScale);
    return computedScale;
  };

  // Reset function
  useEffect(() => {
    if (!isOpen) {
      if (stickerSizeSettleTimerRef.current) {
        clearTimeout(stickerSizeSettleTimerRef.current);
        stickerSizeSettleTimerRef.current = null;
      }
      cutoutFlightAnimationRef.current?.cancel();
      cutoutFlightAnimationRef.current = null;
      setScanStep("viewport");
      setIsCapturing(false);
      setPriceInput("");
      setPriceCurrencyIndex(0);
      setCustomDate("Today");
      setIsEditingPrice(false);
      setShowDiscardConfirm(false);
      setUploadedImageUrl(null);
      setAlignedCutoutUrl(null);
      setFlightCutoutUrl(null);
      setTransparentCutoutUrl(null);
      setPaddedCutoutUrl(null);
      setCustomName("");
      setCustomCategory("");
      preparedTitleRef.current = "";
      classificationPromiseRef.current = null;
      classificationRequestIdRef.current += 1;
      setTempIdentifiedCategory("");
      setGeneratedStickerUrl(null);
      setAiProgress(null);
      setTraceCompleted(false);
      setDisintegrateStart(false);
      setStickerSizeSettled(false);
      setIsResultDecorationVisible(false);
      setIsResultTitleRevealReady(false);
      setIsOutlineTraceReady(false);
      outlineTraceDeadlineRef.current = null;
      setIsTracingContour(false);
      setStorageFlowStep("none");
      setSubLocationImg(null);
      setSubLocationName("");
      setSubLocationHighlight(null);
      setParentLocationImg(null);
      setParentLocationName("");
      setSelectedExistingSubKey(null);
      setSelectedExistingParentKey(null);
      setIsUsingExistingSubLocation(false);
      setIsUsingExistingParentLocation(false);
      setNewSubLocationDraft(null);
      setNewParentLocationDraft(null);
      setResultLocationPicker(null);
      setEditingResultLocationField(null);
      setExpandedExistingLocationPicker(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsColorBlurReady(false);
      return;
    }

    let cancelled = false;
    setIsColorBlurReady(false);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setIsColorBlurReady(true);
    };
    img.onerror = () => {
      if (!cancelled) setIsColorBlurReady(true);
    };
    img.src = COLOR_BLUR_IMAGE_URL;
    if (img.complete) {
      img.decode?.()
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setIsColorBlurReady(true);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (tempIdentifiedCategory) {
      setCustomCategory(getLocalizedCategory(tempIdentifiedCategory));
    }
  }, [tempIdentifiedCategory]);

  useEffect(() => {
    if (isUsingExistingSubLocation) return;
    if (!subLocationImg && !subLocationName.trim()) {
      setNewSubLocationDraft(null);
      return;
    }
    setNewSubLocationDraft({
      name: subLocationName,
      imgUrl: subLocationImg || FALLBACK_LOCATION_IMAGE_URL,
      parentName: parentLocationName,
      parentImgUrl: parentLocationImg || undefined,
    });
  }, [
    isUsingExistingSubLocation,
    parentLocationImg,
    parentLocationName,
    subLocationImg,
    subLocationName,
  ]);

  useEffect(() => {
    if (isUsingExistingParentLocation) return;
    if (!parentLocationImg && !parentLocationName.trim()) {
      setNewParentLocationDraft(null);
      return;
    }
    setNewParentLocationDraft({
      name: parentLocationName,
      imgUrl: parentLocationImg || FALLBACK_LOCATION_IMAGE_URL,
    });
  }, [isUsingExistingParentLocation, parentLocationImg, parentLocationName]);

  // Hook to trigger smoothly timed CSS scaling during disintegration state
  useEffect(() => {
    if (scanStep === "disintegrating") {
      const timer = setTimeout(() => {
        setDisintegrateStart(true);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setDisintegrateStart(false);
    }
  }, [scanStep]);

  useEffect(() => {
    if (scanStep !== "disintegrating" || !cutoutFlightImageUrl) return;

    let firstFrame = 0;
    let secondFrame = 0;
    let outlineTraceTimer: number | undefined;
    const titleRevealTimer = setTimeout(() => {
      setIsResultTitleRevealReady(true);
    }, RESULT_TITLE_REVEAL_DELAY);
    const flightDelayTimer = setTimeout(() => {
      firstFrame = requestAnimationFrame(() => {
        setIsResultDecorationVisible(true);
        secondFrame = requestAnimationFrame(() => {
          const flightEl = cutoutFlightRef.current;
          outlineTraceDeadlineRef.current =
            performance.now() + CUTOUT_FLIGHT_DURATION - OUTLINE_TRACE_COMMIT_LEAD - OUTLINE_TRACE_MANUAL_LEAD;
          outlineTraceTimer = window.setTimeout(() => {
            setIsOutlineTraceReady(true);
          }, OUTLINE_TRACE_START_OFFSET);
          if (flightEl?.animate) {
            cutoutFlightAnimationRef.current?.cancel();
            cutoutFlightAnimationRef.current = flightEl.animate(
              [
                {
                  transform: "translate3d(0px, 0px, 0px) scale(1)",
                  opacity: 1,
                },
                {
                  transform: `translate3d(${cutoutFlightTranslateX}px, ${cutoutFlightTranslateY}px, 0px) scale(${cutoutFlightTargetScale})`,
                  opacity: 1,
                },
              ],
              {
                duration: CUTOUT_FLIGHT_DURATION,
                easing: "cubic-bezier(0.2, 0.9, 0.18, 1)",
                fill: "both",
              }
            );
          }
        });
      });
    }, CUTOUT_FLIGHT_DELAY);

    return () => {
      clearTimeout(flightDelayTimer);
      clearTimeout(titleRevealTimer);
      if (outlineTraceTimer !== undefined) clearTimeout(outlineTraceTimer);
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      cutoutFlightAnimationRef.current?.cancel();
      cutoutFlightAnimationRef.current = null;
    };
  }, [
    scanStep,
    cutoutFlightImageUrl,
    cutoutFlightTranslateX,
    cutoutFlightTranslateY,
    cutoutFlightTargetScale,
    CUTOUT_FLIGHT_DELAY,
    CUTOUT_FLIGHT_DURATION,
    RESULT_TITLE_REVEAL_DELAY,
    OUTLINE_TRACE_START_OFFSET,
    OUTLINE_TRACE_COMMIT_LEAD,
    OUTLINE_TRACE_MANUAL_LEAD,
  ]);

  // Particle sparkle animation engine during Step 3-1: "识别物体粒子闪动"
  useEffect(() => {
    if (scanStep !== "scanning") return;

    const canvas = particlesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.parentElement?.clientWidth || 320;
    const H = canvas.parentElement?.clientHeight || 450;
    canvas.width = W;
    canvas.height = H;

    let animationId: number;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      life: number;
      maxLife: number;
    }> = [];

    const run = () => {
      ctx.clearRect(0, 0, W, H);

      // Keep spawning sparse capture points to maintain density (reduced count)
      while (particles.length < 8) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: 0,
          vy: 0,
          size: Math.random() < 0.5 ? 3 : 5, // 6*6 (radius 3) or 10*10 (radius 5) random diameter
          alpha: Math.random() < 0.5 ? 0.3 : 1.0, // 30% or 100% random transparency
          life: 0,
          maxLife: Math.random() * 80 + 60, // Elegant local fade cycle
        });
      }

      // Safe backward loop iteration to update, draw, and remove particles without array mutations skipped index/stuttering
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;

        // Smooth sinusoidal fade-in-out curve based on life ratio
        const progress = p.life / p.maxLife;
        const currentAlpha = p.alpha * Math.sin(progress * Math.PI);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(currentAlpha, 1));
        ctx.fillStyle = "#FFFFFF"; // Pure white circular points
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }

      animationId = requestAnimationFrame(run);
    };

    run();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [scanStep]);

  // Particle sparkle animation engine during Storage Location Scanning
  useEffect(() => {
    if (storageFlowStep !== "sub_scanning" && storageFlowStep !== "parent_scanning") return;

    const canvas = storageScanCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.parentElement?.clientWidth || 320;
    const H = canvas.parentElement?.clientHeight || 450;
    canvas.width = W;
    canvas.height = H;

    let animationId: number;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      life: number;
      maxLife: number;
    }> = [];

    const run = () => {
      ctx.clearRect(0, 0, W, H);

      // Keep spawning sparse capture points to maintain density (reduced count)
      while (particles.length < 8) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: 0,
          vy: 0,
          size: Math.random() < 0.5 ? 3 : 5, // 6*6 (radius 3) or 10*10 (radius 5) random diameter
          alpha: Math.random() < 0.5 ? 0.3 : 1.0, // 30% or 100% random transparency
          life: 0,
          maxLife: Math.random() * 80 + 60, // Elegant local fade cycle
        });
      }

      // Safe backward loop iteration to update, draw, and remove particles without array mutations skipped index/stuttering
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;

        // Smooth sinusoidal fade-in-out curve based on life ratio
        const progress = p.life / p.maxLife;
        const currentAlpha = p.alpha * Math.sin(progress * Math.PI);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(currentAlpha, 1));
        ctx.fillStyle = "#FFFFFF"; // Pure white circular points
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }

      animationId = requestAnimationFrame(run);
    };

    run();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [storageFlowStep]);

  // Advanced Step: Clockwise progressive line-tracing sweep (走线动画) on canvas overlay
  useEffect(() => {
    const activeTraceImageSrc = paddedCutoutUrl || transparentCutoutUrl;
    const canStartTrace =
      (scanStep === "disintegrating" && isOutlineTraceReady) ||
      scanStep === "sticker";
    if (!canStartTrace || traceCompleted || !activeTraceImageSrc) {
      setTraceProgress(0);
      setIsTracingContour(false);
      return;
    }

    const canvas = outlineTraceCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.parentElement?.clientWidth || 180;
    const H = canvas.parentElement?.clientHeight || 180;
    canvas.width = W;
    canvas.height = H;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = activeTraceImageSrc;

    let cleanupFn: (() => void) | undefined;

    const startTracing = () => {
      setIsTracingContour(true);
      const startTime = performance.now();
      const landingDeadline = outlineTraceDeadlineRef.current;
      const remainingUntilLanding = landingDeadline === null
        ? OUTLINE_TRACE_DURATION
        : landingDeadline - startTime;
      const duration = Math.max(16, Math.min(OUTLINE_TRACE_DURATION, remainingUntilLanding));

      // Compile outline stamp buffer
      const outlineCanvas = document.createElement("canvas");
      outlineCanvas.width = W;
      outlineCanvas.height = H;
      const octx = outlineCanvas.getContext("2d");
      if (!octx) return;

      const drawContainImage = (targetCtx: CanvasRenderingContext2D, sourceImg: HTMLImageElement) => {
        const iw = sourceImg.naturalWidth || sourceImg.width;
        const ih = sourceImg.naturalHeight || sourceImg.height;
        const aspectImg = iw / ih;
        const aspectCanvas = W / H;

        let dx = 0, dy = 0, dw = W, dh = H;
        if (aspectImg > aspectCanvas) {
          dw = W;
          dh = W / aspectImg;
          dy = (H - dh) / 2;
        } else {
          dh = H;
          dw = H * aspectImg;
          dx = (W - dw) / 2;
        }
        targetCtx.drawImage(sourceImg, dx, dy, dw, dh);
        return { dx, dy, dw, dh, iw, ih };
      };

      const tempCutoutCanvas = document.createElement("canvas");
      tempCutoutCanvas.width = W;
      tempCutoutCanvas.height = H;
      const tctx = tempCutoutCanvas.getContext("2d");
      let metrics = { dx: 0, dy: 0, dw: W, dh: H, iw: img.naturalWidth || img.width, ih: img.naturalHeight || img.height };
      if (tctx) {
        metrics = drawContainImage(tctx, img);
      }

      // Match the tracing outline exactly to the final generated sticker border.
      const nativeBorder = STICKER_BORDER_SIZE;
      const scale = metrics.dw / metrics.iw;
      const canvasBorder = Math.max(2, Math.round(nativeBorder * scale));

      octx.clearRect(0, 0, W, H);
      
      // 1. Draw the dilated white mask
      octx.save();
      for (let angle = 0; angle < 360; angle += 8) {
        const rad = (angle * Math.PI) / 180;
        const ox = Math.cos(rad) * canvasBorder;
        const oy = Math.sin(rad) * canvasBorder;
        octx.drawImage(tempCutoutCanvas, ox, oy);
      }
      octx.globalCompositeOperation = "source-in";
      octx.fillStyle = "#FFFFFF";
      octx.fillRect(0, 0, W, H);
      octx.restore();

      // 2. Hollow out the center portion of the sticker to keep ONLY the outline loop!
      octx.save();
      octx.globalCompositeOperation = "destination-out";
      octx.drawImage(tempCutoutCanvas, 0, 0);
      octx.restore();

      let frameId: number;

      const animateTrace = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        setTraceProgress(progress);

        ctx.clearRect(0, 0, W, H);

        if (progress > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(W / 2, H / 2);
          ctx.arc(W / 2, H / 2, Math.max(W, H) * 1.5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(outlineCanvas, 0, 0);
          ctx.restore();
        }

        if (progress < 1.0) {
          frameId = requestAnimationFrame(animateTrace);
        } else {
          // The completed outline and the returning subject land on the same keyframe.
          setIsTracingContour(false);
          setTraceCompleted(true);
        }
      };

      frameId = requestAnimationFrame(animateTrace);
      return () => {
        cancelAnimationFrame(frameId);
      };
    };

    if (img.complete) {
      const res = startTracing();
      if (typeof res === "function") cleanupFn = res;
    } else {
      img.onload = () => {
        const res = startTracing();
        if (typeof res === "function") cleanupFn = res;
      };
    }

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [scanStep, isOutlineTraceReady, traceCompleted, paddedCutoutUrl, transparentCutoutUrl, OUTLINE_TRACE_DURATION]);

  // Step 3-2 PixiJS dynamic quantum pixelate background disintegrating simulator with continuous organic particle physics flight
  useEffect(() => {
    if (scanStep !== "disintegrating") return;

    const canvas = pixelateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.parentElement?.clientWidth || 320;
    const H = canvas.parentElement?.clientHeight || 450;
    canvas.width = W;
    canvas.height = H;

    // Create offline snapshot canvas to capture current view state before dissolving
    const sCanvas = document.createElement("canvas");
    sCanvas.width = W;
    sCanvas.height = H;
    const sCtx = sCanvas.getContext("2d");

    let isReady = false;
    let fallbackGradientGenerated = false;

    const renderSnapshotBase = () => {
      if (!sCtx) return;
      sCtx.clearRect(0, 0, W, H);
      if (uploadedImageUrl) {
        const existingImg = document.querySelector('img[alt="scanning upload container"]') || document.querySelector('img[alt="uploaded preview"]') as HTMLImageElement;
        if (existingImg && (existingImg as HTMLImageElement).complete) {
          sCtx.drawImage(existingImg as HTMLImageElement, layout.left, layout.top, layout.width, layout.height);
          isReady = true;
        } else {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = uploadedImageUrl;
          img.onload = () => {
            sCtx.drawImage(img, layout.left, layout.top, layout.width, layout.height);
            isReady = true;
          };
          img.onerror = () => {
            fallbackGrad();
          };
        }
      } else if (videoRef.current && cameraActive) {
        try {
          sCtx.drawImage(videoRef.current, layout.left, layout.top, layout.width, layout.height);
          isReady = true;
        } catch (e) {
          fallbackGrad();
        }
      } else {
        fallbackGrad();
      }
    };

    const fallbackGrad = () => {
      if (!sCtx) return;
      const grad = sCtx.createLinearGradient(layout.left, layout.top, layout.left, layout.top + layout.height);
      grad.addColorStop(0, "#2E2D2C");
      grad.addColorStop(1, "#1A1918");
      sCtx.fillStyle = grad;
      sCtx.fillRect(layout.left, layout.top, layout.width, layout.height);
      
      // Draw object silhouette back on
      sCtx.save();
      sCtx.font = "72px Inter, sans-serif";
      sCtx.textAlign = "center";
      sCtx.textBaseline = "middle";
      sCtx.fillText(activeItem.emoji, W / 2, layout.top + layout.height / 2 - 20);
      sCtx.font = "14px Inter, monospace";
      sCtx.fillStyle = "rgba(255,255,255,0.4)";
      sCtx.fillText(activeItem.name, W / 2, layout.top + layout.height / 2 + 50);
      sCtx.restore();
      isReady = true;
    };

    renderSnapshotBase();

    // Setup physical continuous organic particles
    interface DisintegrateParticle {
      x: number;
      y: number;
      originalX: number;
      originalY: number;
      vx: number;
      vy: number;
      size: number;
      r: number;
      g: number;
      b: number;
      alpha: number;
      decay: number;
      delay: number;
    }

    let particles: DisintegrateParticle[] | null = null;
    const startTime = performance.now();
    const duration = DISINTEGRATE_DURATION;

    let frameId: number;

    const drawPixelate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#E9E6E1";
      ctx.fillRect(0, 0, W, H);

      // If snapshot is still loading, keep the result bed warm so no black frame flashes through.
      if (!isReady && elapsed < 300) {
        ctx.fillStyle = "#E9E6E1";
        ctx.fillRect(0, 0, W, H);
        frameId = requestAnimationFrame(drawPixelate);
        return;
      } else if (!isReady && !fallbackGradientGenerated) {
        fallbackGrad();
        fallbackGradientGenerated = true;
      }

      // Populate continuous particle map once screenshot color values are ready
      if (isReady && !particles) {
        particles = [];
        const stepSize = 4; // Extra fine-grained step size for natural, professional-grade particle granularity
        let imgData: ImageData | null = null;
        try {
          if (sCtx) {
            imgData = sCtx.getImageData(0, 0, W, H);
          }
        } catch (e) {
          // fallback handles secure cross-origin issues automatically
        }

        for (let y = 0; y < H; y += stepSize) {
          for (let x = 0; x < W; x += stepSize) {
            let r = 80, g = 75, b = 70; // fallback ash
            if (imgData) {
              const pixelIndex = (Math.floor(y) * W + Math.floor(x)) * 4;
              if (pixelIndex >= 0 && pixelIndex < imgData.data.length) {
                const a = imgData.data[pixelIndex + 3];
                if (a < 8) {
                  r = 233;
                  g = 230;
                  b = 225;
                } else {
                  r = imgData.data[pixelIndex];
                  g = imgData.data[pixelIndex + 1];
                  b = imgData.data[pixelIndex + 2];
                }
              }
            } else if (activeItem.color) {
              const hex = activeItem.color.replace("#", "");
              r = parseInt(hex.substring(0, 2), 16) || 80;
              g = parseInt(hex.substring(2, 4), 16) || 75;
              b = parseInt(hex.substring(4, 6), 16) || 70;
            }

            // Continuous physical parameters for breezy drifting wind
            const gust = Math.random() < 0.18 ? 1.45 : 1;
            const vx = ((Math.random() - 0.22) * 6.4 + Math.random() * 1.8) * gust; // stronger drifting variance
            const vy = (-Math.random() * 4.2 - 0.95) * gust; // more visible upward uplift
            const size = Math.random() * 1.05 + 0.35; // super-fine particles for organic dissolve

            // Stagger delay sweep based Y coord (bottom-up sweep) with gentle delay noise
            const delay = (H - y) * 0.45 + Math.random() * 120;

            particles.push({
              x,
              y,
              originalX: x,
              originalY: y,
              vx,
              vy,
              size,
              r,
              g,
              b,
              alpha: 1.0,
              decay: Math.random() * 0.006 + 0.0045, // longer particle life so the drift remains visible
              delay
            });
          }
        }
      }

      // Smoothly fade out the entire canvas's visual opacity over the second half of duration
      let canvasGlobalAlpha = 1.0;
      if (progress > 0.62) {
        canvasGlobalAlpha = Math.max(0.0, (1.0 - progress) / 0.38);
      }
      if (canvas) {
        canvas.style.opacity = canvasGlobalAlpha.toFixed(3);
      }

      if (progress < 1 && particles) {
        const pCount = particles.length;
        const stepSize = 4; // match declaration
        for (let i = 0; i < pCount; i++) {
          const p = particles[i];
          if (elapsed < p.delay) {
            // Dormant grid: Paint solid initial image (use stepSize + 0.3 to prevent gaps)
            ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
            ctx.fillRect(p.originalX, p.originalY, stepSize + 0.3, stepSize + 0.3);
          } else {
            // Active particle: Float continuous path
            p.x += p.vx;
            p.y += p.vy;

            // Retain momentum with realistic atmospheric drag
            p.vx *= 0.98;
            p.vy *= 0.98;

            // Atmospheric continuous draft blowing right-and-upward
            p.vx += 0.11 + (Math.random() - 0.5) * 0.075;
            p.vy -= 0.042 + (Math.random() - 0.5) * 0.04;

            // Decay alpha
            p.alpha = Math.max(0, p.alpha - p.decay);

            if (p.alpha > 0) {
              // Interpolate blending toward beautiful soft fashion beige (#E9E6E1 -> rgb 233, 230, 225)
              const mix = 1 - p.alpha;
              const blendedR = Math.round(p.r * p.alpha + 233 * mix);
              const blendedG = Math.round(p.g * p.alpha + 230 * mix);
              const blendedB = Math.round(p.b * p.alpha + 225 * mix);

              ctx.fillStyle = `rgba(${blendedR}, ${blendedG}, ${blendedB}, ${p.alpha})`;
              
              // Shrink particle size dynamically as it dissolves
              const currentSize = p.size * Math.pow(p.alpha, 0.65);
              ctx.fillRect(p.x, p.y, currentSize, currentSize);
            }
          }
        }
        frameId = requestAnimationFrame(drawPixelate);
      } else {
        ctx.clearRect(0, 0, W, H);
        if (canvas) {
          canvas.style.opacity = "1";
        }
        if (stickerSizeSettleTimerRef.current) {
          clearTimeout(stickerSizeSettleTimerRef.current);
        }
        setStickerSizeSettled(false);
        setScanStep("sticker");
        setAiProgress(null);
        stickerSizeSettleTimerRef.current = setTimeout(() => {
          setStickerSizeSettled(true);
          stickerSizeSettleTimerRef.current = null;
        }, 16);
      }
    };

    frameId = requestAnimationFrame(drawPixelate);
    return () => cancelAnimationFrame(frameId);
  }, [scanStep, activeItem, uploadedImageUrl]);

  // Helper function to render dilated borders & original subject graphic over canvas
  const renderBorders = (offscreen: HTMLCanvasElement, ctx: CanvasRenderingContext2D, size: number) => {
    ctx.save();
    
    const radius = 9; // 10px white border dilation
    const steps = 32; // density of sampling
    
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#FFFFFF";

    // Draw solid white offset silhouette to bake uniform background border dilation
    for (let r = 1; r <= radius; r += 2) {
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const ox = Math.round(Math.cos(theta) * r);
        const oy = Math.round(Math.sin(theta) * r);
        ctx.drawImage(offscreen, ox, oy);
      }
    }

    // Overlay source-in pixel block to fill interior with premium white (#FFFFFF)
    ctx.globalCompositeOperation = "source-in";
    ctx.fillRect(0, 0, size, size);
    
    ctx.restore();

    // Overlay original clean vivid graphic back on top
    ctx.drawImage(offscreen, 0, 0);
  };

  // Step 3-3 Canvas dilation / contour boundary expansion algorithm (10px crisp white border)
  const drawStickerWithContour = () => {
    const canvas = stickerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 180;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Create offline/in-memory canvas to draw the raw clean subject vector with color
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const octx = offscreen.getContext("2d");
    if (!octx) return;

    if (uploadedImageUrl) {
      const img = new Image();
      img.src = uploadedImageUrl;
      img.onload = () => {
        octx.save();
        
        // Draw matching crisp shield contour / organic round card
        octx.beginPath();
        octx.arc(size / 2, size / 2, 52, 0, Math.PI * 2);
        octx.clip();
        
        // Render photo centered inside
        const imgSize = Math.max(img.width, img.height);
        const scale = 104 / imgSize;
        const dw = img.width * scale;
        const dh = img.height * scale;
        octx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        
        octx.restore();

        // Outline badge border
        octx.strokeStyle = "#8E7C66";
        octx.lineWidth = 4;
        octx.beginPath();
        octx.arc(size / 2, size / 2, 52, 0, Math.PI * 2);
        octx.stroke();

        renderBorders(offscreen, ctx, size);
      };
    } else {
      // Draw standard pre-defined system SVG path
      octx.translate(size / 2, size / 2);
      octx.scale(1.4, 1.4); // Scale up graphic
      octx.lineWidth = 4;
      octx.lineCap = "round";
      octx.lineJoin = "round";
      octx.strokeStyle = activeItem.color;
      octx.fillStyle = activeItem.color + "1A"; // subtle color fill

      const path = new Path2D(activeItem.svgPath.trim());
      octx.translate(-50, -55); // Adjust offset to center
      
      octx.shadowColor = "transparent";
      octx.shadowBlur = 0;
      octx.fill(path);
      octx.stroke(path);

      // Draw custom sticker emoticons inside
      octx.font = "24px Inter, sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(activeItem.emoji, 50, 56);

      renderBorders(offscreen, ctx, size);
    }
  };

  // Trigger Sticker generation pipeline
  useEffect(() => {
    if (scanStep === "sticker" || scanStep === "done") {
      drawStickerWithContour();
    }
  }, [scanStep, selectedItemIndex, uploadedImageUrl]);

  // Unified Cinematic Scanner timeline driving non-blocking UI states
  const startCinematicScanner = (sourceBaseUrl: string, width?: number, height?: number) => {
    setIsCapturing(true);
    setScanStep("scanning");
    setShutterFlash(true);
    setAlignedCutoutUrl(null);
    setFlightCutoutUrl(null);
    setTransparentCutoutUrl(null);
    setPaddedCutoutUrl(null);
    setGeneratedStickerUrl(null);

    // Warm up the AI pipeline in a parallel background worker promise
    console.log("[CinematicScanner] Submitting image content to the background segmenter thread...");
    runStickerPipeline(sourceBaseUrl, width, height);

    // Fade out white screen shutter flash over 180ms
    setTimeout(() => {
      setShutterFlash(false);
    }, 180);
  };

  // Watcher: Monitor when both local AI cutout calculation resides, stage enters 'sticker', and white border trace is completed!
  useEffect(() => {
    if (scanStep === "sticker" && generatedStickerUrl && traceCompleted) {
      console.log("[Watcher] AI Sticker is ready and trace is completed! Scheduling done settle timeout.");
      const timer = setTimeout(() => {
        setScanStep("done");
        setIsCapturing(false);
      }, 520); // Snappy tactile bounce settling animation
      return () => clearTimeout(timer);
    }
  }, [scanStep, generatedStickerUrl, traceCompleted]);

  // Bulletproof fallback: Ensure traceCompleted becomes true after entering 'sticker' step
  useEffect(() => {
    if (scanStep === "sticker" && stickerSizeSettled && !traceCompleted) {
      const timer = setTimeout(() => {
        setTraceCompleted(true);
      }, 900); // Safety timeout starts only after the cutout has settled at final size.
      return () => clearTimeout(timer);
    }
  }, [scanStep, stickerSizeSettled, traceCompleted]);

  // Storage Location classification assistant
  const handleStorageLocationClassification = async (imageSrc: string, phase: "sub" | "parent") => {
    const startTime = Date.now();
    let detectedName = "";
    
    try {
      // Query the Cloudflare Worker for location classification
      console.log(`[Storage AI] Requesting classification for ${phase} location directly to Worker...`);
      const result = await classifyLocation(imageSrc, phase, parentLocationName);
      detectedName = result.name;
      console.log(`[Storage AI] Successfully identified: ${detectedName}`);
    } catch (err) {
      console.warn("[Storage AI] Error or rate limit calling Worker vision API:", err);
    }

    // Smart fallback if the Worker returned empty or failed
    if (!detectedName) {
      const itemKey = activeItem.id;
      if (phase === "sub") {
        if (itemKey === "camera") detectedName = isChinese ? "书桌" : "Desk";
        else if (itemKey === "mug") detectedName = isChinese ? "茶几" : "Tea table";
        else if (itemKey === "keys") detectedName = isChinese ? "玄关收纳盘" : "Tray";
        else if (itemKey === "book") detectedName = isChinese ? "书架" : "Bookshelf";
        else detectedName = isChinese ? "床头柜" : "Bedside table";
      } else {
        if (itemKey === "camera" || itemKey === "keys") detectedName = isChinese ? "书房" : "Study Room";
        else if (itemKey === "mug") detectedName = isChinese ? "客厅" : "Living Room";
        else detectedName = isChinese ? "卧室" : "Bedroom";
      }
    }

    // Set target state
    if (phase === "sub") {
      setSubLocationName(detectedName);
    } else {
      setParentLocationName(detectedName);
    }

    // Maintain particle scanner for at least 2.2 seconds to allow perfect visual pacing
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, 2200 - elapsed);
    setTimeout(() => {
      if (phase === "sub") {
        setStorageFlowStep("sub_spot");
        setSubLocationHighlight(null);
      } else {
        setStorageFlowStep("parent_confirm");
      }
      setAiProgress(null);
    }, delay);
  };

  const confirmExistingSubLocation = () => {
    const location = selectedExistingSubLocation;
    if (!location) return;

    setSubLocationName(location.name);
    setSubLocationImg(location.imgUrl);
    setSubLocationHighlight(null);
    setIsUsingExistingSubLocation(true);
    setParentLocationName(location.parentName);
    if (location.parentImgUrl) {
      setParentLocationImg(location.parentImgUrl);
      setIsUsingExistingParentLocation(true);
    }
    setSelectedExistingSubKey(location.key);
    const matchingParent = existingParentLocations.find((parent) => parent.name === location.parentName);
    if (matchingParent) {
      setSelectedExistingParentKey(matchingParent.key);
    }
    setExpandedExistingLocationPicker(null);
    setStorageFlowStep("sub_spot");
  };

  const confirmExistingParentLocation = () => {
    const location = selectedExistingParentLocation;
    if (!location) return;

    setParentLocationName(location.name);
    setParentLocationImg(location.imgUrl);
    setIsUsingExistingParentLocation(true);
    setSelectedExistingParentKey(location.key);
    setExpandedExistingLocationPicker(null);
    setStorageFlowStep("final_result");
  };

  const isResultLocationExisting = (field: ResultLocationField) =>
    field === "parent" ? isUsingExistingParentLocation : isUsingExistingSubLocation;

  const openResultLocationPicker = (field: ResultLocationField) => {
    setEditingResultLocationField(null);
    setIsEditingPrice(false);
    setResultLocationPicker(field);
  };

  const startResultLocationEditing = (field: ResultLocationField) => {
    if (isResultLocationExisting(field)) return;
    setResultLocationPicker(null);
    setEditingResultLocationField(field);
  };

  const closeResultLocationEditor = () => {
    setEditingResultLocationField(null);
  };

  const handleResultLocationChange = (value: string) => {
    if (!editingResultLocationField) return;
    if (editingResultLocationField === "parent") {
      setParentLocationName(value);
    } else {
      setSubLocationName(value);
    }
  };

  const chooseResultLocation = (
    field: ResultLocationField,
    option:
      | { type: "new"; draft: ResultLocationDraft }
      | { type: "existing"; option: ExistingSubLocationOption | ExistingParentLocationOption }
  ) => {
    if (option.type === "new") {
      if (field === "sub") {
        setSubLocationName(option.draft.name);
        setSubLocationImg(option.draft.imgUrl);
        setIsUsingExistingSubLocation(false);
        setSelectedExistingSubKey(null);
      } else {
        setParentLocationName(option.draft.name);
        setParentLocationImg(option.draft.imgUrl);
        setIsUsingExistingParentLocation(false);
        setSelectedExistingParentKey(null);
      }
      setResultLocationPicker(null);
      return;
    }

    if (field === "sub") {
      const location = option.option as ExistingSubLocationOption;
      setSubLocationName(location.name);
      setSubLocationImg(location.imgUrl);
      setSubLocationHighlight(null);
      setIsUsingExistingSubLocation(true);
      setSelectedExistingSubKey(location.key);
      setParentLocationName(location.parentName);
      setParentLocationImg(location.parentImgUrl || FALLBACK_LOCATION_IMAGE_URL);
      setIsUsingExistingParentLocation(true);
      const matchingParent = existingParentLocations.find((parent) => parent.name === location.parentName);
      setSelectedExistingParentKey(matchingParent?.key || location.parentName);
    } else {
      const location = option.option as ExistingParentLocationOption;
      setParentLocationName(location.name);
      setParentLocationImg(location.imgUrl);
      setIsUsingExistingParentLocation(true);
      setSelectedExistingParentKey(location.key);
    }

    setResultLocationPicker(null);
  };

  const renderResultLocationRow = ({
    field,
    name,
    label,
  }: {
    field: ResultLocationField;
    name: string;
    label: string;
  }) => {
    const isExisting = isResultLocationExisting(field);
    const isEditing = editingResultLocationField === field;
    const switchOptions = field === "parent" ? existingParentLocations : existingSubLocations;
    const showSwitchButton = switchOptions.length > 0;
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={isExisting ? undefined : () => startResultLocationEditing(field)}
          className={`min-w-0 max-w-full bg-transparent p-0 text-left font-sans tracking-tight ${
            field === "parent"
              ? "text-[22px] font-extrabold"
              : "text-[18px] font-medium"
          } ${isExisting ? "cursor-default" : "cursor-text"}`}
          aria-label={isExisting ? label : `Edit ${label}`}
        >
          <span className={`inline-flex max-w-full items-center ${isExisting ? "" : "border-b border-[#E9E6E1]"}`}>
            <span className="truncate">{name || label}</span>
            {isEditing && (
              <span className="ml-[2px] inline-block h-[21px] w-[2px] shrink-0 bg-[#232121] align-[-3px] animate-cursor-blink-black" />
            )}
          </span>
        </button>
        {showSwitchButton && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openResultLocationPicker(field);
            }}
            className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full active:scale-95"
            aria-label={`Switch ${label}`}
            title={`Switch ${label}`}
          >
            <TagSwitchIcon />
          </button>
        )}
      </div>
    );
  };

  const renderResultLocationPicker = () => {
    if (!resultLocationPicker) return null;

    const field = resultLocationPicker;
    const newDraft = field === "parent" ? newParentLocationDraft : newSubLocationDraft;
    const existingOptions = field === "parent" ? existingParentLocations : existingSubLocations;
    const selectedKey = field === "parent" ? selectedExistingParentKey : selectedExistingSubKey;
    const title = field === "parent" ? "Space" : "Sub-Space";
    const listTitle = "Existing Space";
    const newSpaceTitle = "New";

    return (
      <AnimatePresence>
        <motion.div
          key={`result-location-picker-${field}`}
          className="absolute inset-0 z-[110] flex items-end justify-center bg-black/20 px-[15px] pb-8 backdrop-blur-[5px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setResultLocationPicker(null)}
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
                onClick={() => setResultLocationPicker(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#232121]/55 active:scale-95"
                aria-label="Close space picker"
              >
                <CloseIcon className="h-[18px] w-[18px] text-[#232121]/55" />
              </button>
            </div>

            {newDraft && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => chooseResultLocation(field, { type: "new", draft: newDraft })}
                  className="relative flex h-[80px] w-full items-center gap-3 overflow-hidden rounded-[16px] px-3 py-2 text-left active:scale-[0.99]"
                  style={{
                    backgroundColor: "rgba(204, 196, 191, 0.2)",
                  }}
                >
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 350 80"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect
                      x="1.25"
                      y="1.25"
                      width="347.5"
                      height="77.5"
                      rx="16"
                      fill="none"
                      stroke="rgb(204, 196, 189)"
                      strokeWidth="2.5"
                      strokeDasharray="5 8"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <img
                    src={newDraft.imgUrl}
                    alt={newDraft.name || newSpaceTitle}
                    className="h-[60px] w-[60px] shrink-0 rounded-[12px] border-[3px] border-white object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="inline-flex h-[18px] max-w-full items-center rounded-[6px] px-1.5 text-[12px] font-sans font-normal leading-none text-[#232121]/60"
                      style={{
                        background:
                          "linear-gradient(to bottom left, rgb(245, 181, 217) 0%, rgb(255, 199, 166) 66%, rgb(161, 235, 217) 100%)",
                      }}
                    >
                      {newSpaceTitle}
                    </span>
                    <span className="mt-1 block truncate text-[16px] font-sans font-semibold text-[#232121]">
                      {newDraft.name || "Untitled Space"}
                    </span>
                  </span>
                  <SelectorSelectedIcon selected={!isResultLocationExisting(field)} />
                </button>
              </div>
            )}

            <div className="max-h-[calc(78vh-170px)] space-y-2 overflow-y-auto no-scrollbar">
              {existingOptions.length > 0 && (
                <div className="pt-2">
                  <div className="mb-2 px-1 text-[14px] font-sans font-normal tracking-tight text-[#232121]/50">
                    {listTitle}
                  </div>
                  <div className="space-y-2">
                    {existingOptions.map((option) => {
                      const isSelected = selectedKey === option.key && isResultLocationExisting(field);
                      return (
                        <button
                          type="button"
                          key={option.key}
                          onClick={() => chooseResultLocation(field, { type: "existing", option })}
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
                              {option.itemCount} {option.itemCount === 1 ? "item" : "items"}
                            </span>
                          </span>
                          <SelectorSelectedIcon selected={isSelected} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!newDraft && existingOptions.length === 0 && (
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

  // Transition controller
  const handleCapture = async () => {
    if (isCapturing) return;

    if (storageFlowStep === "sub_capture") {
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 180);
      let frame = captureVideoFrame();
      if (!frame) {
        // High fidelity fallback bedroom table nightstand
        frame = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=600&auto=format&fit=crop";
      }
      setIsUsingExistingSubLocation(false);
      setSubLocationImg(frame);
      setStorageFlowStep("sub_scanning");
      setAiProgress(isChinese ? "正在分析收纳空间..." : "Analyzing storage spot...");
      handleStorageLocationClassification(frame, "sub");
      return;
    }

    if (storageFlowStep === "parent_capture") {
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 180);
      let frame = captureVideoFrame();
      if (!frame) {
        // High fidelity fallback cozy bedroom scene
        frame = "https://images.unsplash.com/photo-1540518614846-7eded433c457?q=80&w=600&auto=format&fit=crop";
      }
      setIsUsingExistingParentLocation(false);
      setParentLocationImg(frame);
      setStorageFlowStep("parent_scanning");
      setAiProgress(isChinese ? "正在分析全景环境..." : "Analyzing wider scene...");
      handleStorageLocationClassification(frame, "parent");
      return;
    }

    // Capture current snapshot of photo context
    let sourceBaseUrl = "";
    let width = 500;
    let height = 500;
    let isPreset = false;
    if (cameraActive && videoRef.current) {
      sourceBaseUrl = captureVideoFrame() || "";
      width = videoRef.current.videoWidth || 640;
      height = videoRef.current.videoHeight || 480;
      if (sourceBaseUrl) {
        setUploadedImageUrl(sourceBaseUrl);
        setUploadedNaturalWidth(width);
        setUploadedNaturalHeight(height);
      }
    }
    
    // Fall back to preset SVG vectors if camera is disabled
    if (!sourceBaseUrl) {
      sourceBaseUrl = await generatePresetTransparentImage();
      width = 180;
      height = 180;
      isPreset = true;
    }

    if (isPreset) {
      classificationRequestIdRef.current += 1;
      classificationPromiseRef.current = null;
      commitPreparedTitle(activeItem.name);
      setTempIdentifiedCategory("");
    } else {
      setCustomName("");
      setCustomCategory(isChinese ? "其它" : "Others");
      setTempIdentifiedCategory("");
      // Start classification immediately on capture!
      startImageClassification(sourceBaseUrl, "camera_capture.png");
    }

    startCinematicScanner(sourceBaseUrl, width, height);
  };

  // 🌟 重新编写一个高性能、绝不爆栈的白边绘制辅助函数
  const drawFastStickerWithBorder = (
    imgElement: HTMLImageElement,
    targetWidth: number,
    targetHeight: number,
    borderWidth: number = 12,
    borderColor: string = "#FFFFFF"
  ): string => {
    // 创建一个略大一点的画布，给白边和阴影留足空间
    const padding = borderWidth + 15;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth + padding * 2;
    canvas.height = targetHeight + padding * 2;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) return imgElement.src;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 第一步：利用 Canvas 矩阵阴影和多重描边，在底层瞬间画出雪白的厚边
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;

    // 用多层 Stroke 堆叠形成平滑饱满的实体白色描边（完美避开逐像素递归计算）
    ctx.strokeStyle = borderColor;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    
    // 从大到小绘制多层描边，确保边缘完全被实体白色填满
    for (let w = borderWidth * 2; w > 0; w -= 4) {
      ctx.lineWidth = w;
      ctx.drawImage(imgElement, padding, padding, targetWidth, targetHeight);
      ctx.globalCompositeOperation = "source-over";
      
      // 借用一个临时 Canvas 快速生成轮廓实体，或者直接用原生高频多重 Stroke
      // 这里通过在多角度重复绘制图案本身来完美平替传统的耗时像素检索
      for (let degree = 0; degree < 360; degree += 45) {
        const rad = (degree * Math.PI) / 180;
        const dx = Math.cos(rad) * (borderWidth / 2);
        const dy = Math.sin(rad) * (borderWidth / 2);
        ctx.drawImage(imgElement, padding + dx, padding + dy, targetWidth, targetHeight);
      }
    }
    ctx.restore();

  // 第二步：将原本的透明主体图案完美覆盖在白色描边正中央
    ctx.drawImage(imgElement, padding, padding, targetWidth, targetHeight);

    return canvas.toDataURL("image/png");
  };

  // Upload classification is routed exclusively through the Cloudflare Worker.
  const classifyUploadedImage = async (imageInput: string | File, originalFileName: string, requestId: number) => {
    try {
      console.log("[Classifier] Starting image compression to maximum width 800 for optimal token economy...");
      
      const compressedWithPrefix = await prepareImage(imageInput, 800);
      let cleanedBase64 = compressedWithPrefix.includes(",") ? compressedWithPrefix.split(",")[1] : compressedWithPrefix;
      let mimeType = "image/jpeg";

      if (!cleanedBase64) {
        console.warn("[Classifier] Image compression returned empty string.");
        if (requestId === classificationRequestIdRef.current) commitPreparedTitle("Scanned Item");
        return;
      }

      // Helper to trim and limit title to strictly 1 or 2 words, while preserving Chinese/multilingual text
      const cleanAndShortenTitle = (title: string): string => {
        if (!title) return "";
        // Remove surrounding quotes, spaces, or leading/trailing punctuation safely
        let clean = title.replace(/^["'\s\.,!?#-（）()《》]+|["'\s\.,!?#-（）()《》]+$/g, '').trim();
        if (!clean) clean = title.trim();
        const words = clean.split(/\s+/);
        if (words.length > 2) {
          return words.slice(0, 2).join(" ");
        }
        return clean;
      };

      // Run image recognition using secure smart AI dispatcher
      const result = await recognizeImage(cleanedBase64, mimeType);
      if (requestId !== classificationRequestIdRef.current) return;
      console.log("[Classifier] Auto-recognition result:", result);

      if (result.title) {
        const cleanTitle = cleanAndShortenTitle(result.title);
        commitPreparedTitle(cleanTitle);
      } else {
        commitPreparedTitle("Scanned Item");
      }
      if (result.category) {
        setTempIdentifiedCategory(result.category);
        setCustomCategory(getLocalizedCategory(result.category));
      }
    } catch (err: any) {
      console.warn("[Classifier] Handled exception or rate-limit in auto-recognize item:", err.message || err);
      if (requestId === classificationRequestIdRef.current) commitPreparedTitle("Scanned Item");
    }
  };

  const startImageClassification = (imageInput: string | File, originalFileName: string) => {
    const requestId = classificationRequestIdRef.current + 1;
    classificationRequestIdRef.current = requestId;
    preparedTitleRef.current = "";
    const task = classifyUploadedImage(imageInput, originalFileName, requestId);
    classificationPromiseRef.current = task;
  };

  // Live real file uploaded event with Aoscdn API and high-fidelity Chroma Keying fallback
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (storageFlowStep === "sub_capture") {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setIsUsingExistingSubLocation(false);
        setSubLocationImg(result);
        setStorageFlowStep("sub_scanning");
        setAiProgress(isChinese ? "正在分析收纳空间..." : "Analyzing storage spot...");
        handleStorageLocationClassification(result, "sub");
      };
      reader.readAsDataURL(file);
      return;
    }

    if (storageFlowStep === "parent_capture") {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setIsUsingExistingParentLocation(false);
        setParentLocationImg(result);
        setStorageFlowStep("parent_scanning");
        setAiProgress(isChinese ? "正在分析全景环境..." : "Analyzing wider scene...");
        handleStorageLocationClassification(result, "parent");
      };
      reader.readAsDataURL(file);
      return;
    }

    setScanStep("scanning");
    setIsCapturing(true);
    setAiProgress("Compressing image for high-speed routing...");
    setAlignedCutoutUrl(null);
    setFlightCutoutUrl(null);
    setTransparentCutoutUrl(null);
    setPaddedCutoutUrl(null);
    setGeneratedStickerUrl(null);

    // Synchronously clean state and start async classification immediately on raw File in parallel!
    setCustomName("");
    setCustomCategory(isChinese ? "其它" : "Others");
    setTempIdentifiedCategory("");
    startImageClassification(file, file.name);

    // 1. 同步进行本地预览
    const localReader = new FileReader();
    localReader.readAsDataURL(file);
    localReader.onload = () => {
      const b64 = localReader.result as string;
      setUploadedImageUrl(b64);
      stopCamera();

      const img = new Image();
      img.onload = () => {
        setUploadedNaturalWidth(img.naturalWidth || img.width || 0);
        setUploadedNaturalHeight(img.naturalHeight || img.height || 0);
      };
      img.src = b64;
    };

    // 2. 核心抠图流程：采用与相机拍照一致的、支持配置切换与自动降级的抠图处理器
    const processReader = new FileReader();
    processReader.readAsDataURL(file);
    processReader.onload = () => {
      const b64 = processReader.result as string;
      
      const img = new Image();
      img.onload = async () => {
        const iw = img.naturalWidth || img.width || 500;
        const ih = img.naturalHeight || img.height || 500;
        calculateTargetScaleFromDimensions(iw, ih);

        setAiProgress(isChinese ? "正在剥离图片背景..." : "Extracting subject silhouette...");
        try {
          const transparentBase64 = await processImageForSticker(b64);
          const [alignedCutout, flightCutout, paddedCutout, finalSticker] = await Promise.all([
            generateViewportAlignedCutout(transparentBase64, iw, ih, false),
            generateFlightCutout(transparentBase64, iw, ih, false),
            generateTransparentCutoutWithPadding(transparentBase64, STICKER_BORDER_SIZE, false),
            generatePhysicalSticker(transparentBase64, STICKER_BORDER_SIZE, "#FFFFFF", false),
          ]);

          setAlignedCutoutUrl(alignedCutout);
          setFlightCutoutUrl(paddedCutout);
          setTransparentCutoutUrl(transparentBase64);
          setPaddedCutoutUrl(paddedCutout);
          setGeneratedStickerUrl(finalSticker);
          setTraceCompleted(false);
          await beginCutoutTransition(iw, ih, flightCutout.bounds);
          setAiProgress("Done");
        } catch (err: any) {
          console.error("[Background Removal] Processing failed:", err);
          // Complete fallback: use original image as transparent url
          const [flightCutout, alignedCutout, paddedCutout, finalSticker] = await Promise.all([
            generateFlightCutout(b64, iw, ih, false),
            generateViewportAlignedCutout(b64, iw, ih, false),
            generateTransparentCutoutWithPadding(b64, STICKER_BORDER_SIZE, false),
            generatePhysicalSticker(b64, STICKER_BORDER_SIZE, "#FFFFFF", false),
          ]);
          setAlignedCutoutUrl(alignedCutout);
          setFlightCutoutUrl(paddedCutout);
          setTransparentCutoutUrl(b64);
          setPaddedCutoutUrl(paddedCutout);
          setGeneratedStickerUrl(finalSticker);
          setTraceCompleted(false);
          await beginCutoutTransition(iw, ih, flightCutout.bounds);
          setAiProgress("Done");
        }
      };
      img.onerror = async () => {
        calculateTargetScaleFromDimensions(500, 500);
        const [flightCutout, alignedCutout, paddedCutout, finalSticker] = await Promise.all([
          generateFlightCutout(b64, 500, 500, false),
          generateViewportAlignedCutout(b64, 500, 500, false),
          generateTransparentCutoutWithPadding(b64, STICKER_BORDER_SIZE, false),
          generatePhysicalSticker(b64, STICKER_BORDER_SIZE, "#FFFFFF", false),
        ]);
        setAlignedCutoutUrl(alignedCutout);
        setFlightCutoutUrl(paddedCutout);
        setTransparentCutoutUrl(b64);
        setPaddedCutoutUrl(paddedCutout);
        setGeneratedStickerUrl(finalSticker);
        setTraceCompleted(false);
        await beginCutoutTransition(500, 500, flightCutout.bounds);
        setAiProgress("Done");
      };
      img.src = b64;
    };
  };

  const handleObjectConfirmed = () => {
    setStorageFlowStep("sub_capture");
  };

  // Add item save to Noma's searchable memory bank
  const handleSaveMemory = () => {
    if (onItemAdded) {
      const rawName = uploadedImageUrl ? (customName.trim() || "Uploaded Item") : activeItem.name;
      const priceCurrency = PRICE_CURRENCIES[priceCurrencyIndex];
      const formattedPrice = priceInput.trim()
        ? `${priceCurrency}${priceInput.trim()}`
        : `${priceCurrency}25.00`;
      const finalCategory = customCategory.trim() || "其它";
      
      onItemAdded({
        name: rawName,
        category: finalCategory,
        price: formattedPrice,
        date: customDate,
        emoji: uploadedImageUrl ? "🖼️" : activeItem.emoji,
        stickerUrl: generatedStickerUrl || transparentCutoutUrl || undefined,
        parentLocationName: parentLocationName.trim() || "Bedroom",
        subLocationName: subLocationName.trim() || "Drawer",
        parentLocationImg: parentLocationImg || undefined,
        subLocationImg: subLocationImg || undefined,
      });
    }
    // Close & return
    onClose();
  };

  const handleDiscardAllCaptureResults = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const handlePriceInputChange = (nextValue: string) => {
    if (/^(?=.{0,8}$)\d*(\.\d{0,2})?$/.test(nextValue)) {
      setPriceInput(nextValue);
    }
  };

  const priceCurrency = PRICE_CURRENCIES[priceCurrencyIndex];
  const cyclePriceCurrency = () => {
    setPriceCurrencyIndex((current) => (current + 1) % PRICE_CURRENCIES.length);
  };

  const finalResultDateLabel = customDate === "Today" ? "Build 3 days ago" : `Build ${customDate}`;

  const StorageRoundButton = ({
    children,
    onClick,
    title,
    variant = "light",
    className = "",
  }: {
    children: React.ReactNode;
    onClick: () => void;
    title?: string;
    variant?: "light" | "dark" | "ghost";
    className?: string;
  }) => {
    const sizeClass = variant === "dark" ? "w-[72px] h-[72px]" : "w-[62px] h-[62px]";
    const toneClass =
      variant === "dark"
        ? "bg-[#232121] text-white hover:bg-[#232121]"
        : variant === "ghost"
          ? "bg-transparent text-neutral-500 hover:text-black"
          : "bg-white text-[#232121]/50 hover:bg-neutral-100";

    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${sizeClass} rounded-full flex items-center justify-center border-0 hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer shadow-none ${toneClass} ${className}`}
      >
        {children}
      </button>
    );
  };

  const StorageActionRow = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center justify-center gap-[44px] z-30 w-full">
      {children}
    </div>
  );

  const StorageShutterButton = ({ onClick, title }: { onClick: () => void; title?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="group relative w-[72px] h-[72px] rounded-full flex items-center justify-center bg-white transition-all duration-300 hover:scale-105 active:scale-95 shadow-none cursor-pointer"
      style={{ padding: "4px" }}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-orange-400 to-red-400 opacity-90 scale-105 blur-[1.5px] transition-all group-hover:scale-110" />
      <div className="relative w-full h-full rounded-full bg-[#F3F1EC] flex items-center justify-center border-2 border-white shadow-inner">
        <div className="w-7 h-7 rounded-full bg-[#181817] border border-black/10" />
      </div>
    </button>
  );

  const StorageDrawerInput = ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => (
    <div className="relative flex-shrink-0" style={{ width: "316px", height: "56px" }}>
      <input
        type="text"
        className="w-full h-full rounded-full bg-[#232121]/[0.05] border-0 pl-8 pr-12 text-[#232121]/50 text-[13px] font-sans placeholder-[#232121]/50 font-semibold tracking-tight text-center focus:outline-none focus:ring-2 focus:ring-[#232121]/10"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#232121]/35">
        <EditPencilIcon />
      </div>
    </div>
  );

  const renderExistingLocationPickerBubble = ({
    kind,
    options,
    selectedKey,
    onSelect,
    onConfirm,
    displayOnly = false,
  }: {
    kind: "sub" | "parent";
    options: Array<{
      key: string;
      name: string;
      imgUrl: string;
      itemCount: number;
      parentName?: string;
    }>;
    selectedKey: string | null;
    onSelect: (key: string) => void;
    onConfirm: () => void;
    displayOnly?: boolean;
  }) => {
    if (!options.length) return null;

    const selected = options.find((option) => option.key === selectedKey) || options[0];
    const stackedOptions = displayOnly
      ? [selected]
      : [
          selected,
          ...options.filter((option) => option.key !== selected.key),
        ];
    const isExpanded = !displayOnly && expandedExistingLocationPicker === kind;

    return (
      <div
        className="absolute left-1/2 top-[-8px] z-[80] h-[240px] w-[330px] pointer-events-none"
        style={{ transform: `translateX(${Math.round(frontLocationBubbleWidth / 2 - 330)}px)` }}
      >
        {stackedOptions.map((option, index) => {
          const isFront = index === 0;
          const collapsedX = isFront ? 0 : 0;
          const collapsedY = isFront ? 0 : 0;
          const collapsedRotate = isFront ? 0 : 0;
          const expandedX = [0, 16, 32, 48][index] || index * 16;
          const expandedY = [0, -34, -68, -102][index] || index * -34;
          const expandedRotate = [0, 10, 19, 28][index] || index * 9;
          const handleBubbleClick = () => {
            if (displayOnly) return;
            if (isFront) {
              setExpandedExistingLocationPicker(isExpanded ? null : kind);
            } else {
              onSelect(option.key);
              setExpandedExistingLocationPicker(null);
            }
          };

          return (
            <motion.div
              key={option.key}
              className="absolute right-0 top-0 inline-flex h-[56px] pointer-events-auto"
              style={{
                zIndex: 30 - index,
                transformOrigin: "calc(100% - 42px) 50%",
                pointerEvents: displayOnly || isExpanded || isFront ? "auto" : "none",
              }}
              initial={false}
              animate={{
                x: isExpanded ? expandedX : collapsedX,
                y: isExpanded ? expandedY : collapsedY,
                rotate: isExpanded ? expandedRotate : collapsedRotate,
                scale: isExpanded ? 1 : isFront ? 1 : 0.01,
                // Keep every filtered card painted from the first frame; expansion only moves it.
                opacity: 1,
              }}
              transition={{
                type: "spring",
                stiffness: 210,
                damping: 24,
                mass: 0.78,
                restDelta: 0.001,
                delay: isExpanded ? index * 0.045 : (stackedOptions.length - index) * 0.016,
              }}
            >
              <div
                ref={(node) => {
                  if (!isFront || !node) return;
                  const nextWidth = node.offsetWidth;
                  if (nextWidth > 0 && Math.abs(nextWidth - frontLocationBubbleWidth) > 1) {
                    window.requestAnimationFrame(() => setFrontLocationBubbleWidth(nextWidth));
                  }
                }}
                className="inline-flex h-[56px] max-w-[300px] items-center rounded-full border border-white/35 bg-[#E9E6E1]/50 py-0 pl-[7px] pr-[7px] shadow-[0_12px_34px_rgba(0,0,0,0.16)] backdrop-blur-xl will-change-transform"
                onClick={handleBubbleClick}
                style={{
                  WebkitBackdropFilter: "blur(18px)",
                  backdropFilter: "blur(18px)",
                  backfaceVisibility: "hidden",
                  transform: "translateZ(0)",
                  willChange: "transform, opacity, backdrop-filter",
                }}
              >
                <img
                  src={option.imgUrl}
                  alt={option.name}
                  className="h-[43px] w-[43px] shrink-0 rounded-[8px] border-[2.5px] border-white object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleBubbleClick();
                  }}
                  className={`flex min-w-0 max-w-[226px] items-center rounded-full bg-transparent pl-3 text-left ${displayOnly ? "cursor-default" : "active:scale-[0.99]"} ${displayOnly || !isFront ? "pr-4" : "pr-3"}`}
                  aria-expanded={isFront ? isExpanded : undefined}
                >
                  <span className="truncate font-sans text-[19px] font-medium leading-none text-[#232121]">
                    {option.name}
                  </span>
                </button>

                {!displayOnly && isFront && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onConfirm();
                    }}
                    className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[#232121] text-white active:scale-95"
                    aria-label={`Use existing ${kind === "sub" ? "sub location" : "parent location"}`}
                    title={`Use existing ${kind === "sub" ? "little home" : "scene"}`}
                  >
                    <Check className="h-[18px] w-[18px] stroke-[4]" />
                  </button>
                )}
                {!displayOnly && !isFront && (
                  <div className="h-[33px] w-[33px] shrink-0" aria-hidden="true" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderPriceKeyboard = () => {
    return (
      <div className="capture-price-keyboard-panel w-full bg-[#E9E6E1] border-t border-black/5 px-4 pt-4 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.12)]">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={cyclePriceCurrency}
              className="h-10 min-w-[48px] px-3 rounded-full bg-[#232121] text-white text-[17px] font-sans font-bold active:scale-95 transition-transform"
              aria-label={`Switch currency symbol, current ${priceCurrency}`}
              title="Switch currency"
            >
              {priceCurrency}
            </button>
            <div className="h-10 min-w-[112px] px-5 rounded-full bg-white/80 flex items-center justify-center text-[#232121] text-[18px] font-sans font-bold">
              {priceCurrency}{priceInput || "0.00"}
            </div>
            <button
              type="button"
              onClick={() => setIsEditingPrice(false)}
              className="h-10 px-5 rounded-full bg-[#232121] text-white text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >
              Done
            </button>
          </div>
          <VirtualKeyboard
            mode="numeric"
            value={priceInput}
            onChange={handlePriceInputChange}
            onKeyPress={() => {}}
            onBackspace={() => setPriceInput((current) => current.slice(0, -1))}
            onSpace={() => {}}
            onSend={() => setIsEditingPrice(false)}
            onDismiss={() => setIsEditingPrice(false)}
            className="capture-price-simple-keyboard"
          />
        </div>
      </div>
    );
  };

  const renderResultLocationKeyboard = () => {
    if (!editingResultLocationField) return null;
    const value = editingResultLocationField === "parent" ? parentLocationName : subLocationName;
    const isParentField = editingResultLocationField === "parent";

    return (
      <div className="capture-price-keyboard-panel w-full bg-[#E9E6E1] border-t border-black/5 px-4 pt-4 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.12)]">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={closeResultLocationEditor}
              className="h-10 px-4 rounded-full bg-white/80 text-[#232121] text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >
              Cancel
            </button>
            <div className="h-10 min-w-[112px] px-5 rounded-full bg-white/80 flex items-center justify-center text-[#232121] text-[18px] font-sans font-bold">
              {value || (isParentField ? "Parent Location" : "Sub Location")}
            </div>
            <button
              type="button"
              onClick={() => {
                closeResultLocationEditor();
                setResultLocationPicker(editingResultLocationField);
              }}
              className="h-10 px-4 rounded-full bg-[#232121] text-white text-[14px] font-sans font-semibold active:scale-95 transition-transform"
            >
              Switch
            </button>
          </div>
          <VirtualKeyboard
            value={value}
            onChange={handleResultLocationChange}
            onKeyPress={(char) => handleResultLocationChange(`${value}${char}`)}
            onBackspace={() => handleResultLocationChange(value.slice(0, -1))}
            onSpace={() => handleResultLocationChange(`${value} `)}
            onSend={() => closeResultLocationEditor()}
            onDismiss={() => closeResultLocationEditor()}
            sendLabel="Done"
            className="capture-price-simple-keyboard"
          />
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="camera-page-container camera-wrapper absolute inset-0 bg-[#161616] z-50 overflow-hidden select-none animate-fade-in pb-0"
      style={{ height: "var(--app-height, 100vh)", paddingBottom: "0px" }}
    >
	      {/* Hidden element to force immediate pre-loading and browser initialization of the Alkatra font */}
	      <span className="font-alkatra opacity-0 absolute pointer-events-none select-none w-1 h-1 overflow-hidden" aria-hidden="true">AI</span>

	      {/* 1. FULL VIEWPORT CAMERA FEED AND AR CANVASES (Paddings removed to allow full upper stretch) */}
      <div className="absolute inset-0 bg-[#161616] flex flex-col items-center justify-center text-center w-full">
        
        {/* Hidden upload file input element */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Top Header Guidelines Title overlay */}
        {storageFlowStep === "none" && scanStep === "viewport" && !cameraViewportUnavailable && (
          <div className="capture-top-prompt absolute top-[calc(max(56px,env(safe-area-inset-top))+36px)] inset-x-6 z-20 flex flex-col items-center pointer-events-none">
            <h3 
              id="camera-guide-title"
              className="text-white text-[20px] font-sans font-medium tracking-tight text-center max-w-[240px] leading-snug"
            >
              Show me what you want to remember.
            </h3>
          </div>
        )}

        {/* Full-bleed active container spanning whole upper viewport and extending 44px deep behind bottom sheet */}
        <div 
          id="camera-view"
          className="absolute inset-0 flex items-center justify-center"
          style={{
            bottom: `${cameraViewBottomOffset}px`,
            backgroundColor: scanStep === "disintegrating" || scanStep === "sticker" || scanStep === "done" ? "#E9E6E1" : "#161616",
            transition: "background-color 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Direct hardware lens shutter click visual flare overlay */}
          <div 
            className={`absolute inset-0 bg-white z-[60] pointer-events-none transition-opacity duration-300 ease-out ${
              shutterFlash ? "opacity-100" : "opacity-0"
            }`}
          />
          {/* CAMERA ERROR DISPLAY OR FALLBACK SIMULATOR BACKGROUND */}
          {storageFlowStep === "none" && scanStep === "viewport" && (
            <div 
              className="absolute top-0 left-0 w-full overflow-hidden flex items-center justify-center bg-[#161616]"
              style={{ height: "100%" }}
            >
              {uploadedImageUrl ? (
                <img
                  src={uploadedImageUrl}
                  alt="uploaded preview"
                  className="absolute w-full h-full object-cover"
                />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className={`absolute inset-0 block w-full h-full object-cover object-center ${cameraActive ? "opacity-100" : "opacity-0"}`}
                    autoPlay
                    playsInline
                    muted
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", minWidth: "100%", minHeight: "100%", maxWidth: "none", maxHeight: "none", objectFit: "cover", objectPosition: "center", display: "block" }}
                  />
                  {!cameraActive && <div className="absolute inset-0 bg-[#161616]" />}
                </>
              )}

              {cameraPermissionUnavailable && cameraErrorMessage && (
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 z-40 flex items-center justify-center text-center">
                  <p className="max-w-[300px] text-white/80 text-[20px] leading-snug font-sans">
                    {cameraErrorMessage}
                  </p>
                </div>
              )}

              {/* Viewport Center-Focusing Corners reticle box */}
              <div
                className={`absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20 ${cameraViewportUnavailable ? "hidden" : ""}`}
                style={{ bottom: `${focusReticleInsetBottom}px` }}
              >
                <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                  <svg width="164" height="164" viewBox="0 0 164 164" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 150.5V142.375H3V150.5C3 156.299 7.70101 161 13.5 161H21.625V164H13.5C6.04416 164 0 157.956 0 150.5ZM161 150.5V142.375H164V150.5C164 157.956 157.956 164 150.5 164H142.375V161H150.5C156.299 161 161 156.299 161 150.5ZM0 13.5C0 6.04416 6.04416 0 13.5 0H21.625V3H13.5C7.70101 3 3 7.70101 3 13.5V21.625H0V13.5ZM161 13.5C161 7.70101 156.299 3 150.5 3H142.375V0H150.5C157.956 0 164 6.04416 164 13.5V21.625H161V13.5Z" fill="white"/>
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* PHASE 3-1: Active scanning particle canvas overlay */}
          {storageFlowStep === "none" && scanStep === "scanning" && (
            <div 
              className="absolute top-0 left-0 w-full overflow-hidden bg-[#1F1F1E] z-10"
              style={{ height: "100%" }}
            >
              {/* Display original video feed or uploaded custom photo */}
              {uploadedImageUrl ? (
                <img
                  src={uploadedImageUrl}
                  alt="scanning upload container"
                  className="absolute w-full h-full object-cover"
                />
              ) : cameraActive ? (
                <video
                  ref={videoRef}
                  className="absolute w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                // Elegant visual simulator backdrop if standard stream isn't permitted
                <div 
                  className="absolute flex flex-col items-center justify-center bg-gradient-to-b from-[#2E2D2C] to-[#1A1918]"
                  style={{
                    left: `${layout.left}px`,
                    top: `${layout.top}px`,
                    width: `${layout.width}px`,
                    height: `${layout.height}px`,
                  }}
                >
                  <span className="text-[72px] animate-pulse">{activeItem.emoji}</span>
                  <span className="text-white/30 text-xs mt-3 font-mono">{activeItem.name}</span>
                </div>
              )}
              
              {/* Canvas particles layered on top */}
              <canvas 
                ref={particlesCanvasRef} 
                className="absolute inset-0 w-full h-full pointer-events-none z-[8] animate-fade-in-slow" 
              />
            </div>
          )}

          {/* PHASE 3-2: Disintegrating Background pixelate dissolution canvas overlay */}
          {storageFlowStep === "none" && scanStep === "disintegrating" && (
            <div 
              className="absolute inset-0 z-10 w-full h-full overflow-hidden bg-[#E9E6E1]"
            >
              <canvas 
                ref={pixelateCanvasRef} 
                className="absolute inset-0 w-full h-full pointer-events-none" 
              />

              {/* The result decoration fades in exactly when the cutout begins its return. */}
              <div
                className="absolute left-1/2 z-10 flex items-center justify-center pointer-events-none select-none"
                style={{
                  top: `${targetCenterY}px`,
                  width: "300px",
                  height: "300px",
                  transform: `translate(calc(-50% + ${RESULT_STICKER_CENTER_OFFSET_X}px), -50%)`,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: COLOR_BLUR_SIZE,
                    height: COLOR_BLUR_SIZE,
                    marginLeft: "8px",
                    opacity: isResultDecorationVisible && isColorBlurReady ? 1 : 0,
                    transition: "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                    willChange: "opacity",
                  }}
                >
                  <img
                    src={COLOR_BLUR_IMAGE_URL}
                    alt=""
                    aria-hidden="true"
                    onLoad={() => setIsColorBlurReady(true)}
                    className="block h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Cutout subject shrinks smoothly to its target place while disintegration particles disperse concurrently! */}
              {cutoutFlightImageUrl && (
                <div 
                  ref={cutoutFlightRef}
                  key={`cutout-flight-${uploadedImageUrl ? "upload" : "capture"}-${selectedItemIndex}-${scanStep}`}
                  className="absolute pointer-events-none flex items-center justify-center z-20"
                  style={{
                    left: `${cutoutFlightSourceRect.left}px`,
                    top: `${cutoutFlightSourceRect.top}px`,
                    width: `${cutoutFlightSourceRect.width}px`,
                    height: `${cutoutFlightSourceRect.height}px`,
                    transformOrigin: "center center",
                    transform: "translate3d(0px, 0px, 0px) scale(1)",
                    willChange: "transform",
                  }}
                >
                  <img
                    src={cutoutFlightImageUrl}
                    alt="Shrinking cutout subject"
                    className="absolute inset-0 w-full h-full object-fill z-[12]"
                    referrerPolicy="no-referrer"
                  />
                  {generatedStickerUrl && (
                    <img
                      src={generatedStickerUrl}
                      alt="Returning outlined subject"
                      className={`absolute inset-0 z-20 h-full w-full object-fill ${
                        traceCompleted ? "opacity-100" : "opacity-0"
                      }`}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {!traceCompleted && (
                    <canvas
                      ref={outlineTraceCanvasRef}
                      className="absolute inset-0 z-30 h-full w-full pointer-events-none"
                    />
                  )}
                </div>
              )}

              <div
                className="absolute left-1/2 z-30 pointer-events-none select-none"
                style={{
                  top: `${targetCenterY}px`,
                  width: `${RESULT_STICKER_VISUAL_SIZE}px`,
                  height: `${RESULT_STICKER_VISUAL_SIZE}px`,
                  transform: `translate(calc(-50% + ${RESULT_STICKER_CENTER_OFFSET_X}px), -50%)`,
                }}
              >
                <div
                  className="absolute text-center z-20 font-alkatra overflow-visible"
                  style={resultTitleOverlayStyle}
                >
                  {stickerTitleLines.map((line, index) => (
                    <span
                      key={`${line}-${index}`}
                      className="block w-full whitespace-normal break-words"
                      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PHASE 3-3: Sticker settled view on low-saturation beautiful beige display bed */}
          {storageFlowStep === "none" && (scanStep === "sticker" || scanStep === "done") && (
            <div 
              className="absolute inset-0 transition-all duration-700 ease-out z-20 w-full h-full overflow-hidden"
              style={{
                backgroundColor: "#E9E6E1", 
              }}
            >
              {/* Dot matrix decorative background - fades in on results page */}
              <img 
                src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png"
                alt="Background dot grid"
                className="absolute inset-0 w-full h-full object-cover opacity-[0.25] mix-blend-multiply pointer-events-none select-none z-0 animate-fade-in"
                referrerPolicy="no-referrer"
              />

              {/* Upper static container for the sticker so it NEVER shifts under any circumstance */}
              <div 
                className="absolute left-1/2 flex items-center justify-center z-10"
                  style={{
                    top: `${targetCenterY}px`,
                    width: "300px",
                    height: "300px",
                    transform: `translate(calc(-50% + ${RESULT_STICKER_CENTER_OFFSET_X}px), -50%)`
                  }}
              >

                <div
                  className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                  style={{
                    width: COLOR_BLUR_SIZE,
                    height: COLOR_BLUR_SIZE,
                    marginLeft: "8px",
                    opacity: isResultDecorationVisible && isColorBlurReady ? 1 : 0,
                    transition: "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                    willChange: "opacity",
                  }}
                >
                  <img
                    src={COLOR_BLUR_IMAGE_URL}
                    alt=""
                    aria-hidden="true"
                    onLoad={() => setIsColorBlurReady(true)}
                    className="block h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Sticker element wrapper kept upright to avoid a rotation jump after the cutout flight. */}
                <div
                  className="relative flex items-center justify-center z-10"
                  style={{
                    width: `${RESULT_STICKER_VISUAL_SIZE}px`,
                    height: `${RESULT_STICKER_VISUAL_SIZE}px`,
                  }}
                >
                  {(cutoutFlightImageUrl || paddedCutoutUrl || transparentCutoutUrl) ? (
                    <div
                      className="relative flex items-center justify-center"
                      style={{ width: `${RESULT_STICKER_VISUAL_SIZE}px`, height: `${RESULT_STICKER_VISUAL_SIZE}px` }}
                    >
                      <img
                        src={cutoutFlightImageUrl || paddedCutoutUrl || transparentCutoutUrl || ""}
                        alt="Cutout Subject"
                        className="w-full h-full object-contain block select-none pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                      {generatedStickerUrl && (
                        <img
                          id="final-sticker-view"
                          src={generatedStickerUrl}
                          alt="Physical Contour Cutout Sticker"
                          className={`absolute inset-0 z-20 h-full w-full object-contain block select-none cursor-grab ${
                            traceCompleted ? "opacity-100" : "opacity-0"
                          }`}
                          style={{ filter: "none" }}
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {!traceCompleted && (
                        <canvas
                          ref={outlineTraceCanvasRef}
                          className="absolute inset-0 w-full h-full pointer-events-none z-30"
                        />
                      )}
                    </div>
                  ) : generatedStickerUrl ? (
                    <img
                      id="final-sticker-view"
                      src={generatedStickerUrl}
                      alt="Physical Contour Cutout Sticker"
                      className="w-full h-full object-contain block select-none cursor-grab"
                      style={{ filter: "none" }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center bg-white/95 rounded-full border-4 border-[#8E7C66]/30 p-5 shadow-sm text-center animate-pulse"
                      style={{ width: `${RESULT_STICKER_VISUAL_SIZE}px`, height: `${RESULT_STICKER_VISUAL_SIZE}px` }}
                    >
                      <div className="w-10 h-10 rounded-full border-[3px] border-[#8D7D66]/20 border-t-[#8D7D66] animate-spin mb-3" />
                      <span id="final-sticker-loader-label" className="text-[11px] font-mono font-bold text-[#3E3C3A] leading-tight uppercase tracking-wider block">
                        {aiProgress || "AI Loading..."}
                      </span>
                      <span className="text-[8px] text-[#8E7C66]/70 font-mono mt-1 block uppercase tracking-wider">
                        Please Hold Steady
                      </span>
                    </div>
                  )}

                  <div
                    className="absolute text-center pointer-events-none select-none z-30 font-alkatra overflow-visible"
                    style={resultTitleOverlayStyle}
                  >
                    {stickerTitleLines.map((line, index) => (
                      <span
                        key={`${line}-${index}`}
                        className="block w-full whitespace-normal break-words"
                        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 🌟 识别出来归类的分类为一个白色小标签，位置上移，离标题更近，且描边结束后淡入 */}
                {(traceCompleted || scanStep === "done") && customCategory && (
                  <>
                    {/* Background Backdrop for fanned list when open - kept invisible for closing on outside click */}
                    <AnimatePresence>
                      {isCategorySelectorOpen && (
                        <motion.div 
                          className="absolute inset-0 z-15 pointer-events-auto"
                          style={{
                            width: "320px",
                            height: "320px",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setIsCategorySelectorOpen(false)}
                        />
                      )}
                    </AnimatePresence>

                    {/* Fanned-out Category Options */}
                    <AnimatePresence>
                      {isCategorySelectorOpen && 
                        (() => {
                          const currentList = [...ALL_CATEGORIES];
                          if (customCategory && !currentList.includes(customCategory)) {
                            currentList[currentList.length - 1] = customCategory;
                          }
                          const otherCategories = currentList.filter(cat => cat !== customCategory).slice(0, 4);
                          return otherCategories.map((cat, idx) => {
                            const pos = FAN_POSITIONS[idx] || { x: 0, y: 0, r: 0 };
                            return (
                              <motion.div
                                key={cat}
                                className="absolute left-1/2 top-1/2 z-30 cursor-pointer pointer-events-auto"
                                style={{}}
                                initial={{
                                  x: 0,
                                  y: 178,
                                  scale: 0.3,
                                  opacity: 0,
                                  rotate: 0,
                                }}
                                animate={{
                                  x: pos.x,
                                  y: pos.y,
                                  scale: 1,
                                  opacity: 1,
                                  rotate: pos.r,
                                }}
                                exit={{
                                  x: 0,
                                  y: 178,
                                  scale: 0.3,
                                  opacity: 0,
                                  rotate: 0,
                                }}
                                transition={{
                                  type: "spring",
                                  stiffness: 280,
                                  damping: 22,
                                  delay: idx * 0.03, // Organic fanning out delay stagger
                                }}
                                onClick={() => {
                                  setCustomCategory(cat);
                                  setIsCategorySelectorOpen(false);
                                }}
                              >
                                <div 
                                  className="-translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-white rounded-full shadow-none hover:bg-neutral-50 hover:scale-105 active:scale-95 transition-all w-auto px-4 whitespace-nowrap"
                                  style={{ 
                                    height: "30px",
                                  }}
                                >
                                  <span className="text-[12px] font-sans font-semibold text-neutral-500 tracking-tight leading-none">
                                    {cat}
                                  </span>
                                </div>
                              </motion.div>
                            );
                          });
                        })()
                      }
                    </AnimatePresence>

                    {/* Active anchoring tag */}
                    <div 
                      className="absolute left-1/2 z-35"
                      style={{ 
                        bottom: "-34px",
                        transform: "translateX(-50%)"
                      }}
                    >
                      <div 
                        className="flex items-center justify-center gap-1.5 bg-white rounded-full shadow-none animate-fade-in cursor-pointer hover:scale-105 active:scale-95 transition-all select-none pl-5 pr-2"
                        style={{ 
                          height: "34px",
                        }}
                        onClick={() => setIsCategorySelectorOpen(!isCategorySelectorOpen)}
                      >
                        <span className="text-[15px] font-sans font-medium text-black/45 tracking-tight leading-none">
                          {customCategory}
                        </span>
                        <TagSwitchIcon />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Bottom section housing the three action buttons and Tap to adjust Input field */}
              <div
                className="capture-bottom-actions absolute left-0 right-0 w-full flex flex-col items-center px-6"
                style={{ bottom: `${resultInputBottomGap + 56 + RESULT_BUTTON_INPUT_GAP}px` }}
              >
                
                <div className="flex items-center justify-center gap-[44px] z-30 w-full">
                  {/* LEFT: Cancel circular button */}
                  <button
                    onClick={onClose}
                    className="w-[62px] h-[62px] rounded-full bg-white flex items-center justify-center border-0 hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer animate-pop-in-1 shadow-none"
                    title="Cancel"
                  >
                    <CloseIcon className="w-6 h-6 text-[#232121]/50" />
                  </button>

                  {/* CENTER: Main Confirm Save circular button */}
                  <button
                    onClick={handleObjectConfirmed}
                    className="w-[72px] h-[72px] rounded-full bg-[#232121] flex items-center justify-center border border-transparent hover:bg-[#232121] hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer animate-pop-in-2 shadow-none"
                    title="Confirm Save"
                  >
                    <Check className="w-[22px] h-[22px] text-white stroke-[3]" />
                  </button>

                  {/* RIGHT: Reset Scan circular button */}
                  <button
                    onClick={() => {
                      setScanStep("viewport");
                      setUploadedImageUrl(null);
                      setAlignedCutoutUrl(null);
                      setFlightCutoutUrl(null);
                      setTransparentCutoutUrl(null);
                      setPaddedCutoutUrl(null);
                      setGeneratedStickerUrl(null);
                    }}
                    className="w-[62px] h-[62px] rounded-full bg-white flex items-center justify-center border-0 hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer animate-pop-in-3 shadow-none"
                    title="Reset / Retake"
                  >
                    <RotateCcw className="w-5 h-5 text-[#232121]/50 stroke-[2]" />
                  </button>
                </div>
              </div>

              {/* Editable bottom pill matching the provided result UI */}
              <div 
                className="absolute left-1/2 z-30 animate-fade-in flex-shrink-0 -translate-x-1/2"
                style={{ width: "316px", height: "56px", bottom: `${resultInputBottomGap}px` }}
              >
                <input
                  type="text"
                  className="w-full h-full rounded-full bg-[#232121]/[0.05] border-0 pl-8 pr-12 text-[#232121]/50 text-[13px] font-sans placeholder-[#232121]/50 font-semibold tracking-tight text-center focus:outline-none focus:ring-2 focus:ring-[#232121]/10"
                  placeholder="Not what you expected？ Tap to adjust"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#232121]/35">
                  <EditPencilIcon />
                </div>
              </div>
            </div>
          )}

          {/* STORAGE LOCATION FLOW UI */}
          {storageFlowStep !== "none" && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center w-full h-full md:rounded-[36px] overflow-visible"
              style={{
                backgroundColor: (storageFlowStep === "sub_spot" || storageFlowStep === "parent_confirm" || storageFlowStep === "final_result") ? "#E9E6E1" : "#1F1F1E",
                transition: "background-color 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* Top Prompt Text */}
              {storageFlowStep !== "final_result" && !(
                (storageFlowStep === "sub_capture" || storageFlowStep === "parent_capture") && cameraViewportUnavailable
              ) && (
                <div className="capture-top-prompt absolute top-[calc(max(56px,env(safe-area-inset-top))+36px)] inset-x-6 z-40 flex flex-col items-center pointer-events-none">
                  <h3 
                    className="text-[20px] font-sans font-semibold tracking-tight text-center max-w-[300px] leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                  >
                    {storageFlowStep === "sub_capture" && "Now, show me its little home."}
                    {storageFlowStep === "sub_spot" && "Great! Now, show me the exact spot."}
                    {storageFlowStep === "parent_capture" && "A bit further... I want to see the whole scene."}
                    {storageFlowStep === "parent_confirm" && "Does this scene capture it well?"}
                  </h3>
                </div>
              )}

              {/* Viewport Area */}
              <div 
                className="absolute inset-0 w-full overflow-hidden flex items-center justify-center"
                style={{ 
                  height: "100%" 
                }}
              >
                {/* 1. Sub/Parent Location Scanning Animation */}
                {(storageFlowStep === "sub_scanning" || storageFlowStep === "parent_scanning") && (
                  <div 
                    className="absolute inset-x-0 top-0 w-full overflow-hidden bg-[#1F1F1E] z-10 flex items-center justify-center animate-fade-in"
                    style={{ height: "100%" }}
                  >
                    {/* Live feed thumbnail under scanning particles (slightly dimmed for contrast) */}
                    {(storageFlowStep === "sub_scanning" ? subLocationImg : parentLocationImg) && (
                      <img 
                        src={storageFlowStep === "sub_scanning" ? subLocationImg! : parentLocationImg!} 
                        alt="Scanning preview" 
                        className="absolute w-full h-full object-cover opacity-35 filter blur-[1px]"
                      />
                    )}
                    
                    <canvas 
                      ref={storageScanCanvasRef}
                      className="absolute inset-0 w-full h-full object-cover z-10 animate-fade-in-slow"
                    />
                  </div>
                )}

                {cameraPermissionUnavailable && cameraErrorMessage &&
                  (storageFlowStep === "sub_capture" || storageFlowStep === "parent_capture") && (
                    <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 z-40 flex items-center justify-center text-center">
                      <p className="max-w-[300px] text-white/80 text-[20px] leading-snug font-sans">
                        {cameraErrorMessage}
                      </p>
                    </div>
                  )}

                {/* 1. Sub Location Capture (Live Viewport) */}
                {storageFlowStep === "sub_capture" && (
                  <>
                    <video
                      ref={videoRef}
                      className={`absolute inset-0 block w-full h-full object-cover object-center ${cameraActive ? "opacity-100" : "opacity-0"}`}
                      autoPlay
                      playsInline
                      muted
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", minWidth: "100%", minHeight: "100%", maxWidth: "none", maxHeight: "none", objectFit: "cover", objectPosition: "center", display: "block" }}
                    />
                    {!cameraActive && <div className="absolute inset-0 bg-[#161616]" />}

                    {/* Viewport Center Focusing Reticle */}
                    <div
                      className={`absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20 ${cameraViewportUnavailable ? "hidden" : ""}`}
                      style={{ bottom: `${focusReticleInsetBottom}px` }}
                    >
                      <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                        <svg width="164" height="164" viewBox="0 0 164 164" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0 150.5V142.375H3V150.5C3 156.299 7.70101 161 13.5 161H21.625V164H13.5C6.04416 164 0 157.956 0 150.5ZM161 150.5V142.375H164V150.5C164 157.956 157.956 164 150.5 164H142.375V161H150.5C156.299 161 161 156.299 161 150.5ZM0 13.5C0 6.04416 6.04416 0 13.5 0H21.625V3H13.5C7.70101 3 3 7.70101 3 13.5V21.625H0V13.5ZM161 13.5C161 7.70101 156.299 3 150.5 3H142.375V0H150.5C157.956 0 164 6.04416 164 13.5V21.625H161V13.5Z" fill="white"/>
                        </svg>
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Sub Location Spot Selector (Equivalent to uploaded image fully stretched viewport) */}
                {storageFlowStep === "sub_spot" && subLocationImg && (
                  <div 
                    className="relative w-full h-full cursor-crosshair overflow-hidden flex items-center justify-center"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const y = ((e.clientY - rect.top) / rect.height) * 100;
                      setSubLocationHighlight({ x, y });
                    }}
                  >
                    <img 
                      src={subLocationImg} 
                      alt="Sub-location captured preview" 
                      className="w-full h-full object-cover"
                    />

                    {/* Background dot matrix - overlay */}
                    <img 
                      src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png"
                      alt="Background dot grid"
                      className="absolute inset-0 w-full h-full object-cover opacity-[0.15] mix-blend-overlay pointer-events-none select-none z-10"
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Interactive glowing spotlight orb annotation */}
                    {subLocationHighlight && (
                      <div 
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex items-center justify-center"
                        style={{
                          left: `${subLocationHighlight.x}%`,
                          top: `${subLocationHighlight.y}%`
                        }}
                      >
                        {/* Instant, gorgeous CSS spotlight ripple & glow */}
                        <img
                          src={LIGHTSPOT_IMAGE_URL}
                          alt=""
                          aria-hidden="true"
                          className="block h-[84px] w-[84px] object-contain animate-pulse"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Parent Location Capture */}
                {storageFlowStep === "parent_capture" && (
                  <>
                    <video
                      ref={videoRef}
                      className={`absolute inset-0 block w-full h-full object-cover object-center ${cameraActive ? "opacity-100" : "opacity-0"}`}
                      autoPlay
                      playsInline
                      muted
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", minWidth: "100%", minHeight: "100%", maxWidth: "none", maxHeight: "none", objectFit: "cover", objectPosition: "center", display: "block" }}
                    />
                    {!cameraActive && <div className="absolute inset-0 bg-[#161616]" />}

                    {/* Viewport Center Focusing Reticle */}
                    <div
                      className={`absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20 ${cameraViewportUnavailable ? "hidden" : ""}`}
                      style={{ bottom: `${focusReticleInsetBottom}px` }}
                    >
                      <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                        <svg width="164" height="164" viewBox="0 0 164 164" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0 150.5V142.375H3V150.5C3 156.299 7.70101 161 13.5 161H21.625V164H13.5C6.04416 164 0 157.956 0 150.5ZM161 150.5V142.375H164V150.5C164 157.956 157.956 164 150.5 164H142.375V161H150.5C156.299 161 161 156.299 161 150.5ZM0 13.5C0 6.04416 6.04416 0 13.5 0H21.625V3H13.5C7.70101 3 3 7.70101 3 13.5V21.625H0V13.5ZM161 13.5C161 7.70101 156.299 3 150.5 3H142.375V0H150.5C157.956 0 164 6.04416 164 13.5V21.625H161V13.5Z" fill="white"/>
                        </svg>
                      </div>
                    </div>
                  </>
                )}

                {/* 4. Parent Location Confirm (Equivalent to uploaded image fully stretched viewport) */}
                {storageFlowStep === "parent_confirm" && parentLocationImg && (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                    <img 
                      src={parentLocationImg} 
                      alt="Parent-location captured preview" 
                      className="w-full h-full object-cover"
                    />

                    {/* Background dot matrix */}
                    <img 
                      src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png"
                      alt="Background dot grid"
                      className="absolute inset-0 w-full h-full object-cover opacity-[0.15] mix-blend-overlay pointer-events-none select-none z-10"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* 5. Final Result Summary Page */}
                {storageFlowStep === "final_result" && (
                  <div 
                    className="absolute inset-0 isolate w-full h-full overflow-y-auto px-0 pt-[88px] pb-8"
                    style={{
                      maxHeight: "100%",
                      WebkitOverflowScrolling: "touch"
                    }}
                  >
                    {/* Dot matrix decorative background - fades in on final results page */}
                    <img 
                      src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E7%9F%A9%E9%98%B5%E5%9C%86%E7%82%B9.png"
                      alt="Background dot grid"
                      className="absolute inset-0 w-full h-full object-cover opacity-[0.25] mix-blend-multiply pointer-events-none select-none z-0 animate-fade-in"
                      referrerPolicy="no-referrer"
                    />

                    {/* Main Sticker Element with + Value Tag & Yellow Gaussian Glow */}
                    <div className="relative z-10 mx-auto flex flex-col items-center justify-center flex-shrink-0" style={{ width: "340px", height: "330px", transform: `translateX(${RESULT_STICKER_CENTER_OFFSET_X}px)` }}>
                      <div 
                        className="relative flex items-center justify-center overflow-visible"
                        style={{
                          width: "300px",
                          height: "300px"
                        }}
                      >
                        <div
                          className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                          style={{
                            width: COLOR_BLUR_SIZE,
                            height: COLOR_BLUR_SIZE,
                            marginLeft: "8px",
                            opacity: isResultDecorationVisible && isColorBlurReady ? 1 : 0,
                            transition: "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                            willChange: "opacity",
                          }}
                        >
                          <img
                            src={COLOR_BLUR_IMAGE_URL}
                            alt=""
                            aria-hidden="true"
                            onLoad={() => setIsColorBlurReady(true)}
                            className="block h-full w-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        {/* + Value Tag - Click to edit value amount */}
                        <button
                          type="button"
                          onClick={() => setIsEditingPrice(true)}
                          className="absolute top-[42px] right-[-8px] h-[30px] text-white z-30 cursor-pointer hover:scale-105 active:scale-95 transition-all select-none flex items-stretch justify-center shadow-none p-0 bg-transparent border-0"
                        >
                          <svg
                            width="19"
                            height="30"
                            viewBox="0 0 19 30"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-[30px] w-[19px] shrink-0"
                            aria-hidden="true"
                          >
                            <g clipPath="url(#clip0_283_2038_capture)">
                              <path
                                d="M19.0738 0H14.2594C12.7704 2.47955e-05 11.3486 0.621836 10.3385 1.71582L1.41561 11.3799C-0.47187 13.4241 -0.471871 16.5759 1.41561 18.6201L10.3385 28.2842C11.3486 29.3782 12.7704 30 14.2594 30H19.0738V0ZM8.19882 17C6.83613 17 5.73104 15.8807 5.73104 14.5C5.73104 13.1193 6.83613 12 8.19882 12C9.56152 12 10.6666 13.1193 10.6666 14.5C10.6666 15.8807 9.56152 17 8.19882 17Z"
                                fill="#232121"
                              />
                            </g>
                            <defs>
                              <clipPath id="clip0_283_2038_capture">
                                <rect width="19" height="30" fill="white" />
                              </clipPath>
                            </defs>
                          </svg>
                          <span className="h-[30px] min-w-[66px] max-w-[122px] rounded-r-[6px] rounded-l-none bg-[#232121] -ml-px pl-0 pr-2.5 flex items-center justify-center font-alkatra text-[15px] leading-none whitespace-nowrap overflow-hidden">
                            {priceInput ? `${priceCurrency}${priceInput}` : "+ Value"}
                          </span>
                        </button>

                        {generatedStickerUrl ? (
                          <img 
                            src={generatedStickerUrl} 
                            alt="Final Sticker" 
                            className="object-contain block select-none pointer-events-none relative z-10"
                            style={{ width: `${RESULT_STICKER_VISUAL_SIZE}px`, height: `${RESULT_STICKER_VISUAL_SIZE}px` }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-[128px] block leading-none relative z-10">{activeItem.emoji}</span>
                        )}

                        {/* Alkatra large editable title with white text stroke - contentEditable with expanded horizontal bounds to prevent any cutting off */}
                        <div
                          className="absolute z-20 flex justify-center"
                          style={{
                            ...stickerTitleStyle,
                            left: "50%",
                            marginLeft: `${-RESULT_STICKER_TITLE_WIDTH / 2}px`,
                          }}
                        >
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => setCustomName(e.currentTarget.textContent || "")}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-full text-center font-alkatra font-bold whitespace-normal break-words focus:outline-none bg-transparent select-text caret-[#232121] outline-none border-0 overflow-visible"
                            style={{
                              fontSize: `${RESULT_STICKER_TITLE_FONT_SIZE}px`,
                              color: "#000000",
                              WebkitTextStroke: "0 transparent",
                              textShadow: stickerTitleStyle.textShadow,
                              lineHeight: `${RESULT_STICKER_TITLE_FONT_SIZE}px`,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {customName || activeItem.name}
                          </div>
                        </div>

                        {/* Fanned-out Category Options matching object result page perfectly with no tilt */}
                        <AnimatePresence>
                          {isCategorySelectorOpen && (
                            <motion.div 
                              className="absolute inset-0 z-15 pointer-events-auto"
                              style={{
                                width: "290px",
                                height: "290px",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                              }}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setIsCategorySelectorOpen(false)}
                            />
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {isCategorySelectorOpen && 
                            (() => {
                              const currentList = [...ALL_CATEGORIES];
                              if (customCategory && !currentList.includes(customCategory)) {
                                currentList[currentList.length - 1] = customCategory;
                              }
                              const otherCategories = currentList.filter(cat => cat !== customCategory).slice(0, 4);
                              return otherCategories.map((cat, idx) => {
                                const pos = FAN_POSITIONS[idx] || { x: 0, y: 0, r: 0 };
                                return (
                                  <motion.div
                                    key={cat}
                                    className="absolute left-1/2 top-1/2 z-30 cursor-pointer pointer-events-auto"
                                    initial={{
                                      x: 0,
                                      y: 159,
                                      scale: 0.3,
                                      opacity: 0,
                                      rotate: 0,
                                    }}
                                    animate={{
                                      x: pos.x,
                                      y: pos.y,
                                      scale: 1,
                                      opacity: 1,
                                      rotate: pos.r,
                                    }}
                                    exit={{
                                      x: 0,
                                      y: 159,
                                      scale: 0.3,
                                      opacity: 0,
                                      rotate: 0,
                                    }}
                                    transition={{
                                      type: "spring",
                                      stiffness: 280,
                                      damping: 22,
                                      delay: idx * 0.03,
                                    }}
                                    onClick={() => {
                                      setCustomCategory(cat);
                                      setIsCategorySelectorOpen(false);
                                    }}
                                  >
                                    <div 
                                      className="-translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-white rounded-full shadow-none border-0 hover:bg-neutral-50 hover:scale-105 active:scale-95 transition-all w-auto px-4 whitespace-nowrap"
                                      style={{ 
                                        height: "30px",
                                      }}
                                    >
                                      <span className="text-[12px] font-sans font-semibold text-neutral-500 tracking-tight leading-none">
                                        {cat}
                                      </span>
                                    </div>
                                  </motion.div>
                                );
                              });
                            })()
                          }
                        </AnimatePresence>

                      </div>
                    </div>

                    {/* Category tag */}
                    <div className="relative z-20 mt-[-6px] flex justify-center">
                      <button
                        type="button"
                        className="h-[34px] min-w-[92px] pl-5 pr-2 rounded-full bg-white flex items-center justify-center gap-1.5 shadow-none active:scale-95 transition-transform"
                        onClick={() => setIsCategorySelectorOpen(!isCategorySelectorOpen)}
                      >
                        <span className="text-[15px] font-sans font-medium text-neutral-500 tracking-tight leading-none">
                          {customCategory || "Select"}
                        </span>
                        <TagSwitchIcon />
                      </button>
                    </div>

                    {/* Time Label */}
                    <div className="text-[14px] font-sans text-neutral-400 font-medium tracking-tight mt-3 z-10 flex-shrink-0 text-center">
                      {toTitleCase(finalResultDateLabel)}
                    </div>

                    {/* Location Information Card */}
                    <div
                      className="relative isolate z-50 bg-white rounded-[24px] px-7 py-6 flex items-center justify-between shadow-none max-w-[386px] min-h-[148px] mt-8 border-0 flex-shrink-0 mx-auto"
                      style={{ width: "calc(100% - 44px)" }}
                    >
                      {/* Left side: Overlapping photos */}
                        <div
                          className="relative w-[122px] h-[104px] flex-shrink-0"
                          style={{ transform: "translateX(-4px)" }}
                        >
                        {/* Parent Location Image (Base) */}
                        <div className="w-[96px] h-[96px] rounded-[12px] overflow-hidden shadow-inner bg-neutral-100 border border-neutral-100 flex items-center justify-center">
                          {parentLocationImg ? (
                            <img src={parentLocationImg} alt="Space" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl">🏠</span>
                          )}
                        </div>

                        {/* Sub Location Image (Overlapping at bottom-right corner) */}
                        <div className="absolute bottom-[-4px] right-[4px] w-[58px] h-[58px] rounded-[12px] overflow-hidden border-[4px] border-white shadow-none bg-neutral-100 flex items-center justify-center z-10">
                          {subLocationImg ? (
                            <img src={subLocationImg} alt="Sub-Space" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[18px]">📦</span>
                          )}
                        </div>
                      </div>

                      {/* Right side: Location details with separate text editing and location switching actions */}
                      <div
                        className="flex min-w-0 flex-1 -translate-x-3 items-start pl-3 text-left"
                        style={{ transform: "translateX(-12px)" }}
                      >
                        <span className="mt-[2px] w-[24px] shrink-0 text-[24px] leading-none">📍</span>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          {renderResultLocationRow({
                            field: "parent",
                            name: parentLocationName,
                            label: "Space",
                          })}
                          <div className="mt-2">
                            {renderResultLocationRow({
                              field: "sub",
                              name: subLocationName,
                              label: "Sub-Space",
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Save / Complete Checkmark circular button */}
                    <button
                      onClick={handleSaveMemory}
                      className="w-[72px] h-[72px] rounded-full bg-[#232121] flex items-center justify-center hover:bg-[#232121] hover:scale-105 active:scale-95 transition-all shadow-none cursor-pointer mt-10 flex-shrink-0 z-10 mx-auto"
                      title="Confirm Save"
                    >
                      <Check className="w-[22px] h-[22px] text-white stroke-[3]" />
                    </button>

                    {/* Helper text caption */}
                    <p className="text-[14px] font-sans text-[#232121]/45 font-normal mt-7 pb-2 tracking-tight select-none pointer-events-none text-center z-10">
                      Tap text to adjust
                    </p>
                  </div>
                )}

                {/* Keep Cancel outside the scrolling result content so it stays visible. */}
                {storageFlowStep === "final_result" && !showDiscardConfirm && !resultLocationPicker && (
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(true)}
                    aria-label="Cancel final result"
                    className="absolute right-5 z-[160] pointer-events-auto cursor-pointer text-[16px] font-sans font-medium text-neutral-400 transition-all hover:text-neutral-700 active:scale-95"
                    style={{ top: "calc(var(--noma-statusbar-height, env(safe-area-inset-top, 0px)) + 4px)" }}
                  >
                    Cancel
                  </button>
                )}

                {/* Floating cutout sticker + title anchored beside the storage action sheet */}
                {storageFlowStep !== "none" && storageFlowStep !== "final_result" && (
                  <div
                    className="absolute left-3 z-50 select-none pointer-events-none overflow-visible"
                    style={{
                      bottom: `${CAPTURE_VIEW_DRAWER_OVERLAP + 4}px`,
                      width: "80px",
                      height: "80px",
                    }}
                  >
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: `${(80 - RESULT_STICKER_VISUAL_SIZE) / 2}px`,
                        top: `${(80 - RESULT_STICKER_VISUAL_SIZE) / 2}px`,
                        width: `${RESULT_STICKER_VISUAL_SIZE}px`,
                        height: `${RESULT_STICKER_VISUAL_SIZE}px`,
                        rotate: "0deg",
                        scale: 80 / RESULT_STICKER_VISUAL_SIZE,
                        transformOrigin: "center center",
                      }}
                    >
                      {generatedStickerUrl ? (
                        <img
                          src={generatedStickerUrl} 
                          alt="Sticker thumbnail" 
                          className="object-contain block select-none pointer-events-none"
                          style={{
                            width: `${RESULT_STICKER_VISUAL_SIZE}px`,
                            height: `${RESULT_STICKER_VISUAL_SIZE}px`,
                            filter: "none",
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span
                          className="text-[128px] block leading-none select-none pointer-events-none"
                        >
                          {activeItem.emoji}
                        </span>
                      )}
                      
                      {/* Alkatra overlay title exactly like the results page but styled proportionally */}
                      {stickerTitleText && (
                        <div
                          className="absolute text-center pointer-events-none select-none z-20 font-alkatra overflow-visible"
                          style={{
                            ...stickerTitleStyle,
                            left: "50%",
                            width: `${RESULT_STICKER_TITLE_WIDTH}px`,
                            maxWidth: `${RESULT_STICKER_TITLE_WIDTH}px`,
                            marginLeft: `${-RESULT_STICKER_TITLE_WIDTH / 2}px`,
                            flexDirection: "column",
                            boxSizing: "border-box",
                          }}
                        >
                          {stickerTitleLines.map((line, index) => (
                            <span
                              key={`${line}-${index}`}
                              className="block w-full whitespace-normal break-words"
                              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                            >
                              {line}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Sheet Control Drawer overlay for Storage Location flows */}
              {storageFlowStep !== "final_result" && (
                <div 
                  className="storage-capture-drawer absolute left-0 right-0 w-full h-[213px] bg-[#E9E6E1] rounded-t-[60px] px-6 flex flex-col items-center justify-center z-30 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] select-none"
                  style={{
                    height: "213px",
                    bottom: `-${cameraViewBottomOffset}px`,
                    paddingBottom: 0,
                    marginBottom: 0,
                    transform: "translateY(0)",
                  }}
                >
                  {/* Visual drag handle decoration */}
                  <div className="absolute top-[8px] w-12 h-1 bg-neutral-300 rounded-full opacity-70" />

                  {storageFlowStep === "sub_capture" && renderExistingLocationPickerBubble({
                    kind: "sub",
                    options: existingSubLocations,
                    selectedKey: selectedExistingSubKey,
                    onSelect: setSelectedExistingSubKey,
                    onConfirm: confirmExistingSubLocation,
                  })}

                  {storageFlowStep === "sub_spot" && isUsingExistingSubLocation && selectedExistingSubLocation && renderExistingLocationPickerBubble({
                    kind: "sub",
                    options: [selectedExistingSubLocation],
                    selectedKey: selectedExistingSubLocation.key,
                    onSelect: () => undefined,
                    onConfirm: () => undefined,
                    displayOnly: true,
                  })}

                  {storageFlowStep === "parent_capture" && renderExistingLocationPickerBubble({
                    kind: "parent",
                    options: existingParentLocations,
                    selectedKey: selectedExistingParentKey,
                    onSelect: setSelectedExistingParentKey,
                    onConfirm: confirmExistingParentLocation,
                  })}

                  {storageFlowStep === "parent_confirm" && isUsingExistingParentLocation && selectedExistingParentLocation && renderExistingLocationPickerBubble({
                    kind: "parent",
                    options: [selectedExistingParentLocation],
                    selectedKey: selectedExistingParentLocation.key,
                    onSelect: () => undefined,
                    onConfirm: () => undefined,
                    displayOnly: true,
                  })}

                  {storageFlowStep === "sub_spot" && isUsingExistingSubLocation && parentLocationName && (
                    <div
                      className="absolute right-5 z-40 max-w-[220px] truncate font-sans text-[22px] font-semibold leading-none text-white/88 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] pointer-events-none"
                      style={{ bottom: "calc(100% + 12px)" }}
                    >
                      📍{parentLocationName}
                    </div>
                  )}
                  
                  {/* Content based on storage flow step */}
                  <div className="w-full h-full flex flex-col items-center justify-center pt-0 pb-0">
                    {/* Step 1: Sub Location Capture */}
                    {storageFlowStep === "sub_capture" && (
                      <StorageActionRow>
                        <StorageRoundButton onClick={() => fileInputRef.current?.click()} title="Upload file instead" variant="ghost">
                          <ImageIcon className="w-6 h-6" />
                        </StorageRoundButton>
                        <StorageShutterButton onClick={handleCapture} title="Capture Little Home" />
                        <StorageRoundButton onClick={() => setStorageFlowStep("none")} title="Back" variant="ghost">
                          <span className="text-[13px] font-sans font-medium">Back</span>
                        </StorageRoundButton>
                      </StorageActionRow>
                    )}

                    {/* Step 2: Sub Location Spot Annotation */}
                    {storageFlowStep === "sub_spot" && (
                      <div className="w-full flex flex-col items-center gap-4">
                        <StorageActionRow>
                          <StorageRoundButton
                            onClick={() => {
                              setStorageFlowStep("none");
                              setSubLocationImg(null);
                              setIsUsingExistingSubLocation(false);
                            }}
                            title="Cancel Storage Flow"
                          >
                            <CloseIcon className="w-6 h-6 text-[#232121]" />
                          </StorageRoundButton>
                          <StorageRoundButton
                            onClick={() => {
                              if (!subLocationHighlight) {
                                setSubLocationHighlight({ x: 50, y: 50 });
                              }
                              setStorageFlowStep(isUsingExistingSubLocation ? "final_result" : "parent_capture");
                            }}
                            title={isUsingExistingSubLocation ? "Continue to Final Result" : "Continue to Parent Scene"}
                            variant="dark"
                          >
                            <Check className="w-[22px] h-[22px] stroke-[3]" />
                          </StorageRoundButton>
                          <StorageRoundButton
                            onClick={() => {
                              setStorageFlowStep("sub_capture");
                              setSubLocationImg(null);
                              setIsUsingExistingSubLocation(false);
                            }}
                            title="Retry Little Home Capture"
                          >
                            <RotateCcw className="w-5 h-5 stroke-[2]" />
                          </StorageRoundButton>
                        </StorageActionRow>

                        {!isUsingExistingSubLocation && (
                          <StorageDrawerInput
                            placeholder="Name of this little home? (e.g. Bedside table)"
                            value={subLocationName}
                            onChange={setSubLocationName}
                          />
                        )}
                      </div>
                    )}

                    {/* Step 3: Parent Location Capture */}
                    {storageFlowStep === "parent_capture" && (
                      <StorageActionRow>
                        <StorageRoundButton onClick={() => fileInputRef.current?.click()} title="Upload file instead" variant="ghost">
                          <ImageIcon className="w-6 h-6" />
                        </StorageRoundButton>

                        <div className="relative w-[72px] h-[72px] flex items-center justify-center">
                          {/* Sub-location photo layered at top-left of shutter button with smooth fly-in zoom & translate animation */}
                          {subLocationImg && (
                            <div
                              className="absolute -top-8 -left-3 z-50 w-12 h-12 rotate-[-11deg] bg-white p-0.5 rounded-sm border border-white shadow-lg cursor-pointer"
                              onClick={() => {
                                setStorageFlowStep("sub_spot");
                              }}
                              title="View/Edit Sub-location"
                            >
                              <img
                                src={subLocationImg}
                                alt="Sub location thumbnail"
                                className="w-full h-full object-cover rounded-sm"
                              />
                              {/* Small pin/dot indicator decoration on the thumbnail */}
                              <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#DC2626] rounded-full shadow-inner" />
                            </div>
                          )}

                          <StorageShutterButton onClick={handleCapture} title="Capture Parent Scene" />
                        </div>

                        <StorageRoundButton onClick={() => setStorageFlowStep("sub_spot")} title="Back" variant="ghost">
                          <span className="text-[13px] font-sans font-medium">Back</span>
                        </StorageRoundButton>
                      </StorageActionRow>
                    )}

                    {/* Step 4: Parent Location Confirmation and text entry */}
                    {storageFlowStep === "parent_confirm" && (
                      <div className="w-full flex flex-col items-center gap-4">
                        <StorageActionRow>
                          <StorageRoundButton
                            onClick={() => {
                              setStorageFlowStep("none");
                              setParentLocationImg(null);
                              setIsUsingExistingParentLocation(false);
                            }}
                            title="Cancel Storage Flow"
                          >
                            <CloseIcon className="w-6 h-6 text-[#232121]" />
                          </StorageRoundButton>
                          <StorageRoundButton
                            onClick={() => setStorageFlowStep("final_result")}
                            title="Save Memory & Storage Spot"
                            variant="dark"
                          >
                            <Check className="w-[22px] h-[22px] stroke-[3]" />
                          </StorageRoundButton>
                          <StorageRoundButton
                            onClick={() => {
                              setStorageFlowStep("parent_capture");
                              setParentLocationImg(null);
                              setIsUsingExistingParentLocation(false);
                            }}
                            title="Retry Scene Capture"
                          >
                            <RotateCcw className="w-5 h-5 stroke-[2]" />
                          </StorageRoundButton>
                        </StorageActionRow>

                        {!isUsingExistingParentLocation && (
                          <StorageDrawerInput
                            placeholder="Where is this little home? (e.g. Master Bedroom)"
                            value={parentLocationName}
                            onChange={setParentLocationName}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM PHOTO SHEETS / DRAWER CONTROLS */}
      {storageFlowStep === "none" && (scanStep === "viewport" || scanStep === "scanning") && (
        <div 
          id="camera-bottom-sheet"
          className="capture-drawer fixed md:absolute bottom-0 left-0 right-0 w-full bg-[#E9E6E1] rounded-t-[60px] px-6 flex flex-col items-center justify-center z-30 transition-all duration-300 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] animate-slide-up select-none touch-none"
          style={{
            height: "213px",
            transform: `translateY(${drawerY}px)`,
            transition: isDraggingDrawer ? 'none' : 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onPointerDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.drag-handle-zone') || target.closest('.drag-handle-bar')) {
              setIsDraggingDrawer(true);
              dragStartYRef.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (!isDraggingDrawer) return;
            const deltaY = e.clientY - dragStartYRef.current;
            if (deltaY > 0) {
              setDrawerY(deltaY);
            } else {
              setDrawerY(0);
            }
          }}
          onPointerUp={(e) => {
            if (!isDraggingDrawer) return;
            setIsDraggingDrawer(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (drawerY > 70) {
              onClose();
            }
            setDrawerY(0);
          }}
          onPointerCancel={(e) => {
            if (!isDraggingDrawer) return;
            setIsDraggingDrawer(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            setDrawerY(0);
          }}
        >
          {/* Broad Drag Handle zone and the narrow capsule drag indicator */}
          <div className="drag-handle-zone absolute top-0 inset-x-0 h-[36px] flex items-center justify-center cursor-row-resize z-50">
            <div className="drag-handle-bar w-12 h-1 bg-neutral-300 rounded-full opacity-70" style={{ transform: "translateY(-10px)" }} />
          </div>

          {/* Spacer to push content below the indicator zone */}
          <div className="h-6" />

          {scanStep === "viewport" && (
            <div className="w-full h-full flex flex-col items-center justify-center pt-0 pb-4">
              {/* Shutter container with Mock Upload shortcut on Left */}
              <div className="flex items-center justify-center gap-12 w-full">
                
                {/* Photo library mock upload trigger */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-full hover:bg-black/5 active:scale-95 flex flex-col items-center justify-center text-[#3A3938] transition-all cursor-pointer"
                  title="Mock uploaded photo scanning"
                >
                  <ImageIcon className="w-6 h-6 text-[#3A3938]" />
                </button>

                {/* Aesthetic shutter capture button */}
                <button
                  onClick={handleCapture}
                  className="group relative w-20 h-20 rounded-full flex items-center justify-center bg-white transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_24px_rgba(0,0,0,0.15)] cursor-pointer"
                  style={{
                    padding: "4px"
                  }}
                >
                  {/* Shutter colorful radial halo border from mockup photo */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-orange-400 to-red-400 opacity-90 scale-105 blur-[2px] transition-all group-hover:scale-110" />
                  
                  {/* Inner button container */}
                  <div className="relative w-full h-full rounded-full bg-[#F3F1EC] flex items-center justify-center border-2 border-white shadow-inner">
                    {/* Shiny metal core dot */}
                    <div className="w-8 h-8 rounded-full bg-[#181817] flex items-center justify-center border border-black/10">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    </div>
                  </div>
                </button>

                {/* Balanced Cancel button to replace CAM text and provide instant closing */}
                <button
                  onClick={onClose}
                  className="w-12 h-12 flex items-center justify-center text-[13px] font-sans text-neutral-500 hover:text-black font-normal transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(scanStep === "scanning" || scanStep === "disintegrating" || scanStep === "sticker") && (
            <div className="w-full h-full flex flex-col items-center justify-center pt-0 pb-4">
              {/* Spinning cute colorful flower loader */}
              <div className="w-9 h-9 border-4 border-[#3A3938]/10 border-t-[#3A3938] rounded-full animate-spin mb-3" />
              <p className="text-[#3A3938] text-[14px] font-sans font-normal tracking-tight animate-pulse">
                Recognizing...
              </p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {storageFlowStep === "final_result" && isEditingPrice && (
          <motion.div
            key="capture-price-keyboard"
            className="absolute inset-x-0 bottom-0 z-[95] pointer-events-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform" }}
          >
            {renderPriceKeyboard()}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {storageFlowStep === "final_result" && editingResultLocationField && (
          <motion.div
            key="capture-result-location-keyboard"
            className="absolute inset-x-0 bottom-0 z-[95] pointer-events-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform" }}
          >
            {renderResultLocationKeyboard()}
          </motion.div>
        )}
      </AnimatePresence>

      {storageFlowStep === "final_result" && renderResultLocationPicker()}

      <AnimatePresence>
        {showDiscardConfirm && (
          <motion.div
            key="discard-capture-confirm"
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/35 px-8 backdrop-blur-sm"
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
            >
              <h3 className="text-[20px] font-sans font-bold text-[#232121] tracking-tight">Discard this capture?</h3>
              <p className="mt-3 text-[13px] font-sans leading-relaxed text-[#232121]/55">
                This will cancel the object and location results from this capture flow.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="h-12 flex-1 rounded-full bg-white text-[#232121]/70 text-[14px] font-sans font-semibold active:scale-95 transition-transform"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={handleDiscardAllCaptureResults}
                  className="h-12 flex-1 rounded-full bg-[#232121] text-white text-[14px] font-sans font-semibold active:scale-95 transition-transform"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Volumetric styling rule sheet */}
      <style>
        {`
          @keyframes sticker-settle {
            0% {
              transform: scale(1.08) rotate(0deg);
              filter: none;
              opacity: 0.9;
            }
            100% {
              transform: scale(1) rotate(0deg);
              filter: none;
              opacity: 1;
            }
          }
          @keyframes smooth-cinematic-fly {
            0% { 
              transform: scale(2.5) rotate(0deg); 
              opacity: 1;
              filter: none;
            }
            15% {
              /* Freeze cutout at original visual screen location and layout scale */
              transform: scale(2.5) rotate(0deg);
              opacity: 1;
              filter: none;
            }
            100% {
              /* Smoothly shrink and glide down to the center as an upright sticker element */
              transform: scale(1) rotate(0deg);
              opacity: 1;
              filter: none;
            }
          }
          @keyframes slide-up {
            0% { transform: translateY(16px); opacity: 0; }
            100% { transform: translateY(0px); opacity: 1; }
          }
          .animate-slide-up {
            animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
          }
          @keyframes pop-in {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
          .animate-pop-in-1 {
            animation: pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            animation-delay: 150ms;
          }
          .animate-pop-in-2 {
            animation: pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            animation-delay: 260ms;
          }
          .animate-pop-in-3 {
            animation: pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            animation-delay: 370ms;
          }
          @keyframes disintegrate-bg {
            0% {
              background-color: #1F1F1E;
            }
            100% {
              background-color: #E9E6E1;
            }
          }
          .animate-disintegrate-bg {
            animation: disintegrate-bg 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          @keyframes fade-in-opacity {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }
          .animate-fade-in-opacity {
            animation: fade-in-opacity 0.2s ease-out both;
            will-change: opacity;
          }
          @keyframes fade-in-slow {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }
          .animate-fade-in-slow {
            animation: fade-in-slow 0.8s ease-out both;
            will-change: opacity;
          }
          @keyframes fade-in {
            0% {
              opacity: 0;
              transform: translateY(4px);
            }
            100% {
              opacity: 1;
              transform: translateY(0px);
            }
          }
          .animate-fade-in {
            animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
            will-change: opacity, transform;
          }
          @keyframes yellow-glow-fade-in {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }
          .animate-yellow-glow {
            animation: yellow-glow-fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
            will-change: opacity;
          }
          .animate-yellow-glow-delayed {
            animation: yellow-glow-fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
            animation-delay: 500ms;
            will-change: opacity;
          }
          .animate-yellow-blur-soft-in {
            animation: yellow-glow-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) both;
            will-change: opacity;
          }
          .no-scrollbar::-webkit-scrollbar {
            display: none; /* Safari and Chrome */
          }
          .no-scrollbar {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
          }
        `}
      </style>
    </div>,
    document.body
  );
};
