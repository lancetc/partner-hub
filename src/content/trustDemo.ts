import type { EvidenceKind, OwnerRole, Signal, Workflow } from "@/lib/trustCheck";

/*
  The 28-Day Trust Check Work Tool's DEMO DATA (docs/trust-check.md). Five invented issues for a fictional business, so
  the workbench, its four questions and its guarded statuses can be reviewed before any real data is connected. There
  is no participant name, address, phone number, date of birth, diagnosis or complaint text anywhere here: issues are
  "Demo issue A" to "E", and references are visibly fake ("DEMO-CMP-0142").

  DATA_SOURCES is what a real pilot would need, source by source, each `connected: false` until Trilogy Care approves
  a data contract (source owner, field, lawful purpose, allowed roles and business boundary, freshness, suppression,
  retention, audit and correction). PILOT_SETTINGS are the settings and dependencies still to decide.
*/

export const DATA_SOURCES = [
  {
    id: "bookings",
    label: "Bookings and rostering",
    system: "Portal / CRM",
    owner: "Care Coordination operations",
    needs: "Planned, booked and cancelled visits, with the initiating reason and last sync time, for participants the business is authorised to support",
    connected: false,
  },
  {
    id: "delivery",
    label: "Delivery records",
    system: "Supplier records through the Portal",
    owner: "Care Coordination operations and supplier management",
    needs: "Delivered visits by date, so a booking is never read as delivery",
    connected: false,
  },
  {
    id: "claims",
    label: "Claims, statements and budget",
    system: "Finance / billing",
    owner: "Finance",
    needs: "Processed, pending and scheduled values kept apart, statement lines and the feed’s freshness. Never a churn score.",
    connected: false,
  },
  {
    id: "preferences",
    label: "Contact and sharing preferences",
    system: "CRM",
    owner: "Privacy and Operations",
    needs: "How the person prefers to be contacted, and what each supporter may be told, topic by topic",
    connected: false,
  },
  {
    id: "complaints",
    label: "Complaints",
    system: "The complaints system of record",
    owner: "Quality / complaints",
    needs: "A read-only reference, owner and status. Never a copy of the complaint, and never changed from here",
    connected: false,
  },
  {
    id: "incidents",
    label: "Clinical and incident escalations",
    system: "The incident system of record",
    owner: "Clinical governance and Quality",
    needs: "A link to the authoritative record. Nothing clinical is copied into the Hub",
    connected: false,
  },
  {
    id: "exits",
    label: "Exits and transfers",
    system: "Operations",
    owner: "Operations and Quality",
    needs: "That a transfer was chosen, and the exit obligations’ status. Never a reason the person didn’t choose to give",
    connected: false,
  },
] as const;

export const PILOT_SETTINGS = [
  {
    label: "Follow-up cadence",
    value: "Day 0 signal review, an early owner check, about Day 7 and by Day 28 (configurable by issue type)",
    owner: "Operations / Quality",
  },
  { label: "Urgent escalation", value: "Existing clinical and incident process, immediately: never queued here", owner: "Clinical governance / Quality" },
  {
    label: "Who sees an issue",
    value: "Only participants and staff the business is authorised to support under the Trilogy Care relationship",
    owner: "Partnerships / Operations / Privacy",
  },
  { label: "Data freshness", value: "Each signal shows its source and last sync; stale data is labelled, never hidden", owner: "Portal / Finance / CRM owner" },
  { label: "Small groups in reports", value: "Fewer than 5: counts only", owner: "Analytics / Privacy" },
  { label: "Retention, audit and correction", value: "Not decided: no real record is kept until they are", owner: "Privacy / security" },
] as const;

/** A demo issue: anonymous, with the four questions the operational mode answers (PRD section 14). */
export type DemoIssue = {
  id: string;
  label: string;
  theme: string;
  /** What do we know? Signals in the engine's shape, so the same triage reads them. */
  signals: Signal[];
  /** What did the person say? A short demo line. */
  said: string;
  /** Who owns the action? */
  owner: OwnerRole | "";
  status: Workflow;
  lastVerified: string;
  nextContact: string;
  /** Follow-up records: what happened. */
  evidence: Signal[];
  /** The evidence kinds "Resolved with person" needs for this issue. */
  resolveNeeds: EvidenceKind[];
  /** A read-only reference to the authoritative complaint or incident record. */
  complaintRef: string;
  incidentRef: string;
  /** The person has told us they've chosen to move. */
  transferChoice: boolean;
};

const s = (id: string, title: string, noticed: string, x: Partial<Signal> = {}): Signal => ({
  id,
  phase: "notice",
  checkpoint: "",
  group: "gaps",
  title,
  noticed,
  matters: "",
  alternatives: "",
  verify: "",
  canAct: "",
  source: "Demo data",
  updated: "",
  reliability: "verified",
  kind: "",
  visits: [],
  budget: null,
  hidden: false,
  only: [],
  notIn: [],
  ...x,
});

export const DEMO_ISSUES: DemoIssue[] = [
  {
    id: "demo-a",
    label: "Demo issue A",
    theme: "Missed service",
    signals: [
      s("a-visits", "Two visits not delivered", "Two weekly cleans cancelled by the supplier, a week apart. No replacement delivered.", {
        group: "delivery",
        updated: "Demo: 2 days ago",
        visits: [
          { date: "2026-11-10", outcome: "missed", reason: "supplier", note: "Supplier cancelled on the morning." },
          { date: "2026-11-17", outcome: "missed", reason: "supplier", note: "Supplier cancelled the evening before." },
        ],
      }),
    ],
    said: "Wants the usual weekday morning back, with someone who turns up.",
    owner: "booking",
    status: "actionDue",
    lastVerified: "Demo: 2 days ago",
    nextContact: "Demo: Friday, after the roster",
    evidence: [
      s("a-booked", "Booking confirmed", "Another approved supplier booked for the usual morning.", { kind: "booking", checkpoint: "day7", phase: "check" }),
      s("a-delivered", "Delivered", "The first visit with the new supplier was delivered.", { kind: "delivery", checkpoint: "day7", phase: "check" }),
      s("a-person", "The person’s view", "“They came on time. That’s all I wanted.”", {
        kind: "person",
        reliability: "reported",
        checkpoint: "day7",
        phase: "check",
      }),
    ],
    resolveNeeds: ["delivery", "person"],
    complaintRef: "",
    incidentRef: "",
    transferChoice: false,
  },
  {
    id: "demo-b",
    label: "Demo issue B",
    theme: "Statement question, with a complaint",
    signals: [
      s("b-line", "A statement line queried", "The person doesn’t recognise one line on their statement.", {
        group: "money",
        kind: "billing",
        reliability: "reported",
        updated: "Demo: 4 days ago",
      }),
    ],
    said: "Wants to know what the charge was. Has made a complaint, and wants it looked at.",
    owner: "billing",
    status: "waitingOwner",
    lastVerified: "Demo: 4 days ago",
    nextContact: "Demo: when billing has reviewed the line",
    evidence: [
      s("b-credit", "Billing", "The line was billed in error and has been credited.", { kind: "billing", checkpoint: "day7", phase: "check" }),
      s("b-person", "The person’s view", "“Thank you for explaining it.”", { kind: "person", reliability: "reported", checkpoint: "day7", phase: "check" }),
    ],
    resolveNeeds: ["billing", "person"],
    complaintRef: "DEMO-CMP-0142",
    incidentRef: "",
    transferChoice: false,
  },
  {
    id: "demo-c",
    label: "Demo issue C",
    theme: "Low spend after a planned pause",
    signals: [
      s("c-visits", "Two visits not delivered", "Paused at the person’s request while they were away; agreed and recorded.", {
        group: "delivery",
        updated: "Demo: last week",
        visits: [
          { date: "2026-11-03", outcome: "missed", reason: "pause", note: "Paused at their request." },
          { date: "2026-11-10", outcome: "missed", reason: "pause", note: "Paused at their request." },
        ],
      }),
      s("c-budget", "A large balance on the dashboard", "About 45% of the quarter shows as unspent in week 8.", {
        group: "money",
        reliability: "stale",
        updated: "Demo: 5 days ago",
        budget: {
          quarterlyCents: 500_000,
          week: 8,
          weeks: 12,
          plannedToDateCents: 320_000,
          deliveredToDateCents: 290_000,
          claimedToDateCents: 275_000,
          pendingClaimsCents: 15_000,
          scheduledRemainderCents: 160_000,
          pausedCents: 30_000,
          feedUpdated: "Demo: 5 days ago",
        },
      }),
    ],
    said: "Back home, and happy with the services as they are.",
    owner: "coordinator",
    status: "needsVerification",
    lastVerified: "Demo: last week",
    nextContact: "Demo: next scheduled contact",
    evidence: [
      s("c-restarted", "Delivered", "Services restarted as planned.", { kind: "delivery", checkpoint: "day7", phase: "check" }),
      s("c-person", "The person’s view", "“All back to normal, thanks.”", { kind: "person", reliability: "reported", checkpoint: "day7", phase: "check" }),
    ],
    resolveNeeds: ["delivery", "person"],
    complaintRef: "",
    incidentRef: "",
    transferChoice: false,
  },
  {
    id: "demo-d",
    label: "Demo issue D",
    theme: "Wants to change provider",
    signals: [
      s("d-said", "The person said they’d like to move", "Said on a call that they’ve chosen a provider nearer their family.", {
        group: "person",
        kind: "transfer",
        reliability: "reported",
        updated: "Demo: yesterday",
      }),
    ],
    said: "Has chosen to move in the new year. Wants their records and final statement sorted.",
    owner: "coordinator",
    status: "checking",
    lastVerified: "Demo: yesterday",
    nextContact: "Demo: agreed handoff call",
    evidence: [
      s("d-choice", "Their decision", "“I’ve made up my mind, thank you for everything.”", {
        kind: "transfer",
        reliability: "reported",
        checkpoint: "day7",
        phase: "check",
      }),
    ],
    resolveNeeds: ["delivery", "person"],
    complaintRef: "",
    incidentRef: "",
    transferChoice: true,
  },
  {
    id: "demo-e",
    label: "Demo issue E",
    theme: "A possible safety concern",
    signals: [
      s("e-said", "Mentioned on a call", "Mentioned a slip at home last week.", {
        group: "person",
        kind: "safety",
        reliability: "reported",
        updated: "Demo: today",
      }),
    ],
    said: "Asked for no fuss. The clinical team has been told.",
    owner: "clinical",
    status: "escalated",
    lastVerified: "Demo: today",
    nextContact: "Demo: set by the clinical lead",
    evidence: [],
    resolveNeeds: ["delivery", "person"],
    complaintRef: "",
    incidentRef: "DEMO-INC-0031",
    transferChoice: false,
  },
];
