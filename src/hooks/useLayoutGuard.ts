import { useLayoutEffect } from "react";
import { syncAppViewportHeight } from "../utils/appViewport";

export function useLayoutGuard(isOpen: boolean) {
  useLayoutEffect(() => {
    if (!isOpen) return;

    // 1. Store original values to restore on unmount (Lifecycle Guard)
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyInset = document.body.style.inset;
    const originalBodyWidth = document.body.style.width;
    const originalBodyHeight = document.body.style.height;
    const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;

    const originalBodyPaddingBottom = document.body.style.paddingBottom;
    const originalBodyMarginBottom = document.body.style.marginBottom;
    const originalHtmlPaddingBottom = document.documentElement.style.paddingBottom;
    const originalHtmlMarginBottom = document.documentElement.style.marginBottom;

    const originalSafeBottom = document.documentElement.style.getPropertyValue('--safe-area-inset-bottom');
    const originalSab = document.documentElement.style.getPropertyValue('--sab');
    const originalCaptureViewportTop = document.documentElement.style.getPropertyValue('--capture-viewport-top');
    const originalCaptureViewportHeight = document.documentElement.style.getPropertyValue('--capture-viewport-height');

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
      document.documentElement.style.setProperty("overscroll-behavior", "none", "important");
      document.body.style.setProperty("overscroll-behavior", "none", "important");
      document.body.style.setProperty("position", "fixed", "important");
      document.body.style.setProperty("inset", "0px", "important");
      document.body.style.setProperty("width", "100%", "important");
      document.body.style.setProperty("height", "var(--app-height, 100dvh)", "important");

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

    const updateCaptureViewport = () => {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const activeElement = document.activeElement as HTMLElement | null;
      const hasFocusedEditor = Boolean(
        activeElement && (
          activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable
        )
      );
      const coveredHeight = Math.max(0, window.innerHeight - height - top);
      const keyboardWasOpen = document.body.classList.contains('capture-native-keyboard-open');
      const keyboardOpen = coveredHeight > 100 && (hasFocusedEditor || keyboardWasOpen);

      document.documentElement.style.setProperty(
        '--capture-viewport-top',
        keyboardOpen ? `${Math.round(top)}px` : '0px'
      );
      document.documentElement.style.setProperty(
        '--capture-viewport-height',
        keyboardOpen ? `${Math.round(height)}px` : 'var(--app-height)'
      );
      document.documentElement.classList.toggle('capture-native-keyboard-open', keyboardOpen);
      document.body.classList.toggle('capture-native-keyboard-open', keyboardOpen);
    };

    const preventPagePan = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-capture-scrollable="true"], input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
    };

    const resetWindowScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };

    // Execute immediately in first frame before rendering to block any flash or blank spaces
    applyScrubbing();

    // Set dynamic app height on mount / resize
    const updateAppHeight = () => {
      syncAppViewportHeight();
      updateCaptureViewport();
      applyScrubbing();
    };

    updateAppHeight();
    window.addEventListener('resize', updateAppHeight);
    window.addEventListener('scroll', resetWindowScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', updateCaptureViewport);
    window.visualViewport?.addEventListener('scroll', updateCaptureViewport);
    document.addEventListener('focusin', updateCaptureViewport);
    document.addEventListener('focusout', updateCaptureViewport);
    document.addEventListener('touchmove', preventPagePan, { passive: false });

    // Staggered timeouts to maintain hygiene across dynamic UI flows (keyboard dismissal transitions, etc)
    const timers = [30, 80, 150, 250, 400, 600, 1000].map(delay =>
      setTimeout(() => {
        applyScrubbing();
      }, delay)
    );

    return () => {
      window.removeEventListener('resize', updateAppHeight);
      window.removeEventListener('scroll', resetWindowScroll);
      window.visualViewport?.removeEventListener('resize', updateCaptureViewport);
      window.visualViewport?.removeEventListener('scroll', updateCaptureViewport);
      document.removeEventListener('focusin', updateCaptureViewport);
      document.removeEventListener('focusout', updateCaptureViewport);
      document.removeEventListener('touchmove', preventPagePan);
      timers.forEach(clearTimeout);

      // Restore original values on unmount
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.inset = originalBodyInset;
      document.body.style.width = originalBodyWidth;
      document.body.style.height = originalBodyHeight;
      document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
      document.body.style.overscrollBehavior = originalBodyOverscroll;

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
      if (originalCaptureViewportTop) {
        document.documentElement.style.setProperty('--capture-viewport-top', originalCaptureViewportTop);
      } else {
        document.documentElement.style.removeProperty('--capture-viewport-top');
      }
      if (originalCaptureViewportHeight) {
        document.documentElement.style.setProperty('--capture-viewport-height', originalCaptureViewportHeight);
      } else {
        document.documentElement.style.removeProperty('--capture-viewport-height');
      }
      document.documentElement.classList.remove('capture-native-keyboard-open');
      document.body.classList.remove('capture-native-keyboard-open');

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
