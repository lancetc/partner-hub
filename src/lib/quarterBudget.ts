import { CATEGORIES, categoryOn, isDate, money, quarterDays, type Category, type Unit } from "./sandbox";
import { baseRules, quarterRules, QUARTER_RULES, type QuarterRuleSet } from "./quarterEndRules";

/*
  The Quarterly Budget Decision Lab's calculation (docs/budget-decision-lab.md): a fictional participant's quarter-end
  position, read as current versus projected, with the carryover threshold, the contribution estimate and the checks
  each choice raises. Pure and deterministic, in whole cents, so the learner's page, the editor's preview and the
  server compute the same thing.

  Shared with the Budget Sandbox (lib/sandbox), never copied: contribution categories, the date a service kind changes
  category (personal care on 1 October 2026), the care-management percentage and the carryover minimum and
  percentage. The rules the Sandbox doesn't have are in lib/quarterEndRules, flagged for Finance and policy review.

  - The current balance is what's there now. Booked and proposed sessions change the projection only: never the
    current balance, and never "spent" or "claimed".
  - A session draws its government-funded share from the ongoing balance; the participant's contribution is theirs,
    payable as services are delivered, and never treated as extra funding (the Sandbox's ledger rule).
  - A contribution is shown only when the category's assessed rate, the price and an effective rule are all known.
    Otherwise it "needs checking": never zero.
  - Carryover = the lesser of the projected unspent amount and the higher of $1,000 or 10% of the quarterly budget
    including supplements. The amount above it is information, never a target, and never a failure by itself.
  - AT–HM is never part of ongoing spend.
*/

export const MODEL_VERSION = "quarter-budget-1";
export const PRACTICE_LABEL = "Practice case: fictional figures";
export const NEEDS_CHECKING = "needs checking";

/** How the scenario's displayed balance treats the care-management allocation. Blank is an error, never a default. */
export const BASES = {
  "": "Not stated",
  "direct-after-cm": "The direct-service balance already accounts for the care-management allocation",
  "gross-before-cm": "The displayed balance still includes some care-management allocation, deducted once here",
} as const;
export type Basis = keyof typeof BASES;

export type Figures = {
  /** Fictional practice classification label, e.g. "Fictional practice budget". */
  classificationLabel: string;
  /** The approved quarterly budget including supplements, in cents. */
  quarterlyBudgetCents: number;
  /** The part of that which is supplements (already included above). */
  supplementsCents: number;
  basis: Basis;
  /** Care management the scenario deducts to reach the direct-service figure. Zero when the balance already accounts for it. */
  careManagementDeductedCents: number;
  /** The displayed balance on the snapshot date. */
  currentBalanceCents: number;
  quarter: { start: string; end: string };
  /** The training snapshot: "today" in the story. */
  snapshot: string;
  /** Separate pools: null means this case has none, and says so. Never treated as zero ongoing funding. */
  pools: { atHmCents: number | null; hcpUnspentCents: number | null; shortTermCents: number | null };
};

export type Route = "ongoing" | "at-hm";
/** Whether the participant wants it: "yes", "no", or "ask" (not discussed yet). */
export type Agreed = "yes" | "no" | "ask";

export type Service = {
  id: string;
  name: string;
  purpose: string;
  /** A kind the Sandbox ruleset may move between categories, like "personal-care". */
  kind: string;
  category: Category;
  unit: Unit;
  unitPriceCents: number;
  /** Units at each session: 2 hours, a return trip of 2. */
  unitsEach: number;
  /** In the participant's approved care plan. */
  approved: boolean;
  route: Route;
  /** Who would deliver it, for the card. */
  supplier: string;
  /** Dates the supplier can deliver a new session in the remaining days. Empty: not available before quarter end. */
  availability: string[];
  agreed: Agreed;
  /** What the participant said about it, once asked. */
  says: string;
  /** One of the things the participant said matters most. */
  priority: boolean;
  /** Where the price came from: "Budget Sandbox price list", or a note for anything new. */
  priceSource: string;
};

export type Booked = { id: string; serviceId: string; date: string; note?: string };
/** A session the learner proposes. `review` turns an unapproved service into a review request instead of a session. */
export type Proposed = { serviceId: string; date: string; review?: boolean };
export type Rates = Record<Category, number | null>;

export type Case = {
  ruleSetId: string;
  scenarioVersion: string;
  figures: Figures;
  rates: Rates;
  services: Service[];
  booked: Booked[];
};

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** Days left in the quarter after the snapshot day. */
export const daysLeft = (f: Pick<Figures, "quarter" | "snapshot">) =>
  isDate(f.snapshot) && isDate(f.quarter.end) ? Math.max(0, Math.round((at(f.quarter.end) - at(f.snapshot)) / DAY)) : 0;
export const inWindow = (f: Pick<Figures, "quarter" | "snapshot">, date: string) => isDate(date) && date > f.snapshot && date <= f.quarter.end;
export const showDate = (d: string, opts: { weekday?: boolean; year?: boolean } = {}) =>
  isDate(d)
    ? new Intl.DateTimeFormat("en-AU", {
        ...(opts.weekday !== false && { weekday: "short" }),
        day: "numeric",
        month: "short",
        ...(opts.year && { year: "numeric" }),
        timeZone: "UTC",
      }).format(new Date(`${d}T00:00:00Z`))
    : "";
export { quarterDays, money };

// ---------------------------------------------------------------------------------------------
// The carryover threshold
// ---------------------------------------------------------------------------------------------

export type Threshold = { cents: number; minimumCents: number; percent: number; percentOfBudgetCents: number; budgetCents: number; text: string };

/** The higher of the Sandbox ruleset's minimum ($1,000) or its percentage (10%) of the quarterly budget including supplements. */
export function carryoverThreshold(budgetCents: number, rules: QuarterRuleSet): Threshold {
  const base = baseRules(rules).carryover;
  const pct = Math.round((Math.max(0, budgetCents) * base.percentCap) / 100);
  const cents = Math.max(base.minimumCapCents, pct);
  return {
    cents,
    minimumCents: base.minimumCapCents,
    percent: base.percentCap,
    percentOfBudgetCents: pct,
    budgetCents,
    text: `The higher of ${money(base.minimumCapCents)} or ${base.percentCap}% × ${money(budgetCents)} (${money(pct)}): ${money(cents)}`,
  };
}

/** What would carry over and what wouldn't, for a projected balance: limited to the amount actually unspent. */
export function carryoverOf(projectedCents: number, threshold: number) {
  const unspent = Math.max(0, projectedCents);
  return { carryoverCents: Math.min(unspent, threshold), aboveCents: Math.max(0, unspent - threshold), overspendCents: Math.max(0, -projectedCents) };
}

// ---------------------------------------------------------------------------------------------
// A session's cost
// ---------------------------------------------------------------------------------------------

export type Cost = {
  category: Category;
  fullCents: number;
  /** Null when the rate, the price or an effective rule isn't known: "needs checking". */
  contributionCents: number | null;
  /** The draw on the ongoing balance. When the contribution isn't known, the full price is used (the cautious figure). */
  governmentCents: number;
  rateBp: number | null;
  known: boolean;
  why: string;
};

export function sessionCost(c: Pick<Case, "rates" | "ruleSetId">, s: Service, date: string, list: QuarterRuleSet[] = QUARTER_RULES): Cost {
  const rules = quarterRules(c.ruleSetId, list);
  const base = rules ? baseRules(rules) : undefined;
  const category = base ? categoryOn(base, s, date) : s.category;
  const fullCents = Math.round(s.unitsEach * s.unitPriceCents);
  const rateBp = category === "clinical" ? 0 : c.rates[category];
  const effective = Boolean(rules && base && date >= rules.effectiveFrom && date >= base.effectiveFrom);
  const known = rateBp !== null && fullCents > 0 && effective;
  const contributionCents = known ? Math.round((fullCents * rateBp!) / 10000) : null;
  return {
    category,
    fullCents,
    contributionCents,
    governmentCents: contributionCents === null ? fullCents : fullCents - contributionCents,
    rateBp,
    known,
    why: !fullCents
      ? "The price isn’t known."
      : rateBp === null
        ? `${CATEGORIES[category]} has no assessed rate in this case.`
        : !effective
          ? "No reviewed rule covers this date."
          : `${CATEGORIES[category]} at ${rateBp / 100}%`,
  };
}

// ---------------------------------------------------------------------------------------------
// Proposed sessions: blocked, unresolved or counted
// ---------------------------------------------------------------------------------------------

export const SESSION_PROBLEMS = {
  IMPOSSIBLE_DATE: "That date isn’t in the days left in this quarter.",
  UNAVAILABLE: "The supplier can’t deliver a session on that date.",
  ATHM_NOT_ONGOING: "An AT–HM item can’t be added to ongoing service spend. It has its own approval and funding route.",
  UNKNOWN_SERVICE: "That service isn’t in this case.",
  UNAPPROVED: "Not in the approved care plan: unresolved until a review approves it.",
  NOT_AGREED: "The participant hasn’t agreed to this: unresolved.",
} as const;
export type SessionProblem = keyof typeof SESSION_PROBLEMS;
/** Problems that stop a session being added at all. The others mark it unresolved, outside the projection. */
export const BLOCKING: readonly SessionProblem[] = ["IMPOSSIBLE_DATE", "UNAVAILABLE", "ATHM_NOT_ONGOING", "UNKNOWN_SERVICE"];

export function sessionProblems(c: Pick<Case, "figures" | "services">, p: Proposed, availability?: (s: Service) => string[]): SessionProblem[] {
  const s = c.services.find((x) => x.id === p.serviceId);
  if (!s) return ["UNKNOWN_SERVICE"];
  if (s.route === "at-hm") return ["ATHM_NOT_ONGOING"];
  const out: SessionProblem[] = [];
  if (!inWindow(c.figures, p.date)) out.push("IMPOSSIBLE_DATE");
  else if (!(availability ? availability(s) : s.availability).includes(p.date)) out.push("UNAVAILABLE");
  if (!s.approved) out.push("UNAPPROVED");
  if (s.agreed === "no") out.push("NOT_AGREED");
  return out;
}
export const blocked = (problems: SessionProblem[]) => problems.some((p) => BLOCKING.includes(p));

// ---------------------------------------------------------------------------------------------
// The projection: the output contract (PRD section 7)
// ---------------------------------------------------------------------------------------------

export type Severity = "info" | "check" | "critical";
export type DecisionCheck = {
  code: string;
  severity: Severity;
  sourceId: string;
  result: "pass" | "fail" | "unresolved" | "info";
  explanationKey: string;
  text: string;
};

export type Line = {
  key: string;
  serviceId: string;
  name: string;
  date: string;
  status: "booked" | "proposed" | "unresolved" | "review" | "cancelled";
  note: string;
  cost: Cost;
};

export type Projection = {
  scenarioVersionId: string;
  ruleSetId: string;
  effectiveDate: string;
  modelVersion: string;
  /** What's in the direct-service balance now, after any care-management deduction the basis calls for. */
  actualAvailableCents: number;
  bookedEstimateCents: number;
  proposedEstimateCents: number;
  scheduledEstimatedCents: number;
  projectedBalanceCents: number;
  threshold: Threshold;
  projectedCarryoverCents: number;
  projectedAboveThresholdCents: number;
  overspendCents: number;
  governmentFundingEstimateCents: number;
  fullPriceCents: number;
  contribution: { knownCents: number; complete: boolean; basis: string; uncertainty: string; unknown: string[] };
  lines: Line[];
  checks: DecisionCheck[];
  days: { quarter: number; left: number };
  /** Separate pools: present or not, never added to the ongoing balance. */
  pools: Figures["pools"];
};

export type ProjectionInput = {
  proposed: Proposed[];
  /** Booked sessions cancelled by a schedule change. */
  cancelled?: string[];
  /** Supplier availability that differs from the case (a schedule-change variant). */
  availability?: Record<string, string[]>;
  ratesBasis?: string;
};

/** The figures a case starts from, or a learner's plan leads to. Deterministic, in cents. */
export function project(c: Case, input: ProjectionInput = { proposed: [] }, list: QuarterRuleSet[] = QUARTER_RULES): Projection {
  const rules = quarterRules(c.ruleSetId, list) ?? QUARTER_RULES[0];
  const f = c.figures;
  const availability = (s: Service) => input.availability?.[s.id] ?? s.availability;
  const cancelled = new Set(input.cancelled ?? []);
  // The basis says whether care management is still inside the displayed balance. It's deducted once, or not at all.
  const actual = f.currentBalanceCents - (f.basis === "gross-before-cm" ? f.careManagementDeductedCents : 0);
  const lines: Line[] = [];
  for (const b of c.booked) {
    const s = c.services.find((x) => x.id === b.serviceId);
    if (!s) continue;
    lines.push({
      key: b.id,
      serviceId: s.id,
      name: s.name,
      date: b.date,
      status: cancelled.has(b.id) ? "cancelled" : "booked",
      note: cancelled.has(b.id)
        ? "Cancelled by the supplier: the projection changes, the current balance doesn’t."
        : (b.note ?? "Booked: an estimate until delivered"),
      cost: sessionCost(c, s, b.date, list),
    });
  }
  const seen = new Set<string>();
  for (const p of input.proposed) {
    const s = c.services.find((x) => x.id === p.serviceId);
    const k = `${p.serviceId}@${p.date}`;
    if (!s || seen.has(k)) continue;
    seen.add(k);
    const problems = sessionProblems(c, p, availability);
    if (blocked(problems)) continue;
    const status: Line["status"] = p.review && !s.approved ? "review" : problems.length ? "unresolved" : "proposed";
    lines.push({
      key: `p:${k}`,
      serviceId: s.id,
      name: s.name,
      date: p.date,
      status,
      note:
        status === "review"
          ? "A review request, not a session: nothing changes until the care plan is reviewed."
          : status === "unresolved"
            ? problems.map((x) => SESSION_PROBLEMS[x]).join(" ")
            : "Proposed: changes the projection only",
      cost: sessionCost(c, s, p.date, list),
    });
  }
  const counted = lines.filter((l) => l.status === "booked" || l.status === "proposed");
  const sum = (ls: Line[], fn: (l: Line) => number) => ls.reduce((n, l) => n + fn(l), 0);
  const bookedEstimate = sum(
    counted.filter((l) => l.status === "booked"),
    (l) => l.cost.governmentCents,
  );
  const proposedEstimate = sum(
    counted.filter((l) => l.status === "proposed"),
    (l) => l.cost.governmentCents,
  );
  const scheduled = bookedEstimate + proposedEstimate;
  const projected = actual - scheduled;
  const threshold = carryoverThreshold(f.quarterlyBudgetCents, rules);
  const carry = carryoverOf(projected, threshold.cents);
  const unknown = counted.filter((l) => !l.cost.known);
  const knownContribution = sum(counted, (l) => l.cost.contributionCents ?? 0);
  const checks: DecisionCheck[] = [];
  const add = (code: string, severity: Severity, sourceId: string, result: DecisionCheck["result"], text: string) =>
    checks.push({ code, severity, sourceId, result, explanationKey: code.toLowerCase(), text });
  add(
    "CURRENT_VS_PROJECTED",
    "info",
    "budgets",
    "info",
    `Current ${money(actual)} is what’s in the balance now. Projected ${money(projected)} is what it would be if every booked and proposed session happens as estimated.`,
  );
  add(
    "BOOKED_NOT_CLAIMED",
    "info",
    "payments",
    "pass",
    "Booked and proposed sessions change the projection only. Nothing is spent or claimed until a service is delivered.",
  );
  add("CARRYOVER_THRESHOLD", "info", "budgets", "info", `Carryover threshold: ${threshold.text}.`);
  if (carry.aboveCents > 0)
    add(
      "ABOVE_THRESHOLD_NOT_TARGET",
      "info",
      "budgets",
      "info",
      `About ${money(carry.aboveCents)} is projected above the threshold. That’s information to explain, not a spending target or a failure.`,
    );
  if (carry.overspendCents > 0)
    add("OVERSPEND", "critical", "payments", "fail", `A projected overspend of ${money(carry.overspendCents)}. ${rules.overspend.note}`);
  for (const l of lines.filter((x) => x.status === "unresolved"))
    add("UNRESOLVED_SESSION", "check", "care-plans", "unresolved", `${l.name}, ${showDate(l.date)}: ${l.note}`);
  for (const l of lines.filter((x) => x.status === "review"))
    add("REVIEW_REQUESTED", "info", "care-plans", "info", `${l.name}: a care plan review is requested. It isn’t a session until approved.`);
  if (unknown.length)
    add(
      "CONTRIBUTION_UNKNOWN",
      "check",
      "charging",
      "unresolved",
      `The contribution ${NEEDS_CHECKING} for ${[...new Set(unknown.map((l) => l.name))].join(", ")}: ${unknown[0].cost.why} The full price is used in the projection until it’s known.`,
    );
  if (f.pools.atHmCents === null && f.pools.hcpUnspentCents === null)
    add(
      "SEPARATE_POOLS",
      "info",
      "at-hm",
      "info",
      "This case has no AT–HM allocation and no unspent HCP funds. They’d be separate pools with their own rules, never part of the ongoing balance.",
    );
  return {
    scenarioVersionId: c.scenarioVersion,
    ruleSetId: rules.id,
    effectiveDate: rules.effectiveFrom,
    modelVersion: MODEL_VERSION,
    actualAvailableCents: actual,
    bookedEstimateCents: bookedEstimate,
    proposedEstimateCents: proposedEstimate,
    scheduledEstimatedCents: scheduled,
    projectedBalanceCents: projected,
    threshold,
    projectedCarryoverCents: carry.carryoverCents,
    projectedAboveThresholdCents: carry.aboveCents,
    overspendCents: carry.overspendCents,
    governmentFundingEstimateCents: scheduled,
    fullPriceCents: sum(counted, (l) => l.cost.fullCents),
    contribution: {
      knownCents: knownContribution,
      complete: unknown.length === 0,
      basis: input.ratesBasis ?? "The participant’s assessed rates in this case",
      uncertainty: unknown.length
        ? `Part of it ${NEEDS_CHECKING}.`
        : "An estimate: payable as services are delivered, so it changes if a session doesn’t happen or changes.",
      unknown: [...new Set(unknown.map((l) => l.name))],
    },
    lines: lines.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    checks,
    days: { quarter: quarterDays(f.quarter), left: daysLeft(f) },
    pools: f.pools,
  };
}

// ---------------------------------------------------------------------------------------------
// AT–HM and transitioned HCP funds: their own order, never the ongoing rollover
// ---------------------------------------------------------------------------------------------

/**
  How an approved AT–HM item would be funded: from the separate pools only, in the rule set's order (a transitioned
  participant's unspent HCP funds first, then the AT–HM allocation). The ongoing quarterly balance is never a source.
  Whatever's left is a gap that needs the approval route, not the ongoing budget.
*/
export function atHmFunding(itemCents: number, pools: Figures["pools"], rules: QuarterRuleSet = QUARTER_RULES[0]) {
  let need = Math.max(0, itemCents);
  const draws: { pool: "hcp-unspent" | "at-hm-allocation"; cents: number }[] = [];
  for (const pool of rules.pools.atHmDrawOrder) {
    const have = pool === "hcp-unspent" ? (pools.hcpUnspentCents ?? 0) : (pools.atHmCents ?? 0);
    const take = Math.min(need, Math.max(0, have));
    if (take > 0) draws.push({ pool, cents: take });
    need -= take;
  }
  return { draws, gapCents: need, fromOngoingCents: 0 };
}

// ---------------------------------------------------------------------------------------------
// Fixture consistency: run by the editor before preview and by the publish check
// ---------------------------------------------------------------------------------------------

export function caseFigureProblems(c: Case, list: QuarterRuleSet[] = QUARTER_RULES): string[] {
  const out: string[] = [];
  const f = c.figures;
  const rules = quarterRules(c.ruleSetId, list);
  if (!rules) return ["The case uses a rule set that isn’t here."];
  const base = baseRules(rules);
  if (!f.quarterlyBudgetCents || f.quarterlyBudgetCents < 0) out.push("Enter the quarterly budget, including supplements.");
  if (f.supplementsCents < 0 || f.supplementsCents > f.quarterlyBudgetCents) out.push("Supplements must be part of the quarterly budget, not more than it.");
  if (!f.basis) out.push("Say whether the direct-service balance already accounts for the care-management allocation.");
  const fullCare = Math.round((f.quarterlyBudgetCents * base.careManagementPercent) / 100);
  if (f.basis === "direct-after-cm" && f.careManagementDeductedCents > 0)
    out.push("Double deduction: the balance already accounts for care management, so nothing more can be deducted for it.");
  if (f.basis === "gross-before-cm" && (f.careManagementDeductedCents <= 0 || f.careManagementDeductedCents > fullCare))
    out.push(
      `Double deduction or a missing one: the care management still in the balance must be more than $0 and no more than the quarter’s ${base.careManagementPercent}% (${money(fullCare)}).`,
    );
  if (!isDate(f.quarter.start) || !isDate(f.quarter.end) || quarterDays(f.quarter) < 28 || quarterDays(f.quarter) > 100)
    out.push("Enter the quarter’s actual start and end dates.");
  else if (f.quarter.start < rules.effectiveFrom) out.push(`The quarter starts before “${rules.label}” takes effect.`);
  if (!isDate(f.snapshot) || f.snapshot < f.quarter.start || f.snapshot >= f.quarter.end)
    out.push("The snapshot date must fall inside the quarter, before its last day.");
  if (f.currentBalanceCents < 0) out.push("The current balance can’t be negative in a v1 case.");
  if (f.currentBalanceCents > f.quarterlyBudgetCents + baseRules(rules).carryover.minimumCapCents * 10)
    out.push("The current balance is far larger than the quarterly budget: check the figures reconcile.");
  if (f.pools.hcpUnspentCents !== null)
    out.push("Unspent HCP funds have their own rules, which this version doesn’t model. Leave them out of a v1 case (a reviewed variant comes later).");
  if (f.pools.shortTermCents !== null) out.push("Short-term pathway funds have their own rules, which this version doesn’t model.");
  const ids = new Set<string>();
  for (const s of c.services) {
    const w = `“${s.name || s.id}”`;
    if (ids.has(s.id)) out.push(`${w}: two services share the id ${s.id}.`);
    ids.add(s.id);
    if (!s.name) out.push(`A service needs its name.`);
    if (s.route !== "ongoing" && s.route !== "at-hm") out.push(`${w} needs a funding route.`);
    if (!s.unitPriceCents) out.push(`${w} needs its agreed price.`);
    if (s.route === "at-hm" && s.availability.length) out.push(`${w} is an AT–HM item: it has no session dates in the ongoing plan.`);
    for (const d of s.availability) if (!inWindow(f, d)) out.push(`${w}: ${d} isn’t in the days left in the quarter.`);
    const ruled = categoryOn(base, s, isDate(f.snapshot) ? f.snapshot : f.quarter.start);
    if (s.kind && ruled !== s.category) out.push(`${w}: in this quarter it’s ${CATEGORIES[ruled]}, not ${CATEGORIES[s.category]}.`);
  }
  for (const b of c.booked) {
    const s = c.services.find((x) => x.id === b.serviceId);
    if (!s) {
      out.push(`A booked session names a service that isn’t in the case (${b.serviceId}).`);
      continue;
    }
    if (!inWindow(f, b.date)) out.push(`The booked ${s.name} on ${b.date} isn’t in the days left in the quarter.`);
    if (!s.approved) out.push(`The booked ${s.name} isn’t an approved service.`);
    if (s.route !== "ongoing") out.push(`The booked ${s.name} isn’t ongoing funding.`);
    // A displayed contribution estimate needs its rate.
    const cost = sessionCost(c, s, b.date, list);
    if (!cost.known && cost.category !== "clinical") out.push(`${s.name}: the booked estimate shows a contribution, but ${cost.why.toLowerCase()}`);
  }
  if (!out.length) {
    const p = project(c, { proposed: [] }, list);
    if (p.projectedBalanceCents < 0) out.push("The booked sessions alone overspend the balance: a v1 case starts within funding.");
  }
  return out;
}
