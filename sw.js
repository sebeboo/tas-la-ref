/* Service worker : réseau d'abord (les mises à jour arrivent tout de suite), cache en secours hors-ligne */
const CACHE = "talr-v5";
const FILES = [
  "./", "./index.html", "./css/styles.css", "./js/app.js", "./manifest.webmanifest", "./icons/icon.svg",
  "./img/splash.jpg", "./img/camo.svg", "./img/leopard.svg",
  "./data/cinema.js", "./data/series-humour.js", "./data/chansons.js", "./data/tele.js",
  "./data/internet.js", "./data/pubs.js", "./data/dessins-animes.js", "./data/gifs.js"
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== location.origin) return; // API Giphy, polices… : réseau direct
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
