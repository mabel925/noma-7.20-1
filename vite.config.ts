import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';

const pwaBuildId = (
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `local-${Date.now().toString(36)}`
).slice(0, 16);

const pwaVersionPlugin = () => ({
  name: 'noma-pwa-version',
  apply: 'build' as const,
  closeBundle() {
    const outputDirectory = path.resolve(__dirname, 'dist');
    const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
    const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8');
    if (!serviceWorkerSource.includes('__NOMA_BUILD_ID__')) {
      throw new Error('PWA service worker build placeholder is missing');
    }
    writeFileSync(
      serviceWorkerPath,
      serviceWorkerSource.replaceAll('__NOMA_BUILD_ID__', pwaBuildId),
    );
    writeFileSync(
      path.join(outputDirectory, 'version.json'),
      `${JSON.stringify({buildId: pwaBuildId})}\n`,
    );
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), pwaVersionPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/replicate-api': {
          target: 'https://api.replicate.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/replicate-api/, ''),
        },
        '/picwish-api': {
          target: 'https://techsz.aoscdn.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/picwish-api/, ''),
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
