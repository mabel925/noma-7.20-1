import { useEffect } from "react";

/**
 * A custom hook to aggressively clean up any keyboard-related classes, CSS variables,
 * and inline styles (padding-bottom, height offsets, transforms, etc.) when switching views.
 * This guarantees a pristine, clean-slate layout when returning to the Home page or entering the Shooting/Capture page.
 */
export function useKeyboardReset(isChatActive: boolean, isCaptureOpen: boolean) {
  useEffect(() => {
    let timerIds: number[] = [];

    // If we are not actively in chat, or if the capture/shooting page is open,
    // we must forcibly reset all potential layout shifts caused by the virtual keyboard.
    if (!isChatActive || isCaptureOpen) {
      // 0. Force blur any active text editor to dismiss software keyboard
      if (document.activeElement instanceof HTMLElement && (
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.isContentEditable
      )) {
        document.activeElement.blur();
      }

      // 1. Remove keyboard-related classes
      document.body.classList.remove("keyboard-active");
      document.documentElement.classList.remove("keyboard-active");

      // 2. Reset CSS custom variables
      document.documentElement.style.setProperty("--keyboard-height", "0px");
      document.documentElement.style.setProperty("--chat-native-keyboard-height", "0px");

      // 3. Clear any dynamic inline styles that might have been applied
      const elementsToReset = [
        document.body,
        document.documentElement,
        document.getElementById("root"),
        document.getElementById("app-container"),
        document.getElementById("noma-iphone-frame"),
        document.getElementById("app-bg"),
        document.getElementById("camera-view")
      ];

      elementsToReset.forEach((el) => {
        if (el) {
          el.style.paddingBottom = "";
          el.style.marginBottom = "";
          // If capture is open, the CaptureScanner component manages and forces heights via --app-height.
          if (!isCaptureOpen) {
            el.style.height = "";
          }
          el.style.transform = "";
        }
      });

      // 4. Reset specific utility containers
      const chatContainer = document.querySelector(".chat-flow-container") as HTMLElement;
      if (chatContainer) {
        chatContainer.style.paddingBottom = "";
      }

      const keyboardContainer = document.querySelector(".home-keyboard-container") as HTMLElement;
      if (keyboardContainer) {
        keyboardContainer.style.paddingBottom = "";
        keyboardContainer.style.height = "";
        keyboardContainer.style.transform = "";
      }

      // 5. Aggressively hard-reset window scroll positions to fix iOS Safari visual viewport shifts.
      // We repeat this reset over a 1-second window to counteract the asynchronous keyboard-dismiss animations of iOS.
      const resetScrollAndLayout = () => {
        window.scrollTo(0, 0);
        if (document.body) {
          document.body.scrollTop = 0;
        }
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        // Dispatch resize event so that elements using 100vh / 100dvh re-render and snap to correct bottom position
        window.dispatchEvent(new Event("resize"));
      };

      // Run immediately
      resetScrollAndLayout();

      // Set staggered timeouts
      const delays = [30, 80, 150, 250, 350, 500, 750, 1000];
      timerIds = delays.map((delay) => 
        window.setTimeout(resetScrollAndLayout, delay)
      );
    }

    return () => {
      // Clean up timers on unmount or on state change
      timerIds.forEach((id) => clearTimeout(id));
    };
  }, [isChatActive, isCaptureOpen]);
}
