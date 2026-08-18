const DEFAULT_MATTING_ENDPOINT = "https://api.shiliuai.com/api/matting/v1";
const DEFAULT_QWEN_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Client-Info, X-Noma-Scan-Id",
  "Access-Control-Expose-Headers": "X-Noma-AI-Limit, X-Noma-AI-Remaining, X-Noma-Plan",
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

function withQuota(response, access) {
  const headers = new Headers(response.headers);
  Object.entries(quotaHeaders(access)).forEach(([name, value]) => headers.set(name, value));
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

async function callGemini(env, parts, { jsonMode = false, imageMode = false, model } = {}) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || env.GEMINI_MODEL || "gemini-3.5-flash")}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const generationConfig = { temperature: 0.15 };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  if (imageMode) generationConfig.responseModalities = ["TEXT", "IMAGE"];
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
  });
  return readJsonResponse(response, "Gemini");
}

async function callQwen(env, content, jsonMode = false) {
  if (!env.QWEN_API_KEY) throw new Error("QWEN_API_KEY is not configured");
  const response = await fetchWithTimeout(env.QWEN_ENDPOINT || DEFAULT_QWEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.QWEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.QWEN_MODEL || "qwen-vl-plus",
      messages: [{ role: "user", content }],
      temperature: 0.15,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  return readJsonResponse(response, "Qwen");
}

async function vision(env, body) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mimeType = body.mime_type || "image/jpeg";
  const prompt = "Identify the main object or storage location. Return only JSON: {\"title\":\"short English name\",\"category\":\"category\",\"labels\":[\"tag\"]}.";
  const failures = [];
  try {
    const data = await callGemini(env, [
      { inlineData: { mimeType, data: body.image_base64 } },
      { text: prompt },
    ], { jsonMode: true });
    const content = extractText(data);
    if (!content) throw new Error("Gemini returned empty vision content");
    return json({ choices: [{ message: { content } }] });
  } catch (error) {
    failures.push(errorMessage(error));
  }
  try {
    const dataUrl = `data:${mimeType};base64,${body.image_base64}`;
    const data = await callQwen(env, [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: prompt },
    ], true);
    const content = extractText(data);
    if (!content) throw new Error("Qwen returned empty vision content");
    return json({ choices: [{ message: { content } }] });
  } catch (error) {
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

async function matting(env, body) {
  if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
  const mattingApiKey = env.SHILIU_API_KEY || env.MATTING_API_KEY;
  if (!mattingApiKey) return json({ error: "SHILIU_API_KEY is not configured" }, 500);
  try {
    const response = await fetchWithTimeout(env.MATTING_ENDPOINT || DEFAULT_MATTING_ENDPOINT, {
      method: "POST",
      headers: {
        APIKEY: mattingApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "sync", base64: body.image_base64, crop: 0 }),
    }, 55000);
    const data = await readJsonResponse(response, "Matting");
    if (data.code !== undefined && Number(data.code) !== 0) {
      throw new Error(`code=${data.code} message=${data.msg_cn || data.msg || "unknown error"}`);
    }
    if (!data.result_base64) throw new Error("result_base64 is missing");
    return json(data);
  } catch (error) {
    return json({ error: `Matting provider failed: ${errorMessage(error)}` }, 502);
  }
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
    if (request.method === "GET") return json({ ok: true, service: "noma-ai", version: "3" });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024 * 1024) return json({ error: "Request body is too large" }, 413);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (body.type === "vision" || body.type === "matting") {
      if (!body.image_base64) return json({ error: "image_base64 is required" }, 400);
      const scanId = String(body.scan_id || request.headers.get("x-noma-scan-id") || "").trim();
      if (!scanId) return json({ error: "scan_id is required", code: "AI_SCAN_ID_REQUIRED" }, 400);

      let access;
      try {
        access = await authorizeAiScan(request, env, scanId, body.type);
      } catch (error) {
        const status = Number(error?.status) || 500;
        const isAuthError = status === 401 || status === 403;
        return json({
          error: isAuthError ? "Please sign in again before using Noma AI" : errorMessage(error),
          code: isAuthError ? "AI_AUTH_REQUIRED" : "AI_ACCESS_CHECK_FAILED",
        }, isAuthError ? 401 : 503);
      }

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

      const response = body.type === "vision" ? await vision(env, body) : await matting(env, body);
      return withQuota(response, access);
    }

    if (body.type === "title" || body.type === "generate-image") {
      try {
        await authenticate(request, env);
      } catch {
        return json({
          error: "Please sign in again before using Noma AI",
          code: "AI_AUTH_REQUIRED",
        }, 401);
      }
      if (body.type === "title") return title(env, body);
      return generateImage(env, body);
    }

    return json({ error: "Unsupported request type" }, 400);
  },
};
