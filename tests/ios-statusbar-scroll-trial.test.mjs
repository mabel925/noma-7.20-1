import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/utils/iosStatusBarScrollTrial.ts", import.meta.url), "utf8");

function style() {
  const values = new Map();
  return { values, cssText: "", getPropertyValue: (key) => values.get(key)?.value || "", getPropertyPriority: (key) => values.get(key)?.priority || "",
    setProperty: (key, value, priority = "") => values.set(key, { value, priority }), removeProperty: (key) => values.delete(key) };
}
function element() {
  const classes = new Set();
  return { style: style(), dataset: {}, classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key), contains: (key) => classes.has(key) } };
}
function harness({ userAgent = "iPhone; CPU iPhone OS 27_2_1 like Mac OS X", standalone = true, dev = false, search = "", disabled = false, canScroll = true } = {}) {
  const root = element();
  const body = element();
  root.style.setProperty("overflow-y", "hidden", "important");
  body.style.setProperty("overflow-x", "hidden");
  body.style.setProperty("scroll-behavior", "smooth", "important");
  root.style.setProperty("--app-height", "844px");
  const originals = { root: new Map(root.style.values), body: new Map(body.style.values) };
  const children = [];
  let id = 0;
  const frames = new Map();
  const timers = new Map();
  const scrolls = [];
  let dialog = false;
  let editor = false;
  let bodyPosition = "static";
  const document = Object.assign(new EventTarget(), {
    documentElement: root, body, visibilityState: "visible",
    activeElement: { matches: () => editor }, querySelector: () => dialog ? {} : null,
    createElement() { const el = element(); el.setAttribute = () => {}; el.remove = () => children.splice(children.indexOf(el), 1); return el; },
  });
  body.appendChild = (child) => children.push(child);
  const window = Object.assign(new EventTarget(), {
    location: { search }, innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0,
    requestAnimationFrame(fn) { const next = ++id; frames.set(next, fn); return next; },
    cancelAnimationFrame: (key) => frames.delete(key),
    setTimeout(fn, delay) { const next = ++id; timers.set(next, { fn, delay }); return next; },
    clearTimeout: (key) => timers.delete(key),
    getComputedStyle: () => ({ position: bodyPosition }),
    scrollTo(x, y) {
      const unlocked = root.style.getPropertyValue("overflow-y") === "auto" && body.style.getPropertyValue("overflow-y") === "visible";
      const extent = Number(children[0]?.style.cssText.match(/height:(\d+)px/)?.[1] || 844);
      this.scrollX = x;
      this.scrollY = canScroll && unlocked ? Math.min(Math.max(0, y), extent - this.innerHeight) : 0;
      scrolls.push(this.scrollY);
    },
  });
  const transformed = source.replaceAll("import.meta.env.DEV", String(dev))
    .replaceAll("import.meta.env.VITE_IOS_STATUSBAR_SCROLL_TRIAL", disabled ? '"0"' : "undefined");
  const { outputText } = ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const context = vm.createContext({ exports: {}, URLSearchParams, navigator: { userAgent }, window, document, require: () => ({ isStandalonePwa: () => standalone }) });
  vm.runInContext(outputText, context);
  const stop = context.exports.installIosStatusBarScrollTrial();
  const frame = () => { for (const [key, fn] of [...frames]) { frames.delete(key); fn(); } };
  const advance = (delay) => { for (const [key, timer] of [...timers]) if (timer.delay <= delay && timers.has(key)) { timers.delete(key); timer.fn(); } };
  return { root, body, document, window, children, originals, scrolls, frames, timers, stop, frame, advance,
    ready() { root.dataset.nomaHomeReady = "true"; window.dispatchEvent(new Event("noma-home-ready")); frame(); },
    dialog(value) { dialog = value; }, editor(value) { editor = value; }, bodyPosition(value) { bodyPosition = value; },
  };
}

function assertRestored(h) {
  assert.equal(h.window.scrollY, 0);
  assert.equal(h.children.length, 0);
  assert.deepEqual(h.root.style.values, h.originals.root);
  assert.deepEqual(h.body.style.values, h.originals.body);
  assert.equal(h.root.classList.contains("ios-statusbar-scroll-trial"), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
}

test("an affected PWA scrolls the actual window once, then restores every style and removes the spacer", () => {
  const h = harness();
  assert.equal(h.scrolls.length, 0, "nothing runs before the startup coordinator is ready");
  h.ready();
  assert.equal(h.window.scrollY, 1);
  assert.equal(h.root.dataset.nomaStatusbarScrollTrial, "running");
  assert.equal(h.root.style.getPropertyValue("--app-height"), "844px");
  h.frame(); h.advance(50);
  assert.deepEqual(h.scrolls, [1, 0]);
  assert.equal(h.root.dataset.nomaStatusbarScrollPath, "0,1,0");
  assert.equal(h.root.dataset.nomaStatusbarScrollTrial, "scrolled");
  assertRestored(h);
  h.window.dispatchEvent(new Event("noma-home-ready"));
  h.document.dispatchEvent(new Event("visibilitychange"));
  h.window.dispatchEvent(new Event("pageshow"));
  h.frame(); h.advance(500);
  assert.deepEqual(h.scrolls, [1, 0], "startup duplicates and resume cannot repeat the experiment");
});

test("ordinary browsers, Android and unaffected iOS never unlock document scrolling", () => {
  for (const options of [
    { standalone: false },
    { userAgent: "Android 17" },
    { userAgent: "iPhone; CPU iPhone OS 26_2_1 like Mac OS X" },
    { userAgent: "iPhone; CPU iPhone OS 28_0 like Mac OS X" },
    { standalone: false, search: "?statusbarScrollTest=1" },
    { disabled: true },
    { search: "?statusbarScrollTest=0" },
  ]) {
    const h = harness(options); h.ready(); h.advance(500);
    assert.equal(h.scrolls.length, 0);
    assertRestored(h);
  }
});

test("the desktop mechanism override is development-only", () => {
  const h = harness({ userAgent: "Desktop", standalone: false, dev: true, search: "?statusbarScrollTest=1" });
  h.ready(); h.frame(); h.advance(50);
  assert.equal(h.root.dataset.nomaStatusbarScrollTrial, "scrolled");
  assertRestored(h);
});

test("OTP dialogs, editors, capture, hidden pages and landscape launches skip without layout writes", () => {
  for (const setup of [
    (h) => h.dialog(true),
    (h) => h.editor(true),
    (h) => h.root.classList.add("capture-page-open"),
    (h) => h.bodyPosition("fixed"),
    (h) => { h.document.visibilityState = "hidden"; },
    (h) => { h.window.innerWidth = 844; h.window.innerHeight = 390; },
  ]) {
    const h = harness(); setup(h); h.ready();
    assert.equal(h.root.dataset.nomaStatusbarScrollTrial, "skipped-active-ui");
    assert.equal(h.scrolls.length, 0);
    assertRestored(h);
  }
});

test("input, page hide and disposal immediately return to top and restore scroll locks", () => {
  for (const interrupt of [
    (h) => h.window.dispatchEvent(new Event("pointerdown")),
    (h) => h.window.dispatchEvent(new Event("keydown")),
    (h) => h.window.dispatchEvent(new Event("focusin")),
    (h) => h.window.dispatchEvent(new Event("pagehide")),
    (h) => { h.document.visibilityState = "hidden"; h.document.dispatchEvent(new Event("visibilitychange")); },
    (h) => h.stop(),
    (h) => h.advance(250),
  ]) {
    const h = harness(); h.ready(); interrupt(h);
    assertRestored(h);
    assert.ok(["scrolled", "interrupted"].includes(h.root.dataset.nomaStatusbarScrollTrial));
  }
});

test("a blocked or ineffective scroll is reported as no-scroll, not a successful blur fix", () => {
  const h = harness({ canScroll: false }); h.ready(); h.frame(); h.advance(50);
  assert.equal(h.root.dataset.nomaStatusbarScrollTrial, "no-scroll");
  assert.equal(h.root.dataset.nomaStatusbarScrollPath, "0,0,0");
  assertRestored(h);
});

test("cleanup preserves unrelated viewport updates made during the experiment", () => {
  const h = harness(); h.ready();
  h.root.style.setProperty("--app-height", "874px");
  h.originals.root.set("--app-height", { value: "874px", priority: "" });
  h.frame(); h.advance(50);
  assertRestored(h);
});
