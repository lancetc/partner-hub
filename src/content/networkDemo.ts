import type { Axes } from "@/lib/auditorVetting";
import type { BenchCard, Scorecard } from "@/lib/networkBench";
import type { Availability, CoverageInputs, DemandCell, SupplyRow } from "@/lib/suburbCoverage";
import { NORTH_BRISBANE_BENCH } from "./networkCases";

/*
  The Contractor Network Builder Work Tool's demo bench (docs/network-builder.md). DEMO DATA ONLY: two made-up areas,
  anonymous demo workers and invented figures. The Work Tool reads nothing else. It doesn't connect to care plans,
  scheduling, supplier onboarding, evidence expiry, finance or quality records until Trilogy Care approves each data
  source (DATA_SOURCES below says so, source by source). Every row here is shaped like those sources would be, so the
  tool can be reviewed now without any real record in the Hub.

  What it shows on purpose:
  - Demo worker 3 is approved and free 7–9 am in both areas: one person can't be counted in two places at once.
  - Demo worker 4's availability is older than the freshness rule: approved, but availability unconfirmed.
  - Demo worker 5's required check has expired, and demo worker 6 is restricted by the provider: neither is matchable,
    and a Care Partner sees only the neutral reason.
  - Demo workers 7 and 8 are in the pipeline: interest and evidence in progress never count as capacity.
*/

/** Where real data would come from, and that none of it is connected. Changing any of these needs Trilogy Care's approval and a data contract. */
export const DATA_SOURCES = [
  { id: "demand", label: "Approved service demand (care plans and budgets)", owner: "Operations / CRM", connected: false },
  { id: "scheduling", label: "Scheduling and bookings", owner: "Operations / rostering", connected: false },
  { id: "onboarding", label: "Supplier onboarding and approval status", owner: "Supplier onboarding / IT", connected: false },
  { id: "evidence", label: "Evidence and check expiry", owner: "Quality and worker screening", connected: false },
  { id: "rates", label: "Rates and participant prices", owner: "Finance / procurement", connected: false },
  { id: "quality", label: "Quality, complaints and corrective actions", owner: "Quality", connected: false },
  { id: "referrals", label: "Referral forecasts", owner: "Partnerships / CRM", connected: false },
] as const;

const AS_OF = "2027-03-01";
const slot = (id: string, days: Availability["days"], from: number, to: number, hours: number, status: Availability["status"] = "confirmed"): Availability => ({
  id,
  days,
  from,
  to,
  hours,
  status,
  effectiveFrom: "",
});
const WEEKDAYS: Availability["days"] = ["mon", "tue", "wed", "thu", "fri"];
const row = (id: string, label: string, over: Partial<SupplyRow>): SupplyRow => ({
  id,
  label,
  aggregate: false,
  service: "personalCare",
  capabilities: [],
  state: "approved",
  areas: ["demo-north", "demo-south"],
  slots: [],
  verifiedOn: "2027-02-26",
  source: "Demo data",
  owner: "Demo supplier onboarding",
  preferredFor: "",
  onboardingWeeks: null,
  bookings: [],
  ...over,
});
const need = (over: Partial<DemandCell> & Pick<DemandCell, "id" | "area" | "planned" | "booked">): DemandCell => ({
  service: "personalCare",
  capability: "",
  window: { days: [...WEEKDAYS], from: 7, to: 9 },
  unit: "hours",
  visitHours: 1,
  arranging: 0,
  forecast: { low: 0, base: 1, high: 3 },
  unknown: 0,
  neededFrom: "",
  preference: "none",
  backupTarget: 1,
  continuity: "",
  source: "Demo data",
  owner: "Demo",
  verifiedOn: "2027-02-26",
  ...over,
});

export const DEMO_INPUTS: CoverageInputs = {
  asOf: AS_OF,
  timezone: "Australia/Brisbane",
  weeks: 6,
  freshness: { days: 14, setBy: "Demo rule: Operations and rostering set the real one", from: "2027-01-01" },
  leadWeeks: 4,
  areas: [
    { id: "demo-north", name: "Demo area North", x: 35, y: 35 },
    { id: "demo-south", name: "Demo area South", x: 65, y: 65 },
  ],
  demand: [
    need({ id: "north-am", area: "demo-north", planned: 10, booked: 5 }),
    need({ id: "south-am", area: "demo-south", planned: 5, booked: 2 }),
    need({
      id: "south-clean",
      service: "domestic",
      area: "demo-south",
      window: { days: [...WEEKDAYS], from: 13, to: 16 },
      visitHours: 2,
      planned: 6,
      booked: 2,
    }),
  ],
  supply: [
    row("d1", "Demo worker 1", { slots: [slot("s1", [...WEEKDAYS], 7, 9, 5, "booked")], note: "Carries the booked mornings in Demo area North." }),
    row("d2", "Demo worker 2", { service: "domestic", areas: ["demo-south"], slots: [slot("s1", [...WEEKDAYS], 13, 16, 6)] }),
    row("d3", "Demo worker 3", { slots: [slot("s1", [...WEEKDAYS], 7, 8, 5)], note: "Free 7–8 am in both areas: counted once." }),
    row("d4", "Demo worker 4", { areas: ["demo-north"], slots: [slot("s1", [...WEEKDAYS], 7, 9, 5)], verifiedOn: "2027-01-20" }),
    row("d5", "Demo worker 5", { state: "expired", areas: ["demo-south"], slots: [slot("s1", [...WEEKDAYS], 7, 9, 5)] }),
    row("d6", "Demo worker 6", { state: "restricted", areas: ["demo-north"], slots: [slot("s1", [...WEEKDAYS], 7, 9, 5)] }),
    row("d7", "Demo worker 7", { state: "interested", slots: [slot("s1", [...WEEKDAYS], 7, 9, 10, "provisional")], verifiedOn: "", onboardingWeeks: 4 }),
    row("d8", "Demo worker 8", {
      state: "evidence",
      areas: ["demo-south"],
      slots: [slot("s1", [...WEEKDAYS], 7, 9, 5, "provisional")],
      verifiedOn: "",
      onboardingWeeks: 3,
    }),
    row("d9", "Demo worker 9", { state: "candidate", areas: ["demo-north"], slots: [], verifiedOn: "" }),
  ],
};

const ok = (note: string) => ({ state: "verified" as const, note, owner: "Demo supplier onboarding", barrier: false });
const na = { state: "not_applicable" as const, note: "Agreed per participant.", owner: "", barrier: false };
const resolvedAxes: Axes = {
  participant_choice: na,
  service_scope: ok("Demo: scope agreed."),
  entity_identity: ok("Demo: checked."),
  worker_identity: ok("Demo: checked."),
  screening_route: ok("Demo: checked."),
  screening_status: ok("Demo: checked."),
  service_credential: ok("Demo: checked."),
  insurance_status: ok("Demo: checked."),
  rate_breakdown: ok("Demo: reviewed."),
  participant_price: na,
  price_agreement: na,
  provider_oversight: ok("Demo: owner named."),
};
const gap = (note: string) => ({ state: "material_gap" as const, note, owner: "Demo supplier onboarding", barrier: false });
const sent = (note: string) => ({ state: "needs_verification" as const, note, owner: "Demo supplier onboarding", barrier: false });
const card = (id: string, over: Partial<BenchCard>): BenchCard => ({
  id,
  arrangement: "Sole trader (demo)",
  profile: "pc-sole-trader",
  evidence: resolvedAxes,
  scope: ["personalCare"],
  approvedUntil: "2027-12-31",
  claim: "",
  travel: "",
  ...over,
});

export const DEMO_CARDS: BenchCard[] = [
  card("d1", {}),
  card("d2", { arrangement: "Cleaning business (demo)", profile: "", scope: ["domestic"] }),
  card("d3", { travel: "Both demo areas; one place at a time." }),
  card("d4", { travel: "Demo area North." }),
  card("d5", { approvedUntil: "2027-02-14" }),
  card("d6", {}),
  card("d7", {
    evidence: {
      entity_identity: ok("Demo: ABN sent."),
      worker_identity: gap("Demo: not sent."),
      screening_status: gap("Demo: not sent."),
      insurance_status: sent("Demo: sent."),
    },
    scope: [],
    approvedUntil: "",
    claim: "Demo: “I could start next week.”",
  }),
  card("d8", {
    evidence: {
      entity_identity: sent("Demo: sent."),
      worker_identity: sent("Demo: sent."),
      screening_route: sent("Demo: sent."),
      screening_status: sent("Demo: sent."),
      service_credential: sent("Demo: sent."),
      insurance_status: sent("Demo: sent."),
    },
    scope: [],
    approvedUntil: "",
  }),
  card("d9", { evidence: {}, scope: [], approvedUntil: "" }),
];

/** Demo scorecards. The restricted one's Quality detail stays on the server: the tool never sends it to a Care Partner. */
export const DEMO_SCORECARDS: (Scorecard & { id: string })[] = [
  {
    id: "d3",
    worker: "Demo worker 3",
    role: "Personal-care worker (demo)",
    reviewOwner: "Demo supplier quality owner",
    metrics: [
      {
        id: "fulfilled",
        dim: "reliability",
        label: "Confirmed visits fulfilled",
        numerator: 38,
        denominator: 40,
        period: "Demo: 8 weeks",
        source: "Demo data",
        lastReview: "2027-02-26",
        missing: "Participant-requested cancellations aren’t counted.",
        note: "",
      },
      {
        id: "late",
        dim: "reliability",
        label: "Late arrivals",
        numerator: 2,
        denominator: 40,
        period: "Demo: 8 weeks",
        source: "Demo data",
        lastReview: "2027-02-26",
        missing: "",
        note: "",
      },
      {
        id: "reports",
        dim: "experience",
        label: "Participant reports that were positive",
        numerator: 2,
        denominator: 2,
        period: "Demo: 8 weeks",
        source: "Demo data",
        lastReview: "2027-02-26",
        missing: "",
        note: "",
      },
      {
        id: "invoices",
        dim: "billing",
        label: "Invoices matching the agreement",
        numerator: 7,
        denominator: 8,
        period: "Demo: 8 weeks",
        source: "Demo data",
        lastReview: "2027-02-26",
        missing: "",
        note: "",
      },
    ],
    strengths: ["Demo: steady attendance."],
    concerns: [],
    response: "",
    restriction: { active: false, owner: "", neutral: "" },
    qualityAction: { open: false, ref: "" },
    checksValidUntil: "2027-12-31",
    reviewBy: "2027-05-31",
    available: true,
  },
  {
    id: "d6",
    worker: "Demo worker 6",
    role: "Personal-care worker (demo)",
    reviewOwner: "Demo supplier quality owner",
    metrics: [
      {
        id: "fulfilled",
        dim: "reliability",
        label: "Confirmed visits fulfilled",
        numerator: 3,
        denominator: 4,
        period: "Demo: 4 weeks",
        source: "Demo data",
        lastReview: "2027-02-20",
        missing: "",
        note: "",
      },
    ],
    strengths: [],
    concerns: ["Demo: the provider is reviewing a concern. The details stay with Quality."],
    response: "",
    restriction: {
      active: true,
      owner: "Demo supplier quality owner",
      neutral: "Not matchable for new work while the provider reviews a concern. Contact supplier onboarding.",
    },
    qualityAction: { open: true, ref: "DEMO-QA-1" },
    qualityDetail: "DEMO ONLY: held in the Quality workflow. This text must never reach a Care Partner.",
    checksValidUntil: "2027-12-31",
    reviewBy: "2027-04-30",
    available: false,
  },
];

export const DEMO_PROFILES = NORTH_BRISBANE_BENCH.profiles;
export const DEMO_TEMPLATE = NORTH_BRISBANE_BENCH.outreach;
