import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadModule(file, imports, globals) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const context = vm.createContext({ exports: {}, console, URLSearchParams, ...globals, require: (name) => imports[name] });
  vm.runInContext(outputText, context);
  return context.exports;
}

const styleHarness = () => {
  const values = new Map();
  const writes = [];
  return { values, writes, getPropertyValue: (key) => values.get(key) || "", setProperty(key, value) { values.set(key, value); writes.push([key, value]); } };
};

test("Safari viewport height changes once per new size, not on identical scroll events", async () => {
  const style = styleHarness();
  const window = { innerHeight: 744, visualViewport: { height: 714, offsetTop: 0 }, matchMedia: () => ({ matches: false }) };
  const { syncAppViewportHeight } = await loadModule("../src/utils/appViewport.ts", {}, {
    window, navigator: { userAgent: "iPhone", platform: "iPhone" }, document: { documentElement: { style } },
  });
  syncAppViewportHeight();
  syncAppViewportHeight();
  assert.deepEqual(style.writes, [["--app-height", "714px"]]);
  window.visualViewport.height = 300;
  syncAppViewportHeight();
  assert.equal(style.values.get("--app-height"), "300px", "native keyboard still resizes the app");
  window.visualViewport.height = 714;
  syncAppViewportHeight();
  assert.equal(style.values.get("--app-height"), "714px");
});

test("iPhone standalone retains full screen height and does not override a native keyboard", async () => {
  const style = styleHarness();
  const window = { innerHeight: 830, screen: { height: 874 }, visualViewport: { height: 830, offsetTop: 0 } };
  const { syncAppViewportHeight } = await loadModule("../src/utils/appViewport.ts", {}, {
    window, navigator: { standalone: true, userAgent: "iPhone" }, document: { documentElement: { style } },
  });
  syncAppViewportHeight();
  assert.equal(style.values.get("--app-height"), "874px");
  window.innerHeight = 500;
  window.visualViewport.height = 300;
  syncAppViewportHeight();
  assert.equal(style.values.get("--app-height"), "500px");
});

test("leaving Chat dismisses editing without synthetic resize, timers, or changing animated transforms", async () => {
  let blurs = 0;
  let scrolls = 0;
  class Editor { matches() { return true; } blur() { blurs += 1; } }
  const style = styleHarness();
  style.transform = "translateY(-205px)";
  style.height = "var(--app-height)";
  const element = { style, classList: { remove() {} } };
  const { useKeyboardReset } = await loadModule("../src/hooks/useKeyboardReset.ts", { react: { useEffect: (effect) => effect() } }, {
    HTMLElement: Editor,
    document: { activeElement: new Editor(), body: element, documentElement: element },
    window: { scrollX: 0, scrollY: 10, scrollTo: () => { scrolls += 1; }, dispatchEvent() { assert.fail("synthetic resize"); }, setTimeout() { assert.fail("delayed reset"); } },
  });
  useKeyboardReset(false, false);
  assert.equal(blurs, 1);
  assert.equal(scrolls, 1);
  assert.equal(style.transform, "translateY(-205px)");
  assert.equal(style.height, "var(--app-height)");
  useKeyboardReset(true, false);
  assert.equal(blurs, 1, "entering Chat does not dismiss editing");
  useKeyboardReset(true, true);
  assert.equal(blurs, 2, "entering capture still dismisses editing");
});

async function spriteHarness(initialActive) {
  let hookIndex = 0;
  const slots = [];
  const pendingEffects = [];
  const events = new Map();
  const calls = { init: 0, play: 0, pause: 0, destroy: 0, ready: 0 };
  const view = { setRepeatCount() {}, play: async () => { calls.play += 1; }, pause() { calls.pause += 1; }, stop: async () => {}, destroy() { calls.destroy += 1; } };
  const file = { width: () => 600, height: () => 600, destroy() {} };
  const effect = (callback, deps) => {
    const index = hookIndex++;
    const previous = slots[index];
    if (previous && deps.every((value, i) => value === previous.deps[i])) return;
    pendingEffects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
  };
  const React = {
    createElement: () => null,
    useRef: (value) => { const index = hookIndex++; return slots[index] ||= { current: index === 0 ? {} : value }; },
    useState: (value) => { hookIndex++; return [value, () => {}]; },
    useEffect: effect, useLayoutEffect: effect,
  };
  const document = { visibilityState: "visible", addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); } };
  const { PagNomaSprite } = await loadModule("../src/components/PagNomaSprite.tsx", {
    react: React,
    libpag: { PAGInit: async () => ({ PAGFile: { load: async () => file }, PAGView: { init: async () => { calls.init += 1; return view; } } }) },
  }, { document, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }), requestAnimationFrame: (fn) => fn() });
  const onReady = () => { calls.ready += 1; };
  const render = async (active) => {
    hookIndex = 0;
    PagNomaSprite({ active, onReady });
    while (pendingEffects.length) pendingEffects.shift()();
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  await render(initialActive);
  return { calls, render, visibility(state) { document.visibilityState = state; events.get("visibilitychange")?.(); } };
}

test("covered homepage pauses PAG; returning resumes the same initialized animation", async () => {
  const h = await spriteHarness(true);
  assert.equal(h.calls.play, 1);
  await h.render(false);
  assert.equal(h.calls.pause, 1);
  await h.render(true);
  assert.equal(h.calls.play, 2);
  assert.equal(h.calls.init, 1);
  assert.equal(h.calls.destroy, 0);
  h.visibility("hidden");
  assert.equal(h.calls.pause, 2);
  h.visibility("visible");
  assert.equal(h.calls.play, 3);
});

test("animation initialized under an overlay stays paused until the homepage is visible", async () => {
  const h = await spriteHarness(false);
  assert.equal(h.calls.ready, 1, "startup still completes from the initialized first frame");
  assert.equal(h.calls.play, 0);
  h.visibility("visible");
  assert.equal(h.calls.play, 0);
  await h.render(true);
  assert.equal(h.calls.play, 1);
});
