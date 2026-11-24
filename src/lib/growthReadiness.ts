/*
  "Can we take on the next 10 clients?" (docs/growth-readiness.md): a near-term intake and service-readiness model for
  a Care Partner business. It splits a calendar month into its calendar weeks (partial weeks included), and for each
  week sets the coordinators' available hours against existing work and the work new starts bring; and for each service
  slot a start needs (service, capability, area, time window, week) it sets what's required against confirmed, current,
  uncommitted supply.

  Everything here is pure and deterministic, shared by the story (fictional figures) and "Use my business" (a
  partner's own aggregate figures), the learner's page, the server and the editor. No AI calculates anything.

  Rules it keeps:
  - A monthly total never hides a week: each week stands on its own.
  - In a partial week, recurring weekly figures (working hours, non-client duties, existing work per client, slots per
    week) are scaled by the weekdays inside the month (of five). Setup, leave, cover and exceptional work are entered
    in hours for the week and aren't scaled.
  - Non-client duties are scaled to the days a coordinator actually works, so leave never takes them off twice.
  - The reserve is a share of the coordinators' own net hours. Temporary cover is added after it, in full.
  - Only confirmed supply that is current (verified within the stale window, on or before the as-of date) counts.
    Provisional, expired, stale and already-booked slots never do; a slot covers one start once.
  - Unknown is never green: an unconfirmed preference, agreement, price, staffing, timing or approval makes a start
    "needs confirmation", whatever the hours say.
  - Starts are read in the order they're given (week, then the order the owner set): never by revenue, funding or ease.
    The model says which start is beyond the hours or slots under that order; it never refuses or moves anyone.
  - A blank number is not zero: the inputs don't validate, and the last valid result stays, labelled as such.
*/

export const MODEL_VERSION = "growth-readiness-1";

export const STAGES = {
  enquiry: "Enquiry",
  expected: "Expected start",
  ready: "Ready to start",
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_HINTS: Record<Stage, string> = {
  enquiry: "An enquiry or provisional referral: kept out of the forecast until it becomes a start.",
  expected: "A likely start: the agreement, plan or service arrangements aren’t all in place yet.",
  ready: "The participant’s agreement, plan and service arrangements are in place.",
};

export const SUPPLY_STATUS = {
  confirmed: "Confirmed spare",
  provisional: "Provisional offer",
  booked: "Already booked",
  expired: "Approval expired",
  unknown: "Status unknown",
} as const;
export type SupplyStatus = keyof typeof SUPPLY_STATUS;

/** A number field that may be blank. null is blank: never read as zero. */
export type Num = number | null;

export type Band = {
  id: string;
  label: string;
  /** Active clients in this band today. */
  count: Num;
  /** Observed coordination hours per client per full week. */
  hoursPerWeek: Num;
  /** A new client's setup hours, in the week they start. */
  setupHours: Num;
  /** A new client's follow-up hours over their first month, spread by followUpSpread. */
  followUpHours: Num;
};
export type Coordinator = {
  id: string;
  name: string;
  /** Working hours in a full week. */
  hoursPerWeek: Num;
  /** Non-client duties (admin, training, meetings) in a full week, on the days they work. */
  nonClientPerWeek: Num;
  /** Leave and other unavailability, in hours, week by week. */
  leave: Num[];
};
export type Service = {
  id: string;
  service: string;
  capability: string;
  area: string;
  window: string;
  /** Visits a full week, from the start week to the end of the month. */
  slotsPerWeek: Num;
  /** A relevant preference, in words (no names). */
  preference?: string;
};
export type Start = {
  id: string;
  /** An anonymous label: "Start A", never a name. */
  label: string;
  stage: Stage;
  band: string;
  /** Index into the month's weeks. */
  week: number;
  /** For starts in the same week: the order the owner set (1 first). */
  order: number;
  services: Service[];
  /** What still needs confirming, in words: an unconfirmed preference, agreement, price, staffing, timing or approval. */
  unknowns: string[];
  /** A short line of context for the story (no diagnosis). */
  note?: string;
};
export type Supply = {
  id: string;
  supplier: string;
  service: string;
  capability: string;
  area: string;
  window: string;
  /** The weeks it's for; empty: every week of the month. */
  weeks: number[];
  /** Slots each of those weeks. */
  slots: Num;
  status: SupplyStatus;
  /** When it was last verified (YYYY-MM-DD); empty: never. */
  verifiedOn: string;
};
export type IntakeInputs = {
  /** YYYY-MM */
  month: string;
  /** The date figures are read as of (YYYY-MM-DD): supply older than staleDays before it is stale. */
  asOf: string;
  staleDays: number;
  /** Contingency reserve: a share (0–50%) of the coordinators' net hours. */
  reservePct: Num;
  /** How a start's follow-up hours fall: share in its start week, the week after, and so on. */
  followUpSpread: number[];
  bands: Band[];
  coordinators: Coordinator[];
  /** Known exceptional work (reviews, discharges, incidents) in hours, week by week. */
  exceptional: Num[];
  /** Approved temporary coordination cover in hours, week by week. */
  cover: Num[];
  starts: Start[];
  supply: Supply[];
};

// ---------------------------------------------------------------------------------------------
// Calendar weeks
// ---------------------------------------------------------------------------------------------

export type Week = { index: number; label: string; from: string; to: string; weekdays: number; partial: boolean };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

/** The month's calendar weeks, Monday to Sunday, cut to the days inside the month. */
export function weeksOf(month: string): Week[] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  if (mo < 0 || mo > 11) return [];
  const first = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(y, mo + 1, 0));
  const out: Week[] = [];
  let from = first;
  while (from <= last) {
    // Days to Sunday: getUTCDay is 0 on Sunday.
    const toSunday = (7 - from.getUTCDay()) % 7;
    const sunday = new Date(from.getTime() + toSunday * 86400000);
    const to = sunday > last ? last : sunday;
    let weekdays = 0;
    for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
      const dow = new Date(t).getUTCDay();
      if (dow >= 1 && dow <= 5) weekdays += 1;
    }
    const span = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    out.push({
      index: out.length,
      label: `Week ${out.length + 1} · ${day(from)}–${day(to)}`,
      from: iso(from),
      to: iso(to),
      weekdays,
      partial: span < 7,
    });
    from = new Date(to.getTime() + 86400000);
  }
  return out;
}

/** The next calendar month after a date, as YYYY-MM. */
export function nextMonth(today: string) {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// Validation: blank is not zero
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

export function validateInputs(i: IntakeInputs): InputError[] {
  const out: InputError[] = [];
  const weeks = weeksOf(i.month);
  const need = (v: Num, field: string, label: string, { min = 0, max = 10000 } = {}) => {
    if (v === null || v === undefined || Number.isNaN(v)) out.push({ field, message: `${label} is blank. Enter a number (0 if there’s none).` });
    else if (v < min || v > max) out.push({ field, message: `${label} must be between ${min} and ${max}.` });
  };
  if (!weeks.length) out.push({ field: "month", message: "Choose a month." });
  need(i.reservePct, "reservePct", "The reserve", { max: 50 });
  i.bands.forEach((b) => {
    need(b.count, `band.${b.id}.count`, `Active clients (${b.label})`, { max: 2000 });
    need(b.hoursPerWeek, `band.${b.id}.hoursPerWeek`, `Hours per client per week (${b.label})`, { max: 40 });
    need(b.setupHours, `band.${b.id}.setupHours`, `Setup hours (${b.label})`, { max: 80 });
    need(b.followUpHours, `band.${b.id}.followUpHours`, `First-month follow-up hours (${b.label})`, { max: 80 });
  });
  i.coordinators.forEach((c) => {
    need(c.hoursPerWeek, `coord.${c.id}.hoursPerWeek`, `${c.name || "A coordinator"}’s working hours`, { max: 60 });
    need(c.nonClientPerWeek, `coord.${c.id}.nonClientPerWeek`, `${c.name || "A coordinator"}’s non-client duties`, { max: 60 });
    if ((c.nonClientPerWeek ?? 0) > (c.hoursPerWeek ?? 0))
      out.push({ field: `coord.${c.id}.nonClientPerWeek`, message: `${c.name || "A coordinator"}’s non-client duties are more than their working hours.` });
    weeks.forEach((w) => {
      need(c.leave[w.index] ?? null, `coord.${c.id}.leave.${w.index}`, `${c.name || "A coordinator"}’s leave in Week ${w.index + 1}`, { max: 60 });
      const scaled = ((c.hoursPerWeek ?? 0) * w.weekdays) / 5;
      if ((c.leave[w.index] ?? 0) > scaled + 0.001)
        out.push({
          field: `coord.${c.id}.leave.${w.index}`,
          message: `${c.name || "A coordinator"}’s leave in Week ${w.index + 1} is more than the ${round1(scaled)} hours they’d work that week.`,
        });
    });
  });
  weeks.forEach((w) => {
    need(i.exceptional[w.index] ?? null, `exceptional.${w.index}`, `Exceptional work in Week ${w.index + 1}`, { max: 500 });
    need(i.cover[w.index] ?? null, `cover.${w.index}`, `Temporary cover in Week ${w.index + 1}`, { max: 200 });
  });
  const bandIds = new Set(i.bands.map((b) => b.id));
  i.starts.forEach((s) => {
    if (!bandIds.has(s.band)) out.push({ field: `start.${s.id}.band`, message: `${s.label}: choose a work band.` });
    if (!weeks[s.week]) out.push({ field: `start.${s.id}.week`, message: `${s.label}: choose a week inside the month.` });
    s.services.forEach((v) => need(v.slotsPerWeek, `start.${s.id}.service.${v.id}`, `${s.label}: visits a week (${v.service || "service"})`, { max: 21 }));
  });
  i.supply.forEach((p) => need(p.slots, `supply.${p.id}.slots`, `Slots from ${p.supplier || "a supplier"}`, { max: 200 }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------------------------

const n = (v: Num) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const round1 = (v: number) => Math.round(v * 10) / 10;
const keyOf = (x: { service: string; capability: string; area: string; window: string }) =>
  [x.service, x.capability, x.area, x.window].map((s) => s.trim().toLowerCase()).join("|");
const counted = (s: Start) => s.stage !== "enquiry";

export type WeekResult = {
  week: Week;
  /** The coordinators' working hours (scaled to the weekdays in the month). */
  working: number;
  leave: number;
  /** Non-client duties, on the days actually worked. */
  nonClient: number;
  reserve: number;
  cover: number;
  /** working − leave − nonClient − reserve + cover */
  available: number;
  existing: number;
  exceptional: number;
  setup: number;
  followUp: number;
  /** existing + exceptional + setup + followUp */
  required: number;
  headroom: number;
  /** The starts whose setup falls this week. */
  startsHere: string[];
};

export type ServiceCheck = {
  key: string;
  service: string;
  capability: string;
  area: string;
  window: string;
  week: number;
  required: number;
  confirmed: number;
  /** Provisional, stale, expired or unknown slots: not counted, but worth confirming. */
  unconfirmed: number;
  shortfall: number;
  /** The latest verification date among the supply for it, or "". */
  verifiedOn: string;
  state: "covered" | "confirm" | "gap";
  /** Why supply didn't count, in words. */
  notes: string[];
};

export type StartStatus = "supported" | "constrained" | "confirm" | "enquiry";
export type StartResult = {
  id: string;
  label: string;
  week: number;
  status: StartStatus;
  /** Hours this start adds (setup in its week, follow-up after). */
  hours: number;
  reasons: string[];
};

export type OverallState = "available" | "gap" | "confirm";
export const OVERALL: Record<OverallState, { label: string; tone: string }> = {
  available: { label: "Modelled capacity available", tone: "good" },
  gap: { label: "Capacity gap", tone: "bad" },
  confirm: { label: "Needs confirmation", tone: "warn" },
};

export type IntakeResult = {
  modelVersion: string;
  weeks: WeekResult[];
  services: ServiceCheck[];
  starts: StartResult[];
  state: OverallState;
  proposed: number;
  supported: number;
  constrained: number;
  confirm: number;
  enquiries: number;
  /** The week with the least headroom. */
  tightest: number;
  /** Hours of follow-up that fall after the month. */
  afterMonth: number;
  findings: string[];
};

/** Supply that counts: confirmed and current. Otherwise, why not. */
export function supplyCounts(p: Supply, asOf: string, staleDays: number): { counts: boolean; why: string; maybe: boolean } {
  if (p.status === "booked") return { counts: false, why: `${p.supplier}: already booked for someone else`, maybe: false };
  if (p.status === "provisional") return { counts: false, why: `${p.supplier}: a provisional offer, not confirmed`, maybe: true };
  if (p.status === "expired") return { counts: false, why: `${p.supplier}: their approval has expired`, maybe: true };
  if (p.status === "unknown") return { counts: false, why: `${p.supplier}: status unknown`, maybe: true };
  if (!p.verifiedOn) return { counts: false, why: `${p.supplier}: never verified`, maybe: true };
  const age = (Date.parse(asOf) - Date.parse(p.verifiedOn)) / 86400000;
  if (!Number.isFinite(age) || age < 0) return { counts: false, why: `${p.supplier}: verification date isn’t valid`, maybe: true };
  if (age > staleDays) return { counts: false, why: `${p.supplier}: last verified ${p.verifiedOn}, more than ${staleDays} days ago`, maybe: true };
  return { counts: true, why: "", maybe: false };
}

/** Starts in the order they're read: week, then the owner's order, then as listed. Never by revenue, funding or ease. */
export const ordered = (starts: Start[]) =>
  starts
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.week - b.s.week || a.s.order - b.s.order || a.i - b.i)
    .map((x) => x.s);

/** The hours one start adds, week by week: setup in its start week, follow-up spread after. */
function startDemand(i: IntakeInputs, s: Start, weekCount: number) {
  const band = i.bands.find((b) => b.id === s.band);
  const by = new Array(weekCount).fill(0) as number[];
  const setup = new Array(weekCount).fill(0) as number[];
  const follow = new Array(weekCount).fill(0) as number[];
  let after = 0;
  if (!band || s.week < 0 || s.week >= weekCount) return { by, setup, follow, after };
  setup[s.week] += n(band.setupHours);
  const spread = i.followUpSpread.length ? i.followUpSpread : [1];
  const total = spread.reduce((a, b) => a + b, 0) || 1;
  spread.forEach((share, k) => {
    const h = (n(band.followUpHours) * share) / total;
    const w = s.week + k;
    if (w < weekCount) follow[w] += h;
    else after += h;
  });
  for (let w = 0; w < weekCount; w += 1) by[w] = setup[w] + follow[w];
  return { by, setup, follow, after };
}

export function calculate(i: IntakeInputs): IntakeResult {
  const weeks = weeksOf(i.month);
  const W = weeks.length;
  const reserveShare = Math.min(50, Math.max(0, n(i.reservePct))) / 100;
  const starts = ordered(i.starts);

  // Coordinator time and existing work, week by week.
  const base = weeks.map((week) => {
    const f = week.weekdays / 5;
    let working = 0;
    let leave = 0;
    let nonClient = 0;
    for (const c of i.coordinators) {
      const w = n(c.hoursPerWeek) * f;
      const l = Math.min(n(c.leave[week.index]), w);
      working += w;
      leave += l;
      // Duties fall on the days worked: a coordinator on leave half the week does half their admin.
      nonClient += w > 0 ? n(c.nonClientPerWeek) * f * ((w - l) / w) : 0;
    }
    const net = Math.max(0, working - leave - nonClient);
    const reserve = net * reserveShare;
    const cover = n(i.cover[week.index]);
    const existing = i.bands.reduce((a, b) => a + n(b.count) * n(b.hoursPerWeek) * f, 0);
    return { week, working, leave, nonClient, reserve, cover, available: net - reserve + cover, existing, exceptional: n(i.exceptional[week.index]) };
  });

  // New starts, in order: the week totals carry every counted start; each start's own status reads the order.
  const setup = new Array(W).fill(0) as number[];
  const follow = new Array(W).fill(0) as number[];
  const startsHere: string[][] = weeks.map(() => []);
  const load = new Array(W).fill(0) as number[];
  let afterMonth = 0;
  const hoursFit = new Map<string, { fits: boolean; short: number; week: number }>();
  for (const s of starts) {
    if (!counted(s)) continue;
    const d = startDemand(i, s, W);
    afterMonth += d.after;
    if (weeks[s.week]) startsHere[s.week].push(s.id);
    for (let w = 0; w < W; w += 1) {
      setup[w] += d.setup[w];
      follow[w] += d.follow[w];
    }
    // Does it fit, given the starts before it?
    let worst = 0;
    let worstWeek = s.week;
    for (let w = 0; w < W; w += 1) {
      if (!d.by[w]) continue;
      const left = base[w].available - base[w].existing - base[w].exceptional - load[w] - d.by[w];
      if (left < worst - 1e-9) {
        worst = left;
        worstWeek = w;
      }
    }
    if (worst >= -1e-9) for (let w = 0; w < W; w += 1) load[w] += d.by[w];
    hoursFit.set(s.id, { fits: worst >= -1e-9, short: round1(-worst), week: worstWeek });
  }
  const weekResults: WeekResult[] = base.map((b, w) => {
    const required = b.existing + b.exceptional + setup[w] + follow[w];
    return {
      week: b.week,
      working: round1(b.working),
      leave: round1(b.leave),
      nonClient: round1(b.nonClient),
      reserve: round1(b.reserve),
      cover: round1(b.cover),
      available: round1(b.available),
      existing: round1(b.existing),
      exceptional: round1(b.exceptional),
      setup: round1(setup[w]),
      followUp: round1(follow[w]),
      required: round1(required),
      headroom: round1(b.available - required),
      startsHere: startsHere[w],
    };
  });

  // Service slots: what each counted start needs, against confirmed current supply, in the starts' order.
  type Pool = { confirmed: number; unconfirmed: number; verifiedOn: string; notes: string[] };
  const pools = new Map<string, Pool>();
  const poolOf = (key: string, w: number) => {
    const k = `${key}#${w}`;
    if (!pools.has(k)) pools.set(k, { confirmed: 0, unconfirmed: 0, verifiedOn: "", notes: [] });
    return pools.get(k)!;
  };
  for (const p of i.supply) {
    const key = keyOf(p);
    const c = supplyCounts(p, i.asOf, i.staleDays);
    for (const w of p.weeks.length ? p.weeks : weeks.map((x) => x.index)) {
      if (!weeks[w]) continue;
      const pool = poolOf(key, w);
      if (c.counts) pool.confirmed += n(p.slots);
      else if (c.maybe) pool.unconfirmed += n(p.slots);
      if (c.why && !pool.notes.includes(c.why)) pool.notes.push(c.why);
      if (p.verifiedOn && p.verifiedOn > pool.verifiedOn) pool.verifiedOn = p.verifiedOn;
    }
  }
  const checks = new Map<string, ServiceCheck>();
  const serviceFit = new Map<string, { gap: string[]; confirm: string[] }>();
  for (const s of starts) {
    if (!counted(s)) continue;
    const fit = { gap: [] as string[], confirm: [] as string[] };
    for (const v of s.services) {
      const key = keyOf(v);
      for (let w = s.week; w < W && w >= 0; w += 1) {
        const need = Math.ceil((n(v.slotsPerWeek) * weeks[w].weekdays) / 5);
        if (!need) continue;
        const pool = poolOf(key, w);
        const ck = `${key}#${w}`;
        const check: ServiceCheck = checks.get(ck) ?? {
          key,
          service: v.service,
          capability: v.capability,
          area: v.area,
          window: v.window,
          week: w,
          required: 0,
          confirmed: pool.confirmed,
          unconfirmed: pool.unconfirmed,
          shortfall: 0,
          verifiedOn: pool.verifiedOn,
          state: "covered",
          notes: pool.notes,
        };
        check.required += need;
        checks.set(ck, check);
        // Take from confirmed first, then from what might be confirmed; a slot covers one start once.
        const fromConfirmed = Math.min(need, pool.confirmed);
        pool.confirmed -= fromConfirmed;
        const rest = need - fromConfirmed;
        if (rest > 0) {
          const fromMaybe = Math.min(rest, pool.unconfirmed);
          pool.unconfirmed -= fromMaybe;
          const what = `${v.service} (${v.window}, ${v.area}) in Week ${w + 1}`;
          if (fromMaybe > 0 && !fit.confirm.includes(what)) fit.confirm.push(what);
          if (rest - fromMaybe > 0 && !fit.gap.includes(what)) fit.gap.push(what);
        }
      }
    }
    serviceFit.set(s.id, fit);
  }
  const services = [...checks.values()]
    .map((c) => {
      const shortfall = Math.max(0, c.required - c.confirmed);
      const state: ServiceCheck["state"] = shortfall === 0 ? "covered" : c.unconfirmed >= shortfall ? "confirm" : "gap";
      return { ...c, shortfall, state };
    })
    .sort((a, b) => a.week - b.week || a.service.localeCompare(b.service));

  // Each start's status, with its reasons.
  const startResults: StartResult[] = starts.map((s) => {
    if (!counted(s))
      return { id: s.id, label: s.label, week: s.week, status: "enquiry", hours: 0, reasons: ["An enquiry: not in the forecast until it becomes a start."] };
    const d = startDemand(i, s, W);
    const hours = round1(d.by.reduce((a, b) => a + b, 0));
    const reasons: string[] = [];
    const h = hoursFit.get(s.id);
    const sf = serviceFit.get(s.id) ?? { gap: [], confirm: [] };
    if (h && !h.fits) reasons.push(`Beyond the coordinator hours in Week ${h.week + 1} by ${h.short} hours, under the order you set.`);
    for (const g of sf.gap) reasons.push(`No confirmed slot for ${g}.`);
    for (const c of sf.confirm) reasons.push(`Only an unconfirmed slot for ${c}: confirm it before promising a date.`);
    if (s.stage === "expected") reasons.push("The agreement, plan or service arrangements aren’t all in place yet.");
    for (const u of s.unknowns) reasons.push(`Needs confirmation: ${u}`);
    const status: StartStatus =
      (h && !h.fits) || sf.gap.length ? "constrained" : sf.confirm.length || s.stage === "expected" || s.unknowns.length ? "confirm" : "supported";
    return { id: s.id, label: s.label, week: s.week, status, hours, reasons };
  });

  const proposed = startResults.filter((s) => s.status !== "enquiry").length;
  const count = (st: StartStatus) => startResults.filter((s) => s.status === st).length;
  const anyGap = weekResults.some((w) => w.headroom < 0) || services.some((c) => c.state === "gap") || count("constrained") > 0;
  const anyConfirm = services.some((c) => c.state === "confirm") || count("confirm") > 0;
  const tightest = weekResults.reduce((best, w) => (w.headroom < weekResults[best].headroom ? w.week.index : best), 0);
  const result: IntakeResult = {
    modelVersion: MODEL_VERSION,
    weeks: weekResults,
    services,
    starts: startResults,
    state: anyGap ? "gap" : anyConfirm ? "confirm" : "available",
    proposed,
    supported: count("supported"),
    constrained: count("constrained"),
    confirm: count("confirm"),
    enquiries: count("enquiry"),
    tightest: weekResults.length ? tightest : 0,
    afterMonth: round1(afterMonth),
    findings: [],
  };
  result.findings = findings(i, result);
  return result;
}

/** The assumptions that matter most, in plain words. */
function findings(i: IntakeInputs, r: IntakeResult): string[] {
  const out: string[] = [];
  const t = r.weeks[r.tightest];
  if (t) {
    const here = i.starts.filter((s) => t.startsHere.includes(s.id));
    if (t.headroom < 0)
      out.push(
        `Week ${t.week.index + 1} is short by ${round1(-t.headroom)} hours${here.length ? `: ${here.length} ${here.length === 1 ? "start needs" : "starts need"} ${t.setup} setup hours that week` : ""}${t.leave ? `, with ${t.leave} hours of leave` : ""}.`,
      );
    else out.push(`The tightest week is Week ${t.week.index + 1}, with ${t.headroom} hours to spare after the reserve.`);
  }
  const monthly = round1(r.weeks.reduce((a, w) => a + w.headroom, 0));
  if (monthly >= 0 && r.weeks.some((w) => w.headroom < 0))
    out.push(`Over the whole month there are ${monthly} hours to spare, but that total hides a short week.`);
  for (const c of r.services.filter((x) => x.state !== "covered").slice(0, 3))
    out.push(
      `${c.service} (${c.capability}, ${c.window}, ${c.area}) in Week ${c.week + 1}: ${c.required} ${c.required === 1 ? "slot" : "slots"} needed, ${c.confirmed} confirmed${c.verifiedOn ? ` (last verified ${c.verifiedOn})` : ""}.`,
    );
  if (r.afterMonth) out.push(`${r.afterMonth} hours of first-month follow-up fall after the month: check the next one too.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Changes and what they did
// ---------------------------------------------------------------------------------------------

/** What's different between two sets of inputs, in words. */
export function inputChanges(a: IntakeInputs, b: IntakeInputs): string[] {
  const out: string[] = [];
  const weeks = weeksOf(b.month);
  if (a.month !== b.month) out.push(`Month: ${a.month} → ${b.month}`);
  if (a.reservePct !== b.reservePct) out.push(`Reserve: ${a.reservePct ?? "blank"}% → ${b.reservePct ?? "blank"}%`);
  weeks.forEach((w) => {
    if ((a.cover[w.index] ?? 0) !== (b.cover[w.index] ?? 0))
      out.push(`Temporary cover, Week ${w.index + 1}: ${a.cover[w.index] ?? 0} → ${b.cover[w.index] ?? "blank"} hours`);
    if ((a.exceptional[w.index] ?? 0) !== (b.exceptional[w.index] ?? 0))
      out.push(`Exceptional work, Week ${w.index + 1}: ${a.exceptional[w.index] ?? 0} → ${b.exceptional[w.index] ?? "blank"} hours`);
  });
  for (const c of b.coordinators) {
    const o = a.coordinators.find((x) => x.id === c.id);
    if (!o) continue;
    if (o.hoursPerWeek !== c.hoursPerWeek) out.push(`${c.name}’s hours: ${o.hoursPerWeek} → ${c.hoursPerWeek ?? "blank"} a week`);
    weeks.forEach((w) => {
      if ((o.leave[w.index] ?? 0) !== (c.leave[w.index] ?? 0))
        out.push(`${c.name}’s leave, Week ${w.index + 1}: ${o.leave[w.index] ?? 0} → ${c.leave[w.index] ?? "blank"} hours`);
    });
  }
  for (const s of b.starts) {
    const o = a.starts.find((x) => x.id === s.id);
    if (!o) {
      out.push(`${s.label} added`);
      continue;
    }
    if (o.week !== s.week) out.push(`${s.label} moved from Week ${o.week + 1} to Week ${s.week + 1} (to discuss with the participant)`);
    if (o.stage !== s.stage) out.push(`${s.label}: ${STAGES[o.stage]} → ${STAGES[s.stage]}`);
    if (o.order !== s.order) out.push(`${s.label}: order ${o.order} → ${s.order}`);
  }
  for (const p of b.supply) {
    const o = a.supply.find((x) => x.id === p.id);
    if (!o) {
      out.push(`Supply from ${p.supplier} added`);
      continue;
    }
    if (o.status !== p.status) out.push(`${p.supplier}: ${SUPPLY_STATUS[o.status]} → ${SUPPLY_STATUS[p.status]}`);
    if (o.verifiedOn !== p.verifiedOn) out.push(`${p.supplier}: verified ${o.verifiedOn || "never"} → ${p.verifiedOn || "never"}`);
    if (o.slots !== p.slots) out.push(`${p.supplier}: ${o.slots} → ${p.slots ?? "blank"} slots`);
  }
  for (const bd of b.bands) {
    const o = a.bands.find((x) => x.id === bd.id);
    if (!o) continue;
    for (const k of ["count", "hoursPerWeek", "setupHours", "followUpHours"] as const)
      if (o[k] !== bd[k]) out.push(`${bd.label}, ${k}: ${o[k]} → ${bd[k] ?? "blank"}`);
  }
  return out;
}

/** What a change did to the result: each week's headroom, each start's status, each service check. */
export function resultChanges(a: IntakeResult, b: IntakeResult): string[] {
  const out: string[] = [];
  b.weeks.forEach((w, k) => {
    const o = a.weeks[k];
    if (o && o.headroom !== w.headroom) out.push(`Week ${k + 1} headroom: ${o.headroom} → ${w.headroom} hours`);
  });
  for (const s of b.starts) {
    const o = a.starts.find((x) => x.id === s.id);
    if (o && o.status !== s.status) out.push(`${s.label}: ${START_LABEL[o.status]} → ${START_LABEL[s.status]}`);
  }
  for (const c of b.services) {
    const o = a.services.find((x) => x.key === c.key && x.week === c.week);
    if (o && o.shortfall !== c.shortfall) out.push(`${c.service} (${c.window}) Week ${c.week + 1}: short ${o.shortfall} → ${c.shortfall}`);
  }
  if (a.state !== b.state) out.push(`Overall: ${OVERALL[a.state].label} → ${OVERALL[b.state].label}`);
  return out;
}

export const START_LABEL: Record<StartStatus, string> = {
  supported: "Modelled capacity",
  constrained: "Constrained",
  confirm: "Needs confirmation",
  enquiry: "Enquiry",
};

/** Applies a "try a change" option to the inputs. A moved start is a discussion option, not a change to a real arrangement. */
export type Change =
  | { kind: "cover"; week: number; hours: number }
  | { kind: "move"; start: string; week: number }
  | { kind: "verify"; supply: string; verifiedOn: string }
  | { kind: "stage"; start: string; stage: Stage };
export function applyChange(i: IntakeInputs, c: Change): IntakeInputs {
  const x: IntakeInputs = structuredClone(i);
  if (c.kind === "cover") x.cover[c.week] = n(x.cover[c.week]) + c.hours;
  if (c.kind === "move") {
    const s = x.starts.find((y) => y.id === c.start);
    if (s) s.week = c.week;
  }
  if (c.kind === "verify") {
    const p = x.supply.find((y) => y.id === c.supply);
    if (p) {
      p.status = "confirmed";
      // Verified as of the planning date: a check dated after it is read as current on it.
      p.verifiedOn = c.verifiedOn && c.verifiedOn < x.asOf ? c.verifiedOn : x.asOf;
    }
  }
  if (c.kind === "stage") {
    const s = x.starts.find((y) => y.id === c.start);
    if (s) s.stage = c.stage;
  }
  return x;
}

/** A blank set of inputs for a partner's own business: nothing fictional copied in. */
export function blankInputs(month: string, asOf: string): IntakeInputs {
  const W = weeksOf(month).length;
  const zeros = () => new Array(W).fill(0) as Num[];
  return {
    month,
    asOf,
    staleDays: 30,
    reservePct: null,
    followUpSpread: [0, 0.5, 0.3, 0.2],
    bands: [
      { id: "routine", label: "Routine", count: null, hoursPerWeek: null, setupHours: null, followUpHours: null },
      { id: "higher", label: "Higher-work", count: null, hoursPerWeek: null, setupHours: null, followUpHours: null },
      { id: "intensive", label: "Intensive", count: null, hoursPerWeek: null, setupHours: null, followUpHours: null },
    ],
    coordinators: [{ id: "c1", name: "Coordinator 1", hoursPerWeek: null, nonClientPerWeek: null, leave: zeros() }],
    exceptional: zeros(),
    cover: zeros(),
    starts: [],
    supply: [],
  };
}

/** Resizes the week-by-week arrays when the month changes, keeping what's there. */
export function fitToMonth(i: IntakeInputs, month: string): IntakeInputs {
  const W = weeksOf(month).length;
  const fit = (a: Num[]) => Array.from({ length: W }, (_, k) => (k < a.length ? a[k] : 0));
  return {
    ...i,
    month,
    exceptional: fit(i.exceptional),
    cover: fit(i.cover),
    coordinators: i.coordinators.map((c) => ({ ...c, leave: fit(c.leave) })),
    starts: i.starts.map((s) => ({ ...s, week: Math.min(s.week, Math.max(0, W - 1)) })),
    supply: i.supply.map((p) => ({ ...p, weeks: p.weeks.filter((w) => w < W) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading inputs from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown, d = 0, max = 10) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : d);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const ID = /^[a-z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);

export function cleanInputs(v: unknown): IntakeInputs {
  const o = obj(v);
  const month = typeof o.month === "string" && /^\d{4}-\d{2}$/.test(o.month) ? o.month : "2027-02";
  const W = weeksOf(month).length;
  const perWeek = (x: unknown) => Array.from({ length: W }, (_, k) => num(arr(x)[k]));
  const spread = arr(o.followUpSpread)
    .map((x) => (typeof x === "number" && x >= 0 && x <= 1 ? x : 0))
    .slice(0, 6);
  return {
    month,
    asOf: typeof o.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.asOf) ? o.asOf : `${month}-01`,
    staleDays: int(o.staleDays, 30, 365),
    reservePct: num(o.reservePct),
    followUpSpread: spread.length ? spread : [0, 0.5, 0.3, 0.2],
    bands: arr(o.bands)
      .slice(0, 6)
      .map((x, k) => {
        const b = obj(x);
        return {
          id: id(b.id, `b${k + 1}`),
          label: str(b.label, 40) || `Band ${k + 1}`,
          count: num(b.count),
          hoursPerWeek: num(b.hoursPerWeek),
          setupHours: num(b.setupHours),
          followUpHours: num(b.followUpHours),
        };
      }),
    coordinators: arr(o.coordinators)
      .slice(0, 12)
      .map((x, k) => {
        const c = obj(x);
        return {
          id: id(c.id, `c${k + 1}`),
          name: str(c.name, 40),
          hoursPerWeek: num(c.hoursPerWeek),
          nonClientPerWeek: num(c.nonClientPerWeek),
          leave: perWeek(c.leave),
        };
      }),
    exceptional: perWeek(o.exceptional),
    cover: perWeek(o.cover),
    starts: arr(o.starts)
      .slice(0, 40)
      .map((x, k) => {
        const s = obj(x);
        return {
          id: id(s.id, `s${k + 1}`),
          label: str(s.label, 40) || `Start ${k + 1}`,
          stage: oneOf(s.stage, Object.keys(STAGES) as Stage[], "expected"),
          band: str(s.band, 40),
          week: int(s.week, 0, Math.max(0, W - 1)),
          order: int(s.order, k + 1, 99),
          services: arr(s.services)
            .slice(0, 6)
            .map((y, j) => {
              const v = obj(y);
              return {
                id: id(v.id, `v${j + 1}`),
                service: str(v.service, 60),
                capability: str(v.capability, 60),
                area: str(v.area, 60),
                window: str(v.window, 40),
                slotsPerWeek: num(v.slotsPerWeek),
                ...(str(v.preference) ? { preference: str(v.preference) } : {}),
              };
            }),
          unknowns: arr(s.unknowns)
            .map((u) => str(u, 160))
            .filter(Boolean)
            .slice(0, 6),
          ...(str(s.note, 300) ? { note: str(s.note, 300) } : {}),
        };
      }),
    supply: arr(o.supply)
      .slice(0, 40)
      .map((x, k) => {
        const p = obj(x);
        return {
          id: id(p.id, `p${k + 1}`),
          supplier: str(p.supplier, 60),
          service: str(p.service, 60),
          capability: str(p.capability, 60),
          area: str(p.area, 60),
          window: str(p.window, 40),
          weeks: arr(p.weeks).filter((w): w is number => typeof w === "number" && Number.isInteger(w) && w >= 0 && w < W),
          slots: num(p.slots),
          status: oneOf(p.status, Object.keys(SUPPLY_STATUS) as SupplyStatus[], "unknown"),
          verifiedOn: typeof p.verifiedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.verifiedOn) ? p.verifiedOn : "",
        };
      }),
  };
}

/** The headline a saved scenario keeps: the state and counts, never a participant. */
export const snapshotOf = (r: IntakeResult) => ({
  state: r.state,
  proposed: r.proposed,
  supported: r.supported,
  constrained: r.constrained,
  confirm: r.confirm,
  tightest: r.tightest + 1,
  tightestHeadroom: r.weeks[r.tightest]?.headroom ?? 0,
  serviceGaps: r.services.filter((c) => c.state !== "covered").length,
});
