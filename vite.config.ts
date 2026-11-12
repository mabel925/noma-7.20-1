import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const pwaBuildId = (
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `local-${Date.now().toString(36)}`
).slice(0, 16);

const inlineStartupImagePlugin = () => {
  const source = 'src="/startup.jpg"';
  const startupImage = readFileSync(
    path.resolve(__dirname, 'public/startup.jpg'),
  ).toString('base64');

  return {
    name: 'noma-inline-startup-image',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        if (!html.includes(source)) {
          throw new Error('Startup splash image source is missing from index.html');
        }
        return html.replace(source, `src="data:image/jpeg;base64,${startupImage}"`);
      },
    },
  };
};

// Inline the entry CSS as well as the image: an external stylesheet in <head>
// blocks even an inline splash from painting. Keep lazy-route CSS untouched.
const inlineEntryStylesPlugin = (): Plugin => ({
  name: 'noma-inline-entry-styles',
  apply: 'build',
  enforce: 'post',
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      const entry = bundle['index.html'];
      if (!entry || entry.type !== 'asset') {
        throw new Error('Entry HTML is missing from the production bundle');
      }
      let inlinedCount = 0;
      entry.source = String(entry.source).replace(
        /<link\b[^>]*\brel="stylesheet"[^>]*>/g,
        (tag) => {
          const href = tag.match(/\bhref="([^"]+)"/)?.[1];
          if (!href || !href.startsWith('/assets/')) return tag;
          const stylesheet = bundle[href.slice(1)];
          if (!stylesheet || stylesheet.type !== 'asset') {
            throw new Error(`Entry stylesheet is missing: ${href}`);
          }
          const css = String(stylesheet.source);
          if (/@import\b/i.test(css)) {
            throw new Error('Entry CSS must not import render-blocking stylesheets');
          }
          inlinedCount += 1;
          return `<style data-noma-entry-styles>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
        },
      );
      if (inlinedCount === 0) {
        throw new Error('No entry stylesheet was inlined');
      }
    },
  },
});

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
    plugins: [inlineStartupImagePlugin(), react(), tailwindcss(), inlineEntryStylesPlugin(), pwaVersionPlugin()],
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
