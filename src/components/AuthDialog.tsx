import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CloseIcon } from "./CloseIcon";
import { USERNAME_CONFLICT_MESSAGE, useAuth } from "../auth/AuthContext";

export const AuthDialog: React.FC = () => {
  const { user, isLoginOpen, closeLogin, requestOtp, verifyOtp, signOut } = useAuth();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [busy, setBusy] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendSeconds, setResendSeconds] = React.useState(0);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState("");
  const toastTimerRef = React.useRef<number | null>(null);

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  React.useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (!isLoginOpen) {
      setStep("email");
      setToken("");
      setResendSeconds(0);
      setError("");
      setToast("");
    }
  }, [isLoginOpen]);

  React.useEffect(() => {
    if (!isLoginOpen || step !== "otp" || resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLoginOpen, resendSeconds, step]);

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestOtp(email, displayName);
      setStep("otp");
      setResendSeconds(60);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to send the verification code.";
      if (message === USERNAME_CONFLICT_MESSAGE) {
        setError("");
        showToast(USERNAME_CONFLICT_MESSAGE);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (busy || resending || resendSeconds > 0) return;
    setResending(true);
    setError("");
    try {
      await requestOtp(email, displayName);
      setResendSeconds(60);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to resend the verification code.";
      if (message === USERNAME_CONFLICT_MESSAGE) {
        setError("");
        showToast(USERNAME_CONFLICT_MESSAGE);
      } else {
        setError(message);
      }
    } finally {
      setResending(false);
    }
  };

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(token.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyOtp(email, token, displayName);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "The verification code is invalid.";
      if (message === USERNAME_CONFLICT_MESSAGE) {
        setError("");
        showToast(USERNAME_CONFLICT_MESSAGE);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isLoginOpen && (
        <>
        <motion.div
          className="pointer-events-auto fixed inset-0 z-[100000] isolate flex items-center justify-center bg-[#232121]/35 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeLogin(); }}
        >
          <motion.form
            onSubmit={user ? (event) => { event.preventDefault(); } : step === "email" ? submitEmail : submitOtp}
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 310, damping: 27 }}
            className="relative z-10 w-full max-w-[360px] rounded-[36px] bg-[#E9E6E1] px-6 pb-7 pt-8 text-[#232121] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          >
            <button type="button" aria-label="Close login" onClick={closeLogin} className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-white/70">
              <CloseIcon className="h-4 w-4 text-[#232121]" />
            </button>
            {user && step === "email" ? (
              <>
                <p className="text-[13px] font-semibold text-[#232121]/50">Noma account</p>
                <h2 className="mt-2 text-[28px] font-bold leading-tight">{user.displayName}</h2>
                <p className="mt-3 text-[14px] leading-5 text-[#232121]/60">{user.email}</p>
                <p className="mt-7 rounded-[16px] bg-white/60 px-4 py-3 text-[13px] leading-5 text-[#232121]/60">Your Memory data is stored in your private cloud account.</p>
                <button type="button" onClick={() => { void signOut(); closeLogin(); }} className="mt-7 flex h-[50px] w-full items-center justify-center rounded-full border border-[#232121]/20 text-[15px] font-semibold text-[#232121] active:scale-[0.98]">Sign out</button>
              </>
            ) : step === "email" ? (
              <>
                <p className="text-[13px] font-semibold text-[#232121]/50">Noma account</p>
                <h2 className="mt-2 text-[28px] font-bold leading-tight">Save your space</h2>
                <p className="mt-3 max-w-[280px] text-[14px] leading-5 text-[#232121]/60">Enter your email and we will send a secure verification code.</p>
                <label className="mt-7 block text-[13px] font-semibold">Name</label>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-2 h-12 w-full border-b border-[#CCC4BE] bg-transparent text-[16px] outline-none" />
                <label className="mt-5 block text-[13px] font-semibold">Email</label>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="mt-2 h-12 w-full border-b border-[#CCC4BE] bg-transparent text-[16px] outline-none" />
                {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
                <button disabled={busy} type="submit" className="mt-7 flex h-[50px] w-full items-center justify-center rounded-full bg-[#232121] text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-50">{busy ? "Sending..." : "Send code"}</button>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-[#232121]/50">Check your inbox</p>
                <h2 className="mt-2 text-[28px] font-bold leading-tight">Verify email</h2>
                <p className="mt-3 text-[14px] leading-5 text-[#232121]/60">We sent a 6-digit code to {email}.</p>
                <label className="mt-7 block text-[13px] font-semibold">Verification code</label>
                <div className="relative mt-2 flex h-14 w-full items-center border-b border-[#CCC4BE]">
                  <input value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="h-full min-w-0 flex-1 bg-transparent pr-[76px] text-center text-[24px] tracking-[0.3em] outline-none" />
                  <button
                    type="button"
                    disabled={busy || resending || resendSeconds > 0}
                    onClick={() => { void resendOtp(); }}
                    className="absolute right-0 flex h-8 min-w-[64px] items-center justify-end text-[13px] font-semibold text-[#232121]/60 disabled:cursor-default disabled:text-[#232121]/35"
                  >
                    {resending ? "Sending..." : resendSeconds > 0 ? `${resendSeconds}s` : "Resend"}
                  </button>
                </div>
                {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
                <button disabled={busy || resending} type="submit" className="mt-7 flex h-[50px] w-full items-center justify-center rounded-full bg-[#232121] text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-50">{busy ? "Verifying..." : "Verify and continue"}</button>
                <button type="button" onClick={() => { setStep("email"); setError(""); }} className="mt-4 w-full text-center text-[13px] text-[#232121]/55">Use a different email</button>
              </>
            )}
          </motion.form>
        </motion.div>
        {toast && (
          <motion.div
            className="pointer-events-none fixed bottom-[28px] left-1/2 z-[100001] -translate-x-1/2 rounded-full bg-[#232121]/82 px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            {toast}
          </motion.div>
        )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
