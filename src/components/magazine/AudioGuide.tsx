"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/format";
import { STOP_AUDIO, useFollowWords } from "@/lib/audioPrefs";
import { formatSeconds, playable } from "@/lib/magazineNarration";
import type { GuideAudio, Narration } from "@/lib/magazine";
import { Icon } from "../Icon";

/*
  The Audio Guide card (docs/magazine-audio-guide.md): a short spoken introduction at the top of the
  course and of each page. The words are always on the card, so nobody misses anything without sound.
  It never plays by itself unless the learner has turned the Audio Guide on; then it plays as they arrive
  on a page they haven't finished. Pause, replay and mute are always there, and a video starting pauses it.
*/

const MUTE_KEY = "tc-audio-guide-muted";
const readMuted = () => {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};
const muteListeners = new Set<() => void>();
function setMutedFor(on: boolean) {
  try {
    sessionStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {}
  muteListeners.forEach((l) => l());
}
/** Mute lasts for this tab, across the course's pages. */
const useMuted = () =>
  useSyncExternalStore(
    (cb) => {
      muteListeners.add(cb);
      return () => muteListeners.delete(cb);
    },
    readMuted,
    () => false,
  );

/** The Audio Guide On/Off switch for the course. Shown only when the author offers automatic playback. */
export function AudioGuideSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
        on ? "border-action bg-action text-on-action" : "border-line-strong bg-surface hover:bg-muted",
      )}
    >
      <Icon name="volume" className="size-4" /> Voiced introductions: {on ? "On" : "Off"}
    </button>
  );
}

export function AudioGuideCard({
  narration,
  audio,
  level,
  autoplay,
  onEvent,
  variant = "card",
  toggle,
}: {
  narration: Narration | undefined;
  audio: GuideAudio | undefined;
  level: "course" | "page";
  /** "inline": a small control beside the reading time (the words open on request), instead of the card. */
  variant?: "card" | "inline";
  /** The Audio guide On/Off switch, shown with the inline control when the author offers it. */
  toggle?: { on: boolean; onChange: (on: boolean) => void };
  /** Play as the learner arrives (they turned the Audio Guide on, and haven't finished this page). */
  autoplay: boolean;
  onEvent: (outcome: "started" | "finished") => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended" | "broken">("idle");
  const [showWords, setShowWords] = useState(false);
  const muted = useMuted();
  const [at, setAt] = useState(0);
  const follow = useFollowWords();
  const sent = useRef(new Set<string>());
  const ok = audio && playable(narration, audio) ? narration : null;
  const src = ok?.audio.src;

  // Arriving with the Audio Guide on: play once. A browser that wants a click first just shows Play.
  useEffect(() => {
    const el = player.current;
    if (!el || !src || !autoplay || readMuted()) return;
    el.play().catch(() => {});
  }, [src, autoplay]);

  // Moving to another page hides this one rather than removing it (Next keeps it for coming back), and a
  // hidden player would carry on talking: it stops as the page is hidden.
  useLayoutEffect(() => {
    const el = player.current;
    return () => el?.pause();
  }, [src]);

  // A video starting, or the player's own stop, pauses the guide.
  useEffect(() => {
    const pauseForOthers = (e: Event) => {
      if (e.target instanceof HTMLMediaElement && e.target !== player.current) player.current?.pause();
    };
    const stop = () => player.current?.pause();
    document.addEventListener("play", pauseForOthers, true);
    window.addEventListener(STOP_AUDIO, stop);
    return () => {
      document.removeEventListener("play", pauseForOthers, true);
      window.removeEventListener(STOP_AUDIO, stop);
    };
  }, []);

  // While it plays, follow the words closely (timeupdate alone is too coarse to highlight by).
  useEffect(() => {
    if (state !== "playing" || !follow) return;
    let frame = 0;
    const tick = () => {
      setAt(player.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, follow]);

  if (!ok) return null;
  const n = ok.audio;
  const mark = (outcome: "started" | "finished") => {
    if (sent.current.has(outcome)) return;
    sent.current.add(outcome);
    onEvent(outcome);
  };
  const toggle_ = () => {
    const el = player.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  const replay = () => {
    const el = player.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  };
  const flipMute = () => {
    setMutedFor(!muted);
    if (!muted) player.current?.pause();
  };
  const what = level === "course" ? "course introduction" : "page introduction";
  const words = n.words;
  const speaking = follow && state === "playing" && words ? words.findIndex((w) => at >= w.start && at < w.end) : -1;

  const player_ = (
    <audio
      ref={player}
      src={n.src}
      preload="none"
      muted={muted}
      onPlay={() => {
        setState("playing");
        mark("started");
      }}
      onPause={() => setState((s) => (s === "ended" ? s : "paused"))}
      // A recording that can't be played: say so, and leave the words.
      onError={() => setState("broken")}
      onEnded={() => {
        setState("ended");
        setAt(0);
        mark("finished");
      }}
    />
  );

  // Beside the reading time: the switch, Play or Pause with the length, and the words on request.
  if (variant === "inline")
    return (
      <span className="relative inline-flex flex-wrap items-center gap-2">
        {toggle && <AudioGuideSwitch on={toggle.on} onChange={toggle.onChange} />}
        {state === "broken" ? (
          <span className="text-sm font-semibold text-danger">The recording can’t be played here.</span>
        ) : (
          <button
            type="button"
            onClick={toggle_}
            aria-label={`${state === "playing" ? "Pause" : "Play"} the ${what}, ${Math.round(n.seconds)} seconds`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-action/50 bg-surface px-3 text-sm font-semibold text-accent hover:bg-tealtint"
          >
            <Icon name={state === "playing" ? "pause" : "play"} className="size-3.5" /> {state === "playing" ? "Pause" : "Introduction"} ·{" "}
            {formatSeconds(n.seconds)}
          </button>
        )}
        <button
          type="button"
          aria-expanded={showWords}
          onClick={() => setShowWords((x) => !x)}
          className="min-h-10 rounded-full px-2 text-sm font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {showWords ? "Hide words" : "Words"}
        </button>
        {showWords && (
          // The words, for anyone who can't or won't listen.
          <span className="absolute left-0 top-full z-40 mt-2 block w-[min(30rem,85vw)] rounded-2xl bg-surface p-4 font-serif text-base leading-relaxed text-ink shadow-xl ring-1 ring-line">
            “{ok.script}”
          </span>
        )}
        {player_}
      </span>
    );

  return (
    <aside
      aria-label={`Your voiced introduction: ${what}`}
      className={cx("mx-auto w-full max-w-[42rem] rounded-3xl border border-[#b7dede] bg-tealtint p-5 sm:p-6", "mag-reveal")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
          <Icon name="volume" className="size-4" /> Your voiced introduction
        </p>
        <p className="text-xs text-ink-muted">
          {level === "course" ? "Course introduction" : "Page introduction"} · {formatSeconds(n.seconds)}
        </p>
      </div>
      {state === "broken" && <p className="mt-3 text-sm font-semibold text-danger">This recording can’t be played here. The words are below.</p>}
      <div className={cx("mt-3 flex flex-wrap items-center gap-2", state === "broken" && "hidden")}>
        <button
          type="button"
          onClick={toggle_}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90"
          aria-label={`${state === "playing" ? "Pause" : "Play"} the ${what}, ${Math.round(n.seconds)} seconds`}
        >
          <Icon name={state === "playing" ? "pause" : "play"} className="size-4" /> {state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Play"}
        </button>
        {(state === "paused" || state === "ended") && (
          <button
            type="button"
            onClick={replay}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-muted"
          >
            <Icon name="refresh" className="size-4" /> Replay
          </button>
        )}
        <button
          type="button"
          onClick={flipMute}
          aria-pressed={muted}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-muted"
        >
          <Icon name={muted ? "volume-off" : "volume"} className="size-4" /> {muted ? "Unmute" : "Mute"}
        </button>
      </div>
      {player_}
      {/* The words, always: nothing here is only heard. The word being spoken is marked as it plays. */}
      <blockquote className="mt-4 font-serif text-lg leading-relaxed">
        “
        {words && speaking >= 0 ? (
          <>
            {ok.script.slice(0, words[speaking].from)}
            <mark className="rounded bg-action/20 text-inherit underline decoration-action decoration-2 underline-offset-4">
              {ok.script.slice(words[speaking].from, words[speaking].to)}
            </mark>
            {ok.script.slice(words[speaking].to)}
          </>
        ) : (
          ok.script
        )}
        ”
      </blockquote>
      <p className="mt-3 flex items-center gap-1 text-sm text-ink-muted">
        <Icon name="arrow-down" className="size-4" /> {level === "course" ? "Start the course below" : "Continue reading below"}
      </p>
    </aside>
  );
}
