import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cloudflare/noma-ai-worker.js";

const encoder = new TextEncoder();
const frame = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const result = { title: "Coffee Mug", category: "食品厨房", labels: ["cup"] };

async function capture(makeResponse, envOverrides = {}) {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs = [];
  let providerCalls = 0;
  const providerEndpoints = [];
  console.log = (...args) => logs.push(args.join(" "));
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
    }
    if (url === "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" ||
      url === "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions") {
      providerCalls += 1;
      providerEndpoints.push(url);
      return makeResponse(init.signal);
    }
    throw new Error(`Unexpected provider request: ${url}`);
  };
  try {
    const response = await worker.fetch(new Request("https://noma.test/", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ type: "process-image", scan_id: "scan-stream-test", image_base64: "dGVzdA==" }),
    }), {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
      QWEN_API_KEY: "test-qwen-key",
      MATTING_ENABLED: "false",
      CAPTURE_VISION_TIMEOUT_MS: "50",
      ...envOverrides,
    });
    return { data: await response.json(), logs, providerCalls, providerEndpoints };
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
}

function openStream(signal, text, onCancel = () => {}) {
  let cancelled = false;
  return new Response(new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(encoder.encode(text));
      signal.addEventListener("abort", () => {
        if (!cancelled) controller.error(new Error("aborted"));
      }, { once: true });
    },
    cancel() {
      cancelled = true;
      onCancel();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

test("a complete valid recognition succeeds even when Qwen never closes its stream", async () => {
  let cancelled = false;
  const { data, logs, providerCalls } = await capture((signal) => openStream(
    signal, frame(JSON.stringify(result)), () => { cancelled = true; },
  ));
  assert.deepEqual(data.recognition, result);
  assert.equal(data.vision.ok, true);
  assert.equal(providerCalls, 1);
  assert.equal(cancelled, true);
  assert(logs.some((line) => line.includes("completion=valid_json")));
});

test("recognition joins SSE frames split through UTF-8 characters without accepting an earlier partial title", async () => {
  const expected = { title: "Travel Coffee Mug", category: "食品厨房", labels: ["cup"] };
  const partial = '{"title":"Travel';
  const text = frame(partial) + frame(' Coffee Mug","category":"食品厨房","labels":["cup"]}') + "data: [DONE]\n\n";
  const bytes = encoder.encode(text);
  const { data, providerCalls } = await capture(() => new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  assert.deepEqual(data.recognition, expected);
  assert.equal(providerCalls, 1);
});

test("an unfinished recognition still times out without accepting its partial title or retrying", async () => {
  const { data, logs, providerCalls } = await capture((signal) => openStream(signal, frame('{"title":"Coffee Mug",')));
  assert.equal(data.recognition, undefined);
  assert.equal(data.vision.ok, false);
  assert.match(data.vision.error, /timed out/);
  assert.equal(providerCalls, 1);
  assert(logs.some((line) => line.includes("timeout_stage=receiving_content")));
  assert(logs.some((line) => /first_content_ms=\d+/.test(line)));
});

test("timeouts before response headers can be distinguished from model content delays", async () => {
  const { data, logs, providerCalls } = await capture((signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  assert.equal(data.recognition, undefined);
  assert.match(data.vision.error, /timed out/);
  assert.equal(providerCalls, 1);
  assert(logs.some((line) => line.includes("timeout_stage=awaiting_headers")));
  assert(logs.some((line) => line.includes("headers_ms=-1")));
});

test("a successful HTTP response without body data is not reported as a successful recognition", async () => {
  const { data, logs } = await capture((signal) => openStream(signal, ""));
  assert.equal(data.recognition, undefined);
  assert.match(data.vision.error, /timed out/);
  assert(logs.some((line) => line.includes("timeout_stage=awaiting_body")));
  assert(logs.some((line) => line.includes("first_body_ms=-1")));
});

test("complete JSON with a placeholder title is still rejected", async () => {
  const { data } = await capture(() => new Response(
    frame(JSON.stringify({ ...result, title: "Scanned Item" })) + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  ));
  assert.equal(data.recognition, undefined);
  assert.equal(data.vision.ok, false);
  assert.match(data.vision.error, /no usable title/);
});

test("a finish_reason ends reading even when the DONE marker and connection close are missing", async () => {
  const { data, logs } = await capture((signal) => openStream(signal,
    frame('{"title":"Coffee Mug",') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
  ));
  assert.equal(data.recognition, undefined);
  assert.equal(data.vision.ok, false);
  assert.match(data.vision.error, /invalid JSON/);
  assert(logs.some((line) => line.includes("completion=finish_reason")));
  assert(!logs.some((line) => line.includes("outcome=timeout")));
});

test("an Asian request can use the configured global endpoint with accurate route and request-id diagnostics", async () => {
  const endpoint = "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
  const { data, logs, providerEndpoints } = await capture(() => new Response(
    frame(JSON.stringify(result)),
    { headers: { "Content-Type": "text/event-stream", "x-request-id": "test-provider-request-1" } },
  ), { QWEN_ENDPOINT: endpoint });
  assert.deepEqual(data.recognition, result);
  assert.deepEqual(providerEndpoints, [endpoint]);
  assert(logs.some((line) => line.includes("qwen_region=global")));
  assert(logs.some((line) => line.includes('qwen_host="maas.qianwenaiapi.com"')));
  assert(logs.some((line) => line.includes('upstream_request_id="test-provider-request-1"')));
});
