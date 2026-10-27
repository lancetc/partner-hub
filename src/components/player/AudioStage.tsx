"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { useNarration } from "./Narration";
import { SpokenText } from "./SpokenText";

/*
  The dedicated audio card. The whole card is about listening: a soft background, the title and
  text centred, an audio symbol that pulses while the voice reads, the words being spoken, and one
  big play button. It drives the card's narration engine, so there's only ever one voice.
*/
export function ListenCard({
  ttsKey,
  label,
  heading,
  body,
  script,
  headingRef,
}: {
  ttsKey: string;
  label: string;
  heading: string;
  body: string;
  script: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const n = useNarration(ttsKey);
  const [transcript, setTranscript] = useState(false);
  const state = n?.state ?? "idle";
  const playing = state === "playing";
  const label2 =
    state === "playing" ? "Pause" : state === "paused" ? "Resume" : state === "ended" ? "Play again" : state === "loading" ? "Loading…" : "Play audio";

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-6 pb-6 pt-8 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Soft shapes, like a listening space. */}
      <span aria-hidden className="pointer-events-none absolute -left-16 top-24 size-56 rounded-full bg-white/40" />
      <span aria-hidden className="pointer-events-none absolute -right-20 bottom-28 size-64 rounded-full bg-white/30" />

      <div className="relative grid size-28 shrink-0 place-items-center">
        {playing &&
          [0, 0.8, 1.6].map((d) => (
            <span
              key={d}
              aria-hidden
              className="absolute inset-4 rounded-full bg-[#0e7c7b]/25 animate-[orb-pulse_2.4s_ease-out_infinite]"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        <span
          aria-hidden
          className={cx("relative grid size-20 place-items-center rounded-full bg-[#102a43] text-white shadow-lg transition-transform", playing && "scale-105")}
        >
          {state === "loading" ? (
            <span className="size-7 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
          ) : playing ? (
            <span className="flex h-8 items-center gap-1">
              {[0, 1, 2, 3, 4].map((b) => (
                <span key={b} className="audio-bar w-1 rounded-full bg-current" style={{ animationDelay: `${(b % 3) * 0.14}s` }} />
              ))}
            </span>
          ) : (
            <Icon name="volume" className="size-9" />
          )}
        </span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-3 py-6">
        {label && <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] opacity-70">{label}</p>}
        <h2 ref={headingRef} tabIndex={-1} className="font-serif text-[1.85rem] font-semibold leading-tight outline-none focus-visible:outline-none">
          {heading}
        </h2>
        {body && <p className="text-lg leading-relaxed">{body}</p>}
      </div>

      <div className="relative flex w-full max-w-xs flex-col items-center gap-3">
        <p aria-live="polite" className={cx("min-h-[2.25rem] text-center transition-opacity", n?.caption && playing ? "opacity-100" : "opacity-0")}>
          {n?.caption && (
            <>
              <span className="sr-only">{n.caption}</span>
              <span aria-hidden className="rounded-lg bg-[#2a2a2e] box-decoration-clone px-2 py-1 text-lg font-bold leading-[1.75] text-[#ffc72c]">
                <SpokenText text={n.text} range={n.sentence} word={n.word} markClassName="bg-[#ffc72c] text-[#2a2a2e]" />
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => n?.toggle()}
          disabled={!n?.playable || state === "loading"}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#102a43] px-6 text-lg font-semibold text-white shadow-md hover:bg-[#1e3a5c] disabled:opacity-50"
        >
          <Icon name={playing ? "pause" : state === "ended" ? "refresh" : "play"} className="size-5" /> {label2}
        </button>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#102a43]/15" aria-hidden>
          <div className="h-full rounded-full bg-[#102a43] transition-[width] duration-500" style={{ width: `${Math.round((n?.progress ?? 0) * 100)}%` }} />
        </div>
        <button
          type="button"
          aria-expanded={transcript}
          onClick={() => setTranscript((t) => !t)}
          className="min-h-10 rounded-full bg-white/80 px-4 text-sm font-semibold text-[#102a43] shadow-sm hover:bg-white"
        >
          {transcript ? "Hide transcript" : "Read the transcript"}
        </button>
        {transcript && (
          <p data-follow-scroll className="max-h-60 w-full overflow-y-auto rounded-2xl bg-white/90 p-4 text-left text-[0.98rem] leading-relaxed text-ink">
            <SpokenText text={script} word={n?.text === script ? (n?.word ?? null) : null} scroll />
          </p>
        )}
        {n && !n.playable && <p className="text-sm opacity-75">This browser can’t play the voice. Read the transcript instead.</p>}
      </div>
    </div>
  );
}
