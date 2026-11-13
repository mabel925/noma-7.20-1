import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("../src/components/VirtualKeyboard.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
});

function keyboardHarness() {
  let callbacks;
  let sends = 0;
  const layout = { layout: { default: ["", "q w e", "a s d", "z x c"] } };
  const context = vm.createContext({
    exports: {}, window: {},
    require: (name) => {
      if (name === "react") return React;
      if (name === "react-simple-keyboard") return (props) => { callbacks = props; return null; };
      if (name.endsWith(".css")) return {};
      if (name.startsWith("simple-keyboard-layouts/")) return layout;
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  vm.runInContext(outputText, context);
  renderToStaticMarkup(React.createElement(context.exports.VirtualKeyboard, {
    onKeyPress() {}, onBackspace() {}, onSpace() {}, onSend() { sends += 1; },
  }));
  return { callbacks, get sends() { return sends; } };
}

test("Send submits once on release, allowing the resulting login dialog to stay open", () => {
  const h = keyboardHarness();
  h.callbacks.onKeyPress("{send}");
  assert.equal(h.sends, 0, "holding the key must not open an overlay under the pointer");
  h.callbacks.onKeyReleased("{send}", { type: "pointerup" });
  assert.equal(h.sends, 1);
  h.callbacks.onKeyReleased("{send}", { type: "mouseup" });
  assert.equal(h.sends, 1, "compatibility mouse events must not submit twice");
});

test("a cancelled Send press does not submit", () => {
  const h = keyboardHarness();
  for (const type of ["pointercancel", "touchcancel"]) {
    h.callbacks.onKeyPress("{send}");
    h.callbacks.onKeyReleased("{send}", { type });
  }
  assert.equal(h.sends, 0);
});

test("releasing Send without pressing it does not submit", () => {
  const h = keyboardHarness();
  h.callbacks.onKeyPress("a");
  h.callbacks.onKeyReleased("{send}", { type: "touchend" });
  assert.equal(h.sends, 0);
});
