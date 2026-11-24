import type { Axes, Axis, FieldState } from "@/lib/auditorVetting";
import type { BenchCard, NetworkData, Profile, Scorecard } from "@/lib/networkBench";
import { type Availability, type DemandCell, type SupplyRow } from "@/lib/suburbCoverage";

/*
  The reviewed fictional case for Build Your Local Bench (docs/network-builder.md): the PRD's "North Brisbane morning
  gap" (section 8). Every suburb, worker, figure, rate and record is invented for practice. None is Trilogy Care's
  coverage, a supplier, a screening result, a staffing norm or a price.

  - The PRD names two real suburbs. The case uses two invented ones in North Brisbane instead (Paperbark Rise and Lilly
    Pilly Heights), so no figure can be read as a claim about a real place. Trilogy Care can rename them.
  - It returns to Priya Raman (content/growthCases.ts, already in the character library): principal of a small Care
    Partner business in North Brisbane. Her January story found a morning-service gap; this is her building local
    capacity for it. Her coordinators aren't named here. Participants are "Participant 1" to "Participant 3", and
    workers are anonymous ("Worker A"), so publishing it queues no new portrait.
  - Every sign-off is empty: it can't be published until the reviewers named in the PRD sign it off.

  The arithmetic is Local Coverage's. As written:
  - Paperbark Rise: 12 h a week of personal care, Mon–Sat 7–9 am, 4 booked. Lilly Pilly Heights: 6 h, 2 booked.
    18 planned, 6 booked: 12 unfilled early-morning hours, and no ready capacity for them.
  - Workers A and B are approved but free only after 10 am. Worker C says they can start Monday; their checks aren't
    done. Worker P is the participant's chosen worker, who has just called. Gardener G is approved, free early, and a
    gardener. "Five contractors nearby" is true, and none of them is ready supply for this gap.
  - The reveal, three weeks on: Worker C clears the provider's checks for four hours (Mon–Thu, Paperbark Rise), and
    Worker E (from the brief) is approved for six hours but won't travel to Paperbark Rise. 4 hours remain unfilled.
*/

const AS_OF = "2027-03-01";
const REVEAL = "2027-03-22";
const SOURCE = "Provider approval register (fictional)";
const OWNER = "Supplier onboarding";
const POLICY = "Contractor onboarding policy (placeholder until supplied)";

const slot = (id: string, days: Availability["days"], from: number, to: number, hours: number, status: Availability["status"] = "confirmed"): Availability => ({
  id,
  days,
  from,
  to,
  hours,
  status,
  effectiveFrom: "",
});
const MON_SAT: Availability["days"] = ["mon", "tue", "wed", "thu", "fri", "sat"];
const row = (id: string, label: string, over: Partial<SupplyRow>): SupplyRow => ({
  id,
  label,
  aggregate: false,
  service: "personalCare",
  capabilities: [],
  state: "approved",
  areas: [],
  slots: [],
  verifiedOn: "",
  source: SOURCE,
  owner: OWNER,
  preferredFor: "",
  onboardingWeeks: null,
  bookings: [],
  ...over,
});
const need = (over: Partial<DemandCell> & Pick<DemandCell, "id" | "area" | "planned" | "booked">): DemandCell => ({
  service: "personalCare",
  capability: "",
  window: { days: [...MON_SAT], from: 7, to: 9 },
  unit: "hours",
  visitHours: 1,
  arranging: 0,
  forecast: { low: 0, base: 0, high: 0 },
  unknown: 0,
  neededFrom: "",
  preference: "none",
  backupTarget: 1,
  continuity: "",
  source: "Priya’s care schedule (fictional)",
  owner: "Priya Raman (Care Partner)",
  verifiedOn: "2027-02-26",
  ...over,
});

/** Every check the Vetting Card needs before "ready", resolved: what a provider-approved card carries. */
const resolved = (note: string, extra: Partial<Record<Axis, string>> = {}): Axes => {
  const v = (n = note) => ({ state: "verified" as const, note: n, owner: OWNER, barrier: false });
  return {
    participant_choice: { state: "not_applicable", note: "Not a participant-chosen arrangement.", owner: "", barrier: false },
    service_scope: v(extra.service_scope ?? "Scope agreed for the approved service."),
    entity_identity: v("Business identity checked by the provider."),
    worker_identity: v("Worker identity checked by the provider."),
    screening_route: v("Accepted screening route for this role, confirmed by the provider."),
    screening_status: v("Current, verified by the approved method; no banning order."),
    service_credential: v(extra.service_credential ?? "Role qualification checked against the current profile."),
    insurance_status: v("Insurance checked against Trilogy Care’s current policy."),
    rate_breakdown: v("Rate reviewed by the price owner."),
    participant_price: { state: "not_applicable", note: "Agreed per participant before any booking.", owner: "", barrier: false },
    price_agreement: { state: "not_applicable", note: "Agreed per participant before any booking.", owner: "", barrier: false },
    provider_oversight: v("Oversight owner named."),
  };
};
const ax = (state: FieldState, note: string, barrier = false) => ({ state, note, owner: OWNER, barrier });

const card = (id: string, over: Partial<BenchCard>): BenchCard => ({
  id,
  arrangement: "Sole trader",
  profile: "pc-sole-trader",
  evidence: {},
  scope: [],
  approvedUntil: "",
  claim: "",
  travel: "",
  ...over,
});

const approvedC = card("w-c", {
  evidence: resolved("Checked by the provider’s onboarding owner (fictional)."),
  scope: ["personalCare"],
  approvedUntil: "2028-03-21",
  claim: "“I can do Monday to Thursday, seven till eight. Fridays and Saturdays I can’t.”",
  travel: "Lives in Paperbark Rise; doesn’t drive to Lilly Pilly Heights before 8 am.",
});

const PROFILES: Profile[] = [
  {
    id: "pc-sole-trader",
    label: "Personal-care worker (sole trader)",
    service: "personalCare",
    arrangement: "Sole trader delivering personal care",
    items: [
      {
        axis: "entity_identity",
        label: "The business: active ABN and its names",
        requirement: "required",
        why: "An active ABN doesn’t verify the worker.",
        source: POLICY,
      },
      {
        axis: "worker_identity",
        label: "The named worker’s identity",
        requirement: "required",
        why: "Checked for the person who will do the work.",
        source: POLICY,
      },
      {
        axis: "screening_route",
        label: "An accepted worker-screening route for this role",
        requirement: "required",
        why: "The route depends on the work and the worker category: the provider confirms which.",
        source: POLICY,
      },
      {
        axis: "screening_status",
        label: "Screening current, verified, and no banning order",
        requirement: "required",
        why: "Verified by the approved method.",
        source: POLICY,
      },
      {
        axis: "service_credential",
        label: "Personal-care qualification or competency",
        requirement: "required",
        why: "As the current profile sets it.",
        source: POLICY,
      },
      {
        axis: "insurance_rule",
        label: "Insurance types and minimums",
        requirement: "owner",
        why: "Trilogy Care policy, not Support at Home law: the owner sets the figures.",
        source: POLICY,
      },
      { axis: "insurance_status", label: "Insurance evidence", requirement: "required", why: "Checked against that policy.", source: POLICY },
      {
        axis: "service_scope",
        label: "The services and period approved",
        requirement: "required",
        why: "Approval is for a named service and period.",
        source: POLICY,
      },
      {
        axis: "price_agreement",
        label: "Rate review, and the participant’s price",
        requirement: "conditional",
        why: "A rate goes to the price owner; each participant agrees their price before services are confirmed.",
        source: POLICY,
      },
      { axis: "provider_oversight", label: "Who oversees the arrangement", requirement: "required", why: "The provider stays responsible.", source: POLICY },
    ],
    owner: "Supplier onboarding with Quality and worker screening",
    version: "pc-profile-0.1 (draft)",
    reviewedOn: "",
  },
  {
    id: "garden-business",
    label: "Gardening or home-maintenance business",
    service: "maintenance",
    arrangement: "A business delivering gardening or minor maintenance",
    items: [
      {
        axis: "entity_identity",
        label: "The business: active ABN and its names",
        requirement: "required",
        why: "An active ABN doesn’t verify a worker.",
        source: POLICY,
      },
      { axis: "worker_identity", label: "Each worker who attends", requirement: "required", why: "Checked for the people who do the work.", source: POLICY },
      {
        axis: "screening_route",
        label: "Worker screening",
        requirement: "owner",
        why: "Depends on the work and whether workers enter the home: the owner decides for this service.",
        source: POLICY,
      },
      {
        axis: "service_credential",
        label: "A licence for the task",
        requirement: "conditional",
        why: "Only where the task is a licensed trade.",
        source: POLICY,
      },
      { axis: "insurance_status", label: "Insurance evidence", requirement: "required", why: "Against Trilogy Care’s current policy.", source: POLICY },
      { axis: "service_scope", label: "The tasks approved", requirement: "required", why: "A gardener isn’t a personal-care worker.", source: POLICY },
      {
        axis: "price_agreement",
        label: "Rate review, and the participant’s price",
        requirement: "conditional",
        why: "Agreed before services are confirmed.",
        source: POLICY,
      },
    ],
    owner: "Supplier onboarding",
    version: "garden-profile-0.1 (draft)",
    reviewedOn: "",
  },
  {
    id: "nurse-agency",
    label: "Registered or enrolled nurse (agency-supplied)",
    service: "nursing",
    arrangement: "An agency supplying a named nurse",
    items: [
      {
        axis: "entity_identity",
        label: "The agency: active ABN and its names",
        requirement: "required",
        why: "The agency is checked apart from its nurse.",
        source: POLICY,
      },
      { axis: "worker_identity", label: "The named nurse’s identity", requirement: "required", why: "Approval is for the actual worker.", source: POLICY },
      {
        axis: "service_credential",
        label: "Current professional registration and any conditions",
        requirement: "required",
        why: "Checked on the public register by the provider.",
        source: POLICY,
      },
      { axis: "screening_route", label: "An accepted worker-screening route", requirement: "required", why: "The provider confirms which.", source: POLICY },
      {
        axis: "screening_status",
        label: "Screening current, verified, and no banning order",
        requirement: "required",
        why: "Verified by the approved method.",
        source: POLICY,
      },
      {
        axis: "insurance_rule",
        label: "Indemnity and insurance requirements",
        requirement: "owner",
        why: "Clinical governance and the policy owner set them.",
        source: POLICY,
      },
      { axis: "insurance_status", label: "Indemnity and insurance evidence", requirement: "required", why: "Against that requirement.", source: POLICY },
      {
        axis: "provider_oversight",
        label: "Clinical governance and supervision",
        requirement: "required",
        why: "A regulated role needs its clinical oversight named.",
        source: POLICY,
      },
      {
        axis: "service_scope",
        label: "The clinical tasks approved",
        requirement: "required",
        why: "Scope is checked against the role and the care plan.",
        source: POLICY,
      },
    ],
    owner: "Clinical governance with supplier onboarding",
    version: "nurse-profile-0.1 (draft)",
    reviewedOn: "",
  },
];

const SCORECARD_C: Scorecard = {
  worker: "Worker C",
  role: "Personal-care worker (sole trader), approved for personal care",
  reviewOwner: "Supplier quality owner (a fictional role)",
  metrics: [
    {
      id: "rel-fulfilled",
      dim: "reliability",
      label: "Confirmed visits fulfilled",
      numerator: 15,
      denominator: 16,
      period: "22 Mar – 18 Apr 2027",
      source: "Scheduling records (fictional)",
      lastReview: "2027-04-19",
      missing: "One participant-requested cancellation isn’t counted against the worker.",
      note: "",
    },
    {
      id: "rel-cancel",
      dim: "reliability",
      label: "Cancellations by the worker",
      numerator: 1,
      denominator: 16,
      period: "22 Mar – 18 Apr 2027",
      source: "Scheduling records (fictional)",
      lastReview: "2027-04-19",
      missing: "",
      note: "Two days’ notice; the provider arranged a replacement.",
    },
    {
      id: "rel-late",
      dim: "reliability",
      label: "Arrivals more than 10 minutes late",
      numerator: 3,
      denominator: 16,
      period: "22 Mar – 18 Apr 2027",
      source: "Scheduling records (fictional)",
      lastReview: "2027-04-19",
      missing: "",
      note: "All three on Mondays.",
    },
    {
      id: "fit-scope",
      dim: "fit",
      label: "Visits within the approved personal-care scope",
      numerator: 16,
      denominator: 16,
      period: "22 Mar – 18 Apr 2027",
      source: "Visit notes (fictional)",
      lastReview: "2027-04-19",
      missing: "Attendance doesn’t show clinical competence, and this role has no clinical tasks.",
      note: "",
    },
    {
      id: "exp-reports",
      dim: "experience",
      label: "Participant reports that were positive",
      numerator: 1,
      denominator: 1,
      period: "22 Mar – 18 Apr 2027",
      source: "Participant feedback, with consent (fictional)",
      lastReview: "2027-04-19",
      missing: "One report is an anecdote, not the record.",
      note: "",
    },
    {
      id: "bill-match",
      dim: "billing",
      label: "Invoices matching the agreement",
      numerator: 4,
      denominator: 4,
      period: "22 Mar – 18 Apr 2027",
      source: "Invoice checks (fictional)",
      lastReview: "2027-04-19",
      missing: "Kept apart from the participant’s price.",
      note: "",
    },
    {
      id: "safety-open",
      dim: "safety",
      label: "Open Quality actions",
      numerator: null,
      denominator: null,
      period: "22 Mar – 18 Apr 2027",
      source: "Quality register (fictional)",
      lastReview: "2027-04-19",
      missing: "",
      note: "None open, and no incidents recorded in the period.",
    },
    {
      id: "cont-weeks",
      dim: "continuity",
      label: "Weeks with every agreed slot held",
      numerator: 4,
      denominator: 4,
      period: "22 Mar – 18 Apr 2027",
      source: "Scheduling records (fictional)",
      lastReview: "2027-04-19",
      missing: "Unavoidable leave isn’t counted against the worker.",
      note: "",
    },
  ],
  strengths: ["Steady attendance Tuesday to Thursday.", "A participant’s report thanks Worker C for being patient and unhurried."],
  concerns: ["Three late arrivals in four weeks, all on Mondays."],
  response: "Worker C says a school drop-off moved this term, and has offered a 7:15 start on Mondays if the participant agrees.",
  restriction: { active: false, owner: "", neutral: "" },
  qualityAction: { open: false, ref: "" },
  checksValidUntil: "2028-03-21",
  reviewBy: "2027-06-18",
  available: true,
};

export const NORTH_BRISBANE_BENCH: NetworkData = {
  title: "Build Your Local Bench",
  intro:
    "Five contractors are listed near three of Priya’s participants, and 12 early-morning hours a week still have nobody. Open the cards, find the real gap, decide what to tell people, draft a brief for the right role, and see what three weeks of provider checks actually produce.",
  scenarioVersion: "north-brisbane-morning-1",
  mode: "formative",
  passMark: 14,
  story: {
    character: "Priya Raman",
    role: "Principal of a small Care Partner business in North Brisbane (fictional)",
    situation:
      "It’s Monday 1 March. Priya is planning for three participants around Paperbark Rise and Lilly Pilly Heights, two fictional suburbs in North Brisbane. Their approved care plans together need 18 hours of personal care before 9 am each week, and six are booked. Two approved workers have time, but only after 10 am. A third says they can start Monday, though the provider hasn’t verified their checks. And one participant would like a worker they’ve used before, who has just called the team.",
    dilemma: "The map says five contractors are nearby. Who can actually be there at seven, and what can I honestly promise?",
  },
  people: ["Participant 1", "Participant 2", "Participant 3"],
  headline: "Five contractors nearby",
  inputs: {
    asOf: AS_OF,
    timezone: "Australia/Brisbane",
    weeks: 6,
    freshness: { days: 14, setBy: "Operations and rostering (a fictional rule for this case)", from: "2027-01-01" },
    leadWeeks: 4,
    areas: [
      { id: "paperbark", name: "Paperbark Rise", note: "A fictional suburb in North Brisbane.", x: 32, y: 40 },
      { id: "lillypilly", name: "Lilly Pilly Heights", note: "A fictional suburb, a short drive north-east.", x: 68, y: 30 },
    ],
    demand: [
      need({
        id: "paperbark-am",
        area: "paperbark",
        planned: 12,
        booked: 4,
        forecast: { low: 0, base: 2, high: 4 },
        note: "Participants 1 and 2: help to shower and dress, one hour each morning, Monday to Saturday. Four of their twelve mornings are booked.",
      }),
      need({
        id: "lillypilly-am",
        area: "lillypilly",
        planned: 6,
        booked: 2,
        preference: "preferredWorker",
        note: "Participant 3: one hour each morning, Monday to Saturday. Two mornings are booked. They’d like Worker P, who helped them before.",
      }),
    ],
    supply: [
      row("w-a", "Worker A", {
        areas: ["paperbark", "lillypilly"],
        slots: [slot("a1", ["mon", "tue", "wed", "thu", "fri"], 10, 15, 15)],
        verifiedOn: "2027-02-24",
        note: "Approved for personal care. Free from 10 am.",
      }),
      row("w-b", "Worker B", {
        areas: ["paperbark"],
        slots: [slot("b1", [...MON_SAT], 10, 13, 9)],
        verifiedOn: "2027-02-22",
        note: "Approved for personal care. Free late mornings.",
      }),
      row("w-c", "Worker C", {
        state: "interested",
        areas: ["paperbark", "lillypilly"],
        slots: [slot("c1", [...MON_SAT], 6.5, 9, 12, "provisional")],
        source: "A message to the team (fictional)",
        onboardingWeeks: 3,
        note: "Says they can start Monday, any morning.",
      }),
      row("w-p", "Worker P", {
        state: "candidate",
        areas: ["lillypilly"],
        slots: [slot("p1", [...MON_SAT], 7, 8, 6, "provisional")],
        source: "A call to the team (fictional)",
        preferredFor: "lillypilly-am",
        onboardingWeeks: 3,
        note: "Participant 3’s chosen worker. Just called.",
      }),
      row("w-g", "Gardener G", {
        service: "maintenance",
        areas: ["paperbark", "lillypilly"],
        slots: [slot("g1", [...MON_SAT], 6, 9, 12)],
        verifiedOn: "2027-02-25",
        note: "Approved for gardening. Free early.",
      }),
    ],
  },
  cards: [
    card("w-a", {
      evidence: resolved("Checked by the provider’s onboarding owner (fictional)."),
      scope: ["personalCare"],
      approvedUntil: "2027-11-30",
      claim: "“Happy to take more, but I do school drop-off: I can’t start before ten.”",
      travel: "Travels to both suburbs.",
    }),
    card("w-b", {
      evidence: resolved("Checked by the provider’s onboarding owner (fictional)."),
      scope: ["personalCare"],
      approvedUntil: "2027-09-30",
      claim: "“Late mornings suit me.”",
      travel: "Paperbark Rise only.",
    }),
    card("w-c", {
      evidence: {
        entity_identity: ax("verified", "An active ABN was sent. It doesn’t verify the worker."),
        insurance_status: ax("needs_verification", "A certificate was sent; the provider hasn’t checked it against policy."),
        worker_identity: ax("material_gap", "Not sent yet."),
        screening_route: ax("material_gap", "Not sent yet."),
        screening_status: ax("material_gap", "Not sent yet."),
        service_credential: ax("material_gap", "Not sent yet."),
        service_scope: ax("needs_verification", "Says personal care; not yet agreed."),
        rate_breakdown: ax("price_review", "Asks for a rate above the fictional benchmark: a question for the price owner."),
      },
      claim: "“I can start Monday. Any morning you like.”",
      travel: "Says they’ll go anywhere. Not yet confirmed.",
    }),
    card("w-p", {
      evidence: {
        participant_choice: ax("verified", "Participant 3 has asked for this worker."),
      },
      claim: "“I helped them last year and I’d be glad to again.”",
      travel: "Lives near Lilly Pilly Heights.",
    }),
    card("w-g", {
      arrangement: "Gardening business",
      profile: "garden-business",
      evidence: resolved("Checked by the provider’s onboarding owner (fictional).", {
        service_scope: "Approved for gardening and minor maintenance.",
        service_credential: "No licensed trade in the approved tasks.",
      }),
      scope: ["maintenance"],
      approvedUntil: "2027-12-31",
      claim: "“I start at six most days.”",
      travel: "Travels to both suburbs.",
    }),
  ],
  steps: [
    {
      id: "protect",
      phase: "before",
      title: "Protect the people waiting",
      signal: "contingency_selected",
      prompt:
        "Monday is days away. Participants 1 and 2 in Paperbark Rise still have eight unbooked mornings between them, and Worker C says they can start Monday. What do you tell the participants, and what do you do?",
      options: [
        {
          id: "honest-interim",
          text: "Tell them exactly which mornings are confirmed and which aren’t yet, ask Operations for interim cover through the continuity process, and escalate any morning where someone can’t manage safely.",
          feedback:
            "Honest and safe. They know what’s confirmed, the people who can arrange cover are working on it, and a safety need goes to the right pathway straight away.",
          levels: { honesty: 3, safeguards: 3 },
          codes: [],
        },
        {
          id: "monday-start",
          text: "Tell them a new worker starts Monday: Worker C has said so.",
          feedback:
            "Worker C’s checks aren’t verified and nothing is booked. A start rests on the provider’s verification, confirmed availability, the agreement and the start process, not on a candidate’s message.",
          levels: { honesty: 0, safeguards: 0 },
          codes: ["promisedStart", "unverifiedStart"],
        },
        {
          id: "say-nothing",
          text: "Say nothing until the new worker is checked, so you don’t worry them.",
          feedback: "Silence leaves people planning around mornings that may not happen. Tell them what’s confirmed and what isn’t, and arrange interim cover.",
          levels: { honesty: 1, safeguards: 2 },
          codes: [],
        },
      ],
    },
    {
      id: "chosen",
      phase: "before",
      title: "Respect a chosen worker",
      signal: "participant_choice_branch_selected",
      prompt: "Participant 3 in Lilly Pilly Heights would like Worker P, who helped them last year. Worker P has just called. What do you do?",
      options: [
        {
          id: "assess",
          text: "Route Worker P to the provider’s onboarding for assessment, explain what’s needed, and ask Participant 3 what would work if it can’t go ahead as proposed.",
          feedback: "Their choice stays in view, the provider checks it, and nobody is promised an outcome that isn’t theirs to give.",
          levels: { honesty: 3, safeguards: 3 },
          codes: [],
        },
        {
          id: "roster",
          text: "Put Worker P on from Monday: Participant 3 trusts them.",
          feedback: "Trust matters, and it still goes through the provider. A participant-chosen worker has the same verification and oversight.",
          levels: { honesty: 1, safeguards: 0 },
          codes: ["unverifiedStart", "promisedStart"],
        },
        {
          id: "bench-instead",
          text: "Explain that the network already has approved workers, so the choice isn’t needed.",
          feedback: "There’s no genuine suitability reason to set the choice aside, and nobody on the bench is free before 9 am anyway.",
          levels: { honesty: 0 },
          codes: ["ignoredChoice"],
        },
      ],
    },
    {
      id: "screen",
      phase: "before",
      title: "Screen the offer",
      signal: "",
      prompt:
        "Worker C offers to start Monday, at a rate above the fictional benchmark. They’ve sent an ABN and an insurance certificate. What do you do with the offer?",
      options: [
        {
          id: "lead",
          text: "Treat it as a useful lead: send their evidence through onboarding on the personal-care checklist, send the rate to the price owner, and confirm nothing until both are done.",
          feedback: "A lead, a price review and the provider’s checks, kept apart. Nothing is approved or rejected on one document or one benchmark.",
          levels: { safeguards: 3 },
          codes: [],
        },
        {
          id: "abn-enough",
          text: "Approve them: an ABN and insurance are enough for personal care.",
          feedback:
            "An ABN identifies a business, not a worker. Identity, screening, the qualification and the scope are still open, and approval is the provider’s.",
          levels: { safeguards: 0 },
          codes: ["readyFromClaim", "unverifiedStart"],
        },
        {
          id: "reject-rate",
          text: "Turn them down: the rate is above the benchmark.",
          feedback: "A benchmark is a question, not a cap. The price owner reviews the rate; the participant agrees their price.",
          levels: { safeguards: 1 },
          codes: ["priceShortcut"],
        },
        {
          id: "pass-on",
          text: "Accept the rate and pass it on to the participants.",
          feedback: "The price owner reviews the rate first, and each participant agrees their own price before services are confirmed.",
          levels: { safeguards: 1, honesty: 2 },
          codes: ["priceShortcut"],
        },
      ],
    },
    {
      id: "revisit",
      phase: "after",
      title: "Revisit capacity",
      signal: "contingency_selected",
      prompt: "Three weeks on, the provider has finished some checks. Look at what’s now confirmed. What do you do about the hours that are still open?",
      options: [
        {
          id: "phased",
          text: "Phase the start: confirm the mornings that are covered, tell each participant exactly which mornings are still open, keep the interim cover going, and keep the brief open for the rest.",
          feedback: "Honest about what’s confirmed, and still working on the rest. That’s a defensible phased start.",
          levels: { honesty: 3, followThrough: 3 },
          codes: [],
          ending: "phased",
        },
        {
          id: "central",
          text: "Ask Operations for central supply support for the remaining hours, and tell the participants what’s being done and when you’ll update them.",
          feedback: "Some gaps need the provider’s wider supply. Asking, and keeping people informed, is a defensible plan.",
          levels: { honesty: 3, followThrough: 3 },
          codes: [],
          ending: "central",
        },
        {
          id: "chosen-confirmed",
          text: "The provider has approved Worker P: confirm them for Participant 3 through scheduling, and plan the rest of the gap.",
          feedback: "Participant 3’s choice, approved by the provider and confirmed through scheduling. The rest of the gap still needs its plan.",
          levels: { honesty: 3, followThrough: 3 },
          codes: [],
          ending: "chosen",
          only: "chosen-approved",
        },
        {
          id: "explain-cannot",
          text: "Worker P’s arrangement can’t meet the provider’s requirements as proposed: explain that respectfully to Participant 3, with who decided, why in plain terms, and the options that remain.",
          feedback: "A clear reason and real options, never “computer says no”. Their choice was considered properly.",
          levels: { honesty: 3, followThrough: 3 },
          codes: [],
          ending: "cannot",
          only: "chosen-declined",
        },
        {
          id: "call-it-covered",
          text: "Count the spare approved hours wherever they are, and tell everyone mornings are covered.",
          feedback:
            "Spare hours in the wrong suburb, or at the wrong time, don’t cover a 7 am visit. Telling people they’re covered when they aren’t is a promise nobody can keep.",
          levels: { honesty: 0, followThrough: 0 },
          codes: ["promisedStart"],
          ending: "green",
        },
        {
          id: "sign-five",
          text: "Sign up five more contractors from a directory so the map shows green.",
          feedback: "More names in a list don’t put anyone at a participant’s door at seven. The measure is visits confirmed, not contractors listed.",
          levels: { honesty: 2, followThrough: 1 },
          codes: ["greenMap"],
          ending: "green",
        },
      ],
    },
    {
      id: "review",
      phase: "quality",
      title: "Review delivery",
      signal: "quality_evidence_reviewed",
      prompt:
        "Four weeks of Worker C’s mornings. Read the scorecard: three late arrivals, all on Mondays, and one warm note from a participant. What do you do?",
      options: [
        {
          id: "pathway",
          text: "Raise the Monday pattern with the provider’s supplier contact through the agreed pathway, with the dates and Worker C’s response; ask the participant whether 7:15 suits; review again next month.",
          feedback: "The pattern, its denominator, the context and the contractor’s side, through the right pathway. Not an overreaction, and not ignored.",
          levels: { quality: 3, followThrough: 3 },
          codes: [],
        },
        {
          id: "two-stars",
          text: "Give Worker C two stars on the network list so other businesses know.",
          feedback: "One uninvestigated concern isn’t a public rating, and another business has no reason to see a participant’s experience.",
          levels: { quality: 0 },
          codes: ["blacklist"],
        },
        {
          id: "all-good",
          text: "Nothing to do: the participant’s note says they’re happy.",
          feedback: "One report is an anecdote. Three late arrivals in sixteen visits is a pattern worth raising, fairly.",
          levels: { quality: 1 },
          codes: ["overreactRating"],
        },
        {
          id: "remove",
          text: "Ask supplier onboarding to take Worker C off the bench straight away.",
          feedback: "A restriction is the accountable owner’s decision after a review, not a reaction to one pattern. Raise it with the facts.",
          levels: { quality: 1 },
          codes: ["overreactRating"],
        },
        {
          id: "hide-review",
          text: "Keep offering Worker C to new participants: the provider’s review isn’t finished, so there’s nothing to say.",
          feedback:
            "A provider-owned restriction is shown, neutrally, with the next step. Hiding it puts a participant in an arrangement the owner has paused.",
          levels: { quality: 0, honesty: 1 },
          codes: ["hidRestriction"],
          only: "quality-concern",
        },
      ],
    },
  ],
  later: {
    asOf: REVEAL,
    demandVerifiedOn: "2027-03-19",
    text: "Three weeks on (22 March). Worker C cleared the provider’s checks, for four early hours a week in Paperbark Rise. Worker E, who answered your brief, is approved for six early hours but won’t travel to Paperbark Rise before 8 am. Worker P is in the provider’s verification.",
    patches: [
      {
        row: row("w-c", "Worker C", {
          areas: ["paperbark"],
          slots: [slot("c1", ["mon", "tue", "wed", "thu"], 7, 8, 4)],
          verifiedOn: "2027-03-19",
          note: "Approved for personal care. Mon–Thu 7–8 am, Paperbark Rise.",
        }),
        card: approvedC,
      },
      {
        row: row("w-e", "Worker E", {
          areas: ["lillypilly"],
          slots: [slot("e1", [...MON_SAT], 7, 8, 6)],
          verifiedOn: "2027-03-18",
          note: "Answered the brief. Approved for personal care.",
        }),
        card: card("w-e", {
          evidence: resolved("Checked by the provider’s onboarding owner (fictional)."),
          scope: ["personalCare"],
          approvedUntil: "2028-03-17",
          claim: "“Six mornings, seven till eight. I can’t get to Paperbark Rise in time: I start the day on the other side.”",
          travel: "Lilly Pilly Heights only before 8 am: an earlier commitment elsewhere.",
        }),
      },
      {
        row: row("w-p", "Worker P", {
          state: "verification",
          areas: ["lillypilly"],
          slots: [slot("p1", [...MON_SAT], 7, 8, 6, "provisional")],
          source: "Provider onboarding (fictional)",
          preferredFor: "lillypilly-am",
          note: "Participant 3’s chosen worker, in the provider’s verification.",
        }),
        card: card("w-p", {
          evidence: {
            participant_choice: ax("verified", "Participant 3 has asked for this worker."),
            entity_identity: ax("needs_verification", "Sent; the provider is checking."),
            worker_identity: ax("needs_verification", "Sent; the provider is checking."),
            screening_route: ax("needs_verification", "Sent; the provider is checking."),
            screening_status: ax("needs_verification", "Sent; the provider is checking."),
            service_credential: ax("needs_verification", "Sent; the provider is checking."),
            insurance_status: ax("needs_verification", "Sent; the provider is checking."),
          },
          claim: "“I’ve sent everything they asked for.”",
          travel: "Lives near Lilly Pilly Heights.",
        }),
      },
    ],
  },
  profiles: PROFILES,
  gapProfile: "pc-sole-trader",
  gapWords: { area: ["Paperbark", "Lilly Pilly", "North Brisbane"], window: ["7", "early", "morning", "before 9"] },
  outreach: {
    id: "local-recruitment-brief",
    version: "outreach-0.1 (draft for review)",
    subject: "Availability for [window] support in [area]",
    intro:
      "Hello. [business]\n\nWe are looking to speak with appropriately qualified workers who may be available for [window] support in [area]. [need]\n\nOur onboarding team will confirm the role requirements and whether an arrangement is suitable.",
    callGuide: [
      "Introduce yourself and your business, and say how you came to contact them.",
      "Describe the need: [window] support in [area]. Ask whether that time and area could work for them.",
      "Explain the next step: the provider’s onboarding team confirms the role requirements, the checks and any rate.",
      "Don’t offer hours, pay or a start date. Ask whether they’re happy for you to pass their details to onboarding.",
      "Note what they said, and when you’ll follow up.",
    ],
    followUp:
      "Thank you for talking with us about [window] support in [area]. If you’d like to go ahead, the next step is the provider’s onboarding process, which confirms what the role needs. We’ll pass on your details only with your agreement.",
    locked: [
      {
        id: "not-offer",
        text: "This is an expression of interest, not an offer of work. Any arrangement depends on the provider’s onboarding checks and agreement.",
      },
      { id: "no-terms", text: "We can’t confirm hours, pay or a start date in this message: the provider’s onboarding team confirms the role and any rate." },
      {
        id: "relationship",
        text: "We are an independent Care Partner business working with Trilogy Care, the registered Support at Home provider. (Co-branding wording: for Partnerships and Marketing to approve.)",
      },
      { id: "opt-out", text: "If you’d rather not hear from us again, reply and we won’t contact you." },
    ],
    fields: [
      { id: "area", label: "Area", hint: "The suburbs or travel zone, for example: Paperbark Rise, North Brisbane", max: 80 },
      { id: "window", label: "Time window", hint: "For example: early morning (7–9 am), Monday to Saturday", max: 80 },
      { id: "business", label: "Your business, in a sentence", hint: "Who you are and what you do. No names of participants.", max: 160 },
      { id: "need", label: "The need, in a sentence", hint: "The service and when, in general terms. No one’s details, hours or rates.", max: 200 },
    ],
    approvalState: "draft",
    owner: "Partnerships and Marketing (brand), Operations and supplier onboarding (process), Privacy (contact data)",
  },
  scorecard: SCORECARD_C,
  variations: [
    {
      id: "chosen-approved",
      label: "The chosen worker is approved",
      text: "This time the provider approves Worker P for Participant 3, and Worker E doesn’t answer the brief.",
      reveal: [
        {
          row: row("w-p", "Worker P", {
            areas: ["lillypilly"],
            slots: [slot("p1", [...MON_SAT], 7, 8, 6)],
            verifiedOn: "2027-03-19",
            preferredFor: "lillypilly-am",
            note: "Participant 3’s chosen worker. Approved for personal care.",
          }),
          card: card("w-p", {
            evidence: {
              ...resolved("Checked by the provider’s onboarding owner (fictional)."),
              participant_choice: ax("verified", "Participant 3 has asked for this worker."),
            },
            scope: ["personalCare"],
            approvedUntil: "2028-03-18",
            claim: "“Whenever suits them, before eight.”",
            travel: "Lives near Lilly Pilly Heights.",
          }),
        },
        { row: row("w-e", "Worker E", { state: "paused", areas: ["lillypilly"], note: "Didn’t take up the brief." }) },
      ],
    },
    {
      id: "chosen-declined",
      label: "The chosen arrangement can’t proceed",
      text: "This time the provider can’t agree Worker P’s arrangement as proposed: a required check can’t be met.",
      reveal: [
        {
          row: row("w-p", "Worker P", {
            state: "evidence",
            areas: ["lillypilly"],
            slots: [slot("p1", [...MON_SAT], 7, 8, 6, "provisional")],
            preferredFor: "lillypilly-am",
            note: "Participant 3’s chosen worker. The provider can’t agree the arrangement as proposed.",
          }),
          card: card("w-p", {
            evidence: {
              participant_choice: ax("verified", "Participant 3 has asked for this worker."),
              screening_status: ax("material_gap", "A required check can’t be met for this arrangement as proposed (fictional).", true),
            },
            claim: "“I don’t understand why it’s a problem.”",
            travel: "Lives near Lilly Pilly Heights.",
          }),
        },
      ],
    },
    {
      id: "stale",
      label: "Stale availability",
      text: "This time Worker C is approved, but their availability was last confirmed three weeks ago: older than the 14-day rule.",
      reveal: [
        {
          row: row("w-c", "Worker C", {
            areas: ["paperbark"],
            slots: [slot("c1", ["mon", "tue", "wed", "thu"], 7, 8, 4)],
            verifiedOn: "2027-02-28",
            note: "Approved; availability not reconfirmed since 28 February.",
          }),
          card: approvedC,
        },
      ],
    },
    {
      id: "no-supplier",
      label: "No suitable supplier yet",
      text: "This time Worker C takes a full-time role elsewhere and nobody answers the brief.",
      reveal: [
        { row: row("w-c", "Worker C", { state: "paused", areas: ["paperbark"], note: "Withdrew: took a full-time role elsewhere." }), card: approvedC },
        { row: row("w-e", "Worker E", { state: "paused", areas: ["lillypilly"], note: "Didn’t take up the brief." }) },
      ],
    },
    {
      id: "quality-concern",
      label: "A quality concern after the first service",
      text: "This time the provider is reviewing a service concern about Worker C after the first month.",
      reveal: [],
      scorecard: {
        ...SCORECARD_C,
        concerns: [...SCORECARD_C.concerns, "The provider is reviewing a service concern. The details stay with Quality."],
        restriction: {
          active: true,
          owner: "Supplier quality owner",
          neutral:
            "Not matchable for new work while the provider reviews a service concern. Existing visits continue as the provider directs. Contact supplier onboarding.",
        },
        qualityAction: { open: true, ref: "QA-FICT-01" },
        qualityDetail: "Held in the authorised Quality workflow only (fictional).",
      },
    },
  ],
  endings: {
    phased: "A phased start. Some mornings are confirmed, each participant knows which, interim cover holds the rest, and the brief stays open.",
    central:
      "Central supply support. The provider’s wider supply is asked for the remaining hours, and the participants know what’s happening and when they’ll hear.",
    chosen: "Participant 3’s chosen worker, approved by the provider and confirmed through scheduling, with a plan for the rest.",
    cannot: "The chosen arrangement can’t proceed as proposed. Participant 3 heard why, from whom, and what remains possible.",
    green: "Not a valid outcome. The map may look better, but the 7 am visits aren’t confirmed, and people were told they were.",
    unsafe: "A critical error: see what to do differently, then try again.",
  },
  debrief:
    "A local bench helps only when a suitable worker can safely, lawfully and reliably be at the right door at the right time. Interest isn’t approval, approval isn’t availability, and a list of names can’t guarantee a start date.",
  jobAid: {
    snippetId: "choosing-and-checking-your-contractor",
    why: "The steps for checking a contractor a participant has chosen: the business and the worker apart, screening, insurance, scope and price.",
  },
  related: [
    {
      label: "Practise one onboarding pack: the Contractor Vetting Card",
      href: "/magazine/dots-gardener-checking-a-contractor-shes-chosen",
      why: "Evidence, screening and price for one fictional pack.",
    },
    {
      label: "What does a missed service cost?",
      href: "/magazine/what-does-a-missed-service-cost",
      why: "Reliability after a gap: the Service Reliability Calculator.",
    },
    { label: "Is this suburb ready for growth?", href: "/magazine/is-this-suburb-ready-for-growth", why: "The same coverage model, across a whole area." },
    {
      label: "Contractor Network Builder (Work Tool)",
      href: "/tools/network-builder",
      why: "For business owners: the planning tool, with demo data only for now.",
    },
  ],
  rationale: {
    signal:
      "Fictional: repeated start delays for early-morning personal care in one region, and contractors counted as cover before the provider had verified them.",
    behaviour: "Describe a gap by service, place and time; count only provider-approved, available workers; promise only what’s confirmed.",
    evidence: "Illustrative only: no verified complaint or operational data is linked yet.",
    whyFit: "The mistake is a judgement one (counting interest or daytime hours as cover), which practice with feedback can address.",
    existing: "The Contractor Vetting Card (one pack), Local Coverage Comparison (a whole area) and the Service Reliability Calculator.",
    systemFix: "A slow verification queue or an unclear supplier agreement is a process fix for supplier onboarding, not more outreach.",
    owner: "Partner Enablement",
    measure: "Unfilled approved early-morning hours, and days from approved service to first suitable confirmed visit: owned by Operations, not by this block.",
    decision: "",
  },
  ai: { drafting: false },
  approval: {
    owner: "",
    operations: "",
    onboarding: "",
    quality: "",
    partnerships: "",
    finance: "",
    privacy: "",
    learning: "",
    approvedOn: "",
    reviewBy: "",
    scenarioReviewed: "",
  },
};

export const NETWORK_CASES = [{ id: "north-brisbane-morning", label: "Priya’s mornings (North Brisbane, fictional)", data: NORTH_BRISBANE_BENCH }];
