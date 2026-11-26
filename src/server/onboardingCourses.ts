import "server-only";
import { randomUUID } from "node:crypto";
import { lessons } from "@/content/lessons";
import { domainOf, type Domain } from "@/lib/capability";
import {
  HELP_KINDS,
  READ_MODES,
  SEGMENT_AUDIENCE,
  SEGMENTS,
  SERVICE_PHRASES,
  SERVICE_TYPES,
  STAFF_FUNCTIONS,
  STEP_KINDS,
  TEXT_SIZES,
  TRIGGERS,
  DEMO_NOTE,
  dueWords,
  matches,
  membershipLabel,
  ruleSummary,
  serviceTypeOf,
  type CourseData,
  type CourseStep,
  type EnrolmentStatus,
  type HelpKind,
  type MandatoryState,
  type Membership,
  type ReadMode,
  type RuleData,
  type RuleWhen,
  type Segment,
  type ServiceType,
  type StaffFunction,
  type StepKind,
  type TextSize,
} from "@/lib/onboardingCourses";
import { languageName } from "@/lib/languages";
import { audit, ensureOnboarding, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, userById, type User } from "./auth";
import { capAccess, type Access } from "./capability";
import { isFor } from "./completionReports";
import { notify } from "./notifications";
import { ensurePlaybooks } from "./playbooks";

/*
  Starting courses (docs/onboarding.md, "Starting courses"): the getting-started course each person is assigned from
  their verified role and work, built on what the Hub already has.

  - A course is a versioned list of existing Topics, Magazine courses and Job Aids, by reference. Progress is read
    from those features' own records (lesson_completions, magazine_completions, Favourites), never copied, so a
    Topic finished anywhere counts here, and one finished once counts for every course it's in.
  - A rule says who gets which course. It's versioned and effective-dated, and names an owner. Anyone who runs
    onboarding for that population can publish a recommended rule; only the named owner can make it mandatory, and
    only a mandatory rule gives a due date.
  - Evaluation is idempotent: one enrolment per person, organisation and course version, enforced by the database,
    so ten sign-ins make one enrolment. A role change adds what's newly due and ends what no longer applies, keeping
    everything finished. A supplier with no verified service type, or someone disputing their role, gets nothing new
    and is asked to confirm their work type: never the broadest course by default.
  - Completing a course changes nothing about supplier approval, credentials or the setup tasks in server/onboarding.
*/

const SCHEMA = `
CREATE TABLE IF NOT EXISTS onbc_courses (
  id TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded', 'withdrawn')),
  data TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, published_by TEXT, published_at TEXT,
  withdrawn_by TEXT, withdrawn_at TEXT, withdrawn_reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS onbc_rules (
  id TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  data TEXT NOT NULL, mandatory_state TEXT NOT NULL DEFAULT 'none' CHECK (mandatory_state IN ('none', 'pending', 'approved')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, published_by TEXT, published_at TEXT, approved_by TEXT, approved_at TEXT,
  retired_by TEXT, retired_at TEXT, retired_reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id, version)
);
-- A role someone holds besides the one on their Hub account (a second business, or a second kind of work), verified by an administrator.
CREATE TABLE IF NOT EXISTS onbc_memberships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), segment TEXT NOT NULL, org_id TEXT NOT NULL,
  service_type TEXT, staff_function TEXT, source TEXT NOT NULL, verified_by TEXT NOT NULL, verified_at TEXT NOT NULL,
  effective_from TEXT NOT NULL, effective_to TEXT, reason TEXT NOT NULL DEFAULT ''
);
-- One row per person, organisation and course version: the database refuses a second.
CREATE TABLE IF NOT EXISTS onbc_enrolments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), org_id TEXT NOT NULL, membership TEXT NOT NULL,
  course_id TEXT NOT NULL, course_version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rule', 'manual')), rule_id TEXT, rule_version INTEGER, reason TEXT NOT NULL DEFAULT '',
  assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL, mandatory INTEGER NOT NULL DEFAULT 0, due_on TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'exempted', 'ended')),
  invited_at TEXT, started_at TEXT, completed_at TEXT, completion TEXT, ended_at TEXT, ended_reason TEXT NOT NULL DEFAULT '',
  exempt_by TEXT, exempt_reason TEXT NOT NULL DEFAULT '', exempt_review_on TEXT, reminded TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
  UNIQUE (user_id, org_id, course_id, course_version)
);
CREATE INDEX IF NOT EXISTS onbc_enrolments_user ON onbc_enrolments (user_id, status);
-- Equivalent prior learning, credited to one person by an administrator, with the reason.
CREATE TABLE IF NOT EXISTS onbc_credits (
  user_id TEXT NOT NULL REFERENCES users(id), ref TEXT NOT NULL, reason TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, ref)
);
-- Two items that count for each other once approved, so a shared item is done once.
CREATE TABLE IF NOT EXISTS onbc_equivalences (
  id TEXT PRIMARY KEY, a_ref TEXT NOT NULL, b_ref TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'retired')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
);
-- How someone wants to use the Hub while getting started. Personal: never in a report.
CREATE TABLE IF NOT EXISTS onbc_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id), mode TEXT NOT NULL DEFAULT 'read', text_size TEXT NOT NULL DEFAULT 'standard',
  first_run_step TEXT, first_run_done_at TEXT, last_seen_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS onbc_help (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), enrolment_id TEXT, kind TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')), resolution TEXT NOT NULL DEFAULT '', resolved_by TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL
);
`;
const ready = new WeakSet<object>();
/** Makes sure the starting-course tables are there, for a server that was already running when they were added. */
export function ensureCourses(db: Db, now = new Date()) {
  ensureOnboarding(db);
  // Job Aids and Favourites live in the playbook tables: a course step can be one.
  ensurePlaybooks(db, now);
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

type CourseRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "superseded" | "withdrawn";
  data: string;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  withdrawn_reason: string;
};
type RuleRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "retired";
  data: string;
  mandatory_state: MandatoryState;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};
type EnrolmentRow = {
  id: string;
  user_id: string;
  org_id: string;
  membership: string;
  course_id: string;
  course_version: number;
  source: "rule" | "manual";
  rule_id: string | null;
  rule_version: number | null;
  reason: string;
  assigned_by: string;
  assigned_at: string;
  mandatory: number;
  due_on: string | null;
  status: EnrolmentStatus;
  invited_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion: string | null;
  ended_at: string | null;
  ended_reason: string;
  exempt_by: string | null;
  exempt_reason: string;
  exempt_review_on: string | null;
  reminded: string;
  updated_at: string;
};
type MembershipRow = {
  id: string;
  user_id: string;
  segment: Segment;
  org_id: string;
  service_type: string | null;
  staff_function: string | null;
  source: string;
  verified_by: string;
  verified_at: string;
  effective_from: string;
  effective_to: string | null;
  reason: string;
};

const SYSTEM = "system";
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const today = (now: Date) => now.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12)}`;
const nameOf = (db: Db, id: string | null) =>
  !id ? null : id === SYSTEM ? "The Hub" : ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id);
const orgName = (db: Db, id: string) => (db.prepare("SELECT name FROM orgs WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;

function need(ok: boolean, message = "You don’t have access to that.") {
  if (!ok) throw new HttpError(403, message);
}

// ---------------------------------------------------------------------------------------------
// Who may do what. The same owners as setup: People & Culture for employees, Partner Operations for partners.
// ---------------------------------------------------------------------------------------------

const segmentDomain = (s: Segment): Domain => (s === "staff" ? "internal" : "partner");
const owns = (a: Access, d: Domain) => a.superadmin || (d === "internal" ? a.pc : a.partnerOps);
const ownsAny = (a: Access) => a.superadmin || a.pc || a.partnerOps;
const OWNERS_ONLY = "Starting courses are run by People & Culture (employees) and Partner Operations (partners).";

// ---------------------------------------------------------------------------------------------
// Who someone is: their verified memberships. Never anything they chose for themselves.
// ---------------------------------------------------------------------------------------------

/** The membership on someone's Hub account, as an administrator set it. */
function primaryMembership(db: Db, u: User): Membership {
  const segment: Segment = u.audience === "staff" ? "staff" : u.audience === "coordinator" ? "coordinator" : u.role === "org_admin" ? "principal" : "supplier";
  const staffFunction: StaffFunction | null =
    segment !== "staff" ? null : isSuperadmin(u) ? "administrator" : canAuthor(u) ? "author" : u.role === "org_admin" ? "manager" : "general";
  return {
    id: "primary",
    segment,
    orgId: u.org_id,
    orgName: orgName(db, u.org_id),
    serviceType: segment === "supplier" ? serviceTypeOf(u.service_role) : null,
    staffFunction,
    source: "Hub account, set by an administrator",
    verifiedBy: null,
    effectiveFrom: null,
    effectiveTo: null,
  };
}

/** Every role someone holds today: their account's, and any an administrator has verified since. */
export function membershipsOf(db: Db, u: User, now: Date): Membership[] {
  ensureCourses(db, now);
  const d = today(now);
  const extra = (
    db
      .prepare(
        "SELECT * FROM onbc_memberships WHERE user_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?) ORDER BY effective_from",
      )
      .all(u.id, d, d) as MembershipRow[]
  ).map((r): Membership => ({
    id: r.id,
    segment: r.segment,
    orgId: r.org_id,
    orgName: orgName(db, r.org_id),
    serviceType: r.segment === "supplier" ? serviceTypeOf(r.service_type) : null,
    staffFunction: r.segment === "staff" ? ((r.staff_function as StaffFunction) ?? "general") : null,
    source: r.source,
    verifiedBy: nameOf(db, r.verified_by),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
  }));
  return [primaryMembership(db, u), ...extra];
}

const membershipKey = (m: Pick<Membership, "id" | "segment" | "serviceType" | "staffFunction">) =>
  [m.id, m.segment, m.serviceType ?? m.staffFunction ?? ""].filter(Boolean).join(":");

/** An open "This isn't my role" request: until it's answered, nothing new is assigned. */
const disputed = (db: Db, userId: string) => Boolean(db.prepare("SELECT 1 FROM onb_requests WHERE user_id = ? AND state = 'open'").get(userId));

// ---------------------------------------------------------------------------------------------
// The content a step points at, and whether this person may open it
// ---------------------------------------------------------------------------------------------

type StepTarget = { label: string; href: string; version: string; minutes: number | null; open: (audience: string, author: boolean) => boolean };

function targetOf(db: Db, ref: string): StepTarget | null {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "topic") {
    const l = lessons.find((x) => x.slug === id && x.track !== "reinforcement");
    if (!l) return null;
    // The Topics' own rule (server/catalogue.topicIsFor): staff and authors see every track.
    return { label: l.title, href: `/topics/${l.slug}`, version: l.version, minutes: l.minutes, open: (a, author) => author || a === "staff" || isFor(l, a) };
  }
  if (kind === "course") {
    const g = db.prepare("SELECT slug, title, audience, revision_id FROM magazine_guides WHERE id = ? AND status = 'published'").get(id) as
      { slug: string; title: string; audience: string; revision_id: string | null } | undefined;
    if (!g?.revision_id) return null;
    const aud = JSON.parse(g.audience) as string[];
    // The Magazine's own rule (server/magazine.canRead).
    return {
      label: g.title,
      href: `/magazine/${g.slug}`,
      version: g.revision_id,
      minutes: null,
      open: (a, author) => author || !aud.length || aud.includes(a),
    };
  }
  if (kind === "aid") {
    const s = db.prepare("SELECT data, withdrawn FROM playbook_snippets WHERE id = ?").get(id) as { data: string; withdrawn: number } | undefined;
    const rel = db.prepare("SELECT number FROM playbook_releases WHERE snippet_id = ? AND status = 'approved' ORDER BY number DESC LIMIT 1").get(id) as
      { number: number } | undefined;
    // Only a Job Aid with an approved release, not withdrawn, can be a step people do. The Job Aids' own rule on roles.
    if (!s || s.withdrawn || !rel) return null;
    const d = JSON.parse(s.data) as { title?: string; audiences?: string[]; minutes?: number };
    return {
      label: d.title ?? id,
      href: `/tools/${id}`,
      version: String(rel.number),
      minutes: d.minutes ?? null,
      open: (a) => (d.audiences ?? []).includes(a),
    };
  }
  return null;
}

/** Everything a course author can choose from, for the step picker: published Topics and Magazine courses, and Job Aids. */
function stepChoices(db: Db) {
  const topics = lessons
    .filter((l) => l.track !== "reinforcement")
    .map((l) => ({ ref: `topic:${l.slug}`, kind: "topic" as StepKind, label: l.title, note: l.track === "core" ? "Everyone" : l.track }));
  const courses = (
    db.prepare("SELECT id, title, audience FROM magazine_guides WHERE status = 'published' ORDER BY title").all() as {
      id: string;
      title: string;
      audience: string;
    }[]
  ).map((g) => ({ ref: `course:${g.id}`, kind: "course" as StepKind, label: g.title, note: (JSON.parse(g.audience) as string[]).join(", ") || "Everyone" }));
  const aids = (db.prepare("SELECT id, data FROM playbook_snippets WHERE withdrawn = 0 ORDER BY id").all() as { id: string; data: string }[]).map((s) => {
    const d = JSON.parse(s.data) as { title?: string; audiences?: string[] };
    const approved = Boolean(db.prepare("SELECT 1 FROM playbook_releases WHERE snippet_id = ? AND status = 'approved'").get(s.id));
    return {
      ref: `aid:${s.id}`,
      kind: "job_aid" as StepKind,
      label: d.title ?? s.id,
      note: `${(d.audiences ?? []).join(", ")}${approved ? "" : " · no approved release yet"}`,
    };
  });
  return [...topics, ...courses, ...aids];
}

// ---------------------------------------------------------------------------------------------
// Progress, read from the Hub's own records
// ---------------------------------------------------------------------------------------------

function equivalentsOf(db: Db, ref: string): string[] {
  const rows = db.prepare("SELECT a_ref, b_ref FROM onbc_equivalences WHERE status = 'approved' AND (a_ref = ? OR b_ref = ?)").all(ref, ref) as {
    a_ref: string;
    b_ref: string;
  }[];
  return rows.map((r) => (r.a_ref === ref ? r.b_ref : r.a_ref));
}

/** When and against which version this person finished the item itself (not an equivalent). */
function finished(db: Db, userId: string, ref: string): { at: string; version: string } | null {
  const id = ref.slice(ref.indexOf(":") + 1);
  if (ref.startsWith("topic:")) {
    const r = db
      .prepare(
        "SELECT lesson_version AS v, completed_at AS at FROM lesson_completions WHERE user_id = ? AND lesson_slug = ? ORDER BY completed_at DESC LIMIT 1",
      )
      .get(userId, id) as { v: string; at: string } | undefined;
    return r ? { at: r.at, version: r.v } : null;
  }
  if (ref.startsWith("course:")) {
    const r = db
      .prepare("SELECT revision_id AS v, at FROM magazine_completions WHERE user_id = ? AND guide_id = ? ORDER BY at DESC LIMIT 1")
      .get(userId, id) as { v: string; at: string } | undefined;
    return r ? { at: r.at, version: r.v } : null;
  }
  if (ref.startsWith("aid:")) {
    // A Job Aid step is done when it's saved to Favourites, to keep for work.
    const r = db.prepare("SELECT seen AS v, saved_at AS at FROM favourites WHERE user_id = ? AND kind = 'job_aid' AND target_id = ?").get(userId, id) as
      { v: string; at: string } | undefined;
    return r ? { at: r.at, version: r.v || "saved" } : null;
  }
  return null;
}

function begun(db: Db, userId: string, ref: string) {
  const id = ref.slice(ref.indexOf(":") + 1);
  if (ref.startsWith("topic:")) return Boolean(db.prepare("SELECT 1 FROM lesson_progress WHERE user_id = ? AND slug = ?").get(userId, id));
  if (ref.startsWith("course:")) return Boolean(db.prepare("SELECT 1 FROM magazine_progress WHERE user_id = ? AND guide_id = ?").get(userId, id));
  if (ref.startsWith("aid:")) return Boolean(db.prepare("SELECT 1 FROM playbook_views WHERE user_id = ? AND snippet_id = ?").get(userId, id));
  return false;
}

type StepState = "done" | "started" | "todo" | "unavailable";
export type StepView = {
  id: string;
  title: string;
  kind: StepKind;
  kindLabel: string;
  required: boolean;
  minutes: number | null;
  state: StepState;
  /** Only when this person may open it. */
  href: string | null;
  contentTitle: string | null;
  /** Why it counts without being done here: an approved equivalent, or credited prior learning. */
  credit: string | null;
  /** Why it can't be opened, in words. */
  unavailable: string | null;
  /**
    It exists, but this person's account can't open it (a second role's content). Unlike content that has gone, it
    still counts: the course can't be finished without it, and the exceptions queue says why.
  */
  blocked: boolean;
};

/** A course's steps as this person sees them. `who` is null for a preview, which records nothing and finds nothing done. */
function stepsFor(db: Db, steps: CourseStep[], audience: string, author: boolean, who: string | null): StepView[] {
  return steps.map((s) => {
    const t = targetOf(db, s.ref);
    const base = { id: s.id, title: s.title, kind: s.kind, kindLabel: STEP_KINDS[s.kind], required: s.required, minutes: s.minutes || t?.minutes || null };
    if (!t || !t.open(audience, author))
      return {
        ...base,
        state: "unavailable" as const,
        href: null,
        contentTitle: null,
        credit: null,
        unavailable: !t
          ? "This isn’t available yet. You don’t need to do anything."
          : "This isn’t open to your account yet. Ask for help and an administrator will sort it out.",
        blocked: Boolean(t),
      };
    let state: StepState = "todo";
    let credit: string | null = null;
    if (who) {
      const credited = db.prepare("SELECT reason FROM onbc_credits WHERE user_id = ? AND ref = ?").get(who, s.ref) as { reason: string } | undefined;
      if (finished(db, who, s.ref)) state = "done";
      else if (credited) {
        state = "done";
        credit = "Credited for learning you’ve already done.";
      } else if (equivalentsOf(db, s.ref).some((e) => finished(db, who, e))) {
        state = "done";
        credit = "Counted from an equivalent item you’ve already finished.";
      } else if (begun(db, who, s.ref)) state = "started";
    }
    return { ...base, state, href: t.href, contentTitle: t.label, credit, unavailable: null, blocked: false };
  });
}

const progressOf = (steps: StepView[]) => {
  // Content that has gone doesn't hold anyone up; content they can't open yet does.
  const required = steps.filter((s) => s.required && (s.state !== "unavailable" || s.blocked));
  const done = required.filter((s) => s.state === "done").length;
  const open = (s: StepView) => s.state !== "done" && s.state !== "unavailable";
  const next = required.find(open) ?? steps.find((s) => !s.required && open(s)) ?? null;
  return {
    done,
    total: required.length,
    complete: required.length > 0 && done === required.length,
    started: steps.some((s) => s.state !== "todo" && s.state !== "unavailable"),
    next,
  };
};

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

const courseOf = (r: CourseRow) => JSON.parse(r.data) as CourseData;
const courseVersion = (db: Db, id: string, version: number) =>
  db.prepare("SELECT * FROM onbc_courses WHERE id = ? AND version = ?").get(id, version) as CourseRow | undefined;
/** The version new people are assigned: the latest published one. None when the course is withdrawn or never published. */
const assignable = (db: Db, id: string) =>
  db.prepare("SELECT * FROM onbc_courses WHERE id = ? AND status = 'published' ORDER BY version DESC LIMIT 1").get(id) as CourseRow | undefined;
const latestCourse = (db: Db, id: string) =>
  db.prepare("SELECT * FROM onbc_courses WHERE id = ? ORDER BY version DESC LIMIT 1").get(id) as CourseRow | undefined;

const SEGMENT_KEYS = Object.keys(SEGMENTS) as Segment[];
const SERVICE_KEYS = Object.keys(SERVICE_TYPES) as ServiceType[];
const FUNCTION_KEYS = Object.keys(STAFF_FUNCTIONS) as StaffFunction[];

function cleanCourse(db: Db, raw: Record<string, unknown>): CourseData {
  const segment = SEGMENT_KEYS.find((s) => s === raw.segment);
  if (!segment) throw new HttpError(400, "Choose who the course is for.");
  const learnerTitle = text(raw.learnerTitle, 90);
  if (learnerTitle.length < 4) throw new HttpError(400, "Give the course a title the learner reads, starting with what they’ll do.");
  const ids = new Set<string>();
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 12).map((x, i): CourseStep => {
    const s = (x ?? {}) as Record<string, unknown>;
    const ref = text(s.ref, 140);
    const kind: StepKind | undefined = ref.startsWith("topic:")
      ? "topic"
      : ref.startsWith("course:")
        ? "course"
        : ref.startsWith("aid:")
          ? "job_aid"
          : undefined;
    if (!kind) throw new HttpError(400, `Step ${i + 1} needs a Topic, Magazine course or Job Aid.`);
    let id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : `step-${i + 1}`;
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    return {
      id,
      kind,
      ref,
      title: text(s.title, 120) || `Step ${i + 1}`,
      required: s.required !== false,
      minutes: Math.min(120, Math.max(0, Math.round(Number(s.minutes)) || 0)),
    };
  });
  if (!steps.length) throw new HttpError(400, "Add at least one step.");
  return {
    name: text(raw.name, 90) || learnerTitle,
    learnerTitle,
    gains: (Array.isArray(raw.gains) ? raw.gains : [])
      .map((g) => text(g, 160))
      .filter(Boolean)
      .slice(0, 5),
    segment,
    serviceTypes:
      segment === "supplier"
        ? (Array.isArray(raw.serviceTypes) ? raw.serviceTypes : []).filter((s): s is ServiceType => SERVICE_KEYS.includes(s as ServiceType))
        : [],
    stage: Math.min(5, Math.max(1, Math.round(Number(raw.stage)) || 1)),
    order: Math.min(99, Math.max(0, Math.round(Number(raw.order)) || 0)),
    steps,
    // English is the source. Another language is listed only once its whole course has a reviewed translation.
    languages: ["en", ...(Array.isArray(raw.languages) ? raw.languages : []).filter((l): l is string => typeof l === "string" && l !== "en" && l.length <= 8)],
    ownerTeam: text(raw.ownerTeam, 90),
    reassign: raw.reassign === "new_assignment" ? "new_assignment" : "continue",
    changeNote: text(raw.changeNote, 400),
    gaps: text(raw.gaps, 600),
    demo: raw.demo === true,
  };
}

const canEditCourses = (a: Access) => ownsAny(a) || a.author;

/** Saves a course as a draft: a new version if the current one is published, so a published version never changes. */
export function saveCourse(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  need(canEditCourses(capAccess(db, actor)), "Course templates are edited by learning authors and the people who run onboarding.");
  const data = cleanCourse(db, (input.data ?? {}) as Record<string, unknown>);
  const id = typeof input.id === "string" && /^[a-z0-9-]{3,60}$/.test(input.id) ? input.id : newId("course");
  const latest = latestCourse(db, id);
  const at = now.toISOString();
  if (latest?.status === "draft") db.prepare("UPDATE onbc_courses SET data = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), id, latest.version);
  else
    db.prepare("INSERT INTO onbc_courses (id, version, status, data, created_by, created_at) VALUES (?, ?, 'draft', ?, ?, ?)").run(
      id,
      (latest?.version ?? 0) + 1,
      JSON.stringify(data),
      actor.id,
      at,
    );
  audit(db, {
    actor: actor.id,
    event: "onboarding.course.saved",
    entity: `onbc_course:${id}`,
    next: { version: latest?.status === "draft" ? latest.version : (latest?.version ?? 0) + 1 },
    at: now,
  });
  return { id };
}

/** What's wrong with a course before it can be published: every required step must be open to the people it's for. */
export function coursePublishProblems(db: Db, data: CourseData): string[] {
  const audience = SEGMENT_AUDIENCE[data.segment];
  const problems: string[] = [];
  if (!data.steps.some((s) => s.required)) problems.push("Mark at least one step as required, so the course has a clear completion rule.");
  for (const s of data.steps) {
    const t = targetOf(db, s.ref);
    if (!t) {
      if (s.required)
        problems.push(
          `“${s.title}” points at something that isn’t published${s.kind === "job_aid" ? " (a Job Aid needs an approved release)" : ""}. Make it optional, or choose another.`,
        );
    } else if (!t.open(audience, false)) problems.push(`“${s.title}” isn’t open to ${SEGMENTS[data.segment]}s, so they couldn’t open it.`);
  }
  return problems;
}

/** Publishes the draft. The earlier version stays as it was for the people already on it. */
export function publishCourse(db: Db, actor: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  need(canEditCourses(capAccess(db, actor)), "Course templates are published by learning authors and the people who run onboarding.");
  const latest = typeof id === "string" ? latestCourse(db, id) : undefined;
  if (!latest || latest.status !== "draft") throw new HttpError(400, "There’s no draft of that course to publish.");
  const problems = coursePublishProblems(db, courseOf(latest));
  if (problems.length) throw Object.assign(new HttpError(400, problems[0]), { problems });
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE onbc_courses SET status = 'superseded' WHERE id = ? AND status = 'published'").run(latest.id);
    db.prepare("UPDATE onbc_courses SET status = 'published', published_by = ?, published_at = ? WHERE id = ? AND version = ?").run(
      actor.id,
      at,
      latest.id,
      latest.version,
    );
    audit(db, { actor: actor.id, event: "onboarding.course.published", entity: `onbc_course:${latest.id}`, next: { version: latest.version }, at: now });
  });
  return { id: latest.id, version: latest.version };
}

/** Withdraws a course: nobody new is assigned it. People part-way through keep what they've done, and the exceptions queue lists them. */
export function withdrawCourse(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  need(canEditCourses(capAccess(db, actor)), "Course templates are withdrawn by learning authors and the people who run onboarding.");
  const reason = text(input.reason, 300);
  if (reason.length < 5) throw new HttpError(400, "Say why it’s being withdrawn.");
  const id = String(input.id ?? "");
  if (!assignable(db, id)) throw new HttpError(400, "That course has no published version to withdraw.");
  db.prepare(
    "UPDATE onbc_courses SET status = 'withdrawn', withdrawn_by = ?, withdrawn_at = ?, withdrawn_reason = ? WHERE id = ? AND status = 'published'",
  ).run(actor.id, now.toISOString(), reason, id);
  audit(db, { actor: actor.id, event: "onboarding.course.withdrawn", entity: `onbc_course:${id}`, reason, at: now });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

const ruleOf = (r: RuleRow) => JSON.parse(r.data) as RuleData;
const latestRule = (db: Db, id: string) => db.prepare("SELECT * FROM onbc_rules WHERE id = ? ORDER BY version DESC LIMIT 1").get(id) as RuleRow | undefined;
const publishedRule = (db: Db, id: string) => db.prepare("SELECT * FROM onbc_rules WHERE id = ? AND status = 'published'").get(id) as RuleRow | undefined;

/** The rules in force today: published, and inside their effective dates. */
function rulesInForce(db: Db, now: Date) {
  const d = today(now);
  return (db.prepare("SELECT * FROM onbc_rules WHERE status = 'published'").all() as RuleRow[]).filter((r) => {
    const x = ruleOf(r);
    return x.effectiveFrom <= d && (!x.effectiveTo || x.effectiveTo >= d);
  });
}

function cleanRule(db: Db, raw: Record<string, unknown>, now: Date): RuleData {
  const w = (raw.when ?? {}) as Record<string, unknown>;
  const segment = SEGMENT_KEYS.find((s) => s === w.segment);
  if (!segment) throw new HttpError(400, "Choose the verified role the rule is for.");
  const when: RuleWhen = {
    segment,
    serviceTypes:
      segment === "supplier"
        ? (Array.isArray(w.serviceTypes) ? w.serviceTypes : []).filter((s): s is ServiceType => SERVICE_KEYS.includes(s as ServiceType))
        : [],
    staffFunctions:
      segment === "staff"
        ? (Array.isArray(w.staffFunctions) ? w.staffFunctions : []).filter((s): s is StaffFunction => FUNCTION_KEYS.includes(s as StaffFunction))
        : [],
  };
  const courseId = text(raw.courseId, 60);
  const course = latestCourse(db, courseId);
  if (!course) throw new HttpError(400, "Choose the course it assigns.");
  if (courseOf(course).segment !== segment)
    throw new HttpError(400, `That course is written for ${SEGMENTS[courseOf(course).segment]}s, not ${SEGMENTS[segment]}s.`);
  const ownerUserId = typeof raw.ownerUserId === "string" && raw.ownerUserId ? raw.ownerUserId : null;
  if (ownerUserId) {
    const o = userById(db, ownerUserId);
    if (!o || o.audience !== "staff") throw new HttpError(400, "The owner must be a named Trilogy Care person on the Hub.");
  }
  const dueDays = Math.round(Number(raw.dueDays));
  const effectiveFrom = day(raw.effectiveFrom) ?? today(now);
  const effectiveTo = day(raw.effectiveTo);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new HttpError(400, "The end date is before the start date.");
  const ownerTeam = text(raw.ownerTeam, 90);
  if (!ownerTeam) throw new HttpError(400, "Name the team that owns this rule.");
  return {
    name: text(raw.name, 90) || courseOf(course).name,
    when,
    courseId,
    mandatory: raw.mandatory === true,
    trigger: (Object.keys(TRIGGERS) as (keyof typeof TRIGGERS)[]).find((t) => t === raw.trigger) ?? "joined",
    dueDays: dueDays >= 1 && dueDays <= 365 ? dueDays : null,
    effectiveFrom,
    effectiveTo,
    ownerTeam,
    ownerUserId,
    demo: raw.demo === true,
    note: text(raw.note, 400),
  };
}

/** Saves a rule as a draft: a new version when the current one is published, so the published one never changes underneath anyone. */
export function saveRule(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const data = cleanRule(db, (input.data ?? {}) as Record<string, unknown>, now);
  need(owns(capAccess(db, actor), segmentDomain(data.when.segment)), OWNERS_ONLY);
  const id = typeof input.id === "string" && /^[a-z0-9-]{3,60}$/.test(input.id) ? input.id : newId("rule");
  const latest = latestRule(db, id);
  if (latest && ruleOf(latest).when.segment !== data.when.segment && !owns(capAccess(db, actor), segmentDomain(ruleOf(latest).when.segment)))
    need(false, OWNERS_ONLY);
  if (latest?.status === "draft") db.prepare("UPDATE onbc_rules SET data = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), id, latest.version);
  else
    db.prepare("INSERT INTO onbc_rules (id, version, status, data, created_by, created_at) VALUES (?, ?, 'draft', ?, ?, ?)").run(
      id,
      (latest?.version ?? 0) + 1,
      JSON.stringify(data),
      actor.id,
      now.toISOString(),
    );
  audit(db, { actor: actor.id, event: "onboarding.rule.saved", entity: `onbc_rule:${id}`, next: data, at: now });
  return { id };
}

/**
  Who a rule would reach, without assigning anything: for checking the audience and the load before publishing.
  Only people in populations the admin owns are counted.
*/
export function previewRule(db: Db, actor: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  const r = typeof id === "string" ? latestRule(db, id) : undefined;
  if (!r) throw new HttpError(404, "That rule isn’t here.");
  const data = ruleOf(r);
  const a = capAccess(db, actor);
  need(owns(a, segmentDomain(data.when.segment)), OWNERS_ONLY);
  const course = assignable(db, data.courseId);
  const people: { name: string; organisation: string; as: string; already: boolean }[] = [];
  let confirm = 0;
  for (const u of db.prepare("SELECT * FROM users ORDER BY name").all() as User[]) {
    const ms = membershipsOf(db, u, now);
    for (const m of ms) {
      if (m.segment === "supplier" && data.when.segment === "supplier" && !m.serviceType) confirm += 1;
      if (!matches(data.when, m)) continue;
      const already = Boolean(db.prepare("SELECT 1 FROM onbc_enrolments WHERE user_id = ? AND org_id = ? AND course_id = ?").get(u.id, m.orgId, data.courseId));
      people.push({ name: u.name, organisation: m.orgName, as: membershipLabel(m), already });
    }
  }
  return {
    summary: ruleSummary(
      data,
      course ? courseOf(course).learnerTitle : latestCourse(db, data.courseId) ? courseOf(latestCourse(db, data.courseId)!).learnerTitle : data.courseId,
      r.mandatory_state,
    ),
    courseAssignable: Boolean(course),
    eligible: people.length,
    newEnrolments: people.filter((p) => !p.already).length,
    alreadyEnrolled: people.filter((p) => p.already).length,
    needWorkType: confirm,
    minutesEach: course
      ? courseOf(course)
          .steps.filter((s) => s.required)
          .reduce((n, s) => n + (s.minutes || targetOf(db, s.ref)?.minutes || 0), 0)
      : 0,
    sample: people.slice(0, 25),
  };
}

/**
  Puts a rule's draft in force and assigns it to everyone it now applies to. A rule asking to be mandatory is
  mandatory only when its named owner publishes or approves it; until then it's recommended, with no due date.
  A course that's withdrawn, or was never published, can't be assigned.
*/
export function publishRule(db: Db, actor: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  const r = typeof id === "string" ? latestRule(db, id) : undefined;
  if (!r || r.status !== "draft") throw new HttpError(400, "There’s no draft of that rule to publish.");
  const data = ruleOf(r);
  need(owns(capAccess(db, actor), segmentDomain(data.when.segment)), OWNERS_ONLY);
  if (!assignable(db, data.courseId)) throw new HttpError(400, "That course isn’t published (or has been withdrawn), so it can’t be assigned.");
  const state: MandatoryState = !data.mandatory ? "none" : data.ownerUserId === actor.id ? "approved" : "pending";
  const at = now.toISOString();
  tx(db, () => {
    db.prepare(
      "UPDATE onbc_rules SET status = 'retired', retired_by = ?, retired_at = ?, retired_reason = 'Replaced by a newer version' WHERE id = ? AND status = 'published'",
    ).run(actor.id, at, r.id);
    db.prepare(
      "UPDATE onbc_rules SET status = 'published', mandatory_state = ?, published_by = ?, published_at = ?, approved_by = ?, approved_at = ? WHERE id = ? AND version = ?",
    ).run(state, actor.id, at, state === "approved" ? actor.id : null, state === "approved" ? at : null, r.id, r.version);
    audit(db, { actor: actor.id, event: "onboarding.rule.published", entity: `onbc_rule:${r.id}`, next: { version: r.version, mandatory: state }, at: now });
  });
  return { ...assignEveryone(db, now, segmentDomain(data.when.segment)), mandatory: state };
}

/** The named owner approves a rule as mandatory: from now, its people have a due date and reminders. */
export function approveRule(db: Db, actor: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  const r = typeof id === "string" ? publishedRule(db, id) : undefined;
  if (!r) throw new HttpError(404, "That rule isn’t in force.");
  const data = ruleOf(r);
  if (!data.mandatory) throw new HttpError(400, "That rule isn’t asking to be mandatory.");
  if (!data.ownerUserId || data.ownerUserId !== actor.id)
    throw new HttpError(
      403,
      data.ownerUserId
        ? `Only ${nameOf(db, data.ownerUserId)}, its named owner, can make this mandatory.`
        : "Name an owner first: only they can make it mandatory.",
    );
  if (r.mandatory_state === "approved") return { ok: true };
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE onbc_rules SET mandatory_state = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND version = ?").run(
      actor.id,
      at,
      r.id,
      r.version,
    );
    // People already on it get a due date counted from today, not from when it was only a recommendation.
    for (const e of db.prepare("SELECT * FROM onbc_enrolments WHERE rule_id = ? AND status = 'active'").all(r.id) as EnrolmentRow[])
      db.prepare("UPDATE onbc_enrolments SET mandatory = 1, due_on = COALESCE(due_on, ?), updated_at = ? WHERE id = ?").run(
        data.dueDays ? addDays(at, data.dueDays) : null,
        at,
        e.id,
      );
    audit(db, { actor: actor.id, event: "onboarding.rule.mandatory_approved", entity: `onbc_rule:${r.id}`, next: { version: r.version }, at: now });
  });
  return { ok: true };
}

export function retireRule(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const r = publishedRule(db, String(input.id ?? ""));
  if (!r) throw new HttpError(404, "That rule isn’t in force.");
  need(owns(capAccess(db, actor), segmentDomain(ruleOf(r).when.segment)), OWNERS_ONLY);
  const reason = text(input.reason, 300);
  if (reason.length < 5) throw new HttpError(400, "Say why it’s being retired.");
  db.prepare("UPDATE onbc_rules SET status = 'retired', retired_by = ?, retired_at = ?, retired_reason = ? WHERE id = ? AND version = ?").run(
    actor.id,
    now.toISOString(),
    reason,
    r.id,
    r.version,
  );
  // Nobody loses a course they're on because a rule was retired: they carry on, and what's finished stays finished.
  audit(db, { actor: actor.id, event: "onboarding.rule.retired", entity: `onbc_rule:${r.id}`, reason, at: now });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Evaluation: idempotent, and a delta on change
// ---------------------------------------------------------------------------------------------

type Plan = { courseId: string; orgId: string; membership: Membership; rule: RuleRow };

/** What the rules in force say this person should have, one per course and organisation. Assigns nothing. */
function planFor(db: Db, u: User, now: Date): Plan[] {
  const out = new Map<string, Plan>();
  const ms = membershipsOf(db, u, now);
  for (const r of rulesInForce(db, now)) {
    const data = ruleOf(r);
    if (data.trigger === "manual") continue;
    for (const m of ms)
      if (matches(data.when, m) && !out.has(`${data.courseId}|${m.orgId}`))
        out.set(`${data.courseId}|${m.orgId}`, { courseId: data.courseId, orgId: m.orgId, membership: m, rule: r });
  }
  return [...out.values()];
}

const latestEnrolment = (db: Db, userId: string, orgId: string, courseId: string) =>
  db
    .prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? AND org_id = ? AND course_id = ? ORDER BY course_version DESC, assigned_at DESC LIMIT 1")
    .get(userId, orgId, courseId) as EnrolmentRow | undefined;

/** One invitation per enrolment: the role, the course, the immediate action, and the due date only if there is one. */
function invite(db: Db, e: Pick<EnrolmentRow, "id" | "user_id" | "due_on" | "mandatory">, c: CourseData, label: string, now: Date) {
  notify(
    db,
    e.user_id,
    {
      kind: "action",
      category: "Getting started",
      priority: e.mandatory ? "high" : "normal",
      title: `Start here: ${c.learnerTitle}`,
      body: `You’re on the Hub as ${label}. Your first step is “${c.steps[0]?.title ?? "the first step"}”. You can stop and come back.${e.due_on ? "" : " There’s no due date."}`,
      href: `/onboarding/course/${e.id}`,
      dueAt: e.due_on ? `${e.due_on}T23:59:00Z` : null,
      source: `onbc:invite:${e.id}`,
    },
    now,
  );
  db.prepare("UPDATE onbc_enrolments SET invited_at = COALESCE(invited_at, ?) WHERE id = ?").run(now.toISOString(), e.id);
}

/** Closes the invitation and any reminders for an enrolment: on completion, exemption, or when it no longer applies. */
function closeNotices(db: Db, enrolmentId: string, now: Date) {
  db.prepare("UPDATE notifications SET done_at = COALESCE(done_at, ?) WHERE source = ? OR source LIKE ?").run(
    now.toISOString(),
    `onbc:invite:${enrolmentId}`,
    `onbc:remind:%:${enrolmentId}`,
  );
}

function insertEnrolment(
  db: Db,
  e: {
    userId: string;
    orgId: string;
    membership: string;
    courseId: string;
    version: number;
    source: "rule" | "manual";
    rule: RuleRow | null;
    reason: string;
    by: string;
    due: string | null;
    mandatory: boolean;
  },
  now: Date,
) {
  const id = newId("enr");
  const at = now.toISOString();
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO onbc_enrolments (id, user_id, org_id, membership, course_id, course_version, source, rule_id, rule_version, reason, assigned_by, assigned_at, mandatory, due_on, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      id,
      e.userId,
      e.orgId,
      e.membership,
      e.courseId,
      e.version,
      e.source,
      e.rule?.id ?? null,
      e.rule?.version ?? null,
      e.reason,
      e.by,
      at,
      e.mandatory ? 1 : 0,
      e.due,
      at,
    );
  return Number(res.changes) ? id : null;
}

/**
  Brings one person's enrolments into line with the rules in force and who they are today. Safe to run on every
  sign-in and every event: it adds only what's missing, never a duplicate (the database refuses one), ends only
  what no longer applies to them, and never touches a completed or exempted record, or a manual assignment.
*/
export function evaluate(db: Db, u: User, now: Date, actor = SYSTEM) {
  ensureCourses(db, now);
  const plan = planFor(db, u, now);
  const held = disputed(db, u.id);
  const added: string[] = [];
  const ended: string[] = [];
  tx(db, () => {
    for (const p of plan) {
      const course = assignable(db, p.courseId);
      if (!course) continue;
      const data = courseOf(course);
      const latest = latestEnrolment(db, u.id, p.orgId, p.courseId);
      if (latest) {
        // Back in scope after a change: pick up where they were, rather than starting again.
        if (latest.status === "ended" && latest.source === "rule" && !held) {
          db.prepare("UPDATE onbc_enrolments SET status = 'active', ended_at = NULL, ended_reason = '', updated_at = ? WHERE id = ?").run(
            now.toISOString(),
            latest.id,
          );
          audit(db, { actor, event: "onboarding.enrolment.reinstated", entity: `onbc_enrolment:${latest.id}`, at: now });
          added.push(latest.id);
        }
        // A new version that the owner says needs a new assignment, for someone who finished the old one.
        if (latest.course_version < course.version && data.reassign === "new_assignment" && latest.status === "completed" && !held) {
          const id = insertEnrolment(db, enrolmentFields(u, p, course, data, now), now);
          if (id) {
            added.push(id);
            invite(db, { id, user_id: u.id, ...dueOf(p.rule, now) }, data, membershipLabel(p.membership), now);
          }
        }
        continue;
      }
      if (held) continue;
      const id = insertEnrolment(db, enrolmentFields(u, p, course, data, now), now);
      if (!id) continue;
      added.push(id);
      audit(db, {
        actor,
        event: "onboarding.enrolment.assigned",
        entity: `onbc_enrolment:${id}`,
        next: { user: u.id, course: p.courseId, version: course.version, rule: `${p.rule.id}@${p.rule.version}` },
        at: now,
      });
      invite(db, { id, user_id: u.id, ...dueOf(p.rule, now) }, data, membershipLabel(p.membership), now);
    }
    // The delta on a change of role or work: a rule still in force that no longer fits them ends, keeping what's done.
    if (!held) {
      const wanted = new Set(plan.map((p) => `${p.courseId}|${p.orgId}`));
      const live = new Set(rulesInForce(db, now).map((r) => r.id));
      for (const e of db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? AND status = 'active' AND source = 'rule'").all(u.id) as EnrolmentRow[]) {
        if (wanted.has(`${e.course_id}|${e.org_id}`) || !e.rule_id || !live.has(e.rule_id)) continue;
        db.prepare("UPDATE onbc_enrolments SET status = 'ended', ended_at = ?, ended_reason = ?, updated_at = ? WHERE id = ?").run(
          now.toISOString(),
          "Your role or work changed, so this course no longer applies. Anything you finished is kept.",
          now.toISOString(),
          e.id,
        );
        closeNotices(db, e.id, now);
        audit(db, {
          actor,
          event: "onboarding.enrolment.ended",
          entity: `onbc_enrolment:${e.id}`,
          reason: "No longer matches their verified role or work",
          at: now,
        });
        ended.push(e.id);
      }
    }
  });
  refreshProgress(db, u, now);
  return { added, ended, held };
}

const dueOf = (rule: RuleRow, now: Date) => {
  const data = ruleOf(rule);
  const mandatory = rule.mandatory_state === "approved";
  return { mandatory: mandatory ? 1 : 0, due_on: mandatory && data.dueDays ? addDays(now.toISOString(), data.dueDays) : null };
};

function enrolmentFields(u: User, p: Plan, course: CourseRow, data: CourseData, now: Date) {
  const d = dueOf(p.rule, now);
  return {
    userId: u.id,
    orgId: p.orgId,
    membership: membershipKey(p.membership),
    courseId: course.id,
    version: course.version,
    source: "rule" as const,
    rule: p.rule,
    reason: "",
    by: SYSTEM,
    due: d.due_on,
    mandatory: Boolean(d.mandatory),
  };
}

/** Runs evaluation for everyone in a population: after a rule is published. */
function assignEveryone(db: Db, now: Date, domain: Domain) {
  let added = 0;
  for (const u of db.prepare("SELECT * FROM users").all() as User[])
    if (domainOf(u.audience) === domain || membershipsOf(db, u, now).some((m) => segmentDomain(m.segment) === domain))
      added += evaluate(db, u, now).added.length;
  return { added };
}

/**
  Records completion against the exact versions finished, and when someone first started. Completion is recorded
  here and nowhere else: not supplier approval, not a setup task, not a credential.
*/
function refreshProgress(db: Db, u: User, now: Date) {
  const author = canAuthor(u);
  for (const e of db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? AND status = 'active'").all(u.id) as EnrolmentRow[]) {
    const c = courseVersion(db, e.course_id, e.course_version);
    if (!c) continue;
    const data = courseOf(c);
    const steps = stepsFor(db, data.steps, u.audience, author, u.id);
    const p = progressOf(steps);
    const at = now.toISOString();
    if (p.started && !e.started_at) db.prepare("UPDATE onbc_enrolments SET started_at = ?, updated_at = ? WHERE id = ?").run(at, at, e.id);
    if (p.complete) {
      const snapshot = data.steps.map((s) => {
        const f = finished(db, u.id, s.ref);
        return { step: s.id, ref: s.ref, version: f?.version ?? null, at: f?.at ?? null, via: f ? "done" : (steps.find((x) => x.id === s.id)?.credit ?? null) };
      });
      db.prepare(
        "UPDATE onbc_enrolments SET status = 'completed', completed_at = ?, completion = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status = 'active'",
      ).run(at, JSON.stringify({ courseVersion: e.course_version, steps: snapshot }), at, at, e.id);
      closeNotices(db, e.id, now);
      audit(db, {
        actor: u.id,
        event: "onboarding.enrolment.completed",
        entity: `onbc_enrolment:${e.id}`,
        next: { course: e.course_id, version: e.course_version },
        at: now,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Reminders: the specific step and the real due date, once each, and never after it's done
// ---------------------------------------------------------------------------------------------

/**
  For mandatory enrolments with a due date: one reminder a week out and one when it's overdue, naming the next
  unfinished step. If two courses share that step, the person is reminded once. Run by the worker.
*/
export function courseReminders(db: Db, now: Date) {
  ensureCourses(db, now);
  let sent = 0;
  const rows = db.prepare("SELECT * FROM onbc_enrolments WHERE status = 'active' AND due_on IS NOT NULL").all() as EnrolmentRow[];
  for (const e of rows) {
    const u = userById(db, e.user_id);
    const c = courseVersion(db, e.course_id, e.course_version);
    if (!u || !c) continue;
    const days = Math.ceil((Date.parse(`${e.due_on}T23:59:59Z`) - now.getTime()) / 86_400_000);
    const stage = days < 0 ? "overdue" : days <= 7 ? "soon" : null;
    if (!stage || e.reminded.split(",").includes(stage)) continue;
    const data = courseOf(c);
    const next = progressOf(stepsFor(db, data.steps, u.audience, canAuthor(u), u.id)).next;
    if (!next) continue;
    const step = data.steps.find((s) => s.id === next.id)!;
    const same = db
      .prepare("SELECT 1 FROM notifications WHERE user_id = ? AND source LIKE ? AND done_at IS NULL")
      .get(u.id, `onbc:remind:${stage}:${step.ref}:%`);
    if (!same) {
      notify(
        db,
        u.id,
        {
          kind: "action",
          category: "Getting started",
          priority: stage === "overdue" ? "high" : "normal",
          title: stage === "overdue" ? `Overdue: ${next.title}` : `Due ${e.due_on}: ${next.title}`,
          body: `This is the next step in “${data.learnerTitle}”, due ${e.due_on}. It takes about ${next.minutes ?? 10} minutes. If something is stopping you, use Get help on the course page.`,
          href: `/onboarding/course/${e.id}`,
          dueAt: `${e.due_on}T23:59:00Z`,
          source: `onbc:remind:${stage}:${step.ref}:${e.id}`,
        },
        now,
      );
      sent += 1;
    }
    db.prepare("UPDATE onbc_enrolments SET reminded = ? WHERE id = ?").run([e.reminded, stage].filter(Boolean).join(","), e.id);
  }
  return { sent };
}

// ---------------------------------------------------------------------------------------------
// The learner
// ---------------------------------------------------------------------------------------------

type PrefsRow = {
  user_id: string;
  mode: ReadMode;
  text_size: TextSize;
  first_run_step: string | null;
  first_run_done_at: string | null;
  last_seen_at: string | null;
};
const prefsOf = (db: Db, userId: string) => db.prepare("SELECT * FROM onbc_prefs WHERE user_id = ?").get(userId) as PrefsRow | undefined;

function whyText(db: Db, e: EnrolmentRow, memberships: Membership[]) {
  if (e.source === "manual")
    return {
      text: `${nameOf(db, e.assigned_by)} assigned this to you: ${e.reason}`,
      owner: null as string | null,
      demo: false,
      mandatory: Boolean(e.mandatory),
    };
  const r = e.rule_id ? (db.prepare("SELECT * FROM onbc_rules WHERE id = ? AND version = ?").get(e.rule_id, e.rule_version) as RuleRow | undefined) : undefined;
  const m = memberships.find((x) => membershipKey(x) === e.membership) ?? memberships.find((x) => `${x.id}` === e.membership.split(":")[0]);
  const as = m ? membershipLabel(m) : "your role";
  if (!r) return { text: `It’s the starting course for ${as}.`, owner: null, demo: false, mandatory: Boolean(e.mandatory) };
  const data = ruleOf(r);
  return {
    text: `You’re on the Hub as ${as}, and this is the starting course for that work. ${
      r.mandatory_state === "approved" ? `${data.ownerTeam} has made it required.` : "It’s recommended, not required: nobody has made it mandatory."
    }`,
    owner: data.ownerTeam,
    demo: data.demo,
    mandatory: r.mandatory_state === "approved",
  };
}

export type EnrolmentView = ReturnType<typeof enrolmentView>;

function enrolmentView(
  db: Db,
  u: Pick<User, "id" | "audience"> & { author: boolean },
  e: EnrolmentRow,
  memberships: Membership[],
  now: Date,
  who: string | null,
) {
  const c = courseVersion(db, e.course_id, e.course_version)!;
  const data = courseOf(c);
  const steps = stepsFor(db, data.steps, u.audience, u.author, who);
  const p = progressOf(steps);
  const current = assignable(db, e.course_id);
  const org = orgName(db, e.org_id);
  return {
    id: e.id,
    courseId: e.course_id,
    version: e.course_version,
    title: data.learnerTitle,
    gains: data.gains,
    minutes: steps.filter((s) => s.required && s.state !== "done" && s.state !== "unavailable").reduce((n, s) => n + (s.minutes ?? 10), 0),
    status: e.status,
    organisation: org,
    steps,
    progress: { done: p.done, total: p.total },
    next: p.next,
    due: e.status === "active" ? dueWords(e.due_on, now) : null,
    dueOn: e.due_on,
    why: whyText(db, e, memberships),
    demo: data.demo,
    stage: data.stage,
    order: data.order,
    /** A newer version is out, and this person is carrying on with theirs. */
    updated: current && current.version > e.course_version ? { version: current.version, note: courseOf(current).changeNote } : null,
    completedAt: e.completed_at,
    endedReason: e.status === "ended" ? e.ended_reason : null,
    exemptReason: e.status === "exempted" ? e.exempt_reason : null,
    reviewedLanguages: data.languages,
  };
}

function helpRoutes(db: Db, audience: string) {
  const urgent = targetOf(db, "aid:sirs-first-steps");
  return {
    jobAids: "/tools",
    ask: "/inbox",
    urgent: {
      text: "If someone is in danger or needs urgent medical help, call 000 now. For an incident, complaint or safety concern, follow the approved process and tell Trilogy Care straight away.",
      href: urgent?.open(audience, false) ? urgent.href : "/tools/incident-first-steps",
    },
  };
}

/**
  The signed-in person's getting-started view: who the Hub has them as, their preferences, the one thing to do
  next, a couple of next steps, and what they've finished. Runs evaluation first, so it's always current.
*/
export function myCourses(db: Db, user: User, now: Date) {
  ensureCourses(db, now);
  const before = prefsOf(db, user.id);
  const { held } = evaluate(db, user, now);
  const memberships = membershipsOf(db, user, now);
  const rows = db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? ORDER BY assigned_at").all(user.id) as EnrolmentRow[];
  const me = { id: user.id, audience: user.audience, author: canAuthor(user) };
  const views = rows.map((e) => enrolmentView(db, me, e, memberships, now, user.id));
  const active = views.filter((v) => v.status === "active").sort((a, b) => a.stage - b.stage || a.order - b.order);
  const needsWorkType = memberships.some((m) => m.segment === "supplier" && !m.serviceType);
  // A long gap: greet them with where they're up to, not the first-run slides again.
  const away = before?.last_seen_at ? Math.floor((now.getTime() - Date.parse(before.last_seen_at)) / 86_400_000) : null;
  const at = now.toISOString();
  if (!before) db.prepare("INSERT INTO onbc_prefs (user_id, last_seen_at, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO NOTHING").run(user.id, at, at);
  else if (!before.last_seen_at || now.getTime() - Date.parse(before.last_seen_at) > 3_600_000)
    db.prepare("UPDATE onbc_prefs SET last_seen_at = ? WHERE user_id = ?").run(at, user.id);
  const prefs = prefsOf(db, user.id)!;
  const primary = active[0] ?? null;
  return {
    person: {
      name: user.name,
      firstName: user.name.split(" ")[0],
      roles: memberships.map((m) => ({
        label: membershipLabel(m),
        segment: m.segment,
        segmentLabel: SEGMENTS[m.segment],
        organisation: m.orgName,
        serviceType: m.serviceType,
        work: m.serviceType ? SERVICE_PHRASES[m.serviceType] : null,
      })),
    },
    /** We need to confirm your work type: missing or disputed role data. Nothing broader is assigned meanwhile. */
    confirm: needsWorkType || held ? { reason: held ? ("disputed" as const) : ("missing" as const) } : null,
    prefs: { language: user.language ?? "en", languageName: languageName(user.language ?? "en"), mode: prefs.mode, textSize: prefs.text_size },
    firstRun: { done: Boolean(prefs.first_run_done_at), step: prefs.first_run_step },
    returning: away !== null && away >= 30 ? { days: away } : null,
    primary,
    /** One or two things to do now, from the primary course first. */
    nextSteps: active
      .flatMap((c) => c.steps.filter((s) => s.state !== "done" && s.state !== "unavailable").map((s) => ({ ...s, course: c.title, enrolmentId: c.id })))
      .slice(1, 3),
    courses: active,
    history: views.filter((v) => v.status !== "active"),
    help: helpRoutes(db, user.audience),
    /** Three statuses kept apart: the Hub account, learning, and operational approval (owned elsewhere). */
    statuses: {
      account: "You can sign in to the Hub.",
      learning: active.length
        ? `${active.length} course${active.length === 1 ? "" : "s"} in progress.`
        : views.some((v) => v.status === "completed")
          ? "Your starting courses are complete."
          : "Nothing assigned yet.",
      operational:
        memberships[0]?.segment === "staff"
          ? "Your employment and system access are managed by People & Culture, not by these courses."
          : "Approval to start work (checks, credentials and agreements) is managed by Trilogy Care Partner Operations. Finishing a course doesn’t approve you to start a service.",
    },
  };
}
export type MyCourses = ReturnType<typeof myCourses>;

/** One of the person's own enrolments, in full. Anyone else's is "not found": no title, no steps. */
export function myEnrolment(db: Db, user: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  const e =
    typeof id === "string"
      ? (db.prepare("SELECT * FROM onbc_enrolments WHERE id = ? AND user_id = ?").get(id, user.id) as EnrolmentRow | undefined)
      : undefined;
  if (!e) throw new HttpError(404, "That course isn’t one of yours.");
  refreshProgress(db, user, now);
  const fresh = db.prepare("SELECT * FROM onbc_enrolments WHERE id = ?").get(e.id) as EnrolmentRow;
  const prefs = prefsOf(db, user.id);
  return {
    course: enrolmentView(db, { id: user.id, audience: user.audience, author: canAuthor(user) }, fresh, membershipsOf(db, user, now), now, user.id),
    prefs: {
      language: user.language ?? "en",
      languageName: languageName(user.language ?? "en"),
      mode: prefs?.mode ?? "read",
      textSize: prefs?.text_size ?? "standard",
    },
    help: helpRoutes(db, user.audience),
  };
}

/** Read or listen, text size, and where they are in the first run. Nothing else: a role can't be set from here. */
export function savePrefs(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const at = now.toISOString();
  const was = prefsOf(db, user.id);
  const mode = (Object.keys(READ_MODES) as ReadMode[]).find((m) => m === input.mode) ?? was?.mode ?? "read";
  const size = (Object.keys(TEXT_SIZES) as TextSize[]).find((m) => m === input.textSize) ?? was?.text_size ?? "standard";
  const step = typeof input.step === "string" && /^[a-z-]{1,20}$/.test(input.step) ? input.step : (was?.first_run_step ?? null);
  db.prepare(
    `INSERT INTO onbc_prefs (user_id, mode, text_size, first_run_step, first_run_done_at, last_seen_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET mode = excluded.mode, text_size = excluded.text_size, first_run_step = excluded.first_run_step,
       first_run_done_at = COALESCE(onbc_prefs.first_run_done_at, excluded.first_run_done_at), updated_at = excluded.updated_at`,
  ).run(user.id, mode, size, step, input.done === true ? at : null, at, at);
  return { mode, textSize: size, step, done: input.done === true || Boolean(was?.first_run_done_at) };
}

/** Get help: language or access, something broken, a work question, or progress that's wrong. Goes to the exceptions queue. */
export function askForHelp(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const kind = (Object.keys(HELP_KINDS) as HelpKind[]).find((k) => k === input.kind);
  if (!kind) throw new HttpError(400, "Choose what you need help with.");
  const message = text(input.message, 800);
  // Someone asking for their language may not be able to write in English: the request alone is enough.
  if (kind !== "language" && message.length < 5) throw new HttpError(400, "Tell us a little about it, so the right person can help.");
  const enrolment = typeof input.enrolmentId === "string" && input.enrolmentId ? input.enrolmentId : null;
  if (enrolment && !db.prepare("SELECT 1 FROM onbc_enrolments WHERE id = ? AND user_id = ?").get(enrolment, user.id))
    throw new HttpError(404, "That course isn’t one of yours.");
  if (db.prepare("SELECT 1 FROM onbc_help WHERE user_id = ? AND kind = ? AND state = 'open'").get(user.id, kind))
    return { ok: true, already: true, message: "You’ve already asked about this. Someone will be in touch." };
  db.prepare("INSERT INTO onbc_help (id, user_id, enrolment_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId("help"),
    user.id,
    enrolment,
    kind,
    message,
    now.toISOString(),
  );
  return { ok: true, already: false, message: "Thanks. Your request has gone to the Trilogy Care onboarding team. You can keep going meanwhile." };
}

// ---------------------------------------------------------------------------------------------
// Admin: people, enrolments and exceptions
// ---------------------------------------------------------------------------------------------

function target(db: Db, actor: User, userId: unknown) {
  const u = typeof userId === "string" ? userById(db, userId) : undefined;
  if (!u) throw new HttpError(404, "That person isn’t on the Hub.");
  need(owns(capAccess(db, actor), domainOf(u.audience)), "Only this person’s population owner can see or change their onboarding.");
  return u;
}

export function searchPeople(db: Db, actor: User, q: unknown, now: Date) {
  ensureCourses(db, now);
  const a = capAccess(db, actor);
  need(ownsAny(a), OWNERS_ONLY);
  const term = text(q, 60).toLowerCase();
  return (db.prepare("SELECT u.*, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.name").all() as (User & { org: string })[])
    .filter((u) => owns(a, domainOf(u.audience)) && (!term || `${u.name} ${u.org}`.toLowerCase().includes(term)))
    .slice(0, 50)
    .map((u) => {
      const ms = membershipsOf(db, u, now);
      const counts = db.prepare("SELECT status, COUNT(*) AS n FROM onbc_enrolments WHERE user_id = ? GROUP BY status").all(u.id) as {
        status: string;
        n: number;
      }[];
      return {
        id: u.id,
        name: u.name,
        organisation: u.org,
        roles: ms.map(membershipLabel),
        needsWorkType: ms.some((m) => m.segment === "supplier" && !m.serviceType),
        active: counts.find((c) => c.status === "active")?.n ?? 0,
        completed: counts.find((c) => c.status === "completed")?.n ?? 0,
      };
    });
}

/** One person, for an administrator: their verified roles, each enrolment and why, progress, and what they've asked for. Never their language or reading preferences. */
export function personCourses(db: Db, actor: User, userId: unknown, now: Date) {
  ensureCourses(db, now);
  const u = target(db, actor, userId);
  refreshProgress(db, u, now);
  const ms = membershipsOf(db, u, now);
  const rows = db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? ORDER BY assigned_at DESC").all(u.id) as EnrolmentRow[];
  const me = { id: u.id, audience: u.audience, author: canAuthor(u) };
  return {
    id: u.id,
    name: u.name,
    memberships: ms.map((m) => ({ ...m, label: membershipLabel(m), segmentLabel: SEGMENTS[m.segment] })),
    needsWorkType: ms.some((m) => m.segment === "supplier" && !m.serviceType),
    disputed: disputed(db, u.id),
    plan: planFor(db, u, now).map((p) => ({
      course: assignable(db, p.courseId) ? courseOf(assignable(db, p.courseId)!).learnerTitle : p.courseId,
      rule: ruleOf(p.rule).name,
    })),
    enrolments: rows.map((e) => {
      const v = enrolmentView(db, me, e, ms, now, u.id);
      return {
        ...v,
        source: e.source,
        rule: e.rule_id ? `${e.rule_id} v${e.rule_version}` : null,
        assignedAt: e.assigned_at,
        assignedBy: nameOf(db, e.assigned_by),
        invitedAt: e.invited_at,
        startedAt: e.started_at,
        completion: e.completion ? (JSON.parse(e.completion) as unknown) : null,
        exemptBy: nameOf(db, e.exempt_by),
        exemptReviewOn: e.exempt_review_on,
      };
    }),
    credits: (
      db.prepare("SELECT * FROM onbc_credits WHERE user_id = ?").all(u.id) as { ref: string; reason: string; granted_by: string; granted_at: string }[]
    ).map((c) => ({
      ref: c.ref,
      label: targetOf(db, c.ref)?.label ?? c.ref,
      reason: c.reason,
      by: nameOf(db, c.granted_by),
      at: c.granted_at,
    })),
    help: (
      db.prepare("SELECT id, kind, message, state, created_at FROM onbc_help WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(u.id) as {
        id: string;
        kind: HelpKind;
        message: string;
        state: string;
        created_at: string;
      }[]
    ).map((h) => ({ ...h, kindLabel: HELP_KINDS[h.kind] ?? h.kind })),
    courses: (db.prepare("SELECT id FROM onbc_courses GROUP BY id").all() as { id: string }[]).flatMap((c) => {
      const p = assignable(db, c.id);
      return p ? [{ id: c.id, title: courseOf(p).learnerTitle, segment: courseOf(p).segment, version: p.version }] : [];
    }),
  };
}

/**
  A manual assignment for a small pilot, with the reason on record. Only a published course, and only one that's
  for a role the person actually holds: a course link must never put another role's content in front of them.
*/
export function assignManually(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const u = target(db, actor, input.userId);
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Give the reason for assigning it. The person sees this under “Why am I seeing this?”.");
  const course = assignable(db, String(input.courseId ?? ""));
  if (!course) throw new HttpError(400, "That course isn’t published (or has been withdrawn), so it can’t be assigned.");
  const data = courseOf(course);
  const m = membershipsOf(db, u, now).find(
    (x) => x.segment === data.segment && (!data.serviceTypes.length || (x.serviceType && data.serviceTypes.includes(x.serviceType))),
  );
  if (!m)
    throw new HttpError(
      400,
      `${u.name} doesn’t hold a verified role this course is written for (${SEGMENTS[data.segment]}${data.serviceTypes.length ? `, ${data.serviceTypes.map((s) => SERVICE_TYPES[s]).join(" or ")}` : ""}).`,
    );
  const due = day(input.dueOn);
  if (due && due < today(now)) throw new HttpError(400, "Choose a due date from today on.");
  const existing = latestEnrolment(db, u.id, m.orgId, course.id);
  if (existing && existing.course_version === course.version && existing.status !== "ended") throw new HttpError(409, "They already have this course.");
  let id: string | null = null;
  tx(db, () => {
    if (existing?.status === "ended" && existing.course_version === course.version) {
      db.prepare(
        "UPDATE onbc_enrolments SET status = 'active', source = 'manual', reason = ?, assigned_by = ?, due_on = ?, ended_at = NULL, ended_reason = '', updated_at = ? WHERE id = ?",
      ).run(reason, actor.id, due, now.toISOString(), existing.id);
      id = existing.id;
    } else
      id = insertEnrolment(
        db,
        {
          userId: u.id,
          orgId: m.orgId,
          membership: membershipKey(m),
          courseId: course.id,
          version: course.version,
          source: "manual",
          rule: null,
          reason,
          by: actor.id,
          due,
          mandatory: false,
        },
        now,
      );
    if (!id) throw new HttpError(409, "They already have this course.");
    audit(db, {
      actor: actor.id,
      event: "onboarding.enrolment.manual",
      entity: `onbc_enrolment:${id}`,
      next: { user: u.id, course: course.id, version: course.version, due },
      reason,
      at: now,
    });
    invite(db, { id, user_id: u.id, due_on: due, mandatory: 0 }, data, membershipLabel(m), now);
  });
  return personCourses(db, actor, u.id, now);
}

function ownEnrolment(db: Db, actor: User, id: unknown) {
  const e = typeof id === "string" ? (db.prepare("SELECT * FROM onbc_enrolments WHERE id = ?").get(id) as EnrolmentRow | undefined) : undefined;
  if (!e) throw new HttpError(404, "That enrolment isn’t here.");
  return { e, u: target(db, actor, e.user_id) };
}

/** An exemption: a reason, a name and a date to review it, all on record. Reminders stop. */
export function exempt(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const { e, u } = ownEnrolment(db, actor, input.enrolmentId);
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Give the reason for the exemption.");
  const review = day(input.reviewOn);
  if (!review || review < today(now)) throw new HttpError(400, "An exemption needs a review date from today on.");
  if (e.status !== "active") throw new HttpError(409, "Only a course in progress can be exempted.");
  db.prepare("UPDATE onbc_enrolments SET status = 'exempted', exempt_by = ?, exempt_reason = ?, exempt_review_on = ?, updated_at = ? WHERE id = ?").run(
    actor.id,
    reason,
    review,
    now.toISOString(),
    e.id,
  );
  closeNotices(db, e.id, now);
  audit(db, { actor: actor.id, event: "onboarding.enrolment.exempted", entity: `onbc_enrolment:${e.id}`, next: { review }, reason, at: now });
  return personCourses(db, actor, u.id, now);
}

/** A new due date, with the reason. Reminders start again for the new date. */
export function extend(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const { e, u } = ownEnrolment(db, actor, input.enrolmentId);
  const reason = text(input.reason, 300);
  const due = day(input.dueOn);
  if (reason.length < 10) throw new HttpError(400, "Give the reason for the new date.");
  if (!due || due < today(now)) throw new HttpError(400, "Choose a due date from today on.");
  if (e.status !== "active") throw new HttpError(409, "Only a course in progress can have a new due date.");
  db.prepare("UPDATE onbc_enrolments SET due_on = ?, reminded = '', updated_at = ? WHERE id = ?").run(due, now.toISOString(), e.id);
  db.prepare("UPDATE notifications SET done_at = COALESCE(done_at, ?) WHERE source LIKE ?").run(now.toISOString(), `onbc:remind:%:${e.id}`);
  audit(db, {
    actor: actor.id,
    event: "onboarding.enrolment.extended",
    entity: `onbc_enrolment:${e.id}`,
    previous: { due: e.due_on },
    next: { due },
    reason,
    at: now,
  });
  return personCourses(db, actor, u.id, now);
}

/** Equivalent prior learning for one item, for one person, with the reason. */
export function creditPrior(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const u = target(db, actor, input.userId);
  const ref = text(input.ref, 140);
  if (!targetOf(db, ref)) throw new HttpError(400, "Choose the item to credit.");
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Say what prior learning this recognises.");
  db.prepare("INSERT OR REPLACE INTO onbc_credits (user_id, ref, reason, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)").run(
    u.id,
    ref,
    reason,
    actor.id,
    now.toISOString(),
  );
  audit(db, { actor: actor.id, event: "onboarding.credit.granted", entity: `user:${u.id}`, next: { ref }, reason, at: now });
  refreshProgress(db, u, now);
  return personCourses(db, actor, u.id, now);
}

/**
  Corrects a supplier's verified service type on their account, with the reason. The person can't do this
  themselves. Their courses follow: the new branch is added, the old one ends, and anything finished is kept.
*/
export function setWorkType(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const u = target(db, actor, input.userId);
  if (primaryMembership(db, u).segment !== "supplier") throw new HttpError(400, "A service type is for suppliers.");
  const st = input.serviceType === "" || input.serviceType === null ? null : SERVICE_KEYS.find((s) => s === input.serviceType);
  if (st === undefined) throw new HttpError(400, "Choose a service type.");
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Say where the verified service type came from.");
  db.prepare("UPDATE users SET service_role = ? WHERE id = ?").run(st, u.id);
  audit(db, {
    actor: actor.id,
    event: "onboarding.work_type.set",
    entity: `user:${u.id}`,
    previous: { serviceType: u.service_role },
    next: { serviceType: st },
    reason,
    at: now,
  });
  evaluate(db, userById(db, u.id)!, now, actor.id);
  return personCourses(db, actor, u.id, now);
}

/** A second verified role: another business, or another kind of work. Its courses are added. */
export function addMembership(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const u = target(db, actor, input.userId);
  const segment = SEGMENT_KEYS.find((s) => s === input.segment);
  if (!segment) throw new HttpError(400, "Choose the role.");
  need(owns(capAccess(db, actor), segmentDomain(segment)), OWNERS_ONLY);
  const org = typeof input.orgId === "string" ? (db.prepare("SELECT id FROM orgs WHERE id = ?").get(input.orgId) as { id: string } | undefined) : undefined;
  if (!org) throw new HttpError(400, "Choose the organisation.");
  const st = segment === "supplier" ? (SERVICE_KEYS.find((s) => s === input.serviceType) ?? null) : null;
  const fn = segment === "staff" ? (FUNCTION_KEYS.find((s) => s === input.staffFunction) ?? "general") : null;
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Say how this role was verified.");
  const id = newId("mem");
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO onbc_memberships (id, user_id, segment, org_id, service_type, staff_function, source, verified_by, verified_at, effective_from, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, u.id, segment, org.id, st, fn, "Verified by an administrator", actor.id, at, day(input.effectiveFrom) ?? today(now), reason);
  audit(db, {
    actor: actor.id,
    event: "onboarding.membership.added",
    entity: `user:${u.id}`,
    next: { segment, org: org.id, serviceType: st, staffFunction: fn },
    reason,
    at: now,
  });
  evaluate(db, u, now, actor.id);
  return personCourses(db, actor, u.id, now);
}

export function endMembership(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const m = db.prepare("SELECT * FROM onbc_memberships WHERE id = ?").get(String(input.membershipId ?? "")) as MembershipRow | undefined;
  if (!m) throw new HttpError(404, "That role isn’t here.");
  const u = target(db, actor, m.user_id);
  const reason = text(input.reason, 300);
  if (reason.length < 10) throw new HttpError(400, "Say why the role has ended.");
  // Ended yesterday, so it's no longer active today.
  db.prepare("UPDATE onbc_memberships SET effective_to = ? WHERE id = ?").run(addDays(today(now), -1), m.id);
  audit(db, { actor: actor.id, event: "onboarding.membership.ended", entity: `user:${u.id}`, previous: { membership: m.id }, reason, at: now });
  evaluate(db, u, now, actor.id);
  return personCourses(db, actor, u.id, now);
}

export function resolveHelp(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  const h = db.prepare("SELECT * FROM onbc_help WHERE id = ?").get(String(input.id ?? "")) as { id: string; user_id: string; state: string } | undefined;
  if (!h) throw new HttpError(404, "That request isn’t here.");
  target(db, actor, h.user_id);
  const resolution = text(input.resolution, 400);
  if (resolution.length < 5) throw new HttpError(400, "Say what was done.");
  db.prepare("UPDATE onbc_help SET state = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?").run(
    resolution,
    actor.id,
    now.toISOString(),
    h.id,
  );
  audit(db, { actor: actor.id, event: "onboarding.help.resolved", entity: `onbc_help:${h.id}`, at: now });
  return { ok: true };
}

export function saveEquivalence(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureCourses(db, now);
  need(ownsAny(capAccess(db, actor)), OWNERS_ONLY);
  const a = text(input.a, 140);
  const b = text(input.b, 140);
  if (!targetOf(db, a) || !targetOf(db, b) || a === b) throw new HttpError(400, "Choose two different published items.");
  const id = newId("eqv");
  db.prepare("INSERT INTO onbc_equivalences (id, a_ref, b_ref, note, status, created_by, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(
    id,
    a,
    b,
    text(input.note, 300),
    actor.id,
    now.toISOString(),
  );
  audit(db, { actor: actor.id, event: "onboarding.equivalence.proposed", entity: `onbc_equivalence:${id}`, next: { a, b }, at: now });
  return { id };
}

/** Approving an equivalence: from now, finishing either counts for both, for everyone. */
export function approveEquivalence(db: Db, actor: User, id: unknown, now: Date) {
  ensureCourses(db, now);
  need(ownsAny(capAccess(db, actor)), OWNERS_ONLY);
  const r =
    typeof id === "string"
      ? (db.prepare("SELECT * FROM onbc_equivalences WHERE id = ? AND status = 'pending'").get(id) as { id: string } | undefined)
      : undefined;
  if (!r) throw new HttpError(404, "That equivalence isn’t waiting for approval.");
  db.prepare("UPDATE onbc_equivalences SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?").run(actor.id, now.toISOString(), r.id);
  audit(db, { actor: actor.id, event: "onboarding.equivalence.approved", entity: `onbc_equivalence:${r.id}`, at: now });
  return { ok: true };
}

/**
  What needs a person's attention: missing or disputed work types, roles with no branch yet, overlapping rules,
  withdrawn or missing content, people asking for their language or reporting a problem, and second roles whose
  content their account can't open. Only for the populations this admin owns.
*/
export function exceptionsQueue(db: Db, actor: User, now: Date) {
  ensureCourses(db, now);
  const a = capAccess(db, actor);
  need(ownsAny(a), OWNERS_ONLY);
  const users = (db.prepare("SELECT * FROM users ORDER BY name").all() as User[]).filter((u) => owns(a, domainOf(u.audience)));
  const items: { kind: string; title: string; detail: string; person?: { id: string; name: string } }[] = [];
  const rules = rulesInForce(db, now);
  for (const u of users) {
    const ms = membershipsOf(db, u, now);
    for (const m of ms) {
      if (m.segment === "supplier" && !m.serviceType)
        items.push({
          kind: "missing_work_type",
          title: "Missing service type",
          detail: `${m.orgName}: no verified service type, so no supplier course is assigned. Confirm it under People.`,
          person: { id: u.id, name: u.name },
        });
      else if (
        m.segment === "supplier" &&
        m.serviceType &&
        !rules.some((r) => ruleOf(r).when.segment === "supplier" && ruleOf(r).when.serviceTypes.includes(m.serviceType!))
      )
        items.push({
          kind: "no_branch",
          title: `No ${SERVICE_TYPES[m.serviceType].toLowerCase()} branch yet`,
          detail: "They have the shared introduction only. A reviewed work-specific branch needs an owner.",
          person: { id: u.id, name: u.name },
        });
      if (SEGMENT_AUDIENCE[m.segment] !== u.audience && m.id !== "primary")
        items.push({
          kind: "second_role_access",
          title: "Second role's content may not open",
          detail: `Their account reads the Hub as ${u.audience}; content written only for ${SEGMENTS[m.segment]}s won’t open for them until their access is updated.`,
          person: { id: u.id, name: u.name },
        });
    }
    if (disputed(db, u.id))
      items.push({
        kind: "wrong_role",
        title: "Says this isn’t their role",
        detail: "Answer it in the Review queue. Nothing new is assigned until it’s resolved.",
        person: { id: u.id, name: u.name },
      });
  }
  const ids = new Set(users.map((u) => u.id));
  for (const h of db.prepare("SELECT * FROM onbc_help WHERE state = 'open' ORDER BY created_at").all() as {
    id: string;
    user_id: string;
    kind: HelpKind;
    message: string;
    created_at: string;
  }[]) {
    if (!ids.has(h.user_id)) continue;
    const kindTitle: Record<HelpKind, string> = {
      language: "Needs another language or audio",
      access: "Can’t use something on their device",
      broken: "Reports broken or missing content",
      question: "Has a question about their work",
      completion: "Disputes their progress or completion",
    };
    items.push({
      kind: `help_${h.kind}`,
      title: kindTitle[h.kind] ?? h.kind,
      detail: h.message || "(No message: they asked for help in their language.)",
      person: { id: h.user_id, name: nameOf(db, h.user_id)! },
    });
  }
  // The same course reached by two rules for overlapping people: one enrolment still, but the owners should know.
  for (let i = 0; i < rules.length; i++)
    for (let j = i + 1; j < rules.length; j++) {
      const x = ruleOf(rules[i]);
      const y = ruleOf(rules[j]);
      if (x.courseId !== y.courseId || x.when.segment !== y.when.segment) continue;
      const overlap = !x.when.serviceTypes.length || !y.when.serviceTypes.length || x.when.serviceTypes.some((s) => y.when.serviceTypes.includes(s));
      if (overlap)
        items.push({
          kind: "overlap",
          title: "Overlapping rules",
          detail: `“${x.name}” and “${y.name}” both assign the same course to some of the same people.`,
        });
    }
  for (const r of rules)
    if (!assignable(db, ruleOf(r).courseId))
      items.push({
        kind: "withdrawn_content",
        title: "Rule points at a withdrawn course",
        detail: `“${ruleOf(r).name}” can’t assign anyone until the course is published again or the rule is retired.`,
      });
  const stale = db
    .prepare(
      "SELECT e.course_id, e.course_version, COUNT(*) AS n FROM onbc_enrolments e JOIN onbc_courses c ON c.id = e.course_id AND c.version = e.course_version WHERE e.status = 'active' AND c.status = 'withdrawn' GROUP BY e.course_id, e.course_version",
    )
    .all() as { course_id: string; course_version: number; n: number }[];
  for (const s of stale)
    items.push({
      kind: "withdrawn_content",
      title: "People are part-way through a withdrawn course",
      detail: `${s.n} on ${courseOf(courseVersion(db, s.course_id, s.course_version)!).learnerTitle} (v${s.course_version}). Decide whether to reassign or exempt them.`,
    });
  for (const c of db.prepare("SELECT * FROM onbc_courses WHERE status = 'published'").all() as CourseRow[]) {
    const missing = courseOf(c).steps.filter((s) => s.required && !targetOf(db, s.ref));
    if (missing.length)
      items.push({
        kind: "expired_content",
        title: "A required step’s content has gone",
        detail: `${courseOf(c).learnerTitle}: ${missing.map((s) => `“${s.title}”`).join(", ")}. It no longer counts towards completion.`,
      });
  }
  return { items };
}

// ---------------------------------------------------------------------------------------------
// Reporting: separate denominators, never anyone's language or reading preferences
// ---------------------------------------------------------------------------------------------

export function courseReport(db: Db, actor: User, input: { orgId?: unknown }, now: Date) {
  ensureCourses(db, now);
  const a = capAccess(db, actor);
  need(ownsAny(a), OWNERS_ONLY);
  const org = typeof input.orgId === "string" && input.orgId ? input.orgId : null;
  const users = (db.prepare("SELECT * FROM users").all() as User[]).filter((u) => owns(a, domainOf(u.audience)) && (!org || u.org_id === org));
  type Row = {
    course: string;
    title: string;
    version: number;
    segment: string;
    serviceType: string;
    eligible: number;
    invited: number;
    enrolled: number;
    started: number;
    completed: number;
    overdue: number;
    exempted: number;
    ended: number;
  };
  const rows = new Map<string, Row>();
  const row = (courseId: string, version: number, segment: Segment, st: ServiceType | null) => {
    const key = `${courseId}|${version}|${segment}|${st ?? ""}`;
    if (!rows.has(key)) {
      const c = courseVersion(db, courseId, version);
      rows.set(key, {
        course: courseId,
        title: c ? courseOf(c).learnerTitle : courseId,
        version,
        segment: SEGMENTS[segment],
        serviceType: st ? SERVICE_TYPES[st] : "",
        eligible: 0,
        invited: 0,
        enrolled: 0,
        started: 0,
        completed: 0,
        overdue: 0,
        exempted: 0,
        ended: 0,
      });
    }
    return rows.get(key)!;
  };
  const d = today(now);
  const stepRows = new Map<string, { title: string; step: string; enrolled: number; started: number; done: number }>();
  for (const u of users) {
    refreshProgress(db, u, now);
    const ms = membershipsOf(db, u, now);
    // Eligible: who the rules in force reach today, against the version they'd be given.
    for (const p of planFor(db, u, now)) {
      const c = assignable(db, p.courseId);
      if (c) row(p.courseId, c.version, p.membership.segment, p.membership.serviceType).eligible += 1;
    }
    for (const e of db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ?").all(u.id) as EnrolmentRow[]) {
      const m = ms.find((x) => membershipKey(x) === e.membership) ?? ms[0];
      const r = row(e.course_id, e.course_version, m.segment, m.serviceType);
      r.enrolled += 1;
      if (e.invited_at) r.invited += 1;
      if (e.started_at || e.status === "completed") r.started += 1;
      if (e.status === "completed") r.completed += 1;
      if (e.status === "exempted") r.exempted += 1;
      if (e.status === "ended") r.ended += 1;
      if (e.status === "active" && e.due_on && e.due_on < d) r.overdue += 1;
      // Where people stop: each step's reach among those enrolled on this version.
      const c = courseVersion(db, e.course_id, e.course_version);
      if (!c) continue;
      for (const s of stepsFor(db, courseOf(c).steps, u.audience, canAuthor(u), u.id)) {
        const k = `${e.course_id}|${e.course_version}|${s.id}`;
        const sr = stepRows.get(k) ?? { title: `${courseOf(c).learnerTitle} v${e.course_version}`, step: s.title, enrolled: 0, started: 0, done: 0 };
        sr.enrolled += 1;
        if (s.state === "started" || s.state === "done") sr.started += 1;
        if (s.state === "done") sr.done += 1;
        stepRows.set(k, sr);
      }
    }
  }
  const ids = new Set(users.map((u) => u.id));
  const help = (db.prepare("SELECT user_id, kind FROM onbc_help").all() as { user_id: string; kind: HelpKind }[]).filter((h) => ids.has(h.user_id));
  return {
    note: "Each column is its own count: eligible (the rules in force reach them today), invited, enrolled, started, completed, overdue, exempted, and no longer assigned. Language and reading preferences are never reported.",
    rows: [...rows.values()].sort((x, y) => x.title.localeCompare(y.title) || x.version - y.version),
    steps: [...stepRows.values()],
    help: (Object.keys(HELP_KINDS) as HelpKind[]).map((k) => ({ kind: HELP_KINDS[k], count: help.filter((h) => h.kind === k).length })),
    organisations: (db.prepare("SELECT id, name FROM orgs ORDER BY name").all() as { id: string; name: string }[]).filter((o) =>
      (db.prepare("SELECT audience FROM users WHERE org_id = ?").all(o.id) as { audience: string }[]).some((x) => owns(a, domainOf(x.audience))),
    ),
  };
}

/** The report as CSV, logged as an export. Counts only. */
export function courseReportCsv(db: Db, actor: User, input: { orgId?: unknown }, now: Date) {
  const r = courseReport(db, actor, input, now);
  const cols = [
    "title",
    "version",
    "segment",
    "serviceType",
    "eligible",
    "invited",
    "enrolled",
    "started",
    "completed",
    "overdue",
    "exempted",
    "ended",
  ] as const;
  const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  audit(db, { actor: actor.id, event: "onboarding.report.exported", entity: "onbc_report", next: { org: input.orgId ?? null, rows: r.rows.length }, at: now });
  return [cols.join(","), ...r.rows.map((x) => cols.map((c) => cell(x[c])).join(","))].join("\n");
}

/** What happened, newest first: assignments, overrides, approvals and exports. */
export function courseAudit(db: Db, actor: User, now: Date) {
  ensureCourses(db, now);
  need(ownsAny(capAccess(db, actor)), OWNERS_ONLY);
  return (
    db
      .prepare(
        "SELECT actor, event, entity, reason, at FROM audit WHERE event LIKE 'onboarding.course.%' OR event LIKE 'onboarding.rule.%' OR event LIKE 'onboarding.enrolment.%' OR event LIKE 'onboarding.credit.%' OR event LIKE 'onboarding.membership.%' OR event LIKE 'onboarding.work_type.%' OR event LIKE 'onboarding.equivalence.%' OR event LIKE 'onboarding.report.%' OR event LIKE 'onboarding.help.%' ORDER BY id DESC LIMIT 150",
      )
      .all() as { actor: string; event: string; entity: string; reason: string | null; at: string }[]
  ).map((r) => ({ ...r, who: nameOf(db, r.actor) }));
}

// ---------------------------------------------------------------------------------------------
// Admin overview and the learner preview
// ---------------------------------------------------------------------------------------------

export function coursesAdmin(db: Db, actor: User, now: Date) {
  ensureCourses(db, now);
  const a = capAccess(db, actor);
  need(canEditCourses(a), "Starting courses are for learning authors and the people who run onboarding.");
  const courseIds = (db.prepare("SELECT DISTINCT id FROM onbc_courses ORDER BY id").all() as { id: string }[]).map((r) => r.id);
  const courses = courseIds.map((id) => {
    const versions = db.prepare("SELECT * FROM onbc_courses WHERE id = ? ORDER BY version DESC").all(id) as CourseRow[];
    const latest = versions[0];
    const live = versions.find((v) => v.status === "published");
    const data = courseOf(latest);
    return {
      id,
      data,
      latest: { version: latest.version, status: latest.status },
      published: live ? { version: live.version, at: live.published_at, by: nameOf(db, live.published_by) } : null,
      withdrawn: versions.some((v) => v.status === "withdrawn") && !live,
      problems: latest.status === "draft" ? coursePublishProblems(db, data) : [],
      steps: stepsFor(db, data.steps, SEGMENT_AUDIENCE[data.segment], false, null),
      enrolled: (db.prepare("SELECT COUNT(*) AS n FROM onbc_enrolments WHERE course_id = ?").get(id) as { n: number }).n,
    };
  });
  const ruleIds = (db.prepare("SELECT DISTINCT id FROM onbc_rules ORDER BY id").all() as { id: string }[]).map((r) => r.id);
  const rules = ruleIds.map((id) => {
    const latest = latestRule(db, id)!;
    const live = publishedRule(db, id);
    const data = ruleOf(latest);
    const c = latestCourse(db, data.courseId);
    return {
      id,
      data,
      latest: { version: latest.version, status: latest.status },
      published: live
        ? {
            version: live.version,
            mandatory: live.mandatory_state,
            at: live.published_at,
            by: nameOf(db, live.published_by),
            approvedBy: nameOf(db, live.approved_by),
          }
        : null,
      summary: ruleSummary(live ? ruleOf(live) : data, c ? courseOf(c).learnerTitle : data.courseId, live?.mandatory_state ?? "none"),
      owner: nameOf(db, data.ownerUserId),
      canApprove: Boolean(live && ruleOf(live).mandatory && live.mandatory_state === "pending" && ruleOf(live).ownerUserId === actor.id),
      canPublish: owns(a, segmentDomain(data.when.segment)),
    };
  });
  return {
    courses,
    rules,
    equivalences: (
      db.prepare("SELECT * FROM onbc_equivalences ORDER BY created_at DESC").all() as {
        id: string;
        a_ref: string;
        b_ref: string;
        note: string;
        status: string;
        approved_by: string | null;
      }[]
    ).map((e) => ({
      id: e.id,
      a: targetOf(db, e.a_ref)?.label ?? e.a_ref,
      b: targetOf(db, e.b_ref)?.label ?? e.b_ref,
      note: e.note,
      status: e.status,
      approvedBy: nameOf(db, e.approved_by),
    })),
    choices: stepChoices(db),
    owners: db.prepare("SELECT id, name FROM users WHERE audience = 'staff' ORDER BY name").all() as { id: string; name: string }[],
    orgs: db.prepare("SELECT id, name FROM orgs ORDER BY name").all() as { id: string; name: string }[],
    canRunOnboarding: ownsAny(a),
    me: actor.id,
  };
}

export const PERSONAS = {
  cleaner: { label: "Cleaner", name: "Amina (example)", segment: "supplier", serviceType: "cleaning", staffFunction: null },
  nurse: { label: "Nurse", name: "Priya (example)", segment: "supplier", serviceType: "nursing", staffFunction: null },
  unknown: { label: "Supplier with no service type", name: "Tom (example)", segment: "supplier", serviceType: null, staffFunction: null },
  coordinator: { label: "Care Coordinator", name: "Jess (example)", segment: "coordinator", serviceType: null, staffFunction: null },
  principal: { label: "Care Partner principal", name: "Maya (example)", segment: "principal", serviceType: null, staffFunction: null },
  staff: { label: "Trilogy staff member", name: "Sam (example)", segment: "staff", serviceType: null, staffFunction: "general" },
  author: { label: "Trilogy content author", name: "Lee (example)", segment: "staff", serviceType: null, staffFunction: "author" },
} as const satisfies Record<string, { label: string; name: string; segment: Segment; serviceType: ServiceType | null; staffFunction: StaffFunction | null }>;
export type Persona = keyof typeof PERSONAS;

/**
  The learner's view for a made-up person in a role, from the rules in force: what they'd be assigned and how it
  looks, with nothing done. Nothing is saved and nobody real is involved.
*/
export function previewLearner(db: Db, actor: User, persona: unknown, now: Date) {
  ensureCourses(db, now);
  need(canEditCourses(capAccess(db, actor)), "The learner preview is for learning authors and the people who run onboarding.");
  const key = (Object.keys(PERSONAS) as Persona[]).find((p) => p === persona) ?? "cleaner";
  const p = PERSONAS[key];
  const m: Membership = {
    id: "primary",
    segment: p.segment,
    orgId: "example",
    orgName: "Example business",
    serviceType: p.serviceType,
    staffFunction: p.staffFunction,
    source: "Example",
    verifiedBy: null,
    effectiveFrom: null,
    effectiveTo: null,
  };
  const audience = SEGMENT_AUDIENCE[p.segment];
  const seen = new Set<string>();
  const courses = rulesInForce(db, now).flatMap((r) => {
    const data = ruleOf(r);
    const c = assignable(db, data.courseId);
    if (data.trigger === "manual" || !matches(data.when, m) || !c || seen.has(c.id)) return [];
    seen.add(c.id);
    const cd = courseOf(c);
    const steps = stepsFor(db, cd.steps, audience, p.staffFunction === "author", null);
    return [
      {
        id: c.id,
        version: c.version,
        title: cd.learnerTitle,
        gains: cd.gains,
        stage: cd.stage,
        order: cd.order,
        steps,
        demo: cd.demo,
        why: ruleSummary(data, cd.learnerTitle, r.mandatory_state),
        mandatory: r.mandatory_state === "approved",
        dueDays: r.mandatory_state === "approved" ? data.dueDays : null,
      },
    ];
  });
  courses.sort((x, y) => x.stage - y.stage || x.order - y.order);
  return {
    persona: key,
    personas: (Object.keys(PERSONAS) as Persona[]).map((k) => ({ id: k, label: PERSONAS[k].label })),
    person: { name: p.name, label: membershipLabel(m) },
    confirm: p.segment === "supplier" && !p.serviceType,
    courses,
    demoNote: DEMO_NOTE,
  };
}

// ---------------------------------------------------------------------------------------------
// Demonstration pathways
// ---------------------------------------------------------------------------------------------

const DEMO_KEY = "onbc_demo_seeded";

type SeedCourse = { id: string; data: Omit<CourseData, "languages" | "reassign" | "changeNote" | "demo"> };
const step = (id: string, ref: string, title: string, required = true, minutes = 0): CourseStep => ({
  id,
  ref,
  title,
  required,
  minutes,
  kind: ref.startsWith("topic:") ? "topic" : ref.startsWith("course:") ? "course" : "job_aid",
});

/**
  Illustrative pathways for the four demo profiles, built from Topics, Magazine courses and Job Aids already on the
  Hub. Every one is marked as a demonstration, not Trilogy policy. Each rule asks to be mandatory but names a team,
  not a person, so none is mandatory until an owner is named and approves it: until then they're recommended.
*/
export const DEMO_COURSES: SeedCourse[] = [
  {
    id: "supplier-getting-ready",
    data: {
      name: "Supplier introduction (shared)",
      learnerTitle: "Getting ready to work with Trilogy Care",
      gains: ["Know who does what, and who to contact", "Know what work you’ve agreed to do", "Know where to find help at work"],
      segment: "supplier",
      serviceTypes: [],
      stage: 1,
      order: 1,
      steps: [
        step("who", "topic:who-does-what", "Who does what"),
        step("services", "topic:your-services-and-who-can-deliver-them", "Your agreed services, and who can deliver them"),
        step("concern", "topic:when-something-goes-wrong-report-it-up", "When something goes wrong: who to tell"),
        step("aid", "aid:sirs-first-steps", "Save the incident first steps Job Aid", false, 2),
      ],
      ownerTeam: "Partner Operations (supplier onboarding)",
      gaps: "No approved “Before I start” Job Aid exists yet. The incident Job Aid is still in review, so its step won’t open until it’s approved.",
    },
  },
  {
    id: "cleaner-first-visit",
    data: {
      name: "Cleaner branch: first visit",
      learnerTitle: "Getting ready for your first visit",
      gains: ["Stick to the work that was agreed", "Know what to say when you’re asked for something else", "Handle running late or a safety worry"],
      segment: "supplier",
      serviceTypes: ["cleaning"],
      stage: 1,
      order: 2,
      steps: [
        step("before", "topic:before-your-first-service", "Before your first visit"),
        step("agreed", "topic:stick-to-whats-agreed", "Stick to what’s agreed"),
        step("asked", "course:mag-0233544823a0", "Practise: “Could you just help me into the shower?”", true, 10),
        step("safe", "topic:keeping-people-safe-at-home", "Late, unwell or unsafe: what to do"),
        step("hazard", "course:mag-093fa4c76e49", "Optional practice: spot the hazard", false, 8),
      ],
      ownerTeam: "Partner Operations (supplier onboarding), with Quality for safety content",
      gaps: "Late-arrival guidance sits inside a broader safety Topic; a short cleaner-specific one would be better. Translations: none reviewed.",
    },
  },
  {
    id: "coordinator-first-client",
    data: {
      name: "Care Coordinator starting course",
      learnerTitle: "Your first client journey",
      gains: ["Prepare for a first conversation", "Know your responsibilities and boundaries", "Make an accurate handoff"],
      segment: "coordinator",
      serviceTypes: [],
      stage: 1,
      order: 1,
      steps: [
        step("who", "topic:who-does-what", "Who does what"),
        step("journey", "topic:your-onboarding-journey", "Your onboarding journey"),
        step("responsibilities", "topic:the-care-coordinators-responsibilities", "Your responsibilities and boundaries"),
        step("first", "topic:preparing-for-your-first-client", "Prepare for your first client"),
        step("client-journey", "course:mag-dbeebb529de6", "The client journey, from enquiry to exit", true, 15),
        step("handover", "aid:hospital-to-home-handover-check", "Save the hospital-to-home handover check", false, 2),
      ],
      ownerTeam: "Care Coordination lead",
      gaps: "Internal and external coordinators get the same course: a branch only where the arrangement differs is still to be designed.",
    },
  },
  {
    id: "principal-running-business",
    data: {
      name: "Care Partner principal starting course",
      learnerTitle: "Running your care coordination business with Trilogy Care",
      gains: ["Support your coordinator through a first client start", "Find the approved operating route", "Plan your capacity"],
      segment: "principal",
      serviceTypes: [],
      stage: 1,
      order: 1,
      steps: [
        step("first-steps", "course:mag-5de8043699a7", "Your first steps as a brokered partner", true, 12),
        step("day", "topic:a-day-in-the-life-of-a-service-partner", "A day in the life of a Care Partner"),
        step("paid", "topic:pricing-and-getting-paid", "Pricing and getting paid"),
        step("first-100", "course:mag-1d518385bcfc", "Your new coordinator’s first 100 days", false, 12),
        step("hiring", "course:mag-ae89f9f596b1", "Later practice: when to hire (Hiring Runway)", false, 10),
      ],
      ownerTeam: "Partnerships",
      gaps: "Shared coordinator essentials aren’t included: a principal reads the Hub as a Care Partner, so coordinator-only Topics wouldn’t open for them.",
    },
  },
  {
    id: "staff-using-the-hub",
    data: {
      name: "Trilogy staff starting course",
      learnerTitle: "Using the Hub at Trilogy Care",
      gains: ["Know where Trilogy Care fits", "Handle client information safely", "Know where to get support"],
      segment: "staff",
      serviceTypes: [],
      stage: 1,
      order: 1,
      steps: [
        step("fits", "topic:where-trilogy-care-fits", "Where Trilogy Care fits"),
        step("person", "topic:putting-the-person-first", "Putting the person first"),
        step("data", "topic:bruces-cyber-week-day-3-client-data-handle-with-care", "Client data: handle with care"),
        step("monday", "course:mag-873839760a45", "Optional: one day, five perspectives", false, 15),
      ],
      ownerTeam: "People & Culture",
      gaps: "No content yet on governing the Hub (content review, approval and reporting). Author, moderator, manager and technical administrator branches are still to be written.",
    },
  },
];

const DEMO_RULES: { id: string; course: string; name: string; when: RuleWhen; dueDays: number; ownerTeam: string }[] = [
  {
    id: "rule-supplier-intro",
    course: "supplier-getting-ready",
    name: "Every verified supplier: shared introduction",
    when: { segment: "supplier", serviceTypes: [], staffFunctions: [] },
    dueDays: 14,
    ownerTeam: "Partner Operations (supplier onboarding)",
  },
  {
    id: "rule-cleaner-branch",
    course: "cleaner-first-visit",
    name: "Cleaning suppliers: first-visit branch",
    when: { segment: "supplier", serviceTypes: ["cleaning"], staffFunctions: [] },
    dueDays: 14,
    ownerTeam: "Partner Operations (supplier onboarding)",
  },
  {
    id: "rule-coordinator",
    course: "coordinator-first-client",
    name: "Care Coordinators: first client journey",
    when: { segment: "coordinator", serviceTypes: [], staffFunctions: [] },
    dueDays: 21,
    ownerTeam: "Care Coordination lead",
  },
  {
    id: "rule-principal",
    course: "principal-running-business",
    name: "Care Partner principals: running your business",
    when: { segment: "principal", serviceTypes: [], staffFunctions: [] },
    dueDays: 30,
    ownerTeam: "Partnerships",
  },
  {
    id: "rule-staff",
    course: "staff-using-the-hub",
    name: "Trilogy staff: using the Hub",
    when: { segment: "staff", serviceTypes: [], staffFunctions: [] },
    dueDays: 30,
    ownerTeam: "People & Culture",
  },
];

/**
  Seeds the demonstration pathways once (a database that's had them removed isn't re-seeded). A course whose
  required content isn't on this Hub is left as a draft with its problems listed, rather than published broken.
*/
export function seedDemoCourses(db: Db, now: Date) {
  ensureCourses(db, now);
  if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(DEMO_KEY)) return { seeded: false };
  const at = now.toISOString();
  const published = new Set<string>();
  tx(db, () => {
    for (const c of DEMO_COURSES) {
      if (latestCourse(db, c.id)) continue;
      const data: CourseData = { ...c.data, languages: ["en"], reassign: "continue", changeNote: "", demo: true };
      const ok = coursePublishProblems(db, data).length === 0;
      db.prepare(
        "INSERT INTO onbc_courses (id, version, status, data, created_by, created_at, published_by, published_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?)",
      ).run(c.id, ok ? "published" : "draft", JSON.stringify(data), SYSTEM, at, ok ? SYSTEM : null, ok ? at : null);
      if (ok) published.add(c.id);
    }
    for (const r of DEMO_RULES) {
      if (latestRule(db, r.id)) continue;
      const data: RuleData = {
        name: r.name,
        when: r.when,
        courseId: r.course,
        mandatory: true,
        trigger: "joined",
        dueDays: r.dueDays,
        effectiveFrom: today(now),
        effectiveTo: null,
        ownerTeam: r.ownerTeam,
        ownerUserId: null,
        demo: true,
        note: "Demonstration rule. Asked to be mandatory, but no named owner has approved it, so it’s recommended with no due date.",
      };
      const live = published.has(r.course);
      db.prepare(
        "INSERT INTO onbc_rules (id, version, status, data, mandatory_state, created_by, created_at, published_by, published_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
      ).run(r.id, live ? "published" : "draft", JSON.stringify(data), live ? "pending" : "none", SYSTEM, at, live ? SYSTEM : null, live ? at : null);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(DEMO_KEY, at);
    audit(db, { actor: SYSTEM, event: "onboarding.course.demo_seeded", entity: "onbc_course:demo", next: { published: [...published] }, at: now });
  });
  return { seeded: true, published: [...published] };
}
