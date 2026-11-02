const DEFAULT_MATTING_ENDPOINT = "https://api.shiliuai.com/api/matting/v1";
const DEFAULT_QWEN_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const EMOJI_KEYS_BY_KIND = {
  item: ["laptop", "phone", "charger", "earphones", "camera", "battery", "gamepad", "tshirt", "pants", "shoes", "hat", "bag", "ring", "pill", "bandage", "thermometer", "glasses", "book", "pen", "scissors", "folder", "key", "umbrella", "tissues", "cosmetics", "perfume", "clock", "coffee", "cup", "utensils", "apple", "wrench", "hammer", "flashlight", "lock", "basketball", "guitar", "puzzle", "tent"],
  "sub-space": ["box", "drawer", "wardrobe", "shelf", "suitcase", "safe", "trash"],
  "parent-space": ["home", "living-room", "bedroom", "kitchen", "bathroom", "balcony-garden", "office", "library-study", "car", "garage-workshop"],
};
const ITEM_CATEGORIES = ["数码用品", "衣物鞋包", "药品健康", "文具办公", "家居日用", "食品厨房", "工具杂物", "爱好运动"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Client-Info, X-Noma-Scan-Id",
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

function extractText(data) {
  return (
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() ||
    data?.choices?.[0]?.message?.content?.trim() ||
    ""
  );
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

async function callQwen(env, content, jsonMode = false, timeoutMs = 12000, modelOverride = "") {
  if (!env.QWEN_API_KEY) throw new Error("QWEN_API_KEY is not configured");
  const response = await fetchWithTimeout(env.QWEN_ENDPOINT || DEFAULT_QWEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.QWEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelOverride || env.QWEN_MODEL || "qwen-vl-plus",
      messages: [{ role: "user", content }],
      temperature: 0.15,
      max_tokens: 160,
      enable_thinking: false,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  }, timeoutMs);
  return readJsonResponse(response, "Qwen");
}

function isUpstreamTimeout(error) {
  return /timed out|timeout|abort/i.test(errorMessage(error));
}

async function vision(env, body) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mimeType = body.mime_type || "image/jpeg";
  const prompt = `Identify the main physical object. Choose exactly one category from this whitelist: ${ITEM_CATEGORIES.join(", ")}. Return only JSON: {"title":"short English name","category":"one whitelisted category","labels":["semantic tag"]}.`;
  const failures = [];
  // Prefer Qwen for users in China. Gemini remains a fallback when Qwen is
  // unavailable or returns an invalid response.
  const visionStartedAt = Date.now();
  try {
    const providerStartedAt = Date.now();
    const dataUrl = `data:${mimeType};base64,${body.image_base64}`;
    const model = env.QWEN_MODEL || "qwen-vl-plus";
    const data = await callQwen(env, [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: prompt },
    ], false, 12000, model);
    const content = extractText(data);
    if (!content) throw new Error("Qwen returned empty vision content");
    console.log(`[AiTiming] feature=vision provider=qwen model=${model} provider_ms=${Date.now() - providerStartedAt} total_ms=${Date.now() - visionStartedAt} outcome=success`);
    return json({ choices: [{ message: { content } }] });
  } catch (error) {
    const timedOut = isUpstreamTimeout(error);
    console.log(`[AiTiming] feature=vision provider=qwen total_ms=${Date.now() - visionStartedAt} outcome=${timedOut ? "timeout" : "fallback"} error=${errorMessage(error).slice(0, 240)}`);
    failures.push(errorMessage(error));
    if (timedOut) {
      return json({
        error: `Vision provider timed out: ${errorMessage(error)}`,
        code: "VISION_TIMEOUT",
      }, 504);
    }
  }
  try {
    const providerStartedAt = Date.now();
    const data = await callGemini(env, [
      { inlineData: { mimeType, data: body.image_base64 } },
      { text: prompt },
    ], { jsonMode: true, timeoutMs: 10000 });
    const content = extractText(data);
    if (!content) throw new Error("Gemini returned empty vision content");
    console.log(`[AiTiming] feature=vision provider=gemini provider_ms=${Date.now() - providerStartedAt} total_ms=${Date.now() - visionStartedAt} outcome=success`);
    return json({ choices: [{ message: { content } }] });
  } catch (error) {
    console.log(`[AiTiming] feature=vision provider=gemini total_ms=${Date.now() - visionStartedAt} outcome=failed error=${errorMessage(error).slice(0, 160)}`);
    failures.push(errorMessage(error));
  }
  return json({ error: `Vision providers failed: ${failures.join(" | ")}` }, 502);
}

async function title(env, body) {
  const sourceTitle = String(body.title || "").trim();
  if (!sourceTitle) return json({ error: "title is required" }, 400);
  const prompt = `Create one concise English storage label, maximum 4 words. Return only the label. Item: ${sourceTitle}; category: ${body.category || ""}; tags: ${(body.labels || []).join(", ")}.`;
  const failures = [];
  try {
    const data = await callGemini(env, [{ text: prompt }]);
    return json({ choices: [{ message: { content: extractText(data) || sourceTitle } }] });
  } catch (error) {
    failures.push(errorMessage(error));
  }
  try {
    const data = await callQwen(env, prompt);
    return json({ choices: [{ message: { content: extractText(data) || sourceTitle } }] });
  } catch (error) {
    failures.push(errorMessage(error));
  }
  return json({ error: `Title providers failed: ${failures.join(" | ")}` }, 502);
}

async function classifyEmoji(env, body) {
  const sourceTitle = String(body.title || "").trim();
  const kind = String(body.kind || "item");
  const keys = EMOJI_KEYS_BY_KIND[kind];
  if (!sourceTitle) return json({ error: "title is required" }, 400);
  if (!keys) return json({ error: "kind must be item, sub-space, or parent-space" }, 400);

  const prompt = `You are Noma's storage classifier. Classify the user's ${kind} label. Choose exactly one icon_key from this whitelist: ${keys.join(", ")}. Return only JSON with this schema: {"title":"clean concise title in the user's language","category":"short category in the user's language","icon_key":"one whitelisted key"}. User label: ${sourceTitle}`;
  const failures = [];
  for (const provider of ["qwen", "gemini"]) {
    try {
      const data = provider === "qwen"
        ? await callQwen(env, prompt, true)
        : await callGemini(env, [{ text: prompt }], { jsonMode: true });
      const content = extractText(data);
      const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
      if (!keys.includes(parsed.icon_key)) throw new Error("Provider returned an icon_key outside the whitelist");
      return json({ title: String(parsed.title || sourceTitle), category: String(parsed.category || ""), icon_key: parsed.icon_key });
    } catch (error) {
      failures.push(`${provider}: ${errorMessage(error)}`);
    }
  }
  return json({ error: `Emoji classification providers failed: ${failures.join(" | ")}` }, 502);
}

async function matting(env, body) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mattingApiKey = env.SHILIU_API_KEY || env.MATTING_API_KEY;
  if (!mattingApiKey) return json({ error: "SHILIU_API_KEY is not configured" }, 500);
  const providerStartedAt = Date.now();
  try {
    const response = await fetchWithTimeout(env.MATTING_ENDPOINT || DEFAULT_MATTING_ENDPOINT, {
      method: "POST",
      headers: {
        APIKEY: mattingApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "sync", base64: body.image_base64, crop: 0 }),
    }, 12000);
    const data = await readJsonResponse(response, "Matting");
    if (data.code !== undefined && Number(data.code) !== 0) {
      throw new Error(`code=${data.code} message=${data.msg_cn || data.msg || "unknown error"}`);
    }
    if (!data.result_base64) throw new Error("result_base64 is missing");
    console.log(`[AiTiming] feature=matting provider=shiliu provider_ms=${Date.now() - providerStartedAt} outcome=success`);
    return json(data);
  } catch (error) {
    console.log(`[AiTiming] feature=matting provider=shiliu provider_ms=${Date.now() - providerStartedAt} outcome=failed error=${errorMessage(error).slice(0, 160)}`);
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

async function processImage(env, body) {
  const visionBody = {
    ...body,
    image_base64: body.vision_image_base64 || body.image_base64,
  };
  const [visionResponse, mattingResponse] = await Promise.all([
    vision(env, visionBody),
    matting(env, body),
  ]);
  const [visionResult, mattingResult] = await Promise.all([
    responseResult(visionResponse),
    responseResult(mattingResponse),
  ]);
  const status = visionResult.ok || mattingResult.ok ? 200 : 502;
  return json({ vision: visionResult, matting: mattingResult }, status);
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
      version: "11",
      capabilities: {
        vision: Boolean(env.QWEN_API_KEY || env.GEMINI_API_KEY),
        matting: Boolean(env.SHILIU_API_KEY || env.MATTING_API_KEY),
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
      const response = body.type === "process-image"
        ? await processImage(env, body)
        : body.type === "vision"
          ? await vision(env, body)
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
      if (body.type === "title") return title(env, body);
      if (body.type === "emoji-classify") return classifyEmoji(env, body);
      return generateImage(env, body);
    }

    return json({ error: "Unsupported request type" }, 400);
  },
};
