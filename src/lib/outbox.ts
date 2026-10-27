"use client";

import { useSyncExternalStore } from "react";
import { idbAll, idbDelete, idbPut } from "./idb";

/*
  Offline-safe saving. A save is sent straight away; if the network is down (or the server has a
  fault) it's kept in this device's outbox and sent later: when the connection returns, when the
  app is opened again, every 20 seconds while anything is waiting, and (on Chrome and Android) by
  the service worker in the background. Each save carries a unique Idempotency-Key, so a resend
  can never be recorded twice. Saves belong to the person who made them and are only sent while
  that person is signed in.
*/

export type OutboxItem = {
  id: string;
  userId: string;
  url: string;
  method: "POST" | "PUT";
  body: unknown;
  /** Shown in the sync list, e.g. "Lesson completed: A little extra time". */
  label: string;
  /** Saves with the same key replace each other (only the latest progress matters). */
  coalesce?: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export type SendResult<T> = { queued: false; data: T } | { queued: true };

type State = { userId: string | null; pending: OutboxItem[]; offline: boolean; syncing: boolean; rejected: { label: string; error: string }[] };
let state: State = { userId: null, pending: [], offline: false, syncing: false, rejected: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

/** The demo "Simulate weak connection" switch makes about half of sends fail, as if offline. */
let simulateFlaky = () => false;
export function setFlakySimulation(fn: () => boolean) {
  simulateFlaky = fn;
}

class NetworkError extends Error {}

async function attempt(item: Pick<OutboxItem, "id" | "url" | "method" | "body">) {
  if (simulateFlaky() && Math.random() < 0.5) throw new NetworkError("Simulated weak connection");
  let res: Response;
  try {
    res = await fetch(item.url, {
      method: item.method,
      headers: { "content-type": "application/json", "idempotency-key": item.id },
      body: JSON.stringify(item.body),
      cache: "no-store",
    });
  } catch {
    throw new NetworkError("No connection");
  }
  // Server faults are worth retrying; refusals (4xx) aren't.
  if (res.status >= 500) throw new NetworkError(`Server error ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, error: (data as { error?: string }).error ?? `Request failed (${res.status})` };
}

async function refresh() {
  const all = await idbAll<OutboxItem>("outbox").catch(() => []);
  set({ pending: all.filter((i) => i.userId === state.userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
}

async function enqueue(item: OutboxItem) {
  if (item.coalesce) {
    const all = await idbAll<OutboxItem>("outbox").catch(() => []);
    for (const old of all) if (old.coalesce === item.coalesce && old.userId === item.userId) await idbDelete("outbox", old.id);
  }
  await idbPut("outbox", item);
  await refresh();
  // Ask the service worker to send it in the background when the connection returns (Chrome, Android).
  navigator.serviceWorker?.ready
    .then((r) => (r as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("outbox"))
    .catch(() => {});
}

/**
  Sends a save now, or keeps it to send later if there's no connection. Refusals from the server
  (a 4xx, e.g. "Write a few words first") still throw, so forms can show them.
*/
export async function send<T>(url: string, body: unknown, opts: { label: string; method?: "POST" | "PUT"; coalesce?: string }): Promise<SendResult<T>> {
  // Saves are filed under the signed-in person; wait briefly for the app to find out who that is.
  if (!state.userId) await Promise.race([userKnown, new Promise((r) => setTimeout(r, 3000))]);
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    userId: state.userId ?? "unknown",
    url,
    method: opts.method ?? "POST",
    body,
    label: opts.label,
    coalesce: opts.coalesce,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  // Don't jump the queue: if older saves are waiting, this one waits behind them.
  if (!state.pending.length) {
    try {
      const r = await attempt(item);
      set({ offline: false });
      if (!r.ok) throw new Error(r.error);
      return { queued: false, data: r.data as T };
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e;
      set({ offline: true });
    }
  }
  await enqueue(item);
  if (!state.offline) void flush();
  return { queued: true };
}

/** Sends everything waiting for the signed-in person, oldest first. Stops at the first network failure. */
export async function flush() {
  if (state.syncing || !state.userId) return;
  set({ syncing: true });
  try {
    await refresh();
    for (const item of state.pending) {
      try {
        const r = await attempt(item);
        set({ offline: false });
        if (!r.ok) set({ rejected: [...state.rejected, { label: item.label, error: r.error }].slice(-5) });
        await idbDelete("outbox", item.id);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        await idbPut("outbox", { ...item, attempts: item.attempts + 1, lastError: e.message });
        set({ offline: true });
        break;
      }
    }
  } finally {
    await refresh();
    set({ syncing: false });
  }
}

let started = false;
let knowUser: () => void = () => {};
const userKnown = new Promise<void>((r) => (knowUser = r));
/** Starts syncing for this person: now, when the connection returns, when the app comes back into view, and every 20s while anything waits. */
export function startOutbox(userId: string) {
  const changed = state.userId !== userId;
  state = { ...state, userId };
  knowUser();
  if (changed) void refresh().then(flush);
  if (started) return;
  started = true;
  set({ offline: !navigator.onLine });
  window.addEventListener("online", () => {
    set({ offline: false });
    void flush();
  });
  window.addEventListener("offline", () => set({ offline: true }));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void flush());
  window.setInterval(() => state.pending.length && void flush(), 20_000);
  // The service worker tells open pages when it has sent things in the background.
  navigator.serviceWorker?.addEventListener("message", (e) => e.data?.type === "outbox-synced" && void refresh());
}

export const markOffline = (offline: boolean) => set({ offline });
export const dismissRejected = () => set({ rejected: [] });

/** How many saves are waiting, whether the device seems offline, and any saves the server turned down. */
export function useOutbox() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Saves waiting to sync for one person on this device. */
export async function pendingFor(userId: string) {
  return (await idbAll<OutboxItem>("outbox").catch(() => [])).filter((i) => i.userId === userId);
}
