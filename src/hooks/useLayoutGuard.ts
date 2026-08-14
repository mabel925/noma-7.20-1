import { useLayoutEffect } from "react";
import { syncAppViewportHeight } from "../utils/appViewport";

export function useLayoutGuard(isOpen: boolean) {
  useLayoutEffect(() => {
    if (!isOpen) return;

    // 1. Store original values to restore on unmount (Lifecycle Guard)
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;

    const originalBodyPaddingBottom = document.body.style.paddingBottom;
    const originalBodyMarginBottom = document.body.style.marginBottom;
    const originalHtmlPaddingBottom = document.documentElement.style.paddingBottom;
    const originalHtmlMarginBottom = document.documentElement.style.marginBottom;

    const originalSafeBottom = document.documentElement.style.getPropertyValue('--safe-area-inset-bottom');
    const originalSab = document.documentElement.style.getPropertyValue('--sab');

    // Store other container elements' styles
    const elements = [
      document.getElementById("root"),
      document.getElementById("app-container"),
      document.getElementById("noma-iphone-frame"),
      document.getElementById("app-bg")
    ];

    const originalElementStyles = elements.map(el => {
      if (!el) return null;
      return {
        paddingBottom: el.style.paddingBottom,
        marginBottom: el.style.marginBottom,
        height: el.style.height
      };
    });

    // 2. Perform aggressive, DOM-level environmental scrubbing
    const applyScrubbing = () => {
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      document.body.style.setProperty("overflow", "hidden", "important");

      document.body.style.setProperty("padding-bottom", "0px", "important");
      document.body.style.setProperty("margin-bottom", "0px", "important");
      document.documentElement.style.setProperty("padding-bottom", "0px", "important");
      document.documentElement.style.setProperty("margin-bottom", "0px", "important");

      // Reset safe-area CSS variables
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px', 'important');
      document.documentElement.style.setProperty('--sab', '0px', 'important');

      // Clear any potential keyboard or scroll residues
      document.body.classList.remove('keyboard-active');
      document.documentElement.classList.remove('keyboard-active');

      elements.forEach(el => {
        if (el) {
          el.style.setProperty("padding-bottom", "0px", "important");
          el.style.setProperty("margin-bottom", "0px", "important");
          el.style.setProperty("height", "var(--app-height, 100vh)", "important");
        }
      });

      // Hard-reset window scroll positions
      window.scrollTo(0, 0);
      if (document.body) document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
    };

    // Execute immediately in first frame before rendering to block any flash or blank spaces
    applyScrubbing();

    // Set dynamic app height on mount / resize
    const updateAppHeight = () => {
      syncAppViewportHeight();
      applyScrubbing();
    };

    updateAppHeight();
    window.addEventListener('resize', updateAppHeight);

    // Staggered timeouts to maintain hygiene across dynamic UI flows (keyboard dismissal transitions, etc)
    const timers = [30, 80, 150, 250, 400, 600, 1000].map(delay =>
      setTimeout(() => {
        applyScrubbing();
      }, delay)
    );

    return () => {
      window.removeEventListener('resize', updateAppHeight);
      timers.forEach(clearTimeout);

      // Restore original values on unmount
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;

      document.body.style.paddingBottom = originalBodyPaddingBottom;
      document.body.style.marginBottom = originalBodyMarginBottom;
      document.documentElement.style.paddingBottom = originalHtmlPaddingBottom;
      document.documentElement.style.marginBottom = originalHtmlMarginBottom;

      if (originalSafeBottom) {
        document.documentElement.style.setProperty('--safe-area-inset-bottom', originalSafeBottom);
      } else {
        document.documentElement.style.removeProperty('--safe-area-inset-bottom');
      }
      if (originalSab) {
        document.documentElement.style.setProperty('--sab', originalSab);
      } else {
        document.documentElement.style.removeProperty('--sab');
      }

      elements.forEach((el, index) => {
        const orig = originalElementStyles[index];
        if (el && orig) {
          el.style.paddingBottom = orig.paddingBottom;
          el.style.marginBottom = orig.marginBottom;
          el.style.height = orig.height;
        }
      });

      // Retrigger a resize event to snap other layout sections back to standard dimensions cleanly
      window.dispatchEvent(new Event("resize"));
    };
  }, [isOpen]);
}
