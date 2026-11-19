import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/imageResources.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/components/PersistentImage.tsx", import.meta.url), "utf8");
const compile = (text) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const src = (name, version = "1", owner = "alice") => `/api/media/object/users/${owner}/items/${name}/sticker.webp?v=${version}`;

function harness() {
  const reads = [], revoked = [], images = [];
  let read = async () => new Blob(["image bytes"]);
  let failImage = false;
  class FakeImage {
    naturalWidth = 100;
    naturalHeight = 100;
    complete = false;
    set src(value) {
      this.value = value;
      if (!value) return;
      images.push(this);
      queueMicrotask(() => { if (failImage) this.onerror?.(); else { this.complete = true; this.onload?.(); } });
    }
  }
  class FakeURL extends URL {
    static createObjectURL() { return `blob:test-${images.length}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const context = vm.createContext({ exports: {}, URL: FakeURL, Image: FakeImage, Event,
    window: { location: { origin: "https://noma.test" }, setTimeout, clearTimeout },
    require: () => ({ mediaStorage: { readImage: (url) => { reads.push(url); return read(url); } } }),
  });
  vm.runInContext(compile(source), context);
  const api = context.exports;
  api.setImageResourceOwner("alice");
  return { api, reads, revoked, images, setRead: (fn) => { read = fn; }, fail: (value) => { failImage = value; } };
}

test("Memory, Chat and a location picker share one request and the exact drawable resource", async () => {
  const h = harness();
  const release = h.api.retainImageResource(src("mug"));
  const requests = [h.api.getImageResource(src("mug")), h.api.getImageResource(src("mug")), h.api.getImageResource(src("mug"))];
  assert.equal(requests[0], requests[1]);
  const [first, second, third] = await Promise.all(requests);
  assert.equal(first, second); assert.equal(second, third);
  release();
  assert.equal(await h.api.getImageResource(src("mug")), first, "unmounting does not discard the cache");
  assert.equal(h.reads.length, 1); assert.equal(h.images.length, 1);
  assert.equal(h.revoked.length, 0);
});

test("a new media version loads a new image; a shared immutable space path reuses its image", async () => {
  const h = harness();
  const old = await h.api.getImageResource(src("mug"));
  const next = await h.api.getImageResource(src("mug", "2"));
  assert.notEqual(old, next);
  const space = "/api/media/object/users/alice/spaces/content-hash.webp";
  assert.equal(await h.api.getImageResource(space), await h.api.getImageResource(space));
  assert.equal(h.reads.length, 3);
});

test("failures are not cached and a later read can recover", async () => {
  const h = harness();
  h.fail(true);
  await assert.rejects(h.api.getImageResource(src("mug")), /could not be loaded/);
  assert.equal(h.api.getCachedImageResource(src("mug")), undefined);
  assert.equal(h.revoked.length, 1);
  h.fail(false);
  await h.api.getImageResource(src("mug"));
  assert.equal(h.reads.length, 2);
});

test("logout and account switch discard blobs and reject an old in-flight account response", async () => {
  const h = harness();
  await h.api.getImageResource(src("old"));
  let resolveRead;
  h.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
  const pending = h.api.getImageResource(src("pending"));
  h.api.setImageResourceOwner("bob");
  resolveRead(new Blob(["late image"]));
  await assert.rejects(pending, /account changed/);
  assert.equal(h.api.getCachedImageResource(src("old")), undefined);
  assert.equal(h.api.getCachedImageResource(src("pending")), undefined);
  await assert.rejects(h.api.getImageResource(src("old")), /outside the current account/);
  assert.equal(h.revoked.length, 1);
  h.api.setImageResourceOwner(null);
  await assert.rejects(h.api.getImageResource(src("new", "1", "bob")), /outside the current account/);
});

test("retention is bounded and an image still displayed on screen is not evicted", async () => {
  const h = harness();
  const pinned = src("pinned");
  const release = h.api.retainImageResource(pinned);
  const resource = await h.api.getImageResource(pinned);
  for (let i = 0; i < 165; i++) await h.api.getImageResource(src(`extra-${i}`));
  assert.equal(h.api.getCachedImageResource(pinned), resource);
  assert.equal(h.api.getCachedImageResource(src("extra-0")), undefined);
  assert.ok(h.revoked.length >= 6);
  release();
});

test("a stale error handler cannot discard a newer successful image", async () => {
  const h = harness();
  const old = await h.api.getImageResource(src("mug"));
  h.api.invalidateImageResource(src("mug"), old);
  const next = await h.api.getImageResource(src("mug"));
  h.api.invalidateImageResource(src("mug"), old);
  assert.equal(h.api.getCachedImageResource(src("mug")), next);
});

test("a newly mounted screen renders a cached image immediately without a skeleton or effect", async () => {
  const h = harness();
  const resource = await h.api.getImageResource(src("mug"));
  const React = { Fragment: "fragment", createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: () => ({ current: null }), useState: (initial) => [initial, () => {}], useCallback: (fn) => fn,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect() {},
  };
  const context = vm.createContext({ exports: {}, require: (name) => name === "react" ? React
    : name === "lucide-react" ? {} : h.api });
  vm.runInContext(compile(componentSource), context);
  const cachedTree = context.exports.PersistentImage({ src: src("mug"), showSkeleton: true });
  const img = cachedTree.children.find((node) => node?.type === "img");
  assert.equal(img.props.src, resource.displaySrc);
  assert.equal(cachedTree.children.some((node) => node?.type === "div"), false);
  const newSourceTree = context.exports.PersistentImage({ src: src("mug", "2"), showSkeleton: true });
  assert.equal(newSourceTree.children.some((node) => node?.type === "img"), false, "never flash the previous source");
  assert.equal(newSourceTree.children.some((node) => node?.type === "div"), true);
});
