"use client";

import { useEffect } from "react";
import { useApi, type Me } from "@/lib/api";
import { getHub, setHub } from "@/lib/store";
import { send, setFlakySimulation, startOutbox } from "@/lib/outbox";
import { mergeProgress, type ServerProgress } from "@/lib/progressSync";

/*
  Keeps this device in step with the server for whoever is signed in: starts the outbox, merges
  lesson progress saved on other devices, sends progress saved before syncing existed, and
  registers the service worker that keeps pages, pictures and audio for offline use.
*/

let registered = false;
function registerServiceWorker() {
  if (registered || !("serviceWorker" in navigator)) return;
  registered = true;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("Offline support isn’t available:", e));
}

const synced = new Set<string>();

async function syncProgress(userId: string) {
  if (synced.has(userId)) return;
  synced.add(userId);
  try {
    const res = await fetch("/api/progress", { cache: "no-store" });
    if (!res.ok) return;
    const { progress } = (await res.json()) as { progress: ServerProgress };
    const { merged, toPush } = mergeProgress(getHub().lessons, progress);
    setHub((s) => ({ ...s, lessons: merged }));
    for (const slug of toPush) {
      const attempt = { ...merged[slug], savedAt: merged[slug].savedAt ?? new Date().toISOString() };
      await send("/api/progress", { slug, attempt, savedAt: attempt.savedAt }, { method: "PUT", label: "Topic progress", coalesce: `progress:${slug}` });
    }
  } catch {
    // Offline: try again next time the app opens.
    synced.delete(userId);
  }
}

export function SyncManager() {
  const me = useApi<Me>("/api/me").data;
  useEffect(() => {
    registerServiceWorker();
    setFlakySimulation(() => getHub().demo.flakyNetwork);
  }, []);
  useEffect(() => {
    if (!me) return;
    startOutbox(me.user.id);
    void syncProgress(me.user.id);
  }, [me]);
  return null;
}
