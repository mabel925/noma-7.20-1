import { createClient } from "@supabase/supabase-js";

export const SUPABASE_PROXY_URL = import.meta.env.VITE_SUPABASE_URL || "https://noma-users.38786547.workers.dev";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_QBCoMyZvh6Px_3AFff_yTg_5BOpG8FY";

export const supabase = createClient(SUPABASE_PROXY_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
