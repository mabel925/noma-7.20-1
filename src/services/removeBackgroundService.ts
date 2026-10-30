/**
 * Unified Background Removal Service for Noma
 * Supporting local development and the Cloudflare Worker-backed production matting flow.
 */

import { NOMA_AI_URL } from "./backendUrls";
import { AiAccessError, getAiAuthHeaders } from "./aiAuth";
import { isApiEnabled, prepareImage } from "./aiService";

export type CutoutMode = "api" | "local";

export interface RemoveBgConfig {
  // Current active mode: "api" or "local" (default to "api", "local" is deprecated)
  mode: CutoutMode;
  
  // Local python rembg service configuration
  local: {
    // The endpoint of your local running rembg service (e.g. FastAPI, Flask)
    endpoint: string;
    // The parameter name for the image file form upload (usually 'file' or 'image')
    paramName: string;
  };
  
  // Production cloud API configuration
  api: {
    // The cloud provider type
    provider: "removebg" | "photoroom" | "picwish" | "shiliu" | "custom";
    // The target URL endpoint
    endpoint: string;
    // Additional custom HTTP request headers reserved for future scale
    headers: Record<string, string>;
  };
}

/**
 * Global Configuration for Background Removal
 * Production calls are routed through the Cloudflare Worker; no browser-side key is required.
 */
const DEFAULT_CONFIG: RemoveBgConfig = {
  mode: "api", 
  
  local: {
    endpoint: "http://localhost:5000/api/remove", // Typical local python rembg endpoint
    paramName: "file"
  },
  
  api: {
    provider: "shiliu",
    endpoint: "https://api.shiliuai.com/api/matting/v1",
    headers: {}
  }
};

const MATTING_MAX_DIMENSION = 512;
const MATTING_REQUEST_TIMEOUT_MS = 15_000;

type PreparedMattingInput = {
  base64: string;
  originalBytes: number;
  uploadBytes: number;
};

const stripDataUrlPrefix = (value: string): string => {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
};

const estimateBase64Bytes = (base64: string): number => {
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

async function prepareMattingInput(imageSrc: string | Blob): Promise<PreparedMattingInput> {
  const optimizedDataUrl = await prepareImage(imageSrc, MATTING_MAX_DIMENSION);
  const selectedBase64 = stripDataUrlPrefix(optimizedDataUrl);
  const originalBase64 = typeof imageSrc === "string" && imageSrc.startsWith("data:")
    ? stripDataUrlPrefix(imageSrc)
    : "";

  return {
    base64: selectedBase64,
    originalBytes: imageSrc instanceof Blob ? imageSrc.size : estimateBase64Bytes(originalBase64),
    uploadBytes: estimateBase64Bytes(selectedBase64),
  };
}

/**
 * Loads configuration from browser local storage, falling back to default values.
 */
export function loadRemoveBgConfig(): RemoveBgConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const saved = localStorage.getItem("NOMA_REMOVE_BG_CONFIG");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Deep merge / safeguard default keys
      const loadedConfig: RemoveBgConfig = {
        mode: parsed.mode === "local" ? "local" : "api",
        local: { ...DEFAULT_CONFIG.local, ...parsed.local },
        api: { ...DEFAULT_CONFIG.api, ...parsed.api }
      };
      // Migrate the retired Aliyun proxy configuration to the official Shiliu endpoint.
      if (loadedConfig.api.endpoint?.includes("fcapp.run")) {
        loadedConfig.api.provider = "shiliu";
        loadedConfig.api.endpoint = "https://api.shiliuai.com/api/matting/v1";
      }
      return loadedConfig;
    }
  } catch (err) {
    console.warn("[RemoveBgService] Failed to load config from localStorage:", err);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Persists the configuration into local storage and updates the in-memory shared object.
 */
export function saveRemoveBgConfig(config: RemoveBgConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("NOMA_REMOVE_BG_CONFIG", JSON.stringify(config));
    // Update the in-memory exported reference dynamically so import users get live values
    Object.assign(REMOVE_BG_CONFIG, config);
    console.log("[RemoveBgService] Configuration successfully saved to localStorage.", config);
  } catch (err) {
    console.warn("[RemoveBgService] Failed to save config to localStorage:", err);
  }
}

/**
 * Global Configuration for Background Removal
 * Loaded dynamically on startup and mutable at runtime via saveRemoveBgConfig().
 */
export const REMOVE_BG_CONFIG: RemoveBgConfig = loadRemoveBgConfig();

/**
 * Unified decoupled Background Removal API.
 * Dispatches to local python rembg or custom APIs depending on active configuration mode.
 * Throws when cloud matting is unavailable so the caller can use the original photo thumbnail.
 *
 * @param imageSrc Base64 URL or binary Blob URL of the image to process.
 * @param onProgress Optional callback to receive status updates for the UI.
 * @returns Promise resolving to a transparent PNG data/blob URL.
 */
export async function remove_background(
  imageSrc: string | Blob,
  onProgress?: (progress: string | null) => void,
  scanId?: string,
): Promise<string> {
  console.log("[RemoveBgService] Entering remove_background with unified worker.");

  try {
    if (REMOVE_BG_CONFIG.mode === "local") {
      throw new Error("Local background removal is no longer supported");
    }

    // 统一 API 拦截
    if (!isApiEnabled()) {
      throw new Error("Cloud background removal is disabled");
    }

    const totalStartedAt = performance.now();
    if (onProgress) onProgress("Optimizing image upload...");
    const preparationStartedAt = performance.now();
    const preparedInput = await prepareMattingInput(imageSrc);
    const preparationMs = performance.now() - preparationStartedAt;
    const reduction = preparedInput.originalBytes > 0
      ? Math.max(0, 1 - preparedInput.uploadBytes / preparedInput.originalBytes)
      : 0;
    console.info(
      `[RemoveBgTiming] Prepared shared ${MATTING_MAX_DIMENSION}px input in ${preparationMs.toFixed(0)}ms; ` +
      `${(preparedInput.originalBytes / 1024).toFixed(0)}KB -> ` +
      `${(preparedInput.uploadBytes / 1024).toFixed(0)}KB (${(reduction * 100).toFixed(0)}% smaller).`
    );

    if (onProgress) onProgress("Uploading and extracting subject...");
    const workerUrl = NOMA_AI_URL;
    console.log(`[RemoveBgService] Fetching from proxy ${workerUrl} with type: 'matting'. origin=${window.location.origin} apiEnabled=${isApiEnabled()}`);

    const requestBody = JSON.stringify({
      type: "matting",
      image_base64: preparedInput.base64,
      ...(scanId ? { scan_id: scanId } : {}),
    });
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), MATTING_REQUEST_TIMEOUT_MS);
    const requestStartedAt = performance.now();
    let response: Response;
    try {
      response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAiAuthHeaders(scanId)),
        },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Matting request timed out after ${MATTING_REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw error;
    } finally {
      window.clearTimeout(requestTimeout);
    }

    const responseStartedAt = performance.now();
    const responseText = await response.text();
    const responseFinishedAt = performance.now();
    console.info(
      `[RemoveBgTiming] Worker/provider wait ${(responseStartedAt - requestStartedAt).toFixed(0)}ms; ` +
      `response download ${(responseFinishedAt - responseStartedAt).toFixed(0)}ms; ` +
      `total ${(responseFinishedAt - totalStartedAt).toFixed(0)}ms.`
    );
    if (!response.ok) {
      let detail = responseText.replace(/\s+/g, " ").trim().slice(0, 500);
      try {
        const parsed = JSON.parse(responseText);
        detail = typeof parsed?.error === "string" ? parsed.error : JSON.stringify(parsed);
      } catch {
        // Keep the plain-text Worker response as the diagnostic detail.
      }
      let code: string | undefined;
      let remaining: number | null | undefined;
      try {
        const parsed = JSON.parse(responseText);
        code = typeof parsed?.code === "string" ? parsed.code : undefined;
        remaining = parsed?.remaining === undefined ? undefined : parsed.remaining;
      } catch {
        // Keep the plain-text response detail.
      }
      if (code === "AI_AUTH_REQUIRED" || code === "AI_QUOTA_EXHAUSTED" || code === "AI_ACCESS_CHECK_FAILED") {
        throw new AiAccessError(code, detail, response.status, remaining);
      }
      throw new Error(`Worker proxy returned status ${response.status}: ${detail || "(empty response body)"}`);
    }

    const result = JSON.parse(responseText);
    if (result && result.result_base64) {
      let b64 = result.result_base64;
      if (!b64.startsWith("data:")) {
        b64 = "data:image/png;base64," + b64;
      }
      if (onProgress) onProgress(null);
      console.log("[RemoveBgService] Matting succeeded via unified worker!");
      return b64;
    }
    const workerMessage = result?.msg_cn || result?.msg || "Worker response does not contain result_base64 property";
    const workerCode = result?.code !== undefined ? ` (code ${result.code})` : "";
    throw new Error(`Worker matting failed${workerCode}: ${workerMessage}`);
  } catch (err: any) {
    if (onProgress) onProgress(null);
    if (err instanceof AiAccessError) throw err;
    console.warn(`[RemoveBgService] Matting failed: ${err.message || err}. Using the caller's photo thumbnail fallback.`);
    throw err;
  }
}
