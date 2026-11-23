import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/CaptureScanner.tsx", import.meta.url), "utf8");
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("capture scaling starts at 350ms and outlining at 950ms, with landing tied to the actual flight finish", () => {
  const timers = new Map(), frames = new Map(), calls = [];
  let nextId = 1;
  const animation = { cancel() { calls.push("cancel"); } };
  const landed = { current: false };
  const context = vm.createContext({ exports: {}, performance: { now: () => 0 },
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scanStep: "disintegrating", cutoutFlightImageUrl: "prepared-image", skipScanEffects: false,
    cutoutFlightRef: { current: { animate(keyframes, options) { calls.push(options); return animation; } } },
    cutoutFlightAnimationRef: { current: null }, cutoutFlightLandedRef: landed,
    cutoutFlightTranslateX: 20, cutoutFlightTranslateY: -30, cutoutFlightTargetScale: 0.5,
    setIsResultTitleRevealReady(value) { calls.push(["title", value]); },
    setIsResultDecorationVisible(value) { calls.push(["decoration", value]); },
    setIsOutlineTraceReady(value) { calls.push(["outline", value]); },
  });
  const constantsStart = source.indexOf("  const CUTOUT_FLIGHT_DELAY =");
  const constantsEnd = source.indexOf("  const [browserChromeInset", constantsStart);
  const start = source.indexOf('    if (scanStep !== "disintegrating" || !cutoutFlightImageUrl) return;');
  const end = source.indexOf("\n  }, [", start);
  vm.runInContext(compile(`${source.slice(constantsStart, constantsEnd)}\nexports.run = () => {${source.slice(start, end)}};`), context);
  const cleanup = context.exports.run();
  const runTimer = (delay) => {
    const [id, timer] = [...timers].find(([, timer]) => timer.delay === delay);
    timers.delete(id); timer.fn();
  };
  const frame = () => {
    const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn());
  };
  assert.equal(calls.length, 0, "the subject must stay in place until the flight delay expires");
  runTimer(350); frame(); frame();
  assert.equal(calls.find((call) => call.duration)?.duration, 962);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "outline"), false,
    "starting the flight must not also start the outline");
  assert.equal(landed.current, false, "starting the flight must not mark it as landed");
  runTimer(570);
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "title" && call[1]));
  runTimer(950);
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "outline" && call[1]));
  assert.equal(landed.current, false, "earlier UI reveals must not interrupt the flight");
  animation.onfinish();
  assert.equal(landed.current, true);
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  // Closing before the delayed animations start must remove both pending timers.
  context.exports.run()();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
});

test("the embedded result opens when ready without a second settling timer", () => {
  const start = source.indexOf('    if (scanStep === "sticker" && generatedStickerUrl && traceCompleted)');
  const end = source.indexOf("\n  }, [", start);
  const calls = [];
  const context = vm.createContext({ exports: {}, scanStep: "sticker", generatedStickerUrl: "sticker",
    traceCompleted: true, onCutoutComplete() {},
    setScanStep(value) { calls.push(value); }, setIsCapturing(value) { calls.push(value); },
    setTimeout() { throw new Error("the embedded flow must not add another delay"); }, clearTimeout() {},
  });
  vm.runInContext(compile(`exports.run = () => {${source.slice(start, end)}};`), context);
  context.exports.run();
  assert.deepEqual(calls, ["done", false]);
  calls.length = 0;
  context.traceCompleted = false;
  context.exports.run();
  assert.deepEqual(calls, [], "an unfinished outline still prevents handoff");
});
