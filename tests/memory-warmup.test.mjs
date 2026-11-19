import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const warmupSource = await readFile(new URL("../src/services/memoryWarmup.ts", import.meta.url), "utf8");
const snapshotsSource = await readFile(new URL("../src/services/memorySnapshots.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const snapshots = vm.createContext({ exports: {} });
vm.runInContext(compile(snapshotsSource), snapshots);
const { memoryChanges, applyMemoryChanges, reconcileSavedMemories } = snapshots.exports;
const ids = (items) => Array.from(items, (item) => item.id);

test("queued edits cannot delete a background page that was not in their original snapshot", () => {
  const first = { id: "first", name: "Mug", version: 1 };
  const edited = { ...first, name: "Red mug" };
  const nextPage = { id: "next-page", name: "Keys" };
  const intent = memoryChanges([first], [edited]);
  const rebased = applyMemoryChanges([first, nextPage], intent);
  assert.deepEqual(ids(rebased), ["first", "next-page"]);
  assert.equal(rebased[0].name, "Red mug");
  assert.equal(intent.removed.size, 0);
});

test("queued saves use the latest server version while preserving explicit deletion intent", () => {
  const first = { id: "first", name: "Mug", version: 1 };
  const second = { id: "second", name: "Keys" };
  const third = { id: "third", name: "Lamp" };
  const secondEdit = { ...first, name: "Blue mug" };
  const changes = memoryChanges([first, second], [secondEdit]);
  const savedFirst = { ...first, version: 2 };
  const next = applyMemoryChanges([savedFirst, second, third], changes);
  assert.deepEqual(ids(next), ["first", "third"]);
  assert.equal(changes.removed.has("second"), true);
  assert.equal(next[0], secondEdit);
});

test("a save response preserves newer edits, deleted items and newly downloaded pages", () => {
  const submitted = { id: "first", name: "Mug", stickerUrl: "blob:local" };
  const saved = { ...submitted, version: 2, stickerUrl: "/api/media/object/new?v=2" };
  const newer = { ...submitted, name: "Blue mug" };
  const page = { id: "page" };
  const result = reconcileSavedMemories([newer, page], [submitted], [saved]);
  assert.equal(result[0], newer);
  assert.equal(result[1], page);
  assert.equal(reconcileSavedMemories([], [submitted], [saved]).length, 0);
  assert.equal(reconcileSavedMemories([submitted, page], [submitted], [saved])[0], saved);
  assert.equal(reconcileSavedMemories(result, [submitted], [saved]), result, "unchanged snapshots retain identity");
});

function pageHarness(initialItems) {
  const calls = [], pages = [], state = {};
  const session = { ownerId: "alice", cursor: { id: "cursor-1", updatedAt: "now" }, seen: new Set(initialItems.map((item) => item.id)), active: true, pending: null };
  const refs = {
    userRef: { current: { id: "alice", isMock: false } },
    memoryReadSessionRef: { current: session }, memorySyncQueueRef: { current: Promise.resolve() },
    customMemoriesRef: { current: initialItems }, memorySnapshotRef: { current: initialItems },
    persistedMemorySnapshotsRef: { current: new Map([["alice", initialItems]]) },
  };
  const context = vm.createContext({ exports: {}, ...refs, Set, Map, console,
    React: { useCallback: (fn) => fn },
    memoryStorage: { listItemsPage: (owner, cursor) => {
      calls.push({ owner, cursor });
      return new Promise((resolve, reject) => pages.push({ resolve, reject }));
    } },
    setIsLoadingMoreMemories: (value) => { state.loading = value; },
    setCustomMemories: (value) => { state.items = value; },
    setMemoryNextCursor: (value) => { state.cursor = value; },
    setHasMoreMemories: (value) => { state.hasMore = value; },
  });
  const start = appSource.indexOf("  const loadMoreMemories = React.useCallback");
  const end = appSource.indexOf("\n  useEffect(() => {", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(compile(`${appSource.slice(start, end)}\nexports.load = loadMoreMemories;`), context);
  return { load: context.exports.load, calls, pages, session, refs, state };
}

test("manual and background pagination share one read and stop after the last page", async () => {
  const first = { id: "first" }, second = { id: "second" };
  const h = pageHarness([first]);
  const auto = h.load(), manual = h.load();
  assert.equal(auto, manual);
  await new Promise(setImmediate);
  assert.equal(h.calls.length, 1);
  h.pages[0].resolve({ items: [first, second], nextCursor: null, hasMore: false });
  await auto;
  assert.deepEqual(ids(h.state.items), ["first", "second"]);
  assert.equal(h.state.hasMore, false);
  assert.equal(h.state.loading, false);
  await h.load();
  assert.equal(h.calls.length, 1);
});

test("a late page cannot resurrect a deleted item or overwrite an edit made while it was loading", async () => {
  const first = { id: "first", name: "Mug" }, removed = { id: "removed" }, added = { id: "new-page" };
  const edited = { ...first, name: "Blue mug" };
  const h = pageHarness([first, removed]);
  const request = h.load(); await new Promise(setImmediate);
  h.refs.customMemoriesRef.current = [edited];
  h.refs.memorySnapshotRef.current = [edited];
  h.refs.persistedMemorySnapshotsRef.current.set("alice", [edited]);
  h.pages[0].resolve({ items: [first, removed, added], nextCursor: null, hasMore: false });
  await request;
  assert.deepEqual(ids(h.state.items), ["first", "new-page"]);
  assert.equal(h.state.items[0], edited);
  assert.deepEqual(ids(h.refs.persistedMemorySnapshotsRef.current.get("alice")), ["first", "new-page"]);
});

test("signing out during pagination prevents the old response from entering the next account", async () => {
  const h = pageHarness([{ id: "alice-item" }]);
  const request = h.load(); await new Promise(setImmediate);
  h.session.active = false;
  h.refs.userRef.current = { id: "bob" };
  h.refs.customMemoriesRef.current = [{ id: "bob-item" }];
  h.pages[0].resolve({ items: [{ id: "old-account-page" }], nextCursor: null, hasMore: false });
  await request;
  assert.deepEqual(ids(h.refs.customMemoriesRef.current), ["bob-item"]);
  assert.equal(h.state.items, undefined);
});

test("pagination merges only after a concurrent save has finished", async () => {
  const h = pageHarness([{ id: "one" }]);
  const request = h.load(); await new Promise(setImmediate);
  let finishSave;
  h.refs.memorySyncQueueRef.current = new Promise((resolve) => { finishSave = resolve; });
  h.pages[0].resolve({ items: [{ id: "two" }], nextCursor: null, hasMore: false });
  await new Promise(setImmediate);
  assert.equal(h.state.items, undefined);
  finishSave(); await request;
  assert.deepEqual(ids(h.state.items), ["one", "two"]);
});

test("queued writes rebase onto pages loaded during an earlier save instead of deleting them", async () => {
  const first = { id: "one", name: "Mug", version: 1 };
  const editA = { ...first, name: "Red mug" }, editB = { ...first, name: "Blue mug" };
  const savedA = { ...editA, version: 2 }, savedB = { ...editB, version: 3 };
  const page = { id: "background-page", name: "Keys" };
  const baseline = new Map([["alice", [first]]]);
  const calls = [], pending = [];
  const session = { active: true };
  const context = vm.createContext({ exports: {}, Map, React: { useCallback: (fn) => fn },
    memoryChanges, applyMemoryChanges, memoryReadSessionRef: { current: session },
    memorySyncQueueRef: { current: Promise.resolve() }, persistedMemorySnapshotsRef: { current: baseline },
    memoryStorage: { syncItems: (owner, previous, next) => {
      calls.push({ owner, previous, next });
      return new Promise((resolve) => pending.push(resolve));
    } },
  });
  const start = appSource.indexOf("  const enqueueMemorySync = React.useCallback");
  const end = appSource.indexOf("\n  // Only hydrate", start);
  vm.runInContext(compile(`${appSource.slice(start, end)}\nexports.enqueue = enqueueMemorySync;`), context);
  const firstSave = context.exports.enqueue("alice", [first], [editA]);
  await new Promise(setImmediate);
  baseline.set("alice", [first, page]);
  const secondSave = context.exports.enqueue("alice", [editA], [editB]);
  pending[0]([savedA]); await firstSave; await new Promise(setImmediate);
  assert.deepEqual(ids(calls[1].previous), ["one", "background-page"]);
  assert.equal(calls[1].previous[0].version, 2);
  assert.deepEqual(ids(calls[1].next), ["one", "background-page"]);
  assert.equal(calls[1].next[0].name, "Blue mug");
  pending[1]([savedB, page]); await secondSave;
  assert.equal(baseline.get("alice")[0].version, 3);
  assert.equal(baseline.get("alice")[1], page);
  session.active = false;
  await context.exports.enqueue("alice", [savedB], []);
  assert.equal(calls.length, 2, "queued work from a signed-out session cannot start another write");
});

function warmupHarness() {
  const scheduled = new Map(), reads = [], pending = [];
  const cached = new Set();
  let timerId = 0, allowed = true;
  const context = vm.createContext({ exports: {}, Set, setTimeout: (callback) => {
    const id = ++timerId; scheduled.set(id, callback); return id;
  }, clearTimeout: (id) => scheduled.delete(id), require: (name) => name.includes("emojiCatalog") ? {
    emojiAsset: (key) => `/emoji/${key}.png`, refreshEmojiAssetUrl: (src) => src,
    classifyEmojiLocally: (_name, kind) => ({ icon_key: kind === "parent-space" ? "home" : "box" }),
  } : {
    getCachedImageResource: (src) => cached.has(src),
    getImageResource: (src, priority) => {
      reads.push({ src, priority });
      return new Promise((resolve, reject) => pending.push({ src, resolve: () => { cached.add(src); resolve(); }, reject }));
    },
  } });
  vm.runInContext(compile(warmupSource), context);
  const warmup = context.exports.createMemoryImageWarmup(() => allowed);
  const flush = () => { for (const [id, callback] of [...scheduled]) { scheduled.delete(id); callback(); } };
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { warmup, reads, pending, flush, settle, cached, sources: context.exports.memoryImageSources, allow: (value) => { allowed = value; } };
}

test("account warmup reads at most two images, deduplicates spaces and reuses ready resources", async () => {
  const h = warmupHarness();
  h.cached.add("cached");
  h.warmup.add(["one", "space", "space", "three", "cached"]);
  h.flush();
  assert.deepEqual(h.reads, [{ src: "one", priority: "low" }, { src: "space", priority: "low" }]);
  h.warmup.add(["one", "space"]);
  h.pending[0].resolve(); await h.settle(); h.flush();
  assert.equal(h.reads.length, 3);
  assert.equal(h.reads[2].src, "three");
  h.pending[1].resolve(); h.pending[2].resolve(); await h.settle(); h.flush();
  assert.equal(h.reads.length, 3);
});

test("capture/hidden state pauses new reads, resumes later, and account cleanup stops the old queue", async () => {
  const h = warmupHarness();
  h.allow(false);
  h.warmup.add(["one", "two", "three", "four"]); h.flush();
  assert.equal(h.reads.length, 0);
  h.allow(true); h.warmup.resume(); h.flush();
  assert.equal(h.reads.length, 2);
  h.allow(false); h.pending[0].resolve(); await h.settle(); h.flush();
  assert.equal(h.reads.length, 2);
  h.allow(true); h.warmup.resume(); h.flush();
  assert.equal(h.reads.length, 3);
  h.warmup.stop(); h.pending[1].resolve(); h.pending[2].resolve(); await h.settle(); h.flush();
  assert.equal(h.reads.length, 3, "old account must not start its last queued image");
});

test("a failed background read does not loop or block remaining resources and can retry on reconnect", async () => {
  const h = warmupHarness();
  h.warmup.add(["failed", "two", "three"]); h.flush();
  h.pending[0].reject(new Error("offline")); await h.settle(); h.flush();
  assert.equal(h.reads.length, 3);
  h.pending[1].resolve(); h.pending[2].resolve(); await h.settle(); h.flush();
  assert.equal(h.reads.length, 3);
  h.warmup.add(["failed"]); h.flush();
  assert.equal(h.reads.length, 4);
  h.pending[3].resolve(); await h.settle();
});

test("warmup includes item stickers, shared space photos and emoji fallbacks exactly once", () => {
  const h = warmupHarness();
  const sources = h.sources([
    { id: "one", stickerUrl: "sticker", parentLocationName: "Room", parentLocationImg: "room", subLocationName: "Drawer", subLocationImg: "drawer" },
    { id: "two", emoji: "cup", parentLocationName: "Room", parentLocationImg: "room", subLocationName: "Box" },
  ]);
  assert.deepEqual(Array.from(sources), ["sticker", "room", "drawer", "/emoji/cup.png", "/emoji/box.png"]);
});
