"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { cx } from "@/lib/format";
import { autoplayEnabled } from "@/lib/audioPrefs";

/*
  Card audio. Plays a recorded voice file when the card has one (`audioSrc`); otherwise the
  live ElevenLabs voice from /api/tts when the server has a key; otherwise the browser's
  speech engine reads the narration script with the best English voice available.
  It starts on its own when the learner's auto-play preference is on and the browser allows
  it, and always has pause, speed, captions (speech) and a full transcript.
*/

const RATES = [1, 1.25, 1.5, 0.75];

/*
  What's playing right now, shared so a card can show its own audio stage (see AudioStage) while
  this component stays the one player. Only one card narrates at a time.
*/
export type NarrationNow = {
  key: string;
  state: "idle" | "loading" | "playing" | "paused" | "ended";
  caption: string | null;
  progress: number;
  playable: boolean;
  toggle: () => void;
};
let now: NarrationNow | null = null;
const listeners = new Set<() => void>();
function publish(next: NarrationNow | null) {
  now = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** The narration for one card, if it's the one on screen. */
export function useNarration(key: string) {
  const current = useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
  return current?.key === key ? current : null;
}

const noop = () => () => {};
const useSpeechSupported = () =>
  useSyncExternalStore(
    noop,
    () => "speechSynthesis" in window,
    () => true,
  );

function sentences(text: string) {
  return text.match(/[^.!?]+[.!?]+["”’]?\s*/g)?.map((s) => s.trim()) ?? [text];
}

/** Prefers Australian English, then British, then any English; higher quality voices first. */
function bestVoice() {
  const voices = window.speechSynthesis.getVoices();
  const good = (list: SpeechSynthesisVoice[]) => list.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ?? list[0];
  const lang = (prefix: string) => voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(prefix));
  return good(lang("en-au")) ?? good(lang("en-gb")) ?? good(lang("en"));
}

/* Whether the server has a live voice (ElevenLabs) configured. Checked once per page load. */
let liveVoice: boolean | null = null;
let liveChecking = false;
const liveListeners = new Set<() => void>();
function checkLiveVoice() {
  if (liveChecking || typeof window === "undefined") return;
  liveChecking = true;
  const settle = (v: boolean) => {
    liveVoice = v;
    liveListeners.forEach((l) => l());
  };
  fetch("/api/tts?status=1")
    .then((r) => r.json())
    .then((d: { configured?: boolean }) => settle(Boolean(d.configured)))
    .catch(() => settle(false));
}
const useLiveVoice = () =>
  useSyncExternalStore(
    (cb) => {
      checkLiveVoice();
      liveListeners.add(cb);
      return () => liveListeners.delete(cb);
    },
    () => liveVoice,
    () => null,
  );

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export function Narration({
  text,
  label = "Listen",
  durationSec,
  speech = true,
  audioSrc,
  autoPlay = true,
  captionTarget,
  ttsKey,
  controls = true,
}: {
  text: string;
  label?: string;
  durationSec?: number;
  /** false shows the transcript only, for cards whose video carries the audio. */
  speech?: boolean;
  audioSrc?: string;
  autoPlay?: boolean;
  /** id of an element (in the footer, above the buttons) where the live caption is shown. */
  captionTarget?: string;
  /** Card key for live narration from the server, e.g. `lesson:<slug>:<nodeId>`. */
  ttsKey?: string;
  /** false hides the footer orb: the card has its own play button (the dedicated audio card). */
  controls?: boolean;
}) {
  const parts = useMemo(() => sentences(text), [text]);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "ended">("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(durationSec ?? Math.max(5, Math.round(text.split(/\s+/).length / 2.6)));
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const speechSupported = useSpeechSupported();
  const audio = useRef<HTMLAudioElement>(null);
  const run = useRef(0);
  // Order of preference: a recorded file, the live ElevenLabs voice, then the browser's voice.
  const live = useLiveVoice();
  const [liveFailed, setLiveFailed] = useState(false);
  const src = audioSrc ?? (live && ttsKey && !liveFailed ? `/api/tts?key=${encodeURIComponent(ttsKey)}` : undefined);
  const usesFile = Boolean(src);
  const ready = Boolean(audioSrc) || !ttsKey || live !== null;
  const playable = speech && (usesFile || speechSupported);

  useEffect(() => {
    const cancel = run;
    return () => {
      cancel.current++;
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Auto-play once the card has settled. Browsers only allow it after the learner has interacted
  // with the page (for example pressing Continue); otherwise the play button simply waits.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!ready || autoStarted.current || !autoPlay || !playable || !autoplayEnabled()) return;
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
    if (!activated) return;
    // Mark as started only when the timer fires, so a cancelled run (React re-running effects) can retry.
    const t = window.setTimeout(() => {
      autoStarted.current = true;
      play();
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function speakFrom(i: number, r = rate) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const voice = bestVoice();
    const speak = (n: number) => {
      if (id !== run.current) return;
      if (n >= parts.length) {
        setState("ended");
        setProgress(1);
        return;
      }
      setIndex(n);
      setProgress(n / parts.length);
      const u = new SpeechSynthesisUtterance(parts[n]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-AU";
      u.rate = r;
      u.onend = () => speak(n + 1);
      synth.speak(u);
    };
    setState("playing");
    speak(i);
  }

  function play() {
    if (usesFile) {
      const el = audio.current;
      if (!el) return;
      if (state === "ended") el.currentTime = 0;
      el.playbackRate = rate;
      if (state === "idle") setState("loading");
      el.play().then(
        () => setState("playing"),
        () => setState((st) => (st === "loading" ? "idle" : st)), // blocked by the browser: wait for a press
      );
      return;
    }
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
    } else {
      speakFrom(0);
    }
  }

  function pause() {
    if (usesFile) audio.current?.pause();
    else window.speechSynthesis.pause();
    setState("paused");
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (usesFile && audio.current) audio.current.playbackRate = next;
    else if (state === "playing") speakFrom(index, next);
  }

  const elapsed = progress * length;
  const wrap = useRef<HTMLDivElement>(null);

  // Close the controls on Escape or a press outside them.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setExpanded(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [expanded]);

  // With audio files, captions follow playback time, apportioned by sentence length.
  const ends = useMemo(() => {
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let run = 0;
    return parts.map((p) => (run += p.length) / total);
  }, [parts]);
  const fileIndex = Math.max(0, ends.findIndex((e) => progress <= e));
  const caption = state === "playing" ? parts[usesFile ? fileIndex : index] : null;
  // The slot is rendered alongside this component; it exists by the time a caption is shown.
  const slot = caption && captionTarget && typeof document !== "undefined" ? document.getElementById(captionTarget) : null;

  // Share the live state with the card's audio stage, if it has one.
  const shared = state === "playing" ? parts[usesFile ? fileIndex : index] : state === "paused" ? (parts[usesFile ? fileIndex : index] ?? null) : null;
  const overall = usesFile ? progress : state === "ended" ? 1 : parts.length ? index / parts.length : 0;
  useEffect(() => {
    if (!ttsKey) return;
    publish({ key: ttsKey, state, caption: shared, progress: overall, playable, toggle: () => (state === "playing" ? pause() : play()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsKey, state, shared, overall, playable]);
  useEffect(() => () => void (now?.key === ttsKey && publish(null)), [ttsKey]);
  const name = label.toLowerCase();

  /*
    Sits in the card footer between Back and Continue, so it never pushes content down.
    The orb pulses while the script is read. Pressing it opens a small panel above the
    footer with play/pause, progress, speed and the transcript; the first press also
    starts the audio if it hasn't started.
  */
  return (
    <div ref={wrap} className="relative flex items-center justify-center">
      {usesFile && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onEnded={() => setState("ended")}
          onPause={() => setState((st) => (st === "playing" ? "paused" : st))}
          onError={() => {
            // Live voice unavailable: fall back to the browser voice so the card still speaks.
            if (!audioSrc && ttsKey) {
              const wasStarting = state === "loading" || state === "playing";
              setLiveFailed(true);
              setState("idle");
              if (wasStarting) window.setTimeout(() => speakFrom(0), 0);
            }
          }}
        />
      )}

      {!controls ? null : playable ? (
        <button
          type="button"
          onClick={() => {
            if (state === "idle") play();
            setExpanded((x) => (state === "idle" ? true : !x));
          }}
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          aria-label={
            state === "idle"
              ? `Play ${name} and show audio controls`
              : `${label}: ${state === "loading" ? "loading" : state === "playing" ? "playing" : state === "paused" ? "paused" : "finished"}. ${expanded ? "Hide" : "Show"} audio controls and transcript`
          }
          className={cx(
            "audio-orb relative isolate inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-action text-on-action shadow-md transition-transform active:scale-95",
            state === "playing" && "is-playing",
          )}
        >
          {state === "loading" ? (
            <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : state === "playing" ? (
            <span className="flex h-5 items-center gap-[3px]" aria-hidden>
              {[0, 1, 2, 3, 4].map((b) => (
                <span key={b} className="audio-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${b * 0.12}s` }} />
              ))}
            </span>
          ) : (
            <Icon name={state === "ended" ? "refresh" : state === "paused" ? "pause" : "play"} className="size-6" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          aria-label={expanded ? "Hide transcript" : "Show transcript"}
          title="Transcript"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-muted"
        >
          <Icon name="doc" className="size-5" />
        </button>
      )}

      {/* Live caption, shown in the footer above the buttons so it never covers the card. */}
      {caption &&
        !expanded &&
        slot &&
        createPortal(
          <p aria-live="polite" className="mb-2 text-center text-sm italic leading-snug text-ink-muted">
            <span className="sr-only">Caption: </span>
            {caption}
          </p>,
          slot,
        )}

      {expanded && (
        <div
          id={`${id}-panel`}
          role="group"
          aria-label={`${label} audio`}
          className="animate-card-in absolute bottom-full left-1/2 z-20 mb-5 flex w-[min(24rem,calc(100vw-3rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xl"
        >
          {playable && (
            <>
              {caption && (
                <p aria-live="polite" className="text-center text-sm italic leading-snug text-ink-muted">
                  {caption}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={state === "playing" ? pause : play}
                  aria-label={state === "playing" ? "Pause" : state === "ended" ? "Play again" : state === "paused" ? "Resume" : "Play"}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-action text-on-action hover:bg-action-hover"
                >
                  <Icon name={state === "playing" ? "pause" : state === "ended" ? "refresh" : "play"} className="size-[1.1rem]" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{label}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line-strong" aria-hidden>
                    <div className="h-full rounded-full bg-action transition-[width] duration-500 ease-linear" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                  </div>
                  <span className="mt-0.5 block font-mulish text-[0.7rem] tabular-nums text-ink-muted">
                    {fmt(elapsed)} / {fmt(length)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={cycleRate}
                  aria-label={`Playback speed ${rate} times. Change speed`}
                  className="inline-flex h-9 min-w-10 shrink-0 items-center justify-center rounded-full px-2 font-mulish text-xs font-bold hover:bg-muted"
                >
                  {rate}×
                </button>
              </div>
            </>
          )}
          {speech && !usesFile && !speechSupported && <p className="text-sm text-ink-muted">Audio isn’t available in this browser.</p>}
          <details open={!playable} className="group">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent">
              <Icon name="doc" className="size-4" /> Transcript
              {durationSec && !playable ? <span className="font-normal text-ink-muted">· about {durationSec} seconds</span> : null}
              <Icon name="chevron-down" className="ml-auto size-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1 max-h-44 overflow-y-auto pr-1 text-[0.95rem] leading-relaxed">{text}</p>
          </details>
        </div>
      )}
    </div>
  );
}
