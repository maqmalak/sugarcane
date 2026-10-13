/* MicroMax POS offline worker — controls /pos/ pages only.
 * Navigations: network first, cached shell when offline. Static files (js / css / fonts / images): stale-while-revalidate.
 * Never caches API, desk, print or socket traffic — sales made offline live in IndexedDB and sync through the API. */
const CACHE = "mm-pos-v1";
const SKIP = /^\/(api|app|desk|printview|socket\.io|files|private|method)\b/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("mm-pos-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put("/pos/__shell", copy));
      return res;
    }).catch(() => caches.open(CACHE).then((c) => c.match("/pos/__shell")).then((r) => r || Response.error())));
    return;
  }
  if (/\.(js|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
