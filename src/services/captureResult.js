const GENERIC_CAPTURE_TITLE = /^(?:(?:scanned|detected|recognized|unknown|unidentified)\s+)?(?:item|items|object|objects)$/i;

export const isSpecificCaptureTitle = (value) => {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  return Boolean(title) && !GENERIC_CAPTURE_TITLE.test(title);
};

export const createCaptureResult = ({ title, category, stickerUrl }) => {
  const normalizedTitle = String(title || "").replace(/\s+/g, " ").trim();
  return Object.freeze({
    name: isSpecificCaptureTitle(normalizedTitle) ? normalizedTitle : "Scanned Item",
    category: String(category || "").trim() || "家居日用",
    stickerUrl: stickerUrl || undefined,
  });
};
