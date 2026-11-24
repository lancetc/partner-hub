/*
  The Caseload-to-Margin & Hiring Capacity model (Partner_Hub_Caseload_to_Margin_Calculator_Implementation_PRD, section 6):
  one deterministic, versioned calculation shared by the Hiring Runway Decision Lab block (fictional cases, lib/hiringRunway)
  and, later, the private Plan my business Work Tool. Pure: no UI, no AI, no I/O, no imports.

  - Monthly units, AUD, pre-GST and pre-tax. Full precision inside; round only for display.
  - Capacity pressure is required hours above available hours × the case's planning threshold (an educational
    assumption, not a staffing norm). No available capacity with work to do is its own state, never a percentage.
  - Income is the case's own agreement basis (a flat amount per active participant in v1, the prototype's fixture
    basis). Public Support at Home care-management funding is never substituted for it.
  - A hire costs its full salary from the month they join while their productive capacity ramps. One-off costs
    happen once. Cash uses receipts after the case's payment lag, which can differ from what was earned.

  Simplifications kept from the reference prototype, and documented in docs/hiring-runway-lab.md:
  - Forecast participants keep today's workload-band mix (one blended hours figure).
  - Opening receivables are an amount due in each month before the first forecast month's income arrives.
  - Starts and exits happen once a month; onboarding work falls in the month a participant starts.

  Version 2 adds three optional inputs for the Plan my business Work Tool (lib/caseloadPlanner,
  docs/caseload-margin-calculator.md). Left out, every result is exactly version 1's:
  - `newMix`: new participants arrive in this band mix (shares), and exits leave in proportion to today's bands, so
    counts and hours are kept band by band instead of from one blended figure;
  - `receivables`: an opening receivables schedule, the amount received in Month 1, 2, … for work done before the
    forecast, used instead of `openingReceivables`, so the same balance can't be counted twice;
  - `fixedIncome`: a fixed monthly amount under the agreement, earned alongside any per-participant income.
*/

export const MODEL_VERSION = "hiring-model-2";
export const HORIZON = 12;

export type Band = { count: number; hours: number };
/** One fictional business's assumptions. Every figure is per month unless it says otherwise. */
export type HiringInputs = {
  bands: { standard: Band; higher: Band; intensive: Band };
  newPerMonth: number;
  exitsPerMonth: number;
  /** Hours of onboarding work for each new active participant, in the month they start. */
  onboardingHours: number;
  /** Review and escalation hours each month, across the caseload. */
  reviewHours: number;
  currentFte: number;
  paidWeeklyHours: number;
  /** Share of paid time available after leave (0 to 1). */
  availability: number;
  /** Share of available time that goes on participant work (0 to 1). */
  productive: number;
  /** The planning threshold: utilisation above this is capacity pressure (0 to 1). */
  threshold: number;
  /** The fictional agreement's monthly partner income for each active participant. */
  incomePerClient: number;
  /** Months between earning income and receiving it. */
  paymentLagMonths: number;
  /** Received in each month before the first forecast month's income arrives. */
  openingReceivables: number;
  /** Loaded monthly cost of one coordinator FTE (pay, super and on-costs). */
  staffCostPerFte: number;
  variableCostPerClient: number;
  fixedOverhead: number;
  ownerPay: number;
  openingCash: number;
  reserve: number;
  /** Version 2: the mix new participants arrive in, as shares (they needn't add to one). Left out: today's mix, blended. */
  newMix?: { standard: number; higher: number; intensive: number };
  /** Version 2: opening receivables as a schedule, received in Month 1, 2, …. Replaces `openingReceivables` when given. */
  receivables?: number[];
  /** Version 2: a fixed monthly amount the agreement pays, whatever the caseload. */
  fixedIncome?: number;
};

export type HiringOption = {
  id: string;
  label: string;
  kind: "none" | "hire" | "workflow";
  /** FTE added (hire). */
  fte: number;
  /** Month recruitment starts (1 is the first forecast month). */
  startMonth: number;
  leadMonths: number;
  rampMonths: number;
  /** Recruitment and setup (hire), or the workflow change's setup, paid in the start month. */
  oneOffCost: number;
  /** Workflow: share of recurring hours saved (0 to 1), from savingFromMonth. Hypothetical until shown to protect required tasks. */
  savingShare: number;
  savingFromMonth: number;
};

export type GrowthCase = { id: string; label: string; newDelta: number; exitDelta: number; complexity: number; describe: string };

/** Something that happens: leave, intake, payment timing or temporary help, from a month on. */
export type Adjustment =
  | { kind: "leave"; month: number; hours: number }
  | { kind: "intake"; fromMonth: number; extraNew: number }
  | { kind: "paymentDelay"; fromMonth: number; extraMonths: number }
  | { kind: "temporary"; fromMonth: number; months: number; hours: number; cost: number }
  /** A workflow change alongside any option: a share of recurring hours saved from a month, with a setup cost then. Hypothetical until shown to protect required tasks. */
  | { kind: "saving"; fromMonth: number; share: number; setupCost: number };

export type Month = {
  month: number;
  clients: number;
  newClients: number;
  requiredHours: number;
  availableHours: number;
  /** null when there's no available capacity. */
  utilisation: number | null;
  noCapacity: boolean;
  pressure: boolean;
  earned: number;
  received: number;
  staffCost: number;
  otherCost: number;
  oneOff: number;
  operating: number;
  closingCash: number;
  reserveBreach: boolean;
  /*
    The split of otherCost and the margins (Care Partner Hiring Runway PRD, section 6). Additions only: otherCost,
    operating and cash are exactly what they were, so every saved result and fixture holds.
  */
  /** Participant-driven costs and any temporary help. */
  variableCost: number;
  fixedCost: number;
  ownerPay: number;
  /** Earned income − staff costs (recruitment and setup included) − variable costs. */
  contribution: number;
  /** Contribution − fixed overhead: the result before owner remuneration. */
  operatingBeforeOwner: number;
};

export type Forecast = {
  months: Month[];
  firstPressure: number | null;
  monthsAbove: number;
  lowestCash: number;
  lowestCashMonth: number;
  operating12: number;
  firstReserveBreach: number | null;
  /** The month a hire joins, if any. */
  joins: number | null;
};

const num = (v: number) => (Number.isFinite(v) ? v : 0);

/** The blended recurring hours of today's mix: kept for forecast participants (a documented simplification). */
export function blendedHours(i: HiringInputs) {
  const b = i.bands;
  const count = b.standard.count + b.higher.count + b.intensive.count;
  if (count <= 0) return 0;
  return (b.standard.count * b.standard.hours + b.higher.count * b.higher.hours + b.intensive.count * b.intensive.hours) / count;
}
export const initialClients = (i: HiringInputs) => i.bands.standard.count + i.bands.higher.count + i.bands.intensive.count;
/** Productive participant-work hours one FTE gives each month. */
export const hoursPerFte = (i: HiringInputs) => ((i.paidWeeklyHours * 52) / 12) * i.availability * i.productive;

/** How far a hire has ramped in a month: none before joining, then up to full over the ramp. */
export function rampFraction(o: HiringOption, month: number) {
  if (o.kind !== "hire") return 0;
  const joins = o.startMonth + o.leadMonths;
  if (month < joins) return 0;
  if (o.rampMonths <= 0) return 1;
  return Math.min(1, (month - joins + 1) / o.rampMonths);
}

/**
  The 12-month forecast for one option under one growth case, with any adjustments (an event, temporary help, paced
  intake). Deterministic: the same inputs always give the same months.
*/
export function forecast(i: HiringInputs, o: HiringOption, g: GrowthCase, adjustments: Adjustment[] = [], horizon = HORIZON): Forecast {
  const blended = blendedHours(i);
  const perFte = hoursPerFte(i);
  const months: Month[] = [];
  const joins = o.kind === "hire" ? o.startMonth + o.leadMonths : null;
  const delays = adjustments.filter((a): a is Extract<Adjustment, { kind: "paymentDelay" }> => a.kind === "paymentDelay");
  /** When income earned in a service month is received: after the lag, later still if a delay applies by then. */
  const payMonth = (service: number) => {
    let at = service + Math.max(0, Math.round(i.paymentLagMonths));
    for (const d of delays) if (at >= d.fromMonth) at += Math.max(0, Math.round(d.extraMonths));
    return at;
  };
  // Income earned before the forecast (opening receivables) and in it, by the month it's received.
  const receipts = new Map<number, number>();
  const lag = Math.max(0, Math.round(i.paymentLagMonths));
  if (i.receivables)
    // A schedule: each amount is due in its own month (later still if a delay applies), counted once.
    i.receivables.forEach((amount, k) => receipts.set(payMonth(k + 1 - lag), (receipts.get(payMonth(k + 1 - lag)) ?? 0) + num(amount)));
  else for (let s = 1 - lag; s <= 0; s++) receipts.set(payMonth(s), (receipts.get(payMonth(s)) ?? 0) + num(i.openingReceivables));

  let clients = initialClients(i);
  // Band by band, when new participants arrive in their own mix (version 2).
  const BANDS = ["standard", "higher", "intensive"] as const;
  const mixTotal = i.newMix ? BANDS.reduce((n, b) => n + Math.max(0, num(i.newMix![b])), 0) : 0;
  const byBand = i.newMix && mixTotal > 0 ? BANDS.map((b) => Math.max(0, num(i.bands[b].count))) : null;
  let cash = num(i.openingCash);
  for (let m = 1; m <= horizon; m++) {
    const extraNew = adjustments.reduce((n, a) => (a.kind === "intake" && m >= a.fromMonth ? n + a.extraNew : n), 0);
    const newClients = Math.max(0, i.newPerMonth + g.newDelta + extraNew);
    const exits = Math.max(0, i.exitsPerMonth + g.exitDelta);
    if (byBand) {
      // Exits leave in proportion to the caseload's current bands; new participants arrive in the given mix.
      const before = byBand.reduce((n, c) => n + c, 0);
      const out = Math.min(before, exits);
      BANDS.forEach((b, k) => {
        byBand[k] = Math.max(0, byBand[k] - (before > 0 ? (out * byBand[k]) / before : 0) + (newClients * Math.max(0, num(i.newMix![b]))) / mixTotal);
      });
      clients = byBand.reduce((n, c) => n + c, 0);
    } else clients = Math.max(0, clients + newClients - exits);

    const savings = adjustments.reduce((n, a) => (a.kind === "saving" && m >= a.fromMonth ? n + a.share : n), 0);
    const saving = Math.min(1, Math.max(0, (o.kind === "workflow" && m >= o.savingFromMonth ? o.savingShare : 0) + savings));
    const bandHours = byBand ? BANDS.reduce((n, b, k) => n + byBand[k] * i.bands[b].hours, 0) : clients * blended;
    const recurring = bandHours * g.complexity * (1 - saving);
    const requiredHours = recurring + newClients * i.onboardingHours + i.reviewHours;

    const temp = adjustments.filter(
      (a): a is Extract<Adjustment, { kind: "temporary" }> => a.kind === "temporary" && m >= a.fromMonth && m < a.fromMonth + a.months,
    );
    const leave = adjustments.reduce((n, a) => (a.kind === "leave" && a.month === m ? n + a.hours : n), 0);
    const availableHours = Math.max(0, perFte * (i.currentFte + o.fte * rampFraction(o, m)) + temp.reduce((n, t) => n + t.hours, 0) - leave);
    const noCapacity = availableHours <= 0 && requiredHours > 0;
    const utilisation = availableHours > 0 ? requiredHours / availableHours : null;
    const pressure = noCapacity || requiredHours > availableHours * i.threshold;

    const earned = clients * i.incomePerClient + num(i.fixedIncome ?? 0);
    receipts.set(payMonth(m), (receipts.get(payMonth(m)) ?? 0) + earned);
    const received = receipts.get(m) ?? 0;
    const staffCost = i.currentFte * i.staffCostPerFte + (joins !== null && m >= joins ? o.fte * i.staffCostPerFte : 0);
    const variableCost = clients * i.variableCostPerClient + temp.reduce((n, t) => n + t.cost, 0);
    const otherCost = variableCost + i.fixedOverhead + i.ownerPay;
    const oneOff =
      (o.kind !== "none" && m === o.startMonth ? o.oneOffCost : 0) +
      adjustments.reduce((n, a) => (a.kind === "saving" && m === Math.max(1, a.fromMonth - 1) ? n + a.setupCost : n), 0);
    const operating = earned - staffCost - otherCost - oneOff;
    const contribution = earned - staffCost - variableCost - oneOff;
    cash = cash + received - staffCost - otherCost - oneOff;

    months.push({
      month: m,
      clients,
      newClients,
      requiredHours,
      availableHours,
      utilisation,
      noCapacity,
      pressure,
      earned,
      received,
      staffCost,
      otherCost,
      oneOff,
      operating,
      closingCash: cash,
      reserveBreach: cash < i.reserve,
      variableCost,
      fixedCost: i.fixedOverhead,
      ownerPay: i.ownerPay,
      contribution,
      operatingBeforeOwner: contribution - i.fixedOverhead,
    });
  }
  const lowest = months.reduce((lo, x) => (x.closingCash < lo.closingCash ? x : lo), months[0]);
  return {
    months,
    firstPressure: months.find((x) => x.pressure)?.month ?? null,
    monthsAbove: months.filter((x) => x.pressure).length,
    lowestCash: lowest?.closingCash ?? cash,
    lowestCashMonth: lowest?.month ?? 0,
    operating12: months.reduce((n, x) => n + x.operating, 0),
    firstReserveBreach: months.find((x) => x.reserveBreach)?.month ?? null,
    joins,
  };
}

/**
  The planning-window heuristic from the prototype: the first no-hire pressure month, less the recruitment lead and
  the full ramp, plus one. A prompt to plan, never a hiring order. Below Month 1 means pressure arrives before any hire
  could be fully productive, so an interim plan is needed.
*/
export function planningWindow(firstPressure: number | null, leadMonths: number, rampMonths: number) {
  if (firstPressure === null) return null;
  return firstPressure - leadMonths - rampMonths + 1;
}

/** Whole dollars for display: the model keeps full precision. */
export const dollars = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
export const pct = (v: number | null) => (v === null ? "No available capacity" : `${Math.round(v * 100)}%`);
