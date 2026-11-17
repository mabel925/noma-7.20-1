export type PendingEmailLogin = {
  email: string;
  resendAvailableAt: number;
  expiresAt: number;
};

const STORAGE_KEY = "noma-pending-email-login";
const DRAFT_LIFETIME_MS = 30 * 60 * 1000;
let memoryDraft: PendingEmailLogin | null = null;

// Keep this in the current browsing session, separate from auth credentials.
// Never persist the verification code. A discarded/reloaded page can resume
// the form without sending another email or assuming the user is signed in.
export const readPendingEmailLogin = (now = Date.now()): PendingEmailLogin | null => {
  let value: unknown = memoryDraft;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    value = saved ? JSON.parse(saved) : memoryDraft;
  } catch { /* Fall back to memory when session storage is unavailable. */ }
  const draft = value as PendingEmailLogin | null;
  if (!draft || typeof draft.email !== "string" || !/^\S+@\S+\.\S+$/.test(draft.email)
    || !Number.isFinite(draft.expiresAt) || !Number.isFinite(draft.resendAvailableAt)
    || draft.expiresAt <= now || draft.expiresAt > now + DRAFT_LIFETIME_MS
    || draft.resendAvailableAt > draft.expiresAt) {
    clearPendingEmailLogin();
    return null;
  }
  memoryDraft = draft;
  return draft;
};

export const savePendingEmailLogin = (email: string, now = Date.now()): PendingEmailLogin => {
  const draft = {
    email: email.trim().toLowerCase(),
    resendAvailableAt: now + 60_000,
    expiresAt: now + DRAFT_LIFETIME_MS,
  };
  writePendingEmailLogin(draft);
  return draft;
};

export const writePendingEmailLogin = (draft: PendingEmailLogin | null) => {
  memoryDraft = draft;
  try {
    if (draft) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Keep the current form usable when storage is blocked. */ }
};

export const clearPendingEmailLogin = () => writePendingEmailLogin(null);
