const CACHE_NAME = "noma-app-v6";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/startup.jpg",
  "/startup/startup-640x1136.jpg",
  "/startup/startup-750x1334.jpg",
  "/startup/startup-1242x2208.jpg",
  "/startup/startup-1080x2340.jpg",
  "/startup/startup-1125x2436.jpg",
  "/startup/startup-1179x2556.jpg",
  "/startup/startup-1284x2778.jpg",
  "/startup/startup-828x1792.jpg",
  "/startup/startup-1242x2688.jpg",
  "/startup/startup-1290x2796.jpg",
  "/startup/startup-1206x2622.jpg",
  "/startup/startup-1320x2868.jpg",
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
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", responseClone));
          return response;
        })
        .catch(() => caches.match("/"))
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
