// Discover Nashik Service Worker (PWA Offline Support)
const CACHE_NAME = "discover-nashik-v4";
const PHOTO_CACHE = "discover-nashik-photos-v1";
const PRECACHE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/data/places.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Precaching app shell and data/places.json");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Precaching warning:", err);
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== PHOTO_CACHE).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Never cache on localhost: dev chunks keep the same URL between edits, so
  // cache-first would serve stale JavaScript against fresh HTML.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  // Don't intercept API calls or Google Maps tiles/SDK requests
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("google.com") ||
    // Google Places photos: terms forbid storing them, so never cache.
    url.hostname.includes("googleusercontent.com")
  ) {
    return;
  }

  // Place photos (Wikimedia, downloaded at build time): cache-first in their
  // own cache so a pilgrim who has seen a photo still sees it offline, and a
  // new app version (CACHE_NAME bump) does not throw them away.
  if (url.origin === self.location.origin && url.pathname.startsWith("/photos/")) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response && response.status === 200) cache.put(event.request, response.clone());
            return response;
          });
        }),
      ),
    );
    return;
  }

  // Cache-first for static assets, data files, images, icons, and bundles
  if (
    url.pathname.startsWith("/data/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Network-first for HTML pages with offline fallback to cached app shell '/'
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/");
        });
      }),
  );
});
