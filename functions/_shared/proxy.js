export async function proxyRequest(request, upstreamBase, stripPrefix) {
  const incomingUrl = new URL(request.url);
  const upstreamPath = incomingUrl.pathname.startsWith(stripPrefix)
    ? incomingUrl.pathname.slice(stripPrefix.length)
    : incomingUrl.pathname;
  const upstreamUrl = new URL(`${upstreamPath || "/"}${incomingUrl.search}`, upstreamBase);
  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    return await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  } catch (error) {
    return Response.json(
      { error: `Pages proxy failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
