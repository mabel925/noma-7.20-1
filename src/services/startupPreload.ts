import { EMOJI_KEYS, emojiAsset } from "../data/emojiCatalog";
import { preloadPagNoma } from "../components/PagNomaSprite";

export type StartupPreloadProgress = {
  loaded: number;
  total: number;
};

const CRITICAL_IMAGE_ASSETS = [
  "/startup.jpg",
  "/home-bg.jpg",
  "/home-logo.png",
  "/default-avatar.jpg",
  "/noma-fallback.png",
  "/assets/icon-emoji.png",
];

const CRITICAL_FONT_ASSETS = [
  "/font/Alkatra-SemiBold.ttf",
];

const DEFERRED_IMAGE_ASSETS = [
  ...EMOJI_KEYS.map(emojiAsset),
];

const DEFERRED_FONT_ASSETS = [
  "/font/Zihun-Biantao.ttf",
];

const preloadImage = (url: string) => new Promise<void>((resolve) => {
  const image = new Image();
  image.onload = () => {
    const decode = typeof image.decode === "function" ? image.decode() : Promise.resolve();
    decode.catch(() => undefined).finally(resolve);
  };
  image.onerror = () => resolve();
  image.src = url;
});

const preloadFont = (url: string) => {
  if (typeof FontFace === "undefined" || !document.fonts) {
    return fetch(url, { cache: "force-cache" }).then(() => undefined).catch(() => undefined);
  }
  const family = url.includes("Zihun") ? "Zihun Biantao" : "Alkatra";
  const font = new FontFace(family, `url(${url})`);
  return font.load()
    .then((loadedFont) => {
      document.fonts.add(loadedFont);
    })
    .catch(() => undefined);
};

let startupPromise: Promise<void> | null = null;
let deferredPromise: Promise<void> | null = null;
let startupProgress: StartupPreloadProgress = {
  loaded: 0,
  total: CRITICAL_IMAGE_ASSETS.length + CRITICAL_FONT_ASSETS.length + 1,
};
const progressListeners = new Set<(progress: StartupPreloadProgress) => void>();

const reportProgress = () => {
  for (const listener of progressListeners) listener(startupProgress);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<StartupPreloadProgress>("noma-startup-progress", { detail: startupProgress }));
  }
};

const completeOne = () => {
  startupProgress = { ...startupProgress, loaded: Math.min(startupProgress.loaded + 1, startupProgress.total) };
  reportProgress();
};

export const preloadStartupAssets = () => {
  if (startupPromise) return startupPromise;

  startupProgress = {
    loaded: 0,
    total: CRITICAL_IMAGE_ASSETS.length + CRITICAL_FONT_ASSETS.length + 1,
  };
  reportProgress();
  const tasks = [
    ...CRITICAL_IMAGE_ASSETS.map((url) => preloadImage(url).finally(completeOne)),
    ...CRITICAL_FONT_ASSETS.map((url) => preloadFont(url).finally(completeOne)),
    preloadPagNoma().then(() => undefined).catch(() => undefined).finally(completeOne),
  ];
  startupPromise = Promise.all(tasks).then(() => undefined);
  return startupPromise;
};

export const subscribeStartupPreload = (listener: (progress: StartupPreloadProgress) => void) => {
  progressListeners.add(listener);
  listener(startupProgress);
  return () => progressListeners.delete(listener);
};

export const getStartupPreloadProgress = () => startupProgress;

export const preloadDeferredAssets = () => {
  if (deferredPromise) return deferredPromise;
  const tasks = [
    ...DEFERRED_IMAGE_ASSETS.map(preloadImage),
    ...DEFERRED_FONT_ASSETS.map(preloadFont),
  ];
  deferredPromise = Promise.all(tasks).then(() => undefined);
  return deferredPromise;
};
