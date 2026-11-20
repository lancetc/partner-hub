import "server-only";
import { randomUUID } from "node:crypto";
import {
  checksum,
  cleanRelease,
  cleanSnippet,
  gateQuestion,
  ISSUES,
  lineDiff,
  readiness,
  releaseProblems,
  type Contact,
  type GapStatus,
  type Issue,
  type PbAudience,
  type Release,
  type ReleaseStatus,
  type ReplyLabel,
  type SnippetData,
  type SourceDoc,
} from "@/lib/playbook";
import { SEED_CONTACTS, SEED_SNIPPETS, SEED_SOURCES } from "@/content/playbooks";
import { audit, ensurePlaybooks as ensureTables, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { notify } from "./notifications";

/*
  Live SOP-to-Playbook snippets (docs/live-playbooks.md): source adapter → versioned snapshot → review and release
  → resolver.

  - The source adapter here is the Hub policy record: every edit to a section is a new, checksummed version. It
    stands in for Trilogy Care's designated policy repository, which isn't connected yet.
  - A release snapshots the source section it was written from. When the section changes, the snippet shows a
    pending change and a diff to its owner; readers keep the last approved release until a new one is approved.
  - One resolver serves every placement (Magazine blocks, the playbook page, saved Wallet references), for the
    reader's role only, with contact routes resolved for that role from the directory.
  - Questions pass the urgency and privacy gates before anything is shared. Urgent: the urgent route, nothing
    stored or posted. Possibly identifying: held for review. Otherwise: posted to the snippet's question thread,
    and the leads are alerted. A retry with the same key never makes a second question.
*/

const today = (now: Date) => now.toISOString().slice(0, 10);
type SnippetRow = { id: string; data: string; withdrawn: number; withdrawn_reason: string; updated_at: string };
type ReleaseRow = { snippet_id: string; number: number; status: ReleaseStatus; data: string; approved_by: string | null; approved_at: string | null };
const toRelease = (r: ReleaseRow): Release => ({
  snippetId: r.snippet_id,
  number: r.number,
  status: r.status,
  data: cleanRelease(JSON.parse(r.data)),
  approvedAt: r.approved_at ?? "",
  approvedBy: r.approved_by ?? "",
});

const seeded = new WeakSet<object>();
export function ensurePlaybooks(db: Db, now = new Date()) {
  ensureTables(db);
  if (seeded.has(db)) return;
  const at = now.toISOString();
  for (const s of SEED_SOURCES)
    db.prepare("INSERT OR IGNORE INTO playbook_sources (doc_id, version, data, at, by_user) VALUES (?, 1, ?, ?, 'seed')").run(s.id, JSON.stringify(s), at);
  for (const c of SEED_CONTACTS)
    db.prepare("INSERT OR IGNORE INTO playbook_contacts (key, label, routes, updated_at) VALUES (?, ?, ?, ?)").run(
      c.key,
      c.label,
      JSON.stringify(c.routes),
      at,
    );
  for (const s of SEED_SNIPPETS) {
    if (db.prepare("SELECT 1 FROM playbook_snippets WHERE id = ?").get(s.id)) continue;
    db.prepare("INSERT INTO playbook_snippets (id, data, withdrawn, withdrawn_reason, created_at, updated_at) VALUES (?, ?, 0, '', ?, ?)").run(
      s.id,
      JSON.stringify(s.data),
      at,
      at,
    );
    const src = SEED_SOURCES.find((x) => x.id === s.data.source.docId)!.sections.find((x) => x.anchor === s.data.source.anchor)!;
    db.prepare("INSERT INTO playbook_releases (snippet_id, number, status, data, created_by, created_at) VALUES (?, 1, 'in_review', ?, 'seed', ?)").run(
      s.id,
      JSON.stringify({ ...s.release, sourceVersion: 1, sourceChecksum: checksum(src.text), sourceText: src.text }),
      at,
    );
  }
  seeded.add(db);
}

// ---------------------------------------------------------------------------------------------
// Reading the library
// ---------------------------------------------------------------------------------------------

function sourceDoc(db: Db, docId: string): { doc: SourceDoc; version: number } | undefined {
  const r = db.prepare("SELECT data, version FROM playbook_sources WHERE doc_id = ? ORDER BY version DESC LIMIT 1").get(docId) as
    { data: string; version: number } | undefined;
  return r ? { doc: JSON.parse(r.data) as SourceDoc, version: r.version } : undefined;
}
const contacts = (db: Db): Contact[] =>
  (db.prepare("SELECT key, label, routes FROM playbook_contacts ORDER BY key").all() as { key: string; label: string; routes: string }[]).map((r) => ({
    key: r.key,
    label: r.label,
    routes: JSON.parse(r.routes),
  }));
const snippetRow = (db: Db, id: string) => db.prepare("SELECT * FROM playbook_snippets WHERE id = ?").get(id) as SnippetRow | undefined;
const releases = (db: Db, id: string) =>
  (db.prepare("SELECT * FROM playbook_releases WHERE snippet_id = ? ORDER BY number DESC").all(id) as ReleaseRow[]).map(toRelease);
const approved = (db: Db, id: string) => releases(db, id).find((r) => r.status === "approved");

/** The state of a snippet's source: unchanged, changed since its release (with a diff), or unmapped. */
function sourceState(db: Db, sn: SnippetData, base: Release | undefined) {
  const src = sourceDoc(db, sn.source.docId);
  const section = src?.doc.sections.find((x) => x.anchor === sn.source.anchor);
  if (!src || !section) return { state: "unmapped" as const, version: src?.version ?? 0, text: "", diff: [] };
  const sum = checksum(section.text);
  if (!base || base.data.sourceChecksum === sum)
    return { state: "current" as const, version: src.version, text: section.text, heading: section.heading, title: src.doc.title, diff: [] };
  return {
    state: "changed" as const,
    version: src.version,
    text: section.text,
    heading: section.heading,
    title: src.doc.title,
    diff: lineDiff(base.data.sourceText, section.text),
  };
}

// ---------------------------------------------------------------------------------------------
// The resolver: what a reader sees, wherever the snippet is placed
// ---------------------------------------------------------------------------------------------

/**
  The permitted content of a snippet for this reader: the current approved release (or the fallback), contacts for
  their role, the source section if their role may see it, what changed since they last viewed it, and the
  questions they're allowed to see.
*/
export function resolveSnippet(db: Db, user: User, id: unknown, now: Date) {
  ensurePlaybooks(db, now);
  const row = typeof id === "string" ? snippetRow(db, id) : undefined;
  if (!row) throw new HttpError(404, "That playbook isn’t here.");
  const sn = cleanSnippet(JSON.parse(row.data));
  const audience = user.audience as PbAudience;
  if (!sn.audiences.includes(audience)) return { id: row.id, permitted: false as const, title: "", message: "This playbook isn’t shared with your role." };
  const current = approved(db, row.id);
  const ready = readiness(sn, Boolean(row.withdrawn), current, today(now));
  const dir = contacts(db);
  const route = (keys: string[]) =>
    keys
      .map((k) => dir.find((c) => c.key === k))
      .filter((c): c is Contact => Boolean(c))
      .map((c) => ({ key: c.key, label: c.label, route: c.routes[audience] ?? "" }));
  const lastSeen =
    (db.prepare("SELECT number FROM playbook_views WHERE user_id = ? AND snippet_id = ?").get(user.id, row.id) as { number: number } | undefined)?.number ?? 0;
  const acked = current
    ? Boolean(db.prepare("SELECT 1 FROM playbook_acks WHERE user_id = ? AND snippet_id = ? AND number = ?").get(user.id, row.id, current.number))
    : false;
  const src = sourceDoc(db, sn.source.docId);
  const section = src?.doc.sections.find((x) => x.anchor === sn.source.anchor);
  const sourceAllowed = Boolean(src && src.doc.audiences.includes(audience));
  const leadView = canAuthor(user);
  const changedSince =
    current && lastSeen && lastSeen < current.number
      ? releases(db, row.id).filter((r) => r.status !== "draft" && r.number > lastSeen && r.number <= current.number)
      : [];
  return {
    id: row.id,
    permitted: true as const,
    title: sn.title,
    purpose: sn.purpose,
    roleLabel: sn.roleLabel,
    risk: sn.risk,
    ownerTeam: sn.ownerTeam,
    readiness: ready,
    withdrawnReason: row.withdrawn ? row.withdrawn_reason : "",
    release:
      ready === "fallback" || !current
        ? null
        : {
            number: current.number,
            steps: current.data.steps,
            effectiveOn: current.data.effectiveOn,
            reviewBy: current.data.reviewBy,
            changeSummary: current.data.changeSummary,
            ackRequired: current.data.ackRequired,
          },
    fallback: { text: sn.fallback.text, contacts: route(sn.fallback.contactKeys) },
    contacts: route(sn.contactKeys),
    updatedSince: changedSince.length ? changedSince.map((r) => ({ number: r.number, summary: r.data.changeSummary })) : [],
    acked,
    saved: Boolean(db.prepare("SELECT 1 FROM playbook_saves WHERE user_id = ? AND snippet_id = ?").get(user.id, row.id)),
    // The full approved source, only for roles it's shared with. Otherwise, the reader is told it's an excerpt.
    source:
      sourceAllowed && section
        ? { title: src!.doc.title, owner: src!.doc.owner, system: src!.doc.system, heading: section.heading, text: section.text, version: src!.version }
        : null,
    // Shown to leads and owners only: a pending source change, never to learners.
    pending: leadView ? sourceState(db, sn, current).state : null,
    questions: questionsFor(db, user, row.id, current?.number ?? 0),
  };
}
export type ResolvedSnippet = ReturnType<typeof resolveSnippet>;

/** Records that the reader has seen this release, so the next change is summarised for them. */
export function markViewed(db: Db, user: User, id: string, now: Date) {
  ensurePlaybooks(db, now);
  const current = approved(db, id);
  if (!current) return { ok: true };
  db.prepare(
    "INSERT INTO playbook_views (user_id, snippet_id, number, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, snippet_id) DO UPDATE SET number = excluded.number, at = excluded.at",
  ).run(user.id, id, current.number, now.toISOString());
  return { ok: true };
}

/** "I’ve read this update": a governed acknowledgement of a release, not proof anything was done for a client. */
export function acknowledge(db: Db, user: User, id: string, now: Date) {
  const r = resolveSnippet(db, user, id, now);
  if (!r.permitted || !r.release) throw new HttpError(400, "There’s no current release to acknowledge.");
  db.prepare("INSERT OR IGNORE INTO playbook_acks (user_id, snippet_id, number, at) VALUES (?, ?, ?, ?)").run(user.id, id, r.release.number, now.toISOString());
  return { acked: true };
}

/** Save to (or remove from) the Shift Wallet: a reference to the snippet, never a copy. */
export function toggleSaved(db: Db, user: User, id: string, on: boolean, now: Date) {
  const r = resolveSnippet(db, user, id, now);
  if (!r.permitted) throw new HttpError(403, "This playbook isn’t shared with your role.");
  if (on) db.prepare("INSERT OR IGNORE INTO playbook_saves (user_id, snippet_id, saved_at) VALUES (?, ?, ?)").run(user.id, id, now.toISOString());
  else db.prepare("DELETE FROM playbook_saves WHERE user_id = ? AND snippet_id = ?").run(user.id, id);
  return { saved: on };
}

/** The playbooks a reader may see, for the Resources page: those with an approved release or a fallback, and whether they've saved each. */
export function playbookList(db: Db, user: User, now: Date) {
  ensurePlaybooks(db, now);
  const rows = db.prepare("SELECT * FROM playbook_snippets ORDER BY id").all() as SnippetRow[];
  return {
    playbooks: rows
      .map((row) => {
        const sn = cleanSnippet(JSON.parse(row.data));
        if (!sn.audiences.includes(user.audience as PbAudience)) return null;
        const current = approved(db, row.id);
        if (!current && !row.withdrawn) return null;
        return {
          id: row.id,
          title: sn.title,
          purpose: sn.purpose,
          risk: sn.risk,
          readiness: readiness(sn, Boolean(row.withdrawn), current, today(now)),
          number: current?.number ?? 0,
          saved: Boolean(db.prepare("SELECT 1 FROM playbook_saves WHERE user_id = ? AND snippet_id = ?").get(user.id, row.id)),
        };
      })
      .filter(Boolean),
  };
}

/**
  For Ava Relay's Work guidance (server/relay): the playbooks this reader may see whose approved release is in
  effect today. A withdrawn one, one past review that has fallen back, or one not yet effective is left out, so it
  can't be cited. Each comes with the exact release it would be cited at.
*/
export function playbooksForRelay(db: Db, user: User, now: Date) {
  ensurePlaybooks(db, now);
  const day = today(now);
  return (db.prepare("SELECT * FROM playbook_snippets ORDER BY id").all() as SnippetRow[]).flatMap((row) => {
    const sn = cleanSnippet(JSON.parse(row.data));
    if (!sn.audiences.includes(user.audience as PbAudience)) return [];
    const current = approved(db, row.id);
    const ready = readiness(sn, Boolean(row.withdrawn), current, day);
    if (!current || ready === "fallback" || (current.data.effectiveOn && current.data.effectiveOn > day)) return [];
    return [
      {
        id: row.id,
        title: sn.title,
        purpose: sn.purpose,
        tag: sn.tag,
        ownerTeam: sn.ownerTeam,
        number: current.number,
        effectiveOn: current.data.effectiveOn,
        reviewBy: current.data.reviewBy,
        reviewDue: ready === "review_due",
        steps: current.data.steps.map((st) => ({ id: st.id, text: st.text, why: st.why })),
      },
    ];
  });
}

/** The directory's routes for this reader's role, where one has been entered: for a route answer in Ava Relay. */
export function contactRoutes(db: Db, user: User, now: Date) {
  ensurePlaybooks(db, now);
  return contacts(db)
    .map((c) => ({ label: c.label, route: c.routes[user.audience as PbAudience] ?? "" }))
    .filter((c) => c.route);
}

// ---------------------------------------------------------------------------------------------
// Ask a Lead / Flag a policy gap
// ---------------------------------------------------------------------------------------------

type GapRow = {
  id: string;
  snippet_id: string;
  release_number: number;
  step_id: string;
  issue: Issue;
  question: string;
  author_id: string;
  route: string;
  status: GapStatus;
  note: string;
  created_at: string;
};
type ReplyRow = { id: number; gap_id: string; author_id: string; label: ReplyLabel; body: string; release_number: number; at: string };

function questionsFor(db: Db, user: User, snippetId: string, currentNumber: number) {
  const lead = canAuthor(user);
  const rows = db.prepare("SELECT * FROM playbook_gaps WHERE snippet_id = ? ORDER BY created_at DESC").all(snippetId) as GapRow[];
  return rows
    .filter((g) => (["posted", "answered", "policy_update_pending", "resolved"].includes(g.status) ? true : lead || g.author_id === user.id))
    .map((g) => ({
      id: g.id,
      stepId: g.step_id,
      issue: ISSUES[g.issue] ?? g.issue,
      question: g.question,
      status: g.status,
      mine: g.author_id === user.id,
      releaseNumber: g.release_number,
      note: g.note,
      replies: (db.prepare("SELECT * FROM playbook_gap_replies WHERE gap_id = ? ORDER BY at").all(g.id) as ReplyRow[]).map((r) => ({
        id: r.id,
        label: r.label,
        body: r.body,
        mine: r.author_id === user.id,
        // An answer about an older release may no longer fit the current steps.
        stale: Boolean(currentNumber && r.release_number < currentNumber),
        at: r.at,
      })),
    }));
}

/**
  A question about a step. Urgent: the urgent route and nothing is stored. Possibly identifying: held for privacy
  review, and the asker is told so. Otherwise: posted to this snippet's question thread, and the leads are alerted.
*/
export function askLead(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const r = resolveSnippet(db, user, input.snippetId, now);
  if (!r.permitted) throw new HttpError(403, "This playbook isn’t shared with your role.");
  const question = typeof input.question === "string" ? input.question.trim().slice(0, 800) : "";
  if (question.length < 10) throw new HttpError(400, "Describe your question in general terms.");
  const issue = (Object.keys(ISSUES) as Issue[]).includes(input.issue as Issue) ? (input.issue as Issue) : "unclear";
  const stepId = typeof input.stepId === "string" ? input.stepId.slice(0, 40) : "";
  const gate = gateQuestion(question);
  // An urgent concern is never queued or posted: the reader gets the urgent route now.
  if (gate.urgent || input.urgent === true) return { route: "urgent" as const, fallback: r.fallback, status: null };
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.slice(0, 80) : "";
  return tx(db, () => {
    if (key) {
      const had = db.prepare("SELECT id, status FROM playbook_gaps WHERE author_id = ? AND idem_key = ?").get(user.id, key) as
        { id: string; status: GapStatus } | undefined;
      if (had) return { route: had.status === "awaiting_review" ? ("review" as const) : ("posted" as const), id: had.id, status: had.status, repeated: true };
    }
    const id = `gap-${randomUUID().slice(0, 12)}`;
    const held = gate.identifying.length > 0;
    const status: GapStatus = held ? "awaiting_review" : "posted";
    db.prepare(
      "INSERT INTO playbook_gaps (id, snippet_id, release_number, step_id, issue, question, author_id, route, status, note, idem_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)",
    ).run(
      id,
      r.id,
      r.release?.number ?? 0,
      stepId,
      issue,
      question,
      user.id,
      held ? "moderation" : "community",
      status,
      key || id,
      now.toISOString(),
      now.toISOString(),
    );
    alertLeads(db, r.id, id, held ? `A question about “${r.title}” is waiting for privacy review` : `New question about “${r.title}”`, now);
    return { route: held ? ("review" as const) : ("posted" as const), id, status, held: gate.identifying };
  });
}

function alertLeads(db: Db, snippetId: string, gapId: string, title: string, now: Date) {
  const row = snippetRow(db, snippetId);
  const sn = row ? cleanSnippet(JSON.parse(row.data)) : null;
  const leads = sn?.leads.length ? sn.leads : (db.prepare("SELECT id FROM users WHERE role = 'author'").all() as { id: string }[]).map((u) => u.id);
  for (const u of leads)
    notify(
      db,
      u,
      {
        kind: "action",
        category: "playbook",
        title,
        body: "Open it in Playbooks to review or answer.",
        href: `/admin/playbooks#${gapId}`,
        source: `playbook-gap:${gapId}`,
      },
      now,
    );
}

/** Replying. A lead's reply is a Lead response, anyone else's a Peer suggestion. Only a policy owner (an author) can mark guidance as approved. */
export function replyToGap(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePlaybooks(db, now);
  const g = db.prepare("SELECT * FROM playbook_gaps WHERE id = ?").get(String(input.gapId ?? "")) as GapRow | undefined;
  if (!g) throw new HttpError(404, "That question isn’t here.");
  const r = resolveSnippet(db, user, g.snippet_id, now);
  if (!r.permitted) throw new HttpError(403, "This playbook isn’t shared with your role.");
  const visible = r.questions.some((q) => q.id === g.id);
  if (!visible) throw new HttpError(403, "That question isn’t open to replies.");
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 1200) : "";
  if (body.length < 3) throw new HttpError(400, "Write a reply.");
  if (gateQuestion(body).identifying.length) throw new HttpError(400, "Keep replies general: leave out names, dates and case details.");
  const label: ReplyLabel = input.policy === true ? "policy" : canAuthor(user) ? "lead" : "peer";
  if (label === "policy") requireAuthor(user);
  db.prepare("INSERT INTO playbook_gap_replies (gap_id, author_id, label, body, release_number, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    g.id,
    user.id,
    label,
    body,
    r.release?.number ?? 0,
    now.toISOString(),
  );
  if (label !== "peer" && g.status === "posted")
    db.prepare("UPDATE playbook_gaps SET status = 'answered', updated_at = ? WHERE id = ?").run(now.toISOString(), g.id);
  return resolveSnippet(db, user, g.snippet_id, now);
}

/** The asker closes their own question; a lead approves a held one for posting, declines it, or marks a policy change pending or resolved. */
export function gapAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePlaybooks(db, now);
  const g = db.prepare("SELECT * FROM playbook_gaps WHERE id = ?").get(String(input.gapId ?? "")) as GapRow | undefined;
  if (!g) throw new HttpError(404, "That question isn’t here.");
  const set = (status: GapStatus, note = g.note) =>
    db.prepare("UPDATE playbook_gaps SET status = ?, note = ?, updated_at = ? WHERE id = ?").run(status, note, now.toISOString(), g.id);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) : "";
  switch (input.action) {
    case "close":
      if (g.author_id !== user.id) throw new HttpError(403, "Only the person who asked can close it.");
      set("resolved");
      break;
    case "approve-post":
      requireAuthor(user);
      if (g.status !== "awaiting_review") throw new HttpError(400, "It isn’t waiting for review.");
      set("posted");
      break;
    case "decline":
      requireAuthor(user);
      if (note.length < 3) throw new HttpError(400, "Say briefly why, for the person who asked.");
      set("declined", note);
      break;
    case "policy-pending":
      requireAuthor(user);
      set("policy_update_pending", note);
      break;
    case "resolve":
      requireAuthor(user);
      set("resolved", note);
      break;
    default:
      throw new HttpError(400, "Unknown action.");
  }
  audit(db, { actor: user.id, event: `playbook.gap.${input.action}`, entity: `gap:${g.id}`, at: now });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Owners and authors
// ---------------------------------------------------------------------------------------------

/** Every snippet with its releases, source state and diff, placements, and questions; the source records; the directory. */
export function playbookLibrary(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensurePlaybooks(db, now);
  const dir = contacts(db);
  const guides = db
    .prepare("SELECT g.id, g.title, g.slug, g.status, g.draft, r.doc FROM magazine_guides g LEFT JOIN magazine_revisions r ON r.id = g.revision_id")
    .all() as {
    id: string;
    title: string;
    slug: string;
    status: string;
    draft: string;
    doc: string | null;
  }[];
  const rows = db.prepare("SELECT * FROM playbook_snippets ORDER BY id").all() as SnippetRow[];
  return {
    today: today(now),
    contacts: dir,
    sources: (db.prepare("SELECT doc_id, MAX(version) AS version FROM playbook_sources GROUP BY doc_id").all() as { doc_id: string; version: number }[]).map(
      (x) => ({
        ...sourceDoc(db, x.doc_id)!.doc,
        version: x.version,
      }),
    ),
    snippets: rows.map((row) => {
      const sn = cleanSnippet(JSON.parse(row.data));
      const all = releases(db, row.id);
      const current = all.find((r) => r.status === "approved");
      const working = all.find((r) => r.status === "draft" || r.status === "in_review");
      const needle = `"snippetId":"${row.id}"`;
      return {
        id: row.id,
        data: sn,
        withdrawn: Boolean(row.withdrawn),
        withdrawnReason: row.withdrawn_reason,
        readiness: readiness(sn, Boolean(row.withdrawn), current, today(now)),
        current: current ?? null,
        working: working ?? null,
        problems: working ? releaseProblems(sn, working.data, dir, today(now)) : [],
        source: sourceState(db, sn, working ?? current),
        placements: guides
          .filter((gd) => gd.status !== "archived" && ((gd.doc ?? "").includes(needle) || gd.draft.includes(needle)))
          .map((gd) => ({ id: gd.id, title: gd.title, slug: gd.slug, published: (gd.doc ?? "").includes(needle) })),
        history: all.map((r) => ({ number: r.number, status: r.status, approvedAt: r.approvedAt, summary: r.data.changeSummary })),
        questions: (db.prepare("SELECT * FROM playbook_gaps WHERE snippet_id = ? ORDER BY created_at DESC").all(row.id) as GapRow[]).map((g) => ({
          id: g.id,
          question: g.question,
          stepId: g.step_id,
          issue: ISSUES[g.issue],
          status: g.status,
          releaseNumber: g.release_number,
          replies: (db.prepare("SELECT label, body FROM playbook_gap_replies WHERE gap_id = ? ORDER BY at").all(g.id) as { label: ReplyLabel; body: string }[])
            .length,
        })),
      };
    }),
  };
}

/**
  The owners' actions: save the snippet's settings; save, submit or approve a release (approval needs every check
  to pass); withdraw a snippet at once to its fallback, or restore it; edit a source section (a new source
  version); and edit the contact directory.
*/
export function playbookAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensurePlaybooks(db, now);
  const at = now.toISOString();
  const id = typeof input.id === "string" ? input.id : "";
  const row = id ? snippetRow(db, id) : undefined;
  const need = () => {
    if (!row) throw new HttpError(404, "That playbook isn’t in the library.");
    return row;
  };
  return tx(db, () => {
    switch (input.action) {
      case "save-snippet": {
        const data = cleanSnippet(input.data);
        if (!row) {
          const fresh = typeof input.newId === "string" && /^[a-z0-9-]{3,60}$/.test(input.newId) ? input.newId : `playbook-${randomUUID().slice(0, 8)}`;
          db.prepare("INSERT INTO playbook_snippets (id, data, withdrawn, withdrawn_reason, created_at, updated_at) VALUES (?, ?, 0, '', ?, ?)").run(
            fresh,
            JSON.stringify(data),
            at,
            at,
          );
          return { id: fresh };
        }
        db.prepare("UPDATE playbook_snippets SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), at, row.id);
        audit(db, { actor: actor.id, event: "playbook.snippet_saved", entity: `playbook:${row.id}`, at: now });
        return { id: row.id };
      }
      case "save-release": {
        const r = need();
        const sn = cleanSnippet(JSON.parse(r.data));
        const data = cleanRelease(input.data);
        // Always written against the source section as it is now.
        const src = sourceDoc(db, sn.source.docId);
        const section = src?.doc.sections.find((x) => x.anchor === sn.source.anchor);
        if (!src || !section) throw new HttpError(400, "The snippet’s source section can’t be found. Map it to a section first.");
        const bound = { ...data, sourceVersion: src.version, sourceChecksum: checksum(section.text), sourceText: section.text };
        const all = releases(db, r.id);
        const working = all.find((x) => x.status === "draft" || x.status === "in_review");
        if (working)
          db.prepare("UPDATE playbook_releases SET data = ?, status = 'draft' WHERE snippet_id = ? AND number = ?").run(
            JSON.stringify(bound),
            r.id,
            working.number,
          );
        else
          db.prepare("INSERT INTO playbook_releases (snippet_id, number, status, data, created_by, created_at) VALUES (?, ?, 'draft', ?, ?, ?)").run(
            r.id,
            (all[0]?.number ?? 0) + 1,
            JSON.stringify(bound),
            actor.id,
            at,
          );
        return { id: r.id };
      }
      case "submit": {
        const r = need();
        const working = releases(db, r.id).find((x) => x.status === "draft");
        if (!working) throw new HttpError(400, "There’s no draft to submit.");
        db.prepare("UPDATE playbook_releases SET status = 'in_review' WHERE snippet_id = ? AND number = ?").run(r.id, working.number);
        return { id: r.id };
      }
      case "approve": {
        const r = need();
        const sn = cleanSnippet(JSON.parse(r.data));
        const working = releases(db, r.id).find((x) => x.status === "in_review");
        if (!working) throw new HttpError(400, "Submit the release for review first.");
        const problems = releaseProblems(sn, working.data, contacts(db), today(now));
        const src = sourceState(db, sn, working);
        if (src.state === "unmapped") problems.push("The source section can’t be found. Map it before releasing.");
        if (src.state === "changed") problems.push("The source has changed since this release was written. Update the release from the current source first.");
        if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
        db.prepare("UPDATE playbook_releases SET status = 'superseded' WHERE snippet_id = ? AND status = 'approved'").run(r.id);
        db.prepare("UPDATE playbook_releases SET status = 'approved', approved_by = ?, approved_at = ? WHERE snippet_id = ? AND number = ?").run(
          actor.id,
          at,
          r.id,
          working.number,
        );
        audit(db, {
          actor: actor.id,
          event: "playbook.released",
          entity: `playbook:${r.id}:r${working.number}`,
          next: { approvals: working.data.approvals, sourceVersion: working.data.sourceVersion, checksum: checksum(JSON.stringify(working.data.steps)) },
          at: now,
        });
        return { id: r.id, number: working.number };
      }
      case "withdraw": {
        const r = need();
        const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
        if (reason.length < 3) throw new HttpError(400, "Say briefly why it’s withdrawn.");
        db.prepare("UPDATE playbook_snippets SET withdrawn = 1, withdrawn_reason = ?, updated_at = ? WHERE id = ?").run(reason, at, r.id);
        audit(db, { actor: actor.id, event: "playbook.withdrawn", entity: `playbook:${r.id}`, reason, at: now });
        return { id: r.id };
      }
      case "restore": {
        const r = need();
        db.prepare("UPDATE playbook_snippets SET withdrawn = 0, withdrawn_reason = '', updated_at = ? WHERE id = ?").run(at, r.id);
        audit(db, { actor: actor.id, event: "playbook.restored", entity: `playbook:${r.id}`, at: now });
        return { id: r.id };
      }
      case "save-source": {
        const docId = typeof input.docId === "string" ? input.docId : "";
        const src = sourceDoc(db, docId);
        if (!src) throw new HttpError(404, "That source record isn’t here.");
        const anchor = typeof input.anchor === "string" ? input.anchor : "";
        const text = typeof input.text === "string" ? input.text.slice(0, 6000) : "";
        const sections = src.doc.sections.map((x) => (x.anchor === anchor ? { ...x, text } : x));
        if (!src.doc.sections.some((x) => x.anchor === anchor)) throw new HttpError(404, "That section isn’t in the record.");
        db.prepare("INSERT INTO playbook_sources (doc_id, version, data, at, by_user) VALUES (?, ?, ?, ?, ?)").run(
          docId,
          src.version + 1,
          JSON.stringify({ ...src.doc, sections }),
          at,
          actor.id,
        );
        audit(db, { actor: actor.id, event: "playbook.source_changed", entity: `source:${docId}#${anchor}`, at: now });
        return { docId, version: src.version + 1 };
      }
      case "save-contact": {
        const key = typeof input.key === "string" ? input.key : "";
        const c = contacts(db).find((x) => x.key === key);
        if (!c) throw new HttpError(404, "That contact isn’t in the directory.");
        const raw = (input.routes ?? {}) as Record<string, unknown>;
        const routes = Object.fromEntries(
          (["partner", "coordinator", "staff"] as const).map((a) => [a, typeof raw[a] === "string" ? (raw[a] as string).slice(0, 200) : ""]),
        );
        db.prepare("UPDATE playbook_contacts SET routes = ?, updated_at = ? WHERE key = ?").run(JSON.stringify(routes), at, key);
        audit(db, { actor: actor.id, event: "playbook.contact_changed", entity: `contact:${key}`, at: now });
        return { key };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

/** For course authors: what can be placed. */
export function placeableSnippets(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensurePlaybooks(db, now);
  return (db.prepare("SELECT id, data, withdrawn FROM playbook_snippets ORDER BY id").all() as { id: string; data: string; withdrawn: number }[]).map((r) => ({
    id: r.id,
    title: cleanSnippet(JSON.parse(r.data)).title,
    approved: Boolean(approved(db, r.id)),
    withdrawn: Boolean(r.withdrawn),
  }));
}

/** Checked at publish: a playbook block must point at a snippet with an approved release, not withdrawn. */
export function playbookBlockProblems(db: Db, snippetId: string, now: Date): string[] {
  ensurePlaybooks(db, now);
  const row = snippetRow(db, snippetId);
  if (!row) return [`The playbook “${snippetId}” isn’t in the library.`];
  const sn = cleanSnippet(JSON.parse(row.data));
  if (!approved(db, snippetId)) return [`“${sn.title}” has no approved release yet.`];
  if (row.withdrawn) return [`“${sn.title}” is withdrawn.`];
  return [];
}
