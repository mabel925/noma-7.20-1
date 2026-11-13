import { SUPABASE_PUBLISHABLE_KEY, supabase } from "./supabaseClient";

const R2_PREFIX = "r2:";
const MEDIA_BASE = "/api/media";
const MAX_UPLOAD_BYTES = 500 * 1024;
const MEDIA_REQUEST_TIMEOUT_MS = 12_000;
let readSessionRequest: Promise<void> | null = null;

const fetchMedia = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), MEDIA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // Consume the body within the timeout, too.
    const blob = await response.blob();
    return { response, blob };
  } finally {
    window.clearTimeout(timer);
  }
};

type ImageProfile = {
  maxDimension: number;
  targetBytes: number;
  initialQuality: number;
  preserveTransparency: boolean;
};

const IMAGE_PROFILES: Record<"sticker" | "location", ImageProfile> = {
  sticker: { maxDimension: 768, targetBytes: 100 * 1024, initialQuality: 0.82, preserveTransparency: true },
  location: { maxDimension: 960, targetBytes: 250 * 1024, initialQuality: 0.78, preserveTransparency: false },
};

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("A valid login session is required to store images.");
  return token;
};

const authHeaders = (token: string, extra?: HeadersInit) => ({
  Authorization: `Bearer ${token}`,
  apikey: SUPABASE_PUBLISHABLE_KEY,
  ...extra,
});

const mediaKeyUrl = (key: string) =>
  `${MEDIA_BASE}/object/${key.split("/").map(encodeURIComponent).join("/")}`;

export const storedMediaValue = (key: string) => `${R2_PREFIX}${key}`;

export const mediaKeyFromValue = (value?: string | null): string | null => {
  if (!value) return null;
  if (value.startsWith(R2_PREFIX)) return value.slice(R2_PREFIX.length);
  try {
    const url = new URL(value, window.location.origin);
    const prefix = `${MEDIA_BASE}/object/`;
    if (!url.pathname.startsWith(prefix)) return null;
    return url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
};

export const displayMediaValue = (value?: string | null, version?: string) => {
  const key = mediaKeyFromValue(value);
  if (!key) return value || undefined;
  const suffix = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${mediaKeyUrl(key)}${suffix}`;
};

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith("data:") && !source.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be decoded before cloud upload."));
    image.src = source;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed.")), type, quality);
  });

const optimizeImage = async (source: string, profileName: "sticker" | "location"): Promise<Blob> => {
  const profile = IMAGE_PROFILES[profileName];
  const image = await loadImage(source);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  let scale = Math.min(1, profile.maxDimension / Math.max(sourceWidth, sourceHeight));
  let quality = profile.initialQuality;
  let best: Blob | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for image compression.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (!profile.preserveTransparency) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/webp", quality);
    best = !best || blob.size < best.size ? blob : best;
    if (blob.size <= profile.targetBytes) return blob;
    quality = Math.max(profile.preserveTransparency ? 0.38 : 0.55, quality - 0.07);
    if (attempt >= 2) scale *= 0.86;
  }

  if (!best || best.size > profile.targetBytes || best.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Image could not be compressed below ${Math.round(profile.targetBytes / 1024)}KB.`);
  }
  return best;
};

const sha256 = async (blob: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);

const uploadBlob = async (key: string, blob: Blob) => {
  const token = await getAccessToken();
  const response = await fetch(mediaKeyUrl(key), {
    method: "PUT",
    headers: authHeaders(token, { "Content-Type": blob.type || "image/webp" }),
    body: blob,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`R2 image upload failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return storedMediaValue(key);
};

export const mediaStorage = {
  ensureReadSession(): Promise<void> {
    if (readSessionRequest) return readSessionRequest;
    const request = (async () => {
      const token = await getAccessToken();
      const { response } = await fetchMedia(`${MEDIA_BASE}/session`, {
        method: "POST",
        headers: authHeaders(token),
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Private image session failed (${response.status}).`);
    })();
    readSessionRequest = request;
    request.finally(() => { if (readSessionRequest === request) readSessionRequest = null; }).catch(() => undefined);
    return request;
  },

  async readImage(url: string): Promise<Blob> {
    let result = await fetchMedia(url, { credentials: "same-origin", cache: "default" });
    if (result.response.status === 401 || result.response.status === 403) {
      // The 30-minute image cookie can expire while the Supabase login is
      // still valid. Use the current login for this image and renew the cookie.
      const token = await getAccessToken();
      result = await fetchMedia(url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: authHeaders(token),
      });
      if (result.response.ok) void this.ensureReadSession().catch(() => undefined);
    }
    if (!result.response.ok) throw new Error(`Private image request failed (${result.response.status}).`);
    if (!result.blob.size) throw new Error("Private image response is empty.");
    return result.blob;
  },

  async clearReadSession() {
    await fetch(`${MEDIA_BASE}/session`, { method: "DELETE" }).catch(() => undefined);
  },

  async storeImage(ownerId: string, value: string | null | undefined, profile: "sticker" | "location", itemId?: string) {
    if (!value) return null;
    const existingKey = mediaKeyFromValue(value);
    if (existingKey) return storedMediaValue(existingKey);
    if (!value.startsWith("data:") && !value.startsWith("blob:")) return value;

    const blob = await optimizeImage(value, profile);
    const key = profile === "sticker"
      ? `users/${ownerId}/items/${safeSegment(itemId || crypto.randomUUID())}/sticker.webp`
      : `users/${ownerId}/spaces/${await sha256(blob)}.webp`;
    return uploadBlob(key, blob);
  },

};
