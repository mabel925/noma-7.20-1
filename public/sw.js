const CACHE_NAME = "noma-app-v28";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/icons/noma-app-icon-180.png",
  "/icons/noma-app-icon-192.png",
  "/icons/noma-app-icon-512.png",
  "/startup.jpg",
  "/home-bg.jpg",
  "/home-logo.png",
  "/default-avatar.jpg",
  "/noma-fallback.png",
  "/assets/icon-emoji.png",
  "/font/Alkatra-SemiBold.ttf",
  "/font/Zihun-Biantao.ttf",
  "/pag/noma.pag",
  "/pag/libpag.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
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
    const networkResponse = fetch(request).then((response) => {
      if (!response.ok) return response;
      const responseClone = response.clone();
      return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put("/", responseClone))
        .catch(() => undefined)
        .then(() => response);
    });

    event.respondWith(
      networkResponse.catch(() => caches.match("/").then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return new Response("Noma is offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }))
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
