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

/*
  Learner preference for following the narration word by word (the word being spoken is
  highlighted in captions and transcripts). Defaults to on; stored per browser.
*/
const FOLLOW_KEY = "tc-follow-words";
const followListeners = new Set<() => void>();

function readFollow() {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFollowWords(on: boolean) {
  try {
    localStorage.setItem(FOLLOW_KEY, on ? "on" : "off");
  } catch {}
  followListeners.forEach((l) => l());
}

export function useFollowWords() {
  return useSyncExternalStore(
    (cb) => {
      followListeners.add(cb);
      return () => followListeners.delete(cb);
    },
    readFollow,
    () => true,
  );
}
