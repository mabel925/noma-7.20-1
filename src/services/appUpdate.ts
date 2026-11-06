const UPDATE_CHECK_TIMEOUT_MS = 1800;

let updateCheckPromise: Promise<void> | null = null;

export const checkForAppUpdate = (): Promise<void> => {
  if (updateCheckPromise) return updateCheckPromise;
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    updateCheckPromise = Promise.resolve();
    return updateCheckPromise;
  }

  const updateOperation = navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => registration.update())
    .then(() => undefined)
    .catch((error) => {
      console.warn("[PWA] Service worker update check failed:", error);
    });

  let timeoutId = 0;
  const timeoutOperation = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(() => {
      console.warn(`[PWA] Update check exceeded ${UPDATE_CHECK_TIMEOUT_MS}ms; continuing startup.`);
      resolve();
    }, UPDATE_CHECK_TIMEOUT_MS);
  });
  updateCheckPromise = Promise.race([
    updateOperation,
    timeoutOperation,
  ]).then(() => undefined).finally(() => window.clearTimeout(timeoutId));

  return updateCheckPromise;
};
