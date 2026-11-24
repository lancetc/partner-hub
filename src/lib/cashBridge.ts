import { blendedHours, hoursPerFte, type HiringInputs } from "./hiringModel";

/*
  The 90-Day Cash Bridge model ("Can we fund the next 90 days?", docs/cash-bridge.md): a deterministic, versioned
  dated ledger for a partner business's operating cash. Pure: no UI, no AI, no I/O. The fictional story and the
  private "Plan my next 90 days" both go through `calculate`.

  - Dates are local calendar dates in the business's own calendar (Australia/Brisbane), written YYYY-MM-DD. The
    window is the start date and the following 89 dates. Arithmetic runs on UTC midnights, so no clock, server
    timezone or daylight saving can move a date.
  - Money is whole cents inside. Dollars come in from the page or the case, are turned into cents once, and are
    turned back only for display and the workbook.
  - Opening cash is the bank balance at the start of the start date. Every event moves cash only on its own date:
    net[d] = receipts[d] − outflows[d]; cumulative[d] = Σ net to d; closing[d] = opening + cumulative[d].
  - The low point is min(opening, every closing), on the earliest date it happens (the start date, if it's the
    opening instant). required = reserve + max(0, −min(0, every cumulative)); additional = max(0, required − opening).
    End-of-day balances assume a day's receipts settle before its outflows. A conservative intraday check (outflows
    first) is calculated beside it and labelled separately, never mixed in.
  - The weekly view is 13 display buckets of seven dates (the last one six). The low point always comes from the
    dated ledger, never from an end-of-week value.

  What the model refuses to do:
  - A referral, an enquiry or a client waiting for a funding allocation never makes a receipt. Partner fees come
    only from the business's own agreement (or the case's labelled fictional one), for participants who meet its
    earning condition, on the date the agreement pays. Income earned is a separate learning line until it's paid.
  - Public Support at Home funding and the care-management allocation have no field: they are never income here.
  - Existing receivables are entered once, for months before the window. A receivable for a month the agreement
    also generates is an error, not a second receipt. A loaded payroll cost and its components can't both be entered.
  - An uncommitted credit limit is never cash. Financing (a draw, its fees and interest, its repayment) enters the
    ledger only when the scenario selects it and every part has a date and an amount, and it's shown apart.
  - Scenarios move only what's marked uncertain (a receipt's settlement date, a start that hasn't happened, an
    uncommitted hire, a discretionary purchase). Moving a hire never makes a fee. Staging something that supports
    agreed service is shown as a conflict, not a saving.
  - Blank, unknown and zero are three things: a blank is an error (the page keeps the last valid result), "unknown"
    is kept out of the arithmetic and named as an unresolved question, and zero is zero.
*/

export const MODEL_VERSION = "cash-bridge-1";
export const DEFINITIONS_VERSION = "cash-definitions-1";
export const WINDOW_DAYS = 90;
export const BUCKET_DAYS = 7;
export const TIMEZONE = "Australia/Brisbane";

// ---------------------------------------------------------------------------------------------
// Dates and money
// ---------------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const DAY = 86_400_000;
const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromMs = (t: number) => new Date(t).toISOString().slice(0, 10);
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && fromMs(ms(v)) === v;
export const isMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v) && Number(v.slice(5, 7)) >= 1 && Number(v.slice(5, 7)) <= 12;
export const addDays = (d: string, n: number) => fromMs(ms(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
/** 0 is Sunday. */
export const weekday = (d: string) => new Date(ms(d)).getUTCDay();
export const monthOf = (d: string) => d.slice(0, 7);
export const addMonths = (m: string, n: number) => fromMs(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
export const monthEnd = (m: string) => fromMs(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0));
export const lastWeekday = (m: string) => {
  let d = monthEnd(m);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
};
export const windowEnd = (start: string) => addDays(start, WINDOW_DAYS - 1);
/** Today's date in the business's calendar. Called from an event handler or the server, never while drawing. */
export const brisbaneDate = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

// Written out rather than from the runtime's locale data, so the server, the page and the workbook always agree.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (d: string) => ({ w: WEEKDAYS[weekday(d)], day: Number(d.slice(8, 10)), m: MONTHS[Number(d.slice(5, 7)) - 1], y: d.slice(0, 4) });
/** "Thu 28 Jan" */
export const dateLabel = (d: string) => {
  if (!isDate(d)) return "no date";
  const p = parts(d);
  return `${p.w.slice(0, 3)} ${p.day} ${p.m.slice(0, 3)}`;
};
/** "Thursday 28 January 2027" */
export const longDate = (d: string) => {
  if (!isDate(d)) return "no date";
  const p = parts(d);
  return `${p.w} ${p.day} ${p.m} ${p.y}`;
};
/** "January 2027" */
export const monthLabel = (m: string) => (isMonth(m) ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : m);

/** Dollars to whole cents, once. */
export const toCents = (dollars: number) => Math.round(dollars * 100);
/** "$12,000", "$1,414.29", "−$100". */
export const money = (c: number) => {
  const a = Math.abs(c);
  const s =
    a % 100 === 0
      ? (a / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })
      : (a / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${c < 0 ? "−" : ""}$${s}`;
};
/** Cents to dollars for the workbook (a number Excel can sum). */
export const dollars = (c: number) => c / 100;

// ---------------------------------------------------------------------------------------------
// Definitions (cash-definitions-1)
// ---------------------------------------------------------------------------------------------

export type Num = number | null;
/** A dollar amount: a number, blank (null: an error) or "unknown" (kept out of the arithmetic and named). */
export type Amount = number | null | "unknown";

export const SOURCES = {
  fictional: "Fictional example",
  estimate: "Entered estimate",
  verified: "Verified actual",
  imported: "Imported from an approved business-scoped source",
  unknown: "Unknown",
} as const;
export type Source = keyof typeof SOURCES;
export const SOURCE_ORDER = Object.keys(SOURCES) as Source[];

export const STATUSES = { actual: "Actual", committed: "Contracted or committed", projected: "Projected" } as const;
export type Status = keyof typeof STATUSES;
export const STATUS_ORDER = Object.keys(STATUSES) as Status[];
/** Status in a shape as well as a word, so colour is never the only signal. */
export const STATUS_MARK: Record<Status, string> = { actual: "●", committed: "◆", projected: "○" };

export const CATEGORIES = {
  receivable: { dir: "in", label: "Existing amount due", hint: "Fees already earned for months before the window, on the date they're due. Entered once." },
  fee: { dir: "in", label: "Partner fee remittance", hint: "Paid under the business's own agreement for participants who met its earning condition." },
  otherIncome: { dir: "in", label: "Other business income", hint: "Income from another line of business, on its settlement date." },
  draw: {
    dir: "in",
    label: "Credit drawn (financing)",
    hint: "Borrowed money, shown apart from operating receipts. Only with its fees, interest and repayment.",
  },
  wages: { dir: "out", label: "Gross pay", hint: "Pay on the actual pay date. Tax withheld is set aside from the operating account that day." },
  super: { dir: "out", label: "Superannuation", hint: "On the date the business pays it, as an amount the business supplies." },
  onCosts: { dir: "out", label: "Other employer on-costs", hint: "Workers’ compensation and similar, on their due dates." },
  loaded: { dir: "out", label: "Loaded payroll", hint: "Pay, super and on-costs as one figure. Never as well as its components." },
  setup: { dir: "out", label: "One-off setup", hint: "Recruitment, induction, training, equipment, supervision." },
  cover: { dir: "out", label: "Temporary cover", hint: "Interim coordination cover while a hire is found or ramps up." },
  supplier: { dir: "out", label: "Supplier or contractor", hint: "Only where the partner business itself pays it." },
  overhead: { dir: "out", label: "Overheads", hint: "Office, software, insurance, travel." },
  marketing: { dir: "out", label: "Marketing", hint: "" },
  owner: { dir: "out", label: "Owner drawings", hint: "What the owner takes out, on the date they take it." },
  tax: { dir: "out", label: "GST, PAYG or income tax", hint: "Amounts and dates the business supplies, or a marked omission." },
  loan: { dir: "out", label: "Existing loan repayment", hint: "" },
  repayment: { dir: "out", label: "Credit repaid (financing)", hint: "" },
  financeCost: { dir: "out", label: "Credit fees and interest (financing)", hint: "" },
  other: { dir: "out", label: "Other payment", hint: "" },
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];
export const FINANCING: readonly Category[] = ["draw", "repayment", "financeCost"];
export const isIn = (c: Category) => CATEGORIES[c].dir === "in";

export const CERTAINTY = {
  enquiry: "Enquiry: no agreement",
  allocation: "Approved, waiting for a funding allocation",
  agreement: "Agreement signed: planned start",
  commenced: "Commenced: first service delivered",
} as const;
export type Certainty = keyof typeof CERTAINTY;
/** Only these can meet a fee's earning condition. An enquiry or an allocation never makes a receipt. */
export const EARNS: readonly Certainty[] = ["agreement", "commenced"];

export const STATUTORY = {
  super: "Superannuation",
  payg: "PAYG withholding",
  gst: "GST (BAS)",
  incomeTax: "Income tax or instalments",
} as const;
export type StatKey = keyof typeof STATUTORY;
export const STAT_ORDER = Object.keys(STATUTORY) as StatKey[];
export const STAT_ANSWERS = {
  "": "Not answered",
  supplied: "Supplied as dated amounts",
  omitted: "Left out: marked as an omission",
  na: "Doesn’t apply",
} as const;
export type StatAnswer = keyof typeof STAT_ANSWERS;

/** A dated cash event the business (or the case) enters. */
export type CashEvent = {
  id: string;
  /** A generic description: never a person's name. */
  label: string;
  category: Category;
  /** "" when the date isn't known: kept out of the ledger and named. */
  date: string;
  amount: Amount;
  status: Status;
  source: Source;
  /** The date the figure was true, or checked. */
  asOf: string;
  /** A receipt whose settlement date could move: scenario delays apply only to these. */
  uncertain: boolean;
  /** An uncommitted, discretionary outflow: the only kind a scenario may stage to a later date. */
  discretionary: boolean;
  /** Supports agreed participant service: staging it is a conflict, never a saving. */
  essential: boolean;
  /** For a receivable or a fee: the month the work was done (YYYY-MM). */
  serviceMonth: string;
  overdue: boolean;
  note: string;
};

/** The business's agreement terms, from the signed agreement or a verified finance record (or the case's labelled fictional one). */
export type Agreement = {
  label: string;
  /** Per participant who meets the earning condition, per calendar month. "unknown" means no reliable cash requirement. */
  feePerMonth: Amount;
  /** The earning condition: a participant counts for a month if they've commenced and haven't left by its last day. */
  earning: "monthEnd";
  /** Months after the service month that it's paid. */
  lagMonths: Num;
  /** Paid on the last weekday of that month, or on a day of it (1 to 28). */
  payDay: "lastWeekday" | number;
  /** Observed extra days a remittance takes to clear after the scheduled date. */
  clearDays: Num;
  source: Source;
  asOf: string;
};

/** Participants already earning under the agreement at the start date, and the dates any of them are expected to leave. */
export type Caseload = { active: Num; exits: string[]; source: Source };

/** A planned start. Only an agreement or a commencement can earn a fee; never an enquiry or an allocation. */
export type NewClient = { id: string; label: string; certainty: Certainty; start: string; source: Source };

/** A coordinator on the payroll, existing or proposed. Pay is in arrears for the cycle ending on each pay date. */
export type Hire = {
  id: string;
  label: string;
  fte: Num;
  /** First day of work. Before the window for someone already employed. */
  start: string;
  /** Already employed: full capacity from the start of the window, and its date can't be moved. */
  existing: boolean;
  /** A proposed hire that isn't committed yet: the only kind a scenario may move. */
  committed: boolean;
  /** Any one pay date in the business's cycle. */
  payAnchor: string;
  everyDays: 7 | 14;
  basis: "components" | "loaded";
  grossPerPay: Num;
  superPerPay: Num;
  superLagDays: Num;
  onCostPerMonth: Num;
  onCostDay: Num;
  loadedPerPay: Num;
  source: Source;
};

/** A credit limit is shown, never counted as cash. */
export type Credit = { limit: Num; committed: boolean; note: string };

/** Capacity is checked with the Hiring Runway model's own formulas (lib/hiringModel), never a second set. */
export type Capacity = { model: HiringInputs; rampMonths: number };

export type CashInputs = {
  startDate: string;
  asOf: string;
  openingCash: Amount;
  openingSource: Source;
  reserve: Num;
  agreement: Agreement | null;
  caseload: Caseload;
  clients: NewClient[];
  hires: Hire[];
  events: CashEvent[];
  statutory: Record<StatKey, StatAnswer>;
  credit: Credit;
  /** Optional: the capacity guardrail. Left out, the result says capacity isn't checked here. */
  capacity: Capacity | null;
};

/** What a scenario changes. Only items marked uncertain move; anything else is refused and named. */
export type Scenario = {
  /** Receipts (an event id, or "fee-YYYY-MM" for a generated fee) that settle later. */
  delays: { id: string; days: number }[];
  /** Planned starts that slip later. A commenced client can't. */
  slips: { id: string; days: number }[];
  /** Proposed, uncommitted hires on a different start date. */
  hireStarts: { id: string; start: string }[];
  /** Discretionary outflows on a later date. */
  stage: { id: string; date: string }[];
  /** Added outflows, such as temporary cover. */
  extra: CashEvent[];
  /** Coordination hours a month that temporary cover adds to the capacity check. */
  extraHours: number;
  /** Include fully costed financing events. */
  financing: boolean;
  /** Estimates replaced with confirmed figures: only after a deliberate update. A cleared amount is actual; a date the payer has confirmed is committed. */
  actuals: { id: string; date: string; amount: Num; status?: Status }[];
};
export const BASELINE: Scenario = { delays: [], slips: [], hireStarts: [], stage: [], extra: [], extraHours: 0, financing: false, actuals: [] };

/** Merges scenario parts, in order. */
export function mergeScenario(parts: Partial<Scenario>[]): Scenario {
  const out: Scenario = structuredClone(BASELINE);
  for (const p of parts) {
    out.delays.push(...(p.delays ?? []));
    out.slips.push(...(p.slips ?? []));
    out.hireStarts.push(...(p.hireStarts ?? []));
    out.stage.push(...(p.stage ?? []));
    out.extra.push(...(p.extra ?? []));
    out.extraHours += p.extraHours ?? 0;
    out.financing = out.financing || Boolean(p.financing);
    out.actuals.push(...(p.actuals ?? []));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

export function validateInputs(i: CashInputs): InputError[] {
  const out: InputError[] = [];
  const blank = (v: Num | Amount | undefined) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  const need = (v: Num | Amount | undefined, field: string, label: string, max = 10_000_000) => {
    if (blank(v)) out.push({ field, message: `${label} is blank. Enter an amount (0 if there’s none), or mark it unknown where that’s offered.` });
    else if (typeof v === "number" && (v < 0 || v > max)) out.push({ field, message: `${label} must be between 0 and ${max.toLocaleString("en-AU")}.` });
  };
  if (!isDate(i.startDate)) out.push({ field: "startDate", message: "Choose the first date of the 90 days." });
  need(i.openingCash, "openingCash", "Opening bank cash");
  need(i.reserve, "reserve", "The minimum cash reserve");
  if (i.agreement) {
    need(i.agreement.feePerMonth, "agreement.feePerMonth", "The agreement’s fee per participant");
    if (i.agreement.lagMonths === null || !Number.isInteger(i.agreement.lagMonths) || i.agreement.lagMonths < 0 || i.agreement.lagMonths > 6)
      out.push({ field: "agreement.lagMonths", message: "Say how many months after the service month the fee is paid (0 to 6)." });
    if (typeof i.agreement.payDay === "number" && (!Number.isInteger(i.agreement.payDay) || i.agreement.payDay < 1 || i.agreement.payDay > 28))
      out.push({ field: "agreement.payDay", message: "The pay day must be the last weekday or a day from 1 to 28." });
    if (i.agreement.clearDays === null || i.agreement.clearDays < 0 || i.agreement.clearDays > 60)
      out.push({ field: "agreement.clearDays", message: "Enter the observed days a remittance takes to clear (0 if it’s on the day)." });
    need(i.caseload.active, "caseload.active", "Participants earning under the agreement now", 10_000);
  }
  for (const x of i.caseload.exits) if (!isDate(x)) out.push({ field: "caseload.exits", message: "Every expected exit needs a date." });
  for (const c of i.clients)
    if (EARNS.includes(c.certainty) && !isDate(c.start)) out.push({ field: `client.${c.id}`, message: `${c.label || "A start"} needs a start date.` });
  for (const h of i.hires) {
    const f = (k: string) => `hire.${h.id}.${k}`;
    need(h.fte, f("fte"), `${h.label || "A coordinator"}: FTE`, 5);
    if (!isDate(h.start)) out.push({ field: f("start"), message: `${h.label || "A coordinator"} needs a start date.` });
    if (!isDate(h.payAnchor)) out.push({ field: f("payAnchor"), message: `${h.label || "A coordinator"} needs one pay date in the cycle.` });
    if (h.basis === "loaded") {
      need(h.loadedPerPay, f("loadedPerPay"), `${h.label || "A coordinator"}: loaded cost each pay`);
      if ([h.grossPerPay, h.superPerPay, h.onCostPerMonth].some((v) => typeof v === "number" && v > 0))
        out.push({ field: f("basis"), message: `${h.label || "A coordinator"}: enter a loaded cost or its components, not both. They’d be counted twice.` });
    } else {
      need(h.grossPerPay, f("grossPerPay"), `${h.label || "A coordinator"}: gross pay each pay`);
      need(h.superPerPay, f("superPerPay"), `${h.label || "A coordinator"}: super each pay`);
      need(h.onCostPerMonth, f("onCostPerMonth"), `${h.label || "A coordinator"}: other on-costs a month`);
      if (h.superLagDays === null || h.superLagDays < 0 || h.superLagDays > 120)
        out.push({ field: f("superLagDays"), message: `${h.label || "A coordinator"}: days after payday that super is paid (0 to 120).` });
      if (h.onCostDay === null || !Number.isInteger(h.onCostDay) || h.onCostDay < 1 || h.onCostDay > 28)
        out.push({ field: f("onCostDay"), message: `${h.label || "A coordinator"}: the day of the month on-costs are paid (1 to 28).` });
      if (typeof h.loadedPerPay === "number" && h.loadedPerPay > 0)
        out.push({ field: f("basis"), message: `${h.label || "A coordinator"}: enter a loaded cost or its components, not both. They’d be counted twice.` });
    }
  }
  const start = isDate(i.startDate) ? monthOf(i.startDate) : "";
  for (const e of i.events) {
    need(e.amount, `event.${e.id}`, e.label || CATEGORIES[e.category].label);
    if (e.date && !isDate(e.date)) out.push({ field: `event.${e.id}`, message: `${e.label || "An event"}: the date isn’t a real date.` });
    // Existing receivables enter once: never for a month the agreement also pays.
    if (i.agreement && start && (e.category === "receivable" || e.category === "fee") && e.serviceMonth && e.serviceMonth >= start)
      out.push({
        field: `event.${e.id}`,
        message: `${e.label || "A receivable"}: fees for ${monthLabel(e.serviceMonth)} are already calculated from the agreement. Entering them again would count them twice.`,
      });
  }
  const ids = [...i.events.map((e) => e.id), ...i.clients.map((c) => c.id), ...i.hires.map((h) => h.id)];
  if (new Set(ids).size !== ids.length) out.push({ field: "ids", message: "Two items share an id." });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------------------------

/** An event as the ledger counts it: entered, or generated from the agreement or the payroll. */
export type LedgerEvent = Omit<CashEvent, "amount"> & {
  cents: number;
  /** Where it came from: "entered", "agreement", or the hire's id. */
  origin: string;
  /** Moved by the scenario: what it was before. */
  moved: string;
};

export type Day = {
  date: string;
  /** 0 to 12. */
  bucket: number;
  receipts: number;
  outflows: number;
  net: number;
  cumulative: number;
  closing: number;
  /** The conservative intraday check: the balance if every outflow cleared before any receipt. */
  intraday: number;
  events: LedgerEvent[];
};

export type Bucket = {
  index: number;
  from: string;
  to: string;
  days: number;
  receipts: number;
  outflows: number;
  opening: number;
  closing: number;
  low: number;
  lowDate: string;
};

export type CapacityMonth = {
  month: string;
  clients: number;
  starts: number;
  fte: number;
  required: number;
  available: number;
  /** null when there's no available capacity. */
  utilisation: number | null;
  pressure: boolean;
};

export type Limitation = { text: string; material: boolean };

export type CashResult = {
  version: string;
  startDate: string;
  endDate: string;
  opening: number;
  openingKnown: boolean;
  reserve: number;
  days: Day[];
  buckets: Bucket[];
  low: { cents: number; date: string; atOpening: boolean; basis: "actual" | "projected" };
  worstCumulative: number;
  required: number;
  /** null when opening cash is unknown. */
  additional: number | null;
  belowReserve: { days: number; first: string; dates: string[] };
  belowZero: { days: number; first: string };
  /** Labelled separately: the balance if same-day outflows cleared first. */
  intraday: { cents: number; date: string; required: number; risks: { date: string; cents: number }[] };
  drivers: { category: Category; label: string; cents: number; count: number }[];
  unconfirmed: LedgerEvent[];
  payroll: { next: { date: string; cents: number } | null; dates: string[]; setup: LedgerEvent[] };
  statutory: { key: StatKey; label: string; answer: StatAnswer }[];
  /** Earned fees by service month: a learning line, never cash until it's paid. */
  earned: { month: string; count: number; cents: number; paidOn: string; inWindow: boolean }[];
  coverage: Record<"receipts" | "outflows", Record<Status, number>>;
  financing: {
    included: boolean;
    complete: boolean;
    drawn: number;
    repaid: number;
    costs: number;
    outstanding: number;
    limit: number | null;
    limitCommitted: boolean;
  };
  capacity: CapacityMonth[] | null;
  outside: LedgerEvent[];
  unknowns: { id: string; label: string; what: string }[];
  limitations: Limitation[];
  /** False when fee terms, opening cash or a material obligation is unknown: "insufficient information for a reliable cash requirement". */
  reliable: boolean;
  /** Changes a scenario asked for and the model refused (moving a committed item), and conflicts with agreed service. */
  refused: string[];
  conflicts: string[];
};

const entered = (e: CashEvent, cents: number, origin = "entered"): LedgerEvent => {
  const { amount: _drop, ...rest } = e;
  void _drop;
  return { ...rest, cents, origin, moved: "" };
};

/** The scenario applied to the inputs. Anything it may not move is refused and named. */
export function applyScenario(i: CashInputs, sc: Scenario) {
  const x = structuredClone(i);
  const refused: string[] = [];
  const conflicts: string[] = [];
  for (const s of sc.slips) {
    const c = x.clients.find((y) => y.id === s.id);
    if (!c || !isDate(c.start)) continue;
    if (c.certainty === "commenced") refused.push(`${c.label} has already commenced: its start can’t move.`);
    else c.start = addDays(c.start, s.days);
  }
  for (const s of sc.hireStarts) {
    const h = x.hires.find((y) => y.id === s.id);
    if (!h || !isDate(s.start)) continue;
    if (h.existing || h.committed) refused.push(`${h.label} is ${h.existing ? "already employed" : "committed"}: the start date can’t move here.`);
    else h.start = s.start;
  }
  for (const a of sc.actuals) {
    // A planned start confirmed: the first service was delivered (on this date, if it's given).
    const c = x.clients.find((y) => y.id === a.id);
    if (c) {
      if (EARNS.includes(c.certainty) || c.certainty === "allocation") {
        c.certainty = "commenced";
        if (isDate(a.date)) c.start = a.date;
      }
      continue;
    }
    const e = x.events.find((y) => y.id === a.id);
    if (!e) continue;
    if (isDate(a.date)) e.date = a.date;
    if (a.amount !== null) e.amount = a.amount;
    e.status = a.status ?? "actual";
    e.source = e.source === "fictional" ? "fictional" : "verified";
    e.uncertain = e.status !== "actual" && e.uncertain;
  }
  for (const s of sc.stage) {
    const e = x.events.find((y) => y.id === s.id);
    if (!e || !isDate(s.date)) continue;
    if (!e.discretionary || e.status === "actual") refused.push(`${e.label} is committed: it stays on its date.`);
    else {
      if (e.essential) conflicts.push(`${e.label} supports agreed service: moving it needs an alternative in place first.`);
      e.date = s.date;
    }
  }
  x.events.push(...sc.extra.map((e) => ({ ...e })));
  return { inputs: x, refused, conflicts };
}

function feeDate(a: Agreement, month: string) {
  const m = addMonths(month, a.lagMonths ?? 0);
  const d = a.payDay === "lastWeekday" ? lastWeekday(m) : `${m}-${String(a.payDay).padStart(2, "0")}`;
  return addDays(d, a.clearDays ?? 0);
}

/**
  Participants who meet the earning condition for a month: active at its last day. With `planned`, every start with a
  planned date counts, secured or not: workload is planned for them, while cash waits for the earning condition.
*/
function countFor(i: CashInputs, month: string, planned = false) {
  const end = monthEnd(month);
  const starts = i.clients.filter((c) => (planned || EARNS.includes(c.certainty)) && isDate(c.start) && c.start >= i.startDate && c.start <= end).length;
  // A start dated before the window is already in the caseload count.
  const exits = i.caseload.exits.filter((x) => isDate(x) && x >= i.startDate && x <= end).length;
  return Math.max(0, (i.caseload.active ?? 0) + starts - exits);
}

function generate(i: CashInputs) {
  const end = windowEnd(i.startDate);
  const out: LedgerEvent[] = [];
  const earned: CashResult["earned"] = [];
  const a = i.agreement;
  if (a && typeof a.feePerMonth === "number") {
    for (let m = monthOf(i.startDate); m <= monthOf(end); m = addMonths(m, 1)) {
      const count = countFor(i, m);
      const cents = count * toCents(a.feePerMonth);
      const paidOn = feeDate(a, m);
      earned.push({ month: m, count, cents, paidOn, inWindow: paidOn <= end });
      out.push({
        id: `fee-${m}`,
        label: `Partner fees for ${monthLabel(m)} (${count} × ${money(toCents(a.feePerMonth))})`,
        category: "fee",
        date: paidOn,
        cents,
        status: "projected",
        source: a.source,
        asOf: a.asOf,
        uncertain: true,
        discretionary: false,
        essential: false,
        serviceMonth: m,
        overdue: false,
        note: `${a.label}: earned at the end of ${monthLabel(m)}, paid ${a.payDay === "lastWeekday" ? "on the last weekday" : `on day ${a.payDay}`} ${a.lagMonths === 1 ? "of the following month" : `${a.lagMonths} months later`}${a.clearDays ? `, clearing ${a.clearDays} days after` : ""}.`,
        origin: "agreement",
        moved: "",
      });
    }
  }
  for (const h of i.hires) {
    if (!isDate(h.start) || !isDate(h.payAnchor) || h.fte === null) continue;
    const every = h.everyDays;
    const offset = ((daysBetween(h.payAnchor, i.startDate) % every) + every) % every;
    const firstPay = addDays(i.startDate, (every - offset) % every);
    // Pay dates just before the window still count when their super falls inside it.
    const back = Math.ceil((h.superLagDays ?? 0) / every);
    const base = (e: Partial<LedgerEvent>): LedgerEvent => ({
      id: "",
      label: "",
      category: "wages",
      date: "",
      cents: 0,
      status: h.existing || h.committed ? "committed" : "projected",
      source: h.source,
      asOf: "",
      uncertain: false,
      discretionary: false,
      essential: true,
      serviceMonth: "",
      overdue: false,
      note: "",
      origin: h.id,
      moved: "",
      ...e,
    });
    for (let p = addDays(firstPay, -back * every); p <= end; p = addDays(p, every)) {
      const periodStart = addDays(p, 1 - every);
      const worked = Math.max(0, Math.min(every, daysBetween(h.start > periodStart ? h.start : periodStart, p) + 1));
      if (worked <= 0 || h.start > p) continue;
      const share = worked / every;
      const part = worked < every ? ` (${worked} of ${every} days)` : "";
      if (h.basis === "loaded") {
        if (p >= i.startDate)
          out.push(
            base({
              id: `${h.id}-pay-${p}`,
              label: `${h.label}: loaded pay run${part}`,
              category: "loaded",
              date: p,
              cents: Math.round(toCents(h.loadedPerPay ?? 0) * share),
            }),
          );
        continue;
      }
      if (p >= i.startDate)
        out.push(
          base({
            id: `${h.id}-pay-${p}`,
            label: `${h.label}: gross pay${part}`,
            category: "wages",
            date: p,
            cents: Math.round(toCents(h.grossPerPay ?? 0) * share),
          }),
        );
      const s = addDays(p, h.superLagDays ?? 0);
      if (s >= i.startDate)
        out.push(
          base({
            id: `${h.id}-super-${p}`,
            label: `${h.label}: super for the ${dateLabel(p)} pay${part}`,
            category: "super",
            date: s,
            cents: Math.round(toCents(h.superPerPay ?? 0) * share),
          }),
        );
    }
    if (h.basis === "components" && (h.onCostPerMonth ?? 0) > 0)
      for (let m = monthOf(i.startDate); m <= monthOf(end); m = addMonths(m, 1)) {
        const d = `${m}-${String(h.onCostDay ?? 1).padStart(2, "0")}`;
        if (d >= i.startDate && d >= h.start)
          out.push(
            base({ id: `${h.id}-oncost-${m}`, label: `${h.label}: other on-costs`, category: "onCosts", date: d, cents: toCents(h.onCostPerMonth ?? 0) }),
          );
      }
  }
  return { generated: out, earned };
}

function capacityCheck(i: CashInputs, extraHours: number): CapacityMonth[] | null {
  if (!i.capacity || !isDate(i.startDate)) return null;
  const { model, rampMonths } = i.capacity;
  const perFte = hoursPerFte(model);
  const blended = blendedHours(model);
  const out: CapacityMonth[] = [];
  for (let m = monthOf(i.startDate); m <= monthOf(windowEnd(i.startDate)); m = addMonths(m, 1)) {
    const clients = countFor(i, m, true);
    const starts = i.clients.filter((c) => isDate(c.start) && c.start >= i.startDate && monthOf(c.start) === m).length;
    const fte = i.hires.reduce((n, h) => {
      if (!isDate(h.start) || h.fte === null || h.start > monthEnd(m)) return n;
      if (h.existing) return n + h.fte;
      const since = (Number(m.slice(0, 4)) - Number(h.start.slice(0, 4))) * 12 + Number(m.slice(5, 7)) - Number(h.start.slice(5, 7)) + 1;
      return n + h.fte * (rampMonths <= 0 ? 1 : Math.min(1, since / rampMonths));
    }, 0);
    const required = clients * blended + starts * model.onboardingHours + model.reviewHours;
    const available = Math.max(0, perFte * fte + extraHours);
    out.push({
      month: m,
      clients,
      starts,
      fte,
      required,
      available,
      utilisation: available > 0 ? required / available : null,
      pressure: available <= 0 ? required > 0 : required > available * model.threshold,
    });
  }
  return out;
}

const financingParts = (events: CashEvent[]) => {
  const f = events.filter((e) => FINANCING.includes(e.category));
  const has = (c: Category) => f.some((e) => e.category === c && isDate(e.date) && typeof e.amount === "number");
  return { events: f, any: f.length > 0, complete: has("draw") && has("repayment") && has("financeCost") };
};

/**
  The 90-day bridge for these inputs under this scenario. Throws if the inputs don't validate: call `validateInputs`
  first (the page keeps the last valid result while something's blank).
*/
export function calculate(raw: CashInputs, scenario: Scenario = BASELINE): CashResult {
  const errors = validateInputs(raw);
  if (errors.length) throw new Error(errors[0].message);
  const { inputs: i, refused, conflicts } = applyScenario(raw, scenario);
  const start = i.startDate;
  const end = windowEnd(start);
  const limitations: Limitation[] = [];
  const unknowns: CashResult["unknowns"] = [];

  const fin = financingParts(i.events);
  const includeFinancing = scenario.financing && fin.complete;
  if (scenario.financing && !fin.complete)
    limitations.push({
      text: "Financing was selected, but its draw, fees or interest and repayment aren’t all dated and costed, so it isn’t included.",
      material: false,
    });

  const { generated, earned } = generate(i);
  const all: LedgerEvent[] = [];
  for (const e of i.events) {
    if (FINANCING.includes(e.category) && !includeFinancing) continue;
    if (e.amount === "unknown" || e.amount === null) {
      unknowns.push({ id: e.id, label: e.label, what: "amount unknown" });
      continue;
    }
    if (!isDate(e.date)) {
      unknowns.push({ id: e.id, label: e.label, what: "date unknown" });
      continue;
    }
    const was = raw.events.find((y) => y.id === e.id)?.date ?? "";
    all.push({ ...entered(e, toCents(e.amount)), moved: was && was !== e.date ? was : "" });
  }
  all.push(...generated);
  // Settlement delays: only receipts marked uncertain move.
  for (const d of scenario.delays) {
    const e = all.find((x) => x.id === d.id);
    if (!e) continue;
    if (!isIn(e.category) || !e.uncertain || e.status === "actual") refused.push(`${e.label} is confirmed: its date stays.`);
    else {
      e.moved = e.date;
      e.date = addDays(e.date, d.days);
    }
  }
  for (const h of scenario.hireStarts) {
    const before = raw.hires.find((x) => x.id === h.id);
    const after = i.hires.find((x) => x.id === h.id);
    if (before && after && before.start !== after.start) for (const e of all) if (e.origin === h.id) e.moved = `start ${before.start}`;
  }

  const opening = typeof i.openingCash === "number" ? toCents(i.openingCash) : 0;
  const openingKnown = typeof i.openingCash === "number";
  const reserve = toCents(i.reserve ?? 0);
  const inWindow = all.filter((e) => e.date >= start && e.date <= end);
  const outside = all.filter((e) => e.date < start || e.date > end).sort((a, b) => a.date.localeCompare(b.date));

  const days: Day[] = [];
  let cumulative = 0;
  let prevClosing = opening;
  for (let k = 0; k < WINDOW_DAYS; k++) {
    const date = addDays(start, k);
    const events = inWindow.filter((e) => e.date === date).sort((a, b) => Number(isIn(b.category)) - Number(isIn(a.category)) || b.cents - a.cents);
    const receipts = events.filter((e) => isIn(e.category)).reduce((n, e) => n + e.cents, 0);
    const outflows = events.filter((e) => !isIn(e.category)).reduce((n, e) => n + e.cents, 0);
    const net = receipts - outflows;
    cumulative += net;
    const closing = opening + cumulative;
    days.push({ date, bucket: Math.floor(k / BUCKET_DAYS), receipts, outflows, net, cumulative, closing, intraday: prevClosing - outflows, events });
    prevClosing = closing;
  }

  // The low point: the opening instant counts, and the earliest date wins a tie.
  let low = { cents: opening, date: start, atOpening: true };
  for (const d of days) if (d.closing < low.cents) low = { cents: d.closing, date: d.date, atOpening: false };
  const worstCumulative = Math.min(0, ...days.map((d) => d.cumulative));
  const required = reserve + Math.max(0, -worstCumulative);
  const additional = openingKnown ? Math.max(0, required - opening) : null;
  const throughLow = days.filter((d) => d.date <= low.date).flatMap((d) => d.events);
  const basis: "actual" | "projected" = openingKnown && throughLow.every((e) => e.status === "actual") ? "actual" : "projected";

  // The conservative intraday check, labelled separately.
  let intra = { cents: opening, date: start };
  let worstIntra = 0;
  const risks: { date: string; cents: number }[] = [];
  for (const d of days) {
    if (d.intraday < intra.cents) intra = { cents: d.intraday, date: d.date };
    worstIntra = Math.min(worstIntra, d.intraday - opening);
    if (d.receipts > 0 && d.outflows > 0 && d.intraday < reserve && d.intraday < d.closing) risks.push({ date: d.date, cents: d.intraday });
  }

  const below = days.filter((d) => d.closing < reserve);
  const negative = days.filter((d) => d.closing < 0);
  const buckets: Bucket[] = [];
  for (let b = 0; b * BUCKET_DAYS < WINDOW_DAYS; b++) {
    const ds = days.slice(b * BUCKET_DAYS, (b + 1) * BUCKET_DAYS);
    const lowDay = ds.reduce((lo, d) => (d.closing < lo.closing ? d : lo), ds[0]);
    buckets.push({
      index: b,
      from: ds[0].date,
      to: ds[ds.length - 1].date,
      days: ds.length,
      receipts: ds.reduce((n, d) => n + d.receipts, 0),
      outflows: ds.reduce((n, d) => n + d.outflows, 0),
      opening: b === 0 ? opening : days[b * BUCKET_DAYS - 1].closing,
      closing: ds[ds.length - 1].closing,
      low: lowDay.closing,
      lowDate: lowDay.date,
    });
  }

  // Why it happens: the largest kinds of payment up to the low date, and the receipts that aren't confirmed.
  const byCat = new Map<Category, { cents: number; count: number }>();
  for (const e of throughLow.filter((x) => !isIn(x.category))) {
    const c = byCat.get(e.category) ?? { cents: 0, count: 0 };
    byCat.set(e.category, { cents: c.cents + e.cents, count: c.count + 1 });
  }
  const drivers = [...byCat.entries()]
    .map(([category, v]) => ({ category, label: CATEGORIES[category].label, ...v }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 3);
  const unconfirmed = inWindow.filter((e) => isIn(e.category) && e.status !== "actual").sort((a, b) => a.date.localeCompare(b.date));

  const pays = inWindow.filter((e) => e.category === "wages" || e.category === "loaded");
  const payDates = [...new Set(pays.map((e) => e.date))].sort();
  const next = payDates[0] ? { date: payDates[0], cents: pays.filter((e) => e.date === payDates[0]).reduce((n, e) => n + e.cents, 0) } : null;

  const coverage: CashResult["coverage"] = {
    receipts: { actual: 0, committed: 0, projected: 0 },
    outflows: { actual: 0, committed: 0, projected: 0 },
  };
  for (const e of inWindow) coverage[isIn(e.category) ? "receipts" : "outflows"][e.status] += e.cents;

  const finIn = inWindow.filter((e) => FINANCING.includes(e.category));
  const sum = (c: Category) => finIn.filter((e) => e.category === c).reduce((n, e) => n + e.cents, 0);
  const financing = {
    included: includeFinancing,
    complete: fin.complete,
    drawn: sum("draw"),
    repaid: sum("repayment"),
    costs: sum("financeCost"),
    outstanding: Math.max(0, sum("draw") - sum("repayment")),
    limit: i.credit.limit === null ? null : toCents(i.credit.limit),
    limitCommitted: i.credit.committed,
  };

  // What the result can't yet say.
  if (!openingKnown)
    limitations.push({ text: "Opening bank cash is unknown: the required opening cash is shown, but not the gap or the balances.", material: true });
  if (!i.agreement) {
    if (i.clients.some((c) => EARNS.includes(c.certainty)) || (i.caseload.active ?? 0) > 0)
      limitations.push({
        text: "No agreement terms are entered, so no partner fees are forecast. Add the signed agreement’s fee and payment timing.",
        material: true,
      });
  } else if (i.agreement.feePerMonth === "unknown")
    limitations.push({
      text: "The agreement’s fee is unknown, so no partner fees are forecast. Confirm it from the signed agreement or a verified finance record.",
      material: true,
    });
  for (const k of STAT_ORDER) {
    const v = i.statutory[k];
    if (v === "")
      limitations.push({ text: `${STATUTORY[k]}: not answered. Supply the amounts and dates, mark it as left out, or say it doesn’t apply.`, material: true });
    if (v === "omitted") limitations.push({ text: `${STATUTORY[k]} is left out of this forecast (marked).`, material: true });
  }
  for (const u of unknowns) limitations.push({ text: `${u.label || "An item"}: ${u.what}.`, material: true });
  if (i.events.some((e) => e.overdue && isIn(e.category)))
    limitations.push({ text: "An overdue amount is counted on its expected date: confirm it with the payer.", material: false });
  if (outside.some((e) => e.date < start))
    limitations.push({ text: "Some items are dated before the window and aren’t counted. Opening cash should already include them.", material: false });

  return {
    version: MODEL_VERSION,
    startDate: start,
    endDate: end,
    opening,
    openingKnown,
    reserve,
    days,
    buckets,
    low: { ...low, basis },
    worstCumulative,
    required,
    additional,
    belowReserve: { days: below.length, first: below[0]?.date ?? "", dates: below.map((d) => d.date) },
    belowZero: { days: negative.length, first: negative[0]?.date ?? "" },
    intraday: { ...intra, required: reserve + Math.max(0, -worstIntra), risks },
    drivers,
    unconfirmed,
    payroll: { next, dates: payDates, setup: inWindow.filter((e) => e.category === "setup") },
    statutory: STAT_ORDER.map((key) => ({ key, label: STATUTORY[key], answer: i.statutory[key] })),
    earned,
    coverage,
    financing,
    capacity: capacityCheck(i, scenario.extraHours),
    outside,
    unknowns,
    limitations,
    reliable: !limitations.some((l) => l.material),
    refused,
    conflicts,
  };
}

/** The result, or null while something's blank. */
export const safeCalculate = (i: CashInputs, sc: Scenario = BASELINE) => (validateInputs(i).length ? null : calculate(i, sc));

/** The receipts whose settlement date matters most: a 14-day delay that would take the balance lowest. */
export function sensitiveReceipts(i: CashInputs, sc: Scenario = BASELINE, days = 14) {
  const r = calculate(i, sc);
  const out: { id: string; label: string; date: string; low: number; lowDate: string; belowZero: number }[] = [];
  for (const e of r.days.flatMap((d) => d.events).filter((x) => isIn(x.category) && x.uncertain && x.status !== "actual")) {
    const x = calculate(i, mergeScenario([sc, { delays: [{ id: e.id, days }] }]));
    out.push({ id: e.id, label: e.label, date: e.date, low: x.low.cents, lowDate: x.low.date, belowZero: x.belowZero.days });
  }
  return out.sort((a, b) => a.low - b.low).slice(0, 3);
}

// ---------------------------------------------------------------------------------------------
// Reading the result: the chart's marks and the dated table agree because they read the same days
// ---------------------------------------------------------------------------------------------

/** The rows of the accessible dated table: every date with an event, every date below the reserve, and the low date. */
export const tableDays = (r: CashResult) => r.days.filter((d) => d.events.length || d.closing < r.reserve || d.date === r.low.date);
/** Where the chart puts the low marker: the same date the table marks. */
export const chartLow = (r: CashResult) => ({ date: r.low.date, bucket: r.days.find((d) => d.date === r.low.date)?.bucket ?? 0, cents: r.low.cents });

export type Comparison = {
  id: string;
  label: string;
  changed: string[];
  low: number;
  lowDate: string;
  required: number;
  additional: number | null;
  belowReserve: number;
  belowZero: number;
  pressureMonths: number;
  intraday: number;
};
export function compare(i: CashInputs, cases: { id: string; label: string; changed: string[]; scenario: Scenario }[]): Comparison[] {
  return cases.map((c) => {
    const r = calculate(i, c.scenario);
    return {
      id: c.id,
      label: c.label,
      changed: c.changed,
      low: r.low.cents,
      lowDate: r.low.date,
      required: r.required,
      additional: r.additional,
      belowReserve: r.belowReserve.days,
      belowZero: r.belowZero.days,
      pressureMonths: r.capacity?.filter((m) => m.pressure).length ?? 0,
      intraday: r.intraday.cents,
    };
  });
}

export type NamedCase = { id: string; label: string; changed: string[]; scenario: Scenario };

/**
  A private plan's comparison: the baseline, its largest expected receipt 14 days later, and its first planned start
  four weeks later. Named, never labelled "likely".
*/
export function standardCases(i: CashInputs): NamedCase[] {
  const cases: NamedCase[] = [{ id: "baseline", label: "Baseline: receipts on time", changed: [], scenario: BASELINE }];
  if (validateInputs(i).length) return cases;
  const receipts = calculate(i)
    .days.flatMap((d) => d.events)
    .filter((e) => e.uncertain && e.status !== "actual" && (e.category === "fee" || e.category === "receivable" || e.category === "otherIncome"));
  const biggest = [...receipts].sort((a, b) => b.cents - a.cents || a.date.localeCompare(b.date))[0];
  const firstStart = i.clients.filter((c) => c.certainty === "agreement" && isDate(c.start)).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (biggest)
    cases.push({
      id: "late-receipt",
      label: "The largest expected receipt 14 days later",
      changed: [`${biggest.label}: ${dateLabel(biggest.date)} → ${dateLabel(addDays(biggest.date, 14))}`],
      scenario: mergeScenario([{ delays: [{ id: biggest.id, days: 14 }] }]),
    });
  if (firstStart)
    cases.push({
      id: "late-start",
      label: "The first planned start four weeks later",
      changed: [`${firstStart.label}: ${dateLabel(firstStart.start)} → ${dateLabel(addDays(firstStart.start, 28))}`],
      scenario: mergeScenario([{ slips: [{ id: firstStart.id, days: 28 }] }]),
    });
  return cases;
}

/** "What changed?" between two results, in words. */
export function resultChanges(a: CashResult, b: CashResult): string[] {
  const out: string[] = [];
  if (a.low.cents !== b.low.cents || a.low.date !== b.low.date)
    out.push(`Lowest cash: ${money(a.low.cents)} on ${dateLabel(a.low.date)} → ${money(b.low.cents)} on ${dateLabel(b.low.date)}`);
  if (a.required !== b.required) out.push(`Opening cash needed: ${money(a.required)} → ${money(b.required)}`);
  if (a.additional !== b.additional && a.additional !== null && b.additional !== null)
    out.push(`Additional gap: ${money(a.additional)} → ${money(b.additional)}`);
  if (a.belowReserve.days !== b.belowReserve.days) out.push(`Days below the reserve: ${a.belowReserve.days} → ${b.belowReserve.days}`);
  if (a.belowZero.days !== b.belowZero.days) out.push(`Days below zero: ${a.belowZero.days} → ${b.belowZero.days}`);
  const pa = a.capacity?.filter((m) => m.pressure).length ?? 0;
  const pb = b.capacity?.filter((m) => m.pressure).length ?? 0;
  if (pa !== pb) out.push(`Months over the capacity threshold: ${pa} → ${pb}`);
  return out;
}

/** "What changed since last time?": a saved plan's return visit. */
export function planChanges(a: CashInputs, ra: CashResult | null, b: CashInputs, rb: CashResult | null): string[] {
  const out: string[] = [];
  if (a.startDate !== b.startDate) out.push(`Start date: ${dateLabel(a.startDate)} → ${dateLabel(b.startDate)}`);
  const starts = (x: CashInputs) => x.clients.map((c) => `${c.label} ${c.certainty === "commenced" ? "commenced" : c.start || "no date"}`).join("; ");
  if (starts(a) !== starts(b)) out.push(`Client starts: ${starts(a) || "none"} → ${starts(b) || "none"}`);
  const hires = (x: CashInputs) => x.hires.map((h) => `${h.label} from ${h.start || "no date"}`).join("; ");
  if (hires(a) !== hires(b)) out.push(`Coordinators: ${hires(a) || "none"} → ${hires(b) || "none"}`);
  if (ra && rb) {
    if (ra.payroll.next?.date !== rb.payroll.next?.date)
      out.push(`Next pay date: ${ra.payroll.next ? dateLabel(ra.payroll.next.date) : "none"} → ${rb.payroll.next ? dateLabel(rb.payroll.next.date) : "none"}`);
    const sumIn = (r: CashResult) => r.days.reduce((n, d) => n + d.receipts, 0);
    const sumOut = (r: CashResult) => r.days.reduce((n, d) => n + d.outflows, 0);
    if (sumIn(ra) !== sumIn(rb)) out.push(`Receipts in the window: ${money(sumIn(ra))} → ${money(sumIn(rb))}`);
    if (sumOut(ra) !== sumOut(rb)) out.push(`Outflows in the window: ${money(sumOut(ra))} → ${money(sumOut(rb))}`);
    out.push(...resultChanges(ra, rb));
  } else if (!ra !== !rb) out.push(rb ? "The plan is now complete enough to calculate." : "The plan has blanks now, so it can’t be calculated.");
  return out;
}

/** A compact snapshot kept with a saved version, so a later visit can compare without recalculating old models. */
export function snapshotOf(r: CashResult) {
  return {
    model: r.version,
    startDate: r.startDate,
    low: r.low.cents,
    lowDate: r.low.date,
    required: r.required,
    additional: r.additional,
    belowReserve: r.belowReserve.days,
    belowZero: r.belowZero.days,
    nextPay: r.payroll.next,
    reliable: r.reliable,
    receiptsActual: r.coverage.receipts.actual,
    receiptsProjected: r.coverage.receipts.projected + r.coverage.receipts.committed,
  };
}
export type Snapshot = ReturnType<typeof snapshotOf>;

// ---------------------------------------------------------------------------------------------
// Reading stored or posted inputs
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 160) => (typeof v === "string" ? v.slice(0, max) : "");
const ID = /^[a-zA-Z0-9-]{1,40}$/;
const idOf = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const num = (v: unknown, max = 10_000_000): Num => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null);
const amount = (v: unknown): Amount => (v === "unknown" ? "unknown" : num(v));
const date = (v: unknown) => (isDate(v) ? v : "");
const pick = <T extends string>(v: unknown, keys: readonly T[], d: T): T => (typeof v === "string" && (keys as readonly string[]).includes(v) ? (v as T) : d);

export function cleanEvent(v: unknown, k: number): CashEvent {
  const e = obj(v);
  return {
    id: idOf(e.id, `e${k + 1}`),
    label: text(e.label, 120),
    category: pick(e.category, CATEGORY_ORDER, "other"),
    date: date(e.date),
    amount: amount(e.amount),
    status: pick(e.status, STATUS_ORDER, "projected"),
    source: pick(e.source, SOURCE_ORDER, "estimate"),
    asOf: date(e.asOf),
    uncertain: e.uncertain === true,
    discretionary: e.discretionary === true,
    essential: e.essential === true,
    serviceMonth: isMonth(e.serviceMonth) ? e.serviceMonth : "",
    overdue: e.overdue === true,
    note: text(e.note, 300),
  };
}

export function cleanHire(v: unknown, k: number): Hire {
  const h = obj(v);
  return {
    id: idOf(h.id, `h${k + 1}`),
    label: text(h.label, 60),
    fte: num(h.fte, 5),
    start: date(h.start),
    existing: h.existing === true,
    committed: h.committed === true,
    payAnchor: date(h.payAnchor),
    everyDays: h.everyDays === 7 ? 7 : 14,
    basis: h.basis === "loaded" ? "loaded" : "components",
    grossPerPay: num(h.grossPerPay),
    superPerPay: num(h.superPerPay),
    superLagDays: num(h.superLagDays, 120),
    onCostPerMonth: num(h.onCostPerMonth),
    onCostDay: num(h.onCostDay, 28),
    loadedPerPay: num(h.loadedPerPay),
    source: pick(h.source, SOURCE_ORDER, "estimate"),
  };
}

export function cleanScenario(v: unknown): Scenario {
  const s = obj(v);
  const moves = (x: unknown) =>
    arr(x)
      .slice(0, 20)
      .map((y) => ({ id: idOf(obj(y).id, ""), days: Math.max(0, Math.min(120, Math.round(Number(obj(y).days) || 0))) }))
      .filter((y) => y.id);
  return {
    delays: moves(s.delays),
    slips: moves(s.slips),
    hireStarts: arr(s.hireStarts)
      .slice(0, 10)
      .map((y) => ({ id: idOf(obj(y).id, ""), start: date(obj(y).start) }))
      .filter((y) => y.id && y.start),
    stage: arr(s.stage)
      .slice(0, 20)
      .map((y) => ({ id: idOf(obj(y).id, ""), date: date(obj(y).date) }))
      .filter((y) => y.id && y.date),
    extra: arr(s.extra).slice(0, 20).map(cleanEvent),
    extraHours: num(s.extraHours, 1000) ?? 0,
    financing: s.financing === true,
    actuals: arr(s.actuals)
      .slice(0, 20)
      .map((y) => ({
        id: idOf(obj(y).id, ""),
        date: date(obj(y).date),
        amount: num(obj(y).amount),
        ...(obj(y).status === "committed" ? { status: "committed" as const } : {}),
      }))
      .filter((y) => y.id),
  };
}

/** Inputs from stored or posted JSON: unknown fields are dropped, numbers clamped, blanks kept as blanks. */
export function cleanInputs(v: unknown): CashInputs {
  const o = obj(v);
  const a = o.agreement && typeof o.agreement === "object" ? obj(o.agreement) : null;
  const cl = obj(o.caseload);
  const st = obj(o.statutory);
  const cr = obj(o.credit);
  const cap = o.capacity && typeof o.capacity === "object" ? obj(o.capacity) : null;
  const model = cap ? (obj(cap.model) as unknown as HiringInputs) : null;
  return {
    startDate: date(o.startDate),
    asOf: date(o.asOf),
    openingCash: amount(o.openingCash),
    openingSource: pick(o.openingSource, SOURCE_ORDER, "estimate"),
    reserve: num(o.reserve),
    agreement: a
      ? {
          label: text(a.label, 120),
          feePerMonth: amount(a.feePerMonth),
          earning: "monthEnd",
          lagMonths: num(a.lagMonths, 6),
          payDay: a.payDay === "lastWeekday" ? "lastWeekday" : (num(a.payDay, 28) ?? "lastWeekday"),
          clearDays: num(a.clearDays, 60),
          source: pick(a.source, SOURCE_ORDER, "estimate"),
          asOf: date(a.asOf),
        }
      : null,
    caseload: { active: num(cl.active, 10_000), exits: arr(cl.exits).filter(isDate).slice(0, 60), source: pick(cl.source, SOURCE_ORDER, "estimate") },
    clients: arr(o.clients)
      .slice(0, 40)
      .map((x, k) => {
        const c = obj(x);
        return {
          id: idOf(c.id, `c${k + 1}`),
          label: text(c.label, 40),
          certainty: pick(c.certainty, Object.keys(CERTAINTY) as Certainty[], "enquiry"),
          start: date(c.start),
          source: pick(c.source, SOURCE_ORDER, "estimate"),
        };
      }),
    hires: arr(o.hires).slice(0, 10).map(cleanHire),
    events: arr(o.events).slice(0, 200).map(cleanEvent),
    statutory: Object.fromEntries(STAT_ORDER.map((k) => [k, pick(st[k], Object.keys(STAT_ANSWERS) as StatAnswer[], "")])) as Record<StatKey, StatAnswer>,
    credit: { limit: num(cr.limit), committed: cr.committed === true, note: text(cr.note, 200) },
    capacity:
      cap && model && typeof model.paidWeeklyHours === "number" && model.bands
        ? { model, rampMonths: Math.max(0, Math.min(12, Math.round(Number(cap.rampMonths) || 0))) }
        : null,
  };
}

/** A blank plan for "Plan my next 90 days": nothing filled in from a case or another business. */
export const blankInputs = (startDate: string): CashInputs => ({
  startDate,
  asOf: startDate,
  openingCash: null,
  openingSource: "estimate",
  reserve: null,
  agreement: {
    label: "My signed partner agreement",
    feePerMonth: null,
    earning: "monthEnd",
    lagMonths: null,
    payDay: "lastWeekday",
    clearDays: null,
    source: "estimate",
    asOf: "",
  },
  caseload: { active: null, exits: [], source: "estimate" },
  clients: [],
  hires: [],
  events: [],
  statutory: { super: "", payg: "", gst: "", incomeTax: "" },
  credit: { limit: null, committed: false, note: "" },
  capacity: null,
});

export const blankEvent = (id: string, category: Category = "overhead"): CashEvent => ({
  id,
  label: "",
  category,
  date: "",
  amount: null,
  status: "projected",
  source: "estimate",
  asOf: "",
  uncertain: isIn(category),
  discretionary: false,
  essential: false,
  serviceMonth: "",
  overdue: false,
  note: "",
});

export const blankHire = (id: string, label: string): Hire => ({
  id,
  label,
  fte: null,
  start: "",
  existing: false,
  committed: false,
  payAnchor: "",
  everyDays: 14,
  basis: "components",
  grossPerPay: null,
  superPerPay: null,
  superLagDays: null,
  onCostPerMonth: null,
  onCostDay: null,
  loadedPerPay: null,
  source: "estimate",
});

// ---------------------------------------------------------------------------------------------
// The workbook (written by server/xlsx): values, never formulas, every one documented
// ---------------------------------------------------------------------------------------------

export type SheetData = { name: string; header: string[]; rows: (string | number)[][]; widths?: number[] };
export type WorkbookMeta = { kind: "fictional" | "private"; name: string; generatedAt: string; version: number | null; scenarioLabel: string };

const PRIVATE_LABEL = "PRIVATE BUSINESS PLAN: commercially sensitive. For the business owner and the people they have authorised.";
const FICTIONAL_LABEL = "FICTIONAL EXAMPLE: every person, business and figure is invented for practice.";

/**
  The workbook's sheets: Assumptions, Dated receipts, Dated outflows, Daily balance, Weekly view, Scenario comparison,
  and Definitions and data sources. Built from the same `calculate` the page uses, so its low date and required opening
  cash are the page's.
*/
export function workbookSheets(
  i: CashInputs,
  scenario: Scenario,
  cases: { id: string; label: string; changed: string[]; scenario: Scenario }[],
  meta: WorkbookMeta,
): SheetData[] {
  const r = calculate(i, scenario);
  const label = meta.kind === "fictional" ? FICTIONAL_LABEL : PRIVATE_LABEL;
  const d = dollars;
  const omitted = STAT_ORDER.filter((k) => i.statutory[k] === "omitted" || i.statutory[k] === "").map((k) => STATUTORY[k]);
  const a = i.agreement;
  const assumptions: (string | number)[][] = [
    ["Label", label],
    ["Plan", meta.name],
    ["Saved version", meta.version === null ? "Unsaved" : meta.version],
    ["Scenario shown", meta.scenarioLabel],
    ["Created", meta.generatedAt],
    ["Calendar", `${TIMEZONE} local dates`],
    ["Model", MODEL_VERSION],
    ["Window", `${longDate(r.startDate)} to ${longDate(r.endDate)} (${WINDOW_DAYS} dates)`],
    ["Opening bank cash (start of the first date)", r.openingKnown ? d(r.opening) : "Unknown"],
    ["Opening cash source", SOURCES[i.openingSource]],
    ["Minimum cash reserve", d(r.reserve)],
    [
      "Agreement",
      a
        ? `${a.label}: ${typeof a.feePerMonth === "number" ? `$${a.feePerMonth} a participant a month` : "fee unknown"}, earned at month-end, paid ${a.payDay === "lastWeekday" ? "on the last weekday" : `on day ${a.payDay}`} ${a.lagMonths} month(s) later, clearing ${a.clearDays ?? 0} day(s) after (${SOURCES[a.source]})`
        : "None entered: no partner fees forecast",
    ],
    ["Participants earning now", i.caseload.active ?? "Blank"],
    ["Expected exits", i.caseload.exits.join(", ") || "None"],
    ...i.clients.map((c) => [
      `Planned start: ${c.label}`,
      `${CERTAINTY[c.certainty]}${c.start ? `, ${c.start}` : ""}${EARNS.includes(c.certainty) ? "" : " (no receipt)"}`,
    ]),
    ...i.hires.map((h) => [
      `Coordinator: ${h.label}`,
      `${h.fte} FTE from ${h.start}, paid every ${h.everyDays} days (${
        h.basis === "loaded"
          ? `loaded $${h.loadedPerPay} a pay`
          : `gross $${h.grossPerPay} a pay, super $${h.superPerPay} ${h.superLagDays} days later, on-costs $${h.onCostPerMonth} a month`
      })`,
    ]),
    ...STAT_ORDER.map((k) => [`Statutory: ${STATUTORY[k]}`, STAT_ANSWERS[i.statutory[k]]]),
    ["Omitted categories", omitted.join(", ") || "None"],
    [
      "Credit limit (never counted as cash)",
      i.credit.limit === null ? "None" : `$${i.credit.limit}${i.credit.committed ? " (committed)" : " (not committed)"}`,
    ],
    ["Result: lowest end-of-day cash", r.openingKnown ? d(r.low.cents) : "Unknown"],
    ["Result: low date", r.low.date],
    ["Result: lowest cumulative change", d(r.worstCumulative)],
    ["Result: opening cash needed to keep the reserve", d(r.required)],
    ["Result: additional cash needed", r.additional === null ? "Unknown" : d(r.additional)],
    ["Result: days below the reserve", r.belowReserve.days],
    ["Result: days below zero", r.belowZero.days],
    ["Conservative intraday check (labelled separately): lowest", d(r.intraday.cents)],
    ["Conservative intraday check: date", r.intraday.date],
    ["Conservative intraday check: opening cash needed", d(r.intraday.required)],
    ["Reliable", r.reliable ? "Yes" : "No: insufficient information for a reliable cash requirement"],
    ...r.limitations.map((l) => ["Limitation", l.text]),
    ...r.refused.map((x) => ["Not moved", x]),
    ...r.conflicts.map((x) => ["Conflict with agreed service", x]),
  ];
  const rows = (dir: "in" | "out") =>
    [...r.days.flatMap((x) => x.events), ...r.outside]
      .filter((e) => CATEGORIES[e.category].dir === dir)
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((e) => [
        e.date,
        e.date >= r.startDate && e.date <= r.endDate
          ? "In the window"
          : e.date < r.startDate
            ? "Before the window (not counted)"
            : "After the window (not counted)",
        e.label,
        CATEGORIES[e.category].label,
        d(e.cents),
        STATUSES[e.status],
        SOURCES[e.source],
        e.asOf,
        e.serviceMonth,
        e.moved,
      ]);
  const moneyHeader = ["Date", "In the window?", "Item", "Category", "Amount ($)", "Status", "Source", "As of", "Service month", "Moved from"];
  const moneyWidths = [12, 18, 50, 28, 12, 20, 24, 12, 12, 14];
  return [
    { name: "Assumptions", header: ["Item", "Value"], widths: [50, 110], rows: assumptions },
    { name: "Dated receipts", header: moneyHeader, widths: moneyWidths, rows: rows("in") },
    { name: "Dated outflows", header: moneyHeader, widths: moneyWidths, rows: rows("out") },
    {
      name: "Daily balance",
      header: [
        "Date",
        "Week",
        "Receipts ($)",
        "Outflows ($)",
        "Net ($)",
        "Cumulative ($)",
        "Closing ($)",
        "Intraday check ($)",
        "Below reserve",
        "Below zero",
        "Low date",
      ],
      widths: [12, 8, 12, 12, 12, 14, 12, 16, 14, 12, 10],
      rows: r.days.map((x) => [
        x.date,
        x.bucket + 1,
        d(x.receipts),
        d(x.outflows),
        d(x.net),
        d(x.cumulative),
        d(x.closing),
        d(x.intraday),
        x.closing < r.reserve ? "Yes" : "No",
        x.closing < 0 ? "Yes" : "No",
        x.date === r.low.date ? "LOW" : "",
      ]),
    },
    {
      name: "Weekly view",
      header: ["Week", "From", "To", "Dates", "Receipts ($)", "Outflows ($)", "End-of-week cash ($)", "Lowest in the week ($)", "On"],
      rows: r.buckets.map((b) => [b.index + 1, b.from, b.to, b.days, d(b.receipts), d(b.outflows), d(b.closing), d(b.low), b.lowDate]),
    },
    {
      name: "Scenario comparison",
      header: [
        "Case",
        "What changed",
        "Lowest cash ($)",
        "On",
        "Opening cash needed ($)",
        "Additional ($)",
        "Days below reserve",
        "Days below zero",
        "Months over capacity threshold",
      ],
      widths: [36, 80, 14, 12, 18, 12, 14, 12, 16],
      rows: compare(i, cases).map((c) => [
        c.label,
        c.changed.join("; ") || "Nothing: the baseline",
        d(c.low),
        c.lowDate,
        d(c.required),
        c.additional === null ? "Unknown" : d(c.additional),
        c.belowReserve,
        c.belowZero,
        c.pressureMonths,
      ]),
    },
    {
      name: "Definitions and data sources",
      header: ["Term", "Definition"],
      widths: [36, 120],
      rows: [
        ["Label", label],
        ["Values", `Every figure is a calculated value from the ${MODEL_VERSION} model, written out (no formulas). The rules below reproduce them.`],
        ["Dates", `${WINDOW_DAYS} consecutive ${TIMEZONE} calendar dates including the start date. Weeks are display buckets of 7 dates; the last is shorter.`],
        ["Opening cash", "The bank balance at the start of the first date, including uncleared items the bank already shows."],
        ["Net cash", "Receipts settling on a date minus outflows due or paid on that date."],
        ["Closing cash", "Opening cash plus the cumulative net cash to that date (receipts settle before the same day’s outflows)."],
        ["Low point", "The lowest of the opening cash and every closing balance, on the earliest date it happens."],
        ["Opening cash needed", "Reserve + the deepest cumulative fall below zero (if any)."],
        ["Additional cash needed", "Opening cash needed − opening cash, if positive. Before any separately modelled financing."],
        ["Intraday check", "Labelled separately: the balance if a day’s outflows cleared before its receipts."],
        ["Earning condition", "A participant counts for a month’s fee once their first service is delivered and if they haven’t left by its last day."],
        ["Receipts", "Cash on the settlement date only. Earned or invoiced income isn’t cash. Enquiries and allocations make no receipt."],
        ["Financing", "Only when selected and fully costed (draw, fees or interest, repayment); a credit limit is never cash."],
        ...STATUS_ORDER.map((k) => [
          `Status: ${STATUSES[k]}`,
          k === "actual" ? "Cleared or paid." : k === "committed" ? "Contracted, or confirmed by the payer." : "Expected, not yet confirmed.",
        ]),
        ...SOURCE_ORDER.map((k) => [`Source: ${SOURCES[k]}`, ""]),
        ...CATEGORY_ORDER.map((k) => [`Category: ${CATEGORIES[k].label}`, CATEGORIES[k].hint]),
        [
          "Not included",
          "Public Support at Home funding and the care-management allocation (not partner income); participants’ funds held by another entity; names or health information.",
        ],
      ],
    },
  ];
}
