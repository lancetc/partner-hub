import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type HazardScanBlock } from "@/lib/magazine";
import {
  askedDecisions,
  buildDebrief,
  chooseVariant,
  cleanDecisions,
  cleanFlags,
  cleanPriority,
  decisionsFor,
  DIM_ORDER,
  eligibleVariants,
  emptyScanState,
  hazardScanForReaders,
  learnerVariant,
  roleFor,
  SCENE_ROLES,
  SCENE_VERSION,
  SCORER_VERSION,
  scoreFindings,
  sourcesOf,
  type Debrief,
  type Decision,
  type Dim,
  type Findings,
  type SceneRole,
  type ScanState,
  type ScanStatus,
  type ScanView,
  type Variant,
} from "@/lib/hazardScan";
import { hazardSource, sourceStatus } from "@/lib/hazardSources";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { demoEditionOf } from "./demoSignOff";

/*
  Spot the Hazard on the server (docs/spot-the-hazard.md).

  - Starting an attempt picks an approved variant the learner is eligible for (their role, current sources, complete
    review), from a repeatable seed, preferring one they haven't seen. The variant and the actions they'll be asked are
    frozen on the attempt with their versions and a hash, so a refresh resumes the same room and a later edit never
    changes a historical result. A republished course starts a fresh attempt.
  - The browser gets the room to draw and neutral descriptions only. Flags are kept only for objects in the frozen room
    (duplicates count once), and scoring runs here on the frozen answer key, so tampering with what the page holds
    can't earn anything.
  - The order is enforced: findings, then the action, then the debrief. Completion needs the debrief viewed. A resent
    start, submit or retry returns what's already there.
  - Events carry ids, counts, levels, versions and the route used (picture or list): never free text, and never where
    the learner is. The table is created here (ensureHazardScanTables), not in server/db, so a running server picks it up.

  No AI is called anywhere here.
*/

export const HAZARD_SCAN_SCHEMA = `
CREATE TABLE IF NOT EXISTS hazardscan_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, family_id TEXT NOT NULL, release TEXT NOT NULL, variant_id TEXT NOT NULL,
  variant_version INTEGER NOT NULL, variant_hash TEXT NOT NULL, scene_version TEXT NOT NULL, scorer_version TEXT NOT NULL,
  mode TEXT NOT NULL, role TEXT NOT NULL, seed TEXT NOT NULL, repeat INTEGER NOT NULL DEFAULT 0,
  place TEXT NOT NULL DEFAULT 'magazine', variant TEXT NOT NULL, decisions TEXT NOT NULL, state TEXT NOT NULL,
  findings TEXT, result TEXT, status TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  found_at TEXT, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS hazardscan_attempts_guide ON hazardscan_attempts (guide_id, block_id);
`;
const ready = new WeakSet<object>();
export function ensureHazardScanTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(HAZARD_SCAN_SCHEMA);
  ready.add(db);
}

type Status = Exclude<ScanStatus, "new">;
type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  family_id: string;
  release: string;
  variant_id: string;
  variant_version: number;
  variant_hash: string;
  scene_version: string;
  scorer_version: string;
  mode: string;
  role: SceneRole;
  seed: string;
  repeat: number;
  place: string;
  variant: string;
  decisions: string;
  state: string;
  findings: string | null;
  result: string | null;
  status: Status;
  started_at: string;
  updated_at: string;
  found_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
};
type State = ScanState;
const emptyState = emptyScanState;

const today = (now: Date) => now.toISOString().slice(0, 10);
const placeOf = (v: unknown) => (typeof v === "string" && /^topic:[a-z0-9-]{1,80}$/.test(v) ? v : "magazine");
const routeOf = (v: unknown): "image" | "list" => (v === "list" ? "list" : "image");
const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureHazardScanTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "hazardscan") throw new HttpError(404, "That Spot the Hazard scene isn’t here.");
  // Published under a demo sign-off: its unreviewed rooms can be used (server/demoSignOff).
  return { edition, block, demo: Boolean(demoEditionOf(db, edition.revision.id)) };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM hazardscan_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM hazardscan_attempts WHERE id = ?").get(id) as Row;
const stateOf = (a: Row): State => ({ ...emptyState(), ...(JSON.parse(a.state) as Partial<State>) });
const frozen = (a: Row) => ({ variant: JSON.parse(a.variant) as Variant, decisions: JSON.parse(a.decisions) as Decision[] });
/** The block as it was when the attempt started: only what scoring needs, from the frozen copy. */
const frozenBlock = (block: HazardScanBlock, a: Row) => {
  const f = frozen(a);
  return { ...block, mode: a.mode as "practice" | "assessed", familyId: a.family_id, release: a.release, decisions: f.decisions, variants: [f.variant] };
};

/** One event in the Hub's activity log: ids, counts and versions only, with a key so a consumer counts it once. */
function log(db: Db, a: Row, event: string, detail: object, now: Date, key = "") {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({
      key: `${a.id}:${event}${key ? `:${key}` : ""}`,
      attempt: a.id,
      attemptNo: a.attempt_no,
      family: a.family_id,
      release: a.release,
      variant: a.variant_id,
      variantVersion: a.variant_version,
      variantHash: a.variant_hash,
      scorer: a.scorer_version,
      mode: a.mode,
      role: a.role,
      place: a.place,
      ...detail,
    }),
  );
}

function view(db: Db, a: Row | undefined, block: HazardScanBlock, user: User, now: Date, demo = false): ScanView {
  const role = a?.role ?? roleFor(block, user.audience, user.service_role);
  const available = eligibleVariants(block, role, today(now), { demo }).length > 0;
  if (!a)
    return {
      attemptId: null,
      attemptNo: 0,
      status: "new",
      role,
      roleLabel: SCENE_ROLES[role],
      available,
      variant: null,
      repeat: false,
      state: emptyState(),
      findings: null,
      questions: [],
      debrief: null,
      attempts: 0,
      versions: { scene: SCENE_VERSION, scorer: SCORER_VERSION, family: block.familyId, release: block.release, variant: "", variantVersion: 0 },
    };
  const st = stateOf(a);
  const fb = frozenBlock(block, a);
  const v = fb.variants[0];
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    role,
    roleLabel: SCENE_ROLES[role],
    available,
    variant: learnerVariant(block, v),
    repeat: a.repeat === 1,
    state: st,
    /** The reveal, once findings are submitted: found, worth another look, and not a hazard in this context. */
    findings: a.findings ? (JSON.parse(a.findings) as Findings) : null,
    questions: a.status === "active" ? [] : askedDecisions(fb, v, a.role, st.flags),
    /** The debrief this attempt was given, as it was given: never recomputed. */
    debrief: a.result ? (JSON.parse(a.result) as Debrief) : null,
    attempts: (
      db
        .prepare("SELECT COUNT(*) AS n FROM hazardscan_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?")
        .get(a.user_id, a.guide_id, a.block_id) as {
        n: number;
      }
    ).n,
    versions: {
      scene: a.scene_version,
      scorer: a.scorer_version,
      family: a.family_id,
      release: a.release,
      variant: a.variant_id,
      variantVersion: a.variant_version,
    },
  };
}
export type HazardScanView = ScanView & { block?: HazardScanBlock; guideId?: string };

/** The learner's own attempt. With `embed` (a Topic card), the readers' copy of the block comes with it. */
export function hazardScanState(db: Db, user: User, guideId: string, blockId: unknown, opts: { embed?: boolean } = {}, now = new Date()): HazardScanView {
  const { edition, block, demo } = load(db, user, guideId, blockId);
  const v = view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block, user, now, demo);
  return opts.embed ? { ...v, block: hazardScanForReaders(block), guideId: edition.guide.id } : v;
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: HazardScanBlock, attemptNo: number, now: Date, place: string, demo = false) {
  const role = roleFor(block, user.audience, user.service_role);
  const pool = eligibleVariants(block, role, today(now), { demo });
  // Every variant seen by this person on this block, in any edition, oldest first: a retry prefers one they haven't.
  const seen = (
    db
      .prepare("SELECT variant_id FROM hazardscan_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ? ORDER BY started_at, attempt_no")
      .all(user.id, guideId, block.id) as {
      variant_id: string;
    }[]
  ).map((r) => r.variant_id);
  const seed = hash([user.id, guideId, revisionId, block.id, attemptNo]);
  const pickd = chooseVariant(pool, seen, seed);
  if (!pickd) throw new HttpError(410, "This scene is being reviewed, so there’s no room to scan right now.");
  const v = pickd.variant;
  const decisions = decisionsFor(block, v, role).map((x) => ({ ...x.decision, options: x.options }));
  const id = `hz-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO hazardscan_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, family_id, release, variant_id, variant_version, variant_hash, scene_version, scorer_version, mode, role, seed, repeat, place, variant, decisions, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    guideId,
    revisionId,
    block.id,
    user.id,
    attemptNo,
    block.familyId,
    block.release,
    v.id,
    v.version,
    hash({ v, decisions }),
    SCENE_VERSION,
    SCORER_VERSION,
    block.mode,
    role,
    seed,
    pickd.repeat ? 1 : 0,
    place,
    JSON.stringify(v),
    JSON.stringify(decisions),
    JSON.stringify(emptyState()),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id)!;
  if (row.id === id) log(db, row, "activity_started", { repeat: pickd.repeat, eligible: pool.length }, now);
  return row;
}

/** Start the scan (or resume it): the variant is chosen and frozen now. A resent start returns the same attempt. */
export function startHazardScan(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id) ??
      create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place), demo);
    return view(db, a, block, user, now, demo);
  });
}

/** Saves the flags, their reasons, the priority and the route (picture or list), while the scan is open. */
export function saveHazardScan(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the scan first.");
    if (a.status !== "active") return view(db, a, block, user, now, demo);
    const prev = stateOf(a);
    const v = frozen(a).variant;
    const flags = input.flags === undefined ? prev.flags : cleanFlags(v, input.flags);
    const route = input.route === undefined ? prev.route : routeOf(input.route);
    const next: State = {
      ...prev,
      flags,
      priority: cleanPriority(v, flags, input.priority === undefined ? prev.priority : input.priority),
      route,
      routes: [...new Set([...prev.routes, route])],
    };
    db.prepare("UPDATE hazardscan_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now.toISOString(), a.id);
    const before = new Set(prev.flags.map((f) => f.id));
    const after = new Set(next.flags.map((f) => f.id));
    const added = [...after].filter((x) => !before.has(x)).length;
    const removed = [...before].filter((x) => !after.has(x)).length;
    if (added || removed) log(db, a, "scene_selection_changed", { flags: after.size, added, removed, route }, now, String(now.getTime()));
    if (route !== prev.route) log(db, a, "scene_route_switched", { to: route }, now, `${route}:${now.getTime()}`);
    return view(db, reread(db, a.id), block, user, now, demo);
  });
}

/** Submit findings: scored on the server against the frozen answer key, and revealed. The action questions come next. */
export function submitFindings(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the scan first.");
    if (a.status !== "active") return view(db, a, block, user, now, demo);
    const prev = stateOf(a);
    const v = frozen(a).variant;
    const flags = input.flags === undefined ? prev.flags : cleanFlags(v, input.flags);
    const st: State = { ...prev, flags, priority: cleanPriority(v, flags, input.priority === undefined ? prev.priority : input.priority) };
    if (st.flags.length && !st.priority) throw new HttpError(400, "Say which you’d deal with first, or that you’re not sure.");
    const f = scoreFindings(v, st.flags, st.priority);
    const at = now.toISOString();
    db.prepare("UPDATE hazardscan_attempts SET state = ?, findings = ?, status = 'found', updated_at = ?, found_at = ? WHERE id = ?").run(
      JSON.stringify(st),
      JSON.stringify(f),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "findings_submitted",
      {
        found: f.found.map((x) => x.id),
        missed: f.missed.map((x) => x.id),
        mistaken: f.mistaken.map((x) => x.id),
        recognition: f.recognition,
        priority: f.priority,
        indiscriminate: f.indiscriminate,
        missedCritical: f.missedCritical,
        routes: st.routes.length ? st.routes : [st.route],
      },
      now,
    );
    return view(db, reread(db, a.id), block, user, now, demo);
  });
}

/** Submit the action: the debrief is built and kept as given. In practice mode nothing here is a pass. */
export function submitResponse(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status === "active") throw new HttpError(409, "Submit your findings first.");
    if (a.status !== "found") return view(db, a, block, user, now, demo);
    const st = stateOf(a);
    const fb = frozenBlock(block, a);
    const v = fb.variants[0];
    const asked = askedDecisions(fb, v, a.role, st.flags);
    const chosen = cleanDecisions(asked, input.chosen);
    if (asked.some((q) => !chosen[q.id])) throw new HttpError(400, "Choose what you’d do for each question.");
    const d = buildDebrief(fb, v, a.role, st.flags, st.priority, chosen);
    const at = now.toISOString();
    db.prepare("UPDATE hazardscan_attempts SET state = ?, result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify({ ...st, chosen }),
      JSON.stringify(d),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "response_submitted",
      {
        chosen,
        verdicts: Object.fromEntries(d.decisions.map((x) => [x.id, x.chosen?.verdict ?? ""])),
        ignores: [...new Set(d.decisions.flatMap((x) => x.chosen?.ignores ?? []))],
        levels: d.levels,
      },
      now,
    );
    return view(db, reread(db, a.id), block, user, now, demo);
  });
}

/** The debrief has been viewed: the visual practice is complete. Once only, and never an assessment pass. */
export function viewedHazardScan(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block, user, now, demo);
    db.prepare("UPDATE hazardscan_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(
      now.toISOString(),
      now.toISOString(),
      a.id,
    );
    const d = JSON.parse(a.result ?? "{}") as Debrief;
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { signal: "visual_practice_completed", levels: d.levels }, now);
    return view(db, reread(db, a.id), block, user, now, demo);
  });
}

/** Try another room: a fresh attempt, preferring a variant this person hasn't seen. The finished one is kept as it is. */
export function retryHazardScan(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) return view(db, create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place), demo), block, user, now, demo);
    // A resent retry, or one while an attempt is still open, returns the open attempt.
    if (a.status === "active" || a.status === "found") return view(db, a, block, user, now, demo);
    if (typeof input.from === "string" && input.from !== a.id) return view(db, a, block, user, now, demo);
    const row = create(db, user, edition.guide.id, edition.revision.id, block, a.attempt_no + 1, now, placeOf(input.place), demo);
    log(db, row, "retry_started", { from: a.id, previous: a.variant_id, repeat: row.repeat === 1 }, now);
    return view(db, reread(db, row.id), block, user, now, demo);
  });
}

/** A learner says an item seemed unclear after the reveal: a QA signal for the content owner, by item id only. */
export function reportUnclear(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, demo } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status === "active") throw new HttpError(409, "You can say an item was unclear once you’ve seen the answers.");
    const v = frozen(a).variant;
    const item = typeof input.item === "string" && v.objects.some((o) => o.id === input.item) ? input.item : "";
    if (!item) throw new HttpError(400, "That isn’t in your room.");
    const st = stateOf(a);
    if (!st.unclear.includes(item)) {
      db.prepare("UPDATE hazardscan_attempts SET state = ? WHERE id = ?").run(JSON.stringify({ ...st, unclear: [...st.unclear, item] }), a.id);
      log(db, a, "item_unclear_reported", { item }, now, item);
    }
    return view(db, reread(db, a.id), block, user, now, demo);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors and Quality: totals by variant and item, and where every scene is live
// ---------------------------------------------------------------------------------------------

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors and Quality reviewers, per block and variant: attempts, people, completion, retries,
  repeats, the route used; and, with enough people on a variant, found / missed / mistaken per item, action choices and
  items reported unclear. Never anything a learner typed (there's nothing to type), and never who did what.
*/
export function hazardScanStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureHazardScanTables(db);
  const rows = db.prepare("SELECT * FROM hazardscan_attempts WHERE guide_id = ? ORDER BY attempt_no").all(guideId) as Row[];
  const blocks = new Map<string, Row[]>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return {
    blocks: [...blocks.entries()].map(([blockId, rs]) => {
      const variants = new Map<string, Row[]>();
      for (const r of rs) variants.set(`${r.variant_id}@${r.variant_version}`, [...(variants.get(`${r.variant_id}@${r.variant_version}`) ?? []), r]);
      const routes = { image: 0, list: 0, both: 0 };
      for (const r of rs.filter((x) => x.findings)) {
        const used = stateOf(r).routes;
        if (used.includes("image") && used.includes("list")) routes.both += 1;
        else if (used.includes("list")) routes.list += 1;
        else routes.image += 1;
      }
      return {
        blockId,
        attempts: rs.length,
        people: new Set(rs.map((r) => r.user_id)).size,
        submitted: rs.filter((r) => r.findings).length,
        completed: rs.filter((r) => r.status === "completed").length,
        retries: rs.filter((r) => r.attempt_no > 1).length,
        repeats: rs.filter((r) => r.repeat === 1).length,
        routes,
        variants: [...variants.entries()].map(([key, vs]) => {
          const [variantId, version] = key.split("@");
          const done = vs.filter((r) => r.findings);
          const people = new Set(done.map((r) => r.user_id)).size;
          const small = people < SMALL_COHORT;
          const v = frozen(vs[0]).variant;
          const items = v.objects.map((o) => {
            let found = 0;
            let missed = 0;
            let mistaken = 0;
            let unclear = 0;
            for (const r of done) {
              const f = JSON.parse(r.findings!) as Findings;
              if (f.found.some((x) => x.id === o.id)) found += 1;
              if (f.missed.some((x) => x.id === o.id)) missed += 1;
              if (f.mistaken.some((x) => x.id === o.id)) mistaken += 1;
              if (stateOf(r).unclear.includes(o.id)) unclear += 1;
            }
            return { id: o.id, label: o.label, hazard: o.key.hazard, found, missed, mistaken, unclear };
          });
          const choices: Record<string, number> = {};
          for (const r of vs.filter((x) => x.result)) for (const id of Object.values(stateOf(r).chosen)) choices[id] = (choices[id] ?? 0) + 1;
          const levels = Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>;
          for (const r of vs.filter((x) => x.result)) {
            const d = JSON.parse(r.result!) as Debrief;
            for (const k of DIM_ORDER) levels[k][d.levels[k]] += 1;
          }
          return {
            variantId,
            version: Number(version),
            attempts: vs.length,
            submitted: done.length,
            people,
            suppressed: small,
            items: small ? null : items,
            choices: small ? null : choices,
            levels: small ? null : levels,
          };
        }),
      };
    }),
  };
}

type GuideRow = { id: string; slug: string; title: string; doc: string };
function publishedScenes(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"hazardscan\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is HazardScanBlock => b.type === "hazardscan")
      .map((b) => ({ guide: g, block: b })),
  );
}

/** Topics whose published version places a scene on a card. */
function topicPlacements(db: Db) {
  const rows = db
    .prepare("SELECT slug, published FROM authored_lessons WHERE published IS NOT NULL AND published LIKE '%\"sceneRef\"%' AND deleted_at IS NULL")
    .all() as { slug: string; published: string }[];
  return rows.flatMap((r) => {
    const l = JSON.parse(r.published) as { title?: string; nodes?: Record<string, { id: string; sceneRef?: { guide: string; block: string } }> };
    return Object.values(l.nodes ?? {})
      .filter((n) => n.sceneRef)
      .map((n) => ({ topic: r.slug, title: l.title ?? r.slug, card: n.id, guide: n.sceneRef!.guide, block: n.sceneRef!.block }));
  });
}

/**
  Every published Spot the Hazard scene, for the Topic editor and for Quality: where it's live (the Magazine course and
  any Topic cards), its release, approved variants with their reviewers, how many each role can be given, and every
  source it rests on with that source's status. With `source`, only the scenes that cite it: so a policy change can be
  traced to every live placement.
*/
export function hazardScanPlacements(db: Db, actor: User, now: Date, opts: { source?: string } = {}) {
  requireAuthor(actor);
  const topics = topicPlacements(db);
  const scenes = publishedScenes(db)
    .map(({ guide, block }) => {
      const sources = sourcesOf(block);
      return {
        guide: guide.slug,
        guideId: guide.id,
        guideTitle: guide.title,
        block: block.id,
        title: block.title,
        person: block.person.name,
        family: block.familyId,
        release: block.release,
        variants: block.variants
          .filter((v) => v.status === "approved")
          .map((v) => ({ id: v.id, version: v.version, label: v.label, reviewer: v.review.reviewer, reviewedOn: v.review.reviewedOn })),
        eligible: block.roles.map((role) => ({ role, label: SCENE_ROLES[role], count: eligibleVariants(block, role, today(now)).length })),
        sources: sources.map((id) => ({ id, title: hazardSource(id)?.title ?? id, status: sourceStatus(id, today(now)) })),
        placements: [
          { kind: "magazine" as const, label: `Magazine: ${guide.title}` },
          ...topics
            .filter((t) => (t.guide === guide.slug || t.guide === guide.id) && t.block === block.id)
            .map((t) => ({ kind: "topic" as const, label: `Topic: ${t.title} (card ${t.card})`, topic: t.topic })),
        ],
      };
    })
    .filter((s) => !opts.source || s.sources.some((x) => x.id === opts.source));
  return { scenes };
}
