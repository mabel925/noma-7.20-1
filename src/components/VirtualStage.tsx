import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { motion } from "motion/react";
import { PagNomaSprite } from "./PagNomaSprite";

const ROOM_NATIVE_WIDTH = 2064;
const ROOM_NATIVE_HEIGHT = 2532;
const NOMA_NATIVE_WIDTH = 600;

interface VirtualStageProps {
  isChatActive: boolean;
  bgRoomUrl: string;
  bgChatUrl: string;
  onReady?: () => void;
}

export const VirtualStage: React.FC<VirtualStageProps> = ({
  isChatActive,
  bgRoomUrl,
  bgChatUrl,
  onReady,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [parentDimensions, setParentDimensions] = useState({ width: 400, height: 844 });
  // Start from the real asset dimensions so the first hidden frame already has final geometry.
  const [aspectRatio, setAspectRatio] = useState<number>(ROOM_NATIVE_WIDTH / ROOM_NATIVE_HEIGHT);
  const [bgNaturalHeight, setBgNaturalHeight] = useState<number>(ROOM_NATIVE_HEIGHT);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [nomaReady, setNomaReady] = useState(false);
  const hasReportedReadyRef = useRef(false);

  const handleNomaReady = useCallback(() => {
    setNomaReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBackgroundReady(false);
    const urls = Array.from(new Set([bgRoomUrl, bgChatUrl]));
    Promise.all(urls.map((url) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = url;
    }))).then(() => {
      if (!cancelled) setBackgroundReady(true);
    });
    return () => { cancelled = true; };
  }, [bgRoomUrl, bgChatUrl]);

  useEffect(() => {
    if (backgroundReady && nomaReady && !hasReportedReadyRef.current) {
      hasReportedReadyRef.current = true;
      onReady?.();
    }
  }, [backgroundReady, nomaReady, onReady]);

  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const parent = stageRef.current.parentElement;
    if (!parent) return;

    const updateDimensions = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setParentDimensions((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };

    // Monitor parent's size dynamically to adapt on any window resizing/responsive states
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        updateDimensions(width, height);
      }
    });

    observer.observe(parent);
    
    // Initial measurement
    const rect = parent.getBoundingClientRect();
    updateDimensions(rect.width, rect.height);

    return () => observer.disconnect();
  }, []);

  // Dynamically calculate native aspect ratio of the background image to prevent stretching/cropping
  useEffect(() => {
    const img = new Image();
    img.src = bgRoomUrl;
    img.onload = () => {
      if (img.naturalHeight > 0) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
        setBgNaturalHeight(img.naturalHeight);
      }
    };
  }, [bgRoomUrl]);

  // The base-state width of virtual stage relative to screen frame height
  const H_frame = parentDimensions.height;
  const W_frame = parentDimensions.width;
  const W_stage = H_frame * aspectRatio;

  // Calculate Noma's scaled width so its scaling factor exactly matches the background image's scale (H_frame / bgNaturalHeight)
  const scaleMultiplier = bgNaturalHeight > 0 ? H_frame / bgNaturalHeight : 1;
  const nomaWidth = NOMA_NATIVE_WIDTH * scaleMultiplier;

  // State 1: Default status. Left edge is aligned at 0, scale is 1.0, top is 0.
  // State 2: Chat active status. Height is scaled by 0.84. Right edge is aligned with W_frame.
  // Using transformOrigin: "left top", the scaled stage resides in [T_x, T_x + 0.84 * W_stage].
  // Setting T_x = W_frame - 0.84 * W_stage places the right edge exactly at W_frame.
  // Translate up-left coordinates gracefully (y-axis offset of -135px to push up with the keyboard).
  // Background container is NOT scaled per user's request: "背景容器不要缩放"
  const transformScale = 1.0;

  // Detect PWA standalone mode dynamically to keep layouts and translations synchronized
  const [isPwa, setIsPwa] = useState<boolean>(false);
  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone = 
        (window.navigator as any).standalone || 
        window.matchMedia("(display-mode: standalone)").matches ||
        document.body.classList.contains("pwa-standalone") ||
        document.documentElement.classList.contains("pwa-standalone");
      setIsPwa(!!isStandalone);
    };
    checkStandalone();
    const observer = new MutationObserver(() => {
      checkStandalone();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 当 Chat 激活时，水平平移量设定为 -60px，保证在屏幕左侧优雅展现角色，不会因为过大的位移被移出屏幕。
  const T_x = isChatActive ? -60 : 0;

  const stageReady = backgroundReady && nomaReady;

  return (
    <motion.div 
      ref={stageRef}
      className="virtual-stage absolute top-0 overflow-hidden transition-opacity duration-300"
      style={{
        width: `${W_stage}px`,
        height: `${H_frame}px`,
        left: "0px",
        transformOrigin: "left top",
        opacity: stageReady ? 1 : 0,
      }}
      animate={{
        x: T_x,
        y: 0,
        scale: transformScale,
      }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      {/* 1. ROOM BACKGROUND: Highly atmospheric room illustration. Uses object-cover to prevent standard pixel distortion */}
      {bgRoomUrl === bgChatUrl ? (
        <motion.img
          src={bgRoomUrl}
          alt="Room background"
          className="absolute inset-0 w-full h-full object-cover opacity-100"
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          <motion.img
            src={bgRoomUrl}
            alt="Cozy room"
            className="absolute inset-0 w-full h-full object-cover"
            animate={{
              opacity: isChatActive ? 0 : 1,
            }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1]
            }}
            style={{ pointerEvents: isChatActive ? "none" : "auto" }}
            referrerPolicy="no-referrer"
          />

          {/* 2. OUTDOOR/CHAT BACKGROUND: Peaceful rolling hills. Uses object-cover to prevent standard pixel distortion */}
          <motion.img
            src={bgChatUrl}
            alt="Scenic outdoor meadow"
            className="absolute inset-0 w-full h-full object-cover"
            animate={{
              opacity: isChatActive ? 1 : 0,
            }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1]
            }}
            style={{ pointerEvents: isChatActive ? "auto" : "none" }}
            referrerPolicy="no-referrer"
          />
        </>
      )}

      {/* 4. DYNAMIC CHARACTER SPRITE: Noma */}
      {/* Sprite is locked proportionally with the background image, standing in the bottom-left corner of the screen */}
      <div
        className="absolute will-change-transform z-30"
        style={{
          bottom: `${260 * scaleMultiplier}px`,
          left: "30px",
          width: `${nomaWidth}px`,
          transformOrigin: "left bottom",
        }}
      >
        <PagNomaSprite
          pose={isChatActive ? "chatting" : "reading"}
          onReady={handleNomaReady}
        />
      </div>
    </motion.div>
  );
};
