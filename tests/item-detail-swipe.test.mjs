import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const memorySource = await readFile(new URL("../src/components/MemoryList.tsx", import.meta.url), "utf8");
const locationDetailStart = memorySource.indexOf("const LocationDetailModal");
const itemDetailStart = memorySource.indexOf("type MemoryDetailModalProps", locationDetailStart);
const locationDetailSource = memorySource.slice(locationDetailStart, itemDetailStart);

test("location detail exposes one edit action in the upper-right header", () => {
  assert.ok(locationDetailStart >= 0);
  assert.match(locationDetailSource, /<MemoryActionButton\s+label="Edit location"/);
  assert.equal((locationDetailSource.match(/label="Edit location"/g) || []).length, 1);
  assert.doesNotMatch(locationDetailSource, /ml-\[10px\].*aria-label="Edit location"/s);
  assert.match(memorySource, /w-\[36px\] h-\[36px\] rounded-full bg-white/);
});

test("item detail supports thresholded sibling swipes while interaction layers are closed", () => {
  assert.match(memorySource, /siblingItems\?: MemoryItem\[\]/);
  assert.match(memorySource, /onNavigateItem\?: \(item: MemoryItem\) => void/);
  assert.match(memorySource, /drag=\{canSwipeItems \? "x" : false\}/);
  assert.match(memorySource, /Math\.abs\(info\.offset\.x\) >= 56/);
  assert.match(memorySource, /navigateSiblingItem\(info\.offset\.x < 0 \? 1 : -1\)/);
  assert.match(memorySource, /&& !isCardEditing[\s\S]*&& !isItemRetakeOpen[\s\S]*&& !isDeleteConfirmOpen/);
});

test("sibling navigation is scoped to sub-location details and the Memory items tab", () => {
  assert.match(memorySource, /selectedLocationDetail\?\.sourceField === "sub"/);
  assert.match(memorySource, /selectedLocationDetail\.directItems\.some\(\(item\) => item\.id === selectedDetailItem\.id\)/);
  assert.match(memorySource, /selectedDetailSource === "items"/);
  assert.match(memorySource, /activeTab === "items"/);
  assert.match(memorySource, /filteredItems\.some\(\(item\) => item\.id === selectedDetailItem\.id\)/);
  assert.match(memorySource, /openDetail\(item, "items"\)/);
  assert.match(memorySource, /onNavigateItem=\{setSelectedDetailItem\}/);
});

test("switching siblings keeps the overlay mounted and skips repeated flip entrances", () => {
  const overlayRenderStart = memorySource.indexOf("{selectedDetailItem && (");
  const overlayRenderEnd = memorySource.indexOf("</>", overlayRenderStart);
  const overlayRender = memorySource.slice(overlayRenderStart, overlayRenderEnd);

  assert.doesNotMatch(overlayRender, /key=\{selectedDetailItem\.id\}/);
  assert.match(memorySource, /const isSwitchingItem = previousItemIdRef\.current !== item\.id/);
  assert.match(memorySource, /animate=\{\{ rotateY: isSwitchingItem \? 0 : isFlipped \? 180 : 0 \}\}/);
  assert.match(memorySource, /transition=\{isSwitchingItem \? \{ duration: 0 \}/);
  assert.match(memorySource, /React\.useLayoutEffect\(\(\) => \{[\s\S]*setIsFlipped\(false\)[\s\S]*setItemTitle\(item\.name \|\| "Item"\)/);
});

test("sibling navigation transitions whole cards as a horizontal carousel", () => {
  assert.match(memorySource, /<AnimatePresence initial custom=\{itemTransitionDirection\}>/);
  assert.match(memorySource, /key=\{item\.id\}/);
  assert.match(memorySource, /className="absolute inset-0 h-\[534px\] w-\[350px\]"/);
  assert.match(memorySource, /enter: \(direction: number\) => \(\{ x: direction \* 390/);
  assert.match(memorySource, /exit: \(direction: number\) => \(\{[\s\S]*x: direction \* -390/);
  assert.match(memorySource, /setItemTransitionDirection\(direction\)/);
});

test("carousel price tags do not share SVG clip-path identifiers", () => {
  const priceTagStart = memorySource.indexOf("export const PriceTag");
  const priceTagEnd = memorySource.indexOf("const ItemSticker", priceTagStart);
  const priceTagSource = memorySource.slice(priceTagStart, priceTagEnd);

  assert.doesNotMatch(priceTagSource, /clipPath=/);
  assert.doesNotMatch(priceTagSource, /<clipPath/);
  assert.match(priceTagSource, /d="M19\.0738 0H14\.2594/);
});
