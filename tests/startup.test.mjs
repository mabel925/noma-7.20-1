import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const updateSource = await readFile(new URL("../src/services/appUpdate.ts", import.meta.url), "utf8");
const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function updateHarness({ currentBuild = "old", targetBuild = "new", offline = false, blockedStorage = false, handoff = false, noActivation = false } = {}) {
  const serviceWorker = new EventTarget();
  const timers = new Map();
  let timerId = 0;
  let checks = 0;
  let reloads = 0;
  let requests = 0;
  let saved = null;
  const progress = { style: { top: "785px" }, value: "4", getAttribute() { return this.value; }, setAttribute(_, value) { this.value = value; } };
  const worker = (buildId) => ({
    postMessage: (_, ports) => queueMicrotask(() => ports[0].send({ buildId })),
  });
  serviceWorker.controller = worker(currentBuild);
  const activate = () => {
    serviceWorker.controller = worker(targetBuild);
    serviceWorker.dispatchEvent(new Event("controllerchange"));
  };
  const registration = {
    update: async () => {
      checks += 1;
      if (!noActivation) queueMicrotask(activate);
    },
  };
  serviceWorker.register = async () => registration;
  class FakeMessageChannel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { close() {}, send: (data) => this.port1.onmessage?.({ data }) };
    }
  }
  const { outputText } = ts.transpileModule(updateSource.replaceAll("import.meta.env.PROD", "true"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = vm.createContext({
    exports: {}, console: { warn() {} }, AbortController, MessageChannel: FakeMessageChannel,
    sessionStorage: { setItem: (_, value) => { if (blockedStorage) throw new Error("Blocked"); saved = JSON.parse(value); } },
    fetch: async (url, init) => {
      requests += 1;
      assert.equal(url, "/version.json");
      assert.equal(init.cache, "no-store");
      if (offline) throw new Error("Offline");
      return new Response(JSON.stringify({ buildId: targetBuild }));
    },
    navigator: { serviceWorker },
    document: {
      documentElement: { dataset: { nomaUpdateHandoff: String(handoff) } },
      querySelector: (selector) => selector.includes("meta") ? { content: currentBuild } : progress,
      getElementById: () => ({ style: {} }),
    },
    window: {
      setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout: (id) => timers.delete(id),
      location: { reload: () => { reloads += 1; } },
    },
  });
  vm.runInContext(outputText, context);
  return {
    check: context.exports.checkForAppUpdate, activate, progress,
    timeout: () => [...timers.values()].forEach((callback) => callback()),
    get checks() { return checks; }, get requests() { return requests; },
    get reloads() { return reloads; }, get saved() { return saved; },
  };
}

test("a downloaded update hands off this launch once before the app mounts", async () => {
  const h = updateHarness();
  const results = await Promise.all([h.check(), h.check()]);
  assert.deepEqual(results, ["reloading", "reloading"]);
  assert.equal(h.checks, 1);
  assert.equal(h.requests, 1);
  assert.equal(h.reloads, 1);
  assert.equal(h.saved.buildId, "new");
  assert.equal(h.saved.progress, 15);
  assert.equal(h.saved.top, "785px");
  h.activate();
  assert.equal(h.reloads, 1);
});

test("the current release and first install enter the app without a reload", async () => {
  const h = updateHarness({ currentBuild: "new" });
  assert.equal(await h.check(), "ready");
  assert.equal(h.reloads, 0);
});

test("offline launch enters the cached app without a reload", async () => {
  const h = updateHarness({ offline: true });
  assert.equal(await h.check(), "ready");
  assert.equal(h.reloads, 0);
});

test("a slow update releases the launch deadline and cannot reload an active app later", async () => {
  const h = updateHarness({ noActivation: true });
  const launch = h.check();
  await new Promise(setImmediate);
  h.timeout();
  assert.equal(await launch, "ready");
  h.activate();
  await new Promise(setImmediate);
  assert.equal(h.reloads, 0);
});

test("blocked handoff storage safely defers an update", async () => {
  const h = updateHarness({ blockedStorage: true });
  assert.equal(await h.check(), "ready");
  assert.equal(h.reloads, 0);
});

test("the new document does not recheck or reload a carried launch", async () => {
  const h = updateHarness({ currentBuild: "new", targetBuild: "even-newer", handoff: true });
  assert.equal(await h.check(), "ready");
  assert.equal(h.requests, 0);
  assert.equal(h.reloads, 0);
});

function serviceWorkerHarness({ failEntry = false } = {}) {
  const handlers = new Map();
  const stores = new Map([
    ["noma-app-old", new Map([["/", new Response("old shell")], ["https://noma.test/assets/old.js", new Response("old bundle")]])],
    ["noma-app-__NOMA_BUILD_ID__", new Map([["/", new Response("installed shell")]])],
  ]);
  const navigations = [];
  let networkRequests = 0;
  let claimed = 0;
  let skipped = 0;
  const downloads = [];
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key) => stores.delete(key),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (key) => store.get(typeof key === "string" ? key : key.url)?.clone(),
        put: async (key, value) => store.set(typeof key === "string" ? key : key.url, value),
        addAll: async (requests) => {
          for (const request of requests) {
            downloads.push(request);
            if (failEntry && request.url.endsWith(".js")) throw new Error("Entry download failed");
            store.set(request.url, new Response("entry bytes"));
          }
        },
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
    Request: class extends Request { constructor(url, options) { super(new URL(url, "https://noma.test"), options); } },
    fetch: async (request) => {
      networkRequests += 1;
      if (request === "/") return new Response('<head><meta name="noma-build-id" content="__NOMA_BUILD_ID__"></head><script type="module" src="/assets/new.js"></script>');
      return new Response("uninstalled future shell");
    },
    self: {
      location: { origin: "https://noma.test" },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => { skipped += 1; },
      clients: {
        claim: async () => { claimed += 1; },
        matchAll: async () => [{ url: "https://noma.test/", navigate: (url) => navigations.push(url) }],
      },
    },
  });
  vm.runInContext(swSource, context);
  return { handlers, stores, navigations, downloads, get skipped() { return skipped; }, get networkRequests() { return networkRequests; }, get claimed() { return claimed; } };
}

test("worker installation downloads the matching shell and entry bundle before activation", async () => {
  const h = serviceWorkerHarness();
  let install;
  h.handlers.get("install")({ waitUntil: (task) => { install = task; } });
  await install;
  assert.equal(h.skipped, 1);
  assert(h.downloads.some((request) => request.url === "https://noma.test/assets/new.js"));
  assert(h.downloads.every((request) => request.cache === "reload"));
  assert.match(await h.stores.get("noma-app-__NOMA_BUILD_ID__").get("/").text(), /new.js/);
});

test("failed entry download prevents the new worker from taking over", async () => {
  const h = serviceWorkerHarness({ failEntry: true });
  let install;
  h.handlers.get("install")({ waitUntil: (task) => { install = task; } });
  await assert.rejects(install, /Entry download failed/);
  assert.equal(h.skipped, 0);
});

test("version checks always reach the network even when an old response is cached", async () => {
  const h = serviceWorkerHarness();
  h.stores.get("noma-app-old").set("https://noma.test/version.json", new Response("stale version"));
  let response;
  h.handlers.get("fetch")({ request: { url: "https://noma.test/version.json", method: "GET" }, respondWith: (task) => { response = task; } });
  assert.equal(await (await response).text(), "uninstalled future shell");
  assert.equal(h.networkRequests, 1);
});

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
      document: { documentElement: { dataset: {} }, getElementById: (id) => id === "startup-splash" ? splash : image },
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

test("the early splash restores handoff progress and position once without starting a second launch", () => {
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  const startedAt = Date.now() - 900;
  let saved = JSON.stringify({ buildId: "new", startedAt, savedAt: Date.now(), progress: 15, top: "785px" });
  const storage = { getItem: () => saved, removeItem: () => { saved = null; } };
  function run(buildId = "new") {
    const progress = { style: {}, offsetHeight: 37, value: "4", setAttribute(_, value) { this.value = value; } };
    const fill = { style: {} };
    const label = { textContent: "4%" };
    const root = { dataset: {} };
    const image = { complete: false, addEventListener() {} };
    const splash = { querySelector: () => progress };
    const context = vm.createContext({
      sessionStorage: storage,
      navigator: { standalone: true, userAgent: "iPhone", maxTouchPoints: 5 },
      window: { innerHeight: 794, screen: { height: 874 }, matchMedia: () => ({ matches: true }), getComputedStyle: () => ({ bottom: "52px" }) },
      document: {
        documentElement: root, querySelector: () => ({ content: buildId }),
        getElementById: (id) => ({ "startup-splash": splash, "startup-splash-image": image, "startup-progress-fill": fill, "startup-progress-label": label })[id],
      },
      requestAnimationFrame: (callback) => callback(),
    });
    vm.runInContext(script, context);
    return { progress, root, fill, label };
  }
  const resumed = run();
  assert.equal(resumed.root.dataset.nomaLaunchStartedAt, String(startedAt));
  assert.equal(resumed.root.dataset.nomaUpdateHandoff, "true");
  assert.equal(resumed.progress.style.top, "785px");
  assert.equal(resumed.progress.value, "15");
  assert.equal(resumed.fill.style.width, "15%");
  assert.equal(resumed.label.textContent, "15%");
  assert.equal(saved, null);
  assert.equal(run().root.dataset.nomaUpdateHandoff, undefined);
  saved = JSON.stringify({ buildId: "wrong", startedAt, savedAt: Date.now(), progress: 15, top: "785px" });
  assert.equal(run().root.dataset.nomaUpdateHandoff, undefined);
});
