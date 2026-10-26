"use client";

import { useSyncExternalStore } from "react";

/* Learner preference for starting card audio automatically. Defaults to on; stored per browser. */

const KEY = "tc-audio-autoplay";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoplay(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  listeners.forEach((l) => l());
}

export function useAutoplay() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true,
  );
}

export const autoplayEnabled = read;
