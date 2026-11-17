import { useEffect } from "react";

/** Dismiss native editing when leaving Chat; viewport sizing has one owner. */
export function useKeyboardReset(isChatActive: boolean, isCaptureOpen: boolean) {
  useEffect(() => {
    if (isChatActive && !isCaptureOpen) return;

    const editor = document.activeElement;
    if (editor instanceof HTMLElement && editor.matches('input, textarea, [contenteditable="true"]')) {
      editor.blur();
    }

    document.body.classList.remove("keyboard-active");
    document.documentElement.classList.remove("keyboard-active");
    document.documentElement.style.setProperty("--keyboard-height", "0px");
    document.documentElement.style.setProperty("--chat-native-keyboard-height", "0px");

    // Actual viewport events drive appViewport/useLayoutGuard. Repeated synthetic
    // resize events used to remeasure every page during the transition. Never
    // clear transforms owned by Motion or heights owned by the capture guard.
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  }, [isChatActive, isCaptureOpen]);
}
