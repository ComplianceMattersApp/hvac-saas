self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  if (event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

// Bump the version to invalidate everything previously cached by this worker.
const STATIC_CACHE = "es-static-v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("es-static-") && key !== STATIC_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});

// Cache-first for immutable build assets only. /_next/static/* URLs are
// content-hashed so they never change in place; the fixed icon files only
// change alongside a STATIC_CACHE version bump. HTML, RSC payloads, and API
// requests are never touched — they must always hit the network.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isImmutableBuildAsset = url.pathname.startsWith("/_next/static/");
  const isStaticIcon = /^\/(icon\.png|icon-192\.png|apple-icon\.png|cm-logo\.png|favicon\.ico)$/.test(
    url.pathname,
  );
  if (!isImmutableBuildAsset && !isStaticIcon) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title ? data.title : "EveryStep FieldWorks";
  const body =
    typeof data.body === "string" && data.body
      ? data.body
      : "Open EveryStep FieldWorks to view details";
  const nestedUrl =
    data.data && typeof data.data.url === "string" && data.data.url.startsWith("/")
      ? data.data.url
      : null;
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : nestedUrl || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data &&
    typeof event.notification.data.url === "string" &&
    event.notification.data.url.startsWith("/")
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const absoluteUrl = new URL(targetUrl, self.location.origin).href;

      for (const client of clientList) {
        if (client.url === absoluteUrl && "focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
