import "server-only";
import { isDate } from "@/lib/sahRules";
import { contentRefs, OUTCOMES, REVIEWERS, STAGES, type AvailMap, type Outcome, type Reviewer, type Stage } from "@/lib/shadowCoach";
import { MAYA_SHADOW } from "@/content/shadowCoachCases";
import {
  DATA_SOURCES,
  DEFINED_TASKS,
  DEMO_HIRES,
  DEMO_NOTICE,
  PROCESS_THEMES,
  ROLE_MATRIX,
  STAGE_CHECKS,
  type DemoHire,
  type ProcessTheme,
} from "@/content/shadowCoachDemo";
import { tx, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { plannerAccess } from "./caseloadPlanner";
import { publishedShadowBlocks, resolveContent } from "./shadowCoach";

/*
  The First 100 Days coaching workbench (docs/shadow-and-coach.md, "The workbench"): a staged shell over DEMO DATA ONLY.

  - Who: the business planner access (plannerAccess, as for Plan my business and the 28-Day Trust Check): the owner
    and the members they've authorised. Anyone else, a coordinator, Trilogy staff and authors included, gets
    `access: null` and nothing more. The workbench belongs to one business and is only read within it.
  - What it reads: content/shadowCoachDemo.ts, the live catalogue (to offer only current, approved content) and its
    own tables. Nothing else. DATA_SOURCES lists the real sources a pilot would need, each `connected: false`.
  - What it holds: ids, codes and dates. There is no free-text field, no score and no ranking: nothing a manager could
    turn into a performance or disciplinary record. Unknown fields (a "score", a "rank", a note) are dropped.
  - What it guards: only current approved content can be assigned; an observation is against a defined task; a
    sign-off that needs a reviewer needs that reviewer requested first. A QA or incident reference is read-only.
  - Saves are versioned and idempotent: a resent save with the same key returns the version it made, and an unchanged
    save makes no new version.
  - The coordinator's view is a projection: her assigned items and the observations shared with her. Never reviewer
    requests, process issues, other hires or a scenario's answer key.
*/

export const TOOL_ID = "first-100-days";
export const TOOL_HREF = `/tools/${TOOL_ID}`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shadow_workbench_versions (
  org_id TEXT NOT NULL, number INTEGER NOT NULL, state TEXT NOT NULL, saved_by TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (org_id, number)
);
CREATE TABLE IF NOT EXISTS shadow_workbench_saves (org_id TEXT NOT NULL, idem TEXT NOT NULL, number INTEGER NOT NULL, PRIMARY KEY (org_id, idem));
CREATE TABLE IF NOT EXISTS shadow_tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, org_id TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, idem TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS shadow_tool_events_idem ON shadow_tool_events (user_id, idem) WHERE idem IS NOT NULL;
`;
const ready = new WeakSet<object>();
export function ensureShadowTool(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

export type Observation = { task: string; outcome: Outcome; date: string; shared: boolean };
export type HireState = {
  stage: Stage;
  checks: string[];
  learning: string[];
  observations: Observation[];
  reviewers: Reviewer[];
  processIssues: ProcessTheme[];
};
export type Workbench = { hires: Record<string, HireState> };

const idemOf = (v: unknown) => (typeof v === "string" && /^[\w-]{8,80}$/.test(v) ? v : null);
const CHECK_IDS = new Set(Object.values(STAGE_CHECKS).flatMap((l) => l.map((c) => c.id)));
const seedOf = (h: DemoHire): HireState => ({
  stage: h.stage,
  checks: [...h.seed.checks],
  learning: [],
  observations: h.seed.observations.map((o) => ({ ...o })),
  reviewers: [],
  processIssues: [],
});

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "The First 100 Days workbench is for the business owner and the people they’ve authorised.");
  ensureShadowTool(db);
  return a;
}

/** The content a manager can assign: the practice's suggested Topics, Magazine pages and Job Aids, resolved live. */
export function assignable(db: Db, user: User, now: Date) {
  const fit = new Map(MAYA_SHADOW.scenarios.flatMap((sc) => sc.suggestions.map((x) => [x.id, x.fit])));
  const refs = contentRefs(MAYA_SHADOW)
    .filter((r) => fit.get(r.suggestion) !== "risk")
    .filter((r, i, all) => all.findIndex((x) => x.ref.type === r.ref.type && x.ref.id === r.ref.id) === i);
  const avail: AvailMap = resolveContent(
    db,
    user,
    refs.map((r) => ({ suggestion: `${r.ref.type}:${r.ref.id}`, ref: r.ref, label: r.label })),
    now,
  );
  return refs.map((r) => {
    const key = `${r.ref.type}:${r.ref.id}`;
    const a = avail[key];
    return { key, type: r.ref.type, label: a?.title || r.label, status: a?.status ?? "missing", version: a?.version ?? "", href: a?.href ?? "" };
  });
}

/**
  A workbench state, checked: demo hires only, codes from fixed lists, dates, and only current approved content.
  Anything else is refused with the reason; unknown fields are dropped.
*/
export function cleanWorkbench(raw: unknown, current: Set<string>): Workbench {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hires = (o.hires && typeof o.hires === "object" ? o.hires : {}) as Record<string, unknown>;
  const out: Record<string, HireState> = {};
  for (const [id, v] of Object.entries(hires)) {
    const hire = DEMO_HIRES.find((x) => x.id === id);
    if (!hire) throw new HttpError(400, "Only the demo hires can be worked here until Trilogy Care approves the data sources.");
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const seed = seedOf(hire);
    const list = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === "string"))] : null);
    const stage = r.stage === undefined ? seed.stage : r.stage;
    if (typeof stage !== "string" || !(stage in STAGES)) throw new HttpError(400, "That isn’t a stage of the First 100 Days.");
    const checks = list(r.checks) ?? seed.checks;
    if (checks.some((c) => !CHECK_IDS.has(c))) throw new HttpError(400, "Only the framework’s checks can be ticked.");
    const learning = list(r.learning) ?? [];
    for (const k of learning)
      if (!current.has(k))
        throw new HttpError(409, "Only current approved content can be assigned. If nothing suitable exists, an author review is the route, not a new lesson.");
    const reviewers = (list(r.reviewers) ?? []) as Reviewer[];
    if (reviewers.some((x) => !(x in REVIEWERS))) throw new HttpError(400, "That isn’t a reviewer the workbench can refer to.");
    const processIssues = (list(r.processIssues) ?? []) as ProcessTheme[];
    if (processIssues.some((x) => !PROCESS_THEMES.some((t) => t.id === x))) throw new HttpError(400, "That isn’t one of the process themes.");
    const rawObs = Array.isArray(r.observations) ? r.observations.slice(0, 20) : seed.observations;
    const observations: Observation[] = rawObs.map((x) => {
      const ob = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const task = DEFINED_TASKS.find((t) => t.id === ob.task);
      if (!task) throw new HttpError(400, "An observation is always against a defined task.");
      if (typeof ob.outcome !== "string" || !(ob.outcome in OUTCOMES)) throw new HttpError(400, "That isn’t an observation outcome.");
      if (!isDate(ob.date)) throw new HttpError(400, "An observation needs its date.");
      if (ob.outcome === "signoff" && task.reviewer && !reviewers.includes(task.reviewer))
        throw new HttpError(409, `Signing off “${task.label}” needs the ${REVIEWERS[task.reviewer]} requested first.`);
      return { task: task.id, outcome: ob.outcome as Outcome, date: ob.date, shared: ob.shared === true };
    });
    const next: HireState = { stage: stage as Stage, checks, learning, observations, reviewers, processIssues };
    if (JSON.stringify(next) !== JSON.stringify(seed)) out[id] = next;
  }
  return { hires: out };
}

/** The demo as the manager sees it: each hire with evidence and outstanding checks. No score, no rank, start-date order. */
export function demoView(w: Workbench = { hires: {} }) {
  return {
    hires: [...DEMO_HIRES]
      .sort((a, b) => a.started.localeCompare(b.started))
      .map((h) => {
        const st = w.hires[h.id] ?? seedOf(h);
        return {
          id: h.id,
          label: h.label,
          role: h.role,
          started: h.started,
          stage: st.stage,
          stageLabel: STAGES[st.stage],
          nextMeeting: h.nextMeeting,
          references: h.references,
          evidence: STAGE_CHECKS[st.stage].map((c) => ({ id: c.id, label: c.label, done: st.checks.includes(c.id) })),
          earlier: (Object.keys(STAGE_CHECKS) as Stage[])
            .filter((s) => Object.keys(STAGES).indexOf(s) < Object.keys(STAGES).indexOf(st.stage))
            .flatMap((s) => STAGE_CHECKS[s].filter((c) => !st.checks.includes(c.id)).map((c) => ({ id: c.id, label: c.label }))),
          learning: st.learning,
          observations: st.observations.map((o) => ({
            ...o,
            taskLabel: DEFINED_TASKS.find((t) => t.id === o.task)?.label ?? o.task,
            outcomeLabel: OUTCOMES[o.outcome],
          })),
          reviewers: st.reviewers.map((r) => ({ id: r, label: REVIEWERS[r] })),
          processIssues: st.processIssues.map((p) => ({ id: p, label: PROCESS_THEMES.find((t) => t.id === p)?.label ?? p })),
        };
      }),
  };
}

/**
  What the coordinator would see (PRD criterion 9): her own stage, assigned items and the observations shared with
  her. Never reviewer requests, process issues, unshared observations, other hires or a scenario's answer key.
*/
export function coordinatorView(w: Workbench, hireId: string, catalogue: ReturnType<typeof assignable>) {
  const h = DEMO_HIRES.find((x) => x.id === hireId);
  if (!h) throw new HttpError(404, "That hire isn’t here.");
  const st = w.hires[h.id] ?? seedOf(h);
  return {
    hire: { id: h.id, label: h.label, role: h.role, stage: STAGES[st.stage] },
    learning: st.learning.map((k) => catalogue.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c && c.status === "current")),
    feedback: st.observations
      .filter((o) => o.shared)
      .map((o) => ({ task: DEFINED_TASKS.find((t) => t.id === o.task)?.label ?? o.task, outcome: OUTCOMES[o.outcome], date: o.date })),
    nextMeeting: h.nextMeeting,
  };
}

type VersionRow = { org_id: string; number: number; state: string; saved_by: string; saved_at: string };
const versionsOf = (db: Db, org: string) => db.prepare("SELECT * FROM shadow_workbench_versions WHERE org_id = ? ORDER BY number").all(org) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";
const currentKeys = (cat: ReturnType<typeof assignable>) => new Set(cat.filter((c) => c.status === "current").map((c) => c.key));
/** Stored states are re-read leniently: content that has since been withdrawn drops out rather than breaking the page. */
const reread = (raw: string, cat: ReturnType<typeof assignable>): Workbench => {
  const w = JSON.parse(raw) as Workbench;
  const keys = currentKeys(cat);
  for (const h of Object.values(w.hires ?? {})) h.learning = (h.learning ?? []).filter((k) => keys.has(k));
  return cleanWorkbench(w, keys);
};

export type ShadowToolHome = {
  access: { orgName: string; role: string };
  notice: string;
  dataSources: typeof DATA_SOURCES;
  roleMatrix: typeof ROLE_MATRIX;
  stages: { id: Stage; label: string }[];
  tasks: typeof DEFINED_TASKS;
  themes: typeof PROCESS_THEMES;
  reviewers: { id: Reviewer; label: string }[];
  outcomes: { id: Outcome; label: string }[];
  catalogue: ReturnType<typeof assignable>;
  /** The published fictional practice, if there is one: "Practise coaching" opens it. */
  practice: { href: string; title: string } | null;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string }[];
  state: Workbench;
  /** Every demo hire's full state (saved, or the demo's starting point), for the page to edit. */
  hireStates: Record<string, HireState>;
  stageChecks: typeof STAGE_CHECKS;
  demo: ReturnType<typeof demoView>;
};

/** Whether this person may use the workbench, and if so the demo and their business's saved version. Nothing for anyone else. */
export function toolHome(db: Db, user: User, now: Date, version?: unknown): { access: null; notice: string } | ShadowToolHome {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, notice: DEMO_NOTICE };
  ensureShadowTool(db);
  const catalogue = assignable(db, user, now);
  const versions = versionsOf(db, a.orgId);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  const state = chosen ? reread(chosen.state, catalogue) : { hires: {} };
  return {
    access: { orgName: a.orgName, role: a.role },
    notice: DEMO_NOTICE,
    dataSources: DATA_SOURCES,
    roleMatrix: ROLE_MATRIX,
    stages: (Object.keys(STAGES) as Stage[]).map((id) => ({ id, label: STAGES[id] })),
    tasks: DEFINED_TASKS,
    themes: PROCESS_THEMES,
    reviewers: (Object.keys(REVIEWERS) as Reviewer[]).map((id) => ({ id, label: REVIEWERS[id] })),
    outcomes: (Object.keys(OUTCOMES) as Outcome[]).map((id) => ({ id, label: OUTCOMES[id] })),
    catalogue,
    practice: (() => {
      const p = publishedShadowBlocks(db)[0];
      return p ? { href: `/magazine/${p.guide.slug}`, title: p.guide.title } : null;
    })(),
    version: chosen?.number ?? 0,
    versions: versions.map((v) => ({ number: v.number, savedAt: v.saved_at, savedBy: nameOf(db, v.saved_by) })),
    state,
    hireStates: Object.fromEntries(DEMO_HIRES.map((h) => [h.id, state.hires[h.id] ?? seedOf(h)])),
    stageChecks: STAGE_CHECKS,
    demo: demoView(state),
  };
}

/** Saves the next version. Idempotent by key; an unchanged save makes no new version. */
export function saveWorkbench(db: Db, user: User, input: { state?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const idem = idemOf(input.idem);
  if (!idem) throw new HttpError(400, "A save needs its key, so a retry can’t save twice.");
  const catalogue = assignable(db, user, now);
  const state = cleanWorkbench(input.state, currentKeys(catalogue));
  return tx(db, () => {
    const done = db.prepare("SELECT number FROM shadow_workbench_saves WHERE org_id = ? AND idem = ?").get(a.orgId, idem) as { number: number } | undefined;
    if (done) return { ...(toolHome(db, user, now, done.number) as ShadowToolHome), replayed: true };
    const last = versionsOf(db, a.orgId).at(-1);
    if (last && JSON.stringify(reread(last.state, catalogue)) === JSON.stringify(state)) {
      db.prepare("INSERT INTO shadow_workbench_saves (org_id, idem, number) VALUES (?, ?, ?)").run(a.orgId, idem, last.number);
      return { ...(toolHome(db, user, now, last.number) as ShadowToolHome), unchanged: true };
    }
    if (!last && !Object.keys(state.hires).length) throw new HttpError(400, "Nothing has changed from the demo yet.");
    const number = (last?.number ?? 0) + 1;
    db.prepare("INSERT INTO shadow_workbench_versions (org_id, number, state, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)").run(
      a.orgId,
      number,
      JSON.stringify(state),
      user.id,
      now.toISOString(),
    );
    db.prepare("INSERT INTO shadow_workbench_saves (org_id, idem, number) VALUES (?, ?, ?)").run(a.orgId, idem, number);
    return toolHome(db, user, now, number) as ShadowToolHome;
  });
}

/** The coordinator's view of one demo hire, for the manager to preview. */
export function previewCoordinator(db: Db, user: User, hireId: unknown, now: Date) {
  const a = requireBusiness(db, user);
  const catalogue = assignable(db, user, now);
  const last = versionsOf(db, a.orgId).at(-1);
  return coordinatorView(last ? reread(last.state, catalogue) : { hires: {} }, typeof hireId === "string" ? hireId : "", catalogue);
}

/** The workbench's events, for the business's own use: an event name and a demo id. Never typed words. */
const TOOL_EVENTS = ["first100_opened", "hire_viewed", "coordinator_view_previewed", "practice_opened"] as const;
export function logToolEvent(db: Db, user: User, input: { event?: unknown; ref?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const event = TOOL_EVENTS.find((e) => e === input.event);
  if (!event) throw new HttpError(400, "That isn’t one of the workbench’s events.");
  const ref = typeof input.ref === "string" && /^[a-z0-9-]{1,40}$/.test(input.ref) ? input.ref : "";
  db.prepare("INSERT OR IGNORE INTO shadow_tool_events (at, org_id, user_id, event, detail, idem) VALUES (?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.orgId,
    user.id,
    event,
    JSON.stringify({ ref, mode: "demo" }),
    idemOf(input.idem),
  );
  return { ok: true };
}
