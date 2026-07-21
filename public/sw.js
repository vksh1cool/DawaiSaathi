/* DawaiSaathi offline safety net. Never cache user data or API responses. */
const CACHE_NAME = "dawaisaathi-offline-v2";
const OFFLINE_URL = "/offline.html";

// Cloudflare Workers Assets strips the ".html" extension and 307-redirects
// /offline.html -> /offline. The Cache API refuses redirected responses, so a
// plain cache.add(OFFLINE_URL) fails and the fallback never installs. Instead
// we fetch the page ourselves (following the redirect), then store a fresh,
// non-redirected 200 under a stable key the fetch handler can always match.
async function precacheOfflinePage() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(OFFLINE_URL, { redirect: "follow", cache: "reload" });
    if (!res.ok) return;
    const body = await res.blob();
    await cache.put(
      OFFLINE_URL,
      new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    );
  } catch {
    // Best-effort: if the offline page can't be fetched at install time the SW
    // still installs; it simply has no fallback until the next update.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOfflinePage());
  // Take over as soon as the fixed worker is ready so the fallback works now.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("dawaisaathi-offline-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  // Health pages are always fetched live (never cached); only when the network
  // is unreachable do we serve the self-contained offline page.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
