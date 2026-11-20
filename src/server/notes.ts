import "server-only";
import { randomUUID } from "node:crypto";
import { allBlocks } from "@/lib/magazine";
import {
  canCopyPhrase,
  cleanNote,
  DEALABLE,
  dealAnother,
  dealDeck,
  deckComplete,
  emptyDeck,
  isPublished,
  noteProblems,
  reviewLabel,
  visibleTo,
  type Candidate,
  type DeckState,
  type MentorNote,
  type NoteState,
  type NotesDeckData,
} from "@/lib/notes";
import { SEED_NOTES } from "@/content/mentorNotes";
import { posts } from "@/content/community";
import { audit, ensureMentorNotes as ensureTables, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { withdrawnPosts } from "./reset";

/*
  "Notes to a Younger Me" (docs/notes-to-a-younger-me.md).

  - One library of mentor notes, every version kept. A deck, Pocket Deck and the Community link all resolve to a
    note's current published version, so nothing is copied into a course.
  - Only reviewed (or endorsed) notes are dealt. One flagged for re-review stays readable with copying off; a
    withdrawn note is gone everywhere, and Pocket Deck says why.
  - A contributor's note is published only after an editor's review and, if the editor changed the wording, the
    contributor's OK. It's never published on anyone's behalf.
  - Helpful votes: one per person per note, and they can be taken back. They order the pool; they never endorse.
  - Saves are private pointers, not copies. First instincts and reflections are private to the learner.
*/

type Row = {
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
const toNote = (r: Row): MentorNote => ({
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
const today = (now: Date) => now.toISOString().slice(0, 10);

const seeded = new WeakSet<object>();
/** The tables, and the seed notes waiting for review the first time. */
export function ensureNotes(db: Db, now = new Date()) {
  ensureTables(db);
  if (seeded.has(db)) return;
  const ins = db.prepare(
    "INSERT OR IGNORE INTO mentor_notes (id, version, state, data, author_user, reason, created_at, updated_at) VALUES (?, 1, 'submitted', ?, '', '', ?, ?)",
  );
  for (const n of SEED_NOTES)
    if (!db.prepare("SELECT 1 FROM mentor_notes WHERE id = ?").get(n.id)) ins.run(n.id, JSON.stringify(n.data), now.toISOString(), now.toISOString());
  seeded.add(db);
}

const versions = (db: Db, id: string) => (db.prepare("SELECT * FROM mentor_notes WHERE id = ? ORDER BY version DESC").all(id) as Row[]).map(toNote);
/** The version readers see: the newest published one. */
const current = (db: Db, id: string) => versions(db, id).find(isPublished);
const allIds = (db: Db) => (db.prepare("SELECT DISTINCT id FROM mentor_notes").all() as { id: string }[]).map((r) => r.id);
const helpfulCount = (db: Db, id: string) => (db.prepare("SELECT COUNT(*) AS n FROM mentor_note_helpful WHERE note_id = ?").get(id) as { n: number }).n;
function candidates(db: Db): Candidate[] {
  return allIds(db)
    .map((id) => current(db, id))
    .filter((n): n is MentorNote => Boolean(n))
    .map((note) => ({ note, helpful: helpfulCount(db, note.id) }));
}
function noteEvent(db: Db, user: User, n: MentorNote, event: string, now: Date) {
  db.prepare("INSERT INTO mentor_note_events (at, user_id, note_id, version, event) VALUES (?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    n.id,
    n.version,
    event,
  );
}

/** A card as a reader sees it, with their own helpful vote and save, and whether its thread is open. */
function card(db: Db, user: User, n: MentorNote) {
  const post = posts.find((p) => p.id === n.data.communityPostId);
  return {
    id: n.id,
    version: n.version,
    state: n.state,
    label: reviewLabel(n),
    data: n.data,
    canCopy: canCopyPhrase(n),
    helpful: helpfulCount(db, n.id),
    mineHelpful: Boolean(db.prepare("SELECT 1 FROM mentor_note_helpful WHERE note_id = ? AND user_id = ?").get(n.id, user.id)),
    saved: Boolean(db.prepare("SELECT 1 FROM mentor_note_saves WHERE note_id = ? AND user_id = ?").get(n.id, user.id)),
    thread: post && !withdrawnPosts(db).has(post.id) ? post.id : "",
    updatedAt: n.reviewedAt || n.updatedAt,
  };
}
export type NoteCard = ReturnType<typeof card>;
/** A card a reader can't see any more, and why. */
const gone = (id: string, why: string) => ({ id, gone: true as const, why });

// ---------------------------------------------------------------------------------------------
// Decks in Magazine courses
// ---------------------------------------------------------------------------------------------

type AttemptRow = { id: string; guide_id: string; revision_id: string; block_id: string; user_id: string; state: string; status: string; started_at: string };

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureNotes(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "mentor") throw new HttpError(404, "That deck isn’t here.");
  return { edition, block };
}
const attemptOf = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM notes_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const stateOf = (a: AttemptRow | undefined): DeckState => (a ? { ...emptyDeck(), ...JSON.parse(a.state) } : emptyDeck());

function resolve(db: Db, user: User, ids: string[]) {
  return ids.map((id) => {
    const n = current(db, id);
    if (!n) return gone(id, versions(db, id)[0]?.reason || "This note has been withdrawn.");
    if (!visibleTo(n, user.audience)) return gone(id, "This note isn’t shared with your role.");
    return card(db, user, n);
  });
}

/** The learner's deck: dealt once and kept stable, so it never reorders mid-lesson. */
export function deckState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block } = load(db, user, guideId, blockId);
  return tx(db, () => {
    let a = attemptOf(db, user, edition.guide.id, edition.revision.id, block.id);
    let s = stateOf(a);
    if (!a || !s.dealt.length) {
      s = { ...s, dealt: dealDeck(candidates(db), block, user.audience, `${user.id}:${block.id}`, today(now)) };
      if (!a) {
        const id = `nd-${randomUUID().slice(0, 12)}`;
        db.prepare(
          "INSERT INTO notes_attempts (id, guide_id, revision_id, block_id, user_id, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
        ).run(id, edition.guide.id, edition.revision.id, block.id, user.id, JSON.stringify(s), now.toISOString(), now.toISOString());
        a = db.prepare("SELECT * FROM notes_attempts WHERE id = ?").get(id) as AttemptRow;
      } else db.prepare("UPDATE notes_attempts SET state = ? WHERE id = ?").run(JSON.stringify(s), a.id);
    }
    return {
      state: s,
      cards: resolve(db, user, s.dealt),
      exhausted: !dealAnother(candidates(db), block, user.audience, `${user.id}:${block.id}`, today(now), s.dealt),
    };
  });
}

/** Turn a card over, record a first instinct, reflect, or deal another. Completion: every first card turned (and a reflection, if asked). */
export function deckAction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  // Make sure the deck has been dealt (its own transaction), then act on it.
  deckState(db, user, guideId, block.id, now);
  return tx(db, () => {
    const a = attemptOf(db, user, edition.guide.id, edition.revision.id, block.id)!;
    let s = stateOf(a);
    const noteId = typeof input.noteId === "string" ? input.noteId : "";
    const was = s.completed;
    let exhausted = false;
    if (input.action === "flip") {
      if (!s.dealt.includes(noteId)) throw new HttpError(400, "That card isn’t in your deck.");
      const n = current(db, noteId);
      if (n && !s.flipped.includes(noteId)) {
        s = { ...s, flipped: [...s.flipped, noteId], versions: { ...s.versions, [noteId]: n.version } };
        noteEvent(db, user, n, "flipped", now);
      }
    } else if (input.action === "instinct") {
      if (!s.dealt.includes(noteId)) throw new HttpError(400, "That card isn’t in your deck.");
      s = { ...s, instincts: { ...s.instincts, [noteId]: typeof input.text === "string" ? input.text.slice(0, 400) : "" } };
    } else if (input.action === "reflect") {
      s = { ...s, reflection: typeof input.text === "string" ? input.text.slice(0, 600) : "" };
    } else if (input.action === "deal") {
      if (!block.deal) throw new HttpError(400, "This deck doesn’t deal more cards.");
      const next = dealAnother(candidates(db), block, user.audience, `${user.id}:${block.id}`, today(now), s.dealt);
      if (next) s = { ...s, dealt: [...s.dealt, next] };
      else exhausted = true;
    } else throw new HttpError(400, "Unknown action.");
    s = { ...s, completed: s.completed || deckComplete(block, s) };
    db.prepare("UPDATE notes_attempts SET state = ?, status = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(s),
      s.completed ? "completed" : "active",
      now.toISOString(),
      a.id,
    );
    if (s.completed && !was)
      db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, 'notes.completed', ?, ?)").run(
        now.toISOString(),
        user.id,
        a.guide_id,
        a.revision_id,
        a.block_id,
        JSON.stringify({ cards: s.dealt.length }),
      );
    return {
      state: s,
      cards: resolve(db, user, s.dealt),
      completedNow: s.completed && !was,
      exhausted: exhausted || !dealAnother(candidates(db), block, user.audience, `${user.id}:${block.id}`, today(now), s.dealt),
    };
  });
}

/** For the editor's preview: what a deck would deal, drafts and notes waiting for review included and marked. Nothing is stored. */
export function deckPreview(db: Db, actor: User, block: NotesDeckData, now: Date) {
  requireAuthor(actor);
  ensureNotes(db, now);
  const all = allIds(db).map((id) => versions(db, id)[0]);
  // Treat every note that isn't withdrawn or declined as if it were reviewed, so an author can see the deck before review.
  const cands = all
    .filter((n) => n.state !== "withdrawn" && n.state !== "declined")
    .map((n) => ({ note: { ...n, state: (DEALABLE.includes(n.state) ? n.state : "reviewed") as NoteState }, helpful: helpfulCount(db, n.id) }));
  const ids = dealDeck(cands, block, "staff", `${actor.id}:preview`, today(now));
  return { cards: ids.map((id) => ({ ...card(db, actor, versions(db, id)[0]), preview: !isPublished(versions(db, id)[0]) })) };
}

/** Which of a block's cards can't go to learners, checked at publish: curated cards must be reviewed; a pool needs enough reviewed cards. */
export function deckProblems(db: Db, block: NotesDeckData, now: Date): string[] {
  ensureNotes(db, now);
  const out: string[] = [];
  for (const id of block.noteIds) {
    const n = current(db, id);
    if (!n || !DEALABLE.includes(n.state)) out.push(`“${versions(db, id)[0]?.data.hook ?? id}” isn’t reviewed (or has been flagged or withdrawn).`);
  }
  if (block.selection !== "curated") {
    const pool = candidates(db).filter((c) => DEALABLE.includes(c.note.state) && c.note.data.topics.some((t) => block.topics.includes(t)));
    if (pool.length + block.noteIds.length < block.count)
      out.push(
        `There ${pool.length === 1 ? "is only 1 reviewed note" : `are only ${pool.length} reviewed notes`} on this topic; the deck shows ${block.count}.`,
      );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Card actions anywhere: helpful, save, copy, discussion
// ---------------------------------------------------------------------------------------------

function readable(db: Db, user: User, id: unknown) {
  ensureNotes(db);
  const n = typeof id === "string" ? current(db, id) : undefined;
  if (!n || !visibleTo(n, user.audience)) throw new HttpError(404, "That note isn’t available.");
  return n;
}

/** One helpful vote per person, which they can take back. Rate-limited; never a down-vote. */
export function toggleHelpful(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const n = readable(db, user, input.noteId);
  return tx(db, () => {
    const had = db.prepare("SELECT 1 FROM mentor_note_helpful WHERE note_id = ? AND user_id = ?").get(n.id, user.id);
    const want = input.on === undefined ? !had : input.on === true;
    if (want && !had) {
      const since = new Date(now.getTime() - 3600_000).toISOString();
      if ((db.prepare("SELECT COUNT(*) AS n FROM mentor_note_helpful WHERE user_id = ? AND at >= ?").get(user.id, since) as { n: number }).n >= 30)
        throw new HttpError(429, "That’s a lot of votes for one hour. Try again later.");
      db.prepare("INSERT OR IGNORE INTO mentor_note_helpful (note_id, user_id, at) VALUES (?, ?, ?)").run(n.id, user.id, now.toISOString());
    } else if (!want && had) db.prepare("DELETE FROM mentor_note_helpful WHERE note_id = ? AND user_id = ?").run(n.id, user.id);
    return card(db, user, n);
  });
}

/** Save to (or remove from) Pocket Deck: a private pointer, not a copy. Repeating the same request changes nothing. */
export function toggleSave(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureNotes(db, now);
  const id = typeof input.noteId === "string" ? input.noteId : "";
  const want = input.on === true;
  if (want) readable(db, user, id);
  if (want) db.prepare("INSERT OR IGNORE INTO mentor_note_saves (user_id, note_id, saved_at) VALUES (?, ?, ?)").run(user.id, id, now.toISOString());
  else db.prepare("DELETE FROM mentor_note_saves WHERE user_id = ? AND note_id = ?").run(user.id, id);
  return { saved: want };
}

/** Copying the phrase, or opening the discussion. Copying is refused while a note is being re-reviewed. */
export function noteUse(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const n = readable(db, user, input.noteId);
  if (input.event === "copied") {
    if (!canCopyPhrase(n)) throw new HttpError(400, "This phrase is being re-reviewed, so it can’t be copied for now.");
    noteEvent(db, user, n, "copied", now);
  } else if (input.event === "discussion") noteEvent(db, user, n, "discussion", now);
  else throw new HttpError(400, "Unknown event.");
  return { ok: true };
}

/** Pocket Deck: the learner's saved notes, each resolved to its newest published version, or why it's gone. */
export function pocketDeck(db: Db, user: User, now: Date) {
  ensureNotes(db, now);
  const saves = db.prepare("SELECT note_id, saved_at FROM mentor_note_saves WHERE user_id = ? ORDER BY saved_at DESC").all(user.id) as {
    note_id: string;
    saved_at: string;
  }[];
  return {
    notes: saves.map((s) => {
      const [c] = resolve(db, user, [s.note_id]);
      return { ...c, savedAt: s.saved_at, updatedSince: "gone" in c ? false : c.updatedAt > s.saved_at };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Leaving a note for the next person
// ---------------------------------------------------------------------------------------------

/** The contributor's own notes, each at its newest version, with where it's up to. */
export function myNotes(db: Db, user: User, now: Date) {
  ensureNotes(db, now);
  const ids = (db.prepare("SELECT DISTINCT id FROM mentor_notes WHERE author_user = ?").all(user.id) as { id: string }[]).map((r) => r.id);
  return {
    notes: ids.map((id) => {
      const all = versions(db, id);
      const editorVersion = all.find((v) => v.state === "changes");
      return { latest: all[0], editorVersion: editorVersion ?? null, published: current(db, id) ?? null };
    }),
  };
}

/** Save a draft (new, or the contributor's own draft). Never published from here. */
export function saveMyNote(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureNotes(db, now);
  const data = cleanNote(input.data);
  const at = now.toISOString();
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) {
    const fresh = `note-${randomUUID().slice(0, 10)}`;
    db.prepare("INSERT INTO mentor_notes (id, version, state, data, author_user, reason, created_at, updated_at) VALUES (?, 1, 'draft', ?, ?, '', ?, ?)").run(
      fresh,
      JSON.stringify(data),
      user.id,
      at,
      at,
    );
    return { note: versions(db, fresh)[0] };
  }
  const top = versions(db, id)[0];
  if (!top || top.authorUser !== user.id) throw new HttpError(404, "That note isn’t yours to edit.");
  if (top.state !== "draft") throw new HttpError(400, "It’s with the editors now. Withdraw it if you want to start again.");
  db.prepare("UPDATE mentor_notes SET data = ?, updated_at = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), at, id, top.version);
  return { note: versions(db, id)[0] };
}

/** Submit for review, approve or decline an editor's wording, or withdraw: the contributor's decisions. */
export function myNoteAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureNotes(db, now);
  const id = typeof input.id === "string" ? input.id : "";
  const all = versions(db, id);
  if (!all.length || all[0].authorUser !== user.id) throw new HttpError(404, "That note isn’t yours.");
  const top = all[0];
  const at = now.toISOString();
  const set = (version: number, state: NoteState, reason = "") =>
    db.prepare("UPDATE mentor_notes SET state = ?, reason = ?, updated_at = ? WHERE id = ? AND version = ?").run(state, reason, at, id, version);
  return tx(db, () => {
    if (input.action === "submit") {
      if (top.state !== "draft") throw new HttpError(400, "Only a draft can be submitted.");
      const problems = noteProblems(top.data);
      if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
      set(top.version, "submitted");
      audit(db, { actor: user.id, event: "note.submitted", entity: `note:${id}`, at: now });
    } else if (input.action === "approve-edits") {
      if (top.state !== "changes") throw new HttpError(400, "There are no edits waiting for you.");
      set(top.version, "reviewed");
      db.prepare("UPDATE mentor_notes SET reviewed_at = ? WHERE id = ? AND version = ?").run(at, id, top.version);
      audit(db, { actor: user.id, event: "note.edits_approved", entity: `note:${id}:v${top.version}`, at: now });
    } else if (input.action === "decline-edits") {
      if (top.state !== "changes") throw new HttpError(400, "There are no edits waiting for you.");
      // The editor's version goes (the audit keeps the record); the author's own version stays as it was.
      db.prepare("DELETE FROM mentor_notes WHERE id = ? AND version = ?").run(id, top.version);
      audit(db, { actor: user.id, event: "note.edits_declined", entity: `note:${id}:v${top.version}`, previous: top.data, at: now });
    } else if (input.action === "withdraw") {
      db.prepare("UPDATE mentor_notes SET state = 'withdrawn', reason = 'Withdrawn by the author.', updated_at = ? WHERE id = ?").run(at, id);
      audit(db, { actor: user.id, event: "note.withdrawn", entity: `note:${id}`, reason: "author", at: now });
    } else throw new HttpError(400, "Unknown action.");
    return myNotes(db, user, now);
  });
}

// ---------------------------------------------------------------------------------------------
// The editors' library
// ---------------------------------------------------------------------------------------------

export function noteLibrary(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureNotes(db, now);
  const counts = db.prepare("SELECT note_id, event, COUNT(*) AS n FROM mentor_note_events GROUP BY note_id, event").all() as {
    note_id: string;
    event: string;
    n: number;
  }[];
  return {
    notes: allIds(db).map((id) => {
      const all = versions(db, id);
      const stats: Record<string, number> = { helpful: helpfulCount(db, id) };
      for (const c of counts.filter((x) => x.note_id === id)) stats[c.event] = c.n;
      return {
        latest: all[0],
        published: current(db, id) ?? null,
        problems: noteProblems(all[0].data),
        contributed: Boolean(all[0].authorUser),
        stats,
        history: all.map((v) => ({ version: v.version, state: v.state, updatedAt: v.updatedAt })),
      };
    }),
  };
}

/**
  Editors' decisions. Editing a contributor's wording makes a new version that waits for their OK; editing a seed
  edits it in place (or as a new version, if it's published). Reviewing publishes; endorsing records the policy
  owner; flagging pauses copying and new deals; withdrawing removes it everywhere.
*/
export function editorAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureNotes(db, now);
  const id = typeof input.id === "string" ? input.id : "";
  const all = versions(db, id);
  if (!all.length) throw new HttpError(404, "That note isn’t in the library.");
  const top = all[0];
  const at = now.toISOString();
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  const set = (version: number, state: NoteState, why = "") =>
    db.prepare("UPDATE mentor_notes SET state = ?, reason = ?, updated_at = ? WHERE id = ? AND version = ?").run(state, why, at, id, version);
  return tx(db, () => {
    switch (input.action) {
      case "edit": {
        const data = cleanNote(input.data);
        const changed = JSON.stringify(data) !== JSON.stringify(top.data);
        if (!changed) break;
        if (top.authorUser) {
          if (!["submitted", "reviewed", "endorsed", "needs_review"].includes(top.state))
            throw new HttpError(400, "Only a submitted or published note can be edited.");
          // The contributor approves the edited wording before it's published.
          db.prepare(
            "INSERT INTO mentor_notes (id, version, state, data, author_user, reason, created_at, updated_at) VALUES (?, ?, 'changes', ?, ?, '', ?, ?)",
          ).run(id, top.version + 1, JSON.stringify(data), top.authorUser, at, at);
        } else if (isPublished(top))
          db.prepare(
            "INSERT INTO mentor_notes (id, version, state, data, author_user, reason, created_at, updated_at) VALUES (?, ?, 'submitted', ?, '', '', ?, ?)",
          ).run(id, top.version + 1, JSON.stringify(data), at, at);
        else db.prepare("UPDATE mentor_notes SET data = ?, updated_at = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), at, id, top.version);
        audit(db, { actor: actor.id, event: "note.edited", entity: `note:${id}`, at: now });
        break;
      }
      case "review": {
        if (!["submitted", "needs_review"].includes(top.state)) throw new HttpError(400, "There’s nothing waiting for review.");
        const problems = noteProblems(top.data);
        if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
        set(top.version, "reviewed");
        db.prepare("UPDATE mentor_notes SET reviewed_by = ?, reviewed_at = ? WHERE id = ? AND version = ?").run(actor.id, at, id, top.version);
        audit(db, { actor: actor.id, event: "note.reviewed", entity: `note:${id}:v${top.version}`, at: now });
        break;
      }
      case "endorse": {
        if (top.state !== "reviewed") throw new HttpError(400, "Only a reviewed note can be endorsed.");
        if (reason.length < 3) throw new HttpError(400, "Name the policy owner endorsing it.");
        set(top.version, "endorsed", `Endorsed by ${reason}`);
        audit(db, { actor: actor.id, event: "note.endorsed", entity: `note:${id}:v${top.version}`, reason, at: now });
        break;
      }
      case "flag": {
        const live = current(db, id);
        if (!live || live.state === "needs_review") throw new HttpError(400, "There’s no published version to flag.");
        if (reason.length < 3) throw new HttpError(400, "Say briefly why it needs re-review.");
        set(live.version, "needs_review", reason);
        audit(db, { actor: actor.id, event: "note.flagged", entity: `note:${id}:v${live.version}`, reason, at: now });
        break;
      }
      case "withdraw": {
        if (reason.length < 3) throw new HttpError(400, "Say briefly why it’s withdrawn.");
        db.prepare("UPDATE mentor_notes SET state = 'withdrawn', reason = ?, updated_at = ? WHERE id = ?").run(reason, at, id);
        audit(db, { actor: actor.id, event: "note.withdrawn", entity: `note:${id}`, reason, at: now });
        break;
      }
      case "decline": {
        if (top.state !== "submitted") throw new HttpError(400, "Only a submitted note can be declined.");
        if (reason.length < 3) throw new HttpError(400, "Say briefly why, for the author.");
        set(top.version, "declined", reason);
        audit(db, { actor: actor.id, event: "note.declined", entity: `note:${id}`, reason, at: now });
        break;
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
    return { note: versions(db, id)[0] };
  });
}

export const isEditor = canAuthor;
