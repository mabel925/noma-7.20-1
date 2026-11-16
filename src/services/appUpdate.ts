const UPDATE_CHECK_TIMEOUT_MS = 4000;
const HANDOFF_KEY = "noma-startup-update";
let updateCheckPromise: Promise<"ready" | "reloading"> | null = null;

const showUpdateProgress = (value: number) => {
  const progress = document.querySelector<HTMLElement>('#startup-splash [role="progressbar"]');
  const next = Math.max(Number(progress?.getAttribute("aria-valuenow")) || 4, value);
  progress?.setAttribute("aria-valuenow", String(next));
  const fill = document.getElementById("startup-progress-fill");
  const label = document.getElementById("startup-progress-label");
  if (fill) fill.style.width = `${next}%`;
  if (label) label.textContent = `${next}%`;
};

const workerBuild = (worker: ServiceWorker, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
  const channel = new MessageChannel();
  const cleanup = () => {
    channel.port1.close();
    channel.port2.close();
    signal.removeEventListener("abort", abort);
  };
  const abort = () => { cleanup(); reject(new Error("Update check timed out.")); };
  if (signal.aborted) { abort(); return; }
  signal.addEventListener("abort", abort, { once: true });
  channel.port1.onmessage = (event) => { cleanup(); resolve(String(event.data?.buildId || "")); };
  worker.postMessage({ type: "GET_BUILD_ID" }, [channel.port2]);
});

const waitForCurrentBuild = (buildId: string, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const serviceWorker = navigator.serviceWorker;
  const cleanup = () => {
    serviceWorker.removeEventListener("controllerchange", check);
    signal.removeEventListener("abort", abort);
  };
  const abort = () => { cleanup(); reject(new Error("Update check timed out.")); };
  const check = () => {
    const worker = serviceWorker.controller;
    if (!worker || signal.aborted) return;
    void workerBuild(worker, signal).then((current) => {
      if (current === buildId) { cleanup(); resolve(); }
    }).catch(() => undefined);
  };
  if (signal.aborted) { abort(); return; }
  serviceWorker.addEventListener("controllerchange", check);
  signal.addEventListener("abort", abort, { once: true });
  check();
});

/** Finish the update decision under the static splash, before mounting the app. */
export const checkForAppUpdate = (): Promise<"ready" | "reloading"> => {
  if (updateCheckPromise) return updateCheckPromise;
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    updateCheckPromise = Promise.resolve("ready");
    return updateCheckPromise;
  }

  const controller = new AbortController();
  const launchStartedAt = Number(document.documentElement.dataset.nomaLaunchStartedAt) || Date.now();
  const remaining = Math.max(0, UPDATE_CHECK_TIMEOUT_MS - (Date.now() - launchStartedAt));
  const registration = navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  // Even if the launch deadline is reached, finish installing in the background.
  void registration.then((reg) => reg.update()).catch(() => undefined);

  let timer = 0;
  const timeout = new Promise<"ready">((resolve) => {
    timer = window.setTimeout(() => { controller.abort(); resolve("ready"); }, remaining);
  });
  const operation = (async (): Promise<"ready" | "reloading"> => {
    const currentBuild = document.querySelector<HTMLMetaElement>('meta[name="noma-build-id"]')?.content;
    if (!currentBuild || document.documentElement.dataset.nomaUpdateHandoff === "true") return "ready";
    const response = await fetch("/version.json", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return "ready";
    const { buildId } = await response.json();
    showUpdateProgress(8);
    if (typeof buildId !== "string" || !buildId || buildId === currentBuild) return "ready";

    showUpdateProgress(12);
    // Watch before awaiting registration so a fast activation cannot be missed.
    const active = waitForCurrentBuild(buildId, controller.signal);
    void active.catch(() => undefined);
    const reg = await registration;
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    await active;
    if (controller.signal.aborted || Date.now() - launchStartedAt >= UPDATE_CHECK_TIMEOUT_MS) return "ready";

    const progress = document.querySelector<HTMLElement>('#startup-splash [role="progressbar"]');
    // If storage is blocked, defer instead of risking repeated reloads.
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
      buildId,
      startedAt: launchStartedAt,
      savedAt: Date.now(),
      progress: Math.max(15, Number(progress?.getAttribute("aria-valuenow")) || 4),
      top: progress?.style.top || "",
    }));
    showUpdateProgress(15);
    window.location.reload();
    return "reloading";
  })().catch((error) => {
    if (!controller.signal.aborted) console.warn("[PWA] Update check failed; continuing startup:", error);
    return "ready" as const;
  });

  updateCheckPromise = Promise.race([operation, timeout]).then((result) => {
    if (result === "ready") showUpdateProgress(15);
    return result;
  }).finally(() => {
    window.clearTimeout(timer);
    controller.abort();
  });

  return updateCheckPromise;
};
