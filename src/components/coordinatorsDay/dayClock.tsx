"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { clockAfterMove, dayTime, type Move } from "@/lib/coordinatorsDay";
import { cx } from "@/lib/format";

/*
  The Coordinator's Day clock. The day runs from 9.00 am on Start to 5.30 pm on Handover. Time only
  ever goes forward: while you're on a square the clock runs on, much faster than a real one, easing
  off before the next square's share of the day; when you move forward it races ahead (a long way up a
  ladder), sharing what's left of the day across the squares still to go. Down a snake it doesn't turn
  back: the clock just keeps running, so the rest of the day has less time in it. One clock, shown in
  several places.
*/

type Mode = "step" | "ahead" | "setback" | null;
let minutes = 9 * 60;
let mode: Mode = null;
let delta = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
// Snapshots in whole game seconds, so readers re-render only when the reading changes.
const seconds = () => Math.floor(minutes * 60);
const useSeconds = () => useSyncExternalStore(subscribe, seconds, seconds);
const useMode = () =>
  useSyncExternalStore(
    subscribe,
    () => mode,
    () => null,
  );
/** The clock now, in minutes (for recording when an answer was given). */
export const clockNow = () => minutes;
/** The clock in steps of ten minutes: for things that follow the time of day without redrawing every second. */
export const useClockTens = () =>
  useSyncExternalStore(
    subscribe,
    () => Math.floor(minutes / 10) * 10,
    () => 9 * 60,
  );

// Where the clock got to, kept on this device so a refresh carries on from the same time.
const SAVED = "tc-coordinators-day:clock";
export function savedClock(runKey: string): number | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED) ?? "null") as { runKey: string; minutes: number } | null;
    return s?.runKey === runKey && Number.isFinite(s.minutes) ? s.minutes : null;
  } catch {
    return null;
  }
}
function saveClock(runKey: string) {
  try {
    localStorage.setItem(SAVED, JSON.stringify({ runKey, minutes }));
  } catch {}
}

/**
  Runs the clock for a run: put one on the page. `runKey` identifies the run; on a new run, or
  resuming one, the clock starts where it was (`start`, if this device hasn't kept a later time).
*/
export function DayClockRunner({ runKey, square, squares, move, start }: { runKey: string; square: number; squares: number; move?: Move; start?: number }) {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fresh = shown.current !== runKey;
    shown.current = runKey;
    // The clock is never earlier than its square's even share of the day: it only gains time from there.
    const from = fresh ? Math.max(savedClock(runKey) ?? 0, start ?? 0, dayTime(square, squares)) : Math.max(minutes, dayTime(move?.from ?? square, squares));
    // Where the clock should be now: on for a move forward, unchanged for a slide or a retry.
    const target = fresh || !move ? from : Math.max(from, clockAfterMove(from, move.from, move.to, squares));
    // While waiting, the clock runs on into this square's share of what's left of the day.
    const last = squares - 1;
    const room = square >= last ? 0 : ((dayTime(last, squares) - target) / (last - square)) * 0.85;
    const ms = fresh || reduce || !move || move.to <= move.from || target - from < 0.5 ? 0 : move.kind === "ladder" ? 4000 : 3600;
    if (!fresh && move?.kind === "slide") {
      mode = "setback";
      delta = 0;
    } else if (ms) {
      mode = move?.kind === "ladder" ? "ahead" : "step";
      delta = Math.round(target - from);
    }
    const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    let raf = 0;
    let saved = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const e = now - t0;
      if (e < ms) minutes = from + (target - from) * inOut(e / ms);
      else {
        if (mode && e > ms + (mode === "setback" ? 4400 : 1400)) mode = null;
        // About half a game minute every real second at first, easing off.
        minutes = target + room * (1 - Math.exp(-(e - ms) / 1000 / 45));
      }
      emit();
      if (now - saved > 2000) {
        saved = now;
        saveClock(runKey);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      saveClock(runKey);
    };
    // The move is read when the square changes; a retry (same square) leaves the clock running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, square, squares]);
  return null;
}

const parts = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor(secs / 60) % 60;
  return { hm: `${((h + 11) % 12) + 1}.${String(m).padStart(2, "0")}`, s: String(secs % 60).padStart(2, "0"), ampm: h < 12 ? "am" : "pm" };
};
const span = (min: number) => {
  const h = Math.floor(min / 60);
  return `+${h ? `${h} hr ` : ""}${min % 60} min`;
};

/** The clock's reading: "9.14 am". `big` adds racing seconds, and a flash when the clock jumps ahead or a setback hits. */
export function DayClock({ big = false, className }: { big?: boolean; className?: string }) {
  const secs = useSeconds();
  const m = useMode();
  const p = parts(secs);
  if (!big)
    return (
      <span className={cx("tabular-nums", className)}>
        {p.hm} {p.ampm}
      </span>
    );
  return (
    <span className={cx("inline-flex items-baseline gap-2", className)}>
      <span
        className={cx(
          "cd-clock rounded-lg px-1.5 tabular-nums transition-colors duration-300",
          m === "setback" && "bg-[#fbe3e1] text-[#a12d31]",
          m === "ahead" && "bg-[#dff3ea] text-[#0f5b5b]",
        )}
        // The reading changes many times a second: screen readers get the time on its own, below.
        aria-hidden
      >
        {p.hm}
        <span className="cd-clock-sec text-[0.7em] text-ink-muted">:{p.s}</span> {p.ampm}
      </span>
      {m === "ahead" && delta > 0 && <span className="animate-card-in rounded-full bg-[#0f7a55] px-2 py-0.5 text-xs font-bold text-white">⏩ {span(delta)}</span>}
      {m === "setback" && <span className="animate-card-in rounded-full bg-[#c7393e] px-2 py-0.5 text-xs font-bold text-white">The clock keeps running</span>}
    </span>
  );
}
