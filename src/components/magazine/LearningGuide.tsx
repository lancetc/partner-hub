"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx, formatDate } from "@/lib/format";
import type { GuideBlock } from "@/lib/magazine";
import { GUIDE_MODES, guideSeconds } from "@/lib/magazineGuide";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";
import "./guide.css";
import { AvaTransmission } from "../ava/AvaTransmission";

/*
  The AI Learning Guide, as learners meet it (docs/ai-learning-guide.md): a recorded, scripted segment in
  the "Warm Signal" frame. It always says what it is in real text (AI Learning Guide · Recorded), never
  plays by itself, and never looks live: no typing dots, no "online", no microphone.

  Three looks from one script: Transmission (the face, full frame), Guide inset (a smaller video beside its
  point) and Voice over context (the voice over a picture). The script can always be read instead, and when a
  recording isn't there (or isn't cleared to play) the script is shown as text, so the page still works.
*/

// A learner's own preferences for guide media, kept on this device.
const PREFS = { readFirst: "guide:read-first", captions: "guide:captions", intro: "guide:intro-seen" } as const;
const listeners = new Set<() => void>();
const readPref = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writePref = (key: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}
  listeners.forEach((l) => l());
};
const usePref = (key: string) =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readPref(key),
    () => false,
  );

/** Turns a video's captions on or off. */
function showCaptions(el: Element | null, on: boolean) {
  const track = el instanceof HTMLMediaElement ? el.textTracks[0] : undefined;
  if (track) track.mode = on ? "showing" : "hidden";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function Waveform({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden data-on={on} className={cx("guide-wave flex h-5 items-center gap-[3px]", className)}>
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 67) % 500}ms` }} />
      ))}
    </span>
  );
}

/** What it is, in words: on every presentation of the guide. */
function Identity({ name, voice, dark = true }: { name: string; voice?: boolean; dark?: boolean }) {
  return (
    <p
      className={cx(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mulish text-xs font-extrabold uppercase tracking-[0.12em]",
        dark ? "text-[#bfeeea]" : "text-accent",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[#3fc5c0]" />
      {voice ? "AI narration" : "AI video"} · Recorded
      {name && <span className={cx("font-sans text-xs font-semibold normal-case tracking-normal", dark ? "text-white/80" : "text-ink-muted")}>{name}</span>}
    </p>
  );
}

export function GuidePlayer({ block: b, ctx }: { block: GuideBlock; ctx: InteractiveContext }) {
  const m = b.media;
  const who = ctx.guide;
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended" | "broken">("idle");
  const [script, setScript] = useState(false);
  const [speed, setSpeed] = useState(1);
  const readFirst = usePref(PREFS.readFirst);
  const captionsOn = usePref(PREFS.captions);
  const introSeen = usePref(PREFS.intro);
  const started = useRef(false);
  const id = useId();
  const posKey = `guide:pos:${ctx.guideId}:${b.id}`;
  const voice = b.mode === "voice";
  const waiting = Boolean(b.after && !ctx.answers[b.after]);
  const showScript = script || state === "broken" || (readFirst && state === "idle");

  // Moving to another page hides this one rather than removing it: a hidden recording stops.
  useLayoutEffect(() => {
    const el = media.current;
    return () => el?.pause();
  }, [m?.src]);

  if (waiting)
    return (
      <p className="mx-auto w-full max-w-[42rem] rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
        The guide’s feedback appears here once you’ve answered the question above.
      </p>
    );

  const event = (outcome: "started" | "paused" | "completed" | "transcript" | "read_first" | "source") => ctx.guideEvent(b.id, outcome);
  const toggleScript = () => {
    if (!script) event("transcript");
    setScript((x) => !x);
  };
  const reviewed = b.reviewed ? `Content reviewed by ${b.reviewed.by} · ${formatDate(b.reviewed.on)}` : null;
  const details = (dark: boolean) =>
    (reviewed || b.source) && (
      <p className={cx("text-xs", dark ? "text-white/70" : "text-ink-muted")}>
        {reviewed}
        {reviewed && b.source ? " · " : ""}
        {b.source &&
          (b.source.href ? (
            <a
              href={b.source.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => event("source")}
              className={cx("font-semibold underline-offset-2 hover:underline", dark ? "text-[#bfeeea]" : "text-accent")}
            >
              Source: {b.source.label}
            </a>
          ) : (
            <span>Source: {b.source.label}</span>
          ))}
      </p>
    );
  const transcript = (
    <div id={`${id}-script`} className="rounded-2xl bg-surface p-4 text-ink ring-1 ring-line">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">The script, as spoken</p>
      <p className="mt-1 whitespace-pre-line leading-relaxed">{b.script}</p>
    </div>
  );

  // No recording to play (not made yet, not cleared, or withdrawn): the script as text, labelled for what it is.
  if (!m)
    return (
      <div className="mx-auto w-full max-w-[42rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-6">
        <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          <span aria-hidden className="size-1.5 rounded-full bg-action" /> AI guide · Script
          {who.name ? <span className="font-sans font-semibold normal-case tracking-normal text-ink-muted">{who.name}</span> : null}
        </p>
        {b.screenText && <p className="mt-2 font-serif text-xl font-semibold leading-snug">{b.screenText}</p>}
        <p className="mt-2 whitespace-pre-line leading-relaxed">{b.script}</p>
        <div className="mt-3">{details(false)}</div>
      </div>
    );

  const handlers = {
    onPlay: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      // A recording that failed to load stays failed: the script is what they have.
      if (e.currentTarget.error) return setState("broken");
      // Captions follow the learner's preference.
      showCaptions(e.currentTarget, captionsOn);
      setState("playing");
      if (!introSeen) writePref(PREFS.intro, true);
      if (!started.current) {
        started.current = true;
        event("started");
      }
    },
    onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (e.currentTarget.error) return setState("broken");
      if (e.currentTarget.ended) return;
      setState("paused");
      event("paused");
      try {
        sessionStorage.setItem(posKey, String(e.currentTarget.currentTime));
      } catch {}
    },
    onEnded: () => {
      setState("ended");
      event("completed");
      try {
        sessionStorage.removeItem(posKey);
      } catch {}
    },
    onError: () => setState("broken"),
    // Back where they left it, if they've been here this session.
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      try {
        const at = Number(sessionStorage.getItem(posKey));
        if (at > 1 && at < e.currentTarget.duration - 1) e.currentTarget.currentTime = at;
      } catch {}
    },
  };
  const play = () => void media.current?.play().catch(() => setState("broken"));
  const replay = () => {
    const el = media.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => setState("broken"));
  };
  const seconds = m.seconds ?? guideSeconds(b.script);
  const label = `${voice ? "AI narration" : "AI video"}${who.name ? `, ${who.name}` : ""}: recorded, ${clock(seconds)}`;

  const controls = (dark: boolean) => (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm", dark ? "text-white" : "text-ink")}>
      {(state === "ended" || state === "paused") && (
        <button
          type="button"
          onClick={replay}
          className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold", dark ? "hover:bg-white/10" : "hover:bg-muted")}
        >
          <Icon name="refresh" className="size-4" /> Replay
        </button>
      )}
      <button
        type="button"
        aria-expanded={showScript}
        aria-controls={`${id}-script`}
        onClick={toggleScript}
        className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold", dark ? "hover:bg-white/10" : "hover:bg-muted")}
      >
        <Icon name="doc" className="size-4" /> {showScript ? "Hide the script" : "Read the script"}
      </button>
      {m.kind === "video" && m.captions && (
        <button
          type="button"
          aria-pressed={captionsOn}
          onClick={() => {
            showCaptions(document.getElementById(`${id}-media`), !captionsOn);
            writePref(PREFS.captions, !captionsOn);
          }}
          className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold", dark ? "hover:bg-white/10" : "hover:bg-muted")}
        >
          Captions: {captionsOn ? "on" : "off"}
        </button>
      )}
      <label className="inline-flex min-h-9 items-center gap-1.5 font-semibold">
        Speed
        <select
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            if (media.current) media.current.playbackRate = v;
          }}
          className={cx(
            "min-h-9 rounded-full border px-2",
            dark ? "border-white/30 bg-transparent text-white [&>option]:text-ink" : "border-line-strong bg-surface",
          )}
        >
          {[0.75, 1, 1.25, 1.5].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      <label className="ml-auto inline-flex min-h-9 items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-action)]"
          checked={readFirst}
          onChange={(e) => {
            writePref(PREFS.readFirst, e.target.checked);
            if (e.target.checked) event("read_first");
          }}
        />
        Show me the script first
      </label>
    </div>
  );
  const broken = state === "broken" && (
    <p role="alert" className="rounded-2xl bg-[#fdf1f0] px-3 py-2 text-sm font-semibold text-[#a12d31]">
      The recording couldn’t be played. Everything it says is in the script below.
    </p>
  );
  // The first time they meet the guide: who (and what) it is.
  const intro = !introSeen && state === "idle" && (
    <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">
      <span className="min-w-0 flex-1">{who.intro}</span>
      <button
        type="button"
        onClick={() => writePref(PREFS.intro, true)}
        className="min-h-9 rounded-full border border-white/40 px-3 font-semibold hover:bg-white/10"
      >
        Got it
      </button>
    </p>
  );

  if (voice)
    return (
      <figure className="mx-auto flex w-full max-w-[42rem] flex-col gap-3">
        {b.context?.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.context.src} alt={b.context.decorative ? "" : b.context.alt} loading="lazy" className="w-full rounded-2xl bg-muted" />
        )}
        <div className="guide-frame flex flex-col gap-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Identity name={who.name} voice />
            <Waveform on={state === "playing"} className="ml-auto" />
          </div>
          {intro}
          {b.screenText && <p className="font-serif text-lg font-semibold leading-snug text-white">{b.screenText}</p>}
          <audio ref={media} src={m.src} preload="none" controls aria-label={label} className="w-full" {...handlers} />
          {controls(true)}
          {details(true)}
        </div>
        {broken}
        {showScript && transcript}
      </figure>
    );

  // Transmission: Ava's window (Ava 2.0). The recording arrives as a transmission and, once it ends, gives way to its poster.
  if (b.mode === "transmission" && m.kind === "video")
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        {intro && <div className="guide-frame rounded-2xl p-3">{intro}</div>}
        <AvaTransmission
          layout="block"
          media={{ kind: "video", src: m.src, poster: m.poster ?? null, captions: m.captions ?? null }}
          portrait={m.poster ?? who.portrait}
          name={who.name || "Ava"}
          script={b.script}
          title={b.screenText || label}
          afterEnd="poster"
          caseLabel={b.caseLabel}
          onEvent={(e) => {
            if (e === "started" && !introSeen) writePref(PREFS.intro, true);
            event(e);
          }}
        />
        {b.screenText && <p className="font-serif text-2xl font-semibold leading-snug">{b.screenText}</p>}
        {details(false)}
      </div>
    );

  const inset = b.mode === "inset";
  const screen = (
    <div className={cx("guide-screen relative overflow-hidden rounded-2xl bg-black", inset ? "aspect-[4/3]" : "aspect-video")}>
      <video
        ref={media}
        id={`${id}-media`}
        src={state === "idle" ? undefined : m.src}
        poster={m.poster ?? who.portrait ?? undefined}
        preload="none"
        playsInline
        controls={state !== "idle"}
        aria-label={label}
        className="absolute inset-0 size-full object-cover object-[center_20%]"
        {...handlers}
      >
        {m.captions && <track kind="captions" src={m.captions} srcLang="en" label="English" default={captionsOn} />}
      </video>
      {state === "idle" && (
        // Never plays by itself: a poster and one clear control.
        <button
          type="button"
          onClick={() => {
            setState("paused");
            // The source is attached on the first press, so nothing loads until asked for.
            requestAnimationFrame(play);
          }}
          aria-label={`Play: ${label}`}
          className="group absolute inset-0 grid place-items-center bg-[#0a1a2e]/25"
        >
          <span className="grid size-16 place-items-center rounded-full bg-action text-on-action shadow-xl ring-4 ring-white/30 transition-transform group-hover:scale-105 motion-reduce:transition-none">
            <Icon name="play" className="size-7" />
          </span>
        </button>
      )}
      {b.caseLabel && state === "idle" && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-mulish text-xs font-bold text-white">
          {b.caseLabel}
        </span>
      )}
    </div>
  );

  return (
    <div className={cx("mx-auto w-full", inset ? "max-w-[42rem]" : "max-w-5xl")}>
      <div
        className={cx(
          "guide-frame guide-connect flex flex-col gap-3 rounded-3xl p-4 sm:p-5",
          inset && "sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-start sm:gap-5",
        )}
      >
        {inset ? (
          <>
            {screen}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Identity name={who.name} />
                <Waveform on={state === "playing"} className="ml-auto" />
              </div>
              {intro}
              {b.screenText && <p className="font-serif text-xl font-semibold leading-snug text-white">{b.screenText}</p>}
              {controls(true)}
              {details(true)}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Identity name={who.name} />
              <Waveform on={state === "playing"} className="ml-auto" />
            </div>
            {intro}
            {screen}
            {b.screenText && <p className="font-serif text-2xl font-semibold leading-snug text-white">{b.screenText}</p>}
            {controls(true)}
            {details(true)}
          </>
        )}
      </div>
      {(broken || showScript) && (
        <div className="mt-3 flex flex-col gap-3">
          {broken}
          {showScript && transcript}
        </div>
      )}
    </div>
  );
}

/** For the editor's preview and anywhere else that lists the modes. */
export const guideModeLabel = (mode: GuideBlock["mode"]) => GUIDE_MODES[mode].label;
