import { supabase } from "./supabaseClient";

export type AiAccessErrorCode = "AI_AUTH_REQUIRED" | "AI_QUOTA_EXHAUSTED" | "AI_ACCESS_CHECK_FAILED";

export class AiAccessError extends Error {
  code: AiAccessErrorCode;
  status?: number;
  remaining?: number | null;

  constructor(code: AiAccessErrorCode, message: string, status?: number, remaining?: number | null) {
    super(message);
    this.name = "AiAccessError";
    this.code = code;
    this.status = status;
    this.remaining = remaining;
  }
}

export type AiAccessSnapshot = {
  planCode: string;
  planName: string;
  aiScanLimit: number | null;
  aiScansUsed: number;
  aiScansRemaining: number | null;
  itemLimit: number | null;
  itemCount: number;
  itemsRemaining: number | null;
};

export const createAiScanId = () => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `scan-${randomId}`;
};

export const getAiAuthHeaders = async (scanId?: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new AiAccessError("AI_AUTH_REQUIRED", "Please sign in before using Noma AI", 401);
  }
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    ...(scanId ? { "X-Noma-Scan-Id": scanId } : {}),
  };
};

export const readAiAccess = async (): Promise<AiAccessSnapshot> => {
  const { data, error } = await supabase.rpc("get_my_access");
  if (error) throw error;
  return data as AiAccessSnapshot;
};
