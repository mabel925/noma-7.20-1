import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAI, getGenerativeModel, GenerativeModel } from "firebase/ai";
import { parseVisionContent } from "../services/aiService";

// Standard Firebase config interface
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Key for local storage persistence of custom user config
const STORAGE_KEY = "rf_firebase_config";

/**
 * Get active Firebase Config from environment variables or LocalStorage
 */
export function getStoredFirebaseConfig(): FirebaseConfig | null {
  // 1. Try local storage first
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed as FirebaseConfig;
      }
    }
  } catch (e) {
    console.error("[FirebaseConfig] Failed to parse saved config from localStorage:", e);
  }

  // 2. Try Vite env variables
  const meta = import.meta as any;
  const envConfig: Partial<FirebaseConfig> = {
    apiKey: meta.env?.VITE_FIREBASE_API_KEY,
    authDomain: meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: meta.env?.VITE_FIREBASE_PROJECT_ID,
    storageBucket: meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: meta.env?.VITE_FIREBASE_APP_ID,
    measurementId: meta.env?.VITE_FIREBASE_MEASUREMENT_ID,
  };

  if (envConfig.apiKey && envConfig.projectId) {
    return envConfig as FirebaseConfig;
  }

  // 3. Fallback: No hardcoded keys on frontend. Return null.
  return null;
}

/**
 * Save Firebase configuration to LocalStorage
 */
export function saveFirebaseConfig(config: FirebaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Clear Firebase configuration from LocalStorage
 */
export function clearFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let firebaseAppInstance: FirebaseApp | null = null;

/**
 * Initialize or retrieve Firebase App instance
 */
export function getFirebaseApp(): FirebaseApp | null {
  const config = getStoredFirebaseConfig();
  if (!config) return null;

  try {
    if (getApps().length > 0) {
      // If already initialized, return existing or re-initialize if config changed
      const currentApp = getApp();
      // Simple heuristic check if project matches
      if (currentApp.options.projectId === config.projectId) {
        return currentApp;
      }
    }
    
    // Initialize or reinitialize with new config
    firebaseAppInstance = initializeApp(config);
    return firebaseAppInstance;
  } catch (err) {
    console.error("[Firebase] Error initializing app:", err);
    return null;
  }
}

/**
 * Call Vertex AI for Firebase client-side or server fallback using gemini-3.5-flash for lowest cost and fast response
 * @param base64Data The raw base64 data string (no data-url prefix)
 * @param mimeType The image mime type (e.g., 'image/jpeg' or 'image/png')
 */
export async function identifyImageWithVertexAI(
  base64Data: string,
  mimeType: string = "image/png"
): Promise<{ title: string; category: string; labels: string[] }> {
  // 1. High Performance Proxy Fallback: Try our server-side route first.
  // This delivers lightning-fast speed, 100% security for API keys, and works immediately in the preview out-of-the-box!
  try {
    console.log("[Vertex AI] Attempting direct Worker classification first...");
    const serverResponse = await fetch("https://noma.38786547.workers.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "vision",
        image_base64: base64Data
      }),
    });

    if (serverResponse.ok) {
      const resJson = await serverResponse.json();
      console.log("[Vertex AI] Worker raw classification response:", resJson);

      let content = "";
      if (resJson && resJson.choices && resJson.choices[0] && resJson.choices[0].message && resJson.choices[0].message.content) {
        content = resJson.choices[0].message.content;
      } else if (resJson && resJson.content) {
        content = resJson.content;
      } else if (typeof resJson === "string") {
        content = resJson;
      }

      if (content) {
        const parsed = parseVisionContent(content);
        console.log("[Vertex AI] Parsed classification content:", parsed);
        return parsed;
      }

      return {
        title: resJson.title || "Scanned Item",
        category: resJson.category || "Daily Goods",
        labels: resJson.labels || ["item"],
      };
    }
  } catch (err) {
    console.warn("[Vertex AI] Server-side classification fallback bypassed/failed. Trying Local client Vertex AI...", err);
  }

  // 2. Client-side Vertex AI for Firebase fallback (requires Firebase settings configuration)
  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not initialized. Please configure your Firebase credentials or ensure the server is fully connected.");
  }

  try {
    // Initialize Vertex AI client
    const aiService = getAI(app);

    // Get the model - Upgraded to gemini-3.5-flash for lowest cost and blazing fast response
    const model: GenerativeModel = getGenerativeModel(aiService, {
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "A concise name of the identified main physical object in English, max 3 words. Format: 'Smartphone', 'Glasses', 'Apple', 'Book'" },
            category: { type: "string", enum: ["Electronics", "Apparel", "Daily Goods", "Books & Papers", "Stationery"], description: "The most appropriate category among the 5 predefined classifications" },
            labels: { type: "array", items: { type: "string" }, description: "English keywords or descriptive tags of the object" }
          },
          required: ["title", "category", "labels"]
        }
      }
    });

    // Prepare the multimodal parts
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };

    const prompt = `Identify the main highlighted physical object in this image.
Analyze its visual traits and respond with a JSON object.
Predefined category mapping constraints:
- "Electronics" (Electronics/Appliances)
- "Apparel" (Apparel/Accessories)
- "Daily Goods" (Daily necessities, household goods)
- "Books & Papers" (Books, notebooks, papers)
- "Stationery" (Stationery, small tools, and other miscellaneous items)

The 'title' MUST be in English (e.g., "Apple", "Key", "Mug", "Scissors").`;

    console.log("[Vertex AI] Transmitting multimodal payload to gemini-3.5-flash client model...");
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const jsonText = response.text();
    console.log("[Vertex AI] Raw client response received:", jsonText);

    const parsed = JSON.parse(jsonText);
    const title = parsed.title || "Unknown Item";
    const category = parsed.category || "Stationery";
    const labels = parsed.labels || [];

    return {
      title: title,
      category,
      labels
    };

  } catch (error: any) {
    console.warn("[Vertex AI] Client-side content generation failed:", error.message || error);
    throw new Error(`Vertex AI for Firebase failed: ${error.message || error}`);
  }
}
