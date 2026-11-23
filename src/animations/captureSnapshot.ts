/** Copy the already-decoded photo using the exact scanning viewport crop. */
export function capturePhotoSnapshot(
  image: HTMLImageElement | null,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight || width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width); canvas.height = Math.round(height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const imageWidth = image.naturalWidth * scale, imageHeight = image.naturalHeight * scale;
  try {
    context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    return canvas;
  } catch {
    return null;
  }
}

/** Preserve the photographed region when the bottom controls leave the viewport. */
export function paintCaptureSnapshot(
  context: CanvasRenderingContext2D,
  snapshot: HTMLCanvasElement,
  width: number,
  height: number,
) {
  context.fillStyle = "#E9E6E1";
  context.fillRect(0, 0, width, height);
  context.drawImage(snapshot, 0, 0, width, snapshot.height * width / snapshot.width);
}
