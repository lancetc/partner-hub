"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/format";
import { useFollowWords } from "@/lib/audioPrefs";
import { formatSeconds, INTRO_AUDIO_SPEEDS, textHash, VOICE_PROFILES, type IntroAudioAction } from "@/lib/magazineNarration";
import { useOnePlayer } from "@/lib/onePlayer";
import type { NarrationAudio } from "@/lib/magazine";
import { Icon } from "../Icon";

/*
  "Listen to the introduction" (docs/magazine-audio-guide.md): a page's spoken introduction, beneath its heading and
  description and before its content. An editorial audio feature rather than a media player: a round teal Play, a
  waveform that fills as it plays and can be pressed or dragged to move through it, the time, a speed, Replay, the
  transcript on request, and a quiet line saying the voice is AI. It never plays by itself, and it never plays over Ava
  or a video (lib/onePlayer). Listening is never needed to finish the page.
*/

const BARS = 56;
const SPEED_KEY = "tc-intro-speed";
const speedListeners = new Set<() => void>();
const readSpeed = (): number => {
  try {
    const s = Number(localStorage.getItem(SPEED_KEY));
    return (INTRO_AUDIO_SPEEDS as readonly number[]).includes(s) ? s : 1;
  } catch {
    return 1;
  }
};
const writeSpeed = (s: number) => {
  try {
    localStorage.setItem(SPEED_KEY, String(s));
  } catch {}
  speedListeners.forEach((l) => l());
};
/** The learner's speed, remembered in this browser for every introduction. */
const useSpeed = () =>
  useSyncExternalStore(
    (cb) => {
      speedListeners.add(cb);
      return () => speedListeners.delete(cb);
    },
    readSpeed,
    () => 1,
  );

/**
  The waveform's bars: where the words fall in the recording (speech is taller than the pauses between sentences), with
  a steady variation from the recording's address so each introduction has its own shape. The same on server and browser.
*/
export function waveform(rec: Pick<NarrationAudio, "src" | "seconds" | "words">, bars = BARS): number[] {
  let seed = parseInt(textHash(rec.src).slice(0, 6), 36) || 1;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) / 0xffffff;
  };
  const dur = rec.seconds > 0 ? rec.seconds : 1;
  return Array.from({ length: bars }, (_, i) => {
    const from = (i / bars) * dur;
    const to = ((i + 1) / bars) * dur;
    const spoken = rec.words?.length ? rec.words.reduce((n, w) => n + Math.max(0, Math.min(to, w.end) - Math.max(from, w.start)), 0) / (to - from) : 0.75;
    const v = 0.18 + 0.82 * Math.min(1, spoken) * (0.45 + 0.55 * rand());
    return Math.round(v * 100) / 100;
  });
}

export type IntroEvent = (action: IntroAudioAction, detail?: { seconds?: number; percent?: number; speed?: number }) => void;

/** `label`: what the player says it is. A Magazine page's "Listen to the introduction"; a Discovery Path's "Listen to your introduction". */
export function IntroPlayer({
  script,
  audio: rec,
  onEvent,
  label = "Listen to the introduction",
  className,
}: {
  script: string;
  audio: NarrationAudio;
  onEvent: IntroEvent;
  label?: string;
  className?: string;
}) {
  useOnePlayer();
  const el = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended" | "broken">("idle");
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(rec.seconds);
  const [open, setOpen] = useState(false);
  const speed = useSpeed();
  const follow = useFollowWords();
  const transcriptId = useId();
  // For the waveform's clip path, whose url() won't take the punctuation in a React id.
  const clipId = `intro-played-${transcriptId.replace(/[^\w-]/g, "")}`;
  const bars = useMemo(() => waveform(rec), [rec]);
  // Listening, for the course's authors: seconds actually heard and the furthest point reached, sent on pause, end or leaving.
  const heard = useRef({ seconds: 0, furthest: 0, last: -1 });
  const sentTranscript = useRef(false);
  const send = useRef(onEvent);
  useEffect(() => {
    send.current = onEvent;
  }, [onEvent]);

  const flush = () => {
    const h = heard.current;
    if (h.seconds >= 1) send.current("listened", { seconds: Math.round(h.seconds * 10) / 10, percent: Math.round(h.furthest) });
    h.seconds = 0;
  };

  // The speed applies to whatever is playing, and to the next play.
  useEffect(() => {
    if (el.current) el.current.playbackRate = speed;
  }, [speed]);

  // Moving to another page hides this one rather than removing it (Next keeps it for coming back), and a hidden
  // player would carry on talking: it stops as the page is hidden, and what was heard is counted.
  useLayoutEffect(() => {
    const audio = el.current;
    return () => {
      audio?.pause();
      flush();
    };
  }, [rec.src]);

  // Smooth progress while it plays (timeupdate alone is too coarse for the waveform and the words).
  useEffect(() => {
    if (state !== "playing") return;
    let frame = 0;
    const tick = () => {
      const a = el.current;
      if (a) {
        const t = a.currentTime;
        const h = heard.current;
        if (h.last >= 0 && t > h.last && t - h.last < 1.5) h.seconds += (t - h.last) / (a.playbackRate || 1);
        h.last = t;
        if (Number.isFinite(a.duration) && a.duration > 0) h.furthest = Math.max(h.furthest, (t / a.duration) * 100);
        setAt(t);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  const total = dur > 0 ? dur : rec.seconds;
  const progress = total > 0 ? Math.min(1, at / total) : 0;

  const play = () => {
    const a = el.current;
    if (!a) return;
    a.playbackRate = speed;
    if (state === "idle" || state === "ended") send.current("play", { speed });
    if (state === "ended") a.currentTime = 0;
    void a.play().catch(() => {});
  };
  const toggle = () => (state === "playing" ? el.current?.pause() : play());
  const replay = () => {
    const a = el.current;
    if (!a) return;
    send.current("replay");
    a.currentTime = 0;
    a.playbackRate = speed;
    setAt(0);
    void a.play().catch(() => {});
  };
  const seek = (t: number) => {
    const a = el.current;
    if (!a || !(total > 0)) return;
    const to = Math.max(0, Math.min(total, t));
    a.currentTime = to;
    heard.current.last = to;
    setAt(to);
    if (state === "ended") setState("paused");
  };
  const seekAt = (clientX: number, box: DOMRect) => seek(((clientX - box.left) / box.width) * total);
  const nextSpeed = INTRO_AUDIO_SPEEDS[(INTRO_AUDIO_SPEEDS.indexOf(speed as (typeof INTRO_AUDIO_SPEEDS)[number]) + 1) % INTRO_AUDIO_SPEEDS.length];
  const changeSpeed = () => {
    writeSpeed(nextSpeed);
    send.current("speed", { speed: nextSpeed });
  };
  const words = rec.words;
  const speaking = follow && words && (state === "playing" || state === "paused") ? words.findIndex((w) => at >= w.start && at < w.end) : -1;
  const profile = rec.profile && rec.profile in VOICE_PROFILES ? VOICE_PROFILES[rec.profile as keyof typeof VOICE_PROFILES].name : null;
  const disclosure = rec.provider === "upload" ? "Recorded narration" : `Narrated by an AI voice${profile ? ` · ${profile}` : ""}`;
  const W = BARS * 4;

  return (
    <section
      data-player
      aria-label={label}
      className={cx("w-full max-w-2xl rounded-2xl border border-action/25 bg-tealtint/70 px-4 py-3.5 sm:px-5 sm:py-4", className ?? "mt-6")}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={toggle}
          disabled={state === "broken"}
          aria-label={state === "playing" ? "Pause the introduction" : `Play the introduction, ${formatSeconds(total)}`}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-action text-on-action shadow-sm transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
        >
          <Icon name={state === "playing" ? "pause" : "play"} className={cx("size-5", state !== "playing" && "ml-0.5")} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{label}</p>
            <p className="shrink-0 text-xs tabular-nums text-ink-muted" aria-hidden>
              {formatSeconds(at)} / {formatSeconds(total)}
            </p>
          </div>
          <div
            role="slider"
            tabIndex={state === "broken" ? -1 : 0}
            aria-label="Position in the introduction"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(at)}
            aria-valuetext={`${formatSeconds(at)} of ${formatSeconds(total)}`}
            onPointerDown={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              e.currentTarget.setPointerCapture(e.pointerId);
              seekAt(e.clientX, box);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX, e.currentTarget.getBoundingClientRect());
            }}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 }[e.key];
              if (step !== undefined) seek(at + step);
              else if (e.key === "Home") seek(0);
              else if (e.key === "End") seek(total - 0.1);
              else return;
              e.preventDefault();
            }}
            className="mt-1.5 block h-8 w-full cursor-pointer touch-none rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <svg viewBox={`0 0 ${W} 32`} preserveAspectRatio="none" className="size-full" aria-hidden focusable="false">
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width={W * progress} height="32" />
                </clipPath>
              </defs>
              {[0, 1].map((layer) => (
                <g key={layer} className={layer ? "fill-[var(--action)]" : "fill-[var(--line-strong)]"} clipPath={layer ? `url(#${clipId})` : undefined}>
                  {bars.map((h, i) => (
                    <rect key={i} x={i * 4 + 0.8} y={16 - h * 15} width="2.4" height={Math.max(1.5, h * 30)} rx="1.2" />
                  ))}
                </g>
              ))}
            </svg>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            <button
              type="button"
              onClick={changeSpeed}
              aria-label={`Speed ${speed}×. Change to ${nextSpeed}×`}
              className="min-h-9 min-w-12 rounded-full px-2.5 font-semibold tabular-nums text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            >
              {speed}×
            </button>
            <button
              type="button"
              onClick={replay}
              disabled={state === "broken"}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-semibold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
            >
              <Icon name="refresh" className="size-4" /> Replay
            </button>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={transcriptId}
              onClick={() => {
                setOpen((o) => !o);
                if (!open && !sentTranscript.current) {
                  sentTranscript.current = true;
                  send.current("transcript");
                }
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-semibold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            >
              <Icon name="doc" className="size-4" /> {open ? "Hide transcript" : "Transcript"}
            </button>
            <span className="ml-auto text-xs text-ink-muted">{disclosure}</span>
          </div>
        </div>
      </div>
      {state === "broken" && <p className="mt-3 text-sm font-semibold text-danger">This recording can’t be played here. The transcript has the same words.</p>}
      <div id={transcriptId} hidden={!open && state !== "broken"} className="mt-3 border-t border-action/20 pt-3">
        <p className="font-serif text-[1.05rem] leading-relaxed text-ink">
          {words && speaking >= 0 ? (
            <>
              {script.slice(0, words[speaking].from)}
              <mark className="rounded bg-action/20 text-inherit underline decoration-[var(--action)] decoration-2 underline-offset-4 motion-reduce:no-underline">
                {script.slice(words[speaking].from, words[speaking].to)}
              </mark>
              {script.slice(words[speaking].to)}
            </>
          ) : (
            script
          )}
        </p>
      </div>
      <audio
        ref={el}
        src={rec.src}
        preload="none"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
          e.currentTarget.playbackRate = speed;
        }}
        onPlay={() => {
          heard.current.last = el.current?.currentTime ?? 0;
          setState("playing");
        }}
        onPause={() => {
          setState((s) => (s === "ended" ? s : "paused"));
          flush();
        }}
        onEnded={() => {
          setState("ended");
          heard.current.furthest = 100;
          setAt(total);
          flush();
          send.current("complete");
        }}
        onError={() => setState("broken")}
      />
    </section>
  );
}
