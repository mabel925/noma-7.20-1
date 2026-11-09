const UPDATE_CHECK_TIMEOUT_MS = 1800;

let updateCheckPromise: Promise<void> | null = null;

const waitForActivation = (worker: ServiceWorker): Promise<void> => {
  if (worker.state === "activated" || worker.state === "redundant") return Promise.resolve();
  return new Promise((resolve) => {
    const handleStateChange = () => {
      if (worker.state !== "activated" && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", handleStateChange);
      resolve();
    };
    worker.addEventListener("statechange", handleStateChange);
  });
};

export const checkForAppUpdate = (): Promise<void> => {
  if (updateCheckPromise) return updateCheckPromise;
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    updateCheckPromise = Promise.resolve();
    return updateCheckPromise;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadStarted = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloadStarted) return;
    reloadStarted = true;
    window.location.reload();
  });

  const updateOperation = navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then(async (registration) => {
      await registration.update();
      const pendingWorker = registration.installing || registration.waiting;
      if (!pendingWorker) return;
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      await waitForActivation(pendingWorker);
    })
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
