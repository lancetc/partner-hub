"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ReferralBlock } from "@/lib/magazine";
import {
  areaName,
  BAND_ORDER,
  BANDS,
  blankInputs,
  blankRow,
  calculate,
  calendarMonth,
  CLOSE_ORDER,
  CLOSE_REASONS,
  cohortMonths,
  dateLabel,
  EVENTS,
  EXIT_ORDER,
  EXIT_REASONS,
  FUNNEL,
  inputChanges,
  MODEL_VERSION,
  monthLabel,
  OBSERVATION,
  PART_ORDER,
  READY,
  RELATIONSHIP_PARTS,
  resultChanges,
  round1,
  SOURCE_HINTS,
  SOURCE_ORDER,
  SOURCES,
  STAGE_HINTS,
  STAGE_ORDER,
  STAGES,
  validateInputs,
  WAIT_ORDER,
  WAITS,
  zeroBlanks,
  type Amount,
  type CohortRow,
  type Effort,
  type Filter,
  type InputError,
  type Num,
  type ReferralInputs,
  type ReferralResult,
  type Source,
  type SourceResult,
  type Stage,
} from "@/lib/referralJourney";
import {
  buildDebrief,
  emptyState,
  finishProblems,
  LAST,
  LEVELS,
  NEXT_STEPS,
  STEPS,
  updatedInputs,
  type NextStep,
  type Option,
  type ReferralDebrief,
  type ReferralState,
} from "@/lib/referralLab";
import type { ReferralView } from "@/server/referralJourney";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Which referrals become active clients?" (docs/referral-journey.md). A feature-article decision, not a bare
  calculator: enquiry counts alone and a prediction; stage cards; the same arrival cohort followed through the funnel;
  time to first service and who owns each wait, with the older person's choice at a handoff; effort and continuity;
  the next move; a return visit with a later cohort; then the debrief and a Relationship Review. The figures come from
  the shared model (lib/referralJourney); the debrief comes from the server.

  Every chart has a table with its numerator and denominator, and the source, period and denominator sit beside every
  rate. One source is shown at a time (a row of buttons chooses it), with a compact table to compare them all, so a
  phone never has tiny chart targets. Blank, unknown and zero are shown apart; nothing animates or times the reader.

  "Review my relationships" appears only for a business owner and the members they've authorised (the server
  decides). It starts blank, never with the story's figures, asks for aggregate monthly cohorts (never a person's,
  practice's or hospital's name), saves only when asked, and keeps unsaved entries in this page alone.

  In the editor's preview it runs against the block as written, locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const small = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const th = "py-1 pr-2 text-left font-semibold";
const TONE = {
  good: "bg-[#dff3ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
  warn: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  bad: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
/** Bars are told apart by pattern as well as colour, and every bar has its figure in words beside it. */
const BAR: Record<"done" | "open" | "closed", React.CSSProperties> = {
  done: { background: "#008282" },
  open: { background: "repeating-linear-gradient(45deg, #7a5c00 0 4px, #ffd97a 4px 8px)" },
  closed: { background: "repeating-linear-gradient(135deg, #5f6368 0 5px, #c4c7c5 5px 9px)" },
};
const FICTIONAL =
  "Fictional case: Maya, the relationships, the enquiries and every figure are invented for practice. They aren’t real Trilogy Care referral sources, a real practice, hospital or organisation, or a conversion benchmark.";
const safeCalc = (i: ReferralInputs, f: Filter = {}) => (validateInputs(i).length ? null : calculate(i, f));
const days = (n: number | null) => (n === null ? "none" : `${round1(n)} ${n === 1 ? "day" : "days"}`);

export function ReferralJourneyLab({ block: b, ctx }: { block: ReferralBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/referral");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canReview = Boolean(business.data?.access);
  return (
    <section
      aria-label={`Referral Journey Calculator: ${b.title}`}
      className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7"
    >
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="route" className="size-5" /> Referral Journey Calculator
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-ink">
          {mode === "story" ? `Fictional case · ${b.storyVersion}` : "Your business · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canReview && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with fictional relationships"],
              ["business", "Review my relationships"],
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
      {mode === "story" ? <Practice b={b} ctx={ctx} /> : <ReviewMine orgName={business.data?.access?.orgName ?? ""} b={b} guideId={ctx.guideId} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practise with fictional relationships
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: ReferralBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/referral`;
  const loaded = useApi<ReferralView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<ReferralState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<ReferralDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);

  const take = (v: ReferralView) => {
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

  const r = useMemo(() => safeCalc(b.inputs, { months: b.period }), [b.inputs, b.period]);
  const later = useMemo(() => updatedInputs(b), [b]);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s) return <p className="mt-4 text-ink-muted">Loading…</p>;
  if (!r) return <p className="mt-4 text-ink-muted">This case’s figures don’t validate yet.</p>;

  const update = (fn: (prev: ReferralState) => ReferralState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  const go = (to: number) => {
    setStep(to);
    if (to > s.stage) update((p) => ({ ...p, stage: Math.max(p.stage, to) }));
    requestAnimationFrame(() => top.current?.focus());
  };
  const send = async (body: Record<string, unknown>, local: () => ReferralState) => {
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
      const v = await api<ReferralView>(url, { body: { blockId: b.id, ...body } });
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
  const open = (key: string) => {
    if (!s.opened.includes(key)) update((p) => (p.opened.includes(key) ? p : { ...p, opened: [...p.opened, key] }));
  };
  const usedFilter = (name: string) => {
    if (!s.filters.includes(name)) update((p) => (p.filters.includes(name) ? p : { ...p, filters: [...p.filters, name] }));
  };
  const pick = (k: keyof ReferralState, v: string) => update((p) => ({ ...p, [k]: v }));

  const finished = s.stage === LAST && debrief;
  const shown = finished ? step : Math.min(step, LAST - 1);
  const allSorted = b.cards.every((c) => s.tags[c.id]);

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
        {shown === 0 && <Relationships b={b} r={r} onNext={() => go(1)} />}
        {shown === 1 && (
          <Prediction
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (source) => {
              const next = await send({ action: "predict", prediction: { source } }, () => ({ ...s, prediction: { source }, stage: Math.max(s.stage, 2) }));
              if (next) go(2);
            }}
            onNext={() => go(2)}
          />
        )}
        {shown === 2 && (
          <div className="flex flex-col gap-4">
            <p>
              Each card is an introduction as it arrived. Sort it by the person’s <strong>stage at first contact</strong>: where they were in the Support at
              Home journey, not who sent them.
            </p>
            <StageGuide />
            {b.cards.map((c) => (
              <StageCard
                key={c.id}
                id={c.id}
                text={c.text}
                value={s.tags[c.id] ?? ""}
                onSort={(v) => update((p) => ({ ...p, tags: { ...p.tags, [c.id]: v } }))}
              />
            ))}
            {allSorted ? <StageMix r={r} /> : <p className="text-sm text-ink-muted">Sort every card to see each relationship’s starting stages.</p>}
            <Next disabled={!allSorted} hint="Sort every card first." onClick={() => go(3)} label="Follow the cohort" />
          </div>
        )}
        {shown === 3 && (
          <div className="flex flex-col gap-4">
            <p>
              Follow the <strong>same {r.period}</strong> through each step. Every rate is divided by that cohort’s distinct enquiries, as of{" "}
              {dateLabel(r.asOf)}.
            </p>
            <Explorer b={b} inputs={b.inputs} facet="funnel" opened={s.opened} onOpen={open} onFilter={usedFilter} />
            <CalendarTrap b={b} />
            <Question q={b.denominator} name="denominator" value={s.denominator} onChange={(v) => pick("denominator", v)} />
            <Next
              disabled={!s.opened.some((x) => x.startsWith("funnel:")) || !s.denominator}
              hint="Open a relationship’s funnel and answer the question."
              onClick={() => go(4)}
              label="Time to start"
            />
          </div>
        )}
        {shown === 4 && (
          <div className="flex flex-col gap-4">
            {b.story.transmission.text && (
              <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
                <blockquote className="font-serif text-lg italic">“{b.story.transmission.text}”</blockquote>
                <figcaption className="mt-2 text-sm text-ink-muted">{b.story.transmission.who}</figcaption>
              </figure>
            )}
            <Explorer b={b} inputs={b.inputs} facet="time" opened={s.opened} onOpen={open} onFilter={usedFilter} />
            <Question q={b.timing} name="timing" value={s.timing} onChange={(v) => pick("timing", v)} />
            {b.story.voice.text && (
              <figure className="rounded-2xl bg-bg p-4 ring-1 ring-line">
                <p className={kicker}>At one handoff</p>
                <blockquote className="mt-1 font-serif text-lg">“{b.story.voice.text}”</blockquote>
                <figcaption className="mt-2 text-sm text-ink-muted">{b.story.voice.who}</figcaption>
              </figure>
            )}
            <Question q={b.choice} name="choice" value={s.choice} onChange={(v) => pick("choice", v)} />
            <Next
              disabled={!s.opened.some((x) => x.startsWith("time")) || !s.timing || !s.choice}
              hint="Look at a relationship’s timing, and answer both questions."
              onClick={() => go(5)}
              label="Effort and continuity"
            />
          </div>
        )}
        {shown === 5 && (
          <div className="flex flex-col gap-4">
            <p>
              Two more things: the <strong>work it took</strong>, and whether people <strong>stayed</strong>. Relationship effort and case onboarding are
              counted apart: onboarding for urgent or complex care is necessary work, not a failed investment.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={s.opened.includes("effort") ? secondary : primary} onClick={() => open("effort")}>
                {s.opened.includes("effort") ? "Effort added" : "Add relationship and onboarding effort"}
              </button>
              <button type="button" className={s.opened.includes("continuity") ? secondary : primary} onClick={() => open("continuity")}>
                {s.opened.includes("continuity") ? "Continuity shown" : `Review who is active at ${r.observationDays} days`}
              </button>
            </div>
            {s.opened.includes("effort") && <Explorer b={b} inputs={b.inputs} facet="effort" opened={s.opened} onOpen={open} onFilter={usedFilter} />}
            {s.opened.includes("continuity") && <Explorer b={b} inputs={b.inputs} facet="continuity" opened={s.opened} onOpen={open} onFilter={usedFilter} />}
            <Next
              disabled={!s.opened.includes("effort") || !s.opened.includes("continuity")}
              hint="Add the effort and review continuity."
              onClick={() => go(6)}
              label="Choose the next move"
            />
          </div>
        )}
        {shown === 6 && (
          <div className="flex flex-col gap-4">
            <p className="text-lg">Everything side by side. There’s no single best-referrer score: read each relationship for what it shows.</p>
            <CompareTable r={r} />
            <Warnings r={r} />
            {s.prediction && (
              <p className="text-sm">
                Your prediction from enquiry counts alone: <strong>{b.prediction.options.find((o) => o.id === s.prediction?.source)?.text ?? "none"}</strong>.
                It stays as you made it.
              </p>
            )}
            <Question q={b.revise} name="revised" value={s.revised} onChange={(v) => pick("revised", v)} />
            <Question q={b.dataPoints} name="dataPoint" value={s.dataPoint} onChange={(v) => pick("dataPoint", v)} />
            <Choice
              legend="One relationship action"
              name="relationship"
              options={b.relationship}
              value={s.relationship}
              onChange={(v) => pick("relationship", v)}
            />
            <Choice legend="One operational step" name="operational" options={b.operational} value={s.operational} onChange={(v) => pick("operational", v)} />
            <Choice
              legend="The conclusion you’d give Maya"
              name="explanation"
              options={b.explanations}
              value={s.explanation}
              onChange={(v) => pick("explanation", v)}
            />
            <Next
              disabled={!s.revised || !s.dataPoint || !s.relationship || !s.operational || !s.explanation}
              hint="Answer each one."
              onClick={() => go(7)}
              label={b.update.title || "Return visit"}
            />
          </div>
        )}
        {shown === 7 && !finished && (
          <ReturnVisit
            b={b}
            later={later}
            s={s}
            busy={busy}
            onPick={(k, v) => pick(k, v)}
            onFinish={async () => {
              justFinished.current = true;
              const body = {
                action: "finish",
                denominator: s.denominator,
                timing: s.timing,
                choice: s.choice,
                revised: s.revised,
                dataPoint: s.dataPoint,
                relationship: s.relationship,
                operational: s.operational,
                explanation: s.explanation,
                followUp: s.followUp,
                reinterpret: s.reinterpret,
              };
              const next = await send(body, () => ({ ...s, stage: LAST }));
              if (next?.stage === LAST) go(LAST);
            }}
          />
        )}
        {shown >= 7 && finished && debrief && (
          <Debrief
            b={b}
            later={later}
            d={debrief}
            busy={busy}
            onPrint={() => {
              if (!ctx.preview) api(url, { body: { blockId: b.id, action: "printed" } }).catch(() => undefined);
              printReview();
            }}
            onRetry={async () => {
              const next = await send({ action: "retry" }, () => ({ ...emptyState(), retries: s.retries + 1 }));
              if (next) {
                setDebrief(null);
                setStep(0);
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

function StageGuide() {
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">What each stage and step means</summary>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {STAGE_ORDER.map((x) => (
          <div key={x}>
            <dt className="font-semibold">{STAGES[x]}</dt>
            <dd className="text-ink-muted">{STAGE_HINTS[x]}</dd>
          </div>
        ))}
        {Object.values(EVENTS).map((e) => (
          <div key={e.label}>
            <dt className="font-semibold">{e.label}</dt>
            <dd className="text-ink-muted">{e.hint}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Relationships({ b, r, onNext }: { b: ReferralBlock; r: ReferralResult; onNext: () => void }) {
  const st = b.story;
  return (
    <div className="flex flex-col gap-4">
      <div className={box}>
        <CharacterRow names={[st.character]} size="lg">
          <div className="min-w-0">
            <p className={kicker}>{st.role || "The story"}</p>
            <p className="mt-1">{st.situation}</p>
          </div>
        </CharacterRow>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {st.relationships.map((x) => {
          const n = r.sources.find((y) => y.source === x.source)?.enquiries;
          return (
            <li key={x.label} className={box}>
              <p className="font-semibold">{x.label}</p>
              <p className="mt-1 text-sm">{x.text}</p>
              {n !== undefined && (
                <p className="mt-2 font-serif text-3xl font-semibold">
                  {n} <span className="font-sans text-sm font-normal text-ink-muted">enquiries</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">
        Enquiry counts only, {r.period}. That’s all Maya’s spreadsheet shows so far. Each relationship is a fictional, generic label.
      </p>
      {st.dilemma && (
        <p className="font-serif text-xl font-semibold">
          {st.character.split(" ")[0]}: “{st.dilemma}”
        </p>
      )}
      <Next onClick={onNext} label="Make a prediction" />
    </div>
  );
}

function Prediction({
  b,
  s,
  busy,
  onSubmit,
  onNext,
}: {
  b: ReferralBlock;
  s: ReferralState;
  busy: boolean;
  onSubmit: (source: string) => void;
  onNext: () => void;
}) {
  const done = s.prediction;
  const [source, setSource] = useState(done?.source ?? "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (source) onSubmit(source);
      }}
    >
      <fieldset className="flex flex-col gap-2" disabled={Boolean(done)}>
        <legend className="mb-1 text-lg">{b.prediction.prompt}</legend>
        {b.prediction.options.map((o) => (
          <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
            <input type="radio" name="prediction" className="size-5 accent-[var(--color-action)]" checked={source === o.id} onChange={() => setSource(o.id)} />
            {o.text}
          </label>
        ))}
      </fieldset>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Your prediction is in. You’ll compare it with the cohort at the end; it isn’t marked.</p>
          <Next onClick={onNext} label="Sort the stage cards" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primary} disabled={busy || !source}>
            Lock in my prediction
          </button>
          <span className="text-sm text-ink-muted">You can’t change it afterwards. A guess is fine.</span>
        </div>
      )}
    </form>
  );
}

function StageCard({ id, text, value, onSort }: { id: string; text: string; value: Stage | ""; onSort: (v: Stage) => void }) {
  return (
    <fieldset className={box}>
      <legend className="sr-only">Stage at first contact for this introduction</legend>
      <p className="font-serif text-lg">{text}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {STAGE_ORDER.map((st) => (
          <label key={st} className="flex min-h-10 items-center gap-2 text-sm">
            <input type="radio" name={`stage-${id}`} className="size-5 accent-[var(--color-action)]" checked={value === st} onChange={() => onSort(st)} />
            {STAGES[st]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The starting-stage mix by source: a table, with each row's share ready to choose. */
function StageMix({ r }: { r: ReferralResult }) {
  return (
    <div className={box}>
      <p className={kicker}>Stage at first contact, by relationship</p>
      <p className="mt-1 text-sm">The same {r.period}. Stored as it was at first contact: a later update never changes it.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Enquiries by stage at first contact, for each source</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className={th}>
                Source
              </th>
              {STAGE_ORDER.map((st) => (
                <th key={st} scope="col" className={th}>
                  {STAGES[st]}
                </th>
              ))}
              <th scope="col" className={th}>
                Ready to choose
              </th>
            </tr>
          </thead>
          <tbody>
            {r.sources
              .filter((x) => x.enquiries > 0)
              .map((x) => {
                const ready = READY.reduce((t, st) => t + x.stages[st], 0);
                return (
                  <tr key={x.source} className="border-b border-line">
                    <th scope="row" className={th}>
                      {x.label}
                    </th>
                    {STAGE_ORDER.map((st) => (
                      <td key={st} className="py-1 pr-2">
                        {x.stages[st]}
                      </td>
                    ))}
                    <td className="py-1 pr-2">
                      {ready} of {x.enquiries}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: string; text: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
          <input
            type="radio"
            name={name}
            className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          {o.text}
        </label>
      ))}
    </fieldset>
  );
}

const Question = ({ q, name, value, onChange }: { q: { prompt: string; options: Option[] }; name: string; value: string; onChange: (id: string) => void }) => (
  <Choice legend={q.prompt} name={name} options={q.options} value={value} onChange={onChange} />
);

/** The calendar-month trap, worked out: a month's starts against a month's enquiries isn't a cohort rate. */
function CalendarTrap({ b }: { b: ReferralBlock }) {
  const months = b.period;
  const [month, setMonth] = useState(months.at(-1) ?? "");
  if (!month) return null;
  const c = calendarMonth(b.inputs, month);
  return (
    <div className={box}>
      <p className={kicker}>A calendar month isn’t a cohort</p>
      <label className="mt-2 flex max-w-xs flex-col gap-1 text-xs font-semibold">
        Month
        <select className={small} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-sm">{c.note}</p>
      <p className="mt-1 text-sm text-ink-muted">
        {c.sameCohort} of those first services came from {monthLabel(month)}’s own enquiries; {c.earlierCohorts} from earlier months.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The explorer: one source at a time, filters, a chart and its table
// ---------------------------------------------------------------------------------------------

type Facet = "funnel" | "time" | "effort" | "continuity";

function Explorer({
  b,
  inputs,
  facet,
  opened,
  onOpen,
  onFilter,
}: {
  b: Pick<ReferralBlock, "period">;
  inputs: ReferralInputs;
  facet: Facet;
  opened: string[];
  onOpen: (key: string) => void;
  onFilter?: (name: string) => void;
}) {
  const all = cohortMonths(inputs);
  const [months, setMonths] = useState<string[]>(b.period.length ? b.period : all);
  const [stage, setStage] = useState<Stage | "">("");
  const [area, setArea] = useState("");
  const r = safeCalc(inputs, { months, stage, area });
  const sources = (r?.sources ?? []).filter((x) => x.enquiries > 0 || (facet === "effort" && x.effort.relationship !== null));
  const [source, setSource] = useState<Source | "">("");
  const current = sources.find((x) => x.source === source);
  const key = facet === "funnel" ? "funnel" : facet === "time" ? "time" : facet;
  const choose = (x: Source) => {
    setSource(x);
    if (facet === "funnel" || facet === "time") onOpen(`${key}:${x}`);
  };
  const f = (name: string) => onFilter?.(name);
  if (!r) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-wrap gap-x-3 text-xs">
          <legend className="font-semibold">Cohort months</legend>
          {all.map((m) => (
            <label key={m} className="flex min-h-10 items-center gap-1">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={months.includes(m)}
                onChange={(e) => {
                  setMonths((x) => (e.target.checked ? [...x, m].sort() : x.filter((y) => y !== m)));
                  f("month");
                }}
              />
              {monthLabel(m)}
            </label>
          ))}
        </fieldset>
        {inputs.mode === "records" && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Stage at first contact
            <select
              className={small}
              value={stage}
              onChange={(e) => {
                setStage(e.target.value as Stage | "");
                f("stage");
              }}
            >
              <option value="">All stages</option>
              {STAGE_ORDER.map((st) => (
                <option key={st} value={st}>
                  {STAGES[st]}
                </option>
              ))}
            </select>
          </label>
        )}
        {inputs.areas.length > 1 && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Service area
            <select
              className={small}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                f("area");
              }}
            >
              <option value="">All areas</option>
              {inputs.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {r.period} · as of {dateLabel(r.asOf)} · {r.timezone} · compared at {r.matureAge} days after enquiry · {r.minSample} mature enquiries to rank
      </p>
      {r.warnings.length > 0 && <Warnings r={r} />}
      <div role="group" aria-label="Choose a source" className="flex flex-wrap gap-2">
        {sources.map((x) => (
          <button
            key={x.source}
            type="button"
            aria-pressed={source === x.source}
            onClick={() => choose(x.source as Source)}
            className={cx(
              "min-h-11 rounded-full border px-4 text-sm font-semibold",
              source === x.source ? "border-transparent bg-action text-on-action" : "border-line-strong bg-surface hover:bg-muted",
              !opened.includes(`${key}:${x.source}`) && (facet === "funnel" || facet === "time") && source !== x.source && "border-dashed",
            )}
          >
            {x.label}
            {x.tooEarly ? " · too early to rank" : ""}
          </button>
        ))}
        {!sources.length && <p className="text-sm text-ink-muted">No enquiries match those filters.</p>}
      </div>
      {current ? (
        <SourceDetail x={current} facet={facet} period={r.period} />
      ) : (
        sources.length > 0 && (
          <p className="text-sm text-ink-muted">Choose a source to see its {facet === "funnel" ? "funnel" : facet === "time" ? "timing" : facet}.</p>
        )
      )}
      <FacetTable r={r} facet={facet} />
    </div>
  );
}

function SourceDetail({ x, facet, period }: { x: SourceResult; facet: Facet; period: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="font-semibold">
        {x.label} · {period} · {x.enquiries} distinct {x.enquiries === 1 ? "enquiry" : "enquiries"}
        {x.assists ? ` · ${x.assists} ${x.assists === 1 ? "assist" : "assists"}` : ""}
      </p>
      {x.caution.length > 0 && (
        <ul className={cx("list-disc rounded-xl py-2 pl-8 pr-3 text-sm", TONE.warn)}>
          {x.caution.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {facet === "funnel" && <Funnel x={x} />}
      {facet === "time" && <Timing x={x} />}
      {facet === "effort" && <EffortView x={x} />}
      {facet === "continuity" && <Continuity x={x} />}
      {x.quality.notes.length > 0 && <p className="text-xs text-ink-muted">Data quality: {x.quality.notes.join(" ")}</p>}
    </div>
  );
}

/** A horizontal bar for a share of the cohort: hidden from screen readers, with the figure in words beside it. */
function Bar({ value, of, kind = "done" }: { value: number; of: number; kind?: keyof typeof BAR }) {
  return (
    <span aria-hidden className="block h-4 w-full overflow-hidden rounded bg-muted">
      <span className="block h-full" style={{ ...BAR[kind], width: of > 0 ? `${(Math.max(0, value) / of) * 100}%` : "0%" }} />
    </span>
  );
}

function Funnel({ x }: { x: SourceResult }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className={kicker}>The cohort funnel</p>
        <ol className="mt-2 flex flex-col gap-2 text-sm">
          <li>
            <span className="flex justify-between gap-2">
              <span>{EVENTS.enquiry.label}</span>
              <strong>{x.enquiries}</strong>
            </span>
            <Bar value={x.enquiries} of={x.enquiries} />
          </li>
          {FUNNEL.map((k) => (
            <li key={k}>
              <span className="flex justify-between gap-2">
                <span>{EVENTS[k].label}</span>
                <strong>{x.funnel[k].rate.text}</strong>
              </span>
              <Bar value={x.funnel[k].count} of={x.enquiries} />
            </li>
          ))}
          <li>
            <span className="flex justify-between gap-2">
              <span>Still open (not a failure)</span>
              <strong>
                {x.open} of {x.enquiries}
              </strong>
            </span>
            <Bar value={x.open} of={x.enquiries} kind="open" />
          </li>
          <li>
            <span className="flex justify-between gap-2">
              <span>Closed without starting</span>
              <strong>
                {x.closed} of {x.enquiries}
              </strong>
            </span>
            <Bar value={x.closed} of={x.enquiries} kind="closed" />
          </li>
        </ol>
        {x.closedReasons.length > 0 && (
          <p className="mt-2 text-sm">Closed: {x.closedReasons.map((c) => `${c.count} ${CLOSE_REASONS[c.reason].toLowerCase()}`).join("; ")}.</p>
        )}
        <p className="mt-1 text-xs text-ink-muted">An agreement isn’t a delivered service: the gap between them is people waiting to start.</p>
      </div>
      <div>
        <p className={kicker}>Stage-matched first services</p>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">First services by stage at first contact, for {x.label}</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className={th}>
                Stage at first contact
              </th>
              <th scope="col" className={th}>
                Enquiries
              </th>
              <th scope="col" className={th}>
                Started
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGE_ORDER.filter((st) => x.stages[st] > 0).map((st) => (
              <tr key={st} className="border-b border-line">
                <th scope="row" className={th}>
                  {STAGES[st]}
                </th>
                <td className="py-1 pr-2">{x.stages[st]}</td>
                <td className="py-1 pr-2">{x.stageMatched[st].text}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className={th}>
                All stages
              </th>
              <td className="py-1 pr-2">{x.enquiries}</td>
              <td className="py-1 pr-2">{x.startRate.text}</td>
            </tr>
          </tbody>
        </table>
        {x.startRateAtAge && <p className="mt-2 text-sm">Started within the comparison age, among enquiries at least that old: {x.startRateAtAge.text}.</p>}
      </div>
    </div>
  );
}

function Timing({ x }: { x: SourceResult }) {
  const t = x.timing;
  const max = Math.max(1, ...BAND_ORDER.map((k) => t.bands[k]));
  const waits = WAIT_ORDER.filter((w) => x.waits[w] > 0);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className={kicker}>Days from enquiry to first service</p>
        <p className="mt-1 text-sm">
          {t.exact && t.started
            ? `Median ${days(t.median)} (range ${days(t.min)} to ${days(t.max)}) among the ${t.started} who started.`
            : t.exact
              ? "Nobody in this cohort has started yet."
              : "From grouped bands: a distribution, with no exact median."}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {BAND_ORDER.map((k) => (
            <li key={k}>
              <span className="flex justify-between gap-2">
                <span>{BANDS[k]}</span>
                <strong>{t.bands[k]}</strong>
              </span>
              <Bar value={t.bands[k]} of={max} />
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-ink-muted">{t.note}</p>
      </div>
      <div className="flex flex-col gap-3">
        {t.segments.some((g) => g.before !== "n/a") && (
          <table className="w-full text-sm">
            <caption className={cx(kicker, "text-left")}>Before and after a funding allocation</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className={th}>
                  Enquiry
                </th>
                <th scope="col" className={th}>
                  Total
                </th>
                <th scope="col" className={th}>
                  Waiting for allocation
                </th>
                <th scope="col" className={th}>
                  After allocation
                </th>
              </tr>
            </thead>
            <tbody>
              {t.segments.map((g) => (
                <tr key={g.id} className="border-b border-line">
                  <th scope="row" className={th}>
                    {g.id}
                  </th>
                  <td className="py-1 pr-2">{days(g.total)}</td>
                  <td className="py-1 pr-2">{g.before === "n/a" ? "already allocated" : g.before === "unknown" ? "not known" : days(g.before)}</td>
                  <td className="py-1 pr-2">{g.after === "unknown" ? "not known" : days(g.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {t.open.length > 0 && (
          <table className="w-full text-sm">
            <caption className={cx(kicker, "text-left")}>Still open, with their ages</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className={th}>
                  Enquiry
                </th>
                <th scope="col" className={th}>
                  Age
                </th>
                <th scope="col" className={th}>
                  Waiting for
                </th>
                <th scope="col" className={th}>
                  Who owns the wait
                </th>
              </tr>
            </thead>
            <tbody>
              {t.open.map((o) => (
                <tr key={o.id} className="border-b border-line">
                  <th scope="row" className={th}>
                    {o.id}
                  </th>
                  <td className="py-1 pr-2">{days(o.age)}</td>
                  <td className="py-1 pr-2">{WAITS[o.wait || "unknown"].label}</td>
                  <td className="py-1 pr-2">{WAITS[o.wait || "unknown"].owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {waits.length > 0 && (
          <p className="text-sm">
            Main reasons for waiting (open, or started late): {waits.map((w) => `${x.waits[w]} ${WAITS[w].label.toLowerCase()}`).join("; ")}.
          </p>
        )}
      </div>
    </div>
  );
}

const amountText = (v: number | "unknown" | null, unit = "h") => (v === null ? "not recorded" : v === "unknown" ? "unknown" : `${round1(v)} ${unit}`);

function EffortView({ x }: { x: SourceResult }) {
  const e = x.effort;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className={kicker}>Relationship effort</p>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Relationship hours by kind of work, for {x.label}</caption>
          <tbody>
            {PART_ORDER.map((p) => (
              <tr key={p} className="border-b border-line">
                <th scope="row" className={th}>
                  {RELATIONSHIP_PARTS[p]}
                </th>
                <td className="py-1 pr-2">{amountText(e.relationship === null && !e.included.length ? null : e.parts[p])}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className={th}>
                Per first service
              </th>
              <td className="py-1 pr-2 font-semibold">{e.perStart.text}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-ink-muted">
          {e.note} {e.observed ? "Observed time." : "Includes estimates."}
        </p>
      </div>
      <div>
        <p className={kicker}>Case onboarding (kept apart)</p>
        <p className="mt-2 text-sm">
          {amountText(e.onboarding)} in total · {e.onboardingPerStart.text}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Onboarding is necessary work for the people who started. Urgent or complex care can legitimately take more of it. It’s never added to relationship
          effort, and hours are never turned into money here.
        </p>
        {e.costs !== null && e.costs !== "unknown" && <p className="mt-1 text-sm">Direct costs entered: ${round1(e.costs)}.</p>}
      </div>
    </div>
  );
}

function Continuity({ x }: { x: SourceResult }) {
  const c = x.continuity;
  return (
    <div>
      <p className={kicker}>Active at {c.days} days after the first service</p>
      <p className="mt-1 text-sm">
        <strong>{c.rate.text}</strong> of the {c.mature} {c.mature === 1 ? "start" : "starts"} old enough to have reached {c.days} days. {c.starts - c.mature}{" "}
        more {c.starts - c.mature === 1 ? "start is" : "starts are"} too recent to count: they’re not in the denominator.
      </p>
      <Bar value={c.active} of={c.mature} />
      {c.exits.length > 0 && (
        <p className="mt-2 text-sm">
          Not active at {c.days} days: {c.exits.map((e) => `${e.count} ${EXIT_REASONS[e.reason].toLowerCase()}`).join("; ")}. A death or a move to residential
          care isn’t a failed referral.
        </p>
      )}
    </div>
  );
}

/** Every source for one facet, with numerators and denominators: the table alternative and the comparison control. */
function FacetTable({ r, facet }: { r: ReferralResult; facet: Facet }) {
  const rows = [...r.sources.filter((x) => x.enquiries > 0 || x.assists > 0), r.all];
  const cols: { head: string; cell: (x: SourceResult) => string }[] =
    facet === "funnel"
      ? [
          { head: "Enquiries", cell: (x) => `${x.enquiries}${x.assists ? ` (+${x.assists} assists)` : ""}` },
          ...FUNNEL.map((k) => ({ head: EVENTS[k].label, cell: (x: SourceResult) => x.funnel[k].rate.text })),
          { head: "Open", cell: (x) => String(x.open) },
          { head: "Closed", cell: (x) => String(x.closed) },
        ]
      : facet === "time"
        ? [
            { head: "Started", cell: (x) => String(x.timing.started) },
            { head: "Median", cell: (x) => (x.timing.exact ? days(x.timing.median) : "bands only") },
            { head: "Range", cell: (x) => (x.timing.exact && x.timing.started ? `${days(x.timing.min)} to ${days(x.timing.max)}` : "–") },
            ...BAND_ORDER.map((k) => ({ head: BANDS[k], cell: (x: SourceResult) => String(x.timing.bands[k]) })),
            { head: "Still open", cell: (x) => String(x.open) },
          ]
        : facet === "effort"
          ? [
              { head: "Relationship hours", cell: (x) => amountText(x.effort.relationship) },
              { head: "Per first service", cell: (x) => x.effort.perStart.text },
              { head: "Onboarding hours", cell: (x) => amountText(x.effort.onboarding) },
              { head: "Onboarding per start", cell: (x) => x.effort.onboardingPerStart.text },
            ]
          : [
              { head: "Starts", cell: (x) => String(x.continuity.starts) },
              { head: `Old enough for ${r.observationDays} days`, cell: (x) => String(x.continuity.mature) },
              { head: "Still active", cell: (x) => x.continuity.rate.text },
              {
                head: "Exits by reason",
                cell: (x) => x.continuity.exits.map((e) => `${e.count} ${EXIT_REASONS[e.reason].toLowerCase()}`).join("; ") || "none",
              },
            ];
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">Compare every source in a table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">
            {facet} for every source, {r.period}
          </caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className={th}>
                Source
              </th>
              {cols.map((c) => (
                <th key={c.head} scope="col" className={th}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.source} className="border-b border-line align-top">
                <th scope="row" className={th}>
                  {x.label}
                  {x.tooEarly && <span className="block font-normal text-ink-muted">too early to rank</span>}
                </th>
                {cols.map((c) => (
                  <td key={c.head} className="py-1 pr-2">
                    {c.cell(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** The compact comparison across all four dimensions. Never a single score, and never a ranking. */
function CompareTable({ r }: { r: ReferralResult }) {
  const rows = r.sources.filter((x) => x.enquiries > 0);
  return (
    <div className={box}>
      <p className={kicker}>
        {r.period} · as of {dateLabel(r.asOf)}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">Each source compared by stage, progression, time, effort and continuity, with numerators and denominators</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className={th}>
                Source
              </th>
              <th scope="col" className={th}>
                Enquiries (ready to choose)
              </th>
              <th scope="col" className={th}>
                First services
              </th>
              <th scope="col" className={th}>
                Ready to choose at first contact: started
              </th>
              <th scope="col" className={th}>
                Median days to start
              </th>
              <th scope="col" className={th}>
                Relationship effort
              </th>
              <th scope="col" className={th}>
                Onboarding
              </th>
              <th scope="col" className={th}>
                Active at {r.observationDays} days
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.source} className="border-b border-line align-top">
                <th scope="row" className={th}>
                  {x.label}
                  <span className="block font-normal text-ink-muted">{x.tooEarly ? "too early to rank" : `${x.mature} mature enquiries`}</span>
                </th>
                <td className="py-1 pr-2">
                  {x.enquiries} ({READY.reduce((t, st) => t + x.stages[st], 0)})
                </td>
                <td className="py-1 pr-2">
                  {x.startRate.text}
                  {x.open ? <span className="block text-ink-muted">{x.open} open</span> : null}
                </td>
                <td className="py-1 pr-2">{x.readyMatched.text}</td>
                <td className="py-1 pr-2">{x.timing.exact ? days(x.timing.median) : "bands only"}</td>
                <td className="py-1 pr-2">{x.effort.perStart.text}</td>
                <td className="py-1 pr-2">{x.effort.onboardingPerStart.text}</td>
                <td className="py-1 pr-2">{x.continuity.rate.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Warnings({ r }: { r: ReferralResult }) {
  if (!r.warnings.length) return null;
  return (
    <div role="note" className={cx("rounded-2xl px-4 py-3 text-sm", TONE.warn)}>
      {r.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
    </div>
  );
}

function ReturnVisit({
  b,
  later,
  s,
  busy,
  onPick,
  onFinish,
}: {
  b: ReferralBlock;
  later: ReferralInputs;
  s: ReferralState;
  busy: boolean;
  onPick: (k: "followUp" | "reinterpret", v: string) => void;
  onFinish: () => void;
}) {
  const before = safeCalc(b.inputs, { months: b.period });
  const after = safeCalc(later, { months: b.period });
  const fresh = b.update.period.length ? safeCalc(later, { months: b.update.period }) : null;
  const changes = [...inputChanges(b.inputs, later), ...(before && after ? resultChanges(before, after) : [])];
  const problems = finishProblems(b, s);
  return (
    <div className="flex flex-col gap-4">
      <div className={box}>
        <p className={kicker}>{b.update.title || "Later"}</p>
        <p className="mt-1 text-lg">{b.update.text}</p>
      </div>
      {after && (
        <>
          <p className="font-semibold">
            The same {after.period}, now as of {dateLabel(after.asOf)}
          </p>
          <CompareTable r={after} />
        </>
      )}
      {fresh && (
        <>
          <p className="font-semibold">The newer cohort: {fresh.period}</p>
          <CompareTable r={fresh} />
          <Warnings r={fresh} />
        </>
      )}
      {changes.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer font-semibold">What changed? ({changes.length})</summary>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
      <Question q={b.followUp} name="followUp" value={s.followUp} onChange={(v) => onPick("followUp", v)} />
      <label className="flex max-w-2xl flex-col gap-1 text-sm font-semibold">
        Would you keep your relationship action, or try a different one? Your first answer is kept either way.
        <select className={small} value={s.reinterpret} onChange={(e) => onPick("reinterpret", e.target.value)}>
          <option value="">Keep it</option>
          {b.relationship
            .filter((o) => o.id !== s.relationship)
            .map((o) => (
              <option key={o.id} value={o.id}>
                Change to: {o.text.length > 110 ? `${o.text.slice(0, 110)}…` : o.text}
              </option>
            ))}
        </select>
      </label>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={primary} disabled={busy || problems.length > 0} onClick={onFinish}>
          Finish and see the debrief
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

function Debrief({
  b,
  later,
  d,
  busy,
  onPrint,
  onRetry,
}: {
  b: ReferralBlock;
  later: ReferralInputs;
  d: ReferralDebrief;
  busy: boolean;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const after = safeCalc(later, { months: b.period });
  return (
    <div className="flex flex-col gap-4">
      {d.flags.length > 0 && (
        <div role="alert" className={cx("rounded-2xl p-4", TONE.bad)}>
          <p className="font-semibold">Before anything else</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {d.flags.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={box}>
        <p className={kicker}>What happened next</p>
        <p className="mt-1">{d.relationship.outcome}</p>
        <p className="mt-1">{d.operational.outcome}</p>
        {(
          [
            ["Your relationship action", d.relationship],
            ["Your operational step", d.operational],
          ] as const
        ).map(([k, x]) => (
          <div key={k} className="mt-2 text-sm">
            <p>
              <strong>{k}:</strong> {x.text}
            </p>
            <p className="mt-0.5">{x.feedback}</p>
            <NextStepLink b={b} next={x.next} />
          </div>
        ))}
        {d.answers.map((a) => (
          <div key={a.key} className="mt-2 text-sm">
            <p>
              <strong>{a.label}:</strong> {a.text}
            </p>
            <p className="mt-0.5">{a.feedback}</p>
          </div>
        ))}
        <div className="mt-2 text-sm">
          <p>
            <strong>At the return visit:</strong> {d.followUp.text}
          </p>
          <p className="mt-0.5">{d.followUp.feedback}</p>
          {d.followUp.changed && <p className="mt-0.5">You’d now try: {d.followUp.reinterpreted} Your first answer is kept for the feedback above.</p>}
        </div>
      </div>
      <div className={box}>
        <p className={kicker}>
          How you did · {d.score} of {d.max}
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {d.dims.map((x) => (
            <div key={x.dim} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <dt className="font-semibold">
                {x.label}: {LEVELS[x.rating]} ({x.rating}/3)
              </dt>
              <dd className="mt-1 text-sm">{x.why}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          It scores stage reasoning, consent and choice, honest timing and a proportionate response: never the most introductions, and never pressure to
          convert.
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>Your stage cards beside the stage at first contact</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Each stage card: your sort and the recorded stage at first contact</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className={th}>
                  Introduction
                </th>
                <th scope="col" className={th}>
                  Yours
                </th>
                <th scope="col" className={th}>
                  The stage
                </th>
              </tr>
            </thead>
            <tbody>
              {d.cards.map((c) => (
                <tr key={c.id} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-2 font-normal">
                    {c.text}
                  </th>
                  <td className="px-2 py-2">
                    {c.yours ? STAGES[c.yours] : "Not sorted"} {c.matches ? "(matches)" : "(differs)"}
                  </td>
                  <td className="px-2 py-2">
                    <strong>{STAGES[c.answer]}</strong>
                    <p className="mt-1">{c.feedback}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={box}>
        <p className={kicker}>Your prediction</p>
        <p className="mt-1 text-sm">
          You predicted <strong>“{d.prediction.chosen || "none chosen"}”</strong> from enquiry counts alone.{" "}
          {d.prediction.likely.length ? `The cohort points to: “${d.prediction.likely.join("”; “")}”.` : ""}
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>The case</p>
        <p className="mt-1">{d.summary}</p>
        <Studio b={b} />
        <Links b={b} />
      </div>
      {after && (
        <ReviewSheet
          title="Relationship Review (learning copy, fictional)"
          r={after}
          period={`${after.period}, as of ${dateLabel(after.asOf)}`}
          review={{
            evidence: d.summary,
            unknowns: "Fictional figures. Whether October’s GP enquiries keep arriving further along: too young to rank until they reach 90 days.",
            relationshipAction: d.followUp.changed ? d.followUp.reinterpreted : d.relationship.text,
            relationshipOwner: `${b.story.character} (fictional)`,
            operationalAction: d.operational.text,
            operationalOwner: `${b.story.character} with Operations (fictional)`,
            next: d.relationship.next,
            reviewBy: "When October’s enquiries reach 90 days",
            notes: "",
          }}
          versions={`${d.versions.story} · ${d.versions.model} · ${d.versions.stages}`}
          sources={b.sources}
          b={b}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the review
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Look again
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab}, story {d.versions.story}, rubric {d.versions.rubric}, model {d.versions.model}, stages {d.versions.stages}. Every attempt is
        kept.
      </p>
    </div>
  );
}

/** The Local Referral Studio handoff: a labelled placeholder until that Work Tool exists. */
function Studio({ b }: { b: Pick<ReferralBlock, "studio"> }) {
  if (!b.studio.label) return null;
  return (
    <div className={cx("mt-3 rounded-xl px-3 py-2 text-sm", TONE.warn)}>
      <p className="font-semibold">Next step: {b.studio.label} · placeholder</p>
      <p className="mt-0.5">{b.studio.note}</p>
    </div>
  );
}

function Links({ b }: { b: Pick<ReferralBlock, "links"> }) {
  if (!b.links.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-2 text-sm">
      {b.links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} className="font-semibold text-accent underline underline-offset-2">
            {l.label}
          </Link>{" "}
          <span className="text-ink-muted">{l.why}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where an action leads: the Studio placeholder, or the sibling article's link from the block's links. */
function NextStepLink({ b, next }: { b: Pick<ReferralBlock, "links" | "studio">; next: NextStep }) {
  if (!next) return null;
  if (next === "studio") return <p className="mt-0.5 text-xs text-ink-muted">Next: {b.studio.label || NEXT_STEPS.studio} (placeholder: not in the Hub yet).</p>;
  const l = b.links.find((x) => x.label === NEXT_STEPS[next]);
  return l ? (
    <p className="mt-0.5 text-xs">
      Next:{" "}
      <Link href={l.href} className="font-semibold text-accent underline underline-offset-2">
        {l.label}
      </Link>
    </p>
  ) : (
    <p className="mt-0.5 text-xs text-ink-muted">Next: {NEXT_STEPS[next]}</p>
  );
}

// ---------------------------------------------------------------------------------------------
// The Relationship Review
// ---------------------------------------------------------------------------------------------

/** Prints the review alone, using the Hub's print rule for a decision sheet (globals.css). */
function printReview() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

type ReviewFields = {
  period: string;
  evidence: string;
  unknowns: string;
  relationshipAction: string;
  relationshipOwner: string;
  operationalAction: string;
  operationalOwner: string;
  next: NextStep;
  reviewBy: string;
  notes: string;
};
const blankReview = (): ReviewFields => ({
  period: "",
  evidence: "",
  unknowns: "",
  relationshipAction: "",
  relationshipOwner: "",
  operationalAction: "",
  operationalOwner: "",
  next: "",
  reviewBy: "",
  notes: "",
});

function ReviewSheet({
  title,
  r,
  period,
  review,
  versions,
  sources = [],
  b,
}: {
  title: string;
  r: ReferralResult;
  period: string;
  review: Omit<ReviewFields, "period">;
  versions: string;
  sources?: { title: string; url: string }[];
  b: Pick<ReferralBlock, "links" | "studio">;
}) {
  return (
    <section className="growth-sheet rounded-2xl bg-bg p-4 ring-1 ring-line" aria-label={title}>
      <p className={kicker}>{title}</p>
      <h5 className="mt-1 font-serif text-xl font-semibold">{period}</h5>
      <p className="text-sm text-ink-muted">
        Cohort by enquiry month · compared at {r.matureAge} days after enquiry · continuity at {r.observationDays} days · {r.minSample} mature enquiries to rank
        · {r.timezone} · {versions}
      </p>
      <p className="mt-3 font-semibold">Key figures</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {r.sources
          .filter((x) => x.enquiries > 0)
          .map((x) => (
            <li key={x.source}>
              {x.label}: {x.enquiries} {x.enquiries === 1 ? "enquiry" : "enquiries"}; first services {x.startRate.text}; ready to choose at first contact{" "}
              {x.readyMatched.text}; relationship effort {x.effort.perStart.text}; active at {x.continuity.days} days {x.continuity.rate.text}
              {x.tooEarly ? "; too early to rank" : ""}.
            </li>
          ))}
      </ul>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-semibold">Evidence</p>
          <p className="whitespace-pre-line text-sm">{review.evidence || "None recorded."}</p>
          <p className="mt-2 font-semibold">Unknowns</p>
          <p className="whitespace-pre-line text-sm">{review.unknowns || "None recorded."}</p>
        </div>
        <div>
          <p className="font-semibold">One relationship action</p>
          <p className="text-sm">
            {review.relationshipAction || "Not chosen yet."} <span className="text-ink-muted">Owner: {review.relationshipOwner || "not named yet"}.</span>
          </p>
          <p className="mt-2 font-semibold">One operational action, if needed</p>
          <p className="text-sm">
            {review.operationalAction || "None needed."} <span className="text-ink-muted">Owner: {review.operationalOwner || "not named yet"}.</span>
          </p>
          <NextStepLink b={b} next={review.next} />
        </div>
      </div>
      {review.notes && <p className="mt-2 whitespace-pre-line text-sm">{review.notes}</p>}
      <p className="mt-2 text-sm">
        <strong>Review date:</strong> {review.reviewBy || "set one"}
      </p>
      {sources.length > 0 && <p className="mt-2 text-xs text-ink-muted">Sources: {sources.map((x) => x.title).join("; ")}.</p>}
      <p className="mt-1 text-xs text-ink-muted">
        A review from aggregate figures: no person’s name, no practice’s or hospital’s name, no clinical information. It doesn’t send a message, promise a
        funding place or decide eligibility.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Review my relationships
// ---------------------------------------------------------------------------------------------

type ReviewSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string };
type SavedReview = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: ReferralInputs;
  review: ReviewFields;
  previous: { number: number; savedAt: string; inputs: ReferralInputs; review: ReviewFields } | null;
  earlierModel: boolean;
};

const isoToday = () => new Date().toISOString().slice(0, 10);

function ReviewMine({ orgName, b, guideId }: { orgName: string; b: ReferralBlock; guideId: string }) {
  const home = useApi<{ access: { orgName: string } | null; reviews: ReviewSummary[] }>("/api/tools/referral");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<ReferralInputs | null>(null);
  const [baseline, setBaseline] = useState<ReferralInputs | null>(null);
  const [review, setReview] = useState<ReviewFields>(blankReview());
  const [saved, setSaved] = useState<SavedReview | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The last valid result stays, labelled, while a field is blank or out of range.
  const [lastGood, setLastGood] = useState<ReferralInputs | null>(null);

  const where = `&guide=${encodeURIComponent(guideId)}&block=${encodeURIComponent(b.id)}`;
  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const p = await api<SavedReview>(`/api/tools/referral?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}${where}`);
      setSaved(p);
      setInputs(p.inputs);
      setBaseline(p.inputs);
      setReview(p.review);
      setName(p.name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startBlank = () => {
    const fresh = blankInputs(isoToday());
    setSaved(null);
    setInputs(fresh);
    setBaseline(fresh);
    setReview(blankReview());
    setName("");
  };
  const save = async () => {
    if (!inputs) return;
    setBusy(true);
    setMessage(null);
    try {
      const p = await api<SavedReview>("/api/tools/referral", { body: { id: saved?.id, name, inputs, review, note, guideId, blockId: b.id } });
      setSaved(p);
      setBaseline(p.inputs);
      setNote("");
      setMessage(`Saved as version ${p.version}.`);
      home.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = home.data?.reviews ?? [];
  const errors = inputs ? validateInputs(inputs) : [];
  const r = inputs && !errors.length ? calculate(inputs) : null;
  if (inputs && r && lastGood !== inputs) setLastGood(inputs);
  const fallback = !r && lastGood && !validateInputs(lastGood).length ? lastGood : null;
  const shown = r ?? (fallback ? calculate(fallback) : null);
  const shownInputs = r ? inputs : fallback;
  const prev = saved?.previous && !validateInputs(saved.previous.inputs).length ? saved.previous : null;
  const changes = inputs && prev ? inputChanges(prev.inputs, inputs) : inputs && baseline ? inputChanges(baseline, inputs) : [];
  const resultDelta = r && prev ? resultChanges(calculate(prev.inputs), r) : [];
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <p>
          <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these reviews, checked on the server for
          every read and save. Trilogy Care staff, course authors and other businesses can’t see them, and no figure, label or note appears in anyone’s
          dashboard.
        </p>
        <p className="mt-1">
          <strong>What to enter:</strong> <strong>monthly counts by referral source</strong>, from your own records. Never a person’s name, a practice’s or
          hospital’s name, or clinical details: live referral and consent records stay in the CRM or Portal. A private label like “GP practice A” is fine. If a
          row has only one or two people, combine months so nobody can be identified.
        </p>
        <p className="mt-1">
          <strong>Kept:</strong> nothing until you choose Save. Each save is a new version, kept for your business until you ask for it to be removed. You don’t
          need this to complete the article.
        </p>
      </div>
      {!inputs && (
        <div className="flex flex-col gap-3">
          {list.length > 0 && (
            <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => load(list[0].id)}>
              Resume my review: {list[0].name}
            </button>
          )}
          {list.length > 1 && (
            <ul className="flex flex-col gap-1 text-sm">
              {list.slice(1).map((x) => (
                <li key={x.id}>
                  <button type="button" className="min-h-10 font-semibold text-accent underline underline-offset-2" onClick={() => load(x.id)}>
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
          {errors.length > 0 && (
            <div role="status" className={cx("rounded-2xl p-3 text-sm", TONE.warn)}>
              <p className="font-semibold">{shown ? "Showing the last valid result (a prior result)." : "No result yet."} Fix these first:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.slice(0, 6).map((e) => (
                  <li key={e.field + e.message}>{e.message}</li>
                ))}
                {errors.length > 6 && <li>and {errors.length - 6} more</li>}
              </ul>
            </div>
          )}
          {shown && shownInputs && (
            <div className={cx("flex flex-col gap-4", !r && "opacity-70")}>
              <CompareTable r={shown} />
              <Warnings r={shown} />
              {(["funnel", "time", "effort", "continuity"] as const).map((facet) => (
                <details key={facet} className={box}>
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    {facet === "funnel" ? "The cohort funnel" : facet === "time" ? "Time to first service" : facet === "effort" ? "Effort" : "Continuity"}, by
                    source
                  </summary>
                  <div className="mt-3">
                    <Explorer b={{ period: [] }} inputs={shownInputs} facet={facet} opened={[]} onOpen={() => undefined} />
                  </div>
                </details>
              ))}
            </div>
          )}
          <details className={box} open={!r}>
            <summary className="min-h-11 cursor-pointer font-semibold">Enter or edit the cohorts</summary>
            <div className="mt-3 flex flex-col gap-4">
              <SettingsEditor inputs={inputs} errors={errors} onChange={setInputs} />
              <RowsEditor inputs={inputs} errors={errors} onChange={setInputs} />
            </div>
          </details>
          {(changes.length > 0 || resultDelta.length > 0) && (
            <div className={box}>
              <p className={kicker}>What changed since {prev ? `version ${prev.number}` : saved ? `version ${saved.version}` : "you started"}?</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {[...changes, ...resultDelta].slice(0, 24).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-muted">A higher enquiry count isn’t sustainable growth until the same cohort starts and stays.</p>
            </div>
          )}
          {saved?.previous && (saved.previous.review.relationshipAction || saved.previous.review.operationalAction) && (
            <div className={box}>
              <p className={kicker}>Last time you planned</p>
              <p className="mt-1 text-sm">
                {saved.previous.review.relationshipAction}
                {saved.previous.review.operationalAction ? ` · ${saved.previous.review.operationalAction}` : ""}
              </p>
              <p className="mt-1 text-sm text-ink-muted">Did it change what happened to the next cohort? Compare that month’s funnel above.</p>
            </div>
          )}
          <fieldset className={box}>
            <legend className="sr-only">Relationship Review</legend>
            <p className={kicker}>Your Relationship Review</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["period", "Cohorts reviewed", "e.g. March–May enquiries, as of 31 August"],
                  ["relationshipAction", "One relationship action", "e.g. share a stage explainer with GP practice A"],
                  ["relationshipOwner", "Its owner (a role is fine)", ""],
                  ["operationalAction", "One operational action, if needed", "e.g. check early-morning capacity in one suburb"],
                  ["operationalOwner", "Its owner (a role is fine)", ""],
                ] as const
              ).map(([k, label, placeholder]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold">
                  {label}
                  <input className={small} value={review[k]} placeholder={placeholder} onChange={(e) => setReview((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review date
                <input type="date" className={small} value={review.reviewBy} onChange={(e) => setReview((x) => ({ ...x, reviewBy: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Where the action leads
                <select className={small} value={review.next} onChange={(e) => setReview((x) => ({ ...x, next: e.target.value as NextStep }))}>
                  <option value="">Nowhere else</option>
                  {(Object.keys(NEXT_STEPS) as (keyof typeof NEXT_STEPS)[]).map((k) => (
                    <option key={k} value={k}>
                      {NEXT_STEPS[k]}
                      {k === "studio" ? " (placeholder)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["evidence", "Evidence (what the figures show, with denominators)"],
                  ["unknowns", "Unknowns (what you couldn’t confirm, and what’s too early to rank)"],
                  ["notes", "Notes (who agreed what)"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                  {label}
                  <textarea className={cx(small, "min-h-16 py-2")} value={review[k]} onChange={(e) => setReview((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-muted">This article doesn’t send follow-up messages. Use your own approved process to contact a referrer.</p>
          </fieldset>
          {r && (
            <ReviewSheet
              title="Relationship Review (private)"
              r={r}
              period={review.period || r.period}
              review={review}
              versions={`${saved ? `${saved.name}, version ${saved.version}` : "unsaved"} · ${MODEL_VERSION}`}
              b={b}
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!saved && (
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review name
                <input className={cx(small, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring cohorts" />
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
              <button type="button" className={secondary} onClick={printReview}>
                <Icon name="print" className="size-4" /> Print or save the review
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

// ---------------------------------------------------------------------------------------------
// The cohort editor: blank stays blank, unknown is a choice, zero is zero
// ---------------------------------------------------------------------------------------------

const errorFor = (errors: InputError[], field: string) => errors.find((e) => e.field === field)?.message;

function NumField({
  label,
  value,
  onChange,
  error,
  unit = "people",
  step = 1,
}: {
  label: string;
  value: Num;
  onChange: (v: Num) => void;
  error?: string;
  unit?: string;
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

/** A figure that can honestly be unknown: a number, blank (an error), or "unknown" (kept out of the arithmetic). */
function AmountField({
  label,
  value,
  onChange,
  error,
  unit = "h",
  step = 0.5,
}: {
  label: string;
  value: Amount;
  onChange: (v: Amount) => void;
  error?: string;
  unit?: string;
  step?: number;
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
          step={step}
          min={0}
          disabled={unknown}
          className={cx(small, error && "border-danger")}
          value={typeof value === "number" ? value : ""}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </label>
      <label className="flex min-h-8 items-center gap-1 font-normal">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-action)]"
          checked={unknown}
          onChange={(e) => onChange(e.target.checked ? "unknown" : null)}
        />
        Unknown or not recorded
      </label>
      {error && <span className="font-normal text-danger">{error}</span>}
    </div>
  );
}

function SettingsEditor({ inputs, errors, onChange }: { inputs: ReferralInputs; errors: InputError[]; onChange: (i: ReferralInputs) => void }) {
  return (
    <fieldset className={box}>
      <legend className="sr-only">Dates and rules</legend>
      <p className={kicker}>Dates and rules</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Figures as of
          <input type="date" className={small} value={inputs.asOf} onChange={(e) => onChange({ ...inputs, asOf: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Continuity observation point
          <select
            className={small}
            value={inputs.observationDays ?? ""}
            onChange={(e) => onChange({ ...inputs, observationDays: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Choose…</option>
            {OBSERVATION.map((d) => (
              <option key={d} value={d}>
                {d} days after the first service
              </option>
            ))}
          </select>
        </label>
        <NumField
          label="Compare cohorts at"
          unit="days after enquiry"
          value={inputs.matureAge}
          onChange={(v) => onChange({ ...inputs, matureAge: v })}
          error={errorFor(errors, "matureAge")}
        />
        <NumField
          label="Smallest sample to rank"
          unit="mature enquiries"
          value={inputs.minSample}
          onChange={(v) => onChange({ ...inputs, minSample: v })}
          error={errorFor(errors, "minSample")}
        />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs font-semibold">Service areas (optional; use wide areas)</p>
        {inputs.areas.map((a, k) => (
          <div key={a.id} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Area {k + 1}
              <input
                className={cx(small, "w-56")}
                value={a.name}
                onChange={(e) => onChange({ ...inputs, areas: inputs.areas.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) })}
              />
            </label>
            <button
              type="button"
              className={secondary}
              onClick={() =>
                onChange({
                  ...inputs,
                  areas: inputs.areas.filter((x) => x.id !== a.id),
                  rows: inputs.rows.map((r) => (r.area === a.id ? { ...r, area: "" } : r)),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() =>
            onChange({
              ...inputs,
              areas: [
                ...inputs.areas,
                {
                  id: nextId(
                    inputs.areas.map((a) => a.id),
                    "area",
                  ),
                  name: "",
                },
              ],
            })
          }
        >
          Add an area
        </button>
      </div>
    </fieldset>
  );
}

function nextId(used: string[], prefix: string) {
  for (let k = used.length + 1; ; k += 1) if (!used.includes(`${prefix}-${k}`)) return `${prefix}-${k}`;
}

function RowsEditor({ inputs, errors, onChange }: { inputs: ReferralInputs; errors: InputError[]; onChange: (i: ReferralInputs) => void }) {
  const setRow = (id: string, fn: (r: CohortRow) => CohortRow) => onChange({ ...inputs, rows: inputs.rows.map((r) => (r.id === id ? fn(r) : r)) });
  return (
    <div className="flex flex-col gap-3">
      <p className={kicker}>Cohorts: one row per source and enquiry month</p>
      {inputs.rows.map((row, k) => (
        <RowEditor
          key={row.id}
          row={row}
          index={k}
          inputs={inputs}
          errors={errors}
          onChange={(fn) => setRow(row.id, fn)}
          onRemove={inputs.rows.length > 1 ? () => onChange({ ...inputs, rows: inputs.rows.filter((r) => r.id !== row.id) }) : undefined}
        />
      ))}
      <button
        type="button"
        className={cx(secondary, "self-start")}
        onClick={() =>
          onChange({
            ...inputs,
            rows: [
              ...inputs.rows,
              blankRow(
                nextId(
                  inputs.rows.map((r) => r.id),
                  "row",
                ),
                inputs.asOf.slice(0, 7),
              ),
            ],
          })
        }
      >
        Add a cohort row
      </button>
    </div>
  );
}

function RowEditor({
  row,
  index,
  inputs,
  errors,
  onChange,
  onRemove,
}: {
  row: CohortRow;
  index: number;
  inputs: ReferralInputs;
  errors: InputError[];
  onChange: (fn: (r: CohortRow) => CohortRow) => void;
  onRemove?: () => void;
}) {
  const e = (x: string) => errorFor(errors, `row.${row.id}.${x}`);
  const num = (k: "enquiries" | "introduced" | "pathway" | "agreed" | "started" | "open" | "closed" | "matureStarts" | "active", label: string) => (
    <NumField label={label} value={row[k]} onChange={(v) => onChange((r) => ({ ...r, [k]: v }))} error={e(k)} />
  );
  const setEffort = (k: keyof Effort, v: Amount | boolean) => onChange((r) => ({ ...r, effort: { ...r.effort, [k]: v } }));
  const rowErrors = errors.filter((x) => x.field.startsWith(`row.${row.id}.`)).length;
  return (
    <details className={box} open={index === 0}>
      <summary className="min-h-11 cursor-pointer font-semibold">
        {row.label || SOURCES[row.source]}, {monthLabel(row.month)}
        {row.area ? `, ${areaName(inputs, row.area)}` : ""} {rowErrors ? `· ${rowErrors} to fix` : "· complete"}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-1 text-xs font-semibold">Source and cohort</legend>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Source
            <select className={small} value={row.source} onChange={(ev) => onChange((r) => ({ ...r, source: ev.target.value as Source }))}>
              {SOURCE_ORDER.map((x) => (
                <option key={x} value={x} title={SOURCE_HINTS[x]}>
                  {SOURCES[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Month enquiries arrived
            <input
              type="month"
              className={cx(small, e("month") && "border-danger")}
              value={row.month}
              onChange={(ev) => onChange((r) => ({ ...r, month: ev.target.value }))}
            />
          </label>
          {inputs.areas.length > 0 && (
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Area
              <select className={small} value={row.area} onChange={(ev) => onChange((r) => ({ ...r, area: ev.target.value }))}>
                <option value="">Not recorded</option>
                {inputs.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || "Unnamed area"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Private label (optional)
            <input
              className={small}
              value={row.label}
              placeholder="GP practice A"
              onChange={(ev) => onChange((r) => ({ ...r, label: ev.target.value.slice(0, 60) }))}
            />
          </label>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-1 text-xs font-semibold">Progress of this cohort (the same people at every step)</legend>
          {num("enquiries", "Distinct enquiries")}
          {num("introduced", "Authorised introductions")}
          {num("pathway", "Suitable pathway")}
          {num("agreed", "Agreements")}
          {num("started", "First services")}
          {num("open", "Still open")}
          {num("closed", "Closed without starting")}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-semibold">Stage at first contact (unknown included; never inferred from the source)</legend>
          {STAGE_ORDER.map((st) => (
            <NumField
              key={st}
              label={STAGES[st]}
              value={row.stages[st]}
              onChange={(v) => onChange((r) => ({ ...r, stages: { ...r.stages, [st]: v } }))}
              error={e(`stages.${st}`)}
            />
          ))}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-semibold">First services by stage at first contact (for stage-matched rates)</legend>
          {STAGE_ORDER.map((st) => (
            <AmountField
              key={st}
              label={STAGES[st]}
              unit="people"
              step={1}
              value={row.startsByStage[st]}
              onChange={(v) => onChange((r) => ({ ...r, startsByStage: { ...r.startsByStage, [st]: v } }))}
              error={e(`startsByStage.${st}`)}
            />
          ))}
        </fieldset>
        <ReasonList
          legend="Closed without starting, by broad reason"
          order={CLOSE_ORDER}
          labels={CLOSE_REASONS}
          items={row.closedReasons}
          onChange={(closedReasons) => onChange((r) => ({ ...r, closedReasons }))}
          error={e("closedReasons.0")}
        />
        <fieldset className="grid gap-3 sm:grid-cols-5">
          <legend className="mb-1 text-xs font-semibold">
            Days from enquiry to first service, for those who started (bands: no exact median is made from these)
          </legend>
          {BAND_ORDER.map((k) => (
            <NumField
              key={k}
              label={BANDS[k]}
              value={row.bands[k]}
              onChange={(v) => onChange((r) => ({ ...r, bands: { ...r.bands, [k]: v } }))}
              error={e(`bands.${k}`)}
            />
          ))}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-semibold">Continuity at {inputs.observationDays ?? "the observation"} days</legend>
          {num("matureStarts", "Starts old enough to count")}
          {num("active", "Still active at that point")}
        </fieldset>
        <ReasonList
          legend="Not active at the observation point, by broad reason"
          order={EXIT_ORDER}
          labels={EXIT_REASONS}
          items={row.exits}
          onChange={(exits) => onChange((r) => ({ ...r, exits }))}
          error={e("exits.0")}
        />
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-semibold">Effort for this cohort (relationship work and case onboarding are kept apart)</legend>
          {PART_ORDER.map((p) => (
            <AmountField key={p} label={RELATIONSHIP_PARTS[p]} value={row.effort[p]} onChange={(v) => setEffort(p, v)} error={e(`effort.${p}`)} />
          ))}
          <AmountField label="Case onboarding" value={row.effort.onboarding} onChange={(v) => setEffort("onboarding", v)} error={e("effort.onboarding")} />
          <AmountField
            label="Direct costs, if you choose"
            unit="$"
            step={1}
            value={row.effort.costs}
            onChange={(v) => setEffort("costs", v)}
            error={e("effort.costs")}
          />
          <label className="flex min-h-10 items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-action)]"
              checked={row.effort.observed}
              onChange={(ev) => setEffort("observed", ev.target.checked)}
            />
            Observed time (a diary or timesheet), not an estimate
          </label>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-semibold">Data quality</legend>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Source of the figures
            <select className={small} value={row.method} onChange={(ev) => onChange((r) => ({ ...r, method: ev.target.value as CohortRow["method"] }))}>
              <option value="manual">Entered by hand</option>
              <option value="verified">Checked against the CRM or Portal</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Extracted on
            <input type="date" className={small} value={row.extractedOn} onChange={(ev) => onChange((r) => ({ ...r, extractedOn: ev.target.value }))} />
          </label>
          <AmountField
            label="Possible duplicates"
            unit="people"
            step={1}
            value={row.duplicates}
            onChange={(v) => onChange((r) => ({ ...r, duplicates: v }))}
            error={e("duplicates")}
          />
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondary} onClick={() => onChange((r) => zeroBlanks(r))}>
            Set this row’s blanks to 0
          </button>
          {onRemove && (
            <button type="button" className={secondary} onClick={onRemove}>
              Remove this row
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function ReasonList<R extends string>({
  legend,
  order,
  labels,
  items,
  onChange,
  error,
}: {
  legend: string;
  order: R[];
  labels: Record<R, string>;
  items: { reason: R; count: Num }[];
  onChange: (x: { reason: R; count: Num }[]) => void;
  error?: string;
}) {
  const unused = order.filter((x) => !items.some((y) => y.reason === x));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold">{legend}</legend>
      {items.map((it) => (
        <div key={it.reason} className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <NumField
              label={labels[it.reason]}
              value={it.count}
              onChange={(v) => onChange(items.map((y) => (y.reason === it.reason ? { ...y, count: v } : y)))}
            />
          </div>
          <button type="button" className={secondary} onClick={() => onChange(items.filter((y) => y.reason !== it.reason))}>
            Remove
          </button>
        </div>
      ))}
      {unused.length > 0 && (
        <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold">
          Add a reason
          <select
            className={small}
            value=""
            onChange={(ev) => {
              if (ev.target.value) onChange([...items, { reason: ev.target.value as R, count: null }]);
            }}
          >
            <option value="">Choose…</option>
            {unused.map((x) => (
              <option key={x} value={x}>
                {labels[x]}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
      <p className="text-xs text-ink-muted">Any not given a reason are shown as “reason not recorded”.</p>
    </fieldset>
  );
}
