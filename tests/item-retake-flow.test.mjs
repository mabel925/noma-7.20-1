import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const memorySource = await readFile(new URL("../src/components/MemoryList.tsx", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../src/components/CaptureScanner.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("item retake reuses the add-item scanner instead of the location image flow", () => {
  const retakeStart = memorySource.indexOf("{isItemRetakeOpen && (");
  const retakeEnd = memorySource.indexOf("<MemoryConfirmModal", retakeStart);
  const retakeFlow = memorySource.slice(retakeStart, retakeEnd);

  assert.ok(retakeStart >= 0);
  assert.match(retakeFlow, /<CaptureScanner/);
  assert.doesNotMatch(retakeFlow, /<LocationImageEditFlow/);
  assert.match(retakeFlow, /setItemImageDraft\(stickerUrl\)/);
  assert.match(retakeFlow, /setItemTitle\(name\)/);
  assert.match(retakeFlow, /setSelectedCategory\(category\)/);
});

test("capture layer remains configurable above the item detail modal", () => {
  assert.match(scannerSource, /"--capture-layer": layer/);
  assert.match(cssSource, /z-index: var\(--capture-layer, 20001\) !important/);
  assert.match(memorySource, /layer=\{30020\}/);
});
