import React from "react";
import type { User } from "@supabase/supabase-js";
import { mediaStorage } from "../services/mediaStorage";
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

type AuthContextValue = {
  user: AuthUser | null;
  authLoading: boolean;
  isLoginOpen: boolean;
  requireAuth: (action?: () => void) => boolean;
  openLogin: () => void;
  closeLogin: () => void;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string, displayName?: string) => Promise<void>;
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
  const [authLoading, setAuthLoading] = React.useState(!MOCK_AUTH_ENABLED);
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

  const requestOtp = React.useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
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
      await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
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
    () => ({ user, authLoading, isLoginOpen, requireAuth, openLogin, closeLogin, requestOtp, verifyOtp, signOut }),
    [user, authLoading, isLoginOpen, requireAuth, openLogin, closeLogin, requestOtp, verifyOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
};
