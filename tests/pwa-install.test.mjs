import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/pwaInstall.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const harness = (device = { userAgent: "Android Chrome", platform: "Linux", maxTouchPoints: 5 }) => {
  const events = new Map();
  const context = vm.createContext({ exports: {}, navigator: device, window: { addEventListener(name, listener) { assert.equal(events.has(name), false); events.set(name, listener); } } });
  vm.runInContext(outputText, context);
  return { ...context.exports, events };
};

test("mobile install guidance distinguishes iPhone, desktop-mode iPad, Android, and desktop", () => {
  const { getInstallPlatform, isEmbeddedBrowser } = harness();
  assert.equal(getInstallPlatform({ userAgent: "iPhone Safari", platform: "iPhone", maxTouchPoints: 5 }), "ios");
  assert.equal(getInstallPlatform({ userAgent: "Macintosh Safari", platform: "MacIntel", maxTouchPoints: 5 }), "ios");
  assert.equal(getInstallPlatform({ userAgent: "Android Chrome", platform: "Linux", maxTouchPoints: 5 }), "android");
  assert.equal(getInstallPlatform({ userAgent: "Macintosh Safari", platform: "MacIntel", maxTouchPoints: 0 }), null);
  assert.equal(isEmbeddedBrowser("iPhone MicroMessenger"), true);
  assert.equal(isEmbeddedBrowser("Linux Android; wv)"), true);
  assert.equal(isEmbeddedBrowser("iPhone Version/27.0 Mobile Safari"), false);
});

test("reminders resume after snooze; blocked and malformed storage do not break startup", () => {
  const { readInstallSnooze } = harness();
  assert.equal(readInstallSnooze({ getItem: () => "2000" }, 1000), true);
  assert.equal(readInstallSnooze({ getItem: () => "2000" }, 2000), false);
  assert.equal(readInstallSnooze({ getItem: () => "corrupt" }, 1000), false);
  assert.equal(readInstallSnooze({ getItem: () => { throw new Error("blocked"); } }), false);
});

test("native install event is captured before subscribers mount and listeners are installed once", () => {
  const h = harness();
  h.installPwaInstallEvents();
  h.installPwaInstallEvents();
  let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  h.events.get("beforeinstallprompt")(event);
  assert.equal(prevented, 1);
  assert.equal(h.getInstallSnapshot().prompt, event);
  let updates = 0;
  const unsubscribe = h.subscribeInstall(() => updates++);
  h.events.get("appinstalled")();
  assert.equal(h.getInstallSnapshot().installed, true);
  assert.equal(h.getInstallSnapshot().prompt, null);
  assert.equal(updates, 1);
  unsubscribe();
});

test("desktop browser install promotion is left to the browser", () => {
  const h = harness({ userAgent: "Macintosh Chrome", platform: "MacIntel", maxTouchPoints: 0 });
  h.installPwaInstallEvents();
  h.events.get("beforeinstallprompt")({ preventDefault() { assert.fail("desktop default was suppressed"); } });
  assert.equal(h.getInstallSnapshot().prompt, null);
});

test("a native prompt can only be consumed once, including concurrent clicks", async () => {
  const h = harness();
  h.installPwaInstallEvents();
  let calls = 0;
  let choose;
  h.events.get("beforeinstallprompt")({ preventDefault() {}, prompt: async () => { calls++; }, userChoice: new Promise((resolve) => { choose = resolve; }) });
  const result = h.requestPwaInstall();
  assert.equal(await h.requestPwaInstall(), "unavailable");
  choose({ outcome: "accepted" });
  assert.equal(await result, "accepted");
  assert.equal(calls, 1);
});

test("native dismissal and rejection allow manual instructions without throwing", async () => {
  const h = harness();
  h.installPwaInstallEvents();
  h.events.get("beforeinstallprompt")({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
  assert.equal(await h.requestPwaInstall(), "dismissed");
  h.events.get("beforeinstallprompt")({ preventDefault() {}, prompt: async () => { throw new Error("not installable"); } });
  assert.equal(await h.requestPwaInstall(), "unavailable");
});
