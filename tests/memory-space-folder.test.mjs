import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const memorySource = await readFile(new URL("../src/components/MemoryList.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("space cards keep the three most recent item previews inside a clipped composition", () => {
  assert.match(memorySource, /const getRecentSpaceItems = \(items: MemoryItem\[\], limit = 3\)/);
  assert.match(memorySource, /Date\.parse\(item\.createdAt \|\| ""\)/);
  assert.match(memorySource, /\.slice\(0, limit\)/);
  assert.match(memorySource, /recentItems\.map\(\(item, index\)/);
  assert.match(memorySource, /-translate-x-\[6px\] -translate-y-\[6px\][\s\S]*<MemorySearchItem item=\{item\} size=\{112\} tilted=\{false\} \/>/);
  assert.match(memorySource, /memory-space-item-previews/);
  assert.match(cssSource, /clip-path: inset\(0 -8px 0 -8px\)/);
});

test("space folder uses the Figma shape and pins the location image with the provided 3x asset", async () => {
  await access(new URL("../public/assets/memory-pin@3x.png", import.meta.url));
  const folderSource = await readFile(new URL("../public/assets/memory-folder.svg", import.meta.url), "utf8");
  assert.match(folderSource, /width="162" height="161"/);
  assert.match(memorySource, /src="\/assets\/memory-folder\.svg"/);
  assert.match(memorySource, /left-\[7px\] top-\[19px\].*h-\[161px\] w-\[162px\]/);
  assert.match(memorySource, /src="\/assets\/memory-pin@3x\.png"/);
  assert.match(memorySource, /left-\[122px\] top-\[54px\].*h-\[30px\] w-\[30px\]/);
  assert.match(memorySource, /left-\[99px\] top-\[62px\].*h-\[66px\] w-\[66px\]/);
  assert.match(memorySource, /memory-space-folder-frost.*left-\[7px\] top-\[62px\].*h-\[118px\] w-\[162px\]/);
});

test("sub-location thumbnails are circular, capped, and use stable emoji colors", () => {
  for (const color of ["#AFE9E3", "#FAA9D2", "#FFBA7B", "#E6BAFF"]) {
    assert.ok(memorySource.includes(color));
  }
  assert.match(memorySource, /space\.subLocations\.slice\(0, 4\)/);
  assert.match(memorySource, /remainingSubLocations/);
  assert.match(memorySource, /mr-\[-7\.5px\].*h-\[30px\] w-\[30px\].*border-\[2\.5px\] border-white/);
  assert.match(memorySource, /zIndex: index \+ 1/);
  assert.match(memorySource, /stableColorForLocation\(`\$\{subLocation\.parentName\}:\$\{subLocation\.name\}`\)/);
});

test("spaces render as one vertical shelf list in their original order", () => {
  assert.match(memorySource, /spacesList\.map\(\(space, index\) => \([\s\S]*<MemorySpaceShelfCard key=\{space\.key\}/);
  assert.doesNotMatch(memorySource, /<MemorySpaceFolderCard key=\{space\.key\}/);
  assert.match(cssSource, /\.memory-space-shelf-list \{[^}]*flex-direction: column; gap: 32px/);
});

test("long space names clamp to two lines while item counts remain complete", () => {
  assert.match(memorySource, /memory-space-folder-name min-w-0/);
  assert.match(memorySource, /shrink-0 whitespace-nowrap[\s\S]*\(\{space\.itemCount\}\)/);
  assert.match(cssSource, /\.memory-space-folder-name \{[^}]*max-height: 34px[^}]*overflow-wrap: anywhere[^}]*-webkit-line-clamp: 2/);
});
