"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ConversationBlock } from "@/lib/magazine";
import {
  buildDebrief,
  DIMENSIONS,
  FICTION_NOTICE,
  MAX_REPLY,
  METER_NOTICE,
  OUTCOME_TEXT,
  OUTCOMES,
  TEXT_NOTICE,
  VOICE_NOTICE,
  type Debrief,
  type Outcome,
  type Roleplay as Scene,
  type TurnResult,
} from "@/lib/roleplay";
import type { roleplayState, testTurn } from "@/server/roleplay";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  A conversation practice in free conversation (docs/voice-roleplay.md): the learner types or speaks what
  they'd say, and a fictional character replies. Every line is on the page as text; voice is extra, never
  required, and never plays by itself. "How the scene is going" changes only after a turn, in words, and
  is a made-up scene's state rather than a measure of anything. The debrief has no score.

  In the editor's preview the same screen runs against the block as written, storing nothing.
*/

type State = ReturnType<typeof roleplayState>;
type Tested = Awaited<ReturnType<typeof testTurn>>;
type View = { id: string; status: "active" | "finished"; state: number; outcome: Outcome | null; turns: TurnResult[]; debrief: Debrief | null };

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const quiet = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-accent hover:bg-muted disabled:opacity-60";

export function Roleplay({ block: b, ctx, onChoices }: { block: ConversationBlock & { roleplay: Scene }; ctx: InteractiveContext; onChoices: () => void }) {
  const scene = b.roleplay;
  const ids = useId();
  const url = `/api/magazine/${ctx.guideId}/roleplay`;
  const loaded = useApi<State>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [local, setLocal] = useState<View | null>(null);
  const [text, setText] = useState("");
  /** What speech recognition heard, while the box still holds a spoken reply. */
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The turn in flight, so a retry sends the same turn and can't be counted twice. */
  const pending = useRef<string | null>(null);
  const [aloud, setAloud] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState<"idle" | "recording" | "working">("idle");
  const recorder = useRef<MediaRecorder | null>(null);

  const attempt: View | null = local ?? (loaded.data?.attempt as View | null) ?? null;
  const voice = !ctx.preview && Boolean(loaded.data?.voice);
  const aiDown = !ctx.preview && loaded.data ? !loaded.data.ai : false;

  // Stop any recording or playback when the block leaves the screen.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      player.current?.pause();
    },
    [],
  );

  const play = (n: number) => {
    if (!attempt || ctx.preview) return;
    player.current?.pause();
    const a = new Audio(`${url}/speech?attempt=${attempt.id}&n=${n}`);
    player.current = a;
    // If the voice can't play, the line is still there to read.
    void a.play().catch(() => {});
  };

  const start = async () => {
    setProblem(null);
    setBusy(true);
    try {
      if (ctx.preview) setLocal({ id: "preview", status: "active", state: scene.start, outcome: null, turns: [], debrief: null });
      else setLocal((await api<State>(url, { body: { action: "start", blockId: b.id } })).attempt as View);
      setText("");
      setHeard(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t start.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!attempt || !text.trim()) return;
    setBusy(true);
    setProblem(null);
    pending.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      let next: View;
      if (ctx.preview) {
        const out = await api<Tested>("/api/admin/roleplay", {
          body: {
            action: "test",
            block: ctx.find(b.id) ?? b,
            history: attempt.turns.map((t) => ({ text: t.text, reply: t.reply })),
            state: attempt.state,
            text,
          },
        });
        const turns: TurnResult[] = [
          ...attempt.turns,
          {
            n: attempt.turns.length + 1,
            text: text.trim(),
            mode: "text",
            stateBefore: out.stateBefore,
            stateAfter: out.stateAfter,
            reply: out.reply,
            caption: out.caption,
            ended: out.ended,
            safety: out.safety,
          },
        ];
        const tags = [...((attempt as View & { tags?: PreviewTags[] }).tags ?? []), { moves: out.moves, risks: out.risks, unclear: out.unclear }];
        next = {
          ...attempt,
          state: out.stateAfter,
          turns,
          status: out.ended ? "finished" : "active",
          outcome: out.ended,
          debrief: out.ended ? previewDebrief(scene, turns, tags, out.ended, out.safety) : null,
        };
        (next as View & { tags?: PreviewTags[] }).tags = tags;
      } else {
        next = (
          await api<{ attempt: View }>(url, { body: { attemptId: attempt.id, turnId: pending.current, text, mode: heard === null ? "text" : "voice", heard } })
        ).attempt;
      }
      pending.current = null;
      setLocal(next);
      setText("");
      setHeard(null);
      if (aloud && next.turns.length) play(next.turns.length);
      requestAnimationFrame(() => transcript.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
    } catch (e) {
      // What they wrote is still in the box, and the turns already made are kept.
      setProblem(e instanceof Error ? e.message : "That didn’t send.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (how: "help" | "stop") => {
    if (!attempt) return;
    setBusy(true);
    setProblem(null);
    try {
      if (ctx.preview) {
        const outcome: Outcome = how === "help" ? "support" : "ended";
        setLocal({
          ...attempt,
          status: "finished",
          outcome,
          debrief: previewDebrief(scene, attempt.turns, (attempt as View & { tags?: PreviewTags[] }).tags ?? [], outcome, null),
        });
      } else setLocal((await api<{ attempt: View }>(url, { body: { action: "finish", attemptId: attempt.id, how } })).attempt);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (recording === "recording") return recorder.current?.stop();
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording("working");
        try {
          const form = new FormData();
          form.set("blockId", b.id);
          form.set("file", new File(chunks, "reply", { type: rec.mimeType || "audio/webm" }));
          const res = await fetch(`${url}/transcribe`, { method: "POST", body: form });
          const out = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok) throw new Error(out.error ?? "That recording couldn’t be turned into text.");
          setText(out.text ?? "");
          setHeard(out.text ?? "");
        } catch (e) {
          setProblem(`${e instanceof Error ? e.message : "That recording couldn’t be turned into text."} You can type your reply instead.`);
        } finally {
          setRecording("idle");
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording("recording");
      // A reply, not a monologue: stop by itself after a minute.
      setTimeout(() => rec.state === "recording" && rec.stop(), 60_000);
    } catch {
      setProblem("The microphone isn’t available. You can type your reply instead.");
    }
  };

  if (!ctx.preview && loaded.error)
    return (
      <Shell person={b.person}>
        <p role="alert">{loaded.error}</p>
        <button type="button" className={secondary} onClick={onChoices}>
          Do the choose-a-response version
        </button>
      </Shell>
    );
  if (!ctx.preview && !loaded.data)
    return (
      <Shell person={b.person}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  // Before starting: what the scene is, who you are in it, and what happens to what you say.
  if (!attempt)
    return (
      <Shell person={b.person}>
        {b.setting && <p className="text-lg">{b.setting}</p>}
        <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">You are</dt>
          <dd>{scene.learnerRole}</dd>
          <dt className="font-semibold">You’re practising</dt>
          <dd>{scene.goal}</dd>
          {scene.facts.length > 0 && (
            <>
              <dt className="font-semibold">What you know</dt>
              <dd>
                <ul className="list-disc pl-5">
                  {scene.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-sm text-ink-muted">
          About {Math.max(4, scene.maxTurns + 1)} minutes, {scene.minTurns} to {scene.maxTurns} replies from you. {FICTION_NOTICE}
        </p>
        <details className="mt-1 text-sm text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">What happens to what you say</summary>
          <p>{TEXT_NOTICE}</p>
          {voice && <p className="mt-1">{VOICE_NOTICE}</p>}
          <p className="mt-1">It’s practice: there’s no pass mark, and it isn’t an assessment of you.</p>
        </details>
        {problem && (
          <p role="alert" className="mt-2 rounded-2xl bg-muted px-4 py-3">
            {problem}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={busy || aiDown} onClick={() => void start()}>
            Start the conversation
          </button>
          <button type="button" className={secondary} onClick={onChoices}>
            Choose from responses instead
          </button>
        </div>
        {aiDown && <p className="mt-2 text-sm text-ink-muted">The character can’t reply right now. The choose-a-response version works without it.</p>}
        {ctx.preview && <p className="mt-2 text-sm text-ink-muted">Preview: this runs the scene as it’s written in the editor. Nothing is recorded.</p>}
      </Shell>
    );

  const finished = attempt.status === "finished";
  const showMeter = !scene.hideMeter;
  const last = attempt.turns.at(-1);
  return (
    <Shell person={b.person}>
      <p className="text-sm text-ink-muted">{FICTION_NOTICE}</p>
      {showMeter && !finished && <Meter scene={scene} state={attempt.state} caption={last?.caption ?? ""} />}

      <div ref={transcript} className="mt-4 flex flex-col gap-3" role="log" aria-label={`Conversation with ${b.person}`}>
        <Line who={b.person} them onListen={!ctx.preview && loaded.data?.ai !== false ? () => play(0) : undefined}>
          {scene.opening}
        </Line>
        {attempt.turns.map((t) => (
          <div key={t.n} className="contents">
            <Line who="You">{t.text}</Line>
            <Line who={t.safety ? "Scene paused" : b.person} them onListen={!ctx.preview && !t.safety ? () => play(t.n) : undefined}>
              {t.reply}
            </Line>
          </div>
        ))}
      </div>

      {problem && (
        <div role="alert" className="mt-3 rounded-2xl bg-muted px-4 py-3">
          <p>{problem}</p>
          <p className="mt-1 text-sm text-ink-muted">Your replies so far are kept.</p>
          <button type="button" className={cx(quiet, "mt-1")} onClick={onChoices}>
            Switch to choosing from responses
          </button>
        </div>
      )}

      {!finished ? (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={`${ids}-say`} className="font-semibold">
            What do you say to {b.person}?
          </label>
          <textarea
            id={`${ids}-say`}
            className="min-h-24 w-full rounded-2xl border border-line-strong bg-bg px-3 py-2 text-base"
            maxLength={MAX_REPLY}
            value={text}
            aria-describedby={`${ids}-hint`}
            onChange={(e) => setText(e.target.value)}
          />
          <p id={`${ids}-hint`} className="text-sm text-ink-muted">
            {heard !== null
              ? "This is what was heard. Fix anything that’s wrong before you send: only what’s in the box is used."
              : `Reply ${attempt.turns.length + 1} of up to ${scene.maxTurns}. Say it the way you would in person.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={primary} disabled={busy || text.trim().length < 2 || recording !== "idle"}>
              {busy ? "Sending…" : "Send"}
            </button>
            {voice && (
              <button
                type="button"
                className={secondary}
                aria-pressed={recording === "recording"}
                disabled={busy || recording === "working"}
                onClick={() => void record()}
              >
                <Icon name="mic" className="size-4" />
                {recording === "recording"
                  ? "Stop recording"
                  : recording === "working"
                    ? "Turning it into text…"
                    : heard !== null
                      ? "Record again"
                      : "Speak instead"}
              </button>
            )}
            {recording === "recording" && (
              <span role="status" className="font-semibold">
                Recording… press Stop when you’ve finished.
              </span>
            )}
            <button type="button" className={cx(quiet, "ml-auto")} disabled={busy} onClick={() => void finish("help")}>
              <Icon name="phone" className="size-4" /> Ask for help
            </button>
            <button type="button" className={quiet} disabled={busy} onClick={() => void finish("stop")}>
              Exit practice
            </button>
          </div>
          {!ctx.preview && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={aloud} onChange={(e) => setAloud(e.target.checked)} />
              Read {b.person}’s replies aloud in a synthetic voice
            </label>
          )}
        </form>
      ) : (
        attempt.debrief && (
          <DebriefView
            key={attempt.id}
            scene={scene}
            debrief={attempt.debrief}
            preview={Boolean(ctx.preview)}
            onSeen={async () => {
              if (ctx.preview) return;
              const out = await api<{ practised: boolean }>(url, { body: { action: "seen", attemptId: attempt.id } }).catch(() => null);
              // Reaching an end and reading the debrief is what counts as having practised.
              if (out?.practised) {
                ctx.activity(b.id, { outcome: attempt.outcome ?? undefined });
                ctx.engaged(b.id);
              }
            }}
            onAgain={() => void start()}
            onChoices={onChoices}
            onDelete={
              ctx.preview
                ? undefined
                : async () => {
                    await api(url, { body: { action: "delete", attemptId: attempt.id } }).catch(() => {});
                    setLocal(null);
                    loaded.reload();
                  }
            }
          />
        )
      )}
    </Shell>
  );
}

type PreviewTags = { moves: { id: string; quote: string }[]; risks: { id: string; quote: string }[]; unclear: boolean };
/** The editor's preview builds its debrief in the browser: the author's copy of the block has the whole scene. */
const previewDebrief = (scene: Scene, turns: TurnResult[], tags: PreviewTags[], outcome: Outcome, safety: Debrief["safety"]) =>
  buildDebrief(
    scene,
    turns.map((t, i) => ({
      n: t.n,
      text: t.text,
      moves: tags[i]?.moves ?? [],
      risks: tags[i]?.risks ?? [],
      unclear: tags[i]?.unclear ?? false,
      stateAfter: t.stateAfter,
      caption: t.caption,
    })),
    outcome,
    safety,
  );

function Shell({ person, children }: { person: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={`Conversation practice with ${person}`}
      className="mx-auto w-full max-w-[46rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7"
    >
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="mic" className="size-5" /> Conversation practice · fictional AI character
      </p>
      <h3 className="font-serif text-2xl font-semibold">{person}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Line({ who, them, onListen, children }: { who: string; them?: boolean; onListen?: () => void; children: React.ReactNode }) {
  return (
    <div className={cx("max-w-[88%] rounded-2xl px-4 py-3", them ? "self-start bg-muted" : "self-end bg-tealtint")}>
      <p className="text-sm font-semibold text-ink-muted">{who}</p>
      <p className="whitespace-pre-wrap">{children}</p>
      {onListen && (
        <button type="button" className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-accent" onClick={onListen}>
          <Icon name="volume" className="size-4" /> Listen<span className="sr-only"> to this line in a synthetic voice</span>
        </button>
      )}
    </div>
  );
}

/** "How the scene is going": the states in words, with where it is now. It changes only after a turn. */
function Meter({ scene, state, caption }: { scene: Scene; state: number; caption: string }) {
  return (
    <div className="mt-3 rounded-2xl bg-bg p-4 ring-1 ring-line">
      <p className="font-semibold">{scene.meterTitle}</p>
      <ol className="mt-2 flex flex-wrap gap-2" aria-label={scene.meterTitle}>
        {scene.states.map((s, i) => (
          <li
            key={s}
            aria-current={i === state ? "step" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-sm",
              i === state ? "border-ink bg-ink font-semibold text-bg" : "border-line-strong text-ink-muted",
            )}
          >
            {i === state && <span className="sr-only">Now: </span>}
            {s}
          </li>
        ))}
      </ol>
      {/* Announced after a turn, politely, so it doesn't talk over anything. */}
      <p className="mt-2" aria-live="polite">
        {caption || `The scene starts at “${scene.states[state]}”.`}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{METER_NOTICE}</p>
    </div>
  );
}

function DebriefView({
  scene,
  debrief: d,
  preview,
  onSeen,
  onAgain,
  onChoices,
  onDelete,
}: {
  scene: Scene;
  debrief: Debrief;
  preview: boolean;
  onSeen: () => Promise<void>;
  onAgain: () => void;
  onChoices: () => void;
  onDelete?: () => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Shown means read, as far as the Hub can know.
  useEffect(() => {
    heading.current?.focus();
    void onSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        {OUTCOMES[d.outcome]}
      </h4>
      <p className="mt-1">{OUTCOME_TEXT[d.outcome]}</p>

      {d.safety && (
        <div className="mt-3 rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
          <p className="font-semibold">{d.safety.label}: what to do</p>
          <p className="mt-1">{d.safety.guidance}</p>
        </div>
      )}

      {d.cautions.length > 0 && (
        <div className="mt-3">
          <h5 className="font-semibold">Something to be careful of</h5>
          <ul className="mt-1 flex flex-col gap-2">
            {d.cautions.map((c) => (
              <li key={c.risk} className="rounded-2xl bg-muted p-4">
                <p className="font-semibold">{c.risk}</p>
                <p className="mt-1 text-sm text-ink-muted">You said: “{c.quote}”</p>
                <p className="mt-1">{c.caution}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.didWell.length > 0 && (
        <div className="mt-3">
          <h5 className="font-semibold">What you did, in this scene</h5>
          <ul className="mt-1 flex flex-col gap-2">
            {d.didWell.map((w) => (
              <li key={w.move} className="rounded-2xl bg-bg p-4 ring-1 ring-line">
                <p className="font-semibold">{w.move}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {DIMENSIONS[w.dimension]} · you said: “{w.quote}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.toTry && (
        <div className="mt-3 rounded-2xl bg-bg p-4 ring-1 ring-line">
          <h5 className="font-semibold">Something to try next time</h5>
          <p className="mt-1">{d.toTry.move}</p>
          {d.toTry.example && (
            <p className="mt-1 text-sm text-ink-muted">
              In this scene, that might sound like: “{d.toTry.example}” It’s one way, not a script for every person.
            </p>
          )}
        </div>
      )}

      {d.unclear.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          For reply {d.unclear.join(" and ")}, it couldn’t tell what you were doing from the words alone, so nothing is said about{" "}
          {d.unclear.length === 1 ? "it" : "them"}.
        </p>
      )}
      {d.didWell.length === 0 && d.cautions.length === 0 && !d.safety && (
        <p className="mt-3 text-sm text-ink-muted">There wasn’t enough in this attempt to point to anything specific.</p>
      )}

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">How the scene went, reply by reply</summary>
        <ol className="flex flex-col gap-1">
          {d.timeline.map((t) => (
            <li key={t.turn}>
              <span className="font-semibold">{t.turn === 0 ? "At the start" : `After reply ${t.turn}`}:</span> {scene.states[t.state]}
              {t.caption ? ` · ${t.caption}` : ""}
            </li>
          ))}
        </ol>
        <p className="mt-1 text-sm text-ink-muted">{METER_NOTICE} It’s based on your words only: nothing about your voice was assessed.</p>
      </details>

      {d.guidance && (
        <p className="mt-2">
          The guidance behind this scene:{" "}
          {d.guidance.href ? (
            <Link href={d.guidance.href} className="font-semibold text-accent underline-offset-4 hover:underline">
              {d.guidance.label}
            </Link>
          ) : (
            <span className="font-semibold">{d.guidance.label}</span>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={onAgain}>
          <Icon name="refresh" className="size-4" /> Try again
        </button>
        <button type="button" className={secondary} onClick={onChoices}>
          Compare with the choose-a-response version
        </button>
        {onDelete && (
          <button
            type="button"
            className={quiet}
            onClick={() => {
              if (window.confirm("Delete this conversation? What you said in it is removed for good. Having practised stays on your record.")) void onDelete();
            }}
          >
            <Icon name="trash" className="size-4" /> Delete this conversation
          </button>
        )}
      </div>
      {preview && <p className="mt-2 text-sm text-ink-muted">Preview: nothing was recorded.</p>}
    </div>
  );
}
