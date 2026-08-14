const AI_WORKER_URL = "https://noma.38786547.workers.dev/";
const SUPABASE_WORKER_URL = "https://noma-users.38786547.workers.dev";

const productionUrl = (path: string, fallback: string) => {
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }
  return fallback;
};

export const NOMA_AI_URL = productionUrl("/api/ai", AI_WORKER_URL);
export const NOMA_SUPABASE_URL = productionUrl(
  "/api/supabase",
  import.meta.env.VITE_SUPABASE_URL || SUPABASE_WORKER_URL,
);
