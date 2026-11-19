import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/chatSearch.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const item = (id, name, subLocationName = "Drawer") => ({ id, name, parentLocationName: "Room", subLocationName, parentLocationImg: "/shared-space.webp" });
function harness() {
  const calls = [];
  const context = vm.createContext({ exports: {}, require: () => ({ memoryStorage: { searchItems: async (owner, term) => {
    calls.push({ owner, term }); return [item("one", "Mug"), item("two", "Cup", "Cabinet")];
  } } }) });
  vm.runInContext(outputText, context);
  return { search: context.exports.searchChatMemory, calls };
}

test("a complete loaded inventory answers item and space queries without another data request", async () => {
  const h = harness();
  const loadedItems = [item("one", "Mug"), item("two", "Cup", "Cabinet")];
  const options = { ownerId: "alice", isMock: false, allItemsLoaded: true, loadedItems };
  const items = await h.search({ ...options, query: "Find my mug" });
  assert.equal(items.kind, "items"); assert.equal(items.items[0], loadedItems[0]);
  const spaces = await h.search({ ...options, query: "What is in Room" });
  assert.equal(spaces.kind, "spaces"); assert.equal(spaces.spaces[0].itemCount, 2);
  assert.equal(spaces.spaces[0].imageUrl, "/shared-space.webp");
  assert.equal(h.calls.length, 0);
  assert.equal((await h.search({ ...options, query: "missing" })).kind, "empty");
  assert.equal(h.calls.length, 0);
});

test("a partial inventory still searches the server so unloaded items and counts are not lost", async () => {
  const h = harness();
  const result = await h.search({ ownerId: "alice", isMock: false, allItemsLoaded: false, loadedItems: [item("one", "Mug")], query: "What is in Room" });
  assert.equal(h.calls.length, 1);
  assert.equal(result.kind, "spaces"); assert.equal(result.spaces[0].itemCount, 2);
});

test("local searches use the latest edited and deleted inventory rather than a stale result cache", async () => {
  const h = harness();
  const options = { ownerId: "alice", isMock: false, allItemsLoaded: true, query: "Mug" };
  assert.equal((await h.search({ ...options, loadedItems: [item("one", "Mug")] })).kind, "items");
  assert.equal((await h.search({ ...options, loadedItems: [item("one", "Bottle")] })).kind, "empty");
  assert.equal((await h.search({ ...options, loadedItems: [] })).kind, "empty");
  assert.equal(h.calls.length, 0);
});
