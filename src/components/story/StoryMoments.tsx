"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { MOMENT_KINDS, TX, txNext, txTimer, type HistoryItem, type PlacedMoment, type StoryEvent, type TxEvent, type TxState } from "@/lib/story";
import type { CharacterHistory } from "@/server/story";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { Icon } from "../Icon";

/*
  Story moments, as a learner meets them in a Topic or a Magazine page (docs/story-plans.md). One contract, three
  presentations: a short inline moment (new information, a person's response, a debrief), a modest "Check in
  with…" cue that opens an update with a few authored questions and the character's story so far, and the
  opening transmission with its end sequence.

  Nothing here plays by itself, every word spoken is also on the page, and none of it counts as an attempt or a
  completion. The people are fictional, and every surface says so.
*/

const loads = new Map<string, Promise<PlacedMoment[]>>();
/** The approved moments placed in one Topic or course, fetched once per page. */
export function useStory(kind: "topic" | "guide", ref: string | null | undefined) {
  const [moments, setMoments] = useState<PlacedMoment[]>([]);
  useEffect(() => {
    if (!ref) return;
    const key = `${kind}:${ref}`;
    if (!loads.has(key))
      loads.set(
        key,
        api<{ moments: PlacedMoment[] }>(`/api/story?${kind}=${encodeURIComponent(ref)}`).then(
          (r) => r.moments,
          () => [],
        ),
      );
    let live = true;
    void loads.get(key)!.then((m) => live && setMoments(m));
    return () => {
      live = false;
    };
  }, [kind, ref]);
  return moments;
}

let n = 0;
/** Engagement only. If it can't be sent, nothing the learner is doing depends on it. */
function send(event: StoryEvent, m: PlacedMoment, detail = "") {
  if (m.preview) return;
  n += 1;
  void api("/api/story", {
    body: { event, placementId: m.placementId, detail, at: new Date().toISOString(), key: `${m.placementId}-${event}-${Date.now().toString(36)}-${n}` },
  }).catch(() => undefined);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Play, pause and replay for one approved recording. The words it speaks are always beside it. */
function Clip({ src, label, onPlay }: { src: string; label: string; onPlay?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "failed">("idle");
  if (state === "failed") return <p className="text-sm text-ink-muted">The recording isn’t available just now. The words are all here.</p>;
  return (
    <span className="inline-flex items-center gap-1">
      <audio ref={audio} src={src} preload="none" onEnded={() => setState("idle")} onError={() => setState("failed")} />
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold hover:bg-muted"
        aria-label={state === "playing" ? `Pause: ${label}` : `Listen: ${label}`}
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (state === "playing") {
            a.pause();
            setState("paused");
          } else {
            if (state === "idle") onPlay?.();
            a.play().then(
              () => setState("playing"),
              () => setState("failed"),
            );
          }
        }}
      >
        <Icon name={state === "playing" ? "pause" : "volume"} className="size-4" /> {state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Listen"}
      </button>
      {state !== "idle" && (
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink"
          onClick={() => {
            const a = audio.current;
            if (!a) return;
            a.currentTime = 0;
            a.play().then(
              () => setState("playing"),
              () => setState("failed"),
            );
          }}
        >
          <Icon name="refresh" className="size-4" /> Replay
        </button>
      )}
    </span>
  );
}

function Speaker({ m, label }: { m: PlacedMoment; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <CharacterPortrait name={m.speaker.name} size="sm" />
      <div className="min-w-0">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{label}</p>
        <p className="font-semibold leading-tight">{m.speaker.name}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The character's story so far
// ---------------------------------------------------------------------------------------------

function Appearance({ i, m }: { i: HistoryItem; m: PlacedMoment }) {
  return (
    <li className="rounded-2xl border border-line p-3">
      <p className="text-xs font-semibold text-ink-muted">
        {i.whenLabel ? `${i.whenLabel} · ` : ""}
        {i.format}
      </p>
      <p className="mt-0.5 font-semibold">{i.title}</p>
      {i.summary && <p className="mt-0.5 text-sm text-ink-muted">{i.summary}</p>}
      {i.href && (
        <Link
          href={i.href}
          className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2"
          onClick={() => send("story_appearance_link_followed", m, i.id)}
        >
          Open <Icon name="arrow-right" className="size-3.5" />
        </Link>
      )}
    </li>
  );
}

/** Who the person is and what's happened up to this point in the story. Later appearances stay behind one button. */
export function StoryHistory({ m }: { m: PlacedMoment }) {
  const [h, setH] = useState<CharacterHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const load = (later: boolean) =>
    api<CharacterHistory>(
      `/api/story?character=${encodeURIComponent(m.speaker.id)}&placement=${encodeURIComponent(m.placementId)}${later ? "&later=1" : ""}`,
    ).then(setH, () => setFailed(true));
  useEffect(() => {
    void load(false);
    // Once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (failed) return <p className="text-sm text-ink-muted">{m.speaker.name}’s story isn’t available just now.</p>;
  if (!h) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-muted p-3 text-sm">
        <p className="font-semibold">
          {h.character.name} · {h.character.fictional}
        </p>
        <p className="mt-1">{h.character.summary}</p>
        {h.character.matters && <p className="mt-1 text-ink-muted">What matters to them: {h.character.matters}</p>}
      </div>
      {h.upTo.length ? (
        <ol className="flex flex-col gap-2" aria-label={`${h.character.name}’s story so far`}>
          {h.upTo.map((i) => (
            <Appearance key={i.id} i={i} m={m} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">This is the first time {h.character.name} appears in something you can open.</p>
      )}
      {h.laterCount > 0 && !h.later.length && (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-muted"
          onClick={() => load(true)}
        >
          <Icon name="eye" className="size-4" /> Show later appearances ({h.laterCount}): this tells you what happens next
        </button>
      )}
      {h.later.length > 0 && (
        <>
          <p className="text-sm font-semibold">Later in {h.character.name}’s story</p>
          <ol className="flex flex-col gap-2">
            {h.later.map((i) => (
              <Appearance key={i.id} i={i} m={m} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Check in with…
// ---------------------------------------------------------------------------------------------

/** A modest cue. Opening it is optional, changes nothing about the course, and closes back to the same place. */
export function CheckIn({ m }: { m: PlacedMoment }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const [story, setStory] = useState(false);
  const name = m.speaker.name;
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const answer = m.questions.find((q) => q.id === asked);

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line-strong bg-surface py-1 pl-1.5 pr-4 text-sm font-semibold hover:bg-muted"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
          send("story_check_in_opened", m);
        }}
      >
        <CharacterPortrait name={name} size="sm" className="size-8" />
        <Icon name="chat" className="size-4 text-accent" /> Check in with {name}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`checkin-${m.placementId}`}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-[rgb(10_26_46/0.55)]"
      >
        {open && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <CharacterPortrait name={name} size="md" />
              <div className="min-w-0 flex-1">
                <h2 id={`checkin-${m.placementId}`} className="font-serif text-2xl font-semibold leading-tight">
                  Check in with {name}
                </h2>
                <p className="text-sm text-ink-muted">A fictional character in a learning story. This isn’t a real person or a live record.</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                onClick={close}
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>

            <section aria-label="Update" className="rounded-2xl bg-tealtint p-4">
              {m.whenLabel && <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{m.whenLabel}</p>}
              <p className="mt-1 whitespace-pre-line text-[1.02rem] leading-relaxed">{m.script}</p>
              {m.audio.script && (
                <div className="mt-2">
                  <Clip src={m.audio.script} label={`${name}’s update`} onPlay={() => send("story_audio_play_started", m, "update")} />
                </div>
              )}
            </section>

            {m.questions.length > 0 && (
              <section aria-label={`Ask ${name}`}>
                <h3 className="font-semibold">Ask {name}</h3>
                <div className="mt-2 flex flex-col gap-2">
                  {m.questions.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      aria-expanded={asked === q.id}
                      className={cx(
                        "flex min-h-11 items-center justify-between gap-2 rounded-2xl border px-4 py-2 text-left font-medium",
                        asked === q.id ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted",
                      )}
                      onClick={() => {
                        setAsked(asked === q.id ? null : q.id);
                        if (asked !== q.id) send("story_question_selected", m, q.id);
                      }}
                    >
                      {q.label}
                      <Icon
                        name="chevron-down"
                        className={cx("size-4 shrink-0 transition-transform motion-reduce:transition-none", asked === q.id && "rotate-180")}
                      />
                    </button>
                  ))}
                </div>
                <div aria-live="polite">
                  {answer && (
                    <div className="mt-2 rounded-2xl border border-line p-4">
                      <p className="text-sm font-semibold text-ink-muted">{name} says</p>
                      <p className="mt-1 whitespace-pre-line leading-relaxed">{answer.answer}</p>
                      {m.audio.answers[answer.id] && (
                        <div className="mt-2">
                          <Clip
                            key={answer.id}
                            src={m.audio.answers[answer.id]}
                            label={answer.label}
                            onPlay={() => send("story_audio_play_started", m, answer.id)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section aria-label={`${name}’s story`}>
              <button
                type="button"
                aria-expanded={story}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
                onClick={() => {
                  if (!story) send("story_history_opened", m);
                  setStory(!story);
                }}
              >
                <Icon name="book" className="size-4" /> {story ? `Hide ${name}’s story` : `View ${name}’s story`}
              </button>
              {story && (
                <div className="mt-3">
                  <StoryHistory m={m} />
                </div>
              )}
            </section>
          </div>
        )}
      </dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Short return moments
// ---------------------------------------------------------------------------------------------

const RETURN_LABEL: Record<string, string> = { new_information: "New information", person_response: "In their own words", debrief: "Debrief" };

/** New information, a person's response or a debrief: a few approved lines, with a recording if there is one. No stage, no wait. */
export function ReturnMoment({ m }: { m: PlacedMoment }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    send("story_moment_shown", m, m.kind);
  }, [m]);
  return (
    <aside aria-label={`${MOMENT_KINDS[m.kind]}: ${m.speaker.name}`} className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <Speaker m={m} label={RETURN_LABEL[m.kind] ?? MOMENT_KINDS[m.kind]} />
      <p className="mt-3 whitespace-pre-line text-[1.05rem] leading-relaxed">{m.script}</p>
      {m.hypothetical && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" /> One way {m.speaker.name} might respond, in this practice story. It isn’t part of{" "}
          {m.speaker.name}’s shared story.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {m.audio.script && (
          <Clip
            src={m.audio.script}
            label={`${m.speaker.name}, ${MOMENT_KINDS[m.kind].toLowerCase()}`}
            onPlay={() => send("story_audio_play_started", m, m.kind)}
          />
        )}
        {m.nextAction && (
          <p className="text-sm font-semibold">
            <span className="text-ink-muted">Next: </span>
            {m.nextAction}
          </p>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------
// The opening transmission
// ---------------------------------------------------------------------------------------------

/**
  The opener: static, the video, one pulse of interference over its last frame, the frame gone, a three-second empty
  stage, then the still poster and Begin. One controller (txNext) owns every step, each timed state is a single
  timer cleared when the state changes or the page goes, and a learner can skip at any point. With reduced motion,
  or with no video, there's no static, flash or wait: the words, the poster and Begin.
*/
export function Transmission({ m, onBegin }: { m: PlacedMoment; onBegin?: () => void }) {
  const [reduced] = useState(reducedMotion);
  const [state, dispatch] = useReducer((s: TxState, e: TxEvent) => txNext(s, e, reduced), "ready");
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLCanvasElement>(null);
  const begun = useRef(false);
  const last = useRef<TxState>("ready");
  const v = m.video;
  const name = m.speaker.name;

  // Each timed state ends once, and its timer goes with it.
  useEffect(() => {
    const t = txTimer(state);
    if (!t) return;
    const id = window.setTimeout(() => dispatch(t.event), t.ms);
    return () => window.clearTimeout(id);
  }, [state]);

  // Coming back to the tab part-way through the ending settles on the poster instead of revealing late.
  useEffect(() => {
    const settle = () => document.hidden && dispatch("settle");
    document.addEventListener("visibilitychange", settle);
    return () => document.removeEventListener("visibilitychange", settle);
  }, []);

  useEffect(() => {
    const was = last.current;
    last.current = state;
    const el = video.current;
    if (state === "playing" && was !== "playing" && el) {
      el.currentTime = 0;
      el.play().catch(() => dispatch("fail"));
    }
    if (state !== "playing" && state !== "static" && el && !el.paused) el.pause();
    if (state === "flash" && was === "playing") send("ava_transmission_ended", m);
    if (state === "poster" && was !== "poster") send("ava_poster_shown", m);
    if (state === "begun" && !begun.current) {
      begun.current = true;
      onBegin?.();
    }
  }, [state, m, onBegin]);

  /** Keeps a copy of the picture as it plays, so the ending never relies on the player holding its last frame. */
  const keepFrame = () => {
    const el = video.current;
    const c = frame.current;
    if (!el || !c || !el.videoWidth) return;
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    try {
      c.getContext("2d")?.drawImage(el, 0, 0, c.width, c.height);
    } catch {
      // The poster stands in if the frame can't be copied.
    }
  };
  const play = () => {
    send("ava_transmission_started", m);
    // Sound has to start from the learner's own press: wake the player now, then start it after the static.
    const el = video.current;
    if (el && !reduced)
      void el.play().then(
        () => el.pause(),
        () => undefined,
      );
    dispatch("play");
  };
  const skip = () => {
    if (state !== "begun") send("ava_transmission_skipped", m, state);
    dispatch("skip");
  };
  const showFrame = state === "flash" || state === "hiding";
  const stage = "relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0b1a2e]";

  return (
    <section aria-label={`A transmission from ${name}`} className="rounded-3xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Speaker m={m} label="Transmission" />
        <p className="text-right text-xs text-ink-muted">
          {name} is a fictional character.
          {m.featured ? ` So is ${m.featured.name}.` : ""}
        </p>
      </div>

      {v ? (
        <div className={stage} data-tx={state}>
          <video
            ref={video}
            src={v.src}
            playsInline
            controls={state === "playing"}
            preload="metadata"
            onTimeUpdate={keepFrame}
            onEnded={() => {
              keepFrame();
              dispatch("ended");
            }}
            onError={() => state !== "ready" && dispatch("fail")}
            className={cx("absolute inset-0 size-full object-cover", state !== "playing" && "invisible")}
          >
            {v.captions && <track kind="captions" src={v.captions} srcLang="en" label="English" default />}
          </video>
          {/* The last frame, or the approved end-frame still, under one pulse of interference; then it fades away. */}
          {v.endFrame ? (
            // eslint-disable-next-line @next/next/no-img-element -- a library picture, shown as it is
            <img
              src={v.endFrame}
              alt=""
              aria-hidden
              className={cx("absolute inset-0 size-full object-cover", !showFrame && "hidden")}
              style={{ opacity: state === "hiding" ? 0 : 1, transition: `opacity ${TX.fadeOut}ms linear` }}
            />
          ) : (
            <canvas
              ref={frame}
              aria-hidden
              className={cx("absolute inset-0 size-full object-cover", !showFrame && "hidden")}
              style={{ opacity: state === "hiding" ? 0 : 1, transition: `opacity ${TX.fadeOut}ms linear` }}
            />
          )}
          {(state === "static" || state === "flash") && <div aria-hidden className="story-static absolute inset-0" />}
          {(state === "ready" || state === "poster" || state === "begun") && v.poster && (
            // eslint-disable-next-line @next/next/no-img-element -- a library picture, shown as it is
            <img
              src={v.poster}
              alt={`${name}, in a still from the transmission`}
              className={cx("absolute inset-0 size-full object-cover", state === "ready" && "opacity-70", state === "poster" && !reduced && "story-poster-in")}
            />
          )}
          {state === "ready" && (
            <button
              type="button"
              onClick={play}
              className="absolute inset-0 m-auto flex h-14 w-fit items-center gap-2 rounded-full bg-action px-6 text-lg font-semibold text-on-action shadow-xl hover:bg-action-hover"
            >
              <Icon name="play" className="size-5" /> Play transmission
            </button>
          )}
          <p role="status" className="sr-only">
            {state === "empty"
              ? "The transmission has cut out."
              : state === "poster"
                ? `The transmission has ended. ${m.nextAction ? `Next: ${m.nextAction}.` : ""}`
                : ""}
          </p>
        </div>
      ) : (
        <p className="whitespace-pre-line rounded-2xl bg-tealtint p-4 text-[1.05rem] leading-relaxed">{m.script}</p>
      )}

      {(m.role || m.instruction) && (state === "poster" || state === "begun" || !v) && (
        <div className="mt-3 rounded-2xl bg-muted p-3">
          {m.role && <p className="text-sm text-ink-muted">{m.role}</p>}
          {m.instruction && <p className="mt-0.5 font-semibold">{m.instruction}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(state === "poster" || (!v && state !== "begun")) && (
          <button
            type="button"
            onClick={() => dispatch(v ? "begin" : "skip")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
          >
            Begin{m.nextAction ? `: ${m.nextAction}` : ""} <Icon name="arrow-right" className="size-4" />
          </button>
        )}
        {state === "empty" && (
          <button
            type="button"
            onClick={() => dispatch("skip_wait")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
          >
            Skip wait: begin now
          </button>
        )}
        {v && state !== "poster" && state !== "begun" && state !== "empty" && (
          <button
            type="button"
            onClick={skip}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted"
          >
            Skip to activity
          </button>
        )}
        {v && (state === "poster" || state === "begun") && (
          <button
            type="button"
            onClick={() => dispatch("replay")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-medium text-ink-muted hover:bg-muted hover:text-ink"
          >
            <Icon name="refresh" className="size-4" /> Replay transmission
          </button>
        )}
        {!v && m.audio.script && (
          <Clip src={m.audio.script} label={`${name}’s transmission`} onPlay={() => send("story_audio_play_started", m, "transmission")} />
        )}
      </div>
      {v && (
        <details className="mt-3 text-sm" open={state === "begun" && !m.instruction}>
          <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">Read the transcript</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{m.script}</p>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Where a page shows them
// ---------------------------------------------------------------------------------------------

/** Every moment placed at one spot, in the order they were placed. The same in a Topic and in a Magazine page. */
export function StoryAt({
  moments,
  place,
  position = "before",
  onBegin,
  className,
}: {
  moments: PlacedMoment[];
  place: string;
  position?: "before" | "after";
  onBegin?: () => void;
  className?: string;
}) {
  const here = moments.filter((m) => m.place === place && m.position === position);
  if (!here.length) return null;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {here.map((m) =>
        m.kind === "opening_transmission" ? (
          <Transmission key={m.placementId} m={m} onBegin={onBegin} />
        ) : m.kind === "check_in" ? (
          <div key={m.placementId}>
            <CheckIn m={m} />
          </div>
        ) : (
          <ReturnMoment key={m.placementId} m={m} />
        ),
      )}
    </div>
  );
}
