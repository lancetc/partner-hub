"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { HiringBlock } from "@/lib/magazine";
import { dollars, forecast, pct, planningWindow, type Forecast, type HiringOption } from "@/lib/hiringModel";
import {
  ACTIONS,
  BAND_LABELS,
  buildHiringDebrief,
  compareBeforeAfter,
  compareOptions,
  decisionProblems,
  DIMENSIONS,
  emptyDecision,
  emptyHiringState,
  expectedCase,
  exploreInputs,
  FICTIONAL_NOTICE,
  FUNDING_NOTE,
  INPUTS,
  MISCONCEPTIONS,
  noneOption,
  planSummary,
  RATING,
  STAGES,
  type Comparison,
  type Decision,
  type HiringDebrief,
  type HiringState,
} from "@/lib/hiringRunway";
import type { HiringView } from "@/server/hiringRunway";
import { Icon } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Hiring Runway Decision Lab (docs/hiring-runway-lab.md). A decision inside Maya's story, not a finance app dropped into
  the page: first her question and a snapshot, then the lab opens. The new information only arrives once a first plan is
  committed, and the debrief only once the revised plan is in (the server holds both back). Every figure comes from the
  shared model; risks are in words as well as colour; each chart has a sentence and a table; nothing animates figures.

  In the editor's preview it runs against the block as written, computes everything locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const field = "min-h-11 rounded-xl border border-line-strong bg-surface px-3";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const RISK = {
  service: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
  reserve: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  ok: "bg-tealtint text-ink",
};

type Revealed = NonNullable<HiringView["event"]>;

export function HiringRunwayLab({ block: b, ctx }: { block: HiringBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/hiring`;
  const loaded = useApi<HiringView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<HiringState | null>(ctx.preview ? emptyHiringState(b) : null);
  const [event, setEvent] = useState<Revealed | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [debrief, setDebrief] = useState<HiringDebrief | null>(null);
  const [meta, setMeta] = useState<{ attemptNo: number; earlierCase: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  // The debrief was reached in this visit (not just reopened): the completion and "feedback read" are logged once.
  const justFinished = useRef(false);

  const take = (v: HiringView) => {
    setS(v.state);
    setEvent(v.event);
    setComparison(v.comparison);
    setDebrief(v.debrief);
    setMeta({ attemptNo: v.attemptNo, earlierCase: v.earlierCase });
  };
  if (!ctx.preview && loaded.data && s === null) take(loaded.data);

  // Progress is saved as it happens (debounced): evidence opened, the case and option looked at, a plan being drafted.
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
    ctx.activity(b.id, { outcome: "finished", score: debrief.score, total: 12 });
    ctx.engaged(b.id);
    api(url, { body: { blockId: b.id, action: "viewed" } }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debrief]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change = (fn: (prev: HiringState) => HiringState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());

  /** Commits a plan: in the preview, locally; for a learner, through the server, which then sends what's next. */
  async function commit(kind: "initial" | "revised", d: Decision) {
    setProblem(null);
    const problems = decisionProblems(b, d, kind);
    if (problems.length) return setProblem(`Not yet. ${problems.join(" ")}`);
    if (ctx.preview) {
      const next: HiringState = kind === "initial" ? { ...s!, stage: 2, initial: d, revised: d } : { ...s!, stage: 3, revised: d };
      setS(next);
      if (kind === "initial") {
        setEvent({ title: b.event.title, story: b.event.story, source: b.event.source, changed: b.event.changed, adjustments: b.event.adjustments });
        setComparison(compareBeforeAfter(b, d));
      } else setDebrief(buildHiringDebrief(b, next));
      return focusTop();
    }
    setBusy(true);
    try {
      dirty.current = false;
      await api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
      justFinished.current = kind === "revised";
      take(await api<HiringView>(url, { body: { blockId: b.id, action: kind === "initial" ? "decide" : "revise", decision: d } }));
      focusTop();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setProblem(null);
    if (ctx.preview) {
      setS({ ...emptyHiringState(b), retries: s!.retries + 1 });
      setEvent(null);
      setComparison(null);
      setDebrief(null);
      return focusTop();
    }
    setBusy(true);
    try {
      take(await api<HiringView>(url, { body: { blockId: b.id, action: "retry" } }));
      focusTop();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const stageNo = s.stage === 0 ? 0 : s.stage === 1 ? (s.initial ? 3 : 2) : s.stage === 2 ? 4 : 5;
  return (
    <Shell b={b} stage={stageNo} attemptNo={meta?.attemptNo ?? 0}>
      <h4 ref={top} tabIndex={-1} className="sr-only">
        {STAGES[stageNo]}
      </h4>
      {meta?.earlierCase && (
        <p className="mb-3 rounded-2xl bg-muted px-4 py-2 text-sm">
          This attempt was made on an earlier version of the case. Try another approach to use the current one.
        </p>
      )}
      <Story b={b} />
      {s.stage === 0 ? (
        <div className="mt-4">
          <Snapshot b={b} />
          <button type="button" className={cx(primary, "mt-4")} onClick={() => change((p) => ({ ...p, stage: 1 }))}>
            <Icon name="sliders" className="size-5" /> Explore the options
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <Evidence b={b} s={s} change={change} />
          <Explore b={b} s={s} change={change} event={s.stage >= 2 ? event : null} />
          {s.stage === 1 && (
            <DecisionPanel
              key="initial"
              b={b}
              kind="initial"
              start={s.initial ?? emptyDecision()}
              onDraft={(d) => change((p) => ({ ...p, initial: d }))}
              onCommit={(d) => void commit("initial", d)}
              busy={busy}
            />
          )}
          {s.stage >= 2 && event && <EventReveal b={b} event={event} comparison={comparison} />}
          {s.stage === 2 && (
            <DecisionPanel
              key="revised"
              b={b}
              kind="revised"
              start={s.revised ?? s.initial ?? emptyDecision()}
              onDraft={(d) => change((p) => ({ ...p, revised: d }))}
              onCommit={(d) => void commit("revised", d)}
              busy={busy}
            />
          )}
          {s.stage === 3 && debrief && <Debrief b={b} d={debrief} s={s} />}
          {problem && (
            <p role="alert" className="rounded-2xl bg-[#fde2e0] px-4 py-3 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]">
              {problem}
            </p>
          )}
          {s.stage === 3 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={secondary} onClick={() => void retry()} disabled={busy}>
                <Icon name="refresh" className="size-4" /> Try another approach
              </button>
              <span className="text-sm text-ink-muted">
                {b.assessment === "assessed"
                  ? "A fresh attempt from the story. Your first finished attempt is the one recorded; this one is practice."
                  : "A fresh attempt from the story. This one is kept."}
              </span>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ b, children, stage, attemptNo = 0 }: { b: HiringBlock; children: React.ReactNode; stage?: number; attemptNo?: number }) {
  return (
    <section
      aria-label={`Hiring Runway Decision Lab: ${b.title}`}
      className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7"
    >
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="people" className="size-5" /> Decision lab
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">Fictional case · {b.storyVersion}</span>
        {attemptNo > 1 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">Attempt {attemptNo}</span>}
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{FICTIONAL_NOTICE}</p>
      {stage !== undefined && (
        <ol aria-label="Where you are" className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {STAGES.map((label, i) => (
            <li
              key={label}
              aria-current={i === stage ? "step" : undefined}
              className={cx(
                "rounded-full px-2.5 py-1 font-semibold",
                i === stage ? "bg-action text-on-action" : i < stage ? "bg-tealtint" : "bg-muted text-ink-muted",
              )}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Maya and her question, always on screen. */
function Story({ b }: { b: HiringBlock }) {
  const st = b.story;
  return (
    <div className={cx(box, "flex flex-col gap-3 sm:flex-row sm:items-start")}>
      {/* Her face first: the person whose business it is (the character photo library, found by name). */}
      {st.character && <CharacterPortrait name={st.character} size="lg" />}
      <div className="min-w-0">
        <p className={kicker}>{st.role || "The story"}</p>
        <p className="mt-1">{st.situation}</p>
        {st.dilemma && (
          <p className="mt-2 font-serif text-xl font-semibold">
            {st.character}: “{st.dilemma}”
          </p>
        )}
      </div>
    </div>
  );
}

/** A compact business snapshot before the lab opens. */
function Snapshot({ b }: { b: HiringBlock }) {
  const i = b.inputs;
  const count = i.bands.standard.count + i.bands.higher.count + i.bands.intensive.count;
  const items: [string, string][] = [
    ["Active participants", String(count)],
    ["Coordinators", `${i.currentFte} FTE`],
    ["Each month", `+${i.newPerMonth} new, −${i.exitsPerMonth} leaving`],
    ["Cash today", dollars(i.openingCash)],
    ["Reserve she keeps", dollars(i.reserve)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-muted px-3 py-2">
          <dt className="text-xs font-semibold text-ink-muted">{k}</dt>
          <dd className="font-serif text-lg font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The authored evidence cards: opened one at a time, reopenable any time. */
function Evidence({ b, s, change }: { b: HiringBlock; s: HiringState; change: (fn: (p: HiringState) => HiringState) => void }) {
  return (
    <section aria-labelledby={`${b.id}-ev`}>
      <h4 id={`${b.id}-ev`} className="font-serif text-xl font-semibold">
        The evidence
      </h4>
      <p className="text-sm text-ink-muted">Open each one: they’re what the forecast is built from. You can come back to them at any time.</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {b.cards.map((e) => {
          const seen = s.opened.includes(e.id);
          return (
            <details
              key={e.id}
              className={box}
              onToggle={(ev) => {
                if ((ev.currentTarget as HTMLDetailsElement).open && !seen) change((p) => ({ ...p, opened: [...p.opened, e.id] }));
              }}
            >
              <summary className="flex min-h-11 cursor-pointer items-start gap-2 font-semibold">
                <Icon
                  name={e.kind === "agreement" ? "doc" : e.kind === "workload" ? "clock" : e.kind === "cash" ? "money" : "info"}
                  className="mt-0.5 size-5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  {e.title}
                  <span className="block text-xs font-normal text-ink-muted">
                    {e.source}
                    {seen ? " · opened" : ""}
                  </span>
                </span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {e.body
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
              {e.kind === "agreement" && <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">{FUNDING_NOTE}</p>}
            </details>
          );
        })}
      </div>
    </section>
  );
}

/** Assumptions, growth cases, the capacity chart, the four option cards, money and the monthly table. */
function Explore({ b, s, change, event }: { b: HiringBlock; s: HiringState; change: (fn: (p: HiringState) => HiringState) => void; event: Revealed | null }) {
  const [money, setMoney] = useState<"operating" | "cash">("cash");
  const [withEvent, setWithEvent] = useState(true);
  // Open beside the charts on a wide screen; a short "Change assumptions" panel to open on a phone.
  const [assumptionsOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const inputs = exploreInputs(b, s);
  const extra = event && withEvent ? event.adjustments : [];
  const cards = compareOptions(b, s.growthId, inputs, extra);
  const g = b.growth.find((x) => x.id === s.growthId) ?? expectedCase(b);
  const none = forecast(inputs, noneOption(b), g, extra);
  const selected = cards.find((c) => c.option.id === s.optionId) ?? cards[0];
  const hire = b.options.find((o) => o.kind === "hire");
  const planWindow = planningWindow(none.firstPressure, hire?.leadMonths ?? 0, hire?.rampMonths ?? 0);
  const setGrowth = (id: string) => change((p) => ({ ...p, growthId: id, compared: p.compared.includes(id) ? p.compared : [...p.compared, id] }));
  // Looking at the option cards counts as comparing them under this case.
  useEffect(() => {
    if (!s.compared.includes(s.growthId)) change((p) => ({ ...p, compared: [...p.compared, p.growthId] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.growthId]);

  return (
    <section aria-labelledby={`${b.id}-ex`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 id={`${b.id}-ex`} className="font-serif text-xl font-semibold">
            Explore the options
          </h4>
          <p className="text-sm text-ink-muted">Twelve fictional months. Change the growth case or an assumption and every figure is worked out again.</p>
        </div>
        {event && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--action)]" checked={withEvent} onChange={(e) => setWithEvent(e.target.checked)} />
            Include the new information
          </label>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Growth case</legend>
        <div className="flex flex-wrap gap-2">
          {b.growth.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={x.id === s.growthId}
              onClick={() => setGrowth(x.id)}
              className={cx(
                "min-h-11 rounded-full border px-4 font-semibold",
                x.id === s.growthId ? "border-action bg-action text-on-action" : "border-line-strong bg-surface",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{g.describe}</p>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <details className={cx(box, "self-start")} open={assumptionsOpen}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <Icon name="sliders" className="size-5" /> Change assumptions
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {b.editable.map((e) => {
              const v = (s.edits[e.key] ?? b.inputs[e.key]) as number;
              const id = `${b.id}-${e.key}`;
              const set = (n: number) => change((p) => ({ ...p, edits: { ...p.edits, [e.key]: Math.max(e.min, Math.min(e.max, n)) } }));
              return (
                <div key={e.key}>
                  <label htmlFor={id} className="text-sm font-semibold">
                    {INPUTS[e.key].label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="number"
                      min={e.min}
                      max={e.max}
                      step={e.step}
                      value={v}
                      onChange={(ev) => Number.isFinite(ev.target.valueAsNumber) && set(ev.target.valueAsNumber)}
                      className={cx(field, "w-28")}
                    />
                    <span className="text-xs text-ink-muted">{INPUTS[e.key].unit}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${INPUTS[e.key].label} (${INPUTS[e.key].unit})`}
                    min={e.min}
                    max={e.max}
                    step={e.step}
                    value={v}
                    onChange={(ev) => set(ev.target.valueAsNumber)}
                    className="mt-1 w-full accent-[var(--action)]"
                  />
                </div>
              );
            })}
            {Object.keys(s.edits).length > 0 && (
              <button type="button" className={secondary} onClick={() => change((p) => ({ ...p, edits: {} }))}>
                Back to the case as given
              </button>
            )}
            <p className="text-xs text-ink-muted">What-ifs are for exploring. The debrief reads Maya’s case as given.</p>
          </div>
        </details>

        <div className="flex min-w-0 flex-col gap-4">
          <DecisionCard b={b} none={none} selected={selected} planWindow={planWindow} />
          <CapacityChart b={b} none={none} selected={selected} threshold={inputs.threshold} />
          <div>
            <h5 className="mb-2 font-semibold">Compare the options</h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map(({ option, f }) => (
                <OptionCard
                  key={option.id}
                  option={option}
                  f={f}
                  reserve={inputs.reserve}
                  chosen={option.id === selected.option.id}
                  onChoose={() => change((p) => ({ ...p, optionId: option.id }))}
                />
              ))}
            </div>
          </div>
          <MoneyChart f={selected.f} money={money} setMoney={setMoney} reserve={inputs.reserve} label={selected.option.label} />
          <MonthlyTable f={selected.f} label={selected.option.label} />
        </div>
      </div>
    </section>
  );
}

/** Why the signal: a sentence from the calculated values, never an order. */
function DecisionCard({
  b,
  none,
  selected,
  planWindow,
}: {
  b: HiringBlock;
  none: Forecast;
  selected: { option: HiringOption; f: Forecast };
  planWindow: number | null;
}) {
  const i = b.inputs;
  const o = selected.option;
  const f = selected.f;
  const pressure = none.firstPressure
    ? `With the current team, work goes over the ${Math.round(i.threshold * 100)}% planning threshold in Month ${none.firstPressure}.`
    : `With the current team, work stays under the ${Math.round(i.threshold * 100)}% planning threshold for all twelve months.`;
  const timing =
    o.kind === "hire" && planWindow !== null
      ? ` A ${o.leadMonths}-month search and ${o.rampMonths}-month ramp mean planning ${planWindow < 1 ? "is already late: pressure arrives before a new person could be fully productive, so an interim plan is needed" : `should start by Month ${planWindow}`}.`
      : "";
  const option =
    f.monthsAbove === 0
      ? ` ${o.label} keeps work under the threshold in this case`
      : ` ${o.label} still has ${f.monthsAbove} ${f.monthsAbove === 1 ? "month" : "months"} over the threshold`;
  const money = `, with a 12-month operating result of ${dollars(f.operating12)} and a lowest cash balance of ${dollars(f.lowestCash)} (Month ${f.lowestCashMonth}).`;
  const reserve = f.firstReserveBreach ? ` Cash falls below the ${dollars(i.reserve)} reserve from Month ${f.firstReserveBreach}.` : "";
  return (
    <div className={box} aria-live="polite">
      <p className={kicker}>The signal, for {o.label.toLowerCase()}</p>
      <p className="mt-1">
        {pressure}
        {timing}
        {option}
        {money}
        {reserve}
      </p>
      <p className="mt-1 text-xs text-ink-muted">A window under these fictional assumptions, not a hiring instruction.</p>
    </div>
  );
}

function OptionCard({ option, f, reserve, chosen, onChoose }: { option: HiringOption; f: Forecast; reserve: number; chosen: boolean; onChoose: () => void }) {
  const service = f.monthsAbove > 0;
  const cashRisk = f.lowestCash < reserve;
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={cx(
        "flex flex-col gap-1.5 rounded-2xl p-3 text-left ring-1 transition-colors",
        chosen ? "bg-tealtint ring-2 ring-action" : "bg-surface ring-line hover:bg-muted",
      )}
    >
      <span className="font-semibold">{option.label}</span>
      <span className="text-sm">
        Months over threshold: <strong>{f.monthsAbove}</strong>
      </span>
      <span className="text-sm">
        Lowest cash: <strong>{dollars(f.lowestCash)}</strong>
      </span>
      <span className="text-sm">
        12-month operating result: <strong>{dollars(f.operating12)}</strong>
      </span>
      <span className="mt-1 flex flex-wrap gap-1 text-xs font-semibold">
        {service && <span className={cx("rounded-full px-2 py-0.5", RISK.service)}>Service risk: over threshold from Month {f.firstPressure}</span>}
        {cashRisk && (
          <span className={cx("rounded-full px-2 py-0.5", RISK.reserve)}>
            Reserve risk: below {dollars(reserve)}
            {f.lowestCash < 0 ? ", and negative" : ""}
          </span>
        )}
        {!service && !cashRisk && <span className={cx("rounded-full px-2 py-0.5", RISK.ok)}>Under threshold, above reserve</span>}
      </span>
    </button>
  );
}

const W = 640;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 28 };
const xAt = (m: number) => PAD.l + ((m - 1) / 11) * (W - PAD.l - PAD.r);

/** Current team against the chosen option, as utilisation, with the threshold; a sentence and a table beside it. */
function CapacityChart({
  b,
  none,
  selected,
  threshold,
}: {
  b: HiringBlock;
  none: Forecast;
  selected: { option: HiringOption; f: Forecast };
  threshold: number;
}) {
  const id = useId();
  const vals = [...none.months, ...selected.f.months].map((m) => (m.utilisation === null ? 2 : m.utilisation));
  const max = Math.max(1.2, threshold + 0.1, ...vals.map((v) => Math.min(v, 2.5)));
  const yAt = (v: number) => PAD.t + (1 - Math.min(v, max) / max) * (H - PAD.t - PAD.b);
  const path = (f: Forecast) => f.months.map((m, i) => `${i ? "L" : "M"}${xAt(m.month).toFixed(1)},${yAt(m.utilisation ?? max).toFixed(1)}`).join(" ");
  const summary = `Current team: ${none.firstPressure ? `over the threshold from Month ${none.firstPressure}, ${none.monthsAbove} of 12 months` : "under the threshold all year"}. ${selected.option.label}: ${
    selected.f.monthsAbove ? `${selected.f.monthsAbove} months over, from Month ${selected.f.firstPressure}` : "under the threshold all year"
  }.`;
  return (
    <figure className={box}>
      <figcaption className="font-semibold">Workload against available hours</figcaption>
      <p id={id} className="text-sm">
        {summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-labelledby={id}>
        {[0, 0.5, 1, 1.5, 2]
          .filter((t) => t <= max)
          .map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yAt(t)} y2={yAt(t)} className="stroke-line" strokeWidth={1} />
              <text x={PAD.l - 6} y={yAt(t) + 4} textAnchor="end" className="fill-ink-muted text-[11px]">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={yAt(threshold)}
          y2={yAt(threshold)}
          stroke="currentColor"
          strokeDasharray="6 4"
          strokeWidth={1.5}
          className="text-[#a12d31]"
        />
        <text x={W - PAD.r} y={yAt(threshold) - 5} textAnchor="end" className="fill-[#a12d31] text-[11px] font-semibold">
          Threshold {Math.round(threshold * 100)}%
        </text>
        <path d={path(none)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="2 4" className="text-ink-muted" />
        <path d={path(selected.f)} fill="none" stroke="currentColor" strokeWidth={2.5} className="text-accent" />
        {none.months.map((m) => (
          <text key={m.month} x={xAt(m.month)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
            {m.month}
          </text>
        ))}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <span aria-hidden className="mr-1 inline-block w-6 border-t-2 border-dotted border-ink-muted align-middle" />
          Current team
        </span>
        <span>
          <span aria-hidden className="mr-1 inline-block w-6 border-t-2 border-accent align-middle" />
          {selected.option.label}
        </span>
        <span className="text-ink-muted">Months 1 to 12 along the bottom. “No available capacity” is drawn at the top.</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Work counts every band ({Object.values(BAND_LABELS).join(", ").toLowerCase()}), onboarding for each new participant, and reviews. {b.story.character}’s
        threshold is a case assumption, not a staffing rule.
      </p>
    </figure>
  );
}

/** Operating result (earned) or closing cash (received), month by month, with the reserve. */
function MoneyChart({
  f,
  money,
  setMoney,
  reserve,
  label,
}: {
  f: Forecast;
  money: "operating" | "cash";
  setMoney: (m: "operating" | "cash") => void;
  reserve: number;
  label: string;
}) {
  const id = useId();
  const vals = f.months.map((m) => (money === "cash" ? m.closingCash : m.operating));
  const hi = Math.max(0, reserve, ...vals);
  const lo = Math.min(0, ...vals);
  const yAt = (v: number) => PAD.t + ((hi - v) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const summary =
    money === "cash"
      ? `${label}: lowest cash ${dollars(f.lowestCash)} in Month ${f.lowestCashMonth}${f.firstReserveBreach ? `, below the ${dollars(reserve)} reserve from Month ${f.firstReserveBreach}` : `, above the ${dollars(reserve)} reserve all year`}.`
      : `${label}: a 12-month operating result of ${dollars(f.operating12)}; ${f.months.filter((m) => m.operating < 0).length} months below zero.`;
  return (
    <figure className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="font-semibold">Money: {money === "cash" ? "closing cash" : "monthly operating result"}</figcaption>
        <div role="group" aria-label="Show" className="flex gap-1">
          {(["cash", "operating"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={money === k}
              onClick={() => setMoney(k)}
              className={cx("min-h-10 rounded-full px-3 text-sm font-semibold", money === k ? "bg-action text-on-action" : "bg-muted")}
            >
              {k === "cash" ? "Closing cash" : "Operating result"}
            </button>
          ))}
        </div>
      </div>
      <p id={id} className="text-sm">
        {summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-labelledby={id}>
        <line x1={PAD.l} x2={W - PAD.r} y1={yAt(0)} y2={yAt(0)} className="stroke-line-strong" strokeWidth={1} />
        <text x={PAD.l - 6} y={yAt(0) + 4} textAnchor="end" className="fill-ink-muted text-[11px]">
          $0
        </text>
        {money === "cash" ? (
          <>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={yAt(reserve)}
              y2={yAt(reserve)}
              stroke="currentColor"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              className="text-[#8a5a00]"
            />
            <text x={W - PAD.r} y={yAt(reserve) - 5} textAnchor="end" className="fill-[#8a5a00] text-[11px] font-semibold">
              Reserve {dollars(reserve)}
            </text>
            <path
              d={f.months.map((m, i) => `${i ? "L" : "M"}${xAt(m.month).toFixed(1)},${yAt(m.closingCash).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="text-accent"
            />
          </>
        ) : (
          f.months.map((m) => {
            const y = yAt(Math.max(0, m.operating));
            const h = Math.abs(yAt(m.operating) - yAt(0));
            return (
              <rect
                key={m.month}
                x={xAt(m.month) - 12}
                y={m.operating >= 0 ? y : yAt(0)}
                width={24}
                height={Math.max(1, h)}
                rx={3}
                className={m.operating >= 0 ? "fill-accent" : "fill-[#a12d31]"}
              />
            );
          })
        )}
        {f.months.map((m) => (
          <text key={m.month} x={xAt(m.month)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
            {m.month}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-xs text-ink-muted">
        Earned income and cash received can differ: income arrives after the payment lag, and a new coordinator is paid in full from the day they join.
      </p>
    </figure>
  );
}

function MonthlyTable({ f, label }: { f: Forecast; label: string }) {
  return (
    <details className={box}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <Icon name="list" className="size-5" /> The 12 months as a table: {label}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">Month by month for {label}</caption>
          <thead>
            <tr className="text-left text-ink-muted">
              {[
                "Month",
                "Participants",
                "Required hours",
                "Available hours",
                "Utilisation",
                "Earned",
                "Received",
                "Staff costs",
                "Operating result",
                "Closing cash",
              ].map((h) => (
                <th key={h} scope="col" className="px-2 py-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.months.map((m) => (
              <tr key={m.month} className="border-t border-line">
                <th scope="row" className="px-2 py-1 text-left">
                  {m.month}
                </th>
                <td className="px-2 py-1">{m.clients}</td>
                <td className="px-2 py-1">{m.requiredHours.toFixed(1)}</td>
                <td className="px-2 py-1">{m.availableHours.toFixed(1)}</td>
                <td className="px-2 py-1">
                  {pct(m.utilisation)}
                  {m.pressure ? " (over)" : ""}
                </td>
                <td className="px-2 py-1">{dollars(m.earned)}</td>
                <td className="px-2 py-1">{dollars(m.received)}</td>
                <td className="px-2 py-1">{dollars(m.staffCost)}</td>
                <td className="px-2 py-1">{dollars(m.operating)}</td>
                <td className="px-2 py-1">
                  {dollars(m.closingCash)}
                  {m.reserveBreach ? " (below reserve)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Commit a plan: combinable actions, timing, the income used, why, and what would change it. */
function DecisionPanel({
  b,
  kind,
  start,
  onDraft,
  onCommit,
  busy,
}: {
  b: HiringBlock;
  kind: "initial" | "revised";
  start: Decision;
  onDraft: (d: Decision) => void;
  onCommit: (d: Decision) => void;
  busy: boolean;
}) {
  const [d, setD] = useState<Decision>(start);
  const set = (patch: Partial<Decision>) => {
    const next = { ...d, ...patch };
    setD(next);
    onDraft(next);
  };
  const hires = b.options.filter((o) => o.kind === "hire");
  const id = useId();
  const actionText: Record<keyof typeof ACTIONS, string> = {
    recruit: ACTIONS.recruit,
    temporary: b.actions.temporary.label,
    pace: b.actions.pace.label,
    workflow: b.actions.workflow.label,
    monitor: "Monitor: agree what to watch, and when to look again",
  };
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl border-2 border-action p-4">
      <h4 id={`${id}-h`} className="font-serif text-xl font-semibold">
        {kind === "initial" ? "Decide: what would you do?" : "Revisit your plan"}
      </h4>
      <p className="text-sm text-ink-muted">
        {kind === "initial"
          ? "Choose any actions that belong together, say when, and why. You’ll hear what happens next once you commit."
          : "Change the plan, or keep it, and say why. Your first plan is kept as it was."}
      </p>
      <fieldset className="mt-3">
        <legend className="font-semibold">Actions</legend>
        <div className="mt-1 flex flex-col gap-1.5">
          {(Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).map((k) => (
            <label key={k} className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--action)]"
                checked={d[k]}
                onChange={(e) =>
                  set(
                    k === "recruit"
                      ? { recruit: e.target.checked, optionId: e.target.checked ? d.optionId || hires[0]?.id || "" : d.optionId }
                      : { [k]: e.target.checked },
                  )
                }
              />
              <span>{actionText[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {d.recruit && (
        <div className="mt-2 flex flex-wrap gap-3 pl-8">
          <label className="flex flex-col text-sm font-semibold">
            Recruit for
            <select className={field} value={d.optionId} onChange={(e) => set({ optionId: e.target.value })}>
              {hires.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-semibold">
            Start recruiting in
            <select className={field} value={d.startMonth} onChange={(e) => set({ startMonth: Number(e.target.value) })}>
              {Array.from({ length: 6 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Month {m}
                  {m === 1 ? " (now)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <fieldset className="mt-3">
        <legend className="font-semibold">Which figure did you use for {b.story.character || "the business"}’s income?</legend>
        {(
          [
            ["agreement", `The fictional agreement: ${dollars(b.inputs.incomePerClient)} a month per active participant`],
            ["public", "10% of each participant’s Support at Home budget (the care-management allocation)"],
            ["unsure", "I’m not sure"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex min-h-11 items-start gap-3">
            <input
              type="radio"
              name={`${id}-income`}
              className="mt-1 size-5 accent-[var(--action)]"
              checked={d.incomeBasis === v}
              onChange={() => set({ incomeBasis: v })}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="mt-3 flex flex-col gap-1 font-semibold">
        {kind === "initial" ? "Why this plan?" : "What changed in your plan, or why does it still stand?"}
        <textarea
          rows={3}
          className={cx(field, "py-2 font-normal")}
          value={d.rationale}
          maxLength={2000}
          onChange={(e) => set({ rationale: e.target.value })}
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 font-semibold">
        What evidence would change your plan?
        <textarea rows={2} className={cx(field, "py-2 font-normal")} value={d.changeIf} maxLength={1000} onChange={(e) => set({ changeIf: e.target.value })} />
      </label>
      <p className="mt-3 text-sm">
        <strong>Your plan:</strong> {planSummary(b, d)}.
      </p>
      <button type="button" className={cx(primary, "mt-3")} disabled={busy} onClick={() => onCommit(d)}>
        <Icon name="check" className="size-5" /> {busy ? "Saving…" : kind === "initial" ? "Commit my plan" : "Submit my revised plan"}
      </button>
    </section>
  );
}

/** The new information, and what it did to the first plan: assumptions changed and months that moved. */
function EventReveal({ b, event, comparison }: { b: HiringBlock; event: Revealed; comparison: Comparison | null }) {
  return (
    <section aria-labelledby={`${b.id}-evh`} className="rounded-2xl bg-[#fff8e6] p-4 ring-1 ring-[#e8c46a] dark:bg-[#2b2410] dark:ring-[#6b5420]">
      <p className={kicker}>New information</p>
      <h4 id={`${b.id}-evh`} className="font-serif text-xl font-semibold">
        {event.title}
      </h4>
      {event.story.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mt-2">
          {para}
        </p>
      ))}
      {event.source && <p className="mt-2 text-xs text-ink-muted">From: {event.source}</p>}
      {event.changed.length > 0 && (
        <>
          <p className="mt-3 font-semibold">What changed in the assumptions</p>
          <ul className="list-disc pl-5">
            {event.changed.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {comparison && (
        <div className="mt-3 overflow-x-auto">
          <p className="font-semibold">Your first plan, before and after</p>
          <table className="mt-1 w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="px-2 py-1">
                  Measure
                </th>
                <th scope="col" className="px-2 py-1">
                  Before
                </th>
                <th scope="col" className="px-2 py-1">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Months over threshold", String(comparison.before.monthsAbove), String(comparison.after.monthsAbove)],
                  [
                    "Lowest cash",
                    `${dollars(comparison.before.lowestCash)} (Month ${comparison.before.lowestCashMonth})`,
                    `${dollars(comparison.after.lowestCash)} (Month ${comparison.after.lowestCashMonth})`,
                  ],
                  [
                    "Below the reserve from",
                    comparison.before.firstReserveBreach ? `Month ${comparison.before.firstReserveBreach}` : "Never",
                    comparison.after.firstReserveBreach ? `Month ${comparison.after.firstReserveBreach}` : "Never",
                  ],
                  ["12-month operating result", dollars(comparison.before.operating12), dollars(comparison.after.operating12)],
                ] as const
              ).map(([k, before, after]) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className="px-2 py-1 text-left font-semibold">
                    {k}
                  </th>
                  <td className="px-2 py-1">{before}</td>
                  <td className="px-2 py-1">{after}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm">
            {comparison.movedPressure.length
              ? `Months whose workload verdict changed: ${comparison.movedPressure.map((m) => `Month ${m}`).join(", ")}.`
              : "No month’s workload verdict changed."}{" "}
            {comparison.cashChange !== 0 ? `The lowest cash moved by ${dollars(comparison.cashChange)}.` : ""} Earned income is unchanged; only when it arrives
            moved.
          </p>
        </div>
      )}
    </section>
  );
}

/** The rubric in words, misconceptions, your plan beside the reviewed ones, and what next. */
function Debrief({ b, d, s }: { b: HiringBlock; d: HiringDebrief; s: HiringState }) {
  const yours = d.yours.after;
  return (
    <section aria-labelledby={`${b.id}-db`} className="flex flex-col gap-4">
      <h4 id={`${b.id}-db`} className="font-serif text-2xl font-semibold">
        Debrief
      </h4>
      <p>
        <strong>Your plan:</strong> {planSummary(b, s.revised ?? emptyDecision())}. With the new information it has {yours.monthsAbove}{" "}
        {yours.monthsAbove === 1 ? "month" : "months"} over the threshold, a lowest cash balance of {dollars(yours.lowestCash)} (Month {yours.lowestCashMonth})
        and a 12-month operating result of {dollars(yours.operating12)}.
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {d.dims.map((x) => (
          <li key={x.dim} className={box}>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {DIMENSIONS[x.dim]}
              <span className={cx("rounded-full px-2.5 py-0.5 text-xs", x.rating === 2 ? RISK.ok : x.rating === 1 ? RISK.reserve : RISK.service)}>
                {RATING[x.rating]}
              </span>
            </p>
            <p className="mt-1 text-sm">{x.text}</p>
          </li>
        ))}
      </ul>
      {d.misconceptions.length > 0 && (
        <div className="rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]">
          <p className="font-semibold">Worth a second look</p>
          <ul className="list-disc pl-5">
            {d.misconceptions.map((m) => (
              <li key={m}>{MISCONCEPTIONS[m]}.</li>
            ))}
          </ul>
        </div>
      )}
      {d.alternatives.length > 0 && (
        <div>
          <h5 className="font-semibold">Reviewed plans, one of several defensible ways</h5>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {d.alternatives.map((a) => (
              <div key={a.id} className={box}>
                <p className="font-semibold">{a.label}</p>
                <p className="mt-1 text-sm">
                  With the new information: {a.f.monthsAbove} {a.f.monthsAbove === 1 ? "month" : "months"} over the threshold, lowest cash{" "}
                  {dollars(a.f.lowestCash)} (Month {a.f.lowestCashMonth}), 12-month operating result {dollars(a.f.operating12)}.
                </p>
                <p className="mt-1 text-sm">{a.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {(d.nextStep || b.story.followUp) && (
        <div className="rounded-2xl bg-tealtint p-4">
          {d.nextStep && <p>{d.nextStep}</p>}
          {b.story.followUp && <p className="mt-1 text-sm">{b.story.followUp}</p>}
        </div>
      )}
      <p className="text-xs text-ink-muted">
        Read with case {d.storyVersion}, model {d.modelVersion} and rubric {d.rubricVersion}. Feedback comes from authored criteria and the calculated figures,
        not an AI score.
      </p>
    </section>
  );
}
