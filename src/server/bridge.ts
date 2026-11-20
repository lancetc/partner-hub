import "server-only";
import { allBlocks, type BridgeBlock } from "@/lib/magazine";
import { checkSummary, cleanInput, type BridgeInput } from "@/lib/bridge";
import { audit, ensureBridge, type Db } from "./db";
import { HttpError, isSuperadmin, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  "While You Wait" (docs/while-you-wait.md).

  Practice: a learner's adjusted scenario and their family summary, checked against the reviewed points once they
  ask. The model summary and checks stay here until then.

  Live call: a staff tool that's off until a superadmin records the Operations, Finance, Quality, Privacy and
  Communications approvals the PRD requires. It stores nothing: inputs live only in the open page. A copied
  summary is recorded as copied (who, when, whether the recipient was authorised), never as sent, and never with
  its words or anyone's details.
*/

// ---------------------------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------------------------

type Progress = { input: BridgeInput | null; summary: string; checked: ReturnType<typeof checkSummary> | null };

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureBridge(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "bridge") throw new HttpError(404, "That calculator isn’t here.");
  return { edition, block };
}

function progressOf(db: Db, user: User, guideId: string, block: BridgeBlock): Progress {
  const row = db.prepare("SELECT state FROM bridge_progress WHERE guide_id = ? AND block_id = ? AND user_id = ?").get(guideId, block.id, user.id) as
    { state: string } | undefined;
  const raw = row ? (JSON.parse(row.state) as Record<string, unknown>) : {};
  return {
    input: raw.input ? practiceInput(block, raw.input) : null,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 4000) : "",
    checked: raw.checked ? (raw.checked as Progress["checked"]) : null,
  };
}

/**
  What a learner may change in practice: the service pattern, the start date and the wait scenario. The quote,
  the CHSP branch, the rates and the stage are the author's, so a learner can't make a scenario say something
  it doesn't.
*/
function practiceInput(block: BridgeBlock, raw: unknown): BridgeInput {
  const mine = cleanInput(raw, "practice");
  return {
    ...block.scenario,
    needs: mine.needs.length ? mine.needs : block.scenario.needs,
    start: mine.start || block.scenario.start,
    waitWeeks: mine.waitWeeks,
  };
}

function store(db: Db, guideId: string, blockId: string, userId: string, p: Progress, now: Date) {
  db.prepare(
    "INSERT INTO bridge_progress (guide_id, block_id, user_id, state, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guide_id, block_id, user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
  ).run(guideId, blockId, userId, JSON.stringify(p), now.toISOString());
}

export function bridgeState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  const p = progressOf(db, user, edition.guide.id, block);
  return { ...p, model: p.checked ? block.model : "" };
}

export function saveBridge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const prev = progressOf(db, user, edition.guide.id, block);
  const next: Progress = {
    input: input.input ? practiceInput(block, input.input) : prev.input,
    summary: typeof input.summary === "string" ? input.summary.slice(0, 4000) : prev.summary,
    checked: prev.checked,
  };
  store(db, edition.guide.id, block.id, user.id, next, now);
  return { saved: true };
}

/** Checks the learner's summary against the reviewed points and the phrases to avoid, then shows the model. */
export function checkBridge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const summary = typeof input.summary === "string" ? input.summary.slice(0, 4000) : "";
  if (summary.trim().length < 40) throw new HttpError(400, "Write the summary first: a few sentences is enough.");
  const checked = checkSummary(block, summary);
  const prev = progressOf(db, user, edition.guide.id, block);
  store(db, edition.guide.id, block.id, user.id, { ...prev, summary, checked }, now);
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    edition.guide.id,
    edition.revision.id,
    "bridge.checked",
    block.id,
    // Totals only: never the words.
    JSON.stringify({ covered: checked.covered.filter((c) => c.met).length, of: checked.covered.length, avoided: checked.avoided.length }),
  );
  return { checked, model: block.model };
}

// ---------------------------------------------------------------------------------------------
// Live call
// ---------------------------------------------------------------------------------------------

const LIVE_KEY = "bridge_live_release";
type Release = { released: boolean; operations: string; finance: string; quality: string; privacy: string; communications: string; by: string; at: string };
const NOT_RELEASED: Release = { released: false, operations: "", finance: "", quality: "", privacy: "", communications: "", by: "", at: "" };

/** Who may use the live-call tool: Trilogy Care staff and coordinators. External partners can't. */
export const canUseLive = (u: User) => u.audience === "staff" || u.audience === "coordinator";

function release(db: Db): Release {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(LIVE_KEY) as { value: string } | undefined;
  return row ? { ...NOT_RELEASED, ...(JSON.parse(row.value) as Partial<Release>) } : NOT_RELEASED;
}

export function liveStatus(db: Db, user: User) {
  const r = release(db);
  return {
    allowed: canUseLive(user),
    released: r.released,
    canRelease: isSuperadmin(user),
    approvals: isSuperadmin(user) || r.released ? r : null,
  };
}

/** A superadmin releases (or withdraws) the live-call tool, recording who approved it. */
export function setLiveRelease(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  if (!isSuperadmin(actor)) throw new HttpError(403, "Only a superadmin can release the live-call tool.");
  const prev = release(db);
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const next: Release = input.released
    ? {
        released: true,
        operations: s(input.operations),
        finance: s(input.finance),
        quality: s(input.quality),
        privacy: s(input.privacy),
        communications: s(input.communications),
        by: actor.id,
        at: now.toISOString(),
      }
    : { ...prev, released: false, by: actor.id, at: now.toISOString() };
  if (next.released && (!next.operations || !next.finance || !next.quality || !next.privacy || !next.communications))
    throw new HttpError(400, "Record the Support at Home Operations, Finance, Quality, Privacy and Communications approvers before releasing it.");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(LIVE_KEY, JSON.stringify(next));
  audit(db, { actor: actor.id, event: next.released ? "bridge.live_released" : "bridge.live_withdrawn", entity: "tool:while-you-wait", at: now });
  return liveStatus(db, actor);
}

/** A live summary was copied: recorded as copied, never sent, with no words and no participant details. */
export function liveCopied(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  if (!canUseLive(user) || !release(db).released) throw new HttpError(403, "The live-call tool isn’t available.");
  audit(db, { actor: user.id, event: "bridge.summary_copied", entity: "tool:while-you-wait", next: input.authorised ? "authorised" : "generic", at: now });
  return { copied: true };
}
