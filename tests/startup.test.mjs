import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const updateSource = await readFile(new URL("../src/services/appUpdate.ts", import.meta.url), "utf8");
const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("activating an update during launch checks once without reloading the document", async () => {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = {};
  let checks = 0;
  let reloads = 0;
  const installing = new EventTarget();
  installing.state = "installing";
  serviceWorker.register = async () => ({
    installing,
    update: async () => {
      checks += 1;
      setTimeout(() => {
        installing.state = "activated";
        installing.dispatchEvent(new Event("statechange"));
        serviceWorker.dispatchEvent(new Event("controllerchange"));
      }, 0);
    },
  });
  const { outputText } = ts.transpileModule(updateSource.replaceAll("import.meta.env.PROD", "true"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = vm.createContext({
    exports: {}, console,
    navigator: { serviceWorker },
    document: { documentElement: { dataset: {} } },
    window: { setTimeout, clearTimeout, location: { reload: () => { reloads += 1; } } },
  });
  vm.runInContext(outputText, context);
  await Promise.all([context.exports.checkForAppUpdate(), context.exports.checkForAppUpdate()]);
  serviceWorker.dispatchEvent(new Event("controllerchange"));
  assert.equal(checks, 1);
  assert.equal(reloads, 0);
});

function serviceWorkerHarness() {
  const handlers = new Map();
  const stores = new Map([
    ["noma-app-old", new Map([["/", new Response("old shell")], ["https://noma.test/assets/old.js", new Response("old bundle")]])],
    ["noma-app-__NOMA_BUILD_ID__", new Map([["/", new Response("installed shell")]])],
  ]);
  const navigations = [];
  let networkRequests = 0;
  let claimed = 0;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key) => stores.delete(key),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (key) => store.get(typeof key === "string" ? key : key.url)?.clone(),
        put: async (key, value) => store.set(typeof key === "string" ? key : key.url, value),
      };
    },
    match: async (key) => {
      for (const name of stores.keys()) {
        const response = await (await caches.open(name)).match(key);
        if (response) return response;
      }
    },
  };
  const context = vm.createContext({
    URL, Response, console, caches,
    fetch: async () => { networkRequests += 1; return new Response("uninstalled future shell"); },
    self: {
      location: { origin: "https://noma.test" },
      addEventListener: (type, handler) => handlers.set(type, handler),
      clients: {
        claim: async () => { claimed += 1; },
        matchAll: async () => [{ url: "https://noma.test/", navigate: (url) => navigations.push(url) }],
      },
    },
  });
  vm.runInContext(swSource, context);
  return { handlers, stores, navigations, get networkRequests() { return networkRequests; }, get claimed() { return claimed; } };
}

test("worker activation never navigates open clients, including legacy installations", async () => {
  const harness = serviceWorkerHarness();
  harness.stores.set("noma-app-v28", new Map());
  const tasks = [];
  harness.handlers.get("activate")({ waitUntil: (task) => tasks.push(task) });
  await Promise.all(tasks);
  assert.equal(harness.claimed, 1);
  assert.deepEqual(harness.navigations, []);
  assert.equal(harness.stores.has("noma-app-__NOMA_BUILD_ID__"), true);
});

test("next launch uses the installed release shell instead of an older or not-yet-installed shell", async () => {
  const harness = serviceWorkerHarness();
  let responsePromise;
  const tasks = [];
  harness.handlers.get("fetch")({
    request: { url: "https://noma.test/", method: "GET", mode: "navigate" },
    respondWith: (task) => { responsePromise = task; },
    waitUntil: (task) => tasks.push(task),
  });
  const response = await responsePromise;
  await Promise.all(tasks);
  assert.equal(await response.text(), "installed shell");
  assert.equal(harness.networkRequests, 0);
});

test("activation retains the preceding release assets for an already-open document", async () => {
  const harness = serviceWorkerHarness();
  const tasks = [];
  harness.handlers.get("activate")({ waitUntil: (task) => tasks.push(task) });
  await Promise.all(tasks);
  let responsePromise;
  harness.handlers.get("fetch")({
    request: { url: "https://noma.test/assets/old.js", method: "GET", mode: "cors" },
    respondWith: (task) => { responsePromise = task; },
  });
  assert.equal(await (await responsePromise).text(), "old bundle");
  assert.equal(harness.networkRequests, 0);
});

test("iPhone launch progress has the same fixed position before and after viewport restoration", async () => {
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert(script);
  async function launch(innerHeight) {
    const classes = new Set();
    const progress = { style: {}, offsetHeight: 37 };
    const image = { complete: true, naturalWidth: 1170, decode: async () => undefined };
    const splash = { querySelector: () => progress, classList: { add: (name) => classes.add(name) } };
    const window = {
      innerHeight, screen: { height: 874 },
      matchMedia: () => ({ matches: true }),
      getComputedStyle: () => ({ bottom: "52px" }),
    };
    const context = vm.createContext({
      window,
      navigator: { standalone: true, userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 },
      document: { getElementById: (id) => id === "startup-splash" ? splash : image },
      requestAnimationFrame: (callback) => callback(),
    });
    vm.runInContext(script, context);
    const initialTop = progress.style.top;
    window.innerHeight = 874;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(progress.style.top, initialTop);
    assert.equal(progress.style.bottom, "auto");
    assert(classes.has("is-image-ready"));
    return initialTop;
  }
  assert.equal(await launch(794), await launch(874));
});
