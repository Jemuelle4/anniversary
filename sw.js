/* Plush service worker: app-shell precache, network-first HTML, cache-first assets, web push. */
const SW_VERSION = "plush-v1"; // bump on every deploy (docs/phase-4 §2)
const SHELL = [
  "index.html", "surprise.html", "actions.html", "memories.html",
  "styles.css", "app.js", "config.js", "manifest.webmanifest", "plush.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
  "src/pet.js", "src/memories.js", "src/playground.js",
  "src/game/constants.js", "src/game/rng.js", "src/game/time.js", "src/game/state.js", "src/game/bites.js", "src/game/mood.js", "src/game/progress.js", "src/game/decay.js", "src/game/actions.js", "src/game/copy.js",
  "src/store/store.js", "src/store/localStore.js", "src/store/supabaseStore.js",
  "src/sync/outbox.js", "src/sync/syncer.js", "src/sync/clock.js", "src/sync/client.js",
  "src/ui/stage.js", "src/ui/hud.js", "src/ui/dock.js", "src/ui/toast.js", "src/ui/sheet.js", "src/ui/photo.js", "src/ui/moments.js", "src/ui/feed.js", "src/ui/pairing.js", "src/ui/settings.js", "src/ui/menu.js", "src/ui/push.js",
  "photos/pic1-1200.jpg", "photos/pic2-1200.jpg",
];
const NETWORK_FIRST = /\.(html)$|\/config\.js$|\/sw\.js$|\/$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SW_VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" }))))));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // never intercept Supabase or CDN calls
  if (NETWORK_FIRST.test(url.pathname)) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SW_VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SW_VERSION).then((c) => c.put(e.request, copy)); return r; })));
  }
});
self.addEventListener("push", (e) => {
  let data = { title: "Plush needs you", body: "Come say hi.", url: "/surprise.html" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: data.url }, tag: "plush-nudge" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url ?? "/surprise.html", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const existing = list.find((c) => c.url.startsWith(location.origin));
    return existing ? existing.focus().then((c) => c.navigate?.(url) ?? c) : self.clients.openWindow(url);
  }));
});
