import type { CSSProperties } from "react";

export const STICKER_BASE_SIZE = 250;
export const STICKER_TITLE_HEIGHT = 104;
export const STICKER_TITLE_FONT_SIZE = 44;
export const STICKER_TITLE_STROKE = 12;

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
    WebkitTextStroke: `${STICKER_TITLE_STROKE * scale}px #ffffff`,
    paintOrder: "stroke fill",
    lineHeight: `${STICKER_TITLE_FONT_SIZE * scale}px`,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    overflow: "visible",
  };
};
