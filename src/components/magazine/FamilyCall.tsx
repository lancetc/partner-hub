"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { PhoneCallBlock } from "@/lib/magazine";
import {
  caseFile,
  cleanNote,
  correctTurn,
  CUES_NOTICE,
  cuesNow,
  emptyNote,
  endCall,
  FAMILY_NOTICE,
  familyResult,
  MAX_FAMILY_REPLY,
  NOTE_FIELDS,
  NOTE_ORDER,
  openCheck,
  reviewText,
  startState,
  takeTurn,
  type FamilyBlock,
  type FamilyDebrief,
  type FamilyNote,
  type FamilyState,
} from "@/lib/familyCall";
import { VOICE_NOTICE } from "@/lib/roleplay";
import type { FamilyView, TranscriptTurn } from "@/server/familyCall";
import { Icon } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { AvaTransmission, avaLineMedia } from "../ava/AvaTransmission";
import { AidSection } from "../playbooks/AidSection";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  A Tough Family Call (lib/familyCall): briefing with Ava and the case file, the call (typed or spoken, the same turns),
  a wrap-up note, and a debrief with Ava. Every line is on the page as text; the caller's voice and Ava's are optional
  and never play by themselves. Nothing is timed: pause and switch between text and voice at any point without losing
  anything. Practice cues are authored rules, optional, and hidden in assessed mode; there's no rapport meter.

  In the editor's preview the same screens run the engine locally on the reviewed script, storing nothing.
*/

type Block = PhoneCallBlock & { family: NonNullable<PhoneCallBlock["family"]> };
type View = FamilyView;

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const quiet = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-accent hover:bg-muted disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warnTone = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const badTone = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const goodTone = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";

/** The editor's preview: the same engine, run here on the author's copy, storing nothing. */
type Local = {
  st: FamilyState;
  transcript: TranscriptTurn[];
  note: FamilyNote;
  debrief: FamilyDebrief | null;
  status: View["status"];
  channel: "text" | "voice";
  fail: boolean;
};

function localView(fb: FamilyBlock, l: Local | null): View {
  const st = l?.st ?? startState(fb);
  const rule = st.safetyRule ? fb.roleplay.safety.find((r) => r.id === st.safetyRule) : undefined;
  return {
    usable: { ok: true, reason: "" },
    ai: false,
    voice: { speak: false, listen: false },
    versions: { scenario: fb.family.version, rubric: fb.family.rubricVersion, engine: "preview", prompt: "" },
    attemptId: l ? "preview" : null,
    attemptNo: l ? 1 : 0,
    status: l?.status ?? "new",
    stage: !l ? "brief" : l.status === "exited" ? "left" : l.debrief ? "debrief" : st.ended ? "wrap" : "call",
    caller: "script",
    channel: l?.channel ?? "text",
    call: l
      ? {
          turn: st.turn,
          minTurns: fb.roleplay.minTurns,
          maxTurns: fb.roleplay.maxTurns,
          paused: st.paused,
          ended: st.ended,
          lower: st.lower,
          cuesOn: st.cues,
          safety: rule ? { label: rule.label, guidance: rule.guidance } : null,
        }
      : null,
    transcript: l?.transcript ?? [],
    caseFile: caseFile(fb, st),
    cues: st.ended ? [] : cuesNow(fb, st),
    notice:
      l?.fail && st.turn > 0
        ? "Fiona’s last line comes from the reviewed script: the AI caller couldn’t answer within the approved facts just then. Nothing you said was lost."
        : "",
    note: l?.note ?? emptyNote(),
    debrief: l?.debrief ?? null,
    attempts: l ? 1 : 0,
    purged: false,
    earlierScenario: false,
  } as View;
}

export function FamilyCall({ block: b, ctx }: { block: Block; ctx: InteractiveContext }) {
  const ids = useId();
  const url = `/api/magazine/${ctx.guideId}/family-call`;
  const loaded = useApi<View>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [remote, setRemote] = useState<View | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [pane, setPane] = useState<"call" | "file">("call");
  const [lower, setLower] = useState(false);
  const [cues, setCues] = useState(true);
  const [aloud, setAloud] = useState(false);
  const [volume, setVolume] = useState(1);
  const [recording, setRecording] = useState<"idle" | "recording" | "working">("idle");
  const pending = useRef<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The author's copy, with everything, for the preview engine.
  const fb = (ctx.preview ? (ctx.find(b.id) ?? b) : b) as unknown as FamilyBlock;

  const v: View | null = ctx.preview ? localView(fb, local) : (remote ?? loaded.data);
  const f = b.family;
  const stage = v?.stage ?? "brief";

  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      player.current?.pause();
    },
    [],
  );
  // Focus moves to each stage's heading, so a screen reader hears where they are.
  useEffect(() => {
    if (v?.attemptId) heading.current?.focus();
  }, [stage, v?.attemptId]);

  const run = async (input: Record<string, unknown>, offline?: () => void) => {
    setBusy(true);
    setProblem("");
    try {
      if (ctx.preview) offline?.();
      else setRemote(await api<View>(url, { body: { blockId: b.id, ...input } }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const play = (n: number) => {
    if (ctx.preview || !v?.voice.listen) return;
    player.current?.pause();
    const a = new Audio(`${url}/speech?block=${b.id}&n=${n}`);
    a.volume = volume;
    player.current = a;
    void a.play().catch(() => {});
  };

  const start = (channel: "text" | "voice") =>
    run({ action: v?.attemptId ? "retry" : "start", channel, lower, cues, from: v?.attemptId ?? undefined }, () =>
      setLocal({ st: startState(fb, { lower, cues }), transcript: [], note: emptyNote(), debrief: null, status: "active", channel, fail: false }),
    );

  const send = async () => {
    if (!v || text.trim().length < 2) return;
    pending.current ??= crypto.randomUUID();
    const mode = heard === null ? "text" : "voice";
    const ok = await run({ turnId: pending.current, text, mode, heard }, () => {
      if (!local) return;
      const out = takeTurn(fb, local.st, { text, mode });
      const ev = local.fail && !out.safety ? { ...out.eval, fallback: "unavailable" } : out.eval;
      setLocal({
        ...local,
        st: { ...out.state, evals: out.state.evals.map((e) => (e.n === ev.n ? ev : e)) },
        transcript: [
          ...local.transcript,
          {
            n: out.eval.n,
            turnId: "p",
            mode,
            text: text.trim(),
            heard: heard ?? "",
            corrected: "",
            reply: out.authored,
            by: out.safety ? "safety" : "script",
            at: "",
          },
        ],
      });
    });
    if (ok) {
      pending.current = null;
      setText("");
      setHeard(null);
    }
  };

  useEffect(() => {
    // Read the newest reply aloud, if they asked for that. Never by itself otherwise.
    if (aloud && v?.transcript.length) play(v.transcript.at(-1)!.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.transcript.length]);

  const record = async () => {
    if (recording === "recording") return recorder.current?.stop();
    setProblem("");
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
          // The shared roleplay speech-to-text: the recording is transcribed and not kept.
          const res = await fetch(`/api/magazine/${ctx.guideId}/roleplay/transcribe`, { method: "POST", body: form });
          const out = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok) throw new Error(out.error ?? "That recording couldn’t be turned into text.");
          setText(out.text ?? "");
          setHeard(out.text ?? "");
        } catch (e) {
          setProblem(`${e instanceof Error ? e.message : "That recording couldn’t be turned into text."} You can type instead: nothing is lost.`);
        } finally {
          setRecording("idle");
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording("recording");
      setTimeout(() => rec.state === "recording" && rec.stop(), 60_000);
    } catch {
      setProblem("The microphone isn’t available. You can type instead: nothing is lost.");
    }
  };

  if (!ctx.preview && loaded.error && !v)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!v)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const call = v.call;
  const lastFiona = v.transcript.at(-1)?.n ?? 0;
  const problemBox = problem && (
    <div role="alert" className="mt-3 rounded-2xl bg-muted px-4 py-3">
      <p>{problem}</p>
      <p className="mt-1 text-sm text-ink-muted">Your call so far is kept.</p>
    </div>
  );

  // ----- Briefing -----
  if (stage === "brief")
    return (
      <Shell b={b}>
        <p className="text-sm text-ink-muted">{FAMILY_NOTICE}</p>
        <p className="mt-3 flex items-center gap-2 text-lg font-semibold">
          <Icon name="phone" className="size-5" /> Incoming call: {b.person} — {b.role}
        </p>
        <AvaTransmission
          layout="block"
          className="mt-3"
          media={ctx.preview ? null : avaLineMedia(`familycall:${ctx.guideId}:${b.id}:brief`, null)}
          portrait={ctx.guide.portrait}
          name={ctx.guide.name || "Ava"}
          script={f.ava.brief}
          title={`Briefing: ${b.title}`}
        />
        <p className="mt-1 text-sm text-ink-muted">Optional: Ava’s briefing is a recording of a reviewed script. Her words are above if you’d rather read.</p>
        <div className={cx(box, "mt-3")}>
          <h4 className="font-semibold">The case file, in short</h4>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">What’s happened</dt>
            <dd>{f.trigger}</dd>
            <dt className="font-semibold">{b.phone.client}’s goal</dt>
            <dd>{f.olderPersonGoal}</dd>
            <dt className="font-semibold">Who decides</dt>
            <dd>{f.decisionMaker}</dd>
            <dt className="font-semibold">The caller</dt>
            <dd>{f.callerRole}</dd>
            <dt className="font-semibold">You are</dt>
            <dd>{b.roleplay.learnerRole}</dd>
          </dl>
          <p className="mt-2 text-sm text-ink-muted">
            During the call, open the full case file: {v.caseFile.map((c) => c.label).join(", ")}. Opening it costs nothing and nothing is timed.
          </p>
          {f.appearances.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                {b.phone.client} and {b.person}’s case history (approved earlier stories)
              </summary>
              <ul className="list-disc pl-5">
                {f.appearances.map((x) => (
                  <li key={x.title}>
                    <span className="font-semibold">{x.title}:</span> {x.outcome}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <fieldset className="mt-3 flex flex-col gap-1 text-sm">
          <legend className="font-semibold">Before you answer</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={lower} onChange={(e) => setLower(e.target.checked)} />
            Lower intensity: {b.person} is a little less upset to begin with
          </label>
          {f.mode === "practice" ? (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={cues} onChange={(e) => setCues(e.target.checked)} />
              Show practice cues during the call
            </label>
          ) : (
            <p className="py-2 text-ink-muted">This is an assessed call: practice cues are off.</p>
          )}
        </fieldset>
        <details className="mt-1 text-sm text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">What happens to what you say</summary>
          <p>{f.privacy.notice}</p>
          <p className="mt-1">{VOICE_NOTICE}</p>
          <p className="mt-1">
            Kept for {f.privacy.retentionDays} days. You can choose text without giving a reason, and switch between text and voice at any time.
          </p>
        </details>
        {!v.usable.ok && (
          <p role="alert" className={cx(warnTone, "mt-3")}>
            {v.usable.reason}
          </p>
        )}
        {problemBox}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={busy || !v.usable.ok || !v.voice.speak} onClick={() => void start("voice")}>
            <Icon name="mic" className="size-4" /> Start voice call
          </button>
          <button type="button" className={secondary} disabled={busy || !v.usable.ok} onClick={() => void start("text")}>
            <Icon name="chat" className="size-4" /> Use text instead
          </button>
        </div>
        {!v.voice.speak && (
          <p className="mt-2 text-sm text-ink-muted">
            {ctx.preview ? "Preview runs in text." : "Speaking isn’t switched on for this Hub, so the call is typed. It’s the same call, with the same result."}
          </p>
        )}
        {ctx.preview && (
          <p className="mt-2 text-sm text-ink-muted">Preview: this runs the case on the reviewed script, as it’s written in the editor. Nothing is recorded.</p>
        )}
      </Shell>
    );

  // ----- Left part-way -----
  if (stage === "left")
    return (
      <Shell b={b}>
        <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
          You left the practice
        </h4>
        <p className="mt-1">Nothing is counted against you for stopping. You can try the call again when you’re ready.</p>
        {problemBox}
        <button type="button" className={cx(primary, "mt-3")} disabled={busy} onClick={() => void start("text")}>
          <Icon name="refresh" className="size-4" /> Try the call again
        </button>
      </Shell>
    );

  const caseFileView = (
    <CaseFile
      v={v}
      b={b}
      busy={busy}
      onOpen={(id) =>
        void run({ action: "check", check: id }, () => {
          if (local) setLocal({ ...local, st: openCheck(fb, local.st, id) });
        })
      }
    />
  );

  // ----- The call -----
  if (stage === "call" && call)
    return (
      <Shell b={b}>
        <h4 ref={heading} tabIndex={-1} className="sr-only">
          The call with {b.person}
        </h4>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">Simulated call</span>
          <span aria-hidden>·</span>
          <span>
            {call.paused ? "Paused" : "In progress"}: reply {Math.min(call.turn + 1, call.maxTurns)} of up to {call.maxTurns}
          </span>
          <span className="ml-auto flex flex-wrap gap-1">
            {call.paused ? (
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => void run({ action: "resume" }, () => local && setLocal({ ...local, st: { ...local.st, paused: false } }))}
              >
                <Icon name="play" className="size-4" /> Resume
              </button>
            ) : (
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => void run({ action: "pause" }, () => local && setLocal({ ...local, st: { ...local.st, paused: true } }))}
              >
                <Icon name="pause" className="size-4" /> Pause
              </button>
            )}
            <a href={`/tools/${f.jobAid.snippetId}?from=placement`} target="_blank" rel="noreferrer" className={quiet}>
              <Icon name="clipboard" className="size-4" /> Job aid<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => {
                if (call.turn < call.minTurns && !window.confirm(`A debrief needs at least ${call.minTurns} replies. End the call now anyway?`)) return;
                void run({ action: "end", how: "end" }, () => local && setLocal({ ...local, st: endCall(fb, local.st, "end") }));
              }}
            >
              <Icon name="phone" className="size-4" /> End call
            </button>
          </span>
        </div>
        {call.paused && (
          <p role="status" className={cx(box, "mt-3")}>
            Paused. Nothing is timed, and nothing is counted against you. Resume when you’re ready, or send your next reply.
          </p>
        )}
        <div
          role="tablist"
          aria-label="Call and case file"
          className="mt-3 flex gap-1 rounded-full border border-line-strong bg-surface p-1 text-sm font-semibold lg:hidden"
        >
          {(
            [
              ["call", "The call"],
              ["file", "Case file"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={pane === k}
              onClick={() => setPane(k)}
              className={cx("min-h-10 flex-1 rounded-full px-3", pane === k ? "bg-action text-on-action" : "hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className={cx("lg:order-last", pane !== "file" && "hidden lg:block")}>{caseFileView}</div>
          <div className={cx("min-w-0", pane !== "call" && "hidden lg:block")}>
            {v.cues.length > 0 && (
              <div className={box}>
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="bulb" className="size-4" /> Practice cues
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {v.cues.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">
                        {c.tone === "done" ? "Done: " : "Open: "}
                        {c.label}.
                      </span>{" "}
                      <span className="text-ink-muted">Why: {c.why}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-ink-muted">{CUES_NOTICE}</p>
                <button
                  type="button"
                  className={cx(quiet, "-ml-3")}
                  onClick={() => void run({ action: "cues", on: false }, () => local && setLocal({ ...local, st: { ...local.st, cues: false } }))}
                >
                  Hide practice cues
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-3" role="log" aria-live="polite" aria-label={`Call with ${b.person}`}>
              <Line who={b.person} them onListen={v.voice.listen ? () => play(0) : undefined}>
                {b.roleplay.opening}
              </Line>
              {v.transcript.map((t) => (
                <div key={t.n} className="contents">
                  <Line who={t.mode === "voice" ? "You (spoken)" : "You"}>{t.corrected || t.text}</Line>
                  <Line who={t.by === "safety" ? "Call paused" : b.person} them onListen={v.voice.listen && t.by !== "safety" ? () => play(t.n) : undefined}>
                    {t.reply}
                  </Line>
                </div>
              ))}
            </div>
            {v.notice && (
              <p role="status" className={cx(warnTone, "mt-3 text-sm")}>
                {v.notice}
              </p>
            )}
            {problemBox}
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
                maxLength={MAX_FAMILY_REPLY}
                value={text}
                aria-describedby={`${ids}-hint`}
                onChange={(e) => setText(e.target.value)}
              />
              <p id={`${ids}-hint`} className="text-sm text-ink-muted">
                {heard !== null
                  ? "This is what was heard. Fix anything that’s wrong before you send: only what’s in the box is used, and you can still correct it after the call."
                  : "Say it the way you would on the phone. Take as long as you need."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className={primary} disabled={busy || text.trim().length < 2 || recording !== "idle"}>
                  {busy ? "Sending…" : "Send"}
                </button>
                {v.channel === "voice" && v.voice.speak && (
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
                          : "Speak"}
                  </button>
                )}
                {recording === "recording" && (
                  <span role="status" className="font-semibold">
                    Recording… press Stop when you’ve finished.
                  </span>
                )}
                {v.voice.speak && (
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy || recording !== "idle"}
                    onClick={() =>
                      void run(
                        { action: "channel", channel: v.channel === "voice" ? "text" : "voice" },
                        () => local && setLocal({ ...local, channel: v.channel === "voice" ? "text" : "voice" }),
                      )
                    }
                  >
                    {v.channel === "voice" ? "Use text instead" : "Use voice"}
                  </button>
                )}
              </div>
              {v.voice.listen && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={aloud} onChange={(e) => setAloud(e.target.checked)} />
                    Read {b.person}’s replies aloud (a synthetic voice)
                  </label>
                  <button type="button" className={quiet} onClick={() => play(lastFiona)}>
                    <Icon name="volume" className="size-4" /> Replay last line
                  </button>
                  <label className="flex min-h-11 items-center gap-2">
                    Volume
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={volume}
                      onChange={(e) => {
                        setVolume(Number(e.target.value));
                        if (player.current) player.current.volume = Number(e.target.value);
                      }}
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                className={cx(quiet, "self-start")}
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Leave this practice call? Nothing is counted against you."))
                    void run({ action: "end", how: "exit" }, () => local && setLocal({ ...local, status: "exited" }));
                }}
              >
                Leave the practice
              </button>
            </form>
          </div>
        </div>
        {ctx.preview && (
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="size-4"
              checked={Boolean(local?.fail)}
              onChange={(e) => local && setLocal({ ...local, fail: e.target.checked })}
            />
            Preview: show replies as if the AI caller had failed (learners then see the reviewed script, with a notice)
          </label>
        )}
      </Shell>
    );

  // ----- Wrap-up -----
  if (stage === "wrap")
    return (
      <Shell b={b}>
        <WrapUp
          v={v}
          b={b}
          busy={busy}
          headingRef={heading}
          problem={problemBox}
          onCorrect={(n, t) =>
            run({ action: "correct", n, text: t }, () => {
              if (!local) return;
              setLocal({ ...local, st: correctTurn(fb, local.st, n, t), transcript: local.transcript.map((x) => (x.n === n ? { ...x, corrected: t } : x)) });
            })
          }
          onDraft={(note) => void (!ctx.preview && api(url, { body: { action: "note", blockId: b.id, note } }).catch(() => {}))}
          onSubmit={(note) =>
            run({ action: "submit", note }, () => {
              if (!local) return;
              const clean = cleanNote(note);
              setLocal({ ...local, note: clean, debrief: familyResult(fb, local.st, clean), status: "submitted" });
            })
          }
        />
      </Shell>
    );

  // ----- Debrief -----
  return (
    <Shell b={b}>
      {v.debrief ? (
        <Debrief
          v={v}
          d={v.debrief}
          b={b}
          ctx={ctx}
          headingRef={heading}
          onSeen={async () => {
            if (ctx.preview) return;
            const next = await api<View>(url, { body: { action: "viewed", blockId: b.id } }).catch(() => null);
            if (next) {
              setRemote(next);
              if (next.debrief?.substantive) {
                ctx.activity(b.id, { outcome: next.debrief.ending, score: next.debrief.score, total: next.debrief.max });
                ctx.engaged(b.id);
              }
            }
          }}
          onAgain={() => void start(v.channel)}
          onDelete={
            ctx.preview
              ? undefined
              : async () => {
                  await api(url, { body: { action: "delete", attemptId: v.attemptId } }).catch(() => {});
                  setRemote(null);
                  loaded.reload();
                }
          }
          onReport={(source, kind) =>
            ctx.preview ? Promise.resolve() : api(url, { body: { action: "report", blockId: b.id, source, kind } }).then(() => undefined)
          }
        />
      ) : (
        <p className="text-ink-muted">Loading the debrief…</p>
      )}
      {problemBox}
    </Shell>
  );
}

function Shell({ b, children }: { b: Block; children: React.ReactNode }) {
  return (
    <section aria-label={`Practice call: ${b.title}`} className="mx-auto w-full max-w-[64rem] rounded-3xl border border-line-strong bg-surface p-4 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="phone" className="size-5" /> Tough Family Call · simulated, fictional
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      <div className="mt-1 flex items-center gap-3">
        <CharacterPortrait name={b.person} />
        <p className="text-lg">
          <span className="font-semibold">{b.person}</span>
          {b.role ? `, ${b.role}` : ""}
        </p>
      </div>
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
        <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent" onClick={onListen}>
          <Icon name="volume" className="size-4" /> Listen<span className="sr-only"> to this line in a synthetic voice</span>
        </button>
      )}
    </div>
  );
}

const STATUS_ICON = { verified: "circle-check", reported: "info", unknown: "alert", disputed: "flag" } as const;

function CaseFile({ v, b, busy, onOpen }: { v: View; b: Block; busy: boolean; onOpen: (id: string) => void }) {
  return (
    <aside aria-label="Case file" className="flex flex-col gap-3">
      <div className={box}>
        <p className="font-semibold">Case file</p>
        <p className="text-xs text-ink-muted">Simulated records. Open a section any time; nothing real is opened or changed.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {v.caseFile.map((c) => (
            <li key={c.id}>
              {c.opened ? (
                <div className="rounded-xl bg-muted p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Icon name={c.kind === "permission" ? "lock" : c.kind === "complaint" ? "flag" : "doc"} className="size-4" /> {c.label}
                  </p>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {c.facts.map((x) => (
                      <li key={x.text}>
                        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
                          <Icon name={STATUS_ICON[x.status]} className="size-3.5" /> {x.statusLabel}
                        </span>
                        {x.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <button
                  type="button"
                  className={cx(secondary, "w-full justify-start text-left text-sm")}
                  disabled={busy || Boolean(v.call?.ended)}
                  onClick={() => onOpen(c.id)}
                >
                  <Icon name={c.kind === "permission" ? "lock" : c.kind === "complaint" ? "flag" : "doc"} className="size-4" />
                  Open: {c.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Sources</summary>
        <ul className="flex flex-col gap-3 text-sm">
          {b.phone.sources.map((s) => (
            <li key={s.id}>
              <p className="font-semibold">{s.title}</p>
              <p>{s.excerpt}</p>
              <p className="text-xs text-ink-muted">
                {s.version}
                {s.url && (
                  <>
                    {" · "}
                    <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                      Source<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

function WrapUp({
  v,
  b,
  busy,
  headingRef,
  problem,
  onCorrect,
  onDraft,
  onSubmit,
}: {
  v: View;
  b: Block;
  busy: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  problem: React.ReactNode;
  onCorrect: (n: number, text: string) => Promise<boolean>;
  onDraft: (note: FamilyNote) => void;
  onSubmit: (note: FamilyNote) => Promise<boolean>;
}) {
  const ids = useId();
  const [note, setNote] = useState<FamilyNote>(v.note);
  const [editing, setEditing] = useState<number | null>(null);
  const [fix, setFix] = useState("");
  const call = v.call!;
  const spoken = v.transcript.filter((t) => t.mode === "voice");
  const set = (k: keyof FamilyNote, val: string | string[]) => setNote((n) => ({ ...n, [k]: val }));
  return (
    <div>
      <h4 ref={headingRef} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        {call.ended === "safety" ? "The call paused for a safety concern" : call.ended === "early" ? "The call ended early" : "The call has ended"}
      </h4>
      {call.safety && (
        <div className={cx(warnTone, "mt-2")}>
          <p className="font-semibold">{call.safety.label}: what to do</p>
          <p className="mt-1">{call.safety.guidance}</p>
        </div>
      )}
      {call.ended === "early" && <p className="mt-1">You can still write a note, but a debrief needs at least {call.minTurns} replies to count as practice.</p>}
      <p className="mt-1 text-sm text-ink-muted">
        Now the follow-up: what you’d record and do next. It’s practice: nothing is written to a client record, booked or sent.
      </p>

      {spoken.length > 0 && (
        <div className={cx(box, "mt-3")}>
          <h5 className="font-semibold">Check what was heard</h5>
          <p className="text-sm text-ink-muted">If speech recognition changed what you meant, correct it before the result. The call itself doesn’t change.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {spoken.map((t) => (
              <li key={t.n} className="text-sm">
                <p>
                  <span className="font-semibold">Reply {t.n}:</span> “{t.corrected || t.text}”{t.corrected ? " (corrected)" : ""}
                </p>
                {editing === t.n ? (
                  <div className="mt-1 flex flex-col gap-1">
                    <label htmlFor={`${ids}-fix`} className="font-semibold">
                      What you said
                    </label>
                    <textarea id={`${ids}-fix`} className={field} value={fix} maxLength={MAX_FAMILY_REPLY} onChange={(e) => setFix(e.target.value)} />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={secondary}
                        disabled={busy || fix.trim().length < 2}
                        onClick={async () => {
                          if (await onCorrect(t.n, fix)) setEditing(null);
                        }}
                      >
                        Save the correction
                      </button>
                      <button type="button" className={quiet} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cx(quiet, "-ml-3")}
                    onClick={() => {
                      setEditing(t.n);
                      setFix(t.corrected || t.text);
                    }}
                  >
                    Correct this line
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(note);
        }}
      >
        <fieldset className={box}>
          <legend className="px-1 font-semibold">Follow-up actions</legend>
          <p className="text-sm text-ink-muted">Choose what you’d do next. Some of these would be a mistake.</p>
          {b.family.wrapUp.map((w) => (
            <label key={w.id} className="flex min-h-11 items-start gap-2 py-1 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--color-action)]"
                checked={note.actions.includes(w.id)}
                onChange={(e) => set("actions", e.target.checked ? [...note.actions, w.id] : note.actions.filter((x) => x !== w.id))}
              />
              {w.label}
            </label>
          ))}
        </fieldset>
        <fieldset className={box}>
          <legend className="px-1 font-semibold">Your case note</legend>
          <p className="text-sm text-ink-muted">Short and factual. Keep what’s verified apart from what isn’t.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {NOTE_ORDER.map((k) => (
              <label key={k} className={cx("flex flex-col gap-1 text-sm", k !== "owner" && k !== "nextContact" && "sm:col-span-2")}>
                <span className="font-semibold">{NOTE_FIELDS[k].label}</span>
                <span className="text-ink-muted">{NOTE_FIELDS[k].hint}</span>
                {k === "owner" || k === "nextContact" ? (
                  <input className={field} value={note[k]} maxLength={160} onChange={(e) => set(k, e.target.value)} onBlur={() => onDraft(note)} />
                ) : (
                  <textarea
                    className={cx(field, "min-h-20")}
                    value={note[k]}
                    maxLength={800}
                    onChange={(e) => set(k, e.target.value)}
                    onBlur={() => onDraft(note)}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>
        {problem}
        <button type="submit" className={cx(primary, "self-start")} disabled={busy}>
          {busy ? "Saving…" : "Save the note and see the debrief"}
        </button>
      </form>
    </div>
  );
}

function Debrief({
  v,
  d,
  b,
  ctx,
  headingRef,
  onSeen,
  onAgain,
  onDelete,
  onReport,
}: {
  v: View;
  d: FamilyDebrief;
  b: Block;
  ctx: InteractiveContext;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onSeen: () => Promise<void>;
  onAgain: () => void;
  onDelete?: () => Promise<void>;
  onReport: (source: string, kind: string) => Promise<void>;
}) {
  const ids = useId();
  const [next, setNext] = useState<string>("");
  const [report, setReport] = useState({ source: "case", kind: "outdated", sent: false });
  useEffect(() => {
    if (v.status === "submitted") void onSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const assessed = d.mode === "assessed";
  const verdict = assessed
    ? d.passed === null
      ? "Needs a reviewer before a result"
      : d.passed
        ? "Passed"
        : "Not passed"
    : d.recommendation === "practised"
      ? "Practised"
      : "Needs another attempt";
  const place = `magazine:${ctx.guideId}`;
  return (
    <div>
      <AvaTransmission
        layout="block"
        media={ctx.preview ? null : avaLineMedia(`familycall:${ctx.guideId}:${b.id}:debrief`, null)}
        portrait={ctx.guide.portrait}
        name={ctx.guide.name || "Ava"}
        script={d.avaDebrief}
        title={`Debrief: ${b.title}`}
      />
      <h4 ref={headingRef} tabIndex={-1} className="mt-4 font-serif text-xl font-semibold outline-none">
        {verdict}
      </h4>
      <p className="mt-1">
        <span className="font-semibold">How the call ended: </span>
        {d.endingLabel}. {d.endingText}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {assessed ? `An assessed practice call: pass mark ${d.passMark} of ${d.max}, with no critical error. ` : "A practice recommendation, not a mark. "}
        How {b.person} sounded at the end isn’t part of it: a sound call can end with someone still upset, and an unsafe one with them calmer.
      </p>
      {v.purged && (
        <p className={cx(box, "mt-2 text-sm")}>Your words from this call have been deleted after the retention period. The levels and ending are kept.</p>
      )}
      {d.review.length > 0 && (
        <div role="status" className={cx(warnTone, "mt-3")}>
          <p className="font-semibold">Some of this needs a person to check</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {[...new Set(d.review.map(reviewText))].map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {d.criticalFindings.map((c) => (
        <div key={c.risk} role="alert" className={cx(badTone, "mt-3")}>
          <p className="font-semibold">
            {c.by === "model"
              ? "Possible critical error (for review): "
              : c.approved
                ? "Critical error: "
                : "Critical error (threshold awaiting reviewer approval): "}
            {c.text}
          </p>
          {c.quote && <p className="mt-1 text-sm">{c.turn === null ? `In your follow-up: ${c.quote}` : `Reply ${c.turn}: “${c.quote}”`}</p>}
          {c.consequence && (
            <p className="mt-1">
              <span className="font-semibold">What it meant: </span>
              {c.consequence}
            </p>
          )}
          {c.better && (
            <p className="mt-1">
              <span className="font-semibold">A better option: </span>
              {c.better}
            </p>
          )}
        </div>
      ))}

      <h5 className="mt-4 font-semibold">Five things a good call does</h5>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {d.dims.map((x) => (
          <li key={x.dim} className={box}>
            <p className="font-semibold">{x.label}</p>
            <p className="text-sm text-ink-muted">{x.hint}</p>
            <p className="mt-1 text-sm">
              <span className="font-semibold">{x.level === 0 && x.capped === "A critical error here." ? "Critical error" : x.rating}</span> ({x.level} of 3)
            </p>
            <span aria-hidden className="mt-1 flex gap-1">
              {[1, 2, 3].map((i) => (
                <span key={i} className={cx("h-1.5 flex-1 rounded-full", i <= x.level ? "bg-ink" : "bg-line-strong")} />
              ))}
            </span>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {x.criteria.map((c) => (
                <li key={c.id} className="flex items-start gap-1.5">
                  <Icon name={c.met ? "check" : "minus"} className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="sr-only">{c.met ? "Shown: " : "Not yet: "}</span>
                    {c.text}
                    {!c.applies && " (didn’t come up in this call)"}
                  </span>
                </li>
              ))}
            </ul>
            {x.capped && x.capped !== "A critical error here." && <p className="mt-1 text-sm text-ink-muted">{x.capped}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-ink-muted">
        {d.score} of {d.max} across the five. Any respectful wording counts; only your words and choices were read, never your voice.
      </p>

      {d.moments.length > 0 && (
        <>
          <h5 className="mt-4 font-semibold">Moments in the call</h5>
          <ol className="mt-2 flex flex-col gap-2">
            {d.moments.map((m, i) => (
              <li key={i} className={cx(m.good ? goodTone : warnTone, "text-sm")}>
                <p>
                  <span className="font-semibold">
                    Reply {m.turn}
                    {m.good ? ", worth keeping" : m.review ? ", for a reviewer to check" : ", careful"}:
                  </span>{" "}
                  {m.quote ? `“${m.quote}”` : "(your words have been deleted)"}
                </p>
                <p className="mt-0.5">
                  <span className="font-semibold">Behaviour: </span>
                  {m.behaviour}.
                </p>
                {m.consequence && (
                  <p className="mt-0.5">
                    <span className="font-semibold">Consequence: </span>
                    {m.consequence}
                  </p>
                )}
                {m.better && (
                  <p className="mt-0.5">
                    <span className="font-semibold">{m.good ? "Another way to say it: " : "A better option: "}</span>
                    {m.better}
                  </p>
                )}
                {m.source && <p className="mt-0.5 text-xs">Source: {m.source}</p>}
              </li>
            ))}
          </ol>
        </>
      )}

      <h5 className="mt-4 font-semibold">Your follow-up</h5>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {d.note.map((n) => (
          <li key={n.field} className="flex items-start gap-1.5">
            <Icon name={n.ok ? "check" : "info"} className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">{n.label}: </span>
              {n.text}
            </span>
          </li>
        ))}
        {d.actions.map((a) => (
          <li key={a.id} className="flex items-start gap-1.5">
            <Icon name={a.verdict === "risk" ? "alert" : "check"} className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">{a.label}: </span>
              {a.feedback}
            </span>
          </li>
        ))}
      </ul>

      <details className={cx(box, "mt-4")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The reviewed model path, and another valid way</summary>
        <ol className="flex flex-col gap-2 text-sm">
          {d.modelPath.map((m, i) => (
            <li key={i}>
              <p>“{m.line}”</p>
              <p className="text-ink-muted">{m.why}</p>
            </li>
          ))}
        </ol>
        {d.alternative.line && (
          <div className="mt-3 text-sm">
            <p className="font-semibold">Another way that works just as well</p>
            <p>“{d.alternative.line}”</p>
            <p className="text-ink-muted">{d.alternative.why}</p>
          </div>
        )}
      </details>
      <details className={cx(box, "mt-2")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">How {b.person} was, reply by reply (fictional)</summary>
        <ol className="flex flex-col gap-1 text-sm">
          {d.timeline.map((t) => (
            <li key={t.turn}>
              <span className="font-semibold">{t.turn === 0 ? "At the start" : `After reply ${t.turn}`}:</span> {t.state}
            </li>
          ))}
        </ol>
        <p className="mt-1 text-xs text-ink-muted">The made-up character’s state, from authored rules. It isn’t a score and doesn’t measure anyone.</p>
      </details>

      {d.question && (
        <div className={cx(box, "mt-4")}>
          <p className="font-semibold">A question to take away</p>
          <p>{d.question}</p>
        </div>
      )}

      {b.family.jobAid.snippetId && (
        <div className="mt-4">
          <AidSection snippetId={b.family.jobAid.snippetId} why={b.family.jobAid.why} place={place} preview={ctx.preview} />
        </div>
      )}

      <fieldset className={cx(box, "mt-4")}>
        <legend className="px-1 font-semibold">Which part would you like to rehearse next?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {d.next.map((n) => (
            <button key={n.dim} type="button" className={secondary} aria-pressed={next === n.dim} onClick={() => setNext(n.dim)}>
              {n.label}
            </button>
          ))}
        </div>
        {next && (
          <p role="status" className="mt-2 text-sm">
            {d.next.find((n) => n.dim === next)?.text} Try the call again with that in mind.
          </p>
        )}
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={onAgain}>
          <Icon name="refresh" className="size-4" /> Try the call again
        </button>
        {onDelete && (
          <button
            type="button"
            className={quiet}
            onClick={() => {
              if (window.confirm("Delete this call? What you said and wrote in it is removed for good. Having practised stays on your record."))
                void onDelete();
            }}
          >
            <Icon name="trash" className="size-4" /> Delete this call
          </button>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Report a problem with this case</summary>
        {report.sent ? (
          <p role="status">Thanks: the case’s reviewers will see it. Only the kind of problem is sent, not your words.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">What’s wrong</span>
              <select id={`${ids}-kind`} className={field} value={report.kind} onChange={(e) => setReport({ ...report, kind: e.target.value })}>
                <option value="outdated">Out of date</option>
                <option value="incorrect">Incorrect</option>
                <option value="unclear">Unclear</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Where</span>
              <select className={field} value={report.source} onChange={(e) => setReport({ ...report, source: e.target.value })}>
                <option value="case">The case itself</option>
                {b.phone.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={secondary}
              onClick={() => void onReport(report.source, report.kind).then(() => setReport({ ...report, sent: true }))}
            >
              Send
            </button>
          </div>
        )}
      </details>
      <p className="mt-3 text-xs text-ink-muted">
        Scenario {v.versions.scenario} · rubric {v.versions.rubric} · engine {v.versions.engine}
        {v.caller === "bounded-ai" ? " · AI caller within approved facts" : " · reviewed script"}. Practice with fictional people: nothing here is a real
        disclosure, service change, complaint or record.
      </p>
      {ctx.preview && <p className="mt-1 text-sm text-ink-muted">Preview: nothing was recorded.</p>}
    </div>
  );
}
