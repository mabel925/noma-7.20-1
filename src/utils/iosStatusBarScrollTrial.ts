import { isStandalonePwa } from "./appViewport";

/** Temporary experiment for WebKit #324438; a real iPhone must judge the blur. */
export const installIosStatusBarScrollTrial = () => {
  const params = new URLSearchParams(window.location.search);
  const forcePreview = import.meta.env.DEV && params.get("statusbarScrollTest") === "1";
  const affectedIOS = /\bOS 27(?:[_.\s]|$)/.test(navigator.userAgent);
  if (import.meta.env.VITE_IOS_STATUSBAR_SCROLL_TRIAL === "0"
    || params.get("statusbarScrollTest") === "0"
    || (!forcePreview && (!affectedIOS || !isStandalonePwa()))) return () => {};

  const root = document.documentElement;
  const body = document.body;
  let started = false;
  let disposed = false;
  let frame = 0;
  let returnTimer = 0;
  let watchdog = 0;
  let spacer: HTMLDivElement | null = null;
  let restoreStyles: (() => void) | null = null;
  let peak = 0;

  const finish = (status: "completed" | "interrupted") => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(returnTimer);
    window.clearTimeout(watchdog);
    if (!restoreStyles) return;
    try {
      peak = Math.max(peak, window.scrollY);
      window.scrollTo(0, 0);
    } finally {
      restoreStyles();
      restoreStyles = null;
      spacer?.remove();
      spacer = null;
      root.classList.remove("ios-statusbar-scroll-trial");
      root.dataset.nomaStatusbarScrollTrial = status === "interrupted"
        ? status : peak === 1 && window.scrollY === 0 ? "scrolled" : "no-scroll";
      root.dataset.nomaStatusbarScrollPath = `0,${peak},${window.scrollY}`;
      window.removeEventListener("pointerdown", interrupt, true);
      window.removeEventListener("keydown", interrupt, true);
      window.removeEventListener("focusin", interrupt, true);
    }
  };
  const interrupt = () => finish("interrupted");
  const whenHidden = () => { if (document.visibilityState !== "visible") interrupt(); };

  const begin = () => {
    if (disposed || document.visibilityState !== "visible"
      || window.innerWidth > window.innerHeight
      || window.scrollX !== 0 || window.scrollY !== 0
      || root.classList.contains("capture-page-open")
      || body.classList.contains("capture-page-open")
      || document.querySelector('[role="dialog"], [aria-modal="true"]')
      || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
      || window.getComputedStyle(body).position === "fixed") {
      root.dataset.nomaStatusbarScrollTrial = "skipped-active-ui";
      return;
    }

    const properties = ["overflow-x", "overflow-y", "scroll-behavior", "overflow-anchor"];
    const snapshots = [root, body].flatMap((element) => properties.map((property) => ({
      element, property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    })));
    restoreStyles = () => snapshots.forEach(({ element, property, value, priority }) => {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    });

    // The actual UI remains fixed. Only a hidden normal-flow spacer supplies
    // the scroll range; no header position, safe-area inset or app height changes.
    try {
      root.dataset.nomaStatusbarScrollTrial = "running";
      root.classList.add("ios-statusbar-scroll-trial");
      for (const element of [root, body]) {
        element.style.setProperty("scroll-behavior", "auto", "important");
        element.style.setProperty("overflow-anchor", "none", "important");
      }
      root.style.setProperty("overflow-x", "hidden", "important");
      root.style.setProperty("overflow-y", "auto", "important");
      body.style.setProperty("overflow-x", "visible", "important");
      body.style.setProperty("overflow-y", "visible", "important");
      spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.cssText = `display:block;visibility:hidden;pointer-events:none;width:1px;height:${window.innerHeight + 1}px;margin:0;padding:0;border:0;flex:none;`;
      body.appendChild(spacer);
      window.addEventListener("pointerdown", interrupt, true);
      window.addEventListener("keydown", interrupt, true);
      window.addEventListener("focusin", interrupt, true);
      watchdog = window.setTimeout(interrupt, 250);
      window.scrollTo(0, 1);
      peak = window.scrollY;
      frame = window.requestAnimationFrame(() => { peak = Math.max(peak, window.scrollY); });
      returnTimer = window.setTimeout(() => finish("completed"), 50);
    } catch {
      finish("interrupted");
    }
  };

  const whenReady = () => {
    if (started || disposed) return;
    started = true;
    frame = window.requestAnimationFrame(begin);
  };
  window.addEventListener("noma-home-ready", whenReady);
  window.addEventListener("pagehide", interrupt);
  document.addEventListener("visibilitychange", whenHidden);
  if (root.dataset.nomaHomeReady === "true") whenReady();

  return () => {
    disposed = true;
    interrupt();
    window.removeEventListener("noma-home-ready", whenReady);
    window.removeEventListener("pagehide", interrupt);
    document.removeEventListener("visibilitychange", whenHidden);
  };
};
