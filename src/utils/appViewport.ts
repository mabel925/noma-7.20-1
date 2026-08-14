type StandaloneNavigator = Navigator & { standalone?: boolean };

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalonePwa = () =>
  (navigator as StandaloneNavigator).standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches;

export const syncDisplayModeClasses = () => {
  const forcePreview = new URLSearchParams(window.location.search).get("pwa") === "1";
  const isStandalone = isStandalonePwa();
  const usePwaLayout = isStandalone || forcePreview;

  document.documentElement.classList.toggle("pwa-standalone", usePwaLayout);
  document.body.classList.toggle("pwa-standalone", usePwaLayout);
  document.documentElement.classList.toggle("pwa-preview", forcePreview && !isStandalone);
  document.body.classList.toggle("pwa-preview", forcePreview && !isStandalone);
};

export const syncAppViewportHeight = () => {
  const visualViewport = window.visualViewport;
  const isStandalone = isStandalonePwa();
  let height = window.innerHeight;

  // In a browser tab, follow the actually visible viewport as browser chrome
  // and the native keyboard open and close.
  if (!isStandalone && visualViewport) {
    height = visualViewport.height + visualViewport.offsetTop;
  }

  // iOS standalone can intermittently report an innerHeight that stops above
  // the home-indicator area after launch/resume. screen.height is stable in a
  // full-screen portrait PWA, but avoid it while the native keyboard is open.
  if (isStandalone && isIOS()) {
    const screenHeight = window.screen.height;
    const screenDelta = screenHeight - height;
    const keyboardOpen = Boolean(
      visualViewport && window.innerHeight - visualViewport.height > 150,
    );

    if (!keyboardOpen && screenDelta >= 0 && screenDelta <= 160) {
      height = screenHeight;
    }
  }

  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
};

export const installAppViewportSync = () => {
  let frameId = 0;
  let timers: number[] = [];

  const scheduleSync = () => {
    window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(() => {
      syncDisplayModeClasses();
      syncAppViewportHeight();
    });
  };

  const syncAfterTransition = () => {
    scheduleSync();
    timers.forEach(window.clearTimeout);
    timers = [50, 250, 600].map((delay) => window.setTimeout(scheduleSync, delay));
  };

  const syncWhenVisible = () => {
    if (document.visibilityState === "visible") syncAfterTransition();
  };

  syncAfterTransition();
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("orientationchange", syncAfterTransition);
  window.addEventListener("pageshow", syncAfterTransition);
  window.addEventListener("focus", syncAfterTransition);
  document.addEventListener("visibilitychange", syncWhenVisible);
  window.visualViewport?.addEventListener("resize", scheduleSync);
  window.visualViewport?.addEventListener("scroll", scheduleSync);

  return () => {
    window.cancelAnimationFrame(frameId);
    timers.forEach(window.clearTimeout);
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("orientationchange", syncAfterTransition);
    window.removeEventListener("pageshow", syncAfterTransition);
    window.removeEventListener("focus", syncAfterTransition);
    document.removeEventListener("visibilitychange", syncWhenVisible);
    window.visualViewport?.removeEventListener("resize", scheduleSync);
    window.visualViewport?.removeEventListener("scroll", scheduleSync);
  };
};
