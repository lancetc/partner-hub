"use client";

import { useSyncExternalStore } from "react";

/*
  Prototype persistence. Everything lives in this browser's localStorage and a simulated
  "server" write. A production build replaces `remoteWrite` with real API calls; the
  learning and onboarding rules must then be enforced on the server (PRD section 14).
*/

export type DocStatus = "not_started" | "draft" | "received" | "in_review" | "action_required" | "verified" | "expired" | "not_required";

export type TaskEvent = { at: string; status: DocStatus; note?: string; actor: string };

export type TaskState = {
  status: DocStatus;
  fileName?: string;
  fileSize?: number;
  fields?: Record<string, string>;
  reason?: string;
  expiry?: string;
  history: TaskEvent[];
};

export type LessonAttempt = {
  version: string;
  nodeId: string;
  /** Nodes visited on the current route, in order. */
  route: string[];
  answers: Record<string, string | number | string[]>;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt?: string;
  /** Earlier routes kept for audit when a learner returns to an earlier choice. */
  previousRoutes: string[][];
  /** When this copy was saved, so the newest copy wins between devices. */
  savedAt?: string;
};

export type OnboardingState = {
  welcomed: boolean;
  role?: string;
  services: string[];
  organisation?: string;
  tasks: Record<string, TaskState>;
};

export type HubState = {
  saved: string[];
  lessons: Record<string, LessonAttempt>;
  onboarding: OnboardingState;
  demo: { flakyNetwork: boolean };
};

// Browser progress is kept per demo account so switching accounts doesn't mix records.
const key = () => {
  const user = typeof document === "undefined" ? "sam" : (document.cookie.match(/(?:^|; )tc-demo-user=([^;]+)/)?.[1] ?? "sam");
  return `tc-partner-hub:v1:${user}`;
};

export const initialState: HubState = {
  saved: [],
  lessons: {},
  onboarding: { welcomed: false, services: [], tasks: {} },
  demo: { flakyNetwork: false },
};

let state: HubState = initialState;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(key());
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch {
    // Storage can be unavailable (private mode); fall back to in-memory state.
  }
}

function persist() {
  try {
    window.localStorage.setItem(key(), JSON.stringify(state));
  } catch {
    // Ignore; state stays in memory for this visit.
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key()) return;
    loaded = false;
    load();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return state;
}

function getServerSnapshot() {
  return initialState;
}

export function useHub<T>(select: (s: HubState) => T): T {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return select(s);
}

/** True once the client store has hydrated, so UI can avoid flashing server defaults. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function getHub() {
  load();
  return state;
}

/** Local-only update (preferences such as saved items). */
export function setHub(update: (s: HubState) => HubState) {
  load();
  state = update(state);
  persist();
  emit();
}

/**
  Simulated server write. Resolves only when the "server" confirms, so callers can
  show a receipt or completion message honestly. With the demo weak-connection switch
  on, roughly half of writes fail so the retry states can be exercised.
*/
function remoteWrite(): Promise<void> {
  const flaky = state.demo.flakyNetwork;
  return new Promise((resolve, reject) => {
    window.setTimeout(
      () => {
        if (flaky && Math.random() < 0.5) reject(new Error("Network request failed"));
        else resolve();
      },
      flaky ? 900 : 350,
    );
  });
}

/** Write that must be confirmed before the UI claims success. State changes only on success. */
export async function commitHub(update: (s: HubState) => HubState) {
  load();
  await remoteWrite();
  state = update(state);
  persist();
  emit();
}

export function toggleSaved(id: string) {
  setHub((s) => ({
    ...s,
    saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [id, ...s.saved],
  }));
}

export function resetHub() {
  state = initialState;
  persist();
  emit();
}

export const nowIso = () => new Date().toISOString();
