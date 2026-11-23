import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/CaptureScanner.tsx", import.meta.url), "utf8");
const helpers = await readFile(new URL("../src/animations/captureSnapshot.ts", import.meta.url), "utf8");
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("the saved scanning frame keeps the same cover crop without re-encoding the photo", () => {
  const draws = [];
  const canvas = { getContext: () => ({ drawImage(...args) { draws.push(args); } }) };
  const context = vm.createContext({ exports: {}, document: { createElement: () => canvas } });
  vm.runInContext(compile(helpers), context);
  const image = { complete: true, naturalWidth: 1600, naturalHeight: 1200 };
  assert.equal(context.exports.capturePhotoSnapshot(image, 390, 600), canvas);
  assert.equal(canvas.width, 390);
  assert.equal(canvas.height, 600);
  assert.deepEqual(draws[0], [image, -205, 0, 800, 600]);
  const painted = [];
  context.exports.paintCaptureSnapshot({ fillRect() {}, drawImage(...args) { painted.push(args); } }, canvas, 390, 740);
  assert.deepEqual(painted[0], [canvas, 0, 0, 390, 600], "removing the drawer must not stretch the photographed region");
});

function handoffHarness({ snapshotReady = true } = {}) {
  const frames = new Map(), calls = [], images = [];
  let nextId = 0;
  const context2d = (name) => ({
    clearRect() { calls.push(`${name}:clear`); },
    fillRect() { calls.push(`${name}:fill`); },
    drawImage() { calls.push(`${name}:photo`); },
    getImageData() { return { data: new Uint8ClampedArray(8 * 8 * 4) }; },
  });
  const target = context2d("target");
  const backing = context2d("backing");
  const canvas = { parentElement: { clientWidth: 8, clientHeight: 8 }, style: {}, getContext: () => target };
  const context = vm.createContext({
    exports: {}, scanStep: "disintegrating", skipScanEffects: false,
    pixelateCanvasRef: { current: canvas }, disintegrationSnapshotRef: { current: snapshotReady ? { width: 8, height: 8 } : null },
    scanningPhotoRef: { current: null }, uploadedImageUrl: "existing-photo", DISINTEGRATE_DURATION: 1850,
    cutoutFlightLandedRef: { current: true }, stickerSizeSettleTimerRef: { current: null },
    setStickerSizeSettled() {}, setScanStep() {}, setAiProgress() {},
    layout: { left: 0, top: 0, width: 8, height: 8 },
    document: { createElement: () => ({ getContext: () => backing }) },
    Image: class { constructor() { images.push(this); } },
    performance: { now: () => 0 },
    requestAnimationFrame(fn) { frames.set(++nextId, fn); calls.push("schedule"); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() {}, clearTimeout() {},
  });
  const start = source.indexOf('    if (scanStep !== "disintegrating") return;');
  const end = source.indexOf("\n  }, [scanStep, activeItem", start);
  vm.runInContext(compile(`${helpers}\nexports.run = () => {${source.slice(start, end)}};`), context);
  return { cleanup: context.exports.run(), calls, images, frames,
    frame(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(time)); },
  };
}

test("disintegration paints the saved photo before its first animation frame", () => {
  const h = handoffHarness();
  assert.ok(h.calls.indexOf("target:photo") < h.calls.indexOf("schedule"));
  assert.equal(h.images.length, 0, "a decoded scanning frame must not be loaded again");
  h.cleanup();
  assert.equal(h.frames.size, 0);
});

test("a missing photo never produces a blank beige frame, and late decoding cannot repaint a closed scan", () => {
  const h = handoffHarness({ snapshotReady: false });
  h.frame(1000);
  assert.equal(h.calls.includes("target:fill"), false);
  h.cleanup();
  const before = h.calls.length;
  h.images[0].onload();
  assert.equal(h.calls.length, before);
  assert.equal(h.frames.size, 0);
});

test("a completed dissolve keeps an opaque result background until the next scene mounts", () => {
  const h = handoffHarness();
  h.frame(10);
  h.calls.length = 0;
  h.frame(1900);
  assert.equal(h.calls.includes("target:clear"), true);
  assert.equal(h.calls.at(-1), "target:fill");
  h.cleanup();
});

test("wave settling and sticker preparation start together instead of adding serial waits", async () => {
  const start = source.indexOf("  const completeWithTransparentCutout =");
  const end = source.indexOf("\n  const runCombinedImagePipeline", start);
  const calls = [];
  let resolveAssets;
  const assets = { paddedCutout: "padded", finalSticker: "sticker", bounds: null };
  const controller = new AbortController();
  const context = vm.createContext({ exports: {},
    captureSessionRef: { current: controller }, recognitionWaveRef: { current: { finish() { calls.push("wave"); return Promise.resolve(); } } },
    calculateTargetScaleFromDimensions() {}, generateStickerAssets() { calls.push("assets"); return new Promise((resolve) => { resolveAssets = resolve; }); },
    setAlignedCutoutUrl() {}, setFlightCutoutUrl() {}, setTransparentCutoutUrl() {}, setPaddedCutoutUrl() {},
    setGeneratedStickerUrl() {}, setTraceCompleted() {}, setAiProgress() {},
    async beginCutoutTransition() { calls.push("transition"); },
  });
  vm.runInContext(compile(`${source.slice(start, end)}\nexports.run = completeWithTransparentCutout;`), context);
  const task = context.exports.run("cutout", 512, 512);
  assert.deepEqual(calls, ["assets", "wave"]);
  resolveAssets(assets);
  assert.equal(await task, "sticker");
  assert.deepEqual(calls, ["assets", "wave", "transition"]);
});
