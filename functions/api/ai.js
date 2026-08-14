import { proxyRequest } from "../_shared/proxy.js";

export function onRequest({ request }) {
  return proxyRequest(request, "https://noma.38786547.workers.dev/", "/api/ai");
}
