import "server-only";
import { randomUUID } from "node:crypto";
import { GOLDEN_SCRIPTS, INCIDENT_PATH, POCKET_TOOLS } from "@/content/pocketPlaybook";
import { QUICK_CALC_RULE_SETS } from "@/content/quickCalcRules";
import { AID_TEMPLATES, REVIEW_DECISIONS, type PbAudience, type ReviewDecision } from "@/lib/playbook";
import {
  incidentPathProblems,
  place as placeOf,
  POCKET_CLIENT_EVENTS,
  scriptProblems,
  taskScore,
  TOOL_ISSUES,
  toolHref,
  type PocketEvent,
} from "@/lib/pocketPlaybook";
import { RULE_SET_STATUS } from "@/lib/quickCalc";
import { audit, ensureCaseload, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { favouritesList, setFavouritePinned, type FavouriteItem } from "./favourites";
import { ensurePlaybooks, playbookList, recordAidEvent, resolveSnippet, toggleSaved } from "./playbooks";
import { ensurePocketTables, isPocketTool, pocketTool, pocketTools, toolState, type ToolView } from "./pocketTools";
import { search as siteSearch } from "./search";

/*
  The Live Call Pocket Playbook (docs/pocket-playbook.md): the Companion Drawer's data, pins, task search, use events,
  and the owners' source-health and use report.

  - It extends Job Aids and Favourites rather than sitting beside them. A Pocket tool saved or pinned is a row in
    `favourites` (kind 'tool'); a pin is that row's `pinned` order. Recent tools come from the person's own use events.
    Events go in `aid_events` with the same idempotency key rule.
  - Nothing here stores a figure typed into the Quick-Calc, a search phrase, a filled-in script or an incident detail:
    the API has no field for them, and anything extra sent is dropped.
  - Nothing writes to a participant record, the incident system or any other real system.
*/

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function ensurePocket(db: Db, now: Date) {
  ensurePlaybooks(db, now);
  // Favourites can hold a whole tool only in a table made after the Caseload planner (server/db ensureCaseload).
  ensureCaseload(db);
  ensurePocketTables(db);
}

type FavRow = { id: string; user_id: string; kind: "job_aid" | "passage" | "tool"; target_id: string; pinned: number; seen: string; saved_at: string };
const favRow = (db: Db, user: User, kind: "job_aid" | "tool", id: string) =>
  db.prepare("SELECT * FROM favourites WHERE user_id = ? AND kind = ? AND target_id = ?").get(user.id, kind, id) as FavRow | undefined;

/** A tool or Job Aid as the drawer and the home row show it. `inDrawer`: it opens inside the drawer, keeping the page. */
export type DrawerItem = {
  kind: "tool" | "job_aid";
  id: string;
  favId: string;
  title: string;
  task: string;
  label: string;
  href: string;
  state: "current" | "draft" | "review_due" | "updated" | "unavailable";
  note: string;
  pinned: boolean;
  saved: boolean;
  inDrawer: boolean;
};

function toolItem(t: ToolView, fav: FavRow | undefined): DrawerItem {
  const updated = fav && Number(fav.seen || 0) < t.version;
  return {
    kind: "tool",
    id: t.id,
    favId: fav?.id ?? "",
    title: t.title,
    task: t.task,
    label: t.family === "calculator" ? "Calculator" : t.family === "escalation" ? "Escalation path" : "Golden Scripts",
    href: toolHref(t.id),
    state: t.state === "withdrawn" ? "unavailable" : updated ? "updated" : t.state,
    note:
      t.state === "withdrawn"
        ? "Withdrawn. Open it for the route to use instead."
        : updated
          ? "Updated since you pinned this."
          : t.state === "draft"
            ? "Draft: awaiting approval"
            : t.state === "review_due"
              ? "Review due"
              : `Version ${t.version}`,
    pinned: Boolean(fav && fav.pinned > 0),
    saved: Boolean(fav),
    inDrawer: t.state !== "withdrawn",
  };
}

/** A Job Aid for the drawer, or null if this person may not see it. A withdrawn one shows as unavailable, never its steps. */
function aidItem(db: Db, user: User, id: string, fav: FavRow | undefined, now: Date): DrawerItem | null {
  let r: ReturnType<typeof resolveSnippet>;
  try {
    r = resolveSnippet(db, user, id, now);
  } catch {
    return null;
  }
  if (!r.permitted) return null;
  const live = r.release && r.readiness !== "fallback";
  const updated = live && fav && Number(fav.seen || 0) < r.release!.number;
  return {
    kind: "job_aid",
    id: r.id,
    favId: fav?.id ?? "",
    title: r.title,
    task: r.trigger,
    label: AID_TEMPLATES[r.template].label,
    href: toolHref(r.id),
    state: !live ? "unavailable" : updated ? "updated" : r.readiness === "review_due" ? "review_due" : "current",
    note: !live ? "Temporarily unavailable: open it for the approved route." : updated ? "Updated since you pinned this." : `Release ${r.release!.number}`,
    pinned: Boolean(fav && fav.pinned > 0),
    saved: Boolean(fav),
    inDrawer: false,
  };
}

/**
  The drawer's first view: pinned tools in the person's order, recently opened tools, every Pocket tool they may use,
  and the start of their Favourites. Only their own, and only what their role may see now.
*/
export function drawerData(db: Db, user: User, now: Date) {
  ensurePocket(db, now);
  const rows = db.prepare("SELECT * FROM favourites WHERE user_id = ? AND kind IN ('job_aid', 'tool')").all(user.id) as FavRow[];
  const fav = (kind: "job_aid" | "tool", id: string) => rows.find((r) => r.kind === kind && r.target_id === id);
  const tools = pocketTools(db, user, now);
  const item = (kind: "job_aid" | "tool", id: string): DrawerItem | null => {
    if (kind === "tool") {
      const t = tools.find((x) => x.id === id);
      return t ? toolItem(t, fav("tool", id)) : null;
    }
    return aidItem(db, user, id, fav("job_aid", id), now);
  };
  const pinned = rows
    .filter((r) => r.pinned > 0 && (r.kind === "job_aid" || isPocketTool(r.target_id)))
    .sort((a, b) => a.pinned - b.pinned || a.saved_at.localeCompare(b.saved_at))
    .map((r) => item(r.kind as "job_aid" | "tool", r.target_id))
    .filter((x): x is DrawerItem => Boolean(x));
  // Recent: from this person's own use events, newest first. Not pinned ones (they're already at the top), and not
  // anything withdrawn or no longer theirs to open.
  const used = db
    .prepare(
      `SELECT event, snippet_id, source_id, MAX(at) AS last FROM aid_events WHERE user_id = ? AND event IN ('job_aid_viewed', 'tool_opened')
       GROUP BY event, snippet_id, source_id ORDER BY last DESC LIMIT 20`,
    )
    .all(user.id) as { event: string; snippet_id: string; source_id: string; last: string }[];
  const recent: DrawerItem[] = [];
  for (const u of used) {
    const kind = u.event === "tool_opened" ? "tool" : "job_aid";
    const id = kind === "tool" ? u.source_id : u.snippet_id;
    if ((kind === "tool" && !isPocketTool(id)) || pinned.some((p) => p.kind === kind && p.id === id) || recent.some((p) => p.kind === kind && p.id === id))
      continue;
    const it = item(kind, id);
    if (it && it.state !== "unavailable") recent.push(it);
    if (recent.length >= 5) break;
  }
  const favs = favouritesList(db, user, { limit: 50 }, now);
  return {
    pinned,
    recent,
    tools: tools.filter((t) => t.state !== "withdrawn").map((t) => toolItem(t, fav("tool", t.id))),
    favourites: { count: favs.counts.all, items: favs.items.filter((i) => !i.pinned).slice(0, 4) as FavouriteItem[] },
    everPinned: Boolean(db.prepare("SELECT 1 FROM aid_events WHERE user_id = ? AND event = 'tool_pinned' LIMIT 1").get(user.id)),
  };
}
export type DrawerData = ReturnType<typeof drawerData>;

/** For the Hub home: just the pins, in order, at most six. */
export function homePins(db: Db, user: User, now: Date) {
  const d = drawerData(db, user, now);
  return { pinned: d.pinned.slice(0, 6), more: Math.max(0, d.pinned.length - 6) };
}

// ---------------------------------------------------------------------------------------------
// Saving and pinning: one Favourites list
// ---------------------------------------------------------------------------------------------

/** What may be saved or pinned: a Pocket tool or a Job Aid this person may see, and not a withdrawn tool. */
function target(db: Db, user: User, input: Record<string, unknown>, now: Date): { kind: "tool" | "job_aid"; id: string; version: number } {
  const id = str(input.id, 80);
  if (input.kind === "job_aid") {
    const r = resolveSnippet(db, user, id, now);
    if (!r.permitted) throw new HttpError(403, "This Job Aid isn’t shared with your role.");
    return { kind: "job_aid", id: r.id, version: r.release?.number ?? 0 };
  }
  const t = pocketTool(db, user, id, now);
  if (!t.permitted) throw new HttpError(403, "This tool isn’t available to you.");
  if (t.tool.state === "withdrawn") throw new HttpError(409, "This tool has been withdrawn. Open it for the route to use instead.");
  return { kind: "tool", id: t.tool.id, version: t.tool.version };
}

/** Saves the tool or aid to Favourites if it isn't there. One row however often it's pressed. */
function ensureSaved(db: Db, user: User, t: { kind: "tool" | "job_aid"; id: string; version: number }, now: Date): { row: FavRow; fresh: boolean } {
  const had = favRow(db, user, t.kind, t.id);
  if (had) return { row: had, fresh: false };
  if (t.kind === "job_aid") toggleSaved(db, user, t.id, true, now);
  else
    db.prepare("INSERT OR IGNORE INTO favourites (id, user_id, kind, target_id, title, seen, saved_at) VALUES (?, ?, 'tool', ?, '', ?, ?)").run(
      `fav-${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      user.id,
      t.id,
      String(t.version),
      now.toISOString(),
    );
  return { row: favRow(db, user, t.kind, t.id)!, fresh: true };
}

/**
  Pin to dashboard, or unpin. Pinning saves the tool to Favourites first if it isn't saved, then marks the saved row
  as pinned. Unpinning only clears the pin: the Favourite stays until the person removes it.
  `first`: the person's first pin ever, so the page can say once where pinned tools appear.
*/
export function pinTool(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePocket(db, now);
  const t = target(db, user, input, now);
  const on = input.on !== false;
  if (!on) {
    const had = favRow(db, user, t.kind, t.id);
    if (had) setFavouritePinned(db, user, had, false, now);
    return { pinned: false, saved: Boolean(had), first: false };
  }
  const everPinned = Boolean(db.prepare("SELECT 1 FROM aid_events WHERE user_id = ? AND event = 'tool_pinned' LIMIT 1").get(user.id));
  const { row } = ensureSaved(db, user, t, now);
  const { changed } = setFavouritePinned(db, user, row, true, now);
  return { pinned: true, saved: true, favId: row.id, first: changed && !everPinned };
}

/** Save a Pocket tool to Favourites, or remove it (which also removes its pin). Job Aids are saved from the aid itself. */
export function saveTool(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePocket(db, now);
  if (input.on === false) {
    const id = str(input.id, 80);
    db.prepare("DELETE FROM favourites WHERE user_id = ? AND kind = 'tool' AND target_id = ?").run(user.id, id);
    return { saved: false, pinned: false };
  }
  const t = target(db, user, { ...input, kind: "tool" }, now);
  const before = (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE user_id = ?").get(user.id) as { n: number }).n;
  const { row, fresh } = ensureSaved(db, user, t, now);
  return { saved: true, pinned: row.pinned > 0, first: fresh && before === 0 };
}

/** Reorders the person's pins: ids (favourite ids) in the new order. Anything not theirs or not pinned is ignored. */
export function reorderPins(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePocket(db, now);
  const ids = (Array.isArray(input.ids) ? input.ids : []).filter((x): x is string => typeof x === "string").slice(0, 50);
  const mine = db.prepare("SELECT id FROM favourites WHERE user_id = ? AND pinned > 0 ORDER BY pinned").all(user.id) as { id: string }[];
  const order = [...ids.filter((id) => mine.some((m) => m.id === id)), ...mine.map((m) => m.id).filter((id) => !ids.includes(id))];
  order.forEach((id, i) => db.prepare("UPDATE favourites SET pinned = ? WHERE id = ? AND user_id = ?").run(i + 1, id, user.id));
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// One tool, for its page or the drawer
// ---------------------------------------------------------------------------------------------

/** The directory route for a contact, for this person's role. Empty when the owner hasn't entered it yet. */
function contactFor(db: Db, user: User, key: string) {
  if (!key) return null;
  const c = db.prepare("SELECT label, routes FROM playbook_contacts WHERE key = ?").get(key) as { label: string; routes: string } | undefined;
  if (!c) return { label: key, route: "" };
  return { label: c.label, route: (JSON.parse(c.routes) as Record<string, string>)[user.audience] ?? "" };
}

/**
  A tool as its page and the drawer need it: its metadata and status strip, the fallback contact for this role,
  whether it's saved and pinned, and the tool-specific content this role may see. A withdrawn tool comes back with
  no content, only the route to use instead.
*/
export function toolDetail(db: Db, user: User, id: unknown, now: Date) {
  ensurePocket(db, now);
  const r = pocketTool(db, user, id, now);
  if (!r.permitted) throw new HttpError(404, "That tool isn’t available to you.");
  const t = r.tool;
  const fav = favRow(db, user, "tool", t.id);
  const base = {
    tool: t,
    saved: Boolean(fav),
    pinned: Boolean(fav && fav.pinned > 0),
    favId: fav?.id ?? "",
    updatedSincePinned: Boolean(fav && Number(fav.seen || 0) < t.version),
    contact: contactFor(db, user, t.fallback.contactKey),
    related: t.relatedAids.flatMap((aid) => {
      const it = aidItem(db, user, aid, undefined, now);
      return it ? [{ id: it.id, title: it.title, href: it.href, state: it.state }] : [];
    }),
  };
  if (t.state === "withdrawn") return { ...base, incident: null, scripts: [], ruleSets: [] };
  return {
    ...base,
    // The rule sets carry no personal data: their versions and statuses are shown, the numbers are reviewed data.
    ruleSets:
      t.family === "calculator" ? QUICK_CALC_RULE_SETS.map((x) => ({ id: x.id, number: x.number, status: x.status, label: RULE_SET_STATUS[x.status] })) : [],
    incident:
      t.family === "escalation"
        ? {
            path: INCIDENT_PATH,
            responder: contactFor(db, user, INCIDENT_PATH.internal.contactKey),
            // What Quality still has to supply: shown to the reader as "awaiting Quality", never filled in by guesswork.
            problems: incidentPathProblems(INCIDENT_PATH),
          }
        : null,
    scripts:
      t.family === "script"
        ? GOLDEN_SCRIPTS.filter((s) => s.audiences.includes(user.audience as PbAudience)).map((s) => ({ ...s, problems: scriptProblems(s) }))
        : [],
  };
}
export type ToolDetail = ReturnType<typeof toolDetail>;

/** The tool was opened: one use, and if it changed since they saved it, they've now seen the update. */
export function toolOpened(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePocket(db, now);
  const r = pocketTool(db, user, input.id, now);
  if (!r.permitted) throw new HttpError(404, "That tool isn’t available to you.");
  const t = r.tool;
  const key = typeof input.key === "string" ? input.key : null;
  const where = placeOf(input.place);
  recordAidEvent(db, user, { event: "tool_opened", sourceKind: "tool", sourceId: t.id, release: t.version, place: where, key: key && `o:${key}` }, now);
  const fav = favRow(db, user, "tool", t.id);
  if (fav) {
    db.prepare("UPDATE favourites SET last_opened_at = ? WHERE id = ?").run(now.toISOString(), fav.id);
    if (Number(fav.seen || 0) < t.version) {
      db.prepare("UPDATE favourites SET seen = ? WHERE id = ?").run(String(t.version), fav.id);
      recordAidEvent(db, user, { event: "tool_outdated_seen", sourceKind: "tool", sourceId: t.id, release: t.version, key: `u:${fav.id}:${t.version}` }, now);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Use events from a page: ids and counts only
// ---------------------------------------------------------------------------------------------

/**
  A use event from the drawer or a tool page. Only the fields below are read; anything else sent (a figure, a query,
  a script's filled-in text) is ignored, so it can never reach the table. A resend with the same key counts once.
*/
export function pocketEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePocket(db, now);
  const event = POCKET_CLIENT_EVENTS.find((e) => e === input.event) as PocketEvent | undefined;
  if (!event) throw new HttpError(400, "Unknown event.");
  const key = typeof input.key === "string" ? input.key : null;
  const where = placeOf(input.place);
  let sourceKind = "";
  let sourceId = "";
  let release = 0;
  let snippetId = "";
  if (event === "work_tools_opened") sourceKind = "drawer";
  else if (event === "search_no_result" || (event === "tool_issue_reported" && !input.toolId)) {
    // A count only: never the words searched for.
    sourceKind = "search";
  } else if (event === "script_opened" || event === "script_copied") {
    const tool = pocketTool(db, user, "golden-scripts", now);
    const s = GOLDEN_SCRIPTS.find((x) => x.id === input.scriptId);
    if (!tool.permitted || !s || !s.audiences.includes(user.audience as PbAudience)) throw new HttpError(403, "That script isn’t available to you.");
    sourceKind = "script";
    sourceId = s.id;
    release = s.version;
  } else if (event === "source_opened" && typeof input.snippetId === "string" && input.snippetId) {
    const r = resolveSnippet(db, user, input.snippetId, now);
    if (!r.permitted) throw new HttpError(403, "This Job Aid isn’t shared with your role.");
    sourceKind = "aid";
    sourceId = r.id;
    snippetId = r.id;
  } else {
    const t = pocketTool(db, user, input.toolId, now);
    if (!t.permitted) throw new HttpError(403, "This tool isn’t available to you.");
    sourceKind = "tool";
    sourceId = t.tool.id;
    release = t.tool.version;
    // A calculator result is counted against the rule set it ran on, so an error can be traced to its version.
    if (event === "calculator_estimate_run" || event === "calculator_needs_verification") {
      const n = Number(input.ruleSet);
      release = QUICK_CALC_RULE_SETS.some((r) => r.number === n) ? n : 0;
    }
  }
  // An issue report keeps which kind of issue it is (a fixed choice), in place of where it came from.
  const placeCol =
    event === "tool_issue_reported" ? (Object.keys(TOOL_ISSUES).includes(input.issue as string) ? `issue:${input.issue}` : "issue:missing") : where;
  const recorded = recordAidEvent(db, user, { event, snippetId, sourceKind, sourceId, release, place: placeCol, key }, now);
  return { ok: true, recorded: recorded > 0 };
}

// ---------------------------------------------------------------------------------------------
// Task search in the drawer
// ---------------------------------------------------------------------------------------------

export type PocketResult = {
  kind: "tool" | "script" | "job_aid" | "highlight" | "learning";
  id: string;
  title: string;
  task: string;
  href: string;
  status: string;
  /** For a saved highlight: a freshness warning before the quote is relied on. */
  warning: string;
  inDrawer: boolean;
};

/**
  Searches what this person may use for a task phrase: approved tools and scripts and Job Aids first, then their own
  saved highlights, then learning examples. Restricted, withdrawn and other people's items are never candidates. The
  phrase isn't kept anywhere.
*/
export function pocketSearch(db: Db, user: User, q: unknown, now: Date) {
  ensurePocket(db, now);
  const query = str(q, 120);
  if (!query) return { tools: [], highlights: [], learning: [], none: false };
  const scored: (PocketResult & { score: number })[] = [];
  for (const t of pocketTools(db, user, now)) {
    if (t.state === "withdrawn") continue;
    const score = taskScore(query, { title: t.title, tags: t.tags, task: t.task, purpose: t.purpose });
    if (score)
      scored.push({
        kind: "tool",
        id: t.id,
        title: t.title,
        task: t.task,
        href: toolHref(t.id),
        status: t.state === "current" ? "Approved tool" : t.statusLabel,
        warning: "",
        inDrawer: true,
        score: score + 1,
      });
  }
  const scripts = pocketTool(db, user, "golden-scripts", now);
  if (scripts.permitted && scripts.tool.state !== "withdrawn")
    for (const s of GOLDEN_SCRIPTS.filter((x) => x.audiences.includes(user.audience as PbAudience))) {
      const score = taskScore(query, { title: s.trigger, tags: s.tags, task: s.intent });
      if (score)
        scored.push({
          kind: "script",
          id: s.id,
          title: `Script: ${s.trigger}`,
          task: s.intent,
          href: `${toolHref("golden-scripts")}#script-${s.id}`,
          status: scripts.tool.state === "current" ? "Approved script" : scripts.tool.statusLabel,
          warning: "",
          inDrawer: true,
          score,
        });
    }
  for (const p of playbookList(db, user, now).playbooks) {
    // Only an aid with a current release: a withdrawn or fallen-back one isn't offered as an answer.
    if (!p || p.readiness === "fallback") continue;
    const score = taskScore(query, { title: p.title, tags: [p.tag], task: p.trigger, purpose: p.purpose });
    if (score)
      scored.push({
        kind: "job_aid",
        id: p.id,
        title: p.title,
        task: p.trigger,
        href: toolHref(p.id),
        status: `Job Aid · release ${p.number}`,
        warning: "",
        inDrawer: false,
        score,
      });
  }
  const tools: PocketResult[] = scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .map((r) => ({ kind: r.kind, id: r.id, title: r.title, task: r.task, href: r.href, status: r.status, warning: r.warning, inDrawer: r.inDrawer }));
  // Their own saved highlights only: favouritesList never reads anyone else's.
  const highlights: PocketResult[] = favouritesList(db, user, { kind: "passage" }, now)
    .items.filter((i) => i.state !== "unavailable" && taskScore(query, { title: i.title, tags: [], task: `${i.quote} ${i.detail}` }) > 0)
    .slice(0, 4)
    .map((i) => ({
      kind: "highlight",
      id: i.id,
      title: i.title,
      task: i.detail,
      href: i.href,
      status: "Saved highlight",
      warning:
        i.state === "superseded"
          ? "Superseded: this wording isn’t in the current guidance."
          : i.state === "changed"
            ? "Guidance changed since you saved this: check the current version."
            : "",
      inDrawer: false,
    }));
  const learning: PocketResult[] = siteSearch(db, user, query)
    .filter((r) => r.id.startsWith("lesson:") || r.id.startsWith("path:"))
    .slice(0, 3)
    .map((r) => ({ kind: "learning", id: r.id, title: r.title, task: r.meta, href: r.href, status: "Learning example", warning: "", inDrawer: false }));
  return { tools, highlights, learning, none: !tools.length && !highlights.length && !learning.length };
}

// ---------------------------------------------------------------------------------------------
// Owners: source health, use and the decision register
// ---------------------------------------------------------------------------------------------

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
export const POCKET_THIN = 10;

/**
  Source health and use of each Pocket tool, in a date range. Counts of people and events, with the eligible
  audience as the denominator. Never anyone's pins as a list, a figure, a search phrase or an incident detail.
*/
export function pocketReport(db: Db, actor: User, input: { from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  ensurePocket(db, now);
  const to = day(input.to) || now.toISOString().slice(0, 10);
  const from = day(input.from) || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const lo = `${from}T00:00:00.000Z`;
  const hi = `${to}T23:59:59.999Z`;
  type Ev = { user_id: string; event: string; source_kind: string; source_id: string; release: number; place: string };
  const events = db
    .prepare(
      "SELECT user_id, event, source_kind, source_id, release, place FROM aid_events WHERE at BETWEEN ? AND ? AND (source_kind IN ('tool', 'script', 'drawer', 'search') OR event IN ('tool_pinned', 'tool_unpinned'))",
    )
    .all(lo, hi) as Ev[];
  const audiences = db.prepare("SELECT audience, COUNT(*) AS n FROM users GROUP BY audience").all() as { audience: string; n: number }[];
  const people = (rows: Ev[]) => new Set(rows.map((e) => e.user_id)).size;
  const count = (rows: Ev[], ...names: string[]) => rows.filter((e) => names.includes(e.event)).length;
  const tools = POCKET_TOOLS.map((t) => {
    // The standing a reader would get, whatever the owner's own role.
    const s = toolState(db, t, now);
    const mine = events.filter((e) => e.source_kind === "tool" && e.source_id === t.id);
    const opens = mine.filter((e) => e.event === "tool_opened");
    const eligible = audiences.filter((a) => t.audiences.includes(a.audience as PbAudience)).reduce((n, a) => n + a.n, 0);
    const viewers = people(opens);
    const pins = db
      .prepare(
        "SELECT COUNT(*) AS n, SUM(CASE WHEN CAST(seen AS INTEGER) < ? THEN 1 ELSE 0 END) AS stale FROM favourites WHERE kind = 'tool' AND target_id = ? AND pinned > 0",
      )
      .get(t.version, t.id) as {
      n: number;
      stale: number | null;
    };
    const review = db.prepare("SELECT decision, note, at FROM aid_reviews WHERE snippet_id = ? ORDER BY id DESC LIMIT 1").get(`pocket:${t.id}`) as
      { decision: ReviewDecision; note: string; at: string } | undefined;
    const problems =
      t.family === "escalation"
        ? incidentPathProblems(INCIDENT_PATH)
        : t.family === "script"
          ? GOLDEN_SCRIPTS.flatMap((x) => scriptProblems(x).map((p) => `${x.id}: ${p}`))
          : QUICK_CALC_RULE_SETS.filter((r) => r.status !== "approved").map((r) => `Rule set ${r.number} (${r.id}): ${RULE_SET_STATUS[r.status]}.`);
    return {
      id: t.id,
      title: t.title,
      family: t.family,
      version: t.version,
      status: s.state,
      statusLabel: s.statusLabel,
      withdrawnReason: s.withdrawnReason,
      owner: t.owner,
      reviewer: t.reviewer,
      audiences: t.audiences,
      effectiveOn: t.effectiveOn,
      reviewedOn: t.reviewedOn,
      nextReview: t.nextReview,
      reviewDue: Boolean(t.nextReview && t.nextReview < to),
      awaiting: t.awaiting,
      sources: t.sources.map((x) => ({ label: x.label, href: x.href })),
      themeId: t.themeId,
      problems,
      eligible,
      viewers,
      thin: viewers > 0 && viewers < POCKET_THIN,
      opens: opens.length,
      byPlace: Object.fromEntries(["drawer", "home", "search", "favourites", "page"].map((p) => [p, opens.filter((e) => e.place === p).length])) as Record<
        string,
        number
      >,
      returners: [...new Set(opens.map((e) => e.user_id))].filter((u) => opens.filter((e) => e.user_id === u).length > 1).length,
      pinnedNow: pins.n,
      pinnedAfterUpdate: pins.stale ?? 0,
      pins: count(mine, "tool_pinned"),
      unpins: count(mine, "tool_unpinned"),
      estimates: count(mine, "calculator_estimate_run"),
      needsVerification: count(mine, "calculator_needs_verification"),
      byRuleSet: QUICK_CALC_RULE_SETS.map((r) => ({
        number: r.number,
        estimates: mine.filter((e) => e.event === "calculator_estimate_run" && e.release === r.number).length,
        needsVerification: mine.filter((e) => e.event === "calculator_needs_verification" && e.release === r.number).length,
      })),
      fundingViews: count(mine, "funding_view_opened"),
      interimContributionViews: count(mine, "interim_contribution_view_opened"),
      incidentOpens: count(mine, "incident_path_opened"),
      internalRouteOpens: count(mine, "internal_escalation_link_opened"),
      sourceOpens: count(mine, "source_opened"),
      outdatedSeen: count(mine, "tool_outdated_seen"),
      issues: count(mine, "tool_issue_reported"),
      issueKinds: Object.fromEntries(
        Object.keys(TOOL_ISSUES).map((k) => [k, mine.filter((e) => e.event === "tool_issue_reported" && e.place === `issue:${k}`).length]),
      ),
      review: review ? { decision: REVIEW_DECISIONS[review.decision], note: review.note, at: review.at } : null,
    };
  });
  const scriptEvents = events.filter((e) => e.source_kind === "script");
  return {
    range: { from, to },
    thin: POCKET_THIN,
    totals: {
      drawerOpens: count(events, "work_tools_opened"),
      drawerPeople: people(events.filter((e) => e.event === "work_tools_opened")),
      // How many searches found nothing approved: a count, never the words.
      searchNoResult: count(events, "search_no_result"),
      missingGuidanceReports: events.filter((e) => e.event === "tool_issue_reported" && e.source_kind === "search").length,
    },
    tools,
    scripts: GOLDEN_SCRIPTS.map((s) => ({
      id: s.id,
      trigger: s.trigger,
      version: s.version,
      status: s.status,
      opens: scriptEvents.filter((e) => e.source_id === s.id && e.event === "script_opened").length,
      copies: scriptEvents.filter((e) => e.source_id === s.id && e.event === "script_copied").length,
    })),
    ruleSets: QUICK_CALC_RULE_SETS.map((r) => ({
      id: r.id,
      number: r.number,
      from: r.effectiveFrom,
      to: r.effectiveTo,
      status: RULE_SET_STATUS[r.status],
      reviewOn: r.reviewOn,
    })),
  };
}
export type PocketReport = ReturnType<typeof pocketReport>;

/** Owners: withdraw a tool at once (every pin, search and placement routes to the fallback), restore it, or record the review decision. */
export function pocketAdminAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensurePocket(db, now);
  const id = str(input.id, 80);
  if (!isPocketTool(id)) throw new HttpError(404, "That tool isn’t in the library.");
  const at = now.toISOString();
  switch (input.action) {
    case "withdraw": {
      const reason = str(input.reason, 300);
      if (reason.length < 3) throw new HttpError(400, "Say briefly why it’s withdrawn: readers see it.");
      db.prepare(
        "INSERT INTO pocket_tool_status (tool_id, withdrawn, reason, replacement, by_user, at) VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT (tool_id) DO UPDATE SET withdrawn = 1, reason = excluded.reason, replacement = excluded.replacement, by_user = excluded.by_user, at = excluded.at",
      ).run(id, reason, str(input.replacement, 200), actor.id, at);
      audit(db, { actor: actor.id, event: "pocket_tool.withdrawn", entity: `pocket:${id}`, reason, at: now });
      return { ok: true };
    }
    case "restore": {
      db.prepare("UPDATE pocket_tool_status SET withdrawn = 0, reason = '', by_user = ?, at = ? WHERE tool_id = ?").run(actor.id, at, id);
      audit(db, { actor: actor.id, event: "pocket_tool.restored", entity: `pocket:${id}`, at: now });
      return { ok: true };
    }
    case "review": {
      const decision = (Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).find((d) => d === input.decision);
      if (!decision) throw new HttpError(400, "Choose keep, revise, retarget, withdraw or close.");
      const note = str(input.note, 500);
      if (note.length < 3) throw new HttpError(400, "Say briefly what the decision rests on.");
      const t = POCKET_TOOLS.find((x) => x.id === id)!;
      // The Job Aids review register, with the tool's id marked so the two never collide.
      db.prepare("INSERT INTO aid_reviews (snippet_id, release, decision, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)").run(
        `pocket:${id}`,
        t.version,
        decision,
        note,
        actor.id,
        at,
      );
      audit(db, { actor: actor.id, event: "pocket_tool.reviewed", entity: `pocket:${id}`, next: { decision, version: t.version }, reason: note, at: now });
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
}
