import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CloseIcon } from "./CloseIcon";
import { EditPencilIcon } from "./EditPencilIcon";
import { useAuth } from "../auth/AuthContext";

const LOGIN_STEP_TRANSITION = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

export const AuthDialog: React.FC = () => {
  const { user, aiAccess: access, isLoginOpen, authDialogMode, closeLogin, requestOtp, verifyOtp, updateDisplayName, signOut } = useAuth();
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [busy, setBusy] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendSeconds, setResendSeconds] = React.useState(0);
  const [error, setError] = React.useState("");
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);
  const [accountError, setAccountError] = React.useState("");
  const autoVerifyRef = React.useRef(false);
  const otpInputRef = React.useRef<HTMLInputElement>(null);
  const showAccount = authDialogMode === "account" && Boolean(user);

  React.useEffect(() => {
    if (!isEditingName && user) setNameDraft(user.displayName);
  }, [isEditingName, user?.displayName]);

  React.useEffect(() => {
    if (!isLoginOpen) {
      setStep("email");
      setToken("");
      autoVerifyRef.current = false;
      setResendSeconds(0);
      setError("");
      setIsEditingName(false);
      setAccountError("");
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
      await requestOtp(email);
      setStep("otp");
      setResendSeconds(60);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to send the verification code.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (busy || resending || resendSeconds > 0) return;
    setResending(true);
    setError("");
    try {
      await requestOtp(email);
      setResendSeconds(60);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to resend the verification code.";
      setError(message);
    } finally {
      setResending(false);
    }
  };

  const verifyCode = async (code: string) => {
    if (!/^\d{6}$/.test(code.trim()) || autoVerifyRef.current) return;
    autoVerifyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await verifyOtp(email, code);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "The verification code is invalid.";
      setError(message);
      autoVerifyRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(token);
  };

  const saveDisplayName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setAccountError("");
    try {
      await updateDisplayName(nameDraft);
      setIsEditingName(false);
    } catch (nextError) {
      setAccountError(nextError instanceof Error ? nextError.message : "Unable to update your name.");
    } finally {
      setSavingName(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isLoginOpen && (
        <>
        <motion.div
          className="fixed inset-0 z-[100000] bg-[#232121]/35 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={closeLogin}
        />
        <div className="pointer-events-none fixed inset-0 z-[100001] isolate flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 310, damping: 27 }}
            className="pointer-events-auto relative w-full max-w-[360px]"
          >
            <form
              onSubmit={showAccount ? (isEditingName ? saveDisplayName : (event) => { event.preventDefault(); }) : step === "email" ? submitEmail : submitOtp}
              className={`relative w-full rounded-[36px] bg-[#E9E6E1] px-6 pb-7 pt-8 text-[#232121] shadow-[0_24px_80px_rgba(0,0,0,0.28)] ${showAccount ? "" : "h-[380px] overflow-hidden"}`}
            >
            {showAccount && user ? (
              <>
                <p className="text-[13px] font-semibold text-[#232121]/50">Noma account</p>
                {isEditingName ? (
                  <>
                    <input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      autoFocus
                      maxLength={80}
                      aria-label="Username"
                      className="mt-2 h-10 w-full border-b border-[#CCC4BE] bg-transparent text-[22px] font-bold outline-none"
                    />
                    {accountError && <p className="mt-2 text-[13px] text-red-600">{accountError}</p>}
                    <div className="mt-4 flex justify-end gap-4 text-[13px] font-semibold">
                      <button type="button" disabled={savingName} onClick={() => { setNameDraft(user.displayName); setAccountError(""); setIsEditingName(false); }} className="text-[#232121]/55 disabled:opacity-50">Cancel</button>
                      <button type="submit" disabled={savingName || !nameDraft.trim()} className="text-[#232121] disabled:opacity-50">{savingName ? "Saving..." : "Save"}</button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 flex min-w-0 items-center gap-2 pr-12">
                    <h2 className="min-w-0 truncate text-[28px] font-bold leading-tight" title={user.displayName}>{user.displayName}</h2>
                    <button type="button" onClick={() => { setNameDraft(user.displayName); setAccountError(""); setIsEditingName(true); }} aria-label="Edit username" title="Edit username" className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <EditPencilIcon />
                    </button>
                  </div>
                )}
                <p className="mt-3 text-[14px] leading-5 text-[#232121]/60">{user.email}</p>
                {access && (
                  <div className="mt-5 rounded-[16px] bg-white/60 px-4 py-3 text-[13px] leading-5 text-[#232121]/65">
                    <div className="flex items-center justify-between">
                      <span>Plan</span>
                      <strong className="text-[#232121]">{access.planName || access.planCode}</strong>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>AI scans remaining</span>
                      <strong className="text-[#232121]">{access.aiScansRemaining === null ? "Unlimited" : access.aiScansRemaining}</strong>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Items</span>
                      <strong className="text-[#232121]">{access.itemCount}{access.itemLimit === null ? "" : " / " + access.itemLimit}</strong>
                    </div>
                  </div>
                )}
                <p className="mt-7 rounded-[16px] bg-white/60 px-4 py-3 text-[13px] leading-5 text-[#232121]/60">Your Memory data is stored in your private cloud account.</p>
                <button type="button" onClick={() => { void signOut(); closeLogin(); }} className="mt-7 flex h-[50px] w-full items-center justify-center rounded-full border border-[#232121]/20 text-[15px] font-semibold text-[#232121] active:scale-[0.98]">Sign out</button>
              </>
            ) : (
              <div className="relative -mx-6 h-full w-[calc(100%+48px)] overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ x: step === "email" ? "0%" : "-50%" }}
                  transition={LOGIN_STEP_TRANSITION}
                  onAnimationComplete={() => {
                    if (step === "otp") otpInputRef.current?.focus({ preventScroll: true });
                  }}
                  className="absolute inset-y-0 left-0 flex h-full w-[200%] transform-gpu [backface-visibility:hidden] [will-change:transform]"
                >
                  <div aria-hidden={step !== "email"} className={`flex h-full w-1/2 shrink-0 flex-col px-6 ${step !== "email" ? "pointer-events-none" : ""}`}>
                    <h2 className="mt-2 text-[28px] font-bold leading-tight">Login</h2>
                    <p className="mt-3 h-10 max-w-[280px] text-[14px] leading-5 text-[#232121]/60">Enter your email and we will send a secure verification code.</p>
                    <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" required aria-label="Email" placeholder="enter your email" tabIndex={step === "email" ? 0 : -1} className="mt-7 h-14 w-full border-b border-[#AAA29C] bg-transparent text-[16px] outline-none placeholder:text-[#232121]/35" />
                    <div className="min-h-5 pt-1.5">{error && <p className="text-[13px] text-red-600">{error}</p>}</div>
                    <button disabled={busy} tabIndex={step === "email" ? 0 : -1} type="submit" className="mt-auto flex h-[50px] w-full shrink-0 items-center justify-center rounded-full bg-[#232121] text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-50">{busy ? "Sending..." : "Send code"}</button>
                    <div aria-hidden="true" className="mt-4 h-5 w-full shrink-0" />
                  </div>

                  <div aria-hidden={step !== "otp"} className={`flex h-full w-1/2 shrink-0 flex-col px-6 ${step !== "otp" ? "pointer-events-none" : ""}`}>
                    <h2 className="mt-2 text-[28px] font-bold leading-tight">Verify email</h2>
                    <p className="mt-3 h-10 text-[14px] leading-5 text-[#232121]/60">please enter email verification code</p>
                    <label className="relative mt-7 block h-14 w-full cursor-text" aria-label="6-digit verification code">
                      <input ref={otpInputRef} value={token} onChange={(event) => {
                        const nextToken = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setToken(nextToken);
                        setError("");
                        if (nextToken.length === 6) void verifyCode(nextToken);
                        else autoVerifyRef.current = false;
                      }} inputMode="numeric" autoComplete="one-time-code" disabled={busy} tabIndex={step === "otp" ? 0 : -1} className="absolute inset-0 z-10 h-full w-full bg-transparent text-transparent caret-transparent outline-none disabled:opacity-60" />
                      <span aria-hidden="true" className="grid h-full grid-cols-6 gap-3">
                        {Array.from({ length: 6 }, (_, index) => (
                          <span key={index} className="flex h-full items-center justify-center border-b border-[#AAA29C] text-[24px] font-semibold text-[#232121]">
                            {token[index] || ""}
                          </span>
                        ))}
                      </span>
                    </label>
                    <div className="mt-3 flex min-h-5 items-center justify-center">
                      <button
                        type="button"
                        disabled={busy || resending || resendSeconds > 0}
                        tabIndex={step === "otp" ? 0 : -1}
                        onClick={() => { void resendOtp(); }}
                        className="text-[13px] font-semibold text-[#232121]/60 disabled:cursor-default disabled:text-[#232121]/35"
                      >
                        {resending ? "Sending..." : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
                      </button>
                    </div>
                    <div className="min-h-5 pt-1.5">{error && <p className="text-[13px] text-red-600">{error}</p>}</div>
                    <button disabled={busy || resending || token.length !== 6} tabIndex={step === "otp" ? 0 : -1} type="submit" className="mt-auto flex h-[50px] w-full shrink-0 items-center justify-center rounded-full bg-[#232121] text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-50">{busy ? "Signing in..." : "Continue"}</button>
                    <button type="button" tabIndex={step === "otp" ? 0 : -1} onClick={() => { setStep("email"); setError(""); }} className="mt-4 w-full text-center text-[13px] text-[#232121]/55">Use a different email</button>
                  </div>
                </motion.div>
              </div>
            )}
            </form>
            <button type="button" aria-label="Close login" onClick={closeLogin} className="absolute right-5 top-5 z-30 flex h-8 w-8 transform-gpu items-center justify-center rounded-full bg-white [backface-visibility:hidden]">
              <CloseIcon className="h-4 w-4 text-[#232121]" />
            </button>
          </motion.div>
        </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
