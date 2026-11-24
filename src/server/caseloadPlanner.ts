import "server-only";
import { randomUUID } from "node:crypto";
import { MODEL_VERSION } from "@/lib/hiringModel";
import { analyse, cleanPlan, FIELD_KEYS, FIELDS, OPTION_IDS, PLANNER_VERSION, workbookSheets, type OptionId, type Plan } from "@/lib/caseloadPlanner";
import { ensureCaseload, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";
import { workbook } from "./xlsx";

/*
  The Caseload-to-Margin Work Tool on the server (docs/caseload-margin-calculator.md).

  Who may plan a business: its owner, and the members the owner has authorised, recorded in business_planner_access.
  Every plan, version, comparison, export and grant is checked here against that, never only on the page. Someone
  outside the business gets "not found" for a plan, not "forbidden", so a guessed address says nothing. A general
  coordinator's account, another partner business and Trilogy staff get no access to a business's plans; Trilogy
  support access is a separate, audited decision that isn't built.

  The fictional example needs no access: anyone signed in can explore it and download its workbook. It's never saved.
*/

export const TOOL_ID = "caseload-margin";
export const TOOL_HREF = `/tools/${TOOL_ID}`;
export const TOOL_TITLE = "Caseload-to-Margin & Hiring Capacity";

type AccessRow = { org_id: string; user_id: string; grant_role: "owner" | "member"; granted_by: string; granted_at: string };
type PlanRow = {
  id: string;
  org_id: string;
  name: string;
  created_by: string;
  from_plan: string | null;
  from_version: number | null;
  created_at: string;
  updated_at: string;
};
type VersionRow = {
  plan_id: string;
  number: number;
  inputs: string;
  model_version: string;
  planner_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

const seeded = new WeakSet<object>();
/** The tables, and the demo business owner: Casey Taylor owns Taylor Cleaning (demo). */
export function ensurePlanner(db: Db, now = new Date()) {
  ensureCaseload(db);
  if (seeded.has(db)) return;
  const casey = db.prepare("SELECT id, org_id FROM users WHERE id = 'casey'").get() as { id: string; org_id: string } | undefined;
  if (casey)
    db.prepare("INSERT OR IGNORE INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'seed', ?)").run(
      casey.org_id,
      casey.id,
      now.toISOString(),
    );
  seeded.add(db);
}

/** This person's access to plan their own business, if any. Only ever their own organisation. */
export function plannerAccess(db: Db, user: User) {
  ensurePlanner(db);
  const r = db.prepare("SELECT * FROM business_planner_access WHERE user_id = ? AND org_id = ?").get(user.id, user.org_id) as AccessRow | undefined;
  if (!r) return null;
  const org = db.prepare("SELECT name FROM orgs WHERE id = ?").get(r.org_id) as { name: string } | undefined;
  return { orgId: r.org_id, orgName: org?.name ?? "", role: r.grant_role };
}

function requireAccess(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Plan my business is for the business owner and the people they’ve authorised.");
  return a;
}

/** Whether the Work Tools card shows: people who can plan a business, and authors reviewing the tool. */
export const plannerEligible = (db: Db, user: User) => Boolean(plannerAccess(db, user)) || canAuthor(user);

// ---------------------------------------------------------------------------------------------
// Who may plan
// ---------------------------------------------------------------------------------------------

/** For the owner: who has access, and who else in the business could be given it. */
export function accessList(db: Db, user: User) {
  const a = requireAccess(db, user);
  if (a.role !== "owner") return { members: [], candidates: [] };
  const rows = db
    .prepare(
      "SELECT a.user_id, a.grant_role, a.granted_at, u.name FROM business_planner_access a JOIN users u ON u.id = a.user_id WHERE a.org_id = ? ORDER BY u.name",
    )
    .all(a.orgId) as { user_id: string; grant_role: string; granted_at: string; name: string }[];
  const have = new Set(rows.map((r) => r.user_id));
  const candidates = (db.prepare("SELECT id, name FROM users WHERE org_id = ? ORDER BY name").all(a.orgId) as { id: string; name: string }[]).filter(
    (u) => !have.has(u.id),
  );
  return { members: rows.map((r) => ({ id: r.user_id, name: r.name, role: r.grant_role, grantedAt: r.granted_at })), candidates };
}

/** The owner authorises someone in the same business, or takes access away. The owner can't remove themselves. */
export function setAccess(db: Db, user: User, input: { userId?: unknown; grant?: unknown }, now: Date) {
  const a = requireAccess(db, user);
  if (a.role !== "owner") throw new HttpError(403, "Only the business owner can change who plans the business.");
  const target =
    typeof input.userId === "string"
      ? (db.prepare("SELECT id, org_id FROM users WHERE id = ?").get(input.userId) as { id: string; org_id: string } | undefined)
      : undefined;
  if (!target || target.org_id !== a.orgId) throw new HttpError(404, "That person isn’t in your business.");
  if (target.id === user.id) throw new HttpError(400, "You can’t change your own access.");
  if (input.grant === true)
    db.prepare("INSERT OR IGNORE INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'member', ?, ?)").run(
      a.orgId,
      target.id,
      user.id,
      now.toISOString(),
    );
  else db.prepare("DELETE FROM business_planner_access WHERE org_id = ? AND user_id = ? AND grant_role = 'member'").run(a.orgId, target.id);
  return accessList(db, user);
}

// ---------------------------------------------------------------------------------------------
// Plans and versions
// ---------------------------------------------------------------------------------------------

/** The headline results a version showed, under the expected case, kept with it for comparing. Figures, not inputs. */
function snapshotOf(p: Plan) {
  const out: Record<string, unknown> = {};
  for (const id of OPTION_IDS) {
    const a = analyse(p, "expected", id);
    if (!a) return { complete: false };
    out[id] = {
      monthsAbove: a.selected.monthsAbove,
      firstPressure: a.selected.firstPressure,
      operating12: a.revenueKnown ? Math.round(a.selected.operating12) : null,
      lowestCash: a.moneyKnown ? Math.round(a.selected.lowestCash) : null,
      firstReserveBreach: a.moneyKnown ? a.selected.firstReserveBreach : null,
    };
  }
  return { complete: true, options: out };
}

/** A plan in this person's business, or "not found": the same answer whether it's someone else's or doesn't exist. */
function ownPlan(db: Db, user: User, id: unknown) {
  const a = requireAccess(db, user);
  const row = typeof id === "string" ? (db.prepare("SELECT * FROM business_plans WHERE id = ?").get(id) as PlanRow | undefined) : undefined;
  if (!row || row.org_id !== a.orgId) throw new HttpError(404, "That plan isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, planId: string) => db.prepare("SELECT * FROM business_plan_versions WHERE plan_id = ? ORDER BY number").all(planId) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

export function listPlans(db: Db, user: User) {
  const a = requireAccess(db, user);
  const rows = db.prepare("SELECT * FROM business_plans WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as PlanRow[];
  return {
    plans: rows.map((r) => {
      const v = versionsOf(db, r.id);
      const last = v.at(-1);
      return {
        id: r.id,
        name: r.name,
        versions: v.length,
        updatedAt: r.updated_at,
        updatedBy: last ? nameOf(db, last.saved_by) : "",
        modelVersion: last?.model_version ?? "",
      };
    }),
  };
}

/** One plan with its versions, and the inputs of one version (the latest unless asked). */
export function getPlan(db: Db, user: User, id: unknown, version?: unknown) {
  const { row } = ownPlan(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That plan isn’t here.");
  return {
    id: row.id,
    name: row.name,
    from: row.from_plan ? { plan: row.from_plan, version: row.from_version } : null,
    versions: versions.map((v) => ({
      number: v.number,
      savedAt: v.saved_at,
      savedBy: nameOf(db, v.saved_by),
      note: v.note,
      modelVersion: v.model_version,
      plannerVersion: v.planner_version,
      snapshot: JSON.parse(v.snapshot),
    })),
    version: chosen.number,
    plan: cleanPlan(JSON.parse(chosen.inputs)),
    /** Saved under an earlier model: the figures shown now are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

/** Saves a business plan: a new plan, or the next version of one. Nothing is overwritten. The fictional example can't be saved. */
export function savePlan(db: Db, user: User, input: { id?: unknown; name?: unknown; plan?: unknown; note?: unknown }, now: Date) {
  const a = requireAccess(db, user);
  const plan = cleanPlan(input.plan);
  if (plan.kind !== "business") throw new HttpError(400, "The fictional example isn’t saved. Start Plan my business to save your own.");
  const at = now.toISOString();
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  let id: string;
  let number: number;
  if (input.id) {
    const { row } = ownPlan(db, user, input.id);
    id = row.id;
    number = (versionsOf(db, id).at(-1)?.number ?? 0) + 1;
    const name = cleanName(input.name) || row.name;
    db.prepare("UPDATE business_plans SET name = ?, updated_at = ? WHERE id = ?").run(name, at, id);
  } else {
    const name = cleanName(input.name);
    if (!name) throw new HttpError(400, "Give the plan a name.");
    id = `bp-${randomUUID().slice(0, 12)}`;
    number = 1;
    db.prepare("INSERT INTO business_plans (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      a.orgId,
      name,
      user.id,
      at,
      at,
    );
  }
  db.prepare(
    "INSERT INTO business_plan_versions (plan_id, number, inputs, model_version, planner_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, number, JSON.stringify(plan), MODEL_VERSION, PLANNER_VERSION, JSON.stringify(snapshotOf(plan)), note, user.id, at);
  recordPlannerEvent(db, user, { event: "scenario_saved", mode: "plan" }, now);
  return getPlan(db, user, id, number);
}

/** A copy of one version as a new plan, starting at version 1. The original is untouched. */
export function duplicatePlan(db: Db, user: User, input: { id?: unknown; version?: unknown; name?: unknown }, now: Date) {
  const source = getPlan(db, user, input.id, input.version);
  const a = requireAccess(db, user);
  const at = now.toISOString();
  const id = `bp-${randomUUID().slice(0, 12)}`;
  const name = cleanName(input.name) || `${source.name} (copy)`.slice(0, 80);
  db.prepare("INSERT INTO business_plans (id, org_id, name, created_by, from_plan, from_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    a.orgId,
    name,
    user.id,
    source.id,
    source.version,
    at,
    at,
  );
  db.prepare(
    "INSERT INTO business_plan_versions (plan_id, number, inputs, model_version, planner_version, snapshot, note, saved_by, saved_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    JSON.stringify(source.plan),
    MODEL_VERSION,
    PLANNER_VERSION,
    JSON.stringify(snapshotOf(source.plan)),
    `Copied from ${source.name}, version ${source.version}`,
    user.id,
    at,
  );
  return getPlan(db, user, id, 1);
}

/** Two versions of a plan side by side: the inputs that differ, and both versions' headline results. */
export function comparePlans(db: Db, user: User, input: { id?: unknown; a?: unknown; b?: unknown }, now: Date) {
  const x = getPlan(db, user, input.id, input.a);
  const y = getPlan(db, user, input.id, input.b);
  const show = (v: number | null) => (v === null ? "Blank" : String(v));
  const inputs = FIELD_KEYS.filter((k) => x.plan.values[k] !== y.plan.values[k]).map((k) => ({
    key: k,
    label: FIELDS[k].label,
    unit: FIELDS[k].unit,
    before: show(x.plan.values[k]),
    after: show(y.plan.values[k]),
  }));
  if (x.plan.incomeBasis !== y.plan.incomeBasis)
    inputs.push({ key: "income", label: "Income basis", unit: "", before: x.plan.incomeBasis, after: y.plan.incomeBasis });
  recordPlannerEvent(db, user, { event: "scenario_compared", mode: "plan" }, now);
  const snap = (v: number) => x.versions.find((s) => s.number === v)?.snapshot;
  return { a: { version: x.version, snapshot: snap(x.version) }, b: { version: y.version, snapshot: snap(y.version) }, inputs };
}

// ---------------------------------------------------------------------------------------------
// The workbook
// ---------------------------------------------------------------------------------------------

/**
  The private workbook for a saved version, or for the plan on screen (unsaved). A business plan needs access; the
  fictional example doesn't. Recalculated here from the inputs, so it matches the page's monthly table exactly.
*/
export function exportWorkbook(
  db: Db,
  user: User,
  input: { id?: unknown; version?: unknown; plan?: unknown; growthId?: unknown; optionId?: unknown },
  now: Date,
) {
  let plan: Plan;
  let name: string;
  let version: number | null = null;
  if (input.id) {
    const p = getPlan(db, user, input.id, input.version);
    plan = p.plan;
    name = p.name;
    version = p.version;
  } else {
    plan = cleanPlan(input.plan);
    if (plan.kind === "business") requireAccess(db, user);
    name = plan.kind === "example" ? "Fictional example" : "Unsaved plan";
  }
  const optionId = (OPTION_IDS as readonly string[]).includes(input.optionId as string) ? (input.optionId as OptionId) : "current";
  const growthId = typeof input.growthId === "string" ? input.growthId : "expected";
  const a = analyse(plan, growthId, optionId);
  if (!a) throw new HttpError(400, "Fill in the caseload and work fields before downloading the workbook.");
  const sheets = workbookSheets(plan, a, { name, generatedAt: now.toISOString(), version }).map((s) => ({ ...s, numbers: true }));
  recordPlannerEvent(db, user, { event: "scenario_exported", mode: plan.kind === "example" ? "learn" : "plan" }, now);
  const file = `${plan.kind === "example" ? "fictional-example" : name.replace(/[^\w-]+/g, "-").toLowerCase() || "plan"}-${now.toISOString().slice(0, 10)}.xlsx`;
  return { bytes: workbook(sheets), file };
}

// ---------------------------------------------------------------------------------------------
// Use events: no figures, ever
// ---------------------------------------------------------------------------------------------

export const PLANNER_EVENTS = [
  "business_simulator_opened",
  "scenario_compared",
  "quality_guardrail_seen",
  "cash_warning_seen",
  "scenario_saved",
  "scenario_exported",
] as const;
export type PlannerEvent = (typeof PLANNER_EVENTS)[number];

/** Records what happened, the mode and the person's access role: never an input or a result. */
export function recordPlannerEvent(db: Db, user: User, input: { event?: unknown; mode?: unknown }, now: Date) {
  ensurePlanner(db);
  const event = PLANNER_EVENTS.find((e) => e === input.event);
  if (!event) throw new HttpError(400, "Unknown event.");
  const mode = input.mode === "plan" ? "plan" : "learn";
  const a = plannerAccess(db, user);
  if (mode === "plan" && !a) throw new HttpError(403, "Plan my business is for the business owner and the people they’ve authorised.");
  db.prepare("INSERT INTO planner_events (id, event, mode, access, model_version, user_id, org_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    event,
    mode,
    a?.role ?? (canAuthor(user) ? "author" : "learner"),
    MODEL_VERSION,
    user.id,
    mode === "plan" ? a!.orgId : null,
    now.toISOString(),
  );
  return { ok: true };
}

/** Counts below this are shown as "fewer than 5", so a small number of businesses can't be picked out (as the lab does). */
const SMALL_COHORT = 5;
const cohort = (n: number) => (n > 0 && n < SMALL_COHORT ? "fewer than 5" : n);

/** For authors: counts only, small ones suppressed. No business, person, income, salary, margin or cash is ever listed. */
export function plannerReport(db: Db, user: User) {
  if (!canAuthor(user)) throw new HttpError(403, "Only authors see how the tool is used.");
  ensurePlanner(db);
  const events = db.prepare("SELECT event, mode, COUNT(*) AS n FROM planner_events GROUP BY event, mode ORDER BY event, mode").all() as {
    event: string;
    mode: string;
    n: number;
  }[];
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    eligibleBusinesses: cohort(count("SELECT COUNT(DISTINCT org_id) AS n FROM business_planner_access")),
    businessesPlanning: cohort(count("SELECT COUNT(DISTINCT org_id) AS n FROM planner_events WHERE mode = 'plan'")),
    savedPlans: cohort(count("SELECT COUNT(*) AS n FROM business_plans")),
    events: events.map((e) => ({ ...e, n: cohort(e.n) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------------------------

export function toolFavourite(db: Db, user: User) {
  ensurePlanner(db);
  return Boolean(db.prepare("SELECT 1 FROM favourites WHERE user_id = ? AND kind = 'tool' AND target_id = ?").get(user.id, TOOL_ID));
}

/** Pins the tool to Favourites, or takes it off. Only someone the card is shown to can pin it. */
export function setToolFavourite(db: Db, user: User, saved: boolean, now: Date) {
  ensurePlanner(db);
  if (!plannerEligible(db, user)) throw new HttpError(403, "This tool isn’t available to you.");
  if (saved)
    db.prepare("INSERT OR IGNORE INTO favourites (id, user_id, kind, target_id, title, saved_at) VALUES (?, ?, 'tool', ?, '', ?)").run(
      randomUUID(),
      user.id,
      TOOL_ID,
      now.toISOString(),
    );
  else db.prepare("DELETE FROM favourites WHERE user_id = ? AND kind = 'tool' AND target_id = ?").run(user.id, TOOL_ID);
  return { saved: toolFavourite(db, user) };
}

/** What the page needs first: the person's access and whether the tool is in their Favourites. */
export function plannerHome(db: Db, user: User) {
  const access = plannerAccess(db, user);
  return {
    access,
    eligible: plannerEligible(db, user),
    saved: toolFavourite(db, user),
    plans: access ? listPlans(db, user).plans : [],
    versions: { model: MODEL_VERSION, planner: PLANNER_VERSION },
  };
}
