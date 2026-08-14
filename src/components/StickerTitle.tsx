import type { CSSProperties } from "react";

export const STICKER_BASE_SIZE = 250;
export const STICKER_TITLE_HEIGHT = 104;
export const STICKER_TITLE_FONT_SIZE = 44;
export const STICKER_TITLE_STROKE = 12;

const getRoundedOutlineShadow = (radius: number): string => {
  const samples = 48;
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return `${x.toFixed(2)}px ${y.toFixed(2)}px 0 #ffffff`;
  }).join(", ");
};

export const getStickerTitleStyle = (size: number): CSSProperties => {
  const scale = size / STICKER_BASE_SIZE;

  return {
    width: `${size}px`,
    height: `${STICKER_TITLE_HEIGHT * scale}px`,
    bottom: "-6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${STICKER_TITLE_FONT_SIZE * scale}px`,
    fontWeight: "700",
    color: "#000000",
    WebkitTextStroke: "0 transparent",
    textShadow: getRoundedOutlineShadow((STICKER_TITLE_STROKE * scale) / 2),
    lineHeight: `${STICKER_TITLE_FONT_SIZE * scale}px`,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    overflow: "visible",
  };
};
