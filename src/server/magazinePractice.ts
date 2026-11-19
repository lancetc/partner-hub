import "server-only";
import { randomUUID } from "node:crypto";
import type { GuideDoc, PracticeItem } from "@/lib/magazine";
import { itemState, itemVersion, liveItems, pickItems, REVIEW_SIZE } from "@/lib/magazineReview";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { practiceBlocked } from "./questionPool";

/*
  Self-review ("Test myself") for learners: a review is up to three approved questions on this page, or on
  the pages they've opened so far, asked one at a time with feedback. Kept apart from everything that counts:
  nothing here touches progress, page finishes, completions, quizzes or certificates, and only the learner
  can read their own reviews. The server chooses the questions and keeps the answers; the browser is only
  ever sent a question's answer once it has been answered.
*/

type SessionRow = {
  id: string;
  guide_id: string;
  user_id: string;
  revision_id: string;
  scope: "page" | "course";
  page_id: string;
  pages: string;
  items: string;
  position: number;
  repeats: number;
  status: "active" | "paused" | "completed" | "ended";
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};
type ResponseRow = { session_id: string; item_id: string; version: string; choice_id: string; correct: number; at: string };
/** A question as it was asked: the item, its version, and the title of the page it's about. */
type Asked = PracticeItem & { version: string; pageTitle: string };

const sessionOf = (db: Db, id: unknown) =>
  typeof id === "string" ? (db.prepare("SELECT * FROM magazine_practice_sessions WHERE id = ?").get(id) as SessionRow | undefined) : undefined;
const responsesOf = (db: Db, sessionId: string) => db.prepare("SELECT * FROM magazine_practice_responses WHERE session_id = ?").all(sessionId) as ResponseRow[];

function practiceEvent(db: Db, e: { user: string; guide: string; revision: string; event: string; page?: string; detail: object; at: Date }) {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, page_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    e.at.toISOString(),
    e.user,
    e.guide,
    e.revision,
    `practice.${e.event}`,
    e.page ?? null,
    JSON.stringify(e.detail),
  );
}

/** The questions that may be served: approved in the course, and not flagged or retired in the Question Pool. */
function servable(db: Db, guideId: string, doc: GuideDoc, pageIds?: readonly string[]) {
  const items = liveItems(doc, pageIds);
  const blocked = practiceBlocked(db, guideId, items);
  return blocked.size ? items.filter((it) => !blocked.has(it.id)) : items;
}

/** The edition they read, with self-review switched on; otherwise it isn't there for them. */
function editionWithPractice(db: Db, user: User, guideId: string) {
  const ed = readerEdition(db, user, guideId);
  if (!ed.doc.review?.enabled) throw new HttpError(404, "Self-review isn’t switched on for this course.");
  return ed;
}

const contentPage = (doc: GuideDoc, pageId: unknown) => {
  const page = doc.pages.find((p) => p.id === pageId && p.kind === "content");
  if (!page) throw new HttpError(400, "That page isn’t in this course.");
  return page;
};

/**
  The pages a "course so far" review may draw on: reading pages they've opened in this course (in any edition,
  as long as the page is still in this one), and the one they're on. Never a page they haven't reached.
*/
function pagesSoFar(db: Db, user: User, guideId: string, doc: GuideDoc, current: string) {
  const opened = new Set(
    (
      db.prepare("SELECT DISTINCT page_id FROM magazine_events WHERE guide_id = ? AND user_id = ? AND event = 'page.opened'").all(guideId, user.id) as {
        page_id: string | null;
      }[]
    )
      .map((r) => r.page_id)
      .filter((x): x is string => Boolean(x)),
  );
  opened.add(current);
  return doc.pages.filter((p) => p.kind === "content" && opened.has(p.id)).map((p) => p.id);
}

const titleOf = (doc: GuideDoc, pageId: string, courseTitle: string) => {
  const i = doc.pages.findIndex((p) => p.id === pageId);
  return doc.pages[i]?.title || (doc.pages.length === 1 ? courseTitle : `Page ${i + 1}`);
};

/** A question as the learner sees it: its answer only once they've answered it. */
function questionView(it: Asked, r: ResponseRow | undefined) {
  const picked = r ? it.choices.find((c) => c.id === r.choice_id) : undefined;
  const best = it.choices.find((c) => c.id === it.answer);
  return {
    id: it.id,
    kind: it.kind,
    prompt: it.prompt,
    ...(it.example && { example: it.example }),
    choices: it.choices.map((c) => ({ id: c.id, text: c.text })),
    source: { pageId: it.pageId, ...(it.sectionId && { sectionId: it.sectionId }), title: it.pageTitle },
    ...(r && {
      result: {
        choiceId: r.choice_id,
        correct: Boolean(r.correct),
        answer: it.answer,
        answerText: best?.text ?? "",
        explanation: it.explanation,
        ...(picked?.feedback && { feedback: picked.feedback }),
      },
    }),
  };
}
export type PracticeQuestion = ReturnType<typeof questionView>;

function sessionView(db: Db, s: SessionRow) {
  const items = JSON.parse(s.items) as Asked[];
  const answers = new Map(responsesOf(db, s.id).map((r) => [r.item_id, r]));
  return {
    id: s.id,
    scope: s.scope,
    status: s.status,
    position: s.position,
    total: items.length,
    repeats: Boolean(s.repeats),
    questions: items.map((it) => questionView(it, answers.get(it.id))),
  };
}
export type PracticeSession = ReturnType<typeof sessionView>;

/**
  Whether a review can carry on in the edition they read now: the same edition, and every question still to
  be asked still approved in the same version. If not, the review ends (its history is kept) and they start
  a new one.
*/
function stillValid(db: Db, s: SessionRow, revisionId: string, doc: GuideDoc) {
  if (s.revision_id !== revisionId) return false;
  const items = JSON.parse(s.items) as Asked[];
  const next = items.slice(s.position).map((it) => ({ asked: it, now: doc.review?.items.find((x) => x.id === it.id) }));
  if (!next.every(({ asked, now }) => now && itemState(now, doc) === "live" && itemVersion(now) === asked.version)) return false;
  // ...and none flagged or retired in the Question Pool since.
  return (
    practiceBlocked(
      db,
      s.guide_id,
      next.map((x) => x.now!),
    ).size === 0
  );
}

function endChanged(db: Db, s: SessionRow, now: Date) {
  db.prepare("UPDATE magazine_practice_sessions SET status = 'ended', updated_at = ? WHERE id = ?").run(now.toISOString(), s.id);
}

/** Their review in progress (started or paused), if it can still carry on; one that can't is ended. */
function openSession(db: Db, user: User, guideId: string, revisionId: string, doc: GuideDoc, now: Date) {
  const s = db
    .prepare("SELECT * FROM magazine_practice_sessions WHERE guide_id = ? AND user_id = ? AND status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1")
    .get(guideId, user.id) as SessionRow | undefined;
  if (!s) return { session: null, changed: false };
  if (!stillValid(db, s, revisionId, doc)) {
    endChanged(db, s, now);
    return { session: null, changed: true };
  }
  return { session: s, changed: false };
}

/** Their own finished reviews of this course, newest first. */
function history(db: Db, user: User, guideId: string) {
  const rows = db
    .prepare("SELECT * FROM magazine_practice_sessions WHERE guide_id = ? AND user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 20")
    .all(guideId, user.id) as SessionRow[];
  return rows.map((s) => {
    const items = JSON.parse(s.items) as Asked[];
    const answers = responsesOf(db, s.id);
    return {
      id: s.id,
      at: s.completed_at ?? s.updated_at,
      scope: s.scope,
      pageTitle: items[0]?.pageTitle ?? "",
      total: items.length,
      correct: answers.filter((r) => r.correct).length,
    };
  });
}

/**
  What the Quick review dialog opens with: how many questions this page and the course so far have, their
  review in progress (or that one ended because the course changed), and their past reviews.
*/
export function practiceState(db: Db, user: User, guideId: string, pageId: unknown, now: Date) {
  const { guide, revision, doc } = editionWithPractice(db, user, guideId);
  const page = contentPage(doc, pageId);
  const soFar = pagesSoFar(db, user, guide.id, doc, page.id);
  return tx(db, () => {
    const open = openSession(db, user, guide.id, revision.id, doc, now);
    return {
      revisionId: revision.id,
      page: { id: page.id, questions: servable(db, guide.id, doc, [page.id]).length },
      course: doc.pages.length > 1 ? { pages: soFar.length, questions: servable(db, guide.id, doc, soFar).length } : null,
      session: open.session ? sessionView(db, open.session) : null,
      changed: open.changed,
      history: history(db, user, guide.id),
    };
  });
}

/** Starts a review: up to three approved questions, chosen so they rotate. Any review in progress ends. */
export function startPractice(db: Db, user: User, guideId: string, input: { revisionId?: unknown; scope?: unknown; pageId?: unknown }, now: Date) {
  const { guide, revision, doc } = editionWithPractice(db, user, guideId);
  if (input.revisionId !== revision.id) throw new HttpError(409, "This course has been updated. Reload the page to review the latest version.");
  const page = contentPage(doc, input.pageId);
  const scope = input.scope === "course" && doc.pages.length > 1 ? "course" : "page";
  const pages = scope === "course" ? pagesSoFar(db, user, guide.id, doc, page.id) : [page.id];
  const pool = servable(db, guide.id, doc, pages);
  if (!pool.length) throw new HttpError(409, "There aren’t any questions to review here yet.");
  return tx(db, () => {
    const at = now.toISOString();
    db.prepare(
      "UPDATE magazine_practice_sessions SET status = 'ended', updated_at = ? WHERE guide_id = ? AND user_id = ? AND status IN ('active', 'paused')",
    ).run(at, guide.id, user.id);
    const past = db
      .prepare(
        `SELECT r.item_id AS itemId, r.correct, r.at FROM magazine_practice_responses r JOIN magazine_practice_sessions s ON s.id = r.session_id
         WHERE s.guide_id = ? AND s.user_id = ?`,
      )
      .all(guide.id, user.id) as { itemId: string; correct: number; at: string }[];
    const last = db
      .prepare("SELECT items FROM magazine_practice_sessions WHERE guide_id = ? AND user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1")
      .get(guide.id, user.id) as { items: string } | undefined;
    const lastIds = last ? (JSON.parse(last.items) as Asked[]).map((it) => it.id) : [];
    const { items, repeats } = pickItems(
      pool,
      past.map((p) => ({ itemId: p.itemId, correct: Boolean(p.correct), at: p.at })),
      lastIds,
      now,
      REVIEW_SIZE,
    );
    const asked: Asked[] = items.map((it) => ({ ...it, version: itemVersion(it), pageTitle: titleOf(doc, it.pageId, guide.title) }));
    const id = `prs-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    db.prepare(
      `INSERT INTO magazine_practice_sessions (id, guide_id, user_id, revision_id, scope, page_id, pages, items, position, repeats, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)`,
    ).run(id, guide.id, user.id, revision.id, scope, page.id, JSON.stringify(pages), JSON.stringify(asked), repeats ? 1 : 0, at, at);
    practiceEvent(db, {
      user: user.id,
      guide: guide.id,
      revision: revision.id,
      event: "started",
      page: page.id,
      detail: { session: id, scope, pages: pages.length, items: asked.map((it) => ({ id: it.id, version: it.version })) },
      at: now,
    });
    return sessionView(db, sessionOf(db, id)!);
  });
}

/** Their own review in this course, or 404. */
function mine(db: Db, user: User, guideId: string, sessionId: unknown) {
  const s = sessionOf(db, sessionId);
  if (!s || s.user_id !== user.id || s.guide_id !== guideId) throw new HttpError(404, "That review isn’t there.");
  return s;
}

/**
  Answers a question. Saved once: answering the same question again (a retry after a slow network) returns
  the first answer rather than counting twice. Questions are answered in order.
*/
export function answerPractice(db: Db, user: User, guideId: string, input: { sessionId?: unknown; itemId?: unknown; choiceId?: unknown }, now: Date) {
  const { guide, revision, doc } = editionWithPractice(db, user, guideId);
  return tx(db, () => {
    const s = mine(db, user, guide.id, input.sessionId);
    const items = JSON.parse(s.items) as Asked[];
    const i = items.findIndex((it) => it.id === input.itemId);
    if (i < 0) throw new HttpError(400, "That question isn’t in this review.");
    const it = items[i];
    const already = responsesOf(db, s.id).find((r) => r.item_id === it.id);
    if (already) return { session: sessionView(db, s) };
    if (s.status === "completed" || s.status === "ended") throw new HttpError(409, "This review has finished. Start another one.");
    if (i !== s.position) throw new HttpError(409, "Answer the questions in order.");
    if (!stillValid(db, s, revision.id, doc)) {
      endChanged(db, s, now);
      throw new HttpError(409, "This course changed since you started the review, so it has ended. Start a new one.");
    }
    if (!it.choices.some((c) => c.id === input.choiceId)) throw new HttpError(400, "Choose one of the answers.");
    const correct = input.choiceId === it.answer;
    const at = now.toISOString();
    db.prepare("INSERT INTO magazine_practice_responses (session_id, item_id, version, choice_id, correct, at) VALUES (?, ?, ?, ?, ?, ?)").run(
      s.id,
      it.id,
      it.version,
      input.choiceId as string,
      correct ? 1 : 0,
      at,
    );
    const position = i + 1;
    const done = position >= items.length;
    db.prepare("UPDATE magazine_practice_sessions SET position = ?, status = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(
      position,
      done ? "completed" : "active",
      at,
      done ? at : null,
      s.id,
    );
    practiceEvent(db, {
      user: user.id,
      guide: guide.id,
      revision: s.revision_id,
      event: "answered",
      page: it.pageId,
      detail: { session: s.id, item: it.id, version: it.version, choice: input.choiceId, correct },
      at: now,
    });
    if (done)
      practiceEvent(db, {
        user: user.id,
        guide: guide.id,
        revision: s.revision_id,
        event: "finished",
        page: s.page_id,
        detail: { session: s.id, total: items.length, correct: responsesOf(db, s.id).filter((r) => r.correct).length },
        at: now,
      });
    return { session: sessionView(db, sessionOf(db, s.id)!) };
  });
}

/**
  The dialog opening, closing (a pause), opening again (a resume), or the learner following "See this in the
  course" (which pauses it, so they can come back). Recorded for the course's own analytics; never as progress.
*/
export function practiceMoment(db: Db, user: User, guideId: string, input: { action?: unknown; sessionId?: unknown; pageId?: unknown }, now: Date) {
  const { guide, revision, doc } = editionWithPractice(db, user, guideId);
  const action = input.action;
  if (action === "opened") {
    const page = contentPage(doc, input.pageId);
    practiceEvent(db, { user: user.id, guide: guide.id, revision: revision.id, event: "opened", page: page.id, detail: {}, at: now });
    return { ok: true };
  }
  if (action !== "pause" && action !== "resume" && action !== "source") throw new HttpError(400, "Unknown action.");
  return tx(db, () => {
    const s = mine(db, user, guide.id, input.sessionId);
    if (s.status === "completed" || s.status === "ended") {
      if (action === "source")
        practiceEvent(db, {
          user: user.id,
          guide: guide.id,
          revision: s.revision_id,
          event: "source",
          page: String(input.pageId ?? ""),
          detail: { session: s.id },
          at: now,
        });
      return { session: sessionView(db, s) };
    }
    if (action === "resume" && !stillValid(db, s, revision.id, doc)) {
      endChanged(db, s, now);
      throw new HttpError(409, "This course changed since you started the review, so it has ended. Start a new one.");
    }
    const status = action === "resume" ? "active" : "paused";
    db.prepare("UPDATE magazine_practice_sessions SET status = ?, updated_at = ? WHERE id = ?").run(status, now.toISOString(), s.id);
    practiceEvent(db, {
      user: user.id,
      guide: guide.id,
      revision: s.revision_id,
      event: action === "resume" ? "resumed" : action === "source" ? "source" : "paused",
      page: typeof input.pageId === "string" ? input.pageId : s.page_id,
      detail: { session: s.id, position: s.position },
      at: now,
    });
    return { session: sessionView(db, sessionOf(db, s.id)!) };
  });
}

/**
  For authors: how each question is doing, and how much the feature is used. Totals only: no learner's name
  or individual answers.
*/
export function practiceStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  const items = db
    .prepare(
      `SELECT r.item_id AS itemId, COUNT(*) AS answered, SUM(r.correct) AS correct FROM magazine_practice_responses r
       JOIN magazine_practice_sessions s ON s.id = r.session_id WHERE s.guide_id = ? GROUP BY r.item_id`,
    )
    .all(guideId) as { itemId: string; answered: number; correct: number }[];
  const use = db
    .prepare(
      `SELECT COUNT(*) AS started, SUM(status = 'completed') AS finished, COUNT(DISTINCT user_id) AS learners FROM magazine_practice_sessions WHERE guide_id = ?`,
    )
    .get(guideId) as { started: number; finished: number | null; learners: number };
  const sources = (db.prepare("SELECT COUNT(*) AS n FROM magazine_events WHERE guide_id = ? AND event = 'practice.source'").get(guideId) as { n: number }).n;
  return {
    items: Object.fromEntries(items.map((r) => [r.itemId, { answered: r.answered, correct: r.correct ?? 0 }])),
    started: use.started,
    finished: use.finished ?? 0,
    learners: use.learners,
    sourceVisits: sources,
  };
}
