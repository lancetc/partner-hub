"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { autoplayEnabled, STOP_AUDIO } from "@/lib/audioPrefs";
import { useOnePlayer } from "@/lib/onePlayer";
import { formatSeconds } from "@/lib/mediaStudio";
import { autoStartIntro, introSpokenText, portraitPosition, type IntroCard as IntroCardType, type IntroEventInput } from "@/lib/topicIntro";
import { Icon } from "../Icon";
import { CardVisual } from "./CardVisual";
import { RichText } from "../RichText";

/*
  A Topic's Introduction card (docs/topic-video-introductions.md): the opening screen of the Topic. The presenter fills
  the whole card, edge to edge (the approved video, or the placeholder portrait at its saved focal point), with a soft
  gradient under the Topic's title and a short description; the footer's "Let's get started" moves on.

  Sound starts when the card opens (the owner's override of PRD section 4, Topic introductions only): the video with its
  sound, or, without one, the introduction spoken in the Hub's narrator voice (/api/tts). Once per visit; it stops when the
  learner moves on, follows the card-audio switch, and keeps to one sound at a time (lib/onePlayer). When the browser
  won't start sound without a tap, the card says "Tap to listen". The transcript, and a video's captions, are always there.
*/

/** What the player needs to know when the learner moves on: whether the video was played, and how far. */
export type IntroWatch = { played: boolean; percent: number };

/** Sends one analytics event (ids and numbers only). Never holds anything up: a failure is simply not counted. */
export function sendIntroEvent(e: Omit<IntroEventInput, "key" | "at">) {
  try {
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined;
    fetch("/api/lessons/intro-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...e, key, at: new Date().toISOString() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics never gets in the way.
  }
}

type SoundState = "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "unavailable";

export function IntroCard({
  card,
  title,
  summary,
  headingRef,
  track,
  ttsKey,
  autoPlay = true,
  onWatch,
  onWatched,
  onStart,
}: {
  card: IntroCardType;
  /** The Topic's title and summary, shown when the card has no heading or description of its own. */
  title: string;
  summary: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  /** Where to count engagement; null in an author preview or a review. */
  track: { slug: string; version: string } | null;
  /** The card's narration key (`lesson:<slug>:<card>`) for its spoken introduction; without one the card is silent (the editor's preview). */
  ttsKey?: string;
  /** Start the sound when the card opens (off in the editor's preview). */
  autoPlay?: boolean;
  /** Whether the video has been played and how far, each time that changes. */
  onWatch?: (w: IntroWatch) => void;
  onWatched?: () => void;
  /** "Let's get started": on to the Topic's first content card (the player's own Continue). Absent in the editor's preview. */
  onStart?: () => void;
}) {
  useOnePlayer();
  const v = card.visual.kind === "presenter" ? card.visual : null;
  const video = v?.video?.src ? { ...v.video, src: v.video.src } : null;
  // A video in a provider's own player (YouTube, or a Synthesia share link): its player has its own button and captions.
  const embed = !video && v?.video && (v.video.provider === "youtube" || (v.video.provider === "synthesia" && v.video.id)) ? v : null;
  const media: "video" | "placeholder" = video || embed ? "video" : "placeholder";
  const picture = v?.photo ?? null;
  const heading = card.heading.trim() || title;
  const body = card.body.trim() || summary;
  const spoken = introSpokenText(card, { title, summary });
  // Without a video, the introduction is spoken: a recorded file when the card has one, otherwise the narrator.
  const speechSrc = !video && !embed ? (card.audioSrc ?? (ttsKey ? `/api/tts?key=${encodeURIComponent(ttsKey)}` : null)) : null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Waiting for the sound to start when the card opens with sound; otherwise ready to be tapped.
  const [state, setState] = useState<SoundState>(() => (autoPlay && (Boolean(v?.video?.src) || Boolean(card.audioSrc ?? ttsKey)) ? "loading" : "idle"));
  const [captions, setCaptions] = useState(true);
  const [transcript, setTranscript] = useState(false);
  const quartiles = useRef(new Set<number>());
  const ended = useRef(false);
  const seen = useRef<IntroWatch>({ played: false, percent: 0 });
  const report = (w: Partial<IntroWatch>) => {
    seen.current = { ...seen.current, ...w };
    onWatch?.(seen.current);
  };
  const el = (): HTMLMediaElement | null => videoRef.current ?? audioRef.current;
  const hasSound = Boolean(video || speechSrc);

  // Seen, and (on leaving) how long the card was open. Measured in an effect, never while drawing.
  useEffect(() => {
    if (!track) return;
    const started = performance.now();
    sendIntroEvent({ ...track, card: card.id, event: "view", media });
    return () => sendIntroEvent({ ...track, card: card.id, event: "leave", media, seconds: Math.round((performance.now() - started) / 100) / 10 });
  }, [track, card.id, media]);

  // Sound when the card opens, once per visit; it stops when the learner moves on.
  useEffect(() => {
    if (!autoPlay || !hasSound) return;
    const m = videoRef.current ?? audioRef.current;
    let live = true;
    autoStartIntro(m, autoplayEnabled()).then((r) => {
      // Only if nothing has started since (the learner may have tapped already).
      if (live && r !== "playing") setState((s) => (s === "loading" ? (r === "off" ? "idle" : "blocked") : s));
    });
    return () => {
      live = false;
      m?.pause();
    };
  }, [card.id, autoPlay, hasSound]);

  // The mute button stops it, like any other card audio.
  useEffect(() => {
    const stop = () => {
      videoRef.current?.pause();
      audioRef.current?.pause();
    };
    window.addEventListener(STOP_AUDIO, stop);
    return () => window.removeEventListener(STOP_AUDIO, stop);
  }, []);

  const count = (event: IntroEventInput["event"], extra?: { percent?: number; seconds?: number }) =>
    track && sendIntroEvent({ ...track, card: card.id, event, media, ...extra });

  // Captions follow the switch (the file's own track, drawn by the browser).
  const showCaptions = (on: boolean) => {
    const m = videoRef.current;
    if (!m) return;
    for (const t of Array.from(m.textTracks)) t.mode = on ? "showing" : "hidden";
  };
  const toggleCaptions = () => {
    const on = !captions;
    setCaptions(on);
    showCaptions(on);
    if (on) count("captions");
  };

  const play = () => {
    const m = el();
    if (!m) return;
    if (state === "ended") m.currentTime = 0;
    m.play().catch(() => setState("blocked"));
  };

  // Shared by the video and the spoken introduction.
  const events = {
    onPlay: () => {
      setState("playing");
      report({ played: true });
      count(ended.current ? "replay" : "play");
      ended.current = false;
    },
    onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => !e.currentTarget.ended && setState((s) => (s === "playing" ? "paused" : s)),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const m = e.currentTarget;
      if (!m.duration || !Number.isFinite(m.duration)) return;
      const pct = Math.min(100, Math.round((m.currentTime / m.duration) * 100));
      if (pct > seen.current.percent) report({ percent: pct });
      for (const q of [25, 50, 75])
        if (pct >= q && !quartiles.current.has(q)) {
          quartiles.current.add(q);
          count("progress", { percent: q, seconds: Math.round(m.currentTime) });
        }
    },
    onEnded: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      setState("ended");
      ended.current = true;
      report({ percent: 100 });
      quartiles.current.clear();
      count("complete", { percent: 100, seconds: Math.round(e.currentTarget.duration || 0) });
      onWatched?.();
    },
  };

  const pill = "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3.5 font-semibold backdrop-blur hover:bg-white/25";
  const videoPlaying = Boolean(video) && state === "playing";

  return (
    <div data-player className="relative isolate flex h-full min-h-[30rem] flex-col justify-end overflow-hidden bg-[#0b2230] text-white">
      {/* The presenter, full card and full bleed: the video (its poster until it plays), or the portrait at its focal point. */}
      {video ? (
        <video
          ref={videoRef}
          src={video.trim ? `${video.src}#t=${video.trim.start},${video.trim.end}` : video.src}
          poster={video.poster ?? picture?.src}
          preload="auto"
          playsInline
          aria-label={`${video.title}${v?.synthetic ? `, a synthetic presenter video` : ""}`}
          className="absolute inset-0 -z-20 size-full object-cover"
          style={{ objectPosition: `${video.cropX ?? 50}% 20%` }}
          {...events}
          onLoadedMetadata={() => showCaptions(captions)}
        >
          {video.captionsVtt && <track kind="captions" src={video.captionsVtt} srcLang="en" label="English" default />}
        </video>
      ) : embed ? (
        <div className="absolute inset-0 -z-20 bg-black">
          <CardVisual visual={embed} className="size-full" onComplete={onWatched} />
        </div>
      ) : picture ? (
        <Image
          src={picture.src}
          alt={v?.alt ?? ""}
          fill
          priority
          // Cropped to the whole card: a wide picture needs about its own width-to-height ratio times the card's height.
          sizes={picture.width > picture.height * 0.6 ? `${Math.ceil((picture.width / picture.height) * 90)}vh` : "(min-width: 640px) 38rem, 100vw"}
          className="-z-20 object-cover"
          style={{ objectPosition: portraitPosition(card) }}
        />
      ) : null}
      {speechSrc && (
        <audio ref={audioRef} src={speechSrc} preload="none" {...events} onError={() => setState("unavailable")} aria-label="The introduction, spoken" />
      )}

      {/* A soft gradient keeps the words readable, with a hint of Trilogy Care's teal at the top. */}
      {!embed && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#06141f]/95 via-[#06141f]/40 via-45% to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-[#00585e]/45 to-transparent" />
        </>
      )}

      {video && state !== "playing" && (
        <button
          type="button"
          onClick={play}
          aria-label={
            state === "ended" ? "Watch the introduction again" : `Play the introduction video${card.durationSec ? `, ${formatSeconds(card.durationSec)}` : ""}`
          }
          className={cx(
            "absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0b2230] shadow-xl ring-4 ring-white/30 backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white",
            state === "blocked" ? "inline-flex min-h-14 items-center gap-2 px-6 text-lg font-bold" : "grid size-20",
          )}
        >
          <Icon name={state === "ended" ? "refresh" : "play"} className={cx("translate-x-0.5", state === "blocked" ? "size-6" : "size-8")} />
          {state === "blocked" && "Tap to listen"}
        </button>
      )}

      <div className={cx("relative p-5 pb-6 transition-opacity duration-300 sm:p-7", videoPlaying && "pointer-events-none opacity-0")}>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-[#7fe0e4]">{card.label || "Introduction"}</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-balance font-serif text-[2.1rem] font-semibold leading-[1.08] tracking-tight outline-none [text-shadow:0_1px_12px_rgb(0_0_0/0.35)] sm:text-[2.4rem]"
        >
          {heading}
        </h2>
        {/* The description may carry emphasis or a link (an ALIS support note, say), as card text does. */}
        {body && <RichText text={body} className="mt-3 max-w-[34rem] text-lg leading-relaxed text-white/90 [&_a]:text-white [&_a]:underline" />}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {speechSrc && state !== "unavailable" && (
            <button
              type="button"
              onClick={() => (state === "playing" ? audioRef.current?.pause() : play())}
              className={cx(pill, state === "blocked" && "bg-white text-[#0b2230] hover:bg-white/90")}
            >
              <Icon name={state === "playing" ? "pause" : state === "ended" ? "refresh" : "volume"} className="size-4" />
              {state === "playing"
                ? "Pause"
                : state === "paused"
                  ? "Resume"
                  : state === "ended"
                    ? "Listen again"
                    : state === "loading"
                      ? "Loading…"
                      : "Tap to listen"}
            </button>
          )}
          {video?.captionsVtt && (
            <button type="button" aria-pressed={captions} onClick={toggleCaptions} className={pill}>
              <span aria-hidden className="rounded border border-current px-1 text-[0.65rem] font-extrabold leading-4">
                CC
              </span>{" "}
              {captions ? "Captions on" : "Captions off"}
            </button>
          )}
          {(video || speechSrc) && spoken && (
            <button type="button" aria-expanded={transcript} onClick={() => setTranscript((t) => !t)} className={pill}>
              <Icon name="doc" className="size-4" /> Transcript
            </button>
          )}
        </div>
        {transcript && (
          <p className="mt-3 rounded-2xl bg-black/45 p-3 text-[0.95rem] leading-relaxed backdrop-blur">{video ? card.transcript || spoken : spoken}</p>
        )}
        <button
          type="button"
          onClick={onStart}
          disabled={!onStart}
          className="fx-press mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-action px-6 text-lg font-semibold text-on-action shadow-lg hover:bg-action-hover disabled:cursor-default sm:w-auto"
        >
          Let’s get started <Icon name="arrow-right" className="size-5" />
        </button>
      </div>

      {videoPlaying && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 p-4">
          {video?.captionsVtt && (
            <button
              type="button"
              aria-pressed={captions}
              aria-label={captions ? "Turn captions off" : "Turn captions on"}
              onClick={toggleCaptions}
              className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/60"
            >
              <span aria-hidden className="rounded border border-current px-1 text-xs font-extrabold leading-4">
                CC
              </span>
            </button>
          )}
          <button
            type="button"
            aria-label="Pause the introduction"
            onClick={() => videoRef.current?.pause()}
            className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/60"
          >
            <Icon name="pause" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
