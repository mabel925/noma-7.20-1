import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { AuthDialog } from './components/AuthDialog';
import { installAppViewportSync } from './utils/appViewport';
import { preloadStartupAssets } from './services/startupPreload';
import { checkForAppUpdate } from './services/appUpdate';
import { PwaInstallProvider } from './components/PwaInstallGuide';
import { installPwaInstallEvents } from './services/pwaInstall';
import { installIosStatusBarScrollTrial } from './utils/iosStatusBarScrollTrial';

installPwaInstallEvents();
installAppViewportSync();
void preloadStartupAssets();

void checkForAppUpdate().then((result) => {
  if (result !== 'ready') return;
  const stopStatusBarTrial = installIosStatusBarScrollTrial();
  import.meta.hot?.dispose(stopStatusBarTrial);
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
