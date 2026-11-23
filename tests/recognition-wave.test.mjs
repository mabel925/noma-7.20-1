import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/animations/recognitionWave.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ reduced = false, available = true, compileSuccess = true } = {}) {
  let now = 0, nextId = 0, draws = 0, lost = false;
  const frames = new Map(), timers = new Map(), uniforms = new Map(), deleted = [];
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
    getShaderParameter: () => compileSuccess, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: (_program, name) => name,
    uniform1f(name, value) { uniforms.set(name, value); },
    uniform2f(name, ...value) { uniforms.set(name, value); },
    drawArrays() { draws++; }, isContextLost: () => lost,
    deleteShader() { deleted.push("shader"); }, deleteProgram() { deleted.push("program"); },
    deleteBuffer() { deleted.push("buffer"); }, deleteTexture() { deleted.push("texture"); },
  }, { get: (object, key) => object[key] ?? (() => {}) });
  const listeners = new Map();
  const canvas = {
    style: {}, width: 0, height: 0, parentElement: { clientWidth: 390, clientHeight: 520 },
    getContext: () => available ? gl : null,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const context = vm.createContext({ exports: {}, window: {
    devicePixelRatio: 3, matchMedia: () => ({ matches: reduced }),
  }, performance: { now: () => now },
  requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
  setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(compiled, context);
  const controller = context.exports.startRecognitionWave(canvas, { naturalWidth: 1200, naturalHeight: 1600 });
  return { ...context.exports, controller, canvas, frames, timers, uniforms, listeners, deleted,
    draws: () => draws,
    frame(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(time)); },
    timeout() { const pending = [...timers.values()]; timers.clear(); pending.forEach(({ fn }) => fn()); },
    loseContext() { lost = true; listeners.get("webglcontextlost")?.(); },
  };
}

test("recognition waves repeat with a 100ms rest and render at device resolution", () => {
  const h = harness();
  assert.equal(h.canvas.width, 1170);
  assert.equal(h.canvas.height, 1560);
  const { sweepDuration, visibleSweepRatio, pauseDuration } = h.RECOGNITION_WAVE_SETTINGS;
  const visibleDuration = sweepDuration * visibleSweepRatio;
  assert.equal(pauseDuration, 100);
  h.frame(visibleDuration + 50);
  assert.equal(h.uniforms.get("waveAmplitude"), 0);
  assert.equal(h.uniforms.get("glow"), 0);
  h.frame(visibleDuration + pauseDuration + 100);
  assert.ok(h.uniforms.get("waveAmplitude") > 0, "another wave starts after the rest");
  h.controller.destroy();
  assert.equal(h.frames.size, 0);
});

test("result handoff finishes within 180ms even when animation frames are suspended", async () => {
  const h = harness();
  h.frame(1200);
  const finishing = h.controller.finish();
  assert.equal(h.controller.finish(), finishing, "multiple callers share the same handoff");
  assert.equal([...h.timers.values()][0].delay, 180);
  h.timeout();
  await finishing;
  assert.equal(h.uniforms.get("waveAmplitude"), 0);
  assert.equal(h.uniforms.get("glow"), 0);
  assert.equal(h.frames.size, 0);
  h.controller.destroy();
});

test("closing a scan resolves pending handoff and frees all GPU resources", async () => {
  const h = harness();
  const finishing = h.controller.finish();
  const before = h.draws();
  h.controller.destroy();
  await finishing;
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.ok(h.deleted.includes("texture") && h.deleted.includes("buffer") && h.deleted.includes("program"));
  h.frame(10000);
  assert.equal(h.draws(), before, "cancelled scans cannot restart rendering");
});

test("context loss during handoff keeps the underlying photo and releases the wait", async () => {
  const h = harness();
  const finishing = h.controller.finish();
  h.loseContext();
  await finishing;
  assert.equal(h.canvas.style.visibility, "hidden");
  assert.equal(h.timers.size, 0);
  h.controller.destroy();
});

test("unavailable graphics or reduced motion never blocks recognition", () => {
  for (const options of [{ reduced: true }, { available: false }, { compileSuccess: false }]) {
    const h = harness(options);
    assert.equal(h.controller, null);
    assert.equal(h.frames.size, 0);
    assert.equal(h.timers.size, 0);
  }
});
