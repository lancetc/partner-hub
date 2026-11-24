import type { Outcome, Reviewer, Stage } from "@/lib/shadowCoach";

/*
  The First 100 Days coaching workbench's demo data (docs/shadow-and-coach.md, "The workbench"). Everything here is
  fictional and unnamed: two demo hires, the framework's checks, defined tasks, process themes and a draft role and
  delegation matrix. The workbench reads this file and its own tables, and nothing else, until Trilogy Care approves a
  data contract for real people.

  It's a shell on purpose. No scores, no ranking, no free text: a coaching record must never become a performance,
  disciplinary or HR record, and real QA, incident and HR records stay in their own systems (as references, once
  approved, never copies).
*/

export const DEMO_NOTICE =
  "Demo data only. The First 100 Days workbench doesn’t read or store real employee, participant, QA, incident or HR records, and it won’t until Trilogy Care approves the data, consent, access and retention design. Nothing here assigns real learning, signs anyone off or creates an employment record.";

/** The real sources a pilot would need. None is connected: each needs Trilogy Care's approval first. */
export const DATA_SOURCES = [
  { id: "employee-records", label: "Coordinator employment and contractor records", owner: "People/HR and the partner business", connected: false },
  { id: "learning-assignments", label: "Hub learning assignments and completions for real coordinators", owner: "Partner Enablement", connected: false },
  { id: "qa-records", label: "Provider QA findings (as a reference, never a copy)", owner: "Quality", connected: false },
  { id: "incident-system", label: "Incident management system (authoritative; a reference only)", owner: "Quality/incident management", connected: false },
  { id: "call-samples", label: "Real call recordings, notes or care plans as samples", owner: "Privacy/security and the QA owner", connected: false },
] as const;

/**
  The role and delegation matrix (PRD section 15, RoleDelegation): a draft for Trilogy Care to confirm. Until it's
  approved, the workbench shows it as a draft and the simulation's sign-off scopes say "draft delegation".
*/
export const ROLE_MATRIX: { id: string; decision: string; manager: string; route: string; approved: boolean }[] = [
  {
    id: "coaching",
    decision: "General coaching",
    manager: "Observe, ask about reasoning, assign approved learning, schedule another observation.",
    route: "Employment or disciplinary decisions follow the business’s HR process and the Trilogy Care agreement.",
    approved: false,
  },
  {
    id: "contributions",
    decision: "Contribution advice",
    manager: "Stop repeating unverified advice, check the current source, route corrections through the authorised team.",
    route: "Services Australia determines the rate; billing changes go through the approved provider process.",
    approved: false,
  },
  {
    id: "incident",
    decision: "Possible harm or incident",
    manager: "Protect the person, record facts, escalate promptly by the approved incident route.",
    route: "The authorised provider team assesses reportability, priority and any external notification.",
    approved: false,
  },
  {
    id: "clinical",
    decision: "Clinical concern or care-plan change",
    manager: "Recognise the issue and involve the correct clinical or care-management reviewer.",
    route: "Clinical assessment and sign-off stay with authorised professionals and the registered provider.",
    approved: false,
  },
];

/** Defined tasks a manager may record an observation against: readiness is always scoped to one of these. */
export const DEFINED_TASKS: { id: string; label: string; reviewer: Reviewer | "" }[] = [
  { id: "explain-contributions", label: "Explain contribution categories using the current source during a supervised call", reviewer: "" },
  { id: "escalate-incident", label: "Recognise and escalate a possible incident, with exact words, during supervised work", reviewer: "quality" },
  { id: "person-voice-plan", label: "Record the older person’s own goal, agreed action, owner and review trigger in a care plan draft", reviewer: "clinical" },
  { id: "invoice-check", label: "Check a supplier invoice line against the approved agreement before approval", reviewer: "" },
];

export const PROCESS_THEMES = [
  { id: "outdated-source", label: "An out-of-date source, sheet or script" },
  { id: "form-design", label: "A form that steers people the wrong way" },
  { id: "unclear-handoff", label: "Unclear ownership or handoff" },
  { id: "workload", label: "Workload or capacity" },
] as const;
export type ProcessTheme = (typeof PROCESS_THEMES)[number]["id"];

/** Evidence and outstanding checks per stage (PRD section 5): never a progress bar that reaches "competent" on day 100. */
export const STAGE_CHECKS: Record<Stage, { id: string; label: string }[]> = {
  orient: [
    { id: "finds-aids", label: "Finds the current Job Aids for contributions and incidents" },
    { id: "asks-for-help", label: "Explains when and how to ask for help" },
    { id: "supervised-task", label: "Documents one supervised task accurately" },
  ],
  practise: [
    { id: "corrects-with-source", label: "Corrects advice with reference to the approved source" },
    { id: "escalation-triggers", label: "Recognises escalation triggers in a practice case" },
  ],
  independence: [
    { id: "two-samples", label: "Consistent across more than one sampled piece of work" },
    { id: "facts-change", label: "Adjusts when the facts change" },
  ],
  consolidate: [
    { id: "readiness-conversation", label: "A documented readiness conversation, scoped to defined tasks" },
    { id: "supervision-agreed", label: "Ongoing supervision agreed where needed" },
  ],
};

export type DemoHire = {
  id: string;
  label: string;
  role: string;
  started: string;
  stage: Stage;
  nextMeeting: string;
  /** Read-only references to separate processes. In a pilot these would be links to the authoritative system. */
  references: { kind: "qa" | "incident"; label: string }[];
  seed: { checks: string[]; observations: { task: string; outcome: Outcome; date: string; shared: boolean }[] };
};

/** Two fictional, unnamed hires. Listed by start date, never by any measure of how they're doing. */
export const DEMO_HIRES: DemoHire[] = [
  {
    id: "demo-hire-a",
    label: "Demo hire A",
    role: "Care coordinator, 0.6 FTE (fictional)",
    started: "2027-02-01",
    stage: "practise",
    nextMeeting: "2027-02-22",
    references: [{ kind: "qa", label: "A provider QA reference would appear here once approved (not connected)" }],
    seed: { checks: ["finds-aids", "asks-for-help", "supervised-task"], observations: [] },
  },
  {
    id: "demo-hire-b",
    label: "Demo hire B",
    role: "Care coordinator, 1.0 FTE (fictional)",
    started: "2027-01-11",
    stage: "independence",
    nextMeeting: "2027-03-01",
    references: [{ kind: "incident", label: "An incident-process reference would appear here once approved (not connected)" }],
    seed: {
      checks: ["finds-aids", "asks-for-help", "supervised-task", "corrects-with-source"],
      observations: [{ task: "explain-contributions", outcome: "signoff", date: "2027-02-10", shared: true }],
    },
  },
];
