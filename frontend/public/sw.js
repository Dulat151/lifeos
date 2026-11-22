/* LIFE OS service worker.
 * Cache strategy (privacy-aware):
 *  - Static build assets (/_next/static, icons, manifest): cache-first (immutable, contain no user data).
 *  - Navigations: network-first, fallback to /offline.html. HTML pages are NOT cached (they are app shells).
 *  - /api/*: never cached — private user data stays out of Cache Storage.
 *  - Offline writes: unsafe /api requests that fail with a network error are queued in IndexedDB
 *    ("outbox") and replayed in order when connectivity returns (Background Sync, or on next page load).
 *    Conflict handling: the server is the source of truth; a replayed request that returns 409/412/422 is dropped
 *    and the client is notified so the UI can refetch. Queued items older than 7 days are discarded.
 */
const VERSION = "lifeos-v1";
const STATIC = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("lifeos-outbox", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function enqueue(req) {
  const body = await req.clone().text();
  const headers = {};
  req.headers.forEach((v, k) => { if (k === "content-type" || k === "x-csrf-token") headers[k] = v; });
  const d = await db();
  await new Promise((res, rej) => { const tx = d.transaction("outbox", "readwrite"); tx.objectStore("outbox").add({ url: req.url, method: req.method, headers, body, ts: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  if (self.registration.sync) { try { await self.registration.sync.register("lifeos-outbox"); } catch (_) { /* unsupported */ } }
}
async function flush() {
  const d = await db();
  const items = await new Promise((res) => { const r = d.transaction("outbox").objectStore("outbox").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
  for (const it of items) {
    const del = () => new Promise((res) => { const tx = d.transaction("outbox", "readwrite"); tx.objectStore("outbox").delete(it.id); tx.oncomplete = res; });
    if (Date.now() - it.ts > 7 * 86400000) { await del(); continue; }
    let r;
    try { r = await fetch(it.url, { method: it.method, headers: it.headers, body: it.body || undefined, credentials: "same-origin" }); }
    catch (_) { return; } // still offline: keep the rest in order
    await del();
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: "outbox-replayed", url: it.url, status: r.status }));
  }
}

self.addEventListener("sync", (e) => { if (e.tag === "lifeos-outbox") e.waitUntil(flush()); });
self.addEventListener("message", (e) => { if (e.data === "flush-outbox") flush(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !url.pathname.startsWith("/api/v1/auth/") && !url.pathname.startsWith("/api/v1/files")) {
      e.respondWith(fetch(req.clone()).catch(async () => {
        await enqueue(req);
        return new Response(JSON.stringify({ detail: "Нет сети: изменение сохранено и будет отправлено позже", queued: true }), { status: 202, headers: { "Content-Type": "application/json" } });
      }));
    }
    return; // GET /api: network only, never cached
  }
  if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "LIFE OS", body: "", url: "/" };
  try { data = { ...data, ...e.data.json() }; } catch (_) { /* text payload */ }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => { for (const c of cs) { if ("focus" in c) { c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); }));
});
