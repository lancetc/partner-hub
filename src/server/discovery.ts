import "server-only";
import { randomUUID } from "node:crypto";
import { lessons } from "@/content/lessons";
import { extractText } from "@/lib/lessonText";
import { plainText } from "@/lib/richText";
import {
  buildRoute,
  routePurpose,
  EXPERIENCE,
  goalWords,
  itemKey,
  MAX_GOAL,
  MAX_NOTE,
  MAX_STEPS,
  parseKey,
  pathProgress,
  PHASES,
  REQUEST_STATES,
  scoreItems,
  SUGGEST_MAX,
  TIMES,
  titleFromGoal,
  wordsIn,
  type CatalogueItem,
  type Experience,
  type Gone,
  type IndexedItem,
  type PathState,
  type RequestState,
  type RouteStep,
  type StepView,
} from "@/lib/discovery";
import { audit, ensureDiscovery, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { topicIsFor } from "./catalogue";
import { myTopicAssignments } from "./people";
import { missionSlugs } from "./challenges";
import { discoveryCourses } from "./magazine";
import { askForJson } from "./claudeJson";
import { claudeConfigured, openaiJson, openaiReady, openaiTextModel } from "./openaiText";

/*
  Discovery Paths (docs/discovery-paths.md): personal routes a learner builds through published Topics and
  Magazine content.

  - Every read and change checks the path is the caller's own. Someone else's path looks like no path.
  - A step can only be added, suggested or opened when the content is in the caller's catalogue right now:
    published, in their audience, and (for a Magazine page) marked suitable as a standalone reference.
  - Nothing here writes to a completion, quiz or certificate table. "Reviewed for now" and "Explored" are
    the learner's own marks; each step shows the content's own record beside them.
  - Notes and goals are the learner's. Events and the suggestion log hold what happened, not what was written.
*/

type PathRow = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  purpose: string;
  experience: string | null;
  minutes: number | null;
  state: PathState;
  explored_at: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};
type StepRow = {
  id: string;
  path_id: string;
  position: number;
  kind: "topic" | "course" | "page";
  ref: string;
  page_id: string;
  title: string;
  parent_title: string | null;
  phase: string | null;
  reason: string | null;
  note: string;
  revisit: number;
  reviewed_at: string | null;
  saved_version: string | null;
  opened_version: string | null;
  opened_at: string | null;
  added_at: string;
};

const MAX_PATHS = 30;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clean = (s: string) => plainText(s).replace(/\s+/g, " ").trim();

function event(db: Db, e: { user: string; path?: string | null; item?: string | null; event: string; detail?: object; at: Date }) {
  db.prepare("INSERT INTO discovery_events (at, user_id, path_id, item_key, event, detail) VALUES (?, ?, ?, ?, ?, ?)").run(
    e.at.toISOString(),
    e.user,
    e.path ?? null,
    e.item ?? null,
    e.event,
    JSON.stringify(e.detail ?? {}),
  );
}

// ---------------------------------------------------------------------------------------------
// The catalogue: what this person may put in a path, right now
// ---------------------------------------------------------------------------------------------

type Catalogue = { items: IndexedItem[]; byKey: Map<string, IndexedItem>; restricted: Set<string> };

/**
  Every Topic, Magazine course and standalone Magazine page this person can open. This is the one place
  eligibility is decided: suggestions, search, adding and opening a step all go through it.
*/
export function catalogue(db: Db, user: User): Catalogue {
  ensureDiscovery(db);
  const missions = missionSlugs(db);
  const done = new Set(
    (db.prepare("SELECT DISTINCT lesson_slug AS slug FROM lesson_completions WHERE user_id = ?").all(user.id) as { slug: string }[]).map((r) => r.slug),
  );
  const begun = new Set((db.prepare("SELECT slug FROM lesson_progress WHERE user_id = ?").all(user.id) as { slug: string }[]).map((r) => r.slug));
  const assigned = myTopicAssignments(db, user.id);
  const topics: IndexedItem[] = lessons
    // Follow ups arrive in a sequence and challenge missions open one a day: neither can be saved.
    .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
    // Only topics for this person (catalogue.topicIsFor) or assigned to them, as on Topics: a coordinator's path
    // isn't offered the Care Partners' topics.
    .filter((l) => topicIsFor(user, l) || assigned.has(l.slug))
    .map((l) => {
      const kinds = Object.values(l.nodes).map((n) => (n as { type: string }).type);
      return {
        key: itemKey("topic", l.slug),
        kind: "topic" as const,
        ref: l.slug,
        pageId: "",
        title: l.title,
        summary: [l.summary, l.outcome].filter(Boolean).join(" "),
        minutes: l.minutes,
        href: `/topics/${l.slug}`,
        parent: null,
        version: l.version,
        practice: kinds.includes("decision") ? "A decision to practise" : kinds.includes("quiz") ? "Check questions" : null,
        owner: l.owner,
        reviewed: l.reviewDate || null,
        state: done.has(l.slug) ? ("completed" as const) : begun.has(l.slug) ? ("started" as const) : ("new" as const),
        text: extractText(l).map(clean).join(" · "),
      };
    });

  const mag = discoveryCourses(db, user);
  const magazine: IndexedItem[] = [];
  for (const c of mag.courses) {
    const href = `/magazine/${c.slug}`;
    const key = itemKey("course", c.id);
    const pageWords = c.pages.map((p) => [p.title, p.purpose, ...wordsIn(p.content)].map(clean).join(" "));
    magazine.push({
      key,
      kind: "course",
      ref: c.id,
      pageId: "",
      title: c.title,
      summary: c.standfirst,
      minutes: c.minutes,
      // Picks up where they left off.
      href: c.lastPage ? `${href}/${c.lastPage}` : href,
      parent: null,
      version: String(c.edition),
      practice: c.practice ? "Quick review" : (c.pages.find((p) => p.practice)?.practice ?? null),
      owner: "",
      reviewed: c.publishedAt,
      state: c.state,
      text: pageWords.join(" · "),
    });
    c.pages.forEach((p, i) => {
      if (!p.standalone) return;
      magazine.push({
        key: itemKey("page", c.id, p.id),
        kind: "page",
        ref: c.id,
        pageId: p.id,
        title: p.title || `Page ${i + 1}`,
        summary: p.purpose,
        minutes: p.minutes,
        href: `${href}/${p.id}`,
        parent: { key, title: c.title, href },
        version: p.version,
        practice: p.practice,
        owner: "",
        reviewed: c.publishedAt,
        state: p.finished ? "completed" : "new",
        text: pageWords[i],
      });
    });
  }
  const items = [...topics, ...magazine];
  return { items, byKey: new Map(items.map((i) => [i.key, i])), restricted: new Set(mag.restricted) };
}

/** An item for the page: the matching words stay on the server. */
const shown = (item: IndexedItem): CatalogueItem => {
  const out: Partial<IndexedItem> = { ...item };
  delete out.text;
  return out as CatalogueItem;
};

/** Search the catalogue, for adding a step by hand. With no words, what's there, Topics first. */
export function searchCatalogue(db: Db, user: User, input: { q?: unknown; kind?: unknown; max?: unknown }) {
  const cat = catalogue(db, user);
  const q = text(input.q, 100);
  const kind = input.kind === "topic" || input.kind === "course" || input.kind === "page" ? input.kind : null;
  const max = [5, 10, 20, 40].includes(Number(input.max)) ? Number(input.max) : null;
  let found = q ? scoreItems(cat.items, q).map((s) => s.item) : cat.items;
  if (q && !found.length) {
    // The words as typed, anywhere in a title: a plain search when the goal matcher finds nothing.
    const lower = q.toLowerCase();
    found = cat.items.filter((i) => i.title.toLowerCase().includes(lower));
  }
  found = found.filter((i) => (!kind || i.kind === kind) && (!max || i.minutes <= max));
  return { items: found.slice(0, 30).map(shown), total: found.length, all: cat.items.length };
}

// ---------------------------------------------------------------------------------------------
// Reading paths
// ---------------------------------------------------------------------------------------------

function own(db: Db, user: User, id: unknown): PathRow {
  ensureDiscovery(db);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM discovery_paths WHERE id = ? AND user_id = ?").get(id, user.id) as PathRow | undefined) : undefined;
  // Someone else's path is no path: nothing says it exists.
  if (!row) throw new HttpError(404, "That Discovery Path isn’t here. It may have been deleted.");
  return row;
}

const stepsOf = (db: Db, pathId: string) => db.prepare("SELECT * FROM discovery_steps WHERE path_id = ? ORDER BY position, added_at").all(pathId) as StepRow[];
const keyOf = (s: Pick<StepRow, "kind" | "ref" | "page_id">) => itemKey(s.kind, s.ref, s.page_id);

function stepView(s: StepRow, cat: Catalogue, inPath: Set<string>): StepView {
  const key = keyOf(s);
  const found = cat.byKey.get(key) ?? null;
  let gone: StepView["gone"] = null;
  if (!found) {
    const course = s.kind === "topic" ? null : cat.byKey.get(itemKey("course", s.ref));
    const why: Gone = s.kind === "page" && course ? "page" : s.kind !== "topic" && cat.restricted.has(s.ref) ? "restricted" : "retired";
    // Something they can open instead: the page's course, or the closest match to what this was called.
    const instead = why === "page" ? course : scoreItems(cat.items, s.title).find((x) => !inPath.has(x.item.key))?.item;
    gone = { why, replacement: instead && !inPath.has(instead.key) ? { key: instead.key, kind: instead.kind, title: instead.title } : null };
  }
  return {
    id: s.id,
    key,
    kind: s.kind,
    title: found?.title ?? s.title,
    parentTitle: found?.parent?.title ?? s.parent_title,
    phase: s.phase,
    reason: s.reason,
    note: s.note,
    revisit: s.revisit === 1,
    reviewedAt: s.reviewed_at,
    openedAt: s.opened_at,
    addedAt: s.added_at,
    item: found ? shown(found) : null,
    gone,
    updated: Boolean(found) && (s.opened_version ?? s.saved_version) !== found!.version,
    explored: Boolean(s.reviewed_at) || found?.state === "completed",
  };
}

function view(db: Db, user: User, row: PathRow, cat: Catalogue, now?: Date) {
  const rows = stepsOf(db, row.id);
  const inPath = new Set(rows.map(keyOf));
  const steps = rows.map((s) => stepView(s, cat, inPath));
  const { next, ...progress } = pathProgress(steps);
  // The first time every step has been explored. It's a quiet personal marker: no completion is recorded anywhere.
  if (progress.done && !row.explored_at && now) {
    db.prepare("UPDATE discovery_paths SET explored_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    event(db, { user: user.id, path: row.id, event: "path.explored", detail: { steps: progress.total }, at: now });
    row = { ...row, explored_at: now.toISOString() };
  }
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    purpose: row.purpose,
    experience: row.experience as Experience | null,
    minutes: row.minutes,
    state: row.state,
    exploredAt: row.explored_at,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps,
    progress: { ...progress, nextId: next?.id ?? null, nextTitle: next?.title ?? null },
  };
}
export type DiscoveryPath = ReturnType<typeof view>;

export function readPath(db: Db, user: User, id: unknown, now: Date) {
  return { path: view(db, user, own(db, user, id), catalogue(db, user), now) };
}

const requestView = (r: RequestRow) => ({ id: r.id, goal: r.goal, context: r.context, state: r.state, note: r.note, link: r.link, createdAt: r.created_at });

/** My Discovery: the person's own paths (never anyone else's) and the topics they've asked for. */
export function myDiscovery(db: Db, user: User, now: Date) {
  ensureDiscovery(db);
  const cat = catalogue(db, user);
  const rows = db.prepare("SELECT * FROM discovery_paths WHERE user_id = ? ORDER BY COALESCE(last_opened_at, updated_at) DESC").all(user.id) as PathRow[];
  const requests = db.prepare("SELECT * FROM discovery_requests WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as RequestRow[];
  return {
    paths: rows.map((r) => {
      const p = view(db, user, r, cat, now);
      return {
        id: p.id,
        title: p.title,
        goal: p.goal,
        state: p.state,
        updatedAt: p.updatedAt,
        lastOpenedAt: p.lastOpenedAt,
        progress: p.progress,
        attention: p.steps.filter((s) => s.gone || s.updated).length,
      };
    }),
    requests: requests.map(requestView),
    audience: user.audience,
  };
}

/** For "Add to my Discovery Path" on a Topic or Magazine page: whether it can be saved, and which of their paths have it. */
export function itemInPaths(db: Db, user: User, key: unknown) {
  ensureDiscovery(db);
  const parsed = parseKey(key);
  if (!parsed) throw new HttpError(400, "Which Topic or page?");
  const cat = catalogue(db, user);
  const k = itemKey(parsed.kind, parsed.ref, parsed.pageId);
  let item = cat.byKey.get(k) ?? null;
  // A page that isn't offered by itself: the whole course is what can be saved.
  let instead = false;
  if (!item && parsed.kind === "page") {
    item = cat.byKey.get(itemKey("course", parsed.ref)) ?? null;
    instead = Boolean(item);
  }
  if (!item) return { item: null, wholeCourse: false, paths: [] };
  const paths = db
    .prepare("SELECT * FROM discovery_paths WHERE user_id = ? AND state != 'archived' ORDER BY COALESCE(last_opened_at, updated_at) DESC")
    .all(user.id) as PathRow[];
  const has = new Set(
    (
      db
        .prepare(
          "SELECT s.path_id FROM discovery_steps s JOIN discovery_paths p ON p.id = s.path_id WHERE p.user_id = ? AND s.kind = ? AND s.ref = ? AND s.page_id = ?",
        )
        .all(user.id, item.kind, item.ref, item.pageId) as { path_id: string }[]
    ).map((r) => r.path_id),
  );
  return { item: shown(item), wholeCourse: instead, paths: paths.map((p) => ({ id: p.id, title: p.title, has: has.has(p.id) })) };
}

// ---------------------------------------------------------------------------------------------
// Changing a path
// ---------------------------------------------------------------------------------------------

const experienceOf = (v: unknown) => (typeof v === "string" && v in EXPERIENCE ? (v as Experience) : null);
const minutesOf = (v: unknown) => ((TIMES as readonly number[]).includes(Number(v)) ? Number(v) : null);
const phaseOf = (v: unknown) => text(v, 40) || null;

function insertStep(db: Db, pathId: string, item: IndexedItem, extra: { reason?: unknown; phase?: unknown; note?: unknown }, position: number, now: Date) {
  const id = `ds-${randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO discovery_steps (id, path_id, position, kind, ref, page_id, title, parent_title, phase, reason, note, saved_version, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    pathId,
    position,
    item.kind,
    item.ref,
    item.pageId,
    item.title,
    item.parent?.title ?? null,
    phaseOf(extra.phase),
    text(extra.reason, 300) || null,
    text(extra.note, MAX_NOTE),
    item.version,
    now.toISOString(),
  );
  return id;
}

/**
  A new path: empty, with one item (from "Add to my Discovery Path"), or from a suggestion the learner
  accepted or edited. Every step is checked against their catalogue again; anything they can't open is left out.
*/
export function createPath(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureDiscovery(db);
  const goal = text(input.goal, MAX_GOAL);
  const title = text(input.title, 80) || (goal ? titleFromGoal(goal) : "My Discovery Path");
  const cat = catalogue(db, user);
  const wanted = (Array.isArray(input.steps) ? input.steps : []).slice(0, MAX_STEPS) as { key?: unknown; reason?: unknown }[];
  return tx(db, () => {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM discovery_paths WHERE user_id = ? AND state != 'archived'").get(user.id) as { n: number }).n;
    if (count >= MAX_PATHS) throw new HttpError(400, `You have ${MAX_PATHS} Discovery Paths. Archive or delete one to make another.`);
    const id = `dp-${randomUUID().slice(0, 12)}`;
    const at = now.toISOString();
    db.prepare(
      "INSERT INTO discovery_paths (id, user_id, title, goal, purpose, experience, minutes, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      user.id,
      title,
      goal,
      text(input.purpose, 300),
      experienceOf(input.experience),
      minutesOf(input.minutes),
      input.start === true ? "active" : "draft",
      at,
      at,
    );
    const seen = new Set<string>();
    let position = 0;
    for (const w of wanted) {
      const item = typeof w?.key === "string" ? cat.byKey.get(w.key) : undefined;
      if (!item || seen.has(item.key)) continue;
      seen.add(item.key);
      insertStep(db, id, item, { reason: w.reason }, position++, now);
    }
    // What became of the suggestion: taken as offered, or changed first.
    const rec =
      typeof input.recommendationId === "string"
        ? (db.prepare("SELECT id, offered FROM discovery_recommendations WHERE id = ? AND user_id = ?").get(input.recommendationId, user.id) as
            { id: string; offered: string } | undefined)
        : undefined;
    if (rec) {
      const offered = (JSON.parse(rec.offered) as RouteStep[]).map((s) => s.key);
      const same = offered.length === seen.size && offered.every((k, i) => [...seen][i] === k);
      db.prepare("UPDATE discovery_recommendations SET outcome = ?, path_id = ? WHERE id = ?").run(same ? "accepted" : "edited", id, rec.id);
    }
    event(db, {
      user: user.id,
      path: id,
      event: "path.created",
      detail: { steps: seen.size, from: rec ? "suggestion" : wanted.length ? "item" : "empty" },
      at: now,
    });
    return { path: view(db, user, own(db, user, id), cat, now) };
  });
}

export function updatePath(db: Db, user: User, id: unknown, input: Record<string, unknown>, now: Date) {
  const row = own(db, user, id);
  const title = input.title === undefined ? row.title : text(input.title, 80);
  if (!title) throw new HttpError(400, "Give the path a name.");
  const goal = input.goal === undefined ? row.goal : text(input.goal, MAX_GOAL);
  const state = input.state === undefined ? row.state : (["draft", "active", "paused", "archived"] as const).find((s) => s === input.state);
  if (!state) throw new HttpError(400, "A path is a draft, in progress, paused or archived.");
  db.prepare("UPDATE discovery_paths SET title = ?, goal = ?, state = ?, updated_at = ? WHERE id = ?").run(title, goal, state, now.toISOString(), row.id);
  if (state !== row.state) event(db, { user: user.id, path: row.id, event: `path.${state}`, at: now });
  else event(db, { user: user.id, path: row.id, event: "path.edited", at: now });
  return readPath(db, user, row.id, now);
}

/** Gone for good, with its notes. The Topics and courses in it, and every record of doing them, are untouched. */
export function deletePath(db: Db, user: User, id: unknown, now: Date) {
  const row = own(db, user, id);
  tx(db, () => {
    db.prepare("DELETE FROM discovery_steps WHERE path_id = ?").run(row.id);
    db.prepare("UPDATE discovery_recommendations SET path_id = NULL WHERE path_id = ?").run(row.id);
    db.prepare("DELETE FROM discovery_paths WHERE id = ?").run(row.id);
    event(db, { user: user.id, path: row.id, event: "path.deleted", at: now });
  });
  return { deleted: true };
}

/** Adds a Topic, course or standalone page they can open. Adding what's already there changes nothing. */
export function addStep(db: Db, user: User, id: unknown, input: Record<string, unknown>, now: Date) {
  const row = own(db, user, id);
  const cat = catalogue(db, user);
  const item = typeof input.key === "string" ? cat.byKey.get(input.key) : undefined;
  if (!item) throw new HttpError(400, "That can’t be added: it isn’t available to you, or isn’t offered by itself.");
  tx(db, () => {
    const rows = stepsOf(db, row.id);
    if (rows.some((s) => keyOf(s) === item.key)) return;
    if (rows.length >= MAX_STEPS) throw new HttpError(400, `A path holds up to ${MAX_STEPS} steps. Remove one first, or start another path.`);
    insertStep(db, row.id, item, input, (rows.at(-1)?.position ?? -1) + 1, now);
    db.prepare("UPDATE discovery_paths SET updated_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    event(db, { user: user.id, path: row.id, item: item.key, event: "step.added", detail: { from: text(input.from, 20) || "builder" }, at: now });
  });
  return { path: view(db, user, own(db, user, row.id), cat, now) };
}

function ownStep(db: Db, row: PathRow, stepId: unknown): StepRow {
  const step =
    typeof stepId === "string"
      ? (db.prepare("SELECT * FROM discovery_steps WHERE id = ? AND path_id = ?").get(stepId, row.id) as StepRow | undefined)
      : undefined;
  if (!step) throw new HttpError(404, "That step isn’t in this path any more.");
  return step;
}

export function removeStep(db: Db, user: User, id: unknown, stepId: unknown, now: Date) {
  const row = own(db, user, id);
  const step =
    typeof stepId === "string"
      ? (db.prepare("SELECT * FROM discovery_steps WHERE id = ? AND path_id = ?").get(stepId, row.id) as StepRow | undefined)
      : undefined;
  // Already removed (a resend): the same answer.
  if (step) {
    db.prepare("DELETE FROM discovery_steps WHERE id = ?").run(step.id);
    db.prepare("UPDATE discovery_paths SET updated_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    event(db, { user: user.id, path: row.id, item: keyOf(step), event: "step.removed", detail: { suggested: Boolean(step.reason) }, at: now });
  }
  return readPath(db, user, row.id, now);
}

/**
  The order, as a list of step ids. Sending the same order again changes nothing; a step added since (in
  another tab) keeps its place after the ones listed, and an id that isn't in the path is ignored.
*/
export function reorderSteps(db: Db, user: User, id: unknown, order: unknown, now: Date) {
  const row = own(db, user, id);
  if (!Array.isArray(order)) throw new HttpError(400, "Expected the steps in order.");
  tx(db, () => {
    const rows = stepsOf(db, row.id);
    const have = new Map(rows.map((s) => [s.id, s]));
    const listed = [...new Set(order.filter((x): x is string => typeof x === "string" && have.has(x)))];
    const next = [...listed, ...rows.filter((s) => !listed.includes(s.id)).map((s) => s.id)];
    if (next.every((sid, i) => rows[i].id === sid)) return;
    const set = db.prepare("UPDATE discovery_steps SET position = ? WHERE id = ?");
    next.forEach((sid, i) => set.run(i, sid));
    db.prepare("UPDATE discovery_paths SET updated_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    event(db, { user: user.id, path: row.id, event: "path.reordered", at: now });
  });
  return readPath(db, user, row.id, now);
}

/** The learner's own marks on a step: a private note, a phase label, "Useful to revisit", "Reviewed for now". */
export function updateStep(db: Db, user: User, id: unknown, stepId: unknown, input: Record<string, unknown>, now: Date) {
  const row = own(db, user, id);
  const step = ownStep(db, row, stepId);
  const note = input.note === undefined ? step.note : text(input.note, MAX_NOTE);
  const phase = input.phase === undefined ? step.phase : phaseOf(input.phase);
  const revisit = input.revisit === undefined ? step.revisit : input.revisit === true ? 1 : 0;
  // Reviewed for now is theirs to set and to take back. It never touches the content's own completion.
  const reviewed = input.reviewed === undefined ? step.reviewed_at : input.reviewed === true ? (step.reviewed_at ?? now.toISOString()) : null;
  db.prepare("UPDATE discovery_steps SET note = ?, phase = ?, revisit = ?, reviewed_at = ? WHERE id = ?").run(note, phase, revisit, reviewed, step.id);
  db.prepare("UPDATE discovery_paths SET updated_at = ? WHERE id = ?").run(now.toISOString(), row.id);
  const key = keyOf(step);
  if (reviewed !== step.reviewed_at) event(db, { user: user.id, path: row.id, item: key, event: reviewed ? "step.reviewed" : "step.unreviewed", at: now });
  if (revisit !== step.revisit) event(db, { user: user.id, path: row.id, item: key, event: revisit ? "step.revisit" : "step.revisit_off", at: now });
  // That a note was saved, never what it says.
  if (note !== step.note) event(db, { user: user.id, path: row.id, item: key, event: note ? "step.noted" : "step.note_cleared", at: now });
  return readPath(db, user, row.id, now);
}

/**
  Opening a step: checks they can still open the content, notes the version they're about to see (so a
  later change shows as "Updated since you saved this"), and starts a draft path. Returns where to go.
*/
export function openStep(db: Db, user: User, id: unknown, stepId: unknown, now: Date) {
  const row = own(db, user, id);
  const step = ownStep(db, row, stepId);
  const item = catalogue(db, user).byKey.get(keyOf(step));
  if (!item) throw new HttpError(410, "That isn’t available to open any more.");
  const at = now.toISOString();
  db.prepare("UPDATE discovery_steps SET opened_version = ?, opened_at = ?, title = ?, parent_title = ? WHERE id = ?").run(
    item.version,
    at,
    item.title,
    item.parent?.title ?? null,
    step.id,
  );
  db.prepare("UPDATE discovery_paths SET last_opened_at = ?, state = CASE WHEN state IN ('draft', 'paused') THEN 'active' ELSE state END WHERE id = ?").run(
    at,
    row.id,
  );
  event(db, {
    user: user.id,
    path: row.id,
    item: item.key,
    event: step.opened_at ? "step.revisited" : "step.opened",
    detail: { updated: Boolean(step.opened_version ?? step.saved_version) && (step.opened_version ?? step.saved_version) !== item.version },
    at: now,
  });
  // A Topic knows the way back to the path.
  return { href: item.kind === "topic" ? `${item.href}?discovery=${row.id}` : item.href };
}

// ---------------------------------------------------------------------------------------------
// Suggestions for a goal
// ---------------------------------------------------------------------------------------------

export const suggestionsAvailable = () => ({ ai: claudeConfigured() || openaiReady() });

type AiReply = { steps?: { id?: string; fit?: string; reason?: string }[] };

export function suggestionPrompt(input: { goal: string; experience: Experience | null; minutes: number | null; role: string; lines: string[] }) {
  return `You help a learner on the Trilogy Care Partner Hub (training for Australian aged care partners, care coordinators and staff) choose a short route through learning the Hub has ALREADY published. You do not write learning, and you do not answer the learner's question.

The learner's goal, in their words: "${input.goal}"
Their role: ${input.role}${input.experience ? `\nTheir experience with this: ${EXPERIENCE[input.experience]}` : ""}${input.minutes ? `\nTime they have now: about ${input.minutes} minutes` : ""}

The only items you may choose from (id | format | minutes | title | what it covers):
${input.lines.join("\n")}

Choose the items that help with this goal, in the order to do them: usually a short Topic to understand it, then a worked Magazine page or a course to practise. Rules:
- Use only ids from the list, exactly as written. Never invent an item.
- At most ${SUGGEST_MAX} steps. Fewer is better than padding: leave out anything only loosely related.
- For each step give "fit". "direct": the item itself teaches the specific thing the goal names (that task, document, piece of equipment or situation), going by its title and what it covers. "related": it only covers the wider area, and the specific thing in the goal isn't named or clearly taught in it. Be strict: when unsure, it is "related". General safety learning is only "related" to a goal about one named piece of equipment.
- If nothing in the list helps with this goal at all, return "steps": [].
- Don't choose a course and one of its own pages together.${
    input.minutes
      ? `
- Keep the total close to ${input.minutes} minutes.`
      : ""
  }
- "reason": one plain sentence (at most 25 words) on why this item helps with the goal, based only on its title and what it covers. Don't state policy, rules, rates or timeframes, and don't say it covers something its title and description don't mention.

Reply with JSON only: {"steps": [{"id": "...", "fit": "direct", "reason": "..."}]}`;
}

/** The model's choice from the candidates it was given, or null when it isn't connected or doesn't come back usable. */
async function aiRoute(input: { goal: string; experience: Experience | null; minutes: number | null; role: string }, candidates: IndexedItem[]) {
  const ids = new Set(candidates.map((c) => c.key));
  // A model sometimes drops the "topic:" in front of an id. It's still only ever matched to an item it was given.
  const resolve = (id: unknown) => (typeof id !== "string" ? null : ([id, `topic:${id}`, `course:${id}`].find((k) => ids.has(k)) ?? null));
  const lines = candidates.map((c) => `${c.key} | ${c.kind === "page" ? "Magazine page" : c.kind} | ${c.minutes} | ${c.title} | ${c.summary.slice(0, 180)}`);
  const prompt = suggestionPrompt({ ...input, lines });
  const check = (v: unknown) => {
    const r = v as AiReply;
    const issues: string[] = [];
    if (!r || typeof r !== "object" || !Array.isArray(r.steps)) return ['Reply with an object that has a "steps" array.'];
    if (r.steps.length > SUGGEST_MAX) issues.push(`At most ${SUGGEST_MAX} steps.`);
    for (const s of r.steps) {
      if (!resolve(s?.id)) issues.push(`"${String(s?.id)}" isn't an id from the list. Copy the whole id, including the part before the colon.`);
      if (typeof s?.reason !== "string" || !s.reason.trim()) issues.push(`Give a reason for ${String(s?.id)}.`);
      if (s?.fit !== "direct" && s?.fit !== "related") issues.push(`"fit" for ${String(s?.id)} is "direct" or "related".`);
    }
    if (new Set(r.steps.map((s) => resolve(s?.id))).size !== r.steps.length) issues.push("Each item once.");
    return issues;
  };
  try {
    const useClaude = claudeConfigured();
    const value = useClaude
      ? (await askForJson<AiReply>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase: () => {} }, "low")).value
      : await openaiJson<AiReply>(prompt, check);
    const steps = (value.steps ?? []).map((s) => ({ ...s, id: resolve(s.id) ?? undefined }));
    return { value: { steps }, engine: useClaude ? "ai:claude" : `ai:${openaiTextModel()}` };
  } catch (e) {
    console.error("Discovery suggestion fell back to rules:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
  A suggested route for a goal. The catalogue is filtered to what this person may open before anything
  is ranked or sent to a model, and whatever comes back is checked against that same catalogue. With no
  model, or if it fails, the rule-based route stands. An empty route is a real answer: nothing is padded.
*/
export async function suggest(db: Db, user: User, input: Record<string, unknown>, now: Date, opts: { ai?: boolean } = {}) {
  ensureDiscovery(db);
  const goal = text(input.goal, MAX_GOAL);
  if (goal.length < 3) throw new HttpError(400, "Say what you’d like to feel more confident doing.");
  const experience = experienceOf(input.experience);
  const minutes = minutesOf(input.minutes);
  const exclude = (Array.isArray(input.exclude) ? input.exclude : []).filter((x): x is string => typeof x === "string").slice(0, 60);
  const cat = catalogue(db, user);
  const rules = buildRoute(cat.items, goal, { experience, minutes, exclude });
  let route: { title: string; purpose: string; steps: RouteStep[] } = rules;
  let engine = "rules-1";
  /** Learning in the same area that isn't about the goal itself: shown as "closest", never as the route. */
  let nearby: RouteStep[] = [];

  if ((opts.ai ?? true) && suggestionsAvailable().ai) {
    // The best keyword matches first, then the rest, so a goal worded differently from the content can still be met.
    const skip = new Set(exclude);
    const ranked = rules.considered.map((s) => s.item);
    const candidates = [...ranked, ...cat.items.filter((i) => !ranked.includes(i))].filter((i) => !skip.has(i.key)).slice(0, 150);
    const reply = candidates.length ? await aiRoute({ goal, experience, minutes, role: user.audience }, candidates) : null;
    if (reply) {
      const chosen: RouteStep[] = [];
      const courses = new Set<string>();
      for (const s of reply.value.steps ?? []) {
        const item = s.id ? cat.byKey.get(s.id) : undefined;
        if (!item || skip.has(item.key) || chosen.some((c) => c.key === item.key) || nearby.some((c) => c.key === item.key)) continue;
        // Only what's about the goal itself becomes a step. The wider area is offered separately, and only when there's no route.
        if (s.fit !== "direct") {
          nearby.push({ key: item.key, reason: text(s.reason, 300) });
          continue;
        }
        if (item.kind === "course") courses.add(item.ref);
        chosen.push({ key: item.key, reason: text(s.reason, 300) });
      }
      // A course and its own page aren't both steps.
      const steps = chosen.filter((c) => !(cat.byKey.get(c.key)!.kind === "page" && courses.has(cat.byKey.get(c.key)!.ref))).slice(0, SUGGEST_MAX);
      // Close to the time they have: later steps go while the route runs well over (the first always stays).
      const total = (list: RouteStep[]) => list.reduce((n, c) => n + cat.byKey.get(c.key)!.minutes, 0);
      while (minutes && steps.length > 1 && total(steps) > minutes * 1.5) steps.pop();
      // The name and purpose are the learner's own goal, never the model's wording: it can't imply the Hub covers something it doesn't.
      route = { title: rules.title, purpose: steps.length ? routePurpose(goal) : "", steps };
      nearby = steps.length ? [] : nearby.slice(0, 3);
      engine = reply.engine;
    }
  }

  const id = `dr-${randomUUID().slice(0, 12)}`;
  db.prepare(
    "INSERT INTO discovery_recommendations (id, user_id, goal_words, audience, experience, minutes, considered, offered, engine, outcome, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    user.id,
    goalWords(goal).join(" "),
    user.audience,
    experience,
    minutes,
    JSON.stringify(rules.considered.slice(0, 20).map((s) => ({ key: s.item.key, score: Math.round(s.score * 10) / 10 }))),
    JSON.stringify(route.steps),
    engine,
    route.steps.length ? "offered" : "empty",
    now.toISOString(),
  );
  event(db, {
    user: user.id,
    event: route.steps.length ? "suggestion.offered" : "suggestion.empty",
    detail: { steps: route.steps.length, engine, again: exclude.length > 0 },
    at: now,
  });
  const steps = route.steps.map((s) => ({ ...s, item: shown(cat.byKey.get(s.key)!) }));
  return {
    id,
    goal,
    experience,
    minutes,
    title: route.title,
    purpose: route.purpose,
    steps,
    totalMinutes: steps.reduce((n, s) => n + s.item.minutes, 0),
    engine: engine === "rules-1" ? ("rules" as const) : ("ai" as const),
    /** With no route: the closest published learning, which isn't about the goal itself. */
    nearby: nearby.map((s) => ({ ...s, item: shown(cat.byKey.get(s.key)!) })),
    /** Asked for another and there's nothing else that fits. */
    again: exclude.length > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Asking for a topic the Hub doesn't have yet
// ---------------------------------------------------------------------------------------------

type RequestRow = {
  id: string;
  user_id: string;
  goal: string;
  context: string;
  audience: string;
  state: RequestState;
  note: string;
  link: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

/** Sends the goal to the content owners' queue. Asking twice for the same thing keeps the one request. */
export function requestTopic(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureDiscovery(db);
  const goal = text(input.goal, MAX_GOAL);
  if (goal.length < 3) throw new HttpError(400, "Say what you were hoping to learn.");
  const mine = db.prepare("SELECT * FROM discovery_requests WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as RequestRow[];
  const same = mine.find((r) => r.goal.toLowerCase() === goal.toLowerCase());
  if (!same) {
    const open = mine.filter((r) => r.state === "new" || r.state === "reviewing").length;
    if (open >= 10) throw new HttpError(400, "You have 10 requests waiting. We’ll get to those first.");
    const id = `dq-${randomUUID().slice(0, 12)}`;
    db.prepare("INSERT INTO discovery_requests (id, user_id, goal, context, audience, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      user.id,
      goal,
      text(input.context, 500),
      user.audience,
      now.toISOString(),
    );
    event(db, { user: user.id, event: "request.sent", at: now });
  }
  return {
    requests: (db.prepare("SELECT * FROM discovery_requests WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as RequestRow[]).map(requestView),
  };
}

// ---------------------------------------------------------------------------------------------
// Content owners: Discovery gaps
// ---------------------------------------------------------------------------------------------

/** A goal's words are only shown to authors once this many different people have asked for something like it. */
export const GAP_MIN_PEOPLE = 2;
const GAP_DAYS = 90;

/**
  What learners are looking for and not finding, for content owners. Aggregates only: no one's paths,
  goals or notes. Goals with no result appear as their key words, and only once more than one person has
  asked; a request is shown in full because the learner chose to send it, without their name.
*/
export function discoveryGaps(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureDiscovery(db);
  const since = new Date(now.getTime() - GAP_DAYS * 86_400_000).toISOString();
  const empties = db.prepare("SELECT user_id, goal_words, audience, at FROM discovery_recommendations WHERE outcome = 'empty' AND at >= ?").all(since) as {
    user_id: string;
    goal_words: string;
    audience: string;
    at: string;
  }[];
  const groups = new Map<string, { words: string; people: Set<string>; times: number; last: string; audiences: Set<string> }>();
  for (const e of empties) {
    const words = e.goal_words.split(" ").filter(Boolean).sort().join(" ");
    if (!words) continue;
    const g = groups.get(words) ?? { words, people: new Set(), times: 0, last: e.at, audiences: new Set() };
    g.people.add(e.user_id);
    g.audiences.add(e.audience);
    g.times += 1;
    if (e.at > g.last) g.last = e.at;
    groups.set(words, g);
  }
  const all = [...groups.values()];
  const noResult = all
    .filter((g) => g.people.size >= GAP_MIN_PEOPLE)
    .map((g) => ({ words: g.words, people: g.people.size, times: g.times, lastAt: g.last, audiences: [...g.audiences].sort() }))
    .sort((a, b) => b.people - a.people || b.lastAt.localeCompare(a.lastAt));

  // The words that come up most across goals with no result, whoever asked: single words, so nothing reads as someone's goal.
  const wordPeople = new Map<string, Set<string>>();
  for (const e of empties) for (const w of new Set(e.goal_words.split(" ").filter(Boolean))) wordPeople.set(w, (wordPeople.get(w) ?? new Set()).add(e.user_id));
  const words = [...wordPeople]
    .filter(([, people]) => people.size >= GAP_MIN_PEOPLE)
    .map(([word, people]) => ({ word, people: people.size }))
    .sort((a, b) => b.people - a.people || a.word.localeCompare(b.word))
    .slice(0, 30);

  const saved = (
    db
      .prepare(
        `SELECT s.kind, s.ref, s.page_id, MAX(s.title) AS title, MAX(s.parent_title) AS parent, COUNT(DISTINCT p.user_id) AS people,
                SUM(s.revisit) AS revisit, SUM(s.reviewed_at IS NOT NULL) AS reviewed
         FROM discovery_steps s JOIN discovery_paths p ON p.id = s.path_id
         GROUP BY s.kind, s.ref, s.page_id ORDER BY people DESC, title LIMIT 20`,
      )
      .all() as {
      kind: "topic" | "course" | "page";
      ref: string;
      page_id: string;
      title: string;
      parent: string | null;
      people: number;
      revisit: number;
      reviewed: number;
    }[]
  ).map((r) => ({
    key: itemKey(r.kind, r.ref, r.page_id),
    kind: r.kind,
    title: r.title,
    parent: r.parent,
    people: r.people,
    revisit: r.revisit,
    reviewed: r.reviewed,
  }));

  const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const ev = (name: string) => count("SELECT COUNT(*) AS n FROM discovery_events WHERE event = ? AND at >= ?", name, since);
  const requests = (db.prepare("SELECT * FROM discovery_requests ORDER BY state = 'new' DESC, created_at DESC").all() as RequestRow[]).map((r) => ({
    ...requestView(r),
    audience: r.audience,
    handledAt: r.handled_at,
    handledBy: r.handled_by ? ((db.prepare("SELECT name FROM users WHERE id = ?").get(r.handled_by) as { name: string } | undefined)?.name ?? null) : null,
  }));
  return {
    days: GAP_DAYS,
    minPeople: GAP_MIN_PEOPLE,
    totals: {
      people: count("SELECT COUNT(DISTINCT user_id) AS n FROM discovery_paths"),
      paths: count("SELECT COUNT(*) AS n FROM discovery_paths"),
      explored: count("SELECT COUNT(*) AS n FROM discovery_paths WHERE explored_at IS NOT NULL"),
      suggested: count("SELECT COUNT(*) AS n FROM discovery_recommendations WHERE at >= ?", since),
      accepted: count("SELECT COUNT(*) AS n FROM discovery_recommendations WHERE outcome = 'accepted' AND at >= ?", since),
      edited: count("SELECT COUNT(*) AS n FROM discovery_recommendations WHERE outcome = 'edited' AND at >= ?", since),
      empty: empties.length,
      opened: ev("step.opened") + ev("step.revisited"),
      reviewed: ev("step.reviewed"),
      // Saved from a Topic's or Magazine page's own screen: into a path they had, or a new one started with it.
      savedElsewhere: count(
        `SELECT COUNT(*) AS n FROM discovery_events
         WHERE ((event = 'step.added' AND detail LIKE '%"from":"content"%') OR (event = 'path.created' AND detail LIKE '%"from":"item"%')) AND at >= ?`,
        since,
      ),
      suggestedRemoved: count(
        "SELECT COUNT(*) AS n FROM discovery_events WHERE event = 'step.removed' AND detail LIKE '%\"suggested\":true%' AND at >= ?",
        since,
      ),
    },
    noResult,
    /** Goals with no result that only one person asked: counted, never shown. */
    hidden: all.length - noResult.length,
    words,
    saved,
    requests,
    states: REQUEST_STATES,
    phases: PHASES,
  };
}

/** A content owner moves a request on, records what was done, and can tidy its wording (to take out a client's details). */
export function handleRequest(db: Db, actor: User, id: unknown, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureDiscovery(db);
  const row = typeof id === "string" ? (db.prepare("SELECT * FROM discovery_requests WHERE id = ?").get(id) as RequestRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That request isn’t here.");
  const state = input.state === undefined ? row.state : (Object.keys(REQUEST_STATES) as RequestState[]).find((s) => s === input.state);
  if (!state) throw new HttpError(400, "Choose what’s happening with this request.");
  const goal = input.goal === undefined ? row.goal : text(input.goal, MAX_GOAL);
  if (!goal) throw new HttpError(400, "Keep what was asked for, without the personal details.");
  const context = input.context === undefined ? row.context : text(input.context, 500);
  const note = input.note === undefined ? row.note : text(input.note, 500);
  const link = input.link === undefined ? row.link : text(input.link, 200) || null;
  // Only a page on the Hub: the learner is shown this as somewhere to go.
  if (link && !/^\/(topics|magazine)\/[\w\-/]+$/.test(link)) throw new HttpError(400, "Link a Topic or Magazine page on the Hub, like /topics/its-name.");
  if (state === "published" && !link) throw new HttpError(400, "Add the link to what was published, so the learner can open it.");
  db.prepare("UPDATE discovery_requests SET state = ?, goal = ?, context = ?, note = ?, link = ?, handled_by = ?, handled_at = ? WHERE id = ?").run(
    state,
    goal,
    context,
    note,
    link,
    actor.id,
    now.toISOString(),
    row.id,
  );
  audit(db, {
    actor: actor.id,
    event: "discovery.request",
    entity: `discovery_request:${row.id}`,
    // Whether the wording was tidied, not the wording.
    previous: { state: row.state, link: row.link },
    next: { state, link, reworded: goal !== row.goal || context !== row.context },
    at: now,
  });
  return discoveryGaps(db, actor, now);
}
