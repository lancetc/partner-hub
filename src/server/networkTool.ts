import "server-only";
import { randomUUID } from "node:crypto";
import {
  canAdvance,
  cardView,
  cleanOutreach,
  outreachProblems,
  RULES_VERSION,
  scorecardView,
  stageOf,
  STAGE_ORDER,
  STAGES,
  type OutreachInput,
  type Stage,
} from "@/lib/networkBench";
import { calculate, snapshotOf, type CoverageInputs, type SupplyState } from "@/lib/suburbCoverage";
import { DATA_SOURCES, DEMO_CARDS, DEMO_INPUTS, DEMO_PROFILES, DEMO_SCORECARDS, DEMO_TEMPLATE } from "@/content/networkDemo";
import { tx, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { plannerAccess } from "./caseloadPlanner";

/*
  The Contractor Network Builder Work Tool on the server (docs/network-builder.md): a shell over DEMO DATA ONLY.

  - Who: the business planner access (plannerAccess, the same as Plan my business): the owner and the members they've
    authorised. Anyone else, Trilogy staff and authors included, gets `access: null` and nothing else: no demo data,
    no boards, whatever id they ask for. A board belongs to one business and is only read within it.
  - What it reads: content/networkDemo.ts and its own tables. Nothing else. DATA_SOURCES lists the real sources it
    would need, each `connected: false` until Trilogy Care approves a data contract. There's no field for a name,
    address, phone, email, ABN, certificate, complaint or participant: a board holds demo card ids, pipeline stages
    and an outreach draft's short local fields.
  - What a Care Partner can change: record interest, open the role checklist and submit to onboarding (candidate →
    contacted → evidence → verification), one stage at a time, and only when the demo evidence allows it. Approval,
    availability and booking are the provider's and scheduling's: a save that claims them is refused. Moving a card
    through the pipeline never changes coverage: interest is never capacity.
  - Saves are versioned and idempotent: a resent save with the same key returns the version it made, and an unchanged
    save makes no new version.
  - The scorecard sends no Quality detail: a restriction is its neutral reason and next step.
*/

export const TOOL_ID = "network-builder";
export const TOOL_HREF = `/tools/${TOOL_ID}`;
export const DEMO_NOTICE =
  "Demo data only. This Work Tool doesn’t read real participant, contractor, onboarding, scheduling, rate or quality records, and it won’t until Trilogy Care approves those data sources.";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS network_boards (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_boards_org ON network_boards (org_id);
CREATE TABLE IF NOT EXISTS network_board_versions (
  board_id TEXT NOT NULL, number INTEGER NOT NULL, state TEXT NOT NULL, rules_version TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  saved_by TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (board_id, number)
);
CREATE TABLE IF NOT EXISTS network_saves (
  org_id TEXT NOT NULL, idem TEXT NOT NULL, board_id TEXT NOT NULL, number INTEGER NOT NULL, PRIMARY KEY (org_id, idem)
);
CREATE TABLE IF NOT EXISTS network_tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, org_id TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, idem TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS network_tool_events_idem ON network_tool_events (user_id, idem) WHERE idem IS NOT NULL;
`;
const ready = new WeakSet<object>();
export function ensureNetworkTool(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

export type BoardState = { stages: Record<string, Stage>; outreach: OutreachInput };
type BoardRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = { board_id: string; number: number; state: string; rules_version: string; note: string; saved_by: string; saved_at: string };

const idemOf = (v: unknown) => (typeof v === "string" && /^[\w-]{8,80}$/.test(v) ? v : null);
const PARTNER_STATES: readonly SupplyState[] = ["candidate", "interested", "evidence", "verification"];

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "The Contractor Network Builder is for the business owner and the people they’ve authorised.");
  ensureNetworkTool(db);
  return a;
}

/** The seed stage of each demo card. */
const seedStage = (id: string) => {
  const r = DEMO_INPUTS.supply.find((x) => x.id === id);
  return r ? stageOf(r, DEMO_INPUTS.asOf, DEMO_INPUTS.freshness.days) : null;
};

/**
  A board's state, checked: only demo cards, only the Care Partner's own stages, one at a time from where the demo
  data has them, and only as the demo evidence allows. Anything else is refused with the reason.
*/
export function cleanBoard(raw: unknown): BoardState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const st = (o.stages && typeof o.stages === "object" ? o.stages : {}) as Record<string, unknown>;
  const stages: Record<string, Stage> = {};
  for (const [id, to] of Object.entries(st)) {
    const card = DEMO_CARDS.find((c) => c.id === id);
    const seed = seedStage(id);
    if (!card || !seed) throw new HttpError(400, "Only the demo cards can be planned here until Trilogy Care approves the data sources.");
    if (typeof to !== "string" || !(to in STAGES)) throw new HttpError(400, "That isn’t a pipeline stage.");
    const target = to as Stage;
    if (target === seed.stage) continue;
    if (STAGE_ORDER.indexOf(target) < STAGE_ORDER.indexOf(seed.stage))
      throw new HttpError(
        409,
        `${DEMO_INPUTS.supply.find((r) => r.id === id)?.label}: a card doesn’t move back here. Its owner changes its status in the source system.`,
      );
    let at: Stage = seed.stage;
    while (at !== target) {
      const next = STAGE_ORDER[STAGE_ORDER.indexOf(at) + 1];
      const ok = next
        ? canAdvance(
            { stage: at, hold: seed.hold, evidence: card.evidence, scope: card.scope, approvedUntil: card.approvedUntil, availabilityVerifiedOn: "" },
            next,
            "partner",
            DEMO_INPUTS.asOf,
            DEMO_INPUTS.freshness.days,
          )
        : ({ ok: false, reason: "That stage is behind this card." } as const);
      if (!ok.ok) throw new HttpError(409, `${DEMO_INPUTS.supply.find((r) => r.id === id)?.label}: ${ok.reason}`);
      at = next;
    }
    stages[id] = target;
  }
  return { stages, outreach: cleanOutreach(o.outreach, DEMO_TEMPLATE) };
}

/** The demo inputs with a board's pipeline stages applied. Only pipeline states change, so coverage can't. */
export function applyBoard(b: BoardState): CoverageInputs {
  return {
    ...DEMO_INPUTS,
    supply: DEMO_INPUTS.supply.map((r) => {
      const to = b.stages[r.id];
      return to && PARTNER_STATES.includes(to as SupplyState) ? { ...r, state: to as SupplyState } : r;
    }),
  };
}

const emptyBoard = (): BoardState => ({ stages: {}, outreach: { profile: "", fields: Object.fromEntries(DEMO_TEMPLATE.fields.map((f) => [f.id, ""])) } });

/** The demo as the page shows it: the coverage view, the pipeline cards, the outreach kit and the scorecards. */
export function demoView(b: BoardState = emptyBoard()) {
  const inputs = applyBoard(b);
  const result = calculate(inputs);
  return {
    asOf: inputs.asOf,
    inputs,
    coverage: result,
    snapshot: snapshotOf(result),
    cards: inputs.supply.map((r) => {
      const c = DEMO_CARDS.find((x) => x.id === r.id);
      const v = cardView(inputs, r, c);
      const next = STAGE_ORDER[STAGE_ORDER.indexOf(v.stage) + 1];
      const can =
        next && c
          ? canAdvance(
              {
                stage: v.stage,
                hold: stageOf(r, inputs.asOf, inputs.freshness.days).hold,
                evidence: c.evidence,
                scope: c.scope,
                approvedUntil: c.approvedUntil,
                availabilityVerifiedOn: "",
              },
              next,
              "partner",
              inputs.asOf,
              inputs.freshness.days,
            )
          : null;
      return { ...v, next: next ?? null, canMove: Boolean(can?.ok), why: can && !can.ok ? can.reason : "" };
    }),
    profiles: DEMO_PROFILES,
    template: DEMO_TEMPLATE,
    outreachProblems: b.outreach.profile || Object.values(b.outreach.fields).some(Boolean) ? outreachProblems(DEMO_TEMPLATE, b.outreach, DEMO_PROFILES) : [],
    // The view of each scorecard a Care Partner may see: never the Quality detail.
    scorecards: DEMO_SCORECARDS.map((s) => ({ id: s.id, ...scorecardView(s, inputs.asOf) })),
  };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM network_board_versions WHERE board_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

export type ToolHomeFull = {
  access: { orgName: string; role: string };
  notice: string;
  dataSources: typeof DATA_SOURCES;
  rulesVersion: string;
  demo: ReturnType<typeof demoView>;
  boards: { id: string; name: string; versions: number; updatedAt: string; updatedBy: string }[];
};

/** Whether this person may use the tool, and if so the demo and their business's boards. Nothing for anyone else. */
export function toolHome(db: Db, user: User): { access: null; notice: string } | ToolHomeFull {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, notice: DEMO_NOTICE };
  ensureNetworkTool(db);
  const rows = db.prepare("SELECT * FROM network_boards WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as BoardRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    notice: DEMO_NOTICE,
    dataSources: DATA_SOURCES,
    rulesVersion: RULES_VERSION,
    demo: demoView(),
    boards: rows.map((r) => {
      const v = versionsOf(db, r.id);
      return { id: r.id, name: r.name, versions: v.length, updatedAt: r.updated_at, updatedBy: v.length ? nameOf(db, v.at(-1)!.saved_by) : "" };
    }),
  };
}

function ownBoard(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM network_boards WHERE id = ? AND org_id = ?").get(id, a.orgId) as BoardRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That board isn’t here.");
  return { access: a, row };
}

export function getBoard(db: Db, user: User, id: unknown, version?: unknown) {
  const { row } = ownBoard(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That board isn’t here.");
  const state = cleanBoard(JSON.parse(chosen.state));
  return {
    id: row.id,
    name: row.name,
    version: chosen.number,
    versions: versions.map((v) => ({ number: v.number, savedAt: v.saved_at, savedBy: nameOf(db, v.saved_by), note: v.note, rulesVersion: v.rules_version })),
    state,
    demo: demoView(state),
    earlierRules: chosen.rules_version !== RULES_VERSION,
  };
}

/** Saves a board: a new one (with a name) or the next version. Idempotent by key; an unchanged save makes no new version. */
export function saveBoard(db: Db, user: User, input: { id?: unknown; name?: unknown; state?: unknown; note?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const idem = idemOf(input.idem);
  if (!idem) throw new HttpError(400, "A save needs its key, so a retry can’t save twice.");
  const state = cleanBoard(input.state);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  const at = now.toISOString();
  return tx(db, () => {
    const done = db.prepare("SELECT board_id, number FROM network_saves WHERE org_id = ? AND idem = ?").get(a.orgId, idem) as
      { board_id: string; number: number } | undefined;
    if (done) return { ...getBoard(db, user, done.board_id, done.number), replayed: true };
    let id: string;
    let number: number;
    if (input.id) {
      const { row } = ownBoard(db, user, input.id);
      id = row.id;
      const last = versionsOf(db, id).at(-1);
      if (last && JSON.stringify(cleanBoard(JSON.parse(last.state))) === JSON.stringify(state) && (!name || name === row.name)) {
        db.prepare("INSERT INTO network_saves (org_id, idem, board_id, number) VALUES (?, ?, ?, ?)").run(a.orgId, idem, id, last.number);
        return { ...getBoard(db, user, id, last.number), unchanged: true };
      }
      number = (last?.number ?? 0) + 1;
      db.prepare("UPDATE network_boards SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the board a name.");
      id = `nbb-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO network_boards (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare("INSERT INTO network_board_versions (board_id, number, state, rules_version, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id,
      number,
      JSON.stringify(state),
      RULES_VERSION,
      note,
      user.id,
      at,
    );
    db.prepare("INSERT INTO network_saves (org_id, idem, board_id, number) VALUES (?, ?, ?, ?)").run(a.orgId, idem, id, number);
    return getBoard(db, user, id, number);
  });
}

/** The tool's events (PRD section 16), for the business's own use: an event name and a demo id. Never typed words. */
const TOOL_EVENTS = [
  "network_builder_opened",
  "gap_filter_changed",
  "candidate_card_opened",
  "readiness_status_viewed",
  "outreach_draft_generated",
  "outreach_draft_copied",
  "onboarding_checklist_opened",
  "quality_evidence_reviewed",
] as const;
export function logToolEvent(db: Db, user: User, input: { event?: unknown; ref?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const event = TOOL_EVENTS.find((e) => e === input.event);
  if (!event) throw new HttpError(400, "That isn’t one of the tool’s events.");
  const ref = typeof input.ref === "string" && /^[a-z0-9-]{1,40}$/.test(input.ref) ? input.ref : "";
  const detail = JSON.stringify({ ref, mode: "demo", ...(event === "outreach_draft_copied" ? { sent: false } : {}) });
  db.prepare("INSERT OR IGNORE INTO network_tool_events (at, org_id, user_id, event, detail, idem) VALUES (?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.orgId,
    user.id,
    event,
    detail,
    idemOf(input.idem),
  );
  return { ok: true };
}
