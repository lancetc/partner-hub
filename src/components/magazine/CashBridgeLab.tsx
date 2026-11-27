"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { CashBridgeBlock } from "@/lib/magazine";
import {
  addDays,
  BASELINE,
  blankEvent,
  blankHire,
  blankInputs,
  brisbaneDate,
  calculate,
  CATEGORIES,
  CATEGORY_ORDER,
  CERTAINTY,
  chartLow,
  compare,
  dateLabel,
  isIn,
  longDate,
  MODEL_VERSION,
  money,
  monthLabel,
  planChanges,
  resultChanges,
  safeCalculate,
  sensitiveReceipts,
  SOURCE_ORDER,
  SOURCES,
  STAT_ANSWERS,
  STAT_ORDER,
  STATUS_MARK,
  STATUS_ORDER,
  STATUSES,
  standardCases,
  STATUTORY,
  tableDays,
  validateInputs,
  type Amount,
  type CashEvent,
  type CashInputs,
  type CashResult,
  type Category,
  type Certainty,
  type Hire,
  type InputError,
  type NamedCase,
  type Num,
  type Scenario,
  type Snapshot,
  type Source,
  type StatAnswer,
  type Status,
} from "@/lib/cashBridge";
import {
  buildDebrief,
  CARD_STAGES,
  currentScenario,
  emptyState,
  finishProblems,
  LAST,
  LEVELS,
  oneEach,
  STAGE_ORDER,
  STEPS,
  type CardAnswer,
  type CardStage,
  type CashDebrief,
  type CashState,
  type Option,
} from "@/lib/cashBridgeLab";
import type { CashBridgeView, FundingSheet, ScenarioType } from "@/server/cashBridge";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Can we fund the next 90 days?" (docs/cash-bridge.md). A feature-article decision, not a bare calculator: growth
  looks healthy and a first guess; the timing reveal (evidence placed on a timeline, earned, invoiced and received
  kept apart); a start moves; the cash low point, read from the dated ledger; choices with consequences, with the
  capacity guardrail beside them; the Day 30 check-in; then the debrief and a learning 90-Day Funding Decision Sheet.
  The figures come from the shared model (lib/cashBridge); the debrief comes from the server once the attempt is done.

  The 90-day cash bridge is drawn as weekly paired bars, a daily balance line, the reserve line and a marker on the
  actual low date. The chart is for reading: the same figures are in a dated table and a weekly table, every week and
  date is a keyboard button, status is in words and a shape as well as colour, and nothing animates.

  "Plan my next 90 days" appears only for a business owner and the members they've authorised (the server decides).
  It starts blank, never with the story's figures, asks for dated aggregate amounts (no client or worker names, no
  bank connection, no uploads), saves only when asked, and keeps unsaved entries in this page only.

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
const FICTIONAL =
  "Fictional case: Maya, her agreement, her clients and every date and figure are invented for practice. None is a Trilogy Care rate, a real agreement term, a tax rule or a due date.";
const statusText = (s: Status) => `${STATUS_MARK[s]} ${STATUSES[s]}`;
const sign = (e: { category: Category; cents: number }) => `${isIn(e.category) ? "+" : "−"}${money(e.cents).replace("−", "")}`;

export function CashBridgeLab({ block: b, ctx }: { block: CashBridgeBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/cashbridge");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canPlan = Boolean(business.data?.access);
  return (
    <section aria-label={`90-Day Cash Bridge: ${b.title}`} className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="money" className="size-5" /> 90-Day Cash Bridge
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-ink">
          {mode === "story" ? `Fictional 90 days · ${b.storyVersion}` : "Your business · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canPlan && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with Maya"],
              ["business", "Plan my next 90 days"],
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
        <PlanMine
          orgName={business.data?.access?.orgName ?? ""}
          onSaved={(version, scenario) => {
            if (!ctx.preview)
              api(`/api/magazine/${ctx.guideId}/cashbridge`, { body: { blockId: b.id, action: "saved", version, scenario } }).catch(() => undefined);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practise with Maya
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: CashBridgeBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/cashbridge`;
  const loaded = useApi<CashBridgeView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<CashState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<CashDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [step, setStep] = useState(0);
  const [whatChanged, setWhatChanged] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);

  const take = (v: CashBridgeView) => {
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

  const scenario = useMemo(() => (s ? currentScenario(b, s) : BASELINE), [b, s]);
  const r = useMemo(() => safeCalculate(b.inputs, scenario), [b, scenario]);
  const base = useMemo(() => safeCalculate(b.inputs), [b]);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s) return <p className="mt-4 text-ink-muted">Loading…</p>;
  if (!r || !base) return <p role="alert">This case’s figures don’t validate yet: the author needs to fix them in the editor.</p>;

  const update = (fn: (prev: CashState) => CashState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  /** A change to the figures (an option, the actuals), with "what changed" before and after. */
  const change = (fn: (prev: CashState) => CashState) => {
    dirty.current = true;
    const next = fn(s);
    const ra = safeCalculate(b.inputs, currentScenario(b, s));
    const rz = safeCalculate(b.inputs, currentScenario(b, next));
    const lines = ra && rz ? resultChanges(ra, rz) : [];
    setWhatChanged(lines.length ? lines : ["Nothing in the bridge changed."]);
    setS(next);
  };
  const toggle = (id: string) =>
    change((p) => {
      const on = p.tried.includes(id);
      const tried = on ? p.tried.filter((x) => x !== id) : oneEach(b, [...p.tried, id]);
      return { ...p, tried, tested: on ? p.tested : [...new Set([...p.tested, id])] };
    });
  const go = (to: number) => {
    setStep(to);
    setWhatChanged([]);
    if (to > s.stage) update((p) => ({ ...p, stage: Math.max(p.stage, to) }));
    requestAnimationFrame(() => top.current?.focus());
  };
  const inspect = (what: string) => {
    if (!s.inspected.includes(what)) update((p) => (p.inspected.includes(what) ? p : { ...p, inspected: [...p.inspected, what] }));
  };
  const send = async (body: Record<string, unknown>, local: () => CashState) => {
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
      const v = await api<CashBridgeView>(url, { body: { blockId: b.id, state: s, ...body } });
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
  const allCards = b.cards.every((c) => s.cards[c.id]?.stage && s.cards[c.id]?.cash !== null);
  const opened = s.inspected.some((x) => x.startsWith("week:") || x.startsWith("date:"));
  const sensitivities = b.options.filter((o) => o.kind === "sensitivity");
  const actions = b.options.filter((o) => o.kind === "action");

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

      <div className="mt-4">
        <h4 ref={top} tabIndex={-1} className="sr-only">
          {STEPS[shown]}
        </h4>
        {shown === 0 && (
          <Growth
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (cover, hardest) => {
              const next = await send({ action: "predict", prediction: { cover, hardest } }, () => ({
                ...s,
                prediction: { cover, hardest },
                stage: Math.max(s.stage, 1),
              }));
              if (next) go(1);
            }}
            onNext={() => go(1)}
          />
        )}
        {shown === 1 && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="The timing reveal" text={b.story.reveal} names={[b.story.character]} />
            <p>
              Place each piece of evidence: <strong>what stage is it</strong>, and <strong>does Maya’s bank balance change on that date?</strong>
            </p>
            {b.cards.map((c) => (
              <EvidenceCard key={c.id} c={c} answer={s.cards[c.id]} onAnswer={(a) => update((p) => ({ ...p, cards: { ...p.cards, [c.id]: a } }))} />
            ))}
            <Timeline b={b} s={s} />
            <Next disabled={!allCards} hint="Place every piece of evidence first." onClick={() => go(2)} label="A start moves" />
          </div>
        )}
        {shown === 2 && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="A start moves" text={b.story.slip} names={[b.story.character]} />
            <EarnedLine r={r} />
            {sensitivities
              .filter((o) => o.patch.slips.length)
              .map((o) => (
                <OptionToggle key={o.id} o={o} on={s.tried.includes(o.id)} onToggle={() => toggle(o.id)} />
              ))}
            <WhatChanged lines={whatChanged} />
            <Question legend={b.slip.prompt} name="slip" options={b.slip.options} value={s.slip} onChange={(id) => update((p) => ({ ...p, slip: id }))} />
            <Next disabled={!s.slip} hint="Answer the question first." onClick={() => go(3)} label="Find the cash low point" />
          </div>
        )}
        {shown === 3 && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="The cash low point" text={b.story.lowPoint} names={[b.story.character]} />
            <WorkedExample b={b} onTry={() => inspect("example:moved")} />
            <p className="text-sm">
              Below is Maya’s baseline: every receipt on its expected date{s.tried.length ? " (the cases you switched on are off for this reading)" : ""}.
            </p>
            <BridgeExplorer r={base} showLow={Boolean(s.low)} onInspect={inspect} title="Maya’s baseline, 1 December to 28 February" />
            {!s.low ? (
              <LowReading
                b={b}
                busy={busy}
                onSubmit={async (option, required) => {
                  await send({ action: "low", low: { option, required } }, () => ({ ...s, low: { option, required }, stage: Math.max(s.stage, 4) }));
                }}
              />
            ) : (
              <>
                <p className={cx("rounded-2xl px-4 py-3 text-sm", TONE.good)} role="status">
                  Your reading is locked in. The ledger’s answer is now marked on the chart and in the tables.
                </p>
                <ResultCards r={base} inputs={b.inputs} scenario={BASELINE} />
              </>
            )}
            <Next
              disabled={!s.low || !opened}
              hint="Open a week or a date on the bridge, and give your reading of the low point."
              onClick={() => go(4)}
              label="Weigh the choices"
            />
          </div>
        )}
        {shown === 4 && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="Choices with consequences" text={b.story.choices} names={[b.story.character]} />
            <fieldset className={box}>
              <legend className={kicker}>Sensitivity cases: test, don’t predict</legend>
              <div className="mt-2 flex flex-col gap-2">
                {sensitivities.map((o) => (
                  <OptionToggle key={o.id} o={o} on={s.tried.includes(o.id)} onToggle={() => toggle(o.id)} required={o.id === b.mustTest} />
                ))}
              </div>
            </fieldset>
            <fieldset className={box}>
              <legend className={kicker}>Maya’s options (one per kind at a time)</legend>
              <div className="mt-2 flex flex-col gap-2">
                {actions.map((o) => (
                  <OptionToggle key={o.id} o={o} on={s.tried.includes(o.id)} onToggle={() => toggle(o.id)} />
                ))}
              </div>
            </fieldset>
            <WhatChanged lines={whatChanged} />
            {(r.refused.length > 0 || r.conflicts.length > 0) && (
              <div role="alert" className={cx("rounded-2xl p-4 text-sm", TONE.warn)}>
                {r.conflicts.map((x) => (
                  <p key={x}>⚠ Conflict with agreed service: {x}</p>
                ))}
                {r.refused.map((x) => (
                  <p key={x}>Not moved: {x}</p>
                ))}
              </div>
            )}
            <ResultCards r={r} inputs={b.inputs} scenario={scenario} />
            <BridgeExplorer r={r} showLow onInspect={inspect} title={s.tried.length ? "With the cases and options you’ve switched on" : "The baseline"} />
            <CapacityPanel r={r} onOpen={() => inspect("view:capacity")} />
            <ComparisonTable
              rows={compare(b.inputs, [
                { id: "baseline", label: "Baseline: receipts on time", changed: [], scenario: BASELINE },
                ...sensitivities.map((o) => ({ id: o.id, label: o.label, changed: [o.describe], scenario: o.patch })),
                ...(s.tried.length
                  ? [{ id: "yours", label: "Your choices now", changed: s.tried.map((x) => b.options.find((o) => o.id === x)!.label), scenario }]
                  : []),
              ])}
            />
            <Question
              legend={b.story.dilemma || "What does Maya do?"}
              name="decision"
              options={b.decisions}
              value={s.decision}
              onChange={(id) => update((p) => ({ ...p, decision: id }))}
            />
            <Question
              legend="How would you explain it to Maya?"
              name="explanation"
              options={b.explanations}
              value={s.explanation}
              onChange={(id) => update((p) => ({ ...p, explanation: id }))}
            />
            <Next
              disabled={!s.decision || !s.explanation || !s.tested.includes(b.mustTest)}
              hint="Test the delayed-receipt case, then choose a decision and an explanation."
              onClick={() => go(5)}
              label="Day 30 check-in"
            />
          </div>
        )}
        {shown === 5 && !finished && (
          <div className="flex flex-col gap-4">
            <StoryBeat title="Day 30 check-in" text={b.story.checkIn} names={[b.story.character]} />
            {b.story.avaReturn && b.story.transmission.who && (
              <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
                <blockquote className="italic">{b.story.avaReturn}</blockquote>
                <figcaption className="mt-1 text-sm text-ink-muted">{b.story.transmission.who}</figcaption>
              </figure>
            )}
            <div className={box}>
              <p className={kicker}>What’s now known</p>
              <p className="mt-1">{b.actuals.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className={primary} disabled={s.actuals} onClick={() => change((p) => ({ ...p, actuals: true }))}>
                  <Icon name="check" className="size-4" /> {s.actuals ? "Estimates replaced with what’s known" : "Replace the estimates with what’s known"}
                </button>
                <span className="text-sm text-ink-muted">Nothing changes until you choose to: a forecast is replaced deliberately, never silently.</span>
              </div>
            </div>
            <WhatChanged lines={whatChanged} />
            {s.actuals && <ResultCards r={r} inputs={b.inputs} scenario={scenario} />}
            <Question
              legend={b.review.prompt}
              name="review"
              options={b.review.options}
              value={s.review}
              onChange={(id) => update((p) => ({ ...p, review: id }))}
            />
            {finishProblems(b, s).length > 0 && s.review && (
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
                  const next = await send({ action: "finish", decision: s.decision, explanation: s.explanation, review: s.review }, () => ({
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
        {shown >= 5 && finished && debrief && (
          <Debrief
            b={b}
            s={s}
            d={debrief}
            busy={busy}
            preview={Boolean(ctx.preview)}
            guideId={ctx.guideId}
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

function OptionToggle({ o, on, onToggle, required }: { o: CashBridgeBlock["options"][number]; on: boolean; onToggle: () => void; required?: boolean }) {
  return (
    <label className={cx("flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted", on && "bg-tealtint")}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-action)]" checked={on} onChange={onToggle} />
      <span className="text-sm">
        <span className="font-semibold">
          {o.label}
          {required ? " (test this one)" : ""}
        </span>
        <span className="block">{o.describe}</span>
        <span className="block text-ink-muted">{o.note}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 1: growth looks healthy, and a first guess
// ---------------------------------------------------------------------------------------------

function Growth({
  b,
  s,
  busy,
  onSubmit,
  onNext,
}: {
  b: CashBridgeBlock;
  s: CashState;
  busy: boolean;
  onSubmit: (cover: string, hardest: string) => void;
  onNext: () => void;
}) {
  const [cover, setCover] = useState(s.prediction?.cover ?? "");
  const [hardest, setHardest] = useState(s.prediction?.hardest ?? "");
  const locked = Boolean(s.prediction);
  return (
    <div className="flex flex-col gap-4">
      <StoryBeat title="Maya’s business" text={b.story.situation} names={[b.story.character]} />
      {b.story.transmission.text && (
        <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
          <blockquote className="italic">{b.story.transmission.text}</blockquote>
          <figcaption className="mt-1 text-sm text-ink-muted">{b.story.transmission.who} (optional: the story is complete without it)</figcaption>
        </figure>
      )}
      <StoryBeat title="Growth looks healthy" text={b.story.growth} names={[]} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className={box}>
          <p className={kicker}>The monthly view</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {b.margin.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className={box}>
          <p className={kicker}>{b.agreement.title}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {b.agreement.lines.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <Question legend={b.prediction.prompt} name="cover" options={b.prediction.options} value={cover} onChange={setCover} disabled={locked} />
      <Question legend={b.prediction.hardestPrompt} name="hardest" options={b.prediction.hardest} value={hardest} onChange={setHardest} disabled={locked} />
      {locked ? (
        <Next onClick={onNext} label="See the dates" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy || !cover || !hardest} onClick={() => onSubmit(cover, hardest)}>
            Lock in my guess <Icon name="arrow-right" className="size-4" />
          </button>
          <span className="text-sm text-ink-muted">It isn’t marked. You’ll see it beside the ledger at the end.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 2: the timing reveal
// ---------------------------------------------------------------------------------------------

function EvidenceCard({ c, answer, onAnswer }: { c: CashBridgeBlock["cards"][number]; answer: CardAnswer | undefined; onAnswer: (a: CardAnswer) => void }) {
  const a = answer ?? { stage: "" as const, cash: null };
  return (
    <div className={box}>
      <p className="font-semibold">{c.title}</p>
      <p className="mt-1">{c.text}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          What stage is it?
          <select className={small} value={a.stage} onChange={(e) => onAnswer({ ...a, stage: e.target.value as CardStage | "" })}>
            <option value="">Choose…</option>
            {STAGE_ORDER.map((k) => (
              <option key={k} value={k}>
                {CARD_STAGES[k]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-semibold">Does the bank balance change{c.date ? ` on ${dateLabel(c.date)}` : ""}?</legend>
          <div className="flex gap-4">
            {[
              [true, "Yes"],
              [false, "No"],
            ].map(([v, label]) => (
              <label key={String(v)} className="flex min-h-10 items-center gap-2">
                <input
                  type="radio"
                  name={`cash-${c.id}`}
                  className="size-5 accent-[var(--color-action)]"
                  checked={a.cash === v}
                  onChange={() => onAnswer({ ...a, cash: v as boolean })}
                />
                {label as string}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/** The evidence on a timeline, in date order, as the learner has placed it. Undated items sit apart. */
function Timeline({ b, s }: { b: CashBridgeBlock; s: CashState }) {
  const dated = b.cards.filter((c) => c.date).sort((x, y) => x.date.localeCompare(y.date));
  const undated = b.cards.filter((c) => !c.date);
  const mark = (id: string) => {
    const a = s.cards[id];
    if (!a?.stage) return "not placed yet";
    return `${CARD_STAGES[a.stage]}${a.cash === null ? "" : a.cash ? " · bank balance moves (●)" : " · no cash moves (○)"}`;
  };
  return (
    <div className={box}>
      <p className={kicker}>Your timeline</p>
      <ol className="mt-2 flex flex-col gap-1 border-l-2 border-line-strong pl-4 text-sm">
        {dated.map((c) => (
          <li key={c.id}>
            <span className="font-semibold">{dateLabel(c.date)}</span> · {c.title}: {mark(c.id)}
          </li>
        ))}
      </ol>
      {undated.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">No date anyone can rely on:</span> {undated.map((c) => `${c.title} (${mark(c.id)})`).join("; ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 3: a start moves
// ---------------------------------------------------------------------------------------------

/** Earned is a learning line: fees by the month they're earned, and the date each is paid. */
function EarnedLine({ r }: { r: CashResult }) {
  if (!r.earned.length) return null;
  return (
    <div className={box}>
      <p className={kicker}>Earned, then received</p>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {r.earned.map((m) => (
          <li key={m.month}>
            {monthLabel(m.month)}: {m.count} participants meet the earning condition, {money(m.cents)} earned, <strong>paid {dateLabel(m.paidOn)}</strong>
            {m.inWindow ? "" : " (after the 90 days: earned, not cash here)"}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-ink-muted">
        Enquiries and clients waiting for an allocation aren’t counted. Earned income moves cash only on its payment date.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Beat 4: the cash low point
// ---------------------------------------------------------------------------------------------

function WorkedExample({ b, onTry }: { b: CashBridgeBlock; onTry: () => void }) {
  const [moved, setMoved] = useState(false);
  const ex = b.example;
  const r = useMemo(() => {
    const sc: Scenario = moved ? { ...BASELINE, actuals: [{ id: ex.moveId, date: ex.moveTo, amount: null }] } : BASELINE;
    return safeCalculate(ex.inputs, sc);
  }, [ex, moved]);
  if (!r) return null;
  const rows = r.days.filter((d) => d.events.length);
  const moving = ex.inputs.events.find((e) => e.id === ex.moveId);
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">Check the rule first: a short worked example</summary>
      <p className="mt-1 text-sm">{ex.text}</p>
      <div className="mt-2 overflow-x-auto" role="region" aria-label="Worked example ledger" tabIndex={0}>
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">Worked example: receipts, payments and closing cash by date</caption>
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2 text-right">Receipt</th>
              <th className="py-1 pr-2 text-right">Payment</th>
              <th className="py-1 pr-2 text-right">End of day</th>
              <th className="py-1 text-right">Intraday check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.date} className={cx("border-t border-line", d.date === r.low.date && "font-semibold")}>
                <td className="py-1 pr-2">
                  {dateLabel(d.date)}
                  {d.date === r.low.date ? " ▼ low" : ""}
                </td>
                <td className="py-1 pr-2 text-right">{money(d.receipts)}</td>
                <td className="py-1 pr-2 text-right">{money(d.outflows)}</td>
                <td className="py-1 pr-2 text-right">{money(d.closing)}</td>
                <td className="py-1 text-right">{d.receipts && d.outflows ? money(d.intraday) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm" role="status">
        Lowest end-of-day cash {money(r.low.cents)} on {dateLabel(r.low.date)}. Lowest cumulative change {money(r.worstCumulative)}, so keeping{" "}
        {money(r.reserve)} needs {money(r.required)} at the start: {money(r.additional ?? 0)} more than the {money(r.opening)} entered.
        {r.intraday.risks.length > 0 &&
          ` Separately, the conservative intraday check (payments clearing before receipts on the same day) would touch ${money(r.intraday.cents)} on ${dateLabel(r.intraday.date)}.`}
      </p>
      {moving && (
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-action)]"
            checked={moved}
            onChange={(e) => {
              setMoved(e.target.checked);
              onTry();
            }}
          />
          Settle the {money(Math.round((typeof moving.amount === "number" ? moving.amount : 0) * 100))} receipt on {dateLabel(ex.moveTo)} instead (before that
          day’s payment)
        </label>
      )}
    </details>
  );
}

function LowReading({ b, busy, onSubmit }: { b: CashBridgeBlock; busy: boolean; onSubmit: (option: string, required: Num) => void }) {
  const [option, setOption] = useState("");
  const [required, setRequired] = useState<Num>(null);
  return (
    <div className={cx(box, "flex flex-col gap-3")}>
      <Question legend={b.lowPoint.prompt} name="low" options={b.lowPoint.options} value={option} onChange={setOption} />
      <label className="flex max-w-sm flex-col gap-1 text-sm font-semibold">
        {b.lowPoint.requiredPrompt}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          className={small}
          value={required ?? ""}
          onChange={(e) => setRequired(e.target.value === "" ? null : Number(e.target.value))}
        />
        <span className="font-normal text-ink-muted">Leave it blank if you’re not sure: blank isn’t zero.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || !option} onClick={() => onSubmit(option, required)}>
          Lock in my reading
        </button>
        <span className="text-sm text-ink-muted">Then the ledger’s answer is marked.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The cash bridge: chart, weeks, dates and tables (all reading the same days)
// ---------------------------------------------------------------------------------------------

const W = 720;
const L = 64;
const RIGHT = 12;
const LINE_TOP = 18;
const LINE_BOTTOM = 196;
const BAR_BASE = 300;
const BAR_MAX = 76;
const thousands = (c: number) => `${c < 0 ? "−" : ""}$${Math.round(Math.abs(c) / 100_000)}k`;

function BridgeChart({ r, showLow, week, onWeek }: { r: CashResult; showLow: boolean; week: number | null; onWeek: (k: number) => void }) {
  const dayW = (W - L - RIGHT) / r.days.length;
  const values = [r.opening, r.reserve, 0, ...r.days.map((d) => d.closing)];
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = Math.max(1, hi - lo);
  const y = (c: number) => LINE_TOP + ((hi - c) / span) * (LINE_BOTTOM - LINE_TOP);
  const maxBar = Math.max(1, ...r.buckets.flatMap((b) => [b.receipts, b.outflows]));
  const points = [`${L},${y(r.opening)}`, ...r.days.map((d, i) => `${L + (i + 1) * dayW},${y(d.closing)}`)].join(" ");
  const low = chartLow(r);
  const lowIndex = r.days.findIndex((d) => d.date === low.date);
  const lowX = low.date === r.startDate && r.low.atOpening ? L : L + (lowIndex + 1) * dayW;
  return (
    <svg viewBox={`0 0 ${W} 318`} className="h-auto w-full" aria-hidden="true">
      <defs>
        <pattern id="cb-out" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f4d3cc" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#a8452f" strokeWidth="3" />
        </pattern>
      </defs>
      {r.buckets.map((b) => {
        const x0 = L + b.index * 7 * dayW;
        const w = b.days * dayW;
        const bw = Math.max(3, (w - 10) / 2);
        const hIn = (b.receipts / maxBar) * BAR_MAX;
        const hOut = (b.outflows / maxBar) * BAR_MAX;
        return (
          <g key={b.index} onClick={() => onWeek(b.index)} className="cursor-pointer">
            <rect x={x0} y={LINE_TOP - 8} width={w} height={BAR_BASE - LINE_TOP + 18} fill={week === b.index ? "rgba(0,130,130,0.12)" : "transparent"} />
            <rect x={x0 + 3} y={BAR_BASE - hIn} width={bw} height={hIn} fill="#0f7b6c" />
            <rect x={x0 + 5 + bw} y={BAR_BASE - hOut} width={bw} height={hOut} fill="url(#cb-out)" stroke="#a8452f" strokeWidth="0.75" />
            <text x={x0 + w / 2} y={314} textAnchor="middle" fontSize="10" fill="currentColor">
              {dateLabel(b.from).slice(4)}
            </text>
          </g>
        );
      })}
      <line x1={L} x2={W - RIGHT} y1={BAR_BASE} y2={BAR_BASE} stroke="currentColor" strokeOpacity="0.4" />
      {lo < 0 && <line x1={L} x2={W - RIGHT} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.5" />}
      <line x1={L} x2={W - RIGHT} y1={y(r.reserve)} y2={y(r.reserve)} stroke="#b7791f" strokeWidth="2" strokeDasharray="6 4" />
      <text x={W - RIGHT} y={y(r.reserve) - 4} textAnchor="end" fontSize="11" fill="currentColor">
        Reserve {money(r.reserve)}
      </text>
      {[hi, lo].map((v, k) => (
        <text key={k} x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="currentColor">
          {thousands(v)}
        </text>
      ))}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {showLow && (
        <g>
          <circle cx={lowX} cy={y(low.cents)} r="5" fill="#a8452f" stroke="white" strokeWidth="1.5" />
          <path d={`M ${lowX - 6} ${y(low.cents) + 12} L ${lowX + 6} ${y(low.cents) + 12} L ${lowX} ${y(low.cents) + 6} Z`} fill="currentColor" />
          <text
            x={Math.min(W - RIGHT - 4, Math.max(L + 4, lowX))}
            y={Math.min(LINE_BOTTOM + 14, y(low.cents) + 26)}
            textAnchor={lowX > W - 160 ? "end" : lowX < L + 120 ? "start" : "middle"}
            fontSize="11"
            fontWeight="700"
            fill="currentColor"
          >
            Low: {money(low.cents)}, {dateLabel(low.date)}
          </text>
        </g>
      )}
      <text x={4} y={LINE_TOP + 2} fontSize="10" fill="currentColor">
        Cash
      </text>
      <text x={4} y={BAR_BASE - BAR_MAX} fontSize="10" fill="currentColor">
        Weekly
      </text>
    </svg>
  );
}

function BridgeExplorer({ r, showLow, onInspect, title }: { r: CashResult; showLow: boolean; onInspect: (what: string) => void; title: string }) {
  const [week, setWeek] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const pickWeek = (k: number) => {
    setWeek(k);
    setDate(null);
    onInspect(`week:${k + 1}`);
  };
  const pickDate = (d: string) => {
    setDate(d);
    onInspect(`date:${d}`);
  };
  const summary = `${title}. Opening cash ${money(r.opening)}, reserve ${money(r.reserve)}. ${r.belowReserve.days} ${r.belowReserve.days === 1 ? "date" : "dates"} below the reserve${
    r.belowZero.days ? ` and ${r.belowZero.days} below zero` : ""
  }.${showLow ? ` Lowest end-of-day cash ${money(r.low.cents)} on ${longDate(r.low.date)}.` : ""} The same figures are in the tables below.`;
  const wk = week === null ? null : r.buckets[week];
  return (
    <figure className={cx(box, "flex flex-col gap-3")}>
      <figcaption className="text-sm">
        <span className={kicker}>The 90-day cash bridge</span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-ink-muted">{summary}</span>
      </figcaption>
      <BridgeChart r={r} showLow={showLow} week={week} onWeek={pickWeek} />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="mr-1 inline-block size-3 bg-[#0f7b6c] align-middle" aria-hidden="true" /> Receipts in the week (solid)
        </span>
        <span>
          <span
            className="mr-1 inline-block size-3 border border-[#a8452f] bg-[repeating-linear-gradient(45deg,#a8452f_0_2px,#f4d3cc_2px_5px)] align-middle"
            aria-hidden="true"
          />{" "}
          Outflows in the week (striped)
        </span>
        <span>── Cash at the end of each date</span>
        <span>- - Reserve</span>
        {showLow && <span>● ▲ The dated low point</span>}
      </p>
      <div role="group" aria-label="Open a week" className="flex flex-wrap gap-1.5">
        {r.buckets.map((b) => (
          <button
            key={b.index}
            type="button"
            aria-pressed={week === b.index}
            onClick={() => pickWeek(b.index)}
            className={cx(
              "min-h-10 rounded-lg border border-line-strong px-2 text-xs font-semibold",
              week === b.index ? "bg-action text-on-action" : "bg-surface hover:bg-muted",
            )}
          >
            Week {b.index + 1}: {dateLabel(b.from).slice(4)}–{dateLabel(b.to).slice(4)}
            {b.low < r.reserve ? " ⚠" : ""}
            {showLow && b.lowDate === r.low.date && b.low === r.low.cents ? " ▼" : ""}
          </button>
        ))}
      </div>
      {wk && (
        <div className="rounded-xl bg-muted p-3 text-sm" role="region" aria-label={`Week ${wk.index + 1}`}>
          <p className="font-semibold">
            Week {wk.index + 1}, {longDate(wk.from)} to {longDate(wk.to)} ({wk.days} dates)
          </p>
          <p>
            Receipts {money(wk.receipts)}; outflows {money(wk.outflows)}. End of the week {money(wk.closing)}; lowest in the week {money(wk.low)} on{" "}
            {dateLabel(wk.lowDate)}
            {wk.low < r.reserve ? " (below the reserve ⚠)" : ""}.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {r.days
              .filter((d) => d.bucket === wk.index && d.events.length)
              .map((d) => (
                <li key={d.date}>
                  <button type="button" className={cx(link, "min-h-8 text-left")} onClick={() => pickDate(d.date)}>
                    {dateLabel(d.date)}
                  </button>{" "}
                  {d.events.map((e) => `${e.label} ${sign(e)} (${STATUS_MARK[e.status]} ${STATUSES[e.status]})`).join("; ")}. End of day {money(d.closing)}.
                </li>
              ))}
          </ul>
        </div>
      )}
      {date && <DayPanel r={r} date={date} showLow={showLow} />}
      <details className="text-sm" onToggle={(e) => e.currentTarget.open && onInspect("view:table")}>
        <summary className="min-h-11 cursor-pointer font-semibold">Dated table: every date with a payment, a receipt or a balance below the reserve</summary>
        <DatedTable r={r} showLow={showLow} onDate={pickDate} />
      </details>
      <details className="text-sm" onToggle={(e) => e.currentTarget.open && onInspect("view:weeks")}>
        <summary className="min-h-11 cursor-pointer font-semibold">Weekly table: the 13 display weeks</summary>
        <div className="overflow-x-auto" role="region" aria-label="Weekly table" tabIndex={0}>
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Receipts, outflows, end-of-week cash and the lowest date in each week</caption>
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2">Week</th>
                <th className="py-1 pr-2 text-right">Receipts</th>
                <th className="py-1 pr-2 text-right">Outflows</th>
                <th className="py-1 pr-2 text-right">End of week</th>
                <th className="py-1 text-right">Lowest in the week</th>
              </tr>
            </thead>
            <tbody>
              {r.buckets.map((b) => (
                <tr key={b.index} className="border-t border-line">
                  <td className="py-1 pr-2">
                    {b.index + 1}: {dateLabel(b.from)}–{dateLabel(b.to)}
                  </td>
                  <td className="py-1 pr-2 text-right">{money(b.receipts)}</td>
                  <td className="py-1 pr-2 text-right">{money(b.outflows)}</td>
                  <td className="py-1 pr-2 text-right">{money(b.closing)}</td>
                  <td className="py-1 text-right">
                    {money(b.low)} ({dateLabel(b.lowDate)}){b.low < r.reserve ? " ⚠ below reserve" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function DayPanel({ r, date, showLow }: { r: CashResult; date: string; showLow: boolean }) {
  const i = r.days.findIndex((d) => d.date === date);
  const d = r.days[i];
  if (!d) return null;
  const before = i === 0 ? r.opening : r.days[i - 1].closing;
  return (
    <div className="rounded-xl border border-line-strong p-3 text-sm" role="region" aria-label={longDate(date)}>
      <p className="font-semibold">
        {longDate(date)}
        {showLow && date === r.low.date ? " · ▼ the dated low point" : ""}
      </p>
      <p>Start of the day {money(before)}.</p>
      <ul className="mt-1 flex flex-col gap-1">
        {d.events.map((e) => (
          <li key={e.id}>
            <span className="font-semibold">{sign(e)}</span> {e.label}. {statusText(e.status)} · {SOURCES[e.source]}
            {e.moved ? ` · moved from ${e.moved.startsWith("start") ? `a ${e.moved}` : dateLabel(e.moved)}` : ""}
            {e.note ? <span className="block text-ink-muted">{e.note}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        End of the day {money(d.closing)}
        {d.closing < 0 ? " (below zero ⚠)" : d.closing < r.reserve ? " (below the reserve ⚠)" : ""}.
        {d.receipts > 0 && d.outflows > 0 && ` Conservative intraday check (labelled separately): ${money(d.intraday)} if the payments cleared first.`}
      </p>
    </div>
  );
}

function DatedTable({ r, showLow, onDate }: { r: CashResult; showLow: boolean; onDate: (d: string) => void }) {
  const rows = tableDays(r).filter((d) => showLow || d.events.length || d.closing < r.reserve);
  return (
    <div className="overflow-x-auto" role="region" aria-label="Dated table" tabIndex={0}>
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Receipts, outflows and end-of-day cash by date, with each item’s status and source</caption>
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2 text-right">In</th>
            <th className="py-1 pr-2 text-right">Out</th>
            <th className="py-1 pr-2 text-right">End of day</th>
            <th className="py-1 pr-2">Reading</th>
            <th className="py-1">Items (status · source)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date} className={cx("border-t border-line align-top", showLow && d.date === r.low.date && "font-semibold")}>
              <td className="py-1 pr-2">
                <button type="button" className={link} onClick={() => onDate(d.date)}>
                  {dateLabel(d.date)}
                </button>
              </td>
              <td className="py-1 pr-2 text-right">{d.receipts ? money(d.receipts) : "—"}</td>
              <td className="py-1 pr-2 text-right">{d.outflows ? money(d.outflows) : "—"}</td>
              <td className="py-1 pr-2 text-right">{money(d.closing)}</td>
              <td className="py-1 pr-2">
                {[
                  showLow && d.date === r.low.date ? "▼ Low point" : "",
                  d.closing < 0 ? "⚠ Below zero" : d.closing < r.reserve ? "⚠ Below reserve" : "",
                  d.receipts > 0 && d.outflows > 0 ? `Intraday check ${money(d.intraday)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
              <td className="py-1">
                {d.events.map((e) => `${e.label} ${sign(e)} (${STATUS_MARK[e.status]} ${STATUSES[e.status]} · ${SOURCES[e.source]})`).join("; ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The result cards, the capacity guardrail and the comparison
// ---------------------------------------------------------------------------------------------

function ResultCards({ r, inputs, scenario }: { r: CashResult; inputs: CashInputs; scenario: Scenario }) {
  const sensitive = useMemo(() => (r.reliable ? sensitiveReceipts(inputs, scenario) : []), [r.reliable, inputs, scenario]);
  const totalIn = r.coverage.receipts.actual + r.coverage.receipts.committed + r.coverage.receipts.projected;
  const unconfirmed = r.unconfirmed.length;
  return (
    <div className="grid gap-3 md:grid-cols-2" role="status" aria-live="polite">
      {!r.reliable && (
        <div className={cx("rounded-2xl p-4 text-sm md:col-span-2", TONE.warn)}>
          <p className="font-semibold">⚠ Insufficient information for a reliable cash requirement</p>
          <p>The arithmetic below is partial. Confirm these first:</p>
          <ul className="mt-1 list-disc pl-5">
            {r.limitations.map((l) => (
              <li key={l.text}>{l.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={box}>
        <p className={kicker}>Cash low point</p>
        <p className="mt-1">
          {r.openingKnown ? (
            <>
              Forecast lowest bank cash: <strong>{money(r.low.cents)}</strong> on <strong>{longDate(r.low.date)}</strong>
              {r.low.atOpening ? " (the opening balance)" : ""}.
            </>
          ) : (
            <>
              Opening cash is unknown, so the lowest balance can’t be given. The deepest fall is {money(r.worstCumulative)}, by {longDate(r.low.date)}.
            </>
          )}
        </p>
        <p className="mt-1 text-sm">
          {r.low.basis === "actual"
            ? "● Every item up to that date is actual."
            : `○ Projected: it depends on ${unconfirmed} ${unconfirmed === 1 ? "receipt" : "receipts"} not yet cleared.`}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Conservative intraday check, labelled separately: if same-day payments cleared before receipts, the lowest would be {money(r.intraday.cents)} on{" "}
          {dateLabel(r.intraday.date)}
          {r.intraday.risks.length ? ` (a possible payment-timing shortfall on ${r.intraday.risks.map((x) => dateLabel(x.date)).join(" and ")})` : ""}.
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>Cash needed</p>
        <p className="mt-1">
          To keep a {money(r.reserve)} reserve, the model needs <strong>{money(r.required)}</strong> at the start;{" "}
          {r.openingKnown ? (
            <>
              you entered {money(r.opening)}; the additional gap is <strong>{money(r.additional ?? 0)}</strong>.
            </>
          ) : (
            "opening cash is unknown, so the gap is too."
          )}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Before any separately modelled financing. A gap isn’t a reason to borrow, and a small one doesn’t mean a loan is available.
        </p>
        {r.financing.included && (
          <p className="mt-1 text-sm">
            Financing included, shown apart: borrowed {money(r.financing.drawn)}, repaid {money(r.financing.repaid)}, fees and interest{" "}
            {money(r.financing.costs)}; still owed at the end {money(r.financing.outstanding)}.
          </p>
        )}
        {r.financing.limit !== null && (
          <p className="mt-1 text-sm">
            A {money(r.financing.limit)} credit limit ({r.financing.limitCommitted ? "committed" : "not committed"}) is never counted as cash.
          </p>
        )}
      </div>
      <div className={box}>
        <p className={kicker}>Why it happens</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {r.drivers.map((x) => (
            <li key={x.category}>
              {x.label}: {money(x.cents)} up to {dateLabel(r.low.date)} ({x.count} {x.count === 1 ? "payment" : "payments"})
            </li>
          ))}
        </ul>
        {r.unconfirmed.length > 0 && (
          <p className="mt-1 text-sm">
            Receipts not yet cleared:{" "}
            {r.unconfirmed
              .slice(0, 3)
              .map((e) => `${e.label} (${money(e.cents)}, ${dateLabel(e.date)}, ${STATUSES[e.status].toLowerCase()})`)
              .join("; ")}
            {r.unconfirmed.length > 3 ? `; and ${r.unconfirmed.length - 3} more` : ""}.
          </p>
        )}
      </div>
      <div className={box}>
        <p className={kicker}>Payroll and obligations</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>
            {r.payroll.next ? `Next pay date ${longDate(r.payroll.next.date)}: ${money(r.payroll.next.cents)} gross pay.` : "No pay dates in the window."}
          </li>
          {r.payroll.setup.length > 0 && (
            <li>
              Setup commitments: {money(r.payroll.setup.reduce((n, e) => n + e.cents, 0))} (
              {r.payroll.setup.map((e) => `${e.label}, ${dateLabel(e.date)}`).join("; ")})
            </li>
          )}
          <li>{r.statutory.map((x) => `${x.label}: ${STAT_ANSWERS[x.answer].toLowerCase()}`).join("; ")}.</li>
          <li>
            {r.belowReserve.days
              ? `${r.belowReserve.days} ${r.belowReserve.days === 1 ? "date" : "dates"} below the reserve, first ${longDate(r.belowReserve.first)}${
                  r.belowZero.days ? `; ${r.belowZero.days} below zero, first ${longDate(r.belowZero.first)}` : ""
                }.`
              : "No date below the reserve."}
          </li>
        </ul>
      </div>
      <div className={cx(box, "md:col-span-2")}>
        <p className={kicker}>Confidence</p>
        <p className="mt-1 text-sm">
          Receipts in the window: {money(r.coverage.receipts.actual)} actual, {money(r.coverage.receipts.committed)} committed,{" "}
          {money(r.coverage.receipts.projected)} projected{totalIn ? ` (${Math.round((r.coverage.receipts.actual / totalIn) * 100)}% actual)` : ""}.
          {r.unknowns.length ? ` ${r.unknowns.length} ${r.unknowns.length === 1 ? "item is" : "items are"} unknown and left out.` : ""}
        </p>
        {sensitive.length > 0 && (
          <p className="mt-1 text-sm">
            Most sensitive payment dates (each tested 14 days later):{" "}
            {sensitive
              .map((x) => `${x.label}: lowest ${money(x.low)} on ${dateLabel(x.lowDate)}${x.belowZero ? `, ${x.belowZero} days below zero` : ""}`)
              .join("; ")}
            .
          </p>
        )}
      </div>
    </div>
  );
}

function CapacityPanel({ r, onOpen }: { r: CashResult; onOpen: () => void }) {
  if (!r.capacity) return null;
  const over = r.capacity.filter((m) => m.pressure);
  return (
    <details className={box} onToggle={(e) => e.currentTarget.open && onOpen()}>
      <summary className="min-h-11 cursor-pointer font-semibold">
        Capacity guardrail (the Hiring Runway model):{" "}
        {over.length ? `⚠ over the planning threshold in ${over.map((m) => monthLabel(m.month)).join(", ")}` : "✓ under the threshold every month"}
      </summary>
      <p className="mt-1 text-sm text-ink-muted">
        Capacity plans for every start with a planned date, secured or not; cash waits for the earning condition. Moving the hire changes this, never a fee.
      </p>
      <div className="mt-2 overflow-x-auto" role="region" aria-label="Capacity by month" tabIndex={0}>
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">Month</th>
              <th className="py-1 pr-2 text-right">Participants planned</th>
              <th className="py-1 pr-2 text-right">Starts</th>
              <th className="py-1 pr-2 text-right">Coordinator FTE</th>
              <th className="py-1 pr-2 text-right">Hours needed / available</th>
              <th className="py-1">Reading</th>
            </tr>
          </thead>
          <tbody>
            {r.capacity.map((m) => (
              <tr key={m.month} className="border-t border-line">
                <td className="py-1 pr-2">{monthLabel(m.month)}</td>
                <td className="py-1 pr-2 text-right">{m.clients}</td>
                <td className="py-1 pr-2 text-right">{m.starts}</td>
                <td className="py-1 pr-2 text-right">{Math.round(m.fte * 100) / 100}</td>
                <td className="py-1 pr-2 text-right">
                  {Math.round(m.required)} / {Math.round(m.available)} h
                </td>
                <td className="py-1">
                  {m.utilisation === null
                    ? "No available capacity ⚠"
                    : `${Math.round(m.utilisation * 100)}% ${m.pressure ? "⚠ over the planning threshold" : "✓ under the threshold"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ComparisonTable({ rows }: { rows: ReturnType<typeof compare> }) {
  return (
    <div className={box}>
      <p className={kicker}>Compare the cases</p>
      <div className="mt-2 overflow-x-auto" role="region" aria-label="Scenario comparison" tabIndex={0}>
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Each case’s lowest cash and date, opening cash needed, gap, and days below the reserve and zero</caption>
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">Case</th>
              <th className="py-1 pr-2 text-right">Lowest cash</th>
              <th className="py-1 pr-2 text-right">Needed at start</th>
              <th className="py-1 pr-2 text-right">Gap</th>
              <th className="py-1 pr-2 text-right">Days below reserve</th>
              <th className="py-1 pr-2 text-right">Days below zero</th>
              <th className="py-1 text-right">Months over capacity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="py-1 pr-2">
                  <span className="font-semibold">{c.label}</span>
                  {c.changed.length > 0 && <span className="block text-xs text-ink-muted">{c.changed.join("; ")}</span>}
                </td>
                <td className="py-1 pr-2 text-right">
                  {money(c.low)} ({dateLabel(c.lowDate)})
                </td>
                <td className="py-1 pr-2 text-right">{money(c.required)}</td>
                <td className="py-1 pr-2 text-right">{c.additional === null ? "unknown" : money(c.additional)}</td>
                <td className="py-1 pr-2 text-right">{c.belowReserve}</td>
                <td className="py-1 pr-2 text-right">{c.belowZero ? `${c.belowZero} ⚠` : "0"}</td>
                <td className="py-1 text-right">{c.pressureMonths ? `${c.pressureMonths} ⚠` : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-ink-muted">None of these is labelled likely: each is a test of one named change.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief and the Funding Decision Sheet
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

/** Downloads the workbook the server builds. */
function ExportButton({ body, label, disabled }: { body: Record<string, unknown>; label: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/tools/cashbridge/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The workbook couldn’t be made.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "cash-bridge.xlsx";
      const href = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={secondary} disabled={disabled || busy} onClick={run}>
        <Icon name="file" className="size-4" /> {busy ? "Making the workbook…" : label}
      </button>
      {problem && (
        <span role="alert" className="text-sm text-danger">
          {problem}
        </span>
      )}
    </span>
  );
}

function Debrief({
  b,
  s,
  d,
  busy,
  preview,
  guideId,
  onPrint,
  onRetry,
}: {
  b: CashBridgeBlock;
  s: CashState;
  d: CashDebrief;
  busy: boolean;
  preview: boolean;
  guideId: string;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const scenario = currentScenario(b, s);
  const r = calculate(b.inputs, scenario);
  return (
    <div className="flex flex-col gap-4">
      {d.flags.length > 0 && (
        <div role="alert" className={cx("rounded-2xl p-4", d.unsafe ? TONE.bad : TONE.warn)}>
          <p className="font-semibold">{d.unsafe ? "Before anything else: agreed service isn’t a way to fund a gap" : "Before anything else"}</p>
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
            ["A start moves", d.slip],
            ["Your decision", d.decision],
            ["Your explanation", d.explanation],
            ["Day 30", d.review],
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
          The timeline, piece by piece ({d.cards.filter((c) => c.matched && c.cashMatched).length} of {d.cards.length} fully matched)
        </summary>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {d.cards.map((c) => (
            <li key={c.id}>
              <p className="font-semibold">
                {c.matched && c.cashMatched ? "✓" : "✕"} {c.title}
              </p>
              <p>
                You: {c.yours.stage ? CARD_STAGES[c.yours.stage] : "not placed"}
                {c.yours.cash !== null ? ` · cash moves: ${c.yours.cash ? "yes" : "no"}` : ""}. Reviewed: {CARD_STAGES[c.answer.stage]} · cash moves:{" "}
                {c.answer.cash ? "yes" : "no"}.
              </p>
              <p className="text-ink-muted">{c.feedback}</p>
            </li>
          ))}
        </ul>
      </details>
      <div className={box}>
        <p className={kicker}>Your readings, beside the ledger</p>
        <p className="mt-1 text-sm">
          Your first guess: “{d.prediction.cover}”, and the hardest pay run “{d.prediction.hardest}”. Your low-point reading: “{d.low.yours}”
          {d.low.yourRequired === null ? ", with no opening-cash figure" : `, needing ${money(Math.round(d.low.yourRequired * 100))} at the start`}. The ledger:
          lowest {money(d.low.cents)} on {longDate(d.low.date)}; {money(d.low.required)} needed at the start
          {d.low.additional !== null ? `, ${money(d.low.additional)} more than Maya has` : ""}. {d.low.feedback}
        </p>
        <p className="mt-1 text-sm">You tested: {d.tested.join("; ") || "nothing"}.</p>
      </div>
      <div className={box}>
        <p className={kicker}>The 90 days, in short</p>
        <p className="mt-1">{d.summary}</p>
        <p className="mt-2 font-semibold">Six weeks later</p>
        <p>{d.followUp}</p>
      </div>
      <FundingSheetView
        title="90-Day Funding Decision Sheet (learning)"
        r={r}
        option={d.decision.text}
        owner="Maya (principal)"
        followUp={s.review === "replace" ? "2027-01-22" : ""}
        unresolved="Start 4’s allocation date; whether the November remittance delay was a one-off; the bank’s answer on any facility."
        constraint="Every agreed start keeps a trained coordinator; no essential service is delayed to fund a pay run."
        versions={`${d.versions.lab} · story ${d.versions.story} · model ${d.versions.model} · definitions ${d.versions.definitions}`}
        label="Fictional"
      />
      {b.links.length > 0 && (
        <div className={box}>
          <p className={kicker}>Related, by your choice</p>
          <p className="mt-1 text-sm text-ink-muted">Nothing is carried across from these: open them yourself, and type in anything you want to use.</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {b.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={link}>
                  {l.label}
                </Link>
                : {l.why}
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.sources.length > 0 && (
        <p className="text-sm text-ink-muted">
          Public context:{" "}
          {b.sources.map((x, k) => (
            <span key={x.url}>
              {k > 0 && "; "}
              <a href={x.url} className={link} target="_blank" rel="noreferrer">
                {x.title}
              </a>
            </span>
          ))}
          . Provider claim settlement isn’t a partner’s remittance schedule, and the care-management allocation isn’t partner income.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the Decision Sheet
        </button>
        <ExportButton
          label="Download the fictional workbook (.xlsx)"
          disabled={preview}
          body={{ guideId, blockId: b.id, tried: s.tried, actuals: s.actuals }}
        />
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Look again
        </button>
      </div>
      {preview && <p className="text-xs text-ink-muted">The workbook downloads from the published article, not the editor’s preview.</p>}
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab}, story {d.versions.story}, rubric {d.versions.rubric}, model {d.versions.model}, definitions {d.versions.definitions}. Every
        attempt is kept.
      </p>
    </div>
  );
}

function FundingSheetView({
  title,
  r,
  option,
  owner,
  followUp,
  unresolved,
  constraint,
  versions,
  label,
}: {
  title: string;
  r: CashResult;
  option: string;
  owner: string;
  followUp: string;
  unresolved: string;
  constraint: string;
  versions: string;
  label: string;
}) {
  const known = r.coverage.receipts.actual + r.coverage.receipts.committed;
  const critical = r.belowReserve.dates.length ? (r.belowReserve.dates.find((d) => r.payroll.dates.includes(d)) ?? r.payroll.next?.date) : r.payroll.next?.date;
  return (
    <div className={cx(box, "growth-sheet")}>
      <p className={kicker}>
        {title} · {label}
      </p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {(
          [
            ["Chosen option", option || "Not chosen yet"],
            [
              "Cash required",
              `${money(r.required)} at the start to keep ${money(r.reserve)}${r.additional !== null ? `; ${money(r.additional)} more than available` : ""}`,
            ],
            [
              "Lowest cash",
              `${money(r.low.cents)} on ${longDate(r.low.date)} (intraday check, separately: ${money(r.intraday.cents)} on ${dateLabel(r.intraday.date)})`,
            ],
            ["Known and estimated receipts", `${money(known)} actual or committed; ${money(r.coverage.receipts.projected)} projected`],
            ["Next critical pay date", critical ? longDate(critical) : "None in the window"],
            ["Unresolved facts", unresolved || [...r.limitations.map((l) => l.text)].join(" ") || "None recorded"],
            ["Service-quality constraint", constraint || "Not recorded"],
            ["Accountable owner", owner || "Not recorded"],
            ["Follow-up date", followUp ? longDate(followUp) : "Not set"],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        {dateLabel(r.startDate)} to {dateLabel(r.endDate)}, Australia/Brisbane dates. {versions}. A planning aid, not a credit, hiring or accounting decision.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Plan my next 90 days: private, blank, aggregate
// ---------------------------------------------------------------------------------------------

type PlanSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string; snapshot: Snapshot | { incomplete: number } | null };
type SavedPlan = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: CashInputs;
  sheet: FundingSheet;
  previous: { number: number; savedAt: string; inputs: CashInputs; sheet: FundingSheet } | null;
  earlierModel: boolean;
};
const blankSheet = (): FundingSheet => ({ option: "", scenarioType: "", owner: "", followUp: "", unresolved: "", serviceConstraint: "", notes: "" });
const SCENARIO_LABELS: [ScenarioType, string][] = [
  ["", "Not chosen"],
  ["baseline", "Go ahead as forecast"],
  ["delay", "Plan for a later receipt"],
  ["slip", "Plan for a later start"],
  ["hire", "Move a hire date"],
  ["stage", "Stage discretionary spending"],
  ["cover", "Temporary cover"],
  ["credit", "Approved, costed finance"],
  ["buffer", "A defined cash buffer"],
];
const errorFor = (errors: InputError[], field: string) => errors.find((e) => e.field === field)?.message;
const nextId = (used: string[], prefix: string) => {
  let n = used.length + 1;
  while (used.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
};

function PlanMine({ orgName, onSaved }: { orgName: string; onSaved: (version: number, scenario: ScenarioType) => void }) {
  const home = useApi<{ access: { orgName: string } | null; plans: PlanSummary[] }>("/api/tools/cashbridge");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<CashInputs | null>(null);
  const [baseline, setBaseline] = useState<CashInputs | null>(null);
  const [sheet, setSheet] = useState<FundingSheet>(blankSheet());
  const [saved, setSaved] = useState<SavedPlan | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastGood, setLastGood] = useState<CashResult | null>(null);

  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const x = await api<SavedPlan>(`/api/tools/cashbridge?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}`);
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
    const fresh = blankInputs(brisbaneDate(new Date()));
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
      const x = await api<SavedPlan>("/api/tools/cashbridge", { body: { id: saved?.id, name, inputs, sheet, note } });
      setSaved(x);
      setInputs(x.inputs);
      setBaseline(x.inputs);
      setNote("");
      setMessage(`Saved as version ${x.version}.`);
      onSaved(x.version, x.sheet.scenarioType);
      home.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const errors = inputs ? validateInputs(inputs) : [];
  const live = useMemo(() => (inputs ? safeCalculate(inputs) : null), [inputs]);
  // An incomplete entry keeps the last valid calculation, labelled as such.
  if (live && lastGood !== live) setLastGood(live);
  const r = live ?? (inputs ? lastGood : null);
  const cases: NamedCase[] = useMemo(() => (inputs && live ? standardCases(inputs) : []), [inputs, live]);
  const since = useMemo(() => {
    if (!saved?.previous || !inputs) return [];
    return planChanges(saved.previous.inputs, safeCalculate(saved.previous.inputs), inputs, safeCalculate(inputs));
  }, [saved, inputs]);
  const unchanged = Boolean(saved && baseline === inputs);
  const set = (fn: (x: CashInputs) => CashInputs) => setInputs((x) => (x ? fn(x) : x));
  const list = home.data?.plans ?? [];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <p>
          <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these plans, checked on the server for
          every read, save and download, and every one is recorded. Trilogy Care staff and course authors can’t see them, and no figure reaches anyone’s
          dashboard.
        </p>
        <p className="mt-1">
          <strong>Dated aggregate amounts only:</strong> no client or worker names (starts and coordinators get generic labels), no health details, no bank
          connection, no payroll files. Opening cash is the balance your bank shows at the start of the first date, including anything uncleared it already
          shows.
        </p>
        <p className="mt-1">
          <strong>Kept:</strong> nothing until you choose Save. Each save is a new version. Replace a forecast with an actual only when you know it. The article
          is complete without this, and nothing here is graded.
        </p>
      </div>

      {!inputs && (
        <div className={box}>
          <p className={kicker}>Your 90-Day Cash Plans</p>
          {list.length === 0 ? (
            <p className="mt-1 text-sm">None saved yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {list.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <button type="button" className={link} onClick={() => load(p.id)}>
                    {p.name}
                  </button>
                  <span className="text-ink-muted">
                    {p.versions} {p.versions === 1 ? "version" : "versions"}, last saved {p.updatedAt.slice(0, 10)}
                    {p.updatedBy ? ` by ${p.updatedBy}` : ""}
                    {p.snapshot && "lowDate" in p.snapshot ? ` · low ${money(p.snapshot.low)} on ${dateLabel(p.snapshot.lowDate)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={cx(primary, "mt-3")} onClick={startBlank}>
            <Icon name="plus" className="size-4" /> Start a blank plan
          </button>
        </div>
      )}

      {inputs && (
        <>
          {saved && (
            <div className={box}>
              <p className={kicker}>
                {saved.name} · version {saved.version} of {saved.versions.length}
              </p>
              {saved.earlierModel && <p className="text-sm">Saved under an earlier model: the figures are recalculated today and may differ.</p>}
              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                {saved.versions.map((v) => (
                  <button
                    key={v.number}
                    type="button"
                    className={cx(secondary, "min-h-9")}
                    aria-pressed={v.number === saved.version}
                    onClick={() => load(saved.id, v.number)}
                  >
                    v{v.number} · {v.savedAt.slice(0, 10)}
                    {v.note ? ` · ${v.note}` : ""}
                  </button>
                ))}
              </div>
              {since.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">What changed since last time (version {saved.previous!.number})?</p>
                  <ul className="list-disc pl-5 text-sm">
                    {since.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  {saved.previous!.sheet.option && <p className="text-sm">Last time’s chosen option: {saved.previous!.sheet.option}</p>}
                </div>
              )}
            </div>
          )}
          <PlanForm inputs={inputs} errors={errors} set={set} />
          {errors.length > 0 && (
            <div role="status" className={cx("rounded-2xl p-4 text-sm", TONE.warn)}>
              <p className="font-semibold">
                {errors.length} {errors.length === 1 ? "thing" : "things"} to fill in{r ? " (showing the last result that could be calculated)" : ""}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {errors.slice(0, 8).map((e) => (
                  <li key={`${e.field}-${e.message}`}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {r && (
            <>
              <ResultCards r={r} inputs={inputs} scenario={BASELINE} />
              <BridgeExplorer r={r} showLow onInspect={() => undefined} title={live ? "Your plan" : "Your plan: the last result that could be calculated"} />
              {cases.length > 1 && <ComparisonTable rows={compare(inputs, cases)} />}
            </>
          )}
          <fieldset className={cx(box, "grid gap-3 sm:grid-cols-2")}>
            <legend className={kicker}>90-Day Funding Decision Sheet</legend>
            <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
              Chosen option
              <input className={small} value={sheet.option} onChange={(e) => setSheet({ ...sheet, option: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Kind of option (the only part ever counted outside your plan)
              <select className={small} value={sheet.scenarioType} onChange={(e) => setSheet({ ...sheet, scenarioType: e.target.value as ScenarioType })}>
                {SCENARIO_LABELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Accountable owner (a role)
              <input className={small} value={sheet.owner} onChange={(e) => setSheet({ ...sheet, owner: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Follow-up date
              <input type="date" className={small} value={sheet.followUp} onChange={(e) => setSheet({ ...sheet, followUp: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Service-quality constraint
              <input className={small} value={sheet.serviceConstraint} onChange={(e) => setSheet({ ...sheet, serviceConstraint: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
              Unresolved facts
              <textarea className={cx(small, "min-h-16 py-1")} value={sheet.unresolved} onChange={(e) => setSheet({ ...sheet, unresolved: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
              Notes
              <textarea className={cx(small, "min-h-16 py-1")} value={sheet.notes} onChange={(e) => setSheet({ ...sheet, notes: e.target.value })} />
            </label>
          </fieldset>
          {r && (
            <FundingSheetView
              title="90-Day Funding Decision Sheet"
              r={r}
              option={sheet.option}
              owner={sheet.owner}
              followUp={sheet.followUp}
              unresolved={sheet.unresolved}
              constraint={sheet.serviceConstraint}
              versions={`model ${MODEL_VERSION}${saved ? ` · version ${saved.version}` : " · unsaved"}`}
              label={`Private: ${orgName || "your business"}`}
            />
          )}
          <div className={cx(box, "flex flex-col gap-3")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Plan name
                <input className={small} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: December to February" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                What changed in this version? (optional)
                <input className={small} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} disabled={busy || (!saved && !name.trim())} onClick={save}>
                {saved ? "Save as a new version" : "Save privately"}
              </button>
              <ExportButton
                label="Download the workbook (.xlsx)"
                disabled={!live}
                body={unchanged && saved ? { id: saved.id, version: saved.version } : { inputs }}
              />
              <button type="button" className={secondary} disabled={!r} onClick={printSheet}>
                <Icon name="print" className="size-4" /> Print the Decision Sheet
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  setInputs(null);
                  setSaved(null);
                  setMessage(null);
                }}
              >
                Close
              </button>
            </div>
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  error,
  allowUnknown = true,
}: {
  label: string;
  value: Amount;
  onChange: (v: Amount) => void;
  error?: string;
  allowUnknown?: boolean;
}) {
  const unknown = value === "unknown";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      <label className="flex flex-col gap-1">
        <span>
          {label} <span className="font-normal text-ink-muted">($)</span>
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          className={cx(small, error && "border-danger")}
          disabled={unknown}
          aria-invalid={Boolean(error)}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </label>
      {allowUnknown && (
        <label className="flex items-center gap-2 font-normal">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={unknown}
            onChange={(e) => onChange(e.target.checked ? "unknown" : null)}
          />
          Not known
        </label>
      )}
      {error && <span className="font-normal text-danger">{error}</span>}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  error,
  unit,
  step = 1,
}: {
  label: string;
  value: Num;
  onChange: (v: Num) => void;
  error?: string;
  unit: string;
  step?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
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

function DateField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      {label}
      <input
        type="date"
        className={cx(small, error && "border-danger")}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      {label}
      <select className={small} value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)?.[0] ?? options[0][0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const SOURCE_OPTIONS = SOURCE_ORDER.filter((k) => k !== "fictional").map((k) => [k, SOURCES[k]] as [Source, string]);

function PlanForm({ inputs: i, errors, set }: { inputs: CashInputs; errors: InputError[]; set: (fn: (x: CashInputs) => CashInputs) => void }) {
  const e = (f: string) => errorFor(errors, f);
  const a = i.agreement;
  const ids = [...i.events.map((x) => x.id), ...i.clients.map((x) => x.id), ...i.hires.map((x) => x.id)];
  const setEvent = (id: string, patch: Partial<CashEvent>) => set((x) => ({ ...x, events: x.events.map((y) => (y.id === id ? { ...y, ...patch } : y)) }));
  const setHire = (id: string, patch: Partial<Hire>) => set((x) => ({ ...x, hires: x.hires.map((y) => (y.id === id ? { ...y, ...patch } : y)) }));
  return (
    <div className="flex flex-col gap-3">
      <fieldset className={cx(box, "grid gap-3 sm:grid-cols-4")}>
        <legend className={kicker}>Opening position</legend>
        <DateField label="First of the 90 days" value={i.startDate} onChange={(v) => set((x) => ({ ...x, startDate: v }))} error={e("startDate")} />
        <MoneyField
          label="Bank cash at the start of that date"
          value={i.openingCash}
          onChange={(v) => set((x) => ({ ...x, openingCash: v }))}
          error={e("openingCash")}
        />
        <Select label="Source" value={i.openingSource} options={SOURCE_OPTIONS} onChange={(v) => set((x) => ({ ...x, openingSource: v }))} />
        <NumField label="Minimum cash reserve" unit="$" value={i.reserve} onChange={(v) => set((x) => ({ ...x, reserve: v }))} error={e("reserve")} />
        <NumField
          label="Credit limit (shown, never cash)"
          unit="$"
          value={i.credit.limit}
          onChange={(v) => set((x) => ({ ...x, credit: { ...x.credit, limit: v } }))}
        />
      </fieldset>
      {a && (
        <fieldset className={cx(box, "grid gap-3 sm:grid-cols-4")}>
          <legend className={kicker}>Your signed partner agreement (or verified finance record)</legend>
          <MoneyField
            label="Fee per participant a month"
            value={a.feePerMonth}
            onChange={(v) => set((x) => ({ ...x, agreement: { ...x.agreement!, feePerMonth: v } }))}
            error={e("agreement.feePerMonth")}
          />
          <NumField
            label="Paid how many months after"
            unit="months"
            value={a.lagMonths}
            onChange={(v) => set((x) => ({ ...x, agreement: { ...x.agreement!, lagMonths: v } }))}
            error={e("agreement.lagMonths")}
          />
          <Select
            label="Paid on"
            value={a.payDay === "lastWeekday" ? "last" : String(a.payDay)}
            options={[["last", "The last weekday"], ...Array.from({ length: 28 }, (_, k) => [String(k + 1), `Day ${k + 1}`] as [string, string])]}
            onChange={(v) => set((x) => ({ ...x, agreement: { ...x.agreement!, payDay: v === "last" ? "lastWeekday" : Number(v) } }))}
          />
          <NumField
            label="Observed days to clear after that"
            unit="days"
            value={a.clearDays}
            onChange={(v) => set((x) => ({ ...x, agreement: { ...x.agreement!, clearDays: v } }))}
            error={e("agreement.clearDays")}
          />
          <Select
            label="Source"
            value={a.source}
            options={SOURCE_OPTIONS}
            onChange={(v) => set((x) => ({ ...x, agreement: { ...x.agreement!, source: v } }))}
          />
          <NumField
            label="Participants earning now"
            unit="people"
            value={i.caseload.active}
            onChange={(v) => set((x) => ({ ...x, caseload: { ...x.caseload, active: v } }))}
            error={e("caseload.active")}
          />
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Expected exit dates (comma-separated, YYYY-MM-DD)
            <input
              className={small}
              value={i.caseload.exits.join(", ")}
              onChange={(ev) =>
                set((x) => ({
                  ...x,
                  caseload: {
                    ...x.caseload,
                    exits: ev.target.value
                      .split(",")
                      .map((y) => y.trim())
                      .filter(Boolean),
                  },
                }))
              }
            />
            {e("caseload.exits") && <span className="font-normal text-danger">{e("caseload.exits")}</span>}
          </label>
          <p className="text-xs text-ink-muted sm:col-span-4">
            Earning condition used: a participant counts for a month once their first service is delivered and if they haven’t left by its last day. If your
            agreement works differently, enter its remittances as dated receipts instead and leave the fee unknown. Never enter public Support at Home funding
            or the care-management allocation: it isn’t your income.
          </p>
        </fieldset>
      )}
      <fieldset className={cx(box, "flex flex-col gap-2")}>
        <legend className={kicker}>Planned starts (no names)</legend>
        {i.clients.map((c, k) => (
          <div key={c.id} className="grid items-end gap-2 sm:grid-cols-4">
            <span className="text-sm font-semibold">Start {k + 1}</span>
            <Select
              label="Certainty"
              value={c.certainty}
              options={Object.entries(CERTAINTY) as [Certainty, string][]}
              onChange={(v) => set((x) => ({ ...x, clients: x.clients.map((y) => (y.id === c.id ? { ...y, certainty: v } : y)) }))}
            />
            <DateField
              label="Planned first service"
              value={c.start}
              onChange={(v) => set((x) => ({ ...x, clients: x.clients.map((y) => (y.id === c.id ? { ...y, start: v } : y)) }))}
              error={e(`client.${c.id}`)}
            />
            <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, clients: x.clients.filter((y) => y.id !== c.id) }))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() =>
            set((x) => ({
              ...x,
              clients: [...x.clients, { id: nextId(ids, "c"), label: `Start ${x.clients.length + 1}`, certainty: "agreement", start: "", source: "estimate" }],
            }))
          }
        >
          <Icon name="plus" className="size-4" /> Add a planned start
        </button>
        <p className="text-xs text-ink-muted">Enquiries and clients waiting for an allocation never make a receipt.</p>
      </fieldset>
      <fieldset className={cx(box, "flex flex-col gap-3")}>
        <legend className={kicker}>Coordinators on the payroll (no names)</legend>
        {i.hires.map((h, k) => (
          <div key={h.id} className="grid items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-4">
            <span className="text-sm font-semibold sm:col-span-4">
              Coordinator {k + 1}
              <label className="ml-3 inline-flex items-center gap-1 font-normal">
                <input type="checkbox" className="size-4" checked={h.existing} onChange={(ev) => setHire(h.id, { existing: ev.target.checked })} /> Already
                employed
              </label>
              <label className="ml-3 inline-flex items-center gap-1 font-normal">
                <input type="checkbox" className="size-4" checked={h.committed} onChange={(ev) => setHire(h.id, { committed: ev.target.checked })} /> Committed
              </label>
            </span>
            <NumField label="FTE" unit="0 to 5" step={0.1} value={h.fte} onChange={(v) => setHire(h.id, { fte: v })} error={e(`hire.${h.id}.fte`)} />
            <DateField label="First day of work" value={h.start} onChange={(v) => setHire(h.id, { start: v })} error={e(`hire.${h.id}.start`)} />
            <DateField label="Any one pay date" value={h.payAnchor} onChange={(v) => setHire(h.id, { payAnchor: v })} error={e(`hire.${h.id}.payAnchor`)} />
            <Select
              label="Paid every"
              value={h.everyDays}
              options={[
                [14, "Fortnight"],
                [7, "Week"],
              ]}
              onChange={(v) => setHire(h.id, { everyDays: v })}
            />
            <Select
              label="Cost entered as"
              value={h.basis}
              options={[
                ["components", "Gross pay, super and on-costs"],
                ["loaded", "One loaded figure"],
              ]}
              onChange={(v) => setHire(h.id, { basis: v })}
            />
            {h.basis === "loaded" ? (
              <NumField
                label="Loaded cost each pay"
                unit="$"
                value={h.loadedPerPay}
                onChange={(v) => setHire(h.id, { loadedPerPay: v })}
                error={e(`hire.${h.id}.loadedPerPay`)}
              />
            ) : (
              <>
                <NumField
                  label="Gross pay each pay"
                  unit="$"
                  value={h.grossPerPay}
                  onChange={(v) => setHire(h.id, { grossPerPay: v })}
                  error={e(`hire.${h.id}.grossPerPay`)}
                />
                <NumField
                  label="Super each pay"
                  unit="$"
                  value={h.superPerPay}
                  onChange={(v) => setHire(h.id, { superPerPay: v })}
                  error={e(`hire.${h.id}.superPerPay`)}
                />
                <NumField
                  label="Super paid after payday"
                  unit="days"
                  value={h.superLagDays}
                  onChange={(v) => setHire(h.id, { superLagDays: v })}
                  error={e(`hire.${h.id}.superLagDays`)}
                />
                <NumField
                  label="Other on-costs a month"
                  unit="$"
                  value={h.onCostPerMonth}
                  onChange={(v) => setHire(h.id, { onCostPerMonth: v })}
                  error={e(`hire.${h.id}.onCostPerMonth`)}
                />
                <NumField
                  label="On-costs paid on day"
                  unit="1 to 28"
                  value={h.onCostDay}
                  onChange={(v) => setHire(h.id, { onCostDay: v })}
                  error={e(`hire.${h.id}.onCostDay`)}
                />
              </>
            )}
            {e(`hire.${h.id}.basis`) && <p className="text-xs text-danger sm:col-span-4">{e(`hire.${h.id}.basis`)}</p>}
            <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, hires: x.hires.filter((y) => y.id !== h.id) }))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() => set((x) => ({ ...x, hires: [...x.hires, blankHire(nextId(ids, "h"), `Coordinator ${x.hires.length + 1}`)] }))}
        >
          <Icon name="plus" className="size-4" /> Add a coordinator
        </button>
        <p className="text-xs text-ink-muted">Productivity ramp affects capacity, never income. Check capacity in the Caseload-to-Margin Work Tool.</p>
      </fieldset>
      <fieldset className={cx(box, "flex flex-col gap-3")}>
        <legend className={kicker}>Other dated receipts and payments</legend>
        {i.events.map((ev) => (
          <div key={ev.id} className="grid items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-4">
            <Select
              label="Kind"
              value={ev.category}
              options={CATEGORY_ORDER.filter((k) => k !== "fee").map(
                (k) => [k, `${CATEGORIES[k].dir === "in" ? "In" : "Out"}: ${CATEGORIES[k].label}`] as [Category, string],
              )}
              onChange={(v) => setEvent(ev.id, { category: v, uncertain: isIn(v) })}
            />
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
              Description (no names)
              <input className={small} value={ev.label} maxLength={80} onChange={(x) => setEvent(ev.id, { label: x.target.value })} />
            </label>
            <DateField label="Date it settles or is paid" value={ev.date} onChange={(v) => setEvent(ev.id, { date: v })} />
            <MoneyField label="Amount" value={ev.amount} onChange={(v) => setEvent(ev.id, { amount: v })} error={e(`event.${ev.id}`)} />
            <Select
              label="Status"
              value={ev.status}
              options={STATUS_ORDER.map((k) => [k, statusText(k)] as [Status, string])}
              onChange={(v) => setEvent(ev.id, { status: v })}
            />
            <Select label="Source" value={ev.source} options={SOURCE_OPTIONS} onChange={(v) => setEvent(ev.id, { source: v })} />
            {ev.category === "receivable" && (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
                Month the work was done (YYYY-MM)
                <input className={small} value={ev.serviceMonth} onChange={(x) => setEvent(ev.id, { serviceMonth: x.target.value.slice(0, 7) })} />
              </label>
            )}
            <div className="flex flex-col gap-1 text-xs">
              {isIn(ev.category) ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4" checked={ev.uncertain} onChange={(x) => setEvent(ev.id, { uncertain: x.target.checked })} /> Date
                  could move
                </label>
              ) : (
                <>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={ev.discretionary}
                      onChange={(x) => setEvent(ev.id, { discretionary: x.target.checked })}
                    />{" "}
                    Not committed: could be staged
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={ev.essential} onChange={(x) => setEvent(ev.id, { essential: x.target.checked })} />{" "}
                    Supports agreed service
                  </label>
                </>
              )}
            </div>
            <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, events: x.events.filter((y) => y.id !== ev.id) }))}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, events: [...x.events, blankEvent(nextId(ids, "e"), "receivable")] }))}>
            <Icon name="plus" className="size-4" /> Add a receipt
          </button>
          <button type="button" className={secondary} onClick={() => set((x) => ({ ...x, events: [...x.events, blankEvent(nextId(ids, "e"), "overhead")] }))}>
            <Icon name="plus" className="size-4" /> Add a payment
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Existing amounts due go in once, for months before the window. Participants’ funds held by another organisation aren’t your cash. Financing counts
          only when its draw, fees or interest and repayment are all entered.
        </p>
      </fieldset>
      <fieldset className={cx(box, "grid gap-3 sm:grid-cols-4")}>
        <legend className={kicker}>Statutory items: supply them, or mark them left out</legend>
        {STAT_ORDER.map((k) => (
          <Select
            key={k}
            label={STATUTORY[k]}
            value={i.statutory[k]}
            options={Object.entries(STAT_ANSWERS) as [StatAnswer, string][]}
            onChange={(v) => set((x) => ({ ...x, statutory: { ...x.statutory, [k]: v } }))}
          />
        ))}
        <p className="text-xs text-ink-muted sm:col-span-4">
          The Hub doesn’t supply rates or due dates. Enter the amounts and dates your bookkeeper or accountant gives you as payments above. Anything left out
          makes the forecast incomplete, and the result says so.
        </p>
      </fieldset>
      <p className="text-xs text-ink-muted">
        Changes stay on this page until you save. {i.startDate ? `Window: ${dateLabel(i.startDate)} to ${dateLabel(addDays(i.startDate, 89))}.` : ""}
      </p>
    </div>
  );
}
