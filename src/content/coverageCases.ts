import type { CoverageLabData } from "@/lib/coverageLab";
import { TAXONOMY_VERSION, WEEKDAYS, type Availability, type DemandCell, type SupplyRow } from "@/lib/suburbCoverage";

/*
  The reviewed fictional case for "Is this suburb ready for growth?" (docs/suburb-growth.md). Every suburb, contractor,
  client and figure is invented for practice: none is real Trilogy Care coverage, a supplier, a staffing norm or a
  backup ratio. The three suburbs are made up, set around Toowoomba because that's Maya's town on the Community Atlas.

  It returns to Maya, keeping her established facts (content/hiringCases.ts, content/workloadCases.ts): a small Care
  Partner business supporting 35 people; three start each month and about one leaves; $26,720 in the bank and $10,000
  kept in reserve. Her coordinator isn't named here (the library's "Sam" is a Trilogy Care team member). Contractors
  are anonymous ("Worker A"); clients are never named.

  The PRD's acceptance fixtures 2 to 4, in fictional suburbs:
  - Banksia Rise: 18 h a week of early-morning personal care (Mon–Fri 7–9 am) is planned and 6 h are booked. Two
    approved workers are free only after 10 am, a candidate's checks aren't done, a participant's chosen worker is in
    provider verification, another worker is paused and one contractor is a cleaner. The current gap is 12 h.
  - Corella Park: 12 h of afternoon cleaning planned, 8 booked, and 6 h of verified spare in the matching window: no
    current gap, 2 h of surplus. The worker carrying the booked hours may be away in the new year.
  - Quandong Hill: 4 h of weekend wound-care nursing, 2 booked, no confirmed spare and a 2-hour provisional offer:
    a 2-hour current gap, from this Saturday.
*/

const slot = (id: string, days: Availability["days"], from: number, to: number, hours: number, status: Availability["status"] = "confirmed"): Availability => ({
  id,
  days,
  from,
  to,
  hours,
  status,
  effectiveFrom: "",
});
const worker = (id: string, label: string, over: Partial<SupplyRow>): SupplyRow => ({
  id,
  label,
  aggregate: false,
  service: "personalCare",
  capabilities: [],
  state: "approved",
  areas: [],
  slots: [],
  verifiedOn: "",
  source: "Provider approval register (fictional)",
  owner: "Supplier onboarding",
  preferredFor: "",
  onboardingWeeks: null,
  bookings: [],
  ...over,
});
const need = (over: Partial<DemandCell> & Pick<DemandCell, "id" | "service" | "area" | "window">): DemandCell => ({
  capability: "",
  unit: "hours",
  visitHours: 1,
  planned: 0,
  booked: 0,
  arranging: 0,
  forecast: { low: 0, base: 0, high: 0 },
  unknown: 0,
  neededFrom: "",
  preference: "none",
  backupTarget: 1,
  continuity: "",
  source: "Maya’s care schedule (fictional)",
  owner: "Maya (Care Partner)",
  verifiedOn: "2026-11-20",
  ...over,
});

export const SUBURB_GROWTH: CoverageLabData = {
  title: "Is this suburb ready for growth?",
  intro:
    "Three new enquiries and a map full of contractors. Before Maya says yes, compare what her clients need, by service and time, with the capacity that’s actually approved, free and confirmed.",
  storyVersion: "suburb-growth-1",
  taxonomyVersion: TAXONOMY_VERSION,
  story: {
    character: "Maya",
    role: "Principal of a small independent Care Partner business in Toowoomba (fictional)",
    situation:
      "Maya runs a small Care Partner business in Toowoomba. She supports 35 people; three start each month and about one leaves. She has $26,720 in the bank and keeps $10,000 aside. This week three new enquiries arrive from the same corner of town, and the local contractor map looks crowded. Before she says yes to anyone, she wants to know whether the people on the map can actually be there when her clients need them. The suburbs, contractors and figures are all fictional.",
    transmission: { who: "Ava, field transmission", text: "A contractor count is a directory, not a roster. Let’s find out who can be there at seven." },
    voice: {
      who: "A client in Banksia Rise (fictional)",
      text: "I don’t mind who comes, as long as someone comes before eight. I can’t get dressed on my own.",
    },
    fragile:
      "Worker E has told Maya she may need four weeks off in the new year. She carries eight hours a week of Corella Park’s afternoon cleaning. And a participant in Banksia Rise has asked for Worker P, her neighbour’s former carer, who is still in the provider’s checks.",
    absentWorker: "w-e",
    dilemma: "Where should I build my supplier network first, and what can’t wait for it?",
  },
  inputs: {
    asOf: "2026-11-23",
    timezone: "Australia/Brisbane",
    weeks: 8,
    freshness: { days: 30, setBy: "Supplier onboarding (a fictional rule for this case)", from: "2026-11-01" },
    leadWeeks: 6,
    areas: [
      { id: "banksia", name: "Banksia Rise", note: "A fictional suburb on the north side of town.", x: 26, y: 30 },
      { id: "corella", name: "Corella Park", note: "A fictional suburb to the east.", x: 70, y: 26 },
      { id: "quandong", name: "Quandong Hill", note: "A fictional suburb to the south.", x: 50, y: 74 },
    ],
    demand: [
      need({
        id: "banksia-am",
        service: "personalCare",
        area: "banksia",
        window: { days: [...WEEKDAYS], from: 7, to: 9 },
        visitHours: 1.5,
        planned: 18,
        booked: 6,
        arranging: 3,
        forecast: { low: 0, base: 3, high: 6 },
        unknown: 1,
        preference: "preferredWorker",
        note: "Twelve visits a week to help people shower and dress before 9 am. Eight of them have no worker. One more client is in hospital, and her schedule isn’t known yet.",
      }),
      need({
        id: "corella-pm",
        service: "domestic",
        area: "corella",
        window: { days: [...WEEKDAYS], from: 13, to: 16 },
        visitHours: 2,
        planned: 12,
        booked: 8,
        forecast: { low: 0, base: 2, high: 4 },
        verifiedOn: "2026-11-19",
        note: "Six two-hour cleans a week in the early afternoon. Four are booked with one worker.",
      }),
      need({
        id: "quandong-wkd",
        service: "nursing",
        capability: "woundCare",
        area: "quandong",
        window: { days: ["sat", "sun"], from: 8, to: 10 },
        visitHours: 1,
        planned: 4,
        booked: 2,
        forecast: { low: 0, base: 1, high: 2 },
        neededFrom: "2026-11-28",
        verifiedOn: "2026-11-21",
        note: "A wound-care dressing each weekend morning, from this Saturday. Saturday is booked; Sunday has only a provisional offer.",
      }),
    ],
    supply: [
      worker("w-a", "Worker A", {
        capabilities: ["medication"],
        areas: ["banksia", "corella"],
        slots: [slot("a1", [...WEEKDAYS], 10, 14, 8)],
        verifiedOn: "2026-11-18",
        note: "Approved for personal care. Free late mornings and lunchtimes.",
      }),
      worker("w-b", "Worker B", {
        areas: ["banksia"],
        slots: [slot("b1", ["mon", "tue", "wed", "thu", "fri", "sat"], 10.5, 15, 6)],
        verifiedOn: "2026-11-17",
        note: "Approved for personal care. Can’t start before 10:30 am because of school drop-off.",
      }),
      worker("w-c", "Candidate C", {
        state: "evidence",
        areas: ["banksia"],
        slots: [slot("c1", [...WEEKDAYS], 6.5, 10, 10)],
        source: "Directory listing (fictional)",
        onboardingWeeks: 6,
        note: "Answered a directory listing and could do early mornings. Police check and references still to come.",
      }),
      worker("w-p", "Worker P", {
        state: "verification",
        areas: ["banksia"],
        slots: [slot("p1", ["mon", "wed", "fri"], 7, 9, 4.5)],
        preferredFor: "banksia-am",
        source: "Participant’s request (fictional)",
        onboardingWeeks: 3,
        note: "Chosen by a participant: her neighbour’s former carer. The provider is checking their evidence.",
      }),
      worker("w-i", "Contractor I", {
        state: "interested",
        service: "domestic",
        areas: ["banksia", "corella"],
        source: "Directory listing (fictional)",
        note: "A cleaning business that has asked to be added. Nothing is checked yet.",
      }),
      worker("w-j", "Worker J", {
        state: "paused",
        areas: ["banksia"],
        slots: [slot("j1", [...WEEKDAYS], 7, 11, 10)],
        verifiedOn: "2026-11-02",
        note: "Approved for personal care, but paused while recovering from surgery.",
      }),
      worker("w-d", "Worker D", {
        service: "domestic",
        areas: ["corella"],
        slots: [slot("d1", [...WEEKDAYS], 13, 17, 6)],
        verifiedOn: "2026-11-20",
        note: "Approved for cleaning. Six free hours a week in the afternoons.",
      }),
      worker("w-e", "Worker E", {
        service: "domestic",
        areas: ["corella"],
        slots: [slot("e1", [...WEEKDAYS], 13, 17, 8, "booked")],
        bookings: [{ cell: "corella-pm", hours: 8 }],
        verifiedOn: "2026-11-20",
        note: "Approved for cleaning. Carries the four booked afternoon cleans.",
      }),
      worker("w-k", "Worker K", {
        service: "domestic",
        areas: ["corella", "quandong"],
        slots: [slot("k1", ["tue", "thu"], 13, 16, 4)],
        verifiedOn: "2026-09-14",
        note: "Approved for cleaning. Their availability was last checked in September.",
      }),
      worker("w-g", "Nurse G", {
        service: "nursing",
        capabilities: ["medication", "woundCare"],
        areas: ["quandong"],
        slots: [slot("g1", ["sat"], 8, 10, 2, "booked")],
        bookings: [{ cell: "quandong-wkd", hours: 2 }],
        verifiedOn: "2026-11-21",
        note: "A registered nurse, approved for wound care. Booked for the Saturday dressing.",
      }),
      worker("w-h", "Nurse H", {
        service: "nursing",
        capabilities: ["woundCare"],
        areas: ["quandong"],
        slots: [slot("h1", ["sun"], 8, 10, 2, "provisional")],
        verifiedOn: "2026-11-21",
        note: "A registered nurse, approved for wound care. Has said she might do Sundays, but hasn’t confirmed.",
      }),
    ],
  },
  prediction: {
    prompt: "Before you look closer: which of Maya’s three areas is ready for more starts?",
    options: [
      { id: "banksia", text: "Banksia Rise: it has the most contractors listed", likely: false },
      { id: "corella", text: "Corella Park, for afternoon cleaning", likely: true },
      { id: "quandong", text: "Quandong Hill", likely: false },
      { id: "unclear", text: "I can’t tell from a contractor count", likely: true },
    ],
  },
  cards: [
    {
      id: "card-a",
      supply: "w-a",
      cell: "banksia-am",
      feedback: "Approved, verified and with spare hours, but only from 10 am. Spare late-morning hours don’t cover a 7 am shower.",
    },
    {
      id: "card-b",
      supply: "w-b",
      cell: "banksia-am",
      feedback: "Also approved and verified, and free only from 10:30. Between them A and B have 14 spare hours, and none of them is before 9 am.",
    },
    {
      id: "card-c",
      supply: "w-c",
      cell: "banksia-am",
      feedback:
        "Free at the right time, but still sending evidence. An expected approval date is a scenario, not a start date: C stays outside usable spare until the provider approves them.",
    },
    {
      id: "card-p",
      supply: "w-p",
      cell: "banksia-am",
      feedback:
        "The participant chose P, and that choice is respected: P goes through the provider’s verification and agreement. Until then P is a choice to assess, not spare capacity, and not someone to drop.",
    },
    {
      id: "card-d",
      supply: "w-d",
      cell: "corella-pm",
      feedback: "Approved for cleaning, free in the matching afternoon window, travels to Corella Park and verified this week: usable now.",
    },
    {
      id: "card-e",
      supply: "w-e",
      cell: "corella-pm",
      feedback: "Approved and in the right place, but every hour is already booked. E is the current cover, not spare, which is why an absence matters.",
    },
    {
      id: "card-k",
      supply: "w-k",
      cell: "corella-pm",
      feedback:
        "Approved, but their availability was last checked in September, older than the owner’s 30-day rule. It needs confirming before anyone relies on it.",
    },
    {
      id: "card-h",
      supply: "w-h",
      cell: "quandong-wkd",
      feedback: "Approved for wound care and in the right place, but the Sunday offer is provisional. Until it’s confirmed, Sunday has no nurse.",
    },
  ],
  immediate: [
    {
      id: "escalate",
      text: "Take both current gaps to the accountable teams today: the weekend wound-care visit in Quandong Hill to the clinical team, and the unfilled early-morning personal care in Banksia Rise to Operations. Tell each participant what’s confirmed and when you’ll call back.",
      feedback:
        "Both are confirmed, approved services with no worker. They need the accountable continuity process and an honest conversation now: recruitment can’t fill this week. You kept the small, urgent nursing gap in view beside the larger one.",
      outcome:
        "The clinical team covers Sunday’s dressing from the provider’s own nursing roster, and Maya tells the participant what’s arranged. Operations finds cover for four of the Banksia Rise morning visits while the gap is worked on, and Maya rings the other families with an honest date to call back.",
      levels: { demand: 3, honesty: 3 },
      flags: [],
    },
    {
      id: "recruit",
      text: "Write a recruitment brief for Banksia Rise mornings first: it’s the biggest gap, and the weekend nursing gap is only two hours.",
      feedback:
        "The largest gap isn’t the only current one. Two hours of wound care this Sunday is a confirmed need with no nurse, and a brief takes weeks to produce anyone. A current gap goes to the accountable team now; recruitment is the separate, longer decision.",
      outcome:
        "The brief goes out on Monday. On Sunday the wound-care dressing in Quandong Hill doesn’t happen: nobody had told the clinical team. The brief produces two replies, neither ready for weeks.",
      levels: { demand: 1, honesty: 1 },
      flags: ["ignoredUrgent"],
    },
    {
      id: "candidate",
      text: "Book Candidate C for the Banksia Rise mornings from next Monday and tell the families: their checks should be done by then.",
      feedback:
        "C hasn’t been approved, and an expected onboarding date is never a service date. Promising families a start on it sets them up to be let down.",
      outcome: "C’s police check takes three weeks longer than expected. The families were promised Monday; on Monday nobody comes.",
      levels: { demand: 1, honesty: 0 },
      flags: ["candidateAsCapacity", "promisedDate"],
    },
    {
      id: "shift",
      text: "Count Workers A and B against the Banksia Rise mornings: they’re approved and have 14 spare hours between them.",
      feedback: "Their spare hours start after 10 am. Spare hours at the wrong time aren’t cover, however many there are.",
      outcome: "Neither can start before 10. The roster shows cover that isn’t there, and the mornings stay empty.",
      levels: { demand: 1, honesty: 1 },
      flags: ["timeMismatch"],
    },
  ],
  network: [
    {
      id: "banksia-am",
      text: "Build early-morning personal-care cover around Banksia Rise over the next six to eight weeks: take the gap (12 h a week, Mon–Fri before 9 am) and the backup need to the Contractor Network Builder, follow Worker P through the provider’s checks, and look again when checks complete.",
      feedback:
        "It names the service, the place and the time window, with the evidence: a confirmed gap every week, no backup, and about six weeks to recruit and verify. It respects the participant’s choice through the provider’s route, and it sets a date to check whether outreach produced usable capacity.",
      outcome: "Outreach goes to carers who can work early mornings near Banksia Rise, not to everyone on the map. Three weeks on, Maya looks again.",
      levels: { backup: 3, follow: 3 },
      flags: [],
    },
    {
      id: "corella",
      text: "Recruit more cleaners for Corella Park: it’s the easiest place to take new starts.",
      feedback:
        "Corella Park’s backup is worth strengthening (Worker E’s absence would leave six hours), but it has no current gap. The repeated shortage is early-morning personal care in Banksia Rise.",
      outcome: "Two cleaners join the Corella Park list. The Banksia Rise mornings are still uncovered three weeks on.",
      levels: { backup: 2, follow: 1 },
      flags: [],
    },
    {
      id: "thinnest",
      text: "Recruit wherever the map is thinnest: Quandong Hill has only three contractors listed.",
      feedback:
        "A contractor count doesn’t predict capacity: Banksia Rise has the most listed and the largest gap. Quandong Hill’s need is two hours of weekend wound care, which recruitment can’t fill this weekend.",
      outcome: "Outreach goes to general contractors around Quandong Hill. None is a nurse, and the Banksia Rise mornings stay empty.",
      levels: { backup: 1, follow: 1 },
      flags: ["countAsCapacity"],
    },
    {
      id: "margin",
      text: "Focus recruitment where the best-funded clients are, so the business grows fastest.",
      feedback:
        "Funding and margin don’t decide whose care gets attention. The network priority follows the evidence: unmet confirmed need, recurrence and backup.",
      outcome: "The recruitment drive targets the wrong services. The confirmed gaps stay open.",
      levels: { backup: 0, follow: 0 },
      flags: ["marginFirst"],
    },
  ],
  explanations: [
    {
      id: "fit",
      text: "Banksia Rise has the most contractors listed, but none who is approved, confirmed and free before 9 am: Workers A and B start after 10, Candidate C’s checks aren’t done, and the participant’s chosen Worker P is still being verified. Corella Park’s afternoon cleaning is covered, with backup one absence would stretch. Quandong Hill’s weekend nursing gap is small, but it’s this weekend.",
      feedback:
        "That’s what the comparison shows: service, place and time window, with demand tiers and supply states kept apart, and the backup weakness named separately from the gap.",
      levels: { demand: 3, supply: 3, fit: 3, backup: 3 },
      flags: [],
    },
    {
      id: "count",
      text: "Banksia Rise has six contractors listed, so it’s ready for growth once they’re all asked.",
      feedback: "Six listings include a candidate, a paused worker, a cleaner and two workers free only after 10. A listing isn’t capacity.",
      levels: { demand: 1, supply: 0, fit: 0, backup: 1 },
      flags: ["countAsCapacity"],
    },
    {
      id: "hours",
      text: "Workers A and B have 14 spare hours between them, more than the 12-hour gap, so the mornings are covered once the roster moves.",
      feedback: "The hours are real, but they’re after 10 am. Matching is by service, place and time window, not a weekly total.",
      levels: { demand: 2, supply: 1, fit: 0, backup: 1 },
      flags: ["timeMismatch"],
    },
    {
      id: "drop",
      text: "Worker P isn’t approved, so take them off the list and offer the participant someone else.",
      feedback:
        "The participant can choose a worker. P isn’t spare capacity yet, but the right move is the provider’s verification and agreement route, not discarding the choice.",
      levels: { demand: 2, supply: 1, fit: 2, backup: 1 },
      flags: ["overrodeChoice"],
    },
  ],
  update: {
    title: "Three weeks later",
    text: "Maya’s outreach brought three replies. Candidate C finished their checks and the provider approved them, with six early-morning hours a week. Worker M, newly approved, can only do 11 am to 3 pm. Candidate N said they’re interested and hasn’t started checks. Worker P is still in verification.",
    asOf: "2026-12-14",
    supply: [
      worker("w-c", "Candidate C", {
        areas: ["banksia"],
        slots: [slot("c1", [...WEEKDAYS], 6.5, 9.5, 6)],
        verifiedOn: "2026-12-11",
        source: "Provider approval register (fictional)",
        note: "Now provider approved for personal care, with six confirmed early-morning hours a week.",
      }),
      worker("w-m", "Worker M", {
        areas: ["banksia"],
        slots: [slot("m1", [...WEEKDAYS], 11, 15, 8)],
        verifiedOn: "2026-12-10",
        note: "Newly approved for personal care. Free 11 am to 3 pm.",
      }),
      worker("w-n", "Candidate N", {
        state: "interested",
        areas: ["banksia"],
        slots: [slot("n1", [...WEEKDAYS], 6, 9, 10)],
        source: "Outreach reply (fictional)",
        onboardingWeeks: 6,
        note: "Replied to the outreach and could do early mornings. Hasn’t started checks.",
      }),
    ],
  },
  followUp: {
    prompt: "Three people answered the outreach. Did it create usable capacity for the Banksia Rise mornings?",
    options: [
      {
        id: "partly",
        text: "Partly. Worker C is now approved and confirmed for 6 of the 12 hours. Worker M is approved but free only from 11, and Candidate N hasn’t started checks. Six hours a week are still unfilled, and the weekend nursing visit still needs its continuity plan.",
        feedback:
          "Honest and specific: you counted only approved, confirmed, matching capacity, said what’s still open, and kept the current nursing gap in view.",
        levels: { honesty: 3, follow: 3 },
        flags: [],
      },
      {
        id: "closed",
        text: "Yes. Three new contractors responded, so the morning gap is closed and Maya can take the new starts.",
        feedback: "Replies aren’t capacity. Only C is approved and free before 9, for six of the twelve hours. A larger list doesn’t prove coverage improved.",
        levels: { honesty: 0, follow: 0 },
        flags: ["countAsCapacity"],
      },
      {
        id: "wait",
        text: "Not yet: nothing counts until all three are approved, so keep waiting before doing anything else.",
        feedback:
          "C does count now: approved, confirmed and in the window. Waiting for everyone hides real progress, and the remaining six hours still need an interim plan.",
        levels: { honesty: 2, follow: 1 },
        flags: [],
      },
    ],
  },
  debrief:
    "Banksia Rise looked busiest on the map, with six contractors listed, but none could do a 7 am visit: two approved workers start after 10, one is a candidate, one is paused, one is a cleaner, and the participant’s chosen worker is still in the provider’s checks. Its gap is 12 hours a week of early-morning personal care, Monday to Friday. Corella Park has afternoon cleaning cover with 2 hours to spare, though one absence would stretch it. Quandong Hill’s weekend wound-care nursing has a 2-hour gap from this weekend: small, current, and a job for the clinical team now, not a recruitment brief. A sound answer acts on both current gaps today, builds the early-morning bench in Banksia Rise over six to eight weeks, and checks whether outreach produced usable capacity, not just replies.",
  links: [
    {
      label: "Can we take on the next 10 clients?",
      href: "/magazine/can-we-take-on-the-next-10-clients",
      why: "The month-by-month intake question. When its service coverage is constrained, this article is where to look next.",
    },
  ],
  handoff: {
    label: "Contractor Network Builder (Work Tools)",
    note: "Placeholder: the Contractor Network Builder Work Tool isn’t in the Hub yet. When it is, an authorised owner passes the selected aggregate gap (service, area, window and hours, never a participant’s details) to its local recruitment brief and onboarding workflow from here. Nothing in this article drafts or sends a contractor message.",
  },
  sources: [
    {
      title: "Services under Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/services-under-support-at-home",
    },
    {
      title: "Self-management by Support at Home participants",
      url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/self-management-by-support-at-home-participants",
    },
  ],
  rationale: {
    theme: "Repeated delayed starts and unfilled early-morning visits in a few local areas, while partners report growing contractor lists.",
    themeOwner: "",
    audience: "Independent Care Partner business owners who grow local coordination businesses and arrange external services.",
    behaviour:
      "Compare demand with usable supply by service, capability, place and time window; act on current gaps through the accountable team; build the supplier network where the evidence points.",
    whyFit:
      "The mistake is a judgement about mixed supply states and time windows. A multi-area comparison lets a reader see that a contractor count isn’t capacity, without real contractor or participant data.",
    reuse: "Can we take on the next 10 clients? for intake; the Contractor Network Builder (not yet in the Hub) for outreach and onboarding.",
    systemFix:
      "Supplier availability that isn’t re-verified, and approval states not visible to partners, are process problems: an article alone won’t fix them.",
    measure:
      "Approved unfilled service units by area and time, time to first suitable visit, backup coverage and candidate-to-usable conversion, owned by Operations.",
    decision: "",
  },
  approval: { owner: "", operations: "", onboarding: "", quality: "", partnerships: "", policy: "", privacy: "", pilot: "", approvedOn: "", reviewBy: "" },
};

export const COVERAGE_CASES: { id: string; label: string; data: CoverageLabData }[] = [
  { id: "suburb-growth", label: "Maya’s three suburbs (fictional, around Toowoomba)", data: SUBURB_GROWTH },
];
