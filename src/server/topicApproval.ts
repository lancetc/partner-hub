import "server-only";
import { createHash } from "node:crypto";
import { lessons } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, userById, type User } from "./auth";
import { editorLesson, lessonStatus, publishLesson } from "./authoredLessons";
import { daysUntil, statusOf } from "./contentReview";
import { openReports } from "./contentReports";

/*
  How a topic gets from draft to learners, with a person in the loop:

  1. Draft: an author writes the topic in the editor.
  2. Submit for review: the author picks an internal subject-matter expert (SME) or designated reviewer,
     and says whether the topic is compliance-sensitive.
  3. AI pre-review: not set up yet. When it is, it runs here, before the person reviews.
  4. Human review: the reviewer reads the draft, comments on its cards, then approves it or asks for changes.
  5. Approve: compliance-sensitive topics also need Compliance (or the policy owner) to approve.
  6. Publish: the Hub owner (anyone with the publisher role) makes the approved draft live.
  7. Monitor and refresh: review dates, learner reports and, later, policy changes and community
     discussions show when a live topic needs another look.

  An approval is for the exact draft that was submitted: if the draft is edited after that, it has to be
  submitted again, so what's published is always what was reviewed.
*/

export type ReviewRole = "sme" | "compliance" | "publisher";
export type Stage = "draft" | "review" | "changes" | "compliance" | "approved" | "live";
export type ApprovalAction = "submitted" | "changes_requested" | "approved" | "compliance_approved" | "published" | "withdrawn";

type Row = {
  slug: string;
  stage: "review" | "changes" | "compliance" | "approved";
  draft_hash: string;
  reviewer_id: string;
  compliance: number;
  submitted_by: string;
  submitted_at: string;
  note: string;
  updated_at: string;
};
type EventRow = { id: number; slug: string; action: ApprovalAction; actor: string; note: string; version: string | null; at: string; name: string | null };
type StaffRow = { id: string; name: string; review_role: ReviewRole | null; review_area: string | null };

export const MAX_APPROVAL_NOTE = 2000;

const roleOf = (db: Db, id: string) => (db.prepare("SELECT review_role FROM users WHERE id = ?").get(id) as { review_role: ReviewRole | null } | undefined)?.review_role ?? null;
export const canPublishTopics = (db: Db, u: User) => roleOf(db, u.id) === "publisher";
const isCompliance = (db: Db, u: User) => roleOf(db, u.id) === "compliance";

/** The saved draft as text, and a short fingerprint of it. Null when the topic has no saved draft (a content-file topic never edited). */
function savedDraft(db: Db, slug: string) {
  const r = db.prepare("SELECT draft FROM authored_lessons WHERE slug = ? AND deleted_at IS NULL").get(slug) as { draft: string } | undefined;
  return r ? createHash("sha1").update(r.draft).digest("hex").slice(0, 16) : null;
}

const rowOf = (db: Db, slug: string) => db.prepare("SELECT * FROM topic_approvals WHERE slug = ?").get(slug) as Row | undefined;

function record(db: Db, slug: string, action: ApprovalAction, actor: User, now: Date, extra: { note?: string; version?: string } = {}) {
  db.prepare("INSERT INTO topic_approval_events (slug, action, actor, note, version, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    slug,
    action,
    actor.id,
    extra.note ?? "",
    extra.version ?? null,
    now.toISOString(),
  );
  audit(db, { actor: actor.id, event: `topic.${action}`, entity: `lesson:${slug}`, next: extra.note ? { note: extra.note } : undefined, at: now });
}

function cleanNote(note: unknown, { required }: { required: string | null }) {
  const text = String(note ?? "").trim();
  if (required && text.length < 2) throw new HttpError(400, required);
  if (text.length > MAX_APPROVAL_NOTE) throw new HttpError(400, `Keep it to ${MAX_APPROVAL_NOTE} characters.`);
  return text;
}

/**
  Where a topic stands. A submission whose draft has been edited since counts as a draft again
  (`stale`), unless changes were asked for, when editing is exactly what's expected.
*/
function stageOf(db: Db, slug: string) {
  const status = lessonStatus(db, slug);
  const hash = savedDraft(db, slug);
  const r = rowOf(db, slug);
  if (status.state === "live" || !hash) return { stage: "live" as Stage, row: undefined, stale: false, hash };
  if (!r) return { stage: "draft" as Stage, row: undefined, stale: false, hash };
  const stale = r.draft_hash !== hash;
  if (stale && r.stage !== "changes") return { stage: "draft" as Stage, row: r, stale, hash };
  return { stage: r.stage as Stage, row: r, stale, hash };
}

function requireTopic(db: Db, slug: string) {
  const found = editorLesson(db, slug);
  if (!found) throw new HttpError(404, "Topic not found.");
  return found.lesson;
}

/** People an author can ask to review: Trilogy staff with a role in the approval process, other than themselves. */
export function reviewersFor(db: Db, actor: User) {
  return (db.prepare("SELECT id, name, review_role, review_area FROM users WHERE review_role IS NOT NULL AND id != ? ORDER BY review_role = 'sme' DESC, name").all(actor.id) as StaffRow[]).map(
    (u) => ({ id: u.id, name: u.name, role: u.review_role!, area: u.review_area ?? "" }),
  );
}

/** Step 2: the author sends the saved draft to a reviewer. Resubmitting after changes starts the review again. */
export function submitForReview(db: Db, actor: User, slug: string, input: { reviewer?: unknown; compliance?: unknown; note?: unknown }, now: Date) {
  requireAuthor(actor);
  requireTopic(db, slug);
  const { stage, hash } = stageOf(db, slug);
  if (stage === "live" || !hash) throw new HttpError(409, "There are no saved changes to review. Edit the topic first.");
  if (stage === "review" || stage === "compliance") throw new HttpError(409, "This topic is already with a reviewer.");
  if (stage === "approved") throw new HttpError(409, "This topic is already approved. Publish it, or edit it to start again.");
  const reviewer = userById(db, String(input.reviewer ?? ""));
  if (!reviewer || !roleOf(db, reviewer.id)) throw new HttpError(400, "Choose a reviewer from the list.");
  if (reviewer.id === actor.id) throw new HttpError(400, "Choose someone else to review it. Authors can’t approve their own topics.");
  const note = cleanNote(input.note, { required: null });
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO topic_approvals (slug, stage, draft_hash, reviewer_id, compliance, submitted_by, submitted_at, note, updated_at)
     VALUES (?, 'review', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (slug) DO UPDATE SET stage = 'review', draft_hash = excluded.draft_hash, reviewer_id = excluded.reviewer_id,
       compliance = excluded.compliance, submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(slug, hash, reviewer.id, input.compliance ? 1 : 0, actor.id, at, note, at);
  record(db, slug, "submitted", actor, now, { note: note || `Sent to ${reviewer.name} for review${input.compliance ? ", then Compliance" : ""}.` });
  return approvalFor(db, actor, slug, now);
}

/**
  Steps 4 and 5: the assigned reviewer (or, at the Compliance stage, Compliance) approves the draft
  or asks for changes. Asking for changes needs a note saying what to change.
*/
export function decide(db: Db, actor: User, slug: string, input: { decision?: unknown; note?: unknown; compliance?: unknown }, now: Date) {
  requireTopic(db, slug);
  const { stage, row, stale } = stageOf(db, slug);
  if (!row || (stage !== "review" && stage !== "compliance")) throw new HttpError(409, "This topic isn’t waiting for a review.");
  if (stale) throw new HttpError(409, "The topic was edited after it was submitted. Ask the author to submit it again.");
  if (stage === "review" && row.reviewer_id !== actor.id) throw new HttpError(403, "Only the assigned reviewer can approve this topic.");
  if (stage === "compliance" && !isCompliance(db, actor)) throw new HttpError(403, "This topic is waiting for Compliance to approve it.");
  if (row.submitted_by === actor.id) throw new HttpError(403, "Authors can’t approve their own topics.");
  const decision = input.decision === "approve" ? "approve" : input.decision === "changes" ? "changes" : null;
  if (!decision) throw new HttpError(400, "Approve the topic or ask for changes.");
  const note = cleanNote(input.note, { required: decision === "changes" ? "Say what needs to change, so the author knows what to do." : null });
  const at = now.toISOString();
  if (decision === "changes") {
    db.prepare("UPDATE topic_approvals SET stage = 'changes', updated_at = ? WHERE slug = ?").run(at, slug);
    record(db, slug, "changes_requested", actor, now, { note });
  } else if (stage === "review") {
    // The reviewer can add the Compliance step if the author didn't, but not take it away.
    const compliance = row.compliance === 1 || Boolean(input.compliance);
    db.prepare("UPDATE topic_approvals SET stage = ?, compliance = ?, updated_at = ? WHERE slug = ?").run(compliance ? "compliance" : "approved", compliance ? 1 : 0, at, slug);
    record(db, slug, "approved", actor, now, { note });
  } else {
    db.prepare("UPDATE topic_approvals SET stage = 'approved', updated_at = ? WHERE slug = ?").run(at, slug);
    record(db, slug, "compliance_approved", actor, now, { note });
  }
  return approvalFor(db, actor, slug, now);
}

/** The author takes a submitted topic back, to keep working on it. */
export function withdraw(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  requireTopic(db, slug);
  const row = rowOf(db, slug);
  if (!row) throw new HttpError(409, "This topic hasn’t been submitted.");
  if (row.submitted_by !== actor.id && !canPublishTopics(db, actor)) throw new HttpError(403, "Only the author who submitted it, or the Hub owner, can withdraw it.");
  db.prepare("DELETE FROM topic_approvals WHERE slug = ?").run(slug);
  record(db, slug, "withdrawn", actor, now);
  return approvalFor(db, actor, slug, now);
}

/** Step 6: the Hub owner publishes the approved draft. Only the exact draft that was approved can go live. */
export function publishApproved(db: Db, actor: User, slug: string, now: Date, opts: { notes?: string; kind?: "minor" | "important" } = {}) {
  requireAuthor(actor);
  requireTopic(db, slug);
  if (!canPublishTopics(db, actor)) throw new HttpError(403, "Only the Hub owner or an authorised publisher can publish topics.");
  const { stage, stale } = stageOf(db, slug);
  if (stale) throw new HttpError(409, "The topic was edited after it was approved. Submit it for review again.");
  if (stage !== "approved") {
    const why =
      stage === "review"
        ? "It’s still with the reviewer."
        : stage === "compliance"
          ? "It’s waiting for Compliance to approve it."
          : stage === "changes"
            ? "The reviewer asked for changes."
            : "Submit it for review first.";
    throw new HttpError(409, `This topic hasn’t been approved yet. ${why}`);
  }
  const result = publishLesson(db, actor, slug, now, opts);
  db.prepare("DELETE FROM topic_approvals WHERE slug = ?").run(slug);
  record(db, slug, "published", actor, now, { note: opts.notes?.trim() ?? "", version: result.version });
  return { ...result, approval: approvalFor(db, actor, slug, now) };
}

/** When a draft is discarded or the topic deleted, any submission for it goes too (its history stays on record). */
export function clearApproval(db: Db, slug: string) {
  db.prepare("DELETE FROM topic_approvals WHERE slug = ?").run(slug);
}

const ACTION_LABEL: Record<ApprovalAction, string> = {
  submitted: "Submitted for review",
  changes_requested: "Asked for changes",
  approved: "Approved",
  compliance_approved: "Approved by Compliance",
  published: "Published",
  withdrawn: "Withdrawn by the author",
};

function history(db: Db, slug: string) {
  return (
    db
      .prepare("SELECT e.*, u.name FROM topic_approval_events e LEFT JOIN users u ON u.id = e.actor WHERE e.slug = ? ORDER BY e.at DESC, e.id DESC LIMIT 40")
      .all(slug) as EventRow[]
  ).map((e) => ({ id: e.id, action: e.action, label: ACTION_LABEL[e.action] ?? e.action, by: e.name ?? "Someone", note: e.note, version: e.version, at: e.at }));
}

/** Step 7: what says a live topic may need another look. Policy changes and community discussions aren't connected yet. */
function monitor(db: Db, slug: string, now: Date) {
  const live = lessons.find((l) => l.slug === slug);
  const reviewDate = live?.reviewDate ?? null;
  const days = reviewDate ? daysUntil(reviewDate, now) : null;
  return {
    reviewDate,
    reviewStatus: days === null ? null : statusOf(days),
    reviewDays: days,
    owner: live?.owner ?? null,
    openReports: openReports(db).filter((r) => r.slug === slug).length,
  };
}

/** Everything the editor's approval panel needs, including what the signed-in person can do now. */
export function approvalFor(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  requireTopic(db, slug);
  const { stage, row, stale } = stageOf(db, slug);
  const name = (id: string) => userById(db, id)?.name ?? "Someone";
  const reviewer = row && (db.prepare("SELECT id, name, review_role, review_area FROM users WHERE id = ?").get(row.reviewer_id) as StaffRow | undefined);
  const publisher = canPublishTopics(db, actor);
  const status = lessonStatus(db, slug);
  return {
    stage,
    stale,
    state: status.state,
    version: status.version,
    submission: row
      ? {
          by: name(row.submitted_by),
          byYou: row.submitted_by === actor.id,
          at: row.submitted_at,
          note: row.note,
          reviewer: reviewer ? { id: reviewer.id, name: reviewer.name, area: reviewer.review_area ?? "" } : null,
          compliance: row.compliance === 1,
        }
      : null,
    you: {
      reviewRole: roleOf(db, actor.id),
      canSubmit: stage === "draft" || stage === "changes",
      canReview: stage === "review" && row?.reviewer_id === actor.id && row.submitted_by !== actor.id,
      canApproveCompliance: stage === "compliance" && isCompliance(db, actor) && row?.submitted_by !== actor.id,
      canPublish: stage === "approved" && publisher,
      canWithdraw: Boolean(row) && stage !== "live" && (row?.submitted_by === actor.id || publisher),
    },
    reviewers: reviewersFor(db, actor),
    publishers: (db.prepare("SELECT name FROM users WHERE review_role = 'publisher' ORDER BY name").all() as { name: string }[]).map((u) => u.name),
    history: history(db, slug),
    monitor: monitor(db, slug, now),
  };
}

/**
  The Approvals page: topics waiting on the signed-in person (to review, approve for Compliance or
  publish), every topic on its way through, and live topics that are due a refresh.
*/
export function approvalQueue(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const role = roleOf(db, actor.id);
  const rows = db.prepare("SELECT * FROM topic_approvals ORDER BY updated_at DESC").all() as Row[];
  const topics = rows.flatMap((r) => {
    const found = editorLesson(db, r.slug);
    if (!found) return [];
    const { stage, stale } = stageOf(db, r.slug);
    if (stage === "live") return [];
    const last = history(db, r.slug)[0];
    const yours =
      (stage === "review" && r.reviewer_id === actor.id) ||
      (stage === "compliance" && role === "compliance") ||
      (stage === "approved" && role === "publisher") ||
      ((stage === "changes" || stale) && r.submitted_by === actor.id);
    return [
      {
        slug: r.slug,
        title: found.lesson.title,
        stage,
        stale,
        yours,
        submittedBy: userById(db, r.submitted_by)?.name ?? "Someone",
        submittedAt: r.submitted_at,
        reviewer: userById(db, r.reviewer_id)?.name ?? "Someone",
        compliance: r.compliance === 1,
        updatedAt: r.updated_at,
        last: last ? { label: last.label, by: last.by, note: last.note, at: last.at } : null,
      },
    ];
  });
  // Drafts with saved changes that nobody has submitted yet.
  const submitted = new Set(rows.map((r) => r.slug));
  const drafts = (db.prepare("SELECT slug, updated_at, updated_by FROM authored_lessons WHERE deleted_at IS NULL AND (published IS NULL OR draft != published) ORDER BY updated_at DESC").all() as {
    slug: string;
    updated_at: string;
    updated_by: string;
  }[])
    .filter((d) => !submitted.has(d.slug))
    .flatMap((d) => {
      const found = editorLesson(db, d.slug);
      return found ? [{ slug: d.slug, title: found.lesson.title, updatedAt: d.updated_at, by: userById(db, d.updated_by)?.name ?? "Someone", live: found.status.state === "changes" }] : [];
    });
  const reports = openReports(db);
  const refresh = lessons
    .filter((l) => l.track !== "reinforcement")
    .map((l) => {
      const days = l.reviewDate ? daysUntil(l.reviewDate, now) : null;
      return {
        slug: l.slug,
        title: l.title,
        reviewDate: l.reviewDate ?? null,
        days,
        status: days === null ? null : statusOf(days),
        reports: reports.filter((r) => r.slug === l.slug).length,
      };
    })
    .filter((t) => t.status === "overdue" || t.status === "due" || t.reports > 0)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  return { role, yours: topics.filter((t) => t.yours), inProgress: topics, drafts, refresh };
}
