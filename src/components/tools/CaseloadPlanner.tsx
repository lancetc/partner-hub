"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { dollars, pct } from "@/lib/hiringModel";
import {
  analyse,
  BASIS_NOTE,
  blankPlan,
  CLASSIFICATIONS,
  decision,
  fictionalExample,
  FICTIONAL_NOTICE,
  FIELD_KEYS as FIELD_KEYS_ALL,
  FIELDS,
  fieldProblem,
  fieldsIn,
  FUNDING_NOTE,
  GROUPS,
  growthCases,
  INCOME_BASES,
  MONTHLY_HEADER,
  monthlyRows,
  OPTION_IDS,
  OPTION_LABELS,
  PROVENANCE,
  readPlan,
  whatChanged,
  type Analysis,
  type Change,
  type FieldKey,
  type GrowthEdit,
  type Group,
  type IncomeBasis,
  type OptionId,
  type Plan,
  type ProvenanceStatus,
} from "@/lib/caseloadPlanner";
import type { getPlan, plannerHome } from "@/server/caseloadPlanner";
import { Icon } from "../Icon";
import { CapacityChart, FinanceChart } from "./CaseloadCharts";
import { DecisionWindowPanel } from "./DecisionWindow";
import { RECOMMENDATION_LABELS, sensitivity, type RecommendationKind, type WindowSummary } from "@/lib/hiringWindow";

/*
  Caseload-to-Margin & Hiring Capacity Calculator (docs/caseload-margin-calculator.md). A Work Tool with two ways in:
  the fictional example (anyone signed in, never saved) and Plan my business (the owner and the people they've
  authorised; private to the business, saved only when they choose). Every figure comes from lib/caseloadPlanner, the
  same code the server uses for saved plans and the workbook. Nothing here calls AI.
*/

type Home = ReturnType<typeof plannerHome>;
type Saved = ReturnType<typeof getPlan>;

/**
  A use event: its name, the mode and at most a fixed-list detail (a field key, a case, an option), never a value. Each
  carries its own key, so a retried request is counted once. Keys are made when the event happens, never in render.
*/
const event = (name: string, mode: "learn" | "plan", detail?: string) =>
  void api("/api/tools/caseload", { body: { action: "event", event: name, mode, detail, idem: crypto.randomUUID() } }).catch(() => undefined);

const card = "rounded-3xl border border-line bg-surface p-5 sm:p-6";
const eyebrow = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

export function CaseloadPlanner() {
  const home = useApi<Home>("/api/tools/caseload");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<FieldKey, string>>>({});
  const [tab, setTab] = useState<Group>("caseload");
  const [growthId, setGrowthId] = useState("expected");
  const [optionId, setOptionId] = useState<OptionId>("add-06");
  const [changes, setChanges] = useState<Change[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const seenWarnings = useRef(new Set<string>());
  // Which assumptions have been changed this session: each is logged once (the field, never its value).
  const changedFields = useRef(new Set<string>());

  // The last plan that could be calculated: its result stays on screen while a field is blank or being corrected.
  const [goodPlan, setGoodPlan] = useState<Plan | null>(null);
  const analysis = useMemo(() => (plan ? analyse(plan, growthId, optionId) : null), [plan, growthId, optionId]);
  const fallback = useMemo(() => (goodPlan ? analyse(goodPlan, growthId, optionId) : null), [goodPlan, growthId, optionId]);
  const shown = analysis ?? fallback;
  const reading = plan ? readPlan(plan) : null;
  const mode = plan?.kind === "business" ? "plan" : "learn";

  // Once per session, note that a cash warning or the workflow guardrail was shown: the event, never the figures.
  useEffect(() => {
    if (!analysis || !plan) return;
    const once = (name: string) => {
      if (seenWarnings.current.has(name)) return;
      seenWarnings.current.add(name);
      event(name, mode);
    };
    if (analysis.moneyKnown && analysis.selected.firstReserveBreach !== null) once("cash_warning_seen");
    if (analysis.optionId === "workflow" && !analysis.workflowChecked) once("quality_guardrail_seen");
  }, [analysis, plan, mode]);

  if (home.error) return <p role="alert">{home.error}</p>;
  if (!home.data) return <p className="mt-6 text-ink-muted">Loading…</p>;
  const h = home.data;

  /** Changes the plan, keeping a note of what moved for the selected option and case. */
  const update = (next: Plan) => {
    if (plan) {
      const c = whatChanged(analyse(plan, growthId, optionId), analyse(next, growthId, optionId));
      if (c.length) setChanges(c);
      const moved = [
        ...FIELD_KEYS_ALL.filter((k) => plan.values[k] !== next.values[k]).map((k) => `field:${k}`),
        ...(plan.incomeBasis !== next.incomeBasis ? ["field:incomeBasis"] : []),
        ...(plan.contactDuty !== next.contactDuty ? ["field:contactDuty"] : []),
        ...(plan.workflowChecked !== next.workflowChecked ? ["field:workflowChecked"] : []),
        ...(JSON.stringify(plan.classifications) !== JSON.stringify(next.classifications) ? ["field:classifications"] : []),
        ...(JSON.stringify([plan.slower, plan.faster]) !== JSON.stringify([next.slower, next.faster]) ? ["field:growthCases"] : []),
      ];
      for (const d of moved)
        if (!changedFields.current.has(d)) {
          changedFields.current.add(d);
          event("assumption_changed", mode, d);
        }
    }
    if (readPlan(next).ok) setGoodPlan(next);
    setPlan(next);
  };

  const start = (kind: "example" | "business") => {
    const next = kind === "example" ? fictionalExample() : blankPlan();
    setPlan(next);
    setGoodPlan(readPlan(next).ok ? next : null);
    setDrafts({});
    setChanges([]);
    setSaved(null);
    setTab("caseload");
    changedFields.current = new Set();
    event("business_simulator_opened", kind === "example" ? "learn" : "plan");
    event("scenario_mode_selected", kind === "example" ? "learn" : "plan", kind === "example" ? "mode:learn" : "mode:plan");
  };
  const chooseGrowth = (id: string) => {
    setGrowthId(id);
    if (id !== growthId) event("scenario_compared", mode, `growth:${id}`);
  };
  const chooseOption = (id: OptionId) => {
    setOptionId(id);
    if (id !== optionId) event("scenario_compared", mode, `option:${id}`);
  };

  if (!plan) return <Choose home={h} onStart={start} reload={home.reload} />;

  const decided = shown ? decision(shown) : null;
  const options = shown?.byOption;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cx(
            "rounded-full px-3 py-1 text-sm font-semibold",
            plan.kind === "example" ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "bg-tealtint",
          )}
        >
          {plan.kind === "example" ? "Fictional example" : `Plan my business · ${h.access?.orgName ?? ""}`}
          {saved ? ` · ${saved.name}, version ${saved.version}` : plan.kind === "business" ? " · not saved" : ""}
        </span>
        <button type="button" onClick={() => setPlan(null)} className="min-h-11 font-semibold text-accent underline underline-offset-2">
          Start again
        </button>
        <ExportButton plan={plan} saved={saved} growthId={growthId} optionId={optionId} disabled={!analysis} />
      </div>
      <p className="mt-3 max-w-3xl text-sm text-ink-muted">
        {plan.kind === "example"
          ? FICTIONAL_NOTICE
          : "Private to your business. Aggregate figures only: no participant names, care plans, payroll files or bank details."}{" "}
        {BASIS_NOTE}
      </p>

      {/* On a phone, the two things people come back to. */}
      <nav aria-label="Jump to" className="sticky top-16 z-20 -mx-4 mt-3 flex gap-2 bg-bg/95 px-4 py-2 backdrop-blur lg:hidden">
        <a href="#assumptions" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-line-strong font-semibold">
          Change assumptions
        </a>
        <a href="#options" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-line-strong font-semibold">
          Compare options
        </a>
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <section
          id="assumptions"
          aria-label="Assumptions"
          className={cx(card, "scroll-mt-32 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto")}
        >
          <h2 className="font-serif text-2xl font-semibold">Assumptions</h2>
          <Tabs tab={tab} setTab={setTab} reading={reading} plan={plan} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4 flex flex-col gap-4">
            {tab === "money" && (
              <>
                <p className="rounded-2xl bg-muted p-3 text-sm">{FUNDING_NOTE}</p>
                <label className="flex flex-col gap-1 font-semibold">
                  Income basis
                  <select
                    className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal"
                    value={plan.incomeBasis}
                    onChange={(e) => update({ ...plan, incomeBasis: e.target.value as IncomeBasis })}
                  >
                    {Object.entries(INCOME_BASES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {fieldsIn(tab).map((k) => (
              <Field key={k} k={k} plan={plan} draft={drafts[k]} setDraft={(t) => setDrafts((d) => ({ ...d, [k]: t }))} update={update} />
            ))}
            {tab === "caseload" && <Classifications plan={plan} update={update} />}
            {tab === "work" && (
              <label className="flex items-start gap-3 rounded-2xl bg-muted p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  checked={plan.contactDuty}
                  onChange={(e) => update({ ...plan, contactDuty: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">My agreement with Trilogy Care gives my business the monthly direct care-management contact.</span>
                  <span className="block text-sm text-ink-muted">
                    Tick only if your current agreement says so. Then months above your threshold are shown as a risk to that contact. It’s a guardrail, not a
                    claimable-hours figure.
                  </span>
                </span>
              </label>
            )}
            {tab === "hiring" && (
              <label className="flex items-start gap-3 rounded-2xl bg-muted p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  checked={plan.workflowChecked}
                  onChange={(e) => update({ ...plan, workflowChecked: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">I’ve checked the workflow saving protects required tasks, contact duties and outcomes.</span>
                  <span className="block text-sm text-ink-muted">Until then it’s shown as hypothetical, never as a viable option.</span>
                </span>
              </label>
            )}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {reading && !reading.ok && (
            <div role="alert" className="rounded-3xl border-2 border-[#b45309] bg-[#fff7ed] p-4 text-[#4a2500] dark:bg-[#2a1a08] dark:text-[#ffd9a8]">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="alert" className="size-5" /> {shown ? "Showing the last result that could be calculated." : "Fill these in to see a forecast."}
              </p>
              <ul className="mt-2 list-disc pl-6 text-sm">
                {reading.invalid.map((x) => (
                  <li key={x.key}>
                    {FIELDS[x.key].label}: {x.problem}
                  </li>
                ))}
                {reading.missing.map((k) => (
                  <li key={k}>
                    {FIELDS[k].label} ({GROUPS[FIELDS[k].group]}): blank
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shown && decided && options && (
            <>
              <Headlines a={shown} />
              <DecisionCard a={shown} d={decided} />
              {changes.length > 0 && <WhatChanged changes={changes} onDismiss={() => setChanges([])} />}
              <DecisionWindowPanel
                dw={shown.range}
                getSensitivity={() => sensitivity(shown.windowIn)}
                onView={(v) => event(v === "sensitivity" ? "scenario_compared" : "source_opened", mode, v)}
                note={
                  plan.kind === "example"
                    ? "Fictional example: every figure is invented."
                    : shown.illustrative
                      ? "Illustrative from entered values: the income isn’t marked verified against your agreement."
                      : "Income marked verified. Other assumptions are as entered or estimated."
                }
              />
              <Cases plan={plan} growthId={growthId} setGrowthId={chooseGrowth} update={update} />
              <section id="options" aria-labelledby="options-h" className={cx(card, "scroll-mt-32")}>
                <h2 id="options-h" className="font-serif text-2xl font-semibold">
                  Compare options
                </h2>
                <p className="mt-1 text-ink-muted">In the {shown.growth.label.toLowerCase()} case. Choosing an option doesn’t change your assumptions.</p>
                <OptionCards a={shown} optionId={optionId} setOptionId={chooseOption} />
              </section>
              <ChartSection title="Capacity" subtitle="Utilisation each month: required hours ÷ available hours.">
                {(table) =>
                  table ? (
                    <CapacityTable a={shown} />
                  ) : (
                    <CapacityChart
                      current={shown.noHire}
                      selected={shown.optionId === "current" ? null : shown.selected}
                      selectedLabel={OPTION_LABELS[shown.optionId]}
                      threshold={shown.threshold}
                    />
                  )
                }
              </ChartSection>
              <Finance a={shown} />
              <MonthlyTable a={shown} />
            </>
          )}

          {plan.kind === "business" && h.access && (
            <PlansPanel
              home={h}
              plan={plan}
              saved={saved}
              onSaved={(s) => {
                setSaved(s);
                home.reload();
              }}
              onOpen={(s) => {
                setSaved(s);
                setPlan(s.plan);
                setGoodPlan(readPlan(s.plan).ok ? s.plan : null);
                setDrafts({});
                setChanges([]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The first choice
// ---------------------------------------------------------------------------------------------

function Choose({ home, onStart, reload }: { home: Home; onStart: (k: "example" | "business") => void; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onStart("example")}
          className="group flex flex-col items-start gap-2 rounded-3xl bg-muted p-6 text-left ring-1 ring-line hover:ring-action"
        >
          <span className={eyebrow}>Learn</span>
          <span className="font-serif text-2xl font-semibold transition-colors group-hover:text-[#007f7e] dark:group-hover:text-[#7fd6d2]">
            Explore a fictional example
          </span>
          <span className="text-ink-muted">
            A made-up business with 35 participants and one coordinator. Change any assumption and see why the answer moves. Nothing is saved.
          </span>
        </button>
        <button
          type="button"
          disabled={!home.access}
          onClick={() => onStart("business")}
          className="group flex flex-col items-start gap-2 rounded-3xl bg-[#102a43] p-6 text-left text-white ring-1 ring-line hover:ring-action disabled:cursor-not-allowed disabled:opacity-80"
        >
          <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7fd4d4]">Private to your business</span>
          <span className="font-serif text-2xl font-semibold transition-colors group-enabled:group-hover:text-[#007f7e]">Plan my business</span>
          <span className="text-white/85">
            {home.access
              ? `Enter ${home.access.orgName}’s own aggregate figures. Starts blank: no example income is carried over. Saved only if you choose to.`
              : "For a Care Partner business owner and the people they’ve authorised. Ask your business owner for access."}
          </span>
        </button>
      </div>
      {home.access && home.plans.length > 0 && (
        <p className="text-sm text-ink-muted">
          Your business has {home.plans.length} saved plan{home.plans.length === 1 ? "" : "s"}: start Plan my business to open one.
        </p>
      )}
      {home.eligible && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await api("/api/tools/caseload", { body: { action: "favourite", saved: !home.saved } }).catch(() => undefined);
            reload();
            setBusy(false);
          }}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
          aria-pressed={home.saved}
        >
          <Icon name={home.saved ? "bookmark-filled" : "bookmark"} className="size-4" /> {home.saved ? "In your Favourites" : "Save to Favourites"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------------------------

function Tabs({ tab, setTab, reading, plan }: { tab: Group; setTab: (g: Group) => void; reading: ReturnType<typeof readPlan> | null; plan: Plan }) {
  const groups = Object.keys(GROUPS) as Group[];
  const needs = (g: Group) =>
    reading && !reading.ok
      ? [...reading.missing, ...reading.invalid.map((x) => x.key)].filter((k) => FIELDS[k].group === g).length
      : g === "money" && plan.values.income === null
        ? 1
        : 0;
  return (
    <div
      role="tablist"
      aria-label="Assumption groups"
      className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 sm:grid-cols-4 lg:grid-cols-2"
      onKeyDown={(e) => {
        const i = groups.indexOf(tab);
        const next = e.key === "ArrowRight" ? groups[(i + 1) % groups.length] : e.key === "ArrowLeft" ? groups[(i + groups.length - 1) % groups.length] : null;
        if (next) {
          e.preventDefault();
          setTab(next);
          document.getElementById(`tab-${next}`)?.focus();
        }
      }}
    >
      {groups.map((g) => (
        <button
          key={g}
          id={`tab-${g}`}
          type="button"
          role="tab"
          aria-selected={tab === g}
          aria-controls={`panel-${g}`}
          tabIndex={tab === g ? 0 : -1}
          onClick={() => setTab(g)}
          className={cx("min-h-11 rounded-xl px-2 text-sm font-semibold", tab === g ? "bg-surface shadow-sm" : "text-ink-muted hover:text-ink")}
        >
          {GROUPS[g]}
          {needs(g) > 0 && <span className="ml-1 text-xs font-bold text-[#b45309] dark:text-[#ffb86b]">({needs(g)} to do)</span>}
        </button>
      ))}
    </div>
  );
}

function Field({
  k,
  plan,
  draft,
  setDraft,
  update,
}: {
  k: FieldKey;
  plan: Plan;
  draft: string | undefined;
  setDraft: (t: string) => void;
  update: (p: Plan) => void;
}) {
  const d = FIELDS[k] as (typeof FIELDS)[FieldKey] & { help?: string };
  const v = plan.values[k];
  const text = draft ?? (v === null ? "" : fmtNum(v));
  const problem = fieldProblem(k, v);
  const blankNeeded = v === null && d.need === "capacity";
  const unknownIncome = k === "income" && v === null;
  const prov = plan.provenance[k];
  const id = `f-${k}`;
  const unit = k === "income" ? `$ ${INCOME_BASES[plan.incomeBasis].toLowerCase()}` : d.unit;
  const setProv = (patch: Partial<{ status: ProvenanceStatus; source: string; date: string }>) =>
    update({
      ...plan,
      provenance: { ...plan.provenance, [k]: { status: prov?.status ?? "entered", source: prov?.source ?? "", date: prov?.date ?? "", ...patch } },
    });
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {d.label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={Boolean(problem) || blankNeeded}
          aria-describedby={`${id}-u ${id}-e`}
          onChange={(e) => {
            const t = e.target.value;
            setDraft(t);
            const clean = t.replace(/[$,%\s]/g, "");
            const n = clean === "" ? null : Number(clean);
            update({
              ...plan,
              values: { ...plan.values, [k]: n },
              // A business figure typed in is "entered" until marked otherwise.
              provenance:
                plan.kind === "business" && n !== null && !prov ? { ...plan.provenance, [k]: { status: "entered", source: "", date: "" } } : plan.provenance,
            });
          }}
          className={cx(
            "min-h-11 w-32 shrink-0 rounded-xl border bg-surface px-3 tabular-nums",
            problem || blankNeeded ? "border-2 border-[#b45309]" : "border-line-strong",
          )}
        />
        <span id={`${id}-u`} className="text-sm text-ink-muted">
          {unit}
        </span>
      </div>
      <p id={`${id}-e`} className="text-sm">
        {problem && <span className="font-semibold text-[#b45309] dark:text-[#ffb86b]">Check this: {problem}</span>}
        {blankNeeded && <span className="font-semibold text-[#b45309] dark:text-[#ffb86b]">Needed for the forecast.</span>}
        {unknownIncome && <span className="font-semibold">Blank: revenue unknown. Capacity still forecasts.</span>}
      </p>
      {d.help && <p className="text-sm text-ink-muted">{d.help}</p>}
      {plan.kind === "business" && v !== null ? (
        <details className="mt-1 text-sm">
          <summary className="min-h-9 cursor-pointer text-ink-muted">
            {PROVENANCE[prov?.status ?? "entered"]}
            {prov?.source ? ` · ${prov.source}` : ""}
            {prov?.date ? ` · ${prov.date}` : ""}
          </summary>
          <div className="mt-2 grid gap-2 rounded-2xl bg-muted p-3">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="sr-only">How sure is this figure?</legend>
              {(Object.keys(PROVENANCE) as ProvenanceStatus[]).map((s) => (
                <label key={s} className="inline-flex min-h-9 items-center gap-1.5">
                  <input type="radio" name={`${id}-p`} checked={(prov?.status ?? "entered") === s} onChange={() => setProv({ status: s })} />
                  {PROVENANCE[s]}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              Source
              <input
                className="min-h-10 rounded-lg border border-line-strong bg-surface px-2"
                maxLength={160}
                value={prov?.source ?? ""}
                placeholder={k === "income" ? "For example: Partner agreement, schedule 2" : "Where this figure comes from"}
                onChange={(e) => setProv({ source: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              Effective date
              <input
                type="date"
                className="min-h-10 rounded-lg border border-line-strong bg-surface px-2"
                value={prov?.date ?? ""}
                onChange={(e) => setProv({ date: e.target.value })}
              />
            </label>
          </div>
        </details>
      ) : plan.kind === "example" && v !== null ? (
        <p className="text-xs text-ink-muted">Fictional</p>
      ) : null}
    </div>
  );
}

function Classifications({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  return (
    <details className="rounded-2xl bg-muted p-3">
      <summary className="min-h-9 cursor-pointer font-semibold">Optional: Support at Home classifications</summary>
      <p className="mt-1 text-sm text-ink-muted">Recorded for context only. A classification never sets hours or income here.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {Array.from({ length: CLASSIFICATIONS }, (_, i) => (
          <label key={i} className="flex flex-col gap-1 text-sm">
            Class {i + 1}
            <input
              inputMode="numeric"
              className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 tabular-nums"
              value={plan.classifications[i] ?? ""}
              onChange={(e) => {
                const n = e.target.value.trim() === "" ? null : Math.max(0, Math.round(Number(e.target.value)) || 0);
                update({ ...plan, classifications: plan.classifications.map((c, j) => (j === i ? n : c)) });
              }}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

function Headlines({ a }: { a: Analysis }) {
  const s = a.selected;
  const last = s.months.at(-1)!;
  const tile = (label: string, value: string, note?: string) => (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  );
  return (
    <section aria-label="Headline figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tile("Active participants now", fmtNum(a.clientsNow))}
      {tile("First no-hire pressure month", a.noHire.firstPressure === null ? "None" : `Month ${a.noHire.firstPressure}`, `${a.growth.label} case`)}
      {tile("Month 12 operating result", a.revenueKnown ? dollars(last.operating) : "Revenue unknown", OPTION_LABELS[a.optionId])}
      {tile(
        "Lowest cash",
        a.moneyKnown ? dollars(s.lowestCash) : "Not checked",
        a.moneyKnown ? `Month ${s.lowestCashMonth} · ${OPTION_LABELS[a.optionId]}` : "Income, costs or cash blank",
      )}
    </section>
  );
}

function DecisionCard({ a, d }: { a: Analysis; d: ReturnType<typeof decision> }) {
  return (
    <section aria-labelledby="decision-h" className="rounded-3xl bg-[#102a43] p-5 text-white sm:p-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7fd4d4]">
        Planning window · {OPTION_LABELS[a.optionId]} · {a.growth.label} case
      </p>
      <h2 id="decision-h" className="mt-1 font-serif text-2xl font-semibold leading-snug">
        {d.headline}
      </h2>
      {d.reasons.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {d.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <Icon name="arrow-right" className="mt-1 size-4 shrink-0 text-[#7fd4d4]" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      {d.warnings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" aria-label="Warnings">
          {d.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400]">
              <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="font-semibold">Warning: </span>
                {w}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-white/80">
        <span className="font-semibold text-white">Still unknown:</span> {d.unknowns.join("; ")}.
      </p>
      <p className="mt-1 text-sm text-white/80">{d.caveat}</p>
    </section>
  );
}

function WhatChanged({ changes, onDismiss }: { changes: Change[]; onDismiss: () => void }) {
  return (
    <section aria-live="polite" aria-labelledby="changed-h" className="rounded-3xl border-2 border-action bg-tealtint p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="changed-h" className="font-semibold">
          What changed after your last edit
        </h2>
        <button type="button" onClick={onDismiss} aria-label="Hide what changed" className="grid size-9 place-items-center rounded-full hover:bg-surface">
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {changes.map((c) => (
          <li key={c.label} className="text-sm">
            <span className="font-semibold">{c.label}:</span>{" "}
            {c.before ? (
              <>
                <span className="tabular-nums">{c.before}</span> →{" "}
              </>
            ) : null}
            <span className="font-semibold tabular-nums">{c.after}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cases({ plan, growthId, setGrowthId, update }: { plan: Plan; growthId: string; setGrowthId: (id: string) => void; update: (p: Plan) => void }) {
  const cases = growthCases(plan);
  const edit = (which: "slower" | "faster", patch: Partial<GrowthEdit>) => update({ ...plan, [which]: { ...plan[which], ...patch } });
  const num = (v: string, fallback: number) => (v.trim() === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));
  return (
    <section aria-labelledby="cases-h" className={card}>
      <h2 id="cases-h" className="font-serif text-2xl font-semibold">
        Intake cases
      </h2>
      <div role="radiogroup" aria-labelledby="cases-h" className="mt-3 grid gap-2 sm:grid-cols-3">
        {cases.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={growthId === g.id}
            onClick={() => setGrowthId(g.id)}
            className={cx(
              "flex min-h-11 flex-col items-start rounded-2xl border-2 p-3 text-left",
              growthId === g.id ? "border-action bg-tealtint" : "border-line hover:border-line-strong",
            )}
          >
            <span className="font-semibold">
              {growthId === g.id && <Icon name="check" className="mr-1 inline size-4" />}
              {g.label}
            </span>
            <span className="text-sm text-ink-muted">{g.describe}</span>
          </button>
        ))}
      </div>
      <details className="mt-3">
        <summary className="min-h-9 cursor-pointer font-semibold text-accent">Change what slower and faster mean</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(["slower", "faster"] as const).map((w) => (
            <fieldset key={w} className="rounded-2xl bg-muted p-3">
              <legend className="font-semibold">{w === "slower" ? "Slower" : "Faster and more complex"}</legend>
              {(
                [
                  ["newDelta", "New participants a month, compared with your base"],
                  ["exitDelta", "Exits a month, compared with your base"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="mt-2 flex items-center justify-between gap-2 text-sm">
                  {label}
                  <input
                    inputMode="decimal"
                    className="min-h-10 w-20 rounded-lg border border-line-strong bg-surface px-2 tabular-nums"
                    defaultValue={plan[w][key]}
                    onBlur={(e) => edit(w, { [key]: num(e.target.value, plan[w][key]) })}
                  />
                </label>
              ))}
              <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                Recurring work, % of your base
                <input
                  inputMode="decimal"
                  className="min-h-10 w-20 rounded-lg border border-line-strong bg-surface px-2 tabular-nums"
                  defaultValue={Math.round(plan[w].complexity * 100)}
                  onBlur={(e) => edit(w, { complexity: Math.min(2, Math.max(0.5, num(e.target.value, plan[w].complexity * 100) / 100)) })}
                />
              </label>
            </fieldset>
          ))}
        </div>
      </details>
    </section>
  );
}

function OptionCards({ a, optionId, setOptionId }: { a: Analysis; optionId: OptionId; setOptionId: (o: OptionId) => void }) {
  return (
    <div role="radiogroup" aria-label="Options" className="mt-3 grid gap-3 sm:grid-cols-2">
      {OPTION_IDS.map((id) => {
        const f = a.byOption[id];
        const on = optionId === id;
        const hypothetical = id === "workflow" && !a.workflowChecked;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setOptionId(id)}
            className={cx(
              "flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left",
              on ? "border-action bg-tealtint" : "border-line hover:border-line-strong",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2 font-semibold">
              <span>
                {on && <Icon name="check" className="mr-1 inline size-4" />}
                {OPTION_LABELS[id]}
              </span>
              {on && <span className="text-xs font-bold uppercase tracking-wide">Selected</span>}
            </span>
            {hypothetical && <span className="rounded-full bg-[#fff1cc] px-2 py-0.5 text-xs font-semibold text-[#4a3400]">Hypothetical: not checked</span>}
            <dl className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-ink-muted">Months above threshold</dt>
              <dd className="text-right font-semibold tabular-nums">{f.monthsAbove}</dd>
              <dt className="text-ink-muted">Lowest cash</dt>
              <dd className="text-right font-semibold tabular-nums">
                {a.moneyKnown ? dollars(f.lowestCash) : "Not checked"}
                {a.moneyKnown && f.firstReserveBreach !== null && (
                  <span className="block text-xs font-semibold">Below reserve from Month {f.firstReserveBreach}</span>
                )}
              </dd>
              <dt className="text-ink-muted">12-month operating result</dt>
              <dd className="text-right font-semibold tabular-nums">{a.revenueKnown ? dollars(f.operating12) : "Revenue unknown"}</dd>
            </dl>
          </button>
        );
      })}
    </div>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: (table: boolean) => React.ReactNode }) {
  const [table, setTable] = useState(false);
  const id = useMemo(() => `chart-${title.toLowerCase().replace(/\W+/g, "-")}`, [title]);
  return (
    <section aria-labelledby={id} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={id} className="font-serif text-2xl font-semibold">
            {title}
          </h2>
          <p className="text-ink-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          aria-pressed={table}
          onClick={() => setTable(!table)}
          className="min-h-11 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-muted"
        >
          {table ? "Show the chart" : "Show as a table"}
        </button>
      </div>
      <div className="mt-3">{children(table)}</div>
    </section>
  );
}

function Scroll({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

function CapacityTable({ a }: { a: Analysis }) {
  const sel = a.optionId !== "current";
  return (
    <Scroll label="Capacity table">
      <table className="w-full min-w-[32rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line-strong text-left">
            <th className="py-2 pr-3">Month</th>
            <th className="py-2 pr-3 text-right">Current team</th>
            {sel && <th className="py-2 pr-3 text-right">{OPTION_LABELS[a.optionId]}</th>}
            <th className="py-2 text-right">Above threshold ({Math.round(a.threshold * 100)}%)</th>
          </tr>
        </thead>
        <tbody>
          {a.noHire.months.map((m, i) => (
            <tr key={m.month} className="border-b border-line">
              <td className="py-1.5 pr-3">{m.month}</td>
              <td className="py-1.5 pr-3 text-right">{pct(m.utilisation)}</td>
              {sel && <td className="py-1.5 pr-3 text-right">{pct(a.selected.months[i].utilisation)}</td>}
              <td className="py-1.5 text-right">
                {m.pressure ? "Current team" : "–"}
                {sel && a.selected.months[i].pressure ? `, ${OPTION_LABELS[a.optionId]}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroll>
  );
}

function Finance({ a }: { a: Analysis }) {
  const [view, setView] = useState<"operating" | "cash">("operating");
  return (
    <section aria-labelledby="finance-h" className={card}>
      <h2 id="finance-h" className="font-serif text-2xl font-semibold">
        Margin and cash · {OPTION_LABELS[a.optionId]}
      </h2>
      {!a.revenueKnown ? (
        <p className="mt-2 rounded-2xl bg-muted p-4">
          <span className="font-semibold">Revenue unknown.</span> Enter your agreement income (Money) to see operating result, cash and whether a hire is
          affordable. Capacity is forecast without it.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Finance view">
            {(
              [
                ["operating", "Monthly operating result"],
                ["cash", "Closing cash"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                disabled={v === "cash" && !a.moneyKnown}
                onClick={() => setView(v)}
                className={cx(
                  "min-h-11 rounded-full border px-4 text-sm font-semibold disabled:opacity-50",
                  view === v ? "border-action bg-tealtint" : "border-line-strong",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {!a.moneyKnown && <p className="mt-2 text-sm">Cash isn’t checked until opening cash, costs and the reserve are filled in.</p>}
          {a.illustrative && <p className="mt-2 text-sm font-semibold">Illustrative: the income isn’t marked verified against your agreement.</p>}
          <ChartSection
            title={view === "cash" ? "Closing cash" : "Operating result"}
            subtitle={view === "cash" ? "Cash received less costs, against your reserve." : "Earned income less costs, each month."}
          >
            {(table) =>
              table ? (
                <Scroll label="Finance table">
                  <table className="w-full min-w-[28rem] text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-line-strong text-left">
                        <th className="py-2 pr-3">Month</th>
                        <th className="py-2 pr-3 text-right">Operating result</th>
                        <th className="py-2 pr-3 text-right">Closing cash</th>
                        <th className="py-2 text-right">Below reserve</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.selected.months.map((m) => (
                        <tr key={m.month} className="border-b border-line">
                          <td className="py-1.5 pr-3">{m.month}</td>
                          <td className="py-1.5 pr-3 text-right">{dollars(m.operating)}</td>
                          <td className="py-1.5 pr-3 text-right">{a.moneyKnown ? dollars(m.closingCash) : "Not checked"}</td>
                          <td className="py-1.5 text-right">{a.moneyKnown ? (m.reserveBreach ? "Yes" : "No") : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroll>
              ) : (
                <FinanceChart f={a.selected} view={a.moneyKnown ? view : "operating"} reserve={a.reserve} />
              )
            }
          </ChartSection>
        </>
      )}
    </section>
  );
}

function MonthlyTable({ a }: { a: Analysis }) {
  const rows = monthlyRows(a.selected, a);
  const show = (v: string | number, i: number) => (typeof v !== "number" ? v : i === 5 ? `${Math.round(v)}%` : i >= 7 ? dollars(v) : fmtNum(v));
  return (
    <details className={card}>
      <summary className="min-h-11 cursor-pointer font-serif text-2xl font-semibold">Monthly audit table · {OPTION_LABELS[a.optionId]}</summary>
      <p className="mt-1 text-sm text-ink-muted">The same figures as the workbook’s Monthly forecast sheet, rounded for display.</p>
      <Scroll label="Monthly audit table">
        <table className="mt-3 w-full min-w-[60rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line-strong text-left">
              {MONTHLY_HEADER.map((hd) => (
                <th key={hd} className="py-2 pr-3 align-bottom">
                  {hd}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-line">
                {r.map((v, i) => (
                  <td key={i} className={cx("py-1.5 pr-3", i > 0 && "text-right")}>
                    {show(v, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

function ExportButton({
  plan,
  saved,
  growthId,
  optionId,
  disabled,
}: {
  plan: Plan;
  saved: Saved | null;
  growthId: string;
  optionId: OptionId;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const go = async () => {
    setBusy(true);
    setProblem("");
    try {
      // A saved version exports as saved; anything else exports as it is on screen.
      const unchanged = saved && JSON.stringify(saved.plan) === JSON.stringify(plan);
      const res = await fetch("/api/tools/caseload/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(unchanged ? { id: saved!.id, version: saved!.version, growthId, optionId } : { plan, growthId, optionId }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The workbook couldn’t be made.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "plan.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={go}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted disabled:opacity-50"
      >
        <Icon name="file" className="size-4" /> {busy ? "Making the workbook…" : "Download Excel workbook"}
      </button>
      {problem && (
        <span role="alert" className="text-sm font-semibold">
          {problem}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Saved plans, versions and who has access (Plan my business)
// ---------------------------------------------------------------------------------------------

type Compared = {
  a: { version: number; snapshot: Record<string, unknown> };
  b: { version: number; snapshot: Record<string, unknown> };
  inputs: { key: string; label: string; unit: string; before: string; after: string }[];
};
type AccessList = { members: { id: string; name: string; role: string }[]; candidates: { id: string; name: string }[] };

function PlansPanel({
  home,
  plan,
  saved,
  onSaved,
  onOpen,
}: {
  home: Home;
  plan: Plan;
  saved: Saved | null;
  onSaved: (s: Saved) => void;
  onOpen: (s: Saved) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [cmp, setCmp] = useState<{ a: number; b: number }>({ a: 1, b: 1 });
  const [compared, setCompared] = useState<Compared | null>(null);
  const [access, setAccess] = useState<AccessList | null>(null);
  const saveKey = useRef<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setProblem("");
    try {
      return await fn();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changed = saved && JSON.stringify(saved.plan) !== JSON.stringify(plan);
  const open = (id: string, version?: number) =>
    run(async () => onOpen(await api<Saved>(`/api/tools/caseload/plans/${encodeURIComponent(id)}${version ? `?version=${version}` : ""}`)));

  return (
    <section aria-labelledby="plans-h" className={card}>
      <h2 id="plans-h" className="font-serif text-2xl font-semibold">
        Saved plans
      </h2>
      <p className="mt-1 text-ink-muted">
        Nothing is saved until you choose to. Each save is a new version, so an earlier decision is never overwritten. Visible only to people{" "}
        {home.access?.orgName} has authorised.
      </p>

      <div className="mt-4 grid gap-3 rounded-2xl bg-muted p-4">
        {!saved && (
          <label className="flex flex-col gap-1 font-semibold">
            Plan name
            <input
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: 2027 growth"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 font-semibold">
          Note for this version <span className="font-normal text-ink-muted">(optional: what you changed, never a participant’s details)</span>
          <input
            className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || (!saved && !name.trim()) || Boolean(saved && !changed)}
            onClick={() =>
              run(async () => {
                // The same key until this save succeeds: a retry after a lost answer returns the version already made.
                saveKey.current ??= crypto.randomUUID();
                onSaved(await api<Saved>("/api/tools/caseload", { body: { action: "save", id: saved?.id, name, plan, note, idem: saveKey.current } }));
                saveKey.current = null;
                setNote("");
              })
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action disabled:opacity-50"
          >
            {saved ? (changed ? `Save as version ${saved.versions.length + 1}` : "No changes to save") : "Save plan"}
          </button>
          {saved && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => onSaved(await api<Saved>("/api/tools/caseload", { body: { action: "duplicate", id: saved.id, version: saved.version } })))
              }
              className="min-h-11 rounded-full border border-line-strong px-4 font-semibold hover:bg-surface"
            >
              Duplicate version {saved.version}
            </button>
          )}
        </div>
        {problem && (
          <p role="alert" className="font-semibold">
            {problem}
          </p>
        )}
      </div>

      {home.plans.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold">Your business’s plans</h3>
          <ul className="mt-2 divide-y divide-line">
            {home.plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{p.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {p.versions} version{p.versions === 1 ? "" : "s"} · last saved {new Date(p.updatedAt).toLocaleDateString("en-AU")}
                    {p.updatedBy ? ` by ${p.updatedBy}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open(p.id)}
                  className="min-h-11 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-muted"
                >
                  {saved?.id === p.id ? "Reopen latest" : "Open"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {saved && saved.versions.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold">Versions of {saved.name}</h3>
          {(saved.earlierModel || saved.earlierRules) && (
            <div className="mt-1">
              <p className="text-sm">
                Version {saved.version} was saved under earlier {saved.earlierModel ? "model" : "decision rules"}. The page shows it recalculated with the
                current ones; what it showed when saved is kept with it, and nothing is overwritten. Review before relying on it.
              </p>
              <Comparison
                title={`Version ${saved.version}: as saved → recalculated now`}
                c={{
                  a: { version: saved.version, snapshot: saved.versions.find((v) => v.number === saved.version)?.snapshot ?? {} },
                  b: { version: saved.version, snapshot: saved.recalculated },
                  inputs: [],
                }}
              />
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {saved.versions.map((v) => (
              <li key={v.number} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => open(saved.id, v.number)} className="min-h-9 font-semibold text-accent underline underline-offset-2">
                  Version {v.number}
                </button>
                <span className="text-ink-muted">
                  {new Date(v.savedAt).toLocaleString("en-AU")} · {v.savedBy}
                  {v.note ? ` · ${v.note}` : ""}
                  {saved.version === v.number ? " · open now" : ""}
                </span>
              </li>
            ))}
          </ul>
          {saved.versions.length > 1 && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {(["a", "b"] as const).map((w) => (
                <label key={w} className="flex flex-col gap-1 text-sm font-semibold">
                  {w === "a" ? "Compare version" : "with version"}
                  <select
                    className="min-h-11 rounded-xl border border-line-strong bg-surface px-3"
                    value={cmp[w]}
                    onChange={(e) => setCmp({ ...cmp, [w]: Number(e.target.value) })}
                  >
                    {saved.versions.map((v) => (
                      <option key={v.number} value={v.number}>
                        {v.number}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                disabled={busy || cmp.a === cmp.b}
                onClick={() =>
                  run(async () => setCompared(await api<Compared>("/api/tools/caseload", { body: { action: "compare", id: saved.id, a: cmp.a, b: cmp.b } })))
                }
                className="min-h-11 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted disabled:opacity-50"
              >
                Compare
              </button>
            </div>
          )}
          {compared && <Comparison c={compared} />}
        </div>
      )}

      {home.access?.role === "owner" && (
        <details
          className="mt-5"
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open && !access)
              void run(async () => setAccess(await api<AccessList>("/api/tools/caseload", { body: { action: "access" } })));
          }}
        >
          <summary className="min-h-11 cursor-pointer font-semibold">Who can plan {home.access.orgName}</summary>
          {access && (
            <div className="mt-2 grid gap-3">
              <ul className="flex flex-col gap-1">
                {access.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3">
                    <span>
                      {m.name} <span className="text-sm text-ink-muted">({m.role === "owner" ? "owner" : "authorised"})</span>
                    </span>
                    {m.role !== "owner" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => setAccess(await api<AccessList>("/api/tools/caseload", { body: { action: "grant", userId: m.id, grant: false } })))
                        }
                        className="min-h-9 text-sm font-semibold underline underline-offset-2"
                      >
                        Remove access
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {access.candidates.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">Authorise someone in your business</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {access.candidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(async () => setAccess(await api<AccessList>("/api/tools/caseload", { body: { action: "grant", userId: c.id, grant: true } })))
                          }
                          className="min-h-11 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-muted"
                        >
                          Authorise {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </details>
      )}
    </section>
  );
}

function Comparison({ c, title }: { c: Compared; title?: string }) {
  type Snap = { monthsAbove: number; operating12: number | null; lowestCash: number | null };
  const opts = (s: Record<string, unknown>) => (s as { options?: Record<string, Snap> }).options ?? null;
  const A = opts(c.a.snapshot);
  const B = opts(c.b.snapshot);
  // Planner 2 keeps the decision window with each version; older versions don't have one.
  const win = (s: Record<string, unknown>) => {
    const w = (s as { window?: WindowSummary | null }).window;
    if (!w) return "Not recorded";
    const start =
      w.startFrom === null ? "no start needed" : w.startFrom === w.startTo ? `start Month ${w.startFrom}` : `start Month ${w.startFrom} to ${w.startTo}`;
    return `${RECOMMENDATION_LABELS[w.kind as RecommendationKind] ?? w.kind}, ${start}`;
  };
  return (
    <div className="mt-3 rounded-2xl bg-muted p-4">
      <h4 className="font-semibold">{title ?? `Version ${c.a.version} → version ${c.b.version}`}</h4>
      <p className="mt-1 text-sm">
        <span className="font-semibold">Decision window:</span> {win(c.a.snapshot)} → <span className="font-semibold">{win(c.b.snapshot)}</span>
      </p>
      {title ? null : c.inputs.length ? (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {c.inputs.map((i) => (
            <li key={i.key}>
              {i.label}: {i.before} → <span className="font-semibold">{i.after}</span> {i.unit && <span className="text-ink-muted">({i.unit})</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">The inputs are the same.</p>
      )}
      {A && B ? (
        <Scroll label="Version comparison">
          <table className="mt-3 w-full min-w-[30rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th className="py-1 pr-3">Option (expected case, as saved)</th>
                <th className="py-1 pr-3 text-right">Months above</th>
                <th className="py-1 pr-3 text-right">12-month result</th>
                <th className="py-1 text-right">Lowest cash</th>
              </tr>
            </thead>
            <tbody>
              {OPTION_IDS.map((id) => {
                const money = (v: number | null) => (v === null ? "Unknown" : dollars(v));
                return (
                  <tr key={id} className="border-b border-line">
                    <td className="py-1 pr-3">{OPTION_LABELS[id]}</td>
                    <td className="py-1 pr-3 text-right">
                      {A[id].monthsAbove} → {B[id].monthsAbove}
                    </td>
                    <td className="py-1 pr-3 text-right">
                      {money(A[id].operating12)} → {money(B[id].operating12)}
                    </td>
                    <td className="py-1 text-right">
                      {money(A[id].lowestCash)} → {money(B[id].lowestCash)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroll>
      ) : (
        <p className="mt-2 text-sm">One of these versions didn’t have enough filled in to forecast.</p>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        <Link href="#assumptions" className="underline">
          Open a version
        </Link>{" "}
        to see its full forecast.
      </p>
    </div>
  );
}
