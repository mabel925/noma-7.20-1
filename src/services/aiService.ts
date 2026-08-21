import { NOMA_AI_URL } from "./backendUrls";
import { AiAccessError, getAiAuthHeaders } from "./aiAuth";
import { classifyEmojiLocally, EMOJI_CATALOG, EMOJI_KEY_SET, type EmojiKind } from "../data/emojiCatalog";

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
export async function prepareImage(imageInput: File | Blob | string, maxWidth = 800): Promise<string> {
  console.log(`[Image Compressor] Compressing image with maxWidth ${maxWidth}, quality 0.7...`);
  return new Promise((resolve) => {
    const processImgSrc = (src: string) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.warn("[Image Compressor] Canvas 2d context not available, returning original source.");
          resolve(src);
          return;
        }
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        // Use 0.7 quality jpeg compression as requested
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        console.log(`[Image Compressor] Compression done. Original dimensions: ${img.width}x${img.height}, New dimensions: ${canvas.width}x${canvas.height}`);
        resolve(compressed);
      };
      img.onerror = (err) => {
        console.error("[Image Compressor] Image loading failed, returning original source:", err);
        resolve(src);
      };
      img.src = src;
    };

    if (imageInput instanceof File || imageInput instanceof Blob) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          processImgSrc(e.target.result as string);
        } else {
          resolve("");
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(imageInput);
    } else if (typeof imageInput === "string") {
      let src = imageInput;
      if (!src.startsWith("data:") && !src.startsWith("http") && !src.startsWith("blob:")) {
        src = `data:image/jpeg;base64,${imageInput}`;
      }
      processImgSrc(src);
    } else {
      resolve("");
    }
  });
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

function getRequestOrigin(): string {
  return typeof window === "undefined" ? "server" : window.location.origin;
}

/**
 * Unified request sender function to Noma Cloudflare Workers Backend
 */
export async function callNomaBackend(type: "matting" | "vision" | "title" | "emoji-classify", payload: any, scanId?: string): Promise<any> {
  if (!isApiEnabled()) {
    console.log(`[API Intercept] IS_API_ENABLED is false. Returning high-fidelity mock data for type "${type}". origin=${getRequestOrigin()}`);
    // Add artificial delay for realistic simulation
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (type === "vision") {
      // 识物或空间分类的高拟真 Mock，保持结构完美匹配真实 Cloudflare Worker
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Aesthetic Mug",
                category: "Daily Goods",
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
  try {
    const authHeaders = await getAiAuthHeaders(scanId);
    response = await fetch(NOMA_BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        type,
        ...(scanId ? { scan_id: scanId } : {}),
        ...payload
      }),
    });
  } catch (error: any) {
    if (error instanceof AiAccessError) throw error;
    throw new Error(`Worker request could not be sent from ${getRequestOrigin()}: ${error?.message || "network/CORS failure"}`);
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
  let category = "Daily Goods";
  let labels: string[] = ["item"];

  if (!content) {
    return { title, category, labels };
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
      
      return { title, category, labels };
    } catch (e) {
      console.warn("[AI Parser] Content looked like JSON but failed to parse, falling back to plain text:", e);
    }
  }

  console.log("[AI Parser] Parsing as plain text fallback...");
  const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    title = lines[0].replace(/^[-*+\d\.\s]+/g, "");
  }
  
  const lowerContent = trimmed.toLowerCase();
  if (
    lowerContent.includes("computer") || lowerContent.includes("laptop") || lowerContent.includes("phone") || 
    lowerContent.includes("electronics") || lowerContent.includes("audio") || lowerContent.includes("display") || 
    lowerContent.includes("screen") || lowerContent.includes("gadget") || lowerContent.includes("charger") || 
    lowerContent.includes("appliance") || lowerContent.includes("television") || lowerContent.includes("camera") || 
    lowerContent.includes("battery") || lowerContent.includes("电脑") || lowerContent.includes("手机") ||
    lowerContent.includes("耳机") || lowerContent.includes("相机")
  ) {
    category = "数码家电";
  } else if (
    lowerContent.includes("clothing") || lowerContent.includes("apparel") || lowerContent.includes("wear") || 
    lowerContent.includes("shirt") || lowerContent.includes("pants") || lowerContent.includes("shoe") || 
    lowerContent.includes("boot") || lowerContent.includes("sneaker") || lowerContent.includes("bag") || 
    lowerContent.includes("jacket") || lowerContent.includes("hat") || lowerContent.includes("accessory") || 
    lowerContent.includes("jewelry") || lowerContent.includes("watch") || lowerContent.includes("glasses") || 
    lowerContent.includes("wallet") || lowerContent.includes("backpack") || lowerContent.includes("衣服") ||
    lowerContent.includes("鞋") || lowerContent.includes("帽") || lowerContent.includes("手表")
  ) {
    category = "衣物配饰";
  } else if (
    lowerContent.includes("cup") || lowerContent.includes("mug") || lowerContent.includes("bottle") || 
    lowerContent.includes("furniture") || lowerContent.includes("table") || lowerContent.includes("chair") || 
    lowerContent.includes("plate") || lowerContent.includes("bowl") || lowerContent.includes("soap") || 
    lowerContent.includes("towel") || lowerContent.includes("household") || lowerContent.includes("kitchen") || 
    lowerContent.includes("candle") || lowerContent.includes("pillow") || lowerContent.includes("blanket") || 
    lowerContent.includes("umbrella") || lowerContent.includes("flower") || lowerContent.includes("vase") ||
    lowerContent.includes("杯") || lowerContent.includes("瓶") || lowerContent.includes("碗") || lowerContent.includes("毛巾")
  ) {
    category = "日用百货";
  } else if (
    lowerContent.includes("book") || lowerContent.includes("document") || lowerContent.includes("paper") || 
    lowerContent.includes("textbook") || lowerContent.includes("magazine") || lowerContent.includes("journal") || 
    lowerContent.includes("novel") || lowerContent.includes("certificate") || lowerContent.includes("书") ||
    lowerContent.includes("文档") || lowerContent.includes("纸")
  ) {
    category = "书籍文档";
  } else if (
    lowerContent.includes("pen") || lowerContent.includes("pencil") || lowerContent.includes("stationery") || 
    lowerContent.includes("office supply") || lowerContent.includes("eraser") || lowerContent.includes("ruler") || 
    lowerContent.includes("scissors") || lowerContent.includes("toy") || lowerContent.includes("sticker") || 
    lowerContent.includes("key") || lowerContent.includes("folder") || lowerContent.includes("clip") ||
    lowerContent.includes("笔") || lowerContent.includes("玩具") || lowerContent.includes("钥匙")
  ) {
    category = "文具杂货";
  }

  const words = title.split(/[\s,，、]+/);
  labels = words.filter(w => w.length > 1).slice(0, 5);
  if (labels.length === 0) {
    labels = ["item"];
  }

  return { title, category, labels };
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
    const compressedBase64WithPrefix = await prepareImage(imageInput, 640);
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
      return {
        title: directResult.title || directResult.name || "Scanned Item",
        category: directResult.category || "Daily Goods",
        labels: directResult.labels || directResult.tags || ["item"]
      };
    }

    const parsed = parseVisionContent(content);
    console.log("[AI Dispatcher] Final parsed result:", parsed);
    return parsed;
  } catch (err: any) {
    if (err instanceof AiAccessError) throw err;
    console.error("[AI Dispatcher] Failed to recognize image via unified worker:", err.message || err);
    return {
      title: "Scanned Item",
      category: "Daily Goods",
      labels: ["item", "physical object"]
    };
  }
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
