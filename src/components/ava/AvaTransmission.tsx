"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { STOP_AUDIO } from "@/lib/audioPrefs";
import { estimateWords, type WordTiming } from "@/lib/wordTimings";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import "./ava.css";

/*
  Ava's transmission (docs/ai-learning-guide.md, "Ava 2.0"): the AI Learning Guide checking in from somewhere in
  remote Australia, in a small broadcast monitor. One component for Topics (inside the card), Magazine (a guide
  segment set as a Transmission) and Discovery Paths (the path's introduction).

  1. Incoming: the first time it comes into view, the window flickers on from standby and, for two seconds, static, a
     calling beacon, "Incoming transmission" typing in and the signal locking, before her picture comes through.
  2. Signal acquired: Ava's face comes through with one soft tear and settles. "Ava · Transmission ready".
  3. Transmitting: when someone presses play, or by itself where the caller asks (Magazine, Paths). Browsers allow
     sound by itself only once the page has been used, so until then she starts muted, her words on screen, with a
     button to turn the sound on. The waveform follows the real sound.
  4. Complete: the picture folds to a line and goes, and play becomes Replay. In Magazine ("hold") the last frame stays
     until the page signs her off (the window flickers out, CourseCover) and the picture takes over.

  It's always a recording of an approved script, and says so in words. The Transcript toggle shows her words Off (the
  default), On screen as she says them (timed to her voice, or spread over the recording when there are no timings), or
  Full, the whole script below the window with the word she's saying marked. With less motion asked for, the window simply appears, nothing flickers,
  and she doesn't start by herself unless sound is allowed.
*/

export type AvaMedia =
  /**
    ownFrame: a video made elsewhere (an uploaded Laura transmission) shows its own first frame, not Ava's portrait.
    words: when each word of the script is said, for showing the words on screen as she says them.
  */
  | { kind: "video"; src: string; poster?: string | null; captions?: string | null; ownFrame?: boolean; words?: WordTiming[] | null }
  /** A recording of the script with no picture of its own: it plays over Ava's portrait. wordsUrl: where its word timings are, fetched on first play. */
  | { kind: "audio"; src: string; wordsUrl?: string };

/** The index of the word being said at this time: the last one that has started (-1 before the first). */
function wordIndexAt(words: WordTiming[], seconds: number) {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= seconds) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

type Phase = "dark" | "connecting" | "acquired" | "ready" | "loading" | "playing" | "paused" | "ended" | "error";

/** A tall (portrait) screen's height: most of a phone's height, never more than fits a Topic card. */
const TALL_HEIGHT = "min(56svh, 30rem)";
/** A tall window's width: its 9:16 screen at that height, plus the frame's padding either side. */
const tallWidth = (layout: "card" | "block" | "intro") => `calc(${TALL_HEIGHT} * 9 / 16 + ${layout === "card" ? "0.75rem" : "1.25rem"})`;

/** How long the "Incoming transmission" lead-in runs before her picture comes through. */
const INCOMING_MS = 2000;
/** The longest the lead-in waits for her video to load before letting it come through anyway (it buffers as it plays). */
const LOAD_WAIT_MS = 10_000;

const BARS = 36;
/** A quiet resting line, the same every time: low in the middle, a little lift either side. */
const REST = Array.from({ length: BARS }, (_, i) => 0.12 + 0.08 * Math.abs(Math.sin(i * 0.9)));

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Whether the page has been used (a click, a key): browsers allow sound by itself only after that. */
const pageUsed = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
/** The browser only lets a page read a recording's sound when the file is the Hub's own. */
const sameOrigin = (src: string) => src.startsWith("/") && !src.startsWith("//");

export function AvaTransmission({
  media,
  portrait,
  name = "Ava",
  script,
  title,
  layout = "card",
  afterEnd = "rest",
  autoPlay = false,
  startMuted = false,
  caseLabel,
  onComplete,
  onEvent,
  shape = "wide",
  className,
}: {
  /** What plays: Ava's recorded video, or a recording of the script over her portrait. Null when there's nothing to play: the script shows instead. */
  media: AvaMedia | null;
  /** Ava's still, for the screen before (and, with audio, during) the transmission. */
  portrait: string | null;
  name?: string;
  /** The script, exactly as spoken. */
  script: string;
  /** What this transmission is about, for screen readers ("Introduction to Care Coordination"). */
  title: string;
  /** card: inside a Topic card; block: a Magazine page; intro: the top of a Discovery Path. */
  layout?: "card" | "block" | "intro";
  /**
    "rest": the picture folds away and the screen offers Replay. "poster": it gives way to the poster image. "hold": the last
    frame stays, for a caller that takes the window away itself (CourseCover).
  */
  afterEnd?: "rest" | "poster" | "hold";
  /**
    Start by itself once it has arrived: with sound if the page has been used, otherwise muted with a button for sound. The
    caller says whether they want it (card audio on in Topics; always on a Magazine cover or a Path). A function is asked then.
  */
  autoPlay?: boolean | (() => boolean);
  /** Start by itself muted even when sound is allowed (the learner has the Audio guide off): the words carry it. */
  startMuted?: boolean;
  /** A small label in the corner ("Case 03"). */
  caseLabel?: string;
  /** When the recording has played to the end, or can't play (so nobody's held up). */
  onComplete?: () => void;
  onEvent?: (e: "started" | "paused" | "completed" | "transcript") => void;
  /**
    "tall": a portrait screen (9:16) for a portrait video, sized to fit the height of a Topic card. "fill": the window takes
    all the room it's given (a whole Topic card), its screen as tall as fits.
  */
  shape?: "wide" | "tall" | "fill";
  className?: string;
}) {
  const id = useId();
  const tallScreen = shape === "tall";
  const fillCard = shape === "fill";
  // A narrow window (tall or filling a card) keeps its status bar and toggle short.
  const narrow = tallScreen || fillCard;
  const root = useRef<HTMLElement>(null);
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);
  const raf = useRef(0);
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>(media ? "dark" : "ready");
  // Her words: off (the default), on screen as she says them, or the full script below the window. With nothing to play,
  // the script is all there is, so it shows.
  const [wordsShown, setWordsShown] = useState<"off" | "screen" | "full">(media ? "off" : "full");
  const captions = wordsShown === "screen";
  const showScript = wordsShown === "full";
  const [poster, setPoster] = useState(false);
  const [tall, setTall] = useState(false);
  // Playing without sound (started by itself before the page was used, or with the Audio guide off).
  const [muted, setMuted] = useState(false);
  // Replayed after it ended: the picture comes back through with its tear.
  const [relit, setRelit] = useState(false);
  const [length, setLength] = useState(0);
  // The words on screen: their timings (given with a video, or fetched with a recording of the script on first play), and
  // the one she's saying now (-1 when none). Timings only count when they fit this script. Without any, the words are
  // spread over the recording's length once it's known, so there are always words on screen while she speaks.
  const [timed, setTimed] = useState<WordTiming[] | null>(media?.kind === "video" ? (media.words ?? null) : null);
  const fitted = timed?.length && timed[timed.length - 1].to <= script.length ? timed : null;
  const estimated = useMemo(() => (!fitted && length > 0 && script.trim() ? estimateWords(script, length) : null), [fitted, length, script]);
  const words = fitted ?? estimated;
  const wordsRef = useRef(words);
  const [saying, setSaying] = useState(-1);
  const sayingRef = useRef(-1);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  // The lead-in waits for this: her video's first frame has loaded (so the video never appears before it's ready).
  const loadedWait = useRef<(() => void) | null>(null);

  // Stages 1 and 2, the first time it comes into view; straight to ready for less motion.
  useEffect(() => {
    const node = root.current;
    if (!node || !media) return;
    const timers: number[] = [];
    const arrive = () => {
      if (reducedMotion()) return ready();
      setPhase("connecting");
      // "Incoming transmission" for two seconds at least, and on until her video has loaded (at most ten).
      let through = false;
      const comeThrough = () => {
        if (through) return;
        through = true;
        loadedWait.current = null;
        setPhase("acquired");
        timers.push(window.setTimeout(ready, 700));
      };
      timers.push(
        window.setTimeout(() => {
          const m = el.current;
          const waitFor = media.kind === "video" && m instanceof HTMLVideoElement && m.preload !== "none" && m.readyState < 2;
          if (!waitFor) return comeThrough();
          loadedWait.current = comeThrough;
          timers.push(window.setTimeout(comeThrough, LOAD_WAIT_MS - INCOMING_MS));
        }, INCOMING_MS),
      );
    };
    const ready = () => {
      setPhase((p) => (p === "dark" || p === "connecting" || p === "acquired" ? "ready" : p));
      // Stage 3 by itself when the caller wants it: with sound once the page has been used, muted before that (except for
      // people who asked for less motion, who start it themselves unless it can speak).
      const wanted = typeof autoPlay === "function" ? autoPlay() : autoPlay;
      if (wanted && (pageUsed() || !reducedMotion())) timers.push(window.setTimeout(() => void play(true), 250));
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        arrive();
      },
      { threshold: 0.35 },
    );
    seen.observe(node);
    return () => {
      seen.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
    // Once per recording: a new one arrives afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.src]);

  // Leaving the page (or the card) stops it, and lets the sound go.
  useEffect(() => {
    const media = el.current;
    const stop = () => media?.pause();
    window.addEventListener(STOP_AUDIO, stop);
    return () => {
      window.removeEventListener(STOP_AUDIO, stop);
      media?.pause();
      cancelAnimationFrame(raf.current);
      void audio.current?.ctx.close().catch(() => {});
      audio.current = null;
    };
  }, []);

  /** The waveform at rest. */
  const settle = () => {
    cancelAnimationFrame(raf.current);
    bars.current.forEach((b, i) => {
      if (!b) return;
      b.style.transform = `scaleY(${REST[i]})`;
      b.dataset.peak = "false";
    });
  };

  /** The word being said, kept in step with the playback (React hears only when it changes). */
  const track = (m: HTMLMediaElement) => {
    const w = wordsRef.current;
    if (!w) return;
    const i = wordIndexAt(w, m.currentTime);
    if (i !== sayingRef.current) {
      sayingRef.current = i;
      setSaying(i);
    }
  };

  /** The waveform following the sound, frame by frame, while it plays, and the words with it. */
  const follow = () => {
    cancelAnimationFrame(raf.current);
    const still = reducedMotion();
    const tick = () => {
      const m = el.current;
      if (!m || m.paused) return settle();
      track(m);
      // With less motion asked for, the bars stay still; the words still follow.
      if (still) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const a = audio.current;
      if (a) {
        a.analyser.getByteFrequencyData(a.data);
        // Speech sits low in the spectrum: spread the lower bins across the bars, loudest in the middle.
        const usable = Math.floor(a.data.length * 0.55);
        bars.current.forEach((b, i) => {
          if (!b) return;
          const from = Math.abs(i - BARS / 2) / (BARS / 2);
          const v = a.data[Math.min(usable - 1, Math.floor(from * usable))] / 255;
          const h = Math.max(REST[i], Math.min(1, v * 1.15));
          b.style.transform = `scaleY(${h.toFixed(3)})`;
          b.dataset.peak = String(h > 0.78);
        });
      } else {
        // A recording from elsewhere can't be measured (the browser keeps its sound private): an even, gentle
        // movement while it plays, and only while it plays.
        const t = m.currentTime;
        bars.current.forEach((b, i) => {
          if (!b) return;
          const h = 0.25 + 0.35 * Math.abs(Math.sin(t * 5.2 + i * 0.55) * Math.cos(t * 1.7 + i * 0.2));
          b.style.transform = `scaleY(${h.toFixed(3)})`;
          b.dataset.peak = "false";
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  /** Listens to the recording for the waveform: once per element, and only for the Hub's own files. */
  const listen = () => {
    const m = el.current;
    if (audio.current || !m || !media || !sameOrigin(media.src) || reducedMotion()) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(m);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audio.current = { ctx, analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) };
    } catch {
      // No Web Audio: it plays as usual, with the gentle waveform.
    }
  };

  /** auto: started by itself, not by a press. */
  async function play(auto = false) {
    const m = el.current;
    if (!m) return;
    // Sound by itself needs the page to have been used; before that (or with the Audio guide off) she starts muted.
    const quiet = auto && (startMuted || !pageUsed());
    m.muted = quiet;
    setMuted(quiet);
    if (!quiet) {
      listen();
      void audio.current?.ctx.resume().catch(() => {});
    }
    // A recording of the script: its word timings, the first time it plays.
    if (media?.kind === "audio" && media.wordsUrl && !timed)
      void fetch(media.wordsUrl)
        .then((r) => (r.ok ? (r.json() as Promise<{ words?: WordTiming[] | null }>) : null))
        .then((d) => d?.words && setTimed(d.words))
        .catch(() => {});
    if (m.ended || phase === "ended") {
      m.currentTime = 0;
      sayingRef.current = -1;
      setSaying(-1);
      setRelit(true);
      window.setTimeout(() => setRelit(false), 700);
    }
    setPoster(false);
    setPhase("loading");
    try {
      await m.play();
    } catch (e) {
      // The browser wouldn't let it speak by itself: muted, then, with the button for sound.
      if (auto && !quiet && e instanceof DOMException && e.name === "NotAllowedError") {
        m.muted = true;
        setMuted(true);
        try {
          await m.play();
          return;
        } catch {}
      }
      // Blocked or failed: back to the play button (an error shows through onError).
      setPhase((p) => (p === "loading" ? "ready" : p));
    }
  }

  /** The button for sound, on a transmission that started muted. */
  const soundOn = () => {
    const m = el.current;
    if (!m) return;
    m.muted = false;
    setMuted(false);
    listen();
    void audio.current?.ctx.resume().catch(() => {});
  };

  const pause = () => el.current?.pause();
  const showWords = (next: "off" | "screen" | "full") => {
    if (next === "full" && !showScript) onEvent?.("transcript");
    // A captions file of its own (a checked Magazine video) follows the same choice.
    const track = el.current?.textTracks[0];
    if (track) track.mode = next === "screen" ? "showing" : "hidden";
    setWordsShown(next);
  };

  const handlers = {
    onPlaying: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      // Its length, if it learned it before the page was listening (a video that arrives with the page starts loading
      // straight away): the words on screen are spread over it when there are no timings.
      const d = e.currentTarget.duration;
      if (Number.isFinite(d) && d > 0) setLength(d);
      setPhase("playing");
      follow();
      if (!started.current) {
        started.current = true;
        onEvent?.("started");
      }
    },
    onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (e.currentTarget.ended) return;
      settle();
      setPhase((p) => (p === "error" ? p : "paused"));
      onEvent?.("paused");
    },
    onEnded: () => {
      settle();
      setPhase("ended");
      if (afterEnd === "poster" && media?.kind === "video" && media.poster) setPoster(true);
      onEvent?.("completed");
      onComplete?.();
    },
    onError: () => {
      settle();
      setPhase("error");
      setWordsShown("full");
      onComplete?.();
    },
    onWaiting: () => setPhase((p) => (p === "playing" ? "loading" : p)),
    // Her first frame is in: the lead-in can give way to her.
    onLoadedData: () => loadedWait.current?.(),
    // Its length, for spreading the words over it when there are no timings (a recording can learn it late).
    onDurationChange: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const d = e.currentTarget.duration;
      if (Number.isFinite(d) && d > 0) setLength(d);
    },
  };

  const transmitting = phase === "playing";
  // A transmission whose words break off (a dash or "…" at the end) is an interrupted one: it ends on "Signal lost".
  const hasScript = Boolean(script.trim());
  const cutOff = /[—–-]\s*["”’]?\s*$|…\s*$|\[signal lost\]\s*$/i.test(script.trim());
  const status =
    phase === "dark"
      ? "Standing by"
      : phase === "connecting"
        ? "Incoming transmission"
        : transmitting
          ? "Transmitting"
          : phase === "loading"
            ? "Receiving"
            : phase === "ended"
              ? cutOff
                ? "Signal lost"
                : "Transmission complete"
              : phase === "error"
                ? "Signal lost"
                : `${name} · Transmission ready`;
  const showFeed = phase !== "dark" && phase !== "connecting";
  const stillSrc = media?.kind === "video" ? (media.ownFrame ? null : (media.poster ?? portrait)) : portrait;
  const buttonLabel = phase === "ended" ? `Replay: ${title}` : transmitting || phase === "loading" ? `Pause: ${title}` : `Play: ${title}`;

  // While she speaks, the words on screen: about a dozen around the one she's saying, that one lit.
  const live = Boolean(words) && captions && saying >= 0 && (phase === "playing" || phase === "paused" || phase === "loading");
  const caption =
    live && words
      ? words.slice(Math.max(0, saying - 6), Math.min(words.length, saying + 7)).map((w, i, shown) => {
          const n = Math.max(0, saying - 6) + i;
          return (
            <span key={n}>
              <span className={cx("rounded px-0.5", n === saying ? "bg-[var(--ava-cyan)]/25 font-bold text-[var(--ava-highlight)]" : "text-white/85")}>
                {script.slice(w.from, w.to)}
              </span>
              {i < shown.length - 1 ? " " : ""}
            </span>
          );
        })
      : null;

  const transcript = (
    <div id={`${id}-script`} className="rounded-2xl bg-surface p-4 text-ink ring-1 ring-line">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">{name}’s script, as spoken</p>
      {words && saying >= 0 ? (
        // Following along: the word she's saying is marked in the script too.
        <p className="mt-1 whitespace-pre-line leading-relaxed">
          {script.slice(0, words[saying].from)}
          <mark className="rounded bg-tealtint px-0.5 font-semibold text-ink">{script.slice(words[saying].from, words[saying].to)}</mark>
          {script.slice(words[saying].to)}
        </p>
      ) : (
        <p className="mt-1 whitespace-pre-line leading-relaxed">{script}</p>
      )}
    </div>
  );

  return (
    <div className={cx("flex w-full flex-col gap-3", layout === "block" && "mx-auto max-w-4xl", fillCard && "h-full", className)}>
      <figure
        ref={root}
        data-phase={phase}
        data-after={afterEnd}
        data-relit={relit}
        aria-label={`${name}: an AI video, a recorded transmission. ${title}`}
        className={cx(
          "ava-tx relative overflow-hidden rounded-2xl",
          layout === "card" ? "p-1.5" : "p-2 sm:p-2.5",
          tallScreen && "mx-auto max-w-full",
          fillCard && "flex h-full flex-col",
        )}
        // A tall window is as wide as its portrait screen at the height it's given.
        style={tallScreen ? { width: tallWidth(layout) } : undefined}
      >
        {/* Status bar: what it is, in words, always. */}
        <figcaption className="flex items-center gap-2 px-1.5 pb-1.5 pt-0.5 font-mulish text-[0.7rem] font-bold tracking-wide text-[var(--ava-highlight)]">
          <span className="rounded-[4px] bg-[var(--ava-cyan)] px-1 py-px text-[0.6rem] font-extrabold leading-none text-[var(--ava-navy)]">AI</span>
          {/* On a phone the status needs the room: "Ava · Recorded" beside the AI mark says the same, and screen readers hear it all. */}
          <span className="min-w-0 truncate">
            {name} · <span className={cx(narrow ? "sr-only" : layout === "card" && "max-sm:sr-only")}>AI video · </span>Recorded
          </span>
          <span aria-live="polite" className={cx("ml-auto shrink-0 uppercase tracking-[0.14em]", transmitting ? "text-[var(--ava-cyan)]" : "text-white/60")}>
            {transmitting && <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--ava-cyan)] align-middle" />}
            {status}
          </span>
        </figcaption>

        <div className={cx("ava-screen relative overflow-hidden rounded-xl", fillCard ? "min-h-0 flex-1" : tallScreen ? "aspect-[9/16]" : "aspect-video")}>
          {/* The feed: the recording itself, or Ava's portrait under a recording of her voice. */}
          {media?.kind === "video" ? (
            <video
              ref={el}
              src={media.src}
              poster={stillSrc ?? undefined}
              // Set to start by itself: it loads during the lead-in. Otherwise just enough for its first frame (none with a still of its own).
              preload={autoPlay === true ? "auto" : stillSrc ? "none" : "metadata"}
              playsInline
              aria-label={title}
              className="ava-feed absolute inset-0 size-full object-cover object-[center_22%]"
              {...handlers}
            >
              {media.captions && <track kind="captions" src={media.captions} srcLang="en" label="English" default={captions} />}
            </video>
          ) : (
            <>
              {stillSrc ? (
                // A tall portrait is set as a medium close-up (her face about half the screen's height), its sides fading into the navy;
                // a wide still fills the screen.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stillSrc}
                  alt=""
                  onLoad={(e) => setTall(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth * 1.1)}
                  className={cx(
                    "ava-feed absolute",
                    // In a tall screen a tall still simply fills it.
                    tall && !narrow
                      ? "ava-still-tall left-1/2 top-[4%] h-[178%] w-auto max-w-none -translate-x-1/2"
                      : "inset-0 size-full object-cover object-[center_22%]",
                  )}
                />
              ) : (
                <span aria-hidden className="ava-feed absolute inset-0 grid place-items-center">
                  <svg viewBox="0 0 120 90" className="h-3/4 text-[var(--ava-blue)]">
                    <circle cx="60" cy="34" r="16" fill="currentColor" />
                    <path d="M28 90c2-22 15-34 32-34s30 12 32 34z" fill="currentColor" />
                  </svg>
                </span>
              )}
              {media && <audio ref={el} src={media.src} preload="none" {...handlers} />}
            </>
          )}

          {/* The transmission's surface: tint, scanlines, grain, vignette, a faint shimmer. Hidden once the poster takes over. */}
          {!poster && (
            <>
              <span aria-hidden className="ava-tint pointer-events-none absolute inset-0" />
              <span aria-hidden className="ava-tint-lift pointer-events-none absolute inset-0" />
              <span aria-hidden className="ava-scanlines pointer-events-none absolute inset-0" />
              <span aria-hidden className="ava-grain pointer-events-none absolute -inset-[10%]" />
              <span aria-hidden className="ava-shimmer pointer-events-none absolute inset-0" />
              <span aria-hidden className="ava-tear pointer-events-none absolute inset-x-0" />
            </>
          )}
          {poster && media?.kind === "video" && media.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.poster} alt="" className="ava-poster absolute inset-0 size-full object-cover object-[center_22%]" />
          )}
          <span aria-hidden className="ava-vignette pointer-events-none absolute inset-0" />

          {/* Filling a card there's no room below, so the full script opens over the lower part of her video. */}
          {fillCard && showScript && hasScript && (
            <div className="absolute inset-x-2 bottom-2 z-10 max-h-[55%] overflow-y-auto rounded-2xl shadow-lg">{transcript}</div>
          )}

          {/* The words as she says them (screen readers have the script under Read script instead). */}
          {caption && (
            <p
              aria-hidden
              className={cx(
                "pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-[#0b1f36]/80 px-3 py-1.5 text-center leading-snug backdrop-blur-[2px]",
                layout === "card" ? "text-sm" : "text-sm sm:text-base",
              )}
            >
              {caption}
            </p>
          )}

          {/* The lead-in, two seconds before her picture comes through: static, a beacon calling, the words typing in, the signal locking. */}
          {phase === "connecting" && (
            <span aria-hidden className="pointer-events-none absolute inset-0">
              <span className="ava-static absolute -inset-[10%]" />
              <span className="ava-scanbar absolute inset-x-0 top-0" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="flex flex-col items-center gap-2.5 sm:gap-3">
                  <span className={cx("relative grid place-items-center", layout === "card" ? "size-9" : "size-12")}>
                    <span className="ava-ring absolute inset-0 rounded-full border border-[var(--ava-cyan)]" />
                    <span className="ava-ring ava-ring-late absolute inset-0 rounded-full border border-[var(--ava-cyan)]" />
                    <span className="ava-beacon size-2.5 rounded-full bg-[var(--ava-cyan)]" />
                  </span>
                  <span className="ava-incoming whitespace-nowrap pl-[0.32em] font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.32em] text-[var(--ava-cyan)] sm:text-xs">
                    Incoming transmission
                  </span>
                  <span className="ava-lock block h-[3px] w-28 overflow-hidden rounded-full bg-white/15 sm:w-36">
                    <span className="block h-full bg-[var(--ava-cyan)]" />
                  </span>
                  <span
                    className={cx(
                      "ava-locking font-mulish text-[0.6rem] font-bold uppercase tracking-[0.24em] text-white/60",
                      layout === "card" && "max-sm:hidden",
                    )}
                  >
                    Locking signal
                  </span>
                </span>
              </span>
            </span>
          )}

          {caseLabel && showFeed && (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-mulish text-[0.7rem] font-bold text-white">
              {caseLabel}
            </span>
          )}

          {media && muted && (phase === "playing" || phase === "loading" || phase === "paused") && (
            <button
              type="button"
              onClick={soundOn}
              className="absolute left-3 top-3 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#0b1f36]/85 px-3 text-sm font-semibold text-white ring-1 ring-[var(--ava-cyan)]/60 backdrop-blur-sm hover:bg-[#0b1f36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ava-cyan)]"
            >
              <Icon name="volume-off" className="size-4" /> Turn sound on
            </button>
          )}

          {media && showFeed && phase !== "error" && (
            <button
              type="button"
              onClick={() => (transmitting || phase === "loading" ? pause() : void play())}
              aria-label={buttonLabel}
              className={cx(
                "ava-play absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[var(--ava-text)] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ava-cyan)]",
                layout === "card" ? "size-14" : "size-16",
                // While it speaks the control steps back, and comes forward on hover or focus.
                transmitting ? "opacity-0 hover:opacity-100" : "opacity-100",
              )}
            >
              {phase === "ended" ? (
                <Icon name="refresh" className="size-6" />
              ) : transmitting || phase === "loading" ? (
                <Icon name="pause" className="size-6" />
              ) : (
                <Icon name="play" className="ml-0.5 size-6" />
              )}
            </button>
          )}
        </div>

        {/* Bottom bar: the waveform, and the script. */}
        <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-1.5">
          <span
            aria-hidden
            data-live={transmitting}
            data-flicker={phase === "connecting" || phase === "loading"}
            className="ava-wave flex h-5 min-w-0 flex-1 items-center justify-center gap-[3px]"
          >
            {REST.map((r, i) => (
              <span
                key={i}
                ref={(b) => {
                  bars.current[i] = b;
                }}
                style={{ "--rest": r } as React.CSSProperties}
              />
            ))}
          </span>
          {/* The transcript, three ways: Off, On screen (her words as she says them), Full (the whole script below). */}
          {media && (hasScript || (media.kind === "video" && media.captions)) && (
            <div role="group" aria-label="Transcript" className="flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cx(
                  "font-mulish text-[0.65rem] font-extrabold uppercase tracking-wide text-white/60",
                  narrow ? "hidden" : layout === "card" && "max-sm:hidden",
                )}
              >
                Transcript
              </span>
              <span className="inline-flex rounded-full bg-white/[0.06] p-0.5 ring-1 ring-[var(--ava-cyan)]/30">
                {([["off", "Off"], ["screen", "On screen"], ...(hasScript ? ([["full", "Full"]] as const) : [])] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={wordsShown === value}
                    aria-controls={value === "full" ? `${id}-script` : undefined}
                    onClick={() => showWords(value)}
                    className={cx(
                      "min-h-8 whitespace-nowrap rounded-full px-2.5 font-mulish text-xs font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ava-cyan)]",
                      wordsShown === value ? "bg-[var(--ava-cyan)] text-[var(--ava-navy)]" : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
        </div>
      </figure>
      {phase === "error" && (
        <p role="alert" className="rounded-2xl bg-[#fdf1f0] px-3 py-2 text-sm font-semibold text-[#a12d31]">
          {name}’s transmission couldn’t be played.{hasScript && " Everything she says is in the script."}
        </p>
      )}
      {!fillCard && showScript && hasScript && transcript}
    </div>
  );
}

/** One of Ava's lines (keyed like the narration): her talking video when one is ready, otherwise her voice over her portrait. */
export const avaLineMedia = (key: string, video: { src: string; poster: string | null; words?: WordTiming[] | null } | null): AvaMedia =>
  video
    ? { kind: "video", src: video.src, poster: video.poster, ownFrame: !video.poster, words: video.words ?? null }
    : // Her voice reading the script, with its word timings (generated with it) for the words on screen.
      { kind: "audio", src: `/api/tts?key=${encodeURIComponent(key)}`, wordsUrl: `/api/tts?key=${encodeURIComponent(key)}&timings=1` };

/** The window's place while Ava's details load, so the page doesn't jump and the transmission arrives only once. */
export function AvaPlaceholder({
  layout = "card",
  shape = "wide",
  className,
}: {
  layout?: "card" | "block" | "intro";
  shape?: "wide" | "tall" | "fill";
  className?: string;
}) {
  const tall = shape === "tall";
  const fill = shape === "fill";
  return (
    <div className={cx("w-full", layout === "block" && "mx-auto max-w-4xl", fill && "h-full", className)}>
      <div
        aria-hidden
        className={cx(
          "ava-tx ava-standby rounded-2xl",
          layout === "card" ? "p-1.5" : "p-2 sm:p-2.5",
          tall && "mx-auto max-w-full",
          fill && "flex h-full flex-col",
        )}
        style={tall ? { width: tallWidth(layout) } : undefined}
      >
        <div className="h-6" />
        <div className={cx("ava-screen rounded-xl", fill ? "min-h-0 flex-1" : tall ? "aspect-[9/16]" : "aspect-video")} />
        <div className="h-10" />
      </div>
    </div>
  );
}
