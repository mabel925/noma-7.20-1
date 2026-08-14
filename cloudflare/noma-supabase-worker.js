const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Authorization",
    "Content-Type",
    "apikey",
    "X-Client-Info",
    "X-Supabase-Api-Version",
    "Prefer",
    "Range",
  ].join(", "),
  "Access-Control-Expose-Headers": "Content-Range, X-Request-Id, X-Total-Count",
  "Access-Control-Max-Age": "86400",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=UTF-8" },
  });

function getSupabaseUrl(env) {
  const value = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)) {
    throw new Error("SUPABASE_URL must be the Project URL from Supabase, for example https://project-ref.supabase.co");
  }
  return value;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    let supabaseUrl;
    try {
      supabaseUrl = getSupabaseUrl(env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }

    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${supabaseUrl}/`);
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.delete("host");

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
      const responseHeaders = new Headers(upstreamResponse.headers);
      Object.entries(corsHeaders).forEach(([name, value]) => responseHeaders.set(name, value));

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return json({ error: `Supabase upstream request failed: ${error instanceof Error ? error.message : String(error)}` }, 502);
    }
  },
};
