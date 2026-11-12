import React from "react";
import type { User } from "@supabase/supabase-js";
import { mediaStorage } from "../services/mediaStorage";
import { readAiAccess, type AiAccessSnapshot } from "../services/aiAuth";
import { supabase } from "../services/supabaseClient";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  isMock?: boolean;
};

export const DEFAULT_AVATAR_URL = "/default-avatar.jpg";

const MOCK_AUTH_ENABLED = import.meta.env.DEV && new URLSearchParams(window.location.search).get("mockAuth") === "1";
// Development previews may be opened through localhost, 0.0.0.0, or a LAN IP.
// Vite replaces DEV with false in production builds, so the bypass cannot ship active.
const LOCAL_OTP_BYPASS_ENABLED = import.meta.env.DEV;
const LOCAL_OTP_CODE = "000000";
const MOCK_AUTH_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@noma.local",
  displayName: "Noma Test User",
  avatarUrl: DEFAULT_AVATAR_URL,
  isMock: true,
};
const MOCK_AI_ACCESS: AiAccessSnapshot = {
  planCode: "preview",
  planName: "Preview",
  aiScanLimit: null,
  aiScansUsed: 0,
  aiScansRemaining: null,
  itemLimit: null,
  itemCount: 0,
  itemsRemaining: null,
};

type AuthContextValue = {
  user: AuthUser | null;
  authLoading: boolean;
  aiAccess: AiAccessSnapshot | null;
  aiAccessLoading: boolean;
  aiAccessUnavailable: boolean;
  isLoginOpen: boolean;
  authDialogMode: "login" | "account";
  checkAiScanAccess: () => "available" | "quota" | "unavailable";
  requireAuth: (action?: () => void) => boolean;
  openLogin: () => void;
  closeLogin: () => void;
  updateDisplayName: (displayName: string) => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const mapUser = (user: User | null): AuthUser | null => {
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: String(user.user_metadata?.display_name || user.email.split("@")[0] || "Noma user"),
    avatarUrl: String(user.user_metadata?.avatar_url || DEFAULT_AVATAR_URL),
  };
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = React.useState<AuthUser | null>(MOCK_AUTH_ENABLED ? MOCK_AUTH_USER : null);
  const [authLoading, setAuthLoading] = React.useState(!(MOCK_AUTH_ENABLED || LOCAL_OTP_BYPASS_ENABLED));
  const [isBackgroundStartupReady, setIsBackgroundStartupReady] = React.useState(
    document.documentElement.dataset.nomaHomeReady === "true",
  );
  const [aiAccess, setAiAccess] = React.useState<AiAccessSnapshot | null>(MOCK_AUTH_ENABLED ? MOCK_AI_ACCESS : null);
  const [aiAccessLoading, setAiAccessLoading] = React.useState(false);
  const [aiAccessUnavailable, setAiAccessUnavailable] = React.useState(false);
  const [isLoginOpen, setIsLoginOpen] = React.useState(false);
  const [authDialogMode, setAuthDialogMode] = React.useState<"login" | "account">("login");
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const aiAccessRequestRef = React.useRef<Promise<AiAccessSnapshot> | null>(null);

  const loadAccountAccess = React.useCallback(() => {
    if (aiAccessRequestRef.current) return aiAccessRequestRef.current;
    const request = (async () => {
      const { error } = await supabase.rpc("bootstrap_my_account");
      if (error) throw error;
      return readAiAccess();
    })();
    aiAccessRequestRef.current = request;
    request.finally(() => {
      if (aiAccessRequestRef.current === request) aiAccessRequestRef.current = null;
    }).catch(() => undefined);
    return request;
  }, []);

  React.useEffect(() => {
    if (MOCK_AUTH_ENABLED || LOCAL_OTP_BYPASS_ENABLED) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(mapUser(data.session?.user || null));
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(mapUser(session?.user || null));
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (isBackgroundStartupReady) return;
    const handleHomeReady = () => setIsBackgroundStartupReady(true);
    window.addEventListener("noma-home-ready", handleHomeReady, { once: true });
    return () => window.removeEventListener("noma-home-ready", handleHomeReady);
  }, [isBackgroundStartupReady]);

  React.useEffect(() => {
    if (!user) {
      setAiAccess(null);
      setAiAccessLoading(false);
      setAiAccessUnavailable(false);
      return;
    }
    if (user.isMock) {
      setAiAccess(MOCK_AI_ACCESS);
      setAiAccessLoading(false);
      setAiAccessUnavailable(false);
      return;
    }
    if (!isBackgroundStartupReady) {
      setAiAccess(null);
      setAiAccessLoading(false);
      setAiAccessUnavailable(false);
      return;
    }

    let cancelled = false;
    setAiAccess(null);
    setAiAccessLoading(true);
    setAiAccessUnavailable(false);
    loadAccountAccess()
      .then((access) => {
        if (cancelled) return;
        setAiAccess(access);
        setAiAccessUnavailable(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[Auth] Unable to refresh AI access in the background:", error);
        setAiAccess(null);
        setAiAccessUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setAiAccessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isBackgroundStartupReady, loadAccountAccess, user?.id, user?.isMock]);

  React.useEffect(() => {
    const syncAiAccess = (event: Event) => {
      const detail = (event as CustomEvent<{
        userId: string;
        planCode?: string;
        limit?: number;
        remaining?: number;
      }>).detail;
      if (!detail || !user || detail.userId !== user.id) return;
      setAiAccess((current) => {
        if (!current) return current;
        const limit = Number.isFinite(detail.limit) ? Number(detail.limit) : current.aiScanLimit;
        const remaining = Number.isFinite(detail.remaining) ? Number(detail.remaining) : current.aiScansRemaining;
        return {
          ...current,
          planCode: detail.planCode || current.planCode,
          aiScanLimit: limit,
          aiScansRemaining: remaining,
          aiScansUsed: limit !== null && remaining !== null
            ? Math.max(0, limit - remaining)
            : current.aiScansUsed,
        };
      });
    };
    window.addEventListener("noma-ai-access-update", syncAiAccess);
    return () => window.removeEventListener("noma-ai-access-update", syncAiAccess);
  }, [user?.id]);

  const checkAiScanAccess = React.useCallback((): "available" | "quota" | "unavailable" => {
    if (!user) return "unavailable";
    if (aiAccess?.aiScansRemaining !== null && aiAccess?.aiScansRemaining !== undefined && aiAccess.aiScansRemaining <= 0) {
      return "quota";
    }
    // The Worker remains authoritative for quota and authentication. A slow or
    // temporarily unavailable access snapshot must not silently disable vision.
    return "available";
  }, [aiAccess, user]);

  const openLogin = React.useCallback(() => {
    setAuthDialogMode(user ? "account" : "login");
    setIsLoginOpen(true);
  }, [user]);
  const closeLogin = React.useCallback(() => {
    pendingActionRef.current = null;
    setIsLoginOpen(false);
  }, []);

  const requireAuth = React.useCallback((action?: () => void) => {
    if (user) return true;
    pendingActionRef.current = action || null;
    setAuthDialogMode("login");
    setIsLoginOpen(true);
    return false;
  }, [user]);

  const updateDisplayName = React.useCallback(async (displayName: string) => {
    const normalizedName = displayName.trim().replace(/\s+/g, " ");
    if (!normalizedName) throw new Error("Name cannot be empty.");
    if (!user || user.isMock) {
      if (user?.isMock) {
        setUser((current) => current ? { ...current, displayName: normalizedName } : current);
        return;
      }
      throw new Error("Please sign in before editing your name.");
    }

    const { data: isAvailable, error: availabilityError } = await supabase.rpc("check_display_name_available", {
      candidate_name: normalizedName,
      candidate_email: user.email,
    });
    if (availabilityError) throw availabilityError;
    if (isAvailable === false || isAvailable?.available === false) {
      throw new Error("This name is already in use.");
    }

    const { error: metadataError } = await supabase.auth.updateUser({
      data: { display_name: normalizedName },
    });
    if (metadataError) throw metadataError;

    const { error: profileError } = await supabase.rpc("bootstrap_my_account", {
      preferred_display_name: normalizedName,
    });
    if (profileError) {
      await supabase.auth.updateUser({ data: { display_name: user.displayName } });
      throw profileError;
    }

    setUser((current) => current ? { ...current, displayName: normalizedName } : current);
  }, [user]);

  const requestOtp = React.useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (LOCAL_OTP_BYPASS_ENABLED) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }, []);

  const verifyOtp = React.useCallback(async (email: string, token: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (LOCAL_OTP_BYPASS_ENABLED) {
      if (token.trim() !== LOCAL_OTP_CODE) {
        throw new Error("Use 000000 for local testing.");
      }

      setUser({
        ...MOCK_AUTH_USER,
        email: normalizedEmail,
        displayName: normalizedEmail.split("@")[0] || "Noma Test User",
      });
      const pendingAction = pendingActionRef.current;
      pendingActionRef.current = null;
      setIsLoginOpen(false);
      window.setTimeout(() => pendingAction?.(), 0);
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: "email",
    });
    if (error) throw error;

    const { error: otherSessionsError } = await supabase.auth.signOut({ scope: "others" });
    if (otherSessionsError) throw otherSessionsError;

    // Finish account and plan loading before releasing the pending action.
    // This keeps the first capture from becoming the user's effective access check.
    setAiAccessLoading(true);
    setAiAccessUnavailable(false);
    try {
      const access = await loadAccountAccess();
      setAiAccess(access);
    } catch (accessError) {
      setAiAccess(null);
      setAiAccessUnavailable(true);
      throw accessError;
    } finally {
      setAiAccessLoading(false);
    }

    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsLoginOpen(false);
    window.setTimeout(() => pendingAction?.(), 0);
  }, [loadAccountAccess]);

  const signOut = React.useCallback(async () => {
    pendingActionRef.current = null;
    await mediaStorage.clearReadSession();
    if (!MOCK_AUTH_ENABLED && !LOCAL_OTP_BYPASS_ENABLED) await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      authLoading,
      aiAccess,
      aiAccessLoading,
      aiAccessUnavailable,
      isLoginOpen,
      authDialogMode,
      checkAiScanAccess,
      requireAuth,
      openLogin,
      closeLogin,
      updateDisplayName,
      requestOtp,
      verifyOtp,
      signOut,
    }),
    [
      user,
      authLoading,
      aiAccess,
      aiAccessLoading,
      aiAccessUnavailable,
      isLoginOpen,
      authDialogMode,
      checkAiScanAccess,
      requireAuth,
      openLogin,
      closeLogin,
      updateDisplayName,
      requestOtp,
      verifyOtp,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
};
