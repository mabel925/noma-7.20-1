import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const loadModule = (source, imports, globals = {}) => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const context = vm.createContext({ exports: {}, console, URL, URLSearchParams, AbortController, window: { setTimeout, clearTimeout }, require: (name) => imports[name], ...globals });
  vm.runInContext(outputText, context);
  return context.exports;
};
const mediaSource = await readFile(new URL("../src/services/mediaStorage.ts", import.meta.url), "utf8");
const memorySource = await readFile(new URL("../src/services/memoryStorage.ts", import.meta.url), "utf8");
const auth = { SUPABASE_PUBLISHABLE_KEY: "test-public", supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) } } };

test("expired image cookie recovers with the current login and refreshes the cookie", async () => {
  const requests = [];
  const { mediaStorage } = loadModule(mediaSource, { "./supabaseClient": auth }, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith("/session")) return new Response("{}", { headers: { "Content-Type": "application/json" } });
      return init.headers?.Authorization
        ? new Response("image bytes", { headers: { "Content-Type": "image/webp" } })
        : new Response("Unauthorized", { status: 401 });
    },
  });
  const blob = await mediaStorage.readImage("/api/media/object/users/test/sticker.webp");
  assert.equal(await blob.text(), "image bytes");
  assert.equal(requests[1].init.headers.Authorization, "Bearer test-token");
  await mediaStorage.ensureReadSession();
  assert.equal(requests.filter((r) => r.url.endsWith("/session")).length, 1);
});

test("a missing R2 object fails explicitly without being mistaken for a successful image", async () => {
  const { mediaStorage } = loadModule(mediaSource, { "./supabaseClient": auth }, {
    fetch: async () => new Response("Not Found", { status: 404 }),
  });
  await assert.rejects(mediaStorage.readImage("/api/media/object/missing.webp"), /404/);
});

test("parallel image-session requests share one network operation", async () => {
  let count = 0;
  const { mediaStorage } = loadModule(mediaSource, { "./supabaseClient": auth }, {
    fetch: async () => { count += 1; return new Response("{}"); },
  });
  await Promise.all([mediaStorage.ensureReadSession(), mediaStorage.ensureReadSession()]);
  assert.equal(count, 1);
});

test("image-session failure cannot hide a successfully loaded memory page or Chat search", async () => {
  const row = { id: "one", user_id: "owner", name: "Mug", sticker_url: "r2:users/owner/items/one/sticker.webp", parent_location_name: "Room", sub_location_name: "storage spot", updated_at: "2026-11-13T00:00:00Z" };
  const storage = {
    mediaKeyFromValue: (v) => v?.startsWith("r2:") ? v.slice(3) : null,
    displayMediaValue: (v) => v,
    mediaStorage: { ensureReadSession: async () => { throw new Error("503"); } },
  };
  const { memoryStorage } = loadModule(memorySource, {
    "./mediaStorage": storage,
    "./supabaseClient": { supabase: { rpc: async () => ({ data: [row], error: null }) } },
  }, { console: { warn() {} } });
  const page = await memoryStorage.listItemsPage("owner");
  const results = await memoryStorage.searchItems("owner", "Mug");
  assert.equal(page.items[0].name, "Mug");
  assert.equal(results[0].id, "one");
});
