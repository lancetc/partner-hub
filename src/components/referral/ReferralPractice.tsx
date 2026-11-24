"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { emptyNote, type FamilyNote } from "@/lib/familyCall";
import { CLOSE_FIELDS, DETAILS_NOTICE, GOALS, MAX_STUDIO_REPLY, STUDIO_NOTICE, type Goal, type Stage, type StudioDebrief } from "@/lib/referralStudio";
import type { AttemptView, PracticeView } from "@/server/referralStudio";
import { Icon } from "../Icon";
import { newKey, type Driver } from "./practiceDriver";

/*
  Local Referral Studio practice (docs/local-referral-studio.md): choose a referrer and the older person's stage
  ("unknown" is valid), talk (typed; voice uses the same turns when it's switched on), record the next step, and read
  a five-dimension scorecard with critical claim flags first. Shared by the Work Tool and the Magazine block.

  - The 60-second timer is a coaching aid: off by default, with pause, restart and off. It never ends anything.
  - On a phone, the first view is the referrer, the stage and a large reply box; evidence and cues are a second tab.
    On a desktop, the conversation sits beside a narrow evidence panel.
  - Every status is in words. Nothing plays by itself, and nothing here is sent anywhere but the Hub.
*/

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
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";

type Props = {
  driver: Driver;
  /** The Work Tool's kit, for "make the one-pager for this stage". */
  onMakeKit?: (p: { stage: Stage; audience: string; scenarioId: string }) => void;
  /** The debrief has been read (the block reports its activity). */
  onFinished?: (d: StudioDebrief) => void;
  preview?: boolean;
  /** A view already loaded (the Work Tool has it, and the render tests pass one): the first load is skipped. */
  initial?: PracticeView;
};

export function ReferralPractice({ driver, onMakeKit, onFinished, preview, initial }: Props) {
  const [view, setView] = useState<PracticeView | null>(initial ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (initial) return;
    let live = true;
    driver.load().then(
      (v) => live && setView(v),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [driver, initial]);
  const act = async (body: Record<string, unknown>) => {
    // A draft of the close note saves in the background: it never disables the buttons or replaces what's on screen.
    const background = body.action === "note";
    if (!background) setBusy(true);
    setError("");
    try {
      const v = await driver.act(body);
      if (!background) setView(v);
      return v;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
      return null;
    } finally {
      if (!background) setBusy(false);
    }
  };
  if (!view)
    return error ? (
      <p role="alert" className={badTone}>
        {error}
      </p>
    ) : (
      <p className="text-ink-muted">Loading the practice…</p>
    );
  const cur = view.current;
  const showPick = choosing || !cur || cur.screen === "left";
  return (
    <div className="min-w-0 space-y-4">
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>{STUDIO_NOTICE}</span>
      </p>
      {error && (
        <p role="alert" className={badTone}>
          {error}
        </p>
      )}
      {showPick ? (
        <Pick
          view={view}
          busy={busy}
          onStart={async (b) => {
            const v = await act({ action: "start", ...b });
            if (v) setChoosing(false);
          }}
          onCancel={cur && cur.screen !== "left" ? () => setChoosing(false) : undefined}
        />
      ) : cur.screen === "talk" ? (
        <Talk view={view} cur={cur} busy={busy} act={act} />
      ) : cur.screen === "close" ? (
        <Close view={view} cur={cur} busy={busy} act={act} preview={preview} />
      ) : (
        <Debrief view={view} cur={cur} busy={busy} act={act} onAnother={() => setChoosing(true)} onMakeKit={onMakeKit} onFinished={onFinished} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Choosing a referrer and a stage
// ---------------------------------------------------------------------------------------------

function Pick({
  view,
  busy,
  onStart,
  onCancel,
}: {
  view: PracticeView;
  busy: boolean;
  onStart: (b: { scenarioId: string; stage: string; retain: boolean }) => void;
  onCancel?: () => void;
}) {
  const [goal, setGoal] = useState<Goal | "">("");
  const [scenario, setScenario] = useState(view.scenarios[0]?.id ?? "");
  const [stage, setStage] = useState("");
  const [retain, setRetain] = useState(true);
  const shown = view.scenarios.filter((s) => !goal || s.goal === goal);
  const sc = view.scenarios.find((s) => s.id === scenario);
  const goals = [...new Set(view.scenarios.map((s) => s.goal))];
  return (
    <div className="space-y-5">
      {goals.length > 1 && (
        <fieldset>
          <legend className="font-semibold">1. Choose a goal</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["", ...goals] as (Goal | "")[]).map((g) => (
              <button
                key={g || "all"}
                type="button"
                aria-pressed={goal === g}
                className={cx(
                  "min-h-11 rounded-full px-4 font-semibold ring-1 ring-line",
                  goal === g ? "bg-action text-on-action" : "bg-surface hover:bg-muted",
                )}
                onClick={() => {
                  setGoal(g);
                  const first = view.scenarios.find((s) => !g || s.goal === g);
                  if (first) setScenario(first.id);
                  setStage("");
                }}
              >
                {g ? GOALS[g] : "Any goal"}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="font-semibold">{goals.length > 1 ? "2." : "1."} Choose a referrer</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {shown.map((s) => (
            <label
              key={s.id}
              className={cx(
                "flex min-w-0 cursor-pointer gap-3 rounded-2xl p-4 ring-1",
                scenario === s.id ? "bg-muted ring-2 ring-action" : "bg-surface ring-line",
              )}
            >
              <input
                type="radio"
                name="referrer"
                className="mt-1 size-5 shrink-0"
                checked={scenario === s.id}
                onChange={() => {
                  setScenario(s.id);
                  setStage("");
                }}
              />
              <span className="min-w-0">
                <span className="block font-semibold">{s.persona.label}</span>
                <span className="block text-sm text-ink-muted">
                  {s.persona.setting} {s.persona.timePressure}
                </span>
                <span className="mt-1 block text-sm">
                  <span className="font-semibold">Likely objection:</span> {s.persona.objection}
                </span>
                <span className="mt-1 block text-xs text-ink-muted">
                  {s.goalLabel} · {s.minutes} · fictional
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {sc && (
        <>
          <div className={box}>
            <p className={kicker}>Briefing</p>
            <p className="mt-1">{sc.brief}</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">The older person’s agency:</span> {sc.persona.agency}
            </p>
            {sc.avaBrief && (
              <p className="mt-2 text-sm text-ink-muted">
                <span className="font-semibold">Ava, your host:</span> {sc.avaBrief}
              </p>
            )}
          </div>
          <fieldset>
            <legend className="font-semibold">{goals.length > 1 ? "3." : "2."} Choose the older person’s stage</legend>
            <p className="text-sm text-ink-muted">“Unknown” is a valid choice: then the first job is to find out.</p>
            <div className="mt-2 grid gap-2">
              {sc.stages.map((x) => (
                <label
                  key={x.stage}
                  className={cx(
                    "flex min-w-0 cursor-pointer gap-3 rounded-2xl p-3 ring-1",
                    stage === x.stage ? "bg-muted ring-2 ring-action" : "bg-surface ring-line",
                  )}
                >
                  <input type="radio" name="stage" className="mt-1 size-5 shrink-0" checked={stage === x.stage} onChange={() => setStage(x.stage)} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{x.label}</span>
                    <span className="block text-sm">{x.situation}</span>
                    <span className="block text-xs text-ink-muted">{x.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="font-semibold">Before you start</legend>
            <p className="text-sm">
              <Icon name="info" className="mr-1 inline size-4" />
              {DETAILS_NOTICE}
            </p>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0" checked={retain} onChange={(e) => setRetain(e.target.checked)} />
              <span>
                Keep my words with this practice so I can see the debrief later.{" "}
                <span className="text-ink-muted">Untick for an unsaved practice: your words go when you start another or after a day.</span>
              </span>
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy || !stage} onClick={() => onStart({ scenarioId: sc.id, stage, retain })}>
              <Icon name="chat" className="size-4" /> Start the conversation
            </button>
            {onCancel && (
              <button type="button" className={secondary} onClick={onCancel}>
                Back to my practice
              </button>
            )}
          </div>
          {!stage && <p className="text-sm text-ink-muted">Choose a stage to start.</p>}
          {view.ai && (
            <p className="text-xs text-ink-muted">
              The referrer’s lines may be paraphrased by an AI model held to the reviewed script. It never sees anything you didn’t type here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------------------------

function Timer() {
  const [on, setOn] = useState(false);
  const [left, setLeft] = useState(60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!on || !running) return;
    const t = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [on, running]);
  if (!on)
    return (
      <button type="button" className={quiet} onClick={() => (setOn(true), setRunning(true), setLeft(60))}>
        <Icon name="clock" className="size-4" /> Use a 60-second coaching timer
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm" role="group" aria-label="Coaching timer">
      <span className="font-semibold tabular-nums" aria-live="off">
        {left > 0 ? `${left} s left` : "That’s your minute. Keep going if you like."}
      </span>
      <button type="button" className={quiet} onClick={() => setRunning((r) => !r)} disabled={left === 0}>
        <Icon name={running ? "pause" : "play"} className="size-4" /> {running ? "Pause" : "Resume"}
      </button>
      <button type="button" className={quiet} onClick={() => (setLeft(60), setRunning(true))}>
        <Icon name="refresh" className="size-4" /> Restart
      </button>
      <button type="button" className={quiet} onClick={() => (setOn(false), setRunning(false))}>
        Turn off
      </button>
    </div>
  );
}

function Talk({
  view,
  cur,
  busy,
  act,
}: {
  view: PracticeView;
  cur: AttemptView;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<PracticeView | null>;
}) {
  const sc = view.scenarios.find((s) => s.id === cur.scenarioId);
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"talk" | "evidence">("talk");
  const end = useRef<HTMLDivElement>(null);
  // Braces: in newer browsers scrollIntoView returns a promise, which an effect mustn't return.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [cur.transcript.length]);
  const who = `${sc?.persona.label ?? "Referrer"} (fictional)`;
  const send = async () => {
    const t = text.trim();
    if (t.length < 2) return;
    const v = await act({ action: "turn", turnId: newKey("turn"), text: t, mode: "text" });
    if (v) setText("");
  };
  const evidence = (
    <div className="space-y-3">
      {cur.cues.length > 0 && (
        <div className={box}>
          <p className={kicker}>Practice cues</p>
          <ul className="mt-1 space-y-1 text-sm">
            {cur.cues.map((c) => (
              <li key={c.id}>
                <span className="font-semibold">{/[.?!]$/.test(c.label) ? c.label : `${c.label}.`}</span> {c.why}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">Cues come from the scenario’s authored rules. They aren’t a score.</p>
        </div>
      )}
      <div className={box}>
        <p className={kicker}>Evidence</p>
        <ul className="mt-2 space-y-2">
          {cur.evidence.map((x) => (
            <li key={x.id}>
              {x.opened ? (
                <>
                  <p className="font-semibold">{x.label}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {x.facts.map((f, i) => (
                      <li key={i}>
                        {f.text}{" "}
                        <span className="text-xs text-ink-muted">
                          ({f.statusLabel}. {f.source})
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <button type="button" className={secondary} disabled={busy} onClick={() => void act({ action: "evidence", section: x.id })}>
                  <Icon name="eye" className="size-4" /> {x.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Approved wording (claim register)</summary>
        <ul className="mt-2 space-y-2 text-sm">
          {view.claims.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.topic}:</span> {c.text || "Not available: check with its owner."}{" "}
              <span className="text-xs text-ink-muted">({c.label})</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={kicker}>Practice · fictional</p>
          <h3 className="font-serif text-xl font-semibold">{sc?.persona.label}</h3>
          <p className="text-sm text-ink-muted">
            Stage you chose: <span className="font-semibold text-ink">{cur.stageLabel}</span> · reply {cur.call.turn} of up to {cur.call.maxTurns}
          </p>
        </div>
        <Timer />
      </div>
      <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Practice views">
        {(["talk", "evidence"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={cx("min-h-11 flex-1 rounded-full font-semibold ring-1 ring-line", tab === t ? "bg-action text-on-action" : "bg-surface")}
            onClick={() => setTab(t)}
          >
            {t === "talk" ? "Conversation" : `Evidence${cur.cues.length ? ` (${cur.cues.length})` : ""}`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={cx("min-w-0 space-y-3", tab !== "talk" && "hidden lg:block")}>
          <ol className="space-y-3" aria-label="The conversation so far">
            <Line who={who} them>
              {sc?.opening}
            </Line>
            {cur.transcript.map((t) => (
              <li key={t.n} className="space-y-3">
                <ol className="space-y-3">
                  <Line who="You">{t.text}</Line>
                  <Line who={t.by === "safety" ? "Practice stopped" : who} them>
                    {t.reply}
                  </Line>
                </ol>
              </li>
            ))}
          </ol>
          <div ref={end} />
          {cur.notice && <p className={warnTone}>{cur.notice}</p>}
          {cur.call.safety && (
            <div className={badTone} role="alert">
              <p className="font-semibold">{cur.call.safety.label}</p>
              <p>{cur.call.safety.guidance}</p>
            </div>
          )}
          <label className="block">
            <span className="font-semibold">Your reply</span>
            <textarea
              className={cx(field, "mt-1 min-h-32")}
              value={text}
              maxLength={MAX_STUDIO_REPLY}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
              }}
              placeholder="What would you say? Use roles, not names."
              disabled={busy}
            />
            <span className="mt-1 block text-xs text-ink-muted">
              {text.length} of {MAX_STUDIO_REPLY} characters. Ctrl+Enter sends.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy || text.trim().length < 2} onClick={() => void send()}>
              <Icon name="arrow-right" className="size-4" /> Send
            </button>
            <button type="button" className={secondary} disabled={busy || cur.call.turn < 1} onClick={() => void act({ action: "end", how: "end" })}>
              End and record the next step
            </button>
            <button type="button" className={quiet} disabled={busy} onClick={() => void act({ action: "end", how: "exit" })}>
              Leave this practice
            </button>
          </div>
        </div>
        <aside className={cx("min-w-0", tab !== "evidence" && "hidden lg:block")} aria-label="Evidence and cues">
          {evidence}
        </aside>
      </div>
    </div>
  );
}

function Line({ who, them, children }: { who: string; them?: boolean; children: React.ReactNode }) {
  return (
    <li className={cx("min-w-0 rounded-2xl p-3 ring-1 ring-line", them ? "bg-muted" : "ml-6 bg-surface")}>
      <p className="text-xs font-semibold text-ink-muted">{who}</p>
      <p className="break-words">{children}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Recording the next step
// ---------------------------------------------------------------------------------------------

function Close({
  view,
  cur,
  busy,
  act,
  preview,
}: {
  view: PracticeView;
  cur: AttemptView;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<PracticeView | null>;
  preview?: boolean;
}) {
  const sc = view.scenarios.find((s) => s.id === cur.scenarioId);
  const [note, setNote] = useState<FamilyNote>(cur.note ?? emptyNote());
  const draft = () => {
    if (!preview) void act({ action: "note", note });
  };
  return (
    <div className="space-y-4">
      <div>
        <p className={kicker}>The close</p>
        <h3 className="font-serif text-xl font-semibold">What happens next, and who owns it?</h3>
        <p className="text-sm text-ink-muted">Roles and plain words only. No names, dates of birth or patient details.</p>
      </div>
      {cur.call.ended === "early" && <p className={warnTone}>You ended before the referrer’s main question. Your debrief will say what wasn’t tested.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(CLOSE_FIELDS) as (keyof typeof CLOSE_FIELDS)[]).map((k) => (
          <label key={k} className={cx("block", (k === "agreed" || k === "unknown") && "sm:col-span-2")}>
            <span className="font-semibold">{CLOSE_FIELDS[k].label}</span>
            <span className="block text-sm text-ink-muted">{CLOSE_FIELDS[k].hint}</span>
            {k === "owner" || k === "nextContact" ? (
              <input className={cx(field, "mt-1")} value={note[k]} onChange={(e) => setNote({ ...note, [k]: e.target.value })} onBlur={draft} maxLength={160} />
            ) : (
              <textarea
                className={cx(field, "mt-1 min-h-20")}
                value={note[k]}
                onChange={(e) => setNote({ ...note, [k]: e.target.value })}
                onBlur={draft}
                maxLength={800}
              />
            )}
          </label>
        ))}
      </div>
      {sc && sc.wrapUp.length > 0 && (
        <fieldset>
          <legend className="font-semibold">The next steps you’d take (choose any)</legend>
          <div className="mt-2 space-y-2">
            {sc.wrapUp.map((w) => (
              <label key={w.id} className="flex min-h-11 items-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={note.actions.includes(w.id)}
                  onChange={(e) => setNote({ ...note, actions: e.target.checked ? [...note.actions, w.id] : note.actions.filter((x) => x !== w.id) })}
                />
                <span>{w.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button type="button" className={primary} disabled={busy} onClick={() => void act({ action: "submit", note })}>
        <Icon name="check" className="size-4" /> See my debrief
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

function Debrief({
  view,
  cur,
  busy,
  act,
  onAnother,
  onMakeKit,
  onFinished,
}: {
  view: PracticeView;
  cur: AttemptView;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<PracticeView | null>;
  onAnother: () => void;
  onMakeKit?: Props["onMakeKit"];
  onFinished?: Props["onFinished"];
}) {
  const d = cur.debrief;
  const sc = view.scenarios.find((s) => s.id === cur.scenarioId);
  const told = useRef(false);
  useEffect(() => {
    if (!d || told.current) return;
    told.current = true;
    if (cur.status === "submitted") void act({ action: "viewed" });
    onFinished?.(d);
  }, [d, cur.status, act, onFinished]);
  if (!d) return <p className={warnTone}>This practice ended without a debrief.</p>;
  return (
    <div className="space-y-5">
      <div className={d.ready ? goodTone : d.critical ? badTone : warnTone}>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em]">
          {sc?.persona.label} · {d.stageLabel}
        </p>
        <p className="mt-1 font-serif text-2xl font-semibold">
          {d.ready ? "Ready to use" : d.critical ? "A critical claim to fix: try again" : "Worth another go"}
        </p>
        <p className="mt-1">
          {d.score} of {d.max} ({d.percent}%). A learning aid, not a credential, and not a prediction of real referrals.
        </p>
        {cur.purged && <p className="mt-1 text-sm">Your words have been removed, as agreed. The levels stay.</p>}
      </div>

      {d.claimFindings.length > 0 && (
        <section aria-labelledby="claims-h" className="space-y-3">
          <h3 id="claims-h" className="font-serif text-xl font-semibold">
            Critical claims, first
          </h3>
          {d.claimFindings.map((c, i) => (
            <div key={`${c.turn}-${c.claim}-${i}`} className={badTone}>
              <p className="font-semibold">{c.topic}</p>
              {c.quote && (
                <p className="mt-1">
                  <span className="font-semibold">What you said (reply {c.turn}):</span> “{c.quote}”
                </p>
              )}
              <p className="mt-1">
                <span className="font-semibold">Why it matters:</span> {c.doNot}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Say instead:</span> {c.correction.text} <span className="text-sm">({c.correction.label})</span>
              </p>
              {c.note && <p className="mt-1 text-sm">{c.note}</p>}
              <p className="mt-1 text-sm">
                Source:{" "}
                {c.source.url ? (
                  <a className="underline" href={c.source.url} target={c.source.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                    {c.source.title}
                  </a>
                ) : (
                  c.source.title
                )}
                . Owner: {c.owner}.
              </p>
            </div>
          ))}
        </section>
      )}
      {d.base.criticalFindings
        .filter((c) => !d.claimFindings.some((x) => x.turn === c.turn))
        .map((c) => (
          <div key={c.risk} className={badTone}>
            <p className="font-semibold">{c.text}</p>
            {c.quote && <p className="mt-1">“{c.quote}”</p>}
            <p className="mt-1">{c.consequence}</p>
            {c.better && (
              <p className="mt-1">
                <span className="font-semibold">Better:</span> {c.better}
              </p>
            )}
          </div>
        ))}

      <section className={box} aria-labelledby="stage-h">
        <h3 id="stage-h" className="font-semibold">
          The stage, and the next step it calls for
        </h3>
        <p className="mt-1">{d.stageNote}</p>
        <p className="mt-2">
          <span className="font-semibold">Next step:</span> {d.next.step}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">Boundary:</span> {d.next.boundary}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {d.base.endingLabel}. {d.base.endingText}
        </p>
      </section>

      <section aria-labelledby="score-h">
        <h3 id="score-h" className="font-serif text-xl font-semibold">
          The scorecard
        </h3>
        <ul className="mt-2 space-y-3">
          {d.dims.map((x) => (
            <li key={x.dim} className={box}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{x.label}</p>
                <p className="text-sm">
                  <span className="font-semibold">{x.rating}</span> ({x.level} of 3)
                </p>
              </div>
              <p className="text-sm text-ink-muted">{x.hint}</p>
              {x.capped && <p className="mt-1 text-sm font-semibold">{x.capped}</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {x.criteria.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <Icon name={c.met ? "circle-check" : "minus"} className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="sr-only">{c.met ? "Shown: " : "Not shown: "}</span>
                      {c.text}
                    </span>
                  </li>
                ))}
              </ul>
              {x.evidence.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {x.evidence.map((e, i) => (
                    <li key={i} className="break-words">
                      <span className="font-semibold">
                        {e.good ? "Your words" : "Needs care"} (reply {e.turn}):
                      </span>{" "}
                      “{e.quote}”
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {d.base.modelPath.length > 0 && (
        <section className={box} aria-labelledby="rev-h">
          <h3 id="rev-h" className="font-semibold">
            A suggested revision
          </h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {d.base.modelPath.map((m, i) => (
              <li key={i}>
                “{m.line}” <span className="block text-sm text-ink-muted">{m.why}</span>
              </li>
            ))}
          </ol>
          {d.base.question && (
            <p className="mt-3 text-sm">
              <span className="font-semibold">To think about:</span> {d.base.question}
            </p>
          )}
          {d.base.avaDebrief && <p className="mt-2 text-sm text-ink-muted">{d.base.avaDebrief}</p>}
        </section>
      )}

      {cur.transcript.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer font-semibold">The conversation, line by line</summary>
          <ol className="mt-2 space-y-2 text-sm">
            {cur.transcript.map((t) => (
              <li key={t.n} className="break-words">
                <p>
                  <span className="font-semibold">You:</span> {t.text}
                </p>
                <p className="text-ink-muted">
                  <span className="font-semibold">{sc?.persona.label}:</span> {t.reply}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={() => void act({ action: "start", scenarioId: cur.scenarioId, stage: cur.stage, retain: cur.retain })}
        >
          <Icon name="refresh" className="size-4" /> Try again
        </button>
        <button type="button" className={secondary} onClick={onAnother}>
          Practise another
        </button>
        {onMakeKit && sc && (
          <button
            type="button"
            className={secondary}
            onClick={() => onMakeKit({ stage: d.stageAsked ? d.actual : cur.stage, audience: sc.persona.role, scenarioId: sc.id })}
          >
            <Icon name="doc" className="size-4" /> Make the one-pager for this stage
          </button>
        )}
        <button type="button" className={quiet} disabled={busy} onClick={() => void act({ action: "delete", attemptId: cur.attemptId })}>
          <Icon name="trash" className="size-4" /> Delete this practice
        </button>
      </div>
      <p className="text-sm">
        {!onMakeKit && view.toolAccess && (
          <>
            <Link className="font-semibold text-accent underline" href="/tools/referral-studio">
              Open the Local Referral Studio Work Tool
            </Link>{" "}
            for your business’s approved one-pager and pitch card.{" "}
          </>
        )}
        To see which referral relationships become active clients, use the{" "}
        <Link className="font-semibold text-accent underline" href={view.referralJourney}>
          Referral Journey Calculator
        </Link>
        .
      </p>
    </div>
  );
}
