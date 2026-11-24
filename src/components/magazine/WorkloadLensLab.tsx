"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { WorkloadBlock } from "@/lib/magazine";
import {
  blankInputs,
  blankWeek,
  calculate,
  CATEGORIES,
  CATEGORY_HINTS,
  CATEGORY_ORDER,
  CAUSE_ORDER,
  CAUSES,
  DAYS,
  EVIDENCE,
  inputChanges,
  INTERVENTION_KINDS,
  MODEL_VERSION,
  OWNERS,
  PLANNED,
  resultChanges,
  REWORK,
  round1,
  taskHours,
  validateInputs,
  WEEK_KINDS,
  type Category,
  type Cause,
  type Duration,
  type ForwardPlan,
  type InputError,
  type Intervention,
  type InterventionKind,
  type Num,
  type ObservedWeek,
  type Owner,
  type PlannedState,
  type ReworkStatus,
  type Task,
  type WeekKind,
  type WorkloadInputs,
  type WorkloadResult,
} from "@/lib/workloadLens";
import {
  buildDebrief,
  currentInputs,
  emptyState,
  finishProblems,
  LEVELS,
  STEPS,
  type StoryEvent,
  type Tag,
  type WorkloadDebrief,
  type WorkloadState,
} from "@/lib/workloadLab";
import type { WorkloadView } from "@/server/workloadLens";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Where does a coordinator’s week go?" (docs/workload-lens.md). A feature-article decision, not a bare calculator:
  Monday's plan and a prediction, the week's events tagged one category each (causes as an overlay), the week map
  from the principal's and the coordinator's side, a change tested on the reviewed rework it touches, then an
  explanation and a decision, and a Week Review to keep. The figures come from the shared model (lib/workloadLens);
  the debrief comes from the server once the decision is in.

  Every chart has a table carrying the same figures; "not measured" is shown in words, apart from zero; status is in
  words as well as colour; every figure has a number field; nothing animates or times the reader.

  "Map my team’s week" appears only for a business owner and the members they've authorised (the server decides).
  It starts blank, never with the story's figures, asks for aggregate hours by category (never a named person, a
  calendar or a timesheet), saves only when asked, and keeps unsaved entries in this page alone.

  In the editor's preview it runs against the block as written, locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const small = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const TONE = {
  good: "bg-[#dff3ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
  warn: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  bad: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
/** Planned, recurring and unplanned: told apart by pattern as well as colour. */
const SEGMENT: Record<PlannedState, { label: string; style: React.CSSProperties }> = {
  planned: { label: "Planned", style: { background: "#008282" } },
  recurring: { label: "Known recurring", style: { background: "#9fb3c8" } },
  unplanned: { label: "Unplanned", style: { background: "repeating-linear-gradient(135deg, #c26a12 0 6px, #e7a35a 6px 10px)" } },
};
const REWORK_STYLE: React.CSSProperties = { background: "repeating-linear-gradient(45deg, #7a1f1a 0 3px, transparent 3px 7px)" };
const FICTIONAL =
  "Fictional case: Maya, Sam, the clients, the suppliers and every figure are invented for practice. They aren’t Trilogy Care staffing norms, a clients-per-coordinator figure or a productivity standard.";
const hrs = (v: number) => `${round1(v)} h`;
const dur = (t: Pick<Task, "count" | "minutes">) =>
  t.minutes === "unknown" ? "not measured" : t.minutes === null ? "blank" : (t.count ?? 1) === 1 ? `${t.minutes} min` : `${t.count} × ${t.minutes} min`;
/** "the call" → "The call": a title without its day still starts with a capital. */
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const dayName = (d: number | null) => (d === null ? "Across the week" : DAYS[d]);
const safeCalc = (i: WorkloadInputs) => (validateInputs(i).length ? null : calculate(i));
type View = "principal" | "coordinator";

export function WorkloadLensLab({ block: b, ctx }: { block: WorkloadBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/workload");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canPlan = Boolean(business.data?.access);
  return (
    <section aria-label={`Workload Lens: ${b.title}`} className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="clock" className="size-5" /> Workload Lens
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">
          {mode === "story" ? `Fictional case · ${b.storyVersion}` : "Your team · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canPlan && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with the story"],
              ["business", "Map my team’s week"],
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
      {mode === "story" ? <Practice b={b} ctx={ctx} /> : <TeamMapper orgName={business.data?.access?.orgName ?? ""} links={b.links} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practise with the story
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: WorkloadBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/workload`;
  const loaded = useApi<WorkloadView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<WorkloadState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<WorkloadDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [step, setStep] = useState(0);
  const [perspective, setPerspective] = useState<View>("principal");
  const [whatChanged, setWhatChanged] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);

  const take = (v: WorkloadView) => {
    setS(v.state);
    setDebrief(v.debrief);
    setAttemptNo(v.attemptNo);
    setStep(Math.min(v.state.stage, 6));
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

  const asked = useMemo(() => new Map(b.events.map((e) => [e.task, e])), [b.events]);
  // Memoised: the map keeps its last valid result by identity, so it needs the same object until the state changes.
  const mine = useMemo(() => (s ? currentInputs(b, s) : null), [b, s]);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s || !mine) return <p className="mt-4 text-ink-muted">Loading…</p>;

  /** A change that doesn't touch the figures (the step, what's been opened, the choices): applied to the latest state. */
  const update = (fn: (prev: WorkloadState) => WorkloadState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  /** A change to the learner's figures (a tag, a change tested, an estimate), with "what changed" before and after. */
  const change = (fn: (prev: WorkloadState) => WorkloadState) => {
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
  const send = async (body: Record<string, unknown>, local: () => WorkloadState) => {
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
      const v = await api<WorkloadView>(url, { body: { blockId: b.id, ...body } });
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

  const finished = s.stage === 6 && debrief;
  const shown = finished ? step : Math.min(step, 5);
  const allTagged = b.events.every((e) => s.tags[e.id]?.category && (!e.askPrompt || s.tags[e.id]?.prompt !== null));
  const inspect = (seg: string) => {
    if (!s.inspected.includes(seg)) update((p) => (p.inspected.includes(seg) ? p : { ...p, inspected: [...p.inspected, seg] }));
  };
  const openDetail = (eventId: string) => {
    if (!s.details.includes(eventId)) update((p) => (p.details.includes(eventId) ? p : { ...p, details: [...p.details, eventId] }));
  };
  const views = viewsOf(b);

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
        {shown === 0 && <Monday b={b} perspective={perspective} onPerspective={setPerspective} onNext={() => go(1)} />}
        {shown === 1 && (
          <Prediction
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (constraint, hours) => {
              const next = await send({ action: "predict", prediction: { constraint, hours } }, () => ({
                ...s,
                prediction: { constraint, hours },
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
              Here’s how the week went. For each event, choose <strong>one primary category</strong> for the time it took, then any <strong>causes</strong> that
              explain it. A cause doesn’t add time: it’s laid over the category, so nothing is counted twice.
            </p>
            <CategoryGuide />
            {b.events.map((e) => (
              <EventCard
                key={e.id}
                e={e}
                task={mine.weeks[0]?.tasks.find((t) => t.id === e.task)}
                tag={s.tags[e.id]}
                opened={s.details.includes(e.id)}
                onDetail={() => openDetail(e.id)}
                onTag={(t) => change((p) => ({ ...p, tags: { ...p.tags, [e.id]: t } }))}
              />
            ))}
            <WhatChanged lines={whatChanged} />
            <Next disabled={!allTagged} hint="Tag every event first (and say which can wait, where asked)." onClick={() => go(3)} label="See the week map" />
          </div>
        )}
        {shown === 3 && (
          <div className="flex flex-col gap-4">
            <p>
              Here’s the week as a map, with the week before beside it. Switch between Maya’s view and Sam’s. <strong>Open a day or a category</strong> to see
              what filled it, and compare the two weeks.
            </p>
            <Perspective value={perspective} onChange={setPerspective} names={views.names} text={views.text} />
            <MapAndSummary inputs={mine} view={perspective} inspected={s.inspected} onInspect={inspect} asked={asked} onDetail={openDetail} />
            <WhatChanged lines={whatChanged} />
            <Next disabled={!s.inspected.length} hint="Open at least one day or category first." onClick={() => go(4)} label="Test a change" />
          </div>
        )}
        {shown === 4 && (
          <TestChange
            b={b}
            s={s}
            mine={mine}
            whatChanged={whatChanged}
            onToggle={(id) => change((p) => ({ ...p, tried: p.tried.includes(id) ? p.tried.filter((x) => x !== id) : [...p.tried, id], changed: true }))}
            onEstimate={(id, est) => change((p) => ({ ...p, estimates: { ...p.estimates, [id]: est }, changed: true }))}
            onReset={() => change((p) => ({ ...p, tried: [], estimates: {} }))}
            onNext={() => go(5)}
          />
        )}
        {shown === 5 && !finished && (
          <Decide
            b={b}
            s={s}
            busy={busy}
            onPick={(k, v) => update((p) => ({ ...p, [k]: v }))}
            onFinish={async () => {
              justFinished.current = true;
              const next = await send({ action: "finish", explanation: s.explanation, decision: s.decision }, () => ({ ...s, stage: 6 }));
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
              printReview();
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

function CategoryGuide() {
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">What each category means</summary>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {CATEGORY_ORDER.map((c) => (
          <div key={c}>
            <dt className="font-semibold">{CATEGORIES[c]}</dt>
            <dd className="text-ink-muted">{CATEGORY_HINTS[c]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** The two views' names and words: the principal's (commitments and capacity) and the coordinator's (interruptions and consequences). */
function viewsOf(b: Pick<WorkloadBlock, "story">) {
  const first = (n: string) => n.split(" ")[0] || n;
  return {
    names: [`${first(b.story.character)}’s view`, `${first(b.story.coordinator)}’s view`] as [string, string],
    text: { principal: b.story.principalView, coordinator: b.story.coordinatorView } as Record<View, string>,
  };
}

function Perspective({ value, onChange, names, text }: { value: View; onChange: (v: View) => void; names: [string, string]; text?: Record<View, string> }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Whose view" className="inline-flex flex-wrap self-start rounded-full border border-line-strong p-0.5">
        {(
          [
            ["principal", names[0]],
            ["coordinator", names[1]],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", value === v ? "bg-action text-on-action" : "text-ink-muted hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {text?.[value] && <p className="text-sm">{text[value]}</p>}
    </div>
  );
}

function Monday({ b, perspective, onPerspective, onNext }: { b: WorkloadBlock; perspective: View; onPerspective: (v: View) => void; onNext: () => void }) {
  const st = b.story;
  const week = b.inputs.weeks[0];
  const planned = (week?.tasks ?? []).filter((t) => t.planned !== "unplanned");
  return (
    <div className="flex flex-col gap-4">
      {st.transmission.text && (
        <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
          <blockquote className="font-serif text-lg italic">“{st.transmission.text}”</blockquote>
          <figcaption className="mt-2 text-sm text-ink-muted">{st.transmission.who}</figcaption>
        </figure>
      )}
      <div className={box}>
        {/* The principal's portrait only: the coordinator's name may match someone else in the library (docs/workload-lens.md). */}
        <CharacterRow names={[st.character]} size="lg">
          <div className="min-w-0">
            <p className={kicker}>{st.role || "The story"}</p>
            <p className="mt-1">{st.situation}</p>
          </div>
        </CharacterRow>
      </div>
      <Perspective value={perspective} onChange={onPerspective} {...viewsOf(b)} />
      <div className={box}>
        <p className={kicker}>Monday morning: the week as planned</p>
        <p className="mt-1 text-sm">
          {st.coordinator} is rostered for {hrs(week?.rostered ?? 0)}
          {(week?.leave ?? 0) > 0 ? `, less ${hrs(week?.leave ?? 0)} of leave` : ""}. This is what’s already in the calendar:
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, null].map((d) => {
            const tasks = planned.filter((t) => t.day === d);
            if (!tasks.length) return null;
            return (
              <div key={String(d)} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <p className="font-semibold">{dayName(d)}</p>
                <ul className="mt-1 text-sm">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span>{t.label}</span>
                      <span className="whitespace-nowrap text-ink-muted">{dur(t)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
  b: WorkloadBlock;
  s: WorkloadState;
  busy: boolean;
  onSubmit: (constraint: string, hours: number | null) => void;
  onNext: () => void;
}) {
  const done = s.prediction;
  const [constraint, setConstraint] = useState(done?.constraint ?? "");
  const [hours, setHours] = useState<Num>(done?.hours ?? null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (constraint) onSubmit(constraint, hours);
      }}
    >
      <fieldset className="flex flex-col gap-2" disabled={Boolean(done)}>
        <legend className="mb-1 text-lg">{b.prediction.prompt}</legend>
        {b.prediction.options.map((o) => (
          <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
            <input
              type="radio"
              name="constraint"
              className="size-5 accent-[var(--color-action)]"
              checked={constraint === o.id}
              onChange={() => setConstraint(o.id)}
            />
            {o.text}
          </label>
        ))}
      </fieldset>
      <label className="flex max-w-md flex-col gap-1 font-semibold">
        {b.prediction.hoursPrompt} <span className="font-normal text-ink-muted">(hours, optional)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={80}
          step={0.5}
          className="min-h-11 w-32 rounded-xl border border-line-strong bg-surface px-3"
          value={hours ?? ""}
          disabled={Boolean(done)}
          onChange={(e) => setHours(e.target.value === "" ? null : Math.max(0, Math.min(80, Number(e.target.value))))}
        />
      </label>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Your prediction is in. You’ll compare it with the map at the end; it isn’t marked.</p>
          <Next onClick={onNext} label="Follow the week" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primary} disabled={busy || !constraint}>
            Lock in my prediction
          </button>
          <span className="text-sm text-ink-muted">You can’t change it afterwards. A guess is fine.</span>
        </div>
      )}
    </form>
  );
}

function EventCard({
  e,
  task,
  tag,
  opened,
  onDetail,
  onTag,
}: {
  e: StoryEvent;
  task: Task | undefined;
  tag: Tag | undefined;
  opened: boolean;
  onDetail: () => void;
  onTag: (t: Tag) => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const t: Tag = tag ?? { category: "", causes: [], prompt: null };
  const id = `ev-${e.id}`;
  return (
    <article aria-labelledby={`${id}-title`} className={box}>
      <p className={kicker}>{DAYS[e.day]}</p>
      <h5 id={`${id}-title`} className="font-serif text-xl font-semibold">
        {sentence(e.title.replace(/^[A-Za-z]+day: /, ""))}
      </h5>
      <p className="mt-1">{e.text}</p>
      {task && (
        <p className="mt-1 text-sm text-ink-muted">
          Recorded: {task.label} · {dur(task)}
          {task.rework === "avoidable" ? " · reviewed afterwards as avoidable rework" : ""}
        </p>
      )}
      {e.detail && (
        <>
          <button
            type="button"
            aria-expanded={showDetail}
            className="mt-1 min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted"
            onClick={() => {
              if (!opened) onDetail();
              setShowDetail((x) => !x);
            }}
          >
            {showDetail ? "Close" : "What it means for the client"}
          </button>
          {showDetail && <p className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line">{e.detail}</p>}
        </>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Primary category (one)
          <select className={small} value={t.category} onChange={(x) => onTag({ ...t, category: x.target.value as Category })}>
            <option value="">Choose…</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-semibold">Causes (any that apply)</legend>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            {CAUSE_ORDER.map((c) => (
              <label key={c} className="flex min-h-9 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={t.causes.includes(c)}
                  onChange={(x) => onTag({ ...t, causes: x.target.checked ? [...t.causes, c] : t.causes.filter((y) => y !== c) })}
                />
                {CAUSES[c]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {e.askPrompt && (
        <fieldset className="mt-3 flex flex-wrap gap-x-4 text-sm">
          <legend className="font-semibold">Does it need prompt action, or can it be rescheduled?</legend>
          {(
            [
              [true, "Needs prompt action"],
              [false, "Can be rescheduled"],
            ] as const
          ).map(([v, label]) => (
            <label key={label} className="flex min-h-10 items-center gap-2">
              <input
                type="radio"
                name={`${id}-prompt`}
                className="size-4 accent-[var(--color-action)]"
                checked={t.prompt === v}
                onChange={() => onTag({ ...t, prompt: v })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// The week map
// ---------------------------------------------------------------------------------------------

function MapAndSummary({
  inputs,
  base,
  view,
  inspected,
  onInspect,
  asked,
  onDetail,
}: {
  inputs: WorkloadInputs;
  base?: WorkloadInputs;
  view: View;
  inspected: string[];
  onInspect: (seg: string) => void;
  asked?: Map<string, StoryEvent>;
  onDetail?: (eventId: string) => void;
}) {
  const errors = validateInputs(inputs);
  // The last valid result stays, labelled, while a field is blank or out of range.
  const [lastGood, setLastGood] = useState<WorkloadInputs | null>(errors.length ? null : inputs);
  if (!errors.length && lastGood !== inputs) setLastGood(inputs);
  const r = errors.length ? null : calculate(inputs);
  const fallback = lastGood ?? (base && !validateInputs(base).length ? base : null);
  const shownInputs = r ? inputs : fallback;
  const shown = r ?? (fallback ? calculate(fallback) : null);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {shown && shownInputs ? (
          <WeekMap r={shown} inputs={shownInputs} view={view} inspected={inspected} onInspect={onInspect} asked={asked} onDetail={onDetail} />
        ) : (
          <p className="text-ink-muted">Enter the figures below to see the week.</p>
        )}
      </div>
      {/* On a phone the key finding comes first. */}
      <aside className="order-first xl:order-none xl:sticky xl:top-24 xl:self-start" aria-label="What the map shows">
        <Errors errors={errors} stale={Boolean(shown)} />
        {shown && <Summary r={shown} inputs={shownInputs!} stale={!r} />}
      </aside>
    </div>
  );
}

function Errors({ errors, stale }: { errors: InputError[]; stale: boolean }) {
  if (!errors.length) return null;
  return (
    <div role="status" className={cx("mb-3 rounded-2xl p-3 text-sm", TONE.warn)}>
      <p className="font-semibold">{stale ? "Showing the last valid result." : "No result yet."} Fix these first:</p>
      <ul className="mt-1 list-disc pl-5">
        {errors.slice(0, 5).map((e) => (
          <li key={e.field}>{e.message}</li>
        ))}
        {errors.length > 5 && <li>and {errors.length - 5} more</li>}
      </ul>
    </div>
  );
}

function Summary({ r, inputs, stale = false }: { r: WorkloadResult; inputs: WorkloadInputs; stale?: boolean }) {
  const w = r.weeks[0];
  if (!w) return null;
  return (
    <div className={cx("rounded-2xl p-4 ring-1 ring-line", stale && "opacity-70")}>
      <p className={cx("rounded-xl px-3 py-2 text-sm font-semibold", r.sample === 1 ? TONE.warn : "bg-muted")}>{EVIDENCE[r.evidence]}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["Working capacity", hrs(w.capacity)],
            ["Observed task hours", hrs(w.observed)],
            [w.unclassified < 0 ? "Over capacity (overlap or overrun)" : "Unrecorded time", hrs(Math.abs(w.unclassified))],
            ["Reviewed avoidable rework (inside the total)", hrs(w.reworkTagged)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-bg p-2 ring-1 ring-line">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-serif text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-ink-muted">{w.label}. Unrecorded time is time nobody wrote down, not idle time.</p>
      {(w.unmeasured > 0 || w.overdue !== null) && (
        <p className="mt-2 text-sm">
          {w.unmeasured > 0 && `${w.unmeasured} ${w.unmeasured === 1 ? "task" : "tasks"} not measured (kept out of the hours, not zero). `}
          {w.overdue !== null && `${w.overdue} partner-owned ${w.overdue === 1 ? "task" : "tasks"} overdue or displaced.`}
        </p>
      )}
      {inputs.guardrails.length > 0 && (
        <>
          <p className={cx(kicker, "mt-3")}>Quality guardrails</p>
          <ul className="mt-1 text-sm">
            {inputs.guardrails.map((g) => (
              <li key={g.id} className="flex justify-between gap-2">
                <span>{g.label}</span>
                <span className="font-semibold">{g.value === null ? "Not measured" : g.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.findings.length > 0 && (
        <>
          <p className={cx(kicker, "mt-3")}>What the map shows</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {r.findings.slice(0, 6).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        A planning account, not a productivity score. Model {r.modelVersion}, taxonomy {r.taxonomyVersion}.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-4 text-xs text-ink-muted">
      {(Object.keys(SEGMENT) as PlannedState[]).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-3 w-5 rounded" style={SEGMENT[k].style} /> {SEGMENT[k].label}
        </span>
      ))}
    </p>
  );
}

function WeekMap({
  r,
  inputs,
  view,
  inspected,
  onInspect,
  asked,
  onDetail,
}: {
  r: WorkloadResult;
  inputs: WorkloadInputs;
  view: View;
  inspected: string[];
  onInspect: (seg: string) => void;
  asked?: Map<string, StoryEvent>;
  onDetail?: (eventId: string) => void;
}) {
  const [weekIndex, setWeekIndex] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const k = Math.min(weekIndex, r.weeks.length - 1);
  const w = r.weeks[k];
  const week = inputs.weeks[k];
  if (!w || !week) return null;
  const toggle = (seg: string) => {
    if (!inspected.includes(seg)) onInspect(seg);
    // Opening a segment shows its story details: that counts as looking at them.
    if (open !== seg && onDetail && asked) for (const t of tasksFor(seg)) if (t.detail && asked.get(t.id)) onDetail(asked.get(t.id)!.id);
    setOpen((x) => (x === seg ? null : seg));
  };
  const tasksFor = (seg: string) =>
    week.tasks.filter((t) => (seg.startsWith("day:") ? String(t.day) === seg.slice(4) : seg.startsWith("cat:") ? t.category === seg.slice(4) : false));
  const days = [0, 1, 2, 3, 4, null]
    .map((d) => w.byDay.find((x) => x.day === d) ?? { day: d, planned: 0, unplanned: 0, recurring: 0 })
    .filter((d) => d.day !== null || d.planned + d.unplanned + d.recurring > 0);
  const dayMax = Math.max(1, ...days.map((d) => d.planned + d.unplanned + d.recurring));
  const catMax = Math.max(1, ...CATEGORY_ORDER.map((c) => w.byCategory[c]));
  const unplannedByCat = (c: Category) => week.tasks.filter((t) => t.category === c && t.planned === "unplanned").reduce((a, t) => a + (taskHours(t) ?? 0), 0);
  const notMeasured = (c: Category) => week.tasks.some((t) => t.category === c && t.minutes === "unknown");

  return (
    <figure className={box}>
      {r.weeks.length > 1 && (
        <div role="tablist" aria-label="Sampled weeks" className="mb-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {r.weeks.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={i === k}
              onClick={() => {
                setWeekIndex(i);
                setOpen(null);
                if (i > 0) onInspect(`week:${x.id}`);
              }}
              className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", i === k ? "bg-action text-on-action" : "text-ink-muted hover:bg-muted")}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      <figcaption className="font-semibold">
        {view === "principal" ? "Where the hours went, by category, against capacity" : "How the week arrived, day by day: planned, recurring and unplanned"} ·{" "}
        {w.label} ({WEEK_KINDS[w.kind].toLowerCase()})
      </figcaption>
      <p className="mt-1 text-sm text-ink-muted">
        {hrs(w.observed)} of recorded work against {hrs(w.capacity)} of capacity
        {w.unclassified < 0 ? `: ${hrs(-w.unclassified)} over, so entries overlap or the week ran late` : `: ${hrs(w.unclassified)} unrecorded`}.
      </p>

      {view === "principal" ? (
        <>
          <div aria-hidden className="mt-3 flex flex-col gap-2">
            {CATEGORY_ORDER.filter((c) => w.byCategory[c] > 0 || notMeasured(c)).map((c) => {
              const total = w.byCategory[c];
              const unpl = unplannedByCat(c);
              return (
                <div key={c} className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] items-center gap-2 text-xs">
                  <span className="font-semibold">{CATEGORIES[c]}</span>
                  <span className="relative block h-4 rounded bg-muted" style={{ width: `${(total / catMax) * 100}%`, minWidth: total ? 4 : 0 }}>
                    <span
                      className="absolute inset-y-0 left-0 rounded-l"
                      style={{ ...SEGMENT.planned.style, width: `${total ? ((total - unpl) / total) * 100 : 0}%` }}
                    />
                    <span
                      className="absolute inset-y-0 rounded-r"
                      style={{ ...SEGMENT.unplanned.style, left: `${total ? ((total - unpl) / total) * 100 : 0}%`, right: 0 }}
                    />
                    {w.reworkByCategory[c] > 0 && (
                      <span
                        className="absolute inset-y-0 right-0 ring-2 ring-[#7a1f1a]"
                        style={{ ...REWORK_STYLE, width: `${(w.reworkByCategory[c] / total) * 100}%` }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
            <p className="flex flex-wrap gap-4 text-xs text-ink-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded" style={SEGMENT.planned.style} /> Planned or recurring
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded" style={SEGMENT.unplanned.style} /> Unplanned
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded ring-1 ring-[#7a1f1a]" style={REWORK_STYLE} /> Reviewed rework (inside the bar, not added)
              </span>
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <caption className="sr-only">Hours by primary category in {w.label}, with unplanned hours and reviewed rework inside each total</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-semibold">
                    Category
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Hours
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Of which unplanned
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Of which reviewed rework
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER.map((c) => (
                  <SegmentRow
                    key={c}
                    label={CATEGORIES[c]}
                    cells={[notMeasured(c) && !w.byCategory[c] ? "Not measured" : hrs(w.byCategory[c]), hrs(unplannedByCat(c)), hrs(w.reworkByCategory[c])]}
                    open={open === `cat:${c}`}
                    onToggle={() => toggle(`cat:${c}`)}
                    tasks={tasksFor(`cat:${c}`)}
                    asked={asked}
                  />
                ))}
                <tr className="font-semibold">
                  <th scope="row" className="py-2 pr-2">
                    Total (each task once)
                  </th>
                  <td className="px-2">{hrs(w.observed)}</td>
                  <td className="px-2">{hrs(w.byPlanned.unplanned)}</td>
                  <td className="px-2">{hrs(w.reworkTagged)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div aria-hidden className="mt-3 flex flex-col gap-2">
            {days.map((d) => (
              <div key={String(d.day)} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
                <span className="font-semibold">{dayName(d.day)}</span>
                <span className="flex h-4" style={{ width: `${((d.planned + d.recurring + d.unplanned) / dayMax) * 100}%` }}>
                  {(["planned", "recurring", "unplanned"] as const).map((p) =>
                    d[p] > 0 ? <span key={p} className="block h-full first:rounded-l last:rounded-r" style={{ ...SEGMENT[p].style, flexGrow: d[p] }} /> : null,
                  )}
                </span>
              </div>
            ))}
            <Legend />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <caption className="sr-only">Hours by day in {w.label}: planned, known recurring and unplanned</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-semibold">
                    Day
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Planned
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Recurring
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Unplanned
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <SegmentRow
                    key={String(d.day)}
                    label={dayName(d.day)}
                    cells={[hrs(d.planned), hrs(d.recurring), hrs(d.unplanned)]}
                    open={open === `day:${d.day}`}
                    onToggle={() => toggle(`day:${d.day}`)}
                    tasks={tasksFor(`day:${d.day}`)}
                    asked={asked}
                  />
                ))}
                <tr className="font-semibold">
                  <th scope="row" className="py-2 pr-2">
                    Total (each task once)
                  </th>
                  <td className="px-2">{hrs(w.byPlanned.planned)}</td>
                  <td className="px-2">{hrs(w.byPlanned.recurring)}</td>
                  <td className="px-2">{hrs(w.byPlanned.unplanned)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="mt-3" onToggle={(e) => (e.currentTarget.open ? onInspect("cause:overlay") : undefined)}>
        <summary className="min-h-11 cursor-pointer font-semibold">The cause overlay: why the time was spent</summary>
        <p className="text-sm text-ink-muted">
          These hours are already in the totals above. A task with two causes shows under both, so this column doesn’t add up to the week.
        </p>
        <table className="mt-1 w-full text-left text-sm">
          <caption className="sr-only">Hours by cause tag in {w.label} (an overlay)</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">
                Cause
              </th>
              <th scope="col" className="px-2 font-semibold">
                Hours tagged
              </th>
            </tr>
          </thead>
          <tbody>
            {CAUSE_ORDER.map((c) => (
              <tr key={c} className="border-b border-line">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {CAUSES[c]}
                </th>
                <td className="px-2">{hrs(w.byCause[c])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {r.weeks.length > 1 && (
        <details className="mt-2" onToggle={(e) => (e.currentTarget.open ? onInspect("week:compare") : undefined)}>
          <summary className="min-h-11 cursor-pointer font-semibold">Compare the weeks</summary>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[30rem] text-left text-sm">
              <caption className="sr-only">Hours by category in each sampled week, with the range</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Category
                  </th>
                  {r.weeks.map((x) => (
                    <th key={x.id} scope="col" className="px-2 font-semibold">
                      {x.label}
                    </th>
                  ))}
                  <th scope="col" className="px-2 font-semibold">
                    Range
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER.map((c) => {
                  const xs = r.weeks.map((x) => x.byCategory[c]);
                  return (
                    <tr key={c} className="border-b border-line">
                      <th scope="row" className="py-1 pr-2 font-normal">
                        {CATEGORIES[c]}
                      </th>
                      {xs.map((v, i) => (
                        <td key={r.weeks[i].id} className="px-2">
                          {hrs(v)}
                        </td>
                      ))}
                      <td className="px-2">{round1(Math.max(...xs) - Math.min(...xs))} h</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <th scope="row" className="py-1 pr-2">
                    Observed total
                  </th>
                  {r.weeks.map((x) => (
                    <td key={x.id} className="px-2">
                      {hrs(x.observed)}
                    </td>
                  ))}
                  <td className="px-2">
                    {hrs(r.observed.min)}–{hrs(r.observed.max)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-sm">
            {r.sample} weeks sampled · {EVIDENCE[r.evidence]}.
          </p>
        </details>
      )}
    </figure>
  );
}

function SegmentRow({
  label,
  cells,
  open,
  onToggle,
  tasks,
  asked,
}: {
  label: string;
  cells: string[];
  open: boolean;
  onToggle: () => void;
  tasks: Task[];
  asked?: Map<string, StoryEvent>;
}) {
  return (
    <>
      <tr className="border-b border-line">
        <th scope="row" className="py-2 pr-2 font-semibold">
          {label}
        </th>
        {cells.map((c, i) => (
          <td key={i} className="px-2">
            {c}
          </td>
        ))}
        <td className="px-2 text-right">
          {tasks.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              className="min-h-10 whitespace-nowrap rounded-full px-2 font-semibold text-accent hover:bg-muted"
              onClick={onToggle}
            >
              {open ? "Close" : "Open"}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-bg">
          <td colSpan={cells.length + 2} className="p-3">
            <ul className="flex flex-col gap-2 text-sm">
              {tasks.map((t) => {
                const e = asked?.get(t.id);
                return (
                  <li key={t.id}>
                    <p>
                      <span className="font-semibold">{t.label}</span> · {dur(t)} ({t.minutes === "unknown" ? "not measured" : hrs(taskHours(t) ?? 0)}) ·{" "}
                      {PLANNED[t.planned].toLowerCase()} · {CATEGORIES[t.category].toLowerCase()}
                    </p>
                    <p className="text-ink-muted">
                      {t.causes.length ? `Causes: ${t.causes.map((c) => CAUSES[c].toLowerCase()).join(", ")}` : "No cause tagged"} · {REWORK[t.rework]} · duty:{" "}
                      {OWNERS[t.owner].toLowerCase()}
                    </p>
                    {t.detail && (
                      <p className="mt-1 rounded-xl bg-surface p-2 ring-1 ring-line">
                        {e ? <span className="sr-only">Story detail: </span> : null}
                        {t.detail}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Test a change
// ---------------------------------------------------------------------------------------------

function TestChange({
  b,
  s,
  mine,
  whatChanged,
  onToggle,
  onEstimate,
  onReset,
  onNext,
}: {
  b: WorkloadBlock;
  s: WorkloadState;
  mine: WorkloadInputs;
  whatChanged: string[];
  onToggle: (id: string) => void;
  onEstimate: (id: string, est: { occurrences: Num; minutesEach: Num }) => void;
  onReset: () => void;
  onNext: () => void;
}) {
  const errors = validateInputs(mine);
  const r = errors.length ? null : calculate(mine);
  const hiringLink = b.links.find((l) => /hir/i.test(l.label + l.href));
  return (
    <div className="flex flex-col gap-4">
      <p>
        Choose a change to test. Each one only reduces the <strong>reviewed tasks it names</strong>, by a conservative estimate you can edit, and never more
        than was observed. The result is <strong>modelled</strong>: it isn’t a saving until the evidence shows it.
      </p>
      <ul className="flex flex-col gap-3">
        {mine.interventions.map((x) => (
          <ChangeCard
            key={x.id}
            x={x}
            on={s.tried.includes(x.id)}
            result={r?.plan.changes.find((c) => c.id === x.id)}
            onToggle={() => onToggle(x.id)}
            onEstimate={(est) => onEstimate(x.id, est)}
            hiringHref={hiringLink?.href}
          />
        ))}
      </ul>
      <Errors errors={errors} stale={false} />
      {r && <PlanTable r={r} inputs={mine} />}
      <WhatChanged lines={whatChanged} />
      <div className="flex flex-wrap gap-3">
        {s.tried.length > 0 && (
          <button type="button" className={secondary} onClick={onReset}>
            Take every change off
          </button>
        )}
        <Next disabled={!s.changed} hint="Test at least one change first." onClick={onNext} label="Friday: decide" />
      </div>
    </div>
  );
}

function ChangeCard({
  x,
  on,
  result,
  onToggle,
  onEstimate,
  hiringHref,
}: {
  x: Intervention;
  on: boolean;
  result?: WorkloadResult["plan"]["changes"][number];
  onToggle: () => void;
  onEstimate: (est: { occurrences: Num; minutesEach: Num }) => void;
  hiringHref?: string;
}) {
  const target = [x.cause && `tasks tagged “${CAUSES[x.cause].toLowerCase()}”`, x.category && `${CATEGORIES[x.category].toLowerCase()}`]
    .filter(Boolean)
    .join(" in ");
  return (
    <li className={cx(box, on && "ring-2 ring-[var(--color-action)]")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">{INTERVENTION_KINDS[x.kind]}</p>
          <p className="font-semibold">{x.label}</p>
          {target && (
            <p className="text-sm text-ink-muted">
              Affects: reviewed {target}
              {x.kind === "reassign" ? " whose owner isn’t the partner business" : ""}.
            </p>
          )}
          {x.owner && <p className="text-sm">Owner: {x.owner}</p>}
          {x.evidence && <p className="text-sm">How you’d know: {x.evidence}</p>}
        </div>
        {x.kind !== "hiring" && (
          <button type="button" aria-pressed={on} className={on ? primary : secondary} onClick={onToggle}>
            {on ? "In the plan" : "Test it"}
          </button>
        )}
      </div>
      {x.kind === "hiring" ? (
        <p className="mt-2 text-sm">
          Hiring isn’t modelled here. If a gap remains once the rework is dealt with, and it lasts,{" "}
          {hiringHref ? (
            <Link href={hiringHref} className="font-semibold text-accent underline underline-offset-2">
              test recruitment in the Hiring Runway lab
            </Link>
          ) : (
            "test recruitment in the Hiring Runway lab"
          )}
          . Nothing from here is carried over unless you choose to take it.
        </p>
      ) : x.kind === "cover" ? (
        <p className="mt-2 text-sm">Adds {hrs(x.coverHours ?? 0)} of capacity next week. It doesn’t touch the causes.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <NumField
            label="Occurrences a week"
            unit="times"
            value={x.occurrences}
            step={1}
            className="w-36"
            onChange={(v) => onEstimate({ occurrences: v, minutesEach: x.minutesEach })}
          />
          <NumField
            label="Minutes each"
            unit="min"
            value={x.minutesEach}
            step={5}
            className="w-36"
            onChange={(v) => onEstimate({ occurrences: x.occurrences, minutesEach: v })}
          />
          {on && result && (
            <p className="text-sm">
              Modelled: <strong>{hrs(result.modelled)}</strong> a week of the {hrs(result.eligible)} observed in those tasks
              {result.capped ? " (your estimate was more than was observed, so it’s capped)" : ""}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function PlanTable({ r, inputs }: { r: WorkloadResult; inputs: WorkloadInputs }) {
  const p = r.plan;
  const rows: [string, number, number][] = [
    ["Working capacity", p.capacity, p.capacityAfter],
    ["Planned demand (recurring, onboarding, exceptional, duties and reserve)", p.demand, p.demandAfter],
    ["Headroom", p.headroom, p.headroomAfter],
  ];
  return (
    <div className={box}>
      <p className={kicker}>Next week’s plan: before and after the changes you’re testing</p>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Next week’s capacity, planned demand and headroom, before and after the changes</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">
                <span className="sr-only">Figure</span>
              </th>
              <th scope="col" className="px-2 font-semibold">
                As planned
              </th>
              <th scope="col" className="px-2 font-semibold">
                With the changes (modelled)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, a, z]) => (
              <tr key={k} className="border-b border-line">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {k}
                </th>
                <td className="px-2">{hrs(a)}</td>
                <td className="px-2">
                  {hrs(z)}
                  {k === "Headroom" && (
                    <span className={cx("ml-2 rounded-full px-2 py-0.5 text-xs font-bold", z < 0 ? TONE.bad : TONE.good)}>{z < 0 ? "short" : "fits"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        Of the demand, {hrs(n0(inputs.plan.reserve))} is reserve for the unexpected and {hrs(p.onboarding)} is onboarding for {n0(inputs.plan.starts)}{" "}
        {n0(inputs.plan.starts) === 1 ? "start" : "starts"}. The changes would affect {hrs(p.modelled)} a week of reviewed work
        {p.cover ? ` and add ${hrs(p.cover)} of cover` : ""}: modelled, not realised.
      </p>
      {inputs.guardrails.length > 0 && (
        <p className="mt-1 text-sm text-ink-muted">
          Keep watching: {inputs.guardrails.map((g) => `${g.label.toLowerCase()} (${g.value === null ? "not measured" : g.value})`).join("; ")}.
        </p>
      )}
    </div>
  );
}
const n0 = (v: Num) => v ?? 0;

// ---------------------------------------------------------------------------------------------
// Decide, and the debrief
// ---------------------------------------------------------------------------------------------

function Decide({
  b,
  s,
  busy,
  onPick,
  onFinish,
}: {
  b: WorkloadBlock;
  s: WorkloadState;
  busy: boolean;
  onPick: (k: "explanation" | "decision", v: string) => void;
  onFinish: () => void;
}) {
  const problems = finishProblems(b, s);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">{b.story.consequence}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Which explanation of the week do you find most convincing?</legend>
        {b.explanations.map((o) => (
          <label key={o.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
            <input
              type="radio"
              name="explanation"
              className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
              checked={s.explanation === o.id}
              onChange={() => onPick("explanation", o.id)}
            />
            {o.text}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">What should {b.story.character.split(" ")[0]} do next?</legend>
        {b.decisions.map((o) => (
          <label key={o.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
            <input
              type="radio"
              name="decision"
              className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
              checked={s.decision === o.id}
              onChange={() => onPick("decision", o.id)}
            />
            {o.text}
          </label>
        ))}
      </fieldset>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={primary} disabled={busy || problems.length > 0} onClick={onFinish}>
          Make the decision and see the debrief
        </button>
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
  b: WorkloadBlock;
  s: WorkloadState;
  d: WorkloadDebrief;
  busy: boolean;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const mine = currentInputs(b, s);
  const r = safeCalc(mine);
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
        <p className="mt-1">{d.decision.outcome}</p>
        <p className="mt-2 text-sm">
          <strong>Your decision:</strong> {d.decision.text}
        </p>
        <p className="mt-1 text-sm">{d.decision.feedback}</p>
        <p className="mt-2 text-sm">
          <strong>Your explanation:</strong> {d.explanation.text}
        </p>
        <p className="mt-1 text-sm">{d.explanation.feedback}</p>
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
        <p className="mt-2 text-xs text-ink-muted">It never scores speed, utilisation or hours saved.</p>
      </div>
      <div className={box}>
        <p className={kicker}>Your tags beside the reviewed ones</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Each event: your category and causes, and the reviewed ones</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-semibold">
                  Event
                </th>
                <th scope="col" className="px-2 font-semibold">
                  Yours
                </th>
                <th scope="col" className="px-2 font-semibold">
                  Reviewed
                </th>
              </tr>
            </thead>
            <tbody>
              {d.tags.map((t) => (
                <tr key={t.id} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-2 font-semibold">
                    {t.title}
                  </th>
                  <td className="px-2 py-2">
                    {t.yours.category ? CATEGORIES[t.yours.category] : "Not tagged"} {t.category ? "(matches)" : "(differs)"}
                    <br />
                    <span className="text-ink-muted">{t.yours.causes.map((c) => CAUSES[c]).join(", ") || "No cause"}</span>
                    {t.prompt !== null && (
                      <>
                        <br />
                        <span className="text-ink-muted">
                          {t.yours.prompt ? "Needs prompt action" : "Can be rescheduled"} {t.prompt ? "(matches)" : "(differs)"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {CATEGORIES[t.answer.category]}
                    <br />
                    <span className="text-ink-muted">{t.answer.causes.map((c) => CAUSES[c]).join(", ") || "No cause"}</span>
                    <p className="mt-1">{t.feedback}</p>
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
          You expected the constraint to be <strong>{d.prediction.constraint.toLowerCase() || "(none chosen)"}</strong>
          {d.prediction.hours !== null ? `, with about ${d.prediction.hours} h left for the unexpected` : ""}. The map shows {hrs(d.prediction.unplanned)} of
          unplanned work that week. {d.prediction.likely.length ? `The case points to: ${d.prediction.likely.join("; ").toLowerCase()}.` : ""}
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>The case</p>
        <p className="mt-1">{d.summary}</p>
        {d.followingWeek && (
          <>
            <p className={cx(kicker, "mt-3")}>The following weeks</p>
            <p className="mt-1">{d.followingWeek}</p>
          </>
        )}
        {b.links.length > 0 && (
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
        )}
      </div>
      {r && (
        <WeekReview
          title="Week Review (learning copy, fictional)"
          period={`${b.story.coordinator}’s week, beside the week before (fictional)`}
          r={r}
          inputs={mine}
          change={d.decision.text}
          owner={mine.interventions
            .filter((x) => s.tried.includes(x.id) && x.owner)
            .map((x) => x.owner)
            .join("; ")}
          expectedHours={r.plan.modelled}
          guardrails={mine.guardrails.map((g) => g.label).join("; ")}
          reviewBy="Two weeks on"
          versions={`${d.versions.story} · ${d.versions.model} · ${d.versions.taxonomy}`}
          sources={b.sources}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the Week Review
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Map the week again
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab}, story {d.versions.story}, rubric {d.versions.rubric}, model {d.versions.model}, taxonomy {d.versions.taxonomy}. Every
        attempt is kept.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The Week Review
// ---------------------------------------------------------------------------------------------

/** Prints the Week Review alone, using the Hub's print rule for a decision sheet (globals.css). */
function printReview() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function WeekReview({
  title,
  period,
  r,
  inputs,
  change,
  owner,
  expectedHours,
  guardrails,
  reviewBy,
  unknowns,
  notes,
  versions,
  sources = [],
}: {
  title: string;
  period: string;
  r: WorkloadResult;
  inputs: WorkloadInputs;
  change: string;
  owner: string;
  expectedHours: number | null;
  guardrails: string;
  reviewBy: string;
  unknowns?: string;
  notes?: string;
  versions: string;
  sources?: { title: string; url: string }[];
}) {
  const unmeasured = inputs.weeks.flatMap((w) => w.tasks.filter((t) => t.minutes === "unknown").map((t) => `${t.label} (${w.label})`));
  const mix = CATEGORY_ORDER.map((c) => [c, r.avgByCategory[c]] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <section className="growth-sheet rounded-2xl bg-bg p-4 ring-1 ring-line" aria-label={title}>
      <p className={kicker}>{title}</p>
      <h5 className="mt-1 font-serif text-xl font-semibold">{period}</h5>
      <p className="text-sm text-ink-muted">
        {r.sample} {r.sample === 1 ? "week" : "weeks"} sampled ({r.weeks.map((w) => `${w.label}: ${WEEK_KINDS[w.kind].toLowerCase()}`).join("; ")}) ·{" "}
        {EVIDENCE[r.evidence]} · {versions}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-semibold">Work mix{r.sample > 1 ? " (average a week)" : ""}</p>
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Hours</th>
              </tr>
            </thead>
            <tbody>
              {mix.map(([c, v]) => (
                <tr key={c}>
                  <td>{CATEGORIES[c]}</td>
                  <td>{round1(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-muted">
            Observed {hrs(r.observed.min)}
            {r.sample > 1 ? `–${hrs(r.observed.max)}` : ""} against {hrs(r.capacity.min)}
            {r.capacity.spread ? `–${hrs(r.capacity.max)}` : ""} capacity.
          </p>
        </div>
        <div>
          <p className="font-semibold">Main sources of pressure</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {r.findings.slice(0, 5).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 font-semibold">Unknowns</p>
      <p className="text-sm">{[unknowns, unmeasured.length ? `Not measured: ${unmeasured.join(", ")}.` : ""].filter(Boolean).join(" ") || "None recorded."}</p>
      <p className="mt-3 font-semibold">The change</p>
      <p className="text-sm">{change || "Not chosen yet."}</p>
      <p className="text-sm">
        <strong>Owner:</strong> {owner || "not named yet"} · <strong>Hours it should affect:</strong>{" "}
        {expectedHours === null ? "not estimated" : `${hrs(expectedHours)} a week (modelled, not realised)`}
      </p>
      <p className="mt-2 text-sm">
        <strong>Quality guardrails:</strong> {guardrails || "set them: overdue reviews, callback times, escalation response"}
      </p>
      {notes && <p className="mt-2 whitespace-pre-line text-sm">{notes}</p>}
      <p className="mt-2 text-sm">
        <strong>Review date:</strong> {reviewBy || "set one, and look again before deciding about recruitment"}
      </p>
      {sources.length > 0 && <p className="mt-2 text-xs text-ink-muted">Sources: {sources.map((x) => x.title).join("; ")}.</p>}
      <p className="mt-1 text-xs text-ink-muted">A planning account of the work, not a productivity score, a billing code or a staffing verdict.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Editing figures
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

/** Minutes, or "not measured": two different things from a blank, and from zero. */
function DurationField({ value, onChange, label }: { value: Duration; onChange: (v: Duration) => void; label: string }) {
  const unknown = value === "unknown";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      <label className="flex flex-col gap-1">
        <span>
          Minutes each <span className="font-normal text-ink-muted">(min)</span>
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={5}
          className={small}
          disabled={unknown}
          value={typeof value === "number" ? value : ""}
          aria-label={`${label}: minutes each`}
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
        Not measured
      </label>
    </div>
  );
}

function errorFor(errors: InputError[], field: string) {
  return errors.find((e) => e.field === field)?.message;
}

function WeekEditor({ w, errors, onChange, onRemove }: { w: ObservedWeek; errors: InputError[]; onChange: (w: ObservedWeek) => void; onRemove?: () => void }) {
  const setTask = (id: string, patch: Partial<Task>) => onChange({ ...w, tasks: w.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <fieldset className={box}>
      <legend className="sr-only">{w.label}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Week
          <input className={cx(small, "w-48")} value={w.label} onChange={(e) => onChange({ ...w, label: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          What kind of week
          <select className={cx(small, "w-48")} value={w.kind} onChange={(e) => onChange({ ...w, kind: e.target.value as WeekKind })}>
            {(Object.keys(WEEK_KINDS) as WeekKind[]).map((k) => (
              <option key={k} value={k}>
                {WEEK_KINDS[k]}
              </option>
            ))}
          </select>
        </label>
        {onRemove && (
          <button type="button" className="min-h-10 text-sm font-semibold text-danger" onClick={onRemove}>
            Remove this week
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField
          label="Team’s rostered hours"
          unit="h"
          value={w.rostered}
          onChange={(v) => onChange({ ...w, rostered: v })}
          error={errorFor(errors, `week.${w.id}.rostered`)}
        />
        <NumField label="Leave" unit="h" value={w.leave} onChange={(v) => onChange({ ...w, leave: v })} error={errorFor(errors, `week.${w.id}.leave`)} />
        <NumField
          label="Other unavailability"
          unit="h"
          value={w.unavailable}
          onChange={(v) => onChange({ ...w, unavailable: v })}
          error={errorFor(errors, `week.${w.id}.unavailable`)}
        />
        <NumField label="Overdue or displaced tasks" unit="count" step={1} value={w.overdue} onChange={(v) => onChange({ ...w, overdue: v })} />
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        One row per kind of work: how many times, and the observed average minutes. Mark “not measured” rather than guessing. Duties like training and meetings
        go here as tasks, once; they’re not taken off capacity again.
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {w.tasks.map((t) => (
          <li key={t.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_6rem_8rem]">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold md:col-span-1">
                What (no names)
                <input className={small} value={t.label} onChange={(e) => setTask(t.id, { label: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Primary category
                <select className={small} value={t.category} onChange={(e) => setTask(t.id, { category: e.target.value as Category })}>
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIES[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Planned?
                <select className={small} value={t.planned} onChange={(e) => setTask(t.id, { planned: e.target.value as PlannedState })}>
                  {(Object.keys(PLANNED) as PlannedState[]).map((p) => (
                    <option key={p} value={p}>
                      {PLANNED[p]}
                    </option>
                  ))}
                </select>
              </label>
              <NumField
                label="How many"
                unit="times"
                step={1}
                value={t.count}
                onChange={(v) => setTask(t.id, { count: v })}
                error={errorFor(errors, `task.${w.id}.${t.id}.count`)}
              />
              <DurationField label={t.label} value={t.minutes} onChange={(v) => setTask(t.id, { minutes: v })} />
            </div>
            {errorFor(errors, `task.${w.id}.${t.id}.minutes`) && <p className="mt-1 text-xs text-danger">{errorFor(errors, `task.${w.id}.${t.id}.minutes`)}</p>}
            <details className="mt-2">
              <summary className="min-h-10 cursor-pointer text-sm font-semibold">
                Causes, rework and owner
                <span className="font-normal text-ink-muted">
                  {" "}
                  · {t.causes.map((c) => CAUSES[c].toLowerCase()).join(", ") || "no cause"} · {REWORK[t.rework].toLowerCase()}
                </span>
              </summary>
              <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <fieldset className="text-sm">
                  <legend className="text-xs font-semibold">Causes (an overlay: the time still counts once)</legend>
                  <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                    {CAUSE_ORDER.map((c) => (
                      <label key={c} className="flex min-h-9 items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-action)]"
                          checked={t.causes.includes(c)}
                          onChange={(e) => setTask(t.id, { causes: e.target.checked ? [...t.causes, c] : t.causes.filter((y) => y !== c) })}
                        />
                        {CAUSES[c]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Rework status (set by a person, after review)
                  <select className={small} value={t.rework} onChange={(e) => setTask(t.id, { rework: e.target.value as ReworkStatus })}>
                    {(Object.keys(REWORK) as ReworkStatus[]).map((x) => (
                      <option key={x} value={x}>
                        {REWORK[x]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Duty owner (a planning label)
                  <select className={small} value={t.owner} onChange={(e) => setTask(t.id, { owner: e.target.value as Owner })}>
                    {(Object.keys(OWNERS) as Owner[]).map((x) => (
                      <option key={x} value={x}>
                        {OWNERS[x]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
            <button
              type="button"
              className="mt-1 min-h-10 text-sm font-semibold text-danger"
              onClick={() => onChange({ ...w, tasks: w.tasks.filter((x) => x.id !== t.id) })}
            >
              Remove this row
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={w.tasks.length >= 80}
        onClick={() =>
          onChange({
            ...w,
            tasks: [
              ...w.tasks,
              {
                id: nextId(
                  w.tasks.map((t) => t.id),
                  "row",
                ),
                label: "",
                category: "other",
                planned: "unplanned",
                causes: [],
                rework: "uncertain",
                owner: "partner",
                day: null,
                count: null,
                minutes: null,
              },
            ],
          })
        }
      >
        <Icon name="plus" className="size-4" /> Add a row
      </button>
    </fieldset>
  );
}

/** The next unused id like "row-3": deterministic, never random, so render stays pure. */
function nextId(used: string[], prefix: string) {
  for (let k = 1; ; k++) if (!used.includes(`${prefix}-${k}`)) return `${prefix}-${k}`;
}

const PLAN_FIELDS: [keyof ForwardPlan, string, string][] = [
  ["rostered", "Team’s rostered hours", "h"],
  ["leave", "Leave", "h"],
  ["unavailable", "Other unavailability", "h"],
  ["recurring", "Recurring client work", "h"],
  ["starts", "Planned starts", "starts"],
  ["hoursPerStart", "Onboarding hours per start", "h"],
  ["exceptional", "Known exceptional work", "h"],
  ["duties", "Team and operational duties", "h"],
  ["reserve", "Reserve for the unexpected", "h"],
];

function PlanEditor({ plan, errors, onChange }: { plan: ForwardPlan; errors: InputError[]; onChange: (p: ForwardPlan) => void }) {
  return (
    <fieldset className={box}>
      <legend className="sr-only">Next week’s plan</legend>
      <p className={kicker}>Next week’s plan</p>
      <p className="mt-1 text-sm text-ink-muted">Kept apart from what was observed. Each duty appears once: here as demand, never also off capacity.</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLAN_FIELDS.map(([k, label, unit]) => (
          <NumField
            key={k}
            label={label}
            unit={unit}
            step={k === "starts" ? 1 : 0.5}
            value={plan[k]}
            onChange={(v) => onChange({ ...plan, [k]: v })}
            error={errorFor(errors, `plan.${k}`)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ChangesEditor({ list, errors, onChange }: { list: Intervention[]; errors: InputError[]; onChange: (l: Intervention[]) => void }) {
  const set = (id: string, patch: Partial<Intervention>) => onChange(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <fieldset className={box}>
      <legend className="sr-only">Changes to test</legend>
      <p className={kicker}>Changes to test</p>
      <p className="mt-1 text-sm text-ink-muted">
        Name the cause or category a change touches and a conservative estimate. It only reduces tasks someone reviewed as avoidable rework (or, for moving a
        duty, tasks whose owner isn’t you), never more than was observed.
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {list.map((x) => (
          <li key={x.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold md:col-span-1">
                The change
                <input className={small} value={x.label} onChange={(e) => set(x.id, { label: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Kind
                <select
                  className={small}
                  value={x.kind}
                  onChange={(e) => {
                    const kind = e.target.value as InterventionKind;
                    set(x.id, { kind, ...(kind === "cover" ? { coverHours: x.coverHours ?? null } : {}) });
                  }}
                >
                  {(Object.keys(INTERVENTION_KINDS) as InterventionKind[]).map((k) => (
                    <option key={k} value={k}>
                      {INTERVENTION_KINDS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Cause it touches
                <select className={small} value={x.cause ?? ""} onChange={(e) => set(x.id, { cause: (e.target.value || undefined) as Cause | undefined })}>
                  <option value="">Any</option>
                  {CAUSE_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CAUSES[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Category it touches
                <select
                  className={small}
                  value={x.category ?? ""}
                  onChange={(e) => set(x.id, { category: (e.target.value || undefined) as Category | undefined })}
                >
                  <option value="">Any</option>
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIES[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              {x.kind === "cover" ? (
                <NumField
                  label="Cover a week"
                  unit="h"
                  value={x.coverHours ?? null}
                  onChange={(v) => set(x.id, { coverHours: v })}
                  error={errorFor(errors, `change.${x.id}.coverHours`)}
                />
              ) : x.kind === "hiring" ? (
                <p className="col-span-2 text-sm text-ink-muted">Not modelled here: test it in Plan my business or the Hiring Runway lab.</p>
              ) : (
                <>
                  <NumField
                    label="Occurrences a week"
                    unit="times"
                    step={1}
                    value={x.occurrences}
                    onChange={(v) => set(x.id, { occurrences: v })}
                    error={errorFor(errors, `change.${x.id}.occurrences`)}
                  />
                  <NumField
                    label="Minutes each"
                    unit="min"
                    step={5}
                    value={x.minutesEach}
                    onChange={(v) => set(x.id, { minutesEach: v })}
                    error={errorFor(errors, `change.${x.id}.minutesEach`)}
                  />
                </>
              )}
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Owner (a role is fine)
                <input className={small} value={x.owner} onChange={(e) => set(x.id, { owner: e.target.value })} />
              </label>
              <label className="flex min-h-10 items-center gap-2 self-end text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={x.active}
                  onChange={(e) => set(x.id, { active: e.target.checked })}
                />
                In the plan
              </label>
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold">
              What evidence would show it worked
              <input className={small} value={x.evidence} onChange={(e) => set(x.id, { evidence: e.target.value })} />
            </label>
            <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-danger" onClick={() => onChange(list.filter((y) => y.id !== x.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={list.length >= 10}
        onClick={() =>
          onChange([
            ...list,
            {
              id: nextId(
                list.map((x) => x.id),
                "change",
              ),
              label: "",
              kind: "process",
              occurrences: null,
              minutesEach: null,
              owner: "",
              evidence: "",
              active: false,
            },
          ])
        }
      >
        <Icon name="plus" className="size-4" /> Add a change
      </button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Map my team's week
// ---------------------------------------------------------------------------------------------

type Review = {
  period: string;
  unknowns: string;
  change: string;
  owner: string;
  expectedHours: Num;
  guardrails: string;
  reviewBy: string;
  notes: string;
  followUp: { helped: "" | "yes" | "partly" | "no" | "not-tried"; note: string };
};
const blankReview = (): Review => ({
  period: "",
  unknowns: "",
  change: "",
  owner: "",
  expectedHours: null,
  guardrails: "",
  reviewBy: "",
  notes: "",
  followUp: { helped: "", note: "" },
});
type ScenarioSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string };
type Scenario = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: WorkloadInputs;
  review: Review;
  previous: { number: number; savedAt: string; review: Review; snapshot: { observedMin?: number; observedMax?: number; reworkAvg?: number } } | null;
  earlierModel: boolean;
};
const HELPED_LABELS: [Review["followUp"]["helped"], string][] = [
  ["", "Not answered yet"],
  ["yes", "Yes, it helped"],
  ["partly", "Partly"],
  ["no", "No"],
  ["not-tried", "We didn’t try it"],
];

function TeamMapper({ orgName, links }: { orgName: string; links: WorkloadBlock["links"] }) {
  const home = useApi<{ access: { orgName: string } | null; scenarios: ScenarioSummary[] }>("/api/tools/workload");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<WorkloadInputs | null>(null);
  const [baseline, setBaseline] = useState<WorkloadInputs | null>(null);
  const [review, setReview] = useState<Review>(blankReview());
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<View>("principal");
  const [inspected, setInspected] = useState<string[]>([]);

  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await api<Scenario>(`/api/tools/workload?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}`);
      setScenario(s);
      setInputs(s.inputs);
      setBaseline(s.inputs);
      setReview(s.review);
      setName(s.name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startBlank = () => {
    const fresh = blankInputs();
    setScenario(null);
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
      const s = await api<Scenario>("/api/tools/workload", { body: { id: scenario?.id, name, inputs, review, note } });
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
  const errors = inputs ? validateInputs(inputs) : [];
  const r = inputs && !errors.length ? calculate(inputs) : null;
  const changes = inputs && baseline ? inputChanges(baseline, inputs) : [];
  const resultDelta = r && baseline && !validateInputs(baseline).length ? resultChanges(calculate(baseline), r) : [];
  const hiring = links.find((l) => /hir/i.test(l.label + l.href));
  const planner = links.find((l) => l.href.startsWith("/tools/"));
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <p>
          <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these maps, checked on the server for
          every read and save. Trilogy Care staff and course authors can’t see them, and they never appear in anyone’s dashboard.
        </p>
        <p className="mt-1">
          <strong>What it’s for:</strong> planning the service and the work, not judging anyone. Enter <strong>aggregate</strong> hours by kind of work from a
          sample of recent weeks: no names, no calendars, no messages, no timesheets. If your team is one person, treat the figures with the same care as a
          personal record, and agree with them what’s entered.
        </p>
        <p className="mt-1">
          <strong>Kept:</strong> nothing until you choose Save. Each save is a new version, kept for your business until you ask for it to be removed.
        </p>
      </div>
      {!inputs && (
        <div className="flex flex-col gap-3">
          {list.length > 0 && (
            <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => load(list[0].id)}>
              Resume my map: {list[0].name}
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
            Start a blank map
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
          {scenario?.previous?.review.change && (
            <div className={box}>
              <p className={kicker}>Last time (version {scenario.previous.number})</p>
              <p className="mt-1 text-sm">
                You chose: <strong>{scenario.previous.review.change}</strong>
                {scenario.previous.review.owner ? ` (owner: ${scenario.previous.review.owner})` : ""}, expecting it to affect{" "}
                {scenario.previous.review.expectedHours === null ? "an unestimated number of" : hrs(scenario.previous.review.expectedHours)} hours a week.
                {typeof scenario.previous.snapshot.reworkAvg === "number" && r
                  ? ` Reviewed rework was ${hrs(scenario.previous.snapshot.reworkAvg)} a week then; it’s ${hrs(r.weeks.reduce((a, w) => a + w.reworkTagged, 0) / Math.max(1, r.sample))} now.`
                  : ""}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Did it help?
                  <select
                    className={small}
                    value={review.followUp.helped}
                    onChange={(e) => setReview((x) => ({ ...x, followUp: { ...x.followUp, helped: e.target.value as Review["followUp"]["helped"] } }))}
                  >
                    {HELPED_LABELS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  What you saw
                  <input
                    className={small}
                    value={review.followUp.note}
                    onChange={(e) => setReview((x) => ({ ...x, followUp: { ...x.followUp, note: e.target.value } }))}
                  />
                </label>
              </div>
            </div>
          )}
          <Perspective value={view} onChange={setView} names={["Owner’s view: where the hours went", "Coordinator’s view: how the week arrived"]} />
          <MapAndSummary inputs={inputs} base={baseline ?? undefined} view={view} inspected={inspected} onInspect={(x) => setInspected((y) => [...y, x])} />
          {r && <PlanTable r={r} inputs={inputs} />}
          <details className={box} open={!r}>
            <summary className="min-h-11 cursor-pointer font-semibold">Enter or edit the figures</summary>
            <div className="mt-3 flex flex-col gap-3">
              {inputs.weeks.map((w, k) => (
                <WeekEditor
                  key={w.id}
                  w={w}
                  errors={errors}
                  onChange={(next) => setInputs((x) => (x ? { ...x, weeks: x.weeks.map((y, j) => (j === k ? next : y)) } : x))}
                  onRemove={inputs.weeks.length > 1 ? () => setInputs((x) => (x ? { ...x, weeks: x.weeks.filter((_, j) => j !== k) } : x)) : undefined}
                />
              ))}
              <button
                type="button"
                className={cx(secondary, "self-start")}
                disabled={inputs.weeks.length >= 8}
                onClick={() =>
                  setInputs((x) => {
                    if (!x) return x;
                    const id = nextId(
                      x.weeks.map((w) => w.id),
                      "w",
                    );
                    return { ...x, weeks: [...x.weeks, blankWeek(id, `Week ${x.weeks.length + 1}`)] };
                  })
                }
              >
                <Icon name="plus" className="size-4" /> Add another sampled week
              </button>
              <PlanEditor plan={inputs.plan} errors={errors} onChange={(p) => setInputs((x) => (x ? { ...x, plan: p } : x))} />
              <ChangesEditor list={inputs.interventions} errors={errors} onChange={(l) => setInputs((x) => (x ? { ...x, interventions: l } : x))} />
              <fieldset className={box}>
                <legend className="sr-only">Quality guardrails</legend>
                <p className={kicker}>Quality guardrails</p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {inputs.guardrails.map((g) => (
                    <NumField
                      key={g.id}
                      label={g.label}
                      unit={g.unit}
                      step={1}
                      value={g.value}
                      onChange={(v) => setInputs((x) => (x ? { ...x, guardrails: x.guardrails.map((y) => (y.id === g.id ? { ...y, value: v } : y)) } : x))}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </details>
          {(changes.length > 0 || resultDelta.length > 0) && (
            <div className={box}>
              <p className={kicker}>What changed since {scenario ? `version ${scenario.version}` : "you started"}?</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {[...changes, ...resultDelta].slice(0, 20).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <fieldset className={box}>
            <legend className="sr-only">Week Review</legend>
            <p className={kicker}>Your Week Review</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["period", "Period sampled", "e.g. two weeks in March"],
                  ["change", "The change you’ll try", ""],
                  ["owner", "Owner (a role is fine)", ""],
                  ["guardrails", "Quality guardrails you’ll watch", "Overdue reviews, callback times, escalation response"],
                ] as const
              ).map(([k, label, placeholder]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold">
                  {label}
                  <input className={small} value={review[k]} placeholder={placeholder} onChange={(e) => setReview((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
              <NumField
                label="Hours a week it should affect"
                unit="h"
                value={review.expectedHours}
                onChange={(v) => setReview((x) => ({ ...x, expectedHours: v }))}
              />
              {r && r.plan.modelled > 0 && review.expectedHours === null && (
                <button type="button" className={cx(secondary, "self-end")} onClick={() => setReview((x) => ({ ...x, expectedHours: r.plan.modelled }))}>
                  Use the modelled {hrs(r.plan.modelled)}
                </button>
              )}
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review date
                <input type="date" className={small} value={review.reviewBy} onChange={(e) => setReview((x) => ({ ...x, reviewBy: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Unknowns (what you couldn’t measure or aren’t sure of)
                <textarea
                  className={cx(small, "min-h-16 py-2")}
                  value={review.unknowns}
                  onChange={(e) => setReview((x) => ({ ...x, unknowns: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Notes (who agreed what, who you’ve told)
                <textarea className={cx(small, "min-h-16 py-2")} value={review.notes} onChange={(e) => setReview((x) => ({ ...x, notes: e.target.value }))} />
              </label>
            </div>
          </fieldset>
          {r && (
            <WeekReview
              title="Week Review (private)"
              period={review.period || "Period not set"}
              r={r}
              inputs={inputs}
              change={review.change}
              owner={review.owner}
              expectedHours={review.expectedHours}
              guardrails={review.guardrails}
              reviewBy={review.reviewBy}
              unknowns={review.unknowns}
              notes={review.notes}
              versions={`${scenario ? `${scenario.name}, version ${scenario.version}` : "unsaved"} · ${MODEL_VERSION}`}
            />
          )}
          {r && r.plan.headroomAfter < 0 && r.evidence !== "single" && (hiring || planner) && (
            <p className="text-sm">
              If a gap remains after the changes, and it lasts, test recruitment with your cash and margin in{" "}
              {planner && (
                <Link href={planner.href} className="font-semibold text-accent underline underline-offset-2">
                  {planner.label}
                </Link>
              )}
              . Nothing is carried there automatically: you’d take these figures only if you choose to.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!scenario && (
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Map name
                <input className={cx(small, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="March weeks" />
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
              <button type="button" className={secondary} onClick={printReview}>
                <Icon name="print" className="size-4" /> Print or save the Week Review
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
