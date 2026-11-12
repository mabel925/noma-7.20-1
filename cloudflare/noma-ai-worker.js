const DEFAULT_PICWISH_ENDPOINT = "https://techhk.aoscdn.com/api/tasks/visual/segmentation";
const PICWISH_SYNC_TIMEOUT_MS = 12000;
const PICWISH_MAX_RESULT_BYTES = 8 * 1024 * 1024;
const DEFAULT_VISION_TIMEOUT_MS = 5000;
const DEFAULT_CAPTURE_VISION_TIMEOUT_MS = 5000;
const DEFAULT_VISION_PROVIDER_TIMEOUT_MS = 5000;
const DEFAULT_QWEN_ENDPOINT = "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
const DEFAULT_QWEN_GLOBAL_ENDPOINT = "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
const DEFAULT_QWEN_MODEL = "qwen3.7-flash";
const DEFAULT_MEDIA_GC_RETENTION_DAYS = 3;
const DEFAULT_MEDIA_GC_BATCH_SIZE = 200;
const DEFAULT_MEDIA_GC_STALE_CLAIM_HOURS = 2;
const DEFAULT_UNVERIFIED_AUTH_RETENTION_HOURS = 24;
const DEFAULT_UNVERIFIED_AUTH_CLEANUP_BATCH_SIZE = 200;

const EMOJI_KEYS_BY_KIND = {
  item: ["laptop", "phone", "charger", "earphones", "camera", "battery", "gamepad", "tshirt", "pants", "shoes", "hat", "bag", "ring", "pill", "bandage", "thermometer", "glasses", "book", "pen", "scissors", "folder", "key", "umbrella", "tissues", "cosmetics", "perfume", "clock", "coffee", "cup", "utensils", "apple", "wrench", "hammer", "flashlight", "lock", "basketball", "guitar", "puzzle", "tent"],
  "sub-space": ["box", "drawer", "wardrobe", "shelf", "suitcase", "safe", "trash"],
  "parent-space": ["home", "living-room", "bedroom", "kitchen", "bathroom", "balcony-garden", "office", "library-study", "car", "garage-workshop"],
};
const ITEM_CATEGORIES = ["数码用品", "衣物鞋包", "药品健康", "文具办公", "家居日用", "食品厨房", "工具杂物", "爱好运动"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Client-Info, X-Noma-Scan-Id, X-Noma-Client-Build",
  "Access-Control-Expose-Headers": "X-Noma-AI-Limit, X-Noma-AI-Remaining, X-Noma-Plan, Server-Timing",
  "Access-Control-Max-Age": "86400",
};

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json; charset=UTF-8" },
  });

const errorMessage = (value) => (value instanceof Error ? value.message : String(value));
const isMattingEnabled = (env) => String(env.MATTING_ENABLED ?? "true").toLowerCase() !== "false";

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured");
  }
  return { url, key };
}

function mediaGcNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

function getMediaGcConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = env.NOMA_MEMORY_IMAGES;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !serviceKey || !bucket?.delete) return null;
  return {
    url,
    serviceKey,
    bucket,
    retentionDays: mediaGcNumber(env.MEDIA_GC_RETENTION_DAYS, DEFAULT_MEDIA_GC_RETENTION_DAYS, 1, 90),
    batchSize: mediaGcNumber(env.MEDIA_GC_BATCH_SIZE, DEFAULT_MEDIA_GC_BATCH_SIZE, 1, 500),
    staleClaimHours: mediaGcNumber(env.MEDIA_GC_STALE_CLAIM_HOURS, DEFAULT_MEDIA_GC_STALE_CLAIM_HOURS, 1, 24),
  };
}

function getUnverifiedAuthCleanupConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !serviceKey) return null;
  return {
    url,
    serviceKey,
    retentionHours: mediaGcNumber(
      env.AUTH_UNVERIFIED_RETENTION_HOURS,
      DEFAULT_UNVERIFIED_AUTH_RETENTION_HOURS,
      24,
      24 * 30,
    ),
    batchSize: mediaGcNumber(
      env.AUTH_CLEANUP_BATCH_SIZE,
      DEFAULT_UNVERIFIED_AUTH_CLEANUP_BATCH_SIZE,
      1,
      500,
    ),
  };
}

async function mediaGcSupabaseRequest(config, path, init = {}) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Media GC Supabase HTTP ${response.status}: ${text.slice(0, 300)}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Media GC Supabase returned invalid JSON");
  }
}

async function deleteSupabaseAuthUser(config, userId) {
  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase Auth Admin HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

function mediaGcQuery(entries) {
  const params = new URLSearchParams();
  for (const [name, value] of entries) params.set(name, String(value));
  return params.toString();
}

export async function runMediaGc(env, now = Date.now()) {
  const config = getMediaGcConfig(env);
  if (!config) {
    console.warn("[MediaGC] skipped: SUPABASE_SERVICE_ROLE_KEY or NOMA_MEMORY_IMAGES is not configured");
    return { scanned: 0, deleted: 0, failed: 0, skipped: true };
  }

  const cutoff = new Date(now - config.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const staleClaimBefore = new Date(now - config.staleClaimHours * 60 * 60 * 1000).toISOString();
  const candidates = await mediaGcSupabaseRequest(config, "rpc/claim_noma_media_gc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_cutoff: cutoff,
      p_stale_claim_before: staleClaimBefore,
      p_limit: config.batchSize,
    }),
  });
  let deleted = 0;
  let failed = 0;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = String(candidate?.key || "");
    if (!key.startsWith("users/")) continue;
    let r2Deleted = false;
    try {
      await config.bucket.delete(key);
      r2Deleted = true;
      const deleteQuery = mediaGcQuery([
        ["key", `eq.${key}`],
        ["ref_count", "eq.0"],
        ["orphaned_at", `lte.${cutoff}`],
        ["gc_claimed_at", "not.is.null"],
      ]);
      await mediaGcSupabaseRequest(config, `media_objects?${deleteQuery}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      if (!r2Deleted) {
        const releaseQuery = mediaGcQuery([
          ["key", `eq.${key}`],
          ["gc_claimed_at", "not.is.null"],
        ]);
        try {
          await mediaGcSupabaseRequest(config, `media_objects?${releaseQuery}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ gc_claimed_at: null }),
          });
        } catch (releaseError) {
          console.error(`[MediaGC] claim_release_failed key=${JSON.stringify(key)} error=${errorMessage(releaseError).slice(0, 200)}`);
        }
      }
      console.error(`[MediaGC] key=${JSON.stringify(key)} error=${errorMessage(error).slice(0, 300)}`);
    }
  }

  const result = { scanned: Array.isArray(candidates) ? candidates.length : 0, deleted, failed, skipped: false };
  console.log(`[MediaGC] scanned=${result.scanned} deleted=${deleted} failed=${failed} cutoff=${cutoff}`);
  return result;
}

export async function runUnverifiedAuthCleanup(env, now = Date.now()) {
  const config = getUnverifiedAuthCleanupConfig(env);
  if (!config) {
    console.warn("[AuthCleanup] skipped: SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { scanned: 0, deleted: 0, failed: 0, skipped: true };
  }

  const cutoff = new Date(now - config.retentionHours * 60 * 60 * 1000).toISOString();
  const candidates = await mediaGcSupabaseRequest(config, "rpc/list_noma_unverified_auth_cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_cutoff: cutoff,
      p_limit: config.batchSize,
    }),
  });
  let deleted = 0;
  let failed = 0;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const userId = String(candidate?.user_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      failed += 1;
      console.error(`[AuthCleanup] invalid_candidate user_id=${JSON.stringify(userId)}`);
      continue;
    }
    try {
      await deleteSupabaseAuthUser(config, userId);
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`[AuthCleanup] user_id=${JSON.stringify(userId)} error=${errorMessage(error).slice(0, 300)}`);
    }
  }

  const result = { scanned: Array.isArray(candidates) ? candidates.length : 0, deleted, failed, skipped: false };
  console.log(`[AuthCleanup] scanned=${result.scanned} deleted=${deleted} failed=${failed} cutoff=${cutoff}`);
  return result;
}

export async function runScheduledMaintenance(env) {
  const results = await Promise.allSettled([
    runMediaGc(env),
    runUnverifiedAuthCleanup(env),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const task = index === 0 ? "MediaGC" : "AuthCleanup";
      console.error(`[Maintenance] task=${task} error=${errorMessage(result.reason).slice(0, 300)}`);
    }
  });
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function resolveQwenRoute(request, env) {
  const continent = String(request.cf?.continent || "").toUpperCase();
  const useBeijing = !continent || continent === "AS";
  return useBeijing
    ? { endpoint: env.QWEN_ENDPOINT || DEFAULT_QWEN_ENDPOINT, region: "beijing" }
    : { endpoint: env.QWEN_GLOBAL_ENDPOINT || DEFAULT_QWEN_GLOBAL_ENDPOINT, region: "global" };
}

async function readSupabaseResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = data?.message || data?.msg || data?.error_description || data?.error || text;
    const error = new Error(String(detail || `Supabase HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function authenticate(request, env) {
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Please sign in before using Noma AI");
    error.status = 401;
    throw error;
  }
  const { url, key } = getSupabaseConfig(env);
  const response = await fetchWithTimeout(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
  }, 15000);
  return readSupabaseResponse(response);
}

async function authorizeAiScan(request, env, scanId, feature) {
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Please sign in before using Noma AI");
    error.status = 401;
    throw error;
  }
  const { url, key } = getSupabaseConfig(env);
  const response = await fetchWithTimeout(`${url}/rest/v1/rpc/authorize_ai_scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_scan_id: scanId,
      p_feature: feature,
    }),
  }, 15000);
  return readSupabaseResponse(response);
}

function quotaHeaders(access) {
  return {
    "X-Noma-Plan": String(access?.planCode || "free"),
    ...(access?.limit === null || access?.limit === undefined ? {} : { "X-Noma-AI-Limit": String(access.limit) }),
    ...(access?.remaining === null || access?.remaining === undefined ? {} : { "X-Noma-AI-Remaining": String(access.remaining) }),
  };
}

function withQuota(response, access, timings = {}) {
  const headers = new Headers(response.headers);
  Object.entries(quotaHeaders(access)).forEach(([name, value]) => headers.set(name, value));
  const serverTiming = Object.entries(timings)
    .map(([name, duration]) => `${name};dur=${Math.max(0, Number(duration) || 0)}`)
    .join(", ");
  if (serverTiming) headers.set("Server-Timing", serverTiming);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchWithTimeout(url, init, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Upstream request timed out"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(response, provider) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${provider} returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || data?.error || text;
    throw new Error(`${provider} HTTP ${response.status}: ${String(detail).slice(0, 500)}`);
  }
  return data;
}

function base64ImageBlob(base64, mimeType = "image/jpeg") {
  const normalized = String(base64 || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function picwishData(payload, operation) {
  if (Number(payload?.status) !== 200) {
    throw new Error(`${operation} failed: status=${payload?.status ?? "missing"} message=${payload?.message || "unknown error"}`);
  }
  return payload?.data || {};
}

async function readOpenAiStream(response, provider) {
  if (!response.ok) return readJsonResponse(response, provider);
  if (!response.body) throw new Error(`${provider} returned an empty response body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let completed = false;

  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") {
      completed = true;
      return;
    }

    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new Error(`${provider} returned invalid streaming JSON`);
    }
    if (chunk?.error) {
      throw new Error(`${provider} stream failed: ${String(chunk.error?.message || chunk.error).slice(0, 500)}`);
    }
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (typeof delta === "string") content += delta;
  };

  while (!completed) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
    if (done) {
      if (buffer) consumeLine(buffer);
      break;
    }
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) throw new Error(`${provider} returned empty streaming content`);
  return { choices: [{ message: { content: trimmedContent } }] };
}

function extractText(data) {
  return (
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() ||
    data?.choices?.[0]?.message?.content?.trim() ||
    ""
  );
}

function isGenericVisionTitle(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:(?:scanned|detected|recognized|unknown|unidentified)\s+)?(?:item|items|object|objects)$/.test(normalized);
}

function parseVisionResult(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) throw new Error("Vision provider returned empty content");

  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = codeBlock?.[1]?.trim() || trimmed;
  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  const jsonText = objectStart >= 0 && objectEnd > objectStart
    ? candidate.slice(objectStart, objectEnd + 1)
    : candidate;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Vision provider returned invalid JSON");
  }

  const title = String(parsed?.title || "").replace(/\s+/g, " ").trim();
  const category = String(parsed?.category || "").trim();
  const labels = Array.isArray(parsed?.labels)
    ? parsed.labels.map((label) => String(label).trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!title || isGenericVisionTitle(title)) {
    throw new Error("Vision provider returned no usable title");
  }
  if (!ITEM_CATEGORIES.includes(category)) {
    throw new Error("Vision provider returned a category outside the whitelist");
  }

  return {
    title: title.slice(0, 80),
    category,
    labels: labels.length > 0 ? labels : [title],
  };
}

async function callQwen(env, content, jsonMode = false, timeoutMs = 12000, modelOverride = "", endpointOverride = "") {
  if (!env.QWEN_API_KEY) throw new Error("QWEN_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Upstream request timed out"), timeoutMs);
  try {
    const response = await fetch(endpointOverride || env.QWEN_ENDPOINT || DEFAULT_QWEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.QWEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelOverride || env.QWEN_MODEL || DEFAULT_QWEN_MODEL,
        messages: [{ role: "user", content }],
        temperature: 0.15,
        max_completion_tokens: 160,
        enable_thinking: false,
        stream: true,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    return await readOpenAiStream(response, "Qwen");
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Qwen request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isUpstreamTimeout(error) {
  return /timed out|timeout|abort/i.test(errorMessage(error));
}

async function vision(env, body, qwenRoute, timeoutMs = DEFAULT_VISION_TIMEOUT_MS) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mimeType = body.mime_type || "image/jpeg";
  const prompt = `Identify the main physical object. The title must be a specific common English name for the visible object. Never use generic placeholders such as item, object, scanned item, scanned items, unknown item, or unidentified object. Choose exactly one category from this whitelist: ${ITEM_CATEGORIES.join(", ")}. Return only JSON: {"title":"specific short English object name","category":"one whitelisted category","labels":["synonym or semantic tag"]}.`;
  const visionStartedAt = Date.now();
  const dataUrl = `data:${mimeType};base64,${body.image_base64}`;
  const model = env.QWEN_MODEL || DEFAULT_QWEN_MODEL;
  const providerStartedAt = Date.now();
  try {
    const qwenTimeoutMs = Math.max(1, Math.min(DEFAULT_VISION_PROVIDER_TIMEOUT_MS, timeoutMs));
    const data = await callQwen(env, [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: prompt },
    ], true, qwenTimeoutMs, model, qwenRoute.endpoint);
    const result = parseVisionResult(extractText(data));
    console.log(`[AiTiming] feature=vision provider=qwen qwen_region=${qwenRoute.region} model=${model} stream=true provider_ms=${Date.now() - providerStartedAt} total_ms=${Date.now() - visionStartedAt} outcome=success accepted_title=${JSON.stringify(result.title)} category=${JSON.stringify(result.category)}`);
    return json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  } catch (error) {
    const timedOut = isUpstreamTimeout(error);
    const outcome = timedOut ? "timeout" : "invalid";
    console.log(`[AiTiming] feature=vision provider=qwen qwen_region=${qwenRoute.region} model=${model} stream=true provider_ms=${Date.now() - providerStartedAt} total_ms=${Date.now() - visionStartedAt} outcome=${outcome} error=${errorMessage(error).slice(0, 240)}`);
    return json({
      error: `Qwen vision failed: ${errorMessage(error)}`,
      ...(timedOut ? { code: "VISION_TIMEOUT" } : {}),
    }, timedOut ? 504 : 502);
  }
}

async function title(env, body, qwenRoute) {
  const sourceTitle = String(body.title || "").trim();
  if (!sourceTitle) return json({ error: "title is required" }, 400);
  const prompt = `Create one concise English storage label, maximum 4 words. Return only the label. Item: ${sourceTitle}; category: ${body.category || ""}; tags: ${(body.labels || []).join(", ")}.`;
  try {
    const data = await callQwen(env, prompt, false, 12000, "", qwenRoute.endpoint);
    return json({ choices: [{ message: { content: extractText(data) || sourceTitle } }] });
  } catch (error) {
    return json({ error: `Qwen title generation failed: ${errorMessage(error)}` }, 502);
  }
}

async function classifyEmoji(env, body, qwenRoute) {
  const sourceTitle = String(body.title || "").trim();
  const kind = String(body.kind || "item");
  const keys = EMOJI_KEYS_BY_KIND[kind];
  if (!sourceTitle) return json({ error: "title is required" }, 400);
  if (!keys) return json({ error: "kind must be item, sub-space, or parent-space" }, 400);

  const prompt = `You are Noma's storage classifier. Classify the user's ${kind} label. Choose exactly one icon_key from this whitelist: ${keys.join(", ")}. Return only JSON with this schema: {"title":"clean concise title in the user's language","category":"short category in the user's language","icon_key":"one whitelisted key"}. User label: ${sourceTitle}`;
  try {
    const data = await callQwen(env, prompt, true, 12000, "", qwenRoute.endpoint);
    const content = extractText(data);
    const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    if (!keys.includes(parsed.icon_key)) throw new Error("Qwen returned an icon_key outside the whitelist");
    return json({ title: String(parsed.title || sourceTitle), category: String(parsed.category || ""), icon_key: parsed.icon_key });
  } catch (error) {
    return json({ error: `Qwen emoji classification failed: ${errorMessage(error)}` }, 502);
  }
}

async function matting(env, body) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  if (!isMattingEnabled(env)) {
    console.log("[AiTiming] feature=matting outcome=disabled provider_ms=0");
    return json({ error: "Background removal is temporarily disabled", code: "MATTING_DISABLED" }, 503);
  }
  const mattingApiKey = env.PICWISH_GLOBAL_API_KEY;
  if (!mattingApiKey) return json({ error: "PICWISH_GLOBAL_API_KEY is not configured" }, 500);
  const providerStartedAt = Date.now();
  try {
    const endpoint = String(env.PICWISH_ENDPOINT || DEFAULT_PICWISH_ENDPOINT).replace(/\/+$/, "");
    const upload = new FormData();
    upload.set("sync", "1");
    upload.set("type", "object");
    upload.set("return_type", "2");
    upload.set("output_type", "2");
    upload.set("crop", "0");
    upload.set("format", "png");
    upload.set("image_file", base64ImageBlob(body.image_base64, body.mime_type || "image/jpeg"), "noma-capture.jpg");

    const createResponse = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": mattingApiKey,
      },
      body: upload,
    }, PICWISH_SYNC_TIMEOUT_MS);
    const payload = await readJsonResponse(createResponse, "PicWish synchronous matting");
    const task = picwishData(payload, "PicWish synchronous matting");
    const state = Number(task.state);
    if (state !== 1) throw new Error(`PicWish synchronous task did not complete: state=${task.state ?? "missing"}`);
    const resultBase64 = String(task.image || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
    if (!resultBase64) throw new Error("PicWish synchronous task returned no image base64");
    const resultBytes = atob(resultBase64).length;
    if (resultBytes > PICWISH_MAX_RESULT_BYTES) throw new Error("PicWish result is too large");

    console.log(`[AiTiming] feature=matting provider=picwish mode=sync task_id=${task.task_id || "unknown"} result_bytes=${resultBytes} provider_ms=${Date.now() - providerStartedAt} outcome=success`);
    return json({ result_base64: resultBase64, provider: "picwish" });
  } catch (error) {
    console.log(`[AiTiming] feature=matting provider=picwish provider_ms=${Date.now() - providerStartedAt} outcome=failed error=${errorMessage(error).slice(0, 160)}`);
    return json({ error: `Matting provider failed: ${errorMessage(error)}` }, 502);
  }
}

async function responseResult(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? data : undefined,
    error: response.ok ? undefined : String(data?.error || `HTTP ${response.status}`),
  };
}

async function processImage(env, body, qwenRoute) {
  const visionBody = {
    ...body,
    image_base64: body.vision_image_base64 || body.image_base64,
  };
  const configuredCaptureTimeout = Number(env.CAPTURE_VISION_TIMEOUT_MS);
  const captureVisionTimeoutMs = Number.isFinite(configuredCaptureTimeout)
    ? Math.min(DEFAULT_VISION_TIMEOUT_MS, Math.max(50, configuredCaptureTimeout))
    : DEFAULT_CAPTURE_VISION_TIMEOUT_MS;
  const [visionResponse, mattingResponse] = await Promise.all([
    vision(env, visionBody, qwenRoute, captureVisionTimeoutMs),
    matting(env, body),
  ]);
  const [visionResult, mattingResult] = await Promise.all([
    responseResult(visionResponse),
    responseResult(mattingResponse),
  ]);
  let recognition;
  if (visionResult.ok) {
    const content = extractText(visionResult.data);
    try {
      recognition = parseVisionResult(content);
    } catch (error) {
      console.log(`[AiTiming] feature=process-image recognition_contract=invalid error=${errorMessage(error).slice(0, 160)}`);
    }
  }
  const status = visionResult.ok || mattingResult.ok ? 200 : 502;
  console.log(`[AiTiming] feature=process-image recognition_present=${Boolean(recognition)} recognition_title=${JSON.stringify(recognition?.title || "")} matting_present=${Boolean(mattingResult.ok && mattingResult.data?.result_base64)}`);
  return json({ recognition, vision: visionResult, matting: mattingResult }, status);
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledMaintenance(env));
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") return json({
      ok: true,
      service: "noma-ai",
      version: "23",
      capabilities: {
        vision: Boolean(env.QWEN_API_KEY),
        matting: isMattingEnabled(env) && Boolean(env.PICWISH_GLOBAL_API_KEY),
      },
    });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024 * 1024) return json({ error: "Request body is too large" }, 413);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (body.type === "process-image" || body.type === "vision" || body.type === "matting") {
      const requestStartedAt = Date.now();
      if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
      const scanId = String(body.scan_id || request.headers.get("x-noma-scan-id") || "").trim();
      if (!scanId) return json({ error: "scan_id is required", code: "AI_SCAN_ID_REQUIRED" }, 400);

      let access;
      const authStartedAt = Date.now();
      try {
        // A combined capture is one billable scan. The existing RPC uses the
        // vision feature as the idempotency key while both providers run here.
        const accessFeature = body.type === "process-image" ? "vision" : body.type;
        access = await authorizeAiScan(request, env, scanId, accessFeature);
      } catch (error) {
        const status = Number(error?.status) || 500;
        const isAuthError = status === 401 || status === 403;
        return json({
          error: isAuthError ? "Please sign in again before using Noma AI" : errorMessage(error),
          code: isAuthError ? "AI_AUTH_REQUIRED" : "AI_ACCESS_CHECK_FAILED",
        }, isAuthError ? 401 : 503);
      }
      const authMs = Date.now() - authStartedAt;
      console.log(`[AiTiming] feature=${body.type} scan_id=${scanId} auth_ms=${authMs} outcome=authorized`);

      if (!access?.allowed) {
        if (access?.reason === "retry_limit") {
          return json({
            error: "This AI step has already been retried",
            code: "AI_SCAN_RETRY_LIMIT",
            planCode: access?.planCode || "free",
            remaining: access?.remaining ?? null,
          }, 409, quotaHeaders(access));
        }
        return json({
          error: "Your free AI processing credits have been used up",
          code: "AI_QUOTA_EXHAUSTED",
          planCode: access?.planCode || "free",
          limit: access?.limit ?? null,
          used: access?.used ?? null,
          remaining: 0,
        }, 429, quotaHeaders(access));
      }

      const providerStartedAt = Date.now();
      const qwenRoute = resolveQwenRoute(request, env);
      const response = body.type === "process-image"
        ? await processImage(env, body, qwenRoute)
        : body.type === "vision"
          ? await vision(env, body, qwenRoute)
          : await matting(env, body);
      const providerMs = Date.now() - providerStartedAt;
      const totalMs = Date.now() - requestStartedAt;
      console.log(`[AiTiming] feature=${body.type} scan_id=${scanId} auth_ms=${authMs} provider_ms=${providerMs} total_ms=${totalMs} status=${response.status}`);
      return withQuota(response, access, { auth: authMs, provider: providerMs, total: totalMs });
    }

    if (body.type === "title" || body.type === "emoji-classify") {
      try {
        await authenticate(request, env);
      } catch {
        return json({
          error: "Please sign in again before using Noma AI",
          code: "AI_AUTH_REQUIRED",
        }, 401);
      }
      const qwenRoute = resolveQwenRoute(request, env);
      if (body.type === "title") return title(env, body, qwenRoute);
      return classifyEmoji(env, body, qwenRoute);
    }

    return json({ error: "Unsupported request type" }, 400);
  },
};
