"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ReliabilityBlock } from "@/lib/magazine";
import { CATEGORIES, CAUSES, type Category, type Cause } from "@/lib/workloadLens";
import { SERVICES, type Service } from "@/lib/suburbCoverage";
import {
  BAND_ORDER,
  BEARS,
  blankInputs,
  blankRow,
  calculate,
  comparisonCard,
  COST_KINDS,
  COST_ORDER,
  dateLabel,
  EVIDENCE_SOURCES,
  hrs,
  inputChanges,
  INTERVENTION_KINDS,
  MODEL_VERSION,
  money,
  NOT_ASSESSED,
  OUTCOME_HINTS,
  OUTCOME_ORDER,
  OUTCOMES,
  REASON_HINTS,
  REASON_ORDER,
  REASONS,
  RESTORE_BANDS,
  RESTORE_WINDOWS,
  resultChanges,
  round1,
  TIME_WINDOWS,
  validateInputs,
  weekOf,
  WINDOW_ORDER,
  windowLabel,
  type Amount,
  type Bears,
  type CostItem,
  type CostKind,
  type Duration,
  type EvidenceSource,
  type InputError,
  type Intervention,
  type InterventionKind,
  type Num,
  type Occurrence,
  type Outcome,
  type Reason,
  type RecoveryTask,
  type ReliabilityInputs,
  type ReliabilityResult,
  type Window,
} from "@/lib/serviceReliability";
import {
  buildDebrief,
  CARD_CHOICES,
  CHOICE_ORDER,
  currentInputs,
  emptyState,
  finishProblems,
  LAST,
  LEVELS,
  STEPS,
  type Card,
  type CardChoice,
  type Option,
  type ReliabilityDebrief,
  type ReliabilityState,
} from "@/lib/reliabilityLab";
import type { ReliabilityView } from "@/server/serviceReliability";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "What does a missed service cost?" (docs/service-reliability.md). A feature-article decision, not a bare calculator:
  Mrs Patel's empty Tuesday and the first response; a first guess; the coordinator's log, classified by cause; the
  repair work, counted once; the repeat, read on the reliability timeline; a reliability action tested beside a
  referral push; the later check; then the debrief and a learning Reliability Decision Sheet. The figures come from the
  shared model (lib/serviceReliability); the debrief comes from the server once the attempt is finished.

  One story beat at a time, with the current result beside it. Care, workload and money are separate results; there's
  no single cost figure and no verdict. Every chart has a table carrying the same figures; status is in words and
  shape as well as colour; every figure has a number field; blank, unknown and zero are shown apart; nothing animates.

  "Review my service reliability" appears only for a business owner and the members they've authorised (the server
  decides). It starts blank, never with the story's figures, asks for aggregate counts by service and time window
  (never a person, a worker, a complaint or a fee term), saves only when asked, and keeps unsaved entries in this page.

  In the editor's preview it runs against the block as written, locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const small = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const link = "font-semibold text-accent underline underline-offset-2";
const TONE = {
  good: "bg-[#dff3ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
  warn: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  bad: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
/** Outcomes, told apart by a symbol and a pattern as well as colour. */
const LOOK: Record<Outcome, { mark: string; style: React.CSSProperties }> = {
  delivered: { mark: "✓", style: { background: "#008282" } },
  late: { mark: "◷", style: { background: "repeating-linear-gradient(135deg, #c26a12 0 5px, #e7a35a 5px 9px)" } },
  replaced: { mark: "↺", style: { background: "repeating-linear-gradient(90deg, #4f7fb0 0 3px, #9fbad8 3px 6px)" } },
  missed: { mark: "✕", style: { background: "#7a1f1a" } },
  unknown: { mark: "?", style: { background: "repeating-linear-gradient(45deg, #8a8f98 0 3px, #c9ccd1 3px 6px)" } },
};
const FICTIONAL =
  "Fictional case: Maya, Mrs Patel, the other clients, the supplier and every figure are invented for practice. They aren’t Trilogy Care rates, a supplier’s record, a claim rule or a cancellation policy.";
const pct = (v: Num) => (v === null ? "blank" : `${Math.round(v * 100)}%`);
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const safeCalc = (i: ReliabilityInputs) => (validateInputs(i).length ? null : calculate(i));

export function ServiceReliabilityLab({ block: b, ctx }: { block: ReliabilityBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/reliability");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canReview = Boolean(business.data?.access);
  return (
    <section
      aria-label={`Service Reliability Calculator: ${b.title}`}
      className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7"
    >
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="calendar" className="size-5" /> Service Reliability Calculator
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-ink">
          {mode === "story" ? `Fictional month · ${b.storyVersion}` : "Your business · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canReview && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with a fictional month"],
              ["business", "Review my service reliability"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", mode === m ? "bg-action text-on-action" : "text-ink-muted hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "story" ? (
        <Practice b={b} ctx={ctx} />
      ) : (
        <ReviewMine
          orgName={business.data?.access?.orgName ?? ""}
          b={b}
          onSaved={(version) => {
            if (!ctx.preview) api(`/api/magazine/${ctx.guideId}/reliability`, { body: { blockId: b.id, action: "saved", version } }).catch(() => undefined);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practise with a fictional month
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: ReliabilityBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/reliability`;
  const loaded = useApi<ReliabilityView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<ReliabilityState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<ReliabilityDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [step, setStep] = useState(0);
  const [whatChanged, setWhatChanged] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);
  const [lastGood, setLastGood] = useState<ReliabilityResult | null>(null);

  const take = (v: ReliabilityView) => {
    setS(v.state);
    setDebrief(v.debrief);
    setAttemptNo(v.attemptNo);
    setStep(Math.min(v.state.stage, LAST));
  };
  if (!ctx.preview && loaded.data && s === null) take(loaded.data);

  useEffect(() => {
    if (ctx.preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id]);
  useEffect(() => {
    if (!debrief || ctx.preview || !justFinished.current) return;
    justFinished.current = false;
    ctx.activity(b.id, { outcome: "finished", score: debrief.score, total: debrief.max });
    ctx.engaged(b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debrief]);

  const mine = useMemo(() => (s ? currentInputs(b, s) : null), [b, s]);
  const live = useMemo(() => (mine ? safeCalc(mine) : null), [mine]);
  // An incomplete set of figures keeps the last valid calculation, labelled as such.
  if (live && lastGood !== live) setLastGood(live);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s || !mine) return <p className="mt-4 text-ink-muted">Loading…</p>;
  const r = live ?? lastGood;

  const update = (fn: (prev: ReliabilityState) => ReliabilityState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  /** A change to the figures (a classification, an action, an assumption), with "what changed" before and after. */
  const change = (fn: (prev: ReliabilityState) => ReliabilityState) => {
    dirty.current = true;
    const next = fn(s);
    const a = currentInputs(b, s);
    const z = currentInputs(b, next);
    const ra = safeCalc(a);
    const rz = safeCalc(z);
    const lines = [...inputChanges(a, z), ...(ra && rz ? resultChanges(ra, rz) : [])];
    if (lines.length) setWhatChanged(lines);
    setS(next);
  };
  const go = (to: number) => {
    setStep(to);
    setWhatChanged([]);
    if (to > s.stage) update((p) => ({ ...p, stage: Math.max(p.stage, to) }));
    requestAnimationFrame(() => top.current?.focus());
  };
  const inspect = (what: string) => {
    if (!s.inspected.includes(what)) update((p) => (p.inspected.includes(what) ? p : { ...p, inspected: [...p.inspected, what] }));
  };
  const send = async (body: Record<string, unknown>, local: () => ReliabilityState) => {
    setProblem(null);
    if (ctx.preview) {
      const next = local();
      setS(next);
      if (next.stage === LAST) setDebrief(buildDebrief(b, next, MODEL_VERSION));
      return next;
    }
    setBusy(true);
    try {
      dirty.current = false;
      const v = await api<ReliabilityView>(url, { body: { blockId: b.id, ...body } });
      take(v);
      return v.state;
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setProblem([err.message, ...(err.problems ?? []).map((p) => `• ${p}`)].join("\n"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const finished = s.stage === LAST && debrief;
  const shown = finished ? step : Math.min(step, LAST - 1);
  const allCards = b.cards.every((c) => s.cards[c.id]?.choice && (!c.askUrgent || s.cards[c.id]?.urgent !== null));
  const allEntries = b.log.entries.every((e) => e.id in s.entries);

  return (
    <div className="mt-3">
      <p className="rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{FICTIONAL}</p>
      <ol aria-label="Where you are" className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {STEPS.map((label, i) => {
          const reachable = i <= s.stage && (i < LAST || Boolean(finished));
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={i === shown ? "step" : undefined}
                onClick={() => go(i)}
                className={cx(
                  "min-h-8 rounded-full px-2.5 py-1 font-semibold",
                  i === shown ? "bg-action text-on-action" : reachable ? "bg-tealtint hover:underline" : "bg-muted text-ink-muted",
                )}
              >
                {i + 1}. {label}
              </button>
            </li>
          );
        })}
        {attemptNo > 1 && <li className="rounded-full bg-muted px-2.5 py-1 font-semibold">Attempt {attemptNo}</li>}
      </ol>
      {shown >= 2 && shown < LAST && r && <Summary r={r} stale={!live} />}

      <div className="mt-4">
        <h4 ref={top} tabIndex={-1} className="sr-only">
          {STEPS[shown]}
        </h4>
        {shown === 0 && (
          <Tuesday b={b} chosen={s.response} locked={Boolean(s.prediction)} onPick={(id) => update((p) => ({ ...p, response: id }))} onNext={() => go(1)} />
        )}
        {shown === 1 && (
          <Guess
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (failures, cost) => {
              const next = await send({ action: "predict", response: s.response, prediction: { failures, cost } }, () => ({
                ...s,
                prediction: { failures, cost },
                stage: Math.max(s.stage, 2),
              }));
              if (next) go(2);
            }}
            onNext={() => go(2)}
          />
        )}
        {shown === 2 && (
          <div className="flex flex-col gap-4">
            <p>
              Maya’s coordinator kept a log. Not every entry is what it looks like. For each one, choose <strong>what it is</strong>: who or what started it, or
              whether it’s a missed visit at all. Where asked, say whether it needs the escalation process now.
            </p>
            <ReasonGuide />
            {b.cards.map((c) => (
              <CardView key={c.id} c={c} answer={s.cards[c.id]} onAnswer={(a) => change((p) => ({ ...p, cards: { ...p.cards, [c.id]: a } }))} />
            ))}
            <WhatChanged lines={whatChanged} />
            <Next
              disabled={!allCards}
              hint="Classify every entry first (and answer the urgency question)."
              onClick={() => go(3)}
              label="Count the repair work"
            />
          </div>
        )}
        {shown === 3 && (
          <Repair
            b={b}
            s={s}
            r={r}
            allMarked={allEntries}
            onMark={(id, v) => update((p) => ({ ...p, entries: { ...p.entries, [id]: v } }))}
            onNext={() => go(4)}
          />
        )}
        {shown === 4 && r && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="The repeat" text={b.story.repeat} names={[b.story.participant]} />
            <Timeline inputs={mine} r={r} issues={b.inputs.issues} opened={s.inspected} onOpen={inspect} />
            <Recovery r={r} inputs={mine} />
            <Question
              legend={b.repeat.prompt}
              name="repeat"
              options={b.repeat.options}
              value={s.repeat}
              onChange={(id) => update((p) => ({ ...p, repeat: id }))}
            />
            <Next
              disabled={!s.repeat || !s.inspected.some((x) => x.startsWith("occ:"))}
              hint="Open at least one visit on the timeline, and answer the question."
              onClick={() => go(5)}
              label="Weigh the competing investment"
            />
          </div>
        )}
        {shown === 5 && r && (
          <Investment
            b={b}
            s={s}
            inputs={mine}
            r={r}
            whatChanged={whatChanged}
            onToggle={(id) => change((p) => ({ ...p, tried: p.tried.includes(id) ? p.tried.filter((x) => x !== id) : [...p.tried, id], changed: true }))}
            onReduction={(id, v) => change((p) => ({ ...p, estimates: { ...p.estimates, [id]: { reduction: v } }, changed: true }))}
            onFreed={(v) => change((p) => ({ ...p, freedHours: v }))}
            onLeads={() => inspect("leads")}
            onPick={(k, v) => update((p) => ({ ...p, [k]: v }))}
            onNext={() => go(6)}
          />
        )}
        {shown === 6 && !finished && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="The later check" text={b.story.later} names={[b.story.participant]} />
            {b.story.voice && (
              <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
                <blockquote className="font-serif text-lg italic">{b.story.voice}</blockquote>
                <figcaption className="mt-2 text-sm text-ink-muted">{b.story.participant}, four weeks later</figcaption>
              </figure>
            )}
            <Question legend={b.later.prompt} name="later" options={b.later.options} value={s.later} onChange={(id) => update((p) => ({ ...p, later: id }))} />
            {finishProblems(b, s).length > 0 && s.later && (
              <ul className="list-disc pl-5 text-sm text-ink-muted">
                {finishProblems(b, s).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={primary}
                disabled={busy || finishProblems(b, s).length > 0}
                onClick={async () => {
                  justFinished.current = true;
                  const next = await send({ action: "finish", decision: s.decision, explanation: s.explanation, later: s.later }, () => ({
                    ...s,
                    stage: LAST,
                  }));
                  if (next?.stage === LAST) go(LAST);
                }}
              >
                See the debrief and Decision Sheet <Icon name="arrow-right" className="size-4" />
              </button>
            </div>
          </div>
        )}
        {shown >= 6 && finished && debrief && (
          <Debrief
            b={b}
            s={s}
            d={debrief}
            busy={busy}
            onPrint={() => {
              if (!ctx.preview) api(url, { body: { blockId: b.id, action: "printed" } }).catch(() => undefined);
              printSheet();
            }}
            onRetry={async () => {
              const next = await send({ action: "retry" }, () => ({ ...emptyState(), retries: s.retries + 1 }));
              if (next) {
                setDebrief(null);
                setStep(0);
                setWhatChanged([]);
              }
            }}
          />
        )}
        {problem && (
          <p role="alert" className="mt-3 whitespace-pre-line rounded-2xl border border-danger/60 p-3 text-sm">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

function Next({ onClick, label, disabled, hint }: { onClick: () => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primary} onClick={onClick} disabled={disabled}>
        {label} <Icon name="arrow-right" className="size-4" />
      </button>
      {disabled && hint && <span className="text-sm text-ink-muted">{hint}</span>}
    </div>
  );
}

function WhatChanged({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div role="status" className={box}>
      <p className={kicker}>What changed?</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {lines.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function StoryBeat({ title, text, names }: { title: string; text: string; names: string[] }) {
  if (!text) return null;
  return (
    <div className={box}>
      <CharacterRow names={names} size="md">
        <p className={kicker}>{title}</p>
        <p className="mt-1">{text}</p>
      </CharacterRow>
    </div>
  );
}

/** The current result: care, workload and money, kept apart. */
function Summary({ r, stale = false }: { r: ReliabilityResult; stale?: boolean }) {
  const open = r.recovery.booked + r.recovery.unresolved;
  return (
    <div className={cx(box, "mt-3")} role="status" aria-live="polite">
      <p className={kicker}>The month so far{stale ? " · showing the last valid result until every figure is filled in" : ""}</p>
      <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">Care</dt>
          <dd>
            {open} {open === 1 ? "visit" : "visits"} still open
            {r.recovery.essentialOpen ? `, ${r.recovery.essentialOpen} essential` : ""}; verified supplier misses {r.supplierRate.text}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Coordinator work</dt>
          <dd>
            {hrs(r.effort.hours)} of unique recovery tasks{r.effort.unmeasured ? `, ${r.effort.unmeasured} not measured` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Direct business cost</dt>
          <dd>
            {money(r.cost.observedDirect)}
            {!r.cost.labourAssessed ? ` plus labour ${NOT_ASSESSED}` : ""} observed
            {r.cost.notAssessed.length ? `; ${r.cost.notAssessed.length} not assessed` : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beats 1 and 2: the empty Tuesday, and a first guess
// ---------------------------------------------------------------------------------------------

function Tuesday({
  b,
  chosen,
  locked,
  onPick,
  onNext,
}: {
  b: ReliabilityBlock;
  chosen: string;
  locked: boolean;
  onPick: (id: string) => void;
  onNext: () => void;
}) {
  const st = b.story;
  return (
    <div className="flex flex-col gap-4">
      {st.transmission.text && (
        <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
          <blockquote className="font-serif text-lg italic">“{st.transmission.text}”</blockquote>
          <figcaption className="mt-2 text-sm text-ink-muted">{st.transmission.who} (optional: the article reads the same without it)</figcaption>
        </figure>
      )}
      <div className={box}>
        <CharacterRow names={[st.character]} size="lg">
          <p className={kicker}>{st.role || "The story"}</p>
          <p className="mt-1">{st.situation}</p>
        </CharacterRow>
      </div>
      <StoryBeat title="The empty Tuesday" text={st.tuesday} names={[st.participant]} />
      <Question legend={b.response.prompt} name="response" options={b.response.options} value={chosen} onChange={onPick} disabled={locked} />
      <p className="text-sm text-ink-muted">
        This article looks at the pattern across visits. An individual person’s concern, complaint or request to change provider follows the provider’s own
        process.
      </p>
      {b.placeholders.trustCheck && <p className="rounded-lg border border-dashed border-line-strong p-2 text-sm">{b.placeholders.trustCheck}</p>}
      <Next disabled={!chosen} hint="Choose a first response." onClick={onNext} label="Make a first guess" />
    </div>
  );
}

function Guess({
  b,
  s,
  busy,
  onSubmit,
  onNext,
}: {
  b: ReliabilityBlock;
  s: ReliabilityState;
  busy: boolean;
  onSubmit: (failures: number | null, cost: string) => void;
  onNext: () => void;
}) {
  const done = s.prediction;
  const [cost, setCost] = useState(done?.cost ?? "");
  const [failures, setFailures] = useState<Num>(done?.failures ?? null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (cost) onSubmit(failures, cost);
      }}
    >
      <p className="text-lg">
        How many missed services do you see, and what did they cost? The coordinator’s summary says “a lot of visits went wrong this month”.
      </p>
      <label className="flex max-w-md flex-col gap-1 font-semibold">
        {b.prediction.countPrompt} <span className="font-normal text-ink-muted">(visits, optional)</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          className="min-h-11 w-32 rounded-xl border border-line-strong bg-surface px-3"
          value={failures ?? ""}
          disabled={Boolean(done)}
          onChange={(e) => setFailures(e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
        />
      </label>
      <fieldset className="flex flex-col gap-2" disabled={Boolean(done)}>
        <legend className="mb-1 font-semibold">{b.prediction.prompt}</legend>
        {b.prediction.options.map((o) => (
          <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
            <input type="radio" name="guess-cost" className="size-5 accent-[var(--color-action)]" checked={cost === o.id} onChange={() => setCost(o.id)} />
            {o.text}
          </label>
        ))}
      </fieldset>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Your guess is in. You’ll see it beside the month at the end; it isn’t marked.</p>
          <Next onClick={onNext} label="Open the log" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primary} disabled={busy || !cost || !s.response}>
            Lock in my guess
          </button>
          <span className="text-sm text-ink-muted">
            {s.response ? "You can’t change it afterwards. A guess is fine." : "Choose Mrs Patel’s first response first."}
          </span>
        </div>
      )}
    </form>
  );
}

/** A labelled radio question. */
function Question({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  options: Pick<Option, "id" | "text">[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-lg font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className={cx("flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted", value === o.id && "bg-tealtint")}>
          <input
            type="radio"
            name={name}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-action)]"
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          <span>{o.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 3: more than one incident
// ---------------------------------------------------------------------------------------------

function ReasonGuide() {
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">What each outcome and reason means</summary>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {OUTCOME_ORDER.map((o) => (
          <div key={o}>
            <dt className="font-semibold">
              {LOOK[o].mark} {OUTCOMES[o]}
            </dt>
            <dd className="text-ink-muted">{OUTCOME_HINTS[o]}</dd>
          </div>
        ))}
        {REASON_ORDER.map((k) => (
          <div key={k}>
            <dt className="font-semibold">{REASONS[k]}</dt>
            <dd className="text-ink-muted">{REASON_HINTS[k]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function CardView({
  c,
  answer,
  onAnswer,
}: {
  c: Card;
  answer?: { choice: CardChoice | ""; urgent: boolean | null };
  onAnswer: (a: { choice: CardChoice | ""; urgent: boolean | null }) => void;
}) {
  const a = answer ?? { choice: "" as const, urgent: null };
  return (
    <fieldset className={box}>
      <legend className="font-semibold">{c.title}</legend>
      <p className="mt-1">{c.text}</p>
      {c.evidence && <p className="mt-1 text-xs text-ink-muted">Evidence: {c.evidence}</p>}
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {CHOICE_ORDER.map((k) => (
          <label key={k} className={cx("flex min-h-10 items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted", a.choice === k && "bg-tealtint")}>
            <input
              type="radio"
              name={`card-${c.id}`}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-action)]"
              checked={a.choice === k}
              onChange={() => onAnswer({ ...a, choice: k })}
            />
            {CARD_CHOICES[k]}
          </label>
        ))}
      </div>
      {c.askUrgent && (
        <div role="radiogroup" aria-label={`${c.title}: does it need the escalation process now?`} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Does it need the escalation process now?</span>
          {(
            [
              [true, "Yes, now"],
              [false, "No, it can wait for the review"],
            ] as const
          ).map(([v, label]) => (
            <label key={label} className={cx("flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-3", a.urgent === v && "bg-tealtint")}>
              <input
                type="radio"
                name={`urgent-${c.id}`}
                className="size-4 accent-[var(--color-action)]"
                checked={a.urgent === v}
                onChange={() => onAnswer({ ...a, urgent: v })}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 4: the repair work
// ---------------------------------------------------------------------------------------------

function Repair({
  b,
  s,
  r,
  allMarked,
  onMark,
  onNext,
}: {
  b: ReliabilityBlock;
  s: ReliabilityState;
  r: ReliabilityResult | null;
  allMarked: boolean;
  onMark: (id: string, v: boolean) => void;
  onNext: () => void;
}) {
  const counted = b.log.entries.filter((e) => s.entries[e.id]);
  const minutes = counted.reduce((a, e) => a + e.minutes, 0);
  return (
    <div className="flex flex-col gap-4">
      <p>{b.log.prompt}</p>
      <fieldset className={box}>
        <legend className="sr-only">The coordinator’s records</legend>
        <ul className="flex flex-col gap-1">
          {b.log.entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-lg px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between hover:bg-muted">
              <span className="text-sm">{e.text}</span>
              <span role="radiogroup" aria-label={e.text} className="flex shrink-0 gap-1 text-xs">
                {(
                  [
                    [true, "Its own task"],
                    [false, "Already counted"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={label}
                    className={cx("flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-2.5", s.entries[e.id] === v && "bg-tealtint")}
                  >
                    <input
                      type="radio"
                      name={`entry-${e.id}`}
                      className="size-4 accent-[var(--color-action)]"
                      checked={s.entries[e.id] === v}
                      onChange={() => onMark(e.id, v)}
                    />
                    {label}
                  </label>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm font-semibold" role="status">
          Your count: {counted.length} {counted.length === 1 ? "task" : "tasks"}, {hrs(minutes / 60)} (all lines together:{" "}
          {hrs(b.log.entries.reduce((a, e) => a + e.minutes, 0) / 60)}).
        </p>
      </fieldset>
      {allMarked && r && <EffortTables r={r} />}
      <Next disabled={!allMarked} hint="Mark every line first." onClick={onNext} label="See the repeat" />
    </div>
  );
}

/** The month's unique recovery tasks, by category (the total, once) and by cause (an overlay that never adds). */
function EffortTables({ r }: { r: ReliabilityResult }) {
  const cats = (Object.keys(CATEGORIES) as Category[]).filter((c) => r.effort.byCategory[c] > 0);
  const causes = (Object.keys(CAUSES) as Cause[]).filter((c) => r.effort.byCause[c] > 0);
  const max = Math.max(...cats.map((c) => r.effort.byCategory[c]), 0.01);
  return (
    <div className={box}>
      <p className={kicker}>The whole month’s unique recovery work: {hrs(r.effort.hours)}</p>
      <p className="mt-1 text-sm">
        Each task counts once, in one category. Cause tags lie over the top: a billing correction about a missed visit shows under both causes, and the total
        doesn’t change.{" "}
        {r.effort.unmeasured
          ? `${r.effort.unmeasured} ${r.effort.unmeasured === 1 ? "task wasn’t" : "tasks weren’t"} measured: kept out of the hours, not counted as zero.`
          : ""}
      </p>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <table className="w-full text-left text-sm">
          <caption className="text-left font-semibold">By category (adds to the total)</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Hours</th>
              <th scope="col" aria-hidden="true" className="w-1/3" />
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c}>
                <td>{CATEGORIES[c]}</td>
                <td>{round1(r.effort.byCategory[c])}</td>
                <td aria-hidden="true">
                  <span className="block h-3 rounded bg-[#008282]" style={{ width: `${(r.effort.byCategory[c] / max) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full text-left text-sm">
          <caption className="text-left font-semibold">By cause (an overlay: doesn’t add up to the total)</caption>
          <thead>
            <tr>
              <th scope="col">Cause</th>
              <th scope="col">Hours</th>
            </tr>
          </thead>
          <tbody>
            {causes.map((c) => (
              <tr key={c}>
                <td>{CAUSES[c]}</td>
                <td>{round1(r.effort.byCause[c])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        {r.effort.visitsWithTasks} {r.effort.visitsWithTasks === 1 ? "visit" : "visits"} needed recovery work: each counts once as a visit, however many calls
        it took. Recovery work by week:{" "}
        {r.effort.byWeek.map((w) => `${w.week === null ? "across the period" : `week ${w.week + 1}`} ${hrs(w.hours)}`).join("; ")}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 5: the repeat, on the reliability timeline
// ---------------------------------------------------------------------------------------------

function whyItCounts(o: Occurrence) {
  if (o.outcome === "missed") {
    if (o.reason === "supplier")
      return o.verified
        ? "In the denominator and the verified supplier numerator."
        : "In the denominator; kept out of the supplier numerator until it’s verified.";
    if (o.reason === "participant") return "In the denominator, in its own line: the participant’s own cancellation, never a supplier failure.";
    if (o.reason === "booking") return "In the denominator, in its own line: the provider’s booking error, a different fix.";
    return `In the denominator, in its own line (${o.reason ? REASONS[o.reason].toLowerCase() : "reason not recorded"}).`;
  }
  if (o.outcome === "unknown") return "In the denominator, named as unknown: not assumed delivered or missed.";
  if (o.outcome === "delivered") return "Delivered as agreed.";
  return `Delivered (${OUTCOMES[o.outcome].toLowerCase()}); the reason is recorded so a pattern would show.`;
}

function Timeline({
  inputs,
  r,
  issues,
  opened,
  onOpen,
}: {
  inputs: ReliabilityInputs;
  r: ReliabilityResult;
  issues: ReliabilityInputs["issues"];
  opened: string[];
  onOpen: (what: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const [table, setTable] = useState(false);
  const sel = inputs.occurrences.find((o) => o.id === selected);
  const sorted = [...inputs.occurrences].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const caseOf = (id: string) => r.recovery.cases.find((c) => c.id === id);
  return (
    <div className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={kicker}>
          The reliability timeline · {dateLabel(r.period.start)} to {dateLabel(r.period.end)} · as of {dateLabel(r.period.asOf)}
        </p>
        <button
          type="button"
          className={secondary}
          aria-pressed={table}
          onClick={() => {
            setTable((x) => !x);
            onOpen("view:table");
          }}
        >
          <Icon name="list" className="size-4" /> {table ? "Show the timeline" : "Show as a table"}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted" aria-hidden="true">
        {OUTCOME_ORDER.map((o) => `${LOOK[o].mark} ${OUTCOMES[o]}`).join(" · ")}
      </p>
      {!table ? (
        <ol className="mt-3 flex flex-col gap-3">
          {r.weeks.map((w) => {
            const visits = sorted.filter((o) => weekOf(inputs, o.date) === w.week && (o.outcome !== "delivered" || o.reason));
            return (
              <li key={w.week}>
                <p className="text-sm font-semibold">
                  Week {w.week + 1}: {w.scheduled} scheduled · {w.delivered} delivered as agreed · {w.scheduled - w.delivered} not as agreed
                </p>
                {/* A proportional bar, with the same figures in words above and in the table. */}
                <div className="mt-1 flex h-3 w-full overflow-hidden rounded" aria-hidden="true">
                  {OUTCOME_ORDER.map((o) =>
                    w[o] ? <span key={o} style={{ ...LOOK[o].style, width: `${(w[o] / Math.max(1, w.scheduled)) * 100}%` }} /> : null,
                  )}
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {visits.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        aria-pressed={selected === o.id}
                        onClick={() => {
                          setSelected(o.id);
                          onOpen(`occ:${o.id}`);
                        }}
                        className={cx(
                          "flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
                          selected === o.id ? "border-action bg-tealtint" : "border-line-strong bg-surface hover:bg-muted",
                          opened.includes(`occ:${o.id}`) && selected !== o.id && "border-dashed",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex size-5 items-center justify-center rounded-full text-xs text-white"
                          style={LOOK[o.outcome].style}
                        >
                          {LOOK[o.outcome].mark}
                        </span>
                        {dateLabel(o.date)} · {o.who || `Visit ${o.id}`} · {OUTCOMES[o.outcome].toLowerCase()}
                      </button>
                    </li>
                  ))}
                  {!visits.length && <li className="text-xs text-ink-muted">Every visit as agreed.</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-3 flex flex-col gap-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="text-left font-semibold">Scheduled visits by week</caption>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Scheduled</th>
                {OUTCOME_ORDER.map((o) => (
                  <th key={o} scope="col">
                    {OUTCOMES[o]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.week}>
                  <th scope="row">Week {w.week + 1}</th>
                  <td>{w.scheduled}</td>
                  {OUTCOME_ORDER.map((o) => (
                    <td key={o}>{w[o]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-left text-sm">
            <caption className="text-left font-semibold">Every visit not delivered as agreed</caption>
            <thead>
              <tr>
                <th scope="col">Visit</th>
                <th scope="col">Date</th>
                <th scope="col">Service</th>
                <th scope="col">Outcome</th>
                <th scope="col">Reason</th>
                <th scope="col">Recovery</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {sorted
                .filter((o) => o.outcome !== "delivered" || o.reason)
                .map((o) => {
                  const c = caseOf(o.id);
                  return (
                    <tr key={o.id}>
                      <th scope="row">{o.who ? `${o.id} (${o.who})` : o.id}</th>
                      <td>{dateLabel(o.date)}</td>
                      <td>
                        {SERVICES[o.service]}, {TIME_WINDOWS[o.window].toLowerCase()}
                        {o.essential ? " · essential" : ""}
                      </td>
                      <td>{OUTCOMES[o.outcome]}</td>
                      <td>
                        {o.reason ? `${REASONS[o.reason]}${o.reason === "supplier" ? (o.verified ? " (verified)" : " (not verified)") : ""}` : "None recorded"}
                      </td>
                      <td>{c ? recoveryText(c) : "No recovery needed"}</td>
                      <td>
                        <button type="button" className={link} onClick={() => (setSelected(o.id), onOpen(`occ:${o.id}`))}>
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      {sel && (
        <div className="mt-3 rounded-xl bg-surface p-3 ring-1 ring-line" role="region" aria-label={`Visit ${sel.id}`}>
          <p className="font-semibold">
            {sel.who ? `${sel.who}, ` : `Visit ${sel.id}, `}
            {dateLabel(sel.date)}: {SERVICES[sel.service]}, {TIME_WINDOWS[sel.window].toLowerCase()}
            {sel.essential ? " (essential support)" : ""}
          </p>
          <dl className="mt-1 grid gap-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="font-semibold">Status</dt>
            <dd>
              {LOOK[sel.outcome].mark} {OUTCOMES[sel.outcome]}
              {sel.reason ? ` · ${REASONS[sel.reason]}${sel.verified ? " (verified)" : " (not verified)"}` : ""}
            </dd>
            <dt className="font-semibold">Why it counts</dt>
            <dd>{whyItCounts(sel)}</dd>
            {sel.evidence && (
              <>
                <dt className="font-semibold">Evidence</dt>
                <dd>
                  {sel.evidence}
                  {sel.evidenceOn ? ` (${dateLabel(sel.evidenceOn)})` : ""} · {EVIDENCE_SOURCES[sel.source]}
                </dd>
              </>
            )}
            {caseOf(sel.id) && (
              <>
                <dt className="font-semibold">Recovery</dt>
                <dd>{recoveryText(caseOf(sel.id)!)}</dd>
              </>
            )}
            {sel.preference && (
              <>
                <dt className="font-semibold">What they wanted</dt>
                <dd>{sel.preference}</dd>
              </>
            )}
            {sel.issue && (
              <>
                <dt className="font-semibold">Issue group</dt>
                <dd>{issues.find((g) => g.id === sel.issue)?.label ?? sel.issue}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function recoveryText(c: ReliabilityResult["recovery"]["cases"][number]) {
  const told = c.updateDays === null ? "not yet told what’s happening" : `told on day ${c.updateDays}`;
  if (c.status === "restored") return `Restored on day ${c.days}${c.within ? " (within the window)" : " (after the window)"}; ${told}.`;
  if (c.status === "booked") return `A replacement is booked but hasn’t happened: open, day ${c.days}. Not a recovery; ${told}.`;
  return `Nothing restored yet: open, day ${c.days}; ${told}.`;
}

function Recovery({ r, inputs }: { r: ReliabilityResult; inputs: ReliabilityInputs }) {
  const rec = r.recovery;
  return (
    <div className={box}>
      <p className={kicker}>Time to a suitable restored service</p>
      <p className="mt-1 text-sm">
        Measured from the agreed start to the visit that actually happened, not to a call or a booking. Window: {windowLabel(rec.windowDays)}. Restored within
        it: <strong>{rec.withinWindow.text}</strong> of the misses that needed recovery (participants’ own cancellations don’t).
      </p>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">Each missed visit that needed recovery</caption>
        <thead>
          <tr>
            <th scope="col">Visit</th>
            <th scope="col">Status</th>
            <th scope="col">Days</th>
            <th scope="col">Told</th>
          </tr>
        </thead>
        <tbody>
          {rec.cases.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.who ? `${c.who}, ${dateLabel(c.date)}` : `${c.id}, ${dateLabel(c.date)}`}</th>
              <td>{c.status === "restored" ? "Restored" : c.status === "booked" ? "Booked, not delivered: open" : "Unresolved: open"}</td>
              <td>{c.status === "restored" ? `${c.days} to restore` : `${c.days} and counting`}</td>
              <td>{c.updateDays === null ? "Not yet" : `Day ${c.updateDays}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm">
        {rec.median === null
          ? "No restored visit with exact dates yet."
          : `Median time to restore: ${round1(rec.median)} days, across ${rec.exact.length} restored visits.`}{" "}
        {rec.booked + rec.unresolved} still open{rec.openBeyondWindow ? `, ${rec.openBeyondWindow} beyond the window` : ""}: never counted as a zero-day
        recovery.{" "}
        {inputs.updateTarget !== null && rec.updateMedian !== null
          ? `Participants were told a median of ${round1(rec.updateMedian)} days after the miss (target: ${inputs.updateTarget}).`
          : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 6: the competing investment
// ---------------------------------------------------------------------------------------------

function Investment({
  b,
  s,
  inputs,
  r,
  whatChanged,
  onToggle,
  onReduction,
  onFreed,
  onLeads,
  onPick,
  onNext,
}: {
  b: ReliabilityBlock;
  s: ReliabilityState;
  inputs: ReliabilityInputs;
  r: ReliabilityResult;
  whatChanged: string[];
  onToggle: (id: string) => void;
  onReduction: (id: string, v: Num) => void;
  onFreed: (v: "labour" | "onboarding") => void;
  onLeads: () => void;
  onPick: (k: "decision" | "explanation", v: string) => void;
  onNext: () => void;
}) {
  const card = comparisonCard(inputs, r);
  return (
    <div className="flex flex-col gap-4">
      <StoryBeat title="The competing investment" text={b.story.investment} names={[b.story.character]} />
      <CostPanel r={r} />
      <div className={box}>
        <p className={kicker}>Test a reliability action</p>
        <p className="mt-1 text-sm">
          Each action reduces only the group of misses it’s aimed at, by your own assumption. Every figure here is a{" "}
          <strong>forecast over {r.horizon} weeks</strong>, not a result.
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {b.inputs.interventions.map((x) => {
            const on = s.tried.includes(x.id);
            const res = r.interventions.find((y) => y.id === x.id);
            // The learner's own assumption, blank included: a blank isn't the case's default.
            const reduction = x.id in s.estimates ? s.estimates[x.id].reduction : x.reduction;
            return (
              <div key={x.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <label className="flex min-h-10 items-start gap-3 font-semibold">
                  <input type="checkbox" className="mt-0.5 size-5 accent-[var(--color-action)]" checked={on} onChange={() => onToggle(x.id)} />
                  <span>
                    {x.label} <span className="font-normal text-ink-muted">· {INTERVENTION_KINDS[x.kind]}</span>
                  </span>
                </label>
                <p className="ml-8 text-xs text-ink-muted">
                  Aimed at:{" "}
                  {x.issue ? (b.inputs.issues.find((g) => g.id === x.issue)?.label ?? x.issue) : x.reason ? REASONS[x.reason].toLowerCase() : "not set"} ·
                  Owner: {x.owner || "not named"} · Checked by: {x.evidence}
                </p>
                {on && (
                  <div className="ml-8 mt-2 flex flex-col gap-2">
                    <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold">
                      Share of that group it prevents (your assumption) <span className="font-normal text-ink-muted">(%)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={5}
                        className={small}
                        value={reduction === null ? "" : Math.round(reduction * 100)}
                        onChange={(e) => onReduction(x.id, e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) / 100)}
                      />
                    </label>
                    {res && reduction !== null ? (
                      <ul className="list-disc pl-5 text-sm">
                        {res.trail.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                        <li>
                          Its own time: {hrs(res.ownHours)}, so {hrs(res.netHours)} of coordinator time net. Direct cost change:{" "}
                          {res.change === null ? NOT_ASSESSED : money(res.change)} (forecast).
                        </li>
                      </ul>
                    ) : (
                      <p className="text-sm text-danger">Enter an assumption to see the forecast. The last valid result stays above.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <fieldset className="mt-3 flex flex-col gap-1 text-sm">
          <legend className="font-semibold">Read the hours an action frees as…</legend>
          {(
            [
              ["labour", "A labour cost avoided (in the dollars)"],
              ["onboarding", "Onboarding capacity (in the hours, not the dollars)"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex min-h-10 items-center gap-2">
              <input type="radio" name="freed" className="size-4 accent-[var(--color-action)]" checked={s.freedHours === v} onChange={() => onFreed(v)} />
              {label}
            </label>
          ))}
          <span className="text-xs text-ink-muted">The same hours can’t be both a saving and new capacity.</span>
        </fieldset>
        <WhatChanged lines={whatChanged} />
      </div>
      <details
        className={box}
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) onLeads();
        }}
      >
        <summary className="min-h-11 cursor-pointer font-semibold">What would the referral push need from the same team?</summary>
        {r.leads ? (
          <div className="mt-2 text-sm">
            <p>
              <strong>{r.leads.label}</strong> ({EVIDENCE_SOURCES[inputs.leads.source].toLowerCase()} figures). {inputs.leads.note}
            </p>
            <table className="mt-2 w-full text-left text-sm">
              <caption className="sr-only">The referral push, beside the team’s capacity</caption>
              <tbody>
                <tr>
                  <th scope="row">Effort</th>
                  <td>
                    {hrs(r.leads.effortHours)} and {money(r.leads.cost)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Expected</th>
                  <td>
                    {r.leads.enquiries} enquiries, {r.leads.starts} starts, the first in about {r.leads.firstStartWeeks} weeks
                  </td>
                </tr>
                <tr>
                  <th scope="row">Onboarding</th>
                  <td>
                    needs {hrs(r.leads.onboardingNeeded)}; {hrs(r.leads.onboardingSpare)} spare over {r.horizon} weeks
                  </td>
                </tr>
              </tbody>
            </table>
            <ul className="mt-2 list-disc pl-5">
              {r.leads.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm">No referral push in this case.</p>
        )}
      </details>
      <div className={box}>
        <p className={kicker}>The comparison</p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {(
            [
              ["What needs fixing now?", card.now],
              ["What may change if we invest in reliability?", card.reliability],
              ["What would another referral push require from the same team?", card.leads],
              ["Which facts still need confirmation?", card.confirm],
            ] as const
          ).map(([q, lines]) => (
            <div key={q}>
              <p className="font-semibold">{q}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {lines.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          No verdict, and no dollar value on anyone’s missed support. Nothing here cancels a campaign, approves a supplier or changes a booking: talk it through
          with Operations.
        </p>
      </div>
      <Question legend="What does Maya do next?" name="decision" options={b.decisions} value={s.decision} onChange={(v) => onPick("decision", v)} />
      <Question
        legend="How would you explain the trade-off?"
        name="explanation"
        options={b.explanations}
        value={s.explanation}
        onChange={(v) => onPick("explanation", v)}
      />
      <Next
        disabled={!s.changed || !s.inspected.includes("leads") || !s.decision || !s.explanation}
        hint="Test an action, open the referral push, then choose a decision and an explanation."
        onClick={onNext}
        label="The later check"
      />
    </div>
  );
}

function CostPanel({ r }: { r: ReliabilityResult }) {
  return (
    <div className={box}>
      <p className={kicker}>Direct business cost, observed: {money(r.cost.observedDirect)}</p>
      <p className="mt-1 text-sm">{r.cost.trail}.</p>
      {r.cost.notBorne.length > 0 && (
        <p className="text-sm">Not a cost to the business, shown apart: {r.cost.notBorne.map((x) => `${x.label} (${money(x.amount)})`).join("; ")}.</p>
      )}
      {r.cost.notAssessed.length > 0 && <p className="text-sm">Not assessed: {r.cost.notAssessed.map((x) => `${x.label} (${x.why})`).join("; ")}.</p>}
      <p className="mt-1 text-xs text-ink-muted">
        No service fee loss is assumed: a fee effect needs the verified agreement, and a visit delivered later may only move income in time. The person’s missed
        support isn’t in this figure, and never could be.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief and the Decision Sheet
// ---------------------------------------------------------------------------------------------

/** Prints the Decision Sheet alone, using the Hub's print rule for a decision sheet (globals.css). */
function printSheet() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function Debrief({
  b,
  s,
  d,
  busy,
  onPrint,
  onRetry,
}: {
  b: ReliabilityBlock;
  s: ReliabilityState;
  d: ReliabilityDebrief;
  busy: boolean;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const mine = currentInputs(b, s);
  const r = safeCalc(mine) ?? calculate(b.inputs);
  const chosen = r.interventions[0];
  return (
    <div className="flex flex-col gap-4">
      {d.flags.length > 0 && (
        <div role="alert" className={cx("rounded-2xl p-4", d.unsafe ? TONE.bad : TONE.warn)}>
          <p className="font-semibold">{d.unsafe ? "Before anything else: this needs the escalation process" : "Before anything else"}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {d.flags.map((f) => (
              <li key={f.id}>{f.critical ? <strong>{f.text} (no score offsets this)</strong> : f.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={box}>
        <p className={kicker}>What happened next</p>
        <p className="mt-1">{d.decision.outcome}</p>
        {(
          [
            ["Your first response", d.response],
            ["The repeat", d.repeat],
            ["Your decision", d.decision],
            ["Your explanation", d.explanation],
            ["The later check", d.later],
          ] as const
        ).map(([label, x]) => (
          <div key={label} className="mt-2 text-sm">
            <p>
              <strong>{label}:</strong> {x.text}
            </p>
            <p className="text-ink-muted">{x.feedback}</p>
          </div>
        ))}
      </div>
      <div className={box}>
        <p className={kicker}>
          How you did · {d.score} of {d.max}
          {d.unsafe ? " · not safe practice yet, whatever the score" : ""}
        </p>
        {/* A list rather than a table, so a phone shows each dimension whole, without sideways scrolling. */}
        <dl className="mt-2 flex flex-col gap-2 text-sm">
          {d.dims.map((x) => (
            <div key={x.dim}>
              <dt className="font-semibold">
                {x.label}: {x.rating} of 3 · {LEVELS[x.rating]}
              </dt>
              <dd className="text-ink-muted">{x.why}</dd>
            </div>
          ))}
        </dl>
      </div>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">
          The log, entry by entry ({d.cards.filter((c) => c.matched).length} of {d.cards.length} matched)
        </summary>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {d.cards.map((c) => (
            <li key={c.id}>
              <p className="font-semibold">
                {c.matched ? "✓" : "✕"} {c.title}
              </p>
              <p>
                You: {c.yours.choice ? CARD_CHOICES[c.yours.choice] : "not chosen"}
                {c.yours.urgent !== null ? ` · escalate now: ${c.yours.urgent ? "yes" : "no"}` : ""}. Reviewed: {CARD_CHOICES[c.answer.choice]}
                {c.answer.urgent !== null ? ` · escalate now: ${c.answer.urgent ? "yes" : "no"}` : ""}.
              </p>
              <p className="text-ink-muted">{c.feedback}</p>
            </li>
          ))}
        </ul>
      </details>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">
          The repair work: you counted {hrs(d.hours.yours)}; the unique tasks come to {hrs(d.hours.unique)} (every line together: {hrs(d.hours.logged)})
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {d.entries.map((e) => (
            <li key={e.id}>
              {e.matched ? "✓" : "✕"} {e.text}: {e.duplicate ? "already counted" : "its own task"}. {e.feedback}
            </li>
          ))}
        </ul>
      </details>
      <div className={box}>
        <p className={kicker}>Your first guess, beside the month</p>
        <p className="mt-1 text-sm">
          You guessed {d.prediction.failures === null ? "no number" : `${d.prediction.failures} supplier misses`}, and that they mostly cost: “
          {d.prediction.cost}”. The month had {d.prediction.actualMissed} missed visits, of which {d.prediction.actualSupplier} were verified supplier misses (
          {d.result.supplierRate}). The rest had other causes. The cost was mostly {hrs(d.result.hours)} of coordinator time, {d.result.open} visits still open,
          and {money(d.result.observedDirect)} of direct costs. It isn’t marked.
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>The month, in short</p>
        <p className="mt-1">{d.summary}</p>
        <p className="mt-2 font-semibold">Four weeks later</p>
        <p>{d.followUp}</p>
      </div>
      <DecisionSheet
        title="Reliability Decision Sheet (learning)"
        period={`${dateLabel(r.period.start)} to ${dateLabel(r.period.end)}, fictional`}
        inputs={mine}
        r={r}
        action={d.decision.text}
        owner={chosen?.label ? (b.inputs.interventions.find((x) => x.id === chosen.id)?.owner ?? "") : ""}
        reviewBy=""
        clientMeasure="Ask the Tuesday clients, in their own words, whether Tuesdays are dependable again."
        versions={`${d.versions.lab} · story ${d.versions.story} · model ${d.versions.model} · definitions ${d.versions.definitions}`}
        sources={b.sources}
      />
      <Placeholders b={b} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the Decision Sheet
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Look again
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab}, story {d.versions.story}, rubric {d.versions.rubric}, model {d.versions.model}, definitions {d.versions.definitions}. Every
        attempt is kept.
      </p>
    </div>
  );
}

function Placeholders({ b }: { b: ReliabilityBlock }) {
  return (
    <div className={box}>
      <p className={kicker}>Where this leads</p>
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {[b.placeholders.trustCheck, b.placeholders.networkBuilder].filter(Boolean).map((p) => (
          <li key={p} className="rounded-lg border border-dashed border-line-strong p-2">
            {p}
          </li>
        ))}
        {b.links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={link}>
              {l.label}
            </Link>{" "}
            <span className="text-ink-muted">{l.why}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">Nothing is carried to another tool automatically: take figures across only if you choose to.</p>
    </div>
  );
}

function DecisionSheet({
  title,
  period,
  inputs,
  r,
  action,
  owner,
  reviewBy,
  clientMeasure,
  definitions,
  unknowns,
  notes,
  versions,
  sources = [],
}: {
  title: string;
  period: string;
  inputs: ReliabilityInputs;
  r: ReliabilityResult;
  action: string;
  owner: string;
  reviewBy: string;
  clientMeasure: string;
  definitions?: string;
  unknowns?: string;
  notes?: string;
  versions: string;
  sources?: { title: string; url: string }[];
}) {
  const card = comparisonCard(inputs, r);
  return (
    <section className="growth-sheet rounded-2xl bg-bg p-4 ring-1 ring-line" aria-label={title}>
      <p className={kicker}>{title}</p>
      <h5 className="mt-1 font-serif text-xl font-semibold">{period}</h5>
      <p className="text-sm text-ink-muted">
        {inputs.scope || "Scope not set"} · window {windowLabel(r.recovery.windowDays)} · {versions}
      </p>
      <p className="mt-2 text-sm">
        <strong>Definitions:</strong>{" "}
        {definitions ||
          "A missed visit is a scheduled, agreed visit that didn’t happen. Supplier misses count only once verified. A booking or invoice isn’t delivery. Recovery runs to the actual restored visit."}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <p className="font-semibold">Care</p>
          <ul className="list-disc pl-5 text-sm">
            <li>Verified supplier misses: {r.supplierRate.text}</li>
            {REASON_ORDER.filter((k) => k !== "supplier" && r.missedBy[k]).map((k) => (
              <li key={k}>
                {sentence(REASONS[k].toLowerCase())}: {r.reasonRates[k].text}
              </li>
            ))}
            <li>Restored within the window: {r.recovery.withinWindow.text}</li>
            <li>
              Still open: {r.recovery.booked + r.recovery.unresolved}
              {r.recovery.essentialOpen ? ` (${r.recovery.essentialOpen} essential)` : ""}
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Coordinator work</p>
          <ul className="list-disc pl-5 text-sm">
            <li>{hrs(r.effort.hours)} of unique recovery tasks</li>
            {r.effort.unmeasured > 0 && <li>{r.effort.unmeasured} not measured</li>}
            {r.repeat.issues
              .filter((g) => g.visits >= 2)
              .map((g) => (
                <li key={g.id}>
                  Recurring: {g.label} ({g.visits} visits)
                </li>
              ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold">Direct business cost</p>
          <p className="text-sm">{r.cost.trail}</p>
          {r.cost.notAssessed.length > 0 && <p className="text-sm">Not assessed: {r.cost.notAssessed.map((x) => x.label).join("; ")}</p>}
        </div>
      </div>
      <p className="mt-3 font-semibold">Assumptions tested (forecasts)</p>
      <ul className="list-disc pl-5 text-sm">
        {card.reliability.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="mt-3 font-semibold">The chosen action</p>
      <p className="text-sm">{action || "Not chosen yet."}</p>
      <p className="text-sm">
        <strong>Accountable owner:</strong> {owner || "not named yet"} · <strong>Review date:</strong> {reviewBy || "set one"}
      </p>
      <p className="text-sm">
        <strong>Client-outcome measure:</strong> {clientMeasure || "set one: ask the people affected whether the service improved"}
      </p>
      <p className="mt-2 text-sm">
        <strong>Still to confirm:</strong> {[...card.confirm, unknowns].filter(Boolean).join(" ") || "Nothing recorded."}
      </p>
      {notes && <p className="mt-2 whitespace-pre-line text-sm">{notes}</p>}
      {sources.length > 0 && <p className="mt-2 text-xs text-ink-muted">Policy references for reviewers: {sources.map((x) => x.title).join("; ")}.</p>}
      <p className="mt-1 text-xs text-ink-muted">
        A planning summary, not a complaint record, a claim decision or a judgement of any worker. An action isn’t a success because it was created: check it at
        the review date.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Review my service reliability: private, aggregate, saved only when asked
// ---------------------------------------------------------------------------------------------

type Sheet = {
  period: string;
  definitions: string;
  action: string;
  owner: string;
  reviewBy: string;
  clientMeasure: string;
  expectedPrevented: Num;
  unknowns: string;
  notes: string;
  followUp: { result: "" | "fewer" | "same" | "more" | "not-tried"; participantsSay: string; note: string };
};
const blankSheet = (): Sheet => ({
  period: "",
  definitions: "",
  action: "",
  owner: "",
  reviewBy: "",
  clientMeasure: "",
  expectedPrevented: null,
  unknowns: "",
  notes: "",
  followUp: { result: "", participantsSay: "", note: "" },
});
type SheetSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string };
type SavedSheet = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: ReliabilityInputs;
  sheet: Sheet;
  previous: { number: number; savedAt: string; sheet: Sheet; snapshot: { supplierVerified?: number; open?: number; hours?: number } } | null;
  earlierModel: boolean;
};
const RESULT_LABELS: [Sheet["followUp"]["result"], string][] = [
  ["", "Not answered yet"],
  ["fewer", "Fewer missed visits"],
  ["same", "About the same"],
  ["more", "More missed visits"],
  ["not-tried", "We didn’t try it"],
];

function ReviewMine({ orgName, b, onSaved }: { orgName: string; b: ReliabilityBlock; onSaved: (version: number) => void }) {
  const home = useApi<{ access: { orgName: string } | null; sheets: SheetSummary[] }>("/api/tools/reliability");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<ReliabilityInputs | null>(null);
  const [baseline, setBaseline] = useState<ReliabilityInputs | null>(null);
  const [sheet, setSheet] = useState<Sheet>(blankSheet());
  const [saved, setSaved] = useState<SavedSheet | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastGood, setLastGood] = useState<ReliabilityResult | null>(null);

  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const x = await api<SavedSheet>(`/api/tools/reliability?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}`);
      setSaved(x);
      setInputs(x.inputs);
      setBaseline(x.inputs);
      setSheet(x.sheet);
      setName(x.name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startBlank = () => {
    const fresh = blankInputs(new Date().toISOString().slice(0, 10));
    setSaved(null);
    setInputs(fresh);
    setBaseline(fresh);
    setSheet(blankSheet());
    setName("");
  };
  const save = async () => {
    if (!inputs) return;
    setBusy(true);
    setMessage(null);
    try {
      const x = await api<SavedSheet>("/api/tools/reliability", { body: { id: saved?.id, name, inputs, sheet, note } });
      setSaved(x);
      setBaseline(x.inputs);
      setNote("");
      setMessage(`Saved as version ${x.version}.`);
      onSaved(x.version);
      home.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = home.data?.sheets ?? [];
  const errors = inputs ? validateInputs(inputs) : [];
  const live = useMemo(() => (inputs && !validateInputs(inputs).length ? calculate(inputs) : null), [inputs]);
  // An incomplete entry keeps the last valid calculation, labelled as such.
  if (live && lastGood !== live) setLastGood(live);
  const r = live ?? (inputs ? lastGood : null);
  const changes = inputs && baseline ? inputChanges(baseline, inputs) : [];
  const delta = live && baseline && !validateInputs(baseline).length ? resultChanges(calculate(baseline), live) : [];
  const set = (fn: (x: ReliabilityInputs) => ReliabilityInputs) => setInputs((x) => (x ? fn(x) : x));
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <p>
          <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these sheets, checked on the server for
          every read and save. Trilogy Care staff and course authors can’t see them, and they never appear in anyone’s dashboard.
        </p>
        <p className="mt-1">
          <strong>Aggregate figures only:</strong> counts by service and time window for a four- or eight-week period. No names, addresses, diagnoses, complaint
          text, worker allegations or contract fee terms. A named person’s case stays in the Operations and Quality systems; correct a wrong reason or status
          through its accountable owner.
        </p>
        <p className="mt-1">
          <strong>Kept:</strong> nothing until you choose Save. Each save is a new version. The article is complete without this.
        </p>
      </div>
      {!inputs && (
        <div className="flex flex-col gap-3">
          {list.length > 0 && (
            <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => load(list[0].id)}>
              Resume: {list[0].name}
            </button>
          )}
          {list.length > 1 && (
            <ul className="flex flex-col gap-1 text-sm">
              {list.slice(1).map((x) => (
                <li key={x.id}>
                  <button type="button" className={cx(link, "min-h-10")} onClick={() => load(x.id)}>
                    {x.name}
                  </button>{" "}
                  <span className="text-ink-muted">
                    {x.versions} {x.versions === 1 ? "version" : "versions"} · {x.updatedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={cx(list.length ? secondary : primary, "self-start")} onClick={startBlank}>
            Start a blank review
          </button>
        </div>
      )}
      {inputs && (
        <>
          {saved && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{saved.name}</span>
              <label className="flex items-center gap-2">
                Version
                <select className={cx(small, "w-auto")} value={saved.version} onChange={(e) => load(saved.id, Number(e.target.value))}>
                  {saved.versions.map((v) => (
                    <option key={v.number} value={v.number}>
                      {v.number} · {v.savedAt.slice(0, 10)} · {v.savedBy}
                      {v.note ? ` · ${v.note}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {saved.earlierModel && (
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", TONE.warn)}>Saved under an earlier model: recalculated now</span>
              )}
            </div>
          )}
          {saved?.previous?.sheet.action && (
            <div className={box}>
              <p className={kicker}>Last time (version {saved.previous.number})</p>
              <p className="mt-1 text-sm">
                You chose: <strong>{saved.previous.sheet.action}</strong>
                {saved.previous.sheet.owner ? ` (owner: ${saved.previous.sheet.owner})` : ""}, expecting about{" "}
                {saved.previous.sheet.expectedPrevented === null ? "an unestimated number of" : saved.previous.sheet.expectedPrevented} fewer missed visits.
                {typeof saved.previous.snapshot.supplierVerified === "number" && live
                  ? ` Verified supplier misses were ${saved.previous.snapshot.supplierVerified} then; they’re ${live.supplierVerified} now. Recovery work was ${hrs(saved.previous.snapshot.hours ?? 0)}; it’s ${hrs(live.effort.hours)} now.`
                  : ""}{" "}
                An action isn’t a success because it was created: compare the figures, and ask the people it was for.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  What happened?
                  <select
                    className={small}
                    value={sheet.followUp.result}
                    onChange={(e) => setSheet((x) => ({ ...x, followUp: { ...x.followUp, result: e.target.value as Sheet["followUp"]["result"] } }))}
                  >
                    {RESULT_LABELS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  What participants say (in general terms)
                  <input
                    className={small}
                    value={sheet.followUp.participantsSay}
                    onChange={(e) => setSheet((x) => ({ ...x, followUp: { ...x.followUp, participantsSay: e.target.value } }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Note
                  <input
                    className={small}
                    value={sheet.followUp.note}
                    onChange={(e) => setSheet((x) => ({ ...x, followUp: { ...x.followUp, note: e.target.value } }))}
                  />
                </label>
              </div>
            </div>
          )}
          {r && <Summary r={r} stale={!live} />}
          {r && <PatternTable r={r} />}
          {r && <CostPanel r={r} />}
          {r && r.interventions.length > 0 && (
            <div className={box}>
              <p className={kicker}>Actions tested (forecasts over {r.horizon} weeks)</p>
              {r.interventions.map((x) => (
                <div key={x.id} className="mt-2 text-sm">
                  <p className="font-semibold">{x.label}</p>
                  <ul className="list-disc pl-5">
                    {x.trail.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {r && (
            <div className={box}>
              <p className={kicker}>The comparison</p>
              {(() => {
                const card = comparisonCard(inputs, r);
                return (
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {(
                      [
                        ["What needs fixing now?", card.now],
                        ["What may change if we invest in reliability?", card.reliability],
                        ["What would another referral push require?", card.leads],
                        ["Which facts still need confirmation?", card.confirm],
                      ] as const
                    ).map(([q, lines]) => (
                      <div key={q}>
                        <p className="font-semibold">{q}</p>
                        <ul className="mt-1 list-disc pl-5 text-sm">
                          {lines.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <details className={box} open={!live}>
            <summary className="min-h-11 cursor-pointer font-semibold">Enter or edit the figures{errors.length ? ` (${errors.length} to fix)` : ""}</summary>
            <AggregateEditor inputs={inputs} errors={errors} set={set} />
          </details>
          {(changes.length > 0 || delta.length > 0) && (
            <div className={box}>
              <p className={kicker}>What changed since {saved ? `version ${saved.version}` : "you started"}?</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {[...changes, ...delta].slice(0, 20).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <fieldset className={box}>
            <legend className="sr-only">Decision Sheet</legend>
            <p className={kicker}>Your Decision Sheet</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["period", "Period reviewed", "e.g. October 2026"],
                  ["action", "The action you’ll take", ""],
                  ["owner", "Accountable owner (a role is fine)", ""],
                  ["clientMeasure", "How you’ll ask the people affected", "e.g. ask Tuesday clients whether the day is dependable"],
                ] as const
              ).map(([k, label, placeholder]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold">
                  {label}
                  <input className={small} value={sheet[k]} placeholder={placeholder} onChange={(e) => setSheet((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
              <NumField
                label="Fewer missed visits you expect (forecast)"
                unit="visits"
                value={sheet.expectedPrevented}
                onChange={(v) => setSheet((x) => ({ ...x, expectedPrevented: v }))}
              />
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review date
                <input type="date" className={small} value={sheet.reviewBy} onChange={(e) => setSheet((x) => ({ ...x, reviewBy: e.target.value }))} />
              </label>
              {(
                [
                  ["definitions", "Event definitions you used (if different from the article’s)"],
                  ["unknowns", "Unknowns (what you couldn’t verify)"],
                  ["notes", "Notes (who agreed what; no names or case details)"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                  {label}
                  <textarea className={cx(small, "min-h-16 py-2")} value={sheet[k]} onChange={(e) => setSheet((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
          </fieldset>
          {r && (
            <DecisionSheet
              title="Reliability Decision Sheet (private)"
              period={sheet.period || "Period not set"}
              inputs={inputs}
              r={r}
              action={sheet.action}
              owner={sheet.owner}
              reviewBy={sheet.reviewBy}
              clientMeasure={sheet.clientMeasure}
              definitions={sheet.definitions}
              unknowns={sheet.unknowns}
              notes={sheet.notes}
              versions={`${saved ? `${saved.name}, version ${saved.version}` : "unsaved"} · ${MODEL_VERSION}`}
            />
          )}
          <Placeholders b={b} />
          <div className="flex flex-wrap items-end gap-3">
            {!saved && (
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Sheet name
                <input className={cx(small, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="October review" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold">
              What changed (optional)
              <input className={cx(small, "w-64")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className={primary} disabled={busy || (!saved && !name.trim())} onClick={save}>
              {saved ? "Save a new version" : "Save"}
            </button>
            {r && (
              <button type="button" className={secondary} onClick={printSheet}>
                <Icon name="print" className="size-4" /> Print or save the Decision Sheet
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setInputs(null);
                setSaved(null);
              }}
            >
              Close
            </button>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}
    </div>
  );
}

/** Misses per 100 scheduled visits, by service and time window: a table, with the denominators. */
function PatternTable({ r }: { r: ReliabilityResult }) {
  return (
    <div className={cx(box, "overflow-x-auto")}>
      <table className="w-full text-left text-sm">
        <caption className="text-left font-semibold">Pattern: verified supplier misses per 100 scheduled visits</caption>
        <thead>
          <tr>
            <th scope="col">Service and time window</th>
            <th scope="col">Scheduled</th>
            <th scope="col">Verified supplier misses</th>
            <th scope="col">All missed</th>
            <th scope="col">Per 100</th>
          </tr>
        </thead>
        <tbody>
          {r.pattern.map((p) => (
            <tr key={`${p.service}/${p.window}`}>
              <th scope="row">
                {SERVICES[p.service]}, {TIME_WINDOWS[p.window].toLowerCase()}
              </th>
              <td>{p.scheduled}</td>
              <td>{p.supplier}</td>
              <td>{p.missed}</td>
              <td>{p.per100 === null ? "insufficient data" : p.per100}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.trend && (
        <p className="mt-2 text-sm">
          {r.trend.label}: {r.trend.rate.text}. A rise in recorded misses can mean better recording.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Editing figures (blank, unknown and zero kept apart)
// ---------------------------------------------------------------------------------------------

function NumField({
  label,
  value,
  onChange,
  error,
  unit,
  step = 1,
  className,
}: {
  label: string;
  value: Num;
  onChange: (v: Num) => void;
  error?: string;
  unit: string;
  step?: number;
  className?: string;
}) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1 text-xs font-semibold", className)}>
      <span>
        {label} <span className="font-normal text-ink-muted">({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        className={cx(small, error && "border-danger")}
        value={value ?? ""}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}

/** A number, or "not known": two different things from a blank, and from zero. */
function AmountField({
  label,
  value,
  onChange,
  unit,
  unknownLabel = "Not known",
  error,
}: {
  label: string;
  value: Amount | Duration;
  onChange: (v: Amount) => void;
  unit: string;
  unknownLabel?: string;
  error?: string;
}) {
  const unknown = value === "unknown";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      <label className="flex flex-col gap-1">
        <span>
          {label} <span className="font-normal text-ink-muted">({unit})</span>
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className={cx(small, error && "border-danger")}
          disabled={unknown}
          aria-invalid={Boolean(error)}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </label>
      <label className="flex items-center gap-2 font-normal">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-action)]"
          checked={unknown}
          onChange={(e) => onChange(e.target.checked ? "unknown" : null)}
        />
        {unknownLabel}
      </label>
      {error && <span className="font-normal text-danger">{error}</span>}
    </div>
  );
}

const errorFor = (errors: InputError[], field: string) => errors.find((e) => e.field === field)?.message;
const nextId = (used: string[], prefix: string) => {
  let k = used.length + 1;
  while (used.includes(`${prefix}${k}`)) k += 1;
  return `${prefix}${k}`;
};
const SERVICE_KEYS = Object.keys(SERVICES) as Service[];
const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      {label}
      <select className={small} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function AggregateEditor({
  inputs,
  errors,
  set,
}: {
  inputs: ReliabilityInputs;
  errors: InputError[];
  set: (fn: (x: ReliabilityInputs) => ReliabilityInputs) => void;
}) {
  const reasonOptions: [Reason | "", string][] = [["", "Not linked"], ...REASON_ORDER.map((k) => [k, REASONS[k]] as [Reason, string])];
  const sourceOptions = Object.entries(EVIDENCE_SOURCES) as [EvidenceSource, string][];
  const setRow = (id: string, patch: (r: ReliabilityInputs["rows"][number]) => ReliabilityInputs["rows"][number]) =>
    set((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? patch(r) : r)) }));
  const setTask = (id: string, patch: Partial<RecoveryTask>) => set((x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setCost = (id: string, patch: Partial<CostItem>) => set((x) => ({ ...x, costs: x.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setAction = (id: string, patch: Partial<Intervention>) =>
    set((x) => ({ ...x, interventions: x.interventions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <div className="mt-3 flex flex-col gap-4">
      {errors.length > 0 && (
        <div role="alert" className={cx("rounded-xl p-3 text-sm", TONE.warn)}>
          <p className="font-semibold">To fix before it calculates (the last valid result stays above, labelled):</p>
          <ul className="list-disc pl-5">
            {errors.slice(0, 8).map((e) => (
              <li key={e.field + e.message}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className={box}>
        <legend className="sr-only">Period and terms</legend>
        <p className={kicker}>Period and terms</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            First day
            <input
              type="date"
              className={small}
              value={inputs.period.start}
              onChange={(e) => set((x) => ({ ...x, period: { ...x.period, start: e.target.value } }))}
            />
          </label>
          <Select
            label="Length"
            value={String(inputs.period.weeks ?? 4)}
            options={[
              ["4", "Four weeks"],
              ["8", "Eight weeks"],
            ]}
            onChange={(v) => set((x) => ({ ...x, period: { ...x.period, weeks: Number(v) } }))}
          />
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Figures as of
            <input
              type="date"
              className={small}
              value={inputs.period.asOf}
              onChange={(e) => set((x) => ({ ...x, period: { ...x.period, asOf: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Scope (which services)
            <input
              className={small}
              value={inputs.scope}
              onChange={(e) => set((x) => ({ ...x, scope: e.target.value }))}
              placeholder="Cleaning and personal-care visits we arrange"
            />
          </label>
          <Select
            label="Restoration window"
            value={String(inputs.windowDays ?? 2)}
            options={RESTORE_WINDOWS.map((d) => [String(d), windowLabel(d)] as [string, string])}
            onChange={(v) => set((x) => ({ ...x, windowDays: Number(v) }))}
          />
          <AmountField
            label="Loaded hourly cost of recovery work"
            unit="$ an hour"
            unknownLabel="Not assessed"
            value={inputs.hourly}
            error={errorFor(errors, "hourly")}
            onChange={(v) => set((x) => ({ ...x, hourly: v }))}
          />
          <NumField
            label="Comparison horizon"
            unit="weeks"
            value={inputs.horizonWeeks}
            error={errorFor(errors, "horizonWeeks")}
            onChange={(v) => set((x) => ({ ...x, horizonWeeks: v }))}
          />
          <NumField
            label="Target days to tell a participant"
            unit="days"
            value={inputs.updateTarget}
            onChange={(v) => set((x) => ({ ...x, updateTarget: v }))}
          />
        </div>
      </fieldset>
      {inputs.rows.map((row) => (
        <fieldset key={row.id} className={box}>
          <legend className="sr-only">Visits: {SERVICES[row.service]}</legend>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className={kicker}>
              {SERVICES[row.service]}, {TIME_WINDOWS[row.window].toLowerCase()}
            </p>
            {inputs.rows.length > 1 && (
              <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, rows: x.rows.filter((r) => r.id !== row.id) }))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select
              label="Service"
              value={row.service}
              options={SERVICE_KEYS.map((k) => [k, SERVICES[k]])}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, service: v }))}
            />
            <Select
              label="Time window"
              value={row.window}
              options={WINDOW_ORDER.map((k) => [k, TIME_WINDOWS[k]])}
              onChange={(v: Window) => setRow(row.id, (r) => ({ ...r, window: v }))}
            />
            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
              Private label (optional; never a person)
              <input className={small} value={row.label} onChange={(e) => setRow(row.id, (r) => ({ ...r, label: e.target.value }))} />
            </label>
            {(["delivered", "late", "replaced", "unknown"] as const).map((k) => (
              <NumField
                key={k}
                label={OUTCOMES[k]}
                unit="visits"
                value={row[k]}
                error={errorFor(errors, `row.${row.id}.${k}`)}
                onChange={(v) => setRow(row.id, (r) => ({ ...r, [k]: v }))}
              />
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">Not delivered, by who or what started it</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {REASON_ORDER.map((k) => (
              <NumField
                key={k}
                label={REASONS[k]}
                unit="visits"
                value={row.missed[k]}
                error={errorFor(errors, `row.${row.id}.missed.${k}`)}
                onChange={(v) => setRow(row.id, (r) => ({ ...r, missed: { ...r.missed, [k]: v } }))}
              />
            ))}
            <NumField
              label="Of the supplier misses, not yet verified"
              unit="visits"
              value={row.unverified}
              error={errorFor(errors, `row.${row.id}.unverified`)}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, unverified: v }))}
            />
          </div>
          <p className="mt-3 text-sm font-semibold">Recovery of the misses that needed it (supplier, booking, access, unknown)</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BAND_ORDER.map((k) => (
              <NumField
                key={k}
                label={`Restored: ${RESTORE_BANDS[k].toLowerCase()}`}
                unit="visits"
                value={row.restored[k]}
                error={errorFor(errors, `row.${row.id}.restored.${k}`)}
                onChange={(v) => setRow(row.id, (r) => ({ ...r, restored: { ...r.restored, [k]: v } }))}
              />
            ))}
            <NumField
              label="Replacement booked, not delivered"
              unit="visits"
              value={row.booked}
              error={errorFor(errors, `row.${row.id}.booked`)}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, booked: v }))}
            />
            <NumField
              label="Still unresolved"
              unit="visits"
              value={row.unresolved}
              error={errorFor(errors, `row.${row.id}.unresolved`)}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, unresolved: v }))}
            />
            <NumField
              label="Of those open, essential support"
              unit="visits"
              value={row.essentialOpen}
              error={errorFor(errors, `row.${row.id}.essentialOpen`)}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, essentialOpen: v }))}
            />
            <NumField
              label="Recurring issue groups"
              unit="groups"
              value={row.repeatIssues}
              error={errorFor(errors, `row.${row.id}.repeatIssues`)}
              onChange={(v) => setRow(row.id, (r) => ({ ...r, repeatIssues: v }))}
            />
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className={cx(secondary, "self-start")}
        disabled={inputs.rows.length >= 40}
        onClick={() =>
          set((x) => ({
            ...x,
            rows: [
              ...x.rows,
              blankRow(
                nextId(
                  x.rows.map((r) => r.id),
                  "r",
                ),
                "domestic",
                "afternoon",
              ),
            ],
          }))
        }
      >
        <Icon name="plus" className="size-4" /> Add a service and time window
      </button>
      <fieldset className={box}>
        <legend className="sr-only">Recovery tasks</legend>
        <p className={kicker}>Unique recovery tasks (each counted once)</p>
        <div className="mt-2 flex flex-col gap-3">
          {inputs.tasks.map((t) => (
            <div key={t.id} className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-2 ring-1 ring-line sm:grid-cols-5">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                Task
                <input className={small} value={t.label} onChange={(e) => setTask(t.id, { label: e.target.value })} />
              </label>
              <Select
                label="Category"
                value={t.category}
                options={CATEGORY_KEYS.map((k) => [k, CATEGORIES[k]])}
                onChange={(v) => setTask(t.id, { category: v })}
              />
              <Select label="For misses started by" value={t.reason} options={reasonOptions} onChange={(v) => setTask(t.id, { reason: v })} />
              <NumField
                label="How many"
                unit="tasks"
                value={t.count}
                error={errorFor(errors, `task.${t.id}.count`)}
                onChange={(v) => setTask(t.id, { count: v })}
              />
              <AmountField
                label="Minutes each"
                unit="min"
                unknownLabel="Not measured"
                value={t.minutes}
                error={errorFor(errors, `task.${t.id}.minutes`)}
                onChange={(v) => setTask(t.id, { minutes: v as Duration })}
              />
              <button type="button" className={cx(secondary, "self-end")} onClick={() => set((x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cx(secondary, "self-start")}
            onClick={() =>
              set((x) => ({
                ...x,
                tasks: [
                  ...x.tasks,
                  {
                    id: nextId(
                      x.tasks.map((t) => t.id),
                      "t",
                    ),
                    label: "",
                    category: "other",
                    causes: ["missedService"],
                    occurrence: "",
                    issue: "",
                    reason: "supplier",
                    week: null,
                    count: null,
                    minutes: null,
                  },
                ],
              }))
            }
          >
            <Icon name="plus" className="size-4" /> Add a task
          </button>
        </div>
      </fieldset>
      <fieldset className={box}>
        <legend className="sr-only">Direct costs</legend>
        <p className={kicker}>Direct costs actually incurred</p>
        <p className="text-xs text-ink-muted">A contract fee effect only from an approved agreement or finance record. Never a lifetime client value.</p>
        <div className="mt-2 flex flex-col gap-3">
          {inputs.costs.map((c) => (
            <div key={c.id} className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-2 ring-1 ring-line sm:grid-cols-6">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                What
                <input className={small} value={c.label} onChange={(e) => setCost(c.id, { label: e.target.value })} />
              </label>
              <Select
                label="Kind"
                value={c.kind}
                options={COST_ORDER.map((k) => [k, COST_KINDS[k]] as [CostKind, string])}
                onChange={(v) => setCost(c.id, { kind: v })}
              />
              <AmountField
                label="Amount"
                unit="$"
                value={c.amount}
                error={errorFor(errors, `cost.${c.id}.amount`)}
                onChange={(v) => setCost(c.id, { amount: v })}
              />
              <Select label="Who bears it" value={c.bears} options={Object.entries(BEARS) as [Bears, string][]} onChange={(v) => setCost(c.id, { bears: v })} />
              <Select label="Source" value={c.source} options={sourceOptions} onChange={(v) => setCost(c.id, { source: v })} />
              <Select label="For misses started by" value={c.reason} options={reasonOptions} onChange={(v) => setCost(c.id, { reason: v })} />
              {errorFor(errors, `cost.${c.id}.source`) && (
                <p className="col-span-2 text-xs text-danger sm:col-span-6">{errorFor(errors, `cost.${c.id}.source`)}</p>
              )}
              <button type="button" className={cx(secondary, "self-end")} onClick={() => set((x) => ({ ...x, costs: x.costs.filter((y) => y.id !== c.id) }))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cx(secondary, "self-start")}
            onClick={() =>
              set((x) => ({
                ...x,
                costs: [
                  ...x.costs,
                  {
                    id: nextId(
                      x.costs.map((c) => c.id),
                      "c",
                    ),
                    label: "",
                    kind: "premium",
                    amount: null,
                    bears: "unknown",
                    occurrence: "",
                    issue: "",
                    reason: "supplier",
                    source: "estimate",
                  },
                ],
              }))
            }
          >
            <Icon name="plus" className="size-4" /> Add a cost
          </button>
        </div>
      </fieldset>
      <fieldset className={box}>
        <legend className="sr-only">Reliability actions</legend>
        <p className={kicker}>A reliability action to test</p>
        <div className="mt-2 flex flex-col gap-3">
          {inputs.interventions.map((x) => (
            <div key={x.id} className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-2 ring-1 ring-line sm:grid-cols-4">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                The action
                <input className={small} value={x.label} onChange={(e) => setAction(x.id, { label: e.target.value })} />
              </label>
              <Select
                label="Kind"
                value={x.kind}
                options={Object.entries(INTERVENTION_KINDS) as [InterventionKind, string][]}
                onChange={(v) => setAction(x.id, { kind: v })}
              />
              <Select label="Aimed at misses started by" value={x.reason} options={reasonOptions} onChange={(v) => setAction(x.id, { reason: v })} />
              <NumField
                label="How many of those misses"
                unit="visits"
                value={x.affected}
                error={errorFor(errors, `x.${x.id}.affected`)}
                onChange={(v) => setAction(x.id, { affected: v })}
              />
              <NumField
                label="Share it prevents (assumption)"
                unit="%"
                step={5}
                value={x.reduction === null ? null : Math.round(x.reduction * 100)}
                error={errorFor(errors, `x.${x.id}.reduction`)}
                onChange={(v) => setAction(x.id, { reduction: v === null ? null : v / 100 })}
              />
              <NumField
                label="One-off cost"
                unit="$"
                value={x.oneOff}
                error={errorFor(errors, `x.${x.id}.oneOff`)}
                onChange={(v) => setAction(x.id, { oneOff: v })}
              />
              <NumField
                label="Recurring cost"
                unit="$ per 4 weeks"
                value={x.recurring}
                error={errorFor(errors, `x.${x.id}.recurring`)}
                onChange={(v) => setAction(x.id, { recurring: v })}
              />
              <NumField
                label="Team time it takes"
                unit="h per 4 weeks"
                step={0.25}
                value={x.hours}
                error={errorFor(errors, `x.${x.id}.hours`)}
                onChange={(v) => setAction(x.id, { hours: v })}
              />
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Owner
                <input className={small} value={x.owner} onChange={(e) => setAction(x.id, { owner: e.target.value })} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                What would show it worked
                <input className={small} value={x.evidence} onChange={(e) => setAction(x.id, { evidence: e.target.value })} />
              </label>
              <label className="flex min-h-10 items-center gap-2 self-end text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-action)]"
                  checked={x.active}
                  onChange={(e) => setAction(x.id, { active: e.target.checked })}
                />
                Test it
              </label>
            </div>
          ))}
          <button
            type="button"
            className={cx(secondary, "self-start")}
            disabled={inputs.interventions.length >= 8}
            onClick={() =>
              set((x) => ({
                ...x,
                interventions: [
                  ...x.interventions,
                  {
                    id: nextId(
                      x.interventions.map((y) => y.id),
                      "x",
                    ),
                    label: "",
                    kind: "backup",
                    reason: "supplier",
                    issue: "",
                    affected: null,
                    reduction: null,
                    oneOff: null,
                    recurring: null,
                    hours: null,
                    starts: "",
                    owner: "",
                    evidence: "",
                    active: true,
                  },
                ],
              }))
            }
          >
            <Icon name="plus" className="size-4" /> Add an action
          </button>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-semibold">Read the hours an action frees as…</legend>
            {(
              [
                ["labour", "A labour cost avoided"],
                ["onboarding", "Onboarding capacity"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex min-h-10 items-center gap-2">
                <input
                  type="radio"
                  name="mine-freed"
                  className="size-4 accent-[var(--color-action)]"
                  checked={inputs.freedHours === v}
                  onChange={() => set((x) => ({ ...x, freedHours: v }))}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      </fieldset>
      <fieldset className={box}>
        <legend className="sr-only">A referral push to compare</legend>
        <label className="flex min-h-10 items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-action)]"
            checked={inputs.leads.active}
            onChange={(e) => set((x) => ({ ...x, leads: { ...x.leads, active: e.target.checked } }))}
          />
          Compare a referral push
        </label>
        <p className="text-xs text-ink-muted">
          Enter it yourself, from your own Referral Journey review or growth-readiness figures if you have them. Nothing is copied in automatically.
        </p>
        {inputs.leads.active && (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
              The push
              <input className={small} value={inputs.leads.label} onChange={(e) => set((x) => ({ ...x, leads: { ...x.leads, label: e.target.value } }))} />
            </label>
            <Select
              label="Source of the figures"
              value={inputs.leads.source}
              options={sourceOptions}
              onChange={(v) => set((x) => ({ ...x, leads: { ...x.leads, source: v } }))}
            />
            {(
              [
                ["effortHours", "Effort", "h"],
                ["cost", "Direct cost", "$"],
                ["enquiries", "Expected enquiries", "people"],
                ["starts", "Expected starts", "people"],
                ["firstStartWeeks", "Weeks to the first start", "weeks"],
                ["onboardingPerStart", "Onboarding per start", "h"],
              ] as const
            ).map(([k, label, unit]) => (
              <NumField
                key={k}
                label={label}
                unit={unit}
                value={inputs.leads[k]}
                error={errorFor(errors, `leads.${k}`)}
                onChange={(v) => set((x) => ({ ...x, leads: { ...x.leads, [k]: v } }))}
              />
            ))}
            <NumField
              label="Spare onboarding hours over the horizon"
              unit="h"
              value={inputs.onboardingHours}
              error={errorFor(errors, "onboardingHours")}
              onChange={(v) => set((x) => ({ ...x, onboardingHours: v }))}
            />
          </div>
        )}
      </fieldset>
      <fieldset className={box}>
        <legend className="sr-only">Comparison period</legend>
        <p className={kicker}>The period before (optional, for a trend)</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Label
            <input
              className={small}
              value={inputs.comparison.label}
              onChange={(e) => set((x) => ({ ...x, comparison: { ...x.comparison, label: e.target.value } }))}
            />
          </label>
          <NumField
            label="Scheduled visits"
            unit="visits"
            value={inputs.comparison.scheduled}
            error={errorFor(errors, "comparison.scheduled")}
            onChange={(v) => set((x) => ({ ...x, comparison: { ...x.comparison, scheduled: v } }))}
          />
          <NumField
            label="Verified supplier misses"
            unit="visits"
            value={inputs.comparison.supplierMissed}
            error={errorFor(errors, "comparison.supplierMissed")}
            onChange={(v) => set((x) => ({ ...x, comparison: { ...x.comparison, supplierMissed: v } }))}
          />
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted">
        Current reduction assumptions: {inputs.interventions.map((x) => `${x.label || "an action"} ${pct(x.reduction)}`).join("; ") || "none"}.
      </p>
    </div>
  );
}
