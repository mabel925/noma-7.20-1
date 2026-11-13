const BUILD_ID = "__NOMA_BUILD_ID__";
const CACHE_NAME = `noma-app-${BUILD_ID}`;
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/startup.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Keep the previous release's assets for documents that are still open
      // while the new worker takes control, including offline requests.
      const previousCache = keys.filter((key) => key.startsWith("noma-app-") && key !== CACHE_NAME).at(-1);
      await Promise.all(
        keys
          .filter((key) => key.startsWith("noma-app-") && key !== CACHE_NAME && key !== previousCache)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Authenticated API and private R2 responses must never enter the shared
  // app-shell cache. Their own HTTP cache headers control browser caching.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    // The installed shell belongs to this worker's build. Do not replace it
    // with a later release's HTML before that release's worker is installed.
    const cachedShellPromise = caches.open(CACHE_NAME).then((cache) => cache.match("/"));
    const cacheResponse = (response) => {
      if (!response.ok) return response;
      const responseClone = response.clone();
      return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put("/", responseClone))
        .catch(() => undefined)
        .then(() => response);
    };
    event.respondWith(
      cachedShellPromise.then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request)
          .then(cacheResponse)
          .catch(() => new Response("Noma is offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=UTF-8" },
          }));
      })
    );
    return;
  }

  if (url.pathname === "/startup.jpg") {
    const refresh = fetch(request).then((response) => {
      if (!response.ok) return response;
      const responseClone = response.clone();
      return caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, responseClone))
        .catch(() => undefined)
        .then(() => response);
    });
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
          return cachedResponse;
        }
        return refresh;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      });
    })
  );
});
