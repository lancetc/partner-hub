import {
  addDays,
  aud,
  CATEGORIES,
  categoryOn,
  isDate,
  rulesStale,
  RULESET,
  SERVICES,
  share,
  showDate,
  times,
  visitsIn,
  type Category,
  type ServiceId,
} from "./sahRules";

/*
  "While You Wait" (docs/while-you-wait.md): what help can be arranged while someone waits for Support at Home
  funding, what it could cost, and what changes once funding is available. Pure and deterministic: the Magazine
  block's practice mode, the staff live-call tool and the editor's preview all compute the same way, in cents.

  - Every figure carries where it came from: a scenario, a dated government estimate, a provider quote (with its
    expiry), a confirmed allocation or service start, or "to confirm". A number without provenance never looks
    like a quote.
  - A wait in weeks never becomes a start date. Allocation and service start are separate, confirmed facts.
  - CHSP and interim Support at Home funding are separate. Neither is assumed.
  - A private visit keeps its private price. Nothing here says it will be reimbursed or backdated.
  - No language model does arithmetic, decides eligibility or picks a rate.
*/

export const STAGES = {
  awaiting_assessment: "Awaiting assessment",
  approved_priority: "Approved; seeking services in the Priority System",
  interim_allocated: "Interim Support at Home funding allocated",
  full_allocated: "Full funding allocated; onboarding",
  commenced: "Funded services commenced",
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_ORDER = Object.keys(STAGES) as Stage[];
const atLeast = (s: Stage, t: Stage) => STAGE_ORDER.indexOf(s) >= STAGE_ORDER.indexOf(t);

export const PENSION = {
  full: "Full pensioner",
  part: "Part pensioner",
  self_funded: "Self-funded retiree",
  prefer_not: "Prefer not to say",
  unknown: "Unknown",
} as const;
export type Pension = keyof typeof PENSION;

export const BADGES = {
  scenario: "Scenario",
  estimate: "Government estimate (dated)",
  quote: "Provider quote",
  allocation: "Confirmed allocation",
  start: "Confirmed service start",
  confirm: "To confirm",
} as const;
export type Badge = keyof typeof BADGES;

export const CHSP_REFERRAL = {
  to_check: "To check: referral and eligibility for this service",
  confirmed: "Referral confirmed",
  not_available: "Not available for this service or situation",
  receiving: "Already receiving this service",
} as const;
export type ChspReferral = keyof typeof CHSP_REFERRAL;

export type Need = { id: string; service: ServiceId; hoursPerVisit: number; days: number[] };
export type Quote = {
  status: "none" | "fictional" | "verified";
  issuer: string;
  version: string;
  validUntil: string;
  /** Cents per unit, by service. A missing price is unknown, not zero. */
  prices: Partial<Record<ServiceId, number>>;
  /** Minimum billable hours per visit. Null is unknown. */
  minimumHours: number | null;
  /** Travel or visit charge per visit, in cents. Null is unknown; 0 is "none". */
  travelCents: number | null;
  surchargesKnown: boolean;
  /** Can the provider deliver this pattern? Null is unknown. */
  available: boolean | null;
};
export type Chsp = { referral: ChspReferral; provider: "unknown" | "available" | "none"; contributionCents: number | null; services: ServiceId[] };
export type Rates = { verified: boolean; independence: number | null; everyday: number | null; source: string; effectiveOn: string };

export type BridgeInput = {
  mode: "practice" | "live";
  stage: Stage;
  /** Where the stage came from, and who checked it when. */
  stageSource: { source: string; checkedBy: string; checkedAt: string };
  /** An official wait estimate shown on its own, with its date. Never turned into a start date. */
  estimate: { text: string; asAt: string };
  needs: Need[];
  /** Earliest desired private start. */
  start: string;
  /** "If the wait were this many weeks": a planning scenario only. */
  waitWeeks: number;
  periods: number[];
  quote: Quote;
  chsp: Chsp;
  pension: Pension;
  cshc: "yes" | "no" | "unknown";
  legacy: "yes" | "no" | "unknown";
  rates: Rates;
  /** Provider prices for funded services, cents per unit. */
  sahPrices: Partial<Record<ServiceId, number>>;
  allocationDate: string;
  serviceStartDate: string;
  urgent: boolean;
};

export const emptyInput = (mode: "practice" | "live"): BridgeInput => ({
  mode,
  stage: "approved_priority",
  stageSource: { source: "", checkedBy: "", checkedAt: "" },
  estimate: { text: "", asAt: "" },
  needs: [],
  start: "",
  waitWeeks: 6,
  periods: [4, 8, 12],
  quote: {
    status: "none",
    issuer: "",
    version: "",
    validUntil: "",
    prices: {},
    minimumHours: null,
    travelCents: null,
    surchargesKnown: false,
    available: null,
  },
  chsp: { referral: "to_check", provider: "unknown", contributionCents: null, services: [] },
  pension: "unknown",
  cshc: "unknown",
  legacy: "unknown",
  rates: { verified: false, independence: null, everyday: null, source: "", effectiveOn: "" },
  sahPrices: {},
  allocationDate: "",
  serviceStartDate: "",
  urgent: false,
});

// ---------------------------------------------------------------------------------------------
// The three panels
// ---------------------------------------------------------------------------------------------

export type VisitLine = {
  needId: string;
  service: ServiceId;
  label: string;
  units: number;
  lineCents: number;
  travelCents: number;
  totalCents: number;
  perWeek: number;
};

/** B. The private bridge: exact only for a valid, complete quote; otherwise "Quote needed", with every reason. */
export function privateBridge(i: BridgeInput, today: string) {
  const q = i.quote;
  const reasons: string[] = [];
  if (q.status === "none") reasons.push("There’s no quote yet.");
  if (q.status === "verified" && (!q.issuer || !q.version)) reasons.push("The quote’s issuer and version aren’t recorded.");
  if (q.status !== "none" && (!isDate(q.validUntil) || q.validUntil < today))
    reasons.push(isDate(q.validUntil) ? `The quote expired on ${showDate(q.validUntil)}.` : "The quote has no validity date.");
  if (q.available !== true)
    reasons.push(q.available === false ? "The provider can’t deliver this pattern." : "Whether the provider can deliver this pattern isn’t confirmed.");
  if (q.minimumHours === null) reasons.push("The visit minimum isn’t known.");
  if (q.travelCents === null) reasons.push("Travel or visit charges aren’t known.");
  if (!q.surchargesKnown) reasons.push("Weekend or public-holiday surcharges aren’t confirmed.");
  for (const n of i.needs) if (q.prices[n.service] === undefined) reasons.push(`There’s no quoted price for ${SERVICES[n.service].label.toLowerCase()}.`);
  if (!i.needs.length) reasons.push("No services are planned yet.");
  const exact = reasons.length === 0;
  const lines: VisitLine[] = exact
    ? i.needs.map((n) => {
        const units = Math.max(n.hoursPerVisit, q.minimumHours ?? 0);
        const lineCents = times(q.prices[n.service]!, units);
        const travel = q.travelCents ?? 0;
        return {
          needId: n.id,
          service: n.service,
          label: SERVICES[n.service].label,
          units,
          lineCents,
          travelCents: travel,
          totalCents: lineCents + travel,
          perWeek: n.days.length,
        };
      })
    : [];
  const weeklyCents = exact ? lines.reduce((s, l) => s + l.totalCents * l.perWeek, 0) : null;
  // Scenario totals count the actual scheduled visits from the start date, so a mid-week start isn't a rounded multiple.
  const scenarios =
    exact && isDate(i.start)
      ? i.periods.map((weeks) => ({
          weeks,
          end: addDays(i.start, weeks * 7 - 1),
          cents: lines.reduce((s, l) => s + l.totalCents * visitsIn(i.start, weeks, i.needs.find((n) => n.id === l.needId)!.days), 0),
          visits: lines.reduce((s, l) => s + visitsIn(i.start, weeks, i.needs.find((n) => n.id === l.needId)!.days), 0),
        }))
      : [];
  const badge: Badge = !exact ? "confirm" : q.status === "verified" ? "quote" : "scenario";
  return { exact, reasons, lines, weeklyCents, scenarios, badge, validUntil: q.validUntil };
}

/** A. Subsidised interim support through CHSP: its own program, its own states, never a made-up fee. */
export function chspBridge(i: BridgeInput) {
  const c = i.chsp;
  const covered = i.needs.filter((n) => c.services.includes(n.service));
  const state =
    c.referral === "receiving"
      ? "Already receiving this service"
      : c.referral === "not_available"
        ? "Not available for this service or scenario"
        : c.referral === "to_check"
          ? "Potential option: check eligibility"
          : c.provider !== "available" || c.contributionCents === null
            ? "Referral confirmed; provider or fee pending"
            : "Provider available; contribution quoted";
  const quoted = c.referral === "confirmed" && c.provider === "available" && c.contributionCents !== null && covered.length > 0;
  return {
    state,
    quoted,
    weeklyCents: quoted ? covered.reduce((s, n) => s + c.contributionCents! * n.days.length, 0) : null,
    covered: covered.map((n) => SERVICES[n.service].label),
    perVisitCents: quoted ? c.contributionCents : null,
    interimSah: i.stage === "interim_allocated",
  };
}

export type SahLine = {
  service: ServiceId;
  label: string;
  category: Category | null;
  /** The weekly funded price at the provider's price, if known. */
  priceCents: number | null;
  /** The participant's projected weekly contribution, or null with why. */
  contributionCents: number | null;
  note: string;
};

/** C. What changes under funded Support at Home: confirmed dates only, categories by date, and personal rates only from a verified notice. */
export function sahPicture(i: BridgeInput, today: string) {
  const allocationConfirmed = atLeast(i.stage, "interim_allocated") && isDate(i.allocationDate);
  const startConfirmed = i.stage === "commenced" && isDate(i.serviceStartDate);
  const asAt = startConfirmed ? i.serviceStartDate : today;
  const rateFor = (c: Category | null) => (c === "independence" ? i.rates.independence : c === "everyday" ? i.rates.everyday : null);
  const lines: SahLine[] = i.needs.map((n) => {
    const category = categoryOn(n.service, asAt);
    const price = i.sahPrices[n.service];
    const priceCents = price === undefined ? null : times(price, n.hoursPerVisit) * n.days.length;
    if (!category)
      return {
        service: n.service,
        label: SERVICES[n.service].label,
        category,
        priceCents,
        contributionCents: null,
        note: "The ruleset doesn’t cover this service.",
      };
    if (CATEGORIES[category].contribution === "none")
      return {
        service: n.service,
        label: SERVICES[n.service].label,
        category,
        priceCents,
        contributionCents: 0,
        note: "No participant contribution for this category, for approved, funded services. Private visits before then keep their private price.",
      };
    const bp = rateFor(category);
    if (!i.rates.verified || bp === null)
      return {
        service: n.service,
        label: SERVICES[n.service].label,
        category,
        priceCents,
        contributionCents: null,
        note: "Rate to confirm: needs the participant’s Services Australia notice.",
      };
    return {
      service: n.service,
      label: SERVICES[n.service].label,
      category,
      priceCents,
      contributionCents: priceCents === null ? null : share(priceCents, bp),
      note:
        priceCents === null
          ? "Needs the provider’s price for the funded service."
          : `${bp / 100}% from the verified notice${i.rates.effectiveOn ? ` effective ${showDate(i.rates.effectiveOn)}` : ""}. A projection, not an invoice.`,
    };
  });
  return {
    stage: STAGES[i.stage],
    allocationConfirmed,
    allocationDate: allocationConfirmed ? i.allocationDate : "",
    startConfirmed,
    startDate: startConfirmed ? i.serviceStartDate : "",
    startNote: startConfirmed
      ? ""
      : "Start date not confirmed. We can plan now and update this when funding, agreements and service arrangements are confirmed.",
    lines,
    pensionNote:
      i.pension === "unknown" || i.pension === "prefer_not"
        ? ""
        : `${PENSION[i.pension]}: this helps explain what to expect, but it doesn’t set a rate. Only the participant’s Services Australia notice does.`,
    legacyNote:
      i.legacy === "yes"
        ? "Legacy “no worse off” arrangements may apply: check the notice."
        : i.legacy === "unknown"
          ? "Whether legacy “no worse off” arrangements apply isn’t known."
          : "",
    rulesVersion: RULESET.version,
    rulesStale: rulesStale(today),
    asAt,
  };
}

/** Everything at once, for the panels and the text view. */
export function compare(i: BridgeInput, today: string) {
  return { chsp: chspBridge(i), private: privateBridge(i, today), sah: sahPicture(i, today) };
}

// ---------------------------------------------------------------------------------------------
// The family summary: verified facts only, and a generic version when the caller isn't authorised
// ---------------------------------------------------------------------------------------------

export type SummaryOptions = { to: string; participant: string; worker: string; authorised: boolean; nextStep: string; owner: string; followUp: string };

export function familySummary(i: BridgeInput, o: SummaryOptions, today: string) {
  const c = compare(i, today);
  const stageLine =
    i.stageSource.source || i.mode === "practice"
      ? `The current status we can confirm is: ${STAGES[i.stage]}${i.stageSource.checkedAt ? ` (checked ${showDate(i.stageSource.checkedAt)})` : ""}.`
      : "We’re confirming the current status.";
  const parts = [`Hi ${o.to || "[Name]"},`, ""];
  if (!o.authorised) {
    // Without verified authority: how it works, and no personal financial or care details.
    parts.push(
      "Thanks for your call. While someone waits for Support at Home funding, there can be other ways to arrange help, such as services through the Commonwealth Home Support Programme or a private arrangement. Costs depend on the service and the provider.",
      "We can only discuss the details of someone’s situation with them, or with a person they’ve authorised. Once that’s in place, we can go through the options and give an itemised quote before anything is decided.",
    );
  } else {
    parts.push(`Thanks for talking through ${o.participant || "[Participant]"}’s support needs. ${stageLine}`);
    if (c.chsp.quoted)
      parts.push(
        `A Commonwealth Home Support Programme provider has quoted a contribution of ${aud(c.chsp.perVisitCents!)} a visit for ${c.chsp.covered.join(" and ").toLowerCase()}.`,
      );
    else if (i.chsp.referral !== "not_available")
      parts.push(
        "We’re checking whether Commonwealth Home Support Programme services are available, and what that provider would ask you to contribute. That hasn’t been confirmed yet.",
      );
    if (c.private.exact && c.private.weeklyCents !== null)
      parts.push(
        `A private arrangement has been quoted at ${aud(c.private.weeklyCents)} a week for ${c.private.lines.map((l) => `${l.label.toLowerCase()} (${l.units} ${SERVICES[l.service].unit}${l.units === 1 ? "" : "s"}, ${l.perWeek} a week)`).join(" and ")}, valid until ${showDate(c.private.validUntil)}.${i.mode === "practice" ? " (Scenario only.)" : ""}`,
      );
    else
      parts.push("A private arrangement is also possible if an approved provider can offer the service. We can give you an itemised quote before you decide.");
    parts.push(
      c.sah.startConfirmed
        ? `Funded Support at Home services start on ${showDate(c.sah.startDate)}.`
        : "The date funded Support at Home services could begin isn’t confirmed yet. Private visits before then keep their private price.",
    );
  }
  parts.push(
    `Our next step is ${o.nextStep || "[specific action]"}${o.owner ? ` (${o.owner})` : ""}${o.followUp ? ` by ${showDate(o.followUp)}` : " by [follow-up date]"}.`,
    `Please let us know if ${o.authorised ? `${o.participant || "[Participant]"}’s` : "their"} needs or safety change in the meantime.`,
    "",
    "Kind regards,",
    o.worker || "[Worker]",
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------------------------
// The practice block
// ---------------------------------------------------------------------------------------------

export type BridgeBlockData = {
  title: string;
  intro: string;
  person: { name: string; about: string };
  caller: { name: string; relation: string; authorised: boolean };
  /** What the caller asks. */
  ask: string;
  /** The authored scenario: every number fictional and labelled so. */
  scenario: BridgeInput;
  /** As at this day, for the scenario's dates. */
  today: string;
  /** What a good summary covers, checked by the words each point looks for. */
  checklist: { id: string; label: string; anyOf: string[] }[];
  /** Phrases that make it wrong. */
  avoid: { phrase: string; why: string }[];
  model: string;
  source: { title: string; version: string };
  approval: { owner: string; operations: string; finance: string; quality: string; privacy: string; communications: string; approvedOn: string };
};

export const PRACTICE_NOTICE = "Scenario only. Fictional people, rates and dates: these aren’t Trilogy Care prices or anyone’s real contribution.";
export const LIVE_NOTICE =
  "An information and quote aid, not an eligibility or funding decision. Nothing here is saved, sent, booked or referred. Check every source before you rely on a figure.";
export const FEE_ESTIMATOR = "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions";

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const date = (v: unknown) => (isDate(v) ? v : "");

/** A scenario, checked into shape: unknown values stay unknown, numbers are kept to sensible ranges. */
export function cleanInput(raw: unknown, mode: "practice" | "live"): BridgeInput {
  const r = obj(raw);
  const base = emptyInput(mode);
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
  const cents = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
  const services = Object.keys(SERVICES) as ServiceId[];
  const prices = (v: unknown) =>
    Object.fromEntries(
      Object.entries(obj(v))
        .filter(([k, x]) => services.includes(k as ServiceId) && cents(x) !== null)
        .map(([k, x]) => [k, cents(x)!]),
    ) as Partial<Record<ServiceId, number>>;
  const q = obj(r.quote);
  const c = obj(r.chsp);
  const rt = obj(r.rates);
  const ss = obj(r.stageSource);
  const es = obj(r.estimate);
  const s = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
  return {
    mode,
    stage: oneOf(r.stage, STAGE_ORDER, base.stage),
    stageSource: { source: s(ss.source), checkedBy: s(ss.checkedBy, 120), checkedAt: date(ss.checkedAt) },
    estimate: { text: s(es.text, 300), asAt: date(es.asAt) },
    needs: (Array.isArray(r.needs) ? r.needs : []).slice(0, 6).map((n, k) => {
      const o = obj(n);
      return {
        id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `need-${k + 1}`,
        service: oneOf(o.service, services, "domestic_assistance"),
        hoursPerVisit: Math.round(num(o.hoursPerVisit, 0.25, 8, 1) * 4) / 4,
        days: [...new Set((Array.isArray(o.days) ? o.days : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      };
    }),
    start: date(r.start),
    waitWeeks: Math.round(num(r.waitWeeks, 1, 52, base.waitWeeks)),
    periods: (Array.isArray(r.periods) ? r.periods : base.periods).filter((p): p is number => Number.isInteger(p) && p > 0 && p <= 52).slice(0, 4),
    quote: {
      status: oneOf(q.status, ["none", "fictional", "verified"] as const, mode === "practice" ? "fictional" : "none"),
      issuer: s(q.issuer, 120),
      version: s(q.version, 60),
      validUntil: date(q.validUntil),
      prices: prices(q.prices),
      minimumHours: q.minimumHours === null || q.minimumHours === undefined || q.minimumHours === "" ? null : num(q.minimumHours, 0, 8, 1),
      travelCents: cents(q.travelCents),
      surchargesKnown: q.surchargesKnown === true,
      available: q.available === true ? true : q.available === false ? false : null,
    },
    chsp: {
      referral: oneOf(c.referral, Object.keys(CHSP_REFERRAL) as ChspReferral[], "to_check"),
      provider: oneOf(c.provider, ["unknown", "available", "none"] as const, "unknown"),
      contributionCents: cents(c.contributionCents),
      services: (Array.isArray(c.services) ? c.services : []).filter((x): x is ServiceId => services.includes(x as ServiceId)),
    },
    pension: oneOf(r.pension, Object.keys(PENSION) as Pension[], "unknown"),
    cshc: oneOf(r.cshc, ["yes", "no", "unknown"] as const, "unknown"),
    legacy: oneOf(r.legacy, ["yes", "no", "unknown"] as const, "unknown"),
    rates: {
      verified: rt.verified === true,
      independence: rt.independence === null || rt.independence === undefined || rt.independence === "" ? null : Math.round(num(rt.independence, 0, 10000, 0)),
      everyday: rt.everyday === null || rt.everyday === undefined || rt.everyday === "" ? null : Math.round(num(rt.everyday, 0, 10000, 0)),
      source: s(rt.source),
      effectiveOn: date(rt.effectiveOn),
    },
    sahPrices: prices(r.sahPrices),
    allocationDate: date(r.allocationDate),
    serviceStartDate: date(r.serviceStartDate),
    urgent: r.urgent === true,
  };
}

/**
  The practice block's fields, checked. Publishing needs a fictional scenario with at least one service, the
  caller's question, what a good summary covers and the phrases to avoid, a model summary, and sign-off from
  Operations, Finance, Quality, Privacy and Communications.
*/
export function parseBridge(o: Raw, where: string, h: ParseHelpers): BridgeBlockData {
  const { str, idOf, list, unfinished } = h;
  const scenario = cleanInput(o.scenario, "practice");
  if (!scenario.needs.length) unfinished(`${where} needs at least one service in the scenario.`);
  if (scenario.needs.some((n) => !n.days.length)) unfinished(`${where}: every service in the scenario needs at least one visit day.`);
  const p = obj(o.person);
  const c = obj(o.caller);
  const a = obj(o.approval);
  const s = obj(o.source);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    operations: str(a.operations, `${where} Support at Home Operations reviewer`, { max: 120 }) ?? "",
    finance: str(a.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(a.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    communications: str(a.communications, `${where} Communications reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const source = { title: str(s.title, `${where} source`, { max: 200 }) ?? "", version: str(s.version, `${where} source version`, { max: 80 }) ?? "" };
  if (!bridgeApproved({ approval, source }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Operations, Finance, Quality, Privacy and Communications reviewers, the date, and the source and its version.`,
    );
  const checklist = list(o.checklist, where, "summary points", 8).map((x, i) => ({
    id: idOf(x.id, `${where} summary point ${i + 1}`),
    label: str(x.label, `${where} summary point ${i + 1}`, { required: true, max: 200 }) ?? "",
    anyOf: (Array.isArray(x.anyOf) ? x.anyOf : [])
      .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      .slice(0, 12)
      .map((w) => w.trim().toLowerCase()),
  }));
  if (!checklist.length || checklist.some((x) => !x.anyOf.length)) unfinished(`${where}: each summary point needs words or phrases to look for.`);
  const avoid = list(o.avoid, where, "phrases to avoid", 10).map((x, i) => ({
    phrase: (str(x.phrase, `${where} phrase to avoid ${i + 1}`, { required: true, max: 120 }) ?? "").toLowerCase(),
    why: str(x.why, `${where} phrase to avoid ${i + 1}: why`, { required: true, max: 300 }) ?? "",
  }));
  const today = date(o.today);
  if (!today) unfinished(`${where} needs the scenario’s “as at” date.`);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    person: {
      name: str(p.name, `${where}: the person’s name`, { required: true, max: 80 }) ?? "",
      about: str(p.about, `${where}: about the person`, { max: 400 }) ?? "",
    },
    caller: {
      name: str(c.name, `${where}: the caller’s name`, { max: 80 }) ?? "",
      relation: str(c.relation, `${where}: the caller’s relationship`, { max: 60 }) ?? "",
      authorised: c.authorised === true,
    },
    ask: str(o.ask, `${where}: what the caller asks`, { required: true, max: 600 }) ?? "",
    scenario,
    today,
    checklist,
    avoid,
    model: str(o.model, `${where}: the model summary`, { required: true, max: 2500 }) ?? "",
    source,
    approval,
  };
}

export const bridgeApproved = (b: { approval: BridgeBlockData["approval"]; source: { title: string; version: string } }) =>
  Boolean(
    b.approval.owner &&
    b.approval.operations &&
    b.approval.finance &&
    b.approval.quality &&
    b.approval.privacy &&
    b.approval.communications &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version,
  );

/** The reader's copy: the model summary and the checks stay on the server until the learner has written theirs. */
export function bridgeForReaders<T extends BridgeBlockData>(b: T): T {
  return { ...b, checklist: [], avoid: [], model: "" };
}

/** Compares a learner's summary with the reviewed points, by the words each point looks for, and the phrases to avoid. */
export function checkSummary(b: Pick<BridgeBlockData, "checklist" | "avoid">, text: string) {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const norm = (x: string) => x.toLowerCase().replace(/[’‘]/g, "'");
  return {
    covered: b.checklist.map((c) => ({ id: c.id, label: c.label, met: c.anyOf.some((w) => t.includes(norm(w))) })),
    avoided: b.avoid.filter((a) => t.includes(norm(a.phrase))),
  };
}

export type { Category, ServiceId };
