import type { Diagnosis, EventKind, ResponseData, Risk, SourceKind, ThemeStatus } from "@/lib/problemDesk";

/*
  Fictional pilot data for the Problem desk (docs/learning-designer.md): one invoice rate-mismatch theme followed
  through, a single serious safety theme, a theme already addressed without a course, and two signals nobody has
  grouped yet. Every case reference, number and owner is made up, and each theme is marked as sample data. It
  exists so the trail can be followed end to end before any real feed is approved.
*/

type PilotCase = { source: SourceKind; ref: string; summary: string; falseMatch?: boolean; events: [EventKind, string, string][] };
export type PilotTheme = {
  id: string;
  title: string;
  description: string;
  status: ThemeStatus;
  statusNote: string;
  risk: Risk;
  roles: string;
  segment: string;
  denominator: number | null;
  denominatorNote: string;
  owner: string;
  priorityNote: string;
  verified: boolean;
  diagnosis?: Diagnosis;
  response?: ResponseData;
  cases: PilotCase[];
  actions?: {
    prior: boolean;
    kind: string;
    title: string;
    owner: string;
    audience: string;
    /** A Topic to link if it exists in this Hub; otherwise the action has no asset. */
    topic?: string;
    intended: string;
    on: string;
    due: string;
    status: string;
    result: string;
    interpretation: string;
    snapshot: string;
    snapshotAt: string;
  }[];
  metrics?: { metric: "work" | "practice"; bucket: string; numerator: number; denominator: number; note: string }[];
};

export const PILOT_THEMES: PilotTheme[] = [
  {
    id: "theme-invoice-rates",
    title: "Invoices approved at rates that differ from the agreement",
    description:
      "Billing corrections and two complaints point to invoice lines approved at a rate different from the supplier’s current agreement. De-identified summaries only; the billing and complaint records stay in their own systems.",
    status: "plan",
    statusNote: "",
    risk: "elevated",
    roles: "Care Coordinators who approve supplier invoices",
    segment: "Self-managed and coordinator-managed, all states",
    denominator: 1260,
    denominatorNote: "Eligible invoices approved a month, from the Finance report (fictional figure).",
    owner: "Finance operations lead (fictional)",
    priorityNote: "Recurring, affects money owed to suppliers and clients’ budgets, and a fix looks possible.",
    verified: true,
    diagnosis: {
      situation: "approving a supplier invoice in the Portal",
      role: "some Care Coordinators",
      observed: "approve the invoice total without comparing each line’s rate with the current agreement",
      desired: "check each invoice line against the agreed service and rate, and query a mismatch before approving",
      barriers: [
        {
          id: "b-attention",
          barrier: "attention",
          text: "They have the agreement open but don’t compare each service line",
          evidence: "A sample of 20 corrected invoices: in 13 the agreement had been opened that day.",
          confidence: "known",
          validator: "Finance operations lead (fictional)",
        },
        {
          id: "b-access",
          barrier: "access",
          text: "Others can’t quickly find the current agreement from the invoice screen",
          evidence: "Three Portal questions asking where the agreement is. Not yet checked more widely.",
          confidence: "suspected",
          validator: "Portal product owner (fictional)",
        },
      ],
      unknowns: "Whether both patterns are widespread, and whether newer coordinators are over-represented.",
      checkedWith: "Two coordinators and the Finance operations lead walked through three real approvals.",
      verified: true,
    },
    response: {
      problem: "Six linked cases since June: invoice lines approved at a rate different from the current agreement, found later as billing rework.",
      audience: "Care Coordinators who approve supplier invoices",
      audienceSize: 420,
      desired: "Check each invoice line against the agreed service and rate, and query a mismatch before approving.",
      barrierSummary: "Known: the line-by-line comparison is skipped. Suspected: the agreement is hard to find from the invoice screen.",
      learning: "revise",
      why: "The existing invoice Topic already teaches the rule, and practice results are reasonable, so a second course would repeat it. The gap is a comparison at the moment of approval: fix agreement access in the Portal, and revise the Topic to practise the line-by-line check.",
      measure: {
        name: "Verified rate-mismatch rework per 100 eligible invoices",
        definition:
          "Invoices corrected after approval because a line’s rate differed from the agreement, divided by eligible invoices approved in the month, times 100.",
        owner: "Finance operations lead (fictional)",
        link: "",
      },
      baseline: { window: "June to October 2026", note: "About 1.3 per 100 (78 of 6,185). Entered by hand from the Finance report." },
      lag: "Rework is found two to four weeks after approval, so allow six weeks after each change.",
      competing: "A new supplier price list in September; month-end volume.",
      reviewOn: "2027-02-15",
      effort: { authorHours: 6, reviewHours: 3, learnerMinutes: 8, supportHours: 2, maintenance: "Review when the agreement screen changes." },
      assignment: { required: false, roles: "Coordinators with invoice approval", reason: "Recommended to people doing the task; not mandatory.", due: "" },
      owner: "Finance operations lead (fictional)",
      brief: { hasArtefact: true, hasSource: true, assessed: false },
    },
    cases: [
      {
        source: "billing",
        ref: "BR-PRACTICE-0412",
        summary: "Cleaning invoice approved at a higher hourly rate than the agreement; corrected after the supplier queried the remittance.",
        events: [
          ["initial", "2026-06-09", "Rework raised."],
          ["update", "2026-06-16", "Supplier asked again about the short payment."],
          ["update", "2026-06-30", "Second invoice from the same supplier with the same rate."],
          ["update", "2026-07-14", "Supplier asked for the agreement to be reissued."],
          ["close", "2026-07-21", "Corrected and paid."],
        ],
      },
      {
        source: "complaint",
        ref: "CMP-PRACTICE-118",
        summary: "A client’s family complained their budget statement showed a higher gardening rate than they’d agreed.",
        events: [
          ["initial", "2026-07-02", "Complaint received and acknowledged in the complaints system."],
          ["close", "2026-07-20", "Statement corrected."],
          ["reopen", "2026-08-11", "The next statement showed the old rate again."],
          ["close", "2026-08-25", "Agreement record fixed."],
        ],
      },
      {
        source: "billing",
        ref: "BR-PRACTICE-0533",
        summary: "Transport invoice approved with a per-trip rate from a superseded agreement.",
        events: [["initial", "2026-08-05", "Rework raised."]],
      },
      {
        source: "billing",
        ref: "BR-PRACTICE-0561",
        summary: "Personal care invoice: weekend rate applied to a weekday visit.",
        events: [
          ["initial", "2026-09-14", "Rework raised."],
          ["update", "2026-09-22", "Supplier disputed the correction."],
        ],
      },
      {
        source: "portal",
        ref: "PQ-PRACTICE-2231",
        summary: "“Where do I find the current agreement when I’m looking at an invoice?”",
        events: [["initial", "2026-09-30", "Asked in the Portal help form."]],
      },
      {
        source: "billing",
        ref: "BR-PRACTICE-0702",
        summary: "Meal delivery invoice approved at last year’s rate.",
        events: [["initial", "2026-10-20", "Rework raised."]],
      },
      {
        source: "complaint",
        ref: "CMP-PRACTICE-131",
        summary: "A supplier complained about a late payment. No rate difference was involved.",
        falseMatch: true,
        events: [["initial", "2026-10-28", "Suggested as a match because it mentions an invoice; marked unrelated."]],
      },
    ],
    actions: [
      {
        prior: true,
        kind: "learning",
        title: "Invoice Topic updated with a worked rate example",
        owner: "Partner Enablement",
        audience: "All Care Coordinators",
        topic: "what-a-good-invoice-looks-like",
        intended: "Compare the invoice rate with the agreement before approving.",
        on: "2026-07-28",
        due: "",
        status: "done",
        result: "mixed",
        interpretation: "Many learners choose the correct response in practice; invoice rework has not yet fallen.",
        snapshot: "71 of 88 first attempts correct on the rate question in September.",
        snapshotAt: "2026-10-05",
      },
      {
        prior: true,
        kind: "comms",
        title: "Coordinator email: check the rate before you approve",
        owner: "Partner Operations",
        audience: "All Care Coordinators",
        intended: "Remind coordinators of the rule.",
        on: "2026-08-04",
        due: "",
        status: "done",
        result: "no_change",
        interpretation: "Rework in September was no lower than in July. An email alone doesn’t change what happens at the approval screen.",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "portal",
        title: "Show the current agreement beside each invoice line",
        owner: "Portal product owner (fictional)",
        audience: "Everyone approving invoices",
        intended: "Make the comparison possible without leaving the screen.",
        on: "",
        due: "2026-12-15",
        status: "in_progress",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "learning",
        title: "Revise the invoice Topic: a line-by-line comparison and one decision",
        owner: "Partner Enablement",
        audience: "Coordinators with invoice approval",
        topic: "what-a-good-invoice-looks-like",
        intended: "Practise checking each line against the agreement and deciding what to do with a mismatch.",
        on: "",
        due: "2027-01-12",
        status: "planned",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "job_aid",
        title: "Three-check card on the invoice review screen",
        owner: "Finance operations lead (fictional)",
        audience: "Everyone approving invoices",
        intended: "A cue at the point of work: service, rate, units.",
        on: "",
        due: "2026-12-15",
        status: "planned",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
    ],
    metrics: [
      { metric: "work", bucket: "2026-06", numerator: 14, denominator: 1180, note: "" },
      { metric: "work", bucket: "2026-07", numerator: 16, denominator: 1240, note: "" },
      { metric: "work", bucket: "2026-08", numerator: 15, denominator: 1210, note: "Topic updated 28 July; email 4 August." },
      { metric: "work", bucket: "2026-09", numerator: 17, denominator: 1295, note: "New supplier price list this month." },
      { metric: "work", bucket: "2026-10", numerator: 16, denominator: 1260, note: "" },
      { metric: "practice", bucket: "2026-08", numerator: 50, denominator: 80, note: "First attempts correct on the rate question." },
      { metric: "practice", bucket: "2026-09", numerator: 71, denominator: 88, note: "" },
      { metric: "practice", bucket: "2026-10", numerator: 77, denominator: 92, note: "" },
    ],
  },
  {
    id: "theme-fall-not-reported",
    title: "A visit continued after a client’s fall without a report",
    description: "One incident review: a worker finished the visit after an unwitnessed fall and mentioned it the next day. Rare, but serious.",
    status: "immediate",
    statusNote: "Handled through the incident pathway on the day. This entry only tracks whether a learning response is also needed.",
    risk: "safety",
    roles: "Care workers and the coordinators who brief them",
    segment: "One Care Partner business",
    denominator: null,
    denominatorNote: "",
    owner: "Quality lead (fictional)",
    priorityNote: "A single case, but the potential harm is high: it sits above more common, lower-risk themes.",
    verified: true,
    cases: [
      {
        source: "incident",
        ref: "INC-PRACTICE-07",
        summary: "Unwitnessed fall during a visit; reported the following day.",
        events: [["initial", "2026-10-12", "Incident review opened in the incident system."]],
      },
    ],
  },
  {
    id: "theme-travel-charges",
    title: "Questions about travel charges on invoices",
    description: "Suppliers asking whether travel can be billed as its own line.",
    status: "addressed",
    statusNote: "The existing travel Topic covers it. A link went in the coordinator newsletter; no new course.",
    risk: "routine",
    roles: "Care Coordinators",
    segment: "All",
    denominator: null,
    denominatorNote: "",
    owner: "Partner Enablement",
    priorityNote: "Common but low risk, and already answered.",
    verified: true,
    cases: [
      {
        source: "portal",
        ref: "PQ-PRACTICE-1987",
        summary: "Can travel be a separate line?",
        events: [["initial", "2026-08-18", "Asked in the Portal help form."]],
      },
      {
        source: "portal",
        ref: "PQ-PRACTICE-2040",
        summary: "Supplier billed travel time as service hours.",
        events: [["initial", "2026-09-03", "Asked in the Portal help form."]],
      },
      {
        source: "community",
        ref: "COM-PRACTICE-55",
        summary: "A thread asking how others handle travel.",
        events: [["initial", "2026-09-19", "Raised in Community."]],
      },
    ],
  },
];

/** Signals nobody has grouped yet. */
export const PILOT_UNGROUPED: PilotCase[] = [
  {
    source: "billing",
    ref: "BR-PRACTICE-0745",
    summary: "Invoice approved for a service outside the supplier’s approved scope.",
    events: [["initial", "2026-11-04", "Rework raised."]],
  },
  {
    source: "content",
    ref: "CR-PRACTICE-12",
    summary: "A learner reported that the invoice Topic’s example uses an old form.",
    events: [["initial", "2026-11-10", "Reported from the Topic."]],
  },
];
