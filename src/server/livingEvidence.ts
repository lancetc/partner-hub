import "server-only";
import { createHash } from "node:crypto";
import { daysBetween, median, seriesByRubric, THIN, type Cohort, type Question } from "@/lib/living";
import { BLOCK_LABELS, type BlockType } from "@/lib/magazine";
import type { Db } from "./db";

/*
  What the Hub's own learning records say about one decision (docs/living-cases.md), read for the return editor,
  the Signal Room and the Excel register. Counts of people only: never a name, and never anything a learner typed.

  Every figure is kept against the published version it came from and the question as it was then. Versions whose
  question and marking were the same may be read as one series; a changed question starts another. Nothing here is
  a work result, and nothing here says why a figure moved.
*/

export type GuideRow = { id: string; slug: string; title: string; status: string; audience: string; revision_id: string | null; draft: string };
export const guideRow = (db: Db, id: string) =>
  id
    ? (db.prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE id = ?").get(id) as GuideRow | undefined)
    : undefined;

export type RawBlock = {
  id: string;
  type: string;
  prompt?: string;
  heading?: string;
  title?: string;
  label?: string;
  statement?: string;
  choices?: { id: string; text: string; verdict: string }[];
};
export type RawPage = { id: string; title: string; relay?: { episode?: string }; sections?: { id: string; title: string; blocks?: RawBlock[] }[] };
export const pagesOf = (json: string | null | undefined): RawPage[] => {
  if (!json) return [];
  try {
    return ((JSON.parse(json) as { pages?: RawPage[] }).pages ?? []).filter((p) => p && typeof p.id === "string");
  } catch {
    return [];
  }
};
export const blocksOf = (p: RawPage | undefined) => (p?.sections ?? []).flatMap((s) => s.blocks ?? []);
export const blockLabel = (b: RawBlock) => {
  const words = (b.title || b.heading || b.label || b.prompt || b.statement || "").replace(/<[^>]+>/g, "").slice(0, 60);
  return `${BLOCK_LABELS[b.type as BlockType] ?? b.type}${words ? `: ${words}` : ""}`;
};
export const questionOf = (b: RawBlock | undefined): Question | null =>
  b?.type === "decision" && Array.isArray(b.choices)
    ? { prompt: b.prompt ?? "", choices: b.choices.map((c) => ({ id: String(c.id), text: String(c.text ?? ""), verdict: String(c.verdict ?? "") })) }
    : null;
/** The question and its marking, as a short fingerprint. Two versions with the same one asked the same thing. */
export const rubricOf = (q: Question) =>
  createHash("sha1")
    .update(JSON.stringify([q.prompt.trim(), q.choices.map((c) => [c.id, c.text.trim(), c.verdict])]))
    .digest("hex")
    .slice(0, 12);
/** The document learners read: the published version, or nothing when there isn't one. */
export const publishedDoc = (db: Db, g: GuideRow | undefined) =>
  g?.revision_id ? ((db.prepare("SELECT doc FROM magazine_revisions WHERE id = ?").get(g.revision_id) as { doc: string } | undefined)?.doc ?? null) : null;
export const findBlock = (json: string | null | undefined, pageId: string, blockId: string) => {
  const page = pagesOf(json).find((p) => p.id === pageId);
  return { page, block: blocksOf(page).find((b) => b.id === blockId) };
};

export type Window = { fromAt: string; toAt: string; audience?: string };
/** Month bounds ("2026-06" to "2026-11", inclusive) as the instants they cover. */
export function monthWindow(from: string, to: string, audience?: string): Window {
  const [y, m] = to.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 1));
  return { fromAt: `${from}-01T00:00:00.000Z`, toAt: end.toISOString(), ...(audience && { audience }) };
}

type Verdicts = { best: number; acceptable: number; risky: number };
const tally = (): Verdicts => ({ best: 0, acceptable: 0, risky: 0 });
const add = (t: Verdicts, v: string) => {
  if (v === "best" || v === "acceptable" || v === "risky") t[v] += 1;
};
type Answer = { user_id: string; at: string; choice: string; verdict: string; attempt: number };
type RevisionRow = { id: string; number: number; doc: string; published_at: string };

const answers = (db: Db, guideId: string, revisionId: string, blockId: string, w: Window) =>
  db
    .prepare(
      `SELECT e.user_id, e.at, json_extract(e.detail, '$.choice') AS choice, json_extract(e.detail, '$.verdict') AS verdict,
              COALESCE(json_extract(e.detail, '$.attempt'), 1) AS attempt
       FROM magazine_events e JOIN users u ON u.id = e.user_id
       WHERE e.guide_id = ? AND e.revision_id = ? AND e.block_id = ? AND e.event = 'decision.answered' AND e.at >= ? AND e.at < ?
         AND (? = '' OR u.audience = ?)
       ORDER BY e.at, e.id`,
    )
    .all(guideId, revisionId, blockId, w.fromAt, w.toAt, w.audience ?? "", w.audience ?? "") as Answer[];

export type DecisionVersion = {
  revision: number;
  revisionId: string;
  publishedAt: string;
  rubric: string;
  prompt: string;
  /** People who opened the page in this version, in the dates. */
  starts: number;
  /** People who answered at least once. */
  answered: number;
  first: Verdicts;
  /** People who answered more than once. */
  retried: number;
  latest: Verdicts;
  choices: { id: string; text: string; verdict: string; first: number }[];
  thin: boolean;
};

/**
  One decision question in one course, version by version: who opened the page, their first answers, who tried
  again, and where they ended. Unscored practice unless the course says otherwise; never an assessed result.
*/
export function decisionEvidence(db: Db, guideId: string, pageId: string, blockId: string, w: Window) {
  const g = guideRow(db, guideId);
  if (!g) return null;
  const revisions = db.prepare("SELECT id, number, doc, published_at FROM magazine_revisions WHERE guide_id = ? ORDER BY number").all(guideId) as RevisionRow[];
  const rows: DecisionVersion[] = [];
  let label = "";
  for (const r of revisions) {
    const pages = pagesOf(r.doc);
    const page = pages.find((p) => p.id === pageId);
    const block = blocksOf(page).find((b) => b.id === blockId);
    const q = questionOf(block);
    if (!page || !block || !q) continue;
    label = blockLabel(block);
    const starts = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT e.user_id) AS n FROM magazine_events e JOIN users u ON u.id = e.user_id
           WHERE e.guide_id = ? AND e.revision_id = ? AND e.at >= ? AND e.at < ? AND (? = '' OR u.audience = ?)
             AND ((e.event = 'page.opened' AND e.page_id = ?) OR (? = 1 AND e.event IN ('course.started', 'course.opened')))`,
        )
        .get(guideId, r.id, w.fromAt, w.toAt, w.audience ?? "", w.audience ?? "", pageId, pages.length === 1 ? 1 : 0) as { n: number }
    ).n;
    const by = new Map<string, Answer[]>();
    for (const a of answers(db, guideId, r.id, blockId, w)) by.set(a.user_id, [...(by.get(a.user_id) ?? []), a]);
    const first = tally();
    const latest = tally();
    const firstBy = new Map<string, number>();
    let retried = 0;
    for (const list of by.values()) {
      add(first, list[0].verdict);
      add(latest, list.at(-1)!.verdict);
      firstBy.set(list[0].choice, (firstBy.get(list[0].choice) ?? 0) + 1);
      if (list.length > 1) retried += 1;
    }
    rows.push({
      revision: r.number,
      revisionId: r.id,
      publishedAt: r.published_at,
      rubric: rubricOf(q),
      prompt: q.prompt,
      starts: Math.max(starts, by.size),
      answered: by.size,
      first,
      retried,
      latest,
      choices: q.choices.map((c) => ({ ...c, first: firstBy.get(c.id) ?? 0 })),
      thin: by.size < THIN,
    });
  }
  return { guide: { id: g.id, title: g.title, slug: g.slug, status: g.status }, pageId, blockId, label, versions: rows, series: seriesByRubric(rows) };
}
export type DecisionEvidence = NonNullable<ReturnType<typeof decisionEvidence>>;

export type CohortResult = { n: number; first: Verdicts; medianDays: number | null; thin: boolean };
export type TransferVersion = { revision: number; revisionId: string; rubric: string; cohorts: Record<Cohort, CohortResult> };

/**
  First answers on a return's decision, by whether the learner had answered the earlier one first. The two groups
  got here by different routes (one was invited back, the other found it), so they are shown side by side and not
  ranked. "Days between" is from a person's first answer on the earlier decision to their first on this one.
*/
export function transferEvidence(db: Db, link: { fromGuide: string; fromBlock: string; toGuide: string; toPage: string; toBlock: string }, w: Window) {
  const revisions = db
    .prepare("SELECT id, number, doc, published_at FROM magazine_revisions WHERE guide_id = ? ORDER BY number")
    .all(link.toGuide) as RevisionRow[];
  // Each person's first answer on the earlier decision, whenever it was: the dates above apply to the return.
  const earlier = new Map(
    (link.fromGuide && link.fromBlock
      ? (db
          .prepare("SELECT user_id, MIN(at) AS at FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'decision.answered' GROUP BY user_id")
          .all(link.fromGuide, link.fromBlock) as { user_id: string; at: string }[])
      : []
    ).map((r) => [r.user_id, r.at]),
  );
  const returned = new Set<string>();
  const versions: TransferVersion[] = [];
  for (const r of revisions) {
    const q = questionOf(findBlock(r.doc, link.toPage, link.toBlock).block);
    if (!q) continue;
    const groups: Record<Cohort, { first: Verdicts; days: number[]; n: number }> = {
      returned: { first: tally(), days: [], n: 0 },
      fresh: { first: tally(), days: [], n: 0 },
    };
    const seen = new Set<string>();
    for (const a of answers(db, link.toGuide, r.id, link.toBlock, w)) {
      if (seen.has(a.user_id)) continue;
      seen.add(a.user_id);
      const before = earlier.get(a.user_id);
      const cohort: Cohort = before && before < a.at ? "returned" : "fresh";
      groups[cohort].n += 1;
      add(groups[cohort].first, a.verdict);
      if (cohort === "returned") {
        groups.returned.days.push(daysBetween(before!, a.at));
        returned.add(a.user_id);
      }
    }
    versions.push({
      revision: r.number,
      revisionId: r.id,
      rubric: rubricOf(q),
      cohorts: {
        returned: { n: groups.returned.n, first: groups.returned.first, medianDays: median(groups.returned.days), thin: groups.returned.n < THIN },
        fresh: { n: groups.fresh.n, first: groups.fresh.first, medianDays: null, thin: groups.fresh.n < THIN },
      },
    });
  }
  // People who answered the return at any time, to say who has met the first story and not come back.
  const everReturned = new Set(
    (
      db
        .prepare("SELECT DISTINCT user_id FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'decision.answered'")
        .all(link.toGuide, link.toBlock) as { user_id: string }[]
    ).map((r) => r.user_id),
  );
  return {
    versions,
    series: seriesByRubric(versions),
    /** Answered the earlier decision and haven't answered this one, as at now. */
    firstOnly: [...earlier.keys()].filter((u) => !everReturned.has(u)).length,
    answeredEarlier: earlier.size,
  };
}
export type TransferEvidence = ReturnType<typeof transferEvidence>;

/**
  Who could have read a course and who did, by audience. Eligible is as at today: the Hub doesn't keep dated role
  memberships, so it can't say who was eligible on an earlier date. Learning authors are left out of both.
*/
export function audienceReach(db: Db, guideId: string, w: Window) {
  const g = guideRow(db, guideId);
  if (!g) return null;
  const allowed = JSON.parse(g.audience) as string[];
  const eligible = db
    .prepare("SELECT audience, COUNT(*) AS people, COUNT(DISTINCT org_id) AS orgs FROM users WHERE role != 'author' GROUP BY audience")
    .all() as { audience: string; people: number; orgs: number }[];
  const exposed = db
    .prepare(
      `SELECT u.audience, COUNT(DISTINCT e.user_id) AS people, COUNT(DISTINCT u.org_id) AS orgs FROM magazine_events e JOIN users u ON u.id = e.user_id
       WHERE e.guide_id = ? AND e.at >= ? AND e.at < ? AND u.role != 'author' GROUP BY u.audience`,
    )
    .all(guideId, w.fromAt, w.toAt) as { audience: string; people: number; orgs: number }[];
  const rows = eligible
    .filter((e) => !allowed.length || allowed.includes(e.audience))
    .map((e) => {
      const x = exposed.find((r) => r.audience === e.audience);
      return { audience: e.audience, eligible: e.people, eligibleOrgs: e.orgs, exposed: x?.people ?? 0, exposedOrgs: x?.orgs ?? 0 };
    });
  return { guide: { id: g.id, title: g.title, published: g.status === "published" && Boolean(g.revision_id) }, rows };
}
export type AudienceReach = NonNullable<ReturnType<typeof audienceReach>>;
