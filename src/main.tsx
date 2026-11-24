import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { AuthDialog } from './components/AuthDialog';
import { installAppViewportSync } from './utils/appViewport';
import { preloadStartupAssets } from './services/startupPreload';
import { checkForAppUpdate } from './services/appUpdate';
import { PwaInstallProvider } from './components/PwaInstallGuide';
import { installPwaInstallEvents } from './services/pwaInstall';
import { DesktopLanding } from './desktop/DesktopLanding';
import { shouldShowDesktopEntry } from './utils/desktopEntry';

const params = new URLSearchParams(window.location.search);
const desktop = shouldShowDesktopEntry({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints || 0,
  mobile: (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile,
  standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches,
  finePointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  developmentPreview: import.meta.env.DEV && ['mockAuth', 'appPreview', 'pwa'].some(key => params.get(key) === '1'),
});
document.documentElement.dataset.nomaEntry = desktop ? 'desktop' : 'app';

if (desktop) {
  // The introduction and QR already exist in the HTML for crawlers and first paint.
  // Desktop visitors never mount authentication, camera or inventory providers.
  document.getElementById('startup-splash')?.remove();
  hydrateRoot(document.getElementById('desktop-entry')!, <StrictMode><DesktopLanding /></StrictMode>);
  // Earlier desktop visitors may still have an app-shell worker. Keep it fresh
  // for the next visit without blocking the introduction or reloading it.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => undefined);
  }
} else {
  installPwaInstallEvents();
  installAppViewportSync();
  void preloadStartupAssets();
  void checkForAppUpdate().then((result) => {
    if (result !== 'ready') return;
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <AuthProvider>
          <PwaInstallProvider>
            <App />
            <AuthDialog />
          </PwaInstallProvider>
        </AuthProvider>
      </StrictMode>,
    );
  });
}
