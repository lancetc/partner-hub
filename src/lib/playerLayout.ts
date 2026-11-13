"use client";

import { useSyncExternalStore } from "react";

/*
  The lesson player's layout on a computer screen (demo phase: switchable from the card header).
  "card": the phone-style card on its own. "desktop": the same card in the middle, the topic's outline
  on the left, and progress, notes and peers on the right. Remembered on this device. Phones and
  tablets always get the card.
*/

export type PlayerLayout = "card" | "desktop";

const KEY = "tc-player-layout";
const listeners = new Set<() => void>();

function read(): PlayerLayout {
  try {
    return localStorage.getItem(KEY) === "desktop" ? "desktop" : "card";
  } catch {
    return "card";
  }
}

export function setPlayerLayout(layout: PlayerLayout) {
  try {
    localStorage.setItem(KEY, layout);
  } catch {}
  listeners.forEach((l) => l());
}

export function usePlayerLayout(): PlayerLayout {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    read,
    () => "card",
  );
}
