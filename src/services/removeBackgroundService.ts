/**
 * Unified Background Removal Service for Noma
 * Supporting local development and the Cloudflare Worker-backed production matting flow.
 */

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
 * Local high-performance client-side Chroma Keying Background Extraction fallback.
 * Used automatically when local rembg server is unreachable or when API credentials are omitted.
 */
async function localChromaKeyFallback(
  imageSrc: string,
  onProgress?: (progress: string | null) => void
): Promise<string> {
  try {
    console.log("[RemoveBgService] [ChromaKey] Activating local high-speed client-side Chroma Keying engine.");
    if (onProgress) onProgress("Initializing Chroma Scan...");
    await new Promise(r => setTimeout(r, 30));

    if (onProgress) onProgress("Reading image parameters...");
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (!imageSrc.startsWith("data:") && !imageSrc.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error("Failed to load original image for background subtraction: " + e));
      img.src = imageSrc;
    });

    const origWidth = origImg.naturalWidth || origImg.width || 500;
    const origHeight = origImg.naturalHeight || origImg.height || 500;

    // Downsample to safe 800px boundary to eliminate processing lag completely
    const MAX_ENG_SIZE = 800;
    let width = origWidth;
    let height = origHeight;
    if (origWidth > MAX_ENG_SIZE || origHeight > MAX_ENG_SIZE) {
      if (origWidth > origHeight) {
        width = MAX_ENG_SIZE;
        height = Math.round((origHeight * MAX_ENG_SIZE) / origWidth);
      } else {
        height = MAX_ENG_SIZE;
        width = Math.round((origWidth * MAX_ENG_SIZE) / origHeight);
      }
    }

    if (onProgress) onProgress("Analyzing background hue...");
    await new Promise(r => setTimeout(r, 40));

    // Build canvas and pull pixel data
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not obtain 2D canvas context.");
    }

    ctx.drawImage(origImg, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // Sample coordinates for corners (inset slightly)
    const offsetX = Math.max(1, Math.min(6, Math.floor(width * 0.02)));
    const offsetY = Math.max(1, Math.min(6, Math.floor(height * 0.02)));

    const getPixel = (x: number, y: number) => {
      const idx = (y * width + x) * 4;
      return {
        r: pixels[idx],
        g: pixels[idx + 1],
        b: pixels[idx + 2]
      };
    };

    // Sample 4 corners to detect uneven background / shadows perfectly
    const corners = [
      getPixel(offsetX, offsetY),
      getPixel(width - offsetX - 1, offsetY),
      getPixel(offsetX, height - offsetY - 1),
      getPixel(width - offsetX - 1, height - offsetY - 1)
    ];

    console.log("[RemoveBgService] [ChromaKey] Sampled Corner Background Colors:", corners);
    if (onProgress) onProgress("Meticulously peeling background...");
    await new Promise(r => setTimeout(r, 50));

    const tolerance = 35; // Standard high fidelity color difference tolerance

    // Traverse pixels and clear colors matching any corner background
    const len = pixels.length;
    for (let i = 0; i < len; i += 4) {
       const r = pixels[i];
       const g = pixels[i + 1];
       const b = pixels[i + 2];

       // Find closest corner color (Euclidean distance in RGB color space)
       let minDiff = Infinity;
       for (const corner of corners) {
         const diff = Math.sqrt(
           Math.pow(r - corner.r, 2) +
           Math.pow(g - corner.g, 2) +
           Math.pow(b - corner.b, 2)
         );
         if (diff < minDiff) {
           minDiff = diff;
         }
       }

       if (minDiff < tolerance) {
         pixels[i + 3] = 0; // Absolute transparency
       } else if (minDiff < tolerance + 15) {
         // Micro feathering transitional region for anti-aliasing curve borders
         const ratio = (minDiff - tolerance) / 15;
         pixels[i + 3] = Math.round(pixels[i + 3] * ratio);
       }
    }

    if (onProgress) onProgress("Perfecting mask edges...");
    await new Promise(r => setTimeout(r, 30));

    ctx.putImageData(imgData, 0, 0);
    const trueTransparentPngUrl = canvas.toDataURL("image/png");
    
    console.log("[RemoveBgService] [ChromaKey] Completed color keying backdrop removal! Transparent output URL size:", trueTransparentPngUrl.length);
    if (onProgress) onProgress(null);
    return trueTransparentPngUrl;
  } catch (err) {
    console.error("[RemoveBgService] Chroma Key computation failed, falling back to original image:", err);
    if (onProgress) onProgress("Cropping circular...");
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        if (onProgress) onProgress(null);
        resolve(imageSrc);
      }, 50);
    });
  }
}

/**
 * Unified decoupled Background Removal API.
 * Dispatches to local python rembg or custom APIs depending on active configuration mode.
 * Provides client-side automatic safety fallback (Chroma Key) if connections fail or credentials are omitted.
 *
 * @param imageSrc Base64 URL or binary Blob URL of the image to process.
 * @param onProgress Optional callback to receive status updates for the UI.
 * @returns Promise resolving to a transparent PNG data/blob URL.
 */
export async function remove_background(
  imageSrc: string,
  onProgress?: (progress: string | null) => void
): Promise<string> {
  console.log("[RemoveBgService] Entering remove_background with unified worker.");

  try {
    if (REMOVE_BG_CONFIG.mode === "local") {
      console.log("[RemoveBgService] Local mode selected. Running Chroma Key fallback directly.");
      return await localChromaKeyFallback(imageSrc, onProgress);
    }

    // 统一 API 拦截
    let isApiEnabled = true;
    try {
      isApiEnabled = localStorage.getItem("IS_API_ENABLED") !== "false";
    } catch (e) {
      console.warn("[RemoveBgService] Failed to read IS_API_ENABLED from localStorage:", e);
    }
    if (!isApiEnabled) {
      console.log("[API Intercept] remove_background API is disabled. Running local Chroma Key fallback.");
      return await localChromaKeyFallback(imageSrc, onProgress);
    }

    if (onProgress) onProgress("Converting image to base64...");
    const base64Str = await getBase64FromImageSrc(imageSrc);

    // Stripping base64 prefix
    let pureBase64 = base64Str;
    if (base64Str.includes(",")) {
      pureBase64 = base64Str.split(",")[1];
    } else if (base64Str.startsWith("data:")) {
      const commaIndex = base64Str.indexOf(",");
      if (commaIndex !== -1) {
        pureBase64 = base64Str.substring(commaIndex + 1);
      }
    }

    if (onProgress) onProgress("Uploading and extracting subject...");
    const workerUrl = "https://noma.38786547.workers.dev/";
    console.log(`[RemoveBgService] Fetching from proxy ${workerUrl} with type: 'matting'. origin=${window.location.origin} apiEnabled=true`);

    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "matting",
        image_base64: pureBase64,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      let detail = responseText.replace(/\s+/g, " ").trim().slice(0, 500);
      try {
        const parsed = JSON.parse(responseText);
        detail = typeof parsed?.error === "string" ? parsed.error : JSON.stringify(parsed);
      } catch {
        // Keep the plain-text Worker response as the diagnostic detail.
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
    console.error(`[RemoveBgService] Matting failed: ${err.message || err}. Triggering local Chroma Key fallback.`);
    return await localChromaKeyFallback(imageSrc, onProgress);
  }
}
