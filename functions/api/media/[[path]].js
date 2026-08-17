const AUTH_PROXY_URL = "https://noma-users.38786547.workers.dev";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_QBCoMyZvh6Px_3AFff_yTg_5BOpG8FY";
const MEDIA_COOKIE = "noma_media_session";
const MAX_UPLOAD_BYTES = 512 * 1024;
const MAX_STICKER_BYTES = 100 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

const readCookie = (request, name) => {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return "";
};

const readBearer = (request) => {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
};

const getToken = (request, allowCookie) => readBearer(request) || (allowCookie ? readCookie(request, MEDIA_COOKIE) : "");

const authenticate = async (request, env, allowCookie = false) => {
  const token = getToken(request, allowCookie);
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const authBase = String(env.SUPABASE_AUTH_PROXY_URL || AUTH_PROXY_URL).replace(/\/+$/, "");
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY);
  const response = await fetch(`${authBase}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
    },
  });
  if (!response.ok) throw new Response("Unauthorized", { status: 401 });

  const user = await response.json();
  if (!user?.id) throw new Response("Unauthorized", { status: 401 });
  return { user, token };
};

const normalizeKey = (value) => {
  const key = String(value || "").replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\") || key.length > 700) {
    throw new Response("Invalid media key", { status: 400 });
  }
  return key;
};

const assertOwnedKey = (key, userId) => {
  if (!key.startsWith(`users/${userId}/`)) {
    throw new Response("Forbidden", { status: 403 });
  }
};

const objectKeyFromPath = (pathname) => {
  const prefix = "/api/media/object/";
  if (!pathname.startsWith(prefix)) return "";
  return normalizeKey(pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/"));
};

const sessionCookie = (token, maxAge) =>
  `${MEDIA_COOKIE}=${encodeURIComponent(token)}; Path=/api/media; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

const handleSession = async (request, env) => {
  if (request.method === "DELETE") {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { token } = await authenticate(request, env, false);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, 3600) });
};

const handleObject = async (request, env, key) => {
  const isRead = request.method === "GET" || request.method === "HEAD";
  const { user } = await authenticate(request, env, isRead);
  assertOwnedKey(key, user.id);

  if (isRead) {
    const object = await env.NOMA_MEMORY_IMAGES.get(key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=86400");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  }

  if (request.method === "PUT") {
    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return json({ error: "Unsupported image type" }, 415);

    const bytes = await request.arrayBuffer();
    const maxBytes = key.includes("/items/") && key.endsWith("/sticker.webp")
      ? MAX_STICKER_BYTES
      : MAX_UPLOAD_BYTES;
    if (!bytes.byteLength || bytes.byteLength > maxBytes) {
      return json({ error: `Image must be between 1 byte and ${maxBytes} bytes` }, 413);
    }

    await env.NOMA_MEMORY_IMAGES.put(key, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: "private, max-age=3600, stale-while-revalidate=86400",
      },
      customMetadata: { ownerId: user.id },
    });
    return json({ key, size: bytes.byteLength });
  }

  if (request.method === "DELETE") {
    await env.NOMA_MEMORY_IMAGES.delete(key);
    return json({ ok: true });
  }

  return new Response("Method Not Allowed", { status: 405 });
};

const handleDeleteMany = async (request, env) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const { user } = await authenticate(request, env, false);
  const body = await request.json().catch(() => ({}));
  const keys = Array.isArray(body.keys) ? [...new Set(body.keys.map(normalizeKey))].slice(0, 200) : [];
  keys.forEach((key) => assertOwnedKey(key, user.id));
  if (keys.length) await env.NOMA_MEMORY_IMAGES.delete(keys);
  return json({ deleted: keys.length });
};

export async function onRequest({ request, env }) {
  if (!env.NOMA_MEMORY_IMAGES) return json({ error: "NOMA_MEMORY_IMAGES R2 binding is missing" }, 500);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/media/session") return await handleSession(request, env);
    if (pathname === "/api/media/delete") return await handleDeleteMany(request, env);

    const key = objectKeyFromPath(pathname);
    if (key) return await handleObject(request, env, key);
    return new Response("Not Found", { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
