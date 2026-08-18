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
  reserveAiScan: () => "available" | "quota" | "unavailable";
  requireAuth: (action?: () => void) => boolean;
  openLogin: () => void;
  closeLogin: () => void;
  requestOtp: (email: string, displayName?: string) => Promise<void>;
  verifyOtp: (email: string, token: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export const USERNAME_CONFLICT_MESSAGE = "该用户名已存在了";

const normalizeDisplayName = (value?: string) => value?.trim().replace(/\s+/g, " ") || "";

const assertDisplayNameAvailable = async (displayName: string, email: string) => {
  const normalizedName = normalizeDisplayName(displayName);
  if (!normalizedName) return;

  const { data, error } = await supabase.rpc("check_display_name_available", {
    candidate_name: normalizedName,
    candidate_email: email.trim().toLowerCase(),
  });
  // Older deployments may not have the optional username RPC yet. Keep auth
  // usable until the migration is applied, while enforcing it once available.
  if (error) {
    if (
      error.code === "42883" ||
      error.code === "PGRST202" ||
      /function .* does not exist|could not find .*function/i.test(error.message || "")
    ) {
      console.warn("[Auth] Username availability RPC is not installed yet.");
      return;
    }
    throw error;
  }
  if (data === false || data?.available === false) {
    throw new Error(USERNAME_CONFLICT_MESSAGE);
  }
};

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
  const [authLoading, setAuthLoading] = React.useState(!MOCK_AUTH_ENABLED);
  const [aiAccess, setAiAccess] = React.useState<AiAccessSnapshot | null>(MOCK_AUTH_ENABLED ? MOCK_AI_ACCESS : null);
  const [aiAccessLoading, setAiAccessLoading] = React.useState(false);
  const [aiAccessUnavailable, setAiAccessUnavailable] = React.useState(false);
  const [isLoginOpen, setIsLoginOpen] = React.useState(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (MOCK_AUTH_ENABLED) return;
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

    let cancelled = false;
    setAiAccess(null);
    setAiAccessLoading(true);
    setAiAccessUnavailable(false);
    readAiAccess()
      .then((access) => {
        if (cancelled) return;
        setAiAccess(access);
        setAiAccessUnavailable(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[Auth] Unable to load AI access during app startup:", error);
        setAiAccess(null);
        setAiAccessUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setAiAccessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isMock]);

  const reserveAiScan = React.useCallback((): "available" | "quota" | "unavailable" => {
    if (!user || aiAccessLoading || aiAccessUnavailable || !aiAccess) return "unavailable";
    if (aiAccess.aiScansRemaining !== null && aiAccess.aiScansRemaining <= 0) return "quota";

    if (aiAccess.aiScansRemaining !== null) {
      setAiAccess((current) => current ? {
        ...current,
        aiScansRemaining: Math.max(0, (current.aiScansRemaining ?? 1) - 1),
        aiScansUsed: current.aiScansUsed + 1,
      } : current);
    }
    return "available";
  }, [aiAccess, aiAccessLoading, aiAccessUnavailable, user]);

  const openLogin = React.useCallback(() => setIsLoginOpen(true), []);
  const closeLogin = React.useCallback(() => {
    pendingActionRef.current = null;
    setIsLoginOpen(false);
  }, []);

  const requireAuth = React.useCallback((action?: () => void) => {
    if (user) return true;
    pendingActionRef.current = action || null;
    setIsLoginOpen(true);
    return false;
  }, [user]);

  const requestOtp = React.useCallback(async (email: string, displayName?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = normalizeDisplayName(displayName);
    await assertDisplayNameAvailable(normalizedName, normalizedEmail);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      if (/duplicate|already exists|already registered|display.?name|username/i.test(error.message || "")) {
        throw new Error(USERNAME_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }, []);

  const verifyOtp = React.useCallback(async (email: string, token: string, displayName?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: "email",
    });
    if (error) throw error;

    if (data.user && displayName?.trim()) {
      await assertDisplayNameAvailable(displayName, normalizedEmail);
      const { error: updateError } = await supabase.auth.updateUser({
        data: { display_name: normalizeDisplayName(displayName) },
      });
      if (updateError) {
        if (/duplicate|already exists|already registered|display.?name|username/i.test(updateError.message || "")) {
          throw new Error(USERNAME_CONFLICT_MESSAGE);
        }
        throw updateError;
      }
    }

    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsLoginOpen(false);
    window.setTimeout(() => pendingAction?.(), 0);
  }, []);

  const signOut = React.useCallback(async () => {
    pendingActionRef.current = null;
    await mediaStorage.clearReadSession();
    if (!MOCK_AUTH_ENABLED) await supabase.auth.signOut();
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
      reserveAiScan,
      requireAuth,
      openLogin,
      closeLogin,
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
      reserveAiScan,
      requireAuth,
      openLogin,
      closeLogin,
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
