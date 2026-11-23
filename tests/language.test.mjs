import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/i18n/language.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(saved, blocked = false) {
  const values = new Map(saved ? [['noma-language', saved]] : []);
  const events = new Map();
  let listener;
  const document = { documentElement: { lang: '' } };
  const context = vm.createContext({ exports: {}, document,
    localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; }, setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); } },
    window: { addEventListener: (name, fn) => events.set(name, fn) },
    require: () => ({ useSyncExternalStore(subscribe, read) { listener?.(); listener = subscribe(() => {}); return read(); } }),
  });
  vm.runInContext(compiled, context);
  return { api: context.exports, values, events, document };
}
test('language defaults to English and restores only a supported preference', () => {
  assert.equal(harness().api.getLanguage(), 'en');
  assert.equal(harness('unknown').api.getLanguage(), 'en');
  const h = harness('zh');
  assert.equal(h.api.getLanguage(), 'zh');
  assert.equal(h.document.documentElement.lang, 'zh-CN');
});
test('selection persists, updates document language and interpolates literal user content', () => {
  const h = harness();
  h.api.setLanguage('zh');
  assert.equal(h.values.get('noma-language'), 'zh');
  assert.equal(h.api.t('Profile'), '个人资料');
  assert.equal(h.api.t('{count} items', { count: 3 }), '3 件物品');
  assert.equal(h.api.t('Delete {name}?', { name: '$& Mug {count}' }), '删除“$& Mug {count}”？');
  assert.equal(h.api.t('My custom mug'), 'My custom mug');
  assert.equal(harness(h.values.get('noma-language')).api.t('Language'), '语言');
  h.api.setLanguage('en');
  assert.equal(h.document.documentElement.lang, 'en');
  assert.equal(h.api.t('Profile'), 'Profile');
});
test('storage denial keeps switching usable, and tab storage changes synchronize', () => {
  const blocked = harness('zh', true);
  blocked.api.setLanguage('zh');
  assert.equal(blocked.api.t('Profile'), '个人资料');
  const h = harness();
  h.values.set('noma-language', 'zh');
  h.events.get('storage')({ key: 'unrelated' });
  assert.equal(h.api.getLanguage(), 'en');
  h.events.get('storage')({ key: 'noma-language' });
  assert.equal(h.api.getLanguage(), 'zh');
  h.values.clear(); h.events.get('storage')({ key: null });
  assert.equal(h.api.getLanguage(), 'en');
});
test('known assistant replies translate without changing search names or arbitrary messages', () => {
  const { api } = harness('zh');
  assert.equal(api.translateNomaMessage('Find it!!'), '找到了！');
  assert.equal(api.translateNomaMessage('You have 3 of them. Take a look below.'), '找到 3 件，看看下面这些。');
  assert.equal(api.translateNomaMessage("I don't remember seeing “Blue Mug” yet. Tap + to introduce it to me, and I won't forget it next time."), '我好像还没见过“Blue Mug”。点击 + 让我认识它，下次就记住啦。');
  assert.equal(api.translateNomaMessage('My mug is blue'), 'My mug is blue');
});
