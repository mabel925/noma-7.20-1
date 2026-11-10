const DEFAULT_PICWISH_ENDPOINT = "https://techsz.aoscdn.com/api/tasks/visual/segmentation";
const PICWISH_POLL_INTERVAL_MS = 1000;
const PICWISH_TOTAL_TIMEOUT_MS = 14000;
const PICWISH_MAX_RESULT_BYTES = 8 * 1024 * 1024;
const DEFAULT_QWEN_ENDPOINT = "https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
const DEFAULT_QWEN_GLOBAL_ENDPOINT = "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
const DEFAULT_QWEN_MODEL = "qwen3.7-flash";

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

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured");
  }
  return { url, key };
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function picwishData(payload, operation) {
  if (Number(payload?.status) !== 200) {
    throw new Error(`${operation} failed: status=${payload?.status ?? "missing"} message=${payload?.message || "unknown error"}`);
  }
  return payload?.data || {};
}

const delay = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

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

async function callGemini(env, parts, { jsonMode = false, imageMode = false, model, timeoutMs = 12000 } = {}) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || env.GEMINI_MODEL || "gemini-3.5-flash")}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const generationConfig = { temperature: 0.15 };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  if (imageMode) generationConfig.responseModalities = ["TEXT", "IMAGE"];
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
  }, timeoutMs);
  return readJsonResponse(response, "Gemini");
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

async function vision(env, body, qwenRoute) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mimeType = body.mime_type || "image/jpeg";
  const prompt = `Identify the main physical object. The title must be a specific common English name for the visible object. Never use generic placeholders such as item, object, scanned item, scanned items, unknown item, or unidentified object. Choose exactly one category from this whitelist: ${ITEM_CATEGORIES.join(", ")}. Return only JSON: {"title":"specific short English object name","category":"one whitelisted category","labels":["semantic tag"]}.`;
  const visionStartedAt = Date.now();
  const dataUrl = `data:${mimeType};base64,${body.image_base64}`;
  const model = env.QWEN_MODEL || DEFAULT_QWEN_MODEL;
  const providerStartedAt = Date.now();
  try {
    const data = await callQwen(env, [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: prompt },
    ], true, 12000, model, qwenRoute.endpoint);
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
  const mattingApiKey = env.PICWISH_API_KEY;
  if (!mattingApiKey) return json({ error: "PICWISH_API_KEY is not configured" }, 500);
  const providerStartedAt = Date.now();
  try {
    const endpoint = String(env.PICWISH_ENDPOINT || DEFAULT_PICWISH_ENDPOINT).replace(/\/+$/, "");
    const upload = new FormData();
    upload.set("sync", "0");
    upload.set("type", "object");
    upload.set("return_type", "1");
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
    }, 8000);
    const createPayload = await readJsonResponse(createResponse, "PicWish create task");
    const taskId = String(picwishData(createPayload, "PicWish create task").task_id || "").trim();
    if (!taskId) throw new Error("PicWish create task returned no task_id");

    const deadline = providerStartedAt + PICWISH_TOTAL_TIMEOUT_MS;
    let resultUrl = "";
    let pollCount = 0;
    while (Date.now() < deadline) {
      pollCount += 1;
      const remainingMs = deadline - Date.now();
      const pollResponse = await fetchWithTimeout(`${endpoint}/${encodeURIComponent(taskId)}`, {
        headers: { "X-API-KEY": mattingApiKey },
      }, Math.max(500, Math.min(5000, remainingMs)));
      const pollPayload = await readJsonResponse(pollResponse, "PicWish query task");
      const task = picwishData(pollPayload, "PicWish query task");
      const state = Number(task.state);
      if (state === 1) {
        resultUrl = String(task.image || "").trim();
        if (!resultUrl) throw new Error("PicWish completed task returned no image URL");
        break;
      }
      if (state < 0) {
        throw new Error(`PicWish task failed: state=${state} message=${pollPayload?.message || "unknown error"}`);
      }
      await delay(Math.min(PICWISH_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    }
    if (!resultUrl) throw new Error(`PicWish task timed out after ${PICWISH_TOTAL_TIMEOUT_MS / 1000}s`);

    const parsedResultUrl = new URL(resultUrl);
    if (parsedResultUrl.protocol !== "https:") throw new Error("PicWish returned a non-HTTPS result URL");
    const resultResponse = await fetchWithTimeout(parsedResultUrl.toString(), {}, Math.max(500, Math.min(5000, deadline - Date.now())));
    if (!resultResponse.ok) throw new Error(`PicWish result download HTTP ${resultResponse.status}`);
    const declaredLength = Number(resultResponse.headers.get("content-length") || 0);
    if (declaredLength > PICWISH_MAX_RESULT_BYTES) throw new Error("PicWish result is too large");
    const resultBuffer = await resultResponse.arrayBuffer();
    if (!resultBuffer.byteLength || resultBuffer.byteLength > PICWISH_MAX_RESULT_BYTES) {
      throw new Error(resultBuffer.byteLength ? "PicWish result is too large" : "PicWish result is empty");
    }

    console.log(`[AiTiming] feature=matting provider=picwish task_id=${taskId} polls=${pollCount} result_bytes=${resultBuffer.byteLength} provider_ms=${Date.now() - providerStartedAt} outcome=success`);
    return json({ result_base64: arrayBufferToBase64(resultBuffer), provider: "picwish" });
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
  const [visionResponse, mattingResponse] = await Promise.all([
    vision(env, visionBody, qwenRoute),
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

async function generateImage(env, body) {
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return json({ error: "prompt is required" }, 400);
  try {
    const data = await callGemini(env, [{ text: prompt }], {
      imageMode: true,
      model: env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    });
    const part = data?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData || item.inline_data);
    const base64 = part?.inlineData?.data || part?.inline_data?.data;
    if (!base64) throw new Error("Gemini did not return image data");
    return json({ base64, result_base64: base64 });
  } catch (error) {
    return json({ error: `Image generation failed: ${errorMessage(error)}` }, 502);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") return json({
      ok: true,
      service: "noma-ai",
      version: "19",
      capabilities: {
        vision: Boolean(env.QWEN_API_KEY),
        matting: Boolean(env.PICWISH_API_KEY),
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

    if (body.type === "title" || body.type === "generate-image" || body.type === "emoji-classify") {
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
      if (body.type === "emoji-classify") return classifyEmoji(env, body, qwenRoute);
      return generateImage(env, body);
    }

    return json({ error: "Unsupported request type" }, 400);
  },
};
