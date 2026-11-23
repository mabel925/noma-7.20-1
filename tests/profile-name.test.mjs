import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/components/ProfilePage.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function harness() {
  let index = 0, tree, save = async () => {};
  const slots = [], calls = [];
  const user = { displayName: 'Mabel', email: 'profile@example.test' };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useCallback: fn => fn, useEffect() {}, useLayoutEffect() {},
  };
  const t = (text) => text;
  const context = vm.createContext({ exports: {}, window: { innerHeight: 844 }, require(name) {
    if (name === 'react') return React;
    if (name === 'motion/react') return { motion: { div: 'motion.div' }, useReducedMotion: () => true };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ user, updateDisplayName: async name => { calls.push(name); await save(); user.displayName = name; } }) };
    if (name.endsWith('i18n/language')) return { useLanguage: () => ({ language: 'en', t }) };
    return {};
  } });
  vm.runInContext(code, context);
  const find = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    return node.props?.children?.flat(Infinity).map(child => find(predicate, child)).find(Boolean);
  };
  const render = () => {
    index = 0; tree = context.exports.ProfilePage({ onClose() {} });
    const input = find(node => node.type === 'input');
    if (input) input.props.ref.current = { blur: () => input.props.onBlur() };
  };
  const input = () => find(node => node.type === 'input');
  const begin = () => { find(node => node.props['aria-label'] === 'Edit username').props.onClick(); render(); };
  render();
  return { render, begin, find, input, calls, user, saveWith: fn => { save = fn; },
    change(value) { input().props.onChange({ target: { value } }); render(); },
    submit: () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
  };
}
test('dismissing the editor discards its draft without a save request', () => {
  const h = harness(); h.begin(); h.change('Unconfirmed name');
  h.input().props.onBlur(); h.render();
  assert.equal(h.input(), undefined);
  assert.equal(h.user.displayName, 'Mabel');
  assert.equal(h.calls.length, 0);
});
test('keyboard confirmation survives blur and prevents duplicate saves', async () => {
  const h = harness(); let finish;
  h.saveWith(() => new Promise(resolve => { finish = resolve; }));
  h.begin(); h.change('  Noma friend  ');
  const pending = h.submit(); h.render();
  assert.equal(h.input().props.value, '  Noma friend  ', 'confirmation blur must not restore the previous name');
  assert.equal(h.input().props.readOnly, true);
  await h.submit(); assert.equal(h.calls.length, 1);
  finish(); await pending; h.render();
  assert.equal(h.user.displayName, 'Noma friend');
  assert.equal(h.input(), undefined);
});
test('failed confirmation keeps the draft; empty names and IME selection do not save', async () => {
  const h = harness(); h.begin();
  let prevented = false;
  h.input().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  h.change('   '); await h.submit(); h.render();
  assert.equal(h.calls.length, 0);
  assert.ok(h.find(node => node.props.role === 'alert'));
  h.change('New name'); h.saveWith(async () => { throw Error('Save failed'); });
  await h.submit(); h.render();
  assert.equal(h.input().props.value, 'New name');
  assert.equal(h.input().props.readOnly, false);
  assert.equal(h.user.displayName, 'Mabel');
});
