import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureResult } from "../src/services/captureResult.js";

test("a successful recognition and image are committed as one immutable result", () => {
  const result = createCaptureResult({
    title: "  Tea   Bowl ",
    category: "家居日用",
    stickerUrl: "data:image/png;base64,test",
    labels: ["bowl", "ceramic"],
    attributes: { colors: ["blue"], materials: ["ceramic"], features: [], brand: "" },
  });
  assert.deepEqual(result, {
    name: "Tea Bowl",
    category: "家居日用",
    stickerUrl: "data:image/png;base64,test",
    labels: ["bowl", "ceramic"],
    attributes: { colors: ["blue"], materials: ["ceramic"], features: [], brand: "" },
  });
  assert.equal(Object.isFrozen(result), true);
});

test("recognition failure keeps the existing Scanned Item UX", () => {
  for (const title of ["", "Item", "Unknown Object", "Scanned Item"]) {
    assert.equal(createCaptureResult({ title, category: "", stickerUrl: "photo" }).name, "Scanned Item");
  }
});

test("recognition metadata is bounded and defaults to empty collections", () => {
  const result = createCaptureResult({
    title: "Mug",
    category: "家居日用",
    labels: Array.from({ length: 12 }, (_, index) => `tag-${index}`),
  });
  assert.equal(result.labels.length, 8);
  assert.deepEqual(result.attributes, {});
});
