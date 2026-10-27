/*
  Partner Hub service worker: keeps the hub usable without a connection.

  - Pages, app data and scripts: fetched fresh when online (so nothing goes stale) and kept; the
    kept copy is used when offline.
  - Pictures, uploads and narration audio: kept the first time they load (their addresses never
    change), then served from the device.
  - Lessons downloaded with "Download for offline" live in their own cache, kept until removed.
  - Saves waiting in the outbox (IndexedDB "partner-hub" / "outbox", see src/lib/outbox.ts) are
    sent in the background when the connection returns, on browsers with Background Sync.
  Admin pages, the API's writes, and video streams are never cached.
*/

const VERSION = "v1";
const PAGES = `hub-pages-${VERSION}`;
const ASSETS = `hub-assets-${VERSION}`;
const MEDIA = `hub-media-${VERSION}`;
const OFFLINE = "hub-offline-lessons"; // downloads; shared name with src/lib/offlineLessons.ts
const KEEP = [PAGES, ASSETS, MEDIA, OFFLINE];
const MAX_PAGES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(new Request("/offline", { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hub-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isMedia = (url) =>
  url.pathname.startsWith("/api/uploads/") ||
  url.pathname.startsWith("/images/") ||
  url.pathname.startsWith("/brand/") ||
  url.pathname.startsWith("/api/tts") ||
  /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/.test(url.pathname);
const isVideo = (url) => /\.(webm|mp4|mov)$/.test(url.pathname);

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

/** Fresh from the network when possible (and kept); otherwise whatever this device has. */
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic" && !res.redirected) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(request, copy).then(() => cacheName === PAGES && trim(PAGES, MAX_PAGES)));
    }
    return res;
  } catch (e) {
    const kept = await caches.match(request, { ignoreVary: true });
    if (kept) return kept;
    throw e;
  }
}

/** From this device if it's been seen before; otherwise fetched and kept. */
async function cacheFirst(request) {
  const kept = await caches.match(request, { ignoreVary: true });
  if (kept) return kept;
  const res = await fetch(request);
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    caches.open(MEDIA).then((c) => c.put(request, copy));
  }
  return res;
}

/** Optimised images (/_next/image?url=…): offline, fall back to the original picture if it was kept. */
async function optimisedImage(request, url) {
  try {
    return await cacheFirst(request);
  } catch (e) {
    const original = url.searchParams.get("url");
    const kept = original && (await caches.match(new URL(original, self.location.origin).href));
    if (kept) return kept;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never: admin, dev-server internals, sign-in switching, video streams (range requests).
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.includes("__nextjs") || url.pathname.startsWith("/api/demo")) return;
  if (request.headers.has("range") || isVideo(url)) return;

  if (url.pathname === "/_next/image") return event.respondWith(optimisedImage(request, url));
  if (isMedia(url) && !url.searchParams.has("status")) return event.respondWith(cacheFirst(request));
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(networkFirst(request, ASSETS));
  if (url.pathname.startsWith("/api/")) return event.respondWith(networkFirst(request, PAGES));

  // Pages and the data Next.js fetches when moving between pages.
  if (request.mode === "navigate") {
    return event.respondWith(
      networkFirst(request, PAGES).catch(async () => (await caches.match(url.pathname, { ignoreSearch: true })) || caches.match("/offline")),
    );
  }
  event.respondWith(networkFirst(request, PAGES));
});

// ---- Outbox: send saves in the background (Chrome, Edge, Android) ----

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("partner-hub", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("downloads")) db.createObjectStore("downloads", { keyPath: "slug" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(db, mode) {
  return db.transaction("outbox", mode).objectStore("outbox");
}

function all(db) {
  return new Promise((resolve, reject) => {
    const req = store(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function remove(db, id) {
  return new Promise((resolve) => {
    const req = store(db, "readwrite").delete(id);
    req.onsuccess = req.onerror = () => resolve();
  });
}

/** Sends waiting saves for the person signed in on this browser (the session cookie decides who). */
async function sendOutbox() {
  const db = await openDb();
  // Only the signed-in person's saves; others wait until they sign in again.
  const me = await fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
  if (!me) throw new Error("Not reachable yet");
  const items = (await all(db)).filter((i) => i.userId === me.user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of items) {
    const res = await fetch(item.url, {
      method: item.method,
      headers: { "content-type": "application/json", "idempotency-key": item.id },
      body: JSON.stringify(item.body),
    });
    if (res.status >= 500) throw new Error("Server error; try later");
    await remove(db, item.id);
  }
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: "outbox-synced" }));
}

self.addEventListener("sync", (event) => {
  if (event.tag === "outbox") event.waitUntil(sendOutbox());
});

// ---- Messages from the app ----
self.addEventListener("message", (event) => {
  // Switching account: nothing kept for one person should be shown to another.
  if (event.data?.type === "clear-user-data") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("hub-")).map((k) => caches.delete(k)))));
  }
});
