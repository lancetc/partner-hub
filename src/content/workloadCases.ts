import type { WorkloadLabData } from "@/lib/workloadLab";
import { TAXONOMY_VERSION, type Task } from "@/lib/workloadLens";

/*
  The reviewed fictional case for "Where does a coordinator’s week go?" (docs/workload-lens.md). Every person,
  business and figure is invented for practice: none is Trilogy Care pricing, a staffing norm, a clients-per-coordinator
  figure or a productivity standard.

  It returns to Maya and Sam from the Hiring Runway lab (content/hiringCases.ts), keeping their established facts:
  Maya runs a small Care Partner business with one full-time coordinator, Sam (38 paid hours a week). They support
  35 people; three start each month and about one leaves; callbacks are taking longer and Sam has started working
  late. Maya has $26,720 in the bank and keeps $10,000 in reserve. This story comes before her hiring decision: before
  she recruits, she and Sam look at where the week actually goes. Clients are never named.

  The shape of it: a pressured week (about 39 recorded hours against 38 available, so an overrun, not a slow worker)
  beside an ordinary week before it (about 32). Most of the week is necessary: onboarding, reviews, family calls and a
  hospital discharge that couldn't wait. About five hours are reviewed rework from three causes outside Sam's control:
  a missed visit, an invoice with last month's rate, and a handoff that didn't say who was booking equipment. A planned
  review slipped. The forward plan for next week is two hours short once a realistic reserve is kept.
*/

const t = (
  id: string,
  label: string,
  category: Task["category"],
  planned: Task["planned"],
  day: number | null,
  count: number,
  minutes: Task["minutes"],
  more: Partial<Task> = {},
): Task => ({ id, label, category, planned, causes: [], rework: "necessary", owner: "partner", day, count, minutes, ...more });

export const COORDINATOR_WEEK: WorkloadLabData = {
  title: "Where does a coordinator’s week go?",
  intro:
    "Maya’s coordinator is working late and a review has slipped. Before she decides anything, follow Sam’s week, tag what filled it, test a change, and choose what to do next.",
  storyVersion: "coordinator-week-1",
  taxonomyVersion: TAXONOMY_VERSION,
  story: {
    character: "Maya",
    role: "Principal of a small independent Care Partner business (fictional)",
    coordinator: "Sam",
    situation:
      "Maya runs a small Care Partner business with one full-time coordinator, Sam. They support 35 people. Three new participants start each month and about one leaves. Callbacks are taking longer and Sam has started working late. Maya has $26,720 in the bank and keeps $10,000 aside, so a second coordinator is a big decision. Before she makes it, she asks Sam to help her see where a week actually goes. It isn’t a timesheet: it’s a sample of one pressured week and the ordinary week before it, in aggregate, agreed between them.",
    transmission: { who: "Ava, field transmission", text: "Everyone says the week is full. Let’s see what actually filled it." },
    principalView:
      "Maya’s view: commitments and capacity. Sam is rostered for 38 hours. This week holds one new start, two planned reviews, a family check-in, the usual calls and admin, and a reserve she meant to keep for the unexpected. By Friday the reserve has gone and a review hasn’t happened.",
    coordinatorView:
      "Sam’s view: interruptions and consequences. A call that couldn’t be rushed, a discharge that couldn’t wait, and three rounds of calls that shouldn’t have been needed. Sam did the care plan wording on Wednesday evening because it was on the list.",
    consequence:
      "By Friday afternoon, a planned care review for a long-standing client is still outstanding. It slipped twice as the week filled. Maya sees a full calendar and a coordinator working late. Sam sees a week that was mostly necessary, with hours of it caused by things that went wrong somewhere else.",
    dilemma: "Do I need a second coordinator, or is something else filling Sam’s week?",
  },
  inputs: {
    weeks: [
      {
        id: "this-week",
        label: "This week",
        kind: "pressured",
        rostered: 38,
        leave: 0,
        unavailable: 0,
        overdue: 1,
        tasks: [
          t("onboard-visit", "First visit and setup for a new client", "onboarding", "planned", 0, 1, 180, {
            detail: "The new client’s first visit: the agreement, what matters to her, and the services she’ll start with.",
          }),
          t("family-checkin", "Planned family check-in", "conversation", "planned", 0, 1, 45),
          t("needs-calls", "Calls with a family about their dad’s changing needs", "conversation", "unplanned", 0, 2, 60, {
            causes: ["needChanged"],
            detail: "Their father is more forgetful and they’re frightened. Two long calls to understand what’s changed and what he wants.",
          }),
          t("onboard-follow", "Follow-up calls for last week’s new client", "onboarding", "planned", 1, 2, 30),
          t("review-done", "Planned care review, with preparation", "review", "planned", 1, 1, 150),
          t("missed-call", "Family call after a missed visit", "conversation", "unplanned", 1, 1, 45, {
            causes: ["missedService"],
            detail: "For her mother, a missed visit meant no help to shower and a long morning waiting. For her daughter, it meant leaving work early.",
          }),
          t("missed-supplier", "Chasing the supplier and rebooking the missed visit", "supplier", "unplanned", 1, 2, 30, {
            causes: ["missedService", "supplierAvailability"],
            rework: "avoidable",
            owner: "supplier",
          }),
          t("hospital", "Home from hospital: escalation and an urgent needs review", "escalation", "unplanned", 2, 1, 150, {
            causes: ["needChanged"],
            prompt: true,
            detail: "Home two days early and less steady on her feet. The first nights at home are when a fall is most likely.",
          }),
          t("restart", "Restarting services with extra help for the first week", "change", "unplanned", 2, 1, 90, { causes: ["needChanged"] }),
          t("plan-doc", "Tidying the wording of a stable client’s care plan", "documentation", "planned", 2, 1, 60, {
            prompt: false,
            detail: "Nothing in the plan was wrong or out of date. Sam did it on Wednesday evening, after the hospital work, because it was on the list.",
          }),
          t("invoice", "Correcting a supplier invoice with last month’s rate", "supplier", "unplanned", 3, 3, 40, {
            causes: ["invoiceCorrection"],
            rework: "avoidable",
            owner: "shared",
            detail: "Three calls to correct one line: the supplier, Trilogy Care, then the supplier again.",
          }),
          t("handoff", "Finding out who is booking a shower chair after discharge", "documentation", "unplanned", 3, 4, 30, {
            causes: ["unclearHandoff"],
            rework: "avoidable",
            owner: "confirm",
            detail: "The handoff note said the equipment “is being arranged”, not by whom. Four calls to find out, while the client managed without it.",
          }),
          t("team", "Catch-up with Maya and a training module", "team", "planned", 4, 2, 60),
          t("checkin-calls", "Routine check-in calls", "conversation", "recurring", null, 14, 15),
          t("scheduling", "Routine rostering and scheduling", "change", "recurring", null, 9, 20),
          t("supplier-routine", "Routine supplier confirmations", "supplier", "recurring", null, 12, 15),
          t("notes", "Notes and records", "documentation", "recurring", null, 5, 60),
          t("inbox", "Inbox and phone messages", "other", "recurring", null, 5, 30),
          t("texts", "Quick messages with support workers", "supplier", "unplanned", null, 20, "unknown", { causes: ["unknown"], rework: "uncertain" }),
        ],
      },
      {
        id: "week-before",
        label: "The week before",
        kind: "ordinary",
        rostered: 38,
        leave: 0,
        unavailable: 0,
        overdue: 0,
        tasks: [
          t("onboarding", "New-client onboarding", "onboarding", "planned", null, 1, 240),
          t("reviews", "Planned reviews", "review", "planned", null, 2, 150),
          t("checkins", "Check-in calls and family conversations", "conversation", "recurring", null, 18, 15),
          t("family", "Planned family check-in", "conversation", "planned", null, 1, 45),
          t("scheduling", "Rostering and scheduling", "change", "recurring", null, 9, 20),
          t("supplier-routine", "Supplier confirmations", "supplier", "recurring", null, 12, 15),
          t("invoice", "An invoice correction", "supplier", "unplanned", null, 1, 60, { causes: ["invoiceCorrection"], rework: "avoidable", owner: "shared" }),
          t("escalation", "Incidents and escalations", "escalation", "unplanned", null, 0, 0),
          t("notes", "Notes and records", "documentation", "recurring", null, 5, 60),
          t("handoff", "Chasing an unclear handoff", "documentation", "unplanned", null, 2, 30, {
            causes: ["unclearHandoff"],
            rework: "avoidable",
            owner: "confirm",
          }),
          t("team", "Catch-up and training", "team", "planned", null, 2, 60),
          t("inbox", "Inbox and phone messages", "other", "recurring", null, 5, 30),
        ],
      },
    ],
    plan: { rostered: 38, leave: 0, unavailable: 0, recurring: 22, starts: 1, hoursPerStart: 4, exceptional: 4, duties: 2, reserve: 8 },
    interventions: [
      {
        id: "handoff-fix",
        label: "Agree with Trilogy Care that a discharge handoff names who books equipment",
        kind: "process",
        cause: "unclearHandoff",
        occurrences: 2,
        minutesEach: 30,
        owner: "Maya, with the Trilogy Care team",
        evidence: "Count calls chasing handoffs for the next two weeks, beside the two weeks before.",
        active: false,
      },
      {
        id: "invoice-aid",
        label: "Check supplier invoices against the rate list with the approved Job Aid",
        kind: "jobaid",
        cause: "invoiceCorrection",
        occurrences: 2,
        minutesEach: 30,
        owner: "Sam",
        evidence: "Invoice corrections needing a call, over the next month.",
        active: false,
      },
      {
        id: "supplier-noshow",
        label: "Raise the missed visit with the supplier and agree how they’ll tell us",
        kind: "supplier",
        cause: "missedService",
        occurrences: 1,
        minutesEach: 30,
        owner: "Maya",
        evidence: "Missed or late visits reported by families, and the supplier’s own notice of them.",
        active: false,
      },
      {
        id: "cover",
        label: "A casual coordinator for four hours next week, for the overdue review",
        kind: "cover",
        occurrences: null,
        minutesEach: null,
        coverHours: 4,
        owner: "Maya",
        evidence: "The overdue review is done, and callbacks are back within the promised time.",
        active: false,
      },
      {
        id: "hiring",
        label: "Explore a second coordinator in the Hiring Runway lab",
        kind: "hiring",
        occurrences: null,
        minutesEach: null,
        owner: "Maya",
        evidence: "",
        active: false,
      },
    ],
    guardrails: [
      { id: "overdue-reviews", label: "Partner-owned reviews overdue", value: 1, unit: "reviews" },
      { id: "late-callbacks", label: "Callbacks later than promised this week", value: 3, unit: "callbacks" },
      { id: "escalations", label: "Escalations waiting for a response", value: 0, unit: "escalations" },
    ],
  },
  prediction: {
    prompt: "Monday morning. Before the week happens: which part of it do you think will become the constraint?",
    hoursPrompt: "After the planned work, how many hours do you think Sam has left this week for anything unexpected?",
    options: [
      { id: "onboarding", text: "Onboarding the new client", likely: false },
      { id: "unplanned", text: "Unplanned changes, and the rework they set off", likely: true },
      { id: "calls", text: "Family and participant calls running long", likely: false },
      { id: "admin", text: "Notes and admin", likely: false },
      { id: "reviews", text: "The planned care reviews", likely: false },
    ],
  },
  events: [
    {
      id: "call",
      day: 1,
      title: "Tuesday: the call",
      text: "Just after nine, a client’s daughter rings. Her mother’s morning visit didn’t happen, and nobody called. She’s worried and cross. It takes Sam 45 minutes to listen, check her mum is safe today, and promise a call back with a new time.",
      task: "missed-call",
      detail: "For her mother, a missed visit meant no help to shower and a long morning waiting. For her daughter, it meant leaving work early.",
      askPrompt: false,
      answer: { category: "conversation", causes: ["missedService"], prompt: null },
      feedback:
        "A family conversation, and necessary support: the missed visit is the cause. Its 45 minutes count once in the total, and the same 45 minutes show in the missed-service overlay. Shortening this call wouldn’t have fixed anything; the missed visit would.",
    },
    {
      id: "hospital",
      day: 2,
      title: "Wednesday: home from hospital",
      text: "A client comes home from hospital two days earlier than expected, less steady on her feet. Sam follows Trilogy Care’s escalation process to get her needs reviewed, and arranges extra help for the first few days.",
      task: "hospital",
      detail: "Home two days early and less steady on her feet. The first nights at home are when a fall is most likely.",
      askPrompt: true,
      answer: { category: "escalation", causes: ["needChanged"], prompt: true },
      feedback:
        "An escalation that needed prompt action. It’s necessary work, not rework: her needs changed. It can’t wait for a quieter week, and it’s exactly what the reserve is for.",
    },
    {
      id: "plan-doc",
      day: 2,
      title: "Wednesday: the care plan wording",
      text: "Wednesday afternoon also had an hour blocked to tidy the wording of a stable client’s care plan. Nothing in it is wrong or out of date; it just reads awkwardly.",
      task: "plan-doc",
      detail: "Sam did it on Wednesday evening, after the hospital work, because it was on the list.",
      askPrompt: true,
      answer: { category: "documentation", causes: ["noRework"], prompt: false },
      feedback:
        "Planned documentation that could safely have moved to next week. Deciding what can wait is how the prompt work gets done, without shortening anyone’s review or working late.",
    },
    {
      id: "invoice",
      day: 3,
      title: "Thursday: the invoice",
      text: "A supplier invoice has last month’s rate on it. Sam calls the supplier, then Trilogy Care, then the supplier again: three calls to correct one line.",
      task: "invoice",
      detail: "Three calls to correct one line, while the review waited.",
      askPrompt: false,
      answer: { category: "supplier", causes: ["invoiceCorrection"], prompt: null },
      feedback:
        "Supplier coordination, with a reviewed rework cause: an invoice correction. This is time a Job Aid or an up-to-date rate list could genuinely reduce, without touching anyone’s care.",
    },
    {
      id: "handoff",
      day: 3,
      title: "Thursday: the handoff",
      text: "The handoff note after the hospital stay says the shower chair “is being arranged”, but not by whom. Sam makes four calls to find out who is booking it.",
      task: "handoff",
      detail: "The client managed without the chair for two more days while the calls went back and forth.",
      askPrompt: false,
      answer: { category: "documentation", causes: ["unclearHandoff"], prompt: null },
      feedback:
        "Documentation and handoff, tagged as an unclear handoff. Whose duty it was is “to confirm”: a role question for Maya and Trilogy Care to settle, not a reason for Sam to make fewer calls.",
    },
  ],
  explanations: [
    {
      id: "calls",
      text: "Sam spent about seven hours on calls with clients and families. If those calls were shorter, the review would have happened.",
      feedback:
        "Seven hours of conversation isn’t, by itself, a problem to cut. Most were routine check-ins and a family whose father’s needs had changed; one was caused by a missed visit. Shortening them pushes the problem onto clients and doesn’t touch the cause.",
      levels: { diagnosis: 0, evidence: 1, respect: 0 },
      flags: ["waste"],
    },
    {
      id: "mix",
      text: "Most of the week was necessary work. About five hours were rework caused elsewhere (a missed visit, an invoice error and an unclear handoff), and the discharge used the reserve. The review slipped because unplanned work had nowhere to go.",
      feedback:
        "That’s what the map shows. It keeps the necessary work (the discharge, the family calls) apart from the rework, names each cause, and explains the slipped review without blaming anyone.",
      levels: { diagnosis: 3, evidence: 3, respect: 3 },
      flags: [],
    },
    {
      id: "hire",
      text: "The week came to more than 38 hours, so Maya needs a second coordinator now.",
      feedback:
        "One pressured week beside a quieter one can’t show a sustained gap, and the five hours of rework would follow a new coordinator too. Hiring may become the answer; this week doesn’t show it yet.",
      levels: { diagnosis: 1, evidence: 1, respect: 2 },
      flags: [],
    },
    {
      id: "slow",
      text: "Sam isn’t managing time well: the tasks add up to more than the hours available.",
      feedback:
        "Tasks adding up to more than the hours points to overlapping entries or working late, not to anyone being unproductive. Using a time map to judge one person is exactly what it isn’t for.",
      levels: { diagnosis: 0, evidence: 1, respect: 1 },
      flags: ["surveillance"],
    },
  ],
  decisions: [
    {
      id: "process",
      text: "Fix the sources of rework first: agree with Trilogy Care who books equipment after a discharge, use the invoice Job Aid, and raise the missed visit with the supplier. Book the outstanding review for Monday, keep a real reserve, and look again in two weeks beside overdue reviews and callback times.",
      feedback:
        "Proportionate and testable. It names each cause, an owner and what would show it worked; it protects the review and the reserve; and it sets a date to look again before deciding about recruitment.",
      outcome:
        "The following week, the handoff names who books equipment and there are no chasing calls. The Job Aid catches one wrong rate before approval. A family still needs a long conversation about their father’s memory, and Sam gives it the time it needs. The review happens on Monday.",
      levels: { action: 3, respect: 3, evidence: 3 },
      flags: [],
    },
    {
      id: "cover",
      text: "Bring in a casual coordinator for four hours next week to catch up, then carry on as before.",
      feedback:
        "Cover helps with the overdue review, and that matters. But the causes stay: next week’s handoffs and invoice errors arrive just the same, and the cover has gone.",
      outcome: "The review gets done on Tuesday. By Thursday, another handoff with no owner and another wrong rate have filled the same hours again.",
      levels: { action: 1, respect: 2, evidence: 1 },
      flags: [],
    },
    {
      id: "hire",
      text: "Start recruiting a second coordinator now.",
      feedback:
        "It might become right, and the Hiring Runway lab is where to test it with cash and margin. But nothing here yet shows whether this week is usual, and a new coordinator would inherit the same rework while costing money from day one.",
      outcome:
        "Maya starts recruiting. Two months on there’s still no one, the rework continues, and Sam is still working late. The cash she kept in reserve starts to look thin.",
      levels: { action: 1, respect: 2, evidence: 1 },
      flags: [],
    },
    {
      id: "shorten",
      text: "Ask Sam to keep calls to ten minutes and move the review to next month to make room.",
      feedback:
        "It treats necessary conversations as waste and shortens an essential review to create artificial headroom. The causes stay, and clients carry the cost.",
      outcome:
        "Families call back more often because their questions weren’t answered. The client whose review moved has a fall that the review might have picked up.",
      levels: { action: 0, respect: 0, evidence: 1 },
      flags: ["waste", "cutReview"],
    },
    {
      id: "full",
      text: "Drop the reserve so every hour is booked: Sam can fit more in.",
      feedback:
        "A week with no reserve has nowhere for a discharge or a missed visit to go. Pushing towards full utilisation makes the next unplanned event displace planned care again.",
      outcome: "The next week has two unplanned events. With nothing kept back, both reviews slip.",
      levels: { action: 0, respect: 1, evidence: 1 },
      flags: ["utilisation"],
    },
  ],
  debrief:
    "Sam’s week had about 39 recorded hours against 38 available: an overrun, not a slow worker. Most of it was necessary: onboarding, a review, family calls and a discharge that couldn’t wait. About five hours were reviewed rework from three causes outside Sam’s control: a missed visit, an invoice with last month’s rate, and a handoff that didn’t say who was booking equipment. The week before was quieter, at about 32 hours. Two weeks can’t show a sustained gap; they show where to start. A good answer fixes the causes it can name, protects the review and the reserve, and sets a date to look again.",
  followingWeek:
    "Two weeks on, Maya puts the new weeks beside these. Handoff chasing has stopped, and invoice corrections are down to one. The overdue review was done. A conversation about a client’s memory loss still took the time it needed, and Sam still worked late one evening. Maya takes the figures to the Hiring Runway lab, deliberately, to test whether the remaining gap is sustained.",
  links: [
    {
      label: "Maya’s next coordinator: when to hire",
      href: "/magazine/mayas-next-coordinator-when-to-hire",
      why: "If a gap remains once the rework is fixed, and it lasts, it’s a recruitment question. Test it with cash and margin in the Hiring Runway lab.",
    },
    {
      label: "Plan my business (Work Tools)",
      href: "/tools/caseload-margin",
      why: "For owners: capacity, margin and cash over months, with your own figures.",
    },
  ],
  sources: [
    {
      title: "Funding for Support at Home care management",
      url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-for-support-at-home-care-management",
    },
    {
      title: "Services under Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/services-under-support-at-home",
    },
  ],
  rationale: {
    theme: "Overdue partner-owned reviews, callbacks running late and coordinators working late, with requests to hire before the work is understood.",
    themeOwner: "",
    audience: "Care Partner principals who employ coordinators; coordinators and Trilogy Care operations leaders using the fictional case.",
    behaviour:
      "Account for where coordination time goes, separating necessary work from rework, before choosing between a process fix, a supplier action, cover or hiring.",
    whyFit:
      "The problem is a judgement about mixed, unevenly distributed work. A time map makes the mix visible and lets a reader test a change without real staff or participant data.",
    reuse: "The Hiring Runway lab and Plan my business for staffing and cash; the invoice Job Aid for the invoice rework.",
    systemFix: "Discharge handoffs that don’t name an owner, and out-of-date supplier rates, are process problems: training alone won’t fix them.",
    measure: "Overdue partner-owned reviews, callback timeliness, supplier no-show rework and onboarding delays, owned by Operations.",
    decision: "",
  },
  approval: { owner: "", operations: "", quality: "", partnerships: "", privacy: "", pilot: "", approvedOn: "", reviewBy: "" },
};

export const WORKLOAD_CASES: { id: string; label: string; data: WorkloadLabData }[] = [
  { id: "coordinator-week", label: "Sam’s week (Maya’s business, 35 people, one coordinator)", data: COORDINATOR_WEEK },
];

/** The fictional case, as the model tests read it. */
export const WEEK_CASE = COORDINATOR_WEEK;
