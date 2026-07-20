import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Sparkles, Calendar, DollarSign, Check, ChevronUp, Image as ImageIcon, RotateCcw, Settings, Pencil, ChevronsUpDown } from "lucide-react";
import { getStoredFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, FirebaseConfig } from "../lib/firebase";
import { recognizeImage, generateStorageTitle, classifyLocation, prepareImage } from "../services/aiService";
import { remove_background, REMOVE_BG_CONFIG } from "../services/removeBackgroundService";
import { motion, AnimatePresence } from "motion/react";
import { useKeyboardReset } from "../hooks/useKeyboardReset";
import { useLayoutGuard } from "../hooks/useLayoutGuard";

interface CaptureScannerProps {
  isOpen: boolean;
  onClose: () => void;
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

export const CaptureScanner: React.FC<CaptureScannerProps> = ({
  isOpen,
  onClose,
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
  const storageScanCanvasRef = useRef<HTMLCanvasElement>(null);

  // Bottom drawer gesture drag-to-dismiss states
  const [drawerY, setDrawerY] = useState<number>(0);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const CAPTURE_DRAWER_HEIGHT = 213;
  const CAPTURE_VIEW_DRAWER_OVERLAP = 72;

  // Firebase configuration state variables
  const [showFirebaseSettings, setShowFirebaseSettings] = useState<boolean>(false);
  const [fbApiKey, setFbApiKey] = useState<string>("");
  const [fbAuthDomain, setFbAuthDomain] = useState<string>("");
  const [fbProjectId, setFbProjectId] = useState<string>("");
  const [fbStorageBucket, setFbStorageBucket] = useState<string>("");
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState<string>("");
  const [fbAppId, setFbAppId] = useState<string>("");
  const [fbMeasurementId, setFbMeasurementId] = useState<string>("");
  const [rawConfigJson, setRawConfigJson] = useState<string>("");

  // Apply our custom layout guard to guarantee layout/scroll scrubbing and dynamic app height calculation
  useLayoutGuard(isOpen);

  useEffect(() => {
    if (isOpen) {
      const saved = getStoredFirebaseConfig();
      if (saved) {
        setFbApiKey(saved.apiKey || "");
        setFbAuthDomain(saved.authDomain || "");
        setFbProjectId(saved.projectId || "");
        setFbStorageBucket(saved.storageBucket || "");
        setFbMessagingSenderId(saved.messagingSenderId || "");
        setFbAppId(saved.appId || "");
        setFbMeasurementId(saved.measurementId || "");
      }
    }
  }, [isOpen]);

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
  const [tempIdentifiedTitle, setTempIdentifiedTitle] = useState<string>("");
  const [tempIdentifiedCategory, setTempIdentifiedCategory] = useState<string>("");
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [customDate, setCustomDate] = useState<string>("Today");
  const [isEditingPrice, setIsEditingPrice] = useState<boolean>(false);
  const [isEditingDate, setIsEditingDate] = useState<boolean>(false);

  // Video feed references
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<boolean>(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string>("");

  // Canvases for animation effects
  const particlesCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelateCanvasRef = useRef<HTMLCanvasElement>(null);
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const outlineTraceCanvasRef = useRef<HTMLCanvasElement>(null);
  const cutoutFlightRef = useRef<HTMLDivElement>(null);
  const cutoutFlightAnimationRef = useRef<Animation | null>(null);
  const stickerSizeSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // States for advanced cinematic contour tracing
  const [transparentCutoutUrl, setTransparentCutoutUrl] = useState<string | null>(null);
  const [paddedCutoutUrl, setPaddedCutoutUrl] = useState<string | null>(null);
  const [isTracingContour, setIsTracingContour] = useState<boolean>(false);
  const [traceProgress, setTraceProgress] = useState<number>(0);
  const [traceCompleted, setTraceCompleted] = useState<boolean>(false);
  const [disintegrateStart, setDisintegrateStart] = useState<boolean>(false);
  const [cutoutFlightStarted, setCutoutFlightStarted] = useState<boolean>(false);
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
  const finalStickerVisualSize = 280;
  const finalStickerLeft = (containerWidth - finalStickerVisualSize) / 2;
  const finalStickerTop = targetCenterY - finalStickerVisualSize / 2;

  // Active item
  const activeItem = MEMORY_ITEMS[selectedItemIndex];
  const STICKER_CANVAS_SIZE = 256;
  const STICKER_BORDER_SIZE = 8;
  const stickerTitleText = customName || activeItem.name;
  const stickerTitleLines = formatStickerTitleLines(stickerTitleText);
  const isStickerTitleTwoLine = stickerTitleLines.length > 1;
  const longestStickerTitleLine = Math.max(...stickerTitleLines.map((line) => line.length), 0);
  const stickerTitleFontSize = isStickerTitleTwoLine
    ? longestStickerTitleLine > 17
      ? 32
      : longestStickerTitleLine > 14
        ? 35
        : 38
    : longestStickerTitleLine > 15
      ? 40
      : 48;
  const stickerTitleStyle: React.CSSProperties = {
    fontSize: `${stickerTitleFontSize}px`,
    fontWeight: "700",
    color: "#000000",
    WebkitTextStroke: isStickerTitleTwoLine ? "5px #ffffff" : `${stickerTitleFontSize >= 44 ? 6 : 5}px #ffffff`,
    paintOrder: "stroke fill",
    lineHeight: isStickerTitleTwoLine ? "1.04" : "1.06",
    bottom: isStickerTitleTwoLine ? "10px" : "18px",
    maxHeight: "92px",
  };

  const beginCutoutTransition = () => {
    setCutoutFlightStartRect({
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
    });
    setStickerSizeSettled(false);
    setTraceCompleted(false);
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

  /**
   * Pure Frontend Canvas dilatation / crisp expansion algorithm with full visual fallback & CORS bypass.
   * Generates a solid uniform white border without aliasing by rendering 360 radial steps.
   */
  const generatePhysicalSticker = (
    transparentImgSrc: string,
    borderSize: number = STICKER_BORDER_SIZE,
    borderColor: string = "#FFFFFF",
    useFallbackMock: boolean = (REMOVE_BG_CONFIG.mode === "api" && !REMOVE_BG_CONFIG.api.apiKey)
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

        // Perform circle crop fallback (for photographers without API key)
        if (useFallbackMock) {
          console.log("[StickerEngine] No API Key -> Generating elegant circular crop as high-fidelity visual mock!");
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

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("[StickerEngine] Canvas 2D context acquisition failed.");
          resolve(transparentImgSrc);
          return;
        }

        const size = STICKER_CANVAS_SIZE;
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
        normalizedCtx.clearRect(0, 0, size, size);
        drawContainCentered(normalizedCtx, sourceObject, sourceObject.width, sourceObject.height, size, Math.max(2, borderSize + 2));

        ctx.clearRect(0, 0, size, size);

        console.log("[StickerEngine] Rendering dilated background cushion in progress (360 degrees, step 6)...");
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        // Iterate around 360 degrees to stamp a perfectly thick clean white uniform border
        // Step size 6 for highly detailed, beautiful and crisp border outlines
        for (let angle = 0; angle < 360; angle += 6) {
          const rad = (angle * Math.PI) / 180;
          const ox = Math.cos(rad) * borderSize;
          const oy = Math.sin(rad) * borderSize;
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
    useFallbackMock: boolean = (REMOVE_BG_CONFIG.mode === "api" && !REMOVE_BG_CONFIG.api.apiKey)
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

      const normalizedCutout = await generateTransparentCutoutWithPadding(transparentCutout, 0, useFallbackMock);
      setTransparentCutoutUrl(normalizedCutout);
      setTraceCompleted(false);
      beginCutoutTransition();
      setAiProgress("Done");

      // 🌟 Trigger AI classification has already been initiated immediately on capture
      // if (!isPreset) {
      //   classifyUploadedImage(transparentCutout, "camera_capture.png");
      // }

      // 2. Perform the heavy physical sticker calculations asynchronously in the background
      generatePhysicalSticker(transparentCutout, STICKER_BORDER_SIZE, "#FFFFFF", useFallbackMock)
        .then((finalSticker) => {
          setGeneratedStickerUrl(finalSticker);
        })
        .catch((err) => {
          console.error("[Pipeline] Async physical sticker generation failed:", err);
          setGeneratedStickerUrl(normalizedCutout);
        });

      generateTransparentCutoutWithPadding(transparentCutout, STICKER_BORDER_SIZE, useFallbackMock)
        .then((paddedCutout) => {
          setPaddedCutoutUrl(paddedCutout);
        })
        .catch((err) => {
          console.error("[Pipeline] Async padded cutout generation failed:", err);
          setPaddedCutoutUrl(normalizedCutout);
        });

    } catch (e) {
      console.error("[Pipeline] Pipeline broken, falling back directly to original source image:", e);
      
      let iw = width || 500;
      let ih = height || 500;
      calculateTargetScaleFromDimensions(iw, ih);

      generatePhysicalSticker(sourceUrl, STICKER_BORDER_SIZE, "#FFFFFF", false).then(setGeneratedStickerUrl);
      generateTransparentCutoutWithPadding(sourceUrl, 0, false).then(setTransparentCutoutUrl);
      generateTransparentCutoutWithPadding(sourceUrl, STICKER_BORDER_SIZE, false).then(setPaddedCutoutUrl);
      setTraceCompleted(false);
      beginCutoutTransition();
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

    if (shouldRunCamera) {
      setCameraError(false);
      setCameraErrorMessage("");

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraActive(false);
        setCameraError(true);
        setCameraErrorMessage(
          window.isSecureContext
            ? "Camera access is unavailable in this browser. You can still upload a photo."
            : "Camera requires HTTPS on mobile browsers. Open the app from an HTTPS URL, or add the HTTPS PWA to your home screen."
        );
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch((err) => console.log("Play interrupted:", err));
            setCameraActive(true);
          }
        })
        .catch((err) => {
          console.warn("Could not access physical camera, using cinematic fallback simulator:", err);
          setCameraActive(false);
          setCameraError(true);
          setCameraErrorMessage(
            err?.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access in browser settings, or upload a photo."
              : "Could not start the camera. You can still upload a photo."
          );
        });
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, scanStep, uploadedImageUrl, storageFlowStep, subLocationImg, parentLocationImg]);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
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
      setCustomDate("Today");
      setIsEditingPrice(false);
      setIsEditingDate(false);
      setUploadedImageUrl(null);
      setTransparentCutoutUrl(null);
      setCustomName("");
      setCustomCategory("");
      setTempIdentifiedTitle("");
      setTempIdentifiedCategory("");
      setGeneratedStickerUrl(null);
      setAiProgress(null);
      setTraceCompleted(false);
      setDisintegrateStart(false);
      setCutoutFlightStarted(false);
      setStickerSizeSettled(false);
      setIsTracingContour(false);
      setStorageFlowStep("none");
      setSubLocationImg(null);
      setSubLocationName("");
      setSubLocationHighlight(null);
      setParentLocationImg(null);
      setParentLocationName("");
    }
  }, [isOpen]);

  // Synchronize pre-fetched AI title and category to active displaying states immediately
  useEffect(() => {
    if (tempIdentifiedTitle) {
      setCustomName(tempIdentifiedTitle);
    }
  }, [tempIdentifiedTitle]);

  useEffect(() => {
    if (tempIdentifiedCategory) {
      setCustomCategory(getLocalizedCategory(tempIdentifiedCategory));
    }
  }, [tempIdentifiedCategory]);

  // Hook to trigger smoothly timed CSS scaling during disintegration state
  useEffect(() => {
    if (scanStep === "disintegrating") {
      setCutoutFlightStarted(false);
      const timer = setTimeout(() => {
        setDisintegrateStart(true);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setDisintegrateStart(false);
      setCutoutFlightStarted(false);
    }
  }, [scanStep]);

  useEffect(() => {
    if (scanStep !== "disintegrating" || !(paddedCutoutUrl || transparentCutoutUrl)) return;

    setCutoutFlightStarted(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const flightEl = cutoutFlightRef.current;
        setCutoutFlightStarted(true);
        if (flightEl?.animate) {
          cutoutFlightAnimationRef.current?.cancel();
          cutoutFlightAnimationRef.current = flightEl.animate(
            [
              {
                left: `${layout.left}px`,
                top: `${layout.top}px`,
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                opacity: 1,
              },
              {
                left: `${finalStickerLeft}px`,
                top: `${finalStickerTop}px`,
                width: `${finalStickerVisualSize}px`,
                height: `${finalStickerVisualSize}px`,
                opacity: 1,
              },
            ],
            {
              duration: 1180,
              easing: "cubic-bezier(0.2, 0.9, 0.18, 1)",
              fill: "both",
            }
          );
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      cutoutFlightAnimationRef.current?.cancel();
      cutoutFlightAnimationRef.current = null;
    };
  }, [
    scanStep,
    paddedCutoutUrl,
    transparentCutoutUrl,
    layout.left,
    layout.top,
    layout.width,
    layout.height,
    finalStickerLeft,
    finalStickerTop,
    finalStickerVisualSize,
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
    if (scanStep !== "sticker" || !stickerSizeSettled || traceCompleted || !activeTraceImageSrc) {
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
      const duration = 300; // Extremely snappy 300ms progress trace

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
          // White outline tracing is complete! Switch to final sticker view.
          setTimeout(() => {
            setIsTracingContour(false);
            setTraceCompleted(true);
          }, 200);
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
  }, [scanStep, stickerSizeSettled, traceCompleted, paddedCutoutUrl, transparentCutoutUrl]);

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
    const duration = 1180; // Match the cutout flight so glow and outline can start as soon as particles disperse.

    let frameId: number;

    const drawPixelate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, W, H);

      // If snapshot is still loading (for custom files), stay dark briefly
      if (!isReady && elapsed < 300) {
        ctx.fillStyle = "#1F1F1E";
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
                r = imgData.data[pixelIndex];
                g = imgData.data[pixelIndex + 1];
                b = imgData.data[pixelIndex + 2];
              }
            } else if (activeItem.color) {
              const hex = activeItem.color.replace("#", "");
              r = parseInt(hex.substring(0, 2), 16) || 80;
              g = parseInt(hex.substring(2, 4), 16) || 75;
              b = parseInt(hex.substring(4, 6), 16) || 70;
            }

            // Continuous physical parameters for breezy drifting wind
            const vx = (Math.random() - 0.3) * 3.5; // slight drifting variance
            const vy = -Math.random() * 2.5 - 0.8; // beautiful upward uplift
            const size = Math.random() * 0.9 + 0.3; // super-fine particles for extremely delicate organic dissolve

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
              decay: Math.random() * 0.016 + 0.010, // elegant, speedier natural fade
              delay
            });
          }
        }
      }

      // Smoothly fade out the entire canvas's visual opacity over the second half of duration
      let canvasGlobalAlpha = 1.0;
      if (progress > 0.48) {
        canvasGlobalAlpha = Math.max(0.0, (1.0 - progress) / 0.52);
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
            p.vx += 0.05 + (Math.random() - 0.5) * 0.02;
            p.vy -= 0.02 + (Math.random() - 0.5) * 0.01;

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
        setTraceCompleted(false);
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
      // Query Gemini API via direct worker connection
      console.log(`[Storage AI] Requesting classification for ${phase} location directly to Worker...`);
      const result = await classifyLocation(imageSrc, phase, parentLocationName);
      detectedName = result.name;
      console.log(`[Storage AI] Successfully identified: ${detectedName}`);
    } catch (err) {
      console.warn("[Storage AI] Error or rate limit calling direct Worker Vision/Gemini API:", err);
    }

    // Smart Fallback if Gemini returned empty or failed
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
    }
    
    // Fall back to preset SVG vectors if camera is disabled
    if (!sourceBaseUrl) {
      sourceBaseUrl = await generatePresetTransparentImage();
      width = 180;
      height = 180;
      isPreset = true;
    }

    if (isPreset) {
      setCustomName(activeItem.name);
      setTempIdentifiedTitle(activeItem.name);
      setTempIdentifiedCategory("");
    } else {
      setCustomName("");
      setCustomCategory(isChinese ? "其它" : "Others");
      setTempIdentifiedTitle("");
      setTempIdentifiedCategory("");
      // Start classification immediately on capture!
      classifyUploadedImage(sourceBaseUrl, "camera_capture.png");
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

  // Frontend upload & object classification handler calling pure client-side Vertex AI for Firebase
  const classifyUploadedImage = async (imageInput: string | File, originalFileName: string) => {
    try {
      console.log("[Classifier] Starting image compression to maximum width 800 for optimal token economy...");
      
      const compressedWithPrefix = await prepareImage(imageInput, 800);
      let cleanedBase64 = compressedWithPrefix.includes(",") ? compressedWithPrefix.split(",")[1] : compressedWithPrefix;
      let mimeType = "image/jpeg";

      if (!cleanedBase64) {
        console.warn("[Classifier] Image compression returned empty string.");
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
      console.log("[Classifier] Auto-recognition result:", result);

      if (result.title) {
        let cleanTitle = cleanAndShortenTitle(result.title);
        try {
          // Generate customized storage title based on identified object info
          const storageTitle = await generateStorageTitle(result.title, result.category || "", result.labels || []);
          if (storageTitle) {
            cleanTitle = cleanAndShortenTitle(storageTitle);
          }
        } catch (titleErr) {
          console.warn("[Classifier] Failed to generate customized storage title:", titleErr);
        }
        setTempIdentifiedTitle(cleanTitle);
        setCustomName(cleanTitle);
      }
      if (result.category) {
        setTempIdentifiedCategory(result.category);
        setCustomCategory(getLocalizedCategory(result.category));
      }
    } catch (err: any) {
      console.warn("[Classifier] Handled exception or rate-limit in auto-recognize item:", err.message || err);
      setTempIdentifiedTitle(`Scanned Item`);
    }
  };

  // Live real file uploaded event with Aoscdn API and high-fidelity Chroma Keying fallback
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (storageFlowStep === "sub_capture") {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
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

    // Synchronously clean state and start async classification immediately on raw File in parallel!
    setCustomName("");
    setCustomCategory(isChinese ? "其它" : "Others");
    setTempIdentifiedTitle("");
    setTempIdentifiedCategory("");
    classifyUploadedImage(file, file.name);

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
          const normalizedCutout = await generateTransparentCutoutWithPadding(transparentBase64, 0, false);

          setTransparentCutoutUrl(normalizedCutout);
          setTraceCompleted(false);
          beginCutoutTransition();
          setAiProgress("Done");

          // Generate physical white borders and padded cutout asynchronously
          generatePhysicalSticker(transparentBase64, STICKER_BORDER_SIZE, "#FFFFFF", false)
            .then((finalStickerUrl) => {
              setGeneratedStickerUrl(finalStickerUrl);
            })
            .catch((stickerErr) => {
              console.error("[Sticker Generation] Failed to generate border:", stickerErr);
              setGeneratedStickerUrl(normalizedCutout);
            });

          generateTransparentCutoutWithPadding(transparentBase64, STICKER_BORDER_SIZE, false)
            .then((paddedCutoutUrl) => {
              setPaddedCutoutUrl(paddedCutoutUrl);
            })
            .catch((paddedErr) => {
              console.error("[Padded Cutout] Failed to generate padding:", paddedErr);
              setPaddedCutoutUrl(normalizedCutout);
            });
        } catch (err: any) {
          console.error("[Background Removal] Processing failed:", err);
          // Complete fallback: use original image as transparent url
          generateTransparentCutoutWithPadding(b64, 0, false).then(setTransparentCutoutUrl);
          generatePhysicalSticker(b64, STICKER_BORDER_SIZE, "#FFFFFF", false).then(setGeneratedStickerUrl);
          generateTransparentCutoutWithPadding(b64, STICKER_BORDER_SIZE, false).then(setPaddedCutoutUrl);
          setTraceCompleted(false);
          beginCutoutTransition();
          setAiProgress("Done");
        }
      };
      img.onerror = () => {
        calculateTargetScaleFromDimensions(500, 500);
        generateTransparentCutoutWithPadding(b64, 0, false).then(setTransparentCutoutUrl);
        generatePhysicalSticker(b64, STICKER_BORDER_SIZE, "#FFFFFF", false).then(setGeneratedStickerUrl);
        generateTransparentCutoutWithPadding(b64, STICKER_BORDER_SIZE, false).then(setPaddedCutoutUrl);
        setTraceCompleted(false);
        beginCutoutTransition();
        setAiProgress("Done");
      };
      img.src = b64;
    };
  };

  // Helper to parse pasted Firebase config blocks
  const parseAndApplyJson = (text: string) => {
    try {
      let jsonStr = text.trim();
      if (jsonStr.includes("firebaseConfig")) {
        const match = jsonStr.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})/);
        if (match) {
          jsonStr = match[1];
        }
      }
      
      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (_) {
        const formatted = jsonStr
          .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
        parsed = JSON.parse(formatted);
      }

      if (parsed && parsed.apiKey) {
        setFbApiKey(parsed.apiKey || "");
        setFbAuthDomain(parsed.authDomain || "");
        setFbProjectId(parsed.projectId || "");
        setFbStorageBucket(saved => saved || parsed.storageBucket || "");
        setFbMessagingSenderId(parsed.messagingSenderId || "");
        setFbAppId(parsed.appId || "");
        setFbMeasurementId(parsed.measurementId || "");
        setRawConfigJson("");
        return true;
      }
    } catch (e) {
      console.error("Failed to parse config string:", e);
    }
    return false;
  };

  const handleObjectConfirmed = () => {
    setStorageFlowStep("sub_capture");
  };

  // Add item save to Noma's searchable memory bank
  const handleSaveMemory = () => {
    if (onItemAdded) {
      const rawName = uploadedImageUrl ? (customName.trim() || "Uploaded Item") : activeItem.name;
      const formattedPrice = priceInput.trim() ? `$${priceInput.trim()}` : "$25.00";
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

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="camera-page-container camera-wrapper absolute inset-0 bg-[#161616]/98 z-50 overflow-hidden select-none animate-fade-in pb-0"
      style={{ height: "var(--app-height, 100vh)", paddingBottom: "0px" }}
    >
      {/* Hidden element to force immediate pre-loading and browser initialization of the Alkatra font */}
      <span className="font-alkatra opacity-0 absolute pointer-events-none select-none w-1 h-1 overflow-hidden" aria-hidden="true">AI</span>
      
      {/* 1. FULL VIEWPORT CAMERA FEED AND AR CANVASES (Paddings removed to allow full upper stretch) */}
      <div className="absolute inset-0 bg-[#1F1F1E] flex flex-col items-center justify-center text-center w-full">
        
        {/* Hidden upload file input element */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Top Header Guidelines Title overlay */}
        {storageFlowStep === "none" && scanStep === "viewport" && (
          <div className="capture-top-prompt absolute top-[calc(max(56px,env(safe-area-inset-top))+36px)] inset-x-6 z-20 flex flex-col items-center pointer-events-none">
            <h3 
              id="camera-guide-title"
              className="text-white text-[16px] font-sans font-medium tracking-tight text-center max-w-[200px] leading-snug"
            >
              Show me what you want to remember.
            </h3>
          </div>
        )}

        {/* Full-bleed active container spanning whole upper viewport and extending 44px deep behind bottom sheet */}
        <div 
          id="camera-view"
          className="absolute inset-0 flex items-center justify-center transition-all duration-75"
          style={{
            bottom: `${cameraViewBottomOffset}px`,
            backgroundColor: scanStep === "disintegrating" || scanStep === "sticker" || scanStep === "done" ? "#E9E6E1" : "#1F1F1E",
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
              ) : cameraActive ? (
                <video
                  ref={videoRef}
                  className="absolute w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                // Beautiful high-craft minimalist deep background with no distracting overlay symbols
                <div className="absolute inset-0 bg-[#161616]" />
              )}

              {cameraError && cameraErrorMessage && (
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white backdrop-blur-md">
                    <Camera className="w-7 h-7" />
                  </div>
                  <p className="max-w-[280px] text-white/80 text-[13px] leading-relaxed font-sans">
                    {cameraErrorMessage}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 px-5 rounded-full bg-white text-[#232121] text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.25)] active:scale-95 transition-transform"
                  >
                    Upload Photo
                  </button>
                </div>
              )}

              {/* Viewport Center-Focusing Corners reticle box */}
              <div
                className="absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20"
                style={{ bottom: `${focusReticleInsetBottom}px` }}
              >
                <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] -mt-12">
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
              className="absolute inset-0 z-10 w-full h-full overflow-hidden animate-disintegrate-bg"
            >
              <canvas 
                ref={pixelateCanvasRef} 
                className="absolute inset-0 w-full h-full pointer-events-none" 
              />

              {/* Decorative Soft Yellow Gaussian Glow underlay removed from Phase 3-2 */}

              {/* Cutout subject shrinks smoothly to its target place while disintegration particles disperse concurrently! */}
              {(paddedCutoutUrl || transparentCutoutUrl) && (
                <div 
                  ref={cutoutFlightRef}
                  key={`cutout-flight-${uploadedImageUrl ? "upload" : "capture"}-${selectedItemIndex}-${scanStep}`}
                  className="absolute pointer-events-none flex items-center justify-center z-20"
                  style={{
                    left: `${cutoutFlightStarted ? finalStickerLeft : layout.left}px`,
                    top: `${cutoutFlightStarted ? finalStickerTop : layout.top}px`,
                    width: `${cutoutFlightStarted ? finalStickerVisualSize : layout.width}px`,
                    height: `${cutoutFlightStarted ? finalStickerVisualSize : layout.height}px`,
                    transformOrigin: "center center",
                    transition: "left 1180ms cubic-bezier(0.2, 0.9, 0.18, 1), top 1180ms cubic-bezier(0.2, 0.9, 0.18, 1), width 1180ms cubic-bezier(0.2, 0.9, 0.18, 1), height 1180ms cubic-bezier(0.2, 0.9, 0.18, 1)",
                    willChange: "left, top, width, height",
                  }}
                >
                  <img
                    src={paddedCutoutUrl || transparentCutoutUrl || ""}
                    alt="Shrinking cutout subject"
                    className="w-full h-full object-contain z-[12]"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
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
                className="absolute left-1/2 top-[37%] flex items-center justify-center z-10"
                style={{
                  width: "300px",
                  height: "300px",
                  transform: "translate(-50%, -50%)"
                }}
              >
                
                {/* Decorative Soft Yellow Gaussian Glow underlay - fully solid, blur-[50px] as requested */}
                <div 
                  className="absolute w-[236px] h-[236px] rounded-full bg-[#FFB300] blur-[52px] pointer-events-none z-0 animate-yellow-glow" 
                  style={{
                    left: "calc(50% - 118px)",
                    top: "calc(50% - 118px)",
                  }}
                />

                {/* Sticker element wrapper kept upright to avoid a rotation jump after the cutout flight. */}
                <motion.div 
                  layoutId="sticker-and-title-layout"
                  className="relative flex items-center justify-center z-10"
                  style={{
                    width: "280px",
                    height: "280px",
                    rotate: "0deg",
                  }}
                  transition={{ type: "spring", stiffness: 180, damping: 22 }}
                >
                  {!traceCompleted && (paddedCutoutUrl || transparentCutoutUrl) ? (
                    // Tracing phase displays the fixed 256x256 asset at the larger visual size.
                    <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                      <img 
                        src={paddedCutoutUrl || transparentCutoutUrl || ""} 
                        alt="Cutout Subject" 
                        className="w-full h-full object-contain block select-none pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                      <canvas 
                        ref={outlineTraceCanvasRef} 
                        className="absolute inset-0 w-full h-full pointer-events-none z-30" 
                      />
                    </div>
                  ) : generatedStickerUrl ? (
                    <motion.img 
                      id="final-sticker-view"
                      layoutId="sticker-image-layout"
                      src={generatedStickerUrl} 
                      alt="Physical Contour Cutout Sticker" 
                      className="w-full h-full object-contain block select-none transform transition-all duration-300 hover:scale-105 active:scale-95 cursor-grab"
                      style={{
                        filter: "none",
                      }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-white/95 rounded-full border-4 border-[#8E7C66]/30 p-5 shadow-sm text-center animate-pulse">
                      <div className="w-10 h-10 rounded-full border-[3px] border-[#8D7D66]/20 border-t-[#8D7D66] animate-spin mb-3" />
                      <span id="final-sticker-loader-label" className="text-[11px] font-mono font-bold text-[#3E3C3A] leading-tight uppercase tracking-wider block">
                        {aiProgress || "AI Loading..."}
                      </span>
                      <span className="text-[8px] text-[#8E7C66]/70 font-mono mt-1 block uppercase tracking-wider">
                        Please Hold Steady
                      </span>
                    </div>
                  )}

                  {/* 🌟 识别出来的物体的标题放在抠图的上层，下方的位置，使用alkatra字体，44号，文字颜色#000000，有白色描边粗细为6 */}
                  {/* Tracing completed before title fade in to avoid overlap */}
                  {(traceCompleted || scanStep === "done") && stickerTitleText && (
                    <motion.div 
                      layoutId="sticker-title-layout"
                      className="absolute left-[-18px] right-[-18px] text-center pointer-events-none select-none z-20 animate-fade-in font-alkatra overflow-visible"
                      style={stickerTitleStyle}
                    >
                      {stickerTitleLines.map((line) => (
                        <span key={line} className="block whitespace-nowrap">
                          {line}
                        </span>
                      ))}
                    </motion.div>
                  )}
                </motion.div>

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
                                  <span className="text-[12px] font-sans font-semibold text-black/70 tracking-tight leading-none">
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
                        bottom: "-48px",
                        transform: "translateX(-50%)"
                      }}
                    >
                      <div 
                        className="flex items-center justify-center gap-1.5 bg-white rounded-full shadow-none animate-fade-in cursor-pointer hover:scale-105 active:scale-95 transition-all select-none px-5"
                        style={{ 
                          height: "34px",
                        }}
                        onClick={() => setIsCategorySelectorOpen(!isCategorySelectorOpen)}
                      >
                        <span className="text-[15px] font-sans font-medium text-black/45 tracking-tight leading-none">
                          {customCategory}
                        </span>
                        <ChevronsUpDown className="w-3.5 h-3.5 text-black/35" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Bottom section housing the three action buttons and Tap to adjust Input field */}
              <div className="capture-bottom-actions absolute bottom-[146px] left-0 right-0 w-full flex flex-col items-center px-6">
                
                <div className="flex items-center justify-center gap-[44px] z-30 w-full">
                  {/* LEFT: Cancel circular button */}
                  <button
                    onClick={onClose}
                    className="w-[62px] h-[62px] rounded-full bg-white flex items-center justify-center border-0 hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer animate-pop-in-1 shadow-none"
                    title="Cancel"
                  >
                    <X className="w-6 h-6 text-[#232121]/50 stroke-[1.8]" />
                  </button>

                  {/* CENTER: Main Confirm Save circular button */}
                  <button
                    onClick={handleObjectConfirmed}
                    className="w-[72px] h-[72px] rounded-full bg-[#232121] flex items-center justify-center border border-transparent hover:bg-black hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer animate-pop-in-2 shadow-none"
                    title="Confirm Save"
                  >
                    <Check className="w-8 h-8 text-white stroke-[2]" />
                  </button>

                  {/* RIGHT: Reset Scan circular button */}
                  <button
                    onClick={() => {
                      setScanStep("viewport");
                      setUploadedImageUrl(null);
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
                className="absolute left-1/2 bottom-[62px] z-30 animate-fade-in flex-shrink-0 -translate-x-1/2" 
                style={{ width: "316px", height: "56px" }}
              >
                <input
                  type="text"
                  className="w-full h-full rounded-full bg-[#232121]/[0.05] border-0 pl-8 pr-12 text-[#232121]/50 text-[13px] font-sans placeholder-[#232121]/50 font-semibold tracking-tight text-center focus:outline-none focus:ring-2 focus:ring-[#232121]/10"
                  placeholder="Not what you expected？ Tap to adjust"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#232121]/35">
                  <Pencil className="w-4 h-4" />
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
              {storageFlowStep !== "final_result" && (
                <div className="capture-top-prompt absolute top-[calc(max(56px,env(safe-area-inset-top))+36px)] inset-x-6 z-40 flex flex-col items-center pointer-events-none">
                  <h3 
                    className="text-[18px] font-sans font-semibold tracking-tight text-center max-w-[280px] leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
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

                {/* 1. Sub Location Capture (Live Viewport) */}
                {storageFlowStep === "sub_capture" && (
                  <>
                    {cameraActive ? (
                      <video
                        ref={videoRef}
                        className="absolute w-full h-full object-cover"
                        autoPlay
                        playsInline
                        muted
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[#161616]" />
                    )}

                    {/* Viewport Center Focusing Reticle */}
                    <div
                      className="absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20"
                      style={{ bottom: `${focusReticleInsetBottom}px` }}
                    >
                      <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] -mt-12">
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
                        <div className="absolute w-12 h-12 rounded-full bg-[#FFB300]/40 animate-ping" />
                        <div className="absolute w-8 h-8 rounded-full bg-[#FFB300]/50 blur-[4px] animate-pulse" />
                        <div className="w-4 h-4 rounded-full bg-white border-2 border-[#FFB300] shadow-[0_0_12px_#FFB300] relative z-10" />
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Parent Location Capture */}
                {storageFlowStep === "parent_capture" && (
                  <>
                    {cameraActive ? (
                      <video
                        ref={videoRef}
                        className="absolute w-full h-full object-cover"
                        autoPlay
                        playsInline
                        muted
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[#161616]" />
                    )}

                    {/* Viewport Center Focusing Reticle */}
                    <div
                      className="absolute top-0 left-0 right-0 w-full flex flex-col items-center justify-center pointer-events-none z-20"
                      style={{ bottom: `${focusReticleInsetBottom}px` }}
                    >
                      <div className="w-[164px] h-[164px] flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] -mt-12">
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
                    className="absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-y-auto px-6 pt-16 pb-16"
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

                    {/* Top Right Cancel Button */}
                    <button
                      onClick={() => {
                        setStorageFlowStep("parent_confirm");
                      }}
                      className="capture-top-cancel absolute top-[calc(max(44px,env(safe-area-inset-top)))] right-6 z-50 text-[14px] font-sans font-semibold text-neutral-400 hover:text-neutral-700 active:scale-95 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>

                    {/* Main Sticker Element with + Value Tag & Yellow Gaussian Glow */}
                    <div className="relative mt-[28px] mb-[60px] z-10 flex flex-col items-center justify-center flex-shrink-0">
                      <div 
                        className="relative flex items-center justify-center overflow-visible"
                        style={{
                          width: "250px",
                          height: "250px"
                        }}
                      >
                        {/* Decorative Soft Yellow Gaussian Glow underlay - EXACTLY matches Object Results */}
                        <div 
                          className="absolute w-[200px] h-[200px] rounded-full bg-[#FFB300] blur-[44px] pointer-events-none z-0 animate-yellow-glow" 
                          style={{
                            left: "calc(50% - 100px)",
                            top: "calc(50% - 100px)",
                          }}
                        />

                        {/* + Value Tag - Click to edit value amount */}
                        <div 
                          onClick={() => {
                            const val = window.prompt("Enter item value / valuation:", priceInput || "15.00");
                            if (val !== null) {
                              const cleaned = val.replace("$", "").trim();
                              setPriceInput(cleaned);
                            }
                          }}
                          className="absolute top-2 right-2 bg-[#1C1917] text-white text-[10px] font-sans font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.15)] z-20 cursor-pointer border border-neutral-800 hover:scale-105 active:scale-95 transition-all select-none"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FFB300]" />
                          <span className="tracking-tight uppercase text-neutral-400 font-bold">Val:</span>
                          <span className="tracking-tight uppercase text-white font-extrabold">
                            {priceInput ? `$${priceInput}` : "Add Value"}
                          </span>
                        </div>

                        {generatedStickerUrl ? (
                          <img 
                            src={generatedStickerUrl} 
                            alt="Final Sticker" 
                            className="w-[250px] h-[250px] object-contain block select-none pointer-events-none relative z-10"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-[100px] block leading-none relative z-10">{activeItem.emoji}</span>
                        )}

                        {/* Alkatra large editable title with white text stroke - contentEditable with expanded horizontal bounds to prevent any cutting off */}
                        <div className="absolute bottom-2 left-[-60px] right-[-60px] z-20 flex justify-center">
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
                            className="w-full text-center font-alkatra font-bold focus:outline-none bg-transparent select-text caret-[#232121] outline-none border-0 overflow-visible"
                            style={{
                              fontSize: "40px",
                              color: "#000000",
                              WebkitTextStroke: "6px #ffffff",
                              paintOrder: "stroke fill",
                              lineHeight: "1.1",
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
                              const FINAL_FAN_POSITIONS = [
                                { x: -105, y: -60 },
                                { x: 110, y: 15 },
                                { x: 110, y: 80 },
                                { x: -105, y: 90 },
                              ];
                              return otherCategories.map((cat, idx) => {
                                const pos = FINAL_FAN_POSITIONS[idx] || { x: 0, y: 0 };
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
                                      rotate: 0,
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
                                      <span className="text-[12px] font-sans font-semibold text-black/70 tracking-tight leading-none">
                                        {cat}
                                      </span>
                                    </div>
                                  </motion.div>
                                );
                              });
                            })()
                          }
                        </AnimatePresence>

                        {/* Active anchoring tag - shadow/boxShadow completely removed as requested */}
                        <div 
                          className="absolute left-1/2 z-35"
                          style={{ 
                            bottom: "-34px",
                            transform: "translateX(-50%)"
                          }}
                        >
                          <div 
                            className="flex items-center justify-center gap-1.5 bg-white rounded-full shadow-none border-0 animate-fade-in cursor-pointer hover:scale-105 active:scale-95 transition-all select-none px-4"
                            style={{ 
                              height: "30px",
                            }}
                            onClick={() => setIsCategorySelectorOpen(!isCategorySelectorOpen)}
                          >
                            <span className="text-[12px] font-sans font-semibold text-black/70 tracking-tight leading-none">
                              {customCategory || "Select Category"}
                            </span>
                            <ChevronsUpDown className="w-3.5 h-3.5 text-black/40" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Time Label */}
                    <div className="text-[11px] font-sans text-neutral-400 font-bold tracking-tight mt-1 z-10 flex-shrink-0">
                      {toTitleCase(customDate === "Today" ? "Stored just now" : `Stored on ${customDate}`)}
                    </div>

                    {/* Location Information Card */}
                    <div className="bg-white rounded-[24px] p-3 flex items-center justify-between shadow-[0_8px_30px_rgba(0,0,0,0.04)] w-full max-w-[310px] mt-6 border border-white/60 z-10 flex-shrink-0">
                      {/* Left side: Overlapping photos */}
                      <div className="relative w-[58px] h-[58px] flex-shrink-0">
                        {/* Parent Location Image (Base) */}
                        <div className="w-[50px] h-[50px] rounded-[10px] overflow-hidden shadow-inner bg-neutral-100 border border-neutral-100 flex items-center justify-center">
                          {parentLocationImg ? (
                            <img src={parentLocationImg} alt="Parent Location" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg">🏠</span>
                          )}
                        </div>

                        {/* Sub Location Image (Overlapping at bottom-right corner) */}
                        <div className="absolute bottom-[-1px] right-[-1px] w-[28px] h-[28px] rounded-[10px] overflow-hidden border-2 border-white shadow-md bg-neutral-100 flex items-center justify-center z-10">
                          {subLocationImg ? (
                            <img src={subLocationImg} alt="Sub Location" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px]">📦</span>
                          )}
                        </div>
                      </div>

                      {/* Right side: Location details inputs */}
                      <div className="flex-1 pl-3 text-left flex flex-col justify-center">
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] flex-shrink-0">📍</span>
                          <input
                            type="text"
                            value={parentLocationName}
                            onChange={(e) => setParentLocationName(e.target.value)}
                            className="font-sans font-extrabold text-[22px] text-[#232121] focus:outline-none bg-transparent w-full caret-[#232121] border-b border-transparent focus:border-neutral-200 py-0.5 outline-none"
                            placeholder="Parent Location"
                          />
                        </div>
                        <div className="pl-[16px] mt-0.5">
                          <input
                            type="text"
                            value={subLocationName}
                            onChange={(e) => setSubLocationName(e.target.value)}
                            className="font-sans font-bold text-[18px] text-neutral-400 focus:outline-none bg-transparent w-full caret-[#232121] border-b border-transparent focus:border-neutral-200 py-0.5 outline-none"
                            placeholder="Sub Location"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Save / Complete Checkmark circular button */}
                    <button
                      onClick={handleSaveMemory}
                      className="w-[56px] h-[56px] rounded-full bg-[#181817] flex items-center justify-center hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.15)] cursor-pointer mt-8 flex-shrink-0 z-10"
                      title="Confirm Save"
                    >
                      <Check className="w-6 h-6 text-white stroke-[2.5]" />
                    </button>

                    {/* Helper text caption */}
                    <p className="text-[12px] font-sans text-[#232121]/50 font-normal mt-5 pb-2 tracking-tight select-none pointer-events-none text-center z-10">
                      Tap text to adjust
                    </p>
                  </div>
                )}

                {/* Floating cutout sticker + title anchored beside the storage action sheet */}
                {storageFlowStep !== "none" && storageFlowStep !== "final_result" && (
                  <div
                    className="absolute left-6 z-50 select-none pointer-events-none overflow-visible"
                    style={{
                      bottom: `${172 - cameraViewBottomOffset}px`,
                    }}
                  >
                    <motion.div 
                      layoutId="sticker-and-title-layout"
                      className="relative flex items-center justify-center"
                      style={{
                        width: "80px",
                        height: "80px",
                        rotate: "0deg",
                      }}
                      transition={{ type: "spring", stiffness: 180, damping: 22 }}
                    >
                      {generatedStickerUrl ? (
                        <motion.img 
                          layoutId="sticker-image-layout"
                          src={generatedStickerUrl} 
                          alt="Sticker thumbnail" 
                          className="w-full h-full object-contain block select-none pointer-events-none"
                          style={{
                            filter: "none"
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <motion.span 
                          layoutId="sticker-image-layout"
                          className="text-[45px] block leading-none select-none pointer-events-none"
                        >
                          {activeItem.emoji}
                        </motion.span>
                      )}
                      
                      {/* Alkatra overlay title exactly like the results page but styled proportionally */}
                      {(customName || activeItem.name) && (
                        <motion.div 
                          layoutId="sticker-title-layout"
                          className="absolute left-0 right-0 text-center pointer-events-none select-none z-20 font-alkatra"
                          style={{
                            fontSize: "12.5px",
                            fontWeight: "700",
                            color: "#000000",
                            WebkitTextStroke: "1.8px #ffffff",
                            paintOrder: "stroke fill",
                            lineHeight: "1.1",
                            bottom: "2px",
                          }}
                        >
                          {customName || activeItem.name}
                        </motion.div>
                      )}
                    </motion.div>
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
                  <div className="absolute top-[12px] w-12 h-1 bg-neutral-300 rounded-full opacity-70" />
                  
                  {/* Content based on storage flow step */}
                  <div className="w-full h-full flex flex-col items-center justify-center pt-0 pb-4">
                    {/* Step 1: Sub Location Capture */}
                    {storageFlowStep === "sub_capture" && (
                      <div className="flex items-center justify-center gap-12 w-full">
                        {/* Photo upload trigger */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-12 h-12 rounded-full hover:bg-black/5 active:scale-95 flex items-center justify-center text-[#3A3938] transition-all cursor-pointer"
                          title="Upload file instead"
                        >
                          <ImageIcon className="w-6 h-6" />
                        </button>

                        {/* Aesthetic Shutter Button */}
                        <button
                          onClick={handleCapture}
                          className="group relative w-16 h-16 rounded-full flex items-center justify-center bg-white transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_24px_rgba(0,0,0,0.15)] cursor-pointer"
                          style={{ padding: "4px" }}
                        >
                          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-orange-400 to-red-400 opacity-90 scale-105 blur-[1px]" />
                          <div className="relative w-full h-full rounded-full bg-[#F3F1EC] flex items-center justify-center border-2 border-white shadow-inner">
                            <div className="w-6 h-6 rounded-full bg-[#181817] border border-black/10" />
                          </div>
                        </button>

                        {/* Cancel/Close storage location flow */}
                        <button
                          onClick={() => setStorageFlowStep("none")}
                          className="w-12 h-12 flex items-center justify-center text-[13px] font-sans text-neutral-500 hover:text-black font-normal transition-all active:scale-95 cursor-pointer"
                        >
                          Back
                        </button>
                      </div>
                    )}

                    {/* Step 2: Sub Location Spot Annotation */}
                    {storageFlowStep === "sub_spot" && (
                      <div className="w-full flex flex-col items-center gap-4">
                        {/* Buttons Area */}
                        <div className="flex items-center justify-center gap-[44px] w-full">
                          {/* Cancel button */}
                          <button
                            onClick={() => {
                              setStorageFlowStep("none");
                              setSubLocationImg(null);
                            }}
                            className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Cancel Storage Flow"
                          >
                            <X className="w-5 h-5 text-[#232121]/50 stroke-[1.8]" />
                          </button>

                          {/* Confirm / Continue Button */}
                          <button
                            onClick={() => {
                              // To proceed to the second camera capture, we MUST have a spot clicked, or we default to center
                              if (!subLocationHighlight) {
                                setSubLocationHighlight({ x: 50, y: 50 });
                              }
                              setStorageFlowStep("parent_capture");
                            }}
                            className="w-14 h-14 rounded-full bg-[#232121] flex items-center justify-center hover:bg-black hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Continue to Parent Scene"
                          >
                            <Check className="w-6 h-6 text-white stroke-[2]" />
                          </button>

                          {/* Retry Capture button */}
                          <button
                            onClick={() => {
                              setStorageFlowStep("sub_capture");
                              setSubLocationImg(null);
                            }}
                            className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Retry Little Home Capture"
                          >
                            <RotateCcw className="w-4 h-4 text-[#232121]/50 stroke-[2]" />
                          </button>
                        </div>

                        {/* Custom sub-location title input box */}
                        <div className="relative" style={{ width: "316px", height: "42px" }}>
                          <input
                            type="text"
                            className="w-full h-full rounded-full bg-[#232121]/[0.05] border-0 px-12 text-[#232121]/50 text-[13px] font-sans placeholder-[#232121]/50 font-semibold tracking-tight text-center focus:outline-none focus:ring-2 focus:ring-[#232121]/10"
                            placeholder="Name of this little home? (e.g. Bedside table)"
                            value={subLocationName}
                            onChange={(e) => setSubLocationName(e.target.value)}
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#232121]/40">
                            <Pencil className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Parent Location Capture */}
                    {storageFlowStep === "parent_capture" && (
                      <div className="flex items-center justify-center gap-12 w-full relative">
                        {/* Gallery Upload shortcut on the left (matches sub_capture layout) */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-12 h-12 rounded-full hover:bg-black/5 active:scale-95 flex items-center justify-center text-[#3A3938] transition-all cursor-pointer"
                          title="Upload file instead"
                        >
                          <ImageIcon className="w-6 h-6" />
                        </button>

                        {/* Aesthetic Shutter Button Wrapper with Overlapping Polaroid on top-left */}
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          {/* Sub-location photo layered at top-left of shutter button with smooth fly-in zoom & translate animation */}
                          {subLocationImg && (
                            <div 
                              className="absolute -top-8 -left-3 z-50 w-12 h-12 bg-white p-0.5 rounded-sm border border-white shadow-lg cursor-pointer animate-polaroid-fly"
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

                          {/* Aesthetic Shutter Button */}
                          <button
                            onClick={handleCapture}
                            className="group relative w-16 h-16 rounded-full flex items-center justify-center bg-white transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_24px_rgba(0,0,0,0.15)] cursor-pointer"
                            style={{ padding: "4px" }}
                          >
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-orange-400 to-red-400 opacity-90 scale-105 blur-[1px]" />
                            <div className="relative w-full h-full rounded-full bg-[#F3F1EC] flex items-center justify-center border-2 border-white shadow-inner">
                              <div className="w-6 h-6 rounded-full bg-[#181817] border border-black/10" />
                            </div>
                          </button>
                        </div>

                        {/* Back button on the right */}
                        <button
                          onClick={() => setStorageFlowStep("sub_spot")}
                          className="w-12 h-12 flex items-center justify-center text-[13px] font-sans text-neutral-500 hover:text-black font-normal transition-all active:scale-95 cursor-pointer"
                        >
                          Back
                        </button>
                      </div>
                    )}

                    {/* Step 4: Parent Location Confirmation and text entry */}
                    {storageFlowStep === "parent_confirm" && (
                      <div className="w-full flex flex-col items-center gap-4">
                        {/* Buttons Area */}
                        <div className="flex items-center justify-center gap-[44px] w-full">
                          {/* Cancel button */}
                          <button
                            onClick={() => {
                              setStorageFlowStep("none");
                              setParentLocationImg(null);
                            }}
                            className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Cancel Storage Flow"
                          >
                            <X className="w-5 h-5 text-[#232121]/50 stroke-[1.8]" />
                          </button>

                          {/* Final Save Confirm Button */}
                          <button
                            onClick={() => setStorageFlowStep("final_result")}
                            className="w-14 h-14 rounded-full bg-[#232121] flex items-center justify-center hover:bg-black hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Save Memory & Storage Spot"
                          >
                            <Check className="w-6 h-6 text-white stroke-[2]" />
                          </button>

                          {/* Retry Capture button */}
                          <button
                            onClick={() => {
                              setStorageFlowStep("parent_capture");
                              setParentLocationImg(null);
                            }}
                            className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Retry Scene Capture"
                          >
                            <RotateCcw className="w-4 h-4 text-[#232121]/50 stroke-[2]" />
                          </button>
                        </div>

                        {/* Custom parent-location title input box */}
                        <div className="relative" style={{ width: "316px", height: "42px" }}>
                          <input
                            type="text"
                            className="w-full h-full rounded-full bg-[#232121]/[0.05] border-0 px-12 text-[#232121]/50 text-[13px] font-sans placeholder-[#232121]/50 font-semibold tracking-tight text-center focus:outline-none focus:ring-2 focus:ring-[#232121]/10"
                            placeholder="Where is this little home? (e.g. Master Bedroom)"
                            value={parentLocationName}
                            onChange={(e) => setParentLocationName(e.target.value)}
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#232121]/40">
                            <Pencil className="w-3.5 h-3.5" />
                          </div>
                        </div>
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
            <div className="drag-handle-bar w-12 h-1 bg-neutral-300 rounded-full opacity-70" style={{ transform: "translateY(-6px)" }} />
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
              <p className="text-[#3A3938] text-[10px] font-mono font-medium tracking-widest uppercase animate-pulse">
                {scanStep === "scanning" ? "SPATIAL COORDINATES LOCKING..." : "CRYSTAL BACKGROUND MATRIX DISSOLVING..."}
              </p>
            </div>
          )}
        </div>
      )}

      {showFirebaseSettings && (
        <div className="absolute inset-0 bg-[#161616]/96 backdrop-blur-xl z-50 flex flex-col justify-start overflow-y-auto px-6 py-12 text-white animate-fade-in no-scrollbar select-text">
          <div className="w-full max-w-md mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-sans font-semibold tracking-tight text-white">Firebase 识物配置</h2>
                <p className="text-xs font-sans text-neutral-400 mt-1">Configure client-side Vertex AI for Firebase</p>
              </div>
              <button
                onClick={() => setShowFirebaseSettings(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Paste JSON */}
            <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4">
              <h4 className="text-xs font-sans font-medium text-neutral-300 mb-2 uppercase tracking-wider">⚡ 快速配置：粘贴配置代码</h4>
              <p className="text-[11px] text-neutral-400 mb-3">
                直接从 Firebase 控制台复制 <code>firebaseConfig</code> 对象，粘贴在下方，我们将自动帮您解析。
              </p>
              <textarea
                className="w-full h-24 bg-black/40 border border-white/10 rounded-lg p-2.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-white/30"
                placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "...",\n  projectId: "..."\n};`}
                value={rawConfigJson}
                onChange={(e) => {
                  setRawConfigJson(e.target.value);
                  parseAndApplyJson(e.target.value);
                }}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] text-neutral-500">粘贴后将自动实时解析所有字段</span>
                <button
                  onClick={() => {
                    const success = parseAndApplyJson(rawConfigJson);
                    if (success) {
                      alert("解析成功！已自动填入下方字段。");
                    } else {
                      alert("解析失败，请检查粘贴的内容格式是否正确。");
                    }
                  }}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-sans font-medium text-neutral-200 transition-all cursor-pointer"
                >
                  手动解析
                </button>
              </div>
            </div>

            {/* Manual Form fields */}
            <div className="space-y-4 mb-8">
              <h4 className="text-xs font-sans font-medium text-neutral-400 uppercase tracking-wider">📝 详细配置参数</h4>
              
              <div>
                <label className="block text-[11px] font-sans text-neutral-400 mb-1">API Key *</label>
                <input
                  type="text"
                  className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                  value={fbApiKey}
                  onChange={(e) => setFbApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-sans text-neutral-400 mb-1">Project ID *</label>
                  <input
                    type="text"
                    className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                    value={fbProjectId}
                    onChange={(e) => setFbProjectId(e.target.value)}
                    placeholder="my-firebase-project"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans text-neutral-400 mb-1">App ID *</label>
                  <input
                    type="text"
                    className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                    value={fbAppId}
                    onChange={(e) => setFbAppId(e.target.value)}
                    placeholder="1:12345:web:abcd"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-sans text-neutral-400 mb-1">Auth Domain</label>
                <input
                  type="text"
                  className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                  value={fbAuthDomain}
                  onChange={(e) => setFbAuthDomain(e.target.value)}
                  placeholder="project-id.firebaseapp.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-sans text-neutral-400 mb-1">Storage Bucket</label>
                  <input
                    type="text"
                    className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                    value={fbStorageBucket}
                    onChange={(e) => setFbStorageBucket(e.target.value)}
                    placeholder="project-id.appspot.com"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans text-neutral-400 mb-1">Messaging Sender ID</label>
                  <input
                    type="text"
                    className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                    value={fbMessagingSenderId}
                    onChange={(e) => setFbMessagingSenderId(e.target.value)}
                    placeholder="1234567890"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-sans text-neutral-400 mb-1">Measurement ID (Optional)</label>
                <input
                  type="text"
                  className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm font-mono text-neutral-100 focus:outline-none focus:border-white/30"
                  value={fbMeasurementId}
                  onChange={(e) => setFbMeasurementId(e.target.value)}
                  placeholder="G-XXXXXX"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  clearFirebaseConfig();
                  setFbApiKey("");
                  setFbAuthDomain("");
                  setFbProjectId("");
                  setFbStorageBucket("");
                  setFbMessagingSenderId("");
                  setFbAppId("");
                  setFbMeasurementId("");
                  alert("配置已清除。");
                }}
                className="flex-1 h-12 rounded-xl bg-red-950/40 hover:bg-red-900/30 border border-red-500/10 text-red-400 font-sans font-medium transition-all cursor-pointer"
              >
                清除配置
              </button>
              <button
                onClick={() => {
                  if (!fbApiKey || !fbProjectId || !fbAppId) {
                    alert("请填写必填字段 (API Key, Project ID, App ID)");
                    return;
                  }
                  const newConfig: FirebaseConfig = {
                    apiKey: fbApiKey,
                    authDomain: fbAuthDomain,
                    projectId: fbProjectId,
                    storageBucket: fbStorageBucket,
                    messagingSenderId: fbMessagingSenderId,
                    appId: fbAppId,
                    measurementId: fbMeasurementId
                  };
                  saveFirebaseConfig(newConfig);
                  setShowFirebaseSettings(false);
                  alert("Firebase 配置已成功保存！");
                }}
                className="flex-1 h-12 rounded-xl bg-white text-black hover:bg-neutral-100 font-sans font-semibold transition-all cursor-pointer"
              >
                保存并生效
              </button>
            </div>

            {/* Config guidelines */}
            <div className="mt-8 text-[11px] text-neutral-400 leading-relaxed space-y-2">
              <p className="font-sans font-semibold text-neutral-300">💡 如何获取此配置？</p>
              <ol className="list-decimal pl-4 space-y-1 font-sans">
                <li>访问 <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">Firebase 控制台</a></li>
                <li>创建一个项目，或选择您现有的项目。</li>
                <li>在项目设置 (⚙️) ➜ “常规 (General)” ➜ “您的应用 (Your Apps)” 中，点击创建 <b>Web 应用</b>。</li>
                <li>注册应用后，在页面下方的 SDK 设置和配置部分中，复制 <code>firebaseConfig</code> 对象。</li>
                <li>粘贴在上方即可！</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Volumetric styling rule sheet */}
      <style>
        {`
          @keyframes sticker-settle {
            0% {
              transform: scale(1.08) rotate(0deg);
              filter: drop-shadow(15px 22px 10px rgba(0, 0, 0, 0.08));
              opacity: 0.9;
            }
            100% {
              transform: scale(1) rotate(0deg);
              filter: drop-shadow(6.5px 8px 0px rgba(0, 0, 0, 0.12));
              opacity: 1;
            }
          }
          @keyframes smooth-cinematic-fly {
            0% { 
              transform: scale(2.5) rotate(0deg); 
              opacity: 1;
              filter: drop-shadow(0px 0px 0px rgba(0,0,0,0));
            }
            15% {
              /* Freeze cutout at original visual screen location and layout scale */
              transform: scale(2.5) rotate(0deg);
              opacity: 1;
              filter: drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.05));
            }
            100% {
              /* Smoothly shrink and glide down to the center as an upright sticker element */
              transform: scale(1) rotate(0deg);
              opacity: 1;
              filter: drop-shadow(6.5px 8px 0px rgba(0, 0, 0, 0.12));
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
