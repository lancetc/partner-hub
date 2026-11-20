import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  COMPLETION_MODES,
  GUIDE_AUDIENCES,
  GuideDocError,
  audiencePhrase,
  allBlocks,
  BLOCK_LABELS,
  activityDone,
  openActivities,
  formatLabel,
  isSiteMedia,
  pageBlocks,
  pageMinutes,
  publishChecks,
  readGuideDoc,
  readingMinutes,
  templatePage,
  PAGE_TEMPLATES,
  type CompletionMode,
  type GuideAudience,
  type GuideDoc,
  type Page,
  type PageTemplate,
} from "@/lib/magazine";
import { audit, ensureNotes, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { quizOffer } from "./pathQuiz";
import { liveItems } from "@/lib/magazineReview";
import { questionsInGuide } from "@/lib/questionPool";
import { afterPublish, publishGate } from "./questionPool";
import { guideForReaders, guideIdentity } from "./learningGuide";
import { reviewRequired } from "./topicApproval";
import { signalApproved, signalForReaders } from "@/lib/signal";
import { missionApproved, missionForReaders } from "@/lib/mission";
import { balanceApproved, balanceForReaders } from "@/lib/balance";
import { xrayApproved, xrayForReaders } from "@/lib/xray";
import { resetApproved } from "@/lib/reset";
import { lineApproved, lineForReaders } from "@/lib/line";
import { bridgeApproved, bridgeForReaders } from "@/lib/bridge";
import { journeyApproved, journeyForReaders } from "@/lib/journey";

/*
  Magazine courses: one or more pages (a one-page course shows as a Guide). An author edits a draft;
  publishing keeps an immutable course version (the ordered pages as they were), and everything a learner
  does (opening a page, answering a decision, finishing a page, completing the course) is recorded
  against the version they read, so republishing never rewrites anyone's history. Someone part-way
  through an earlier version carries on with it unless the author moves people to the new one when
  publishing. Who can read a course is decided for the whole course by its audience. Completion follows
  the course's mode (lib/magazine): opening, moving between pages or scrolling never completes anything.
*/

export type GuideStatus = "draft" | "in_review" | "approved" | "published" | "archived";

type GuideRow = {
  id: string;
  slug: string;
  title: string;
  standfirst: string;
  cover: string | null;
  audience: string;
  completion: CompletionMode;
  status: GuideStatus;
  draft: string;
  draft_saved_at: string;
  revision_id: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
};
type RevisionRow = {
  id: string;
  guide_id: string;
  number: number;
  parent_id: string | null;
  title: string;
  standfirst: string;
  cover: string | null;
  doc: string;
  completion: CompletionMode;
  minutes: number;
  summary: string;
  published_by: string;
  published_at: string;
};
type ProgressRow = {
  guide_id: string;
  user_id: string;
  revision_id: string;
  last_page: string | null;
  last_section: string | null;
  answers: string;
  started_at: string;
  updated_at: string;
};

const rid = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const guideBySlug = (db: Db, slug: string) => db.prepare("SELECT * FROM magazine_guides WHERE slug = ?").get(slug) as GuideRow | undefined;
const guideById = (db: Db, id: string) => db.prepare("SELECT * FROM magazine_guides WHERE id = ?").get(id) as GuideRow | undefined;
const revisionById = (db: Db, id: string) => db.prepare("SELECT * FROM magazine_revisions WHERE id = ?").get(id) as RevisionRow | undefined;
const audienceOf = (g: Pick<GuideRow, "audience">) => JSON.parse(g.audience) as GuideAudience[];

/** Authors see every course; anyone else only courses for everyone or for their audience. */
export const canRead = (user: User, g: Pick<GuideRow, "audience">) => {
  const a = audienceOf(g);
  return canAuthor(user) || !a.length || a.includes(user.audience);
};

function event(
  db: Db,
  e: { user: string; guide: string; revision: string | null; event: string; page?: string; section?: string; block?: string; detail?: unknown; at: Date },
) {
  db.prepare(
    "INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, page_id, section_id, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(e.at.toISOString(), e.user, e.guide, e.revision, e.event, e.page ?? null, e.section ?? null, e.block ?? null, JSON.stringify(e.detail ?? {}));
}

const completionOn = (db: Db, guideId: string, userId: string, revisionId: string) =>
  db
    .prepare("SELECT kind, at FROM magazine_completions WHERE guide_id = ? AND user_id = ? AND revision_id = ? ORDER BY id DESC LIMIT 1")
    .get(guideId, userId, revisionId) as { kind: "completed" | "acknowledged"; at: string } | undefined;
const latestCompletion = (db: Db, guideId: string, userId: string) =>
  db.prepare("SELECT revision_id, kind, at FROM magazine_completions WHERE guide_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1").get(guideId, userId) as
    { revision_id: string; kind: "completed" | "acknowledged"; at: string } | undefined;
const progressOf = (db: Db, guideId: string, userId: string) =>
  db.prepare("SELECT * FROM magazine_progress WHERE guide_id = ? AND user_id = ?").get(guideId, userId) as ProgressRow | undefined;
const finishedPages = (db: Db, guideId: string, userId: string, revisionId: string) =>
  (
    db.prepare("SELECT page_id FROM magazine_page_finishes WHERE guide_id = ? AND user_id = ? AND revision_id = ?").all(guideId, userId, revisionId) as {
      page_id: string;
    }[]
  ).map((r) => r.page_id);

/**
  The learner's own reflect-and-apply entries in this course (journal, action notes, pulse answers), by block:
  sent with their copy of the course so the blocks show what they saved. Only ever their own.
*/
function notesOf(db: Db, guideId: string, userId: string) {
  ensureNotes(db);
  const rows = db.prepare("SELECT * FROM magazine_notes WHERE guide_id = ? AND user_id = ?").all(guideId, userId) as {
    block_id: string;
    kind: "journal" | "action" | "pulse";
    body: string;
    choice: string | null;
    choice_label: string | null;
    status: string | null;
    state: "draft" | "saved" | "skipped";
    created_at: string;
    updated_at: string;
  }[];
  return Object.fromEntries(
    rows.map((r) => [
      r.block_id,
      {
        blockId: r.block_id,
        kind: r.kind,
        body: r.body,
        choice: r.choice,
        choiceLabel: r.choice_label,
        status: r.status,
        state: r.state,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    ]),
  );
}
export type ReaderNote = ReturnType<typeof notesOf>[string];

export type ReflectionFeedback = { summary: string; strengths: string[]; consider: string[] };

/** The poll block someone is voting in, in the edition they read; they must be able to read the course. */
export function magazinePoll(db: Db, user: User, guideId: string, blockId: string) {
  const row = db.prepare("SELECT slug FROM magazine_guides WHERE id = ?").get(guideId) as { slug: string } | undefined;
  if (!row) throw new HttpError(404, "Poll not found.");
  const block = allBlocks(readGuide(db, user, row.slug).doc).find((b) => b.id === blockId);
  if (block?.type !== "poll") throw new HttpError(404, "Poll not found.");
  return block;
}

/** The insight wall block someone is looking at, in the edition they read; they must be able to read the course. */
export function magazineWall(db: Db, user: User, guideId: string, blockId: string) {
  const row = db.prepare("SELECT slug FROM magazine_guides WHERE id = ?").get(guideId) as { slug: string } | undefined;
  if (!row) throw new HttpError(404, "Insight wall not found.");
  const block = allBlocks(readGuide(db, user, row.slug).doc).find((b) => b.id === blockId);
  if (block?.type !== "wall") throw new HttpError(404, "Insight wall not found.");
  return { prompt: block.prompt, anonymous: Boolean(block.anonymous) };
}

/** Their answers to Reflection blocks in this version, with Claude's feedback. */
const reflectionsOf = (db: Db, guideId: string, userId: string, revisionId: string) =>
  Object.fromEntries(
    (
      db
        .prepare("SELECT block_id, response, feedback, at FROM magazine_reflections WHERE guide_id = ? AND user_id = ? AND revision_id = ?")
        .all(guideId, userId, revisionId) as {
        block_id: string;
        response: string;
        feedback: string | null;
        at: string;
      }[]
    ).map((r) => [r.block_id, { response: r.response, feedback: r.feedback ? (JSON.parse(r.feedback) as ReflectionFeedback) : null, at: r.at }]),
  ) as Record<string, { response: string; feedback: ReflectionFeedback | null; at: string }>;

/**
  The version this person reads: the one they're part-way through if they started an earlier one and
  haven't completed it, otherwise the current one.
*/
function servedRevision(db: Db, user: User, g: GuideRow) {
  const p = progressOf(db, g.id, user.id);
  if (p && p.revision_id !== g.revision_id && !completionOn(db, g.id, user.id, p.revision_id)) {
    // Authors always read the latest edition: they're checking what they've published. They start it afresh.
    if (canAuthor(user))
      db.prepare("UPDATE magazine_progress SET revision_id = ?, answers = '{}', last_page = NULL, last_section = NULL WHERE guide_id = ? AND user_id = ?").run(
        g.revision_id,
        g.id,
        user.id,
      );
    else {
      const r = revisionById(db, p.revision_id);
      if (r) return r;
    }
  }
  return revisionById(db, g.revision_id!)!;
}

/** The edition this person reads of a course, with its document: for self-review, which checks the same way. */
export function readerEdition(db: Db, user: User, slugOrId: string) {
  const { guide, revision } = publishedFor(db, user, slugOrId);
  return {
    guide: { id: guide.id, slug: guide.slug, title: guide.title },
    revision: { id: revision.id, number: revision.number },
    doc: readGuideDoc(JSON.parse(revision.doc), { draft: true }),
  };
}

/**
  What a reader is told about self-review: whether it's on, and how many questions each page has. Never the
  questions themselves: they (and their answers) come one review at a time from the server.
*/
export function practiceSummary(doc: GuideDoc) {
  if (!doc.review?.enabled) return null;
  const pages: Record<string, number> = {};
  for (const it of liveItems(doc)) pages[it.pageId] = (pages[it.pageId] ?? 0) + 1;
  return { pages };
}
/** The document without its self-review questions, for a reader. */
const withoutPractice = (doc: GuideDoc): GuideDoc => ({ schema: doc.schema, pages: doc.pages, ...(doc.audio && { audio: doc.audio }) });

/**
  A conversation practice's scene, for a reader: what they're told going in, without the character's
  profile, the list of moves it's read against, or the safety rules. Those stay on the server.
*/
const withoutScenes = (doc: GuideDoc): GuideDoc => ({
  ...doc,
  pages: doc.pages.map((p) => ({
    ...p,
    sections: p.sections.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.type === "conversation" && b.roleplay
          ? { ...b, roleplay: { ...b.roleplay, profile: "", moves: [], risks: [], safety: [] } }
          : // Spot the Signal: the case, without what marks an answer right.
            b.type === "signal"
            ? signalForReaders(b)
            : // The Mission Board: the case and board, without what marks a choice right.
              b.type === "mission"
              ? missionForReaders(b)
              : // The Balance Scale: the situation and cards, without the criteria, what each card is worth, or the new fact.
                b.type === "balance"
                ? balanceForReaders(b)
                : // The Invoice X-Ray: the document and choices, without the answer key or the model script.
                  b.type === "xray"
                  ? xrayForReaders(b)
                  : // Where Is the Line?: the requests and choices, without the answers.
                    b.type === "line"
                    ? lineForReaders(b)
                    : // While You Wait: the scenario, without the summary checks or the model summary.
                      b.type === "bridge"
                      ? bridgeForReaders(b)
                      : // The SaH Journey: the story, without what marks a decision right or the reviewed responses.
                        b.type === "journey"
                        ? journeyForReaders(b)
                        : b,
      ),
    })),
  })),
});

/** A published course the person may read, or 404: outside the audience looks the same as not existing. */
function publishedFor(db: Db, user: User, slugOrId: string) {
  const g = guideBySlug(db, slugOrId) ?? guideById(db, slugOrId);
  if (!g || g.status === "archived" || !g.revision_id || !canRead(user, g)) throw new HttpError(404, "Guide not found.");
  return { guide: g, revision: servedRevision(db, user, g) };
}

// ---------------------------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------------------------

/**
  The published courses and guides this person can read, with where they are in each, and how many
  colleagues opened each in the 30 days before `now` (for "Popular with your colleagues").
*/
export function learnerGuides(db: Db, user: User, now = new Date()) {
  const rows = db.prepare("SELECT * FROM magazine_guides WHERE status = 'published' AND revision_id IS NOT NULL").all() as GuideRow[];
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const readers = new Map(
    (
      db.prepare("SELECT guide_id, COUNT(DISTINCT user_id) AS n FROM magazine_progress WHERE updated_at >= ? GROUP BY guide_id").all(since) as {
        guide_id: string;
        n: number;
      }[]
    ).map((r) => [r.guide_id, r.n]),
  );
  return rows
    .filter((g) => canRead(user, g))
    .map((g) => {
      const r = revisionById(db, g.revision_id!)!;
      const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
      const p = progressOf(db, g.id, user.id);
      const done = latestCompletion(db, g.id, user.id);
      return {
        id: g.id,
        slug: g.slug,
        title: r.title,
        standfirst: r.standfirst,
        cover: r.cover,
        format: formatLabel(doc),
        pages: doc.pages.length,
        minutes: r.minutes,
        audience: audienceOf(g),
        publishedAt: r.published_at,
        popularity: readers.get(g.id) ?? 0,
        state: done?.kind === "completed" ? ("completed" as const) : p ? ("started" as const) : ("new" as const),
        lastReadAt: p?.updated_at ?? null,
      };
    });
}

/**
  For Discovery Paths (server/discovery.ts): every published course this person may read, with its pages,
  where they are in it, and the words on each page for matching a goal. `restricted` lists the published
  courses they may not read, by id only, so a saved step can say "you no longer have access" and nothing more.
*/
export function discoveryCourses(db: Db, user: User) {
  const rows = db.prepare("SELECT * FROM magazine_guides WHERE status = 'published' AND revision_id IS NOT NULL").all() as GuideRow[];
  const courses = rows
    .filter((g) => canRead(user, g))
    .map((g) => {
      const r = revisionById(db, g.revision_id!)!;
      const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
      const p = progressOf(db, g.id, user.id);
      const done = latestCompletion(db, g.id, user.id);
      const finished = new Set(p ? finishedPages(db, g.id, user.id, p.revision_id) : []);
      const review = practiceSummary(doc);
      return {
        id: g.id,
        slug: g.slug,
        title: r.title,
        standfirst: r.standfirst,
        minutes: r.minutes,
        edition: r.number,
        publishedAt: r.published_at,
        state: done?.kind === "completed" ? ("completed" as const) : p ? ("started" as const) : ("new" as const),
        lastPage: p && doc.pages.some((x) => x.id === p.last_page) ? p.last_page : null,
        practice: Boolean(review),
        pages: doc.pages.map((page) => {
          const blocks = pageBlocks(page);
          return {
            id: page.id,
            title: page.title,
            purpose: page.purpose,
            kind: page.kind,
            standalone: page.standalone === true && page.kind === "content",
            minutes: pageMinutes(page),
            finished: finished.has(page.id),
            // Changes only when this page does, so another page's edit doesn't flag it as updated.
            version: createHash("sha1").update(JSON.stringify(page)).digest("hex").slice(0, 12),
            practice: review?.pages[page.id]
              ? "Quick review"
              : blocks.some((b) => b.type === "decision" || b.type === "branching" || b.type === "conversation")
                ? "A decision to practise"
                : blocks.some((b) => b.type === "quiz")
                  ? "Check questions"
                  : null,
            content: page.sections.map((s) => ({ title: s.title, blocks: s.blocks })),
          };
        }),
      };
    });
  return { courses, restricted: rows.filter((g) => !canRead(user, g)).map((g) => g.id) };
}

/**
  For Capability Intelligence (server/capability.ts): every published course with its reading pages, so
  learning can be mapped to a competency. No one's progress; just what's published and its current version.
*/
export function capabilityCourses(db: Db) {
  const rows = db.prepare("SELECT * FROM magazine_guides WHERE status = 'published' AND revision_id IS NOT NULL").all() as GuideRow[];
  return rows.map((g) => {
    const r = revisionById(db, g.revision_id!)!;
    const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
    return {
      id: g.id,
      slug: g.slug,
      title: r.title,
      edition: r.number,
      audience: audienceOf(g),
      pages: doc.pages
        .filter((p) => p.kind === "content")
        .map((p, i) => ({
          id: p.id,
          title: p.title || `Page ${i + 1}`,
          version: createHash("sha1").update(JSON.stringify(p)).digest("hex").slice(0, 12),
          decisions: pageBlocks(p).some((b) => b.type === "decision"),
        })),
    };
  });
}

export type QuizState = { pathId: string; pathName: string; passed: boolean; available: boolean; passMark: number | null };

/** The linked learning path quiz for each quiz block (null when the path has gone), from the Hub's quiz engine. */
function quizStates(db: Db, user: User, doc: GuideDoc) {
  const quizzes: Record<string, QuizState | null> = {};
  for (const b of allBlocks(doc)) {
    if (b.type !== "quiz" || !b.pathId) continue;
    const path = db.prepare("SELECT name FROM learning_paths WHERE id = ? AND archived = 0").get(b.pathId) as { name: string } | undefined;
    const offer = path ? quizOffer(db, user, b.pathId) : null;
    quizzes[b.id] = path
      ? { pathId: b.pathId, pathName: path.name, passed: Boolean(offer?.passed), available: Boolean(offer?.available), passMark: offer?.passMark ?? null }
      : null;
  }
  return quizzes;
}

export type ReaderGuide = ReturnType<typeof readGuide>;

/**
  A course as its reader sees it: the version they're on, every page with its time and whether they've
  finished it, their answers, where they were, whether they've completed it, and any linked quiz.
*/
export function readGuide(db: Db, user: User, slug: string) {
  const { guide: g, revision: r } = publishedFor(db, user, slug);
  const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
  const p = progressOf(db, g.id, user.id);
  const onThis = p?.revision_id === r.id;
  const done = latestCompletion(db, g.id, user.id);
  const current = revisionById(db, g.revision_id!)!;
  return {
    id: g.id,
    slug: g.slug,
    revisionId: r.id,
    revision: r.number,
    /** True when they're finishing an earlier version they started; a newer one has been published. */
    olderEdition: r.id !== current.id,
    title: r.title,
    standfirst: r.standfirst,
    cover: r.cover,
    format: formatLabel(doc),
    audience: audiencePhrase(audienceOf(g)),
    minutes: r.minutes,
    pageMinutes: Object.fromEntries(doc.pages.map((pg) => [pg.id, pageMinutes(pg)])),
    publishedAt: r.published_at,
    completion: r.completion,
    // Guide recordings only when they're cleared to play (and not withdrawn); never the self-review answers.
    doc: withoutScenes(withoutPractice(guideForReaders(db, doc))),
    /** The Hub's AI Learning Guide: its name, introduction and portrait. */
    guide: guideIdentity(db),
    /** Self-review: on, and how many questions each page has (null when it's off). */
    practice: practiceSummary(doc),
    progress: {
      lastPage: onThis && doc.pages.some((x) => x.id === p.last_page) ? p.last_page : null,
      lastSection: onThis && doc.pages.some((x) => x.sections.some((s) => s.id === p.last_section)) ? p.last_section : null,
      answers: onThis ? (JSON.parse(p.answers) as Record<string, string>) : {},
      finished: finishedPages(db, g.id, user.id, r.id),
      started: Boolean(p),
      reflections: reflectionsOf(db, g.id, user.id, r.id),
      notes: notesOf(db, g.id, user.id),
    },
    completed: done ? { kind: done.kind, at: done.at, thisRevision: done.revision_id === r.id } : null,
    quizzes: quizStates(db, user, doc),
  };
}

/** Starts (or picks up) their record on the version they're reading. */
function touch(db: Db, user: User, guideId: string, revisionId: string, now: Date) {
  const p = progressOf(db, guideId, user.id);
  const at = now.toISOString();
  if (!p)
    db.prepare("INSERT INTO magazine_progress (guide_id, user_id, revision_id, answers, started_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)").run(
      guideId,
      user.id,
      revisionId,
      at,
      at,
    );
  else if (p.revision_id !== revisionId)
    db.prepare(
      "UPDATE magazine_progress SET revision_id = ?, answers = '{}', last_page = NULL, last_section = NULL, updated_at = ? WHERE guide_id = ? AND user_id = ?",
    ).run(revisionId, at, guideId, user.id);
  else db.prepare("UPDATE magazine_progress SET updated_at = ? WHERE guide_id = ? AND user_id = ?").run(at, guideId, user.id);
  return progressOf(db, guideId, user.id)!;
}

const pageOf = (doc: GuideDoc, pageId: unknown) => {
  const page = doc.pages.find((x) => x.id === pageId);
  if (!page) throw new HttpError(400, "That page isn’t in this course.");
  return page;
};

/**
  Something the reader did: opened the course or a page, reached a section, or answered a decision
  question. The version they were reading is checked, so a page left open across a republish can't
  record answers against questions that have changed.
*/
export function recordGuideEvent(
  db: Db,
  user: User,
  guideId: string,
  input: {
    event?: unknown;
    revisionId?: unknown;
    pageId?: unknown;
    sectionId?: unknown;
    blockId?: unknown;
    choiceId?: unknown;
    rating?: unknown;
    detail?: unknown;
  },
  now: Date,
) {
  const { guide: g, revision: r } = publishedFor(db, user, guideId);
  if (input.revisionId !== r.id) throw new HttpError(409, "This guide has been updated. Reload the page to read the latest version.");
  const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
  return tx(db, () => {
    const p = touch(db, user, g.id, r.id, now);
    // A reader finishing an earlier edition moves on to the latest one, starting it afresh. Completions are kept.
    if (input.event === "switch") {
      if (!g.revision_id || g.revision_id === r.id) return { ok: true, switched: false };
      // Their Audio Guide choice comes with them; their answers belong to the edition they gave them in.
      const guideAudio = (JSON.parse(p.answers) as Record<string, string>)["audio:guide"];
      db.prepare(
        "UPDATE magazine_progress SET revision_id = ?, answers = ?, last_page = NULL, last_section = NULL, updated_at = ? WHERE guide_id = ? AND user_id = ?",
      ).run(g.revision_id, JSON.stringify(guideAudio ? { "audio:guide": guideAudio } : {}), now.toISOString(), g.id, user.id);
      event(db, { user: user.id, guide: g.id, revision: g.revision_id, event: "edition.switched", detail: { from: r.number }, at: now });
      return { ok: true, switched: true };
    }
    if (input.event === "opened") {
      event(db, { user: user.id, guide: g.id, revision: r.id, event: p.started_at === now.toISOString() ? "course.started" : "course.opened", at: now });
      return { ok: true };
    }
    if (input.event === "page") {
      const page = pageOf(doc, input.pageId);
      db.prepare("UPDATE magazine_progress SET last_page = ? WHERE guide_id = ? AND user_id = ?").run(page.id, g.id, user.id);
      event(db, { user: user.id, guide: g.id, revision: r.id, event: "page.opened", page: page.id, at: now });
      return { ok: true };
    }
    if (input.event === "section") {
      const page = doc.pages.find((x) => x.sections.some((s) => s.id === input.sectionId));
      const s = page?.sections.find((x) => x.id === input.sectionId);
      if (!page || !s) throw new HttpError(400, "That section isn’t in this course.");
      if (p.last_section !== s.id) {
        db.prepare("UPDATE magazine_progress SET last_page = ?, last_section = ? WHERE guide_id = ? AND user_id = ?").run(page.id, s.id, g.id, user.id);
        event(db, { user: user.id, guide: g.id, revision: r.id, event: "section.visited", page: page.id, section: s.id, at: now });
      }
      return { ok: true };
    }
    if (input.event === "decision") {
      const page = doc.pages.find((x) => pageBlocks(x).some((b) => b.id === input.blockId));
      const section = page?.sections.find((s) => s.blocks.some((b) => b.id === input.blockId));
      const block = section?.blocks.find((b) => b.id === input.blockId);
      if (!page || !section || block?.type !== "decision") throw new HttpError(400, "That question isn’t in this course.");
      const choice = block.choices.find((c) => c.id === input.choiceId);
      if (!choice) throw new HttpError(400, "Choose one of the answers.");
      const answers = { ...(JSON.parse(p.answers) as Record<string, string>), [block.id]: choice.id };
      db.prepare("UPDATE magazine_progress SET answers = ? WHERE guide_id = ? AND user_id = ?").run(JSON.stringify(answers), g.id, user.id);
      const attempt =
        (
          db
            .prepare("SELECT COUNT(*) AS n FROM magazine_events WHERE user_id = ? AND revision_id = ? AND block_id = ? AND event = 'decision.answered'")
            .get(user.id, r.id, block.id) as {
            n: number;
          }
        ).n + 1;
      event(db, {
        user: user.id,
        guide: g.id,
        revision: r.id,
        event: "decision.answered",
        page: page.id,
        section: section.id,
        block: block.id,
        detail: { choice: choice.id, verdict: choice.verdict, attempt },
        at: now,
      });
      return { ok: true, verdict: choice.verdict, attempt };
    }
    if (input.event === "confidence") {
      const found = doc.pages
        .flatMap((pg) => pg.sections.map((s) => ({ page: pg, section: s })))
        .find(({ section }) => section.blocks.some((b) => b.id === input.blockId));
      const block = found?.section.blocks.find((b) => b.id === input.blockId);
      if (!found || block?.type !== "confidence") throw new HttpError(400, "That confidence check isn’t in this course.");
      const rating = Number(input.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Choose a rating from 1 to 5.");
      // Kept with their other answers for this version, so a later check can show the change.
      const answers = { ...(JSON.parse(p.answers) as Record<string, string>), [block.id]: String(rating) };
      db.prepare("UPDATE magazine_progress SET answers = ? WHERE guide_id = ? AND user_id = ?").run(JSON.stringify(answers), g.id, user.id);
      event(db, {
        user: user.id,
        guide: g.id,
        revision: r.id,
        event: "confidence.rated",
        page: found.page.id,
        section: found.section.id,
        block: block.id,
        detail: { rating, compareWith: block.compareWith ?? null },
        at: now,
      });
      return { ok: true };
    }
    if (input.event === "engaged") {
      // The reader has worked through a block (flipped every card, opened every tab, checked an answer…).
      const block = allBlocks(doc).find((b) => b.id === input.blockId);
      if (!block || activityDone(block, {}) === null) throw new HttpError(400, "That activity isn’t in this course.");
      const answers = JSON.parse(p.answers) as Record<string, string>;
      if (answers[`done:${block.id}`] !== "1") {
        db.prepare("UPDATE magazine_progress SET answers = ? WHERE guide_id = ? AND user_id = ?").run(
          JSON.stringify({ ...answers, [`done:${block.id}`]: "1" }),
          g.id,
          user.id,
        );
        // An acknowledgement: what they confirmed, and when, for the record.
        if (block.type === "callout" && block.confirm) {
          const page = doc.pages.find((pg) => pageBlocks(pg).some((x) => x.id === block.id));
          event(db, {
            user: user.id,
            guide: g.id,
            revision: r.id,
            event: "callout.confirmed",
            page: page?.id,
            block: block.id,
            detail: { confirmed: block.confirm },
            at: now,
          });
        }
      }
      return { ok: true };
    }
    if (input.event === "activity") {
      // How an interactive block went: the ending reached, a score. Only these, so nothing personal is kept.
      const found = doc.pages
        .flatMap((pg) => pg.sections.map((s) => ({ page: pg, section: s })))
        .find(({ section }) => section.blocks.some((b) => b.id === input.blockId));
      const block = found?.section.blocks.find((b) => b.id === input.blockId);
      if (
        !found ||
        !block ||
        ![
          "branching",
          "conversation",
          "spot",
          "budget",
          "signal",
          "mission",
          "balance",
          "xray",
          "reset",
          "line",
          "bridge",
          "journey",
          "process",
          "flashcards",
          "video",
          "hotspots",
          "sorting",
          "sequencing",
          "matching",
          "fillblank",
        ].includes(block.type === "textMedia" && block.video ? "video" : block.type)
      )
        throw new HttpError(400, "That activity isn’t in this course.");
      // Watching is tracked as it happens, never as understanding.
      const isVideo = block.type === "video" || block.type === "textMedia";
      if (isVideo && !["started", "half", "finished"].includes(String((input.detail as { outcome?: unknown } | undefined)?.outcome)))
        throw new HttpError(400, "Unknown video event.");
      const d = (input.detail ?? {}) as Record<string, unknown>;
      const detail = {
        ...(typeof d.outcome === "string" && { outcome: d.outcome.slice(0, 40) }),
        ...(Number.isFinite(Number(d.score)) && d.score !== undefined && { score: Number(d.score) }),
        ...(Number.isFinite(Number(d.total)) && d.total !== undefined && { total: Number(d.total) }),
      };
      event(db, {
        user: user.id,
        guide: g.id,
        revision: r.id,
        event: isVideo ? `video.${detail.outcome}` : `${block.type}.done`,
        page: found.page.id,
        section: found.section.id,
        block: block.id,
        detail,
        at: now,
      });
      return { ok: true };
    }
    if (input.event === "guide") {
      // The AI Learning Guide: what the learner did with a recording. Never an activity, never a completion.
      const outcome = String((input.detail as { outcome?: unknown } | undefined)?.outcome);
      if (!["started", "paused", "completed", "transcript", "read_first", "source"].includes(outcome)) throw new HttpError(400, "Unknown guide event.");
      const page = doc.pages.find((x) => pageBlocks(x).some((b) => b.id === input.blockId && b.type === "guide"));
      if (!page) throw new HttpError(400, "That isn’t in this course.");
      event(db, { user: user.id, guide: g.id, revision: r.id, event: `guide.${outcome}`, page: page.id, block: String(input.blockId), at: now });
      return { ok: true };
    }
    if (input.event === "narration") {
      // The Audio Guide: an introduction started or finished (never counted as an activity).
      const outcome = String((input.detail as { outcome?: unknown } | undefined)?.outcome);
      if (outcome !== "started" && outcome !== "finished") throw new HttpError(400, "Unknown narration event.");
      const page = input.pageId === "intro" ? null : pageOf(doc, input.pageId);
      event(db, {
        user: user.id,
        guide: g.id,
        revision: r.id,
        event: `narration.${outcome}`,
        ...(page && { page: page.id }),
        detail: { target: page ? "page" : "intro" },
        at: now,
      });
      return { ok: true };
    }
    if (input.event === "audioGuide") {
      // The reader turned the Audio Guide on or off for this course. Kept with their progress, so it follows them.
      const on = (input.detail as { on?: unknown } | undefined)?.on === true;
      const answers = { ...(JSON.parse(p.answers) as Record<string, string>), "audio:guide": on ? "on" : "off" };
      db.prepare("UPDATE magazine_progress SET answers = ? WHERE guide_id = ? AND user_id = ?").run(JSON.stringify(answers), g.id, user.id);
      event(db, { user: user.id, guide: g.id, revision: r.id, event: on ? "audio_guide.on" : "audio_guide.off", at: now });
      return { ok: true };
    }
    throw new HttpError(400, "Unknown event.");
  });
}

/** What stands between the reader and finishing this page: its questions (decision courses) or its quiz (assessment pages). */
export function pageGap(guide: ReaderGuide, page: Page) {
  if (page.kind === "assessment") {
    const quiz = pageBlocks(page).flatMap((b) => (b.type === "quiz" ? [guide.quizzes[b.id]] : []))[0];
    return quiz?.passed ? null : "Pass the quiz first.";
  }
  if (guide.completion === "decision") {
    const open = pageBlocks(page).filter((b) => b.type === "decision" && !guide.progress.answers[b.id]);
    if (open.length) return `Answer the ${open.length === 1 ? "decision question" : `${open.length} decision questions`} on this page first.`;
  }
  // Every activity on the page, unless the author turned that off (reference courses are only read).
  if (guide.completion !== "reference") {
    const left = openActivities(page, guide.progress.answers, guide.quizzes);
    if (left.length) return `Work through every activity on this page first: ${[...new Set(left.map((b) => BLOCK_LABELS[b.type].toLowerCase()))].join(", ")}.`;
  }
  return null;
}

/** What still stands between the reader and completing the course, by its completion mode. */
export function completionGap(guide: ReaderGuide) {
  if (guide.completion === "reference") return null;
  if (guide.completion === "assessed" && !Object.values(guide.quizzes).some((q) => q?.passed)) return "Pass the quiz first.";
  const left = guide.doc.pages.filter((p) => p.required && !guide.progress.finished.includes(p.id));
  if (left.length)
    return guide.doc.pages.length === 1
      ? (pageGap(guide, left[0]) ?? "Finish the page first.")
      : `Finish ${left.length === 1 ? "1 more required page" : `${left.length} more required pages`} first.`;
  return null;
}

/** Records the course completion once its rule is met; returns it (or null). */
function completeIfDone(db: Db, user: User, guide: ReaderGuide, now: Date) {
  if (guide.completion === "reference" || completionGap(guide)) return null;
  const existing = completionOn(db, guide.id, user.id, guide.revisionId);
  if (existing) return existing;
  db.prepare("INSERT INTO magazine_completions (guide_id, user_id, revision_id, mode, kind, at) VALUES (?, ?, ?, ?, 'completed', ?)").run(
    guide.id,
    user.id,
    guide.revisionId,
    guide.completion,
    now.toISOString(),
  );
  event(db, { user: user.id, guide: guide.id, revision: guide.revisionId, event: "course.completed", detail: { mode: guide.completion }, at: now });
  return { kind: "completed" as const, at: now.toISOString() };
}

/**
  They finish a page (an explicit choice, never scrolling). The course completes when every required page
  is finished and any quiz the course needs has been passed.
*/
export function finishPage(db: Db, user: User, slug: string, revisionId: unknown, pageId: unknown, now: Date) {
  const guide = readGuide(db, user, slug);
  if (revisionId !== guide.revisionId) throw new HttpError(409, "This guide has been updated. Reload the page to read the latest version.");
  const page = pageOf(guide.doc, pageId);
  const gap = pageGap(guide, page);
  if (gap) throw new HttpError(400, gap);
  return tx(db, () => {
    touch(db, user, guide.id, guide.revisionId, now);
    if (!guide.progress.finished.includes(page.id)) {
      db.prepare("INSERT INTO magazine_page_finishes (guide_id, user_id, revision_id, page_id, at) VALUES (?, ?, ?, ?, ?)").run(
        guide.id,
        user.id,
        guide.revisionId,
        page.id,
        now.toISOString(),
      );
      event(db, { user: user.id, guide: guide.id, revision: guide.revisionId, event: "page.finished", page: page.id, at: now });
    }
    const after = readGuide(db, user, slug);
    const completed = completeIfDone(db, user, after, now);
    return { finished: after.progress.finished, completed };
  });
}

/**
  Completes the course: for a reference course, an acknowledgement any time; otherwise once its rule is
  met (for example after passing the quiz on the learning path). Kept against the version they read.
*/
export function completeGuide(db: Db, user: User, slug: string, revisionId: unknown, now: Date) {
  const guide = readGuide(db, user, slug);
  if (revisionId !== guide.revisionId) throw new HttpError(409, "This guide has been updated. Reload the page to read the latest version.");
  const gap = completionGap(guide);
  if (gap) throw new HttpError(400, gap);
  const existing = completionOn(db, guide.id, user.id, guide.revisionId);
  if (existing) return existing;
  return tx(db, () => {
    touch(db, user, guide.id, guide.revisionId, now);
    if (guide.completion !== "reference") return completeIfDone(db, user, guide, now)!;
    db.prepare("INSERT INTO magazine_completions (guide_id, user_id, revision_id, mode, kind, at) VALUES (?, ?, ?, 'reference', 'acknowledged', ?)").run(
      guide.id,
      user.id,
      guide.revisionId,
      now.toISOString(),
    );
    event(db, { user: user.id, guide: guide.id, revision: guide.revisionId, event: "course.acknowledged", at: now });
    return { kind: "acknowledged" as const, at: now.toISOString() };
  });
}

// ---------------------------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------------------------

export type GuideInput = {
  title?: unknown;
  standfirst?: unknown;
  cover?: unknown;
  audience?: unknown;
  completion?: unknown;
  /** The first page's teaching pattern for a new course, or "assessment". */
  template?: unknown;
  doc?: unknown;
  /**
    The draft's saved time when this editor last had it. A save from an editor that's behind (another tab,
    or someone else, saved since) is refused, so it can't quietly undo the newer changes.
  */
  basedOn?: unknown;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "guide";

function cleanMeta(input: GuideInput, current?: GuideRow, { draft = false } = {}) {
  const title =
    input.title === undefined && current
      ? current.title
      : String(input.title ?? "")
          .replace(/\s+/g, " ")
          .trim();
  if (!draft && title.length < 2) throw new HttpError(400, "Give the guide a title.");
  if (title.length > 140) throw new HttpError(400, "Keep the title to 140 characters.");
  const standfirst = input.standfirst === undefined && current ? current.standfirst : String(input.standfirst ?? "").trim();
  if (standfirst.length > 400) throw new HttpError(400, "Keep the summary to 400 characters.");
  const cover = input.cover === undefined ? (current?.cover ?? null) : input.cover ? String(input.cover) : null;
  if (cover && !isSiteMedia(cover)) throw new HttpError(400, "Choose a cover picture uploaded to the Hub.");
  const audience =
    input.audience === undefined && current
      ? audienceOf(current)
      : GUIDE_AUDIENCES.map((a) => a.value).filter((a) => Array.isArray(input.audience) && input.audience.includes(a));
  const completion = input.completion === undefined && current ? current.completion : String(input.completion ?? "confirm");
  if (!(completion in COMPLETION_MODES)) throw new HttpError(400, "Choose how the guide is completed.");
  return { title, standfirst, cover, audience, completion: completion as CompletionMode };
}

function cleanDoc(value: unknown, draft = false) {
  try {
    return readGuideDoc(value, { draft });
  } catch (e) {
    if (e instanceof GuideDocError) throw Object.assign(new HttpError(400, e.message), { problems: e.problems });
    throw e;
  }
}

export function createGuide(db: Db, actor: User, input: GuideInput, now: Date) {
  requireAuthor(actor);
  const meta = cleanMeta(input);
  const t = String(input.template ?? "blank");
  const first = t === "assessment" || t in PAGE_TEMPLATES ? (t as PageTemplate | "assessment") : "blank";
  const doc = input.doc === undefined ? { schema: 2 as const, pages: [templatePage(first, rid)] } : cleanDoc(input.doc, true);
  let slug = slugify(meta.title);
  for (let n = 2; guideBySlug(db, slug); n++) slug = `${slugify(meta.title)}-${n}`;
  const id = `mag-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO magazine_guides (id, slug, title, standfirst, cover, template, audience, completion, status, draft, draft_saved_at, owner, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'blank', ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
  ).run(id, slug, meta.title, meta.standfirst, meta.cover, JSON.stringify(meta.audience), meta.completion, JSON.stringify(doc), at, actor.id, at, actor.id, at);
  audit(db, { actor: actor.id, event: "magazine.created", entity: id, next: { slug, pages: doc.pages.length }, at: now });
  return authorGuide(db, actor, id);
}

/** Saves the author's draft. The published version learners read is untouched until they publish. */
export function saveGuideDraft(db: Db, actor: User, id: string, input: GuideInput, now: Date) {
  requireAuthor(actor);
  const g = guideById(db, id);
  if (!g || g.status === "archived") throw new HttpError(404, "Guide not found.");
  if (typeof input.basedOn === "string" && input.basedOn !== g.draft_saved_at)
    throw new HttpError(409, "This course was changed in another tab or by someone else after this editor opened it.");
  const meta = cleanMeta(input, g, { draft: true });
  const doc = input.doc === undefined ? readGuideDoc(JSON.parse(g.draft), { draft: true }) : cleanDoc(input.doc, true);
  // The status doesn't change: a published course stays published (learners keep reading its version), and
  // authorGuide's "changed" says the draft has changes waiting to be published.
  db.prepare(
    "UPDATE magazine_guides SET title = ?, standfirst = ?, cover = ?, audience = ?, completion = ?, draft = ?, draft_saved_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
  ).run(
    meta.title,
    meta.standfirst,
    meta.cover,
    JSON.stringify(meta.audience),
    meta.completion,
    JSON.stringify(doc),
    now.toISOString(),
    actor.id,
    now.toISOString(),
    id,
  );
  return authorGuide(db, actor, id);
}

type SignoffRow = { block_id: string; flag_note: string; note: string; signed_by: string; signed_at: string; name: string | null };

/** Sign-offs that still hold: the block still carries the same verification flag. */
function signoffsFor(db: Db, guideId: string, doc: GuideDoc) {
  const flags = new Map(allBlocks(doc).flatMap((b) => (b.flag?.kind === "verify" ? [[b.id, b.flag.note] as const] : [])));
  return (
    db.prepare("SELECT s.*, u.name FROM magazine_flag_signoffs s LEFT JOIN users u ON u.id = s.signed_by WHERE s.guide_id = ?").all(guideId) as SignoffRow[]
  ).filter((s) => flags.get(s.block_id) === s.flag_note);
}

/** Every block flagged as needing verification, where it is, and its sign-off if it has one. */
function verifyFlags(doc: GuideDoc, signoffs: SignoffRow[]) {
  const many = doc.pages.length > 1;
  return doc.pages.flatMap((p, pi) =>
    p.sections.flatMap((s) =>
      s.blocks.flatMap((b, i) => {
        if (b.flag?.kind !== "verify") return [];
        const so = signoffs.find((x) => x.block_id === b.id);
        return [
          {
            blockId: b.id,
            pageId: p.id,
            where: `${many ? `Page ${pi + 1}, ` : ""}“${s.title}”, ${BLOCK_LABELS[b.type].toLowerCase()} ${i + 1}`,
            note: b.flag.note,
            signoff: so ? { note: so.note, by: so.name ?? so.signed_by, at: so.signed_at } : null,
          },
        ];
      }),
    ),
  );
}

/** The course as its author works on it: the draft, the publish checks, the versions so far and how far people get. */
export function authorGuide(db: Db, actor: User, id: string) {
  requireAuthor(actor);
  const g = guideById(db, id);
  if (!g) throw new HttpError(404, "Guide not found.");
  const doc = readGuideDoc(JSON.parse(g.draft), { draft: true });
  const live = g.revision_id ? revisionById(db, g.revision_id) : undefined;
  const signoffs = signoffsFor(db, g.id, doc);
  const checks = publishChecks(doc, g.completion, new Set(signoffs.map((s) => s.block_id)));
  if (g.title.length < 2) checks.blocking.unshift("Give the guide a title.");
  const revisions = db
    .prepare("SELECT id, number, summary, published_by, published_at FROM magazine_revisions WHERE guide_id = ? ORDER BY number DESC")
    .all(g.id) as Pick<RevisionRow, "id" | "number" | "summary" | "published_by" | "published_at">[];
  // People who finished each page of the live version, to see where they drop off.
  const finishes = live
    ? Object.fromEntries(
        (
          db.prepare("SELECT page_id, COUNT(DISTINCT user_id) AS n FROM magazine_page_finishes WHERE revision_id = ? GROUP BY page_id").all(live.id) as {
            page_id: string;
            n: number;
          }[]
        ).map((r) => [r.page_id, r.n]),
      )
    : {};
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    standfirst: g.standfirst,
    cover: g.cover,
    audience: audienceOf(g),
    completion: g.completion,
    status: g.status,
    doc,
    savedAt: g.draft_saved_at,
    publishedRevisionId: g.revision_id,
    publishedNumber: live?.number ?? null,
    // The draft differs from what learners read.
    changed:
      !live ||
      // Both read the same way, so an edition saved on an older schema compares fairly.
      JSON.stringify(readGuideDoc(JSON.parse(live.doc), { draft: true })) !== JSON.stringify(doc) ||
      live.title !== g.title ||
      live.standfirst !== g.standfirst ||
      live.cover !== g.cover ||
      live.completion !== g.completion,
    checks,
    flags: verifyFlags(doc, signoffs),
    // While review is optional, open verification flags don't stop publishing (Publish anyway records them).
    reviewRequired: reviewRequired(),
    revisions,
    finishes: finishes as Record<string, number>,
    started: live ? (db.prepare("SELECT COUNT(*) AS n FROM magazine_progress WHERE guide_id = ?").get(g.id) as { n: number }).n : 0,
  };
}

/**
  Publishes the draft as a new immutable course version. Refused while any required check is open (an
  unverified claim, a picture without a description, video without captions or a transcript).
  moveLearners: a material update, so people part-way through an earlier version move to this one.
*/
export function publishGuide(db: Db, actor: User, id: string, summary: unknown, now: Date, { moveLearners = false, allowUnverified = false } = {}) {
  const a = authorGuide(db, actor, id);
  if (a.status === "archived") throw new HttpError(404, "Guide not found.");
  // Publishing anyway (only while review is optional) publishes what's there, whatever the checks say.
  const blocking = allowUnverified ? [] : a.checks.blocking;
  if (blocking.length)
    throw Object.assign(new HttpError(400, `Resolve ${blocking.length === 1 ? "1 check" : `${blocking.length} checks`} before publishing.`), {
      problems: blocking,
    });
  // One thing "Publish anyway" can't waive: a Spot the Signal case teaches a regulatory judgement, so it never
  // reaches learners without its Clinical and Quality approval and source version on record.
  const draftBlocks = allBlocks(readGuideDoc(a.doc, { draft: true }));
  const unapproved = draftBlocks.filter((b) => b.type === "signal" && !signalApproved(b));
  // The same for a Mission Board: its dates, screening routes and statement rules are policy, signed off by the teams that own them.
  const unsigned = draftBlocks.filter((b) => b.type === "mission" && !missionApproved(b));
  // And a Balance Scale: its rules about choice, falls, worker safety and funded workers are clinical and policy judgements.
  const unbalanced = draftBlocks.filter((b) => b.type === "balance" && !balanceApproved(b));
  // And an Invoice X-Ray: its eligibility answers, arithmetic and scripts are Finance, Care Operations and Quality judgements.
  const unchecked = draftBlocks.filter((b) => b.type === "xray" && !xrayApproved(b));
  // And an Expectation Reset: its scripts speak for Trilogy Care to waiting families, so Care Operations, Quality, Privacy and Communications sign off.
  const unreviewed = draftBlocks.filter((b) => b.type === "reset" && !resetApproved(b));
  // And Where Is the Line?: its answer keys are clinical and policy judgements, signed off card by card and as a deck.
  const unkeyed = draftBlocks.filter((b) => b.type === "line" && (!lineApproved(b) || b.cases.some((c) => c.status !== "approved")));
  // And While You Wait: its figures, status language and family summary need Operations, Finance, Quality, Privacy and Communications.
  const unpriced = draftBlocks.filter((b) => b.type === "bridge" && !bridgeApproved(b));
  // And The SaH Journey: its pathway, fall branch, government claims and family access need their reviewers.
  const unjourneyed = draftBlocks.filter((b) => b.type === "journey" && !journeyApproved(b));
  if (unjourneyed.length)
    throw Object.assign(
      new HttpError(400, "The SaH Journey needs its sign-off and source version recorded before it can be published. “Publish anyway” doesn’t cover this."),
      {
        problems: unjourneyed.map(
          (b) =>
            `“${b.type === "journey" ? b.title : ""}”: record the content owner, the Care Operations, Clinical, Quality, Privacy and Communications reviewers, the date, and the source and version.`,
        ),
      },
    );
  if (unpriced.length)
    throw Object.assign(
      new HttpError(
        400,
        "A While You Wait calculator needs its sign-off and source version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unpriced.map(
          (b) =>
            `“${b.type === "bridge" ? b.title : ""}”: record the content owner, the Operations, Finance, Quality, Privacy and Communications reviewers, the date, and the source and version.`,
        ),
      },
    );
  if (unkeyed.length)
    throw Object.assign(
      new HttpError(
        400,
        "“Where Is the Line?” needs every card approved and the deck signed off before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unkeyed.map(
          (b) =>
            `“${b.type === "line" ? b.title : ""}”: approve each card with its Clinical or Quality approver and review date, and record the deck’s owner, Care Partner, Clinical and Quality reviewers, date, and policy set version.`,
        ),
      },
    );
  if (unreviewed.length)
    throw Object.assign(
      new HttpError(
        400,
        "An Expectation Reset timeline needs its sign-off and source version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unreviewed.map(
          (b) =>
            `“${b.type === "reset" ? b.title : ""}”: record the content owner, the Care Operations, Quality, Privacy and Communications reviewers, the date, and the source and version.`,
        ),
      },
    );
  if (unchecked.length)
    throw Object.assign(
      new HttpError(
        400,
        "An Invoice X-Ray case needs its sign-off and ruleset version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unchecked.map(
          (b) =>
            `“${b.type === "xray" ? b.title : ""}”: record the content owner, the Finance, Care Operations and Quality reviewers, the date, and the ruleset and its version.`,
        ),
      },
    );
  if (unbalanced.length)
    throw Object.assign(
      new HttpError(
        400,
        "A Balance Scale case needs its sign-off and source version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unbalanced.map(
          (b) =>
            `“${b.type === "balance" ? b.title : ""}”: record the content owner, the Clinical, Quality and Care Operations reviewers (and WHS, where workers are at risk), the date, and the policy source and version.`,
        ),
      },
    );
  if (unsigned.length)
    throw Object.assign(
      new HttpError(
        400,
        "A First 30 Days Mission Board needs its sign-off and source version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unsigned.map(
          (b) =>
            `“${b.type === "mission" ? b.title : ""}”: record the Care Operations owner, the Supplier Compliance, Finance and Quality reviewers, the approval date, and the policy source and version.`,
        ),
      },
    );
  if (unapproved.length)
    throw Object.assign(
      new HttpError(
        400,
        "A Spot the Signal case needs its Clinical and Quality approval and source version recorded before it can be published. “Publish anyway” doesn’t cover this.",
      ),
      {
        problems: unapproved.map(
          (b) =>
            `“${b.type === "signal" ? b.title : ""}”: record the content owner, clinical reviewer, Quality reviewer, approval date, and the policy source and version.`,
        ),
      },
    );
  // The Question Pool's gate (only when "require approval" is on): every question an approved version.
  publishGate(db, questionsInGuide({ id: a.id, title: a.title, audience: "" }, readGuideDoc(a.doc, { draft: true }), "next", true), now);
  const prev = a.publishedRevisionId ? revisionById(db, a.publishedRevisionId) : undefined;
  const number = (prev?.number ?? 0) + 1;
  const revisionId = `${a.id}-r${number}`;
  const at = now.toISOString();
  // Published editions are read leniently (see readGuide), so an unfinished part published anyway still shows.
  const doc = readGuideDoc(a.doc, { draft: allowUnverified });
  tx(db, () => {
    db.prepare(
      `INSERT INTO magazine_revisions (id, guide_id, number, parent_id, title, standfirst, cover, doc, completion, minutes, summary, published_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      revisionId,
      a.id,
      number,
      prev?.id ?? null,
      a.title,
      a.standfirst,
      a.cover,
      JSON.stringify(doc),
      a.completion,
      readingMinutes(doc),
      String(summary ?? "")
        .trim()
        .slice(0, 400),
      actor.id,
      at,
    );
    db.prepare("UPDATE magazine_guides SET status = 'published', revision_id = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      revisionId,
      actor.id,
      at,
      a.id,
    );
    if (moveLearners && prev)
      db.prepare("UPDATE magazine_progress SET revision_id = ?, answers = '{}', last_page = NULL, last_section = NULL, updated_at = ? WHERE guide_id = ?").run(
        revisionId,
        at,
        a.id,
      );
    audit(db, {
      actor: actor.id,
      event: "magazine.published",
      entity: a.id,
      previous: prev?.id ?? null,
      next: revisionId,
      reason: moveLearners ? "moved learners" : undefined,
      at: now,
    });
  });
  afterPublish(db, actor, now);
  return authorGuide(db, actor, id);
}

/** Takes a course out of Magazine. Learners' records are kept. */
export function archiveGuide(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const g = guideById(db, id);
  if (!g) throw new HttpError(404, "Guide not found.");
  db.prepare("UPDATE magazine_guides SET status = 'archived', updated_by = ?, updated_at = ? WHERE id = ?").run(actor.id, now.toISOString(), id);
  audit(db, { actor: actor.id, event: "magazine.archived", entity: id, at: now });
}

/** Brings an archived course back as it was: published again if it had been, otherwise a draft. */
export function restoreGuide(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const g = guideById(db, id);
  if (!g || g.status !== "archived") throw new HttpError(404, "Guide not found.");
  db.prepare("UPDATE magazine_guides SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
    g.revision_id ? "published" : "draft",
    actor.id,
    now.toISOString(),
    id,
  );
  audit(db, { actor: actor.id, event: "magazine.restored", entity: id, at: now });
  return authorGuide(db, actor, id);
}

/** A copy of a course's draft as a new, unpublished one. */
export function duplicateGuide(db: Db, actor: User, id: string, now: Date) {
  const a = authorGuide(db, actor, id);
  return createGuide(
    db,
    actor,
    {
      title: `${a.title || "Untitled guide"} (copy)`.slice(0, 140),
      standfirst: a.standfirst,
      cover: a.cover,
      audience: a.audience,
      completion: a.completion,
      doc: a.doc,
    },
    now,
  );
}

/** Every course and guide for the Magazine admin list, newest change first, with how many people started and completed each. */
export function adminGuides(db: Db, actor: User) {
  requireAuthor(actor);
  const rows = db.prepare("SELECT id, updated_at FROM magazine_guides ORDER BY updated_at DESC").all() as { id: string; updated_at: string }[];
  return rows.map(({ id, updated_at }) => {
    const a = authorGuide(db, actor, id);
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      standfirst: a.standfirst,
      cover: a.cover,
      format: formatLabel(a.doc),
      pages: a.doc.pages.length,
      status: a.status,
      audience: a.audience,
      completion: a.completion,
      changed: a.changed,
      publishedNumber: a.publishedNumber,
      savedAt: a.savedAt,
      /** The last change of any kind; for a deleted one, when it was deleted. */
      updatedAt: updated_at,
      minutes: readingMinutes(a.doc),
      blocking: a.checks.blocking.length,
      started: a.started,
      completed: (
        db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM magazine_completions WHERE guide_id = ? AND kind = 'completed'").get(id) as { n: number }
      ).n,
    };
  });
}

/**
  The saved draft drawn by the reader, for the author's preview at desktop or phone size. Nothing a
  previewer does is recorded.
*/
export function previewGuide(db: Db, actor: User, id: string): ReaderGuide {
  const a = authorGuide(db, actor, id);
  return {
    id: a.id,
    slug: a.slug,
    revisionId: "draft",
    revision: (a.publishedNumber ?? 0) + 1,
    olderEdition: false,
    title: a.title || "Untitled guide",
    standfirst: a.standfirst,
    cover: a.cover,
    format: formatLabel(a.doc),
    audience: audiencePhrase(a.audience),
    minutes: readingMinutes(a.doc),
    pageMinutes: Object.fromEntries(a.doc.pages.map((pg) => [pg.id, pageMinutes(pg)])),
    publishedAt: a.savedAt,
    completion: a.completion,
    // An author's preview keeps the questions: it runs reviews in the browser, recording nothing.
    doc: a.doc,
    guide: guideIdentity(db),
    practice: practiceSummary(a.doc),
    progress: { lastPage: null, lastSection: null, answers: {}, finished: [], started: false, reflections: {}, notes: {} },
    completed: null,
    quizzes: quizStates(db, actor, a.doc),
  };
}
