import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { AuthDialog } from './components/AuthDialog';
import { installAppViewportSync } from './utils/appViewport';
import { preloadPagNoma } from './components/PagNomaSprite';

installAppViewportSync();
void preloadPagNoma().catch((error) => {
  console.warn('[PAG] Startup preload failed; the mounted sprite will handle fallback timing.', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <AuthDialog />
    </AuthProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[PWA] Service worker registration failed:", error);
    });
  });
}
