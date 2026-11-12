"use client";

import { autoplayEnabled, soundEffectsEnabled } from "./audioPrefs";

/*
  Small sound effects for dragging cards, made in the browser (Web Audio): nothing to download.
  Quiet on purpose. Silent when the learner has turned sound effects off in their settings, or
  muted the player.
*/

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined" || !soundEffectsEnabled() || !autoplayEnabled()) return null;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx ??= new Ctx();
    // Browsers start audio paused until the person has touched the page; a drag counts.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A short pitched blip that slides from one note to another. */
function tone(c: AudioContext, o: { from: number; to: number; dur: number; vol: number; type?: OscillatorType }) {
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t);
  osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(o.vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

/** A soft whoosh: filtered noise whose pitch sweeps from one point to another. */
function whoosh(c: AudioContext, o: { from: number; to: number; dur: number; vol: number }) {
  const t = c.currentTime;
  const length = Math.ceil(c.sampleRate * o.dur);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(o.from, t);
  filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(o.vol, t + o.dur * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  noise.connect(filter).connect(gain).connect(c.destination);
  noise.start(t);
  noise.stop(t + o.dur + 0.02);
}

export const cardSounds = {
  /** A card picked up: a sideways drag has started. */
  pickUp() {
    const c = audio();
    if (c) tone(c, { from: 520, to: 640, dur: 0.06, vol: 0.05 });
  },
  /** Pulled far enough: letting go now turns the card. */
  ready() {
    const c = audio();
    if (c) tone(c, { from: 880, to: 1150, dur: 0.05, vol: 0.06, type: "triangle" });
  },
  /** The card flies away: on to the next sweeps down, back to the last sweeps up. */
  swipe(dir: "next" | "back") {
    const c = audio();
    if (c) whoosh(c, dir === "next" ? { from: 2600, to: 450, dur: 0.28, vol: 0.22 } : { from: 450, to: 2600, dur: 0.28, vol: 0.22 });
  },
  /** Not far enough: the card settles back into place. */
  settle() {
    const c = audio();
    if (c) tone(c, { from: 300, to: 170, dur: 0.12, vol: 0.07 });
  },
};
