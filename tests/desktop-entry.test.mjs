import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const deviceSource = await readFile(new URL("../src/utils/desktopEntry.ts", import.meta.url), "utf8");
const timelineSource = await readFile(new URL("../src/desktop/demoTimeline.ts", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
function load(source) { const context = vm.createContext({ exports: {} }); vm.runInContext(compile(source), context); return context.exports; }
const { shouldShowDesktopEntry } = load(deviceSource);
const { getDemoStage, DEMO_DURATION_MS } = load(timelineSource);
const desktop = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0, standalone: false, finePointer: true, developmentPreview: false };

test("desktop browsers get the introduction; touch laptops and narrow desktop windows remain supported", () => {
  assert.equal(shouldShowDesktopEntry(desktop), true);
  assert.equal(shouldShowDesktopEntry({ ...desktop, userAgent: "Windows NT 10.0", platform: "Win32", maxTouchPoints: 10 }), true);
  assert.equal(shouldShowDesktopEntry({ ...desktop, userAgent: "X11; Linux x86_64", platform: "Linux x86_64" }), true);
  assert.equal(shouldShowDesktopEntry({ ...desktop, viewportWidth: 393 }), false);
  assert.equal(shouldShowDesktopEntry({ ...desktop, viewportWidth: 767 }), false);
  assert.equal(shouldShowDesktopEntry({ ...desktop, viewportWidth: 768 }), true);
});
test("phones, landscape tablets, iPad desktop mode and installed apps keep the application", () => {
  for (const userAgent of ["iPhone", "Android Mobile", "Android Tablet", "iPad", "iPod"]) {
    assert.equal(shouldShowDesktopEntry({ ...desktop, userAgent }), false);
  }
  assert.equal(shouldShowDesktopEntry({ ...desktop, maxTouchPoints: 5 }), false);
  assert.equal(shouldShowDesktopEntry({ ...desktop, mobile: true }), false);
  assert.equal(shouldShowDesktopEntry({ ...desktop, standalone: true }), false);
  assert.equal(shouldShowDesktopEntry({ ...desktop, developmentPreview: true }), false);
});
test("the 15-second demo moves through the complete workflow and loops", () => {
  assert.equal(DEMO_DURATION_MS, 15000);
  for (const [time, stage] of [[0,"capture"], [2399,"capture"], [2400,"scan"], [5599,"scan"], [5600,"cutout"], [7800,"save"], [10800,"find"], [14999,"find"], [15000,"capture"], [17400,"scan"]]) {
    assert.equal(getDemoStage(time), stage);
  }
});

async function entryHarness({ phone = false, standalone = false, preview = false, dev = true, existingWorker = false } = {}) {
  const calls = { hydrate: 0, mount: 0, preload: 0, update: 0, viewport: 0, install: 0, removeSplash: 0, workerRefresh: 0 };
  const events = new Map();
  const context = vm.createContext({ exports: {}, URLSearchParams, React: { createElement: () => ({}) },
    navigator: { userAgent: phone ? "iPhone" : desktop.userAgent, platform: phone ? "iPhone" : "MacIntel", maxTouchPoints: phone ? 5 : 0, standalone,
      ...(existingWorker ? { serviceWorker: { getRegistration: async () => ({ update: async () => calls.workerRefresh++ }) } } : {}),
    },
    document: { documentElement: { dataset: {} }, getElementById: () => ({ remove: () => calls.removeSplash++ }) },
    window: { innerWidth: 1440, addEventListener: (name, callback) => events.set(name, callback), location: { search: preview ? "?appPreview=1" : "" }, matchMedia: query => ({ matches: query.includes("pointer: fine") }) },
    require(name) {
      if (name === "react") return { StrictMode: "strict", createElement: () => ({}) };
      if (name === "react-dom/client") return { hydrateRoot: () => { calls.hydrate++; return {}; }, createRoot: () => ({ render: () => calls.mount++ }) };
      if (name.endsWith("desktopEntry")) return { shouldShowDesktopEntry };
      if (name.endsWith("startupPreload")) return { preloadStartupAssets: () => { calls.preload++; return Promise.resolve(); } };
      if (name.endsWith("appUpdate")) return { checkForAppUpdate: async () => { calls.update++; return "ready"; } };
      if (name.endsWith("appViewport")) return { installAppViewportSync: () => calls.viewport++ };
      if (name.endsWith("pwaInstall")) return { installPwaInstallEvents: () => calls.install++ };
      return {};
    },
  });
  vm.runInContext(compile(mainSource.replaceAll("import.meta.env.DEV", String(dev)).replaceAll("import.meta.env.PROD", String(!dev))), context);
  await new Promise(setImmediate);
  return { calls, get entry() { return context.document.documentElement.dataset.nomaEntry; },
    async resize(width) { context.window.innerWidth = width; events.get('resize')(); await new Promise(setImmediate); },
  };
}
test("desktop entry hydrates the product page without starting the mobile startup or auth tree", async () => {
  const { calls, entry } = await entryHarness();
  assert.equal(entry, "desktop");
  assert.equal(calls.hydrate, 1);
  assert.equal(calls.mount, 0);
  assert.equal(calls.preload, 0);
  assert.equal(calls.update, 0);
  assert.equal(calls.viewport, 0);
  assert.equal(calls.install, 0);
});
test("mobile and developer previews retain the existing startup/update gate", async () => {
  for (const environment of [{ phone: true }, { standalone: true }, { preview: true }]) {
    const { calls, entry } = await entryHarness(environment);
    assert.equal(entry, "app");
    assert.equal(calls.hydrate, 0);
    assert.equal(calls.update, 1);
    assert.equal(calls.preload, 1);
    assert.equal(calls.viewport, 1);
    assert.equal(calls.install, 1);
    assert.equal(calls.mount, 1);
  }
  assert.equal((await entryHarness({ preview: true, dev: false })).entry, "desktop", "development overrides cannot bypass the public desktop entry");
});
test("existing desktop app-shell workers refresh in the background without a launch gate", async () => {
  const { calls, entry } = await entryHarness({ dev: false, existingWorker: true });
  assert.equal(entry, "desktop");
  assert.equal(calls.hydrate, 1);
  assert.equal(calls.workerRefresh, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.mount, 0);
});
test("switching desktop device emulation to phone width mounts the app without reloading or losing its state", async () => {
  const h = await entryHarness({ dev: false });
  assert.equal(h.entry, 'desktop');
  await h.resize(393);
  assert.equal(h.entry, 'app');
  assert.equal(h.calls.mount, 1);
  await h.resize(1440);
  assert.equal(h.entry, 'desktop');
  await h.resize(393);
  assert.equal(h.entry, 'app');
  assert.equal(h.calls.mount, 1);
  assert.equal(h.calls.hydrate, 1);
  assert.equal(h.calls.update, 1);
});
