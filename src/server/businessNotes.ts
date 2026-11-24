import "server-only";
import { randomUUID } from "node:crypto";
import {
  chapterProblems,
  CONSENTS,
  cleanBusiness,
  cleanChapter,
  COLLECTIONS,
  EVENTS,
  held,
  heldReason,
  isAnswered,
  orderReplies,
  PROPOSAL_OUTPUTS,
  PROPOSAL_STATUS,
  REPLY_LABELS,
  REVIEW_STEPS,
  screenText,
  STAGES,
  stepsNeeded,
  suppress,
  THEMES,
  TOOLS,
  URGENT_ROUTE,
  cellText,
  type BusinessEvent,
  type ConsentKey,
  type PostStatus,
  type ProposalOutput,
  type ProposalStatus,
  type ReplyLabel,
  type ReviewStep,
  type Screen,
  type ToolId,
} from "@/lib/businessNotes";
import { cleanNote, isPublished, noteProblems, type MentorNote, type MentorNoteData, type NoteState } from "@/lib/notes";
import { BUSINESS_SEED_POSTS, BUSINESS_SEEDS } from "@/content/businessNotes";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { ensureBusinessTables, isPrincipal, resolveTool } from "./businessAccess";
import { editorAction, ensureNotes, myNoteAction, myNotes, readerCards, saveMyNote, toggleHelpful, toggleSave } from "./notes";
import { notify } from "./notifications";
import { problemAction } from "./problemDesk";
import { workbook, type Sheet } from "./xlsx";

/*
  Care Partner Business Field Notes (docs/business-field-notes.md): the business edition of Notes to a Younger Me.

  - Cards ARE mentor notes (server/notes): one library, one version history, one set of helpful votes, one Pocket
    Deck. This module adds what the business edition needs around them: one canonical moderated thread per card,
    private first thoughts and check-in plans, dated check-in chapters, the extra review steps, consent records,
    playbook proposals (into the Problem desk) and aggregate insights.
  - Principal-only at every surface. Every reader function starts with requirePrincipal, which answers "not found"
    to anyone else, so a guessed address or id says nothing. Editors work through the admin functions, which never
    return a reader's private words.
  - A withdrawn card, a consent change or a card waiting for re-review takes effect on the next read everywhere:
    nothing here keeps a copy of a card.
*/

const today = (now: Date) => now.toISOString().slice(0, 10);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const NOT_FOUND = "Not found.";

type NoteRow = {
  id: string;
  version: number;
  state: NoteState;
  data: string;
  author_user: string;
  reason: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};
const toNote = (r: NoteRow): MentorNote => ({
  id: r.id,
  version: r.version,
  state: r.state,
  data: cleanNote(JSON.parse(r.data)),
  authorUser: r.author_user,
  reason: r.reason,
  reviewedBy: r.reviewed_by ?? "",
  reviewedAt: r.reviewed_at ?? "",
  updatedAt: r.updated_at,
});
const versions = (db: Db, id: string) => (db.prepare("SELECT * FROM mentor_notes WHERE id = ? ORDER BY version DESC").all(id) as NoteRow[]).map(toNote);
const current = (db: Db, id: string) => versions(db, id).find(isPublished);
/** Every business card's id, newest first by its editorial number. */
function businessIds(db: Db) {
  const ids = (db.prepare("SELECT DISTINCT id FROM mentor_notes").all() as { id: string }[]).map((r) => r.id);
  return ids.filter((id) => Boolean(versions(db, id)[0]?.data.business));
}

// ---------------------------------------------------------------------------------------------
// Setup and seeds
// ---------------------------------------------------------------------------------------------

const seeded = new WeakSet<object>();
/** The tables, and the fictional development seeds waiting for review the first time. */
export function ensureBusiness(db: Db, now = new Date()) {
  ensureNotes(db, now);
  ensureBusinessTables(db);
  if (seeded.has(db)) return;
  const at = now.toISOString();
  for (const s of BUSINESS_SEEDS) {
    if (db.prepare("SELECT 1 FROM mentor_notes WHERE id = ?").get(s.id)) continue;
    db.prepare(
      "INSERT INTO mentor_notes (id, version, state, data, author_user, reason, created_at, updated_at) VALUES (?, 1, 'submitted', ?, '', '', ?, ?)",
    ).run(s.id, JSON.stringify(s.data), at, at);
    s.chapters.forEach((c, i) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO bfn_chapters (note_id, number, version, state, data, author_user, created_at, updated_at) VALUES (?, ?, 1, 'submitted', ?, '', ?, ?)",
        )
        .run(s.id, i + 1, JSON.stringify(c), at, at),
    );
    const ids = new Map<string, string>();
    for (const p of BUSINESS_SEED_POSTS.filter((x) => x.noteId === s.id)) {
      const id = `bfp-seed-${s.id}-${p.key}`;
      ids.set(p.key, id);
      db.prepare(
        "INSERT OR IGNORE INTO bfn_posts (id, thread_id, parent_id, author_id, author_label, label, body, chapter, note_version, status, created_at) VALUES (?, ?, ?, 'seed', ?, ?, ?, 0, 1, 'posted', ?)",
      ).run(id, threadFor(db, s.id, now).id, p.parent ? (ids.get(p.parent) ?? null) : null, p.by, p.label === "question" ? "peer" : p.label, p.body, at);
    }
  }
  seeded.add(db);
}

type ThreadRow = { id: string; note_id: string; state: "open" | "paused" | "closed" | "withdrawn"; reason: string; replacement: string; created_at: string };
/** A card's one canonical thread: created once, found by the card's id everywhere (deck, Magazine, Pocket Deck, Community). */
export function threadFor(db: Db, noteId: string, now: Date): ThreadRow {
  ensureBusinessTables(db);
  db.prepare("INSERT OR IGNORE INTO bfn_threads (id, note_id, state, created_at, updated_at) VALUES (?, ?, 'open', ?, ?)").run(
    `bft-${noteId}`,
    noteId,
    now.toISOString(),
    now.toISOString(),
  );
  return db.prepare("SELECT * FROM bfn_threads WHERE note_id = ?").get(noteId) as ThreadRow;
}

/** Principals only. Anyone else gets "not found", so the deck's existence and its cards' ids say nothing. */
function requirePrincipal(db: Db, user: User) {
  if (!isPrincipal(db, user)) throw new HttpError(404, NOT_FOUND);
}

/** A published business card this principal may read, or 404. */
function readable(db: Db, user: User, id: unknown) {
  requirePrincipal(db, user);
  const n = typeof id === "string" ? current(db, id) : undefined;
  if (!n || !n.data.business) throw new HttpError(404, NOT_FOUND);
  return n;
}

/** One reporting event: ids, versions and the card's stage and theme, never anyone's words. A retry with the same key counts once. */
function event(db: Db, user: User, e: BusinessEvent, x: { note?: MentorNote; chapter?: number; thread?: string; key?: string }, now: Date) {
  if (!EVENTS.includes(e)) return;
  db.prepare(
    "INSERT OR IGNORE INTO bfn_events (at, user_id, event, note_id, version, chapter, thread_id, audience, stage, theme, idem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    now.toISOString(),
    user.id,
    e,
    x.note?.id ?? "",
    x.note?.version ?? 0,
    x.chapter ?? 0,
    x.thread ?? "",
    "principal",
    x.note?.data.business?.stage ?? "",
    x.note?.data.business?.theme ?? "",
    x.key ? `${user.id}:${e}:${x.key}` : null,
  );
}

function moderation(db: Db, target: string, kind: string, actor: string, now: Date, reason = "", notice = "") {
  db.prepare("INSERT INTO bfn_moderation (target, kind, reason, actor, notice, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    target,
    kind,
    reason,
    actor,
    notice,
    now.toISOString(),
  );
}

/** Tell the editors something needs them, through the Inbox (author-only notices). */
function alertEditors(db: Db, title: string, source: string, now: Date) {
  for (const u of db.prepare("SELECT id FROM users WHERE role = 'author'").all() as { id: string }[])
    notify(
      db,
      u.id,
      {
        kind: "action",
        category: "business-notes",
        title,
        body: "Open Business Field Notes in Admin.",
        href: "/admin/business-notes",
        source: `business-note-admin:${source}`,
      },
      now,
    );
}

// ---------------------------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------------------------

type ChapterRow = {
  note_id: string;
  number: number;
  version: number;
  state: string;
  data: string;
  author_user: string;
  reason: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  reviewed_by: string | null;
};
const chapterRows = (db: Db, noteId: string) =>
  (db.prepare("SELECT * FROM bfn_chapters WHERE note_id = ? ORDER BY number, version DESC").all(noteId) as ChapterRow[]).map((r) => ({
    ...r,
    data: cleanChapter(JSON.parse(r.data)),
  }));
/** The published check-ins, each at its newest published version, oldest first. The original card is never replaced. */
function publishedChapters(db: Db, noteId: string) {
  const out = new Map<number, ReturnType<typeof chapterRows>[number]>();
  for (const c of chapterRows(db, noteId)) if (c.state === "published" && !out.has(c.number)) out.set(c.number, c);
  return [...out.values()].map((c) => ({ number: c.number, version: c.version, publishedAt: c.published_at ?? "", ...c.data }));
}

// ---------------------------------------------------------------------------------------------
// The thread
// ---------------------------------------------------------------------------------------------

type PostRow = {
  id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  author_label: string;
  label: ReplyLabel;
  body: string;
  chapter: number;
  note_version: number;
  status: PostStatus;
  held_reason: string;
  notice: string;
  source_title: string;
  source_href: string;
  owner: string;
  pinned: number;
  created_at: string;
  edited_at: string | null;
};
const helpfulOf = (db: Db, postId: string) => (db.prepare("SELECT COUNT(*) AS n FROM bfn_post_helpful WHERE post_id = ?").get(postId) as { n: number }).n;
const byline = (db: Db, r: PostRow, noteAuthor: string) => {
  if (r.author_label) return r.author_label;
  if (r.label === "approved") return "Trilogy Care";
  if (r.author_id === noteAuthor) return "The contributor";
  // A first name only: principals see each other's experience, never a business ranking or profile.
  const u = db.prepare("SELECT name FROM users WHERE id = ?").get(r.author_id) as { name: string } | undefined;
  return u ? `${u.name.split(" ")[0]} · Care Partner principal` : "A Care Partner principal";
};

/** The thread as this reader sees it: posted questions and replies in their reading order, plus their own held or declined posts with the reason. */
function threadView(db: Db, user: User, n: MentorNote, now: Date) {
  const t = threadFor(db, n.id, now);
  const rows = db.prepare("SELECT * FROM bfn_posts WHERE thread_id = ? ORDER BY created_at").all(t.id) as PostRow[];
  const visible = (r: PostRow) => r.status === "posted" || (r.author_id === user.id && ["held", "declined", "hidden"].includes(r.status));
  const view = (r: PostRow) => ({
    id: r.id,
    label: r.label,
    labelText: REPLY_LABELS[r.label],
    by: byline(db, r, n.authorUser),
    body: r.status === "hidden" ? "" : r.body,
    status: r.status,
    notice: r.author_id === user.id ? r.notice || r.held_reason : "",
    chapter: r.chapter,
    noteVersion: r.note_version,
    // An answer about an older version of the card is marked, so it isn't read as if it were about the current wording.
    olderVersion: r.note_version > 0 && r.note_version < n.version,
    source: r.source_title ? { title: r.source_title, href: r.source_href } : null,
    owner: r.owner,
    pinned: Boolean(r.pinned),
    helpful: r.status === "posted" ? helpfulOf(db, r.id) : 0,
    mineHelpful: Boolean(db.prepare("SELECT 1 FROM bfn_post_helpful WHERE post_id = ? AND user_id = ?").get(r.id, user.id)),
    mine: r.author_id === user.id,
    at: r.created_at,
    edited: Boolean(r.edited_at),
  });
  const questions = rows
    .filter((r) => !r.parent_id && visible(r))
    .map((q) => {
      const replies = rows.filter((r) => r.parent_id === q.id && visible(r)).map(view);
      const asker = q.author_id;
      const useful = (rid: string) => Boolean(db.prepare("SELECT 1 FROM bfn_post_helpful WHERE post_id = ? AND user_id = ?").get(rid, asker));
      return {
        ...view(q),
        answered: isAnswered(replies.filter((r) => r.status === "posted").map((r) => ({ label: r.label, usefulToAsker: useful(r.id) }))),
        replies: orderReplies(replies),
      };
    });
  return {
    id: t.id,
    state: t.state,
    reason: t.reason,
    replacement: t.replacement,
    takesQuestions: n.data.business?.takesQuestions ?? true,
    answerWindow: n.data.business?.answerWindow ?? "",
    questions: questions.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading the deck
// ---------------------------------------------------------------------------------------------

type CardOf = Exclude<ReturnType<typeof readerCards>[number], { gone: true }>;

function summary(db: Db, user: User, c: CardOf, now: Date) {
  const b = c.data.business!;
  const t = threadFor(db, c.id, now);
  const qs = db.prepare("SELECT id FROM bfn_posts WHERE thread_id = ? AND parent_id IS NULL AND status = 'posted'").all(t.id) as { id: string }[];
  return {
    ...c,
    tools: b.toolIds.map((id) => resolveTool(db, user, id)),
    chapters: publishedChapters(db, c.id).length,
    threadState: t.state,
    questions: qs.length,
  };
}

/** The business deck for a principal: every published card, filtered and searched, in editorial order. Never ranked by votes. */
export function businessDeck(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  requirePrincipal(db, user);
  ensureBusiness(db, now);
  const ids = businessIds(db).filter((id) => current(db, id));
  const cards = readerCards(db, user, ids).filter((c): c is CardOf => !("gone" in c));
  const q = str(input.q, 120).toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const order = Object.keys(COLLECTIONS);
  const shown = cards
    .filter((c) => {
      const b = c.data.business!;
      if (input.collection === "continues") {
        if (!publishedChapters(db, c.id).length) return false;
      } else if (input.collection && b.collection !== input.collection) return false;
      if (input.theme && b.theme !== input.theme) return false;
      if (input.stage && b.stage !== input.stage) return false;
      if (input.tool && !b.toolIds.includes(input.tool as ToolId)) return false;
      if (input.model && b.serviceModel !== input.model) return false;
      const hay = [
        c.data.hook,
        c.data.scenario,
        c.data.note,
        c.data.phrase,
        b.decision,
        b.believed,
        b.tried,
        b.failed,
        b.tradeoff,
        THEMES[b.theme],
        c.data.authorName,
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) => order.indexOf(a.data.business!.collection) - order.indexOf(b.data.business!.collection) || a.data.business!.number - b.data.business!.number,
    );
  event(db, user, "business_deck_opened", { key: today(now) }, now);
  return { cards: shown.map((c) => summary(db, user, c, now)), total: cards.length };
}

/** One card in full: the card, its dated check-ins, its canonical thread, the reader's private thought and plan, and its tools. */
export function businessCard(db: Db, user: User, id: unknown, now: Date, fromVersion?: unknown) {
  const n = readable(db, user, id);
  ensureBusiness(db, now);
  const [c] = readerCards(db, user, [n.id]);
  if ("gone" in c) throw new HttpError(404, NOT_FOUND);
  const mine = db.prepare("SELECT thought, action, checkin_on, follow FROM bfn_private WHERE user_id = ? AND note_id = ?").get(user.id, n.id) as
    { thought: string; action: string; checkin_on: string | null; follow: number } | undefined;
  const from = Number(fromVersion);
  return {
    card: summary(db, user, c, now),
    chapters: publishedChapters(db, n.id),
    thread: threadView(db, user, n, now),
    mine: { thought: mine?.thought ?? "", action: mine?.action ?? "", checkinOn: mine?.checkin_on ?? "", follow: Boolean(mine?.follow) },
    // An old bookmark or copied link resolves to the current card, and says so.
    updatedFrom: Number.isInteger(from) && from > 0 && from < n.version ? from : null,
    history: versions(db, n.id)
      .filter((v) => isPublished(v) || v.state === "withdrawn")
      .map((v) => ({ version: v.version, state: v.state, at: v.reviewedAt || v.updatedAt })),
  };
}
export type BusinessCardView = ReturnType<typeof businessCard>;

/** Community: the principal-only business space, as a list of canonical threads. Nothing for anyone else. */
export function businessSpace(db: Db, user: User, now: Date) {
  const deck = businessDeck(db, user, {}, now);
  return {
    threads: deck.cards.map((c) => ({
      noteId: c.id,
      title: c.data.hook,
      questions: c.questions,
      state: c.threadState,
      href: `/business-notes/${c.id}#discussion`,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// A principal's actions
// ---------------------------------------------------------------------------------------------

/** Pre-submit prompts must have been answered: the server checks, not just the page. */
function requireChecked(input: Record<string, unknown>) {
  if (input.checked !== true) throw new HttpError(400, "Check the three questions first: recognisable people, prices or territory plans, and anything live.");
}

const urgentAnswer = () => ({ route: "urgent" as const, ...URGENT_ROUTE });

export function businessAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureBusiness(db, now);
  const n = readable(db, user, input.noteId);
  const key = str(input.key, 80);
  switch (input.action) {
    case "front":
      event(db, user, "business_card_front_viewed", { note: n, key: `${n.id}:${n.version}` }, now);
      return { ok: true };
    case "flip":
      event(db, user, "business_card_flipped", { note: n, key: `${n.id}:${n.version}` }, now);
      return { ok: true };
    case "thread":
      event(db, user, "business_thread_opened", { note: n, thread: threadFor(db, n.id, now).id, key: `${n.id}:${today(now)}` }, now);
      return { ok: true };
    case "chapter":
      event(db, user, "business_story_checkin_opened", { note: n, chapter: Number(input.chapter) || 0, key: `${n.id}:${input.chapter}` }, now);
      return { ok: true };
    case "tool": {
      const id = input.tool as ToolId;
      if (!n.data.business!.toolIds.includes(id)) throw new HttpError(400, "That tool isn’t linked to this card.");
      const t = resolveTool(db, user, id);
      if (!t.available) throw new HttpError(400, `${t.title} isn’t available yet.`);
      event(db, user, "business_tool_opened", { note: n, key: `${n.id}:${id}:${today(now)}` }, now);
      return { href: t.href };
    }
    case "thought": {
      // A private first thought, before the note: only ever shown back to the reader. Reports count it, never read it.
      const text = str(input.text, 600);
      db.prepare(
        "INSERT INTO bfn_private (user_id, note_id, thought, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, note_id) DO UPDATE SET thought = excluded.thought, updated_at = excluded.updated_at",
      ).run(user.id, n.id, text, now.toISOString());
      if (text) event(db, user, "business_reflection_saved", { note: n, key: n.id }, now);
      return { thought: text };
    }
    case "checkin": {
      // One small private action and a date to come back. Following the card means a check-in chapter reaches the Inbox.
      const on = /^\d{4}-\d{2}-\d{2}$/.test(String(input.on ?? "")) ? String(input.on) : null;
      const action = str(input.text, 300);
      const follow = input.follow === false ? 0 : 1;
      db.prepare(
        "INSERT INTO bfn_private (user_id, note_id, action, checkin_on, follow, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, note_id) DO UPDATE SET action = excluded.action, checkin_on = excluded.checkin_on, follow = excluded.follow, updated_at = excluded.updated_at",
      ).run(user.id, n.id, action, on, follow, now.toISOString());
      return { action, checkinOn: on ?? "", follow: Boolean(follow) };
    }
    case "save": {
      const r = toggleSave(db, user, { noteId: n.id, on: input.on === true }, now);
      if (r.saved) event(db, user, "business_card_saved", { note: n, key: n.id }, now);
      return r;
    }
    case "helpful":
      return toggleHelpful(db, user, { noteId: n.id, on: input.on }, now);
    case "ask":
    case "reply":
      return post(db, user, n, input, now, key);
    case "revise":
      return revise(db, user, n, input, now);
    case "reply-helpful":
      return replyHelpful(db, user, n, input, now);
    case "report":
      return report(db, user, n, input, now);
    case "withdraw-post": {
      const p = ownPost(db, user, n, input.postId);
      db.prepare("UPDATE bfn_posts SET status = 'withdrawn', edited_at = ? WHERE id = ?").run(now.toISOString(), p.id);
      audit(db, { actor: user.id, event: "business.post.withdrawn", entity: `bfn-post:${p.id}`, at: now });
      return businessCard(db, user, n.id, now);
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
}

function ownPost(db: Db, user: User, n: MentorNote, postId: unknown) {
  const p = db.prepare("SELECT * FROM bfn_posts WHERE id = ? AND thread_id = ?").get(String(postId ?? ""), threadFor(db, n.id, new Date()).id) as
    PostRow | undefined;
  if (!p || p.author_id !== user.id) throw new HttpError(404, "That post isn’t yours.");
  return p;
}

/**
  Asking the contributor, or replying. The text is screened first. Something urgent is never posted: the reader gets
  the incident route, and nothing is stored. Anything that might identify someone or share commercially sensitive
  terms is held for a moderator, and the author sees why and can revise it. Otherwise it's posted. A retry with the
  same key never makes a second post.
*/
function post(db: Db, user: User, n: MentorNote, input: Record<string, unknown>, now: Date, key: string) {
  requireChecked(input);
  const body = str(input.text, 800);
  if (body.length < (input.action === "ask" ? 10 : 3))
    throw new HttpError(400, input.action === "ask" ? "Write your question in a sentence." : "Write a reply.");
  const sc = screenText(body);
  if (sc.urgent) {
    moderation(db, `note:${n.id}`, "urgent-routed", user.id, now);
    return urgentAnswer();
  }
  return tx(db, () => {
    const t = threadFor(db, n.id, now);
    if (t.state !== "open") throw new HttpError(400, t.state === "paused" ? "This discussion is paused for now." : "This discussion is closed.");
    if (key) {
      const had = db.prepare("SELECT id, status FROM bfn_posts WHERE author_id = ? AND idem = ?").get(user.id, key) as
        { id: string; status: PostStatus } | undefined;
      if (had)
        return { route: had.status === "held" ? ("held" as const) : ("posted" as const), id: had.id, repeated: true, card: businessCard(db, user, n.id, now) };
    }
    let parent: PostRow | undefined;
    if (input.action === "reply") {
      parent = db.prepare("SELECT * FROM bfn_posts WHERE id = ? AND thread_id = ? AND parent_id IS NULL").get(String(input.parentId ?? ""), t.id) as
        PostRow | undefined;
      if (!parent || parent.status !== "posted") throw new HttpError(404, "That question isn’t open to replies.");
    }
    const hold = held(sc);
    const id = `bfp-${randomUUID().slice(0, 12)}`;
    const label: ReplyLabel = input.action === "reply" && n.authorUser && n.authorUser === user.id ? "contributor" : "peer";
    const reason = hold ? heldReason(sc) : "";
    db.prepare(
      "INSERT INTO bfn_posts (id, thread_id, parent_id, author_id, label, body, chapter, note_version, status, held_reason, notice, idem, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      t.id,
      parent?.id ?? null,
      user.id,
      label,
      body,
      Number.isInteger(input.chapter) ? (input.chapter as number) : 0,
      n.version,
      hold ? "held" : "posted",
      reason,
      hold ? `Held for a moderator to check. ${reason} You can edit it, or withdraw it.` : "",
      key || id,
      now.toISOString(),
    );
    if (hold) {
      moderation(db, `post:${id}`, "hold", "screen", now, reason, "Held for review, with the reason and an edit path.");
      event(db, user, "business_content_flagged", { note: n, thread: t.id, key: id }, now);
      alertEditors(db, "A Business Field Notes post is held for review", `post:${id}`, now);
    }
    if (input.action === "ask") event(db, user, "business_question_submitted", { note: n, thread: t.id, chapter: Number(input.chapter) || 0, key: id }, now);
    return { route: hold ? ("held" as const) : ("posted" as const), id, held: hold ? sc : null, card: businessCard(db, user, n.id, now) };
  });
}

/** The author edits a held post. Screened again: clean, it's posted; otherwise it stays held with the new reason. */
function revise(db: Db, user: User, n: MentorNote, input: Record<string, unknown>, now: Date) {
  requireChecked(input);
  const p = ownPost(db, user, n, input.postId);
  if (p.status !== "held") throw new HttpError(400, "Only a held post can be edited here.");
  const body = str(input.text, 800);
  if (body.length < 3) throw new HttpError(400, "Write the post.");
  const sc = screenText(body);
  if (sc.urgent) return urgentAnswer();
  const hold = held(sc);
  const reason = hold ? heldReason(sc) : "";
  db.prepare("UPDATE bfn_posts SET body = ?, status = ?, held_reason = ?, notice = ?, edited_at = ? WHERE id = ?").run(
    body,
    hold ? "held" : "posted",
    reason,
    hold ? `Still held for a moderator to check. ${reason}` : "",
    now.toISOString(),
    p.id,
  );
  moderation(db, `post:${p.id}`, hold ? "revised-held" : "revised-posted", user.id, now, reason);
  return { route: hold ? ("held" as const) : ("posted" as const), card: businessCard(db, user, n.id, now) };
}

/** Marking a reply helpful: one per person, idempotent, and only on posted replies. It orders peers among themselves, nothing more. */
function replyHelpful(db: Db, user: User, n: MentorNote, input: Record<string, unknown>, now: Date) {
  const t = threadFor(db, n.id, now);
  const p = db
    .prepare("SELECT * FROM bfn_posts WHERE id = ? AND thread_id = ? AND parent_id IS NOT NULL AND status = 'posted'")
    .get(String(input.postId ?? ""), t.id) as PostRow | undefined;
  if (!p) throw new HttpError(404, "That reply isn’t here.");
  if (p.author_id === user.id) throw new HttpError(400, "That’s your own reply.");
  if (input.on === false) db.prepare("DELETE FROM bfn_post_helpful WHERE post_id = ? AND user_id = ?").run(p.id, user.id);
  else {
    const added = db.prepare("INSERT OR IGNORE INTO bfn_post_helpful (post_id, user_id, at) VALUES (?, ?, ?)").run(p.id, user.id, now.toISOString()).changes;
    if (added) event(db, user, "business_reply_helpful", { note: n, thread: t.id, key: p.id }, now);
  }
  return businessCard(db, user, n.id, now);
}

/** Reporting a post: once per person; the moderators are told. The post stays until a moderator acts. */
function report(db: Db, user: User, n: MentorNote, input: Record<string, unknown>, now: Date) {
  const t = threadFor(db, n.id, now);
  const p = db.prepare("SELECT * FROM bfn_posts WHERE id = ? AND thread_id = ? AND status = 'posted'").get(String(input.postId ?? ""), t.id) as
    PostRow | undefined;
  if (!p) throw new HttpError(404, "That post isn’t here.");
  const added = db
    .prepare("INSERT OR IGNORE INTO bfn_reports (post_id, user_id, reason, at) VALUES (?, ?, ?, ?)")
    .run(p.id, user.id, str(input.reason, 300), now.toISOString()).changes;
  if (added) {
    moderation(db, `post:${p.id}`, "report", user.id, now, str(input.reason, 300));
    alertEditors(db, "A Business Field Notes post was reported", `report:${p.id}`, now);
  }
  return { reported: true };
}

// ---------------------------------------------------------------------------------------------
// Contributing a note
// ---------------------------------------------------------------------------------------------

type ConsentRecord = { textAudience: boolean; attribution: string; display: string } & Record<ConsentKey, boolean>;
function consentRecord(d: MentorNoteData): ConsentRecord {
  const b = d.business!;
  return { textAudience: d.consent.audience && d.consent.attribution, attribution: d.authorName, display: b.display, ...b.consents };
}
function recordConsent(db: Db, user: User, id: string, version: number, d: MentorNoteData, change: string, now: Date) {
  db.prepare("INSERT INTO bfn_consents (note_id, version, by_user, record, change, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    version,
    user.id,
    JSON.stringify(consentRecord(d)),
    change,
    now.toISOString(),
  );
}

/** The contributor's data, made a business card: their own display choice, never someone else's name, and never illustrative. */
function contributorData(user: User, raw: unknown): MentorNoteData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = cleanBusiness(o.business);
  const first = user.name.split(" ")[0];
  const authorName =
    b.display === "name" ? user.name : b.display === "first" ? `${first}${b.businessLabel ? ` · ${b.businessLabel}` : ""}` : "A Care Partner principal";
  return cleanNote({
    ...o,
    badge: "CP",
    rank: "10",
    authorName,
    authorRole: "Care Partner principal",
    illustrative: false,
    communityPostId: "",
    business: { ...b, number: 0, historical: false, claims: b.claims.map((c) => ({ ...c, basis: "reported", source: "" })) },
  });
}

/** The contributor's own business notes and check-ins, with what's held and why, and their consent history. */
export function myBusinessNotes(db: Db, user: User, now: Date) {
  requirePrincipal(db, user);
  ensureBusiness(db, now);
  const mine = myNotes(db, user, now, "business");
  return {
    notes: mine.notes.map((m) => ({
      ...m,
      problems: noteProblems(m.latest.data),
      screen: screenNote(m.latest.data),
      consents: (
        db.prepare("SELECT version, record, change, at FROM bfn_consents WHERE note_id = ? ORDER BY id DESC").all(m.latest.id) as {
          version: number;
          record: string;
          change: string;
          at: string;
        }[]
      ).map((c) => ({ ...c, record: JSON.parse(c.record) as ConsentRecord })),
      chapters: chapterRows(db, m.latest.id).map((c) => ({ number: c.number, version: c.version, state: c.state, reason: c.reason, data: c.data })),
    })),
  };
}

/** Every piece of a note's text, screened. Flags are for an editor to look at, never an automatic change. */
function screenNote(d: MentorNoteData): Screen {
  const b = d.business;
  return screenText(
    [d.hook, d.scenario, d.note, d.phrase, ...(b ? [b.decision, b.choice, b.believed, b.tried, b.failed, b.tradeoff, b.context, b.freeText] : [])].join("\n"),
  );
}

/**
  The contributor's decisions: save a draft, submit (after the pre-submit prompts), approve or keep their own wording
  after an editor's edit, narrow a consent, write a check-in, or withdraw. Nothing is published from here.
*/
export function contributeAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  requirePrincipal(db, user);
  ensureBusiness(db, now);
  const id = str(input.id, 80);
  const own = () => {
    const all = versions(db, id);
    if (!all.length || all[0].authorUser !== user.id || !all[0].data.business) throw new HttpError(404, "That note isn’t yours.");
    return all;
  };
  switch (input.action) {
    case "draft": {
      const data = contributorData(user, input.data);
      const first = !id;
      const r = saveMyNote(db, user, { id: id || undefined, data }, now);
      if (first) event(db, user, "business_note_contribution_started", { key: r.note.id }, now);
      return { note: r.note, screen: screenNote(r.note.data), problems: noteProblems(r.note.data) };
    }
    case "submit": {
      requireChecked(input);
      const [top] = own();
      const sc = screenNote(top.data);
      // A live incident isn't a story: it goes to the incident process now.
      if (sc.urgent) return urgentAnswer();
      myNoteAction(db, user, { id, action: "submit" }, now);
      recordConsent(db, user, id, top.version, top.data, "submitted", now);
      if (held(sc)) moderation(db, `note:${id}:v${top.version}`, "screen", "screen", now, heldReason(sc), "Flagged for the privacy and commercial check.");
      event(db, user, "business_note_submitted", { note: top, key: `${id}:${top.version}` }, now);
      alertEditors(db, "A Business Field Note was submitted for review", `note:${id}:v${top.version}`, now);
      return myBusinessNotes(db, user, now);
    }
    case "approve-edits":
    case "decline-edits": {
      const [top] = own();
      myNoteAction(db, user, { id, action: input.action }, now);
      if (input.action === "approve-edits") recordConsent(db, user, id, top.version, top.data, "approved the edited wording", now);
      return myBusinessNotes(db, user, now);
    }
    case "consent": {
      // Narrowing a permission takes effect at once, on every version, and is recorded. Widening one needs a new submission.
      const all = own();
      const off = (Object.keys(CONSENTS) as ConsentKey[]).filter((k) => input[k] === false);
      if (!off.length) throw new HttpError(400, "Choose a permission to turn off. To add one, edit and resubmit the note.");
      tx(db, () => {
        for (const v of all) {
          const data = { ...v.data, business: { ...v.data.business!, consents: { ...v.data.business!.consents } } };
          for (const k of off) data.business.consents[k] = false;
          db.prepare("UPDATE mentor_notes SET data = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), id, v.version);
        }
        recordConsent(db, user, id, all[0].version, versions(db, id)[0].data, `turned off: ${off.join(", ")}`, now);
        audit(db, { actor: user.id, event: "business.consent.narrowed", entity: `note:${id}`, next: off, at: now });
      });
      return myBusinessNotes(db, user, now);
    }
    case "withdraw": {
      own();
      myNoteAction(db, user, { id, action: "withdraw" }, now);
      withdrawn(db, user, id, "Withdrawn by the contributor.", now);
      return myBusinessNotes(db, user, now);
    }
    case "chapter": {
      // A check-in on their own published card: a new dated chapter, reviewed before anyone sees it.
      const all = own();
      if (!current(db, id)) throw new HttpError(400, "A check-in follows a published card.");
      const data = cleanChapter(input.data);
      const problems = chapterProblems(data);
      if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
      requireChecked(input);
      const sc = screenText([data.title, data.whatChanged, data.nowThink, data.correctionNote].join("\n"));
      if (sc.urgent) return urgentAnswer();
      const number = (db.prepare("SELECT COALESCE(MAX(number), 0) AS n FROM bfn_chapters WHERE note_id = ?").get(id) as { n: number }).n + 1;
      db.prepare(
        "INSERT INTO bfn_chapters (note_id, number, version, state, data, author_user, created_at, updated_at) VALUES (?, ?, 1, 'submitted', ?, ?, ?, ?)",
      ).run(id, number, JSON.stringify(data), user.id, now.toISOString(), now.toISOString());
      if (held(sc)) moderation(db, `chapter:${id}:${number}`, "screen", "screen", now, heldReason(sc));
      alertEditors(db, "A Business Field Notes check-in is waiting for review", `chapter:${id}:${number}`, now);
      void all;
      return myBusinessNotes(db, user, now);
    }
    case "chapter-approve": {
      own();
      const number = Number(input.number);
      const top = chapterRows(db, id).find((c) => c.number === number);
      if (!top || top.state !== "changes") throw new HttpError(400, "There are no edits waiting for you.");
      db.prepare("UPDATE bfn_chapters SET state = 'submitted', updated_at = ? WHERE note_id = ? AND number = ? AND version = ?").run(
        now.toISOString(),
        id,
        number,
        top.version,
      );
      return myBusinessNotes(db, user, now);
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
}

/** A withdrawn card's thread closes, and the withdrawal is recorded. Pocket Deck, search, decks and the Inbox stop showing it on their next read. */
function withdrawn(db: Db, actor: User, id: string, reason: string, now: Date) {
  const t = threadFor(db, id, now);
  db.prepare("UPDATE bfn_threads SET state = 'withdrawn', reason = ?, updated_at = ? WHERE id = ?").run(reason, now.toISOString(), t.id);
  moderation(db, `note:${id}`, "withdrawn", actor.id, now, reason);
  event(db, actor, "business_content_withdrawn", { key: `${id}:${now.toISOString()}` }, now);
}

// ---------------------------------------------------------------------------------------------
// Editors: the library, the review steps, chapters, Community moderation and playbook proposals
// ---------------------------------------------------------------------------------------------

type ReviewRow = { id: number; note_id: string; version: number; step: ReviewStep; outcome: "pass" | "concern"; note: string; by_user: string; at: string };
/** The latest decision on each review step for a card, made since it was last submitted. */
function checksFor(db: Db, id: string) {
  const rows = db.prepare("SELECT * FROM bfn_reviews WHERE note_id = ? ORDER BY id").all(id) as ReviewRow[];
  const latest: Partial<Record<ReviewStep, ReviewRow>> = {};
  for (const r of rows) latest[r.step] = r;
  return latest;
}
const flagsFor = (db: Db, target: string) =>
  db.prepare("SELECT kind, reason, actor, at FROM bfn_moderation WHERE target = ? OR target LIKE ? ORDER BY id DESC").all(target, `${target}:%`) as {
    kind: string;
    reason: string;
    actor: string;
    at: string;
  }[];

/** The editors' view of every business card and everything around it. Readers' private words are never included. */
export function businessLibrary(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureBusiness(db, now);
  const reviewDue = (at: string) => (at ? new Date(Date.parse(at) + 365 * 86_400_000).toISOString().slice(0, 10) : "");
  const notes = businessIds(db).map((id) => {
    const all = versions(db, id);
    const top = all[0];
    const live = current(db, id);
    const sc = screenNote(top.data);
    const checks = checksFor(db, id);
    const t = threadFor(db, id, now);
    const posts = db.prepare("SELECT status, parent_id FROM bfn_posts WHERE thread_id = ?").all(t.id) as { status: PostStatus; parent_id: string | null }[];
    const b = top.data.business!;
    return {
      latest: top,
      published: live ?? null,
      problems: noteProblems(top.data),
      screen: sc,
      steps: stepsNeeded(b, held(sc)).map((s) => ({ step: s, label: REVIEW_STEPS[s], decision: checks[s] ?? null })),
      contributed: Boolean(top.authorUser),
      consent: consentRecord(top.data),
      consentHistory: db.prepare("SELECT version, record, change, at FROM bfn_consents WHERE note_id = ? ORDER BY id DESC").all(id),
      flags: flagsFor(db, `note:${id}`),
      chapters: chapterRows(db, id).map((c) => ({
        number: c.number,
        version: c.version,
        state: c.state,
        data: c.data,
        publishedAt: c.published_at ?? "",
        contributed: Boolean(c.author_user),
      })),
      thread: {
        id: t.id,
        state: t.state,
        reason: t.reason,
        questions: posts.filter((p) => !p.parent_id && p.status === "posted").length,
        held: posts.filter((p) => p.status === "held").length,
      },
      tools: b.toolIds.map((tid) => resolveTool(db, actor, tid)),
      // What could make the card stale: a rule that changed, a tool that isn't available, a re-review, or a review due.
      stale: [
        ...(b.historical ? ["A programme rule has changed since this story."] : []),
        ...b.toolIds.filter((tid) => !resolveTool(db, actor, tid).available).map((tid) => `${TOOLS[tid].title} isn’t available to readers yet.`),
        ...(live?.state === "needs_review" ? ["Flagged for re-review."] : []),
        ...(live && reviewDue(live.reviewedAt) && reviewDue(live.reviewedAt) <= today(now) ? ["Review due."] : []),
      ],
      reviewDue: live ? reviewDue(live.reviewedAt) : "",
      history: all.map((v) => ({ version: v.version, state: v.state, updatedAt: v.updatedAt, reviewedBy: v.reviewedBy, reviewedAt: v.reviewedAt })),
    };
  });
  return { notes, community: communityQueue(db, now), proposals: proposals(db) };
}

/** Held, reported and unanswered posts, and the unanswered questions grouped by the card's theme. */
function communityQueue(db: Db, now: Date) {
  const rows = db
    .prepare(
      "SELECT p.*, t.note_id FROM bfn_posts p JOIN bfn_threads t ON t.id = p.thread_id WHERE p.status IN ('held', 'posted', 'hidden') ORDER BY p.created_at DESC",
    )
    .all() as (PostRow & { note_id: string })[];
  const reports = new Map(
    (db.prepare("SELECT post_id, COUNT(*) AS n FROM bfn_reports GROUP BY post_id").all() as { post_id: string; n: number }[]).map((r) => [r.post_id, r.n]),
  );
  const title = (noteId: string) => versions(db, noteId)[0]?.data.hook ?? noteId;
  const view = (p: PostRow & { note_id: string }) => ({
    id: p.id,
    noteId: p.note_id,
    card: title(p.note_id),
    question: !p.parent_id,
    label: p.label,
    body: p.body,
    status: p.status,
    reason: p.held_reason,
    owner: p.owner,
    reports: reports.get(p.id) ?? 0,
    at: p.created_at,
  });
  const replies = (q: string) => rows.filter((r) => r.parent_id === q && r.status === "posted");
  const old = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const unanswered = rows
    .filter((r) => !r.parent_id && r.status === "posted" && r.author_id !== "seed")
    .filter(
      (q) =>
        !isAnswered(
          replies(q.id).map((r) => ({
            label: r.label,
            usefulToAsker: Boolean(db.prepare("SELECT 1 FROM bfn_post_helpful WHERE post_id = ? AND user_id = ?").get(r.id, q.author_id)),
          })),
        ),
    );
  const themes = new Map<string, { theme: string; count: number; questionIds: string[]; noteIds: string[] }>();
  for (const q of unanswered) {
    const theme = versions(db, q.note_id)[0]?.data.business?.theme ?? "first-hire";
    const t = themes.get(theme) ?? { theme: THEMES[theme], count: 0, questionIds: [], noteIds: [] };
    t.count++;
    t.questionIds.push(q.id);
    if (!t.noteIds.includes(q.note_id)) t.noteIds.push(q.note_id);
    themes.set(theme, t);
  }
  return {
    held: rows.filter((r) => r.status === "held").map(view),
    reported: rows.filter((r) => (reports.get(r.id) ?? 0) > 0 && r.status === "posted").map(view),
    hidden: rows.filter((r) => r.status === "hidden").map(view),
    unanswered: unanswered.map((q) => ({ ...view(q), waiting: q.created_at < old })),
    themes: [...themes.values()].sort((a, b) => b.count - a.count),
    threads: (db.prepare("SELECT * FROM bfn_threads ORDER BY note_id").all() as ThreadRow[]).map((t) => ({ ...t, card: title(t.note_id) })),
  };
}

function proposals(db: Db) {
  return (
    db.prepare("SELECT * FROM bfn_proposals ORDER BY created_at DESC").all() as {
      id: string;
      theme_id: string | null;
      title: string;
      data: string;
      status: ProposalStatus;
      created_by: string;
      created_at: string;
      updated_at: string;
    }[]
  ).map((p) => ({ ...p, data: JSON.parse(p.data) as Record<string, unknown>, statusText: PROPOSAL_STATUS[p.status] }));
}

/** Notify the readers who follow or saved a card that a check-in has been published: principals only, with no card text in the notice. */
function notifyFollowers(db: Db, noteId: string, number: number, now: Date) {
  const users = db
    .prepare(
      "SELECT DISTINCT u.* FROM users u WHERE u.id IN (SELECT user_id FROM bfn_private WHERE note_id = ? AND follow = 1 UNION SELECT user_id FROM mentor_note_saves WHERE note_id = ?)",
    )
    .all(noteId, noteId) as User[];
  for (const u of users)
    if (isPrincipal(db, u))
      notify(
        db,
        u.id,
        {
          kind: "update",
          category: "business-notes",
          title: "A Business Field Note you follow has a dated check-in",
          body: "Read the original card and the update together.",
          href: `/business-notes/${noteId}?chapter=${number}`,
          source: `business-note:${noteId}:chapter:${number}`,
        },
        now,
      );
}

/** The editors' decisions. Every one is audited, with the actor recorded as the person who made it. */
export function businessEditorAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureBusiness(db, now);
  const id = str(input.id, 80);
  const reason = str(input.reason, 400);
  const note = () => {
    const all = versions(db, id);
    if (!all.length || !all[0].data.business) throw new HttpError(404, "That card isn’t in the library.");
    return all;
  };
  const postOf = () => {
    const p = db.prepare("SELECT p.*, t.note_id FROM bfn_posts p JOIN bfn_threads t ON t.id = p.thread_id WHERE p.id = ?").get(str(input.postId, 80)) as
      (PostRow & { note_id: string }) | undefined;
    if (!p) throw new HttpError(404, "That post isn’t here.");
    return p;
  };
  const needReason = (what: string) => {
    if (reason.length < 3) throw new HttpError(400, what);
  };
  switch (input.action) {
    case "check": {
      const [top] = note();
      const step = input.step as ReviewStep;
      if (!(step in REVIEW_STEPS)) throw new HttpError(400, "Which review step?");
      const outcome = input.outcome === "concern" ? "concern" : "pass";
      if (outcome === "concern") needReason("Say what the concern is.");
      db.prepare("INSERT INTO bfn_reviews (note_id, version, step, outcome, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id,
        top.version,
        step,
        outcome,
        reason,
        actor.id,
        now.toISOString(),
      );
      audit(db, {
        actor: actor.id,
        event: `business.check.${step}`,
        entity: `note:${id}:v${top.version}`,
        reason: `${outcome}${reason ? `: ${reason}` : ""}`,
        at: now,
      });
      break;
    }
    case "publish": {
      const [top] = note();
      const checks = checksFor(db, id);
      const missing = stepsNeeded(top.data.business!, held(screenNote(top.data))).filter((s) => checks[s]?.outcome !== "pass");
      if (missing.length) throw new HttpError(400, `Not yet: ${missing.map((s) => REVIEW_STEPS[s]).join(", ")} still to pass.`);
      editorAction(db, actor, { id, action: "review" }, now, { businessChecked: true });
      const t = threadFor(db, id, now);
      if (t.state === "withdrawn") db.prepare("UPDATE bfn_threads SET state = 'open', reason = '', updated_at = ? WHERE id = ?").run(now.toISOString(), t.id);
      event(db, actor, "business_note_published", { note: current(db, id), key: `${id}:${top.version}` }, now);
      break;
    }
    case "edit": {
      const [top] = note();
      const raw = (input.data ?? {}) as Record<string, unknown>;
      // The business context is kept: an edit can't turn a business card into a general one.
      const data = cleanNote({ ...top.data, ...raw, business: { ...top.data.business, ...((raw.business as object) ?? {}) } });
      editorAction(db, actor, { id, action: "edit", data }, now);
      break;
    }
    case "flag":
    case "decline":
      editorAction(db, actor, { id, action: input.action, reason }, now);
      moderation(db, `note:${id}`, String(input.action), actor.id, now, reason);
      if (input.action === "flag") event(db, actor, "business_content_flagged", { note: current(db, id), key: `${id}:${now.toISOString()}` }, now);
      break;
    case "withdraw":
      editorAction(db, actor, { id, action: "withdraw", reason }, now);
      withdrawn(db, actor, id, reason, now);
      break;
    case "chapter-save": {
      // Editors draft or correct a seed's check-in. A contributor's check-in gets an edited version they approve.
      note();
      const data = cleanChapter(input.data);
      const number = Number(input.number) || 0;
      const rows = chapterRows(db, id);
      const top = rows.find((c) => c.number === number);
      const at = now.toISOString();
      if (!top) {
        const next = (rows.reduce((m, c) => Math.max(m, c.number), 0) || 0) + 1;
        db.prepare(
          "INSERT INTO bfn_chapters (note_id, number, version, state, data, author_user, created_at, updated_at) VALUES (?, ?, 1, 'submitted', ?, '', ?, ?)",
        ).run(id, next, JSON.stringify(data), at, at);
      } else
        db.prepare("INSERT INTO bfn_chapters (note_id, number, version, state, data, author_user, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          id,
          number,
          top.version + 1,
          top.author_user ? "changes" : "submitted",
          JSON.stringify(data),
          top.author_user,
          at,
          at,
        );
      audit(db, { actor: actor.id, event: "business.chapter.saved", entity: `note:${id}:chapter:${number || "new"}`, at: now });
      break;
    }
    case "chapter-publish": {
      note();
      if (!current(db, id)) throw new HttpError(400, "Publish the card before its check-in.");
      const number = Number(input.number);
      const top = chapterRows(db, id).find((c) => c.number === number);
      if (!top || top.state !== "submitted") throw new HttpError(400, "That check-in isn’t waiting for review.");
      const problems = chapterProblems(top.data);
      if (problems.length) throw new HttpError(400, `Not yet. ${problems.join(" ")}`);
      db.prepare(
        "UPDATE bfn_chapters SET state = 'published', published_at = ?, reviewed_by = ?, updated_at = ? WHERE note_id = ? AND number = ? AND version = ?",
      ).run(now.toISOString(), actor.id, now.toISOString(), id, number, top.version);
      audit(db, { actor: actor.id, event: "business.chapter.published", entity: `note:${id}:chapter:${number}:v${top.version}`, at: now });
      notifyFollowers(db, id, number, now);
      break;
    }
    case "chapter-withdraw": {
      note();
      needReason("Say briefly why it’s withdrawn.");
      db.prepare("UPDATE bfn_chapters SET state = 'withdrawn', reason = ?, updated_at = ? WHERE note_id = ? AND number = ?").run(
        reason,
        now.toISOString(),
        id,
        Number(input.number),
      );
      moderation(db, `chapter:${id}:${input.number}`, "withdrawn", actor.id, now, reason);
      break;
    }
    case "post-approve": {
      const p = postOf();
      if (p.status !== "held") throw new HttpError(400, "It isn’t held.");
      db.prepare("UPDATE bfn_posts SET status = 'posted', notice = '', held_reason = '' WHERE id = ?").run(p.id);
      moderation(db, `post:${p.id}`, "approved", actor.id, now, reason, "Posted after review.");
      break;
    }
    case "post-decline": {
      const p = postOf();
      needReason("Say briefly why, for the author.");
      db.prepare("UPDATE bfn_posts SET status = 'declined', notice = ? WHERE id = ?").run(`Not posted: ${reason}`, p.id);
      moderation(db, `post:${p.id}`, "declined", actor.id, now, reason, `Not posted: ${reason}`);
      break;
    }
    case "post-hide": {
      const p = postOf();
      needReason("Say briefly why it’s hidden, for the author.");
      db.prepare("UPDATE bfn_posts SET status = 'hidden', notice = ? WHERE id = ?").run(`Hidden by a moderator: ${reason}`, p.id);
      moderation(db, `post:${p.id}`, "hidden", actor.id, now, reason, `Hidden by a moderator: ${reason}`);
      audit(db, { actor: actor.id, event: "business.post.hidden", entity: `bfn-post:${p.id}`, previous: { by: p.author_id, text: p.body }, reason, at: now });
      break;
    }
    case "post-restore": {
      const p = postOf();
      if (p.status !== "hidden") throw new HttpError(400, "It isn’t hidden.");
      db.prepare("UPDATE bfn_posts SET status = 'posted', notice = '' WHERE id = ?").run(p.id);
      moderation(db, `post:${p.id}`, "restored", actor.id, now, reason);
      break;
    }
    case "annotate": {
      // Approved Trilogy guidance: a source-backed annotation on a question, labelled as such, never in the contributor's voice.
      const q = postOf();
      if (q.parent_id) throw new HttpError(400, "Annotate a question.");
      const body = str(input.text, 800);
      const title = str(input.sourceTitle, 200);
      const href = str(input.sourceHref, 400);
      if (body.length < 10) throw new HttpError(400, "Write the guidance.");
      if (title.length < 3 || !(/^https:\/\/\S+$/.test(href) || /^\/[\w\-/?=&.#]*$/.test(href)))
        throw new HttpError(400, "Give the current approved source, with its title and link.");
      const pid = `bfp-${randomUUID().slice(0, 12)}`;
      db.prepare(
        "INSERT INTO bfn_posts (id, thread_id, parent_id, author_id, label, body, chapter, note_version, status, source_title, source_href, pinned, created_at) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, 'posted', ?, ?, 1, ?)",
      ).run(pid, q.thread_id, q.id, actor.id, body, q.chapter, current(db, q.note_id)?.version ?? q.note_version, title, href, now.toISOString());
      moderation(db, `post:${q.id}`, "annotated", actor.id, now, title);
      if (q.owner) db.prepare("UPDATE bfn_posts SET owner = '' WHERE id = ?").run(q.id);
      break;
    }
    case "route-owner": {
      const q = postOf();
      if (q.parent_id) throw new HttpError(400, "Route a question.");
      const owner = str(input.owner, 120) || reason.slice(0, 120);
      if (owner.length < 3) throw new HttpError(400, "Name the accountable owner (a team, not a person, is fine).");
      db.prepare("UPDATE bfn_posts SET owner = ? WHERE id = ?").run(owner, q.id);
      db.prepare(
        "INSERT INTO bfn_posts (id, thread_id, parent_id, author_id, author_label, label, body, chapter, note_version, status, created_at) VALUES (?, ?, ?, ?, 'Moderator', 'owner_review', ?, ?, ?, 'posted', ?)",
      ).run(
        `bfp-${randomUUID().slice(0, 12)}`,
        q.thread_id,
        q.id,
        actor.id,
        `This question has been sent to ${owner} for an answer. Until then, read the replies here as peer experience.`,
        q.chapter,
        q.note_version,
        now.toISOString(),
      );
      moderation(db, `post:${q.id}`, "routed", actor.id, now, owner);
      break;
    }
    case "mark-outdated": {
      const p = postOf();
      if (!p.parent_id) throw new HttpError(400, "Mark a reply.");
      needReason("Say what changed.");
      db.prepare("UPDATE bfn_posts SET label = 'outdated', notice = ? WHERE id = ?").run(reason, p.id);
      moderation(db, `post:${p.id}`, "outdated", actor.id, now, reason);
      break;
    }
    case "pin": {
      const p = postOf();
      db.prepare("UPDATE bfn_posts SET pinned = ? WHERE id = ?").run(input.on === false ? 0 : 1, p.id);
      moderation(db, `post:${p.id}`, input.on === false ? "unpinned" : "pinned", actor.id, now);
      break;
    }
    case "thread-close":
    case "thread-pause":
    case "thread-reopen": {
      note();
      const t = threadFor(db, id, now);
      const state = input.action === "thread-reopen" ? "open" : input.action === "thread-pause" ? "paused" : "closed";
      if (state !== "open") needReason("Say why, for readers.");
      db.prepare("UPDATE bfn_threads SET state = ?, reason = ?, replacement = ?, updated_at = ? WHERE id = ?").run(
        state,
        state === "open" ? "" : reason,
        state === "closed" ? str(input.replacement, 400) : "",
        now.toISOString(),
        t.id,
      );
      moderation(db, `thread:${t.id}`, state, actor.id, now, reason);
      break;
    }
    case "proposal-create":
      return createProposal(db, actor, input, now);
    case "proposal-status": {
      const p = db.prepare("SELECT * FROM bfn_proposals WHERE id = ?").get(str(input.proposalId, 80)) as { id: string; data: string } | undefined;
      if (!p) throw new HttpError(404, "That proposal isn’t here.");
      const status = input.status as ProposalStatus;
      if (!(status in PROPOSAL_STATUS)) throw new HttpError(400, "Which status?");
      if ((status === "approved" || status === "declined") && reason.length < 3) throw new HttpError(400, "Record the owner’s decision in a line.");
      const data = { ...(JSON.parse(p.data) as Record<string, unknown>), decision: reason || undefined, outcomeLink: str(input.outcomeLink, 400) || undefined };
      db.prepare("UPDATE bfn_proposals SET status = ?, data = ?, updated_at = ? WHERE id = ?").run(status, JSON.stringify(data), now.toISOString(), p.id);
      audit(db, { actor: actor.id, event: `business.proposal.${status}`, entity: `bfn-proposal:${p.id}`, reason, at: now });
      break;
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
  if (typeof input.action === "string" && !input.action.startsWith("proposal"))
    audit(db, { actor: actor.id, event: `business.${input.action}`, entity: `note:${id || "thread"}`, reason, at: now });
  return businessLibrary(db, actor, now);
}

/**
  A playbook proposal: when repeated questions suggest a repeatable practice. It goes on the Problem desk (the
  problem-led Learning Designer's register) as a theme, with each question as a Community case, rather than a
  register of its own. Existing guidance must be checked first; it's never generated from the most-liked answer.
*/
function createProposal(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  const title = str(input.title, 200);
  const existing = str(input.existingChecked, 600);
  const output = (input.output as ProposalOutput) in PROPOSAL_OUTPUTS ? (input.output as ProposalOutput) : "existing";
  const questionIds = (Array.isArray(input.questionIds) ? input.questionIds : []).filter((x): x is string => typeof x === "string").slice(0, 20);
  if (title.length < 8) throw new HttpError(400, "Describe the practice in a sentence.");
  if (existing.length < 10) throw new HttpError(400, "Say which existing Job Aids, Work Tools or policies you checked first.");
  if (!questionIds.length) throw new HttpError(400, "Cite the questions it comes from.");
  const qs = questionIds.map((q) => {
    const p = db
      .prepare("SELECT p.id, p.created_at, t.note_id FROM bfn_posts p JOIN bfn_threads t ON t.id = p.thread_id WHERE p.id = ? AND p.parent_id IS NULL")
      .get(q) as { id: string; created_at: string; note_id: string } | undefined;
    if (!p) throw new HttpError(404, "One of those questions isn’t here.");
    return p;
  });
  const noteIds = [...new Set(qs.map((q) => q.note_id))];
  const { id: themeId } = problemAction(
    db,
    actor,
    {
      action: "create-theme",
      title,
      description: `From Business Field Notes: ${qs.length} question${qs.length === 1 ? "" : "s"} on ${noteIds.length} card${noteIds.length === 1 ? "" : "s"}. ${str(input.targetBehaviour, 300)}`,
      roles: "Care Partner principals",
      owner: str(input.owner, 120),
      risk: "routine",
    },
    now,
  ) as { id: string };
  for (const q of qs)
    problemAction(
      db,
      actor,
      {
        action: "add-case",
        id: themeId,
        themeId,
        source: "community",
        sourceRef: q.id,
        on: q.created_at.slice(0, 10),
        // The card it's about, never the question's words: those stay in the principal-only thread.
        summary: `Business Field Notes question on “${versions(db, q.note_id)[0]?.data.hook ?? q.note_id}”`,
        link: `/admin/business-notes?q=${q.id}`,
      },
      now,
    );
  const pid = `bfprop-${randomUUID().slice(0, 10)}`;
  db.prepare("INSERT INTO bfn_proposals (id, theme_id, title, data, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?)").run(
    pid,
    themeId,
    title,
    JSON.stringify({
      questionIds,
      noteIds,
      targetBehaviour: str(input.targetBehaviour, 300),
      existingChecked: existing,
      divergent: str(input.divergent, 600),
      appliesWhere: str(input.appliesWhere, 300),
      output,
      owner: str(input.owner, 120),
    }),
    actor.id,
    now.toISOString(),
    now.toISOString(),
  );
  event(db, actor, "business_playbook_proposed", { key: pid }, now);
  audit(db, { actor: actor.id, event: "business.proposal.created", entity: `bfn-proposal:${pid}`, next: { themeId }, at: now });
  return { ...businessLibrary(db, actor, now), created: { id: pid, themeId } };
}

// ---------------------------------------------------------------------------------------------
// Insights and the export: aggregates only, with small cells suppressed
// ---------------------------------------------------------------------------------------------

const people = (db: Db, where: string, ...args: (string | number)[]) =>
  (db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM bfn_events WHERE ${where}`).get(...args) as { n: number }).n;

/** Who could take part: every current principal. The denominator for reach. */
const principals = (db: Db) =>
  (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM business_planner_access WHERE grant_role = 'owner'").get() as { n: number }).n;

export function businessInsights(db: Db, actor: User, input: { from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  ensureBusiness(db, now);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(input.to ?? "")) ? String(input.to) : today(now);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.from ?? ""))
    ? String(input.from)
    : new Date(Date.parse(to) - 90 * 86_400_000).toISOString().slice(0, 10);
  const end = `${to}T23:59:59.999Z`;
  const range = "at >= ? AND at <= ?";
  const reached = people(db, `event = 'business_deck_opened' AND ${range}`, from, end);
  const funnel = (
    ["business_card_front_viewed", "business_card_flipped", "business_thread_opened", "business_tool_opened", "business_reflection_saved"] as const
  ).map((e) => ({
    event: e,
    people: suppress(people(db, `event = ? AND ${range}`, e, from, end)),
  }));
  const byStage = (Object.keys(STAGES) as (keyof typeof STAGES)[]).map((s) => ({
    stage: STAGES[s],
    people: suppress(people(db, `stage = ? AND event IN ('business_card_flipped', 'business_thread_opened') AND ${range}`, s, from, end)),
  }));
  const byTheme = (Object.keys(THEMES) as (keyof typeof THEMES)[])
    .map((t) => ({
      theme: THEMES[t],
      people: suppress(people(db, `theme = ? AND ${range}`, t, from, end)),
      questions: (
        db.prepare(`SELECT COUNT(*) AS n FROM bfn_events WHERE theme = ? AND event = 'business_question_submitted' AND ${range}`).get(t, from, end) as {
          n: number;
        }
      ).n,
    }))
    .filter((x) => x.people !== 0 || x.questions);
  const lib = businessLibrary(db, actor, now);
  const posts = db
    .prepare("SELECT status, label, parent_id, created_at FROM bfn_posts WHERE author_id != 'seed' AND created_at >= ? AND created_at <= ?")
    .all(from, end) as {
    status: PostStatus;
    label: ReplyLabel;
    parent_id: string | null;
    created_at: string;
  }[];
  const mod = db.prepare(`SELECT kind, COUNT(*) AS n FROM bfn_moderation WHERE ${range} GROUP BY kind`).all(from, end) as { kind: string; n: number }[];
  const months = new Map<string, number>();
  for (const e of db
    .prepare(`SELECT substr(at, 1, 7) AS m, COUNT(DISTINCT user_id) AS n FROM bfn_events WHERE ${range} GROUP BY m ORDER BY m`)
    .all(from, end) as {
    m: string;
    n: number;
  }[])
    months.set(e.m, e.n);
  return {
    range: { from, to },
    eligible: principals(db),
    reached: suppress(reached),
    funnel,
    byStage,
    byTheme,
    overTime: [...months.entries()].map(([month, n]) => ({ month, people: suppress(n) })),
    conversation: {
      questions: posts.filter((p) => !p.parent_id && p.status !== "withdrawn").length,
      replies: posts.filter((p) => p.parent_id && p.status === "posted").length,
      held: posts.filter((p) => p.status === "held").length,
      unanswered: lib.community.unanswered.length,
      ownerReview: lib.community.unanswered.filter((q) => q.owner).length,
      themes: lib.community.themes.map((t) => ({ theme: t.theme, count: t.count })),
    },
    moderation: mod,
    editorial: {
      cards: lib.notes.length,
      published: lib.notes.filter((n) => n.published).length,
      illustrative: lib.notes.filter((n) => n.latest.data.illustrative).length,
      contributed: lib.notes.filter((n) => n.contributed).length,
      withdrawn: lib.notes.filter((n) => n.latest.state === "withdrawn").length,
      stale: lib.notes.filter((n) => n.stale.length).length,
      byStage: (Object.keys(STAGES) as (keyof typeof STAGES)[]).map((s) => ({
        stage: STAGES[s],
        cards: lib.notes.filter((n) => n.latest.data.business?.stage === s && n.published).length,
      })),
    },
    proposals: lib.proposals.map((p) => ({ title: p.title, status: p.statusText, themeId: p.theme_id })),
    note: "Engagement and conversation, not competency or business results. Groups under 5 people are shown as “fewer than 5”.",
  };
}

/** The general Excel export: aggregates with numerators, denominators, source and version. No post text, no private words, no individual business. */
export function businessExport(db: Db, actor: User, input: { from?: unknown; to?: unknown }, now: Date): Buffer {
  const ins = businessInsights(db, actor, input, now);
  const lib = businessLibrary(db, actor, now);
  const extracted = now.toISOString();
  const scope = `${ins.range.from} to ${ins.range.to} · verified principals`;
  const row = (metric: string, num: number | null, den: number | string, source: string, version = "", quality = "Complete") => [
    ins.range.from,
    ins.range.to,
    "Verified Care Partner principals",
    metric,
    num === null ? cellText(null) : num,
    den,
    source,
    version,
    extracted,
    num === null ? "Suppressed: fewer than 5 people" : quality,
  ];
  const head = ["From", "To", "Audience", "Metric", "Numerator", "Denominator", "Source", "Content version", "Extracted", "Data quality"];
  const sheets: Sheet[] = [
    {
      name: "Definitions",
      header: ["Term", "Meaning"],
      rows: [
        ["Scope", scope],
        ["Eligible principals", "Business owners recorded in business-owner access (the denominator for reach)."],
        ["Reached", "Principals who opened the business deck in the range."],
        ["Suppressed", `Any count of people from 1 to ${4} is shown as “fewer than 5”, so a small group can’t be identified.`],
        ["Peer experience", "A contributor’s story or a peer reply. Not Trilogy Care policy, a staffing benchmark or a verified business result."],
        ["Answered", "A question with the contributor’s reply, approved guidance, or a reply the asker marked useful."],
        [
          "Excluded",
          "Post text, private first thoughts and plans, client or worker details, contributors’ private financial information and individual business performance.",
        ],
        ["Limit", "Views and replies show engagement, not competency or business improvement. No causal claim is made from viewing a card."],
      ],
    },
    {
      name: "Card engagement aggregate",
      header: head,
      numbers: true,
      rows: [
        row("Principals who opened the deck", ins.reached, ins.eligible, "bfn_events: business_deck_opened"),
        ...ins.funnel.map((f) =>
          row(`Principals: ${f.event.replace("business_", "").replace(/_/g, " ")}`, f.people, ins.reached ?? cellText(null), `bfn_events: ${f.event}`),
        ),
        ...ins.byStage.map((s) => row(`Principals engaging with “${s.stage}” cards`, s.people, ins.reached ?? cellText(null), "bfn_events by card stage")),
      ],
    },
    {
      name: "Question themes",
      header: ["Theme", "Unanswered questions", "Questions in range", "Source", "Extracted"],
      numbers: true,
      rows: [
        ...ins.byTheme.map((t) => [
          t.theme,
          lib.community.themes.find((x) => x.theme === t.theme)?.count ?? 0,
          t.questions,
          "bfn_posts, bfn_events",
          extracted,
        ]),
      ],
    },
    {
      name: "Moderation and reviews",
      header: head,
      numbers: true,
      rows: [
        ...ins.moderation.map((m) => row(`Moderation: ${m.kind}`, m.n, "", "bfn_moderation")),
        ...lib.notes.flatMap((n) =>
          n.steps.map((s) =>
            row(`${s.label}: ${s.decision ? s.decision.outcome : "not yet"}`, s.decision ? 1 : 0, 1, "bfn_reviews", `${n.latest.id} v${n.latest.version}`),
          ),
        ),
      ],
    },
    {
      name: "Tool connections",
      header: ["Card", "Content version", "Work Tool", "Kind", "Available to readers", "Extracted"],
      rows: lib.notes.flatMap((n) => n.tools.map((t) => [n.latest.id, n.latest.version, t.title, t.kind, t.available ? "Yes" : "No", extracted])),
    },
    {
      name: "Contributor diversity aggregate",
      header: ["Business stage", "Published cards", "Of which illustrative", "Source", "Extracted"],
      numbers: true,
      rows: (Object.keys(STAGES) as (keyof typeof STAGES)[]).map((s) => {
        const cards = lib.notes.filter((n) => n.published && n.latest.data.business?.stage === s);
        return [STAGES[s], cards.length, cards.filter((n) => n.latest.data.illustrative).length, "mentor_notes (business)", extracted];
      }),
    },
    {
      name: "Playbook decisions",
      header: ["Proposal", "Status", "Proposed output", "Problem desk theme", "Questions cited", "Created", "Extracted"],
      rows: lib.proposals.map((p) => [
        p.title,
        p.statusText,
        PROPOSAL_OUTPUTS[(p.data.output as ProposalOutput) ?? "existing"] ?? "",
        p.theme_id ?? "",
        Array.isArray(p.data.questionIds) ? p.data.questionIds.length : 0,
        p.created_at.slice(0, 10),
        extracted,
      ]),
    },
    {
      name: "Version history",
      header: ["Card", "Version", "State", "Updated", "Published check-ins", "Stale-content flags", "Extracted"],
      rows: lib.notes.flatMap((n) =>
        n.history.map((h) => [
          n.latest.id,
          h.version,
          h.state,
          h.updatedAt.slice(0, 10),
          n.chapters.filter((c) => c.state === "published").length,
          n.stale.join(" "),
          extracted,
        ]),
      ),
    },
  ];
  audit(db, { actor: actor.id, event: "business.export", entity: "bfn:export", reason: scope, at: now });
  return workbook(sheets);
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** Search documents for the business deck: only for a principal, only published cards, never private fields. */
export function businessSearchDocs(db: Db, user: User) {
  if (!isPrincipal(db, user)) return [];
  ensureBusiness(db);
  return businessIds(db)
    .map((id) => current(db, id))
    .filter((n): n is MentorNote => Boolean(n))
    .map((n) => {
      const b = n.data.business!;
      return {
        id: `business-note:${n.id}`,
        href: `/business-notes/${n.id}`,
        title: n.data.hook.replace(/[“”]/g, ""),
        meta: `Business Field Note · ${THEMES[b.theme]}`,
        head: n.data.hook,
        summary: `${n.data.scenario} ${b.decision}`,
        body: [n.data.note, n.data.phrase, b.believed, b.tried, b.failed, b.tradeoff].join(" "),
      };
    });
}
