import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { VirtualStage } from "./components/VirtualStage";
import { Header } from "./components/Header";
import { ActionButtons } from "./components/ActionButtons";
import { ChatFlow } from "./components/ChatFlow";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { AddItemFlowV13 } from "./components/AddItemFlowV13";
import { useKeyboardReset } from "./hooks/useKeyboardReset";
import { memoryStorage, type MemoryPageCursor } from "./services/memoryStorage";
import { searchChatMemory } from "./services/chatSearch";
import type { ChatMessage, ChatSpaceResult, MemoryOpenTarget } from "./types/chat";

import { Wifi, Battery, Signal, RefreshCw, Sparkles, Target, Info } from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "motion/react";

import { MemoryList, MemoryItem } from "./components/MemoryList";
import { CloseIcon } from "./components/CloseIcon";
import { useAuth } from "./auth/AuthContext";
import { isStandalonePwa, syncDisplayModeClasses } from "./utils/appViewport";
import { preloadDeferredAssets, preloadStartupAssets, subscribeStartupPreload } from "./services/startupPreload";
import { checkForAppUpdate } from "./services/appUpdate";

const HOME_BACKGROUND_URL = "/home-bg.jpg";
const chatMessageId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const withChatSearchTimeout = <T,>(task: Promise<T>, timeoutMs = 4000): Promise<T> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error("Chat search timed out")), timeoutMs);
  task.then(
    (value) => { window.clearTimeout(timer); resolve(value); },
    (error) => { window.clearTimeout(timer); reject(error); },
  );
});

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: "seed-laptop",
    name: "Laptop",
    category: "电子产品",
    price: "$1499.00",
    date: "Today",
    emoji: "💻",
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
  const { user, authLoading, requireAuth, openLogin } = useAuth();
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [isChatActive, setIsChatActive] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCaptureOpen, setIsCaptureOpen] = useState<boolean>(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState<boolean>(false);
  const [hasOpenedMemory, setHasOpenedMemory] = useState<boolean>(false);
  const [memoryOpenTarget, setMemoryOpenTarget] = useState<MemoryOpenTarget | null>(null);
  const [isStandaloneMode, setIsStandaloneMode] = useState<boolean>(false);
  const launchStartedAtRef = React.useRef(performance.now());
  const displayedStartupProgressRef = React.useRef(4);
  const [areStageAssetsReady, setAreStageAssetsReady] = useState(false);
  const [areStartupAssetsReady, setAreStartupAssetsReady] = useState(false);
  const [startupAssetProgress, setStartupAssetProgress] = useState({ loaded: 0, total: 1 });
  const [isVersionCheckReady, setIsVersionCheckReady] = useState(false);
  const [isAuthGateReady, setIsAuthGateReady] = useState(!authLoading);
  const [didStartupTimeout, setDidStartupTimeout] = useState(false);
  const [isHomeReady, setIsHomeReady] = useState(false);
  const handleHomeReady = React.useCallback(() => setAreStageAssetsReady(true), []);
  const openMemory = React.useCallback(() => {
    setHasOpenedMemory(true);
    setIsMemoryOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeStartupPreload(({ loaded, total }) => {
      if (cancelled) return;
      setStartupAssetProgress({ loaded, total: Math.max(1, total) });
      if (loaded >= total) {
        setAreStartupAssetsReady(true);
      }
    });
    void preloadStartupAssets().then(() => {
      if (!cancelled) {
        setAreStartupAssetsReady(true);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void checkForAppUpdate().finally(() => {
      if (!cancelled) setIsVersionCheckReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authLoading) {
      setIsAuthGateReady(true);
      return;
    }
    const timer = window.setTimeout(() => {
      console.warn("[Startup] Local auth restoration exceeded 2500ms; continuing startup.");
      setIsAuthGateReady(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [authLoading]);

  useEffect(() => {
    if (isHomeReady) return;
    const timer = window.setTimeout(() => {
      console.warn("[Startup] Critical startup tasks exceeded 10 seconds; entering the home fallback.");
      setDidStartupTimeout(true);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [isHomeReady]);

  const startupProgress = React.useMemo(() => {
    if (didStartupTimeout) return 100;
    const assetRatio = Math.min(1, startupAssetProgress.loaded / startupAssetProgress.total);
    return Math.min(100, Math.round(
      4
      + (isVersionCheckReady ? 12 : 0)
      + (isAuthGateReady ? 14 : 0)
      + assetRatio * 50
      + (areStageAssetsReady ? 20 : 0),
    ));
  }, [areStageAssetsReady, didStartupTimeout, isAuthGateReady, isVersionCheckReady, startupAssetProgress]);

  useEffect(() => {
    const splash = document.getElementById("startup-splash");
    const fill = document.getElementById("startup-progress-fill");
    const label = document.getElementById("startup-progress-label");
    const progressbar = splash?.querySelector<HTMLElement>('[role="progressbar"]');
    const roundedProgress = Math.max(displayedStartupProgressRef.current, Math.min(100, Math.round(startupProgress)));
    displayedStartupProgressRef.current = roundedProgress;
    if (fill) fill.style.width = `${roundedProgress}%`;
    if (label) label.textContent = `${roundedProgress}%`;
    progressbar?.setAttribute("aria-valuenow", String(roundedProgress));
  }, [startupProgress]);

  useEffect(() => {
    const criticalTasksReady = isVersionCheckReady
      && isAuthGateReady
      && areStartupAssetsReady
      && areStageAssetsReady;
    if (!criticalTasksReady && !didStartupTimeout) return;
    const elapsed = performance.now() - launchStartedAtRef.current;
    const timer = window.setTimeout(() => setIsHomeReady(true), Math.max(240, 650 - elapsed));
    return () => window.clearTimeout(timer);
  }, [areStageAssetsReady, areStartupAssetsReady, didStartupTimeout, isAuthGateReady, isVersionCheckReady]);

  useEffect(() => {
    if (!isHomeReady) return;
    document.documentElement.dataset.nomaHomeReady = "true";
    window.dispatchEvent(new Event("noma-home-ready"));
    const splash = document.getElementById("startup-splash");
    splash?.classList.add("is-hidden");
    const removeTimer = window.setTimeout(() => splash?.remove(), 380);
    const preloadDeferred = () => void preloadDeferredAssets();
    const idleWindow = window as unknown as {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    const requestIdle = idleWindow.requestIdleCallback?.bind(window);
    const cancelIdle = idleWindow.cancelIdleCallback?.bind(window);
    const idleTimer = requestIdle
      ? requestIdle(preloadDeferred, { timeout: 2500 })
      : window.setTimeout(preloadDeferred, 500);
    return () => {
      window.clearTimeout(removeTimer);
      if (requestIdle && cancelIdle) cancelIdle(idleTimer);
      else window.clearTimeout(idleTimer);
    };
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
  const [memoryNextCursor, setMemoryNextCursor] = useState<MemoryPageCursor | null>(null);
  const [hasMoreMemories, setHasMoreMemories] = useState(false);
  const [isLoadingMoreMemories, setIsLoadingMoreMemories] = useState(false);
  const customMemoriesRef = React.useRef<MemoryItem[]>([]);
  const memorySnapshotRef = React.useRef<MemoryItem[]>([]);
  const persistedMemorySnapshotsRef = React.useRef(new Map<string, MemoryItem[]>());
  const memorySyncQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  customMemoriesRef.current = customMemories;

  const enqueueMemorySync = React.useCallback((
    ownerId: string,
    nextItems: MemoryItem[],
  ) => {
    const operation = memorySyncQueueRef.current.then(async () => {
      const previousItems = persistedMemorySnapshotsRef.current.get(ownerId) || [];
      const persistedItems = await memoryStorage.syncItems(ownerId, previousItems, nextItems);
      // The server response contains authoritative versions and permanent R2
      // references. It becomes the next explicit-CRUD comparison baseline.
      persistedMemorySnapshotsRef.current.set(ownerId, persistedItems);
      return persistedItems;
    });
    memorySyncQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  // Only hydrate data after a user exists. Signed-out sessions intentionally
  // never read the old test database or any account-scoped data.
  useEffect(() => {
    let cancelled = false;

    customMemoriesRef.current = [];
    memorySnapshotRef.current = [];
    setCustomMemories([]);
    setIsMemoryHydrated(false);
    setHydratedUserId(null);
    setMemoryNextCursor(null);
    setHasMoreMemories(false);
    if (!user || !isHomeReady) return () => { cancelled = true; };
    persistedMemorySnapshotsRef.current.delete(user.id);
    if (user.isMock) {
      customMemoriesRef.current = DEFAULT_MEMORIES;
      memorySnapshotRef.current = DEFAULT_MEMORIES;
      setCustomMemories(DEFAULT_MEMORIES);
      setIsMemoryHydrated(true);
      setHydratedUserId(user.id);
      return () => { cancelled = true; };
    }

    memoryStorage
      .listItemsPage(user.id)
      .then((page) => {
        if (cancelled) return;
        const items = page.items;
        setCustomMemories((currentItems) => {
          const currentIds = new Set(currentItems.map((item) => item.id));
          const mergedItems = currentItems.length === 0
            ? items
            : [...currentItems, ...items.filter((item) => !currentIds.has(item.id))];
          memorySnapshotRef.current = items;
          persistedMemorySnapshotsRef.current.set(user.id, items);
          customMemoriesRef.current = mergedItems;
          return mergedItems;
        });
        setIsMemoryHydrated(true);
        setHydratedUserId(user.id);
        setMemoryNextCursor(page.nextCursor);
        setHasMoreMemories(page.hasMore);
      })
      .catch((error) => {
        console.error("[App] Failed to load cloud memories:", error);
        if (!cancelled) {
          setIsMemoryHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isHomeReady, user?.id, user?.isMock]);

  // Persist only the delta between local snapshots. Writes are serialized so
  // a slower, older request cannot finish after and overwrite a newer edit.
  useEffect(() => {
    if (!isMemoryHydrated || !user || user.isMock || hydratedUserId !== user.id) return;

    const previousItems = memorySnapshotRef.current;
    const nextItems = customMemories;
    memorySnapshotRef.current = nextItems;
    if (previousItems === nextItems) return;
    enqueueMemorySync(user.id, nextItems)
      .then((persistedItems) => {
        if (customMemoriesRef.current !== nextItems) return;
        memorySnapshotRef.current = persistedItems;
        customMemoriesRef.current = persistedItems;
        setCustomMemories(persistedItems);
      })
      .catch((error) => {
        console.error("[App] Failed to persist cloud memories:", error);
        const rollbackItems = persistedMemorySnapshotsRef.current.get(user.id) || [];
        memorySnapshotRef.current = rollbackItems;
        customMemoriesRef.current = rollbackItems;
        setCustomMemories(rollbackItems);
        setToast(/VERSION_CONFLICT|40001/i.test(String(error)) ? "该物品已在其他设备修改，请重试" : "保存失败，已恢复上一次数据");
      });
  }, [customMemories, enqueueMemorySync, isMemoryHydrated, hydratedUserId, user?.id, user?.isMock]);

  const loadMoreMemories = React.useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || currentUser.isMock || !memoryNextCursor || isLoadingMoreMemories) return;
    setIsLoadingMoreMemories(true);
    try {
      await memorySyncQueueRef.current;
      const page = await memoryStorage.listItemsPage(currentUser.id, memoryNextCursor);
      const currentItems = customMemoriesRef.current;
      const currentIds = new Set(currentItems.map((item) => item.id));
      const mergedItems = [...currentItems, ...page.items.filter((item) => !currentIds.has(item.id))];
      memorySnapshotRef.current = mergedItems;
      persistedMemorySnapshotsRef.current.set(currentUser.id, mergedItems);
      customMemoriesRef.current = mergedItems;
      setCustomMemories(mergedItems);
      setMemoryNextCursor(page.nextCursor);
      setHasMoreMemories(page.hasMore);
    } catch (error) {
      console.error("[App] Failed to load the next memory page:", error);
    } finally {
      setIsLoadingMoreMemories(false);
    }
  }, [isLoadingMoreMemories, memoryNextCursor]);
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
      id: "chat-welcome",
      sender: "noma",
      text: "Hi, I'm noma. Snap a photo of the items scattered around your space, and I'll help you find the perfect home for them.",
    },
  ]);
  const [isChatSearching, setIsChatSearching] = useState(false);
  const chatSearchRequestRef = React.useRef(0);
  const chatResultContextRef = React.useRef<{
    items?: MemoryItem[];
    spaces?: ChatSpaceResult[];
  }>({});

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

  const handleNomaSearch = async (query: string) => {
    if (!userRef.current) {
      requireAuth(() => void handleNomaSearch(query));
      return;
    }
    const currentUser = userRef.current;
    const requestId = chatSearchRequestRef.current + 1;
    chatSearchRequestRef.current = requestId;
    setIsChatSearching(true);
    const startedAt = performance.now();
    let source: "context" | "cloud" | "local" = "cloud";

    try {
      let result;
      const itemContextFollowup = /^(?:where is it|where are they|show it|open it|它在哪|它在哪里|打开它)[?？.!。]*$/i.test(query.trim());
      const spaceContextFollowup = /^(?:what(?:'s| is) in there|show me that space|open that space|那里有什么|里面有什么|打开那里)[?？.!。]*$/i.test(query.trim());
      if (itemContextFollowup && chatResultContextRef.current.items?.length) {
        source = "context";
        result = { kind: "items" as const, items: chatResultContextRef.current.items };
      } else if (spaceContextFollowup && chatResultContextRef.current.spaces?.length) {
        source = "context";
        result = { kind: "spaces" as const, spaces: chatResultContextRef.current.spaces };
      } else {
        try {
          result = await withChatSearchTimeout(searchChatMemory({
            ownerId: currentUser.id,
            isMock: Boolean(currentUser.isMock),
            query,
            loadedItems: customMemoriesRef.current,
          }));
        } catch (error) {
          source = "local";
          console.warn("[ChatSearch] Cloud search failed; using loaded memory fallback.", error);
          result = await searchChatMemory({
            ownerId: currentUser.id,
            isMock: true,
            query,
            loadedItems: customMemoriesRef.current,
          });
        }
      }
      if (chatSearchRequestRef.current !== requestId) return;

      if (result.kind === "items") {
        chatResultContextRef.current = { items: result.items };
        setMessages((previous) => [...previous, {
          id: chatMessageId(),
          sender: "noma",
          text: result.items.length === 1 ? "Find it!!" : `You have ${result.items.length} of them. Take a look below.`,
          items: result.items,
        }]);
      } else if (result.kind === "spaces") {
        chatResultContextRef.current = { spaces: result.spaces };
        setMessages((previous) => [...previous, {
          id: chatMessageId(),
          sender: "noma",
          text: result.spaces.length === 1
            ? "I found that space. Take a look below."
            : `I found ${result.spaces.length} spaces matching that. Which one do you want to check?`,
          spaces: result.spaces,
        }]);
      } else if (result.kind === "unsupported") {
        chatResultContextRef.current = {};
        setMessages((previous) => [...previous, {
          id: chatMessageId(),
          sender: "noma",
          text: "Noma only keeps an eye on your things and spaces. Ask me what you own or where something is, and I'll look through your memory.",
        }]);
      } else {
        chatResultContextRef.current = {};
        setMessages((previous) => [...previous, {
          id: chatMessageId(),
          sender: "noma",
          text: `I don't remember seeing “${query}” yet. Tap + to introduce it to me, and I won't forget it next time.`,
        }]);
      }
      const resultCount = result.kind === "items"
        ? result.items.length
        : result.kind === "spaces" ? result.spaces.length : 0;
      console.info("[ChatSearch]", {
        source,
        outcome: result.kind,
        resultCount,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (chatSearchRequestRef.current === requestId) setIsChatSearching(false);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const currentInput = inputValue;
    if (!userRef.current) {
      requireAuth(() => {
      setMessages((prev) => [...prev, { id: chatMessageId(), sender: "user", text: currentInput }]);
      setInputValue("");
      void handleNomaSearch(currentInput);
      });
      return;
    }
    setMessages((prev) => [...prev, { id: chatMessageId(), sender: "user", text: currentInput }]);
    setInputValue("");
    void handleNomaSearch(currentInput);
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
  // Add item save to Noma's searchable memory bank
  const handleItemAdded = async (
    nameOrItem: string | Omit<MemoryItem, "id">,
    price?: string,
    date?: string,
    emoji?: string
  ): Promise<void> => {
    const currentUser = userRef.current;
    if (!currentUser) {
      requireAuth(() => {
        void handleItemAdded(nameOrItem, price, date, emoji);
      });
      return;
    }
    let newItem: MemoryItem;

    if (typeof nameOrItem === "object") {
      newItem = memoryStorage.createItem(currentUser.id, {
        ...nameOrItem,
      });
    } else {
      newItem = memoryStorage.createItem(currentUser.id, {
        name: nameOrItem,
        category: "其它",
        price: price || "$25.00",
        date: date || "Today",
        emoji: emoji || "📝",
        parentLocationName: "Bedroom",
        subLocationName: "Drawer",
      });
    }

    // A sub-space created before its parent is represented as a top-level
    // space in Memory. Once a parent is supplied, move the existing records
    // under that parent so the sub-space remains a child card and keeps all
    // of its item relationships.
    const nextParentName = newItem.parentLocationName?.trim() || "";
    const nextSubName = newItem.subLocationName?.trim() || "";
    const previousItems = customMemoriesRef.current;
    const migrated = nextParentName && nextSubName
      ? previousItems.map((existingItem) => {
            const existingParentName = existingItem.parentLocationName?.trim() || "";
            const existingSubName = existingItem.subLocationName?.trim() || "";
            if (existingParentName || existingSubName !== nextSubName) return existingItem;
            return {
              ...existingItem,
              parentLocationName: nextParentName,
              parentLocationImg: existingItem.parentLocationImg || newItem.parentLocationImg,
            };
          })
      : previousItems;
    const nextItems = [newItem, ...migrated.filter((item) => item.id !== newItem.id)];

    const persistedItems = currentUser.isMock
      ? nextItems
      : await enqueueMemorySync(currentUser.id, nextItems);
    newItem = persistedItems.find((item) => item.id === newItem.id) || newItem;
    memorySnapshotRef.current = persistedItems;
    persistedMemorySnapshotsRef.current.set(currentUser.id, persistedItems);
    customMemoriesRef.current = persistedItems;
    setCustomMemories(persistedItems);
    setToast("保存成功");
    
    // Smooth transition message from Noma
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: chatMessageId(),
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
      <div className="keyboard-bg-sync-parent absolute inset-0 pointer-events-none md:fixed md:left-1/2 md:top-1/2 md:w-[393px] md:h-[852px] md:-ml-[196.5px] md:-mt-[426px] md:overflow-hidden md:rounded-[36px]">
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
            bgRoomUrl={HOME_BACKGROUND_URL}
            bgChatUrl={HOME_BACKGROUND_URL}
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
        className="fixed inset-0 md:relative md:inset-auto w-full max-w-none md:max-w-[393px] h-[100vh] md:h-[852px] rounded-none md:rounded-[36px] bg-transparent border-none md:border md:border-white/10 shadow-none md:shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden will-change-transform z-10"
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
        {hasOpenedMemory && (
          <MemoryList
            isOpen={isMemoryOpen}
            onClose={() => setIsMemoryOpen(false)}
            memories={customMemories}
            onMemoriesChange={setCustomMemories}
            isAuthenticated={Boolean(user)}
            onRequireAuth={(action) => requireAuth(action)}
            onLogin={openLogin}
            hasMore={hasMoreMemories}
            isLoadingMore={isLoadingMoreMemories}
            onLoadMore={() => void loadMoreMemories()}
            openTarget={memoryOpenTarget}
            onOpenTargetHandled={() => setMemoryOpenTarget(null)}
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
            onMemoryCoreClick={openMemory}
            isChatActive={isChatActive}
            isCaptureOpen={isCaptureOpen}
            isSearching={isChatSearching}
            onItemResultClick={(item) => {
              setMemoryOpenTarget({ requestId: Date.now(), kind: "item", item });
              openMemory();
            }}
            onSpaceResultClick={(space: ChatSpaceResult) => {
              setMemoryOpenTarget({ requestId: Date.now(), kind: "space", space });
              openMemory();
            }}
          />
        )}



        {/* 7. HIGH-FIDELITY ADD ITEM CAPTURE VIEW & STICKER PIXELATE SCANNER */}
        {!isMemoryOpen && (
          <AddItemFlowV13
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
            onMemoryClick={openMemory}
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
