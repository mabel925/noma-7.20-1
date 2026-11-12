import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { runMediaGc, runUnverifiedAuthCleanup } from "./noma-ai-worker.js";

test("media GC deletes only old unreferenced R2 objects", async () => {
  const originalFetch = globalThis.fetch;
  const deletedKeys = [];
  const requests = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/rest/v1/rpc/claim_noma_media_gc")) {
      return Response.json([{ key: "users/user-1/items/item-1/sticker.webp" }]);
    }
    throw new Error(`Unexpected Media GC request: ${url}`);
  };

  try {
    const result = await runMediaGc({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      NOMA_MEMORY_IMAGES: {
        async delete(key) {
          deletedKeys.push(key);
        },
      },
    }, Date.parse("2026-11-11T00:00:00.000Z"));

    assert.deepEqual(result, { scanned: 1, deleted: 1, failed: 0, skipped: false });
    assert.deepEqual(deletedKeys, ["users/user-1/items/item-1/sticker.webp"]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url.pathname, "/rest/v1/rpc/claim_noma_media_gc");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(
      JSON.parse(requests[0].init.body).p_cutoff,
      "2026-11-08T00:00:00.000Z",
    );
    assert.equal(requests[1].init.method, "DELETE");
    assert.equal(requests[1].url.searchParams.get("ref_count"), "eq.0");
    assert.equal(requests[1].url.searchParams.get("orphaned_at"), "lte.2026-11-08T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("media GC migration protects every image still stored on a space", async () => {
  const migration = await readFile(
    new URL("../supabase/migrate_media_gc_v1.sql", import.meta.url),
    "utf8",
  );
  const protections = migration.match(/space\.image_url = 'r2:' \|\| media\.key/g) || [];
  assert.equal(protections.length, 2);
});

test("media GC is harmless until its private bindings are configured", async () => {
  const result = await runMediaGc({ SUPABASE_URL: "https://example.supabase.co" });
  assert.deepEqual(result, { scanned: 0, deleted: 0, failed: 0, skipped: true });
});

test("auth cleanup deletes only candidates returned by the protected database function", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const expiredUserId = "93f68029-9b99-4155-bf21-38115b8b2b5d";

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/rest/v1/rpc/list_noma_unverified_auth_cleanup")) {
      return Response.json([{ user_id: expiredUserId, email: "pending@example.com" }]);
    }
    if (url.pathname === `/auth/v1/admin/users/${expiredUserId}` && init.method === "DELETE") {
      return Response.json({ id: expiredUserId });
    }
    throw new Error(`Unexpected auth cleanup request: ${url}`);
  };

  try {
    const result = await runUnverifiedAuthCleanup({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    }, Date.parse("2026-11-11T00:00:00.000Z"));

    assert.deepEqual(result, { scanned: 1, deleted: 1, failed: 0, skipped: false });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      p_cutoff: "2026-11-10T00:00:00.000Z",
      p_limit: 200,
    });
    assert.equal(requests[1].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auth cleanup is harmless until the service role secret is configured", async () => {
  const result = await runUnverifiedAuthCleanup({ SUPABASE_URL: "https://example.supabase.co" });
  assert.deepEqual(result, { scanned: 0, deleted: 0, failed: 0, skipped: true });
});

test("auth hygiene migration hides unverified users and protects cleanup candidates", async () => {
  const migration = await readFile(
    new URL("../supabase/migrate_auth_hygiene_v7.sql", import.meta.url),
    "utf8",
  );
  assert.equal((migration.match(/email_confirmed_at is not null/g) || []).length, 2);
  assert.match(migration, /email_confirmed_at is null/);
  assert.match(migration, /last_sign_in_at is null/);
  assert.match(migration, /NOMA_SERVICE_ROLE_REQUIRED/);
});

test("scan authorization migration keeps login initialization out of the capture path", async () => {
  const migration = await readFile(
    new URL("../supabase/migrate_ai_scan_authorization_v8.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(migration, /perform\s+public\.ensure_noma_entitlement/i);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /NOMA_ACCESS_NOT_READY/);
  assert.match(migration, /insert into public\.ai_scan_usage/);
});

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
test("vision returns the Qwen provider failure without a secondary model", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    upstreamRequests.push({ url, init });

    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
    }
    if (url === "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions") {
      return Response.json({ error: { message: "temporary failure" } }, { status: 503 });
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
        scan_id: "scan-qwen-failure",
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

    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(upstreamRequests.length, 2);
    assert.match(data.error, /Qwen vision failed/);
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
    if (url === "https://techhk.aoscdn.com/api/tasks/visual/segmentation") {
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
      PICWISH_GLOBAL_API_KEY: "test-picwish-key",
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

test("matting can be disabled without calling PicWish", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    upstreamRequests.push(url);
    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
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
        scan_id: "scan-matting-disabled",
        mime_type: "image/jpeg",
        image_base64: "dGVzdA==",
      }),
    }), {
      MATTING_ENABLED: "false",
      PICWISH_GLOBAL_API_KEY: "test-picwish-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
    });

    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.code, "MATTING_DISABLED");
    assert.equal(upstreamRequests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("combined capture rejects exhausted quota before calling either provider", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    assert.ok(url.endsWith("/rest/v1/rpc/authorize_ai_scan"));
    return Response.json({ allowed: false, reason: "quota_exhausted", planCode: "free", limit: 3, remaining: 0 });
  };
  try {
    const response = await worker.fetch(new Request("https://noma.test/", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ type: "process-image", scan_id: "scan-quota-exhausted", image_base64: "dGVzdA==" }),
    }), {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
      QWEN_API_KEY: "test-qwen-key",
      PICWISH_GLOBAL_API_KEY: "test-picwish-key",
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "AI_QUOTA_EXHAUSTED");
    assert.equal(response.headers.get("X-Noma-AI-Remaining"), "0");
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("combined capture returns the cutout with a fallback title when vision times out", async () => {
  const originalFetch = globalThis.fetch;
  const resultBase64 = Buffer.from("picwish-png").toString("base64");
  let reservations = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/rest/v1/rpc/authorize_ai_scan")) {
      reservations += 1;
      return Response.json({ allowed: true, planCode: "free", limit: 10, remaining: 9 });
    }
    if (url === "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.messages[0].content[0].image_url.url, "data:image/jpeg;base64,dGVzdA==");
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
    if (url === "https://techhk.aoscdn.com/api/tasks/visual/segmentation") {
      assert.equal(await init.body.get("image_file").text(), "test");
      return Response.json({
        status: 200,
        message: "success",
        data: { task_id: "picwish-task-timeout", state: 1, progress: 100, image: resultBase64 },
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
        type: "process-image",
        scan_id: "scan-vision-timeout",
        mime_type: "image/jpeg",
        image_base64: "dGVzdA==",
      }),
    }), {
      PICWISH_GLOBAL_API_KEY: "test-picwish-key",
      QWEN_API_KEY: "test-qwen-key",
      CAPTURE_VISION_TIMEOUT_MS: "50",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.recognition, undefined);
    assert.equal(data.vision.ok, false);
    assert.match(data.vision.error, /timed out/);
    assert.equal(data.matting.ok, true);
    assert.equal(data.matting.data.result_base64, resultBase64);
    assert.equal(reservations, 1);
    assert.equal(response.headers.get("X-Noma-AI-Remaining"), "9");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
