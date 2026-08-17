import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { VirtualStage } from "./components/VirtualStage";
import { Header } from "./components/Header";
import { ActionButtons } from "./components/ActionButtons";
import { ChatFlow } from "./components/ChatFlow";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { CaptureScanner } from "./components/CaptureScanner";
import { useKeyboardReset } from "./hooks/useKeyboardReset";
import { memoryStorage } from "./services/memoryStorage";
import { NOMA_AI_URL } from "./services/backendUrls";

import { Wifi, Battery, Signal, RefreshCw, Sparkles, Target, Info } from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "motion/react";

interface ChatMessage {
  sender: "noma" | "user";
  text: string;
}

import { MemoryList, MemoryItem } from "./components/MemoryList";
import { CloseIcon } from "./components/CloseIcon";
import { useAuth } from "./auth/AuthContext";
import { isStandalonePwa, syncDisplayModeClasses } from "./utils/appViewport";

const HOME_LOGO_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/logo-noma.png";
const HOME_AVATAR_URL = "https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/%E9%BB%98%E8%AE%A4%E5%A4%B4%E5%83%8F.jpg";

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: "seed-laptop",
    name: "Laptop",
    category: "电子产品",
    price: "$1499.00",
    date: "Today",
    emoji: "💻",
    stickerUrl: "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Bedroom",
    subLocationName: "Nightstand",
    parentLocationImg: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-scarf",
    name: "Scarf",
    category: "衣物",
    price: "$45.00",
    date: "Yesterday",
    emoji: "🧣",
    stickerUrl: "https://images.unsplash.com/photo-1608096293090-b5529597e281?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Bedroom",
    subLocationName: "Wardrobe",
    parentLocationImg: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-passport",
    name: "Passport",
    category: "证件",
    price: "$15.00",
    date: "July 2, 2026",
    emoji: "📕",
    stickerUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Living Room",
    subLocationName: "Cabinet Drawer",
    parentLocationImg: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-keys",
    name: "Leica Camera",
    category: "电子产品",
    price: "$2400.00",
    date: "June 28, 2026",
    emoji: "📷",
    stickerUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Main Bedroom",
    subLocationName: "Desk Tray",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-coat",
    name: "Trench Coat",
    category: "衣物",
    price: "$180.00",
    date: "Yesterday",
    emoji: "🧥",
    stickerUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Main Bedroom",
    subLocationName: "Wardrobe",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-3",
    name: "Certificate",
    category: "证件",
    price: "$0.00",
    date: "June 25, 2026",
    emoji: "📜",
    stickerUrl: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Main Bedroom",
    subLocationName: "Safe Box",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-4",
    name: "Headphones",
    category: "电子产品",
    price: "$299.00",
    date: "June 24, 2026",
    emoji: "🎧",
    stickerUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Main Bedroom",
    subLocationName: "Cabinet",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-5",
    name: "Diary Book",
    category: "其它",
    price: "$12.00",
    date: "June 23, 2026",
    emoji: "📔",
    stickerUrl: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=300&auto=format&fit=crop&q=80",
    parentLocationName: "Main Bedroom",
    subLocationName: "Storage Box",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-6",
    name: "Wrist Watch",
    category: "其它",
    price: "$350.00",
    date: "June 22, 2026",
    emoji: "⌚",
    parentLocationName: "Main Bedroom",
    subLocationName: "Side Table",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-7",
    name: "Cap",
    category: "衣物",
    price: "$25.00",
    date: "June 21, 2026",
    emoji: "🧢",
    parentLocationName: "Main Bedroom",
    subLocationName: "Closet",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-8",
    name: "Silver Ring",
    category: "其它",
    price: "$120.00",
    date: "June 20, 2026",
    emoji: "💍",
    parentLocationName: "Main Bedroom",
    subLocationName: "Drawer",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "seed-item-9",
    name: "Tablet PC",
    category: "电子产品",
    price: "$499.00",
    date: "June 19, 2026",
    emoji: "📱",
    parentLocationName: "Main Bedroom",
    subLocationName: "Under bed",
    parentLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
    subLocationImg: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80",
  }
];

export default function App() {
  const { user, requireAuth, openLogin } = useAuth();
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [isChatActive, setIsChatActive] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCaptureOpen, setIsCaptureOpen] = useState<boolean>(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState<boolean>(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState<boolean>(false);
  const launchStartedAtRef = React.useRef(performance.now());
  const [areStageAssetsReady, setAreStageAssetsReady] = useState(false);
  const [areHomeChromeAssetsReady, setAreHomeChromeAssetsReady] = useState(false);
  const [startupProgress, setStartupProgress] = useState(4);
  const [isHomeReady, setIsHomeReady] = useState(false);
  const handleHomeReady = React.useCallback(() => setAreStageAssetsReady(true), []);

  useEffect(() => {
    let cancelled = false;
    const preloadImage = (url: string) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const decode = typeof image.decode === "function" ? image.decode() : Promise.resolve();
        decode.catch(() => undefined).finally(resolve);
      };
      image.onerror = () => resolve();
      image.src = url;
    });

    Promise.all([HOME_LOGO_URL, HOME_AVATAR_URL].map(preloadImage)).then(() => {
      if (!cancelled) setAreHomeChromeAssetsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isHomeReady) return;
    const timer = window.setInterval(() => {
      setStartupProgress((current) => {
        if (areStageAssetsReady && areHomeChromeAssetsReady) return 100;
        const ceiling = areStageAssetsReady ? 94 : areHomeChromeAssetsReady ? 76 : 62;
        const step = Math.max(0.6, (ceiling - current) * 0.075);
        return Math.min(ceiling, current + step);
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [areHomeChromeAssetsReady, areStageAssetsReady, isHomeReady]);

  useEffect(() => {
    const splash = document.getElementById("startup-splash");
    const fill = document.getElementById("startup-progress-fill");
    const label = document.getElementById("startup-progress-label");
    const progressbar = splash?.querySelector<HTMLElement>('[role="progressbar"]');
    const roundedProgress = Math.min(100, Math.round(startupProgress));
    if (fill) fill.style.width = `${roundedProgress}%`;
    if (label) label.textContent = `${roundedProgress}%`;
    progressbar?.setAttribute("aria-valuenow", String(roundedProgress));
  }, [startupProgress]);

  useEffect(() => {
    if (!areStageAssetsReady || !areHomeChromeAssetsReady) return;
    setStartupProgress(100);
    const elapsed = performance.now() - launchStartedAtRef.current;
    const timer = window.setTimeout(() => setIsHomeReady(true), Math.max(240, 650 - elapsed));
    return () => window.clearTimeout(timer);
  }, [areHomeChromeAssetsReady, areStageAssetsReady]);

  useEffect(() => {
    let finishTimer: number | null = null;
    const safetyTimer = window.setTimeout(() => {
      setStartupProgress(100);
      finishTimer = window.setTimeout(() => setIsHomeReady(true), 240);
    }, 12000);
    return () => {
      window.clearTimeout(safetyTimer);
      if (finishTimer !== null) window.clearTimeout(finishTimer);
    };
  }, []);

  useEffect(() => {
    if (!isHomeReady) return;
    const splash = document.getElementById("startup-splash");
    if (!splash) return;
    splash.classList.add("is-hidden");
    const removeTimer = window.setTimeout(() => splash.remove(), 380);
    return () => window.clearTimeout(removeTimer);
  }, [isHomeReady]);

  const controls = useAnimation();
  const isCustomKeyboardVisible = isChatActive && !isMemoryOpen && !isCaptureOpen;
  const keyboardOffset = isStandaloneMode ? 242 : 205;

  useEffect(() => {
    controls.start(isCustomKeyboardVisible ? "visible" : "hidden");
  }, [isCustomKeyboardVisible, controls, keyboardOffset]);

  const bgVariants = {
    visible: {
      y: -keyboardOffset,
      scale: 1.05
    },
    hidden: {
      y: 0,
      scale: 1.0
    }
  };

  const keyboardVariants = {
    visible: {
      y: 0
    },
    hidden: {
      y: keyboardOffset
    }
  };

  const syncTransition = {
    type: "tween",
    duration: 0.4,
    ease: [0.16, 1, 0.3, 1]
  };

  // Call the global aggressive keyboard reset logic
  useKeyboardReset(isChatActive, isCaptureOpen);
  const [customMemories, setCustomMemories] = useState<MemoryItem[]>([]);
  const [isMemoryHydrated, setIsMemoryHydrated] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  // Only hydrate data after a user exists. Signed-out sessions intentionally
  // never read the old test database or any account-scoped data.
  useEffect(() => {
    let cancelled = false;

    setCustomMemories([]);
    setIsMemoryHydrated(false);
    setHydratedUserId(null);
    if (!user) return () => { cancelled = true; };
    if (user.isMock) {
      setIsMemoryHydrated(true);
      setHydratedUserId(user.id);
      return () => { cancelled = true; };
    }

    memoryStorage
      .listItems(user.id)
      .then((items) => {
        if (cancelled) return;
        setCustomMemories(items);
        setIsMemoryHydrated(true);
        setHydratedUserId(user.id);
      })
      .catch((error) => {
        console.error("[App] Failed to load local memories:", error);
        if (!cancelled) {
          setIsMemoryHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isMock]);

  // Persist changes through IndexedDB without allowing the initial empty state
  // to overwrite data before hydration completes.
  useEffect(() => {
    if (!isMemoryHydrated || !user || user.isMock || hydratedUserId !== user.id) return;

    memoryStorage.saveItems(user.id, customMemories).catch((error) => {
      console.error("[App] Failed to persist local memories:", error);
    });
  }, [customMemories, isMemoryHydrated, hydratedUserId, user?.id, user?.isMock]);
  const [toast, setToast] = useState<string | null>(null);
  const [currentInfoObj, setCurrentInfoObj] = useState<string | null>(null);

  // Remote AI is enabled by default in production. The hidden diagnostic
  // toggle remains available for temporarily switching to local fallbacks.
  useEffect(() => {
    const API_TOGGLE_VERSION = "remote-default-on-v1";
    if (localStorage.getItem("IS_API_TOGGLE_VERSION") !== API_TOGGLE_VERSION) {
      localStorage.setItem("IS_API_ENABLED", "true");
      localStorage.setItem("IS_API_TOGGLE_VERSION", API_TOGGLE_VERSION);
    }
  }, []);

  // Dynamic status bar clock (real-time high fidelity)
  const [currentTime, setCurrentTime] = useState<string>("09:41");

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "noma",
      text: "Hi, I'm noma. Snap a photo of the items scattered around your space, and I'll help you find the perfect home for them.",
    },
  ]);

  // Update clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours().toString().padStart(2, "0");
      let minutes = now.getMinutes().toString().padStart(2, "0");
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 60000);
    return () => clearInterval(timer);
  }, []);

  // Standalone PWA detection to fix iOS 100vh rendering layout issues
  useEffect(() => {
    const checkStandalone = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const forceStandalonePreview = searchParams.get("pwa") === "1";
      const isActualStandalone = isStandalonePwa();
      setIsStandaloneMode(isActualStandalone && !forceStandalonePreview);
      syncDisplayModeClasses();
    };
    checkStandalone();
    window.addEventListener("popstate", checkStandalone);

    return () => {
      window.removeEventListener("popstate", checkStandalone);
      document.documentElement.classList.remove("pwa-preview");
      document.body.classList.remove("pwa-preview");
    };
  }, []);

  // API Switch config easter egg (5 fast clicks anywhere on home screen layout to toggle IS_API_ENABLED)
  const [clickCount, setClickCount] = useState<number>(0);
  const [lastClickTime, setLastClickTime] = useState<number>(0);

  const handleEasterEggClick = (e: React.MouseEvent) => {
    // Check if user is clicking on active inputs, buttons or selects to avoid hijacking interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "BUTTON" || 
      target.tagName === "INPUT" || 
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" || 
      target.closest("button") || 
      target.closest("a") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("textarea")
    ) {
      return;
    }
    
    const now = Date.now();
    // Fast consecutive clicks within 700ms
    if (now - lastClickTime < 700) {
      const nextCount = clickCount + 1;
      if (nextCount >= 5) {
        // Toggle IS_API_ENABLED
        const currentEnabled = localStorage.getItem("IS_API_ENABLED") === "true";
        const nextEnabled = !currentEnabled;
        localStorage.setItem("IS_API_ENABLED", String(nextEnabled));
        setClickCount(0);
        
        // Dynamic feedback toast
        setToast(nextEnabled ? "🔌 API 已开启 (将正常调用真实线上接口)" : "📴 API 已关闭 (已切换至 Mock 本地离线模拟)");
      } else {
        setClickCount(nextCount);
      }
    } else {
      setClickCount(1);
    }
    setLastClickTime(now);
  };

  // Auto-clear toast notification
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Pre-configured room search knowledgebase
  const handleNomaSearch = (query: string) => {
    if (!userRef.current) {
      requireAuth(() => handleNomaSearch(query));
      return;
    }
    const cleanQuery = query.toLowerCase().trim();

    // Check if user is asking to generate/draw/create/make an image
    if (
      cleanQuery.startsWith("generate ") ||
      cleanQuery.startsWith("draw ") ||
      cleanQuery.startsWith("create ") ||
      cleanQuery.startsWith("make ")
    ) {
      const prompt = query.substring(query.indexOf(" ") + 1).trim();
      
      // Add immediate thinking feedback
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            sender: "noma",
            text: `🎨 Drawing "${prompt}" for you using the recommended gemini-3.1-flash-image model... Please wait a moment! ✨`
          }
        ]);
      }, 300);

      // Call our direct Worker endpoint
      fetch(NOMA_AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "generate-image",
          prompt: prompt
        })
      })
        .then((res) => {
          return res.text().then((body) => {
            if (!res.ok) {
              let detail = body.replace(/\s+/g, " ").trim().slice(0, 500);
              try {
                const parsed = JSON.parse(body);
                detail = typeof parsed?.error === "string" ? parsed.error : JSON.stringify(parsed);
              } catch {
                // Keep the plain-text Worker response as the diagnostic detail.
              }
              throw new Error(`HTTP ${res.status}: ${detail || "(empty response body)"}`);
            }
            return JSON.parse(body);
          });
        })
        .then((data) => {
          let imageBase64 = "";
          if (data && data.base64) {
            imageBase64 = data.base64;
          } else if (data && data.result_base64) {
            imageBase64 = data.result_base64;
          } else {
            // Generate fallback client-side SVG
            const cleanPrompt = prompt.replace(/"/g, "'");
            const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
              <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#1e293b"/>
                  <stop offset="50%" stop-color="#334155"/>
                  <stop offset="100%" stop-color="#0f172a"/>
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#g)"/>
              <circle cx="200" cy="200" r="120" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="8 4"/>
              <path d="M 200 130 L 200 270 M 130 200 L 270 200" stroke="#475569" stroke-width="2"/>
              <text x="50%" y="45%" text-anchor="middle" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="22" font-weight="bold">Noma Space AI</text>
              <text x="50%" y="55%" text-anchor="middle" fill="#64748b" font-family="system-ui, sans-serif" font-size="14" width="300">${cleanPrompt.length > 30 ? cleanPrompt.slice(0, 30) + '...' : cleanPrompt}</text>
              <text x="50%" y="65%" text-anchor="middle" fill="#475569" font-family="system-ui, sans-serif" font-size="11">Visualizing Concept...</text>
            </svg>`;
            imageBase64 = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(fallbackSvg)))}`;
          }

          setMessages((prev) => [
            ...prev,
            {
              sender: "noma",
              text: `✨ Success! Generated a beautiful custom sticker of "${prompt}" using the brand-new gemini-3.1-flash-image model. The asset has been logged and pinned into Noma's permanent memory bank! 🖼️`
            }
          ]);
          // Save to memory bank!
          const stickerObj = {
            name: prompt,
            category: "AI Generated",
            price: "$0.00",
            date: new Date().toLocaleDateString(),
            emoji: "🎨",
            stickerUrl: imageBase64,
            parentLocationName: "书房",
            subLocationName: "书桌"
          };
          handleItemAdded(stickerObj);
        })
        .catch((err) => {
          console.error("AI Generation error:", err);
          setMessages((prev) => [
            ...prev,
            {
              sender: "noma",
              text: `❌ Oh dear, I couldn't generate that image: ${err.message || String(err)}. Please ensure Cloudflare Worker backend is fully operational.`
            }
          ]);
        });
      return;
    }

    let reply = "";

    // Check custom memory items first
    const customMatch = customMemories.find(m => 
      cleanQuery.includes(m.name.toLowerCase()) || 
      m.name.toLowerCase().includes(cleanQuery) ||
      (m.emoji && cleanQuery.includes(m.emoji))
    );

    if (customMatch) {
      reply = `${customMatch.emoji} Yes! I remember saving your "${customMatch.name}"! You recorded it on [${customMatch.date}] at a value of [${customMatch.price}]. It has been scanned and is safely logged in your virtual room vault!`;
    } else if (cleanQuery.includes("key") || cleanQuery.includes("keys")) {
      reply = "I spotted those shiny brass keys on your third bookshelf, tucked right beside the green ivy!";
    } else if (
      cleanQuery.includes("cup") ||
      cleanQuery.includes("mug") ||
      cleanQuery.includes("coffee") ||
      cleanQuery.includes("tea")
    ) {
      reply = "Your warm coffee in the blue ceramic mug is resting safely on the wooden tea table!";
    } else if (
      cleanQuery.includes("candle") ||
      cleanQuery.includes("light") ||
      cleanQuery.includes("fire")
    ) {
      reply = "That vanilla-scented candle has a clean glowing flame, sitting near your books in the lower shelf.";
    } else if (cleanQuery.includes("book") || cleanQuery.includes("books")) {
      reply = "You're reading it right now! I am holding your favourite turquoise book of fairy tales.";
    } else if (
      cleanQuery.includes("noma") ||
      cleanQuery.includes("who") ||
      cleanQuery.includes("hello") ||
      cleanQuery.includes("hi")
    ) {
      reply = "Hello! I'm Noma, your visual memory companion. Ask me where any item in your room is, and I'll recall!";
    } else {
      reply = `I don't remember seeing "${query}" around the cozy room just yet. Try searching for 'keys', 'coffee', 'book' or 'candle'!`;
    }

    // Add Noma's response after a slight thinking delay
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: "noma", text: reply },
      ]);
    }, 700);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const currentInput = inputValue;
    if (!userRef.current) {
      requireAuth(() => {
      setMessages((prev) => [...prev, { sender: "user", text: currentInput }]);
      setInputValue("");
      handleNomaSearch(currentInput);
      });
      return;
    }
    setMessages((prev) => [...prev, { sender: "user", text: currentInput }]);
    setInputValue("");
    handleNomaSearch(currentInput);
  };

  const handleKeyPress = (char: string) => {
    setInputValue((prev) => prev + char);
  };

  const handleBackspace = () => {
    setInputValue((prev) => prev.slice(0, -1));
  };

  const handleSpace = () => {
    setInputValue((prev) => prev + " ");
  };

  // Quick preset keyword taps
  const handlePresetSearch = (preset: string) => {
    if (!userRef.current) {
      requireAuth(() => handlePresetSearch(preset));
      return;
    }
    setInputValue("");
    setMessages((prev) => [...prev, { sender: "user", text: preset }]);
    handleNomaSearch(preset);
  };

  // Add item save to Noma's searchable memory bank
  const handleItemAdded = (
    nameOrItem: string | Omit<MemoryItem, "id">,
    price?: string,
    date?: string,
    emoji?: string
  ) => {
    if (!userRef.current) {
      requireAuth(() => handleItemAdded(nameOrItem, price, date, emoji));
      return;
    }
    let newItem: MemoryItem;

    if (typeof nameOrItem === "object") {
      newItem = memoryStorage.createItem(user.id, {
        ...nameOrItem,
      });
    } else {
      newItem = memoryStorage.createItem(user.id, {
        name: nameOrItem,
        category: "其它",
        price: price || "$25.00",
        date: date || "Today",
        emoji: emoji || "📝",
        parentLocationName: "Bedroom",
        subLocationName: "Drawer",
      });
    }

    setCustomMemories((prev) => [newItem, ...prev]);
    setToast("保存成功");
    
    // Smooth transition message from Noma
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: "noma",
          text: `✨ I've successfully registered your custom item: "${newItem.name}" (${newItem.emoji})! Value: [${newItem.price}] logged [${newItem.date}] in [${newItem.parentLocationName}]. It has been scanned and is safely recorded in our virtual room archive. Try asking me "Where is my ${newItem.name}?" to find it!`,
        }
      ]);
      // Open chat automatically
      setIsChatActive(true);
    }, 400);
  };

  return (
    <div
      id="app-container"
      className="home-container w-full h-[100vh] flex items-center justify-center p-0 md:py-6 md:px-4 no-scrollbar relative overflow-hidden select-none"
    >
      {/* 共享动画和布局父容器，不指定 z-index 避免形成层叠上下文，使内部子元素保持原生的层叠深度 */}
      <div className="keyboard-bg-sync-parent absolute inset-0 pointer-events-none md:fixed md:left-1/2 md:top-1/2 md:w-[412px] md:h-[844px] md:-ml-[206px] md:-mt-[422px] md:overflow-hidden md:rounded-[36px]">
        <motion.div
          id="app-bg"
          initial={isCustomKeyboardVisible ? "visible" : "hidden"}
          animate={controls}
          variants={bgVariants}
          transition={syncTransition}
          style={{ originY: 1 }}
        >
          <VirtualStage
            isChatActive={isChatActive && !isMemoryOpen && !isCaptureOpen}
            bgRoomUrl="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/bg-newroom.jpg"
            bgChatUrl="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/bg-newroom.jpg"
            onReady={handleHomeReady}
          />
        </motion.div>

        {!isCaptureOpen && (
          <motion.div
            initial={isCustomKeyboardVisible ? "visible" : "hidden"}
            animate={controls}
            variants={keyboardVariants}
            transition={syncTransition}
            className="home-keyboard-container absolute bottom-0 inset-x-0 h-[242px] z-40 pointer-events-auto"
            style={{ willChange: "transform" }}
          >
            <VirtualKeyboard
              value={inputValue}
              onChange={setInputValue}
              onKeyPress={handleKeyPress}
              onBackspace={handleBackspace}
              onSpace={handleSpace}
              onSend={handleSend}
              onDismiss={() => setIsChatActive(false)}
              className="h-full"
            />
          </motion.div>
        )}
      </div>
      
      {/* Background radial atmosphere lights */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#4C85E6]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#EF4444]/10 rounded-full blur-[120px] pointer-events-none" />

      {/* 1. CONTAINER PANEL (Full-screen adaptively on mobile using fixed inset-0, clean card mockup on desktop) */}
      <div
        id="noma-iphone-frame"
        onClick={handleEasterEggClick}
        className="fixed inset-0 md:relative md:inset-auto w-full max-w-none md:max-w-[412px] h-[100vh] md:h-[844px] rounded-none md:rounded-[36px] bg-transparent border-none md:border md:border-white/10 shadow-none md:shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden will-change-transform z-10"
      >



        {/* 4. FLOATING CONCEPTS/UI ELEMENTS LAYER (Overlaying the Stage) */}
        
        {/* Top Transparent Gradient Overlay Mask */}
        <div 
          className="absolute top-0 inset-x-0 h-[260px] bg-gradient-to-b from-black/10 to-transparent pointer-events-none z-35"
        />

        {/* Noma Header Logo & Memory Polyhedron */}
        {!isMemoryOpen && (
          <Header
            isChatActive={isChatActive || isCaptureOpen}
            user={user}
            onUserClick={openLogin}
          />
        )}

        {/* Memory List Overlay: mount/unmount directly so Back returns home immediately. */}
        {isMemoryOpen && (
          <MemoryList
            isOpen={isMemoryOpen}
            onClose={() => setIsMemoryOpen(false)}
            memories={customMemories}
            onMemoriesChange={setCustomMemories}
            isAuthenticated={Boolean(user)}
            onRequireAuth={(action) => requireAuth(action)}
            onLogin={openLogin}
          />
        )}

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && !isMemoryOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{
                type: "tween",
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[13px] font-sans px-5 py-2.5 rounded-full shadow-lg border border-white/10 z-[60] flex items-center gap-1.5 backdrop-blur-md"
            >
              <Sparkles className="w-4 h-4 text-[#F2C94C] animate-pulse" />
              <span className="font-semibold tracking-tight">{toast}</span>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Room Scanning Mode (AR Interface HUD overlayed upon trigger) */}
        {isScanning && (
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px] z-50 flex flex-col justify-between p-6 cursor-pointer"
            onClick={() => setIsScanning(false)}
          >
            {/* Top Scanning Status block */}
            <div className="flex justify-between items-start mt-12">
              <div className="bg-emerald-500/90 text-[11px] font-mono font-medium tracking-widest text-black px-2.5 py-1 rounded flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                NOMA-AR SPATIAL SCANNER
              </div>
              <button 
                aria-label="Close scanner"
                onClick={() => setIsScanning(false)}
                className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Target Reticle UI (Center) */}
            <div className="flex flex-col items-center justify-center flex-1 gap-2">
              <div className="relative w-40 h-40 flex items-center justify-center">
                {/* Outlines */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-400" />
                
                {/* Internal scanning laser beam */}
                <div 
                  className="w-full h-0.5 bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,1)]" 
                  style={{
                    animation: "noma-scan-sweep 2s ease-in-out infinite",
                    position: "absolute",
                  }}
                />
                
                <Target className="w-8 h-8 text-emerald-400/80 animate-pulse" />
              </div>
              <p className="text-emerald-400 text-xs font-mono tracking-wider bg-black/60 px-3 py-1 rounded">
                calibrating focus grid...
              </p>
            </div>

            {/* Interactive Spatial Targets pinned across specific coordinate slots of the room */}
            {/* Blue Mug Target */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setCurrentInfoObj("Coffee Mug: 98% Conf, Warm.");
              }}
              className="absolute bottom-[23%] right-[32%] flex flex-col items-start gap-1 z-50 cursor-pointer animate-flicker"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 border border-white flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-scale" />
              </div>
              <div className="bg-black/85 text-[10px] font-mono text-cyan-400 border border-cyan-400/40 px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
                Blue Mug [98%]
              </div>
            </div>

            {/* Noma Character Target */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setCurrentInfoObj("Noma: Visual Companion. Ready.");
              }}
              className="absolute bottom-[35%] left-[45%] flex flex-col items-center gap-1 z-50 cursor-pointer"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-white flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
              <div className="bg-black/85 text-[10px] font-mono text-amber-400 border border-amber-400/40 px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
                Noma Sprite [Found]
              </div>
            </div>

            {/* Shelf/Keys Target */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setCurrentInfoObj("Keys: Shelf 3, Left margin.");
              }}
              className="absolute top-[35%] left-[12%] flex flex-col items-start gap-1 z-50 cursor-pointer"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 border border-white flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <div className="bg-black/85 text-[10px] font-mono text-emerald-400 border border-emerald-400/40 px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
                Lost Keys [Ar Shelf]
              </div>
            </div>

            {/* Bottom HUD bar with trigger details */}
            <div className="bg-neutral-900/90 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-xl text-center">
              {currentInfoObj ? (
                <div className="text-white text-[13px] font-mono flex items-center justify-center gap-2">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <span>{currentInfoObj}</span>
                </div>
              ) : (
                <p className="text-white/80 text-[12px] font-mono leading-relaxed">
                  Touch on-screen highlighted anchors to interrogate spatial coordinates. 
                  <br />
                  <span className="text-amber-400">Click anywhere to close scanning lens.</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* 5. CHAT CONVERSATION DIALOG FLOW PANEL */}
        {/* Fades active when isChatActive is true */}
        {!isMemoryOpen && (
          <ChatFlow
            inputValue={inputValue}
            messages={messages}
            onInputChange={(val) => setInputValue(val)}
            onClearInput={() => setInputValue("")}
            onTriggerCamera={() => {
              if (requireAuth(() => setIsCaptureOpen(true))) setIsCaptureOpen(true);
            }}
            onMemoryCoreClick={() => setIsMemoryOpen(true)}
            isChatActive={isChatActive}
            isCaptureOpen={isCaptureOpen}
            onPresetSearch={handlePresetSearch}
            isAuthenticated={Boolean(user)}
          />
        )}



        {/* 7. HIGH-FIDELITY ADD ITEM CAPTURE VIEW & STICKER PIXELATE SCANNER */}
        {!isMemoryOpen && (
          <CaptureScanner
            isOpen={isCaptureOpen}
            onClose={() => setIsCaptureOpen(false)}
            existingMemories={customMemories}
            onItemAdded={handleItemAdded}
          />
        )}



        {/* Quick Back / Toggle-back Home controller inside Chat view (Small floating pill at top edge) */}
        {isChatActive && !isMemoryOpen && createPortal(
          <button
            onClick={() => setIsChatActive(false)}
            className="chat-back-button bg-black/40 hover:bg-black/60 text-white/90 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 backdrop-blur-md border border-white/10 cursor-pointer"
          >
            ← Home
          </button>,
          document.body
        )}

        {!isMemoryOpen && createPortal(
          <ActionButtons
            onChatToggle={() => setIsChatActive((prev) => !prev)}
            onCaptureClick={() => {
              if (requireAuth(() => setIsCaptureOpen(true))) setIsCaptureOpen(true);
            }}
            onMemoryClick={() => setIsMemoryOpen(true)}
            isChatActive={isChatActive || isCaptureOpen}
          />,
          document.body
        )}
      </div>

      {/* Style for scanning laser sweep embedded directly */}
      <style>
        {`
          @keyframes noma-scan-sweep {
            0%, 100% { top: 0%; }
            50% { top: 100%; }
          }
          .animate-flicker {
            animation: pulse-glow 1.5s infinite alternate;
          }
          @keyframes pulse-glow {
            0% { opacity: 0.7; transform: scale(0.95); }
            100% { opacity: 1; transform: scale(1.05); }
          }
        `}
      </style>
    </div>
  );
}
