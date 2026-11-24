import "server-only";
import { randomUUID } from "node:crypto";
import {
  budgetSignal,
  EVIDENCE_KINDS,
  OPERATIONAL,
  OWNER_ROLES,
  QUARTER_RULE_SET,
  RELIABILITY,
  TRIAGE,
  triageFromSignals,
  WORKFLOW,
  WORKFLOW_ORDER,
  workflowProblem,
  type OwnerRole,
  type Workflow,
} from "@/lib/trustCheck";
import { DATA_SOURCES, DEMO_ISSUES, PILOT_SETTINGS, type DemoIssue } from "@/content/trustDemo";
import { tx, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { plannerAccess } from "./caseloadPlanner";

/*
  The 28-Day Trust Check Work Tool on the server (docs/trust-check.md): a shell over DEMO DATA ONLY.

  - Who: the business planner access (plannerAccess, as for Plan my business and the Contractor Network Builder): the
    owner and the members they've authorised. Anyone else, Trilogy staff and authors included, gets `access: null` and
    nothing more: no demo issues, no boards, whatever id they ask for. A board belongs to one business and is only read
    within it, so another business can never see it.
  - What it reads: content/trustDemo.ts and its own tables. Nothing else. DATA_SOURCES lists the real sources a pilot
    would need, each `connected: false` until Trilogy Care approves a data contract. There's no free-text field at all:
    a board holds demo issue ids, workflow statuses, owner roles and the demo evidence ticked. So no participant detail,
    complaint text or health information can be typed in.
  - What it guards: a safety concern stays escalated; "resolved" needs the evidence the issue names; a transfer needs
    the person's own choice; the owner is an operational role, never the person or their family. A complaint's
    reference is shown read-only: there is no status here that withdraws or downgrades it.
  - Saves are versioned and idempotent: a resent save with the same key returns the version it made, and an unchanged
    save makes no new version.
*/

export const TOOL_ID = "trust-check";
export const TOOL_HREF = `/tools/${TOOL_ID}`;
export const DEMO_NOTICE =
  "Demo data only. This Work Tool doesn’t read real participant, booking, delivery, claims, complaint, incident or exit records, and it won’t until Trilogy Care approves those data sources.";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trust_boards (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trust_boards_org ON trust_boards (org_id);
CREATE TABLE IF NOT EXISTS trust_board_versions (
  board_id TEXT NOT NULL, number INTEGER NOT NULL, state TEXT NOT NULL, saved_by TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (board_id, number)
);
CREATE TABLE IF NOT EXISTS trust_saves (
  org_id TEXT NOT NULL, idem TEXT NOT NULL, board_id TEXT NOT NULL, number INTEGER NOT NULL, PRIMARY KEY (org_id, idem)
);
CREATE TABLE IF NOT EXISTS trust_tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, org_id TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, idem TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS trust_tool_events_idem ON trust_tool_events (user_id, idem) WHERE idem IS NOT NULL;
`;
const ready = new WeakSet<object>();
export function ensureTrustTool(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

export type IssueState = { status: Workflow; owner: OwnerRole | ""; evidence: string[] };
export type BoardState = { issues: Record<string, IssueState> };
type BoardRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = { board_id: string; number: number; state: string; saved_by: string; saved_at: string };

const idemOf = (v: unknown) => (typeof v === "string" && /^[\w-]{8,80}$/.test(v) ? v : null);

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "The 28-Day Trust Check Work Tool is for the business owner and the people they’ve authorised.");
  ensureTrustTool(db);
  return a;
}

const seedOf = (x: DemoIssue): IssueState => ({ status: x.status, owner: x.owner, evidence: [] });

/**
  A board's state, checked: only demo issues, only workflow statuses, operational owners and the issue's own demo
  evidence, and only moves the guard allows. Anything else is refused with the reason.
*/
export function cleanBoard(raw: unknown): BoardState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const issues = (o.issues && typeof o.issues === "object" ? o.issues : {}) as Record<string, unknown>;
  const out: Record<string, IssueState> = {};
  for (const [id, v] of Object.entries(issues)) {
    const issue = DEMO_ISSUES.find((x) => x.id === id);
    if (!issue) throw new HttpError(400, "Only the demo issues can be worked here until Trilogy Care approves the data sources.");
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const seed = seedOf(issue);
    const status = r.status === undefined ? seed.status : r.status;
    if (typeof status !== "string" || !(WORKFLOW_ORDER as string[]).includes(status)) throw new HttpError(400, "That isn’t a workflow status.");
    const owner = r.owner === undefined ? seed.owner : r.owner;
    if (owner !== "" && !(typeof owner === "string" && (OPERATIONAL as string[]).includes(owner)))
      throw new HttpError(
        400,
        `${issue.label}: the owner is an operational role (${OPERATIONAL.map((k) => OWNER_ROLES[k].toLowerCase()).join(", ")}), never the person or their family.`,
      );
    const ticked = Array.isArray(r.evidence) ? [...new Set(r.evidence.filter((x): x is string => typeof x === "string"))] : [];
    if (ticked.some((e) => !issue.evidence.some((x) => x.id === e))) throw new HttpError(400, `${issue.label}: only this issue’s own records can be ticked.`);
    const evidence = issue.evidence.filter((x) => ticked.includes(x.id));
    if (status !== seed.status) {
      const why = workflowProblem(issue, status as Workflow, evidence);
      if (why) throw new HttpError(409, `${issue.label}: ${why}`);
    }
    const next: IssueState = { status: status as Workflow, owner: owner as OwnerRole | "", evidence: evidence.map((x) => x.id) };
    if (JSON.stringify(next) !== JSON.stringify(seed)) out[id] = next;
  }
  return { issues: out };
}

/** The demo as the page shows it: each issue's four questions, with a board's statuses applied. Read-only references stay read-only. */
export function demoView(b: BoardState = { issues: {} }) {
  return {
    issues: DEMO_ISSUES.map((x) => {
      const st = b.issues[x.id] ?? seedOf(x);
      const t = triageFromSignals(x.signals);
      const money = x.signals.find((sg) => sg.budget)?.budget ?? null;
      return {
        id: x.id,
        label: x.label,
        theme: x.theme,
        triage: { level: t.level, label: TRIAGE[t.level], why: t.why },
        know: x.signals.map((sg) => ({
          id: sg.id,
          title: sg.title,
          noticed: sg.noticed,
          updated: sg.updated,
          source: sg.source,
          reliability: RELIABILITY[sg.reliability],
        })),
        budget: money ? budgetSignal(money, QUARTER_RULE_SET) : null,
        said: x.said,
        owner: st.owner,
        ownerLabel: st.owner ? OWNER_ROLES[st.owner] : "Not yet named",
        status: st.status,
        statusLabel: WORKFLOW[st.status],
        lastVerified: x.lastVerified,
        nextContact: x.nextContact,
        happened: x.evidence.map((e) => ({
          id: e.id,
          title: e.title,
          noticed: e.noticed,
          kind: e.kind ? EVIDENCE_KINDS[e.kind] : "",
          ticked: st.evidence.includes(e.id),
        })),
        complaintRef: x.complaintRef,
        incidentRef: x.incidentRef,
        safety: t.level === "immediate",
        // Which statuses this issue can move to now, and why not, so the page never offers a move the server refuses.
        moves: WORKFLOW_ORDER.map((w) => ({
          id: w,
          label: WORKFLOW[w],
          why:
            w === st.status
              ? ""
              : workflowProblem(
                  x,
                  w,
                  x.evidence.filter((e) => st.evidence.includes(e.id)),
                ),
        })),
      };
    }),
  };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM trust_board_versions WHERE board_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

export type TrustToolHome = {
  access: { orgName: string; role: string };
  notice: string;
  dataSources: typeof DATA_SOURCES;
  settings: typeof PILOT_SETTINGS;
  owners: { id: OwnerRole; label: string }[];
  demo: ReturnType<typeof demoView>;
  boards: { id: string; name: string; versions: number; updatedAt: string; updatedBy: string }[];
};

/** Whether this person may use the tool, and if so the demo and their business's boards. Nothing for anyone else. */
export function toolHome(db: Db, user: User): { access: null; notice: string } | TrustToolHome {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, notice: DEMO_NOTICE };
  ensureTrustTool(db);
  const rows = db.prepare("SELECT * FROM trust_boards WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as BoardRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    notice: DEMO_NOTICE,
    dataSources: DATA_SOURCES,
    settings: PILOT_SETTINGS,
    owners: OPERATIONAL.map((id) => ({ id, label: OWNER_ROLES[id] })),
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
    typeof id === "string" ? (db.prepare("SELECT * FROM trust_boards WHERE id = ? AND org_id = ?").get(id, a.orgId) as BoardRow | undefined) : undefined;
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
    versions: versions.map((v) => ({ number: v.number, savedAt: v.saved_at, savedBy: nameOf(db, v.saved_by) })),
    state,
    demo: demoView(state),
  };
}

/** Saves a board: a new one (with a name) or the next version. Idempotent by key; an unchanged save makes no new version. */
export function saveBoard(db: Db, user: User, input: { id?: unknown; name?: unknown; state?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const idem = idemOf(input.idem);
  if (!idem) throw new HttpError(400, "A save needs its key, so a retry can’t save twice.");
  const state = cleanBoard(input.state);
  // A board's name is a label for the business, like "November follow-ups": kept short, and never a person's details.
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (name && /[\w.+-]+@[\w-]+\.|\d{6,}/.test(name))
    throw new HttpError(400, "Name the board by what it’s for, like “November follow-ups”, never a person’s details.");
  const at = now.toISOString();
  return tx(db, () => {
    const done = db.prepare("SELECT board_id, number FROM trust_saves WHERE org_id = ? AND idem = ?").get(a.orgId, idem) as
      { board_id: string; number: number } | undefined;
    if (done) return { ...getBoard(db, user, done.board_id, done.number), replayed: true };
    let id: string;
    let number: number;
    if (input.id) {
      const { row } = ownBoard(db, user, input.id);
      id = row.id;
      const last = versionsOf(db, id).at(-1);
      if (last && JSON.stringify(cleanBoard(JSON.parse(last.state))) === JSON.stringify(state) && (!name || name === row.name)) {
        db.prepare("INSERT INTO trust_saves (org_id, idem, board_id, number) VALUES (?, ?, ?, ?)").run(a.orgId, idem, id, last.number);
        return { ...getBoard(db, user, id, last.number), unchanged: true };
      }
      number = (last?.number ?? 0) + 1;
      db.prepare("UPDATE trust_boards SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the board a name.");
      id = `tcb-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO trust_boards (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare("INSERT INTO trust_board_versions (board_id, number, state, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      number,
      JSON.stringify(state),
      user.id,
      at,
    );
    db.prepare("INSERT INTO trust_saves (org_id, idem, board_id, number) VALUES (?, ?, ?, ?)").run(a.orgId, idem, id, number);
    return getBoard(db, user, id, number);
  });
}

/** The tool's events, for the business's own use: an event name and a demo id. Never typed words. */
const TOOL_EVENTS = ["trust_check_opened", "signal_viewed", "followup_checkpoint_viewed"] as const;
export function logToolEvent(db: Db, user: User, input: { event?: unknown; ref?: unknown; idem?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const event = TOOL_EVENTS.find((e) => e === input.event);
  if (!event) throw new HttpError(400, "That isn’t one of the tool’s events.");
  const ref = typeof input.ref === "string" && /^[a-z0-9-]{1,40}$/.test(input.ref) ? input.ref : "";
  db.prepare("INSERT OR IGNORE INTO trust_tool_events (at, org_id, user_id, event, detail, idem) VALUES (?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.orgId,
    user.id,
    event,
    JSON.stringify({ ref, mode: "demo" }),
    idemOf(input.idem),
  );
  return { ok: true };
}
