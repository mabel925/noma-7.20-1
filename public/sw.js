const CACHE_NAME = "noma-app-v9";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icons/apple-touch-icon.png?v=3",
  "/icons/icon-192.png?v=3",
  "/icons/icon-512.png?v=3",
  "/startup.jpg",
  "/startup/startup-1170x2532.png",
  "/startup/startup-640x1136.png",
  "/startup/startup-750x1334.png",
  "/startup/startup-1242x2208.png",
  "/startup/startup-1080x2340.png",
  "/startup/startup-1125x2436.png",
  "/startup/startup-1179x2556.png",
  "/startup/startup-1284x2778.png",
  "/startup/startup-828x1792.png",
  "/startup/startup-1242x2688.png",
  "/startup/startup-1290x2796.png",
  "/startup/startup-1206x2622.png",
  "/startup/startup-1320x2868.png",
  "/font/Alkatra-SemiBold.ttf",
  "/pag/noma.pag",
  "/pag/libpag.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    const refresh = fetch(request).then((response) => {
      if (!response.ok) return response;
      const responseClone = response.clone();
      return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put("/", responseClone))
        .catch(() => undefined)
        .then(() => response);
    });

    event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
    event.respondWith(
      caches.match("/").then((cachedResponse) => cachedResponse || refresh)
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
