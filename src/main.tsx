import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const syncDisplayModeClasses = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const forceStandalonePreview = searchParams.get("pwa") === "1";
  const isActualStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  const isStandalone = isActualStandalone && !forceStandalonePreview;

  document.documentElement.classList.toggle("pwa-standalone", isStandalone);
  document.body.classList.toggle("pwa-standalone", isStandalone);
  document.documentElement.classList.toggle("pwa-preview", forceStandalonePreview && !isActualStandalone);
  document.body.classList.toggle("pwa-preview", forceStandalonePreview && !isActualStandalone);
};

syncDisplayModeClasses();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[PWA] Service worker registration failed:", error);
    });
  });
}
