import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type AuditorBlock } from "@/lib/magazine";
import {
  applyChanges,
  buildDebrief,
  cleanState,
  decisionOf,
  emptyState,
  hashable,
  migrateResult,
  scoreAuditor,
  staleRules,
  submitProblems,
  type AuditResult,
  type AuditState,
  type Decision,
} from "@/lib/auditor";
import { AXES, codeLabel } from "@/lib/auditorVetting";
import { ensureAuditor, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Document Auditor and Contractor Vetting Card (docs/document-auditor.md): saving a learner's marks, and reading a
  submitted attempt against the authored answer key. The rules live in lib/auditor and lib/auditorVetting, so the
  learner's page, the editor's preview and this file all run the same ones.

  - The answer key stays here until the learner has submitted.
  - A submitted attempt is settled: its marks and decision never change, and a resent submit returns it as it is.
    Trying again starts a new attempt.
  - Each attempt keeps its course edition, the answer-key hash, and (in its result) the engine, rubric and pack
    versions, so a later rule change never rescores it.
  - Events go to the Hub's activity log with an idempotency key and versions, and never a learner's words, a document
    value, an ABN or a price: ids, codes and counts only.
  - Nothing here approves a supplier, rejects a real invoice, agrees a price or makes a claim.
*/

export const ENGINE_VERSION = "auditor-engine-2";
const rubricOf = (b: Pick<AuditorBlock, "vetting">) => (b.vetting ? "vetting-rubric-1" : "auditor-rubric-1");
const packOf = (b: Pick<AuditorBlock, "vetting">) => b.vetting?.packVersion ?? "";
/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

type AttemptRow = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  key_hash: string;
  state: string;
  result: string | null;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};
/** What a submitted attempt keeps: the result, and the versions it was read against. */
type Stored = AuditResult & { versions?: { engine: string; rubric: string; pack: string; rules: string[]; keyHash: string } };

/** Changes when the documents, rules or answer key do, so an attempt says which version it was read against. An older case hashes as it always did. */
export const auditorKeyHash = (b: Parameters<typeof hashable>[0]) =>
  createHash("sha1")
    .update(JSON.stringify(hashable(b)))
    .digest("hex")
    .slice(0, 12);

const today = (now: Date) => now.toISOString().slice(0, 10);
/** Whether new attempts can start: an assessed card whose rules are past their review date is stale, and isn't served as current. */
export function auditorUsable(b: AuditorBlock, day: string) {
  if (b.vetting?.mode === "assessed" && staleRules(b, day).length)
    return { ok: false, reason: "This assessed case rests on a rule that’s due for review. It’s held until its owner approves the new version." };
  return { ok: true, reason: "" };
}

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureAuditor(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "auditor") throw new HttpError(404, "That case isn’t here.");
  return { edition, block };
}

const attempts = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM auditor_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC")
    .all(user.id, guideId, revisionId, blockId) as AttemptRow[];

type Who = Pick<AttemptRow, "id" | "user_id" | "guide_id" | "revision_id" | "block_id" | "key_hash">;
const keyOf = (a: Who, event: string, sub: string) => `${a.id}:${event}${sub ? `:${sub}` : ""}`;

/** One event in the Hub's activity log: ids, codes, counts and versions only, with a key so a consumer counts it once. */
function log(db: Db, a: Who, block: AuditorBlock, event: string, detail: object, now: Date, sub = "") {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({
      key: keyOf(a, event, sub),
      attempt: a.id,
      keyHash: a.key_hash,
      pack: packOf(block),
      rubric: rubricOf(block),
      engine: ENGINE_VERSION,
      mode: block.vetting?.mode ?? "formative",
      place: "magazine",
      ...detail,
    }),
  );
}
/** The same, once per key: a resent signal or a refreshed page doesn't count twice. */
function logOnce(db: Db, a: Who, block: AuditorBlock, event: string, detail: object, now: Date, sub = "") {
  const seen = db
    .prepare("SELECT 1 FROM magazine_events WHERE user_id = ? AND guide_id = ? AND block_id = ? AND event = ? AND json_extract(detail, '$.key') = ?")
    .get(a.user_id, a.guide_id, a.block_id, event, keyOf(a, event, sub));
  if (!seen) log(db, a, block, event, detail, now, sub);
  return !seen;
}

const resultOf = (a: AttemptRow | undefined): Stored | null => (a?.status === "finished" && a.result ? (migrateResult(JSON.parse(a.result)) as Stored) : null);

function view(rows: AttemptRow[], block: AuditorBlock, now: Date) {
  const a = rows[0];
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = resultOf(a);
  // A hint on a fresh try, when an earlier one didn't reach a decision with full credit.
  const earlier = rows.find((r) => r.status === "finished" && r.result);
  const missed = earlier ? (JSON.parse(earlier.result!) as AuditResult).decisionCredit !== "full" : false;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    debrief: result ? buildDebrief(block, state, result) : null,
    hint: a?.status !== "finished" && missed && block.hint ? block.hint : null,
    tries: rows.filter((r) => r.status === "finished").length,
    earlierCase: Boolean(a && a.key_hash !== auditorKeyHash(block)),
    usable: auditorUsable(block, today(now)),
    versions: result?.versions ?? { engine: ENGINE_VERSION, rubric: rubricOf(block), pack: packOf(block), rules: [], keyHash: auditorKeyHash(block) },
  };
}

export function auditorState(db: Db, user: User, guideId: string, blockId: unknown, now = new Date()) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: AuditorBlock, now: Date): AttemptRow {
  const a = attempts(db, user, guideId, revisionId, block.id)[0];
  if (a?.status === "active") return a;
  const usable = auditorUsable(block, today(now));
  if (!usable.ok) throw new HttpError(409, usable.reason);
  const id = `au-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO auditor_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, auditorKeyHash(block), JSON.stringify(emptyState()), at, at);
  const row = db.prepare("SELECT * FROM auditor_attempts WHERE id = ?").get(id) as AttemptRow;
  log(db, row, block, a ? "retry_started" : "activity_started", a ? { from: a.id } : {}, now);
  return row;
}

const stored = (a: AttemptRow, block: AuditorBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, state: AuditState, now: Date) =>
  db.prepare("UPDATE auditor_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);

/** Saves the learner's marks and draft decision as they go. A submitted attempt isn't changed. */
export function saveAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    if (a?.status === "finished") return { saved: false };
    const row = a ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    store(db, row, applyChanges(block, stored(row, block), input.state), now);
    return { saved: true };
  });
}

/**
  Submits the marks and decision, scores them against the answer key, and settles the attempt. Idempotent: once the
  latest attempt is submitted, a resent submit (a double click, a refresh) returns it unchanged, with no new attempt,
  score or event. Only Try again starts another.
*/
export function submitAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const latest = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    if (latest?.status === "finished") return { problems: [] };
    const a = latest ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const problems = submitProblems(s, block);
    if (problems.length) {
      store(db, a, s, now);
      return { problems };
    }
    const done: AuditState = { ...s, stage: 1 };
    const keyHash = auditorKeyHash(block);
    const result: Stored = {
      ...scoreAuditor(block, done),
      versions: {
        engine: ENGINE_VERSION,
        rubric: rubricOf(block),
        pack: packOf(block),
        rules: block.rules.map((r) => `${r.id}@${r.effectiveFrom}`),
        keyHash,
      },
    };
    const at = now.toISOString();
    db.prepare("UPDATE auditor_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      keyHash,
      at,
      at,
      a.id,
    );
    const row = { ...a, key_hash: keyHash };
    const v = result.vetting;
    log(
      db,
      row,
      block,
      "response_submitted",
      {
        decision: result.decision,
        credit: result.decisionCredit,
        critical: Boolean(result.critical) || Boolean(v?.critical.length),
        falsePositives: result.falsePositives,
        missed: result.items.filter((i) => i.finding && !i.found).map((i) => i.id),
        flagged: result.items.filter((i) => i.falsePositive).map((i) => i.id),
        marks: done.marks.length,
        ...(v ? { outcome: v.outcome, codes: v.codes } : {}),
      },
      now,
    );
    log(db, row, block, "decision_selected", { decision: result.decision, action: done.action || null }, now);
    if (block.vetting && v) {
      const tagged = (tag: string) =>
        done.marks.filter((m) => block.docs.some((d) => d.fields.some((f) => f.id === m.fieldId && f.tag === tag))).map((m) => m.category);
      const screening = [...tagged("police"), ...tagged("ndis")];
      if (screening.length) log(db, row, block, "screening_route_selected", { categories: screening }, now);
      log(db, row, block, "evidence_requested", { requests: v.requests.asked, missed: v.requests.missed.length, unnecessary: v.requests.unnecessary }, now);
      // Whether the worker can start and which parts the message covers: never the message itself.
      log(db, row, block, "participant_explanation_submitted", { startNow: v.startNow.said, startRight: v.startNow.right, covered: v.covered }, now);
      if (block.vetting.mode === "assessed")
        log(db, row, block, "assessment_attempted", { passed: v.passed, critical: v.critical.length, credit: result.decisionCredit }, now);
    }
    return { problems: [] };
  });
  if (out.problems.length) throw new HttpError(400, `Not yet. ${out.problems.join(" ")}`);
  return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

/** The debrief has been viewed: the activity is complete (and, in assessed mode, passed if it was). Once per attempt. */
export function viewedAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const rows = attempts(db, user, edition.guide.id, edition.revision.id, block.id);
    const a = rows[0];
    const result = resultOf(a);
    if (a && result) {
      if (logOnce(db, a, block, "feedback_viewed", {}, now)) {
        logOnce(db, a, block, "activity_completed", { decision: result.decision, credit: result.decisionCredit }, now);
        if (block.vetting?.mode === "assessed" && result.vetting?.passed) logOnce(db, a, block, "assessment_passed", {}, now);
      }
    }
    return view(rows, block, now);
  });
}

/** After the debrief: the answer to the changed fact. The rest of the attempt stays as submitted. */
export function answerVariant(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const rows = attempts(db, user, edition.guide.id, edition.revision.id, block.id);
    const a = rows[0];
    if (!a || a.status !== "finished") throw new HttpError(400, "Submit your decision first.");
    if (!block.variant) throw new HttpError(400, "This case has no changed fact.");
    const s = stored(a, block);
    if (!s.variant) store(db, a, applyChanges(block, s, { ...s, variant: decisionOf(input.variant) }), now);
    return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  });
}

/** After the debrief: the corrected pack or the renewal, answered once each. Each keeps its own pack version in the event. */
export function answerFollowUp(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const kind = input.kind === "renewal" ? "renewal" : "corrected";
  return tx(db, () => {
    const rows = attempts(db, user, edition.guide.id, edition.revision.id, block.id);
    const a = rows[0];
    if (!a || a.status !== "finished") throw new HttpError(400, "Submit your decision first.");
    const f = block.vetting?.[kind];
    if (!f) throw new HttpError(400, `This case has no ${kind === "renewal" ? "renewal" : "corrected pack"}.`);
    const s = stored(a, block);
    const decision = decisionOf(input.decision);
    if (!s.followUps[kind] && decision) {
      const followUps =
        kind === "renewal"
          ? { ...s.followUps, renewal: decision, renew: Array.isArray(input.renew) ? input.renew : [], newAgreement: input.newAgreement }
          : { ...s.followUps, corrected: decision };
      const next = applyChanges(block, s, { ...s, followUps });
      store(db, a, next, now);
      const right = (next.followUps[kind] as Decision) === f.decision;
      logOnce(
        db,
        a,
        block,
        kind === "renewal" ? "renewal_variant_answered" : "corrected_pack_answered",
        {
          version: f.version,
          decision,
          right,
          ...(kind === "renewal"
            ? {
                renew: next.followUps.renew,
                newAgreement: next.followUps.newAgreement,
                newAgreementRight: f.newAgreement === (next.followUps.newAgreement === "yes"),
              }
            : {}),
        },
        now,
      );
    }
    return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  });
}

/** Specialist signals from the learner's page (PRD section 12): what was opened or checked. Ids only, once each per attempt. */
const SIGNALS = [
  "pack_field_opened",
  "source_checked",
  "price_breakdown_checked",
  "benchmark_context_checked",
  "renewal_variant_started",
  "source_issue_reported",
];
export function signalAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const name = typeof input.name === "string" && SIGNALS.includes(input.name) ? input.name : "";
  if (!name) throw new HttpError(400, "That isn’t a signal this case records.");
  const ref = typeof input.ref === "string" ? input.ref : "";
  const fields = new Set(block.docs.flatMap((d) => d.fields.map((f) => f.id)));
  const valid =
    name === "pack_field_opened"
      ? fields.has(ref) || block.missing.some((m) => m.id === ref)
      : name === "source_checked" || name === "source_issue_reported"
        ? block.rules.some((r) => r.id === ref)
        : name === "renewal_variant_started"
          ? Boolean(block.vetting?.renewal) && !ref
          : Boolean(block.vetting) && !ref;
  if (!valid) throw new HttpError(400, "That isn’t part of this case.");
  return tx(db, () => {
    const latest = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    const a = latest ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const field = name === "pack_field_opened" ? ref : "";
    const rule = name === "source_checked" || name === "source_issue_reported" ? ref : "";
    const version = name === "renewal_variant_started" ? block.vetting?.renewal?.version : undefined;
    const logged = logOnce(db, a, block, name, { ...(field ? { field } : {}), ...(rule ? { rule } : {}), ...(version ? { version } : {}) }, now, ref);
    return { logged };
  });
}

/** Try again: a new attempt, so the submitted one is kept as it was. A resent retry returns the open attempt. */
export function restartAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors: totals, and the decision register
// ---------------------------------------------------------------------------------------------

type Totals = ReturnType<typeof totalsFor>;
function totalsFor(db: Db, guideId: string, blockId: string, rows: Pick<AttemptRow, "user_id" | "status" | "result" | "started_at" | "id">[]) {
  const finished = rows.filter((r) => r.status === "finished" && r.result).sort((p, q) => p.started_at.localeCompare(q.started_at));
  // Each person's first submitted attempt, and their latest, for misconceptions and retry improvement.
  const firsts = new Map<string, Stored>();
  const lasts = new Map<string, Stored>();
  for (const r of finished) {
    const res = migrateResult(JSON.parse(r.result!)) as Stored;
    if (!firsts.has(r.user_id)) firsts.set(r.user_id, res);
    lasts.set(r.user_id, res);
  }
  const small = firsts.size < SMALL_COHORT;
  const tally = (f: (x: Stored) => string[]) => {
    const out: Record<string, number> = {};
    for (const x of firsts.values()) for (const k of f(x)) out[k] = (out[k] ?? 0) + 1;
    return out;
  };
  const completed = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT json_extract(detail, '$.attempt')) AS n FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'activity_completed'",
      )
      .get(guideId, blockId) as { n: number }
  ).n;
  const retried = [...lasts.keys()].filter((u) => finished.filter((r) => r.user_id === u).length > 1);
  // Sources learners flagged as out of date or wrong, by rule: counts only, for the case owner.
  const sourceIssues = Object.fromEntries(
    (
      db
        .prepare(
          "SELECT json_extract(detail, '$.rule') AS rule, COUNT(*) AS n FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'source_issue_reported' GROUP BY rule",
        )
        .all(guideId, blockId) as { rule: string; n: number }[]
    ).map((r) => [r.rule, r.n]),
  ) as Record<string, number>;
  const credit = (x: Stored) => (x.decisionCredit === "full" ? 2 : x.decisionCredit === "partial" ? 1 : 0);
  return {
    blockId,
    attempts: rows.length,
    people: new Set(rows.map((r) => r.user_id)).size,
    finished: finished.length,
    completed,
    retries: rows.length - new Set(rows.map((r) => r.user_id)).size,
    counted: firsts.size,
    suppressed: small,
    critical: small ? null : [...firsts.values()].filter((x) => x.critical || x.vetting?.critical.length).length,
    decisions: small ? null : tally((x) => (x.decision ? [x.decision] : [])),
    missed: small ? null : tally((x) => x.items.filter((i) => i.finding && !i.found).map((i) => i.id)),
    falsePositives: small ? null : tally((x) => x.items.filter((i) => i.falsePositive).map((i) => i.id)),
    codes: small ? null : tally((x) => x.vetting?.codes ?? []),
    unnecessaryRequests: small ? null : tally((x) => x.vetting?.requests.unnecessary ?? []),
    /** Of those who tried again, how many reached a better decision on their latest try. */
    improved: small ? null : { retried: retried.length, better: retried.filter((u) => credit(lasts.get(u)!) > credit(firsts.get(u)!)).length },
    sourceIssues,
    versions: [...new Set(finished.map((r) => (JSON.parse(r.result!) as Stored).versions?.pack || "unversioned"))],
  };
}

/** For authors: totals for learning design. Decisions, missed evidence, false positives and misconceptions. No names, no words; breakdowns need five people. */
export function auditorStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureAuditor(db);
  const rows = db.prepare("SELECT id, block_id, user_id, status, result, started_at FROM auditor_attempts WHERE guide_id = ?").all(guideId) as Pick<
    AttemptRow,
    "id" | "block_id" | "user_id" | "status" | "result" | "started_at"
  >[];
  const blocks = new Map<string, typeof rows>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return { blocks: [...blocks.entries()].map(([blockId, rs]) => totalsFor(db, guideId, blockId, rs)) };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string; published_at: string | null };
/** Every published Document Auditor or Contractor Vetting Card. */
function publishedAuditors(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc, r.published_at FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"auditor\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is AuditorBlock => b.type === "auditor")
      .map((b) => ({ guide: g, block: b })),
  );
}

/**
  The decision register's "Contractor vetting cards" sheet (server/problemDesk export): each published case with its
  versions, theme and rationale decision, Job Aid and its saves, audience, dates, reviewers, practice results,
  misconceptions with their denominator, and the separately owned work measure. Aggregate learning data only: no
  supplier, worker or participant record, and fewer than five people show counts only.
*/
export function auditorRegister(db: Db, now: Date) {
  ensureAuditor(db);
  return publishedAuditors(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT id, user_id, status, result, started_at FROM auditor_attempts WHERE guide_id = ? AND block_id = ?")
      .all(guide.id, block.id) as Pick<AttemptRow, "id" | "user_id" | "status" | "result" | "started_at">[];
    const t: Totals = totalsFor(db, guide.id, block.id, rows);
    const v = block.vetting;
    const counts = (o: Record<string, number> | null, label: (k: string) => string = (k) => k) =>
      o
        ? Object.entries(o)
            .sort((p, q) => q[1] - p[1])
            .map(([k, n]) => `${label(k)} ${n}/${t.counted}`)
            .join("; ")
        : "";
    const findingLabel = (id: string) => {
      const e = block.findings.find((x) => x.id === id);
      return e?.axis ? `${AXES[e.axis]} (${id})` : id;
    };
    // How many people have the Job Aid in their Favourites: use evidence, never proof a contractor passed vetting.
    let saves: number | null = null;
    if (v?.jobAid.snippetId)
      try {
        saves = (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE kind = 'job_aid' AND target_id = ?").get(v.jobAid.snippetId) as { n: number }).n;
      } catch {
        saves = 0; // The Favourites tables aren't created until someone first uses Work Tools.
      }
    const a = block.approval;
    let audience = "Everyone signed in";
    try {
      audience = (JSON.parse(guide.audience) as string[]).join(", ") || audience;
    } catch {
      audience = guide.audience || audience;
    }
    return {
      responseId: `${guide.id}:${block.id}`,
      blockId: block.id,
      guideId: guide.id,
      guide: guide.title,
      title: block.title,
      kind: v ? "Contractor Vetting Card" : `Document Auditor (${block.mode === "invoice_review" ? "invoice" : "vetting"})`,
      version: [v?.packVersion, block.source.version && `ruleset ${block.source.version}`, ENGINE_VERSION].filter(Boolean).join(" · "),
      rules: block.rules.map((r) => `${r.title} (${r.effectiveFrom || "no date"})`).join("; "),
      theme: v ? [v.rationale.themeId, v.rationale.theme].filter(Boolean).join(": ") : "",
      rationaleDecision: v?.rationale.decision || "Not decided",
      audience,
      released: guide.published_at?.slice(0, 10) ?? "",
      reviewBy:
        block.rules
          .map((r) => r.reviewBy)
          .filter(Boolean)
          .sort()[0] ?? "",
      stale: staleRules(block, today(now)).length > 0,
      reviewers: [a.owner, a.compliance, a.finance, a.operations, a.quality].filter(Boolean).join("; ") || "Not signed off",
      mode: v?.mode ?? "formative",
      jobAid: v?.jobAid.snippetId ?? "",
      jobAidSaves: saves,
      started: t.people,
      submitted: t.finished,
      completed: t.completed,
      retries: t.retries,
      people: t.counted,
      suppressed: t.suppressed,
      critical: t.critical ?? "",
      decisions: counts(t.decisions),
      codes: counts(t.codes, codeLabel),
      missed: counts(t.missed, findingLabel),
      falsePositives: counts(t.falsePositives, findingLabel),
      unnecessaryRequests: counts(t.unnecessaryRequests, (id) => v?.requests.find((r) => r.id === id)?.label ?? id),
      improved: t.improved ? `${t.improved.better} of ${t.improved.retried} who retried` : "",
      measure: v?.rationale.measure ?? "",
      owner: v?.rationale.owner || a.owner || "",
      review: v?.rationale.review || "Not decided",
    };
  });
}
