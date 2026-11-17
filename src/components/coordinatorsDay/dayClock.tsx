"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { dayTime, type Move } from "@/lib/coordinatorsDay";
import { cx } from "@/lib/format";

/*
  The Coordinator's Day clock. The day runs from 9.00 am on Start to 5.30 pm on Handover, each square a
  slice of it. While you're on a square the clock runs on, much faster than a real one, easing off before
  the next square's time; when you move it races to where you've landed: forward a little for a step,
  forward a lot up a ladder, and back down a snake. One clock, shown in several places.
*/

type Mode = "step" | "ahead" | "back" | null;
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

/**
  Runs the clock for a run: put one on the page. `runKey` identifies the run, so a new run (or
  resuming one) sets the clock straight to its square rather than racing there.
*/
export function DayClockRunner({ runKey, square, squares, move }: { runKey: string; square: number; squares: number; move?: Move }) {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const base = dayTime(square, squares);
    // While waiting on a square the clock runs on, slowing as it nears the next square's time.
    const room = (dayTime(1, squares) - dayTime(0, squares)) * 0.85;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fresh = shown.current !== runKey;
    shown.current = runKey;
    const from = fresh ? base : minutes;
    const ms = fresh || reduce || Math.abs(from - base) < 0.5 ? 0 : move?.kind === "slide" ? 4400 : move?.kind === "ladder" ? 4000 : 3600;
    if (ms) {
      mode = base < from ? "back" : move?.kind === "ladder" ? "ahead" : "step";
      delta = Math.round(base - from);
    }
    const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const e = now - t0;
      if (e < ms) minutes = from + (base - from) * inOut(e / ms);
      else {
        if (mode && e > ms + 1400) mode = null;
        // About half a game minute every real second at first, easing off.
        minutes = base + room * (1 - Math.exp(-(e - ms) / 1000 / 45));
      }
      emit();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  return `${min < 0 ? "−" : "+"}${h ? `${h} hr ` : ""}${a % 60} min`;
};

/** The clock's reading: "9.14 am". `big` adds racing seconds, and a flash when the clock jumps. */
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
          m === "back" && "bg-[#fbe3e1] text-[#a12d31]",
          m === "ahead" && "bg-[#dff3ea] text-[#0f5b5b]",
        )}
        // The reading changes many times a second: screen readers get the time on its own, below.
        aria-hidden
      >
        {p.hm}
        <span className="cd-clock-sec text-[0.7em] text-ink-muted">:{p.s}</span> {p.ampm}
      </span>
      {(m === "back" || m === "ahead") && delta !== 0 && (
        <span className={cx("animate-card-in rounded-full px-2 py-0.5 text-xs font-bold", m === "back" ? "bg-[#c7393e] text-white" : "bg-[#0f7a55] text-white")}>
          {m === "back" ? "⏪" : "⏩"} {span(delta)}
        </span>
      )}
    </span>
  );
}
