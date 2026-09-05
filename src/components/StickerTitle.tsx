import type { CSSProperties } from "react";

export const STICKER_BASE_SIZE = 250;
export const STICKER_TITLE_HEIGHT = 104;
export const STICKER_TITLE_FONT_SIZE = 44;
export const STICKER_TITLE_STROKE = 12;

export const isChineseTitle = (value: string): boolean => /[\u3400-\u9fff]/.test(value);

export const getRoundedOutlineShadow = (radius: number): string => {
  const samples = 48;
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return `${x.toFixed(2)}px ${y.toFixed(2)}px 0 #ffffff`;
  }).join(", ");
};

const emojiOutlineCache = new Map<string, string>();

export const generateEmojiOutline = (imageUrl: string): Promise<string> => {
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
