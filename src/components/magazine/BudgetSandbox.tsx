"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { SandboxBlock } from "@/lib/magazine";
import {
  buildDebrief,
  categoryOn,
  CATEGORIES,
  changeSummary,
  computeLedger,
  CONTRIBUTION_NOTE,
  emptyState,
  money,
  percent,
  planProblems,
  planWarnings,
  PRACTICE_NOTICE,
  RATE_TBC,
  rateFor,
  ruleSet,
  RULESETS,
  type Ledger,
  type PlanLine,
  type SandboxDebrief,
  type SandboxState,
  type Warning,
} from "@/lib/sandbox";
import type { CoachPoint, SandboxView } from "@/server/sandbox";
import { Icon } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Budget Sandbox (docs/budget-sandbox.md). The participant's goals stay on screen while the learner builds; every
  service needs a goal; each change is announced as one sentence; the ledger sits beside the plan (a tab of its own
  on a narrow screen, with "View costs" always there). Figures are always in words as well as colour.

  In the editor's preview it runs against the block as written, computes the same ledger, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const field = "min-h-11 rounded-xl border border-line-strong bg-surface px-3";
const TONE: Record<Warning["tone"], { label: string; cls: string }> = {
  stop: { label: "Needs changing", cls: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]" },
  check: { label: "Talk it through", cls: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" },
  note: { label: "Note", cls: "bg-muted" },
};
/** “Fortnightly” for 0.5 a week; otherwise how many times a week. */
const often = (perWeek: number) => (perWeek === 0.5 ? "Fortnightly" : `${perWeek} a week`);
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";

export function BudgetSandbox({ block: b, ctx }: { block: SandboxBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/sandbox`;
  const loaded = useApi<SandboxView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<SandboxState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<SandboxDebrief | null>(null);
  const [coach, setCoach] = useState<{ points: CoachPoint[]; source: "ai" | "rules"; facts?: { id: string; text: string }[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [pane, setPane] = useState<"plan" | "costs">("plan");
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDebrief(loaded.data.debrief);
    setCoach(loaded.data.coach);
  }
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id]);
  useEffect(() => {
    if (debrief && !ctx.preview) {
      ctx.activity(b.id, { outcome: "finished" });
      ctx.engaged(b.id);
    }
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

  const plan = s.lines.filter((l) => l.perWeek > 0);
  const ledger = computeLedger(b, plan);
  const warnings = planWarnings(b, plan, ledger);
  const rules = ruleSet(b.rulesetId) ?? RULESETS[0];
  const change = (fn: (prev: SandboxState) => SandboxState, serviceId?: string) => {
    dirty.current = true;
    setS((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (serviceId) {
        const before = computeLedger(
          b,
          prev.lines.filter((l) => l.perWeek > 0),
        );
        const after = computeLedger(
          b,
          next.lines.filter((l) => l.perWeek > 0),
        );
        setSaid(changeSummary(b, before, after, serviceId));
      }
      return next;
    });
  };
  const setLine = (serviceId: string, patch: Partial<PlanLine>) =>
    change((prev) => {
      const sv = b.services.find((x) => x.id === serviceId)!;
      const has = prev.lines.find((l) => l.serviceId === serviceId);
      const base: PlanLine = has ?? { serviceId, perWeek: 1, unitsEach: sv.unitsEach, goalId: sv.goalIds.length === 1 ? sv.goalIds[0] : "", review: false };
      const next = { ...base, ...patch };
      next.perWeek = Math.max(0, Math.min(sv.maxPerWeek, Math.round(next.perWeek * 2) / 2));
      next.unitsEach = Math.max(0.25, Math.min(12, Math.round(next.unitsEach * 4) / 4));
      // On a wide screen the costs sit beside the plan, so they count as looked at as soon as there's something to cost.
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      return {
        ...prev,
        inspected: prev.inspected || wide,
        lines: has ? prev.lines.map((l) => (l.serviceId === serviceId ? next : l)) : [...prev.lines, next],
      };
    }, serviceId);
  const removeLine = (serviceId: string) => change((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.serviceId !== serviceId) }), serviceId);
  const inspect = () => {
    setPane("costs");
    if (!s.inspected) change((prev) => ({ ...prev, inspected: true }));
  };
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      setProblem(problems?.length ? problems.join(" ") : e instanceof Error ? e.message : "That didn’t work. Your plan is still here.");
    } finally {
      setBusy(false);
    }
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());

  const submit = () =>
    run(async () => {
      if (ctx.preview) {
        const p = planProblems(b, s);
        if (p.length) throw new Error(`Not yet. ${p.join(" ")}`);
        setS({ ...s, stage: 1 });
      } else {
        const out = await api<SandboxView>(url, { body: { action: "submit", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
      }
      focusTop();
    });
  const askCoach = () =>
    run(async () => {
      if (ctx.preview) {
        setCoach({
          points: [
            {
              kind: "suggestion",
              text: "The coach runs for learners, from the plan’s ledger. In preview, check the explanation points in the debrief.",
              facts: [],
            },
          ],
          source: "rules",
        });
        return;
      }
      setCoach(await api(url, { body: { action: "coach", blockId: b.id, explanation: s.explanation } }));
    });
  const finish = () =>
    run(async () => {
      if (ctx.preview) {
        if (s.explanation.trim().length < 40) throw new Error("Write your explanation first: a few sentences.");
        const done = { ...s, stage: 2 as const };
        setS(done);
        setDebrief(buildDebrief(b, done));
      } else {
        const out = await api<SandboxView>(url, { body: { action: "finish", blockId: b.id, explanation: s.explanation } });
        setS(out.state);
        setDebrief(out.debrief);
      }
      focusTop();
    });
  const revise = (fresh: boolean) =>
    run(async () => {
      if (ctx.preview) setS({ ...emptyState(), lines: fresh ? [] : s.lines, revisions: s.revisions + 1 });
      else {
        const out = await api<SandboxView>(url, { body: { action: "revise", blockId: b.id, fresh } });
        setS(out.state);
      }
      setDebrief(null);
      setCoach(null);
      focusTop();
    });

  return (
    <Shell b={b}>
      <h4 ref={top} tabIndex={-1} className="sr-only outline-none">
        {s.stage === 0 ? "Build the plan" : s.stage === 1 ? "Explain it" : "Debrief"}
      </h4>
      <Participant b={b} ledger={ledger} rulesLabel={rules.label} />
      {!ctx.preview && loaded.data?.earlierCase && (
        <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm">This scenario has been updated since your last plan. Your plan is kept as it was.</p>
      )}

      {s.stage === 0 && (
        <>
          <div
            role="tablist"
            aria-label="Plan and costs"
            className="mt-4 flex gap-1 rounded-full border border-line-strong bg-surface p-1 text-sm font-semibold lg:hidden"
          >
            {(
              [
                ["plan", "Build the plan"],
                ["costs", warnings.some((w) => w.tone === "stop") ? "View costs (needs changing)" : "View costs"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={pane === v}
                onClick={() => (v === "costs" ? inspect() : setPane("plan"))}
                className={cx("min-h-10 flex-1 rounded-full px-3", pane === v ? "bg-action text-on-action" : "hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_27rem]">
            <section aria-label="Build the plan" className={cx("min-w-0", pane !== "plan" && "hidden lg:block")}>
              <p className="text-sm text-ink-muted">
                Add the services that fit {b.participant.name}’s goals, and how often. Prices are this scenario’s agreed prices. Projected over {ledger.weeks}{" "}
                whole weeks.
              </p>
              <p aria-live="polite" className="mt-2 min-h-6 text-sm font-semibold">
                {said}
              </p>
              <ul className="mt-2 flex flex-col gap-3">
                {b.services.map((sv) => (
                  <ServiceCard
                    key={sv.id}
                    b={b}
                    serviceId={sv.id}
                    line={s.lines.find((l) => l.serviceId === sv.id)}
                    ledger={ledger}
                    onSet={(p) => setLine(sv.id, p)}
                    onRemove={() => removeLine(sv.id)}
                  />
                ))}
              </ul>
            </section>
            <div
              className={cx("lg:sticky lg:top-24 lg:self-start", pane !== "costs" && "hidden lg:block")}
              onFocus={() => !s.inspected && change((prev) => ({ ...prev, inspected: true }))}
            >
              <LedgerView b={b} ledger={ledger} warnings={warnings} />
            </div>
          </div>
          {problem && (
            <p role="alert" className={cx(TONE.check.cls, "mt-3 rounded-2xl p-3")}>
              {problem}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={cx(secondary, "lg:hidden")} onClick={inspect}>
              <Icon name="money" className="size-4" /> View costs
            </button>
            <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
              Use this plan
            </button>
            {s.lines.length > 0 && (
              <button
                type="button"
                className={secondary}
                onClick={() => window.confirm("Clear the plan and start again?") && change((prev) => ({ ...prev, lines: [] }))}
              >
                Start the plan again
              </button>
            )}
          </div>
        </>
      )}

      {s.stage >= 1 && (
        <details className={cx(box, "mt-4")} open={s.stage === 1}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Your plan’s costs</summary>
          <LedgerView b={b} ledger={ledger} warnings={warnings} />
        </details>
      )}

      {s.stage === 1 && (
        <section aria-label="Explain it" className="mt-4">
          <h4 className="font-serif text-xl font-semibold">Explain it to {b.participant.name}</h4>
          <blockquote className="mt-2 border-l-4 border-accent pl-4 text-lg">{b.explain.prompt}</blockquote>
          <label className="mt-3 block font-semibold" htmlFor={`${b.id}-explain`}>
            What you’d say to her
          </label>
          <p className="text-sm text-ink-muted">Use the figures in your plan. If a rate is still to confirm, say so rather than giving a number.</p>
          <textarea
            id={`${b.id}-explain`}
            className="mt-1 min-h-40 w-full rounded-2xl border border-line-strong bg-bg px-3 py-2"
            maxLength={2000}
            value={s.explanation}
            onChange={(e) => change((prev) => ({ ...prev, explanation: e.target.value }))}
          />
          {coach && <CoachView coach={coach} />}
          {problem && (
            <p role="alert" className={cx(TONE.check.cls, "mt-3 rounded-2xl p-3")}>
              {problem}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={busy || s.explanation.trim().length < 40} onClick={() => void askCoach()}>
              <Icon name="spark" className="size-4" /> {busy ? "Reading it…" : "Coach me"}
            </button>
            <button type="button" className={primary} disabled={busy || s.explanation.trim().length < 40} onClick={() => void finish()}>
              Finish and see the debrief
            </button>
          </div>
        </section>
      )}

      {s.stage === 2 && debrief && (
        <DebriefView b={b} d={debrief} explanation={s.explanation} onRevise={() => void revise(false)} onFresh={() => void revise(true)} />
      )}
      {ctx.preview && <p className="mt-3 text-sm text-ink-muted">Preview: the same ledger as learners get. Nothing is recorded.</p>}
    </Shell>
  );
}

function Shell({ b, children }: { b: SandboxBlock; children: React.ReactNode }) {
  return (
    <section aria-label={`Budget Sandbox: ${b.title}`} className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> Budget Sandbox · practice scenario
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{PRACTICE_NOTICE}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Who it's for, their goals in their own words, and the funding and rates: on screen the whole time. */
function Participant({ b, ledger, rulesLabel }: { b: SandboxBlock; ledger: Ledger; rulesLabel: string }) {
  const p = b.participant;
  return (
    <details className={box} open>
      <summary className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <CharacterPortrait name={p.name} size="sm" />
        {p.name}: goals, needs and funding
      </summary>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <div>
          {p.about && <p>{p.about}</p>}
          <p className="mt-2 font-semibold">In her own words</p>
          <ul className="mt-1 flex flex-col gap-1">
            {b.goals.map((g) => (
              <li key={g.id}>
                “{g.text}”{g.priority && <span className="ml-1 rounded-full bg-tealtint px-2 text-xs font-semibold">matters most</span>}
              </li>
            ))}
          </ul>
          {p.needs.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Assessed needs</p>
              <ul className="list-disc pl-5 text-sm">
                {p.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
          {p.risks.length > 0 && <p className="mt-2 text-sm">Risks: {p.risks.join(" ")}</p>}
          {p.schedule && <p className="mt-1 text-sm">Schedule: {p.schedule}</p>}
          {p.affordability && <p className="mt-1 text-sm">Affordability: {p.affordability}</p>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-semibold">Funding</dt>
          <dd>
            {b.funding.variant === "fictional" ? "Fictional practice budget" : `Classification ${b.funding.classification}, ongoing`}:{" "}
            {money(ledger.quarterlyCents)} a quarter
          </dd>
          <dt className="font-semibold">Care management</dt>
          <dd>{money(ledger.careManagementCents)} reserved (10%)</dd>
          {ledger.carryoverInCents > 0 && (
            <>
              <dt className="font-semibold">Carried over</dt>
              <dd>{money(ledger.carryoverInCents)}</dd>
            </>
          )}
          <dt className="font-semibold">For services</dt>
          <dd>{money(ledger.availableCents)}</dd>
          <dt className="font-semibold">Quarter</dt>
          <dd>
            {showDate(b.quarter.start)} to {showDate(b.quarter.end)} ({ledger.days} days; projected over {ledger.weeks} whole weeks
            {ledger.days % 7 ? `, the extra ${ledger.days % 7} ${ledger.days % 7 === 1 ? "day isn’t" : "days aren’t"} counted` : ""})
          </dd>
          {(["clinical", "independence", "everyday"] as const).map((c) => {
            const r = rateFor(b, c);
            return (
              <div key={c} className="contents">
                <dt className="font-semibold">{CATEGORIES[c]}</dt>
                <dd>{c === "clinical" ? "0% contribution" : r === null ? `${RATE_TBC}` : `${percent(r)} contribution (her assessed notice, fictional)`}</dd>
              </div>
            );
          })}
          <dt className="font-semibold">Rules</dt>
          <dd>{rulesLabel}</dd>
        </dl>
      </div>
    </details>
  );
}

function ServiceCard({
  b,
  serviceId,
  line,
  ledger,
  onSet,
  onRemove,
}: {
  b: SandboxBlock;
  serviceId: string;
  line: PlanLine | undefined;
  ledger: Ledger;
  onSet: (p: Partial<PlanLine>) => void;
  onRemove: () => void;
}) {
  const ids = useId();
  const rules = ruleSet(b.rulesetId) ?? RULESETS[0];
  const sv = b.services.find((x) => x.id === serviceId)!;
  const category = categoryOn(rules, sv, b.quarter.start);
  const moved = rules.categoryChanges.find((c) => c.kind && c.kind === sv.kind && b.quarter.start >= c.effectiveFrom);
  const row = ledger.lines.find((l) => l.serviceId === serviceId);
  const goals = b.goals.filter((g) => sv.goalIds.includes(g.id));
  return (
    <li className={cx(box, line && "ring-2 ring-action")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{sv.name}</p>
          <p className="text-sm text-ink-muted">
            {CATEGORIES[category]} · {money(sv.unitPriceCents)} a {sv.unit}
            {sv.unitsEach !== 1 ? ` · usually ${sv.unitsEach} ${sv.unit}s each time` : ""}
          </p>
          {sv.purpose && <p className="text-sm">{sv.purpose}</p>}
          {moved && <p className="text-xs text-ink-muted">{moved.note}</p>}
          {sv.availability && <p className="text-xs text-ink-muted">Availability: {sv.availability}</p>}
          {!sv.approved && <p className="mt-1 text-sm font-semibold">Not in {b.participant.name}’s approved care plan.</p>}
        </div>
        {!line ? (
          <button type="button" className={secondary} onClick={() => onSet({})}>
            <Icon name="plus" className="size-4" /> Add
          </button>
        ) : (
          <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-accent" onClick={onRemove}>
            <Icon name="minus" className="size-4" /> Remove<span className="sr-only"> {sv.name}</span>
          </button>
        )}
      </div>
      {line && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">For which goal or need?</span>
            <select className={cx(field, "w-full min-w-0")} value={line.goalId} onChange={(e) => onSet({ goalId: e.target.value })}>
              <option value="">Choose…</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.text.length > 60 ? `${g.text.slice(0, 57)}…` : g.text}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-semibold" htmlFor={`${ids}-pw`}>
              Times a week (0.5 is fortnightly)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cx(secondary, "size-11 px-0")}
                aria-label={`Fewer times a week for ${sv.name}`}
                onClick={() => onSet({ perWeek: line.perWeek - 0.5 })}
              >
                <Icon name="minus" className="size-4" />
              </button>
              <input
                id={`${ids}-pw`}
                type="number"
                inputMode="decimal"
                min={0}
                max={sv.maxPerWeek}
                step={0.5}
                className={cx(field, "w-20 text-center")}
                value={line.perWeek}
                onChange={(e) => onSet({ perWeek: Number(e.target.value) })}
              />
              <button
                type="button"
                className={cx(secondary, "size-11 px-0")}
                aria-label={`More times a week for ${sv.name}`}
                onClick={() => onSet({ perWeek: line.perWeek + 0.5 })}
              >
                <Icon name="plus" className="size-4" />
              </button>
            </div>
            <input
              type="range"
              aria-label={`Times a week for ${sv.name}`}
              min={0}
              max={sv.maxPerWeek}
              step={0.5}
              value={line.perWeek}
              onChange={(e) => onSet({ perWeek: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--color-action)]"
            />
            <span className="text-xs text-ink-muted">Up to {sv.maxPerWeek} a week.</span>
          </div>
          {sv.unit === "hour" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Hours each time</span>
              <input
                type="number"
                inputMode="decimal"
                min={0.25}
                max={12}
                step={0.25}
                className={cx(field, "w-24")}
                value={line.unitsEach}
                onChange={(e) => onSet({ unitsEach: Number(e.target.value) })}
              />
            </label>
          )}
          {!sv.approved && (
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-5" checked={line.review} onChange={(e) => onSet({ review: e.target.checked })} />
              Mark it for review: the care plan would need updating before it’s delivered
            </label>
          )}
          {row && (
            <p className="text-sm sm:col-span-2">
              {row.units} {sv.unit}s a quarter: {money(row.fullPriceCents)} full price;{" "}
              {row.participantCents === undefined
                ? `contribution ${RATE_TBC}`
                : `${b.participant.name} ${money(row.participantCents)}, government ${money(row.governmentCents!)}`}
              .
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** The ledger: funding, every line, both shares, what's left, and the carryover cap, all in words. */
function LedgerView({ b, ledger: l, warnings }: { b: SandboxBlock; ledger: Ledger; warnings: Warning[] }) {
  const name = b.participant.name;
  return (
    <section aria-label="Costs this quarter" className="flex flex-col gap-3">
      <div className={box}>
        <p className="font-semibold">Costs this quarter</p>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">The plan’s services, their full price, {name}’s estimated contribution and the government-funded share</caption>
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="py-1 font-semibold">
                Service
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-semibold">
                Full price
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-semibold">
                {name}
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-semibold">
                Government
              </th>
            </tr>
          </thead>
          <tbody>
            {l.lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-ink-muted">
                  No services yet.
                </td>
              </tr>
            )}
            {l.lines.map((x) => (
              <tr key={x.serviceId} className="border-t border-line align-top">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {x.name}
                  <span className="block text-xs text-ink-muted">
                    {CATEGORIES[x.category]} · {x.units} {x.unit}s
                  </span>
                </th>
                <td className="py-1 pl-3 text-right tabular-nums">{money(x.fullPriceCents)}</td>
                <td className="py-1 pl-3 text-right tabular-nums">{x.participantCents === undefined ? RATE_TBC : money(x.participantCents)}</td>
                <td className="py-1 pl-3 text-right tabular-nums">{x.governmentCents === undefined ? RATE_TBC : money(x.governmentCents)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong font-semibold">
              <th scope="row" className="py-1 text-left">
                Total
              </th>
              <td className="py-1 pl-3 text-right tabular-nums">{money(l.grossCents)}</td>
              <td className="py-1 pl-3 text-right tabular-nums">{money(l.participantCents)}</td>
              <td className="py-1 pl-3 text-right tabular-nums">{money(l.governmentCents)}</td>
            </tr>
          </tbody>
        </table>
        {l.unknownCents > 0 && (
          <p className="mt-1 text-xs">
            {money(l.unknownCents)} of services wait on a {RATE_TBC}: their split isn’t shown.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt>Funding for services</dt>
          <dd className="text-right tabular-nums">{money(l.availableCents)}</dd>
          <dt>Government-funded share of the plan</dt>
          <dd className="text-right tabular-nums">{money(l.governmentCents)}</dd>
          <dt className="font-semibold">{l.remaining.high < 0 ? "Shortfall" : "Remaining"}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {l.remaining.high < 0
              ? money(-l.remaining.high)
              : l.remaining.low === l.remaining.high
                ? money(l.remaining.high)
                : `${money(Math.max(0, l.remaining.low))} to ${money(l.remaining.high)}`}
          </dd>
          <dt>Weekly, {name}’s estimate</dt>
          <dd className="text-right tabular-nums">{l.weeks ? money(Math.round(l.participantCents / l.weeks)) : money(0)}</dd>
          <dt>Carryover cap</dt>
          <dd className="text-right tabular-nums">{money(l.carryoverCapCents)}</dd>
          {l.carryoverOutCents !== null && l.remaining.high >= 0 && (
            <>
              <dt>Would carry over, if delivered as planned</dt>
              <dd className="text-right tabular-nums">{money(l.carryoverOutCents)}</dd>
            </>
          )}
        </dl>
        <p role="status" className={cx("mt-2 rounded-xl px-3 py-2 text-sm font-semibold", l.remaining.high < 0 ? TONE.stop.cls : TONE.note.cls)}>
          {l.remaining.high < 0
            ? `${money(-l.remaining.high)} shortfall`
            : l.remaining.low < 0
              ? "May be over, depending on a rate to confirm"
              : "Within funding"}
        </p>
        <p className="mt-2 text-xs text-ink-muted">{CONTRIBUTION_NOTE} Each line is rounded to the cent; care management is reserved before services.</p>
      </div>
      {warnings.length > 0 && (
        <ul aria-label="Things to look at" className="flex flex-col gap-2">
          {warnings.map((w) => (
            <li key={w.id} className={cx("rounded-2xl p-3 text-sm", TONE[w.tone].cls)}>
              <span className="font-semibold">{TONE[w.tone].label}: </span>
              {w.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoachView({ coach }: { coach: { points: CoachPoint[]; source: "ai" | "rules"; facts?: { id: string; text: string }[] } }) {
  return (
    <div role="status" className={cx(box, "mt-3")}>
      <p className="font-semibold">Coach {coach.source === "rules" ? "(from the plan’s rules)" : ""}</p>
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {coach.points.map((p, i) => (
          <li key={i}>
            <span className="font-semibold">{p.kind === "strength" ? "Working well: " : "To consider: "}</span>
            {p.text}
            {coach.facts && p.facts.length > 0 && (
              <span className="mt-0.5 block text-xs text-ink-muted">
                Based on: {p.facts.map((id) => coach.facts!.find((f) => f.id === id)?.text ?? id).join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DebriefView({
  b,
  d,
  explanation,
  onRevise,
  onFresh,
}: {
  b: SandboxBlock;
  d: SandboxDebrief;
  explanation: string;
  onRevise: () => void;
  onFresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-label="Debrief" className="mt-5 border-t border-line pt-4">
      <h4 className="font-serif text-xl font-semibold">How it went</h4>
      <ul className="mt-2 grid gap-2 sm:grid-cols-5">
        {d.dims.map((x) => (
          <li key={x.id} className={box}>
            <p className="text-sm font-semibold">{x.label}</p>
            <p className="text-sm">{x.rating}</p>
          </li>
        ))}
      </ul>

      <h5 className="mt-4 font-semibold">Your plan beside one reviewed plan</h5>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col">Service</th>
            <th scope="col">Yours</th>
            <th scope="col">Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {d.compare.map((c) => (
            <tr key={c.name} className="border-t border-line">
              <th scope="row" className="py-1 text-left font-normal">
                {c.name}
              </th>
              <td>{c.yours ? often(c.yours.perWeek) : "Not included"}</td>
              <td>{c.reviewed ? often(c.reviewed.perWeek) : "Not included"}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-line-strong font-semibold">
            <th scope="row" className="py-1 text-left">
              {b.participant.name}’s contribution
            </th>
            <td>{money(d.yours.participantCents)}</td>
            <td>{money(d.reviewed.participantCents)}</td>
          </tr>
          <tr className="font-semibold">
            <th scope="row" className="py-1 text-left">
              Funding left
            </th>
            <td>{d.yours.remaining.high < 0 ? `${money(-d.yours.remaining.high)} short` : money(d.yours.remaining.high)}</td>
            <td>{money(d.reviewed.remaining.high)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2">{d.why}</p>

      {d.priorities.length > 0 && (
        <div className={cx(box, "mt-3")}>
          <p className="font-semibold">What {b.participant.name} said matters most</p>
          <ul className="mt-1 text-sm">
            {d.priorities.map((p) => (
              <li key={p.text}>
                {p.kept ? "Kept: " : "Not in your plan: "}“{p.text}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cx(box, "mt-3")}>
        <p className="font-semibold">Your explanation</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{explanation}</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {d.check.covered.map((c) => (
            <li key={c.id}>
              {c.met ? "Covered: " : "Not yet: "}
              {c.label}
            </li>
          ))}
          {d.check.avoided.map((a) => (
            <li key={a.phrase} className="font-semibold">
              Careful: “{a.phrase}”. {a.why}
            </li>
          ))}
          {d.check.unsupported.map((x) => (
            <li key={x} className="font-semibold">
              {x} isn’t a figure in your plan’s ledger.
            </li>
          ))}
        </ul>
      </div>
      {d.debrief && <p className="mt-3">{d.debrief}</p>}

      <details className={cx(box, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Practice statement</summary>
        <pre className="whitespace-pre-wrap font-sans text-sm">{d.statement}</pre>
        <button
          type="button"
          className={cx(secondary, "mt-2")}
          onClick={() =>
            void navigator.clipboard
              .writeText(d.statement)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          <Icon name="copy" className="size-4" /> {copied ? "Copied" : "Copy the statement"}
        </button>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={onRevise}>
          <Icon name="refresh" className="size-4" /> Revise this plan
        </button>
        <button type="button" className={secondary} onClick={() => window.confirm("Start with an empty plan? Your finished plan is kept.") && onFresh()}>
          Start a fresh plan
        </button>
      </div>
    </section>
  );
}
