import { createClient } from "@supabase/supabase-js";
import { NOMA_SUPABASE_URL } from "./backendUrls";

export const SUPABASE_PROXY_URL = NOMA_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_QBCoMyZvh6Px_3AFff_yTg_5BOpG8FY";

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const requestInit: RequestInit = init ?? {};
  const controller = new AbortController();
  const upstreamSignal = requestInit.signal;
  const forwardAbort = () => controller.abort(upstreamSignal?.reason);
  upstreamSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort("Supabase request timed out"), 20_000);

  try {
    return await fetch(input, { ...requestInit, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      throw new Error("Connection timed out. Please check your network and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", forwardAbort);
  }
};

export const supabase = createClient(SUPABASE_PROXY_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
