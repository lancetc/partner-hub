import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import { createLesson, editorLesson, lessonStatus, saveDraft } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { approvalFor, approvalQueue, decide, publishApproved, submitForReview, withdraw } from "./topicApproval";

/* A person in the loop: topics go draft → review → (Compliance) → approved → published, and only what was approved goes live. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const t = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 1, minutes));

/** Jordan (author and Hub owner) writes a new topic. */
function newTopic() {
  const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "Spotting a fall risk" }, t(0));
  return slug;
}
const edit = (slug: string, summary: string, at: Date) => saveDraft(db, u("jordan"), slug, { ...editorLesson(db, slug)!.lesson, summary }, at);

describe("submitting a topic for review", () => {
  it("starts as a draft, and the author picks a reviewer other than themselves", () => {
    const slug = newTopic();
    const a = approvalFor(db, u("jordan"), slug, t(1));
    expect(a.stage).toBe("draft");
    expect(a.you.canSubmit).toBe(true);
    expect(a.reviewers.map((r) => r.id)).not.toContain("jordan");
    expect(a.reviewers[0]).toMatchObject({ role: "sme" });
    expect(() => submitForReview(db, u("jordan"), slug, { reviewer: "jordan" }, t(1))).toThrow(/someone else/);
    expect(() => submitForReview(db, u("jordan"), slug, { reviewer: "sam" }, t(1))).toThrow(/Choose a reviewer/);

    const s = submitForReview(db, u("jordan"), slug, { reviewer: "dana", note: "Check the falls advice" }, t(1));
    expect(s.stage).toBe("review");
    expect(s.submission).toMatchObject({ by: "Jordan Lee", reviewer: { name: "Dana Okafor", area: "Clinical" }, compliance: false });
    expect(() => submitForReview(db, u("jordan"), slug, { reviewer: "hamish" }, t(2))).toThrow(/already with a reviewer/);
  });

  it("can't publish before it's approved, even by the Hub owner", () => {
    const slug = newTopic();
    expect(() => publishApproved(db, u("jordan"), slug, t(1))).toThrow(/hasn’t been approved/);
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    expect(() => publishApproved(db, u("jordan"), slug, t(2))).toThrow(/hasn’t been approved/);
    expect(lessonStatus(db, slug).state).toBe("unpublished");
  });

  it("has nothing to submit when the topic is live with no changes", () => {
    expect(approvalFor(db, u("jordan"), "a-little-extra-time", t(0)).stage).toBe("live");
    expect(() => submitForReview(db, u("jordan"), "a-little-extra-time", { reviewer: "dana" }, t(0))).toThrow(/no saved changes/);
  });
});

describe("the human review", () => {
  it("lets only the assigned reviewer decide, and asking for changes needs a note", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    expect(approvalFor(db, u("dana"), slug, t(2)).you.canReview).toBe(true);
    expect(approvalFor(db, u("hamish"), slug, t(2)).you.canReview).toBe(false);
    expect(() => decide(db, u("hamish"), slug, { decision: "approve" }, t(2))).toThrow(/assigned reviewer/);
    expect(() => decide(db, u("dana"), slug, { decision: "changes" }, t(2))).toThrow(/what needs to change/);

    const c = decide(db, u("dana"), slug, { decision: "changes", note: "The second scenario needs a safer option." }, t(2));
    expect(c.stage).toBe("changes");
    expect(c.history[0]).toMatchObject({ action: "changes_requested", by: "Dana Okafor", note: "The second scenario needs a safer option." });
    // The author fixes it and sends it back; the review starts again.
    edit(slug, "Updated after review", t(3));
    expect(approvalFor(db, u("jordan"), slug, t(3)).stage).toBe("changes");
    expect(submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(4)).stage).toBe("review");
  });

  it("publishes exactly what was approved, then goes live", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    const a = decide(db, u("dana"), slug, { decision: "approve", note: "Accurate." }, t(2));
    expect(a.stage).toBe("approved");
    // Dana can't publish: only the Hub owner (publisher) can.
    expect(() => publishApproved(db, u("dana"), slug, t(3))).toThrow(/Hub owner/);
    const p = publishApproved(db, u("jordan"), slug, t(3), { notes: "First version" });
    expect(p.version).toBe("1.0");
    expect(p.approval.stage).toBe("live");
    expect(p.approval.history.map((h) => h.action)).toEqual(["published", "approved", "submitted"]);
  });

  it("sends a draft edited after submission back to the author", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    decide(db, u("dana"), slug, { decision: "approve" }, t(2));
    edit(slug, "A late change nobody reviewed", t(3));
    const a = approvalFor(db, u("jordan"), slug, t(3));
    expect(a).toMatchObject({ stage: "draft", stale: true });
    expect(() => publishApproved(db, u("jordan"), slug, t(4))).toThrow(/edited after it was approved/);
    expect(a.you.canSubmit).toBe(true);
  });
});

describe("compliance-sensitive topics", () => {
  it("need Compliance to approve after the reviewer", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "hamish", compliance: true }, t(1));
    expect(decide(db, u("hamish"), slug, { decision: "approve" }, t(2)).stage).toBe("compliance");
    expect(() => decide(db, u("dana"), slug, { decision: "approve" }, t(3))).toThrow(/Compliance/);
    expect(() => publishApproved(db, u("jordan"), slug, t(3))).toThrow(/hasn’t been approved/);
    expect(approvalFor(db, u("morgan"), slug, t(3)).you.canApproveCompliance).toBe(true);
    expect(decide(db, u("morgan"), slug, { decision: "approve" }, t(3)).stage).toBe("approved");
    expect(publishApproved(db, u("jordan"), slug, t(4)).approval.history[1].action).toBe("compliance_approved");
  });

  it("can be flagged by the reviewer when the author didn't", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    expect(decide(db, u("dana"), slug, { decision: "approve", compliance: true }, t(2)).stage).toBe("compliance");
  });
});

describe("the Approvals page", () => {
  it("shows each person what's waiting on them", () => {
    const slug = newTopic();
    expect(approvalQueue(db, u("jordan"), t(1)).drafts.map((d) => d.slug)).toContain(slug);
    submitForReview(db, u("jordan"), slug, { reviewer: "dana", compliance: true }, t(1));
    expect(approvalQueue(db, u("dana"), t(1)).yours.map((x) => x.slug)).toEqual([slug]);
    expect(approvalQueue(db, u("morgan"), t(1)).yours).toEqual([]);
    decide(db, u("dana"), slug, { decision: "approve" }, t(2));
    expect(approvalQueue(db, u("dana"), t(2)).yours).toEqual([]);
    expect(approvalQueue(db, u("morgan"), t(2)).yours.map((x) => x.stage)).toEqual(["compliance"]);
    decide(db, u("morgan"), slug, { decision: "approve" }, t(3));
    expect(approvalQueue(db, u("jordan"), t(3)).yours.map((x) => x.stage)).toEqual(["approved"]);
  });

  it("lets the author withdraw a submission", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    expect(() => withdraw(db, u("dana"), slug, t(2))).toThrow(/Only the author/);
    expect(withdraw(db, u("jordan"), slug, t(2)).stage).toBe("draft");
  });
});
