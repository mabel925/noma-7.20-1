import assert from "node:assert/strict";
import test from "node:test";
import { createResolvedCaptureResult, isUsableCaptureTitle } from "../src/services/captureResult.js";

test("generic recognition titles can never become completed capture results", () => {
  for (const title of ["", "Scanned Item", "scanned items", "Unknown Object", "Item"]) {
    assert.equal(isUsableCaptureTitle(title), false);
    assert.throws(
      () => createResolvedCaptureResult({ title, category: "家居日用", stickerUrl: "image" }),
      /specific recognition title/,
    );
  }
});

test("a confirmed title, category, and image are delivered as one immutable result", () => {
  const result = createResolvedCaptureResult({
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
