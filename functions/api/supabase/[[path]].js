import { proxyRequest } from "../../_shared/proxy.js";

export function onRequest({ request }) {
  return proxyRequest(request, "https://noma-users.38786547.workers.dev/", "/api/supabase");
}
