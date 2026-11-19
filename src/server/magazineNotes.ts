import "server-only";
import { ACTION_STATUSES, allBlocks, type ActionStatus, type Block, type GuideDoc } from "@/lib/magazine";
import { ensureNotes, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Reflect and apply (docs/magazine-reflect-apply.md): a learner's private journal entries, action notes and
  pulse answers. Only the learner can read, change or delete their own. Nothing here is graded, sent to AI,
  posted anywhere or exported for anyone else; authors get counts per block, never the words. Events record
  that something was saved, never what was written.
*/

export type NoteRow = {
  guide_id: string;
  user_id: string;
  block_id: string;
  kind: "journal" | "action" | "pulse";
  body: string;
  choice: string | null;
  choice_label: string | null;
  status: string | null;
  state: "draft" | "saved" | "skipped";
  page_id: string | null;
  prompt: string;
  revisit_of: string | null;
  revision_id: string | null;
  created_at: string;
  updated_at: string;
};

export const noteView = (r: NoteRow) => ({
  blockId: r.block_id,
  kind: r.kind,
  body: r.body,
  choice: r.choice,
  choiceLabel: r.choice_label,
  status: r.status as ActionStatus | null,
  state: r.state,
  pageId: r.page_id,
  prompt: r.prompt,
  revisitOf: r.revisit_of,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export type Note = ReturnType<typeof noteView>;

const MAX_NOTE = 5000;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

function locate(doc: GuideDoc, blockId: unknown) {
  for (const page of doc.pages) for (const section of page.sections) for (const block of section.blocks) if (block.id === blockId) return { page, block };
  throw new HttpError(400, "That isn’t in this course.");
}

const promptOf = (b: Block) => (b.type === "journal" || b.type === "action" ? b.prompt : b.type === "pulse" ? b.question : "");

function event(db: Db, e: { user: string; guide: string; revision: string; event: string; page: string; block: string; detail: object; at: Date }) {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, page_id, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    e.at.toISOString(),
    e.user,
    e.guide,
    e.revision,
    e.event,
    e.page,
    e.block,
    JSON.stringify(e.detail),
  );
}

/**
  Saves the learner's own entry for a block: a journal note (a draft while they write, saved when they say
  so, or "prefer not to write"), an action (a suggestion or their own words; later, whether they tried it),
  or a pulse answer. A draft never replaces what they've saved as "saved".
*/
export function saveNote(
  db: Db,
  user: User,
  guideId: string,
  input: { revisionId?: unknown; blockId?: unknown; body?: unknown; choice?: unknown; status?: unknown; state?: unknown },
  now: Date,
): Note {
  ensureNotes(db);
  const { guide, revision, doc } = readerEdition(db, user, guideId);
  if (input.revisionId !== revision.id)
    throw new HttpError(409, "This course has been updated. Reload the page to carry on: what you’ve written is kept on this device.");
  const { page, block: b } = locate(doc, input.blockId);
  if (b.type !== "journal" && b.type !== "action" && b.type !== "pulse") throw new HttpError(400, "That block doesn’t take a note.");
  const body = text(input.body, MAX_NOTE);
  let state: NoteRow["state"] = input.state === "draft" ? "draft" : input.state === "skipped" ? "skipped" : "saved";
  let choice: string | null = null;
  let label: string | null = null;
  let status: string | null = null;
  let revisitOf: string | null = null;
  if (b.type === "journal") {
    revisitOf = b.revisits ?? null;
    if (state === "saved" && !body) throw new HttpError(400, "Write a few words first, or choose Skip for now.");
  } else if (b.type === "pulse") {
    const o = b.options.find((x) => x.id === input.choice);
    if (!o) throw new HttpError(400, "Choose one of the responses.");
    choice = o.id;
    label = o.label;
    state = "saved";
  } else if (b.revisits) {
    // Coming back to an earlier action: tried it, not yet, or adjusted the plan; a private reflection is optional.
    revisitOf = b.revisits;
    if (state !== "skipped") {
      if (typeof input.status !== "string" || !(input.status in ACTION_STATUSES)) throw new HttpError(400, "Choose how it went.");
      status = input.status;
    }
  } else if (state !== "skipped") {
    const s = b.suggestions.find((x) => x.id === input.choice);
    if (s) {
      choice = s.id;
      label = s.text;
    } else if (b.allowOwn === false || !body)
      throw new HttpError(400, b.allowOwn === false ? "Choose one of the actions." : "Choose an action, or write your own.");
    // The status set later in My Notes stays with the note.
  }
  return tx(db, () => {
    const at = now.toISOString();
    const had = db.prepare("SELECT * FROM magazine_notes WHERE guide_id = ? AND user_id = ? AND block_id = ?").get(guide.id, user.id, b.id) as
      NoteRow | undefined;
    // Autosave while editing a saved note keeps it saved; skipping never wipes words already saved.
    if (state === "draft" && had?.state === "saved") state = "saved";
    if (state === "skipped" && had?.state === "saved" && had.body) return noteView(had);
    if (b.type === "action" && !b.revisits && status == null) status = had?.status ?? null;
    db.prepare(
      `INSERT INTO magazine_notes (guide_id, user_id, block_id, kind, body, choice, choice_label, status, state, page_id, prompt, revisit_of, revision_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guide_id, user_id, block_id) DO UPDATE SET body = excluded.body, choice = excluded.choice, choice_label = excluded.choice_label, status = excluded.status,
         state = excluded.state, page_id = excluded.page_id, prompt = excluded.prompt, revisit_of = excluded.revisit_of, revision_id = excluded.revision_id, updated_at = excluded.updated_at`,
    ).run(
      guide.id,
      user.id,
      b.id,
      b.type,
      state === "skipped" ? "" : body,
      choice,
      label,
      status,
      state,
      page.id,
      promptOf(b).slice(0, 500),
      revisitOf,
      revision.id,
      at,
      at,
    );
    // What happened, never what was written.
    if (state !== "draft" && (!had || had.state === "draft" || b.type !== "journal"))
      event(db, {
        user: user.id,
        guide: guide.id,
        revision: revision.id,
        event: `${b.type}.${state === "skipped" ? "skipped" : revisitOf ? "revisited" : b.type === "pulse" ? "answered" : "saved"}`,
        page: page.id,
        block: b.id,
        detail: b.type === "pulse" ? { paired: Boolean(b.compareWith) } : b.type === "action" ? { own: !choice && !revisitOf, status } : {},
        at: now,
      });
    return noteView(db.prepare("SELECT * FROM magazine_notes WHERE guide_id = ? AND user_id = ? AND block_id = ?").get(guide.id, user.id, b.id) as NoteRow);
  });
}

/** How an action went, set from My Notes (the same three answers as a revisit block), with an optional reflection. */
export function setActionStatus(db: Db, user: User, guideId: string, input: { blockId?: unknown; status?: unknown }, now: Date): Note {
  ensureNotes(db);
  const { guide, revision } = readerEdition(db, user, guideId);
  const row = db
    .prepare("SELECT * FROM magazine_notes WHERE guide_id = ? AND user_id = ? AND block_id = ? AND kind = 'action'")
    .get(guide.id, user.id, String(input.blockId)) as NoteRow | undefined;
  if (!row) throw new HttpError(404, "That note isn’t there.");
  const status = typeof input.status === "string" && input.status in ACTION_STATUSES ? input.status : null;
  db.prepare("UPDATE magazine_notes SET status = ?, updated_at = ? WHERE guide_id = ? AND user_id = ? AND block_id = ?").run(
    status,
    now.toISOString(),
    guide.id,
    user.id,
    row.block_id,
  );
  event(db, {
    user: user.id,
    guide: guide.id,
    revision: revision.id,
    event: "action.updated",
    page: row.page_id ?? "",
    block: row.block_id,
    detail: { status },
    at: now,
  });
  return noteView({ ...row, status, updated_at: now.toISOString() });
}

/**
  My Notes: the learner's own journal entries and action notes in this course, oldest first, each with the
  page it came from and whether that block is still in the course. Pulse answers and unfinished drafts with
  nothing in them aren't notes.
*/
export function myNotes(db: Db, user: User, guideId: string) {
  ensureNotes(db);
  const { guide, doc } = readerEdition(db, user, guideId);
  const rows = db
    .prepare("SELECT * FROM magazine_notes WHERE guide_id = ? AND user_id = ? AND kind != 'pulse' AND state != 'skipped' ORDER BY created_at, block_id")
    .all(guide.id, user.id) as NoteRow[];
  const blocks = new Map(allBlocks(doc).map((b) => [b.id, b]));
  return {
    notes: rows
      .filter((r) => r.body || r.choice || r.status)
      .map((r) => {
        const i = doc.pages.findIndex((p) => p.id === r.page_id);
        const b = blocks.get(r.block_id);
        return {
          ...noteView(r),
          pageTitle: i >= 0 ? doc.pages[i].title || (doc.pages.length === 1 ? guide.title : `Page ${i + 1}`) : "",
          inCourse: Boolean(b),
          timing: b?.type === "action" ? (b.timing ?? null) : null,
        };
      }),
  };
}
export type MyNote = ReturnType<typeof myNotes>["notes"][number];

/** The learner removes one of their own notes. Their follow-ups to it stay, as their own entries. */
export function deleteNote(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  ensureNotes(db);
  const { guide, revision } = readerEdition(db, user, guideId);
  const r = db.prepare("DELETE FROM magazine_notes WHERE guide_id = ? AND user_id = ? AND block_id = ?").run(guide.id, user.id, String(blockId));
  if (r.changes)
    event(db, { user: user.id, guide: guide.id, revision: revision.id, event: "note.deleted", page: "", block: String(blockId), detail: {}, at: now });
  return { deleted: Number(r.changes) > 0 };
}

/**
  For authors: how much each reflect-and-apply block is used. Counts of learners only: no one's words, no
  one's name, and no breakdown of pulse answers (a small group could be identified from it).
*/
export function noteStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureNotes(db);
  const rows = db
    .prepare(
      `SELECT block_id AS blockId, kind, SUM(state = 'saved') AS saved, SUM(state = 'skipped') AS skipped, SUM(CASE WHEN status IS NOT NULL THEN 1 ELSE 0 END) AS followedUp
       FROM magazine_notes WHERE guide_id = ? AND state != 'draft' GROUP BY block_id, kind`,
    )
    .all(guideId) as { blockId: string; kind: string; saved: number; skipped: number; followedUp: number }[];
  const opened = db
    .prepare(
      "SELECT block_id AS blockId, COUNT(DISTINCT user_id) AS n FROM magazine_events WHERE guide_id = ? AND event = 'perspectives.opened' GROUP BY block_id",
    )
    .all(guideId) as {
    blockId: string;
    n: number;
  }[];
  return {
    blocks: Object.fromEntries([
      ...rows.map((r) => [r.blockId, { kind: r.kind, saved: r.saved, skipped: r.skipped, followedUp: r.followedUp }] as const),
      ...opened.map((o) => [o.blockId, { kind: "perspectives", saved: o.n, skipped: 0, followedUp: 0 }] as const),
    ]),
  };
}

/** A learner opened the perspectives on a block: counted for the course's analytics, once each. */
export function perspectivesOpened(db: Db, user: User, guideId: string, input: { revisionId?: unknown; blockId?: unknown }, now: Date) {
  const { guide, revision, doc } = readerEdition(db, user, guideId);
  const { page, block } = locate(doc, input.blockId);
  if (block.type !== "perspectives") throw new HttpError(400, "That isn’t a perspectives block.");
  const seen = db
    .prepare("SELECT 1 FROM magazine_events WHERE guide_id = ? AND user_id = ? AND block_id = ? AND event = 'perspectives.opened' LIMIT 1")
    .get(guide.id, user.id, block.id);
  if (!seen)
    event(db, { user: user.id, guide: guide.id, revision: revision.id, event: "perspectives.opened", page: page.id, block: block.id, detail: {}, at: now });
  return { ok: true };
}
