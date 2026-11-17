export type InstallPlatform = "ios" | "android";

type DeviceInfo = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">;

export const getInstallPlatform = (device: DeviceInfo): InstallPlatform | null => {
  if (/iPad|iPhone|iPod/.test(device.userAgent) || (device.platform === "MacIntel" && device.maxTouchPoints > 1)) return "ios";
  return /Android/i.test(device.userAgent) ? "android" : null;
};

export const isEmbeddedBrowser = (userAgent: string) =>
  /MicroMessenger|FBAN|FBAV|Instagram|\bLine\/|; wv\)/i.test(userAgent);

export const INSTALL_NUDGE_KEY = "noma-install-dismissed-until";
export const INSTALL_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const readInstallSnooze = (storage: Pick<Storage, "getItem">, now = Date.now()) => {
  try {
    const until = Number(storage.getItem(INSTALL_NUDGE_KEY));
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
};

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let snapshot: { prompt: InstallPromptEvent | null; installed: boolean } = { prompt: null, installed: false };
const listeners = new Set<() => void>();
let listening = false;
const notify = () => listeners.forEach((listener) => listener());

export const getInstallSnapshot = () => snapshot;
export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// Capture beforeinstallprompt before the async startup gate mounts React.
export const installPwaInstallEvents = () => {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!getInstallPlatform(navigator)) return;
    event.preventDefault();
    snapshot = { ...snapshot, prompt: event as InstallPromptEvent };
    notify();
  });
  window.addEventListener("appinstalled", () => {
    snapshot = { prompt: null, installed: true };
    notify();
  });
};

export const requestPwaInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
  const prompt = snapshot.prompt;
  if (!prompt) return "unavailable";
  // The native event is single-use, including dismissal and errors.
  snapshot = { ...snapshot, prompt: null };
  notify();
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  } catch {
    return "unavailable";
  }
};
