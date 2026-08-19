/**
 * Unified Background Removal Service for Noma
 * Supporting local development and the Cloudflare Worker-backed production matting flow.
 */

import { NOMA_AI_URL } from "./backendUrls";
import { AiAccessError, getAiAuthHeaders } from "./aiAuth";

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

const MATTING_MAX_DIMENSION = 768;
const MATTING_JPEG_QUALITY = 0.72;
const MATTING_REQUEST_TIMEOUT_MS = 20_000;

type PreparedMattingInput = {
  base64: string;
  originalBytes: number;
  uploadBytes: number;
  originalWidth: number;
  originalHeight: number;
  uploadWidth: number;
  uploadHeight: number;
};

const stripDataUrlPrefix = (value: string): string => {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
};

const estimateBase64Bytes = (base64: string): number => {
  const clean = base64.replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

const loadImageElement = (imageSrc: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!imageSrc.startsWith("data:") && !imageSrc.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image before matting upload"));
    img.src = imageSrc;
  });
};

async function prepareMattingInput(imageSrc: string): Promise<PreparedMattingInput> {
  const [originalDataUrl, img] = await Promise.all([
    getBase64FromImageSrc(imageSrc),
    loadImageElement(imageSrc),
  ]);
  const originalBase64 = stripDataUrlPrefix(originalDataUrl);
  const originalWidth = img.naturalWidth || img.width || 1;
  const originalHeight = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, MATTING_MAX_DIMENSION / Math.max(originalWidth, originalHeight));
  const uploadWidth = Math.max(1, Math.round(originalWidth * scale));
  const uploadHeight = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = uploadWidth;
  canvas.height = uploadHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      base64: originalBase64,
      originalBytes: estimateBase64Bytes(originalBase64),
      uploadBytes: estimateBase64Bytes(originalBase64),
      originalWidth,
      originalHeight,
      uploadWidth: originalWidth,
      uploadHeight: originalHeight,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, uploadWidth, uploadHeight);
  ctx.drawImage(img, 0, 0, uploadWidth, uploadHeight);

  const optimizedBase64 = stripDataUrlPrefix(canvas.toDataURL("image/jpeg", MATTING_JPEG_QUALITY));
  const shouldUseOptimized = scale < 1 || optimizedBase64.length < originalBase64.length;
  const selectedBase64 = shouldUseOptimized ? optimizedBase64 : originalBase64;

  return {
    base64: selectedBase64,
    originalBytes: estimateBase64Bytes(originalBase64),
    uploadBytes: estimateBase64Bytes(selectedBase64),
    originalWidth,
    originalHeight,
    uploadWidth: shouldUseOptimized ? uploadWidth : originalWidth,
    uploadHeight: shouldUseOptimized ? uploadHeight : originalHeight,
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
 * Utility to convert any image source (Base64 data URL, blob URL, or standard URL)
 * into a standard binary Blob file ready for form data upload.
 */
async function getBlobFromImageSrc(imageSrc: string): Promise<Blob> {
  if (imageSrc.startsWith("data:") || imageSrc.startsWith("blob:")) {
    const res = await fetch(imageSrc);
    return await res.blob();
  }
  // Standard URL fetch (may have CORS limitations depending on the asset origin)
  const res = await fetch(imageSrc);
  return await res.blob();
}

/**
 * Utility to convert any image source (Base64 data URL, blob URL, or standard URL)
 * into a standard Base64 Data URL string.
 */
async function getBase64FromImageSrc(imageSrc: string): Promise<string> {
  if (imageSrc.startsWith("data:")) {
    return imageSrc;
  }
  const blob = await getBlobFromImageSrc(imageSrc);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("Failed to convert image blob to base64"));
    };
    reader.readAsDataURL(blob);
  });
}

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
  imageSrc: string,
  onProgress?: (progress: string | null) => void,
  scanId?: string,
): Promise<string> {
  console.log("[RemoveBgService] Entering remove_background with unified worker.");

  try {
    if (REMOVE_BG_CONFIG.mode === "local") {
      throw new Error("Local background removal is no longer supported");
    }

    // 统一 API 拦截
    let isApiEnabled = true;
    try {
      isApiEnabled = localStorage.getItem("IS_API_ENABLED") !== "false";
    } catch (e) {
      console.warn("[RemoveBgService] Failed to read IS_API_ENABLED from localStorage:", e);
    }
    if (!isApiEnabled) {
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
      `[RemoveBgTiming] Prepared ${preparedInput.originalWidth}x${preparedInput.originalHeight} -> ` +
      `${preparedInput.uploadWidth}x${preparedInput.uploadHeight} in ${preparationMs.toFixed(0)}ms; ` +
      `${(preparedInput.originalBytes / 1024).toFixed(0)}KB -> ` +
      `${(preparedInput.uploadBytes / 1024).toFixed(0)}KB (${(reduction * 100).toFixed(0)}% smaller).`
    );

    if (onProgress) onProgress("Uploading and extracting subject...");
    const workerUrl = NOMA_AI_URL;
    console.log(`[RemoveBgService] Fetching from proxy ${workerUrl} with type: 'matting'. origin=${window.location.origin} apiEnabled=true`);

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
