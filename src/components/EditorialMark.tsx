"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { EMPHASIS, sweepStart } from "@/lib/emphasis";

/*
  An author's emphasised phrase (docs/emphasise-text.md). The server draws the final marker, so the words and their
  emphasis are there with no script, before the page wakes up, in print and with reduced motion. Once the page is
  running, a phrase that is still off screen loses its colour (unseen) and sweeps it back once, left to right, when
  about 40% of it comes into view. After that it stays: scrolling back, a drawer or a resize never replays it.

  - Only the colour behind the words moves (globals.css, .tc-emph). The text, its layout and the selection are
    untouched: it is a plain <mark> around ordinary text, so a learner's saved passage reads the same through it.
  - One observer for the whole page, watching only marked phrases, each once.
*/

/** Phrases already seen in this visit, so a section opened again shows its marker without a replay. */
const seen = new Set<string>();
const waiting = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

function watch(el: Element, go: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.intersectionRatio < EMPHASIS.threshold - 0.01) continue;
        waiting.get(e.target)?.();
        waiting.delete(e.target);
        observer?.unobserve(e.target);
      }
    },
    { threshold: EMPHASIS.threshold },
  );
  waiting.set(el, go);
  observer.observe(el);
  return () => {
    waiting.delete(el);
    observer?.unobserve(el);
  };
}

function onScreen(el: Element) {
  const r = el.getBoundingClientRect();
  return (r.width > 0 || r.height > 0) && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

export function EditorialMark({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = `${window.location.pathname}|${el.textContent ?? ""}`;
    const start = sweepStart({
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      canObserve: typeof IntersectionObserver !== "undefined",
      seen: seen.has(key),
      inView: onScreen(el),
    });
    if (start === "static") {
      seen.add(key);
      return;
    }
    // Set on the element itself, not as React state: a re-render never puts the colour back or takes it away.
    el.dataset.sweep = "pending";
    return watch(el, () => {
      seen.add(key);
      el.dataset.sweep = "run";
    });
  }, []);
  return (
    <mark ref={ref} className="tc-emph">
      {children}
    </mark>
  );
}
