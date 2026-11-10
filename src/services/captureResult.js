const GENERIC_CAPTURE_TITLE = /^(?:(?:scanned|detected|recognized|unknown|unidentified)\s+)?(?:item|items|object|objects)$/i;

export const isUsableCaptureTitle = (value) => {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  return Boolean(title) && !GENERIC_CAPTURE_TITLE.test(title);
};

export const createResolvedCaptureResult = ({ title, category, stickerUrl }) => {
  const normalizedTitle = String(title || "").replace(/\s+/g, " ").trim();
  if (!isUsableCaptureTitle(normalizedTitle)) {
    throw new Error("A specific recognition title is required before showing the result");
  }

  return Object.freeze({
    name: normalizedTitle,
    category: String(category || "").trim() || "家居日用",
    stickerUrl: stickerUrl || undefined,
  });
};
