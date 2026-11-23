import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const service = await readFile(new URL("../src/services/aiService.ts", import.meta.url), "utf8");
const scanner = await readFile(new URL("../src/components/CaptureScanner.tsx", import.meta.url), "utf8");
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const parsed = ts.createSourceFile("aiService.ts", service, ts.ScriptTarget.Latest, true);
const requestFunction = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "callNomaBackend");
assert.ok(requestFunction);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function requestHarness(auth, fetch) {
  const timers = new Set();
  let published = 0;
  const context = vm.createContext({
    exports: {}, AbortController, console: { log() {} },
    NOMA_BACKEND_URL: "https://example.invalid/ai", AI_REQUEST_TIMEOUT_MS: 18000,
    getRequestOrigin: () => "test", getClientBuildId: () => "test",
    getAiRequestAuth: auth, fetch, AiAccessError: class extends Error {},
    publishAiAccess() { published++; },
    window: {
      setTimeout(fn) { timers.add(fn); return fn; },
      clearTimeout(fn) { timers.delete(fn); },
    },
  });
  vm.runInContext(compile(requestFunction.getText(parsed)), context);
  return { send: context.exports.callNomaBackend, timers, published: () => published };
}

test("closing while authentication is pending prevents the AI request", async () => {
  const pendingAuth = deferred();
  const session = new AbortController();
  let requests = 0;
  const h = requestHarness(() => pendingAuth.promise, () => { requests++; });
  const request = h.send("process-image", {}, "scan", session.signal);
  session.abort();
  pendingAuth.resolve({ userId: "user", headers: {} });
  await assert.rejects(request, (error) => error === session.signal.reason);
  assert.equal(requests, 0);
  assert.equal(h.published(), 0);
  assert.equal(h.timers.size, 0);
});

for (const phase of ["fetch", "response body"]) {
  test(`closing during ${phase} aborts the request without reporting a timeout`, async () => {
    const started = deferred();
    const session = new AbortController();
    let outgoingSignal;
    const h = requestHarness(async () => ({ userId: "user", headers: {} }), (_url, options) => {
      outgoingSignal = options.signal;
      const pending = () => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        started.resolve();
      });
      return phase === "fetch" ? pending() : Promise.resolve({ ok: true, text: pending });
    });
    const request = h.send("process-image", {}, "scan", session.signal);
    await started.promise;
    session.abort();
    await assert.rejects(request, (error) => error === session.signal.reason);
    assert.equal(outgoingSignal.aborted, true);
    assert.equal(h.published(), 0);
    assert.equal(h.timers.size, 0);
  });
}

test("a result arriving after cancellation cannot change the title or open the result page", async () => {
  const start = scanner.indexOf("  const runCombinedImagePipeline =");
  const end = scanner.indexOf("\n  };", start) + "\n  };".length;
  assert.ok(start >= 0 && end > start);
  const pendingResult = deferred();
  const session = new AbortController();
  const unexpected = () => { throw new Error("cancelled capture must not commit a result or fallback"); };
  const context = vm.createContext({
    exports: {}, captureSessionRef: { current: session }, isChinese: false, setAiProgress() {},
    applyRecognitionResult: unexpected, setResolvedCaptureResult: unexpected,
    completeWithPhotoThumbnail: unexpected, completeWithTransparentCutout: unexpected,
    reportAiAccessError: unexpected,
  });
  vm.runInContext(compile(`${scanner.slice(start, end)}\nexports.run = runCombinedImagePipeline;`), context);
  const task = context.exports.run("photo", "preview", 500, 500, "scan", pendingResult.promise);
  session.abort();
  pendingResult.resolve({ recognition: { title: "Mug" }, cutoutDataUrl: "cutout" });
  await task;
});
