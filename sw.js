// PWA-кэш, чтобы всё (включая QR-библиотеки) работало оффлайн
const CACHE = "habify-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./qrcode.min.js",
  "./jsqr.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if(req.method==="GET"){
          const clone = res.clone();
          caches.open(CACHE).then(c=>c.put(req,clone));
        }
        return res;
      }).catch(()=>caches.match("./index.html"))
    )
  );
});
