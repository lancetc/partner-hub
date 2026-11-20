/*
  Onboarding (docs/onboarding.md): a person's setup as a short list of tasks that depend on who they are,
  shown first as a wizard and afterwards as a permanent "Your setup" list. Shared by the server and pages.

  Four things are kept apart on purpose: a task's status, a document's review, learning completion, and
  whether the account is active. A person is ready when every required task for them is approved, not
  merely submitted, and nothing they answer in "Check your starting point" can hold that up.
*/

export const TASK_KINDS = {
  details: { label: "Confirm your details", text: "Their name, and the role and organisation the Hub has for them." },
  acknowledge: { label: "Read and acknowledge", text: "A statement to read and agree to. Done as soon as they acknowledge it." },
  document: { label: "Provide a document", text: "A file to upload. A reviewer approves it or asks for a correction." },
  diagnostic: { label: "Check your starting point", text: "A few work situations, to suggest useful learning. Never pass or fail." },
  learning: { label: "First learning", text: "A Topic or Magazine course. Done when it’s completed in the usual way." },
} as const;
export type TaskKind = keyof typeof TASK_KINDS;

export type TaskScope = "person" | "organisation";
export const AUDIENCES = { staff: "Trilogy Care staff", coordinator: "Care coordinators", partner: "Care Partners and suppliers" } as const;
export type Audience = keyof typeof AUDIENCES;
export const ROLE_NAMES: Record<string, string> = { staff: "Trilogy Care staff", coordinator: "Care coordinator", partner: "Care Partner" };

/** One row of the requirements matrix. */
export type ConfigTask = {
  /** Stable across versions: it's how a person's work on a task is kept when the matrix changes. */
  id: string;
  kind: TaskKind;
  /** A person's own task, or one their organisation does once for all its people. */
  scope: TaskScope;
  title: string;
  why: string;
  /** Who it applies to; empty means everyone. */
  audiences: Audience[];
  required: boolean;
  /** A document for Quality to review, rather than the population's owner. */
  quality: boolean;
  /** For "acknowledge": what they're agreeing to. Changing it asks everyone to acknowledge again. */
  statement: string;
  /** For "learning": `topic:<slug>` or `course:<id>`. */
  asset: string;
  /** For "document": an approval lasts this many months; empty means it doesn't expire. */
  expiryMonths: number | null;
  minutes: number;
  /** Whether it applies to people who were already active when it was added, or only to people who start later. */
  existing: boolean;
  /** When it first went live. Set when its version is made active. */
  addedAt: string | null;
};

export const TASK_STATUS = {
  not_started: { label: "Not started", meaning: "You can begin this task." },
  in_progress: { label: "In progress", meaning: "Your work is saved; continue when you’re ready." },
  submitted: { label: "Submitted", meaning: "It’s being reviewed. There’s nothing you need to do." },
  needs_action: { label: "Needs action", meaning: "Something needs correcting. See the reason and resubmit." },
  approved: { label: "Complete", meaning: "This requirement is satisfied." },
  renew: { label: "Due to renew", meaning: "It’s still valid, but it’s coming up for renewal." },
  expired: { label: "Expired", meaning: "This no longer satisfies the requirement. Provide a current one." },
} as const;
export type TaskStatus = keyof typeof TASK_STATUS;

/** A status that satisfies a requirement right now. */
export const satisfied = (s: TaskStatus) => s === "approved" || s === "renew";
/** A status the person (or their organisation's administrator) has to act on. */
export const actionable = (s: TaskStatus) => s === "not_started" || s === "in_progress" || s === "needs_action" || s === "expired" || s === "renew";

export const SETUP_STATES = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_review: "Waiting for review",
  needs_action: "Needs action",
  ready: "Ready to start",
  active: "Active",
  renewal: "Renewal required",
} as const;
export type SetupState = keyof typeof SETUP_STATES;
/** Whose move it is. A pending review is never the person's fault. */
export type WaitingOn = "you" | "reviewer" | "organisation" | "no-one";

export type TaskView = {
  id: string;
  rowId: string | null;
  kind: TaskKind;
  scope: TaskScope;
  title: string;
  why: string;
  required: boolean;
  minutes: number;
  status: TaskStatus;
  /** The requirement is satisfied right now. A renewal waiting for review still is, while the earlier approval lasts. */
  ok: boolean;
  /** Whether this person can act on it. An organisation's task is its administrator's. */
  mine: boolean;
  /** Who's reviewing it, in words. */
  reviewer: string;
  statement: string;
  asset: { label: string; href: string } | null;
  document: { id: string; name: string; uploadedAt: string } | null;
  reason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  /** A reference to quote when asking for help with a review or an upload. */
  reference: string | null;
};

/**
  The overall state, from the tasks that are required of this person right now. Optional tasks never
  count. Once active, anything required that stops being satisfied makes it "Renewal required".
*/
export function setupState(
  tasks: Pick<TaskView, "required" | "status" | "mine" | "ok">[],
  opts: { started: boolean; activatedAt: string | null },
): { state: SetupState; waitingOn: WaitingOn } {
  const required = tasks.filter((t) => t.required);
  const open = required.filter((t) => !t.ok);
  if (!open.length) return opts.activatedAt ? { state: "active", waitingOn: "no-one" } : { state: "ready", waitingOn: "you" };
  const mine = open.filter((t) => t.mine && t.status !== "submitted");
  const waitingOn: WaitingOn = mine.length ? "you" : open.some((t) => t.status === "submitted") ? "reviewer" : "organisation";
  if (opts.activatedAt) return { state: "renewal", waitingOn };
  if (mine.some((t) => t.status === "needs_action" || t.status === "expired")) return { state: "needs_action", waitingOn };
  if (mine.length) return { state: opts.started || required.some((t) => t.status !== "not_started") ? "in_progress" : "not_started", waitingOn };
  return { state: "awaiting_review", waitingOn };
}

/** The dashboard's four sections. A task that's with a reviewer is never under "Your next action". */
export function sections<T extends Pick<TaskView, "required" | "status" | "mine" | "ok">>(tasks: T[]) {
  const next: T[] = [];
  const waiting: T[] = [];
  const done: T[] = [];
  const optional: T[] = [];
  for (const t of tasks) {
    if (t.status === "submitted" || (!t.mine && !t.ok)) waiting.push(t);
    else if (t.status === "approved") done.push(t);
    else if (!t.required) optional.push(t);
    else next.push(t);
  }
  return { next, waiting, done, optional };
}

export const DOCUMENT_TYPES = "PDF, JPG, PNG or WebP, up to 10 MB";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** How far ahead an approved item is flagged "Due to renew". */
export const RENEW_DAYS = 30;

// ---------------------------------------------------------------------------------------------
// Check your starting point
// ---------------------------------------------------------------------------------------------

export const DIAGNOSTIC = {
  label: "Check your starting point",
  intro: "A few work situations help us suggest useful learning. This is not a pass or fail. Choose “I’m not sure” whenever that is the honest answer.",
  minItems: 3,
  maxItems: 10,
};
/** The choice that's always offered. It isn't a wrong answer; it's a signal that learning would help. */
export const UNSURE = "unsure";
export const CONFIDENCE = ["Not confident yet", "A little confident", "Fairly confident", "Very confident"] as const;

export type InstrumentItem = { questionId: string; version: number; competencyId: string | null };

export type DiagnosticQuestion = { id: string; stem: string; context: string | null; options: { id: string; text: string }[] };
export type DiagnosticResult = {
  completedAt: string;
  /** What they were asked, with their first answer and the reviewed guidance. Shown once every answer is recorded. */
  answers: { id: string; stem: string; chosen: string; outcome: "right" | "other" | "unsure"; guidance: string | null; best: string }[];
  /** Learning suggested from the answers, with why. No overall score is ever shown. */
  suggestions: { label: string; href: string; why: string }[];
};

/** A start-of-role signal for a competency: what was asked and answered, labelled as a baseline and nothing more. */
export type BaselineSignal = { competencyId: string; asked: number; right: number; unsure: number; at: string; instrumentVersion: number };
