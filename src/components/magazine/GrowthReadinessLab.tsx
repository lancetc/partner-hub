"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { IntakeBlock } from "@/lib/magazine";
import {
  applyChange,
  blankInputs,
  calculate,
  fitToMonth,
  inputChanges,
  MODEL_VERSION,
  nextMonth,
  OVERALL,
  resultChanges,
  STAGE_HINTS,
  STAGES,
  START_LABEL,
  SUPPLY_STATUS,
  validateInputs,
  weeksOf,
  type InputError,
  type IntakeInputs,
  type IntakeResult,
  type Num,
  type OverallState,
  type ServiceCheck,
  type Stage,
  type StartStatus,
  type SupplyStatus,
} from "@/lib/growthReadiness";
import { buildDebrief, currentInputs, emptyState, finishProblems, LEVELS, STEPS, type IntakeDebrief, type IntakeState } from "@/lib/growthLab";
import type { IntakeView } from "@/server/growthReadiness";
import { Icon } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Can we take on the next 10 clients?" (docs/growth-readiness.md). A feature-article decision, not a bare calculator:
  the Monday call, a prediction, the month mapped week by week, service coverage, a change to try, then an action and
  an honest message, and a Decision Sheet to keep. The figures come from the shared model (lib/growthReadiness); the
  debrief comes from the server once the decision is in. Status is always in words as well as colour; the chart has a
  table; every slider has a number field; nothing animates figures or times the reader.

  "Use my business" appears only for a business owner and the members they've authorised (the server decides). It
  starts blank, never with the story's figures, saves only when asked, and keeps unsaved entries in this page alone.

  In the editor's preview it runs against the block as written, locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";
const small = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const TONE: Record<"good" | "warn" | "bad", string> = {
  good: "bg-[#dff3ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
  warn: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  bad: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
const STATE_TONE: Record<OverallState, keyof typeof TONE> = { available: "good", confirm: "warn", gap: "bad" };
const START_TONE: Record<StartStatus, string> = { supported: TONE.good, confirm: TONE.warn, constrained: TONE.bad, enquiry: "bg-muted text-ink-muted" };
const CHECK_LABEL: Record<ServiceCheck["state"], string> = { covered: "Covered", confirm: "Needs confirmation", gap: "Gap" };
const CHECK_TONE: Record<ServiceCheck["state"], string> = { covered: TONE.good, confirm: TONE.warn, gap: TONE.bad };
const FICTIONAL =
  "Fictional case: Priya, her business, the clients, the suppliers and every figure are invented for practice. They aren’t Trilogy Care pricing, staffing norms, a clients-per-coordinator cap or an intake decision.";
const checkKey = (c: ServiceCheck) => `${c.key}#${c.week}`;

export function GrowthReadinessLab({ block: b, ctx }: { block: IntakeBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/intake");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canPlan = Boolean(business.data?.access);
  return (
    <section aria-label={`Growth readiness: ${b.title}`} className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="gauge" className="size-5" /> Growth readiness
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-ink">
          {mode === "story" ? `Fictional case · ${b.storyVersion}` : "Your business · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canPlan && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with the story"],
              ["business", "Use my business"],
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
      {mode === "story" ? <Practice b={b} ctx={ctx} /> : <BusinessPlanner orgName={business.data?.access?.orgName ?? ""} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practice with the story
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: IntakeBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/intake`;
  const loaded = useApi<IntakeView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<IntakeState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<IntakeDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [view, setView] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);

  const take = (v: IntakeView) => {
    setS(v.state);
    setDebrief(v.debrief);
    setAttemptNo(v.attemptNo);
    setView(Math.min(v.state.stage, 6));
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

  const base = useMemo(() => calculate(b.inputs), [b.inputs]);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s) return <p className="mt-4 text-ink-muted">Loading…</p>;

  const change = (fn: (prev: IntakeState) => IntakeState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  const go = (step: number) => {
    setView(step);
    if (step > s.stage) change((p) => ({ ...p, stage: Math.max(p.stage, step) }));
    requestAnimationFrame(() => top.current?.focus());
  };
  const send = async (body: Record<string, unknown>, local: () => IntakeState) => {
    setProblem(null);
    if (ctx.preview) {
      const next = local();
      setS(next);
      if (next.stage === 6) setDebrief(buildDebrief(b, next, MODEL_VERSION));
      return next;
    }
    setBusy(true);
    try {
      dirty.current = false;
      const v = await api<IntakeView>(url, { body: { blockId: b.id, ...body } });
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

  const mine = currentInputs(b, s);
  const finished = s.stage === 6 && debrief;
  const shown = finished ? view : Math.min(view, 5);

  return (
    <div className="mt-3">
      <p className="rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{FICTIONAL}</p>
      <ol aria-label="Where you are" className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {STEPS.map((label, i) => {
          const reachable = i <= s.stage && (i < 6 || Boolean(finished));
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
        {shown === 0 && <Story b={b} onNext={() => go(1)} />}
        {shown === 1 && (
          <Prediction
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (count, checks) => {
              const next = await send({ action: "predict", prediction: { count, checks } }, () => ({
                ...s,
                prediction: { count, checks },
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
              Here’s Priya’s month, week by week. <strong>Open a week</strong> to see what fills it. You can change any assumption below; every figure says
              where it comes from.
            </p>
            <Planner
              inputs={mine}
              base={b.inputs}
              source="Fictional example"
              opened={s.weeks}
              onOpenWeek={(w) => change((p) => ({ ...p, weeks: p.weeks.includes(w) ? p.weeks : [...p.weeks, w] }))}
              onEdit={(next) => change((p) => ({ ...p, inputs: next, edited: true }))}
              section="map"
            />
            <Next disabled={!s.weeks.length} hint="Open at least one week first." onClick={() => go(3)} label="Check service coverage" />
          </div>
        )}
        {shown === 3 && (
          <div className="flex flex-col gap-4">
            <p>
              Hours are one constraint; workers are another. Each service a start needs is matched to <strong>confirmed, current, spare</strong> slots for the
              same service, area and time of day. <strong>Open a gap or an unknown</strong> to see why it isn’t covered.
            </p>
            <Coverage
              result={safeCalc(mine) ?? base}
              onOpen={(k) => change((p) => ({ ...p, services: p.services.includes(k) ? p.services : [...p.services, k] }))}
            />
            <Next disabled={!s.services.length} hint="Open at least one gap or unknown first." onClick={() => go(4)} label="Try a change" />
          </div>
        )}
        {shown === 4 && (
          <TryChange
            b={b}
            s={s}
            mine={mine}
            onToggle={(id) =>
              change((p) => {
                const on = !p.applied.includes(id);
                const applied = on ? [...p.applied, id] : p.applied.filter((x) => x !== id);
                // Without edits of their own, the figures are the case plus the changes applied (worked out each time).
                // With edits, a change goes on top of them; taking one off goes back to the case plus the rest.
                const c = b.changes.find((x) => x.id === id)!;
                const inputs = p.inputs && on ? applyChange(p.inputs, c.change) : null;
                return { ...p, applied, inputs };
              })
            }
            onReset={() => change((p) => ({ ...p, applied: [], inputs: null }))}
            onNext={() => go(5)}
          />
        )}
        {shown === 5 && !finished && (
          <Decide
            b={b}
            s={s}
            busy={busy}
            onPick={(k, v) => change((p) => ({ ...p, [k]: v }))}
            onFinish={async () => {
              justFinished.current = true;
              const next = await send({ action: "finish", decision: s.decision, message: s.message }, () => ({ ...s, stage: 6 }));
              if (next?.stage === 6) go(6);
            }}
          />
        )}
        {shown >= 5 && finished && debrief && (
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
                setView(0);
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

const safeCalc = (i: IntakeInputs) => (validateInputs(i).length ? null : calculate(i));

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

function Story({ b, onNext }: { b: IntakeBlock; onNext: () => void }) {
  const st = b.story;
  return (
    <div className="flex flex-col gap-4">
      <div className={cx(box, "flex flex-col gap-3 sm:flex-row sm:items-start")}>
        {st.character && <CharacterPortrait name={st.character} size="lg" />}
        <div className="min-w-0">
          <p className={kicker}>{st.role || "The story"}</p>
          <p className="mt-1">{st.situation}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[st.voice, st.concern]
          .filter((q) => q.text)
          .map((q) => (
            <figure key={q.who} className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
              <blockquote className="font-serif text-lg italic">“{q.text}”</blockquote>
              <figcaption className="mt-2 text-sm text-ink-muted">{q.who}</figcaption>
            </figure>
          ))}
      </div>
      <div className={box}>
        <p className={kicker}>The referral list for {monthName(b.inputs.month)}</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {b.inputs.starts.map((x) => (
            <li key={x.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <p className="font-semibold">
                {x.label} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{STAGES[x.stage]}</span>
              </p>
              <p className="text-sm text-ink-muted">
                Week {x.week + 1}
                {x.note ? ` · ${x.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </div>
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
  b: IntakeBlock;
  s: IntakeState;
  busy: boolean;
  onSubmit: (count: number, checks: string[]) => void;
  onNext: () => void;
}) {
  const done = s.prediction;
  const [count, setCount] = useState<Num>(done?.count ?? null);
  const [checks, setChecks] = useState<string[]>(done?.checks ?? []);
  const max = b.inputs.starts.length;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (count !== null) onSubmit(count, checks);
      }}
    >
      <p className="text-lg">{b.prediction.prompt}</p>
      <label className="flex max-w-xs flex-col gap-1 font-semibold">
        Starts Priya could confirm today (0–{max})
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          className={field}
          value={count ?? ""}
          disabled={Boolean(done)}
          onChange={(e) => setCount(e.target.value === "" ? null : Math.max(0, Math.min(max, Math.round(Number(e.target.value)))))}
        />
      </label>
      <fieldset className="flex flex-col gap-2" disabled={Boolean(done)}>
        <legend className="font-semibold">What would you check before confirming any of them?</legend>
        {b.prediction.checks.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-action)]"
              checked={checks.includes(c.id)}
              onChange={(e) => setChecks((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))}
            />
            {c.text}
          </label>
        ))}
      </fieldset>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Your prediction is in. You’ll compare it with what the model shows at the end; it isn’t marked on the number.
          </p>
          <Next onClick={onNext} label="Map the month" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primary} disabled={busy || count === null}>
            Lock in my prediction
          </button>
          <span className="text-sm text-ink-muted">You can’t change it afterwards. A guess is fine: it’s about what you’d need to know.</span>
        </div>
      )}
    </form>
  );
}

function TryChange({
  b,
  s,
  mine,
  onToggle,
  onReset,
  onNext,
}: {
  b: IntakeBlock;
  s: IntakeState;
  mine: IntakeInputs;
  onToggle: (id: string) => void;
  onReset: () => void;
  onNext: () => void;
}) {
  const before = calculate(b.inputs);
  const now = safeCalc(mine);
  const inputs = inputChanges(b.inputs, mine);
  const results = now ? resultChanges(before, now) : [];
  return (
    <div className="flex flex-col gap-4">
      <p>
        Try one or more of these, or change any figure yourself in the map. Each is something Priya could realistically do. Moving a start is a conversation
        with that person, not something the model decides.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {b.changes.map((c) => {
          const on = s.applied.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(c.id)}
                className={cx(
                  "flex h-full w-full flex-col gap-1 rounded-2xl p-4 text-left ring-1",
                  on ? "bg-tealtint ring-[#008282]" : "bg-bg ring-line hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icon name={on ? "check" : "plus"} className="size-4" /> {c.label}
                </span>
                <span className="text-sm text-ink-muted">{c.detail}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={box}>
          <p className={kicker}>What you changed</p>
          {inputs.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {inputs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Nothing yet: this is the case as Priya has it.</p>
          )}
        </div>
        <div className={box}>
          <p className={kicker}>What it did</p>
          {results.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {results.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              {now ? "No change to the result yet." : "Some figures are blank, so there’s no new result to compare."}
            </p>
          )}
        </div>
      </div>
      {now && <Summary r={now} />}
      <div className="flex flex-wrap gap-3">
        {(s.applied.length > 0 || s.inputs) && (
          <button type="button" className={secondary} onClick={onReset}>
            Back to the case as it was
          </button>
        )}
        <Next disabled={!s.applied.length && !s.edited} hint="Try at least one change first." onClick={onNext} label="Decide and tell people" />
      </div>
    </div>
  );
}

function Decide({
  b,
  s,
  busy,
  onPick,
  onFinish,
}: {
  b: IntakeBlock;
  s: IntakeState;
  busy: boolean;
  onPick: (k: "decision" | "message", v: string) => void;
  onFinish: () => void;
}) {
  const left = finishProblems(b, s);
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">What will Priya do next?</legend>
        {b.decisions.map((o) => (
          <label
            key={o.id}
            className={cx("flex gap-3 rounded-2xl p-3 ring-1", s.decision === o.id ? "bg-tealtint ring-[#008282]" : "ring-line hover:bg-muted")}
          >
            <input
              type="radio"
              name={`${b.id}-decision`}
              className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
              checked={s.decision === o.id}
              onChange={() => onPick("decision", o.id)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Which message will she send today?</legend>
        {b.messages.map((o) => (
          <label key={o.id} className={cx("flex gap-3 rounded-2xl p-3 ring-1", s.message === o.id ? "bg-tealtint ring-[#008282]" : "ring-line hover:bg-muted")}>
            <input
              type="radio"
              name={`${b.id}-message`}
              className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
              checked={s.message === o.id}
              onChange={() => onPick("message", o.id)}
            />
            <span>
              <span className="block text-xs font-bold uppercase tracking-wide text-ink-muted">To {o.to}</span>“{o.text}”
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-ink-muted">
        If someone has an immediate safety or clinical need, the calculator isn’t the route: use Trilogy Care’s current escalation and continuity process.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || left.length > 0} onClick={onFinish}>
          Send it and see what happens
        </button>
        {left.length > 0 && <span className="text-sm text-ink-muted">{left[0]}</span>}
      </div>
    </div>
  );
}

function Debrief({
  b,
  s,
  d,
  busy,
  onPrint,
  onRetry,
}: {
  b: IntakeBlock;
  s: IntakeState;
  d: IntakeDebrief;
  busy: boolean;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const mine = currentInputs(b, s);
  const r = safeCalc(mine) ?? calculate(b.inputs);
  return (
    <div className="flex flex-col gap-5">
      <div className={box}>
        <p className={kicker}>What happened next</p>
        <p className="mt-2 text-lg">{d.message.outcome}</p>
      </div>
      {d.flags.length > 0 && (
        <div role="alert" className={cx("rounded-2xl p-4", TONE.bad)}>
          <p className="font-semibold">Before anything else: {d.flags.length === 1 ? "one thing to fix" : `${d.flags.length} things to fix`}</p>
          <ul className="mt-1 list-disc pl-5">
            {d.flags.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
          <p className="mt-1 text-sm">A good total doesn’t outweigh these. Try another route to see the difference.</p>
        </div>
      )}
      <div>
        <p className={kicker}>How you did</p>
        <p className="mt-1 text-sm text-ink-muted">
          {d.score} of {d.max} on the rubric. It never counts how many starts you took on or predicted: a bigger intake isn’t a better answer.
        </p>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {d.dims.map((x) => (
            <li key={x.dim} className={box}>
              <p className="flex items-center justify-between gap-2 font-semibold">
                {x.label} <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{LEVELS[x.rating]}</span>
              </p>
              <p className="mt-1 text-sm">{x.why}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={box}>
          <p className={kicker}>Your prediction</p>
          <p className="mt-1">
            You said {d.prediction.count ?? "nothing"}. With the case as Priya had it, {d.before.supported} of {d.before.proposed} proposed starts had modelled
            capacity; with your changes, {d.after.supported}.
          </p>
          {d.prediction.missed.length > 0 && <p className="mt-2 text-sm">Checks worth adding: {d.prediction.missed.join("; ")}.</p>}
          {d.prediction.extra.length > 0 && (
            <p className="mt-2 text-sm">These don’t tell you whether a start can be supported: {d.prediction.extra.join("; ")}.</p>
          )}
        </div>
        <div className={box}>
          <p className={kicker}>The case</p>
          <p className="mt-1 text-sm">{d.summary}</p>
        </div>
      </div>
      {b.links.length > 0 && (
        <div>
          <p className={kicker}>Where to go next</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {b.links.map((l) => (
              <li key={l.href} className={box}>
                <Link href={l.href} className="font-semibold text-accent underline underline-offset-2">
                  {l.label}
                </Link>
                <p className="mt-1 text-sm">{l.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DecisionSheet
        title="Decision Sheet (learning summary)"
        month={mine.month}
        inputs={mine}
        r={r}
        source="Fictional example"
        versions={`Case ${b.storyVersion} · ${d.versions.model} · rubric ${d.versions.rubric}`}
        actions={[{ action: d.decision.text, owner: "Priya", due: "", status: "open" }]}
        message={`To ${d.message.to}: “${d.message.text}”`}
        reviewBy=""
        sources={b.sources}
      />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the sheet
        </button>
        <button type="button" className={primary} disabled={busy} onClick={onRetry}>
          Try another route
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab} · case {d.versions.story} · {d.versions.model} · {d.versions.rubric}. Your first attempt is kept when you try again.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The planner: inputs, the month and the result (shared by the story and "Use my business")
// ---------------------------------------------------------------------------------------------

function Planner({
  inputs,
  base,
  source,
  opened,
  onOpenWeek,
  onEdit,
  section = "all",
}: {
  inputs: IntakeInputs;
  base: IntakeInputs;
  source: string;
  opened: number[];
  onOpenWeek: (w: number) => void;
  onEdit: (next: IntakeInputs) => void;
  section?: "map" | "all";
}) {
  const errors = validateInputs(inputs);
  // The last valid result stays, labelled, while a field is blank or out of range.
  const [lastGood, setLastGood] = useState<IntakeInputs | null>(errors.length ? null : inputs);
  if (!errors.length && lastGood !== inputs) setLastGood(inputs);
  const r = errors.length ? null : calculate(inputs);
  const fallback = lastGood ?? (validateInputs(base).length ? null : base);
  const shown = r ?? (fallback ? calculate(fallback) : null);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {shown ? <WeekChart r={shown} opened={opened} onOpen={onOpenWeek} /> : <p className="text-ink-muted">Enter the figures below to see the month.</p>}
        <details className={box} open={section === "all"}>
          <summary className="min-h-11 cursor-pointer font-semibold">Edit the assumptions</summary>
          <InputsEditor inputs={inputs} errors={errors} source={source} onEdit={onEdit} />
        </details>
      </div>
      <aside className="order-first xl:order-none xl:sticky xl:top-24 xl:self-start" aria-label="Result">
        {errors.length > 0 && (
          <div role="status" className={cx("mb-3 rounded-2xl p-3 text-sm", TONE.warn)}>
            <p className="font-semibold">{shown ? "Showing the last valid result." : "No result yet."} Fix these first:</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.slice(0, 5).map((e) => (
                <li key={e.field}>{e.message}</li>
              ))}
              {errors.length > 5 && <li>and {errors.length - 5} more</li>}
            </ul>
          </div>
        )}
        {shown && <Summary r={shown} stale={!r} />}
      </aside>
    </div>
  );
}

function Summary({ r, stale = false }: { r: IntakeResult; stale?: boolean }) {
  return (
    <div className={cx("rounded-2xl p-4 ring-1 ring-line", stale && "opacity-70")}>
      <p className={cx("rounded-xl px-3 py-2 font-semibold", TONE[STATE_TONE[r.state]])}>{OVERALL[r.state].label}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["Proposed starts", r.proposed],
            ["Modelled capacity", r.supported],
            ["Constrained", r.constrained],
            ["Needs confirmation", r.confirm],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-bg p-2 ring-1 ring-line">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-serif text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {r.enquiries > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          Plus {r.enquiries} {r.enquiries === 1 ? "enquiry" : "enquiries"}, kept out of the forecast.
        </p>
      )}
      {r.findings.length > 0 && (
        <>
          <p className={cx(kicker, "mt-3")}>What matters most</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {r.findings.slice(0, 4).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-ink-muted">A planning signal, not an approval or a promise. Model {r.modelVersion}.</p>
    </div>
  );
}

function WeekChart({ r, opened, onOpen }: { r: IntakeResult; opened: number[]; onOpen: (w: number) => void }) {
  const max = Math.max(1, ...r.weeks.map((w) => Math.max(w.required, w.available)));
  return (
    <figure className={box}>
      <figcaption className="font-semibold">Coordinator hours, week by week: needed against available after the reserve</figcaption>
      <div aria-hidden className="mt-3 flex flex-col gap-3">
        {r.weeks.map((w) => (
          <div key={w.week.index} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
            <span className="font-semibold">
              Week {w.week.index + 1}
              {w.week.partial ? " (part)" : ""}
            </span>
            <span className="flex flex-col gap-1">
              <span className="block h-3 rounded-full bg-[#9fb3c8]" style={{ width: `${(w.available / max) * 100}%` }} />
              <span
                className={cx("block h-3 rounded-full", w.headroom < 0 ? "bg-[#c0392b]" : "bg-[#008282]")}
                style={{ width: `${(w.required / max) * 100}%` }}
              />
            </span>
          </div>
        ))}
        <p className="flex flex-wrap gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-full bg-[#9fb3c8]" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-full bg-[#008282]" /> Needed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-full bg-[#c0392b]" /> Needed, over what’s available
          </span>
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Coordinator hours by week</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-semibold">
                Week
              </th>
              <th scope="col" className="px-2 font-semibold">
                Available
              </th>
              <th scope="col" className="px-2 font-semibold">
                Needed
              </th>
              <th scope="col" className="px-2 font-semibold">
                Headroom
              </th>
              <th scope="col" className="px-2 font-semibold">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {r.weeks.map((w) => {
              const open = opened.includes(w.week.index);
              return <WeekRow key={w.week.index} w={w} open={open} onOpen={() => onOpen(w.week.index)} />;
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function WeekRow({ w, open, onOpen }: { w: IntakeResult["weeks"][number]; open: boolean; onOpen: () => void }) {
  const [show, setShow] = useState(false);
  const visible = show && open;
  return (
    <>
      <tr className="border-b border-line">
        <th scope="row" className="py-2 pr-2 font-semibold">
          {w.week.label}
          {w.week.partial && <span className="block text-xs font-normal text-ink-muted">{w.week.weekdays} weekdays in the month</span>}
        </th>
        <td className="px-2">{w.available} h</td>
        <td className="px-2">{w.required} h</td>
        <td className="px-2">
          <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", w.headroom < 0 ? TONE.bad : TONE.good)}>
            {w.headroom < 0 ? `Short ${-w.headroom} h` : `${w.headroom} h spare`}
          </span>
        </td>
        <td className="px-2 text-right">
          <button
            type="button"
            aria-expanded={visible}
            className="min-h-10 rounded-full px-3 font-semibold text-accent hover:bg-muted"
            onClick={() => {
              onOpen();
              setShow((x) => !x);
            }}
          >
            {visible ? "Close" : "Open"}
          </button>
        </td>
      </tr>
      {visible && (
        <tr className="border-b border-line bg-bg">
          <td colSpan={5} className="p-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {(
                [
                  ["Working hours", w.working],
                  ["Leave and unavailability", -w.leave],
                  ["Non-client duties (on days worked)", -w.nonClient],
                  ["Reserve", -w.reserve],
                  ["Temporary cover", w.cover],
                  ["= Available", w.available],
                  ["Existing clients", w.existing],
                  ["Exceptional work", w.exceptional],
                  [`Setup for ${w.startsHere.length} ${w.startsHere.length === 1 ? "start" : "starts"}`, w.setup],
                  ["First-month follow-up", w.followUp],
                  ["= Needed", w.required],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className={cx("flex justify-between gap-3", k.startsWith("=") && "font-semibold")}>
                  <dt>{k}</dt>
                  <dd className="whitespace-nowrap">{Math.round(v * 10) / 10} h</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function Coverage({ result: r, onOpen }: { result: IntakeResult; onOpen: (k: string) => void }) {
  const [show, setShow] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className={box}>
        <p className={kicker}>Service slots needed against confirmed spare supply</p>
        <ul className="mt-2 flex flex-col gap-2">
          {r.services.map((c) => {
            const k = checkKey(c);
            const open = show === k;
            return (
              <li key={k} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0">
                    <span className="font-semibold">
                      {c.service} · {c.window}
                    </span>{" "}
                    <span className="text-sm text-ink-muted">
                      {c.capability} · {c.area} · Week {c.week + 1}
                    </span>
                  </p>
                  <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", CHECK_TONE[c.state])}>
                    {CHECK_LABEL[c.state]}: {c.required} needed, {c.confirmed} confirmed
                  </span>
                </div>
                {(c.state !== "covered" || c.notes.length > 0) && (
                  <button
                    type="button"
                    aria-expanded={open}
                    className="mt-1 min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted"
                    onClick={() => {
                      onOpen(k);
                      setShow(open ? null : k);
                    }}
                  >
                    {open ? "Close" : c.state === "covered" ? "Details" : "Why?"}
                  </button>
                )}
                {open && (
                  <div className="mt-1 text-sm">
                    {c.shortfall === 0 ? (
                      <p>Covered by confirmed, current slots. Anything listed below wasn’t counted.</p>
                    ) : (
                      <p>
                        Short by {c.shortfall} {c.shortfall === 1 ? "slot" : "slots"}.{" "}
                        {c.unconfirmed > 0 ? `${c.unconfirmed} more could be confirmed: they don’t count until they are.` : "Nothing else is offered for it."}
                      </p>
                    )}
                    {c.notes.length > 0 && (
                      <ul className="mt-1 list-disc pl-5">
                        {c.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-ink-muted">{c.verifiedOn ? `Latest verification: ${c.verifiedOn}.` : "Never verified."}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className={box}>
        <p className={kicker}>Each start, in the order set</p>
        <ul className="mt-2 flex flex-col gap-2">
          {r.starts.map((x) => (
            <li key={x.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {x.label} <span className="text-sm font-normal text-ink-muted">Week {x.week + 1}</span>
                <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", START_TONE[x.status])}>{START_LABEL[x.status]}</span>
              </p>
              {x.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {x.reasons.map((y) => (
                    <li key={y}>{y}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">Read in the order you set: never by revenue, funding or ease. The model never refuses or moves anyone.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Editing the inputs
// ---------------------------------------------------------------------------------------------

function NumField({
  label,
  value,
  onChange,
  error,
  unit,
  step = 0.5,
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

/** A slider with its own number field: either can be used. */
function SliderField({
  label,
  value,
  onChange,
  max,
  unit,
  error,
}: {
  label: string;
  value: Num;
  onChange: (v: Num) => void;
  max: number;
  unit: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-semibold">
      <span>
        {label}{" "}
        <span className="font-normal text-ink-muted">
          ({unit}, 0–{max})
        </span>
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          className="w-full accent-[var(--color-action)]"
          value={value ?? 0}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={0}
          max={max}
          className={cx(small, "w-20", error && "border-danger")}
          value={value ?? ""}
          aria-label={`${label}, number`}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </div>
      {error && <span className="font-normal text-danger">{error}</span>}
    </div>
  );
}

function InputsEditor({
  inputs: i,
  errors,
  source,
  onEdit,
}: {
  inputs: IntakeInputs;
  errors: InputError[];
  source: string;
  onEdit: (next: IntakeInputs) => void;
}) {
  const weeks = weeksOf(i.month);
  const err = (f: string) => errors.find((e) => e.field === f)?.message;
  const set = (fn: (x: IntakeInputs) => void) => {
    const x = structuredClone(i);
    fn(x);
    onEdit(x);
  };
  const tag = <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">{source}</span>;
  const group = "mt-4 flex flex-col gap-2";
  return (
    <div className="mt-2">
      <section className={group}>
        <h5 className="font-semibold">The month and the reserve {tag}</h5>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Month
            <input type="month" className={small} value={i.month} onChange={(e) => e.target.value && onEdit(fitToMonth(i, e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Figures as of
            <input type="date" className={small} value={i.asOf} onChange={(e) => set((x) => void (x.asOf = e.target.value))} />
          </label>
          <SliderField
            label="Reserve"
            unit="% of net hours"
            max={50}
            value={i.reservePct}
            error={err("reservePct")}
            onChange={(v) => set((x) => void (x.reservePct = v))}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {weeks.map((w) => w.label + (w.partial ? ` (${w.weekdays} weekdays)` : "")).join(" · ")}. Supply verified more than {i.staleDays} days before the “as
          of” date doesn’t count.
        </p>
      </section>

      <section className={group}>
        <h5 className="font-semibold">Coordinators {tag}</h5>
        {i.coordinators.map((c, k) => (
          <div key={c.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Name or role
                <input className={small} value={c.name} onChange={(e) => set((x) => void (x.coordinators[k].name = e.target.value))} />
              </label>
              <NumField
                label="Working hours"
                unit="h/full week"
                value={c.hoursPerWeek}
                error={err(`coord.${c.id}.hoursPerWeek`)}
                onChange={(v) => set((x) => void (x.coordinators[k].hoursPerWeek = v))}
              />
              <NumField
                label="Non-client duties"
                unit="h/full week"
                value={c.nonClientPerWeek}
                error={err(`coord.${c.id}.nonClientPerWeek`)}
                onChange={(v) => set((x) => void (x.coordinators[k].nonClientPerWeek = v))}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              {weeks.map((w) => (
                <NumField
                  key={w.index}
                  label={`Leave, Wk ${w.index + 1}`}
                  unit="h"
                  value={c.leave[w.index] ?? null}
                  error={err(`coord.${c.id}.leave.${w.index}`)}
                  onChange={(v) => set((x) => void (x.coordinators[k].leave[w.index] = v))}
                />
              ))}
            </div>
            {i.coordinators.length > 1 && (
              <button type="button" className="mt-2 min-h-10 text-sm font-semibold text-danger" onClick={() => set((x) => void x.coordinators.splice(k, 1))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() =>
            set(
              (x) =>
                void x.coordinators.push({
                  id: `c${Date.now().toString(36)}`,
                  name: "",
                  hoursPerWeek: null,
                  nonClientPerWeek: null,
                  leave: weeks.map(() => 0),
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a coordinator
        </button>
      </section>

      <section className={group}>
        <h5 className="font-semibold">Work bands {tag}</h5>
        <p className="text-xs text-ink-muted">
          Bands describe observed coordination effort, not clinical eligibility or a person’s value. Don’t derive them from funding level alone.
        </p>
        {i.bands.map((bd, k) => (
          <div key={bd.id} className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-3 ring-1 ring-line sm:grid-cols-5">
            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold sm:col-span-1">
              Band
              <input className={small} value={bd.label} onChange={(e) => set((x) => void (x.bands[k].label = e.target.value))} />
            </label>
            <NumField
              label="Active clients"
              unit="count"
              step={1}
              value={bd.count}
              error={err(`band.${bd.id}.count`)}
              onChange={(v) => set((x) => void (x.bands[k].count = v))}
            />
            <NumField
              label="Each, weekly"
              unit="h"
              step={0.1}
              value={bd.hoursPerWeek}
              error={err(`band.${bd.id}.hoursPerWeek`)}
              onChange={(v) => set((x) => void (x.bands[k].hoursPerWeek = v))}
            />
            <NumField
              label="New: setup"
              unit="h"
              value={bd.setupHours}
              error={err(`band.${bd.id}.setupHours`)}
              onChange={(v) => set((x) => void (x.bands[k].setupHours = v))}
            />
            <NumField
              label="New: follow-up"
              unit="h, first month"
              value={bd.followUpHours}
              error={err(`band.${bd.id}.followUpHours`)}
              onChange={(v) => set((x) => void (x.bands[k].followUpHours = v))}
            />
          </div>
        ))}
        <p className="text-xs text-ink-muted">
          Follow-up falls{" "}
          {i.followUpSpread.map((f, k) => `${Math.round(f * 100)}% ${k === 0 ? "in the start week" : `${k} week${k === 1 ? "" : "s"} after`}`).join(", ")}.
          Setup falls in the start week.
        </p>
      </section>

      <section className={group}>
        <h5 className="font-semibold">Week by week {tag}</h5>
        <div className="grid gap-2 sm:grid-cols-2">
          {weeks.map((w) => (
            <div key={w.index} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <p className="text-xs font-bold">{w.label}</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <NumField
                  label="Exceptional work"
                  unit="h"
                  value={i.exceptional[w.index] ?? null}
                  error={err(`exceptional.${w.index}`)}
                  onChange={(v) => set((x) => void (x.exceptional[w.index] = v))}
                />
                <NumField
                  label="Approved temporary cover"
                  unit="h"
                  value={i.cover[w.index] ?? null}
                  error={err(`cover.${w.index}`)}
                  onChange={(v) => set((x) => void (x.cover[w.index] = v))}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={group}>
        <h5 className="font-semibold">Proposed starts {tag}</h5>
        <p className="text-xs text-ink-muted">
          Anonymous labels only: no names, diagnoses or addresses. Starts in the same week are read in the order you set.
        </p>
        {i.starts.map((st, k) => (
          <div key={st.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Label
                <input className={small} value={st.label} onChange={(e) => set((x) => void (x.starts[k].label = e.target.value))} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Stage
                <select
                  className={small}
                  value={st.stage}
                  title={STAGE_HINTS[st.stage]}
                  onChange={(e) => set((x) => void (x.starts[k].stage = e.target.value as Stage))}
                >
                  {(Object.keys(STAGES) as Stage[]).map((v) => (
                    <option key={v} value={v}>
                      {STAGES[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Band
                <select className={small} value={st.band} onChange={(e) => set((x) => void (x.starts[k].band = e.target.value))}>
                  <option value="">Choose…</option>
                  {i.bands.map((bd) => (
                    <option key={bd.id} value={bd.id}>
                      {bd.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Start week
                <select className={small} value={st.week} onChange={(e) => set((x) => void (x.starts[k].week = Number(e.target.value)))}>
                  {weeks.map((w) => (
                    <option key={w.index} value={w.index}>
                      Week {w.index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <NumField label="Order in week" unit="1 first" step={1} value={st.order} onChange={(v) => set((x) => void (x.starts[k].order = v ?? 1))} />
            </div>
            {st.services.map((v, j) => (
              <div key={v.id} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["service", "capability", "area", "window"] as const).map((f) => (
                  <label key={f} className="flex flex-col gap-1 text-xs font-semibold capitalize">
                    {f === "window" ? "Time window" : f}
                    <input className={small} value={v[f]} onChange={(e) => set((x) => void (x.starts[k].services[j][f] = e.target.value))} />
                  </label>
                ))}
                <NumField
                  label="Visits"
                  unit="a week"
                  step={1}
                  value={v.slotsPerWeek}
                  error={err(`start.${st.id}.service.${v.id}`)}
                  onChange={(n) => set((x) => void (x.starts[k].services[j].slotsPerWeek = n))}
                />
              </div>
            ))}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted"
                onClick={() =>
                  set(
                    (x) =>
                      void x.starts[k].services.push({
                        id: `v${Date.now().toString(36)}`,
                        service: "",
                        capability: "",
                        area: "",
                        window: "",
                        slotsPerWeek: null,
                      }),
                  )
                }
              >
                + Service
              </button>
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-semibold">
                Still to confirm (separate with ;)
                <input
                  className={small}
                  value={st.unknowns.join("; ")}
                  onChange={(e) =>
                    set(
                      (x) =>
                        void (x.starts[k].unknowns = e.target.value
                          .split(";")
                          .map((u) => u.trimStart())
                          .filter((u, n, all) => u || n === all.length - 1)),
                    )
                  }
                />
              </label>
              <button type="button" className="min-h-10 text-sm font-semibold text-danger" onClick={() => set((x) => void x.starts.splice(k, 1))}>
                Remove start
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() =>
            set(
              (x) =>
                void x.starts.push({
                  id: `s${Date.now().toString(36)}`,
                  label: `Start ${String.fromCharCode(65 + x.starts.length)}`,
                  stage: "expected",
                  band: x.bands[0]?.id ?? "",
                  week: 0,
                  order: x.starts.length + 1,
                  services: [],
                  unknowns: [],
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a start
        </button>
      </section>

      <section className={group}>
        <h5 className="font-semibold">Supplier capacity {tag}</h5>
        <p className="text-xs text-ink-muted">
          Enter spare capacity <strong>after</strong> current bookings, travel and conflicts. Only confirmed, current slots count. A booked slot can’t be
          reused.
        </p>
        {i.supply.map((p, k) => (
          <div key={p.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["supplier", "service", "capability", "area", "window"] as const).map((f) => (
                <label key={f} className="flex flex-col gap-1 text-xs font-semibold capitalize">
                  {f === "window" ? "Time window" : f}
                  <input className={small} value={p[f]} onChange={(e) => set((x) => void (x.supply[k][f] = e.target.value))} />
                </label>
              ))}
              <NumField
                label="Slots"
                unit="each week"
                step={1}
                value={p.slots}
                error={err(`supply.${p.id}.slots`)}
                onChange={(v) => set((x) => void (x.supply[k].slots = v))}
              />
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Status
                <select className={small} value={p.status} onChange={(e) => set((x) => void (x.supply[k].status = e.target.value as SupplyStatus))}>
                  {(Object.keys(SUPPLY_STATUS) as SupplyStatus[]).map((v) => (
                    <option key={v} value={v}>
                      {SUPPLY_STATUS[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Last verified
                <input type="date" className={small} value={p.verifiedOn} onChange={(e) => set((x) => void (x.supply[k].verifiedOn = e.target.value))} />
              </label>
            </div>
            <fieldset className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <legend className="sr-only">Weeks</legend>
              <span className="font-semibold">Weeks (none ticked: all)</span>
              {weeks.map((w) => (
                <label key={w.index} className="flex min-h-10 items-center gap-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-action)]"
                    checked={p.weeks.includes(w.index)}
                    onChange={(e) =>
                      set(
                        (x) =>
                          void (x.supply[k].weeks = e.target.checked ? [...x.supply[k].weeks, w.index].sort() : x.supply[k].weeks.filter((y) => y !== w.index)),
                      )
                    }
                  />
                  {w.index + 1}
                </label>
              ))}
              <button type="button" className="ml-auto min-h-10 font-semibold text-danger" onClick={() => set((x) => void x.supply.splice(k, 1))}>
                Remove
              </button>
            </fieldset>
          </div>
        ))}
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() =>
            set(
              (x) =>
                void x.supply.push({
                  id: `p${Date.now().toString(36)}`,
                  supplier: "",
                  service: "",
                  capability: "",
                  area: "",
                  window: "",
                  weeks: [],
                  slots: null,
                  status: "unknown",
                  verifiedOn: "",
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add supply
        </button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The Decision Sheet
// ---------------------------------------------------------------------------------------------

type SheetAction = { action: string; owner: string; due: string; status: "open" | "done" };

function printSheet() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function DecisionSheet({
  title,
  month,
  inputs,
  r,
  source,
  versions,
  actions,
  message,
  reviewBy,
  sources = [],
  notes,
}: {
  title: string;
  month: string;
  inputs: IntakeInputs;
  r: IntakeResult;
  source: string;
  versions: string;
  actions: SheetAction[];
  message?: string;
  reviewBy: string;
  sources?: { title: string; url: string }[];
  notes?: string;
}) {
  const weeks = weeksOf(month);
  return (
    <section className="growth-sheet rounded-2xl bg-bg p-4 ring-1 ring-line" aria-label={title}>
      <p className={kicker}>{title}</p>
      <h5 className="mt-1 font-serif text-xl font-semibold">
        {monthName(month)} · {OVERALL[r.state].label}
      </h5>
      <p className="text-sm text-ink-muted">
        {weeks[0]?.from} to {weeks.at(-1)?.to} · figures as of {inputs.asOf} ({source}) · {versions}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-semibold">Starts by week</p>
          <ul className="mt-1 text-sm">
            {weeks.map((w) => (
              <li key={w.index}>
                Week {w.index + 1}:{" "}
                {r.starts
                  .filter((x) => x.week === w.index)
                  .map((x) => `${x.label} (${START_LABEL[x.status].toLowerCase()})`)
                  .join(", ") || "none"}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold">Coordinator hours</p>
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Available</th>
                <th scope="col">Needed</th>
                <th scope="col">Headroom</th>
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.week.index}>
                  <td>{w.week.index + 1}</td>
                  <td>{w.available}</td>
                  <td>{w.required}</td>
                  <td>{w.headroom}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-muted">Reserve {inputs.reservePct ?? "—"}% of net hours.</p>
        </div>
      </div>
      <p className="mt-3 font-semibold">Service gaps and unknowns</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {r.services
          .filter((c) => c.state !== "covered")
          .map((c) => (
            <li key={checkKey(c)}>
              {c.service}, {c.window}, {c.area}, Week {c.week + 1}: {c.required} needed, {c.confirmed} confirmed ({CHECK_LABEL[c.state].toLowerCase()}
              {c.verifiedOn ? `, verified ${c.verifiedOn}` : ""})
            </li>
          ))}
        {r.starts
          .filter((x) => x.status === "confirm")
          .map((x) => (
            <li key={x.id}>
              {x.label}: {x.reasons.filter((y) => y.startsWith("Needs") || y.startsWith("The agreement")).join(" ") || "needs confirmation"}
            </li>
          ))}
        {!r.services.some((c) => c.state !== "covered") && !r.starts.some((x) => x.status === "confirm") && <li>None.</li>}
      </ul>
      <p className="mt-3 font-semibold">Next steps</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {actions.length ? (
          actions.map((a, k) => (
            <li key={k}>
              {a.action || "(no action written)"}
              {a.owner ? ` · owner: ${a.owner}` : ""}
              {a.due ? ` · by ${a.due}` : ""}
              {a.status === "done" ? " · done" : ""}
            </li>
          ))
        ) : (
          <li>None written yet.</li>
        )}
      </ul>
      {message && <p className="mt-2 text-sm">{message}</p>}
      {notes && <p className="mt-2 whitespace-pre-line text-sm">{notes}</p>}
      <p className="mt-2 text-sm">
        <strong>Review date:</strong> {reviewBy || "set one: referrals, needs, leave and worker availability change"}
      </p>
      {sources.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Sources: {sources.map((x) => x.title).join("; ")}. A planning signal, not an approval, a promise or a clinical decision.
        </p>
      )}
    </section>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthName(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return MONTH_NAMES[mo - 1] ? `${MONTH_NAMES[mo - 1]} ${y}` : m;
}

// ---------------------------------------------------------------------------------------------
// Use my business
// ---------------------------------------------------------------------------------------------

type ScenarioSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string };
type Scenario = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: IntakeInputs;
  sheet: { actions: SheetAction[]; reviewBy: string; notes: string };
  earlierModel: boolean;
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function BusinessPlanner({ orgName }: { orgName: string }) {
  const home = useApi<{ access: { orgName: string } | null; scenarios: ScenarioSummary[] }>("/api/tools/intake");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<IntakeInputs | null>(null);
  const [baseline, setBaseline] = useState<IntakeInputs | null>(null);
  const [sheet, setSheet] = useState<Scenario["sheet"]>({ actions: [], reviewBy: "", notes: "" });
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [opened, setOpened] = useState<number[]>([]);

  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await api<Scenario>(`/api/tools/intake?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}`);
      setScenario(s);
      setInputs(s.inputs);
      setBaseline(s.inputs);
      setSheet(s.sheet);
      setName(s.name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startBlank = () => {
    const today = localToday();
    const fresh = blankInputs(nextMonth(today), today);
    setScenario(null);
    setInputs(fresh);
    setBaseline(fresh);
    setSheet({ actions: [], reviewBy: "", notes: "" });
    setName("");
  };
  const save = async () => {
    if (!inputs) return;
    setBusy(true);
    setMessage(null);
    try {
      const s = await api<Scenario>("/api/tools/intake", { body: { id: scenario?.id, name, inputs, sheet, note } });
      setScenario(s);
      setBaseline(s.inputs);
      setNote("");
      setMessage(`Saved as version ${s.version}.`);
      home.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = home.data?.scenarios ?? [];
  const r = inputs && !validateInputs(inputs).length ? calculate(inputs) : null;
  const changes = inputs && baseline ? inputChanges(baseline, inputs) : [];
  const resultDelta = r && baseline && !validateInputs(baseline).length ? resultChanges(calculate(baseline), r) : [];
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="rounded-2xl bg-muted px-4 py-2 text-sm">
        <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these plans. Use aggregate figures and
        anonymous labels: no names, diagnoses or addresses. Nothing is saved until you choose Save. This is a planning signal, not an approval, a refusal or a
        clinical decision.
      </p>
      {!inputs && (
        <div className="flex flex-col gap-3">
          {list.length > 0 && (
            <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => load(list[0].id)}>
              Resume my plan: {list[0].name}
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
            Start a blank plan for next month
          </button>
        </div>
      )}
      {inputs && (
        <>
          {scenario && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{scenario.name}</span>
              <label className="flex items-center gap-2">
                Version
                <select className={cx(small, "w-auto")} value={scenario.version} onChange={(e) => load(scenario.id, Number(e.target.value))}>
                  {scenario.versions.map((v) => (
                    <option key={v.number} value={v.number}>
                      {v.number} · {v.savedAt.slice(0, 10)} · {v.savedBy}
                      {v.note ? ` · ${v.note}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {scenario.earlierModel && (
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", TONE.warn)}>Saved under an earlier model: recalculated now</span>
              )}
            </div>
          )}
          <Planner
            inputs={inputs}
            base={baseline ?? inputs}
            source="Entered by you"
            opened={opened}
            onOpenWeek={(w) => setOpened((x) => [...x, w])}
            onEdit={setInputs}
            section="all"
          />
          {r && <Coverage result={r} onOpen={() => undefined} />}
          {(changes.length > 0 || resultDelta.length > 0) && (
            <div className={box}>
              <p className={kicker}>Since {scenario ? `version ${scenario.version}` : "you started"}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {[...changes, ...resultDelta].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <div className={box}>
            <p className={kicker}>Next steps and review</p>
            {sheet.actions.map((a, k) => (
              <div key={k} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_10rem_7rem_auto]">
                <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold sm:col-span-1">
                  Action
                  <input
                    className={small}
                    value={a.action}
                    onChange={(e) => setSheet((x) => ({ ...x, actions: x.actions.map((y, j) => (j === k ? { ...y, action: e.target.value } : y)) }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Owner
                  <input
                    className={small}
                    value={a.owner}
                    onChange={(e) => setSheet((x) => ({ ...x, actions: x.actions.map((y, j) => (j === k ? { ...y, owner: e.target.value } : y)) }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Due
                  <input
                    type="date"
                    className={small}
                    value={a.due}
                    onChange={(e) => setSheet((x) => ({ ...x, actions: x.actions.map((y, j) => (j === k ? { ...y, due: e.target.value } : y)) }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Status
                  <select
                    className={small}
                    value={a.status}
                    onChange={(e) =>
                      setSheet((x) => ({ ...x, actions: x.actions.map((y, j) => (j === k ? { ...y, status: e.target.value as "open" | "done" } : y)) }))
                    }
                  >
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="min-h-10 self-end text-sm font-semibold text-danger"
                  onClick={() => setSheet((x) => ({ ...x, actions: x.actions.filter((_, j) => j !== k) }))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={cx(secondary, "mt-2")}
              onClick={() => setSheet((x) => ({ ...x, actions: [...x.actions, { action: "", owner: "", due: "", status: "open" }] }))}
            >
              <Icon name="plus" className="size-4" /> Add a next step
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review date
                <input type="date" className={small} value={sheet.reviewBy} onChange={(e) => setSheet((x) => ({ ...x, reviewBy: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Notes (assumptions, who you’ve told)
                <textarea className={cx(small, "min-h-16 py-2")} value={sheet.notes} onChange={(e) => setSheet((x) => ({ ...x, notes: e.target.value }))} />
              </label>
            </div>
          </div>
          {r && (
            <DecisionSheet
              title="Growth Decision Sheet (private)"
              month={inputs.month}
              inputs={inputs}
              r={r}
              source="entered by you"
              versions={`${scenario ? `${scenario.name}, version ${scenario.version}` : "unsaved"} · ${MODEL_VERSION}`}
              actions={sheet.actions}
              reviewBy={sheet.reviewBy}
              notes={sheet.notes}
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!scenario && (
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Plan name
                <input className={cx(small, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="February starts" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold">
              What changed (optional)
              <input className={cx(small, "w-64")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className={primary} disabled={busy || (!scenario && !name.trim())} onClick={save}>
              {scenario ? "Save a new version" : "Save"}
            </button>
            {r && (
              <button type="button" className={secondary} onClick={printSheet}>
                <Icon name="print" className="size-4" /> Print or save the sheet
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setInputs(null);
                setScenario(null);
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
