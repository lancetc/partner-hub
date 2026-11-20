import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AUDIENCES,
  MAX_DOCUMENT_BYTES,
  RENEW_DAYS,
  ROLE_NAMES,
  satisfied,
  sections,
  setupState,
  TASK_KINDS,
  type Audience,
  type ConfigTask,
  type SetupState,
  type TaskKind,
  type TaskStatus,
  type TaskView,
} from "@/lib/onboarding";
import { domainOf, type Domain } from "@/lib/capability";
import { audit, ensureOnboarding, tx, type Db } from "./db";
import { HttpError, userById, type User } from "./auth";
import { assets, capAccess, type Access, type Asset } from "./capability";
import { notify } from "./notifications";

/*
  Onboarding (docs/onboarding.md).

  - What a person has to do comes from the active requirements matrix and who they are now (their
    audience and organisation), worked out on every read. Nothing is a cached tick from their first visit.
  - Ready means every required task is approved. Submitted isn't approved; optional never counts.
  - A person can't change their own role or organisation: they can only ask.
  - Documents are kept in a private folder and served only to the person who provided them, their
    organisation's administrator (for an organisation's document) and the people who review them.
  - Employees and external partners have separate reviewers, as in Capability Intelligence.
*/

const DIR = process.env.HUB_ONBOARDING_DIR ?? path.join(process.cwd(), "data", "onboarding");
/** Organisations that are Trilogy Care itself: its people are employees, and it has no organisation tasks to review. */
const INTERNAL_ORG = "trilogy";

type ConfigRow = {
  version: number;
  status: "draft" | "active" | "retired";
  tasks: string;
  note: string;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};
type InstanceRow = {
  user_id: string;
  config_version: number | null;
  started_at: string;
  last_step: string | null;
  wizard_done_at: string | null;
  activated_at: string | null;
  updated_at: string;
};
type TaskRow = {
  id: string;
  task_id: string;
  subject_kind: "person" | "org";
  subject_id: string;
  status: "in_progress" | "submitted" | "needs_action" | "approved";
  config_version: number;
  data: string;
  document_id: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reason: string | null;
  expires_at: string | null;
  updated_at: string;
};
type DocumentRow = {
  id: string;
  task_row: string;
  original_name: string;
  mime: string;
  bytes: number;
  stored_name: string;
  uploaded_by: string;
  uploaded_at: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12)}`;
const nameOf = (db: Db, id: string | null) =>
  id ? ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id) : null;
const hashOf = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const addMonths = (d: Date, months: number) => {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out.toISOString();
};

function event(db: Db, e: { actor: string; kind: "person" | "org"; subject: string; task?: string | null; event: string; detail?: object; at: Date }) {
  db.prepare("INSERT INTO onb_events (at, actor, subject_kind, subject_id, task_id, event, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    e.at.toISOString(),
    e.actor,
    e.kind,
    e.subject,
    e.task ?? null,
    e.event,
    JSON.stringify(e.detail ?? {}),
  );
}

// ---------------------------------------------------------------------------------------------
// Who reviews what
// ---------------------------------------------------------------------------------------------

/** Owns the setup of this population: People & Culture for employees, Partner Operations for everyone external. */
const owns = (a: Access, domain: Domain) => a.superadmin || (domain === "internal" ? a.pc : a.partnerOps);
const ownsAny = (a: Access) => a.superadmin || a.pc || a.partnerOps;
/** A document marked for Quality is theirs to review; anything else is the population's owner's. */
const reviews = (a: Access, domain: Domain, task: Pick<ConfigTask, "quality">) => (task.quality ? a.superadmin || a.quality : owns(a, domain));
const orgDomain = (orgId: string): Domain => (orgId === INTERNAL_ORG ? "internal" : "partner");

function need(ok: boolean, message = "You don’t have access to that.") {
  if (!ok) throw new HttpError(403, message);
}

// ---------------------------------------------------------------------------------------------
// The requirements matrix
// ---------------------------------------------------------------------------------------------

const tasksOf = (row: ConfigRow | undefined) => (row ? (JSON.parse(row.tasks) as ConfigTask[]) : []);
const activeRow = (db: Db) => db.prepare("SELECT * FROM onb_configs WHERE status = 'active'").get() as ConfigRow | undefined;
const draftRow = (db: Db) => db.prepare("SELECT * FROM onb_configs WHERE status = 'draft'").get() as ConfigRow | undefined;

/** What's in force now. Until a matrix is made active there are no setup tasks for anyone. */
export function activeConfig(db: Db): { version: number; tasks: ConfigTask[] } | null {
  ensureOnboarding(db);
  const row = activeRow(db);
  return row ? { version: row.version, tasks: tasksOf(row) } : null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "task";

function cleanTasks(db: Db, raw: unknown, live: ConfigTask[]): ConfigTask[] {
  const all = assets(db);
  const ids = new Set<string>();
  const out: ConfigTask[] = [];
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, 40) as Record<string, unknown>[]) {
    const kind = (Object.keys(TASK_KINDS) as TaskKind[]).find((k) => k === r.kind);
    const title = text(r.title, 80);
    if (!kind || !title) throw new HttpError(400, "Every task needs a title and a kind.");
    let id = typeof r.id === "string" && /^[a-z0-9-]{1,60}$/.test(r.id) ? r.id : slug(title);
    while (ids.has(id)) id = `${slug(title)}-${randomUUID().slice(0, 4)}`;
    ids.add(id);
    // Only a document or an acknowledgement can be something an organisation does once for all its people.
    const scope = r.scope === "organisation" && (kind === "document" || kind === "acknowledge") ? "organisation" : "person";
    const statement = kind === "acknowledge" ? text(r.statement, 2000) : "";
    if (kind === "acknowledge" && !statement) throw new HttpError(400, `“${title}” needs the statement people are acknowledging.`);
    const asset = kind === "learning" ? text(r.asset, 120) : "";
    if (kind === "learning" && !(all.get(asset)?.kind === "topic" || all.get(asset)?.kind === "course"))
      throw new HttpError(400, `“${title}” needs a published Topic or Magazine course.`);
    const months = Math.round(Number(r.expiryMonths));
    const was = live.find((t) => t.id === id);
    out.push({
      id,
      kind,
      scope,
      title,
      why: text(r.why, 300),
      audiences: (Array.isArray(r.audiences) ? r.audiences : []).filter((x): x is Audience => typeof x === "string" && x in AUDIENCES),
      // Nothing about how someone answers the starting-point check can be made to hold them up; doing it can be asked for.
      required: r.required === true,
      quality: kind === "document" && r.quality === true,
      statement,
      asset,
      expiryMonths: kind === "document" && months >= 1 && months <= 120 ? months : null,
      minutes: Math.min(120, Math.max(1, Math.round(Number(r.minutes)) || (kind === "learning" ? 10 : kind === "diagnostic" ? 7 : 3))),
      existing: was ? was.existing : r.existing !== false,
      addedAt: was?.addedAt ?? null,
    });
  }
  return out;
}

/** The matrix as its owners see it: what's active, the draft, what the draft changes, and earlier versions. */
export function configView(db: Db, actor: User) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  need(ownsAny(a) || a.quality, "Setup requirements are managed by People & Culture, Partner Operations and Quality.");
  const active = activeRow(db);
  const draft = draftRow(db);
  const live = tasksOf(active);
  const next = tasksOf(draft);
  const view = (r: ConfigRow | undefined) =>
    r ? { version: r.version, tasks: tasksOf(r), note: r.note, approvedBy: nameOf(db, r.approved_by), approvedAt: r.approved_at } : null;
  return {
    active: view(active),
    draft: view(draft),
    changes: draft
      ? {
          added: next.filter((t) => !live.some((x) => x.id === t.id)).map((t) => ({ id: t.id, title: t.title, required: t.required })),
          removed: live.filter((t) => !next.some((x) => x.id === t.id)).map((t) => ({ id: t.id, title: t.title })),
          changed: next
            .filter((t) => live.some((x) => x.id === t.id && JSON.stringify({ ...x, addedAt: null }) !== JSON.stringify({ ...t, addedAt: null })))
            .map((t) => ({ id: t.id, title: t.title })),
        }
      : null,
    history: (db.prepare("SELECT * FROM onb_configs WHERE status = 'retired' ORDER BY version DESC").all() as ConfigRow[]).map((r) => ({
      version: r.version,
      approvedBy: nameOf(db, r.approved_by),
      approvedAt: r.approved_at,
    })),
    learning: [...assets(db).values()].filter((x) => x.kind === "topic" || x.kind === "course").map((x) => ({ key: x.key, label: x.label, kind: x.kind })),
    people: (db.prepare("SELECT COUNT(*) AS n FROM onb_instances WHERE activated_at IS NOT NULL").get() as { n: number }).n,
    canEdit: ownsAny(a),
  };
}

export function saveConfigDraft(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  need(ownsAny(capAccess(db, actor)), "Only People & Culture or Partner Operations can change the requirements.");
  const tasks = cleanTasks(db, input.tasks, tasksOf(activeRow(db)));
  const draft = draftRow(db);
  if (draft) db.prepare("UPDATE onb_configs SET tasks = ?, note = ? WHERE version = ?").run(JSON.stringify(tasks), text(input.note, 400), draft.version);
  else
    db.prepare("INSERT INTO onb_configs (version, status, tasks, note, created_by, created_at) VALUES (?, 'draft', ?, ?, ?, ?)").run(
      ((db.prepare("SELECT MAX(version) AS v FROM onb_configs").get() as { v: number | null }).v ?? 0) + 1,
      JSON.stringify(tasks),
      text(input.note, 400),
      actor.id,
      now.toISOString(),
    );
  return configView(db, actor);
}

/**
  Makes the draft the matrix in force, by name. Nobody's work is reset: a task keeps its id, so what
  people have already done for it stands. For each new task the owner says whether it also applies to
  people who are already active (`existing`), or only to people who start from now on.
*/
export function activateConfig(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  need(ownsAny(capAccess(db, actor)), "Only People & Culture or Partner Operations can release the requirements.");
  const draft = draftRow(db);
  if (!draft) throw new HttpError(400, "There’s no draft to release.");
  const live = tasksOf(activeRow(db));
  const forExisting = new Set((Array.isArray(input.existing) ? input.existing : []).filter((x): x is string => typeof x === "string"));
  const at = now.toISOString();
  const tasks = tasksOf(draft).map((t) => (live.some((x) => x.id === t.id) ? t : { ...t, addedAt: at, existing: forExisting.has(t.id) }));
  if (!tasks.length) throw new HttpError(400, "Add at least one task.");
  tx(db, () => {
    db.prepare("UPDATE onb_configs SET status = 'retired', retired_at = ? WHERE status = 'active'").run(at);
    db.prepare("UPDATE onb_configs SET status = 'active', tasks = ?, approved_by = ?, approved_at = ? WHERE version = ?").run(
      JSON.stringify(tasks),
      actor.id,
      at,
      draft.version,
    );
    audit(db, {
      actor: actor.id,
      event: "onboarding.config_released",
      entity: `onboarding_config:${draft.version}`,
      next: { tasks: tasks.length, forExisting: [...forExisting] },
      at: now,
    });
  });
  return configView(db, actor);
}

// ---------------------------------------------------------------------------------------------
// One person's setup
// ---------------------------------------------------------------------------------------------

const instanceOf = (db: Db, userId: string) => db.prepare("SELECT * FROM onb_instances WHERE user_id = ?").get(userId) as InstanceRow | undefined;
const rowFor = (db: Db, taskId: string, kind: "person" | "org", subject: string) =>
  db.prepare("SELECT * FROM onb_tasks WHERE task_id = ? AND subject_kind = ? AND subject_id = ?").get(taskId, kind, subject) as TaskRow | undefined;
const documentOf = (db: Db, id: string | null) =>
  id ? (db.prepare("SELECT * FROM onb_documents WHERE id = ?").get(id) as DocumentRow | undefined) : undefined;

/** The tasks that apply to this person now: for their audience, and (if they were already active when it was added) only if it was said to apply to them. */
function applicable(tasks: ConfigTask[], user: User, inst: InstanceRow | undefined): ConfigTask[] {
  return tasks.filter(
    (t) => (!t.audiences.length || t.audiences.includes(user.audience)) && (t.existing || !t.addedAt || !inst?.activated_at || inst.activated_at >= t.addedAt),
  );
}

type Lookups = { all: Map<string, Asset>; instrument: boolean; attempt: { status: string } | undefined; now: Date };

function lookups(db: Db, user: User, now: Date): Lookups {
  return {
    all: assets(db),
    instrument: Boolean(db.prepare("SELECT 1 FROM onb_instruments WHERE audience = ? AND status = 'active'").get(user.audience)),
    attempt: db.prepare("SELECT status FROM onb_attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT 1").get(user.id) as { status: string } | undefined,
    now,
  };
}

/** A task as this person sees it, or null when it can't apply to them (learning they can't open, or no starting-point check for their role yet). */
function taskView(db: Db, t: ConfigTask, user: User, look: Lookups): TaskView | null {
  const org = t.scope === "organisation";
  const row = rowFor(db, t.id, org ? "org" : "person", org ? user.org_id : user.id);
  let status: TaskStatus = "not_started";
  let ok = false;
  let asset: TaskView["asset"] = null;
  if (t.kind === "learning") {
    const a = look.all.get(t.asset);
    if (!a || (a.audience.length && !a.audience.includes(user.audience))) return null;
    asset = { label: a.label, href: a.href };
    // Done when the Topic or course is completed in the usual way. Nothing here records a completion.
    const done =
      a.kind === "topic"
        ? db.prepare("SELECT 1 FROM lesson_completions WHERE user_id = ? AND lesson_slug = ? LIMIT 1").get(user.id, a.ref)
        : db.prepare("SELECT 1 FROM magazine_completions WHERE user_id = ? AND guide_id = ? AND kind = 'completed' LIMIT 1").get(user.id, a.ref);
    const begun =
      a.kind === "topic"
        ? db.prepare("SELECT 1 FROM lesson_progress WHERE user_id = ? AND slug = ?").get(user.id, a.ref)
        : db.prepare("SELECT 1 FROM magazine_progress WHERE user_id = ? AND guide_id = ?").get(user.id, a.ref);
    status = done ? "approved" : begun ? "in_progress" : "not_started";
  } else if (t.kind === "diagnostic") {
    if (!look.instrument && !look.attempt) return null;
    // Finishing it is all that counts. How it was answered never does.
    status = look.attempt?.status === "completed" ? "approved" : look.attempt ? "in_progress" : "not_started";
  } else if (t.kind === "acknowledge") {
    // A reworded statement needs acknowledging again.
    const data = row ? (JSON.parse(row.data) as { hash?: string }) : {};
    status = row?.status === "approved" && data.hash === hashOf(t.statement) ? "approved" : "not_started";
  } else if (row) {
    status = row.status;
    if (t.kind === "document" && row.status === "approved" && row.expires_at) {
      const soon = new Date(look.now.getTime() + RENEW_DAYS * 86_400_000).toISOString();
      status = row.expires_at <= look.now.toISOString() ? "expired" : row.expires_at <= soon ? "renew" : "approved";
    }
    // A renewal that's been provided keeps the earlier approval for as long as that one lasts.
    const standing = (JSON.parse(row.data) as { standing?: string | null }).standing;
    if (row.status !== "approved" && standing !== undefined && (standing === null || standing > look.now.toISOString())) ok = true;
  }
  const doc = documentOf(db, row?.document_id ?? null);
  const domain = org ? orgDomain(user.org_id) : domainOf(user.audience);
  return {
    id: t.id,
    rowId: row?.id ?? null,
    kind: t.kind,
    scope: t.scope,
    title: t.title,
    why: t.why,
    required: t.required,
    minutes: t.minutes,
    status,
    ok: ok || satisfied(status),
    mine: org ? user.role === "org_admin" : true,
    reviewer: t.kind !== "document" ? "" : t.quality ? "Trilogy Care Quality" : domain === "internal" ? "People & Culture" : "Trilogy Care Partner Operations",
    statement: t.statement,
    asset,
    document: doc ? { id: doc.id, name: doc.original_name, uploadedAt: doc.uploaded_at } : null,
    reason: status === "needs_action" ? (row?.reason ?? null) : null,
    submittedAt: row?.submitted_at ?? null,
    reviewedAt: row?.reviewed_at ?? null,
    expiresAt: row?.expires_at ?? null,
    updatedAt: row?.updated_at ?? null,
    reference: row && (status === "submitted" || status === "needs_action") ? row.id.toUpperCase() : null,
  };
}

const overrideOf = (db: Db, userId: string, now: Date) =>
  db
    .prepare("SELECT * FROM onb_overrides WHERE user_id = ? AND ended_at IS NULL AND expires_on >= ? ORDER BY granted_at DESC LIMIT 1")
    .get(userId, now.toISOString().slice(0, 10)) as { id: string; reason: string; granted_by: string; granted_at: string; expires_on: string } | undefined;

function compute(db: Db, user: User, now: Date) {
  const config = activeConfig(db);
  const inst = instanceOf(db, user.id);
  const look = lookups(db, user, now);
  const tasks = config ? applicable(config.tasks, user, inst).flatMap((t) => taskView(db, t, user, look) ?? []) : [];
  const { state, waitingOn } = setupState(tasks, { started: Boolean(inst), activatedAt: inst?.activated_at ?? null });
  return { config, inst, tasks, state, waitingOn, override: overrideOf(db, user.id, now) };
}

/** Whether someone may use the Hub in full: every required task approved, or a current override. The one place to ask. */
export function accessFor(db: Db, user: User, now: Date) {
  const c = compute(db, user, now);
  const required = c.tasks.filter((t) => t.required && !t.ok);
  return {
    configured: Boolean(c.config),
    state: c.state,
    full: !c.config || !required.length || Boolean(c.override),
    outstanding: required.length,
    override: Boolean(c.override),
  };
}

/** Your setup: the signed-in person's own tasks, their organisation's, and where things stand. */
export function mySetup(db: Db, user: User, now: Date) {
  const c = compute(db, user, now);
  const org = db.prepare("SELECT name FROM orgs WHERE id = ?").get(user.org_id) as { name: string } | undefined;
  const request = db.prepare("SELECT * FROM onb_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(user.id) as
    { id: string; message: string; state: string; resolution: string; created_at: string; resolved_at: string | null } | undefined;
  const s = sections(c.tasks);
  return {
    configured: Boolean(c.config),
    configVersion: c.config?.version ?? null,
    state: c.state,
    waitingOn: c.waitingOn,
    person: { name: user.name, role: ROLE_NAMES[user.audience] ?? user.audience, organisation: org?.name ?? "", orgAdmin: user.role === "org_admin" },
    tasks: c.tasks,
    sections: { next: s.next.map((t) => t.id), waiting: s.waiting.map((t) => t.id), done: s.done.map((t) => t.id), optional: s.optional.map((t) => t.id) },
    startedAt: c.inst?.started_at ?? null,
    activatedAt: c.inst?.activated_at ?? null,
    /** The first visit is a wizard; afterwards the same tasks are a list to come back to. */
    wizard: Boolean(c.config) && !c.inst?.wizard_done_at && !c.inst?.activated_at,
    lastStep: c.inst?.last_step ?? null,
    canStart: c.state === "ready" || (Boolean(c.override) && !c.inst?.activated_at),
    override: c.override ? { until: c.override.expires_on, by: nameOf(db, c.override.granted_by) } : null,
    minutes: c.tasks.filter((t) => t.mine && !t.ok && t.status !== "submitted").reduce((n, t) => n + t.minutes, 0),
    request: request ? { message: request.message, state: request.state, resolution: request.resolution, createdAt: request.created_at } : null,
    /** For an organisation's administrator: where each of their people is up to. Never their answers or documents. */
    people: user.role === "org_admin" ? orgPeople(db, user, now) : null,
  };
}
export type Setup = ReturnType<typeof mySetup>;

function orgPeople(db: Db, admin: User, now: Date) {
  const users = db.prepare("SELECT * FROM users WHERE org_id = ? AND id != ? ORDER BY name LIMIT 500").all(admin.org_id, admin.id) as User[];
  return users.map((u) => {
    const c = compute(db, u, now);
    const mine = c.tasks.filter((t) => t.scope === "person" && t.required);
    return { id: u.id, name: u.name, state: c.state, waitingOn: c.waitingOn, done: mine.filter((t) => t.ok).length, of: mine.length };
  });
}

function touch(db: Db, user: User, now: Date, patch: { step?: string | null; wizardDone?: boolean } = {}) {
  const at = now.toISOString();
  const inst = instanceOf(db, user.id);
  if (!inst) {
    db.prepare("INSERT INTO onb_instances (user_id, config_version, started_at, last_step, wizard_done_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      user.id,
      activeConfig(db)?.version ?? null,
      at,
      patch.step ?? null,
      patch.wizardDone ? at : null,
      at,
    );
    event(db, { actor: user.id, kind: "person", subject: user.id, event: "started", at: now });
    return;
  }
  db.prepare("UPDATE onb_instances SET last_step = COALESCE(?, last_step), wizard_done_at = COALESCE(wizard_done_at, ?), updated_at = ? WHERE user_id = ?").run(
    patch.step ?? null,
    patch.wizardDone ? at : null,
    at,
    user.id,
  );
}

/** Where they've got to in the wizard, so another device picks up in the same place. */
export function saveStep(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  touch(db, user, now, { step: text(input.step, 60) || null, wizardDone: input.wizardDone === true });
  return mySetup(db, user, now);
}

/** The task as configured, if it applies to this person and they're the one who acts on it. */
function ownTask(db: Db, user: User, taskId: unknown) {
  const config = activeConfig(db);
  const t = config ? applicable(config.tasks, user, instanceOf(db, user.id)).find((x) => x.id === taskId) : undefined;
  if (!config || !t) throw new HttpError(404, "That isn’t one of your setup tasks.");
  const org = t.scope === "organisation";
  if (org && user.role !== "org_admin") throw new HttpError(403, "Your organisation’s administrator does this one.");
  return { config, t, kind: org ? ("org" as const) : ("person" as const), subject: org ? user.org_id : user.id };
}

function upsertRow(db: Db, o: { taskId: string; kind: "person" | "org"; subject: string; version: number }, set: Partial<TaskRow>, now: Date): TaskRow {
  const existing = rowFor(db, o.taskId, o.kind, o.subject);
  const at = now.toISOString();
  if (!existing) {
    const id = newId("task");
    db.prepare(
      "INSERT INTO onb_tasks (id, task_id, subject_kind, subject_id, status, config_version, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)",
    ).run(id, o.taskId, o.kind, o.subject, o.version, at);
  }
  const row = rowFor(db, o.taskId, o.kind, o.subject)!;
  const next = { ...row, ...set, updated_at: at, config_version: o.version };
  db.prepare(
    "UPDATE onb_tasks SET status = ?, config_version = ?, data = ?, document_id = ?, submitted_by = ?, submitted_at = ?, reviewed_by = ?, reviewed_at = ?, reason = ?, expires_at = ?, updated_at = ? WHERE id = ?",
  ).run(
    next.status,
    next.config_version,
    next.data,
    next.document_id,
    next.submitted_by,
    next.submitted_at,
    next.reviewed_by,
    next.reviewed_at,
    next.reason,
    next.expires_at,
    next.updated_at,
    row.id,
  );
  return next;
}

/**
  Completes a task that needs no reviewer (confirming details, acknowledging a statement), or sends a
  document that's been uploaded for review. Doing it twice is harmless.
*/
export function submitTask(db: Db, user: User, taskId: unknown, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const { config, t, kind, subject } = ownTask(db, user, taskId);
  const at = now.toISOString();
  const o = { taskId: t.id, kind, subject, version: config.version };
  tx(db, () => {
    touch(db, user, now);
    if (t.kind === "details") {
      const name = text(input.name, 80);
      if (name.length < 2) throw new HttpError(400, "Enter the name you’d like the Hub to use.");
      if (name !== user.name) {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
        audit(db, { actor: user.id, event: "preferences.name", entity: `user:${user.id}`, previous: { name: user.name }, next: { name }, at: now });
      }
      upsertRow(db, o, { status: "approved", submitted_by: user.id, submitted_at: at, reviewed_at: at }, now);
    } else if (t.kind === "acknowledge") {
      if (input.agree !== true) throw new HttpError(400, "Tick the box to say you’ve read and agree.");
      // The statement as it read is identified by its hash, so a reworded one asks again.
      upsertRow(
        db,
        o,
        { status: "approved", data: JSON.stringify({ hash: hashOf(t.statement) }), submitted_by: user.id, submitted_at: at, reviewed_at: at },
        now,
      );
    } else if (t.kind === "document") {
      const row = rowFor(db, t.id, kind, subject);
      if (row?.status === "submitted") return;
      if (!row?.document_id || row.status === "approved") throw new HttpError(400, "Choose the file first.");
      upsertRow(db, o, { status: "submitted", submitted_by: user.id, submitted_at: at, reason: null }, now);
    } else throw new HttpError(400, "That task is completed where it happens, not here.");
    event(db, { actor: user.id, kind, subject, task: t.id, event: t.kind === "document" ? "submitted" : "completed", at: now });
  });
  return mySetup(db, user, now);
}

/** What a file really is, from its first bytes: the name and the browser's label aren't trusted. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

/**
  Stores a document for a task, privately. It isn't sent for review until the person submits it, and a
  file that's with a reviewer can't be swapped underneath them. Replacing an approved document starts a
  renewal: the earlier approval keeps counting until it runs out or the new one is decided.
*/
export async function uploadDocument(db: Db, user: User, taskId: unknown, file: File, now: Date) {
  ensureOnboarding(db);
  const { config, t, kind, subject } = ownTask(db, user, taskId);
  if (t.kind !== "document") throw new HttpError(400, "That task doesn’t take a file.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(400, "That file is over 10 MB. Try a smaller scan or a photo.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw new HttpError(400, "That file isn’t a PDF, JPG, PNG or WebP.");
  const before = rowFor(db, t.id, kind, subject);
  if (before?.status === "submitted")
    throw new HttpError(409, "This is with a reviewer now, so it can’t be changed. You’ll be able to replace it if they ask for a correction.");
  const id = newId("doc");
  const stored = `${randomUUID()}.${type.ext}`;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, stored), buf, { flag: "wx" });
  tx(db, () => {
    touch(db, user, now);
    const standing = before?.status === "approved" ? { standing: before.expires_at } : before ? JSON.parse(before.data) : {};
    const row = upsertRow(
      db,
      { taskId: t.id, kind, subject, version: config.version },
      { status: before?.status === "needs_action" ? "needs_action" : "in_progress", data: JSON.stringify(standing) },
      now,
    );
    db.prepare(
      "INSERT INTO onb_documents (id, task_row, original_name, mime, bytes, stored_name, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, row.id, text(file.name, 120) || `document.${type.ext}`, type.mime, buf.length, stored, user.id, now.toISOString());
    db.prepare("UPDATE onb_tasks SET document_id = ? WHERE id = ?").run(id, row.id);
    // That a file arrived, never its name.
    event(db, { actor: user.id, kind, subject, task: t.id, event: "uploaded", detail: { bytes: buf.length, type: type.ext }, at: now });
  });
  return mySetup(db, user, now);
}

/**
  A document's bytes, for someone allowed to see it: whoever it's about (the person, or their
  organisation's administrator for an organisation's document) and the people who review it. Anyone else
  is told it doesn't exist. Reviewers opening it is logged.
*/
export function readDocument(db: Db, user: User, id: unknown, now: Date) {
  ensureOnboarding(db);
  const doc = typeof id === "string" ? documentOf(db, id) : undefined;
  const row = doc ? (db.prepare("SELECT * FROM onb_tasks WHERE id = ?").get(doc.task_row) as TaskRow | undefined) : undefined;
  if (!doc || !row) throw new HttpError(404, "That document isn’t available.");
  const own = row.subject_kind === "person" ? row.subject_id === user.id : row.subject_id === user.org_id && user.role === "org_admin";
  if (!own) {
    const task = (activeConfig(db)?.tasks ?? []).find((t) => t.id === row.task_id);
    const subject = row.subject_kind === "person" ? userById(db, row.subject_id) : undefined;
    const domain = row.subject_kind === "org" ? orgDomain(row.subject_id) : subject ? domainOf(subject.audience) : null;
    if (!task || !domain || !reviews(capAccess(db, user), domain, task)) throw new HttpError(404, "That document isn’t available.");
    audit(db, { actor: user.id, event: "onboarding.document_viewed", entity: `onboarding_task:${row.id}`, at: now });
  }
  return { buffer: readFileSync(path.join(DIR, doc.stored_name)), mime: doc.mime, name: doc.original_name };
}

/** "Start using the Hub": only once every required task is approved, or someone has made a dated exception. */
export function startUsing(db: Db, user: User, now: Date) {
  ensureOnboarding(db);
  const c = compute(db, user, now);
  if (!c.config) throw new HttpError(400, "There’s nothing to set up.");
  if (c.inst?.activated_at) return mySetup(db, user, now);
  if (c.state !== "ready" && !c.override) throw new HttpError(400, "There’s still something to do, or something waiting for review, before you can start.");
  touch(db, user, now, { wizardDone: true });
  db.prepare("UPDATE onb_instances SET activated_at = ? WHERE user_id = ?").run(now.toISOString(), user.id);
  event(db, { actor: user.id, kind: "person", subject: user.id, event: "activated", detail: { override: c.state !== "ready" }, at: now });
  return mySetup(db, user, now);
}

/** "This isn't my role or organisation." It asks; it changes nothing about what they can see. */
export function reportMismatch(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const message = text(input.message, 600);
  if (message.length < 10) throw new HttpError(400, "Say what’s wrong, so the right person can fix it.");
  if (db.prepare("SELECT 1 FROM onb_requests WHERE user_id = ? AND state = 'open'").get(user.id))
    throw new HttpError(400, "You’ve already asked. Someone is looking at it.");
  db.prepare("INSERT INTO onb_requests (id, user_id, message, created_at) VALUES (?, ?, ?, ?)").run(newId("req"), user.id, message, now.toISOString());
  event(db, { actor: user.id, kind: "person", subject: user.id, event: "role_query", at: now });
  return mySetup(db, user, now);
}

// ---------------------------------------------------------------------------------------------
// Reviewers
// ---------------------------------------------------------------------------------------------

const PAGE = 50;

/**
  What's waiting for a reviewer: documents people have submitted, oldest first, for the populations this
  person reviews. A page at a time, filtered in the database, so it holds up with a long queue.
*/
export function reviewQueue(db: Db, actor: User, input: { page?: unknown; q?: unknown }, now: Date) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  need(ownsAny(a) || a.quality, "The review queue is for People & Culture, Partner Operations and Quality.");
  const tasks = new Map((activeConfig(db)?.tasks ?? []).map((t) => [t.id, t]));
  const q = text(input.q, 60).toLowerCase();
  const rows = db.prepare("SELECT * FROM onb_tasks WHERE status = 'submitted' ORDER BY submitted_at").all() as TaskRow[];
  const mine = rows.flatMap((r) => {
    const t = tasks.get(r.task_id);
    const person = r.subject_kind === "person" ? userById(db, r.subject_id) : undefined;
    const org = db.prepare("SELECT id, name FROM orgs WHERE id = ?").get(person?.org_id ?? r.subject_id) as { id: string; name: string } | undefined;
    const domain = r.subject_kind === "org" ? orgDomain(r.subject_id) : person ? domainOf(person.audience) : null;
    if (!t || !domain || !reviews(a, domain, t)) return [];
    const doc = documentOf(db, r.document_id);
    const who = r.subject_kind === "org" ? (org?.name ?? r.subject_id) : (person?.name ?? r.subject_id);
    if (q && !`${who} ${org?.name ?? ""} ${t.title}`.toLowerCase().includes(q)) return [];
    return [
      {
        rowId: r.id,
        reference: r.id.toUpperCase(),
        task: t.title,
        scope: t.scope,
        who,
        organisation: org?.name ?? "",
        audience: person ? (ROLE_NAMES[person.audience] ?? person.audience) : "Organisation",
        submittedAt: r.submitted_at,
        submittedBy: nameOf(db, r.submitted_by),
        days: r.submitted_at ? Math.floor((now.getTime() - new Date(r.submitted_at).getTime()) / 86_400_000) : 0,
        document: doc ? { id: doc.id, name: doc.original_name, bytes: doc.bytes } : null,
        expiryMonths: t.expiryMonths,
        resubmitted: Boolean(r.reviewed_at),
      },
    ];
  });
  const page = Math.max(1, Math.round(Number(input.page)) || 1);
  return {
    items: mine.slice((page - 1) * PAGE, page * PAGE),
    total: mine.length,
    page,
    pages: Math.max(1, Math.ceil(mine.length / PAGE)),
    oldestDays: mine[0]?.days ?? 0,
    requests: requestList(db, a),
  };
}

function requestList(db: Db, a: Access) {
  const rows = db.prepare("SELECT * FROM onb_requests WHERE state = 'open' ORDER BY created_at LIMIT 100").all() as {
    id: string;
    user_id: string;
    message: string;
    created_at: string;
  }[];
  return rows.flatMap((r) => {
    const u = userById(db, r.user_id);
    if (!u || !owns(a, domainOf(u.audience))) return [];
    const org = db.prepare("SELECT name FROM orgs WHERE id = ?").get(u.org_id) as { name: string } | undefined;
    return [
      { id: r.id, person: u.name, role: ROLE_NAMES[u.audience] ?? u.audience, organisation: org?.name ?? "", message: r.message, createdAt: r.created_at },
    ];
  });
}

/**
  Approves a submission, or asks for a correction with a specific reason. Either way it's the
  reviewer's name on it, and the person is told. A submission someone else has already decided is left alone.
*/
export function reviewTask(db: Db, actor: User, rowId: unknown, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  const row = typeof rowId === "string" ? (db.prepare("SELECT * FROM onb_tasks WHERE id = ?").get(rowId) as TaskRow | undefined) : undefined;
  const task = row ? (activeConfig(db)?.tasks ?? []).find((t) => t.id === row.task_id) : undefined;
  const person = row?.subject_kind === "person" ? userById(db, row.subject_id) : undefined;
  const domain = row?.subject_kind === "org" ? orgDomain(row.subject_id) : person ? domainOf(person.audience) : null;
  if (!row || !task || !domain || !reviews(a, domain, task)) throw new HttpError(404, "That submission isn’t in your queue.");
  if (row.status !== "submitted") throw new HttpError(409, "That’s already been reviewed, or the person has taken it back.");
  const approve = input.decision === "approve";
  if (!approve && input.decision !== "correct") throw new HttpError(400, "Approve it, or ask for a correction.");
  const reason = text(input.reason, 400);
  if (!approve && reason.length < 10) throw new HttpError(400, "Say what needs correcting, specifically. The person sees this.");
  const validUntil = typeof input.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) ? `${input.validUntil}T23:59:59.000Z` : null;
  if (approve && validUntil && validUntil < now.toISOString()) throw new HttpError(400, "That document has already expired, so it can’t be approved.");
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE onb_tasks SET status = ?, reviewed_by = ?, reviewed_at = ?, reason = ?, expires_at = ?, data = ?, updated_at = ? WHERE id = ?").run(
      approve ? "approved" : "needs_action",
      actor.id,
      at,
      approve ? null : reason,
      // The document's own end date if the reviewer gives one; otherwise the requirement's renewal period.
      approve ? (validUntil ?? (task.expiryMonths ? addMonths(now, task.expiryMonths) : null)) : row.expires_at,
      approve ? "{}" : row.data,
      at,
      row.id,
    );
    audit(db, {
      actor: actor.id,
      event: approve ? "onboarding.approved" : "onboarding.correction_requested",
      entity: `onboarding_task:${row.id}`,
      next: { task: task.id, subject: `${row.subject_kind}:${row.subject_id}` },
      at: now,
    });
    event(db, { actor: actor.id, kind: row.subject_kind, subject: row.subject_id, task: task.id, event: approve ? "approved" : "needs_action", at: now });
    // The person it's about; for an organisation's document, its administrators. No document details in the message.
    const tell =
      row.subject_kind === "person"
        ? [row.subject_id]
        : (db.prepare("SELECT id FROM users WHERE org_id = ? AND role = 'org_admin'").all(row.subject_id) as { id: string }[]).map((u) => u.id);
    for (const userId of tell)
      notify(
        db,
        userId,
        {
          kind: approve ? "update" : "action",
          category: "Your setup",
          priority: approve ? "normal" : "high",
          title: approve ? `Approved: ${task.title}` : `Needs a correction: ${task.title}`,
          body: approve ? "This part of your setup is complete." : "A reviewer has asked for a change. Open your setup to see the reason and send it again.",
          href: `/onboarding#task-${task.id}`,
          source: `onboarding:${row.id}:${at}`,
        },
        now,
      );
  });
  return { ok: true };
}

/** Answers a role or organisation query, by name. Any change to the person's role is made by whoever owns that record. */
export function resolveRequest(db: Db, actor: User, id: unknown, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  const r =
    typeof id === "string"
      ? (db.prepare("SELECT * FROM onb_requests WHERE id = ?").get(id) as { id: string; user_id: string; state: string } | undefined)
      : undefined;
  const u = r ? userById(db, r.user_id) : undefined;
  if (!r || !u || !owns(a, domainOf(u.audience))) throw new HttpError(404, "That request isn’t in your queue.");
  const resolution = text(input.resolution, 400);
  if (resolution.length < 10) throw new HttpError(400, "Say what was found and what was done. The person sees this.");
  if (r.state === "open") {
    db.prepare("UPDATE onb_requests SET state = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?").run(
      resolution,
      actor.id,
      now.toISOString(),
      r.id,
    );
    audit(db, { actor: actor.id, event: "onboarding.role_query_answered", entity: `user:${u.id}`, at: now });
  }
  return { ok: true };
}

/** Lets someone start before everything is approved: with a reason, a name and an end date, all on record. */
export function grantOverride(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const target = typeof input.userId === "string" ? userById(db, input.userId) : undefined;
  if (!target) throw new HttpError(404, "That person isn’t a Hub user.");
  need(owns(capAccess(db, actor), domainOf(target.audience)), "Only this population’s owner can make an exception.");
  const reason = text(input.reason, 400);
  if (reason.length < 10) throw new HttpError(400, "Give the reason for the exception.");
  const until = typeof input.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) ? input.expiresOn : "";
  const today = now.toISOString().slice(0, 10);
  if (!until || until < today || until > addMonths(now, 3).slice(0, 10))
    throw new HttpError(400, "An exception needs an end date within the next three months.");
  db.prepare("UPDATE onb_overrides SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL").run(now.toISOString(), target.id);
  db.prepare("INSERT INTO onb_overrides (id, user_id, reason, granted_by, granted_at, expires_on) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId("ovr"),
    target.id,
    reason,
    actor.id,
    now.toISOString(),
    until,
  );
  audit(db, { actor: actor.id, event: "onboarding.override_granted", entity: `user:${target.id}`, next: { until }, reason, at: now });
  event(db, { actor: actor.id, kind: "person", subject: target.id, event: "override", detail: { until }, at: now });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Where everyone is up to
// ---------------------------------------------------------------------------------------------

/**
  The funnel for the populations this person owns: how many are at each state, whose move it is, how long
  activation takes, and why things were sent back. Employees and partners are counted separately. The
  list of people is a page at a time.
*/
export function funnel(db: Db, actor: User, input: { audience?: unknown; state?: unknown; page?: unknown }, now: Date) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  need(ownsAny(a), "Setup progress is for People & Culture and Partner Operations.");
  const config = activeConfig(db);
  const audiences = (Object.keys(AUDIENCES) as Audience[]).filter((x) => owns(a, domainOf(x)));
  const users = (db.prepare("SELECT * FROM users ORDER BY name").all() as User[]).filter((u) => audiences.includes(u.audience as Audience));
  const rows = users.map((u) => {
    const c = compute(db, u, now);
    const open = c.tasks.filter((t) => t.required && !t.ok);
    return {
      id: u.id,
      name: u.name,
      audience: u.audience as Audience,
      state: c.state,
      waitingOn: c.waitingOn,
      startedAt: c.inst?.started_at ?? null,
      activatedAt: c.inst?.activated_at ?? null,
      /** The task holding things up, and whose it is: so a queue of reviews doesn't read as people not finishing. */
      waitingFor: open[0]
        ? `${open[0].title} (${open[0].status === "submitted" ? "with a reviewer" : open[0].mine ? "theirs to do" : "their organisation’s"})`
        : "",
      override: Boolean(c.override),
    };
  });
  const count = (list: typeof rows) => {
    const by = Object.fromEntries(["not_started", "in_progress", "awaiting_review", "needs_action", "ready", "active", "renewal"].map((s) => [s, 0])) as Record<
      SetupState,
      number
    >;
    for (const r of list) by[r.state] += 1;
    return by;
  };
  const days = rows
    .filter((r) => r.startedAt && r.activatedAt)
    .map((r) => (new Date(r.activatedAt!).getTime() - new Date(r.startedAt!).getTime()) / 86_400_000)
    .sort((x, y) => x - y);
  const audience = audiences.find((x) => x === input.audience);
  const state = typeof input.state === "string" ? input.state : "";
  const shown = rows.filter((r) => (!audience || r.audience === audience) && (!state || r.state === state));
  const page = Math.max(1, Math.round(Number(input.page)) || 1);
  return {
    configured: Boolean(config),
    configVersion: config?.version ?? null,
    byAudience: audiences.map((x) => ({
      audience: x,
      label: AUDIENCES[x],
      people: rows.filter((r) => r.audience === x).length,
      states: count(rows.filter((r) => r.audience === x)),
    })),
    waiting: {
      onPeople: rows.filter((r) => r.waitingOn === "you" && r.state !== "ready" && r.state !== "not_started").length,
      onReviewers: rows.filter((r) => r.waitingOn === "reviewer").length,
      onOrganisations: rows.filter((r) => r.waitingOn === "organisation").length,
    },
    medianDaysToActive: days.length ? Math.round(days[Math.floor(days.length / 2)] * 10) / 10 : null,
    activated: days.length,
    /** Why things were sent back, most common first. Reviewers' own words, so wording varies. */
    corrections: (
      db.prepare("SELECT task_id, COUNT(*) AS n FROM onb_events WHERE event = 'needs_action' GROUP BY task_id ORDER BY n DESC LIMIT 10").all() as {
        task_id: string;
        n: number;
      }[]
    ).map((r) => ({
      task: config?.tasks.find((t) => t.id === r.task_id)?.title ?? r.task_id,
      times: r.n,
    })),
    people: shown.slice((page - 1) * PAGE, page * PAGE),
    total: shown.length,
    page,
    pages: Math.max(1, Math.ceil(shown.length / PAGE)),
  };
}
