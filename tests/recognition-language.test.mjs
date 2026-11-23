import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/aiService.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("aiService.ts", source, ts.ScriptTarget.Latest, true);
const functions = parsed.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ["recognizeImage", "processCapturedImage"].includes(node.name?.text));
const code = ts.transpileModule(functions.map(node => node.getText(parsed)).join("\n"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const method of ["recognizeImage", "processCapturedImage"]) {
  test(`${method} snapshots the selected language before image preparation`, async () => {
    let language = "zh", finishPreparation;
    const requests = [];
    const pending = new Promise(resolve => { finishPreparation = resolve; });
    const context = vm.createContext({ exports: {},
      console: { log() {}, warn() {}, error() {} },
      getLanguage: () => language,
      prepareImage: () => pending,
      stripBase64Prefix: value => value,
      normalizeItemCategory: category => category,
      isGenericVisionTitle: () => false,
      AiAccessError: class extends Error {},
      callNomaBackend: async (type, payload, scanId) => {
        requests.push({ type, payload, scanId });
        const recognition = { title: payload.language === "zh" ? "保温杯" : "Coffee Mug", category: "食品厨房", labels: ["mug"] };
        return type === "process-image" ? { recognition, vision: { ok: true }, matting: { ok: false } } : recognition;
      },
    });
    vm.runInContext(code, context);
    const run = () => method === "processCapturedImage"
      ? context.exports[method]("photo", "scan-id")
      : context.exports[method]("photo", "image/jpeg", "scan-id");
    const pendingCapture = run();
    language = "en";
    finishPreparation("dGVzdA==");
    const chineseResult = await pendingCapture;
    assert.equal(requests[0].payload.language, "zh", "a language change cannot alter an in-flight capture");
    assert.equal((chineseResult.recognition || chineseResult).title, "保温杯");
    const englishResult = await run();
    assert.equal(requests[1].payload.language, "en", "the next capture uses the new selection");
    assert.equal((englishResult.recognition || englishResult).title, "Coffee Mug");
    assert.equal(requests.length, 2, "exactly one backend request per capture");
    assert.ok(requests.every(request => request.scanId === "scan-id"));
  });
}
