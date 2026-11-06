import { NOMA_AI_URL } from "./backendUrls";
import { AiAccessError, getAiAuthHeaders } from "./aiAuth";
import { classifyEmojiLocally, EMOJI_CATALOG, EMOJI_KEY_SET, normalizeItemCategory, type EmojiKind } from "../data/emojiCatalog";

export interface RecognitionResult {
  title: string;
  category: string;
  labels: string[];
}

export interface EmojiClassificationResult {
  title: string;
  category: string;
  icon_key: string;
}

/**
 * Helper to strip the Base64 prefix (e.g. data:image/png;base64,) if present
 */
export function stripBase64Prefix(base64Str: string): string {
  if (!base64Str) return "";
  if (base64Str.includes(",")) {
    return base64Str.split(",")[1];
  }
  if (base64Str.startsWith("data:")) {
    const commaIndex = base64Str.indexOf(",");
    if (commaIndex !== -1) {
      return base64Str.substring(commaIndex + 1);
    }
  }
  return base64Str;
}

/**
 * Compress image using canvas to a maximum width (800) and 0.7 quality to minimize data size for Worker API.
 * This satisfies user request to reduce token consumption significantly.
 */
let recentImagePreparation: {
  input: File | Blob | string;
  maxWidth: number;
  promise: Promise<string>;
} | null = null;

let recentImageVariantsPreparation: {
  input: File | Blob | string;
  widthsKey: string;
  promise: Promise<Record<number, string>>;
} | null = null;

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Image conversion failed"));
  reader.readAsDataURL(blob);
});

async function compressImageVariants(
  imageInput: File | Blob | string,
  maxWidths: number[],
): Promise<Record<number, string>> {
  const widths = [...new Set(maxWidths.map((width) => Math.max(1, Math.round(width))))];
  const source = imageInput instanceof Blob
    ? imageInput
    : await fetch(
        imageInput.startsWith("data:") || imageInput.startsWith("http") || imageInput.startsWith("blob:")
          ? imageInput
          : `data:image/jpeg;base64,${imageInput}`,
      ).then((response) => response.blob());

  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch {
      // Older mobile WebKit builds use the image element fallback below.
    }
  }

  const objectUrl = bitmap ? "" : URL.createObjectURL(source);
  const image = bitmap ? null : await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Image decoding failed"));
    element.src = objectUrl;
  });

  try {
    const sourceWidth = bitmap?.width || image?.naturalWidth || image?.width || 1;
    const sourceHeight = bitmap?.height || image?.naturalHeight || image?.height || 1;
    const entries = await Promise.all(widths.map(async (maxWidth) => {
      const ratio = Math.min(maxWidth / sourceWidth, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * ratio));
      canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return [maxWidth, await blobToDataUrl(source)] as const;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap || image!, 0, 0, canvas.width, canvas.height);
      const compressedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
      if (!compressedBlob) throw new Error("Image compression failed");
      return [maxWidth, await blobToDataUrl(compressedBlob)] as const;
    }));
    return Object.fromEntries(entries) as Record<number, string>;
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function prepareImageVariants(
  imageInput: File | Blob | string,
  maxWidths: number[],
): Promise<Record<number, string>> {
  const widthsKey = [...new Set(maxWidths)].sort((a, b) => a - b).join(",");
  if (
    recentImageVariantsPreparation &&
    recentImageVariantsPreparation.input === imageInput &&
    recentImageVariantsPreparation.widthsKey === widthsKey
  ) {
    return recentImageVariantsPreparation.promise;
  }

  const promise = compressImageVariants(imageInput, maxWidths);
  recentImageVariantsPreparation = { input: imageInput, widthsKey, promise };
  promise.catch(() => {
    if (recentImageVariantsPreparation?.promise === promise) recentImageVariantsPreparation = null;
  });
  return promise;
}

async function compressImage(imageInput: File | Blob | string, maxWidth: number): Promise<string> {
  console.log(`[Image Compressor] Compressing image with maxWidth ${maxWidth}, quality 0.7...`);
  const source = imageInput instanceof Blob
    ? imageInput
    : await fetch(
        imageInput.startsWith("data:") || imageInput.startsWith("http") || imageInput.startsWith("blob:")
          ? imageInput
          : `data:image/jpeg;base64,${imageInput}`,
      ).then((response) => response.blob());

  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the image element path for older mobile WebKit builds.
    }
  }

  const objectUrl = bitmap ? "" : URL.createObjectURL(source);
  const image = bitmap ? null : await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Vision image decoding failed"));
    element.src = objectUrl;
  }).finally(() => URL.revokeObjectURL(objectUrl));

  const sourceWidth = bitmap?.width || image?.naturalWidth || image?.width || 1;
  const sourceHeight = bitmap?.height || image?.naturalHeight || image?.height || 1;
  const ratio = Math.min(maxWidth / sourceWidth, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * ratio));
  canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    bitmap?.close();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Vision image conversion failed"));
      reader.readAsDataURL(source);
    });
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap || image!, 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  const compressedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
  if (!compressedBlob) throw new Error("Vision image compression failed");
  const compressed = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Vision image conversion failed"));
    reader.readAsDataURL(compressedBlob);
  });
  console.log(`[Image Compressor] Compression done. Original dimensions: ${sourceWidth}x${sourceHeight}, New dimensions: ${canvas.width}x${canvas.height}`);
  return compressed;
}

export function prepareImage(imageInput: File | Blob | string, maxWidth = 800): Promise<string> {
  if (
    recentImagePreparation &&
    recentImagePreparation.input === imageInput &&
    recentImagePreparation.maxWidth === maxWidth
  ) {
    return recentImagePreparation.promise;
  }

  const promise = compressImage(imageInput, maxWidth);
  recentImagePreparation = { input: imageInput, maxWidth, promise };
  promise.catch(() => {
    if (recentImagePreparation?.promise === promise) recentImagePreparation = null;
  });
  return promise;
}

/**
 * Check if remote API is enabled.
 */
export function isApiEnabled(): boolean {
  try {
    const saved = localStorage.getItem("IS_API_ENABLED");
    return saved !== "false";
  } catch (e) {
    return true;
  }
}

const NOMA_BACKEND_URL = NOMA_AI_URL;
const AI_REQUEST_TIMEOUT_MS = 18_000;

function getRequestOrigin(): string {
  return typeof window === "undefined" ? "server" : window.location.origin;
}

function getClientBuildId(): string {
  try {
    return new URL(import.meta.url).pathname.split("/").pop() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Unified request sender function to Noma Cloudflare Workers Backend
 */
export async function callNomaBackend(type: "process-image" | "matting" | "vision" | "title" | "emoji-classify", payload: any, scanId?: string): Promise<any> {
  if (!isApiEnabled()) {
    console.log(`[API Intercept] IS_API_ENABLED is false. Returning high-fidelity mock data for type "${type}". origin=${getRequestOrigin()}`);
    // Add artificial delay for realistic simulation
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (type === "process-image") {
      return {
        vision: { ok: true, data: { choices: [{ message: { content: JSON.stringify({ title: "Aesthetic Mug", category: "家居日用", labels: ["mug"] }) } }] } },
        matting: { ok: true, data: { result_base64: payload.image_base64 || "" } },
      };
    } else if (type === "vision") {
      // 识物或空间分类的高拟真 Mock，保持结构完美匹配真实 Cloudflare Worker
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Aesthetic Mug",
                category: "家居日用",
                labels: ["mug", "cup", "ceramic"]
              })
            }
          }
        ]
      };
    } else if (type === "emoji-classify") {
      return classifyEmojiLocally(String(payload.title || ""), payload.kind || "item");
    } else if (type === "title") {
      // 标题美化 Mock 数据
      return {
        choices: [
          {
            message: {
              content: "Aesthetic Mug"
            }
          }
        ]
      };
    } else if (type === "matting") {
      // 抠图接口 Mock，直接将原始 Base64 作为结果返回
      return {
        result_base64: payload.image_base64 || ""
      };
    }
  }

  console.log(`[Noma Backend] Sending request of type "${type}" to ${NOMA_BACKEND_URL}. origin=${getRequestOrigin()} apiEnabled=${isApiEnabled()}`);

  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const authHeaders = await getAiAuthHeaders(scanId);
    response = await fetch(NOMA_BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Noma-Client-Build": getClientBuildId(),
        ...authHeaders,
      },
      body: JSON.stringify({
        type,
        ...(scanId ? { scan_id: scanId } : {}),
        ...payload
      }),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error instanceof AiAccessError) throw error;
    if (controller.signal.aborted) {
      throw new Error(`Worker request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`Worker request could not be sent from ${getRequestOrigin()}: ${error?.message || "network/CORS failure"}`);
  } finally {
    window.clearTimeout(timeout);
  }

  const responseText = await response.text();
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
    throw new Error(`Worker proxy returned status ${response.status}: ${detail || "(empty response body)"} [origin: ${getRequestOrigin()}]`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`Worker returned invalid JSON [origin: ${getRequestOrigin()}]`);
  }
}

export async function classifyEmojiText(title: string, kind: EmojiKind): Promise<EmojiClassificationResult> {
  const fallback = classifyEmojiLocally(title, kind);
  try {
    const result = await callNomaBackend("emoji-classify", { title, kind });
    const iconKey = String(result?.icon_key || "");
    if (!EMOJI_KEY_SET.has(iconKey)) return fallback;
    const catalogEntry = EMOJI_CATALOG.find((entry) => entry.key === iconKey && entry.kind === kind);
    if (!catalogEntry) return fallback;
    return {
      title: String(result?.title || title).trim() || title.trim(),
      category: catalogEntry.category,
      icon_key: iconKey,
    };
  } catch (error) {
    console.warn("[Emoji Classifier] Falling back to the local whitelist:", error);
    return fallback;
  }
}

/**
 * Parse vision content string which can be a JSON string, a markdown JSON block, or raw plain text.
 */
export function parseVisionContent(content: string): { title: string; category: string; labels: string[] } {
  console.log("[AI Parser] Parsing vision content string:", content);
  
  let title = "Scanned Item";
  let category = "";
  let labels: string[] = ["item"];

  if (!content) {
    return { title, category: "家居日用", labels };
  }

  const trimmed = content.trim();
  let jsonString = trimmed;

  // Extract JSON from markdown code block if present
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = trimmed.match(codeBlockRegex);
  if (match) {
    jsonString = match[1].trim();
  }

  if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
    try {
      const parsed = JSON.parse(jsonString);
      console.log("[AI Parser] Successfully parsed JSON content:", parsed);
      
      title = parsed.title || parsed.name || parsed.item || parsed.itemName || title;
      category = parsed.category || parsed.label || parsed.type || category;
      
      if (Array.isArray(parsed.labels)) {
        labels = parsed.labels;
      } else if (Array.isArray(parsed.tags)) {
        labels = parsed.tags;
      } else if (typeof parsed.labels === "string") {
        labels = [parsed.labels];
      }
      
      return { title, category: normalizeItemCategory(category, title, labels), labels };
    } catch (e) {
      console.warn("[AI Parser] Content looked like JSON but failed to parse, falling back to plain text:", e);
    }
  }

  console.log("[AI Parser] Parsing as plain text fallback...");
  const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    title = lines[0].replace(/^[-*+\d\.\s]+/g, "");
  }
  
  const words = title.split(/[\s,，、]+/);
  labels = words.filter(w => w.length > 1).slice(0, 5);
  if (labels.length === 0) {
    labels = ["item"];
  }

  return { title, category: normalizeItemCategory(category, title, labels), labels };
}

/**
 * Intelligent AI Orchestrator.
 * Fully migrated to Cloudflare Worker backend.
 */
export async function recognizeImage(
  imageInput: File | Blob | string,
  mimeType: string = "image/png",
  scanId?: string,
): Promise<RecognitionResult> {
  console.log("[AI Dispatcher] Initializing image recognition...");
  
  try {
    // Object recognition does not need the larger matting input. Keep this
    // request small so it can finish while the cutout is still processing.
    const compressedBase64WithPrefix = await prepareImage(imageInput, 512);
    const pureBase64 = stripBase64Prefix(compressedBase64WithPrefix);
    if (!pureBase64) throw new Error("Vision image preparation returned no data");
    const result = await callNomaBackend("vision", {
      image_base64: pureBase64,
      mime_type: "image/jpeg",
    }, scanId);
    console.log("[AI Dispatcher] Worker raw response:", result);

    let content = "";
    if (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      content = result.choices[0].message.content;
      console.log("[AI Dispatcher] Extracted vision content from choices[0].message.content:", content);
    } else if (result && result.content) {
      content = result.content;
      console.log("[AI Dispatcher] Extracted vision content from content field:", content);
    } else if (typeof result === "string") {
      content = result;
      console.log("[AI Dispatcher] Extracted vision content from string response:", content);
    } else {
      console.log("[AI Dispatcher] No standard content/choices found, mapping result directly if possible:", result);
      const directResult = result?.result || result?.data || result || {};
      const title = directResult.title || directResult.name || "Scanned Item";
      const labels = directResult.labels || directResult.tags || ["item"];
      return {
        title,
        category: normalizeItemCategory(directResult.category || "", title, labels),
        labels,
      };
    }

    const parsed = parseVisionContent(content);
    console.log("[AI Dispatcher] Final parsed result:", parsed);
    return parsed;
  } catch (err: any) {
    if (err instanceof AiAccessError) throw err;
    console.error("[AI Dispatcher] Failed to recognize image via unified worker:", err.message || err);
    throw err;
  }
}

export interface CapturedImageProcessingResult {
  recognition: RecognitionResult | null;
  cutoutDataUrl: string | null;
  visionError: string | null;
  mattingError: string | null;
}

export async function processCapturedImage(
  imageInput: File | Blob | string,
  scanId: string,
): Promise<CapturedImageProcessingResult> {
  const prepared = await prepareImageVariants(imageInput, [512, 384]);
  const mattingBase64 = stripBase64Prefix(prepared[512]);
  const visionBase64 = stripBase64Prefix(prepared[384]);
  if (!mattingBase64 || !visionBase64) throw new Error("Image preparation returned no data");

  const result = await callNomaBackend("process-image", {
    image_base64: mattingBase64,
    vision_image_base64: visionBase64,
    mime_type: "image/jpeg",
  }, scanId);

  const directRecognition = result?.recognition;
  const visionData = result?.vision?.data;
  const visionContent =
    visionData?.choices?.[0]?.message?.content ||
    visionData?.content ||
    "";
  let recognition: RecognitionResult | null = null;
  let visionError = result?.vision?.ok
    ? null
    : String(result?.vision?.error || "Object recognition failed");
  if (directRecognition?.title) {
    const directTitle = String(directRecognition.title).trim();
    const directLabels = Array.isArray(directRecognition.labels)
      ? directRecognition.labels.map((label: unknown) => String(label).trim()).filter(Boolean)
      : [];
    if (!/^scanned item$/i.test(directTitle)) {
      recognition = {
        title: directTitle,
        category: normalizeItemCategory(
          String(directRecognition.category || ""),
          directTitle,
          directLabels,
        ),
        labels: directLabels.length > 0 ? directLabels : [directTitle],
      };
      visionError = null;
    }
  }
  if (!recognition && result?.vision?.ok) {
    if (!visionContent) {
      visionError = "Object recognition returned no content";
    } else {
      const parsed = parseVisionContent(String(visionContent));
      if (!parsed.title || /^scanned item$/i.test(parsed.title.trim())) {
        visionError = "Object recognition returned no usable title";
      } else {
        recognition = parsed;
      }
    }
  }

  let cutoutDataUrl: string | null = null;
  const resultBase64 = result?.matting?.data?.result_base64;
  if (result?.matting?.ok && resultBase64) {
    cutoutDataUrl = String(resultBase64).startsWith("data:")
      ? String(resultBase64)
      : `data:image/png;base64,${resultBase64}`;
  }

  return {
    recognition,
    cutoutDataUrl,
    visionError,
    mattingError: result?.matting?.ok ? null : String(result?.matting?.error || "Background removal failed"),
  };
}

/**
 * Generate customized storage title based on recognition results.
 */
export async function generateStorageTitle(
  title: string,
  category: string,
  labels: string[] = []
): Promise<string> {
  console.log("[AI Dispatcher] Requesting storage title from worker...");
  try {
    const result = await callNomaBackend("title", {
      title,
      category,
      labels
    });
    console.log("[AI Dispatcher] Title generation raw result:", result);
    
    let content = "";
    if (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      content = result.choices[0].message.content;
    } else if (result && result.title) {
      content = result.title;
    } else if (result && result.result_title) {
      content = result.result_title;
    } else if (typeof result === "string") {
      content = result;
    }

    if (content) {
      // If it returned a JSON string wrapped in backticks or directly
      const cleanContent = content.trim().replace(/^["'\s]+|["'\s]+$/g, '');
      return cleanContent;
    }
    return title;
  } catch (err: any) {
    console.warn("[AI Dispatcher] Worker failed to generate title:", err.message || err);
    return title;
  }
}
