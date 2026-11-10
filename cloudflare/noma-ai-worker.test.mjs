import assert from "node:assert/strict";
import test from "node:test";

import worker from "./noma-ai-worker.js";

test("vision uses the Qwen streaming multimodal contract", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    upstreamRequests.push({ url, init });

    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
    }
    if (
      url === "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" ||
      url === "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions"
    ) {
      return new Response([
        'data: {"choices":[{"delta":{"content":"{\\"title\\":\\"Orange\\","}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"\\"category\\":\\"食品厨房\\",\\"labels\\":[\\"fruit\\"]}"}}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"), {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  try {
    const request = new Request("https://noma.test/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "vision",
        scan_id: "scan-test-1",
        mime_type: "image/jpeg",
        image_base64: "dGVzdA==",
      }),
    });
    Object.defineProperty(request, "cf", { value: { continent: "AS", country: "CN" } });
    const response = await worker.fetch(request, {
      QWEN_API_KEY: "test-qwen-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(JSON.parse(data.choices[0].message.content), {
      title: "Orange",
      category: "食品厨房",
      labels: ["fruit"],
    });

    assert.equal(upstreamRequests.length, 2);
    const qwenRequest = upstreamRequests[1];
    assert.equal(qwenRequest.url, "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions");
    assert.equal(qwenRequest.init.headers.Authorization, "Bearer test-qwen-key");
    const requestBody = JSON.parse(qwenRequest.init.body);
    assert.equal(requestBody.model, "qwen3.7-flash");
    assert.equal(requestBody.stream, true);
    assert.equal(requestBody.enable_thinking, false);
    assert.equal(requestBody.max_completion_tokens, 160);
    assert.equal(requestBody.max_tokens, undefined);
    assert.equal(requestBody.response_format.type, "json_object");
    assert.equal(requestBody.messages[0].content[0].type, "image_url");
    assert.equal(requestBody.messages[0].content[0].image_url.url, "data:image/jpeg;base64,dGVzdA==");
    assert.match(requestBody.messages[0].content[1].text, /Return only JSON/);

    const overseasRequest = new Request("https://noma.test/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "vision",
        scan_id: "scan-test-2",
        mime_type: "image/jpeg",
        image_base64: "dGVzdA==",
      }),
    });
    Object.defineProperty(overseasRequest, "cf", { value: { continent: "EU", country: "DE" } });
    const overseasResponse = await worker.fetch(overseasRequest, {
      QWEN_API_KEY: "test-qwen-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
    });

    assert.equal(overseasResponse.status, 200);
    assert.equal(upstreamRequests.length, 4);
    assert.equal(upstreamRequests[3].url, "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("matting uses the PicWish synchronous task contract", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];
  const resultBase64 = Buffer.from("picwish-png").toString("base64");

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    upstreamRequests.push({ url, init });

    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
    }
    if (url === "https://techsz.aoscdn.com/api/tasks/visual/segmentation") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers["X-API-KEY"], "test-picwish-key");
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get("sync"), "1");
      assert.equal(init.body.get("type"), "object");
      assert.equal(init.body.get("return_type"), "2");
      assert.equal(init.body.get("output_type"), "2");
      assert.equal(init.body.get("crop"), "0");
      assert.equal(init.body.get("format"), "png");
      const imageFile = init.body.get("image_file");
      assert.ok(imageFile instanceof Blob);
      assert.equal(imageFile.type, "image/jpeg");
      assert.equal(Buffer.from(await imageFile.arrayBuffer()).toString("utf8"), "test");
      return Response.json({
        status: 200,
        message: "success",
        data: { task_id: "picwish-task-1", state: 1, progress: 100, image: resultBase64 },
      });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  try {
    const response = await worker.fetch(new Request("https://noma.test/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "matting",
        scan_id: "scan-matting-1",
        mime_type: "image/jpeg",
        image_base64: "dGVzdA==",
      }),
    }), {
      PICWISH_API_KEY: "test-picwish-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.provider, "picwish");
    assert.equal(data.result_base64, resultBase64);
    assert.equal(upstreamRequests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
