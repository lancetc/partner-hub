"use client";

import { useEffect } from "react";

/*
  One sound at a time in the Magazine (docs/magazine-audio-guide.md): the page's audio introduction, Ava's transmissions
  and the video blocks never play together. When something starts because the learner pressed its Play, everything else
  that's playing pauses. When something starts by itself (Ava's transmission arriving on screen) while something else is
  playing, it waits instead: a start the learner didn't ask for never interrupts one they did. Muted, looping pictures
  (motion photos) are decoration and are left alone. Embedded players in an iframe (YouTube, Vimeo) can't be reached.
*/

const ambient = (el: HTMLMediaElement) => el.loop && el.muted;
const playing = (el: HTMLMediaElement) => !el.paused && !el.ended && !ambient(el);
/** The player a media element belongs to: its controls and its picture sit inside this. */
const rootOf = (el: Element) => el.closest("[data-player], figure") ?? el.parentElement;

/** How long after the learner's click a start still counts as theirs (a recording may load first). */
const CHOSEN_MS = 5000;
let lastClick: { at: number; target: Element } | null = null;
let installs = 0;
let listeners: { click: (e: Event) => void; play: (e: Event) => void } | null = null;

/** Whether this element was started by the learner: a click within its own player, a moment ago. */
export function chosenByLearner(el: HTMLMediaElement, click = lastClick, now = performance.now()) {
  if (!click || now - click.at > CHOSEN_MS) return false;
  if (click.target === el) return true;
  const root = rootOf(el);
  return Boolean(root && root.contains(click.target));
}

/** The other media on the page that are playing now. */
export function othersPlaying(el?: Element | null): HTMLMediaElement[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll<HTMLMediaElement>("audio, video")].filter((m) => m !== el && playing(m));
}

/** What to do when `el` starts: pause the others (the learner chose it), or pause it (it started by itself over something else). */
export function settle(el: HTMLMediaElement, click = lastClick, now = performance.now()) {
  if (ambient(el)) return;
  const others = othersPlaying(el);
  if (!others.length) return;
  if (chosenByLearner(el, click, now)) others.forEach((m) => m.pause());
  else el.pause();
}

/** Starts keeping one sound at a time on this page. Returns the stop; several callers share one listener. */
export function installOnePlayer(): () => void {
  if (typeof document === "undefined") return () => {};
  if (installs++ === 0) {
    listeners = {
      click: (e) => {
        if (e.isTrusted && e.target instanceof Element) lastClick = { at: performance.now(), target: e.target };
      },
      play: (e) => {
        if (e.target instanceof HTMLMediaElement) settle(e.target);
      },
    };
    document.addEventListener("click", listeners.click, true);
    document.addEventListener("play", listeners.play, true);
  }
  return () => {
    if (--installs > 0 || !listeners) return;
    document.removeEventListener("click", listeners.click, true);
    document.removeEventListener("play", listeners.play, true);
    listeners = null;
  };
}

/** Keeps one sound at a time while this component is on the page. */
export function useOnePlayer() {
  useEffect(() => installOnePlayer(), []);
}
