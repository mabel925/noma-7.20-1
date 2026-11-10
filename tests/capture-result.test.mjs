import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureResult } from "../src/services/captureResult.js";

test("a successful recognition and image are committed as one immutable result", () => {
  const result = createCaptureResult({
    title: "  Tea   Bowl ",
    category: "家居日用",
    stickerUrl: "data:image/png;base64,test",
  });
  assert.deepEqual(result, {
    name: "Tea Bowl",
    category: "家居日用",
    stickerUrl: "data:image/png;base64,test",
  });
  assert.equal(Object.isFrozen(result), true);
});

test("recognition failure keeps the existing Scanned Item UX", () => {
  for (const title of ["", "Item", "Unknown Object", "Scanned Item"]) {
    assert.equal(createCaptureResult({ title, category: "", stickerUrl: "photo" }).name, "Scanned Item");
  }
});
