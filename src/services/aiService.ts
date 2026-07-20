export interface RecognitionResult {
  title: string;
  category: string;
  labels: string[];
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
    return saved !== "false"; // 默认为启用 (true)
  } catch (e) {
    return true;
  }
}

/**
 * Unified request sender function to Noma Cloudflare Workers Backend
 */
export async function callNomaBackend(type: "matting" | "vision" | "title", payload: any): Promise<any> {
  if (!isApiEnabled()) {
    console.log(`[API Intercept] IS_API_ENABLED is false. Returning high-fidelity mock data for type "${type}".`);
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

  const url = "https://noma.38786547.workers.dev/";
  console.log(`[Noma Backend] Sending request of type "${type}" to proxy: ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      ...payload
    }),
  });

  if (!response.ok) {
    throw new Error(`Worker proxy returned status ${response.status}`);
  }

  return await response.json();
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
      category = parsed.category || parsed.type || category;
      
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
  base64Data: string,
  mimeType: string = "image/png"
): Promise<RecognitionResult> {
  console.log("[AI Dispatcher] Initializing image recognition...");
  
  try {
    // Compress the image before sending to save tokens as requested!
    const compressedBase64WithPrefix = await prepareImage(base64Data, 800);
    const pureBase64 = stripBase64Prefix(compressedBase64WithPrefix);
    const result = await callNomaBackend("vision", { image_base64: pureBase64 });
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
      return {
        title: result.title || result.name || "Scanned Item",
        category: result.category || "Daily Goods",
        labels: result.labels || ["item"]
      };
    }

    const parsed = parseVisionContent(content);
    console.log("[AI Dispatcher] Final parsed result:", parsed);
    return parsed;
  } catch (err: any) {
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

/**
 * Classify a storage location (parent or sub) based on an image, communicating directly with the Worker.
 */
export async function classifyLocation(
  base64Data: string,
  phase: "sub" | "parent",
  parentLocation?: string
): Promise<{ name: string; englishName: string }> {
  console.log(`[AI Dispatcher] Classifying location for phase "${phase}" via direct worker connection...`);
  try {
    // Compress the location image before sending to save tokens as requested!
    const compressedBase64WithPrefix = await prepareImage(base64Data, 800);
    const pureBase64 = stripBase64Prefix(compressedBase64WithPrefix);
    
    // Direct worker connection
    const result = await callNomaBackend("vision", {
      image_base64: pureBase64
    });
    console.log("[AI Dispatcher] Location classification raw result:", result);

    let content = "";
    if (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      content = result.choices[0].message.content;
    } else if (result && result.content) {
      content = result.content;
    } else if (typeof result === "string") {
      content = result;
    }

    let detectedName = "";
    let detectedEnglishName = "";

    if (content) {
      const parsed = parseVisionContent(content);
      detectedName = parsed.title;
      detectedEnglishName = parsed.title;
    } else {
      detectedName = (result.name || result.title || "").trim();
      detectedEnglishName = (result.englishName || detectedName || "").trim();
    }

    const parentCategories = ["客厅", "卧室", "厨房", "浴室", "书房", "阳台"];
    const subCategories = ["床", "床头柜", "沙发", "茶几", "书桌", "衣柜", "收纳盒"];

    const parentCategoriesWithEn = [
      { name: "卧室", englishName: "Bedroom" },
      { name: "客厅", englishName: "Living Room" },
      { name: "书房", englishName: "Study" },
      { name: "厨房", englishName: "Kitchen" },
      { name: "浴室", englishName: "Bathroom" },
      { name: "阳台", englishName: "Balcony" },
    ];

    const subCategoriesWithEn: Record<string, Array<{ name: string; englishName: string }>> = {
      "卧室": [
        { name: "床头柜", englishName: "Bedside Table" },
        { name: "衣柜", englishName: "Wardrobe" },
        { name: "床", englishName: "Bed" },
        { name: "收纳盒", englishName: "Storage Box" },
      ],
      "客厅": [
        { name: "茶几", englishName: "Coffee Table" },
        { name: "沙发", englishName: "Sofa" },
        { name: "收纳盒", englishName: "Storage Box" },
      ],
      "书房": [
        { name: "书桌", englishName: "Desk" },
        { name: "收纳盒", englishName: "Storage Box" },
      ],
      "厨房": [
        { name: "收纳盒", englishName: "Storage Box" },
      ],
      "浴室": [
        { name: "收纳盒", englishName: "Storage Box" },
      ],
      "阳台": [
        { name: "收纳盒", englishName: "Storage Box" },
      ],
    };

    let finalName = "";
    let finalEnglishName = "";

    const isParent = phase === "parent";
    const allowedList = isParent ? parentCategories : subCategories;

    // Direct inclusion check
    for (const cat of allowedList) {
      if (detectedName.includes(cat) || cat.includes(detectedName)) {
        finalName = cat;
        break;
      }
    }

    if (!finalName) {
      // English-based heuristics mapping
      const lowerEn = detectedEnglishName.toLowerCase();
      if (isParent) {
        if (lowerEn.includes("bed") || lowerEn.includes("sleep")) { finalName = "卧室"; finalEnglishName = "Bedroom"; }
        else if (lowerEn.includes("living") || lowerEn.includes("parlor") || lowerEn.includes("sofa")) { finalName = "客厅"; finalEnglishName = "Living Room"; }
        else if (lowerEn.includes("cook") || lowerEn.includes("kitchen")) { finalName = "厨房"; finalEnglishName = "Kitchen"; }
        else if (lowerEn.includes("bath") || lowerEn.includes("wash") || lowerEn.includes("toilet")) { finalName = "浴室"; finalEnglishName = "Bathroom"; }
        else if (lowerEn.includes("study") || lowerEn.includes("read") || lowerEn.includes("book") || lowerEn.includes("work")) { finalName = "书房"; finalEnglishName = "Study"; }
        else if (lowerEn.includes("balcony") || lowerEn.includes("yard") || lowerEn.includes("garden")) { finalName = "阳台"; finalEnglishName = "Balcony"; }
      } else {
        if (lowerEn.includes("bedside") || lowerEn.includes("nightstand")) { finalName = "床头柜"; finalEnglishName = "Bedside Table"; }
        else if (lowerEn.includes("bed")) { finalName = "床"; finalEnglishName = "Bed"; }
        else if (lowerEn.includes("sofa") || lowerEn.includes("couch")) { finalName = "沙发"; finalEnglishName = "Sofa"; }
        else if (lowerEn.includes("coffee") || lowerEn.includes("tea table")) { finalName = "茶几"; finalEnglishName = "Coffee Table"; }
        else if (lowerEn.includes("desk") || lowerEn.includes("table")) { finalName = "书桌"; finalEnglishName = "Desk"; }
        else if (lowerEn.includes("wardrobe") || lowerEn.includes("closet") || lowerEn.includes("cabinet")) { finalName = "衣柜"; finalEnglishName = "Wardrobe"; }
        else if (lowerEn.includes("box") || lowerEn.includes("case") || lowerEn.includes("container") || lowerEn.includes("storage")) { finalName = "收纳盒"; finalEnglishName = "Storage Box"; }
      }
    }

    if (!finalName) {
      // Strict Fallback
      if (isParent) {
        const randomParent = parentCategoriesWithEn[Math.floor(Math.random() * parentCategoriesWithEn.length)];
        finalName = randomParent.name;
        finalEnglishName = randomParent.englishName;
      } else {
        const parentKey = parentLocation || "卧室";
        const possibleSubs = subCategoriesWithEn[parentKey] || subCategoriesWithEn["卧室"];
        const randomSub = possibleSubs[Math.floor(Math.random() * possibleSubs.length)];
        finalName = randomSub.name;
        finalEnglishName = randomSub.englishName;
      }
    }

    if (!finalEnglishName) {
      if (isParent) {
        const found = parentCategoriesWithEn.find(p => p.name === finalName);
        finalEnglishName = found ? found.englishName : "Unknown";
      } else {
        const parentKey = parentLocation || "卧室";
        const found = (subCategoriesWithEn[parentKey] || []).find(s => s.name === finalName);
        finalEnglishName = found ? found.englishName : "Storage Box";
      }
    }

    return {
      name: finalName,
      englishName: finalEnglishName
    };

  } catch (err: any) {
    console.warn("[AI Dispatcher] Location classification failed. Returning empty name so frontend triggers fallback.", err.message || err);
    throw err;
  }
}
