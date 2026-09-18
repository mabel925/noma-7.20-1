import { EMOJI_KEYS, emojiAsset } from "../data/emojiCatalog";
import { preloadPagNoma } from "../components/PagNomaSprite";

export type StartupPreloadProgress = {
  loaded: number;
  total: number;
};

const IMAGE_ASSETS = [
  "/startup.jpg",
  "/home-bg.jpg",
  "/home-logo.png",
  "/default-avatar.jpg",
  "/noma-fallback.png",
  "/assets/icon-emoji.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/noma-app-icon-180.png",
  "/icons/noma-app-icon-192.png",
  "/icons/noma-app-icon-512.png",
  ...EMOJI_KEYS.map(emojiAsset),
];

const FONT_ASSETS = [
  "/font/Alkatra-SemiBold.ttf",
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
let startupProgress: StartupPreloadProgress = { loaded: 0, total: IMAGE_ASSETS.length + FONT_ASSETS.length + 1 };
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

  startupProgress = { loaded: 0, total: IMAGE_ASSETS.length + FONT_ASSETS.length + 1 };
  reportProgress();
  const tasks = [
    ...IMAGE_ASSETS.map((url) => preloadImage(url).finally(completeOne)),
    ...FONT_ASSETS.map((url) => preloadFont(url).finally(completeOne)),
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
