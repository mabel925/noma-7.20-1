import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const draftSource = await readFile(new URL("../src/auth/pendingEmailLogin.ts", import.meta.url), "utf8");
const providerSource = await readFile(new URL("../src/auth/AuthContext.tsx", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function storageHarness() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

function loadDraft(storage) {
  const context = vm.createContext({ exports: {}, sessionStorage: storage });
  vm.runInContext(compile(draftSource), context);
  return context.exports;
}

async function authHarness({ storage = storageHarness(), session = null, dev = false } = {}) {
  const draft = loadDraft(storage);
  let currentValue;
  let index = 0;
  let dirty = false;
  const slots = [];
  const effects = [];
  const calls = { send: 0, verify: 0, signOut: [], bootstrap: 0 };
  let authEvent;
  let sendResult = () => Promise.resolve({ error: null });
  let verifyResult = () => Promise.resolve({ error: null });
  const memo = (factory, deps) => {
    const i = index++;
    if (!slots[i] || deps.some((value, j) => !Object.is(value, slots[i].deps[j]))) slots[i] = { deps, value: factory() };
    return slots[i].value;
  };
  const React = {
    createContext: () => ({ Provider: "provider" }),
    createElement: (type, props) => { if (type === "provider") currentValue = props.value; return null; },
    useState: (initial) => {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next) => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef: (initial) => { const i = index++; return slots[i] ||= { current: initial }; },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const i = index++;
      if (!slots[i] || deps.some((value, j) => !Object.is(value, slots[i].deps[j]))) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (fn) => { authEvent = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithOtp: async () => { calls.send++; return sendResult(); },
      verifyOtp: async () => { calls.verify++; return verifyResult(); },
      signOut: async (options) => { calls.signOut.push(options); return { error: null }; },
    },
    rpc: async () => { calls.bootstrap++; return { error: null }; },
  };
  const window = Object.assign(new EventTarget(), { location: { search: "" }, setTimeout });
  const context = vm.createContext({ exports: {}, console, URLSearchParams, document: { documentElement: { dataset: {} } }, window, require: (name) => {
    if (name === "react") return React;
    if (name.endsWith("pendingEmailLogin")) return draft;
    if (name.endsWith("supabaseClient")) return { supabase };
    if (name.endsWith("mediaStorage")) return { mediaStorage: { clearReadSession: async () => {} } };
    if (name.endsWith("aiAuth")) return { readAiAccess: async () => ({ aiScansRemaining: 10 }) };
    throw new Error(`Unexpected import: ${name}`);
  } });
  vm.runInContext(compile(providerSource.replaceAll("import.meta.env.DEV", String(dev))), context);
  const render = () => {
    let attempts = 0;
    do {
      assert.ok(++attempts < 20, "renders settle");
      dirty = false; index = 0;
      context.exports.AuthProvider({ children: null });
      while (effects.length) effects.shift()();
    } while (dirty);
  };
  const settle = async () => { await new Promise(setImmediate); render(); };
  render(); await settle();
  return { storage, draft, calls, render, settle, get value() { return currentValue; },
    event(name, eventSession) { authEvent(name, eventSession); render(); },
    sendWith(fn) { sendResult = fn; }, verifyWith(fn) { verifyResult = fn; },
  };
}

test("a successful send survives a fresh document without sending another email", async () => {
    const h = await authHarness();
    h.value.openLogin(); h.render();
    await h.value.requestOtp(" Test@Example.com "); h.render();
    assert.equal(h.value.pendingEmailLogin.email, "test@example.com");
    const restored = await authHarness({ storage: h.storage });
    assert.equal(restored.value.isLoginOpen, true);
    assert.equal(restored.value.authDialogMode, "login");
    assert.equal(restored.value.pendingEmailLogin.email, "test@example.com");
    assert.equal(restored.calls.send, 0, "restoring never requests another code");
    assert.equal(restored.value.user, null, "a saved email does not authenticate the user");
    assert.equal(Object.keys(JSON.parse([...h.storage.values.values()][0])).sort().join(","), "email,expiresAt,resendAvailableAt", "no verification code or credential is saved");
});

test("discard during the send request can resume; rejected sends restore the previous draft", async () => {
  const h = await authHarness();
  h.value.openLogin(); h.render();
  let finish;
  h.sendWith(() => new Promise((resolve) => { finish = resolve; }));
  const sending = h.value.requestOtp("test@example.com");
  const restored = await authHarness({ storage: h.storage });
  assert.equal(restored.value.isLoginOpen, true);
  assert.equal(restored.value.pendingEmailLogin.email, "test@example.com");
  assert.equal(restored.calls.send, 0);
  finish({ error: new Error("Send failed") });
  await assert.rejects(sending, /Send failed/);
  assert.equal(h.draft.readPendingEmailLogin(), null, "a failed first request leaves no draft");
  h.sendWith(async () => ({ error: null }));
  await h.value.requestOtp("first@example.com"); h.render();
  const previous = JSON.stringify(h.value.pendingEmailLogin);
  h.sendWith(async () => ({ error: new Error("Rate limited") }));
  await assert.rejects(h.value.requestOtp("second@example.com"), /Rate limited/);
  assert.equal(JSON.stringify(h.draft.readPendingEmailLogin()), previous, "a failed resend keeps the still-usable code and its deadline");
});

test("foreground auth refresh with no session keeps the pending OTP form open", async () => {
  const h = await authHarness();
  h.value.requireAuth(); h.render();
  await h.value.requestOtp("test@example.com"); h.render();
  h.event("INITIAL_SESSION", null);
  h.event("SIGNED_OUT", null);
  assert.equal(h.value.isLoginOpen, true);
  assert.equal(h.value.pendingEmailLogin.email, "test@example.com");
});

test("explicit close and switching email discard the draft, and late sends cannot reopen it", async () => {
  const h = await authHarness();
  h.value.openLogin(); h.render();
  let finish;
  h.sendWith(() => new Promise((resolve) => { finish = resolve; }));
  const request = h.value.requestOtp("first@example.com");
  h.value.closeLogin(); h.render();
  finish({ error: null }); await request; h.render();
  assert.equal(h.value.isLoginOpen, false);
  assert.equal(h.value.pendingEmailLogin, null);
  assert.equal(h.draft.readPendingEmailLogin(), null);
  h.sendWith(async () => ({ error: null }));
  h.value.openLogin(); h.render();
  await h.value.requestOtp("second@example.com"); h.render();
  h.value.resetEmailLogin(); h.render();
  assert.equal(h.value.isLoginOpen, true, "changing email stays inside the dialog");
  assert.equal(h.value.pendingEmailLogin, null);
  assert.equal((await authHarness({ storage: h.storage })).value.isLoginOpen, false);
});

test("failed verification preserves the form; success clears it and runs the pending action once", async () => {
  const h = await authHarness();
  let actions = 0;
  h.value.requireAuth(() => actions++); h.render();
  await h.value.requestOtp("test@example.com"); h.render();
  h.verifyWith(async () => ({ error: new Error("Invalid code") }));
  await assert.rejects(h.value.verifyOtp("test@example.com", "123456"), /Invalid code/);
  h.render();
  assert.equal(h.value.isLoginOpen, true);
  assert.ok(h.draft.readPendingEmailLogin());
  h.verifyWith(async () => ({ error: null }));
  await h.value.verifyOtp("test@example.com", "654321"); h.render();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.value.isLoginOpen, false);
  assert.equal(h.draft.readPendingEmailLogin(), null);
  assert.equal(actions, 1);
  assert.equal(h.calls.signOut[0].scope, "others", "single-device login still applies");
});

test("an already restored authenticated session dismisses the stale OTP draft", async () => {
  const storage = storageHarness();
  loadDraft(storage).savePendingEmailLogin("test@example.com");
  const h = await authHarness({ storage, session: { user: { id: "real-user", email: "test@example.com" } } });
  assert.equal(h.value.user.id, "real-user");
  assert.equal(h.value.isLoginOpen, false);
  assert.equal(h.draft.readPendingEmailLogin(), null);
});

test("expiry and malformed drafts are discarded; resend deadline does not restart on reload", () => {
  const storage = storageHarness();
  const draft = loadDraft(storage);
  const now = Date.now();
  const saved = draft.savePendingEmailLogin("test@example.com", now);
  assert.equal(loadDraft(storage).readPendingEmailLogin(now + 65_000).resendAvailableAt, saved.resendAvailableAt);
  assert.equal(draft.readPendingEmailLogin(saved.expiresAt), null);
  storage.setItem("noma-pending-email-login", '{"email":42}');
  assert.equal(draft.readPendingEmailLogin(), null);
  assert.equal(storage.values.size, 0);
});

test("storage failure preserves the live flow, and local testing still accepts only 000000", async () => {
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const draft = loadDraft(blocked);
  draft.savePendingEmailLogin("test@example.com");
  assert.equal(draft.readPendingEmailLogin().email, "test@example.com");
  draft.clearPendingEmailLogin();
  assert.equal(draft.readPendingEmailLogin(), null);
  const h = await authHarness({ dev: true });
  h.value.openLogin(); h.render();
  await h.value.requestOtp("anything@example.com"); h.render();
  assert.equal(h.calls.send, 0);
  await assert.rejects(h.value.verifyOtp("anything@example.com", "123456"), /000000/);
  await h.value.verifyOtp("anything@example.com", "000000"); h.render();
  assert.equal(h.value.user.email, "anything@example.com");
  assert.equal(h.value.isLoginOpen, false);
  assert.equal(h.draft.readPendingEmailLogin(), null);
});
