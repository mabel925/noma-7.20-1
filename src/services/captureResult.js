const GENERIC_CAPTURE_TITLE = /^(?:(?:scanned|detected|recognized|unknown|unidentified)\s+)?(?:item|items|object|objects)$/i;

export const isSpecificCaptureTitle = (value) => {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  return Boolean(title) && !GENERIC_CAPTURE_TITLE.test(title);
};

export const createCaptureResult = ({ title, category, stickerUrl, labels = [], attributes = undefined }) => {
  const normalizedTitle = String(title || "").replace(/\s+/g, " ").trim();
  const cleanList = (value, limit) => Array.isArray(value)
    ? value.map((entry) => String(entry).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, limit)
    : [];
  const cleanAttributes = attributes && typeof attributes === "object"
    ? {
        colors: cleanList(attributes.colors, 4),
        materials: cleanList(attributes.materials, 4),
        features: cleanList(attributes.features, 6),
        brand: String(attributes.brand || "").replace(/\s+/g, " ").trim().slice(0, 80),
      }
    : {};
  return Object.freeze({
    name: isSpecificCaptureTitle(normalizedTitle) ? normalizedTitle : "Scanned Item",
    category: String(category || "").trim() || "家居日用",
    stickerUrl: stickerUrl || undefined,
    labels: cleanList(labels, 8),
    attributes: cleanAttributes,
  });
};
