import "server-only";
import { randomUUID } from "node:crypto";
import { BLOCK_LABELS, type BlockType } from "@/lib/magazine";
import {
  BARRIERS,
  BLOCK_REGISTRY,
  contractFor,
  coverage,
  EVIDENCE,
  PLAN_STEPS,
  recommend,
  type Barrier,
  type Brief,
  type Rationale,
} from "@/lib/blockRegistry";
import {
  ACTION_KINDS,
  ACTION_STATUS,
  assetLink,
  CONFIDENCE,
  countCases,
  emptyDiagnosis,
  emptyResponse,
  EVENT_KINDS,
  LEARNING_DECISIONS,
  learnerHours,
  caseOpen,
  ratePer100,
  reportLink,
  responseProblems,
  RESULTS,
  REVIEW_DECISIONS,
  RISK,
  SOURCES,
  THEME_STATUS,
  trend,
  workingStatement,
  type ActionKind,
  type ActionStatus,
  type Case,
  type Confidence,
  type Diagnosis,
  type EventKind,
  type LearningDecision,
  type MetricPoint,
  type ResponseData,
  type ResultStatus,
  type ReviewDecision,
  type Risk,
  type SourceKind,
  type ThemeStatus,
} from "@/lib/problemDesk";
import { PILOT_THEMES, PILOT_UNGROUPED } from "@/content/problemPilot";
import { audit, ensureProblemTables, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { createGuide } from "./magazine";
import { searchCatalogue } from "./discovery";
import { workbook, type Sheet } from "./xlsx";

/*
  The Problem desk (docs/learning-designer.md). Everything here is for learning authors (Partner Enablement and
  the Trilogy Care reviewers they work with). Care Partner businesses never see it.

  What it won't do: acknowledge, resolve or close a real complaint or incident; alter approved content; assign
  anything to anyone; or decide what caused a problem. Groupings and barriers are a person's, recorded with how
  sure they are. A theme can be closed with no training at all.
*/

type ThemeRow = {
  id: string;
  title: string;
  description: string;
  status: ThemeStatus;
  risk: Risk;
  roles: string;
  segment: string;
  denominator: number | null;
  denominator_note: string;
  verified_by: string | null;
  verified_at: string | null;
  owner: string;
  priority_note: string;
  status_note: string;
  diagnosis: string;
  sample: number;
  merged_into: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type CaseRow = {
  id: string;
  theme_id: string | null;
  source: SourceKind;
  source_ref: string;
  summary: string;
  link: string;
  false_match: number;
  created_at: string;
};
type EventRow = { id: string; case_id: string; kind: EventKind; on_date: string; note: string; recorded_at: string };
type ActionRow = {
  id: string;
  theme_id: string;
  prior: number;
  kind: ActionKind;
  title: string;
  owner: string;
  audience: string;
  asset_kind: string;
  asset_ref: string;
  asset_version: string;
  intended: string;
  on_date: string;
  due_date: string;
  status: ActionStatus;
  result: ResultStatus | "";
  interpretation: string;
  snapshot: string;
  snapshot_at: string;
  work_link: string;
  created_at: string;
};
type StepRow = {
  id: string;
  theme_id: string;
  position: number;
  step: keyof typeof PLAN_STEPS;
  block_type: string;
  rationale: string;
  alternatives: string;
  needs: string;
  status: string;
  override_reason: string;
};
type ResponseRow = {
  theme_id: string;
  data: string;
  status: "draft" | "approved";
  approved_by: string | null;
  approved_at: string | null;
  guide_id: string | null;
  updated_at: string;
};

const id = (p: string) => `${p}-${randomUUID().slice(0, 10)}`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const month = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "");
const pick = <R extends Record<string, unknown>>(v: unknown, all: R, d: keyof R & string): keyof R & string => (typeof v === "string" && v in all ? v : d);
/** A link out of the Hub is kept only if it's an https address or a Hub path. */
const link = (v: unknown) =>
  typeof v === "string" && (/^https:\/\/[^\s]+$/.test(v.trim()) || /^\/[\w\-/?=&.]*$/.test(v.trim())) ? v.trim().slice(0, 400) : "";
const num = (v: unknown, max = 1e9) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Number(v)) : 0);

function hist(db: Db, themeId: string, actor: User, action: string, detail: string, now: Date) {
  db.prepare("INSERT INTO pd_history (theme_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?)").run(
    themeId,
    now.toISOString(),
    actor.id,
    action,
    detail.slice(0, 400),
  );
}

// ---------------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------------

const seeded = new WeakSet<object>();
/** The tables, with the fictional pilot added once per Hub. Deleting a sample theme doesn't bring it back. */
export function ensureProblems(db: Db, now = new Date()) {
  ensureProblemTables(db);
  if (seeded.has(db)) return;
  seeded.add(db);
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'problem_desk_seed'").get()) return;
  const at = now.toISOString();
  const addCase = (themeId: string | null, c: (typeof PILOT_UNGROUPED)[number]) => {
    const caseId = id("case");
    db.prepare(
      "INSERT OR IGNORE INTO pd_cases (id, theme_id, source, source_ref, summary, link, false_match, created_at) VALUES (?, ?, ?, ?, ?, '', ?, ?)",
    ).run(caseId, themeId, c.source, c.ref, c.summary, c.falseMatch ? 1 : 0, at);
    for (const [kind, on, note] of c.events)
      db.prepare("INSERT INTO pd_case_events (id, case_id, kind, on_date, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id("ev"),
        caseId,
        kind,
        on,
        note,
        at,
      );
  };
  tx(db, () => {
    for (const t of PILOT_THEMES) {
      db.prepare(
        `INSERT OR IGNORE INTO pd_themes (id, title, description, status, risk, roles, segment, denominator, denominator_note, verified_by, verified_at, owner, priority_note, status_note, diagnosis, sample, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'seed', ?, ?)`,
      ).run(
        t.id,
        t.title,
        t.description,
        t.status,
        t.risk,
        t.roles,
        t.segment,
        t.denominator,
        t.denominatorNote,
        t.verified ? "seed" : null,
        t.verified ? at : null,
        t.owner,
        t.priorityNote,
        t.statusNote,
        JSON.stringify(t.diagnosis ?? emptyDiagnosis()),
        at,
        at,
      );
      for (const c of t.cases) addCase(t.id, c);
      if (t.response)
        db.prepare("INSERT OR IGNORE INTO pd_responses (theme_id, data, status, created_by, created_at, updated_at) VALUES (?, ?, 'draft', 'seed', ?, ?)").run(
          t.id,
          JSON.stringify(t.response),
          at,
          at,
        );
      for (const a of t.actions ?? []) {
        // Link the Topic only if this Hub has it; otherwise the action stands without an asset.
        const has = a.topic && db.prepare("SELECT 1 FROM authored_lessons WHERE slug = ?").get(a.topic);
        db.prepare(
          `INSERT INTO pd_actions (id, theme_id, prior, kind, title, owner, audience, asset_kind, asset_ref, intended, on_date, due_date, status, result, interpretation, snapshot, snapshot_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id("act"),
          t.id,
          a.prior ? 1 : 0,
          a.kind,
          a.title,
          a.owner,
          a.audience,
          has ? "topic" : "",
          has ? a.topic! : "",
          a.intended,
          a.on,
          a.due,
          a.status,
          a.result,
          a.interpretation,
          a.snapshot,
          a.snapshotAt,
          at,
        );
      }
      for (const m of t.metrics ?? [])
        db.prepare(
          "INSERT OR IGNORE INTO pd_metric_points (id, theme_id, metric, bucket, numerator, denominator, note, as_at, link, by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'seed')",
        ).run(id("mp"), t.id, m.metric, m.bucket, m.numerator, m.denominator, m.note, at);
    }
    for (const c of PILOT_UNGROUPED) addCase(null, c);
    db.prepare("INSERT INTO settings (key, value) VALUES ('problem_desk_seed', '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run();
  });
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

function casesOf(db: Db, where: string, ...args: (string | null)[]): Case[] {
  const rows = db.prepare(`SELECT * FROM pd_cases WHERE ${where} ORDER BY created_at, id`).all(...args) as CaseRow[];
  const stmt = db.prepare("SELECT * FROM pd_case_events WHERE case_id = ? ORDER BY on_date, recorded_at, rowid");
  const events = (caseId: string) => stmt.all(caseId);
  return rows.map((r) => ({
    id: r.id,
    themeId: r.theme_id,
    source: r.source,
    sourceRef: r.source_ref,
    summary: r.summary,
    link: r.link,
    falseMatch: Boolean(r.false_match),
    events: (events(r.id) as EventRow[]).map((e) => ({ id: e.id, kind: e.kind, on: e.on_date, note: e.note })),
  }));
}
const themeRow = (db: Db, themeId: unknown) =>
  typeof themeId === "string" ? (db.prepare("SELECT * FROM pd_themes WHERE id = ?").get(themeId) as ThemeRow | undefined) : undefined;
const diagnosisOf = (row: ThemeRow): Diagnosis => ({ ...emptyDiagnosis(), ...(JSON.parse(row.diagnosis) as Partial<Diagnosis>) });
const responseOf = (db: Db, themeId: string) => db.prepare("SELECT * FROM pd_responses WHERE theme_id = ?").get(themeId) as ResponseRow | undefined;
const responseData = (r: ResponseRow | undefined): ResponseData => {
  const d = r ? (JSON.parse(r.data) as Partial<ResponseData>) : {};
  const e = emptyResponse();
  return {
    ...e,
    ...d,
    measure: { ...e.measure, ...d.measure },
    baseline: { ...e.baseline, ...d.baseline },
    effort: { ...e.effort, ...d.effort },
    assignment: { ...e.assignment, ...d.assignment },
    brief: { ...e.brief, ...d.brief },
  };
};
const actionsOf = (db: Db, themeId: string) =>
  db
    .prepare("SELECT * FROM pd_actions WHERE theme_id = ? ORDER BY prior DESC, COALESCE(NULLIF(on_date, ''), NULLIF(due_date, ''), created_at), created_at")
    .all(themeId) as ActionRow[];
const metricsOf = (db: Db, themeId: string): MetricPoint[] =>
  (
    db.prepare("SELECT * FROM pd_metric_points WHERE theme_id = ? ORDER BY bucket").all(themeId) as {
      id: string;
      metric: "work" | "practice";
      bucket: string;
      numerator: number;
      denominator: number | null;
      note: string;
      as_at: string;
      link: string;
    }[]
  ).map((m) => ({
    id: m.id,
    metric: m.metric,
    bucket: m.bucket,
    numerator: m.numerator,
    denominator: m.denominator,
    note: m.note,
    asAt: m.as_at,
    link: m.link,
  }));

const today = (now: Date) => now.toISOString().slice(0, 10);
/** The window the charts cover: the twelve months up to now, unless a range is given. */
function range(input: { from?: unknown; to?: unknown }, now: Date) {
  const to = month(input.to) || today(now).slice(0, 7);
  const d = new Date(`${to}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  const from = month(input.from) || d.toISOString().slice(0, 7);
  return from <= to ? { from, to } : { from: to, to };
}

function summary(db: Db, row: ThemeRow, asAt: string) {
  const cases = casesOf(db, "theme_id = ?", row.id);
  const r = responseOf(db, row.id);
  const data = responseData(r);
  const next = (db
    .prepare(
      "SELECT title, owner, due_date FROM pd_actions WHERE theme_id = ? AND prior = 0 AND status IN ('planned', 'in_progress') ORDER BY COALESCE(NULLIF(due_date, ''), '9999') LIMIT 1",
    )
    .get(row.id) ?? null) as {
    title: string;
    owner: string;
    due_date: string;
  } | null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    risk: row.risk,
    roles: row.roles,
    owner: row.owner,
    verified: Boolean(row.verified_by),
    sample: Boolean(row.sample),
    counts: countCases(cases, asAt),
    falseMatches: cases.filter((c) => c.falseMatch).length,
    denominator: row.denominator,
    priorityNote: row.priority_note,
    learning: data.learning,
    responseStatus: r?.status ?? null,
    reviewOn: data.reviewOn,
    next,
  };
}

/** The desk: every theme with its counts, the overview measures, the trend, the safety queue and ungrouped signals. */
export function deskOverview(db: Db, actor: User, input: { status?: unknown; risk?: unknown; from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  ensureProblems(db, now);
  const asAt = today(now);
  const all = (db.prepare("SELECT * FROM pd_themes WHERE merged_into IS NULL ORDER BY updated_at DESC").all() as ThemeRow[]).map((r) => summary(db, r, asAt));
  const status = typeof input.status === "string" && input.status in THEME_STATUS ? input.status : "";
  const risk = typeof input.risk === "string" && input.risk in RISK ? input.risk : "";
  const themes = all.filter((t) => (!status || t.status === status) && (!risk || t.risk === risk));
  const cases = casesOf(db, "theme_id IN (SELECT id FROM pd_themes WHERE merged_into IS NULL)");
  const counts = countCases(cases, asAt);
  const { from, to } = range(input, now);
  const order = { safety: 0, elevated: 1, routine: 2 } as const;
  return {
    asAt,
    range: { from, to },
    // Safety first, then elevated, each by how many unique cases. The order is a starting point an owner can argue with.
    themes: [...themes].sort((a, b) => order[a.risk] - order[b.risk] || b.counts.cases - a.counts.cases),
    total: all.length,
    safety: all.filter((t) => t.risk === "safety" && t.status !== "closed"),
    measures: {
      openCases: counts.open,
      cases: counts.cases,
      repeatCases: counts.repeatCases,
      reopened: counts.reopened,
      medianDaysToClose: counts.medianDaysToClose,
      closedCases: counts.closedCases,
    },
    trend: trend(cases, from, to),
    recurring: all
      .filter((t) => t.counts.cases > 0)
      .map((t) => ({ id: t.id, title: t.title, risk: t.risk, cases: t.counts.cases, repeatCases: t.counts.repeatCases })),
    ungrouped: casesOf(db, "theme_id IS NULL"),
  };
}

function briefOf(row: ThemeRow, d: Diagnosis, r: ResponseData): Brief {
  return {
    signal: row.title,
    behaviour: d.desired || r.desired,
    barriers: d.barriers.map((b) => ({ barrier: b.barrier, confidence: b.confidence })),
    minutes: r.effort.learnerMinutes || 10,
    hasArtefact: r.brief.hasArtefact,
    hasSource: r.brief.hasSource,
    assessed: r.brief.assessed,
  };
}

const actionView = (a: ActionRow) => ({
  id: a.id,
  prior: Boolean(a.prior),
  kind: a.kind,
  title: a.title,
  owner: a.owner,
  audience: a.audience,
  assetKind: a.asset_kind,
  assetRef: a.asset_ref,
  assetVersion: a.asset_version,
  assetLink: assetLink(a.asset_kind, a.asset_ref),
  /** The Hub's current scored report for the asset, if it has one. Null means "No linked report yet". */
  reportLink: reportLink(a.asset_kind, a.asset_ref),
  intended: a.intended,
  on: a.on_date,
  due: a.due_date,
  status: a.status,
  result: a.result,
  interpretation: a.interpretation,
  snapshot: a.snapshot,
  snapshotAt: a.snapshot_at,
  workLink: a.work_link,
});

/** One theme, with everything on its trail. */
export function themeDetail(db: Db, actor: User, themeId: unknown, input: { from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  ensureProblems(db, now);
  const row = themeRow(db, themeId);
  if (!row) throw new HttpError(404, "That theme isn’t on the Problem desk.");
  const asAt = today(now);
  const cases = casesOf(db, "theme_id = ?", row.id);
  const d = diagnosisOf(row);
  const r = responseOf(db, row.id);
  const data = responseData(r);
  const actions = actionsOf(db, row.id).map(actionView);
  const steps = (db.prepare("SELECT * FROM pd_plan_steps WHERE theme_id = ? AND status != 'removed' ORDER BY position").all(row.id) as StepRow[]).map((s) => {
    const contract = contractFor(s.block_type);
    return {
      id: s.id,
      step: s.step,
      stepLabel: PLAN_STEPS[s.step] ?? s.step,
      blockType: s.block_type,
      label: BLOCK_LABELS[s.block_type as BlockType] ?? s.block_type,
      rationale: JSON.parse(s.rationale) as Rationale,
      alternatives: (JSON.parse(s.alternatives) as string[]).map((t) => ({ type: t, label: BLOCK_LABELS[t as BlockType] ?? t })),
      needs: JSON.parse(s.needs) as string[],
      status: s.status,
      overrideReason: s.override_reason,
      evidence: contract ? EVIDENCE[contract.evidence] : "",
      minutes: contract?.minutes ?? 0,
      signoff: contract?.signoff ?? "",
      inputs: contract?.inputs ?? [],
    };
  });
  const brief = briefOf(row, d, data);
  let matches: { kind: string; ref: string; title: string; summary: string }[] = [];
  try {
    const q = d.desired || row.title;
    matches = searchCatalogue(db, actor, { q })
      .items.slice(0, 6)
      .map((i) => ({ kind: i.kind, ref: i.ref, title: i.title, summary: i.summary }));
  } catch {
    // The catalogue not being readable is a gap to show, not a reason to fail the page.
  }
  const { from, to } = range(input, now);
  const guide = r?.guide_id
    ? (db.prepare("SELECT id, title, status FROM magazine_guides WHERE id = ?").get(r.guide_id) as { id: string; title: string; status: string } | undefined)
    : undefined;
  return {
    asAt,
    range: { from, to },
    theme: {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      statusNote: row.status_note,
      risk: row.risk,
      roles: row.roles,
      segment: row.segment,
      denominator: row.denominator,
      denominatorNote: row.denominator_note,
      owner: row.owner,
      priorityNote: row.priority_note,
      verified: Boolean(row.verified_by),
      verifiedAt: row.verified_at,
      sample: Boolean(row.sample),
      mergedInto: row.merged_into,
    },
    cases: cases.map((c) => ({ ...c, open: caseOpen(c, asAt) })),
    counts: countCases(cases, asAt),
    trend: trend(cases, from, to),
    history: db
      .prepare(
        "SELECT h.at, CASE WHEN h.actor = 'seed' THEN 'Sample data' ELSE COALESCE(u.name, h.actor) END AS actor, h.action, h.detail FROM pd_history h LEFT JOIN users u ON u.id = h.actor WHERE h.theme_id = ? ORDER BY h.id DESC LIMIT 40",
      )
      .all(row.id) as {
      at: string;
      actor: string;
      action: string;
      detail: string;
    }[],
    diagnosis: d,
    statement: workingStatement(d, (b: Barrier) => BARRIERS[b].label.toLowerCase()),
    checks: db.prepare("SELECT id, kind, ref, title, shared, missing, decision FROM pd_content_checks WHERE theme_id = ? ORDER BY at").all(row.id) as {
      id: string;
      kind: string;
      ref: string;
      title: string;
      shared: string;
      missing: string;
      decision: LearningDecision | "";
    }[],
    matches,
    actions,
    response: {
      data,
      status: r?.status ?? ("none" as const),
      approvedAt: r?.approved_at ?? null,
      problems: responseProblems(
        data,
        actions.some((a) => !a.prior),
      ),
      learnerHours: learnerHours(data.audienceSize, data.effort.learnerMinutes),
      guide: guide ?? null,
    },
    plan: {
      steps,
      coverage: coverage(
        steps.map((s) => ({ type: s.blockType, step: s.step })),
        brief,
      ),
      preview: steps.length ? null : recommend(brief, BLOCK_LABELS),
    },
    metrics: metricsOf(db, row.id).map((m) => ({ ...m, rate: ratePer100(m) })),
    reviews: db
      .prepare("SELECT id, decided_on AS decidedOn, decision, evidence, uncertainties FROM pd_reviews WHERE theme_id = ? ORDER BY decided_on DESC")
      .all(row.id) as {
      id: string;
      decidedOn: string;
      decision: ReviewDecision;
      evidence: string;
      uncertainties: string;
    }[],
    otherThemes: db.prepare("SELECT id, title FROM pd_themes WHERE id != ? AND merged_into IS NULL ORDER BY title").all(row.id) as {
      id: string;
      title: string;
    }[],
    blocks: BLOCK_REGISTRY.map((b) => ({ type: b.type, label: BLOCK_LABELS[b.type], purpose: b.purpose, minutes: b.minutes })),
  };
}
export type ThemeDetail = ReturnType<typeof themeDetail>;
export type DeskOverview = ReturnType<typeof deskOverview>;

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

function cleanDiagnosis(raw: unknown): Diagnosis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    situation: str(o.situation, 300),
    role: str(o.role, 200),
    observed: str(o.observed, 400),
    desired: str(o.desired, 400),
    barriers: (Array.isArray(o.barriers) ? o.barriers : []).slice(0, 8).map((x, i) => {
      const b = (x ?? {}) as Record<string, unknown>;
      return {
        id: str(b.id, 40) || `b${i + 1}`,
        barrier: pick(b.barrier, BARRIERS, "knowledge"),
        text: str(b.text, 300),
        evidence: str(b.evidence, 400),
        confidence: pick(b.confidence, CONFIDENCE, "unknown") as Confidence,
        validator: str(b.validator, 120),
      };
    }),
    unknowns: str(o.unknowns, 600),
    checkedWith: str(o.checkedWith, 400),
    verified: o.verified === true,
  };
}

function cleanResponse(raw: unknown): ResponseData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sub = (k: string) => (o[k] && typeof o[k] === "object" ? o[k] : {}) as Record<string, unknown>;
  const m = sub("measure");
  const b = sub("baseline");
  const e = sub("effort");
  const a = sub("assignment");
  const br = sub("brief");
  return {
    problem: str(o.problem, 800),
    audience: str(o.audience, 300),
    audienceSize: Number.isInteger(Number(o.audienceSize)) && Number(o.audienceSize) > 0 ? Math.min(1_000_000, Number(o.audienceSize)) : null,
    desired: str(o.desired, 400),
    barrierSummary: str(o.barrierSummary, 600),
    learning: typeof o.learning === "string" && o.learning in LEARNING_DECISIONS ? (o.learning as LearningDecision) : "",
    why: str(o.why, 1000),
    measure: { name: str(m.name, 200), definition: str(m.definition, 600), owner: str(m.owner, 120), link: link(m.link) },
    baseline: { window: str(b.window, 120), note: str(b.note, 400) },
    lag: str(o.lag, 300),
    competing: str(o.competing, 400),
    reviewOn: day(o.reviewOn),
    effort: {
      authorHours: num(e.authorHours, 1000),
      reviewHours: num(e.reviewHours, 1000),
      learnerMinutes: Math.round(num(e.learnerMinutes, 600)),
      supportHours: num(e.supportHours, 1000),
      maintenance: str(e.maintenance, 300),
    },
    assignment: { required: a.required === true, roles: str(a.roles, 300), reason: str(a.reason, 400), due: day(a.due) },
    owner: str(o.owner, 120),
    brief: { hasArtefact: br.hasArtefact === true, hasSource: br.hasSource === true, assessed: br.assessed === true },
  };
}

/** Writes the recommender's steps as proposals. Steps a person has accepted or changed are kept. */
function proposePlan(db: Db, actor: User, row: ThemeRow, now: Date) {
  const d = diagnosisOf(row);
  const data = responseData(responseOf(db, row.id));
  if (!(d.desired || data.desired)) throw new HttpError(400, "Say what people should do (the desired behaviour) before planning the learning.");
  const out = recommend(briefOf(row, d, data), BLOCK_LABELS);
  db.prepare("DELETE FROM pd_plan_steps WHERE theme_id = ? AND status = 'proposed'").run(row.id);
  const kept = db.prepare("SELECT block_type, position FROM pd_plan_steps WHERE theme_id = ? AND status != 'removed'").all(row.id) as {
    block_type: string;
    position: number;
  }[];
  let pos = kept.reduce((n, k) => Math.max(n, k.position), 0);
  for (const s of out.steps) {
    if (kept.some((k) => k.block_type === s.type)) continue;
    pos += 1;
    db.prepare(
      "INSERT INTO pd_plan_steps (id, theme_id, position, step, block_type, rationale, alternatives, needs, status, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)",
    ).run(
      id("step"),
      row.id,
      pos,
      s.step,
      s.type,
      JSON.stringify(s.rationale),
      JSON.stringify(s.alternatives),
      JSON.stringify(s.needsInput),
      actor.id,
      now.toISOString(),
    );
  }
  return out.note;
}

/** Every change to the desk goes through here, one action at a time, each recorded in the theme's history. */
export function problemAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureProblems(db, now);
  const at = now.toISOString();
  const need = () => {
    const row = themeRow(db, input.id);
    if (!row) throw new HttpError(404, "That theme isn’t on the Problem desk.");
    return row;
  };
  const touch = (themeId: string) => db.prepare("UPDATE pd_themes SET updated_at = ? WHERE id = ?").run(at, themeId);
  const caseRow = (caseId: unknown) => {
    const c = typeof caseId === "string" ? (db.prepare("SELECT * FROM pd_cases WHERE id = ?").get(caseId) as CaseRow | undefined) : undefined;
    if (!c) throw new HttpError(404, "That case isn’t linked here.");
    return c;
  };

  return tx(db, () => {
    switch (input.action) {
      case "create-theme": {
        const title = str(input.title, 200);
        if (title.length < 8) throw new HttpError(400, "Describe the theme in a sentence.");
        const themeId = id("theme");
        db.prepare(
          "INSERT INTO pd_themes (id, title, description, risk, roles, segment, owner, diagnosis, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          themeId,
          title,
          str(input.description, 1200),
          pick(input.risk, RISK, "routine"),
          str(input.roles, 300),
          str(input.segment, 300),
          str(input.owner, 120),
          JSON.stringify(emptyDiagnosis()),
          actor.id,
          at,
          at,
        );
        hist(db, themeId, actor, "created", title, now);
        return { id: themeId };
      }
      case "save-theme": {
        const row = need();
        const den =
          input.denominator === null || input.denominator === "" || input.denominator === undefined
            ? null
            : Number.isInteger(Number(input.denominator)) && Number(input.denominator) > 0
              ? Number(input.denominator)
              : null;
        db.prepare(
          "UPDATE pd_themes SET title = ?, description = ?, risk = ?, roles = ?, segment = ?, denominator = ?, denominator_note = ?, owner = ?, priority_note = ?, updated_at = ? WHERE id = ?",
        ).run(
          str(input.title, 200) || row.title,
          str(input.description, 1200),
          pick(input.risk, RISK, row.risk),
          str(input.roles, 300),
          str(input.segment, 300),
          den,
          str(input.denominatorNote, 300),
          str(input.owner, 120),
          str(input.priorityNote, 400),
          at,
          row.id,
        );
        if (pick(input.risk, RISK, row.risk) !== row.risk)
          hist(db, row.id, actor, "risk", `${RISK[row.risk]} → ${RISK[pick(input.risk, RISK, row.risk)]}`, now);
        return { id: row.id };
      }
      case "set-status": {
        const row = need();
        const status = pick(input.status, THEME_STATUS, row.status);
        const note = str(input.note, 600);
        // Closing, or saying it's already dealt with, needs the evidence in words. Training is never required to close.
        if ((status === "closed" || status === "addressed") && note.length < 10) throw new HttpError(400, "Say what the evidence is, in a sentence or two.");
        if (row.risk === "safety" && status === "monitor" && note.length < 10)
          throw new HttpError(400, "A safety theme can’t just be watched: say who has acted and how.");
        db.prepare("UPDATE pd_themes SET status = ?, status_note = ?, updated_at = ? WHERE id = ?").run(status, note, at, row.id);
        hist(db, row.id, actor, "status", `${THEME_STATUS[row.status]} → ${THEME_STATUS[status]}${note ? `: ${note}` : ""}`, now);
        return { id: row.id };
      }
      case "verify": {
        const row = need();
        const on = input.on === true;
        db.prepare("UPDATE pd_themes SET verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(on ? actor.id : null, on ? at : null, at, row.id);
        hist(db, row.id, actor, on ? "verified" : "unverified", "", now);
        return { id: row.id };
      }
      case "add-case": {
        const themeId = input.themeId ? need().id : null;
        const source = pick(input.source, SOURCES, "complaint");
        const ref = str(input.sourceRef, 80);
        const on = day(input.on);
        if (!ref || !on) throw new HttpError(400, "Give the source record’s reference and the date it was first reported.");
        // The same source record is one case, however many times it comes up: say where it already is.
        const had = db
          .prepare("SELECT c.id, c.theme_id, t.title FROM pd_cases c LEFT JOIN pd_themes t ON t.id = c.theme_id WHERE c.source = ? AND c.source_ref = ?")
          .get(source, ref) as { id: string; theme_id: string | null; title: string | null } | undefined;
        if (had)
          throw new HttpError(
            409,
            `${SOURCES[source]} ${ref} is already linked${had.title ? ` to “${had.title}”` : " (not yet grouped)"}. Add a follow-up to that case instead.`,
          );
        const caseId = id("case");
        db.prepare("INSERT INTO pd_cases (id, theme_id, source, source_ref, summary, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          caseId,
          themeId,
          source,
          ref,
          str(input.summary, 600),
          link(input.link),
          at,
        );
        db.prepare("INSERT INTO pd_case_events (id, case_id, kind, on_date, note, recorded_at) VALUES (?, ?, 'initial', ?, ?, ?)").run(
          id("ev"),
          caseId,
          on,
          str(input.note, 300),
          at,
        );
        if (themeId) {
          hist(db, themeId, actor, "case-added", `${SOURCES[source]} ${ref}`, now);
          touch(themeId);
        }
        return { caseId };
      }
      case "add-event": {
        const c = caseRow(input.caseId);
        const kind = pick(input.kind, EVENT_KINDS, "update");
        const on = day(input.on);
        if (!on) throw new HttpError(400, "Give the date it happened.");
        if (kind === "initial") throw new HttpError(400, "A case has one initial report. Record a follow-up instead.");
        const mine = casesOf(db, "id = ?", c.id)[0];
        const open = caseOpen(mine, on);
        // A reopening only counts if the case was closed; otherwise it's a follow-up.
        if (kind === "reopen" && open) throw new HttpError(400, "This case isn’t closed on that date. Record a follow-up instead.");
        if (kind === "close" && !open) throw new HttpError(400, "This case is already closed on that date.");
        db.prepare("INSERT INTO pd_case_events (id, case_id, kind, on_date, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          id("ev"),
          c.id,
          kind,
          on,
          str(input.note, 300),
          at,
        );
        if (c.theme_id) touch(c.theme_id);
        return { caseId: c.id };
      }
      case "move-case": {
        const c = caseRow(input.caseId);
        const to = input.themeId ? themeRow(db, input.themeId) : null;
        if (input.themeId && !to) throw new HttpError(404, "That theme isn’t on the Problem desk.");
        db.prepare("UPDATE pd_cases SET theme_id = ?, false_match = 0 WHERE id = ?").run(to?.id ?? null, c.id);
        if (c.theme_id) hist(db, c.theme_id, actor, "case-moved-out", `${SOURCES[c.source]} ${c.source_ref}${to ? ` → “${to.title}”` : " → ungrouped"}`, now);
        if (to) hist(db, to.id, actor, "case-moved-in", `${SOURCES[c.source]} ${c.source_ref}`, now);
        return { caseId: c.id };
      }
      case "false-match": {
        const c = caseRow(input.caseId);
        db.prepare("UPDATE pd_cases SET false_match = ? WHERE id = ?").run(input.on === true ? 1 : 0, c.id);
        if (c.theme_id) hist(db, c.theme_id, actor, input.on === true ? "false-match" : "match-restored", `${SOURCES[c.source]} ${c.source_ref}`, now);
        return { caseId: c.id };
      }
      case "merge": {
        const row = need();
        const into = themeRow(db, input.into);
        const reason = str(input.reason, 400);
        if (!into || into.id === row.id) throw new HttpError(400, "Choose the theme to merge into.");
        if (reason.length < 10) throw new HttpError(400, "Say why these are the same problem.");
        // A safety theme keeps its own entry: a merge could bury it under a common, low-risk one.
        if (row.risk === "safety" && into.risk !== "safety")
          throw new HttpError(400, "A safety theme can’t be merged into a lower-risk one. Keep it separate, or raise the other theme’s risk first.");
        db.prepare("UPDATE pd_cases SET theme_id = ? WHERE theme_id = ?").run(into.id, row.id);
        db.prepare("UPDATE pd_themes SET merged_into = ?, updated_at = ? WHERE id = ?").run(into.id, at, row.id);
        hist(db, row.id, actor, "merged-into", `“${into.title}”: ${reason}`, now);
        hist(db, into.id, actor, "merged-from", `“${row.title}”: ${reason}`, now);
        touch(into.id);
        return { id: into.id };
      }
      case "split": {
        const row = need();
        const title = str(input.title, 200);
        const ids = (Array.isArray(input.caseIds) ? input.caseIds : []).filter((x): x is string => typeof x === "string");
        if (title.length < 8 || !ids.length) throw new HttpError(400, "Name the new theme and choose the cases that belong to it.");
        const themeId = id("theme");
        db.prepare(
          "INSERT INTO pd_themes (id, title, description, risk, roles, segment, owner, diagnosis, created_by, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(themeId, title, row.risk, row.roles, row.segment, row.owner, JSON.stringify(emptyDiagnosis()), actor.id, at, at);
        let moved = 0;
        for (const cid of ids) moved += Number(db.prepare("UPDATE pd_cases SET theme_id = ? WHERE id = ? AND theme_id = ?").run(themeId, cid, row.id).changes);
        if (!moved) throw new HttpError(400, "None of those cases are in this theme.");
        hist(db, row.id, actor, "split", `${moved} ${moved === 1 ? "case" : "cases"} → “${title}”`, now);
        hist(db, themeId, actor, "created", `Split from “${row.title}”`, now);
        return { id: themeId };
      }
      case "save-diagnosis": {
        const row = need();
        const d = cleanDiagnosis(input.diagnosis);
        db.prepare("UPDATE pd_themes SET diagnosis = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(d), at, row.id);
        if (d.verified !== diagnosisOf(row).verified) hist(db, row.id, actor, d.verified ? "diagnosis-verified" : "diagnosis-reopened", d.checkedWith, now);
        return { id: row.id };
      }
      case "check-content": {
        const row = need();
        const kind = input.kind === "course" || input.kind === "page" ? input.kind : "topic";
        const ref = str(input.ref, 120);
        if (!/^[\w-]+$/.test(ref)) throw new HttpError(400, "Choose the content item.");
        const decision = typeof input.decision === "string" && input.decision in LEARNING_DECISIONS ? input.decision : "";
        db.prepare(
          `INSERT INTO pd_content_checks (id, theme_id, kind, ref, title, shared, missing, decision, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (theme_id, kind, ref) DO UPDATE SET shared = excluded.shared, missing = excluded.missing, decision = excluded.decision, by_user = excluded.by_user, at = excluded.at`,
        ).run(id("chk"), row.id, kind, ref, str(input.title, 200), str(input.shared, 400), str(input.missing, 400), decision, actor.id, at);
        touch(row.id);
        return { id: row.id };
      }
      case "save-response": {
        const row = need();
        const data = cleanResponse(input.data);
        const had = responseOf(db, row.id);
        // Changing an approved decision makes it a draft again: an approval is for what was approved.
        db.prepare(
          `INSERT INTO pd_responses (theme_id, data, status, created_by, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?)
           ON CONFLICT (theme_id) DO UPDATE SET data = excluded.data, status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = excluded.updated_at`,
        ).run(row.id, JSON.stringify(data), actor.id, at, at);
        if (had?.status === "approved") hist(db, row.id, actor, "response-reopened", "Changed after approval", now);
        touch(row.id);
        return { id: row.id };
      }
      case "approve-response": {
        const row = need();
        const r = responseOf(db, row.id);
        if (!r) throw new HttpError(400, "Write the response decision first.");
        const data = responseData(r);
        const problems = responseProblems(
          data,
          actionsOf(db, row.id).some((a) => !a.prior),
        );
        if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
        db.prepare("UPDATE pd_responses SET status = 'approved', approved_by = ?, approved_at = ? WHERE theme_id = ?").run(actor.id, at, row.id);
        hist(db, row.id, actor, "response-approved", `${data.learning ? LEARNING_DECISIONS[data.learning] : ""}; review ${data.reviewOn}`, now);
        audit(db, {
          actor: actor.id,
          event: "problem.response_approved",
          entity: `theme:${row.id}`,
          next: { learning: data.learning, reviewOn: data.reviewOn, required: data.assignment.required },
          at: now,
        });
        touch(row.id);
        return { id: row.id };
      }
      case "save-action": {
        const row = need();
        const title = str(input.title, 200);
        if (title.length < 4) throw new HttpError(400, "Say what the action is.");
        const owner = str(input.owner, 120);
        const prior = input.prior === true;
        if (!prior && !owner) throw new HttpError(400, "Every action needs an owner.");
        const assetKind = input.assetKind === "topic" || input.assetKind === "course" ? input.assetKind : "";
        const assetRef = assetKind && /^[\w-]+$/.test(str(input.assetRef, 120)) ? str(input.assetRef, 120) : "";
        const result = typeof input.result === "string" && input.result in RESULTS ? input.result : "";
        const fields = [
          prior ? 1 : 0,
          pick(input.kind, ACTION_KINDS, "other"),
          title,
          owner,
          str(input.audience, 300),
          assetRef ? assetKind : "",
          assetRef,
          str(input.assetVersion, 40),
          str(input.intended, 400),
          day(input.on),
          day(input.due),
          pick(input.status, ACTION_STATUS, prior ? "done" : "planned"),
          result,
          str(input.interpretation, 600),
          str(input.snapshot, 400),
          str(input.snapshot, 400) ? day(input.snapshotAt) || today(now) : "",
          link(input.workLink),
        ];
        const actionId = str(input.actionId, 60);
        if (actionId) {
          const done = db
            .prepare(
              "UPDATE pd_actions SET prior = ?, kind = ?, title = ?, owner = ?, audience = ?, asset_kind = ?, asset_ref = ?, asset_version = ?, intended = ?, on_date = ?, due_date = ?, status = ?, result = ?, interpretation = ?, snapshot = ?, snapshot_at = ?, work_link = ? WHERE id = ? AND theme_id = ?",
            )
            .run(...fields, actionId, row.id);
          if (!done.changes) throw new HttpError(404, "That action isn’t here.");
        } else
          db.prepare(
            "INSERT INTO pd_actions (prior, kind, title, owner, audience, asset_kind, asset_ref, asset_version, intended, on_date, due_date, status, result, interpretation, snapshot, snapshot_at, work_link, id, theme_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(...fields, id("act"), row.id, at);
        touch(row.id);
        return { id: row.id };
      }
      case "remove-action": {
        const row = need();
        db.prepare("DELETE FROM pd_actions WHERE id = ? AND theme_id = ?").run(str(input.actionId, 60), row.id);
        return { id: row.id };
      }
      case "plan-generate": {
        const row = need();
        return { id: row.id, note: proposePlan(db, actor, row, now) };
      }
      case "plan-step": {
        const row = need();
        const s = db.prepare("SELECT * FROM pd_plan_steps WHERE id = ? AND theme_id = ?").get(str(input.stepId, 60), row.id) as StepRow | undefined;
        if (!s) throw new HttpError(404, "That step isn’t in the plan.");
        if (input.op === "accept") db.prepare("UPDATE pd_plan_steps SET status = 'accepted' WHERE id = ?").run(s.id);
        else if (input.op === "remove") db.prepare("UPDATE pd_plan_steps SET status = 'removed' WHERE id = ?").run(s.id);
        else if (input.op === "replace") {
          const to = contractFor(str(input.blockType, 40));
          const reason = str(input.reason, 300);
          // Only an implemented block can be chosen, and choosing against the recommendation needs a short reason.
          if (!to) throw new HttpError(400, "That isn’t a block the Hub has.");
          if (reason.length < 5) throw new HttpError(400, "Say briefly why this block suits better.");
          const d = diagnosisOf(row);
          const data = responseData(responseOf(db, row.id));
          const brief = briefOf(row, d, data);
          const again = recommend({ ...brief, barriers: brief.barriers }, BLOCK_LABELS).steps.find((x) => x.type === to.type);
          const rationale: Rationale = again?.rationale ?? {
            signal: row.title,
            behaviour: brief.behaviour,
            barrier: "Chosen by the author.",
            mechanism: `${BLOCK_LABELS[to.type]}: the learner ${to.purpose.charAt(0).toLowerCase()}${to.purpose.slice(1)}.`,
            evidence: `${EVIDENCE[to.evidence]}. ${to.completion}.`,
            needs: [...to.inputs, to.signoff ? `Sign-off: ${to.signoff}` : ""].filter(Boolean).join(". "),
            proportionate: `About ${to.minutes} minutes.`,
            uncertain: "",
          };
          db.prepare("UPDATE pd_plan_steps SET block_type = ?, rationale = ?, status = 'accepted', override_reason = ? WHERE id = ?").run(
            to.type,
            JSON.stringify(rationale),
            reason,
            s.id,
          );
        } else if (input.op === "up" || input.op === "down") {
          const all = db.prepare("SELECT id, position FROM pd_plan_steps WHERE theme_id = ? AND status != 'removed' ORDER BY position").all(row.id) as {
            id: string;
            position: number;
          }[];
          const i = all.findIndex((x) => x.id === s.id);
          const j = input.op === "up" ? i - 1 : i + 1;
          if (all[j]) {
            db.prepare("UPDATE pd_plan_steps SET position = ? WHERE id = ?").run(all[j].position, all[i].id);
            db.prepare("UPDATE pd_plan_steps SET position = ? WHERE id = ?").run(all[i].position, all[j].id);
          }
        } else throw new HttpError(400, "Unknown step action.");
        return { id: row.id };
      }
      case "plan-add": {
        const row = need();
        const to = contractFor(str(input.blockType, 40));
        if (!to) throw new HttpError(400, "That isn’t a block the Hub has.");
        const reason = str(input.reason, 300);
        const pos = ((db.prepare("SELECT MAX(position) AS p FROM pd_plan_steps WHERE theme_id = ?").get(row.id) as { p: number | null }).p ?? 0) + 1;
        const d = diagnosisOf(row);
        const rationale: Rationale = {
          signal: row.title,
          behaviour: d.desired,
          barrier: "Added by the author.",
          mechanism: `${BLOCK_LABELS[to.type]}: the learner ${to.purpose.charAt(0).toLowerCase()}${to.purpose.slice(1)}.`,
          evidence: `${EVIDENCE[to.evidence]}. ${to.completion}.`,
          needs: [...to.inputs, to.signoff ? `Sign-off: ${to.signoff}` : ""].filter(Boolean).join(". "),
          proportionate: `About ${to.minutes} minutes.`,
          uncertain: "",
        };
        db.prepare(
          "INSERT INTO pd_plan_steps (id, theme_id, position, step, block_type, rationale, alternatives, needs, status, override_reason, by_user, at) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', 'accepted', ?, ?, ?)",
        ).run(id("step"), row.id, pos, pick(input.step, PLAN_STEPS, "practise"), to.type, JSON.stringify(rationale), reason, actor.id, at);
        return { id: row.id };
      }
      case "metric": {
        const row = need();
        const bucket = month(input.bucket);
        const metric = input.metric === "practice" ? "practice" : "work";
        if (!bucket) throw new HttpError(400, "Choose the month.");
        if (!Number.isFinite(Number(input.numerator)) || Number(input.numerator) < 0) throw new HttpError(400, "Give the count for the month.");
        const den =
          input.denominator === "" || input.denominator === null || input.denominator === undefined
            ? null
            : Number(input.denominator) > 0
              ? Number(input.denominator)
              : null;
        db.prepare(
          `INSERT INTO pd_metric_points (id, theme_id, metric, bucket, numerator, denominator, note, as_at, link, by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (theme_id, metric, bucket) DO UPDATE SET numerator = excluded.numerator, denominator = excluded.denominator, note = excluded.note, as_at = excluded.as_at, link = excluded.link, by_user = excluded.by_user`,
        ).run(id("mp"), row.id, metric, bucket, Number(input.numerator), den, str(input.note, 300), at, link(input.link), actor.id);
        touch(row.id);
        return { id: row.id };
      }
      case "remove-metric": {
        const row = need();
        db.prepare("DELETE FROM pd_metric_points WHERE id = ? AND theme_id = ?").run(str(input.pointId, 60), row.id);
        return { id: row.id };
      }
      case "review": {
        const row = need();
        const r = responseOf(db, row.id);
        if (r?.status !== "approved") throw new HttpError(400, "Approve the response decision before recording a review of it.");
        const decision = pick(input.decision, REVIEW_DECISIONS, "keep");
        const evidence = str(input.evidence, 1200);
        if (evidence.length < 20) throw new HttpError(400, "Say what the evidence shows, and what it doesn’t.");
        db.prepare("INSERT INTO pd_reviews (id, theme_id, decided_on, decision, evidence, uncertainties, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          id("rev"),
          row.id,
          day(input.decidedOn) || today(now),
          decision,
          evidence,
          str(input.uncertainties, 800),
          actor.id,
          at,
        );
        hist(db, row.id, actor, "reviewed", REVIEW_DECISIONS[decision], now);
        if (decision === "close")
          db.prepare("UPDATE pd_themes SET status = 'closed', status_note = ?, updated_at = ? WHERE id = ?").run(evidence.slice(0, 600), at, row.id);
        audit(db, { actor: actor.id, event: "problem.reviewed", entity: `theme:${row.id}`, next: { decision }, at: now });
        return { id: row.id };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

/**
  Starts a Magazine draft for an approved response whose decision is to create something new. It's an ordinary
  draft: nothing is published or assigned, and the normal review and sign-off still apply.
*/
export function createCourseFor(db: Db, actor: User, themeId: unknown, now: Date) {
  requireAuthor(actor);
  ensureProblems(db, now);
  const row = themeRow(db, themeId);
  if (!row) throw new HttpError(404, "That theme isn’t on the Problem desk.");
  const r = responseOf(db, row.id);
  const data = responseData(r);
  if (r?.status !== "approved") throw new HttpError(400, "Approve the response decision first: it’s the reason for the build.");
  if (data.learning !== "new" && data.learning !== "role_section")
    throw new HttpError(400, "This response reuses or revises existing learning, or has none. Open the existing item instead.");
  if (r.guide_id && db.prepare("SELECT 1 FROM magazine_guides WHERE id = ?").get(r.guide_id)) return { guideId: r.guide_id };
  const guide = createGuide(
    db,
    actor,
    { title: data.desired.slice(0, 80) || row.title, standfirst: `From the Problem desk: ${row.title}`.slice(0, 200), template: "decide" },
    now,
  );
  db.prepare("UPDATE pd_responses SET guide_id = ? WHERE theme_id = ?").run(guide.id, row.id);
  hist(db, row.id, actor, "course-started", guide.title, now);
  return { guideId: guide.id };
}

// ---------------------------------------------------------------------------------------------
// The Excel export
// ---------------------------------------------------------------------------------------------

const NOT_MEASURED = "Not measured";

/**
  The decision register as a workbook: a review and handover snapshot, never the source of truth. De-identified
  summaries, aggregates and links back to the live, permission-checked records. No named learners, no complaint
  narratives, no answer keys. Who exported what, and when, is logged.
*/
export function exportRegister(db: Db, actor: User, input: { status?: unknown; risk?: unknown; from?: unknown; to?: unknown; origin?: string }, now: Date) {
  requireAuthor(actor);
  const desk = deskOverview(db, actor, input, now);
  const origin = (input.origin ?? "").replace(/\/$/, "");
  const url = (path: string | null) => (path ? (path.startsWith("/") ? `${origin}${path}` : path) : "");
  const asAt = now.toISOString();
  const register: unknown[][] = [];
  const previous: unknown[][] = [];
  const design: unknown[][] = [];
  const trendRows: unknown[][] = [];
  for (const t of desk.themes) {
    const d = themeDetail(db, actor, t.id, input, now);
    const r = d.response.data;
    const work = d.metrics.filter((m) => m.metric === "work");
    const fmt = (m: (typeof work)[number] | undefined) =>
      m ? (m.rate === null ? `${m.numerator} (no denominator)` : `${m.rate} per 100 (${m.numerator} of ${m.denominator})`) : NOT_MEASURED;
    register.push([
      t.id,
      t.title,
      THEME_STATUS[t.status],
      RISK[t.risk],
      `${desk.range.from} to ${desk.range.to}`,
      t.counts.cases,
      t.counts.contactEvents,
      t.counts.reopened,
      t.denominator ?? "Not known",
      d.theme.roles,
      d.diagnosis.desired || r.desired,
      d.diagnosis.barriers.map((b) => `${b.text || BARRIERS[b.barrier].label} (${CONFIDENCE[b.confidence]})`).join("; "),
      d.actions
        .filter((a) => !a.prior)
        .map((a) => `${ACTION_KINDS[a.kind]}: ${a.title} (${a.owner})`)
        .join("; "),
      r.learning ? LEARNING_DECISIONS[r.learning] : "Not decided",
      d.response.learnerHours === null ? NOT_MEASURED : d.response.learnerHours,
      r.effort.authorHours + r.effort.reviewHours + r.effort.supportHours || NOT_MEASURED,
      r.owner || d.theme.owner,
      r.reviewOn || "Not set",
      r.measure.name || NOT_MEASURED,
      r.baseline.note || r.baseline.window || NOT_MEASURED,
      fmt(work.at(-1)),
      d.response.status === "approved" ? "Approved" : d.response.status === "draft" ? "Draft" : "No decision yet",
      d.theme.sample ? "Sample data" : "",
      url(`/admin/problems/${t.id}`),
    ]);
    for (const a of d.actions)
      previous.push([
        t.id,
        a.id,
        a.on || a.due || "",
        a.prior ? "Tried before this decision" : "Part of this response",
        ACTION_KINDS[a.kind],
        a.title,
        a.owner,
        a.audience,
        a.assetRef ? `${a.assetKind}: ${a.assetRef}${a.assetVersion ? ` (${a.assetVersion})` : ""}` : "",
        a.intended,
        ACTION_STATUS[a.status],
        a.result ? RESULTS[a.result] : a.prior ? "Not assessed" : "",
        a.interpretation,
        a.snapshot ? `${a.snapshot} (as at ${a.snapshotAt})` : "",
        a.reportLink ? url(a.reportLink) : a.assetRef ? "No linked report yet" : "",
        a.workLink ? url(a.workLink) : "",
      ]);
    for (const s of d.plan.steps)
      design.push([
        t.id,
        d.response.guide?.title ?? (r.learning ? LEARNING_DECISIONS[r.learning] : ""),
        s.stepLabel,
        s.blockType,
        s.label,
        s.rationale.behaviour,
        s.rationale.barrier,
        [s.rationale.mechanism, s.rationale.proportionate, s.overrideReason ? `Author’s reason: ${s.overrideReason}` : ""].filter(Boolean).join(" "),
        s.rationale.needs,
        s.evidence,
        s.status === "accepted" ? "Accepted" : "Proposed",
        s.signoff || "None",
        d.response.guide ? url(`/admin/magazine/${d.response.guide.id}`) : "",
      ]);
    for (const p of d.trend) {
      const link = url(`/admin/problems/${t.id}`);
      trendRows.push([p.bucket, t.id, t.title, "All", "New unique cases", p.newCases, "", "", "Issue events", asAt, link]);
      trendRows.push([p.bucket, t.id, t.title, "All", "Follow-up contacts", p.followUps, "", "", "Issue events", asAt, link]);
      trendRows.push([p.bucket, t.id, t.title, "All", "Reopened cases", p.reopened, "", "", "Issue events", asAt, link]);
    }
    for (const m of d.metrics)
      trendRows.push([
        m.bucket,
        t.id,
        t.title,
        d.theme.roles || "All",
        m.metric === "work" ? r.measure.name || "Work measure" : "Practice measure (first attempts correct)",
        m.numerator,
        m.denominator ?? "Not known",
        m.rate === null ? "Insufficient data" : m.rate,
        m.metric === "work" ? "Work measure (manual snapshot)" : "Learning attempts (manual snapshot)",
        m.asAt,
        m.link ? url(m.link) : url(`/admin/problems/${t.id}`),
      ]);
  }
  const sheets: Sheet[] = [
    {
      name: "Decision register",
      header: [
        "Theme ID",
        "Title",
        "Status",
        "Risk",
        "Period",
        "Unique cases",
        "Contact events",
        "Reopened cases",
        "Eligible denominator",
        "Affected roles",
        "Desired behaviour",
        "Barrier and confidence",
        "Selected response",
        "Learning decision",
        "Estimated learner hours",
        "Estimated delivery hours",
        "Owner",
        "Review date",
        "Work measure",
        "Baseline",
        "Latest work measure",
        "Decision status",
        "Note",
        "Theme link",
      ],
      rows: register,
      widths: [22, 44, 22, 16, 20, 12, 14, 14, 18, 30, 44, 44, 50, 22, 18, 18, 26, 14, 36, 36, 30, 16, 14, 44],
    },
    {
      name: "Previous responses",
      header: [
        "Theme ID",
        "Action ID",
        "Date",
        "When",
        "Action type",
        "Action",
        "Owner",
        "Audience",
        "Related asset and version",
        "Intended behaviour",
        "Status",
        "Result",
        "Interpretation",
        "Snapshot seen",
        "Scored-outcomes report",
        "Work-data link",
      ],
      rows: previous,
      widths: [22, 18, 12, 24, 22, 44, 26, 28, 30, 40, 14, 22, 50, 40, 44, 30],
    },
    {
      name: "Learning design",
      header: [
        "Theme ID",
        "Asset or decision",
        "Step",
        "Block ID",
        "Block",
        "Target behaviour",
        "Barrier addressed",
        "Selection rationale",
        "Required source and inputs",
        "Practice or score type",
        "Review status",
        "Sign-off",
        "Content link",
      ],
      rows: design,
      widths: [22, 30, 26, 14, 26, 44, 40, 60, 50, 26, 14, 36, 40],
    },
    {
      name: "Trend data",
      header: [
        "Month",
        "Theme ID",
        "Theme",
        "Audience",
        "Metric",
        "Count or numerator",
        "Eligible denominator",
        "Rate per 100",
        "Metric type",
        "Data as at",
        "Link",
      ],
      rows: trendRows,
      widths: [10, 22, 40, 26, 40, 16, 18, 14, 34, 24, 44],
    },
    {
      name: "Data notes",
      header: ["Item", "Note"],
      rows: [
        ["Exported", `${asAt} by ${actor.name}`],
        ["Date range", `${desk.range.from} to ${desk.range.to} (months, inclusive)`],
        [
          "Filters",
          [input.status ? `status ${String(input.status)}` : "", input.risk ? `risk ${String(input.risk)}` : ""].filter(Boolean).join(", ") || "None",
        ],
        ["This workbook", "A review and handover snapshot, not the source of truth. Links lead back to the live records, which check permission again."],
        ["Unique cases", "One per source record. A case with three follow-ups is one case and four contact events."],
        ["Contact events", "The initial report plus every follow-up and material change. Closures and reopenings are state changes, not contacts."],
        ["Reopened cases", "Counted only when a case was closed and then reopened."],
        [
          "Eligible denominator",
          "The number of people or transactions that could have had the problem, where an owner has supplied it. “Not known” is not zero.",
        ],
        ["Rate per 100", "Numerator ÷ denominator × 100. Shown only with a denominator; otherwise “Insufficient data”."],
        ["Work measure and practice measure", "Dated aggregates an owner typed in from the named report. The Hub doesn’t compute them."],
        [
          "Scores",
          "A practice or quiz result is evidence of practice. It is not proof that work has improved, and two trends moving together don’t show that one caused the other.",
        ],
        [
          "Not in this workbook",
          "Named learners and their scores, complaint or incident narratives beyond the de-identified summary, private reflections, and answer keys.",
        ],
        ["Sample data", "Themes marked “Sample data” are fictional pilot records."],
      ],
      widths: [34, 120],
    },
  ];
  audit(db, {
    actor: actor.id,
    event: "problem.exported",
    entity: "problem-desk",
    next: { themes: desk.themes.length, from: desk.range.from, to: desk.range.to, status: input.status ?? null, risk: input.risk ?? null },
    at: now,
  });
  return { buffer: workbook(sheets), filename: `Problem desk decision register ${asAt.slice(0, 10)}.xlsx` };
}
