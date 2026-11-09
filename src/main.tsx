import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { AuthDialog } from './components/AuthDialog';
import { installAppViewportSync } from './utils/appViewport';
import { preloadStartupAssets } from './services/startupPreload';
import { checkForAppUpdate } from './services/appUpdate';

installAppViewportSync();
void preloadStartupAssets();

const startApp = async () => {
  await checkForAppUpdate();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <App />
        <AuthDialog />
      </AuthProvider>
    </StrictMode>,
  );
};

void startApp();
