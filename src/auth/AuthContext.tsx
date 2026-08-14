import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
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
  };
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [isLoginOpen, setIsLoginOpen] = React.useState(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
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
    await supabase.auth.signOut();
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
