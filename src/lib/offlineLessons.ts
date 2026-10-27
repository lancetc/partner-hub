"use client";

import { useSyncExternalStore } from "react";
import { idbAll, idbClear, idbDelete, idbPut } from "./idb";

/*
  "Download for offline": saves everything a lesson needs (its page, the scripts that page uses,
  its pictures, PDFs and narration audio) in the browser's cache, where the service worker
  (public/sw.js) finds it when there's no connection. The list of downloaded lessons lives in
  IndexedDB. Removing a lesson keeps any files another downloaded lesson still uses.
*/

export const OFFLINE_CACHE = "hub-offline-lessons"; // same name as in public/sw.js

export type Download = { slug: string; title: string; version: string; urls: string[]; bytes: number; savedAt: string; userId: string };
type Manifest = { slug: string; title: string; version: string; page: string; media: string[]; narration: string[] };

let downloads: Download[] = [];
let progress: Record<string, number> = {};
const listeners = new Set<() => void>();
let snapshot = { downloads, progress };
const emit = () => {
  snapshot = { downloads, progress };
  listeners.forEach((l) => l());
};

export async function loadDownloads() {
  downloads = await idbAll<Download>("downloads").catch(() => []);
  emit();
}

/** The downloaded lessons, and how far along any download in progress is (0 to 1). */
export function useDownloads() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      if (listeners.size === 1) void loadDownloads();
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

export const supportsOffline = () => typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator && "indexedDB" in window;

/** The page's own scripts and styles, so it can start without a connection. */
function staticAssets(html: string) {
  const found = new Set<string>();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\<>]+/g)) found.add(m[0].replace(/&amp;/g, "&"));
  return [...found];
}

export async function downloadLesson(slug: string, userId: string) {
  if (!supportsOffline()) throw new Error("This browser can’t save lessons for offline use.");
  progress = { ...progress, [slug]: 0 };
  emit();
  try {
    const res = await fetch(`/api/lessons/offline?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn’t get the lesson to download. Check your connection.");
    const m = (await res.json()) as Manifest;
    const cache = await caches.open(OFFLINE_CACHE);
    // The page itself (as this person sees it), the Learning page to start from, and the offline fallback.
    const pages = [m.page, "/learning", "/offline"];
    const html = await fetch(m.page, { credentials: "same-origin", cache: "no-store" });
    if (!html.ok) throw new Error("Couldn’t get the lesson to download.");
    const text = await html.clone().text();
    await cache.put(m.page, html);
    const urls = [...new Set([...pages.slice(1), ...staticAssets(text), ...m.media, ...m.narration, "/api/me"])];
    let bytes = text.length;
    let done = 0;
    for (const url of urls) {
      try {
        const r = await fetch(url, { credentials: "same-origin" });
        if (r.ok) {
          const size = Number(r.headers.get("content-length") ?? 0);
          await cache.put(url, r);
          bytes += size;
        }
      } catch {
        // One missing picture shouldn't stop the rest; the lesson still opens.
      }
      done++;
      progress = { ...progress, [slug]: done / urls.length };
      emit();
    }
    const record: Download = { slug, title: m.title, version: m.version, urls: [m.page, ...urls], bytes, savedAt: new Date().toISOString(), userId };
    await idbPut("downloads", record);
    // Ask the browser not to clear saved lessons when space runs low (Safari especially).
    await navigator.storage?.persist?.().catch(() => false);
    await loadDownloads();
    return record;
  } finally {
    progress = Object.fromEntries(Object.entries(progress).filter(([k]) => k !== slug));
    emit();
  }
}

export async function removeDownload(slug: string) {
  const all = await idbAll<Download>("downloads");
  const target = all.find((d) => d.slug === slug);
  if (!target) return;
  const stillUsed = new Set(all.filter((d) => d.slug !== slug).flatMap((d) => d.urls));
  const cache = await caches.open(OFFLINE_CACHE);
  for (const url of target.urls) if (!stillUsed.has(url)) await cache.delete(url);
  await idbDelete("downloads", slug);
  await loadDownloads();
}

/** Everything saved on this device for offline use: used when someone else signs in on a shared device. */
export async function clearOfflineData() {
  if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("hub-")) await caches.delete(k);
  await idbClear("downloads").catch(() => {});
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-user-data" });
  await loadDownloads();
}

export const formatBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
