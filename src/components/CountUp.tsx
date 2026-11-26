"use client";

import { useEffect, useRef, useState } from "react";

/*
  A number that counts up from 0 the first time it's shown, easing out as it arrives. On the homepage's first
  load the cards drop in one after another (html[data-build], globals.css), so the count waits for its card to
  land: pass the card's build step. A later change (an action done) counts from the old number to the new one.
  With reduced motion it simply shows the number.
*/

const DURATION = 1100;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** When a build step's card has landed: its delay (globals.css) plus most of the drop. */
const landsAt = (step: number) => step * 260 + 350 + 800;

export function CountUp({ value, step = 0, format = (n) => String(n) }: { value: number; step?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const mounted = useRef(0);

  useEffect(() => {
    if (!mounted.current) mounted.current = performance.now();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    const building = document.documentElement.hasAttribute("data-build");
    const begin = Math.max(performance.now(), mounted.current + (building && start === 0 ? landsAt(step) : 120));
    let frame = 0;
    const tick = (now: number) => {
      const t = still ? 1 : Math.min(1, Math.max(0, (now - begin) / DURATION));
      const n = Math.round(start + (value - start) * easeOut(t));
      setShown(n);
      from.current = n;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, step]);

  return (
    <>
      {/* The real number for screen readers; the counting digits are for the eye. */}
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden className="tabular-nums">
        {format(shown)}
      </span>
    </>
  );
}
