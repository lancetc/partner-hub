import { dollars, forecast, planningWindow, type Adjustment, type Forecast, type GrowthCase, type HiringInputs, type HiringOption } from "./hiringModel";

/*
  The hiring decision window (Partner Hub: Care Partner Caseload, Margin and Hiring Runway Simulator PRD, section 6,
  "Trigger logic and uncertainty"). One reviewed, versioned rule set on top of the shared model (lib/hiringModel), used
  by the Hiring Runway block's fictional case (lib/hiringRunway) and the private Plan my business Work Tool
  (lib/caseloadPlanner). Pure: no UI, no AI, no I/O.

  It answers with a window and its assumptions, never one exact trigger:
  - Capacity date: the first month the current team passes the planning threshold, in each of the low, base and high
    cases.
  - Recruitment start window: each case's capacity date − recruitment lead − ramp + 1 (the prototype's heuristic),
    widened by the stated recruitment uncertainty. A range, not a client count.
  - Financial feasibility: for every option in the base case, contribution margin, operating result (owner
    remuneration included, never hidden), the break-even month and the lowest cash, with any reserve breach; and the
    worst cash across the cases.
  - Combined suggestion: hold and monitor, watch, plan recruitment, consider beginning recruitment, interim capacity
    while recruiting, or a plain conflict when capacity and cash pull apart, with the factors behind it and the
    alternatives that need a person's judgement.

  Nothing here is a hiring instruction, a staffing ratio or a contract term. Income is whatever the case or plan says
  its agreement pays; when it's unknown, affordability is not checked and the result says so.
*/

export const WINDOW_VERSION = "hiring-window-1";
/** The months recruitment may run over its stated lead, unless the case says otherwise: the window's uncertainty band. */
export const DEFAULT_LEAD_SPREAD = 1;

export type WindowInput = {
  inputs: HiringInputs;
  options: HiringOption[];
  /** The low, base and high cases (slower, expected, faster). */
  growth: GrowthCase[];
  /** The base case's id. Default "expected", else the middle case. */
  baseId?: string;
  /** Events already known (leave, a payment delay), applied to every case and option. */
  adjustments?: Adjustment[];
  /** Income is entered. Without it, operating result and cash aren't read. Default true. */
  revenueKnown?: boolean;
  /** Income, costs and cash are all entered. Default true. */
  moneyKnown?: boolean;
  /** Months recruitment may run over the stated lead. Default 1. */
  leadSpread?: number;
  /** The workflow option has been checked to protect required tasks and outcomes. */
  workflowChecked?: boolean;
  /** The agreement assigns the monthly direct care-management contact to this business: a visible guardrail, nothing more. */
  contactDuty?: boolean;
  /** The hire whose lead and ramp time the window. Default: the first hire option. */
  hireId?: string;
};

export type CaseRead = {
  id: string;
  label: string;
  describe: string;
  /** First month the current team passes the threshold, or null within the horizon. */
  capacityMonth: number | null;
  noCapacity: boolean;
  monthsAbove: number;
  /** capacityMonth − lead − ramp + 1: can be below Month 1 (already late). */
  startBy: number | null;
};

export type OptionRead = {
  id: string;
  label: string;
  kind: HiringOption["kind"];
  fte: number;
  joins: number | null;
  monthsAbove: number;
  firstPressure: number | null;
  contribution12: number;
  operatingBeforeOwner12: number;
  operating12: number;
  /** First month from which every month's operating result is at least zero, to the horizon. Null: not within it. */
  breakEven: number | null;
  lowestCash: number;
  lowestCashMonth: number;
  firstReserveBreach: number | null;
  negativeCash: boolean;
  /** The lowest cash across every case, and the cases where it breaches the reserve or work passes the threshold. */
  worstCash: number;
  reserveCases: string[];
  pressureCases: string[];
  /** A workflow option not yet checked against required work. */
  hypothetical: boolean;
  serviceRisk: boolean;
  cashRisk: boolean;
};

export type RecommendationKind = "hold-monitor" | "watch" | "plan-recruitment" | "begin-recruiting" | "interim-and-recruit" | "conflict" | "no-hire-option";
export const RECOMMENDATION_LABELS: Record<RecommendationKind, string> = {
  "hold-monitor": "Hold and monitor",
  watch: "Watch the faster case",
  "plan-recruitment": "Plan recruitment",
  "begin-recruiting": "Consider beginning recruitment",
  "interim-and-recruit": "Interim capacity while recruiting",
  conflict: "Capacity and cash conflict",
  "no-hire-option": "No hire option to compare",
};

export type DecisionWindow = {
  version: typeof WINDOW_VERSION;
  baseId: string;
  threshold: number;
  reserve: number;
  lead: number;
  ramp: number;
  leadSpread: number;
  hire: { id: string; label: string } | null;
  earliestJoin: number;
  cases: CaseRead[];
  /** The likely pressure window: the earliest and latest capacity dates across the cases that have one. */
  pressure: { from: number; to: number; cases: string[]; allCases: boolean } | null;
  /** The recruitment start window. Below Month 1 means already late in that case. */
  recruit: { earliest: number; latest: number; base: number | null; late: boolean; openNow: boolean } | null;
  /** Pressure arrives in the base case before any hire could join (starting recruitment in Month 1). */
  pressureBeforeJoin: boolean;
  /** The recruitment start month hires are costed from in the options: the base case's start-by (at least Month 1), or null for each option's own. */
  timedStart: number | null;
  options: OptionRead[];
  revenueKnown: boolean;
  moneyKnown: boolean;
  recommendation: { kind: RecommendationKind; label: string; headline: string; factors: string[]; alternatives: string[] };
  assumptions: string[];
  unknowns: string[];
  caveat: string;
};

const pctText = (v: number) => `${Math.round(v * 100)}%`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** "Month 3", or "now (Month 1)" when it's at or before the first month. */
export const monthWord = (m: number) => (m <= 1 ? "now (Month 1)" : `Month ${m}`);

/** First month from which the monthly operating result stays at or above zero to the horizon; null if the last month is negative. */
export function breakEvenMonth(f: Forecast): number | null {
  const ms = f.months;
  if (!ms.length || ms[ms.length - 1].operating < 0) return null;
  let at = ms.length;
  while (at > 1 && ms[at - 2].operating >= 0) at--;
  return ms[at - 1].month;
}

const sum = (f: Forecast, k: "contribution" | "operatingBeforeOwner") => f.months.reduce((n, m) => n + m[k], 0);

function baseOf(growth: GrowthCase[], baseId?: string) {
  return growth.find((g) => g.id === (baseId ?? "expected")) ?? growth[Math.floor(growth.length / 2)] ?? growth[0];
}

/** The decision window for one case or plan. Deterministic: the same inputs always give the same window. */
export function decisionWindow(w: WindowInput): DecisionWindow {
  const adj = w.adjustments ?? [];
  const revenueKnown = w.revenueKnown ?? true;
  const moneyKnown = (w.moneyKnown ?? true) && revenueKnown;
  const spread = Math.max(0, Math.round(w.leadSpread ?? DEFAULT_LEAD_SPREAD));
  const base = baseOf(w.growth, w.baseId);
  const none: HiringOption = w.options.find((o) => o.kind === "none") ?? {
    id: "none",
    label: "Keep current team",
    kind: "none",
    fte: 0,
    startMonth: 1,
    leadMonths: 0,
    rampMonths: 0,
    oneOffCost: 0,
    savingShare: 0,
    savingFromMonth: 1,
  };
  const hires = w.options.filter((o) => o.kind === "hire");
  const hire = hires.find((o) => o.id === w.hireId) ?? hires[0] ?? null;
  const lead = hire?.leadMonths ?? 0;
  const ramp = hire?.rampMonths ?? 0;
  const earliestJoin = 1 + lead;
  const th = pctText(w.inputs.threshold);

  const cases: CaseRead[] = w.growth.map((g) => {
    const f = forecast(w.inputs, none, g, adj);
    const first = f.months.find((m) => m.pressure);
    return {
      id: g.id,
      label: g.label,
      describe: g.describe,
      capacityMonth: f.firstPressure,
      noCapacity: Boolean(first?.noCapacity),
      monthsAbove: f.monthsAbove,
      startBy: hire ? planningWindow(f.firstPressure, lead, ramp) : null,
    };
  });
  const pressured = cases.filter((c) => c.capacityMonth !== null);
  const baseRead = cases.find((c) => c.id === base.id)!;
  const pressure = pressured.length
    ? {
        from: Math.min(...pressured.map((c) => c.capacityMonth!)),
        to: Math.max(...pressured.map((c) => c.capacityMonth!)),
        cases: pressured.map((c) => c.label),
        allCases: pressured.length === cases.length,
      }
    : null;
  const starts = pressured.map((c) => c.startBy).filter((s): s is number => s !== null);
  const recruit =
    hire && starts.length
      ? (() => {
          const earliest = Math.min(...starts) - spread;
          const latest = Math.max(...starts);
          return { earliest, latest, base: baseRead.startBy, late: latest < 1, openNow: earliest <= 1 };
        })()
      : null;
  const pressureBeforeJoin = baseRead.capacityMonth !== null && Boolean(hire) && baseRead.capacityMonth < earliestJoin;

  // Feasibility is read for a hire that starts recruiting when the base case says to (never before Month 1), so a
  // late pressure date isn't judged on a hire paid for from Month 1. With no base-case pressure, each option's own start.
  const timedStart = baseRead.startBy === null ? null : Math.min(12, Math.max(1, baseRead.startBy));
  const options: OptionRead[] = w.options.map((given) => {
    const o = given.kind === "hire" && timedStart !== null ? { ...given, startMonth: timedStart } : given;
    const f = forecast(w.inputs, o, base, adj);
    const all = w.growth.map((g) => ({ g, f: g.id === base.id ? f : forecast(w.inputs, o, g, adj) }));
    return {
      id: o.id,
      label: o.label,
      kind: o.kind,
      fte: o.fte,
      joins: f.joins,
      monthsAbove: f.monthsAbove,
      firstPressure: f.firstPressure,
      contribution12: sum(f, "contribution"),
      operatingBeforeOwner12: sum(f, "operatingBeforeOwner"),
      operating12: f.operating12,
      breakEven: breakEvenMonth(f),
      lowestCash: f.lowestCash,
      lowestCashMonth: f.lowestCashMonth,
      firstReserveBreach: f.firstReserveBreach,
      negativeCash: f.lowestCash < 0,
      worstCash: Math.min(...all.map((x) => x.f.lowestCash)),
      reserveCases: all.filter((x) => x.f.firstReserveBreach !== null).map((x) => x.g.label),
      pressureCases: all.filter((x) => x.f.monthsAbove > 0).map((x) => x.g.label),
      hypothetical: o.kind === "workflow" && !w.workflowChecked,
      serviceRisk: f.monthsAbove > 0,
      cashRisk: moneyKnown && f.firstReserveBreach !== null,
    };
  });

  // ------------------------------------------------------------------ the suggestion, with its factors
  const factors: string[] = [];
  const alternatives: string[] = [];
  const caseLine = cases
    .map(
      (c) => `${c.label}: ${c.capacityMonth === null ? "not within 12 months" : `Month ${c.capacityMonth}${c.noCapacity ? " (no available capacity)" : ""}`}`,
    )
    .join("; ");
  if (pressure) factors.push(`Current team passes the ${th} planning threshold. ${caseLine}.`);
  if (hire)
    factors.push(
      `Recruitment is assumed to take ${plural(lead, "month")} (allowing ${plural(spread, "month")} more), then ${plural(ramp, "month")} to reach full capacity (${hire.label}).`,
    );
  const noneRead = options.find((o) => o.kind === "none");
  if (noneRead && noneRead.serviceRisk && revenueKnown && noneRead.operating12 > 0)
    factors.push(
      `Keeping the current team has a positive 12-month operating result (${dollars(noneRead.operating12)}), but ${plural(noneRead.monthsAbove, "month")} above the threshold: margin doesn’t make the workload safe.`,
    );
  const hireReads = options.filter((o) => o.kind === "hire");
  if (!revenueKnown) factors.push("Revenue unknown: enter the agreement’s income (or seek authorised confirmation) before reading affordability.");
  else if (!moneyKnown) factors.push("Costs or cash are incomplete, so cash runway and the reserve aren’t checked.");
  else
    for (const h of hireReads)
      factors.push(
        `${h.label}: lowest cash ${dollars(h.lowestCash)} in Month ${h.lowestCashMonth}${h.firstReserveBreach !== null ? `, below the ${dollars(w.inputs.reserve)} reserve from Month ${h.firstReserveBreach}` : ", above the reserve"}; ${h.breakEven === null ? "monthly operating result not back above zero within 12 months" : `monthly operating result at or above zero from Month ${h.breakEven}`}.`,
      );
  const affordable = hireReads.filter((h) => !h.cashRisk);
  if (moneyKnown && affordable.length && affordable.length < hireReads.length)
    factors.push(
      `${affordable.map((h) => h.label).join(" and ")} ${affordable.length === 1 ? "stays" : "stay"} above the reserve; ${hireReads
        .filter((h) => h.cashRisk)
        .map((h) => h.label)
        .join(" and ")} ${hireReads.length - affordable.length === 1 ? "doesn’t" : "don’t"}. A smaller step first may be the cash-safe one.`,
    );
  for (const h of hireReads)
    if (moneyKnown && h.operating12 > 0 && h.cashRisk)
      factors.push(`${h.label} has a positive 12-month operating result but still dips below the reserve: profitable isn’t the same as cash-safe.`);
  if (w.contactDuty && pressure)
    factors.push(
      "Your agreement assigns the monthly direct care-management contact to this business: in months above the threshold that contact is at risk, so treat them as a service risk.",
    );

  let kind: RecommendationKind;
  let headline: string;
  if (!pressure) {
    kind = "hold-monitor";
    headline = `The current team stays under the ${th} planning threshold in every case for 12 months. Hold and monitor; revisit when referrals, the client mix or the team change.`;
  } else if (baseRead.capacityMonth === null) {
    kind = "watch";
    headline = `Only the ${pressure.cases.join(" and ").toLowerCase()} case passes the threshold (from Month ${pressure.from}). Monitor intake and set a date to recheck${
      recruit
        ? `: if that case starts to show, recruitment would be due ${recruit.earliest <= 1 ? "straight away" : `from about Month ${recruit.earliest}`}`
        : ""
    }.`;
  } else if (!hire) {
    kind = "no-hire-option";
    headline = `The current team passes the ${th} threshold in Month ${baseRead.capacityMonth}. There’s no hire option here to time.`;
  } else if (moneyKnown && hireReads.length && !affordable.length) {
    kind = "conflict";
    headline = `Capacity pressure arrives in Month ${baseRead.capacityMonth}, but every hire option takes cash below the ${dollars(w.inputs.reserve)} reserve under these assumptions. Weigh the alternatives below before committing.`;
  } else if (pressureBeforeJoin || recruit?.late) {
    kind = "interim-and-recruit";
    headline = `Pressure arrives in Month ${baseRead.capacityMonth}, before a new coordinator could ${
      pressureBeforeJoin
        ? `join (Month ${earliestJoin} at the earliest)`
        : `reach full capacity (Month ${earliestJoin + Math.max(0, ramp - 1)} at the earliest)`
    }. Consider starting recruitment now, with interim capacity to protect current participants.`;
  } else if (recruit && recruit.openNow) {
    kind = "begin-recruiting";
    headline = `Consider beginning recruitment now: the start window runs from Month 1 to Month ${recruit.latest}${recruit.base !== null ? ` (Month ${Math.max(1, recruit.base)} in the base case)` : ""}.`;
  } else {
    kind = "plan-recruitment";
    headline = `Plan to begin recruitment between Month ${recruit!.earliest} and Month ${recruit!.latest}${recruit!.base !== null ? ` (Month ${recruit!.base} in the base case)` : ""}.`;
  }
  if (pressure) {
    alternatives.push("Interim or contract capacity while recruiting");
    alternatives.push("Pace intake: agree a slower start for new referrals");
    const wf = options.find((o) => o.kind === "workflow");
    alternatives.push(`Redistribute work or repair a process${wf?.hypothetical ? " (the workflow option is hypothetical until checked)" : ""}`);
    alternatives.push("Talk with your Trilogy Care contact about intake and support");
  }

  const assumptions = [
    `Planning threshold: ${th} of available hours, the business’s own buffer, not a staffing standard.`,
    ...(hire ? [`Recruitment lead: ${plural(lead, "month")}, plus or minus ${plural(spread, "month")}. Ramp to full capacity: ${plural(ramp, "month")}.`] : []),
    `Payment lag: ${plural(Math.round(w.inputs.paymentLagMonths), "month")} between earning income and receiving it.`,
    ...w.growth.map((g) => g.describe).filter(Boolean),
    ...(adj.length ? ["Known events (leave, payment timing) are included in every case."] : []),
    "Income is the agreement’s, as entered. Public care-management funding is never used as the business’s income.",
  ];
  const unknowns = [
    "Whether referrals and exits arrive as assumed",
    ...(hire ? [`Whether recruitment takes ${plural(lead, "month")}`] : []),
    ...(revenueKnown ? [] : ["The agreement’s income"]),
    ...(options.some((o) => o.hypothetical) ? ["Whether the workflow change protects required work"] : []),
  ];

  return {
    version: WINDOW_VERSION,
    baseId: base.id,
    threshold: w.inputs.threshold,
    reserve: w.inputs.reserve,
    lead,
    ramp,
    leadSpread: spread,
    hire: hire ? { id: hire.id, label: hire.label } : null,
    earliestJoin,
    cases,
    pressure,
    recruit,
    pressureBeforeJoin,
    timedStart,
    options,
    revenueKnown,
    moneyKnown,
    recommendation: { kind, label: RECOMMENDATION_LABELS[kind], headline, factors, alternatives },
    assumptions,
    unknowns,
    caveat:
      "A window under the assumptions shown, not a hiring instruction, a client count at which to hire, or a staffing ratio. It needs human judgement and a service-quality review.",
  };
}

/** The recruitment start window in words, the same everywhere it's shown. */
export function recruitText(d: Pick<DecisionWindow, "recruit">) {
  const r = d.recruit;
  if (!r) return "Not needed within 12 months";
  if (r.late) return "Now: already late";
  const from = Math.max(1, r.earliest);
  return from === r.latest ? monthWord(r.latest) : `${monthWord(from)} to Month ${r.latest}`;
}

/** The window without any figure: what a saved version or an event may carry. */
export const windowSummary = (d: DecisionWindow) => ({
  version: d.version,
  kind: d.recommendation.kind,
  pressureFrom: d.pressure?.from ?? null,
  pressureTo: d.pressure?.to ?? null,
  startFrom: d.recruit ? Math.max(1, d.recruit.earliest) : null,
  startTo: d.recruit ? Math.max(1, d.recruit.latest) : null,
});
export type WindowSummary = ReturnType<typeof windowSummary>;

// ---------------------------------------------------------------------------------------------
// Sensitivity: one assumption at a time, in the base case
// ---------------------------------------------------------------------------------------------

export type SensitivityRow = {
  id: string;
  label: string;
  capacityMonth: number | null;
  startBy: number | null;
  /** For the hire the window is read for (or the current team when there's none). */
  monthsAbove: number;
  lowestCash: number;
  firstReserveBreach: number | null;
  /** What moved compared with the base, in words. */
  moved: string[];
};

/** Each one changes one assumption by a stated amount, so the range is transparent rather than a hidden band. */
export const SENSITIVITIES = [
  { id: "referrals", label: "One more new participant each month" },
  { id: "onboarding", label: "Onboarding takes 50% longer" },
  { id: "complexity", label: "Recurring work 10% heavier (a more complex mix)" },
  { id: "exits", label: "One more exit each month" },
  { id: "leave", label: "Two weeks’ unplanned leave for one coordinator in Month 2" },
  { id: "lead", label: "Recruitment takes a month longer" },
  { id: "lag", label: "Payments arrive a month later" },
] as const;

export function sensitivity(w: WindowInput): { base: SensitivityRow; rows: SensitivityRow[]; hire: string | null; moneyKnown: boolean } {
  const adj = w.adjustments ?? [];
  const g0 = baseOf(w.growth, w.baseId);
  const none = w.options.find((o) => o.kind === "none");
  const hires = w.options.filter((o) => o.kind === "hire");
  const hire = hires.find((o) => o.id === w.hireId) ?? hires[0] ?? null;
  const moneyKnown = (w.moneyKnown ?? true) && (w.revenueKnown ?? true);
  const run = (id: string, label: string, inputs: HiringInputs, g: GrowthCase, extra: Adjustment[], leadPlus = 0): SensitivityRow => {
    const all = [...adj, ...extra];
    const n = none ? forecast(inputs, none, g, all) : null;
    const h = hire ? forecast(inputs, { ...hire, leadMonths: hire.leadMonths + leadPlus }, g, all) : n;
    return {
      id,
      label,
      capacityMonth: n?.firstPressure ?? null,
      startBy: hire && n ? planningWindow(n.firstPressure, hire.leadMonths + leadPlus, hire.rampMonths) : null,
      monthsAbove: h?.monthsAbove ?? 0,
      lowestCash: h?.lowestCash ?? 0,
      firstReserveBreach: h?.firstReserveBreach ?? null,
      moved: [],
    };
  };
  const i = w.inputs;
  const base = run("base", "Base case as entered", i, g0, []);
  const rows = SENSITIVITIES.map((s) => {
    switch (s.id) {
      case "referrals":
        return run(s.id, s.label, i, g0, [{ kind: "intake", fromMonth: 1, extraNew: 1 }]);
      case "onboarding":
        return run(s.id, s.label, { ...i, onboardingHours: i.onboardingHours * 1.5 }, g0, []);
      case "complexity":
        return run(s.id, s.label, i, { ...g0, complexity: g0.complexity * 1.1 }, []);
      case "exits":
        return run(s.id, s.label, { ...i, exitsPerMonth: i.exitsPerMonth + 1 }, g0, []);
      case "leave":
        return run(s.id, s.label, i, g0, [{ kind: "leave", month: 2, hours: i.paidWeeklyHours * 2 * i.productive }]);
      case "lead":
        return run(s.id, s.label, i, g0, [], 1);
      case "lag":
        return run(s.id, s.label, i, g0, [{ kind: "paymentDelay", fromMonth: 1, extraMonths: 1 }]);
    }
  });
  for (const r of rows) {
    if (r.capacityMonth !== base.capacityMonth)
      r.moved.push(
        r.capacityMonth === null
          ? "No pressure within 12 months"
          : base.capacityMonth === null
            ? `Pressure appears in Month ${r.capacityMonth}`
            : `Pressure ${Math.abs(r.capacityMonth - base.capacityMonth)} month${Math.abs(r.capacityMonth - base.capacityMonth) === 1 ? "" : "s"} ${r.capacityMonth < base.capacityMonth ? "earlier" : "later"} (Month ${r.capacityMonth})`,
      );
    if (r.startBy !== null && r.startBy !== base.startBy) {
      const d = base.startBy === null ? null : r.startBy - base.startBy;
      r.moved.push(
        d === null
          ? `Recruitment start by ${monthWord(r.startBy)}`
          : `Recruitment start-by ${plural(Math.abs(d), "month")} ${d < 0 ? "earlier" : "later"} (${r.startBy <= 1 ? "due now" : `Month ${r.startBy}`})`,
      );
    }
    if (r.monthsAbove !== base.monthsAbove) r.moved.push(`${plural(r.monthsAbove, "month")} above the threshold${hire ? ` with ${hire.label}` : ""}`);
    if (moneyKnown) {
      const d = r.lowestCash - base.lowestCash;
      if (Math.abs(d) >= 1) r.moved.push(`Lowest cash ${dollars(Math.abs(d))} ${d < 0 ? "lower" : "higher"}`);
      if (r.firstReserveBreach !== base.firstReserveBreach)
        r.moved.push(r.firstReserveBreach === null ? "Stays above the reserve" : `Below the reserve from Month ${r.firstReserveBreach}`);
    }
    if (!r.moved.length) r.moved.push("No change to the window or cash");
  }
  return { base, rows, hire: hire?.label ?? null, moneyKnown };
}
