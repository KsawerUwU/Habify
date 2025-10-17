// Простой оффлайн-кэш для статического хостинга
const CACHE = "habify-v2"; // обновленная версия кэша
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (req.method === "GET" && new URL(req.url).origin === location.origin) {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(req, resClone));
      }
      return res;
    }).catch(()=> caches.match("./index.html")))
  );
});
