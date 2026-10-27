"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/format";

export type Span = { from: number; to: number };

/*
  Part of a narration script with the word being spoken highlighted: words already said stay as
  they are, the current word is marked (with a slight lift that doesn't move the text around it),
  and words still to come are a little dimmed. Without a current word it's plain text.
  Decorative only: callers announce the plain sentence to screen readers.
*/
export function SpokenText({
  text,
  range,
  word,
  markClassName = "bg-gold/45 text-ink",
  scroll = false,
}: {
  text: string;
  /** Which part of the script to show; the whole script by default. */
  range?: Span | null;
  word: Span | null;
  markClassName?: string;
  /** Keep the current word in view inside a scrolling transcript. */
  scroll?: boolean;
}) {
  const from = range?.from ?? 0;
  const to = range?.to ?? text.length;
  const mark = useRef<HTMLElement>(null);
  const inside = word && word.from >= from && word.to <= to;
  useEffect(() => {
    if (!scroll || !inside) return;
    const el = mark.current;
    const box = el?.closest("[data-follow-scroll]");
    if (!el || !box) return;
    const b = box as HTMLElement;
    const top = el.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop;
    if (top < b.scrollTop || top > b.scrollTop + b.clientHeight - el.offsetHeight)
      b.scrollTo({ top: Math.max(0, top - b.clientHeight / 3), behavior: "smooth" });
  }, [scroll, inside, word?.from]);
  if (!inside) return <>{text.slice(from, to)}</>;
  return (
    <>
      {text.slice(from, word.from)}
      <mark
        ref={mark}
        className={cx(
          // Same width as the plain word (no bold, padding offset by margin), so nothing around it moves.
          "-mx-0.5 inline-block rounded px-0.5 transition-colors duration-150 motion-safe:-translate-y-px motion-safe:scale-105",
          markClassName,
        )}
      >
        {text.slice(word.from, word.to)}
      </mark>
      <span className="opacity-60">{text.slice(word.to, to)}</span>
    </>
  );
}
