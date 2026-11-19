import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const item = (id, name = "Mug") => ({ id, name, version: 3, ownerId: "alice" });

const chatSource = await readFile(new URL("../src/components/ChatFlow.tsx", import.meta.url), "utf8");
const chatCode = ts.transpileModule(`${chatSource}\nexports.TestSpaceCard = ChatSpaceCard;`, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;

function spaceCardHarness() {
  const calls = { item: 0, space: 0 };
  const found = item("mug");
  const context = vm.createContext({ exports: {}, require: (name) => name === "react" ? React
    : name.endsWith("emojiCatalog") ? { emojiAsset: (key) => `/emoji/${key}.png`, classifyEmojiLocally: () => ({ icon_key: "box" }) }
    : name.endsWith("ItemStickerVisual") ? { ItemStickerVisual: () => null }
    : name.endsWith("PersistentImage") ? { PersistentImage: () => null } : {} });
  vm.runInContext(chatCode, context);
  const tree = context.exports.TestSpaceCard({ space: {
    id: "room-drawer", kind: "child", name: "Drawer", parentName: "Room", itemCount: 1, items: [found], subSpaces: [],
  }, onClick: () => { calls.space += 1; }, onItemClick: (selected) => {
    assert.equal(selected, found); calls.item += 1;
  } });
  const buttons = [];
  function visit(node, ancestors = []) {
    if (!React.isValidElement(node)) return;
    if (typeof node.type === "function") { visit(node.type(node.props), ancestors); return; }
    if (node.type === "button") {
      assert.equal(ancestors.some((ancestor) => ancestor.type === "button"), false, "preview controls cannot be nested inside a space button");
      buttons.push({ node, ancestors });
    }
    React.Children.forEach(node.props.children, (child) => visit(child, [...ancestors, node]));
  }
  visit(tree);
  const click = (label) => {
    const target = buttons.find(({ node }) => node.props["aria-label"] === label);
    assert.ok(target, `missing accessible button: ${label}`);
    let stopped = false;
    const event = { stopPropagation: () => { stopped = true; } };
    target.node.props.onClick?.(event);
    for (const ancestor of [...target.ancestors].reverse()) {
      if (stopped) break;
      ancestor.props.onClick?.(event);
    }
  };
  return { calls, click };
}

test("an item preview inside a Chat space opens only the item overlay without opening the space", () => {
  const h = spaceCardHarness();
  h.click("Open Mug");
  assert.deepEqual(h.calls, { item: 1, space: 0 });
});

test("the space card itself still opens the space exactly once", () => {
  const h = spaceCardHarness();
  h.click("Open Drawer");
  assert.deepEqual(h.calls, { item: 0, space: 1 });
});

function harness(items) {
  const state = { items, detail: null, messages: [{ id: "result", items }], loginRequests: 0, navigations: 0 };
  const refs = {
    userRef: { current: { id: "alice" } }, customMemoriesRef: { current: items },
    memorySnapshotRef: { current: items }, persistedMemorySnapshotsRef: { current: new Map([["alice", items]]) },
    memoryReadSessionRef: { current: { seen: new Set(items.map((item) => item.id)) } },
    chatResultContextRef: { current: { items } },
  };
  const context = vm.createContext({ exports: {}, ...refs, chatDetailItem: null,
    setChatDetailItem(value) { state.detail = value; context.chatDetailItem = value; },
    setCustomMemories(value) { state.items = typeof value === "function" ? value(state.items) : value; },
    setMessages(update) { state.messages = update(state.messages); },
    requireAuth() { state.loginRequests += 1; }, openMemory() { state.navigations += 1; },
  });
  const start = source.indexOf("  const openChatItemDetail =");
  const end = source.indexOf("  // Quick preset keyword taps", start);
  vm.runInContext(compile(`${source.slice(start, end)}\nexports.open = openChatItemDetail; exports.update = updateChatDetailItem;`), context);
  return { ...context.exports, state, refs };
}

test("opening an item from Chat uses the latest item without navigating to Memory", () => {
  const latest = item("mug", "Blue mug");
  const h = harness([latest]);
  h.open(item("mug", "Old title"));
  assert.equal(h.state.detail, latest);
  assert.equal(h.state.navigations, 0);
  assert.equal(h.state.messages[0].items[0], latest);
});

test("a search item from an unloaded page is adopted as a saved baseline with its version", () => {
  const h = harness([item("one")]);
  const found = item("unloaded", "Keys");
  h.open(found);
  assert.equal(h.state.detail, found);
  assert.equal(h.refs.persistedMemorySnapshotsRef.current.get("alice")[1], found);
  assert.equal(h.refs.memorySnapshotRef.current[1], found);
  assert.equal(h.refs.memoryReadSessionRef.current.seen.has(found.id), true);
  assert.equal(h.state.navigations, 0);
});

test("editing and deleting the Chat overlay updates shared items and its visible result", () => {
  const mug = item("mug"), other = item("other", "Keys");
  const h = harness([mug, other]);
  h.open(mug); h.update({ name: "Red mug" });
  assert.equal(h.state.items[0].name, "Red mug");
  assert.equal(h.state.messages[0].items[0].name, "Red mug");
  assert.equal(h.refs.chatResultContextRef.current.items[0].name, "Red mug");
  h.update(null);
  assert.equal(h.state.detail, null);
  assert.deepEqual(h.state.items.map((item) => item.id), ["other"]);
  assert.equal(h.state.messages[0].items[0], other);
  assert.equal(h.state.navigations, 0);
});

test("edits and deletes also refresh space previews so a deleted item cannot be reopened there", () => {
  const mug = { ...item("mug"), parentLocationName: "Room", subLocationName: "Drawer" };
  const h = harness([mug]);
  const spaces = [{ id: "drawer", kind: "child", name: "Drawer", parentName: "Room", itemCount: 1, items: [mug], subSpaces: [] }];
  h.state.messages = [{ id: "space-result", spaces }];
  h.refs.chatResultContextRef.current.spaces = spaces;
  h.open(mug); h.update({ name: "Red mug" });
  assert.equal(h.state.messages[0].spaces[0].items[0].name, "Red mug");
  h.update(null);
  assert.equal(h.state.messages[0].spaces[0].items.length, 0);
  assert.equal(h.state.messages[0].spaces[0].itemCount, 0);
  assert.equal(h.refs.chatResultContextRef.current.spaces[0].items.length, 0);
  assert.equal(h.state.navigations, 0);
});

test("signed-out and other-account results cannot open an item overlay", () => {
  const h = harness([]);
  h.open({ ...item("other"), ownerId: "bob" });
  assert.equal(h.state.detail, null);
  h.refs.userRef.current = null;
  h.open(item("mug"));
  assert.equal(h.state.loginRequests, 1);
  assert.equal(h.state.detail, null);
});

test("adding an item supplies both snapshots to the queued save", async () => {
  const previous = [item("old")];
  const added = item("new", "Lamp");
  let received;
  const context = vm.createContext({ exports: {}, userRef: { current: { id: "alice", isMock: false } },
    customMemoriesRef: { current: previous }, memorySnapshotRef: { current: previous },
    persistedMemorySnapshotsRef: { current: new Map([["alice", previous]]) },
    memoryStorage: { createItem: () => added },
    enqueueMemorySync: async (...args) => { received = args; return args[2]; },
    setCustomMemories() {}, setToast() {}, setTimeout() {},
  });
  const start = source.indexOf("  const handleItemAdded = async");
  const end = source.indexOf("\n  return (\n    <div", start);
  vm.runInContext(compile(`${source.slice(start, end)}\nexports.add = handleItemAdded;`), context);
  await context.exports.add({ name: "Lamp" });
  assert.equal(received.length, 3);
  assert.equal(received[1], previous);
  assert.equal(received[2][0], added);
  assert.equal(received[2][1], previous[0]);
});
