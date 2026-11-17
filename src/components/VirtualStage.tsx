import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { motion } from "motion/react";
import { PagNomaSprite } from "./PagNomaSprite";

const ROOM_NATIVE_WIDTH = 1347;
const ROOM_NATIVE_HEIGHT = 2532;
const NOMA_NATIVE_WIDTH = 600;
const HOME_BACKGROUND_FALLBACK_URL = "/startup.jpg";

interface VirtualStageProps {
  isChatActive: boolean;
  bgRoomUrl: string;
  bgChatUrl: string;
  viewportScale?: number;
  active?: boolean;
  onReady?: () => void;
}

export const VirtualStage: React.FC<VirtualStageProps> = ({
  isChatActive,
  bgRoomUrl,
  bgChatUrl,
  viewportScale = 1,
  active = true,
  onReady,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [parentDimensions, setParentDimensions] = useState({ width: 400, height: 844 });
  // Start from the real asset dimensions so the first hidden frame already has final geometry.
  const [aspectRatio, setAspectRatio] = useState<number>(ROOM_NATIVE_WIDTH / ROOM_NATIVE_HEIGHT);
  const [bgNaturalHeight, setBgNaturalHeight] = useState<number>(ROOM_NATIVE_HEIGHT);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [nomaReady, setNomaReady] = useState(false);
  const hasReportedReadyRef = useRef(false);

  const handleNomaReady = useCallback(() => {
    setNomaReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBackgroundReady(false);
    setBackgroundFailed(false);
    const urls = Array.from(new Set([bgRoomUrl, bgChatUrl]));
    Promise.all(urls.map((url) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const decode = typeof image.decode === "function" ? image.decode() : Promise.resolve();
        decode.catch(() => undefined).finally(resolve);
      };
      image.onerror = () => {
        console.error(`[Home] Failed to load background: ${url}`);
        if (!cancelled) setBackgroundFailed(true);
        resolve();
      };
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

  // Cover the viewport even when Safari's controls shorten the visible page.
  const H_frame = parentDimensions.height;
  const W_frame = parentDimensions.width;
  const W_stage = Math.max(W_frame, H_frame * aspectRatio);

  // Calculate Noma's scaled width so its scaling factor exactly matches the background image's scale (H_frame / bgNaturalHeight)
  const scaleMultiplier = bgNaturalHeight > 0 ? H_frame / bgNaturalHeight : 1;
  const nomaWidth = NOMA_NATIVE_WIDTH * scaleMultiplier;

  const transformScale = 1.0;

  // 当 Chat 激活时，水平平移量设定为 -60px，保证在屏幕左侧优雅展现角色，不会因为过大的位移被移出屏幕。
  const T_x = isChatActive ? -60 : 0;
  // Keep the character's existing travel. Move only the image to align its
  // right edge to the screen, compensating for the outer Chat zoom.
  const backgroundX = isChatActive
    ? W_frame - W_stage - T_x - W_frame / 2 * (1 - 1 / viewportScale)
    : 0;

  const stageReady = backgroundReady && nomaReady;
  const displayRoomUrl = backgroundFailed ? HOME_BACKGROUND_FALLBACK_URL : bgRoomUrl;

  return (
    <motion.div 
      ref={stageRef}
      className="virtual-stage absolute top-0 transition-opacity duration-300"
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
          src={displayRoomUrl}
          alt="Room background"
          className="absolute inset-0 w-full h-full object-cover opacity-100"
          initial={false}
          animate={{ x: backgroundX }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onLoad={() => setBackgroundReady(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          <motion.img
            src={bgRoomUrl}
            alt="Cozy room"
            className="absolute inset-0 w-full h-full object-cover"
            animate={{
              x: backgroundX,
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
              x: backgroundX,
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
          active={active}
          pose={isChatActive ? "chatting" : "reading"}
          onReady={handleNomaReady}
        />
      </div>
    </motion.div>
  );
};
