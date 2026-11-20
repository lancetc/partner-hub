/*
  Budget Sandbox (docs/budget-sandbox.md): a Magazine block where a learner builds a Support at Home care plan for a
  fictional participant, sees its quarterly cost split into the government-funded share and the participant's
  contribution, and explains it to them. Everything here is pure, so the server, the learner's page and the
  editor's preview compute the same ledger.

  - Money is whole cents. Each line is rounded once, to the cent; totals are sums of lines.
  - Policy comes from an effective-dated ruleset, never from a prompt. Only ongoing budgets are modelled; the
    other funding types are refused rather than given the ongoing rules by default.
  - An assessed contribution rate the scenario doesn't supply is "rate to confirm", never zero, and no personal
    dollar amount is shown for it. A pension label never sets a rate.
  - Clinical Supports have a 0% contribution. Personal care is Clinical Supports from 1 October 2026.
  - Unspent funds carry over up to the higher of $1,000 or 10% of the quarterly budget. That's never a reason
    to add care.
*/

export const CATEGORIES = { clinical: "Clinical Supports", independence: "Independence", everyday: "Everyday Living" } as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];
export const UNITS = { hour: "hour", visit: "visit", trip: "trip", item: "item" } as const;
export type Unit = keyof typeof UNITS;

// ---------------------------------------------------------------------------------------------
// The ruleset: reviewed, effective-dated policy
// ---------------------------------------------------------------------------------------------

export type RuleSet = {
  id: string;
  label: string;
  effectiveFrom: string;
  reviewBy: string;
  /** Ongoing quarterly funding by classification, including the care-management allocation. */
  classifications: Record<string, number>;
  careManagementPercent: number;
  carryover: { minimumCapCents: number; percentCap: number };
  /** A service kind that moves contribution category on a date. */
  categoryChanges: { kind: string; from: Category; to: Category; effectiveFrom: string; note: string }[];
  sources: { title: string; url: string }[];
};

export const RULESETS: RuleSet[] = [
  {
    id: "sah-ongoing-2026-07",
    label: "Support at Home ongoing funding, from 1 July 2026",
    effectiveFrom: "2026-07-01",
    reviewBy: "2027-05-20",
    // Only the classifications this version has been given; others are added when reviewed, never guessed.
    classifications: { "4": 761713, "5": 1018238 },
    careManagementPercent: 10,
    carryover: { minimumCapCents: 100000, percentCap: 10 },
    categoryChanges: [
      {
        kind: "personal-care",
        from: "independence",
        to: "clinical",
        effectiveFrom: "2026-10-01",
        note: "Personal care moved from Independence to Clinical Supports on 1 October 2026.",
      },
    ],
    sources: [
      {
        title: "Funding classifications for Support at Home",
        url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home",
      },
      {
        title: "Individualised budgets for Support at Home participants",
        url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants",
      },
      {
        title: "Support at Home participant contributions",
        url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/support-at-home-participant-contributions",
      },
      {
        title: "Charging for Support at Home services",
        url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services",
      },
    ],
  },
];

export const ruleSet = (id: string) => RULESETS.find((r) => r.id === id);

/**
  The category a service counts under on a date. For a kind the ruleset moves, the ruleset decides on both sides of
  the change; otherwise it's the service's own.
*/
export function categoryOn(rules: RuleSet, s: { kind: string; category: Category }, date: string): Category {
  const change = rules.categoryChanges.find((c) => c.kind && c.kind === s.kind);
  if (!change) return s.category;
  return date >= change.effectiveFrom ? change.to : change.from;
}

// ---------------------------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------------------------

/** "ongoing" uses the ruleset's real classification amount; "fictional" is an author's practice figure, labelled as such. */
export const FUNDING_VARIANTS = { ongoing: "Ongoing Support at Home (real classification amount)", fictional: "Fictional practice budget" } as const;
export type FundingVariant = keyof typeof FUNDING_VARIANTS;
/** Funding types with their own rules, refused in this version rather than given the ongoing ones. */
export const UNSUPPORTED_VARIANTS = ["interim", "transitioned", "grandfathered", "no-worse-off"];

export type SandboxService = {
  id: string;
  name: string;
  purpose: string;
  /** A kind the ruleset may move between categories, like "personal-care". */
  kind: string;
  category: Category;
  unit: Unit;
  unitPriceCents: number;
  /** Units at each occurrence: 1.5 hours a visit, 1 trip. */
  unitsEach: number;
  maxPerWeek: number;
  /** In the participant's approved care plan. Anything else needs a review action. */
  approved: boolean;
  availability: string;
  goalIds: string[];
};
export type Goal = { id: string; text: string; priority: boolean };
export type PlanLine = { serviceId: string; perWeek: number; unitsEach: number; goalId: string; review: boolean };

export type SandboxBlockData = {
  title: string;
  intro: string;
  rulesetId: string;
  funding: { variant: FundingVariant; classification: string; fictionalQuarterlyCents: number; startingCarryoverCents: number };
  quarter: { start: string; end: string };
  participant: { name: string; about: string; needs: string[]; risks: string[]; schedule: string; affordability: string; affordabilityCents: number };
  goals: Goal[];
  /** The fictional assessed rates, in basis points (2000 = 20%). Null is "rate to confirm". Clinical is always 0. */
  rates: Record<Category, number | null>;
  services: SandboxService[];
  explain: {
    prompt: string;
    checklist: { id: string; label: string; anyOf: string[] }[];
    avoid: { phrase: string; why: string }[];
  };
  illustrative: { lines: PlanLine[]; why: string };
  debrief: string;
  approval: { owner: string; operations: string; finance: string; quality: string; accessibility: string; approvedOn: string };
};

export const PRACTICE_NOTICE = "Practice scenario: these figures don’t determine a real participant’s fees.";
export const CONTRIBUTION_NOTE =
  "Contributions are payable for services as they’re delivered, under the participant’s agreement. Planning a service doesn’t charge anything upfront.";
export const RATE_TBC = "rate to confirm";

// ---------------------------------------------------------------------------------------------
// The ledger: whole cents, rounded once per line
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(at(d));
/** Days in the quarter, counting both ends. */
export const quarterDays = (q: { start: string; end: string }) => (isDate(q.start) && isDate(q.end) ? Math.round((at(q.end) - at(q.start)) / DAY) + 1 : 0);
/** Weekly services are projected over the quarter's whole weeks, as whole occurrences; the extra days are named, not counted. */
export const quarterWeeks = (q: { start: string; end: string }) => Math.floor(quarterDays(q) / 7);

export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const percent = (bp: number) => `${(bp / 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })}%`;

export type LedgerLine = {
  serviceId: string;
  name: string;
  category: Category;
  unit: Unit;
  units: number;
  /** Price for one week of this line, for "per week" explanations. */
  weeklyCents: number;
  fullPriceCents: number;
  /** Undefined when the category's rate isn't known. */
  participantCents: number | undefined;
  governmentCents: number | undefined;
  rateBp: number | null;
};
export type Ledger = {
  rulesetId: string;
  weeks: number;
  days: number;
  quarterlyCents: number;
  careManagementCents: number;
  carryoverInCents: number;
  availableCents: number;
  lines: LedgerLine[];
  grossCents: number;
  /** Sums over lines with a known rate; the unknown part is named separately. */
  participantCents: number;
  governmentCents: number;
  /** Full price of lines whose rate is unknown: their split can't be stated. */
  unknownCents: number;
  /** Funding left after the government-funded share, or (negative) the shortfall. With unknown rates, a range. */
  remaining: { low: number; high: number };
  carryoverCapCents: number;
  /** What would carry over, if the plan is delivered as projected and every rate is known. */
  carryoverOutCents: number | null;
  /** Unspent above the cap, which doesn't carry over. */
  forfeitCents: number | null;
};

/** The rate for a category: Clinical Supports is always 0%; the others are the scenario's assessed rates, or unknown. */
export const rateFor = (b: Pick<SandboxBlockData, "rates">, c: Category) => (c === "clinical" ? 0 : b.rates[c]);

export function quarterlyFunding(b: Pick<SandboxBlockData, "funding" | "rulesetId">) {
  const rules = ruleSet(b.rulesetId);
  if (b.funding.variant === "fictional") return b.funding.fictionalQuarterlyCents;
  return rules?.classifications[b.funding.classification] ?? 0;
}

export function computeLedger(b: SandboxBlockData, plan: PlanLine[]): Ledger {
  const rules = ruleSet(b.rulesetId) ?? RULESETS[0];
  const weeks = quarterWeeks(b.quarter);
  const q = quarterlyFunding(b);
  const care = Math.round((q * rules.careManagementPercent) / 100);
  const carryIn = Math.max(0, b.funding.startingCarryoverCents);
  const available = q - care + carryIn;
  const lines: LedgerLine[] = plan.flatMap((p) => {
    const s = b.services.find((x) => x.id === p.serviceId);
    if (!s || p.perWeek <= 0) return [];
    const category = categoryOn(rules, s, b.quarter.start);
    const unitsEach = p.unitsEach > 0 ? p.unitsEach : s.unitsEach;
    // Each visit, trip or session happens whole: a fortnightly service over 13 weeks is 7, not 6.5.
    const occurrences = Math.round(p.perWeek * weeks);
    const units = Math.round(occurrences * unitsEach * 100) / 100;
    const full = Math.round(occurrences * unitsEach * s.unitPriceCents);
    const rate = rateFor(b, category);
    const participant = rate === null ? undefined : Math.round((full * rate) / 10000);
    return [
      {
        serviceId: s.id,
        name: s.name,
        category,
        unit: s.unit,
        units,
        weeklyCents: Math.round(p.perWeek * unitsEach * s.unitPriceCents),
        fullPriceCents: full,
        participantCents: participant,
        governmentCents: participant === undefined ? undefined : full - participant,
        rateBp: rate,
      },
    ];
  });
  const sum = (f: (l: LedgerLine) => number | undefined) => lines.reduce((n, l) => n + (f(l) ?? 0), 0);
  const gross = sum((l) => l.fullPriceCents);
  const government = sum((l) => l.governmentCents);
  const unknown = sum((l) => (l.rateBp === null ? l.fullPriceCents : 0));
  const remaining = { low: available - government - unknown, high: available - government };
  const cap = Math.max(rules.carryover.minimumCapCents, Math.round((q * rules.carryover.percentCap) / 100));
  const unspent = unknown ? null : Math.max(0, remaining.high);
  return {
    rulesetId: rules.id,
    weeks,
    days: quarterDays(b.quarter),
    quarterlyCents: q,
    careManagementCents: care,
    carryoverInCents: carryIn,
    availableCents: available,
    lines,
    grossCents: gross,
    participantCents: sum((l) => l.participantCents),
    governmentCents: government,
    unknownCents: unknown,
    remaining,
    carryoverCapCents: cap,
    carryoverOutCents: unspent === null ? null : Math.min(unspent, cap),
    forfeitCents: unspent === null ? null : Math.max(0, unspent - cap),
  };
}

/** "One more hour a week adds $X gross a quarter, $Y estimated contribution and $Z government-funded share." */
export function changeSummary(b: SandboxBlockData, before: Ledger, after: Ledger, serviceId: string) {
  const s = b.services.find((x) => x.id === serviceId);
  const a = before.lines.find((l) => l.serviceId === serviceId);
  const z = after.lines.find((l) => l.serviceId === serviceId);
  const d = (f: (l: LedgerLine | undefined) => number | undefined) => (f(z) ?? 0) - (f(a) ?? 0);
  const gross = d((l) => l?.fullPriceCents);
  if (!s || !gross) return "";
  const known = (z ?? a)?.rateBp !== null;
  const word = gross > 0 ? "adds" : "takes off";
  const abs = (c: number) => money(Math.abs(c));
  return `${s.name}: this change ${word} ${abs(gross)} a quarter in full price${
    known
      ? `, ${abs(d((l) => l?.participantCents))} estimated contribution and ${abs(d((l) => l?.governmentCents))} government-funded share`
      : `; the split waits on a ${RATE_TBC}`
  }.`;
}

// ---------------------------------------------------------------------------------------------
// Warnings: what a plan needs to talk about, in words, never colour alone
// ---------------------------------------------------------------------------------------------

export type Warning = { id: string; tone: "stop" | "check" | "note"; text: string };

export function planWarnings(b: SandboxBlockData, plan: PlanLine[], l: Ledger): Warning[] {
  const out: Warning[] = [];
  if (l.remaining.high < 0)
    out.push({
      id: "shortfall",
      tone: "stop",
      text: `${money(-l.remaining.high)} shortfall: the plan’s government-funded share is more than the funding available for services.`,
    });
  else if (l.remaining.low < 0)
    out.push({ id: "maybe-short", tone: "check", text: `It may be over the funding by up to ${money(-l.remaining.low)}, depending on the ${RATE_TBC}.` });
  for (const ln of l.lines)
    if (ln.rateBp === null)
      out.push({
        id: `rate-${ln.serviceId}`,
        tone: "check",
        text: `${ln.name}: ${CATEGORIES[ln.category]} ${RATE_TBC}. No contribution is shown until it’s confirmed.`,
      });
  for (const p of plan) {
    const s = b.services.find((x) => x.id === p.serviceId);
    if (!s) continue;
    if (!s.approved && !p.review)
      out.push({
        id: `unapproved-${s.id}`,
        tone: "stop",
        text: `${s.name} isn’t in ${b.participant.name}’s approved care plan. Mark it for review before it can be part of the plan.`,
      });
    if (!s.approved && p.review)
      out.push({ id: `review-${s.id}`, tone: "check", text: `${s.name} is marked for review: it needs the care plan updated before it can be delivered.` });
    if (!p.goalId) out.push({ id: `goal-${s.id}`, tone: "check", text: `${s.name}: say which of ${b.participant.name}’s goals or needs it’s for.` });
  }
  for (const g of b.goals.filter((x) => x.priority))
    if (!plan.some((p) => p.goalId === g.id && p.perWeek > 0))
      out.push({
        id: `priority-${g.id}`,
        tone: "check",
        text: `Nothing in the plan is for “${g.text}”, which ${b.participant.name} said matters most. Check with her before leaving it out.`,
      });
  if (b.participant.affordabilityCents > 0 && l.participantCents > b.participant.affordabilityCents)
    out.push({
      id: "afford",
      tone: "check",
      text: `${b.participant.name}’s estimated contribution is ${money(l.participantCents)} a quarter, more than the ${money(b.participant.affordabilityCents)} she said she could manage. Talk it through, and about hardship support if it applies.`,
    });
  if (l.forfeitCents)
    out.push({
      id: "cap",
      tone: "note",
      text: `About ${money(l.forfeitCents)} unspent would be over the carryover cap of ${money(l.carryoverCapCents)}. That’s not a reason to add care: plan what ${b.participant.name} needs.`,
    });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const date = (v: unknown) => (typeof v === "string" && isDate(v) ? v : "");
const cents = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10_000_000_00 ? Number(v) : 0);
const bp = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10000 ? Number(v) : null;

/** Who has to sign off: the author, Support at Home operations, Finance, Quality or policy, and accessibility, with the date. */
export const sandboxApproved = (b: Pick<SandboxBlockData, "approval">) =>
  Boolean(b.approval.owner && b.approval.operations && b.approval.finance && b.approval.quality && b.approval.accessibility && b.approval.approvedOn);

/** The reviewed calculation fixtures: if any fails, nothing can be published. */
export function fixturesPass() {
  const base: SandboxBlockData = {
    title: "Fixture",
    intro: "",
    rulesetId: "sah-ongoing-2026-07",
    funding: { variant: "ongoing", classification: "4", fictionalQuarterlyCents: 0, startingCarryoverCents: 0 },
    quarter: { start: "2026-10-01", end: "2026-12-30" },
    participant: { name: "X", about: "", needs: [], risks: [], schedule: "", affordability: "", affordabilityCents: 0 },
    goals: [],
    rates: { clinical: 0, independence: 2000, everyday: null },
    services: [
      {
        id: "ind",
        name: "Ind",
        purpose: "",
        kind: "",
        category: "independence",
        unit: "item",
        unitPriceCents: 10000,
        unitsEach: 1,
        maxPerWeek: 7,
        approved: true,
        availability: "",
        goalIds: [],
      },
      {
        id: "pc",
        name: "PC",
        purpose: "",
        kind: "personal-care",
        category: "independence",
        unit: "hour",
        unitPriceCents: 10000,
        unitsEach: 1,
        maxPerWeek: 7,
        approved: true,
        availability: "",
        goalIds: [],
      },
      {
        id: "ev",
        name: "Ev",
        purpose: "",
        kind: "",
        category: "everyday",
        unit: "hour",
        unitPriceCents: 10000,
        unitsEach: 1,
        maxPerWeek: 7,
        approved: true,
        availability: "",
        goalIds: [],
      },
    ],
    explain: { prompt: "", checklist: [], avoid: [] },
    illustrative: { lines: [], why: "" },
    debrief: "",
    approval: { owner: "", operations: "", finance: "", quality: "", accessibility: "", approvedOn: "" },
  };
  const one = (serviceId: string) => [{ serviceId, perWeek: 1 / 13, unitsEach: 1, goalId: "", review: false }];
  const ind = computeLedger(base, one("ind")).lines[0];
  const pc = computeLedger(base, one("pc")).lines[0];
  const ev = computeLedger(base, one("ev")).lines[0];
  const l = computeLedger(base, []);
  const fict = computeLedger({ ...base, funding: { ...base.funding, variant: "fictional", fictionalQuarterlyCents: 1_000_000 } }, []);
  return (
    ind.fullPriceCents === 10000 &&
    ind.participantCents === 2000 &&
    ind.governmentCents === 8000 &&
    pc.category === "clinical" &&
    pc.participantCents === 0 &&
    ev.participantCents === undefined &&
    l.quarterlyCents === 761713 &&
    l.careManagementCents === 76171 &&
    l.carryoverCapCents === 100000 &&
    fict.carryoverCapCents === 100000 &&
    computeLedger({ ...base, funding: { ...base.funding, classification: "5" } }, []).carryoverCapCents === 101824
  );
}

/** What "Publish anyway" can't waive: sign-off, a ruleset in date, a real classification that exists, and the fixtures. */
export function sandboxHardProblems(b: SandboxBlockData, today: string): string[] {
  const out: string[] = [];
  const rules = ruleSet(b.rulesetId);
  if (!sandboxApproved(b))
    out.push(`“${b.title}”: record the content owner, the Support at Home operations, Finance, Quality and accessibility reviewers, and the date.`);
  if (!rules) out.push(`“${b.title}” uses a ruleset that isn’t here.`);
  else if (rules.reviewBy < today) out.push(`“${b.title}”: the ruleset “${rules.label}” was due for review on ${rules.reviewBy}. Confirm it’s current.`);
  if (b.funding.variant === "ongoing" && !quarterlyFunding(b)) out.push(`“${b.title}” claims a real classification the ruleset doesn’t have.`);
  if (!fixturesPass()) out.push("The budget calculation’s reviewed fixtures don’t pass, so no sandbox can be published.");
  return out;
}

/**
  The block's fields, checked. Publishing needs the ruleset, a real classification (or a labelled fictional
  budget), quarter dates, the participant and goals, services that each serve a goal and sit in the category the
  ruleset gives them, rates for every category the explanation asks about, the explanation checks, and an
  illustrative plan that uses only approved services.
*/
export function parseSandbox(o: Raw, where: string, h: ParseHelpers): SandboxBlockData {
  const { str, idOf, list, unfinished } = h;
  const rulesetId = typeof o.rulesetId === "string" && ruleSet(o.rulesetId) ? o.rulesetId : RULESETS[0].id;
  const rules = ruleSet(rulesetId)!;
  const f = obj(o.funding);
  if (typeof f.variant === "string" && UNSUPPORTED_VARIANTS.includes(f.variant))
    unfinished(`${where}: ${f.variant} funding has its own rules, which this version doesn’t model. Use an ongoing or fictional budget.`);
  const variant = oneOf(f.variant, Object.keys(FUNDING_VARIANTS) as FundingVariant[], "ongoing");
  const funding = {
    variant,
    classification: typeof f.classification === "string" ? f.classification.slice(0, 4) : "",
    fictionalQuarterlyCents: cents(f.fictionalQuarterlyCents),
    startingCarryoverCents: cents(f.startingCarryoverCents),
  };
  if (variant === "ongoing" && !rules.classifications[funding.classification])
    unfinished(`${where}: Classification ${funding.classification || "(none)"} isn’t in “${rules.label}”. Choose one it has, or use a fictional budget.`);
  if (variant === "fictional" && !funding.fictionalQuarterlyCents) unfinished(`${where}: a fictional budget needs its quarterly amount.`);
  const qz = obj(o.quarter);
  const quarter = { start: date(qz.start), end: date(qz.end) };
  if (!quarter.start || !quarter.end || quarterDays(quarter) < 28 || quarterDays(quarter) > 100)
    unfinished(`${where} needs the quarter’s start and end dates.`);
  if (quarter.start && quarter.start < rules.effectiveFrom) unfinished(`${where}: the quarter starts before “${rules.label}” takes effect.`);
  const pp = obj(o.participant);
  const texts = (v: unknown, what: string, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max: 300 }) ?? "")
      .filter(Boolean);
  const goals = list(o.goals, where, "goals", 8).map((g, i) => ({
    id: idOf(g.id, `${where} goal ${i + 1}`),
    text: str(g.text, `${where} goal ${i + 1}`, { required: true, max: 200 }) ?? "",
    priority: g.priority === true,
  }));
  if (!goals.length) unfinished(`${where} needs the participant’s goals, in their own words.`);
  const goalIds = new Set(goals.map((g) => g.id));
  const r = obj(o.rates);
  const rates = { clinical: 0, independence: bp(r.independence), everyday: bp(r.everyday) } as Record<Category, number | null>;
  const services = list(o.services, where, "services", 12).map((s, i): SandboxService => {
    const w = `${where} service ${i + 1}`;
    const svc = {
      id: idOf(s.id, w),
      name: str(s.name, `${w} name`, { required: true, max: 80 }) ?? "",
      purpose: str(s.purpose, `${w} purpose`, { max: 200 }) ?? "",
      kind: typeof s.kind === "string" ? s.kind.slice(0, 40) : "",
      category: oneOf(s.category, CATEGORY_ORDER, "everyday"),
      unit: oneOf(s.unit, Object.keys(UNITS) as Unit[], "hour"),
      unitPriceCents: cents(s.unitPriceCents),
      unitsEach: Number(s.unitsEach) > 0 && Number(s.unitsEach) <= 12 ? Math.round(Number(s.unitsEach) * 4) / 4 : 1,
      maxPerWeek: Number(s.maxPerWeek) > 0 && Number(s.maxPerWeek) <= 21 ? Math.round(Number(s.maxPerWeek) * 2) / 2 : 7,
      approved: s.approved !== false,
      availability: str(s.availability, `${w} availability`, { max: 200 }) ?? "",
      goalIds: (Array.isArray(s.goalIds) ? s.goalIds : []).filter((x): x is string => typeof x === "string" && goalIds.has(x)).slice(0, 6),
    };
    if (!svc.unitPriceCents) unfinished(`${w} needs its agreed price, in whole cents.`);
    if (!svc.goalIds.length) unfinished(`${w} needs at least one goal or need it can serve.`);
    // The category must be the one the ruleset gives this kind of service for the quarter.
    const ruled = categoryOn(rules, { kind: svc.kind, category: svc.category }, quarter.start || rules.effectiveFrom);
    if (svc.kind && ruled !== svc.category)
      unfinished(`${w}: in this quarter ${svc.name} is ${CATEGORIES[ruled]}, not ${CATEGORIES[svc.category]}. Change its category.`);
    return svc;
  });
  if (services.length < 3) unfinished(`${where} needs at least 3 services to choose from.`);
  const e = obj(o.explain);
  const explain = {
    prompt: str(e.prompt, `${where}: the question the participant asks`, { required: true, max: 600 }) ?? "",
    checklist: list(e.checklist, where, "explanation points", 8).map((c, i) => ({
      id: idOf(c.id, `${where} explanation point ${i + 1}`),
      label: str(c.label, `${where} explanation point ${i + 1}`, { required: true, max: 200 }) ?? "",
      anyOf: texts(c.anyOf, `explanation point ${i + 1} word`, 12).map((x) => x.toLowerCase()),
    })),
    avoid: list(e.avoid, where, "phrases to avoid", 8).map((x, i) => ({
      phrase: (str(x.phrase, `${where} phrase to avoid ${i + 1}`, { required: true, max: 120 }) ?? "").toLowerCase(),
      why: str(x.why, `${where} phrase to avoid ${i + 1}: why`, { required: true, max: 300 }) ?? "",
    })),
  };
  if (!explain.checklist.length || explain.checklist.some((c) => !c.anyOf.length))
    unfinished(`${where}: each explanation point needs words or phrases to look for.`);
  // A contribution question needs real (fictional, assessed) numbers for every category the plan could use.
  const used = new Set(services.map((s) => categoryOn(rules, s, quarter.start || rules.effectiveFrom)));
  for (const c of used)
    if (rates[c] === null && /contribut/i.test(explain.prompt))
      unfinished(`${where}: the question is about contributions, but ${CATEGORIES[c]} has no assessed rate. Supply one, or change the question.`);
  const il = obj(o.illustrative);
  const serviceIds = new Set(services.map((s) => s.id));
  const illustrative = {
    lines: list(il.lines, where, "illustrative plan lines", 12)
      .map((l) => ({
        serviceId: typeof l.serviceId === "string" && serviceIds.has(l.serviceId) ? l.serviceId : "",
        perWeek: Math.max(0, Math.min(21, Number(l.perWeek) || 0)),
        unitsEach: Number(l.unitsEach) > 0 ? Number(l.unitsEach) : 0,
        goalId: typeof l.goalId === "string" && goalIds.has(l.goalId) ? l.goalId : "",
        review: false,
      }))
      .filter((l) => l.serviceId && l.perWeek > 0),
    why: str(il.why, `${where}: why the illustrative plan looks as it does`, { required: true, max: 1200 }) ?? "",
  };
  if (!illustrative.lines.length) unfinished(`${where} needs a reviewed illustrative plan for the debrief.`);
  if (illustrative.lines.some((l) => !services.find((s) => s.id === l.serviceId)?.approved))
    unfinished(`${where}: the illustrative plan can only use approved services.`);
  const ap = obj(o.approval);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    rulesetId,
    funding,
    quarter,
    participant: {
      name: str(pp.name, `${where}: the participant’s name`, { required: true, max: 80 }) ?? "",
      about: str(pp.about, `${where}: about the participant`, { max: 600 }) ?? "",
      needs: texts(pp.needs, "assessed need", 8),
      risks: texts(pp.risks, "risk", 6),
      schedule: str(pp.schedule, `${where}: preferred schedule`, { max: 300 }) ?? "",
      affordability: str(pp.affordability, `${where}: affordability`, { max: 300 }) ?? "",
      affordabilityCents: cents(pp.affordabilityCents),
    },
    goals,
    rates,
    services,
    explain,
    illustrative,
    debrief: str(o.debrief, `${where} debrief`, { max: 1500 }) ?? "",
    approval: {
      owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
      operations: str(ap.operations, `${where} Support at Home operations reviewer`, { max: 120 }) ?? "",
      finance: str(ap.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
      quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
      accessibility: str(ap.accessibility, `${where} accessibility reviewer`, { max: 120 }) ?? "",
      approvedOn: date(ap.approvedOn),
    },
  };
}

/** The learner's copy: everything to plan with, without the explanation checks or the reviewed illustrative plan. */
export function sandboxForReaders<T extends SandboxBlockData>(b: T): T {
  return { ...b, explain: { ...b.explain, checklist: [], avoid: [] }, illustrative: { lines: [], why: "" }, debrief: "" };
}

/** A copy with ids of its own, so two sandboxes in one course never share an id. References follow. */
export function freshSandbox(data: SandboxBlockData, tag = Math.random().toString(36).slice(2, 7)): SandboxBlockData {
  const re = (id: string) => (id ? `${id.replace(/-b[a-z0-9]{5}$/, "")}-b${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    goals: c.goals.map((g) => ({ ...g, id: re(g.id) })),
    services: c.services.map((s) => ({ ...s, id: re(s.id), goalIds: s.goalIds.map(re) })),
    explain: { ...c.explain, checklist: c.explain.checklist.map((x) => ({ ...x, id: re(x.id) })) },
    illustrative: { ...c.illustrative, lines: c.illustrative.lines.map((l) => ({ ...l, serviceId: re(l.serviceId), goalId: re(l.goalId) })) },
  };
}

// ---------------------------------------------------------------------------------------------
// The learner's attempt
// ---------------------------------------------------------------------------------------------

export type SandboxState = {
  lines: PlanLine[];
  /** The ledger has been opened (on a narrow screen it's a tab of its own). */
  inspected: boolean;
  explanation: string;
  /** 0 building; 1 explaining; 2 debrief. */
  stage: 0 | 1 | 2;
  /** Plan versions submitted so far, for comparing and revising. */
  revisions: number;
};
export const emptyState = (): SandboxState => ({ lines: [], inspected: false, explanation: "", stage: 0, revisions: 0 });

export function cleanState(b: SandboxBlockData, raw: unknown): SandboxState {
  const o = obj(raw);
  const goals = new Set(b.goals.map((g) => g.id));
  const seen = new Set<string>();
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 12).flatMap((x): PlanLine[] => {
    const l = obj(x);
    const s = b.services.find((y) => y.id === l.serviceId);
    if (!s || seen.has(s.id)) return [];
    seen.add(s.id);
    const perWeek = Math.max(0, Math.min(s.maxPerWeek, Math.round((Number(l.perWeek) || 0) * 2) / 2));
    const unitsEach = Number(l.unitsEach) > 0 ? Math.min(12, Math.round(Number(l.unitsEach) * 4) / 4) : s.unitsEach;
    return [{ serviceId: s.id, perWeek, unitsEach, goalId: typeof l.goalId === "string" && goals.has(l.goalId) ? l.goalId : "", review: l.review === true }];
  });
  return {
    lines,
    inspected: o.inspected === true,
    explanation: typeof o.explanation === "string" ? o.explanation.slice(0, 2000) : "",
    stage: o.stage === 2 ? 2 : o.stage === 1 ? 1 : 0,
    revisions: Number.isInteger(o.revisions) ? Math.min(50, Math.max(0, o.revisions as number)) : 0,
  };
}

/** What's still needed to move on from building the plan. */
export function planProblems(b: SandboxBlockData, s: SandboxState): string[] {
  const out: string[] = [];
  const active = s.lines.filter((l) => l.perWeek > 0);
  if (!active.length) out.push("Add at least one service.");
  if (active.some((l) => !l.goalId)) out.push(`Say which goal or need each service is for.`);
  if (active.some((l) => !b.services.find((x) => x.id === l.serviceId)?.approved && !l.review))
    out.push("Mark any service outside the approved care plan for review, or take it out.");
  if (!s.inspected) out.push("Open the costs and look at the ledger.");
  return out;
}

/** Dollar amounts the explanation mentions that aren't anywhere in this plan's ledger: claims without evidence. */
export function unsupportedAmounts(text: string, l: Ledger): string[] {
  const known = new Set<number>();
  const add = (c: number | undefined) => c !== undefined && known.add(Math.round(c));
  for (const ln of l.lines) {
    add(ln.fullPriceCents);
    add(ln.participantCents);
    add(ln.governmentCents);
    add(ln.weeklyCents);
    if (ln.rateBp !== null) {
      add(Math.round((ln.weeklyCents * ln.rateBp) / 10000));
      add(ln.weeklyCents - Math.round((ln.weeklyCents * ln.rateBp) / 10000));
    }
  }
  for (const c of [
    l.grossCents,
    l.participantCents,
    l.governmentCents,
    l.quarterlyCents,
    l.careManagementCents,
    l.availableCents,
    l.remaining.high,
    -l.remaining.high,
    l.carryoverCapCents,
  ])
    add(c);
  const weekly = l.weeks ? Math.round(l.participantCents / l.weeks) : 0;
  add(weekly);
  const out: string[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g)) {
    const c = Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
    // Within a dollar of a ledger figure counts: people round when they talk.
    if (![...known].some((k) => Math.abs(k - c) <= 100)) out.push(m[0].replace(/\s/g, ""));
  }
  return [...new Set(out)];
}

export type ExplainCheck = { covered: { id: string; label: string; met: boolean }[]; avoided: { phrase: string; why: string }[]; unsupported: string[] };
export function checkExplanation(b: SandboxBlockData, text: string, l: Ledger): ExplainCheck {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  return {
    covered: b.explain.checklist.map((c) => ({ id: c.id, label: c.label, met: c.anyOf.some((w) => t.includes(w)) })),
    avoided: b.explain.avoid.filter((a) => t.includes(a.phrase)),
    unsupported: unsupportedAmounts(text, l),
  };
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export const DIMENSIONS = {
  budget: "Budget reasoning",
  contribution: "Contribution reasoning",
  fit: "Plan fit",
  governance: "Governance",
  communication: "Communication",
} as const;
export type SandboxDim = keyof typeof DIMENSIONS;
export const RATING = ["Worth another look", "Partly there", "Strong"] as const;

export function buildDebrief(b: SandboxBlockData, s: SandboxState) {
  const plan = s.lines.filter((l) => l.perWeek > 0);
  const yours = computeLedger(b, plan);
  const reviewed = computeLedger(b, b.illustrative.lines);
  const warnings = planWarnings(b, plan, yours);
  const check = checkExplanation(b, s.explanation, yours);
  const met = check.covered.filter((c) => c.met).length;
  const priorities = b.goals.filter((g) => g.priority);
  const kept = priorities.filter((g) => plan.some((p) => p.goalId === g.id));
  const unresolvedRate = yours.lines.some((l) => l.rateBp === null);
  const mentionsConfirm = /confirm|check (the|her|his) rate|services australia|notice/i.test(s.explanation);
  const ratings: Record<SandboxDim, number> = {
    budget: yours.remaining.high < 0 ? 0 : yours.remaining.low < 0 ? 1 : 2,
    contribution: check.unsupported.length
      ? 0
      : /clinical|personal care/i.test(s.explanation) && /0%|no contribution|nothing towards|don.t contribute|doesn.t contribute|free of/i.test(s.explanation)
        ? 2
        : 1,
    fit: priorities.length && kept.length < priorities.length ? (kept.length ? 1 : 0) : 2,
    governance: warnings.some((w) => w.id.startsWith("unapproved")) ? 0 : unresolvedRate && !mentionsConfirm ? 1 : 2,
    communication: check.avoided.length ? 0 : check.covered.length ? (met === check.covered.length ? 2 : met >= check.covered.length / 2 ? 1 : 0) : 1,
  };
  const name = (id: string) => b.services.find((x) => x.id === id)?.name ?? id;
  return {
    dims: (Object.keys(DIMENSIONS) as SandboxDim[]).map((k) => ({ id: k, label: DIMENSIONS[k], rating: RATING[ratings[k]] })),
    yours,
    reviewed,
    warnings,
    check,
    priorities: priorities.map((g) => ({ text: g.text, kept: kept.includes(g) })),
    compare: b.services
      .map((sv) => ({
        name: sv.name,
        yours: plan.find((p) => p.serviceId === sv.id),
        reviewed: b.illustrative.lines.find((p) => p.serviceId === sv.id),
      }))
      .filter((x) => x.yours || x.reviewed)
      .map((x) => ({
        name: x.name,
        yours: x.yours ? { perWeek: x.yours.perWeek, unitsEach: x.yours.unitsEach } : null,
        reviewed: x.reviewed ? { perWeek: x.reviewed.perWeek, unitsEach: x.reviewed.unitsEach } : null,
      })),
    why: b.illustrative.why,
    debrief: b.debrief,
    statement: statement(b, yours),
    usedNames: plan.map((p) => name(p.serviceId)),
  };
}
export type SandboxDebrief = ReturnType<typeof buildDebrief>;

/** A plain-text practice statement, to read or copy: every line, both shares, and what's not known. */
export function statement(b: SandboxBlockData, l: Ledger) {
  const rules = ruleSet(b.rulesetId);
  const rows = l.lines.map(
    (x) =>
      `${x.name} (${CATEGORIES[x.category]}): ${x.units} ${x.unit}${x.units === 1 ? "" : "s"}, ${money(x.fullPriceCents)} full price; ${
        x.participantCents === undefined
          ? `contribution: ${RATE_TBC}`
          : `${b.participant.name} ${money(x.participantCents)}, government ${money(x.governmentCents!)}`
      }.`,
  );
  return [
    `PRACTICE STATEMENT for ${b.participant.name} (fictional). ${PRACTICE_NOTICE}`,
    `Quarter ${b.quarter.start} to ${b.quarter.end}: ${l.weeks} whole weeks projected.`,
    `${b.funding.variant === "fictional" ? "Fictional practice budget" : `Classification ${b.funding.classification}`}: ${money(l.quarterlyCents)} a quarter, with ${money(l.careManagementCents)} reserved for care management${l.carryoverInCents ? ` and ${money(l.carryoverInCents)} carried over` : ""}. ${money(l.availableCents)} available for services.`,
    ...rows,
    `Total: ${money(l.grossCents)} full price; ${b.participant.name}’s estimated contribution ${money(l.participantCents)}; government-funded ${money(l.governmentCents)}${l.unknownCents ? `; ${money(l.unknownCents)} waiting on a ${RATE_TBC}` : ""}.`,
    l.remaining.high < 0
      ? `Shortfall: ${money(-l.remaining.high)}.`
      : `Remaining funding: ${l.remaining.low === l.remaining.high ? money(l.remaining.high) : `between ${money(Math.max(l.remaining.low, 0))} and ${money(l.remaining.high)}`}.`,
    CONTRIBUTION_NOTE,
    rules ? `Rules: ${rules.label} (effective ${rules.effectiveFrom}).` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
