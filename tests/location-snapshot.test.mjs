import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/locationSnapshot.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const context = vm.createContext({ exports: {} });
vm.runInContext(outputText, context);
const { reconcileLocationSnapshot } = context.exports;

const item = (id, sub = "storage spot", parent = "Room") => ({
  id, name: id, parentLocationName: parent, subLocationName: sub, parentLocationImg: "room.webp", subLocationImg: "spot.webp",
});
const first = item("first");
const second = item("second");
const direct = item("direct", "");
const parent = {
  name: "Room", parentName: "Room", sourceField: "parent", imgUrl: "room.webp", itemCount: 3,
  items: [first, second, direct], directItems: [direct],
  subLocations: [{ name: "storage spot", parentName: "Room", imgUrl: "spot.webp", parentImgUrl: "room.webp", itemCount: 2, items: [first, second] }],
};
const child = { ...parent, name: "storage spot", sourceField: "sub", itemCount: 2, imgUrl: "spot.webp", items: [first, second], directItems: [first, second], subLocations: [] };

test("deleting in a child refreshes the child and the saved parent including child cards", () => {
  const before = [first, second, direct];
  const after = [second, direct];
  const updatedChild = reconcileLocationSnapshot(child, before, after);
  const updatedParent = reconcileLocationSnapshot(parent, before, after);
  assert.equal(updatedChild.itemCount, 1);
  assert.deepEqual(Array.from(updatedChild.items, (i) => i.id), ["second"]);
  assert.equal(updatedParent.itemCount, 2);
  assert.equal(updatedParent.subLocations[0].itemCount, 1);
  assert.deepEqual(Array.from(updatedParent.subLocations[0].items, (i) => i.id), ["second"]);
  assert.equal(parent.itemCount, 3, "saved snapshots must not be mutated");
});

test("deleting the last child item keeps the open empty location and its photo", () => {
  const updated = reconcileLocationSnapshot(child, [first, second], []);
  assert.equal(updated.itemCount, 0);
  assert.equal(updated.imgUrl, "spot.webp");
});

test("items from other search pages are preserved while known deletions are removed", () => {
  const updated = reconcileLocationSnapshot(child, [first], []);
  assert.deepEqual(Array.from(updated.items, (i) => i.id), ["second"]);
  assert.equal(updated.itemCount, 1);
});

test("moving an item removes it from the old location and updates images and contents", () => {
  const moved = { ...first, subLocationName: "drawer" };
  const renamed = { ...second, name: "New title", subLocationImg: "new-spot.webp" };
  const updated = reconcileLocationSnapshot(child, [first, second], [moved, renamed]);
  assert.equal(updated.items.length, 1);
  assert.equal(updated.items[0].name, "New title");
  assert.equal(updated.imgUrl, "new-spot.webp");
});

test("adding an item updates an already-open location without duplicating it", () => {
  const added = item("added");
  const updated = reconcileLocationSnapshot(child, [first, second], [first, second, added]);
  assert.equal(updated.itemCount, 3);
  assert.equal(updated.items.length, 3);
});
