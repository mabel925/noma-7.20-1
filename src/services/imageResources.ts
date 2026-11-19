import { mediaStorage } from "./mediaStorage";

export type ImageResource = {
  displaySrc: string;
  image: HTMLImageElement;
  isObjectUrl: boolean;
  bytes: number;
};

// One cache for Memory, Chat, location pickers and results. Keep active images
// pinned; retain recently viewed images between screens without unbounded RAM.
const resources = new Map<string, ImageResource>();
const requests = new Map<string, Promise<ImageResource>>();
const consumers = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
const MAX_ENTRIES = 160;
const MAX_BYTES = 64 * 1024 * 1024;
let owner: string | null | undefined;
let generation = 0;

const emit = (src: string) => listeners.get(src)?.forEach((notify) => notify());
const dispose = (resource: ImageResource) => {
  if (resource.isObjectUrl) URL.revokeObjectURL(resource.displaySrc);
};
const trim = () => {
  let bytes = [...resources.values()].reduce((sum, resource) => sum + resource.bytes, 0);
  for (const [src, resource] of resources) {
    if (resources.size <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
    if (consumers.get(src)) continue;
    resources.delete(src);
    bytes -= resource.bytes;
    dispose(resource);
    emit(src);
  }
};

export const getCachedImageResource = (src: string) => resources.get(src);
export const subscribeImageResource = (src: string, notify: () => void) => {
  const callbacks = listeners.get(src) || new Set<() => void>();
  callbacks.add(notify);
  listeners.set(src, callbacks);
  return () => {
    callbacks.delete(notify);
    if (!callbacks.size) listeners.delete(src);
  };
};
export const retainImageResource = (src: string) => {
  consumers.set(src, (consumers.get(src) || 0) + 1);
  const cached = resources.get(src);
  if (cached) { resources.delete(src); resources.set(src, cached); }
  return () => {
    const remaining = (consumers.get(src) || 1) - 1;
    if (remaining) consumers.set(src, remaining);
    else consumers.delete(src);
    trim();
  };
};

export const setImageResourceOwner = (nextOwner: string | null) => {
  if (owner === nextOwner) return;
  owner = nextOwner;
  generation += 1;
  const keys = [...resources.keys()];
  resources.forEach(dispose);
  resources.clear();
  requests.clear();
  keys.forEach(emit);
};

export const invalidateImageResource = (src: string, expected: ImageResource) => {
  if (resources.get(src) !== expected) return;
  resources.delete(src);
  dispose(expected);
  emit(src);
};

const isPrivateMediaUrl = (src: string) => {
  try {
    const url = new URL(src, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/media/object/");
  } catch { return false; }
};

const loadDrawableImage = (src: string, priority: "auto" | "low") => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  let settled = false;
  image.decoding = "async";
  image.fetchPriority = priority;
  image.referrerPolicy = "no-referrer";
  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    image.src = "";
    reject(new Error("Image loading timed out."));
  }, 12_000);
  image.onload = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    // onload is drawable; do not wait on Safari's occasionally hanging decode().
    resolve(image);
  };
  image.onerror = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    reject(new Error("Image could not be loaded."));
  };
  image.src = src;
  if (image.complete && image.naturalWidth > 0) image.onload?.(new Event("load"));
});

export const getImageResource = (src: string, priority: "auto" | "low" = "auto"): Promise<ImageResource> => {
  if (isPrivateMediaUrl(src) && owner !== undefined) {
    const path = new URL(src, window.location.origin).pathname;
    if (!owner || !path.startsWith(`/api/media/object/users/${encodeURIComponent(owner)}/`)) {
      return Promise.reject(new Error("Image is outside the current account."));
    }
  }
  const cached = resources.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(src);
  if (pending) return pending;
  const requestGeneration = generation;
  const request = (async () => {
    let displaySrc = src;
    let isObjectUrl = false;
    let blobBytes = 0;
    try {
      if (isPrivateMediaUrl(src)) {
        const blob = await mediaStorage.readImage(src, { priority });
        if (requestGeneration !== generation) throw new Error("Image account changed.");
        displaySrc = URL.createObjectURL(blob);
        blobBytes = blob.size;
        isObjectUrl = true;
      }
      const image = await loadDrawableImage(displaySrc, priority);
      if (requestGeneration !== generation) throw new Error("Image account changed.");
      const resource = { displaySrc, image, isObjectUrl, bytes: image.naturalWidth * image.naturalHeight * 4 + blobBytes };
      resources.set(src, resource);
      emit(src);
      trim();
      return resource;
    } catch (error) {
      if (isObjectUrl) URL.revokeObjectURL(displaySrc);
      throw error;
    }
  })().finally(() => { if (requests.get(src) === request) requests.delete(src); });
  requests.set(src, request);
  return request;
};
