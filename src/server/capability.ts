import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { lessons } from "@/content/lessons";
import {
  ACCESS_ROLES,
  addToCell,
  ASSET_RELATIONS,
  CRITICALITY,
  DEFAULT_MIN_COHORT,
  domainOf,
  emptyCell,
  highestStage,
  isStale,
  RELATION_STAGE,
  RELATIONS,
  STAGE_LABELS,
  STAGES,
  summarise,
  targetState,
  type AccessRole,
  type AssetKind,
  type Cell,
  type CompetencyProfile,
  type Criticality,
  type Domain,
  type Evidence,
  type NextStep,
  type ObservationDecision,
  type Relation,
  type Requirement,
  type Stage,
} from "@/lib/capability";
import { audit, ensureCapability, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, userById, type User } from "./auth";
import { capabilityCourses } from "./magazine";
import { missionSlugs } from "./challenges";
import { parseQuizSettings } from "@/lib/pathQuizSettings";

/*
  Capability Intelligence (docs/capability-intelligence.md).

  - A profile is read from the Hub's own records every time: Topic and Magazine completions, decisions
    answered, assessment passes. Only observations, corrections and hand-recorded items are stored here.
  - Each kind of learning can only support its own stage. Nothing but a named person's observation ever
    shows "Verified at work", and nothing but an approved assessing asset shows "Demonstrated".
  - A mapping counts only once a named person with the right to has approved it.
  - Employees and external partners are separate populations with separate owners. A person's record is
    readable by them, their manager, and the owner of their population. Everyone else gets aggregates,
    with small groups hidden.
  - Private notes, journals, Discovery Paths, Quick review answers and time on a page are never read.
*/

// ---------------------------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------------------------

export type Access = {
  superadmin: boolean;
  pc: boolean;
  partnerOps: boolean;
  quality: boolean;
  insights: boolean;
  author: boolean;
  /** Has people reporting to them. */
  manager: boolean;
};

export function capAccess(db: Db, user: User): Access {
  ensureCapability(db);
  const roles = new Set((db.prepare("SELECT role FROM cap_access WHERE user_id = ?").all(user.id) as { role: AccessRole }[]).map((r) => r.role));
  const reviewRole = (db.prepare("SELECT review_role FROM users WHERE id = ?").get(user.id) as { review_role: string | null } | undefined)?.review_role;
  return {
    superadmin: isSuperadmin(user),
    pc: roles.has("pc"),
    partnerOps: roles.has("partner_ops"),
    // The Hub's compliance reviewers are its Quality owners already.
    quality: roles.has("quality") || reviewRole === "compliance",
    insights: roles.has("insights"),
    author: canAuthor(user),
    manager: Boolean(db.prepare("SELECT 1 FROM users WHERE manager_id = ? LIMIT 1").get(user.id)),
  };
}

/** Owns the framework and may see individual records for this population. */
const manages = (a: Access, domain: Domain) => a.superadmin || (domain === "internal" ? a.pc : a.partnerOps);
const managesAny = (a: Access) => a.superadmin || a.pc || a.partnerOps;
const canQuality = (a: Access) => a.superadmin || a.quality;
/** May see aggregate coverage for this population. */
const seesAggregate = (a: Access, domain: Domain) => manages(a, domain) || a.quality || a.insights;
/** May read the framework itself (it isn't personal): its owners, Quality, insight viewers, and authors who map content to it. */
const readsFramework = (a: Access) => managesAny(a) || a.quality || a.insights || a.author;

function need(ok: boolean, message = "You don’t have access to that.") {
  if (!ok) throw new HttpError(403, message);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const nameOf = (db: Db, id: string | null) =>
  id ? ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id) : null;
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12)}`;

// ---------------------------------------------------------------------------------------------
// What can be mapped to a competency
// ---------------------------------------------------------------------------------------------

export type Asset = {
  key: string;
  kind: AssetKind;
  ref: string;
  label: string;
  /** For a Magazine page, its course. */
  parent: string | null;
  version: string;
  href: string;
  relations: Relation[];
  /** Audiences that can open it; empty means everyone. */
  audience: string[];
};
const assetKey = (kind: AssetKind, ref: string) => `${kind}:${ref}`;

/** Every published Topic, Magazine course and reading page, and every path quiz, with its current version. */
export function assets(db: Db): Map<string, Asset> {
  const out = new Map<string, Asset>();
  const missions = missionSlugs(db);
  for (const l of lessons) {
    if (l.track === "reinforcement" || missions.has(l.slug)) continue;
    const cards = Object.values(l.nodes) as { type: string; assessment?: unknown }[];
    const relations: Relation[] = ["introduces"];
    if (cards.some((c) => c.type === "decision" || c.type === "quiz")) relations.push("practises");
    // Only a quiz in assessment mode (a pass mark, recorded attempts) can assess.
    if (cards.some((c) => c.type === "quiz" && c.assessment)) relations.push("assesses");
    out.set(assetKey("topic", l.slug), {
      key: assetKey("topic", l.slug),
      kind: "topic",
      ref: l.slug,
      label: l.title,
      parent: null,
      version: l.version,
      href: `/topics/${l.slug}`,
      relations,
      audience: [],
    });
  }
  for (const c of capabilityCourses(db)) {
    const decisions = c.pages.some((p) => p.decisions);
    out.set(assetKey("course", c.id), {
      key: assetKey("course", c.id),
      kind: "course",
      ref: c.id,
      label: c.title,
      parent: null,
      version: String(c.edition),
      href: `/magazine/${c.slug}`,
      relations: decisions ? ["introduces", "practises"] : ["introduces"],
      audience: c.audience,
    });
    for (const p of c.pages)
      out.set(assetKey("page", `${c.id}:${p.id}`), {
        key: assetKey("page", `${c.id}:${p.id}`),
        kind: "page",
        ref: `${c.id}:${p.id}`,
        label: p.title,
        parent: c.title,
        version: p.version,
        href: `/magazine/${c.slug}/${p.id}`,
        relations: p.decisions ? ["introduces", "practises"] : ["introduces"],
        audience: c.audience,
      });
  }
  const paths = db.prepare("SELECT id, name, quiz FROM learning_paths WHERE archived = 0 AND quiz IS NOT NULL").all() as {
    id: string;
    name: string;
    quiz: string | null;
  }[];
  for (const p of paths) {
    if (!parseQuizSettings(p.quiz)) continue;
    const slugs = (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(p.id) as { lesson_slug: string }[]).map(
      (r) => r.lesson_slug,
    );
    out.set(assetKey("quiz", p.id), {
      key: assetKey("quiz", p.id),
      kind: "quiz",
      ref: p.id,
      label: `${p.name}: quiz`,
      parent: null,
      // The quiz changes when its settings or the Topics it draws from do.
      version: createHash("sha1")
        .update(`${p.quiz}|${slugs.join(",")}`)
        .digest("hex")
        .slice(0, 12),
      href: `/paths/${p.id}/quiz`,
      relations: ["assesses"],
      audience: [],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The framework: competencies, roles and their versions
// ---------------------------------------------------------------------------------------------

type CompetencyRow = { id: string; group_name: string; retired: number; created_by: string; created_at: string };
type CompetencyVersionRow = {
  competency_id: string;
  version: number;
  name: string;
  definition: string;
  behaviours: string;
  owner: string;
  source: string;
  review_date: string | null;
  high_risk: number;
  status: "draft" | "approved";
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};
type RoleRow = { id: string; name: string; job_family: string; domain: Domain; created_by: string; created_at: string };
type RoleVersionRow = {
  id: string;
  role_id: string;
  version: number;
  status: "draft" | "active" | "retired";
  requirements: string;
  note: string;
  created_by: string;
  created_at: string;
  quality_by: string | null;
  quality_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  retired_at: string | null;
};
type MappingRow = {
  id: string;
  competency_id: string;
  asset_kind: AssetKind;
  asset_ref: string;
  asset_label: string;
  relation: Relation;
  rationale: string;
  status: "suggested" | "approved" | "rejected";
  source: string;
  asset_version: string | null;
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
};

const versionView = (db: Db, v: CompetencyVersionRow) => ({
  version: v.version,
  name: v.name,
  definition: v.definition,
  behaviours: JSON.parse(v.behaviours) as string[],
  owner: v.owner,
  source: v.source,
  reviewDate: v.review_date,
  highRisk: v.high_risk === 1,
  status: v.status,
  approvedBy: nameOf(db, v.approved_by),
  approvedAt: v.approved_at,
});
export type CompetencyVersion = ReturnType<typeof versionView>;

const versionsOf = (db: Db, id: string) =>
  db.prepare("SELECT * FROM cap_competency_versions WHERE competency_id = ? ORDER BY version DESC").all(id) as CompetencyVersionRow[];
const approvedVersion = (db: Db, id: string, version?: number) =>
  (version
    ? db.prepare("SELECT * FROM cap_competency_versions WHERE competency_id = ? AND version = ? AND status = 'approved'").get(id, version)
    : db.prepare("SELECT * FROM cap_competency_versions WHERE competency_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1").get(id)) as
    CompetencyVersionRow | undefined;

function mappingView(db: Db, m: MappingRow, all: Map<string, Asset>) {
  const asset = all.get(assetKey(m.asset_kind, m.asset_ref));
  return {
    id: m.id,
    competencyId: m.competency_id,
    kind: m.asset_kind,
    ref: m.asset_ref,
    label: asset?.label ?? m.asset_label,
    parent: asset?.parent ?? null,
    href: asset?.href ?? null,
    relation: m.relation,
    rationale: m.rationale,
    status: m.status,
    source: m.source,
    proposedBy: nameOf(db, m.proposed_by),
    proposedAt: m.proposed_at,
    decidedBy: nameOf(db, m.decided_by),
    decidedAt: m.decided_at,
    note: m.decision_note,
    /** The content has been republished since this mapping was approved: it needs another look. */
    changed: m.status === "approved" && Boolean(asset) && m.asset_version !== asset!.version,
    /** The content isn't published any more. */
    missing: !asset,
  };
}
export type Mapping = ReturnType<typeof mappingView>;

const requirementsOf = (v: RoleVersionRow) => JSON.parse(v.requirements) as Requirement[];

function roleVersionView(db: Db, v: RoleVersionRow) {
  return {
    id: v.id,
    version: v.version,
    status: v.status,
    note: v.note,
    requirements: requirementsOf(v),
    createdAt: v.created_at,
    qualityBy: nameOf(db, v.quality_by),
    qualityAt: v.quality_at,
    approvedBy: nameOf(db, v.approved_by),
    approvedAt: v.approved_at,
  };
}

const roleVersions = (db: Db, roleId: string) =>
  db.prepare("SELECT * FROM cap_role_versions WHERE role_id = ? ORDER BY version DESC").all(roleId) as RoleVersionRow[];
const activeVersion = (db: Db, roleId: string) =>
  db.prepare("SELECT * FROM cap_role_versions WHERE role_id = ? AND status = 'active'").get(roleId) as RoleVersionRow | undefined;
const draftVersion = (db: Db, roleId: string) =>
  db.prepare("SELECT * FROM cap_role_versions WHERE role_id = ? AND status = 'draft'").get(roleId) as RoleVersionRow | undefined;

function roleOf(db: Db, id: unknown): RoleRow {
  const row = typeof id === "string" ? (db.prepare("SELECT * FROM cap_roles WHERE id = ?").get(id) as RoleRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That role isn’t in the framework.");
  return row;
}

/** The whole framework, for the people who own it, approve it, map content to it or read its aggregates. */
export function framework(db: Db, actor: User) {
  const a = capAccess(db, actor);
  need(readsFramework(a));
  const all = assets(db);
  const mappings = (db.prepare("SELECT * FROM cap_mappings ORDER BY proposed_at").all() as MappingRow[]).map((m) => mappingView(db, m, all));
  const competencies = (db.prepare("SELECT * FROM cap_competencies ORDER BY group_name, id").all() as CompetencyRow[]).map((c) => {
    const versions = versionsOf(db, c.id);
    const approved = versions.find((v) => v.status === "approved");
    const draft = versions[0]?.status === "draft" ? versions[0] : undefined;
    return {
      id: c.id,
      group: c.group_name,
      retired: c.retired === 1,
      current: approved ? versionView(db, approved) : null,
      draft: draft ? versionView(db, draft) : null,
      versions: versions.length,
      mappings: mappings.filter((m) => m.competencyId === c.id),
    };
  });
  const roles = (db.prepare("SELECT * FROM cap_roles ORDER BY name").all() as RoleRow[]).map((r) => {
    const active = activeVersion(db, r.id);
    const draft = draftVersion(db, r.id);
    return {
      id: r.id,
      name: r.name,
      jobFamily: r.job_family,
      domain: r.domain,
      active: active ? roleVersionView(db, active) : null,
      draft: draft ? roleVersionView(db, draft) : null,
      history: roleVersions(db, r.id)
        .filter((v) => v.status === "retired")
        .map((v) => ({ version: v.version, approvedBy: nameOf(db, v.approved_by), approvedAt: v.approved_at, retiredAt: v.retired_at })),
      people: (db.prepare("SELECT COUNT(*) AS n FROM cap_people WHERE role_id = ?").get(r.id) as { n: number }).n,
      canManage: manages(a, r.domain),
      canSeeAggregate: seesAggregate(a, r.domain),
    };
  });
  return {
    competencies,
    roles,
    waiting: mappings.filter((m) => m.status === "suggested").length,
    changed: mappings.filter((m) => m.changed || (m.missing && m.status === "approved")).length,
    access: { ...a, manage: managesAny(a), quality: canQuality(a), domains: (["internal", "partner"] as Domain[]).filter((d) => manages(a, d)) },
  };
}

const idFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "competency";

/**
  Adds a competency or rewords one. A change to an approved competency starts a new draft version: the
  approved wording stays in use until the draft is approved.
*/
export function saveCompetency(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  need(managesAny(a), "Only the framework’s owners can change competencies.");
  const name = text(input.name, 80);
  if (!name) throw new HttpError(400, "Give the competency a name.");
  const behaviours = (Array.isArray(input.behaviours) ? input.behaviours : String(input.behaviours ?? "").split("\n"))
    .map((b) => text(b, 300))
    .filter(Boolean)
    .slice(0, 8);
  const fields = [
    name,
    text(input.definition, 600),
    JSON.stringify(behaviours),
    text(input.owner, 120),
    text(input.source, 300),
    day(input.reviewDate),
    input.highRisk === true || input.highRisk === "on" ? 1 : 0,
  ] as const;
  const at = now.toISOString();
  return tx(db, () => {
    let id = typeof input.id === "string" && input.id ? input.id : "";
    if (id) {
      if (!db.prepare("SELECT 1 FROM cap_competencies WHERE id = ?").get(id)) throw new HttpError(404, "That competency isn’t in the framework.");
      db.prepare("UPDATE cap_competencies SET group_name = ? WHERE id = ?").run(text(input.group, 60), id);
    } else {
      id = idFrom(name);
      while (db.prepare("SELECT 1 FROM cap_competencies WHERE id = ?").get(id)) id = `${idFrom(name)}-${randomUUID().slice(0, 4)}`;
      db.prepare("INSERT INTO cap_competencies (id, group_name, created_by, created_at) VALUES (?, ?, ?, ?)").run(id, text(input.group, 60), actor.id, at);
    }
    const latest = versionsOf(db, id)[0];
    if (latest?.status === "draft")
      db.prepare(
        "UPDATE cap_competency_versions SET name = ?, definition = ?, behaviours = ?, owner = ?, source = ?, review_date = ?, high_risk = ? WHERE competency_id = ? AND version = ?",
      ).run(...fields, id, latest.version);
    else
      db.prepare(
        `INSERT INTO cap_competency_versions (competency_id, version, name, definition, behaviours, owner, source, review_date, high_risk, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, (latest?.version ?? 0) + 1, ...fields, actor.id, at);
    audit(db, {
      actor: actor.id,
      event: "capability.competency_saved",
      entity: `competency:${id}`,
      next: { name, version: latest?.status === "draft" ? latest.version : (latest?.version ?? 0) + 1 },
      at: now,
    });
    return { id };
  });
}

/** Approves the draft wording, by name. A high-risk competency needs someone from Quality to approve it. */
export function approveCompetency(db: Db, actor: User, id: unknown, now: Date) {
  const a = capAccess(db, actor);
  const draft = typeof id === "string" ? versionsOf(db, id)[0] : undefined;
  if (!draft || draft.status !== "draft") throw new HttpError(400, "There’s no draft of that competency to approve.");
  if (draft.high_risk) need(canQuality(a), "A high-risk competency is approved by Quality.");
  else need(managesAny(a) || canQuality(a), "Only the framework’s owners or Quality can approve a competency.");
  if (!draft.definition || (JSON.parse(draft.behaviours) as string[]).length === 0)
    throw new HttpError(400, "Add a definition and at least one observable behaviour first: they’re what an assessor signs off against.");
  db.prepare("UPDATE cap_competency_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE competency_id = ? AND version = ?").run(
    actor.id,
    now.toISOString(),
    draft.competency_id,
    draft.version,
  );
  audit(db, {
    actor: actor.id,
    event: "capability.competency_approved",
    entity: `competency:${draft.competency_id}`,
    next: { version: draft.version, highRisk: draft.high_risk === 1 },
    at: now,
  });
  return { id: draft.competency_id, version: draft.version };
}

export function saveRole(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const name = text(input.name, 80);
  if (!name) throw new HttpError(400, "Give the role a name.");
  if (typeof input.id === "string" && input.id) {
    const role = roleOf(db, input.id);
    need(manages(a, role.domain));
    db.prepare("UPDATE cap_roles SET name = ?, job_family = ? WHERE id = ?").run(name, text(input.jobFamily, 80), role.id);
    return { id: role.id };
  }
  const domain = input.domain === "internal" || input.domain === "partner" ? input.domain : null;
  if (!domain) throw new HttpError(400, "Say whether this role is for employees or for external partners.");
  need(manages(a, domain), `Only the owner of the ${domain === "internal" ? "employee" : "partner"} framework can add a role there.`);
  const id = newId("role");
  db.prepare("INSERT INTO cap_roles (id, name, job_family, domain, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    name,
    text(input.jobFamily, 80),
    domain,
    actor.id,
    now.toISOString(),
  );
  audit(db, { actor: actor.id, event: "capability.role_created", entity: `role:${id}`, next: { name, domain }, at: now });
  return { id };
}

function cleanRequirements(db: Db, raw: unknown): Requirement[] {
  const seen = new Set<string>();
  const out: Requirement[] = [];
  for (const r of Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []) {
    const id = typeof r?.competencyId === "string" ? r.competencyId : "";
    if (!id || seen.has(id) || !db.prepare("SELECT 1 FROM cap_competencies WHERE id = ? AND retired = 0").get(id)) continue;
    seen.add(id);
    const months = Math.round(Number(r.refreshMonths));
    out.push({
      competencyId: id,
      version: 0,
      target: STAGES.find((s) => s === r.target) ?? "demonstrated",
      criticality: (Object.keys(CRITICALITY) as Criticality[]).find((c) => c === r.criticality) ?? "core",
      refreshMonths: months >= 1 && months <= 120 ? months : null,
    });
  }
  return out.slice(0, 40);
}

/** Saves what the next version of a role will ask for. Nobody's profile changes until it's made active. */
export function saveRoleDraft(db: Db, actor: User, roleId: unknown, input: Record<string, unknown>, now: Date) {
  const role = roleOf(db, roleId);
  need(manages(capAccess(db, actor), role.domain), "Only this framework’s owner can change what a role asks for.");
  const requirements = cleanRequirements(db, input.requirements);
  const draft = draftVersion(db, role.id);
  // A change to what's asked for needs Quality to look again.
  if (draft)
    db.prepare("UPDATE cap_role_versions SET requirements = ?, note = ?, quality_by = NULL, quality_at = NULL WHERE id = ?").run(
      JSON.stringify(requirements),
      text(input.note, 400),
      draft.id,
    );
  else
    db.prepare(
      "INSERT INTO cap_role_versions (id, role_id, version, status, requirements, note, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)",
    ).run(
      newId("rv"),
      role.id,
      (roleVersions(db, role.id)[0]?.version ?? 0) + 1,
      JSON.stringify(requirements),
      text(input.note, 400),
      actor.id,
      now.toISOString(),
    );
  return rolePreview(db, actor, role.id);
}

/**
  What making the draft active would change, before anyone does it: competencies added, removed and
  retargeted, the people it applies to, the learning mapped to each, and anything that blocks it.
*/
export function rolePreview(db: Db, actor: User, roleId: unknown) {
  const role = roleOf(db, roleId);
  const a = capAccess(db, actor);
  need(manages(a, role.domain) || canQuality(a));
  const draft = draftVersion(db, role.id);
  const active = activeVersion(db, role.id);
  if (!draft) return { roleId: role.id, draft: null };
  const before = new Map((active ? requirementsOf(active) : []).map((r) => [r.competencyId, r]));
  const after = requirementsOf(draft);
  const approvedMaps = db.prepare("SELECT competency_id, relation FROM cap_mappings WHERE status = 'approved'").all() as {
    competency_id: string;
    relation: Relation;
  }[];
  const rows = after.map((r) => {
    const v = approvedVersion(db, r.competencyId);
    const latest = versionsOf(db, r.competencyId)[0];
    const was = before.get(r.competencyId);
    const mapped = (stage: Stage) => approvedMaps.filter((m) => m.competency_id === r.competencyId && RELATION_STAGE[m.relation] === stage).length;
    const problems: string[] = [];
    if (!v) problems.push("This competency has no approved wording yet.");
    const warnings: string[] = [];
    if (v && latest?.status === "draft") warnings.push("A reworded draft is waiting for approval: the approved wording will be used.");
    // "Verified at work" is shown by an observation, so it needs no mapped learning.
    if (r.target !== "verified" && !mapped(r.target))
      warnings.push(`No approved learning shows “${STAGE_LABELS[r.target]}” for this yet, so everyone will read “No evidence yet”.`);
    return {
      competencyId: r.competencyId,
      name: v?.name ?? latest?.name ?? r.competencyId,
      highRisk: (v ?? latest)?.high_risk === 1,
      target: r.target,
      criticality: r.criticality,
      refreshMonths: r.refreshMonths,
      change: !was
        ? ("added" as const)
        : was.target !== r.target || was.criticality !== r.criticality || was.refreshMonths !== r.refreshMonths
          ? ("changed" as const)
          : ("same" as const),
      was: was ? { target: was.target, criticality: was.criticality, refreshMonths: was.refreshMonths } : null,
      mappings: { introduced: mapped("introduced"), practised: mapped("practised"), demonstrated: mapped("demonstrated") },
      problems,
      warnings,
    };
  });
  const removed = [...before.keys()]
    .filter((id) => !after.some((r) => r.competencyId === id))
    .map((id) => ({ competencyId: id, name: approvedVersion(db, id)?.name ?? id }));
  const needsQuality = rows.some((r) => r.highRisk);
  return {
    roleId: role.id,
    draft: {
      version: draft.version,
      note: draft.note,
      rows,
      removed,
      people: (db.prepare("SELECT COUNT(*) AS n FROM cap_people WHERE role_id = ?").get(role.id) as { n: number }).n,
      needsQuality,
      qualityBy: nameOf(db, draft.quality_by),
      qualityAt: draft.quality_at,
      blocked: [
        ...(rows.length ? [] : ["Add at least one competency."]),
        ...rows.flatMap((r) => r.problems.map((p) => `${r.name}: ${p}`)),
        ...(needsQuality && !draft.quality_by ? ["It includes a high-risk competency, so Quality reviews it first."] : []),
      ],
    },
  };
}

/** Quality's review of a draft role that includes a high-risk competency. */
export function qualityApproveRole(db: Db, actor: User, roleId: unknown, now: Date) {
  const role = roleOf(db, roleId);
  need(canQuality(capAccess(db, actor)), "Only Quality can do this review.");
  const draft = draftVersion(db, role.id);
  if (!draft) throw new HttpError(400, "There’s no draft to review.");
  db.prepare("UPDATE cap_role_versions SET quality_by = ?, quality_at = ? WHERE id = ?").run(actor.id, now.toISOString(), draft.id);
  audit(db, { actor: actor.id, event: "capability.role_quality_reviewed", entity: `role:${role.id}`, next: { version: draft.version }, at: now });
  return rolePreview(db, actor, role.id);
}

/**
  Makes the draft the role's active version, by name. Each competency is pinned at the wording approved
  today, so a profile can always say which version it was judged against. The version before is kept.
*/
export function activateRole(db: Db, actor: User, roleId: unknown, now: Date) {
  const role = roleOf(db, roleId);
  need(manages(capAccess(db, actor), role.domain), "Only this framework’s owner can make a role version active.");
  const preview = rolePreview(db, actor, role.id);
  if (!preview.draft) throw new HttpError(400, "There’s no draft to make active.");
  if (preview.draft.blocked.length) throw new HttpError(400, `This can’t be made active yet. ${preview.draft.blocked[0]}`);
  const draft = draftVersion(db, role.id)!;
  const pinned = requirementsOf(draft).map((r) => ({ ...r, version: approvedVersion(db, r.competencyId)!.version }));
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE cap_role_versions SET status = 'retired', retired_at = ? WHERE role_id = ? AND status = 'active'").run(at, role.id);
    db.prepare("UPDATE cap_role_versions SET status = 'active', requirements = ?, approved_by = ?, approved_at = ? WHERE id = ?").run(
      JSON.stringify(pinned),
      actor.id,
      at,
      draft.id,
    );
    audit(db, {
      actor: actor.id,
      event: "capability.role_activated",
      entity: `role:${role.id}`,
      next: {
        version: draft.version,
        competencies: pinned.length,
        people: preview.draft!.people,
        added: preview.draft!.rows.filter((r) => r.change === "added").length,
        removed: preview.draft!.removed.length,
      },
      at: now,
    });
  });
  return { roleId: role.id, version: draft.version };
}

// ---------------------------------------------------------------------------------------------
// Mapping learning to competencies
// ---------------------------------------------------------------------------------------------

/** What can be mapped, for the picker: a search over published Topics, Magazine courses and pages, and path quizzes. */
export function searchAssets(db: Db, actor: User, q: unknown) {
  const a = capAccess(db, actor);
  need(a.author || managesAny(a) || canQuality(a));
  const words = text(q, 80).toLowerCase().split(/\s+/).filter(Boolean);
  return {
    assets: [...assets(db).values()]
      .filter((x) => words.every((w) => `${x.label} ${x.parent ?? ""}`.toLowerCase().includes(w)))
      .slice(0, 40)
      .map(({ key, kind, ref, label, parent, relations }) => ({ key, kind, ref, label, parent, relations })),
  };
}

/** Proposes that a piece of learning introduces, practises or assesses a competency. It counts for nothing until approved. */
export function proposeMapping(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  need(a.author || managesAny(a), "Authors and the framework’s owners can propose a mapping.");
  const competencyId = typeof input.competencyId === "string" ? input.competencyId : "";
  if (!db.prepare("SELECT 1 FROM cap_competencies WHERE id = ?").get(competencyId)) throw new HttpError(404, "That competency isn’t in the framework.");
  const asset = assets(db).get(String(input.assetKey ?? ""));
  if (!asset) throw new HttpError(400, "Choose a published Topic, Magazine course or page, or a path quiz.");
  const relation = RELATIONS.find((r) => r === input.relation);
  if (!relation) throw new HttpError(400, "Say whether it introduces, practises or assesses the competency.");
  if (!ASSET_RELATIONS[asset.kind].includes(relation) || !asset.relations.includes(relation))
    throw new HttpError(
      400,
      relation === "assesses"
        ? "Only a path quiz, or a Topic with a quiz in assessment mode, can assess a competency."
        : "That has no decisions to answer, so it can introduce a competency but not practise it.",
    );
  const existing = db
    .prepare("SELECT * FROM cap_mappings WHERE competency_id = ? AND asset_kind = ? AND asset_ref = ? AND relation = ?")
    .get(competencyId, asset.kind, asset.ref, relation) as MappingRow | undefined;
  if (existing && existing.status !== "rejected") return { id: existing.id };
  const id = existing?.id ?? newId("map");
  const source = input.source === "ai" ? "ai" : "author";
  if (existing)
    db.prepare(
      "UPDATE cap_mappings SET status = 'suggested', rationale = ?, source = ?, proposed_by = ?, proposed_at = ?, decided_by = NULL, decided_at = NULL, decision_note = '' WHERE id = ?",
    ).run(text(input.rationale, 400), source, actor.id, now.toISOString(), id);
  else
    db.prepare(
      "INSERT INTO cap_mappings (id, competency_id, asset_kind, asset_ref, asset_label, relation, rationale, source, proposed_by, proposed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, competencyId, asset.kind, asset.ref, asset.label, relation, text(input.rationale, 400), source, actor.id, now.toISOString());
  return { id };
}

/**
  Approves or rejects a mapping, by name. Approving records the version of the content looked at, so a
  later republish shows up as "changed since approved". An assessing mapping for a high-risk competency
  is Quality's to approve.
*/
export function decideMapping(db: Db, actor: User, id: unknown, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const m = typeof id === "string" ? (db.prepare("SELECT * FROM cap_mappings WHERE id = ?").get(id) as MappingRow | undefined) : undefined;
  if (!m) throw new HttpError(404, "That mapping isn’t here.");
  const approve = input.approve === true;
  const highRisk = (approvedVersion(db, m.competency_id) ?? versionsOf(db, m.competency_id)[0])?.high_risk === 1;
  if (approve && m.relation === "assesses" && highRisk) need(canQuality(a), "An assessment for a high-risk competency is approved by Quality.");
  else need(managesAny(a) || canQuality(a), "Only the framework’s owners or Quality can decide a mapping.");
  const asset = assets(db).get(assetKey(m.asset_kind, m.asset_ref));
  if (approve && !asset) throw new HttpError(400, "That content isn’t published any more, so it can’t be approved as evidence.");
  db.prepare("UPDATE cap_mappings SET status = ?, asset_version = ?, asset_label = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?").run(
    approve ? "approved" : "rejected",
    approve ? asset!.version : m.asset_version,
    asset?.label ?? m.asset_label,
    actor.id,
    now.toISOString(),
    text(input.note, 300),
    m.id,
  );
  audit(db, {
    actor: actor.id,
    event: approve ? "capability.mapping_approved" : "capability.mapping_rejected",
    entity: `mapping:${m.id}`,
    previous: { status: m.status, version: m.asset_version },
    next: {
      competency: m.competency_id,
      asset: assetKey(m.asset_kind, m.asset_ref),
      relation: m.relation,
      version: approve ? asset!.version : null,
      source: m.source,
    },
    at: now,
  });
  return { id: m.id };
}

// ---------------------------------------------------------------------------------------------
// People: role, team and manager
// ---------------------------------------------------------------------------------------------

type PersonRow = { user_id: string; role_id: string | null; team: string; start_date: string | null };
const personRow = (db: Db, userId: string) => db.prepare("SELECT * FROM cap_people WHERE user_id = ?").get(userId) as PersonRow | undefined;
type UserRow = User & { manager_id: string | null };

/** The people whose role, team and manager this person may set: those in the populations they own. */
export function people(db: Db, actor: User) {
  const a = capAccess(db, actor);
  need(managesAny(a), "Only the framework’s owners can see and set people’s roles.");
  const users = (db.prepare("SELECT * FROM users ORDER BY name").all() as UserRow[]).filter((u) => manages(a, domainOf(u.audience)));
  const orgs = new Map((db.prepare("SELECT id, name FROM orgs").all() as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  return {
    people: users.map((u) => {
      const p = personRow(db, u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        org: orgs.get(u.org_id) ?? u.org_id,
        domain: domainOf(u.audience),
        audience: u.audience,
        roleId: p?.role_id ?? null,
        team: p?.team ?? "",
        startDate: p?.start_date ?? null,
        managerId: u.manager_id ?? null,
      };
    }),
    roles: (db.prepare("SELECT * FROM cap_roles ORDER BY name").all() as RoleRow[])
      .filter((r) => manages(a, r.domain))
      .map((r) => ({ id: r.id, name: r.name, domain: r.domain })),
    // Anyone can be a manager; the list isn't limited to the same population.
    managers: db.prepare("SELECT id, name FROM users ORDER BY name").all() as { id: string; name: string }[],
  };
}

function applyPerson(
  db: Db,
  actor: User,
  a: Access,
  target: UserRow,
  input: { roleId?: unknown; team?: unknown; startDate?: unknown; managerId?: unknown },
  now: Date,
) {
  const domain = domainOf(target.audience);
  need(manages(a, domain), "You can only set roles for the population you own.");
  const before = personRow(db, target.id);
  let roleId = before?.role_id ?? null;
  if (input.roleId !== undefined) {
    if (!input.roleId) roleId = null;
    else {
      const role = roleOf(db, input.roleId);
      // An employee role's totals must never include a partner, or the other way round.
      if (role.domain !== domain)
        throw new HttpError(
          400,
          `${target.name} is ${domain === "internal" ? "an employee" : "an external partner"}, and “${role.name}” is a role for ${role.domain === "internal" ? "employees" : "external partners"}.`,
        );
      roleId = role.id;
    }
  }
  const team = input.team === undefined ? (before?.team ?? "") : text(input.team, 60);
  const startDate = input.startDate === undefined ? (before?.start_date ?? null) : day(input.startDate);
  db.prepare(
    `INSERT INTO cap_people (user_id, role_id, team, start_date, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET role_id = excluded.role_id, team = excluded.team, start_date = excluded.start_date, set_by = excluded.set_by, set_at = excluded.set_at`,
  ).run(target.id, roleId, team, startDate, actor.id, now.toISOString());
  let managerId = target.manager_id ?? null;
  if (input.managerId !== undefined) {
    managerId = typeof input.managerId === "string" && input.managerId ? input.managerId : null;
    if (managerId === target.id) throw new HttpError(400, "Someone can’t be their own manager.");
    if (managerId && !userById(db, managerId)) throw new HttpError(400, "That manager isn’t a Hub user.");
    db.prepare("UPDATE users SET manager_id = ? WHERE id = ?").run(managerId, target.id);
  }
  audit(db, {
    actor: actor.id,
    event: "capability.person_set",
    entity: `user:${target.id}`,
    previous: { role: before?.role_id ?? null, team: before?.team ?? "", manager: target.manager_id ?? null },
    next: { role: roleId, team, startDate, manager: managerId },
    at: now,
  });
}

export function setPerson(db: Db, actor: User, userId: unknown, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const target = typeof userId === "string" ? (userById(db, userId) as UserRow | undefined) : undefined;
  if (!target) throw new HttpError(404, "That person isn’t a Hub user.");
  applyPerson(db, actor, a, target, input, now);
  return people(db, actor);
}

/**
  The handoff from onboarding or an HR system: rows of person, role, team, manager and start date. Each
  row is matched to a Hub user by id or email. Nothing is guessed: a row that doesn't match one person,
  or names a role or manager the Hub doesn't know, is reported back and left alone.
*/
export function importPeople(db: Db, actor: User, rows: unknown, now: Date) {
  const a = capAccess(db, actor);
  need(managesAny(a), "Only the framework’s owners can import roles.");
  const list = (Array.isArray(rows) ? rows : []).slice(0, 2000) as Record<string, unknown>[];
  const roles = db.prepare("SELECT * FROM cap_roles").all() as RoleRow[];
  const find = (v: unknown) => {
    const s = text(v, 200).toLowerCase();
    if (!s) return [];
    return db.prepare("SELECT * FROM users WHERE lower(id) = ? OR lower(email) = ?").all(s, s) as UserRow[];
  };
  const seen = new Set<string>();
  const unmatched: { row: number; person: string; why: string }[] = [];
  let applied = 0;
  list.forEach((r, i) => {
    const who = text(r.person, 200);
    const fail = (why: string) => void unmatched.push({ row: i + 1, person: who || "(blank)", why });
    const matches = find(who);
    if (matches.length !== 1) return fail(matches.length ? "More than one Hub user matches." : "No Hub user has that id or email.");
    const target = matches[0];
    if (seen.has(target.id)) return fail("This person is in the list twice: the first row was used.");
    const roleText = text(r.role, 80).toLowerCase();
    const role = roleText ? roles.filter((x) => x.id.toLowerCase() === roleText || x.name.toLowerCase() === roleText) : [];
    if (roleText && role.length !== 1) return fail(role.length ? "More than one role has that name." : "No role has that name.");
    const managerText = text(r.manager, 200);
    const manager = managerText ? find(managerText) : [];
    if (managerText && manager.length !== 1) return fail("The manager doesn’t match one Hub user.");
    try {
      applyPerson(
        db,
        actor,
        a,
        target,
        { roleId: role[0]?.id, team: r.team === undefined ? undefined : r.team, startDate: r.startDate, managerId: managerText ? manager[0].id : undefined },
        now,
      );
      seen.add(target.id);
      applied += 1;
    } catch (e) {
      fail(e instanceof HttpError ? e.message : "That row couldn’t be applied.");
    }
  });
  return { applied, unmatched, rows: list.length };
}

// ---------------------------------------------------------------------------------------------
// Evidence: what the Hub's own records say about a person
// ---------------------------------------------------------------------------------------------

type Ctx = {
  all: Map<string, Asset>;
  /** Approved mappings by competency. */
  mappings: Map<string, MappingRow[]>;
  competencyGroup: Map<string, string>;
  now: Date;
};

function context(db: Db, now: Date): Ctx {
  ensureCapability(db);
  const mappings = new Map<string, MappingRow[]>();
  for (const m of db.prepare("SELECT * FROM cap_mappings WHERE status = 'approved'").all() as MappingRow[])
    mappings.set(m.competency_id, [...(mappings.get(m.competency_id) ?? []), m]);
  return {
    all: assets(db),
    mappings,
    competencyGroup: new Map(
      (db.prepare("SELECT id, group_name FROM cap_competencies").all() as { id: string; group_name: string }[]).map((c) => [c.id, c.group_name]),
    ),
    now,
  };
}

type ObservationRow = {
  id: string;
  user_id: string;
  competency_id: string;
  competency_version: number;
  role_version_id: string | null;
  behaviours: string;
  decision: ObservationDecision;
  rationale: string;
  assessor_id: string;
  observed_on: string;
  at: string;
  superseded_by: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
};

/** Everything the Hub has recorded about one person that can count as evidence, read once. */
function recordsOf(db: Db, userId: string) {
  const answered = (json: string | null) => {
    try {
      return Object.keys(JSON.parse(json ?? "{}") as object);
    } catch {
      return [];
    }
  };
  const completions = (
    db
      .prepare("SELECT lesson_slug, lesson_version, completed_at, via, evidence FROM lesson_completions WHERE user_id = ? ORDER BY completed_at")
      .all(userId) as {
      lesson_slug: string;
      lesson_version: string;
      completed_at: string;
      via: string | null;
      evidence: string | null;
    }[]
  ).map((c) => ({
    ...c,
    keys: answered(c.evidence),
    evidence: (c.evidence ? (JSON.parse(c.evidence) as Record<string, unknown>) : {}) as Record<string, unknown>,
  }));
  const progress = (
    db.prepare("SELECT slug, attempt, saved_at FROM lesson_progress WHERE user_id = ?").all(userId) as { slug: string; attempt: string; saved_at: string }[]
  ).map((p) => {
    let attempt: { version?: string; answers?: Record<string, unknown> } = {};
    try {
      attempt = JSON.parse(p.attempt) as typeof attempt;
    } catch {
      // An unreadable save is no evidence.
    }
    return { slug: p.slug, at: p.saved_at, version: attempt.version ?? null, keys: Object.keys(attempt.answers ?? {}) };
  });
  return {
    completions,
    progress,
    courses: db
      .prepare(
        "SELECT c.guide_id, c.at, r.number FROM magazine_completions c JOIN magazine_revisions r ON r.id = c.revision_id WHERE c.user_id = ? AND c.kind = 'completed' ORDER BY c.at",
      )
      .all(userId) as { guide_id: string; at: string; number: number }[],
    pages: db
      .prepare(
        "SELECT f.guide_id, f.page_id, f.at, r.number FROM magazine_page_finishes f JOIN magazine_revisions r ON r.id = f.revision_id WHERE f.user_id = ? ORDER BY f.at",
      )
      .all(userId) as { guide_id: string; page_id: string; at: string; number: number }[],
    decisions: db
      .prepare(
        "SELECT e.guide_id, e.page_id, e.at, r.number FROM magazine_events e LEFT JOIN magazine_revisions r ON r.id = e.revision_id WHERE e.user_id = ? AND e.event = 'decision.answered' ORDER BY e.at",
      )
      .all(userId) as { guide_id: string; page_id: string | null; at: string; number: number | null }[],
    quizzes: db
      .prepare(
        "SELECT id, path_id, score, total, submitted_at FROM path_quiz_attempts WHERE user_id = ? AND passed = 1 AND cleared_at IS NULL ORDER BY submitted_at",
      )
      .all(userId) as {
      id: number;
      path_id: string;
      score: number;
      total: number;
      submitted_at: string;
    }[],
    observations: db.prepare("SELECT * FROM cap_observations WHERE user_id = ? ORDER BY at").all(userId) as ObservationRow[],
    manual: db.prepare("SELECT * FROM cap_records WHERE user_id = ? AND voided_at IS NULL ORDER BY evidence_on").all(userId) as {
      competency_id: string;
      stage: Stage;
      description: string;
      evidence_on: string;
      added_by: string;
    }[],
    asks: new Map(
      (db.prepare("SELECT competency_id, asked_at FROM cap_asks WHERE user_id = ?").all(userId) as { competency_id: string; asked_at: string }[]).map((r) => [
        r.competency_id,
        r.asked_at,
      ]),
    ),
  };
}
type Records = ReturnType<typeof recordsOf>;

/** A Topic's decisions and quiz questions leave `first:<card>` keys; anything else in the answers is a setting or a score. */
const practisedKeys = (keys: string[]) => keys.some((k) => k.startsWith("first:") || k.startsWith("pick:"));

/** The evidence one approved mapping yields for this person. Each relation can only yield its own stage. */
function evidenceFrom(m: MappingRow, rec: Records, asset: Asset | undefined): Omit<Evidence, "stale">[] {
  const stage = RELATION_STAGE[m.relation];
  const label = asset?.label ?? m.asset_label;
  const out: Omit<Evidence, "stale">[] = [];
  const add = (kind: Evidence["kind"], text: string, at: string, version: string | null, detail: string | null = null) =>
    out.push({ stage, kind, label: text, at, version, detail, by: null });
  if (m.asset_kind === "topic") {
    const done = rec.completions.filter((c) => c.lesson_slug === m.asset_ref);
    if (m.relation === "introduces") {
      // Testing out of a Topic through a path quiz records a completion, but they didn't go through the Topic.
      for (const c of done)
        if (!c.via?.startsWith("path-quiz:") && !c.via?.startsWith("testout:")) add("topic", `Topic completed: ${label}`, c.completed_at, c.lesson_version);
    } else if (m.relation === "practises") {
      for (const c of done) if (practisedKeys(c.keys)) add("decision", `Decisions answered in the Topic: ${label}`, c.completed_at, c.lesson_version);
      const p = rec.progress.find((x) => x.slug === m.asset_ref);
      if (!out.length && p && practisedKeys(p.keys))
        add("decision", `Decisions answered in the Topic: ${label}`, p.at, p.version, "The Topic isn’t finished yet.");
    } else {
      for (const c of done) {
        const passed = Object.entries(c.evidence).filter(([k, v]) => k.startsWith("passedAt:") && typeof v === "string") as [string, string][];
        if (!passed.length) continue;
        const card = passed[0][0].slice("passedAt:".length);
        const score = c.evidence[`score:${card}`];
        add("assessment", `Assessment passed in the Topic: ${label}`, passed[0][1], c.lesson_version, typeof score === "number" ? `Score ${score}%` : null);
      }
    }
  } else if (m.asset_kind === "course") {
    if (m.relation === "introduces")
      for (const c of rec.courses) if (c.guide_id === m.asset_ref) add("course", `Course completed: ${label}`, c.at, `edition ${c.number}`);
    if (m.relation === "practises") {
      const d = rec.decisions.filter((x) => x.guide_id === m.asset_ref);
      if (d.length)
        add(
          "decision",
          `Decisions answered in the course: ${label}`,
          d[d.length - 1].at,
          d[d.length - 1].number ? `edition ${d[d.length - 1].number}` : null,
          `${d.length} answered`,
        );
    }
  } else if (m.asset_kind === "page") {
    const [guide, page] = m.asset_ref.split(":");
    if (m.relation === "introduces")
      for (const p of rec.pages) if (p.guide_id === guide && p.page_id === page) add("page", `Page finished: ${label}`, p.at, `edition ${p.number}`);
    if (m.relation === "practises") {
      const d = rec.decisions.filter((x) => x.guide_id === guide && x.page_id === page);
      if (d.length)
        add("decision", `Decision answered on the page: ${label}`, d[d.length - 1].at, d[d.length - 1].number ? `edition ${d[d.length - 1].number}` : null);
    }
  } else if (m.asset_kind === "quiz" && m.relation === "assesses") {
    for (const q of rec.quizzes)
      if (q.path_id === m.asset_ref) add("quiz", `Quiz passed: ${label}`, q.submitted_at, `attempt ${q.id}`, `${q.score} of ${q.total}`);
  }
  return out;
}

const mayOpen = (asset: Asset, audience: string) => !asset.audience.length || asset.audience.includes(audience);

function competencyProfile(db: Db, ctx: Ctx, person: User, rec: Records, req: Requirement): CompetencyProfile {
  const v = approvedVersion(db, req.competencyId, req.version) ?? approvedVersion(db, req.competencyId);
  const stages: Record<Stage, Evidence[]> = { introduced: [], practised: [], demonstrated: [], verified: [] };
  const push = (e: Omit<Evidence, "stale">) => stages[e.stage].push({ ...e, stale: isStale(e.at, req.refreshMonths, ctx.now) });
  const approved = ctx.mappings.get(req.competencyId) ?? [];
  for (const m of approved) for (const e of evidenceFrom(m, rec, ctx.all.get(assetKey(m.asset_kind, m.asset_ref)))) push(e);
  for (const r of rec.manual)
    if (r.competency_id === req.competencyId)
      push({ stage: r.stage, kind: "record", label: r.description, at: r.evidence_on, version: null, detail: "Recorded by hand", by: nameOf(db, r.added_by) });
  // The observation that stands: the latest that hasn't been superseded or withdrawn.
  const standing = rec.observations.filter((o) => o.competency_id === req.competencyId && !o.superseded_by && !o.withdrawn_at).at(-1);
  if (standing?.decision === "verified")
    push({
      stage: "verified",
      kind: "observation",
      label: "Observed at work and signed off",
      at: standing.observed_on,
      version: `competency version ${standing.competency_version}`,
      detail: standing.rationale,
      by: nameOf(db, standing.assessor_id),
    });
  for (const s of STAGES) stages[s].sort((x, y) => y.at.localeCompare(x.at));

  const { met, stale } = targetState(stages, req.target);
  const askedAt = rec.asks.get(req.competencyId) ?? null;
  let next: NextStep | null = null;
  if (!met) {
    const route = (stage: Stage) =>
      approved
        .filter((m) => RELATION_STAGE[m.relation] === stage)
        .map((m) => ctx.all.get(assetKey(m.asset_kind, m.asset_ref)))
        .find((x): x is Asset => Boolean(x) && mayOpen(x!, person.audience));
    for (const stage of STAGES.slice(0, STAGES.indexOf(req.target) + 1)) {
      if (stages[stage].some((e) => !e.stale)) continue;
      if (stage === "verified") {
        next = askedAt
          ? { text: "You’ve asked to be observed. Your manager signs this off.", href: null }
          : { text: "Ask your manager to observe this at work", href: null, action: "ask" };
        break;
      }
      const asset = route(stage);
      if (!asset) continue;
      const verb =
        stage === "introduced"
          ? "Review"
          : stage === "practised"
            ? "Practise a case in"
            : asset.kind === "quiz"
              ? "Take the assessed quiz"
              : "Take the assessment in";
      next = { text: `${verb}: ${asset.label}`, href: asset.href };
      break;
    }
  }
  return {
    id: req.competencyId,
    version: v?.version ?? req.version,
    name: v?.name ?? req.competencyId,
    definition: v?.definition ?? "",
    behaviours: v ? (JSON.parse(v.behaviours) as string[]) : [],
    group: ctx.competencyGroup.get(req.competencyId) ?? "",
    target: req.target,
    criticality: req.criticality,
    refreshMonths: req.refreshMonths,
    stages,
    highest: highestStage(stages),
    met,
    stale,
    summary: summarise(stages, req.target),
    next,
    askedAt,
    morePractice:
      standing?.decision === "more_practice" ? { at: standing.observed_on, by: nameOf(db, standing.assessor_id) ?? "", rationale: standing.rationale } : null,
  };
}

/** One person's capability profile against their role's active version. No role, or no active version: nothing is derived. */
function profile(db: Db, ctx: Ctx, person: User) {
  const p = personRow(db, person.id);
  const role = p?.role_id ? (db.prepare("SELECT * FROM cap_roles WHERE id = ?").get(p.role_id) as RoleRow | undefined) : undefined;
  const active = role ? activeVersion(db, role.id) : undefined;
  const rec = active ? recordsOf(db, person.id) : null;
  return {
    person: { id: person.id, name: person.name, team: p?.team ?? "", manager: nameOf(db, (person as UserRow).manager_id ?? null) },
    role:
      role && active
        ? {
            id: role.id,
            name: role.name,
            domain: role.domain,
            version: active.version,
            versionId: active.id,
            approvedAt: active.approved_at,
            approvedBy: nameOf(db, active.approved_by),
          }
        : null,
    /** A role is set but nothing has been approved for it yet. */
    pending: Boolean(role && !active),
    competencies: active && rec ? requirementsOf(active).map((r) => competencyProfile(db, ctx, person, rec, r)) : [],
  };
}
export type Profile = ReturnType<typeof profile>;

type CorrectionRow = {
  id: string;
  user_id: string;
  competency_id: string;
  message: string;
  state: "open" | "resolved" | "declined";
  resolution: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};
const correctionView = (db: Db, c: CorrectionRow) => ({
  id: c.id,
  competencyId: c.competency_id,
  competency: approvedVersion(db, c.competency_id)?.name ?? c.competency_id,
  message: c.message,
  state: c.state,
  resolution: c.resolution,
  resolvedBy: nameOf(db, c.resolved_by),
  resolvedAt: c.resolved_at,
  createdAt: c.created_at,
});

/** My Capabilities: the signed-in person's own profile, their correction requests, and where else they can go. */
export function myCapabilities(db: Db, user: User, now: Date) {
  const a = capAccess(db, user);
  return {
    ...profile(db, context(db, now), user),
    corrections: (db.prepare("SELECT * FROM cap_corrections WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as CorrectionRow[]).map((c) =>
      correctionView(db, c),
    ),
    hasTeam: a.manager,
    hasInsights: managesAny(a) || a.quality || a.insights,
  };
}

function ownRequirement(db: Db, user: User, competencyId: unknown): Requirement {
  const p = personRow(db, user.id);
  const active = p?.role_id ? activeVersion(db, p.role_id) : undefined;
  const req = active ? requirementsOf(active).find((r) => r.competencyId === competencyId) : undefined;
  if (!req) throw new HttpError(400, "That isn’t one of the capabilities for your role.");
  return req;
}

/** Asking to be observed. It puts the person at the top of their manager's queue; it records nothing as done. */
export function askForObservation(db: Db, user: User, competencyId: unknown, now: Date) {
  ensureCapability(db);
  const req = ownRequirement(db, user, competencyId);
  db.prepare("INSERT OR IGNORE INTO cap_asks (user_id, competency_id, asked_at) VALUES (?, ?, ?)").run(user.id, req.competencyId, now.toISOString());
  return myCapabilities(db, user, now);
}

/** "This is wrong or something's missing." One open request per capability; a named reviewer answers it. */
export function requestCorrection(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureCapability(db);
  const req = ownRequirement(db, user, input.competencyId);
  const message = text(input.message, 1000);
  if (message.length < 10) throw new HttpError(400, "Say what’s wrong or missing, so the reviewer knows what to check.");
  if (db.prepare("SELECT 1 FROM cap_corrections WHERE user_id = ? AND competency_id = ? AND state = 'open'").get(user.id, req.competencyId))
    throw new HttpError(400, "You already have a request open for this. It’s with a reviewer.");
  db.prepare("INSERT INTO cap_corrections (id, user_id, competency_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    newId("cor"),
    user.id,
    req.competencyId,
    message,
    now.toISOString(),
  );
  audit(db, { actor: user.id, event: "capability.correction_requested", entity: `user:${user.id}`, next: { competency: req.competencyId }, at: now });
  return myCapabilities(db, user, now);
}

// ---------------------------------------------------------------------------------------------
// Observations: the only way "Verified at work" is ever shown
// ---------------------------------------------------------------------------------------------

/** A manager observes their own reports; a population's owner can too. Never yourself. */
const canObserve = (a: Access, actor: User, person: UserRow) =>
  actor.id !== person.id && (person.manager_id === actor.id || manages(a, domainOf(person.audience)));

const observationView = (db: Db, o: ObservationRow) => ({
  id: o.id,
  userId: o.user_id,
  person: nameOf(db, o.user_id),
  competencyId: o.competency_id,
  competency: approvedVersion(db, o.competency_id, o.competency_version)?.name ?? o.competency_id,
  competencyVersion: o.competency_version,
  decision: o.decision,
  rationale: o.rationale,
  behaviours: JSON.parse(o.behaviours) as string[],
  assessor: nameOf(db, o.assessor_id),
  observedOn: o.observed_on,
  at: o.at,
  superseded: Boolean(o.superseded_by),
  withdrawn: o.withdrawn_at ? { at: o.withdrawn_at, by: nameOf(db, o.withdrawn_by), reason: o.withdrawn_reason } : null,
});

/** A manager's view: the people who report to them, what's waiting to be observed, and what they've signed. */
export function teamCapabilities(db: Db, actor: User, now: Date) {
  const a = capAccess(db, actor);
  const reports = db.prepare("SELECT * FROM users WHERE manager_id = ? ORDER BY name").all(actor.id) as UserRow[];
  const ctx = context(db, now);
  const team = reports.map((r) => profile(db, ctx, r));
  const queue = team
    .flatMap((p) =>
      p.competencies
        .filter((c) => c.target === "verified" && !c.met)
        .map((c) => ({
          userId: p.person.id,
          person: p.person.name,
          competencyId: c.id,
          competency: c.name,
          version: c.version,
          behaviours: c.behaviours,
          definition: c.definition,
          criticality: c.criticality,
          askedAt: c.askedAt,
          state: c.stale ? ("refresh" as const) : c.morePractice ? ("again" as const) : ("due" as const),
          highest: c.highest,
          morePractice: c.morePractice,
        })),
    )
    .sort(
      (x, y) => Number(Boolean(y.askedAt)) - Number(Boolean(x.askedAt)) || (x.askedAt ?? "").localeCompare(y.askedAt ?? "") || x.person.localeCompare(y.person),
    );
  return {
    isManager: a.manager,
    team,
    queue,
    history: (db.prepare("SELECT * FROM cap_observations WHERE assessor_id = ? ORDER BY at DESC LIMIT 50").all(actor.id) as ObservationRow[]).map((o) =>
      observationView(db, o),
    ),
  };
}

/**
  Records what someone was seen doing at work, against the competency's observable behaviours. Signing
  off shows "Verified at work"; "needs more practice" doesn't, and says why. Either way the one before
  is kept and marked superseded.
*/
export function recordObservation(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const person = typeof input.userId === "string" ? (userById(db, input.userId) as UserRow | undefined) : undefined;
  if (!person) throw new HttpError(404, "That person isn’t a Hub user.");
  need(canObserve(a, actor, person), "You can only sign off people who report to you.");
  const req = ownRequirement(db, person, input.competencyId);
  const decision = input.decision === "verified" || input.decision === "more_practice" ? input.decision : null;
  if (!decision) throw new HttpError(400, "Choose Sign off or Needs more practice.");
  const rationale = text(input.rationale, 1000);
  if (rationale.length < 15) throw new HttpError(400, "Say what you saw, in a sentence or two. It’s what makes the sign-off checkable later.");
  const observedOn = day(input.observedOn) ?? now.toISOString().slice(0, 10);
  if (observedOn > now.toISOString().slice(0, 10)) throw new HttpError(400, "The observation can’t be dated in the future.");
  const v = approvedVersion(db, req.competencyId, req.version) ?? approvedVersion(db, req.competencyId);
  const rubric = v ? (JSON.parse(v.behaviours) as string[]) : [];
  const seen = (Array.isArray(input.behaviours) ? input.behaviours : []).filter((b): b is string => typeof b === "string" && rubric.includes(b));
  // A sign-off is against the whole rubric: every behaviour seen.
  if (decision === "verified" && seen.length < rubric.length)
    throw new HttpError(400, "To sign off, tick each behaviour you saw. If one’s missing, choose Needs more practice.");
  const id = newId("obs");
  const p = personRow(db, person.id);
  tx(db, () => {
    db.prepare("UPDATE cap_observations SET superseded_by = ? WHERE user_id = ? AND competency_id = ? AND superseded_by IS NULL AND withdrawn_at IS NULL").run(
      id,
      person.id,
      req.competencyId,
    );
    db.prepare(
      `INSERT INTO cap_observations (id, user_id, competency_id, competency_version, role_version_id, behaviours, decision, rationale, assessor_id, observed_on, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      person.id,
      req.competencyId,
      v?.version ?? req.version,
      p?.role_id ? (activeVersion(db, p.role_id)?.id ?? null) : null,
      JSON.stringify(seen),
      decision,
      rationale,
      actor.id,
      observedOn,
      now.toISOString(),
    );
    db.prepare("DELETE FROM cap_asks WHERE user_id = ? AND competency_id = ?").run(person.id, req.competencyId);
    // Who, what and the decision. The words stay with the observation.
    audit(db, {
      actor: actor.id,
      event: `capability.observation_${decision}`,
      entity: `user:${person.id}`,
      next: { observation: id, competency: req.competencyId, version: v?.version ?? req.version, observedOn },
      at: now,
    });
  });
  return { id };
}

/** Takes an observation back, with a reason. It stays on record as withdrawn; the profile stops counting it. */
export function withdrawObservation(db: Db, actor: User, id: unknown, reason: unknown, now: Date) {
  const a = capAccess(db, actor);
  const o = typeof id === "string" ? (db.prepare("SELECT * FROM cap_observations WHERE id = ?").get(id) as ObservationRow | undefined) : undefined;
  if (!o) throw new HttpError(404, "That observation isn’t here.");
  const person = userById(db, o.user_id) as UserRow;
  need(o.assessor_id === actor.id || manages(a, domainOf(person.audience)), "Only the person who signed it, or the framework’s owner, can withdraw it.");
  const why = text(reason, 400);
  if (why.length < 10) throw new HttpError(400, "Say why it’s being withdrawn.");
  if (o.withdrawn_at) return { id: o.id };
  db.prepare("UPDATE cap_observations SET withdrawn_at = ?, withdrawn_by = ?, withdrawn_reason = ? WHERE id = ?").run(now.toISOString(), actor.id, why, o.id);
  audit(db, {
    actor: actor.id,
    event: "capability.observation_withdrawn",
    entity: `user:${o.user_id}`,
    previous: { observation: o.id, decision: o.decision },
    reason: why,
    at: now,
  });
  return { id: o.id };
}

// ---------------------------------------------------------------------------------------------
// Corrections and hand-recorded evidence
// ---------------------------------------------------------------------------------------------

/** One person's profile, for someone allowed to see it: the owner of their population, or their manager. */
export function personCapabilities(db: Db, actor: User, userId: unknown, now: Date) {
  const a = capAccess(db, actor);
  const person = typeof userId === "string" ? (userById(db, userId) as UserRow | undefined) : undefined;
  // Outside your remit looks the same as not existing.
  if (!person || !(person.manager_id === actor.id || manages(a, domainOf(person.audience))))
    throw new HttpError(404, "That person’s record isn’t available to you.");
  audit(db, { actor: actor.id, event: "capability.profile_viewed", entity: `user:${person.id}`, at: now });
  return {
    ...profile(db, context(db, now), person),
    observations: (db.prepare("SELECT * FROM cap_observations WHERE user_id = ? ORDER BY at DESC").all(person.id) as ObservationRow[]).map((o) =>
      observationView(db, o),
    ),
    canRecord: manages(a, domainOf(person.audience)),
  };
}

export function corrections(db: Db, actor: User) {
  const a = capAccess(db, actor);
  need(managesAny(a), "Only the framework’s owners review correction requests.");
  const rows = db.prepare("SELECT * FROM cap_corrections ORDER BY state = 'open' DESC, created_at DESC LIMIT 200").all() as CorrectionRow[];
  return {
    corrections: rows
      .map((c) => ({ c, person: userById(db, c.user_id) }))
      .filter((x) => x.person && manages(a, domainOf(x.person.audience)))
      .map((x) => ({ ...correctionView(db, x.c), userId: x.c.user_id, person: x.person!.name })),
  };
}

/** Evidence recorded by hand (from a handoff, or to settle a correction). It can't claim a workplace observation. */
function addRecord(db: Db, actor: User, person: UserRow, input: Record<string, unknown>, correctionId: string | null, now: Date) {
  const stage = STAGES.find((s) => s === input.stage);
  if (!stage) throw new HttpError(400, "Choose the stage this evidence shows.");
  if (stage === "verified") throw new HttpError(400, "“Verified at work” is only ever shown by an observation: ask the person’s manager to record one.");
  const competencyId = typeof input.competencyId === "string" ? input.competencyId : "";
  if (!db.prepare("SELECT 1 FROM cap_competencies WHERE id = ?").get(competencyId)) throw new HttpError(404, "That competency isn’t in the framework.");
  const description = text(input.description, 300);
  if (description.length < 10) throw new HttpError(400, "Describe the evidence and where it came from.");
  const on = day(input.evidenceOn);
  if (!on || on > now.toISOString().slice(0, 10)) throw new HttpError(400, "Give the date of the evidence (not in the future).");
  const id = newId("rec");
  db.prepare(
    "INSERT INTO cap_records (id, user_id, competency_id, stage, description, evidence_on, correction_id, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, person.id, competencyId, stage, description, on, correctionId, actor.id, now.toISOString());
  audit(db, {
    actor: actor.id,
    event: "capability.record_added",
    entity: `user:${person.id}`,
    next: { record: id, competency: competencyId, stage, correction: correctionId },
    at: now,
  });
  return id;
}

export function recordEvidence(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const person = typeof input.userId === "string" ? (userById(db, input.userId) as UserRow | undefined) : undefined;
  if (!person) throw new HttpError(404, "That person isn’t a Hub user.");
  need(manages(a, domainOf(person.audience)), "Only the owner of this person’s framework can record evidence for them.");
  return { id: addRecord(db, actor, person, input, null, now) };
}

/** Answers a correction request, by name. If it was right, the missing evidence is recorded; nothing existing is rewritten. */
export function resolveCorrection(db: Db, actor: User, id: unknown, input: Record<string, unknown>, now: Date) {
  const a = capAccess(db, actor);
  const c = typeof id === "string" ? (db.prepare("SELECT * FROM cap_corrections WHERE id = ?").get(id) as CorrectionRow | undefined) : undefined;
  if (!c) throw new HttpError(404, "That request isn’t here.");
  const person = userById(db, c.user_id) as UserRow;
  need(manages(a, domainOf(person.audience)), "Only the owner of this person’s framework can answer it.");
  if (c.state !== "open") throw new HttpError(400, "That request has already been answered.");
  const state = input.state === "resolved" || input.state === "declined" ? input.state : null;
  if (!state) throw new HttpError(400, "Choose whether the record was corrected or stays as it is.");
  const resolution = text(input.resolution, 600);
  if (resolution.length < 10) throw new HttpError(400, "Say what you found and what was done. The person sees this.");
  tx(db, () => {
    if (state === "resolved" && input.stage) addRecord(db, actor, person, { ...input, competencyId: c.competency_id }, c.id, now);
    db.prepare("UPDATE cap_corrections SET state = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?").run(
      state,
      resolution,
      actor.id,
      now.toISOString(),
      c.id,
    );
    audit(db, {
      actor: actor.id,
      event: `capability.correction_${state}`,
      entity: `user:${c.user_id}`,
      next: { correction: c.id, competency: c.competency_id, recorded: Boolean(input.stage) },
      at: now,
    });
  });
  return corrections(db, actor);
}

// ---------------------------------------------------------------------------------------------
// The heatmap: coverage for a role, by team
// ---------------------------------------------------------------------------------------------

const minCohort = (db: Db) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'capability_min_cohort'").get() as { value: string } | undefined;
  const n = Math.round(Number(row?.value));
  return n >= 2 && n <= 50 ? n : DEFAULT_MIN_COHORT;
};

/**
  Who has what evidence for each competency of a role, as counts: everyone in the role, then each team.
  A role belongs to one population, so employees and partners are never added together. Someone who only
  sees aggregates gets small groups hidden; the population's owner can open the people behind a cell.
*/
export function heatmap(db: Db, actor: User, roleId: unknown, now: Date) {
  const role = roleOf(db, roleId);
  const a = capAccess(db, actor);
  need(seesAggregate(a, role.domain), "You don’t have access to this population’s capability coverage.");
  const active = activeVersion(db, role.id);
  const owner = manages(a, role.domain);
  const threshold = minCohort(db);
  const ctx = context(db, now);
  const assigned = (
    db.prepare("SELECT u.* FROM cap_people p JOIN users u ON u.id = p.user_id WHERE p.role_id = ? ORDER BY u.name").all(role.id) as UserRow[]
  ).filter((u) => domainOf(u.audience) === role.domain);
  const profiles = active ? assigned.map((u) => profile(db, ctx, u)) : [];
  const teams = [...new Set(profiles.map((p) => p.person.team || ""))].sort((x, y) => (x === "" ? 1 : y === "" ? -1 : x.localeCompare(y)));
  const columns = [
    { key: "*", label: `Everyone in this role` },
    ...(teams.length > 1 || teams[0] ? teams.map((t) => ({ key: t, label: t || "No team recorded" })) : []),
  ];
  const requirements = active ? requirementsOf(active) : [];
  const rows = requirements.map((r) => {
    const v = approvedVersion(db, r.competencyId, r.version) ?? approvedVersion(db, r.competencyId);
    const mapped = (stage: Stage) => (ctx.mappings.get(r.competencyId) ?? []).some((m) => RELATION_STAGE[m.relation] === stage);
    const cells = columns.map((col) => {
      const cell: Cell = emptyCell();
      for (const p of profiles)
        if (col.key === "*" || (p.person.team || "") === col.key)
          addToCell(
            cell,
            p.competencies.find((c) => c.id === r.competencyId)!,
          );
      // Too few people for a figure that can't be traced to someone.
      return !owner && cell.n > 0 && cell.n < threshold ? { suppressed: true as const, n: null } : { suppressed: false as const, ...cell };
    });
    return {
      competencyId: r.competencyId,
      name: v?.name ?? r.competencyId,
      group: ctx.competencyGroup.get(r.competencyId) ?? "",
      target: r.target,
      criticality: r.criticality,
      version: r.version,
      cells,
      /** No approved learning or assessment can show the target stage: "no evidence yet" here is a coverage gap, not a skills gap. */
      noRoute: r.target !== "verified" && !mapped(r.target),
      people: owner
        ? profiles.map((p) => {
            const c = p.competencies.find((x) => x.id === r.competencyId)!;
            return { id: p.person.id, name: p.person.name, team: p.person.team, highest: c.highest, met: c.met, stale: c.stale };
          })
        : null,
    };
  });
  return {
    role: { id: role.id, name: role.name, domain: role.domain, jobFamily: role.job_family },
    version: active ? { number: active.version, approvedAt: active.approved_at, approvedBy: nameOf(db, active.approved_by) } : null,
    columns,
    rows,
    people: profiles.length,
    /** People in this population with no role set: they're in no one's figures. */
    unassigned: (
      db.prepare("SELECT u.audience FROM users u LEFT JOIN cap_people p ON p.user_id = u.id WHERE p.role_id IS NULL").all() as { audience: string }[]
    ).filter((u) => domainOf(u.audience) === role.domain).length,
    observationsWaiting: profiles.reduce((n, p) => n + p.competencies.filter((c) => c.target === "verified" && !c.met).length, 0),
    asOf: now.toISOString(),
    threshold,
    canDrill: owner,
  };
}

// ---------------------------------------------------------------------------------------------
// Access, and a starting point for the pilot
// ---------------------------------------------------------------------------------------------

export function accessList(db: Db, actor: User) {
  need(isSuperadmin(actor), "Only a superadmin can see and change who has capability access.");
  ensureCapability(db);
  const rows = db.prepare("SELECT a.user_id, a.role, u.name FROM cap_access a JOIN users u ON u.id = a.user_id ORDER BY u.name").all() as {
    user_id: string;
    role: AccessRole;
    name: string;
  }[];
  return {
    access: rows.map((r) => ({ userId: r.user_id, name: r.name, role: r.role })),
    users: (db.prepare("SELECT id, name, audience FROM users ORDER BY name").all() as { id: string; name: string; audience: string }[]).filter(
      (u) => u.audience === "staff",
    ),
    roles: ACCESS_ROLES,
  };
}

export function setAccess(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  need(isSuperadmin(actor), "Only a superadmin can change who has capability access.");
  ensureCapability(db);
  const target = typeof input.userId === "string" ? userById(db, input.userId) : undefined;
  const role = (Object.keys(ACCESS_ROLES) as AccessRole[]).find((r) => r === input.role);
  if (!target || !role) throw new HttpError(400, "Choose a person and what they can do.");
  // People & Culture, Quality and insight access are for Trilogy Care staff.
  if (target.audience !== "staff") throw new HttpError(400, "Capability access is for Trilogy Care staff.");
  if (input.on === false) db.prepare("DELETE FROM cap_access WHERE user_id = ? AND role = ?").run(target.id, role);
  else
    db.prepare("INSERT OR IGNORE INTO cap_access (user_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?)").run(
      target.id,
      role,
      actor.id,
      now.toISOString(),
    );
  audit(db, {
    actor: actor.id,
    event: input.on === false ? "capability.access_removed" : "capability.access_granted",
    entity: `user:${target.id}`,
    next: { role },
    at: now,
  });
  return accessList(db, actor);
}

const PILOT: { name: string; group: string; definition: string; behaviours: string[]; highRisk?: boolean; target: Stage }[] = [
  {
    name: "Client-centred communication",
    group: "Working with clients",
    definition: "Talks with clients and their families in a way that is clear, respectful and led by what matters to the client.",
    behaviours: [
      "Asks what matters to the client before proposing anything.",
      "Checks the client has understood, in plain language.",
      "Records what the client said they want in their own words.",
    ],
    target: "verified",
  },
  {
    name: "Dignity of risk",
    group: "Working with clients",
    definition: "Supports a client’s right to make their own choices, including ones that carry risk, while making sure the risk is understood.",
    behaviours: [
      "Explores the client’s reasons before suggesting a change.",
      "Explains the risk and the options without pressing a preferred one.",
      "Records the client’s decision and how it was reached.",
    ],
    highRisk: true,
    target: "verified",
  },
  {
    name: "Noticing a change in a client’s needs",
    group: "Working with clients",
    definition: "Notices when a client’s needs or circumstances seem to be changing, and acts on it through the reviewed process.",
    behaviours: [
      "Describes what has changed, with specifics.",
      "Checks the change with the client or their representative.",
      "Raises it through the reviewed process without delay.",
    ],
    target: "demonstrated",
  },
  {
    name: "Care-plan interpretation",
    group: "Planning and funding",
    definition: "Reads a care plan accurately and can explain what it means for the services a client receives.",
    behaviours: [
      "Identifies the client’s goals and the services that support each one.",
      "Spots where a plan and the services delivered don’t match.",
      "Explains the plan to a client or partner in plain language.",
    ],
    target: "demonstrated",
  },
  {
    name: "Support at Home funding conversations",
    group: "Planning and funding",
    definition: "Explains to a client how their Support at Home funding works and what it can be used for, and where to check.",
    behaviours: [
      "Explains the funding in plain language, without jargon.",
      "Says what they are unsure of and checks before answering.",
      "Keeps the conversation on the client’s goals, not on spending the budget.",
    ],
    target: "demonstrated",
  },
  {
    name: "Invoice verification",
    group: "Planning and funding",
    definition: "Checks a supplier invoice against what was agreed and delivered before it is approved, and follows up what doesn’t match.",
    behaviours: [
      "Identifies missing detail on an invoice.",
      "Identifies a rate or service that doesn’t match what was agreed.",
      "Follows the reviewed process to clarify before approving.",
    ],
    target: "verified",
  },
  {
    name: "Complaints handling",
    group: "Safety and quality",
    definition:
      "Receives a complaint or concern in a way that makes the person feel heard, records it accurately and passes it on through the reviewed process.",
    behaviours: [
      "Listens and acknowledges before explaining.",
      "Records the complaint in the person’s own words.",
      "Escalates it through the reviewed process and tells the person what happens next.",
    ],
    highRisk: true,
    target: "verified",
  },
  {
    name: "Incident escalation",
    group: "Safety and quality",
    definition: "Recognises an incident or a serious concern and escalates it promptly through the reviewed process.",
    behaviours: ["Recognises what counts as an incident.", "Escalates to the right place without delay.", "Records what happened factually, without opinion."],
    highRisk: true,
    target: "verified",
  },
  {
    name: "Privacy and confidentiality",
    group: "Safety and quality",
    definition: "Handles client information so that it is seen only by the people who need it.",
    behaviours: [
      "Shares client information only with those who need it for the client’s care.",
      "Checks who they are speaking to before discussing a client.",
      "Reports a possible privacy breach through the reviewed process.",
    ],
    target: "demonstrated",
  },
  {
    name: "Working within scope",
    group: "Safety and quality",
    definition: "Knows the limits of the role and what to do when something falls outside it.",
    behaviours: ["Says when a request is outside the role.", "Refers it to the right person or service.", "Follows up to check it was picked up."],
    target: "demonstrated",
  },
  {
    name: "Working with Care Partners and providers",
    group: "Working with others",
    definition: "Works with Care Partners, suppliers and other providers so the client’s services are coordinated.",
    behaviours: [
      "Keeps partners informed of changes that affect them.",
      "Resolves a mismatch between providers without involving the client unnecessarily.",
      "Records agreements so others can rely on them.",
    ],
    target: "practised",
  },
  {
    name: "Keeping accurate records",
    group: "Working with others",
    definition: "Keeps notes that another person could pick up and act on.",
    behaviours: ["Records contacts and decisions on the day.", "Writes facts, and marks opinion as opinion.", "Notes what happens next and who is doing it."],
    target: "practised",
  },
];

/**
  A starting point for the pilot: one care coordinator role and twelve competencies, all as drafts. They
  are prompts for People & Culture, Quality and coordinators to rewrite and approve; nobody's profile
  shows anything until a competency is approved and a role version is made active.
*/
export function startPilot(db: Db, actor: User, now: Date) {
  const a = capAccess(db, actor);
  need(manages(a, "partner"), "Only the partner framework’s owner can start the care coordinator pilot.");
  if ((db.prepare("SELECT COUNT(*) AS n FROM cap_competencies").get() as { n: number }).n > 0)
    throw new HttpError(400, "The framework already has competencies in it.");
  const requirements: Requirement[] = [];
  for (const c of PILOT) {
    const { id } = saveCompetency(
      db,
      actor,
      {
        name: c.name,
        group: c.group,
        definition: c.definition,
        behaviours: c.behaviours,
        highRisk: c.highRisk === true,
        owner: "",
        source: "Starter draft: review before approving",
      },
      now,
    );
    requirements.push({ competencyId: id, version: 0, target: c.target, criticality: c.highRisk ? "high" : "core", refreshMonths: c.highRisk ? 12 : null });
  }
  const { id } = saveRole(db, actor, { name: "Care coordinator", jobFamily: "Care coordination", domain: "partner" }, now);
  saveRoleDraft(db, actor, id, { requirements, note: "Pilot draft" }, now);
  return { roleId: id };
}

/** Every row of every person in a role, for an owner's export. */
export function evidenceRows(db: Db, actor: User, roleId: unknown, now: Date) {
  const role = roleOf(db, roleId);
  need(manages(capAccess(db, actor), role.domain), "Only this population’s owner can export individual evidence.");
  const ctx = context(db, now);
  const assigned = (
    db.prepare("SELECT u.* FROM cap_people p JOIN users u ON u.id = p.user_id WHERE p.role_id = ? ORDER BY u.name").all(role.id) as UserRow[]
  ).filter((u) => domainOf(u.audience) === role.domain);
  return assigned.map((u) => profile(db, ctx, u));
}
