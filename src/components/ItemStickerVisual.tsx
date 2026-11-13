import React from "react";
import { generateEmojiOutline, getStickerTitleStyle, isChineseTitle } from "./StickerTitle";

/** One composition for the item result and its smaller Chat previews. */
export const ItemStickerVisual = ({
  name, imageUrl, size = 250, showEmojiOutline = false, fallbackEmoji = "📦",
  onImageClick, onTitleClick, reveal = false,
}: {
  name: string;
  imageUrl?: string;
  size?: number;
  showEmojiOutline?: boolean;
  fallbackEmoji?: string;
  onImageClick?: () => void;
  onTitleClick?: () => void;
  reveal?: boolean;
}) => {
  const [emojiOutline, setEmojiOutline] = React.useState("");
  const [failedImage, setFailedImage] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    setEmojiOutline("");
    if (showEmojiOutline && imageUrl) {
      void generateEmojiOutline(imageUrl).then((result) => {
        if (!cancelled) setEmojiOutline(result);
      });
    }
    return () => { cancelled = true; };
  }, [imageUrl, showEmojiOutline]);

  const image = <>
    {emojiOutline && <img className="noma-add-emoji-outline" src={emojiOutline} alt="" aria-hidden="true" />}
    {imageUrl && failedImage !== imageUrl
      ? <img className="noma-add-emoji-image" src={imageUrl} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailedImage(imageUrl)} />
      : <span className="absolute inset-0 flex items-center justify-center text-[130px] leading-none" aria-hidden="true">{fallbackEmoji}</span>}
  </>;
  const titleStyle = { ...getStickerTitleStyle(250), zIndex: 3 };
  const titleClass = `noma-add-item-title ${isChineseTitle(name) ? "font-zihun-biantao" : "font-alkatra"}`;

  return <div className="relative shrink-0 overflow-visible" style={{ width: size, height: size }}>
    <div className="absolute left-0 top-0 h-[250px] w-[250px] origin-top-left" style={{ transform: `scale(${size / 250})` }}>
      {onImageClick
        ? <button type="button" className={`noma-add-emoji-media${reveal ? " is-revealing" : ""}`} onClick={onImageClick} aria-label="Change emoji">{image}</button>
        : <div className={`noma-add-emoji-media pointer-events-none${reveal ? " is-revealing" : ""}`}>{image}</div>}
      {onTitleClick
        ? <button type="button" className={titleClass} style={titleStyle} onClick={onTitleClick} aria-label="Edit item title">{name}</button>
        : <div className={titleClass} style={titleStyle}>{name}</div>}
    </div>
  </div>;
};
