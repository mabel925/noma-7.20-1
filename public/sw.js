const BUILD_ID = "__NOMA_BUILD_ID__";
const CACHE_NAME = `noma-app-${BUILD_ID}`;
const LEGACY_REFRESH_MARKER = "noma-migration-recognition-title-v1";
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
      const shouldRefreshLegacyClient =
        keys.includes("noma-app-v28") && !keys.includes(LEGACY_REFRESH_MARKER);
      await Promise.all(
        keys
          .filter((key) => key.startsWith("noma-app-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();

      // Existing v28 clients do not listen for controller changes. Refresh
      // them once so the recognition-title fix can take effect. The marker is
      // kept outside the versioned app caches, so future releases use the
      // normal startup update path below without a forced migration refresh.
      if (shouldRefreshLegacyClient) {
        await caches.open(LEGACY_REFRESH_MARKER);
        const clients = await self.clients.matchAll({type: "window"});
        await Promise.all(clients.map((client) => client.navigate(client.url)));
      }
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
    const cachedShellPromise = caches.match("/");
    const cacheResponse = (response) => {
      if (!response.ok) return response;
      const responseClone = response.clone();
      return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put("/", responseClone))
        .catch(() => undefined)
        .then(() => response);
    };
    const refreshShell = cachedShellPromise.then((cachedResponse) => {
      if (!cachedResponse) return undefined;
      return fetch(request).then(cacheResponse);
    });
    event.waitUntil(refreshShell.catch(() => undefined));

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
