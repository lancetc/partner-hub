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

/** Stops any card audio playing now, recorded or spoken by the browser (the player's mute button). */
export const STOP_AUDIO = "tc-stop-audio";
export function stopAudio() {
  window.dispatchEvent(new Event(STOP_AUDIO));
  window.speechSynthesis?.cancel();
}

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

/*
  Learner preference for the small sound effects when dragging cards (pick up, ready, whoosh).
  Defaults to on; stored per browser. The player's mute button silences them too.
*/
const SFX_KEY = "tc-sound-effects";
const sfxListeners = new Set<() => void>();

function readSfx() {
  try {
    return localStorage.getItem(SFX_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEffects(on: boolean) {
  try {
    localStorage.setItem(SFX_KEY, on ? "on" : "off");
  } catch {}
  sfxListeners.forEach((l) => l());
}

export function useSoundEffects() {
  return useSyncExternalStore(
    (cb) => {
      sfxListeners.add(cb);
      return () => sfxListeners.delete(cb);
    },
    readSfx,
    () => true,
  );
}

export const soundEffectsEnabled = readSfx;
