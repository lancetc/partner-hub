"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { NarrationAudio } from "@/lib/magazine";
import { activeCue, type TimedCue } from "@/lib/briefingCues";
import { STOP_AUDIO, useBriefingAutoplay, useFollowWords } from "@/lib/audioPrefs";
import { estimateWords, wordAt } from "@/lib/wordTimings";
import { SpokenText } from "../player/SpokenText";
import { othersPlaying, useOnePlayer } from "@/lib/onePlayer";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  The Trilogy Briefing on the homepage (the owner, Nov 2026): a compact editorial strip. At rest it's quiet: the
  briefing's name, "Listen to this week's briefing" and its length. Playing, it comes forward in teal: "Now playing",
  an animated waveform, the time and progress, and controls to pause, skip to the next item, replay, read the
  transcript and dismiss. When the narration ends it settles back. Both states are the same height, so starting it
  never moves the page.

  As the narrator mentions a story or part of the newspaper (its cues, lib/briefingCues), that part is gently
  emphasised: the newspaper follows the audio's position, so pausing, seeking and replaying always show the right one.
  Nothing scrolls, nothing is hidden, and the featured story never changes by itself.

  It starts by itself only for someone who has turned that on (off by default): once a visit, when the strip is
  clearly in view, when nothing else on the Hub is playing and the browser allows it; it pauses if the newspaper
  scrolls out of view, and never restarts as someone scrolls back and forth.
*/

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const CUE_CLASSES = ["is-cued", "cue-headline", "cue-rule", "cue-tint", "cue-picture"];

/** Marks the part of the newspaper the narrator is talking about, and clears the last one. */
function emphasise(root: ParentNode | null, cue: TimedCue | null) {
  if (!root) return;
  root.querySelectorAll(".is-cued").forEach((el) => el.classList.remove(...CUE_CLASSES));
  if (!cue) return;
  root.querySelectorAll(`[data-cue~="${CSS.escape(cue.target)}"]`).forEach((el) => el.classList.add("is-cued", `cue-${cue.treatment}`));
}

export function BriefingStrip({ script, audio, cues, date }: { script: string; audio: NarrationAudio; cues: TimedCue[]; date: string }) {
  useOnePlayer();
  const el = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(audio.seconds);
  const [transcript, setTranscript] = useState(false);
  const auto = useBriefingAutoplay();
  const autoStarted = useRef(false);
  // Started by itself and not touched since: only then does scrolling away pause it.
  const byItself = useRef(false);
  const transcriptId = useId();
  const active = state !== "idle";
  const cue = active ? activeCue(cues, at) : null;
  // The word being said, for the transcript: from the recording's word timings, else spread over its length.
  const follow = useFollowWords();
  const timeline = useMemo(() => audio.words ?? (length > 0 ? estimateWords(script, length) : null), [audio.words, script, length]);
  const nowWord = follow && active && timeline ? wordAt(timeline, at) : null;

  // The newspaper follows the audio's position.
  useEffect(() => {
    emphasise(box.current?.closest("[data-news-root]") ?? null, cue);
  }, [cue]);
  useEffect(() => () => emphasise(box.current?.closest("[data-news-root]") ?? null, null), []);

  // The card mute button, and other players, can stop it.
  useEffect(() => {
    const stop = () => el.current?.pause();
    window.addEventListener(STOP_AUDIO, stop);
    return () => window.removeEventListener(STOP_AUDIO, stop);
  }, []);

  // Starting by itself, for those who asked for it.
  useEffect(() => {
    const strip = box.current;
    const paper = strip?.closest("[data-news-root]") ?? strip;
    if (!strip || !paper || typeof IntersectionObserver === "undefined") return;
    const see = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || e.intersectionRatio < 0.9 || autoStarted.current || !auto) return;
        const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
        if (!activated || othersPlaying(el.current).length) return;
        autoStarted.current = true;
        byItself.current = true;
        void play();
      },
      { threshold: [0, 0.9, 1] },
    );
    const away = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && byItself.current && el.current && !el.current.paused) el.current.pause();
    });
    see.observe(strip);
    away.observe(paper);
    return () => {
      see.disconnect();
      away.disconnect();
    };
  }, [auto]);

  async function play() {
    const a = el.current;
    if (!a) return;
    if (a.ended) a.currentTime = 0;
    try {
      await a.play();
    } catch {
      // The browser wants a tap first: the Play button waits for it.
      byItself.current = false;
    }
  }
  const touched = () => {
    byItself.current = false;
  };
  function toggle() {
    touched();
    if (state === "playing") el.current?.pause();
    else void play();
  }
  function seek(t: number) {
    const a = el.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(length - 0.05, t));
    setAt(a.currentTime);
  }
  function skip() {
    touched();
    const next = cues.find((c) => c.start > at + 0.25);
    seek(next ? next.start : at + 10);
  }
  function replay() {
    touched();
    seek(0);
    void play();
  }
  function dismiss() {
    touched();
    const a = el.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setAt(0);
    setState("idle");
    setTranscript(false);
  }

  const progress = length ? Math.min(1, at / length) : 0;
  return (
    <div className="border-b border-line-strong py-3" data-reveal="briefing">
      <div
        ref={box}
        data-player
        className={cx(
          "relative flex min-h-[4.5rem] items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 transition-colors duration-300 sm:gap-4 sm:px-4",
          active ? "border-[#007f7e]/45 bg-[#007f7e]/[0.09] shadow-sm dark:border-[#7fd6d2]/45 dark:bg-[#7fd6d2]/10" : "border-line bg-tealtint/60",
        )}
      >
        <audio
          ref={el}
          src={audio.src}
          preload="metadata"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
          onPlay={() => setState("playing")}
          onPause={(e) => !e.currentTarget.ended && setState("paused")}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onSeeked={(e) => setAt(e.currentTarget.currentTime)}
          onEnded={() => {
            // Done: the newspaper and the strip return to their normal editorial state.
            setState("idle");
            setAt(0);
            byItself.current = false;
          }}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Pause the briefing" : state === "paused" ? "Resume the briefing" : `Play this week’s briefing, ${fmt(length)}`}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[#007f7e] text-white shadow-sm transition hover:bg-[#006766] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007f7e]"
        >
          {state === "playing" ? (
            <Icon name="pause" className="size-5" />
          ) : active ? (
            <Icon name="play" className="ml-0.5 size-5" />
          ) : (
            // At rest: a small still waveform, the briefing's mark.
            <svg aria-hidden viewBox="0 0 20 20" className="size-5" fill="currentColor">
              <rect x="2" y="8" width="2" height="4" rx="1" />
              <rect x="6" y="5" width="2" height="10" rx="1" />
              <rect x="10" y="3" width="2" height="14" rx="1" />
              <rect x="14" y="6" width="2" height="8" rx="1" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">
            {active ? (
              <>
                <span className="text-[#007f7e] dark:text-[#7fd6d2]">{state === "playing" ? "Now playing" : "Paused"}</span>
                <span aria-hidden className="text-ink-muted">
                  ·
                </span>
                <span className="truncate text-ink-muted">The Trilogy Briefing</span>
              </>
            ) : (
              <span className="text-ink-muted">
                The Trilogy Briefing <span aria-hidden>·</span> <span className="normal-case tracking-normal">{date}</span>
              </span>
            )}
          </p>
          {active ? (
            <div className="mt-1 flex items-center gap-3">
              {/* The waveform moves only while it plays. */}
              <span aria-hidden className="flex h-5 items-center gap-[3px]">
                {[0, 1, 2, 3, 4, 5, 6].map((b) => (
                  <span
                    key={b}
                    className={cx("w-[3px] rounded-full bg-[#007f7e] dark:bg-[#7fd6d2]", state === "playing" ? "audio-bar" : "h-2/5")}
                    style={state === "playing" ? { animationDelay: `${(b % 4) * 0.13}s` } : undefined}
                  />
                ))}
              </span>
              <span className="truncate text-sm text-ink-muted">Magazine Editorial Voice · AI voice</span>
            </div>
          ) : (
            <p className="mt-0.5 truncate font-serif text-[1.05rem] font-semibold text-ink">Listen to this week’s briefing</p>
          )}
        </div>

        <span className="shrink-0 font-mulish text-sm tabular-nums text-ink-muted" aria-hidden>
          {active ? `${fmt(at)} / ${fmt(length)}` : fmt(length)}
        </span>
        {active && (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={skip}
              aria-label="Skip to the next item"
              title="Next item"
              className="grid size-9 place-items-center rounded-full hover:bg-[#007f7e]/10"
            >
              <Icon name="arrow-right" className="size-4" />
            </button>
            <button
              type="button"
              onClick={replay}
              aria-label="Replay from the start"
              title="Replay"
              className="grid size-9 place-items-center rounded-full hover:bg-[#007f7e]/10"
            >
              <Icon name="refresh" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setTranscript((x) => !x)}
              aria-expanded={transcript}
              aria-controls={transcriptId}
              aria-label={transcript ? "Hide the transcript" : "Show the transcript"}
              title="Transcript"
              className="grid size-9 place-items-center rounded-full hover:bg-[#007f7e]/10"
            >
              <Icon name="doc" className="size-4" />
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Stop and close the briefing"
              title="Close"
              className="grid size-9 place-items-center rounded-full hover:bg-[#007f7e]/10"
            >
              <Icon name="close" className="size-4" />
            </button>
          </span>
        )}
        {!active && (
          <button
            type="button"
            onClick={() => setTranscript((x) => !x)}
            aria-expanded={transcript}
            aria-controls={transcriptId}
            aria-label={transcript ? "Hide the transcript" : "Read the transcript"}
            title="Transcript"
            className="hidden size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-[#007f7e]/10 hover:text-ink sm:grid"
          >
            <Icon name="doc" className="size-4" />
          </button>
        )}

        {/* Playback progress along the strip's foot: a slider for keyboard and pointer. */}
        <div
          role="slider"
          tabIndex={active ? 0 : -1}
          aria-label="Position in the briefing"
          aria-valuemin={0}
          aria-valuemax={Math.round(length)}
          aria-valuenow={Math.round(at)}
          aria-valuetext={`${fmt(at)} of ${fmt(length)}`}
          aria-hidden={!active}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seek(at + 5);
            else if (e.key === "ArrowLeft") seek(at - 5);
            else return;
            e.preventDefault();
            touched();
          }}
          onClick={(e) => {
            if (!active) return;
            const r = e.currentTarget.getBoundingClientRect();
            touched();
            seek(((e.clientX - r.left) / r.width) * length);
          }}
          className={cx("absolute inset-x-0 bottom-0 h-1.5 cursor-pointer", !active && "pointer-events-none")}
        >
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#007f7e]/15" />
          <div
            className="absolute bottom-0 left-0 h-[3px] bg-[#007f7e] transition-[width] duration-200 dark:bg-[#7fd6d2]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {transcript && (
        <div id={transcriptId} className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Transcript</p>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink">
            <SpokenText text={script} word={nowWord} markClassName="bg-[#fab53d] text-[#102a43] rounded-sm" />
          </p>
        </div>
      )}
    </div>
  );
}
