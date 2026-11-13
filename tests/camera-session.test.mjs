import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/cameraSession.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const fakeStream = () => {
  let stops = 0;
  const track = { readyState: "live", stop() { stops += 1; this.readyState = "ended"; } };
  return { getTracks: () => [track], getVideoTracks: () => [track], get stops() { return stops; } };
};
const harness = (getUserMedia, globals = {}) => {
  const context = vm.createContext({
    exports: {}, DOMException, queueMicrotask, setTimeout, clearTimeout,
    navigator: { mediaDevices: { getUserMedia } }, ...globals,
  });
  vm.runInContext(outputText, context);
  return context.exports;
};

test("React effect replay opens only one system camera request", async () => {
  let calls = 0;
  const stream = fakeStream();
  const { acquireCamera } = harness(async () => { calls += 1; return stream; });
  const first = new AbortController();
  const cancelled = acquireCamera(first.signal);
  first.abort();
  const second = new AbortController();
  const current = acquireCamera(second.signal);
  await assert.rejects(cancelled, { name: "AbortError" });
  const lease = await current;
  assert.equal(calls, 1);
  assert.equal(stream.stops, 0);
  lease.release();
  await Promise.resolve();
  assert.equal(stream.stops, 1);
});

test("switching views while permission is pending shares the request without stopping the new view", async () => {
  let resolvePermission;
  let calls = 0;
  const stream = fakeStream();
  const { acquireCamera } = harness(() => { calls += 1; return new Promise((resolve) => { resolvePermission = resolve; }); });
  const oldView = new AbortController();
  const previous = acquireCamera(oldView.signal);
  await Promise.resolve();
  oldView.abort();
  const nextView = new AbortController();
  const current = acquireCamera(nextView.signal);
  resolvePermission(stream);
  await assert.rejects(previous, { name: "AbortError" });
  const lease = await current;
  assert.equal(calls, 1);
  assert.equal(stream.stops, 0);
  nextView.abort();
  lease.release();
  await Promise.resolve();
  assert.equal(stream.stops, 1);
});

test("closing before permission resolves releases the eventual hardware stream", async () => {
  let resolvePermission;
  const stream = fakeStream();
  const { acquireCamera } = harness(() => new Promise((resolve) => { resolvePermission = resolve; }));
  const view = new AbortController();
  const pending = acquireCamera(view.signal);
  await Promise.resolve();
  view.abort();
  resolvePermission(stream);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(stream.stops, 1);
});

test("camera permission denial does not trigger another permission request", async () => {
  let calls = 0;
  const { acquireCamera } = harness(async () => { calls += 1; throw new DOMException("Denied", "NotAllowedError"); });
  await assert.rejects(acquireCamera(new AbortController().signal), { name: "NotAllowedError" });
  assert.equal(calls, 1);
});

test("only unsupported camera constraints trigger a simpler video-only retry", async () => {
  const requests = [];
  const stream = fakeStream();
  const { acquireCamera } = harness(async (constraints) => {
    requests.push(constraints);
    if (requests.length === 1) throw new DOMException("Unsupported", "OverconstrainedError");
    return stream;
  });
  const lease = await acquireCamera(new AbortController().signal);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].audio, false);
  assert.equal(requests[1].audio, false);
  assert.equal(requests[1].video, true);
  lease.release();
});

test("preview waits for image data and two layout frames before becoming ready", async () => {
  const frames = new Map();
  let nextFrame = 0;
  const { playCameraPreview } = harness(() => {}, {
    requestAnimationFrame: (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const video = new EventTarget();
  Object.assign(video, { readyState: 1, videoWidth: 0, videoHeight: 0, play: async () => {} });
  let ready = false;
  const pending = playCameraPreview(video, fakeStream(), new AbortController().signal).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(frames.size, 0);
  Object.assign(video, { readyState: 2, videoWidth: 640, videoHeight: 480 });
  video.dispatchEvent(new Event("loadeddata"));
  frames.get(1)();
  assert.equal(ready, false);
  frames.get(2)();
  await pending;
  assert.equal(ready, true);
});

test("aborting a preview before its first frame cancels readiness", async () => {
  const { playCameraPreview } = harness(() => {}, { requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const video = new EventTarget();
  Object.assign(video, { readyState: 1, videoWidth: 0, videoHeight: 0, play: async () => {} });
  const controller = new AbortController();
  const pending = playCameraPreview(video, fakeStream(), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
