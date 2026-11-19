import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import { createLesson, editorLesson, lessonStatus, saveDraft } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { approvalFor, approvalQueue, decide, publishApproved, submitForReview, withdraw } from "./topicApproval";
import { reviewIssues, reviewPrompt, skipAiReview } from "./topicAiReview";

/*
  A person in the loop: topics go draft → review → (Compliance) → approved → published, and only what
  was approved goes live. That's with the review required (HUB_TOPIC_REVIEW=required); for now it's
  optional, and any author can publish a draft straight away (the last group of tests).
*/

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
  process.env.HUB_TOPIC_REVIEW = "required";
});
afterEach(() => {
  delete process.env.HUB_TOPIC_REVIEW;
});
const u = (id: string) => userById(db, id)!;
const t = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 1, minutes));

/** Jordan (author and Hub owner) writes a new topic. */
function newTopic() {
  const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "Spotting a fall risk" }, t(0));
  return slug;
}
const edit = (slug: string, summary: string, at: Date) => saveDraft(db, u("jordan"), slug, { ...editorLesson(db, slug)!.lesson, summary }, at);
/** Jordan submits it and skips the AI pre-review, so the human review can start (step 3 has its own tests below). */
function submitted(slug: string, input: Parameters<typeof submitForReview>[3], at: Date) {
  submitForReview(db, u("jordan"), slug, input, at);
  return skipAiReview(db, u("jordan"), slug, "", at);
}

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
    submitted(slug, { reviewer: "dana" }, t(1));
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
    submitted(slug, { reviewer: "dana" }, t(1));
    const a = decide(db, u("dana"), slug, { decision: "approve", note: "Accurate." }, t(2));
    expect(a.stage).toBe("approved");
    // Dana can't publish: only the Hub owner (publisher) can.
    expect(() => publishApproved(db, u("dana"), slug, t(3))).toThrow(/Hub owner/);
    const p = publishApproved(db, u("jordan"), slug, t(3), { notes: "First version" });
    expect(p.version).toBe("1.0");
    expect(p.approval.stage).toBe("live");
    expect(p.approval.history.map((h) => h.action)).toEqual(["published", "approved", "ai_skipped", "submitted"]);
  });

  it("sends a draft edited after submission back to the author", () => {
    const slug = newTopic();
    submitted(slug, { reviewer: "dana" }, t(1));
    decide(db, u("dana"), slug, { decision: "approve" }, t(2));
    edit(slug, "A late change nobody reviewed", t(3));
    const a = approvalFor(db, u("jordan"), slug, t(3));
    expect(a).toMatchObject({ stage: "draft", stale: true });
    expect(() => publishApproved(db, u("jordan"), slug, t(4))).toThrow(/edited after it was approved/);
    expect(a.you.canSubmit).toBe(true);
  });
});

describe("the AI pre-review", () => {
  it("comes before the human review: the reviewer waits until it's done or skipped", () => {
    const slug = newTopic();
    const a = submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    expect(a.aiReview).toBeNull();
    expect(a.you.canRunAiReview).toBe(true);
    expect(approvalFor(db, u("dana"), slug, t(2)).you).toMatchObject({ canReview: false, canRunAiReview: true });
    expect(approvalFor(db, u("hamish"), slug, t(2)).you.canRunAiReview).toBe(false);
    expect(() => decide(db, u("dana"), slug, { decision: "approve" }, t(2))).toThrow(/AI pre-review comes first/);
    expect(() => skipAiReview(db, u("hamish"), slug, "", t(2))).toThrow(/Only the author/);

    const skipped = skipAiReview(db, u("jordan"), slug, "Claude isn’t connected here.", t(2));
    expect(skipped.aiReview).toMatchObject({ status: "skipped", summary: "Claude isn’t connected here.", by: "Jordan Lee" });
    expect(skipped.history[0]).toMatchObject({ action: "ai_skipped", label: "AI pre-review skipped" });
    expect(() => skipAiReview(db, u("jordan"), slug, "", t(3))).toThrow(/already done/);
    expect(approvalFor(db, u("dana"), slug, t(3)).you.canReview).toBe(true);
  });

  it("shows Claude's findings with the draft it checked, and starts again when the draft is resubmitted", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    const hash = (db.prepare("SELECT draft_hash FROM topic_approvals WHERE slug = ?").get(slug) as { draft_hash: string }).draft_hash;
    const findings = [{ severity: "fix", card: "intro", cardLabel: "Intro", title: "Rate has no source", detail: "Use the facts library.", suggestion: "Use {{rate}}." }];
    db.prepare("INSERT INTO topic_ai_reviews (slug, draft_hash, status, summary, findings, model, actor, at) VALUES (?, ?, 'done', 'One thing to fix.', ?, 'claude', 'jordan', ?)").run(
      slug,
      hash,
      JSON.stringify(findings),
      t(2).toISOString(),
    );
    expect(approvalFor(db, u("dana"), slug, t(2))).toMatchObject({ aiReview: { status: "done", summary: "One thing to fix.", findings }, you: { canReview: true } });
    decide(db, u("dana"), slug, { decision: "changes", note: "Fix the rate." }, t(3));
    edit(slug, "Fixed", t(4));
    expect(submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(5)).aiReview).toBeNull();
  });

  it("asks Claude to check against the facts library and the topic's cards, and checks its reply", () => {
    const slug = newTopic();
    const lesson = editorLesson(db, slug)!.lesson;
    const prompt = reviewPrompt(lesson, [{ key: "hourly-rate", label: "Hourly rate", value: "$70.00", notes: "", source_title: "Price list", check_by: null }]);
    expect(prompt).toMatch(/\{\{hourly-rate\}\} Hourly rate: \$70\.00 \(source: Price list\)/);
    expect(prompt).toContain(`<card id="${Object.keys(lesson.nodes)[0]}"`);
    const ids = Object.keys(lesson.nodes);
    expect(reviewIssues({ summary: "Fine.", findings: [{ severity: "check", card: ids[0], title: "Tone", detail: "A bit formal." }] }, ids)).toEqual([]);
    const bad = reviewIssues({ findings: [{ severity: "maybe", card: "nope", title: "", detail: "" }] }, ids).join(" ");
    expect(bad).toMatch(/summary/);
    expect(bad).toMatch(/severity must be/);
    expect(bad).toMatch(/isn’t one of the card ids/);
  });
});

describe("compliance-sensitive topics", () => {
  it("need Compliance to approve after the reviewer", () => {
    const slug = newTopic();
    submitted(slug, { reviewer: "hamish", compliance: true }, t(1));
    expect(decide(db, u("hamish"), slug, { decision: "approve" }, t(2)).stage).toBe("compliance");
    expect(() => decide(db, u("dana"), slug, { decision: "approve" }, t(3))).toThrow(/Compliance/);
    expect(() => publishApproved(db, u("jordan"), slug, t(3))).toThrow(/hasn’t been approved/);
    expect(approvalFor(db, u("morgan"), slug, t(3)).you.canApproveCompliance).toBe(true);
    expect(decide(db, u("morgan"), slug, { decision: "approve" }, t(3)).stage).toBe("approved");
    expect(publishApproved(db, u("jordan"), slug, t(4)).approval.history[1].action).toBe("compliance_approved");
  });

  it("can be flagged by the reviewer when the author didn't", () => {
    const slug = newTopic();
    submitted(slug, { reviewer: "dana" }, t(1));
    expect(decide(db, u("dana"), slug, { decision: "approve", compliance: true }, t(2)).stage).toBe("compliance");
  });
});

describe("the Approvals page", () => {
  it("shows each person what's waiting on them", () => {
    const slug = newTopic();
    expect(approvalQueue(db, u("jordan"), t(1)).drafts.map((d) => d.slug)).toContain(slug);
    submitted(slug, { reviewer: "dana", compliance: true }, t(1));
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

describe("while the review is optional", () => {
  beforeEach(() => {
    delete process.env.HUB_TOPIC_REVIEW;
  });

  it("lets any author publish a draft straight away", () => {
    const slug = newTopic();
    const a = approvalFor(db, u("dana"), slug, t(1));
    expect(a).toMatchObject({ stage: "draft", reviewRequired: false, you: { canPublish: true, canSubmit: true } });
    // Dana is a reviewer, not the Hub owner, and can still publish.
    const p = publishApproved(db, u("dana"), slug, t(2), { notes: "First version" });
    expect(p.version).toBe("1.0");
    expect(p.approval.stage).toBe("live");
    expect(p.approval.you.canPublish).toBe(false);
    expect(p.approval.history.map((h) => h.action)).toEqual(["published"]);
    expect(() => publishApproved(db, u("dana"), slug, t(3))).toThrow(/no saved changes/);
  });

  it("publishes a draft that's with a reviewer, and closes the submission", () => {
    const slug = newTopic();
    submitForReview(db, u("jordan"), slug, { reviewer: "dana" }, t(1));
    edit(slug, "A change after submitting", t(2));
    const p = publishApproved(db, u("jordan"), slug, t(3));
    expect(p.approval).toMatchObject({ stage: "live", submission: null });
    expect(editorLesson(db, slug)!.lesson.summary).toBe("A change after submitting");
    expect(approvalQueue(db, u("dana"), t(3)).yours).toEqual([]);
  });

  it("still keeps learners from publishing", () => {
    const slug = newTopic();
    expect(() => publishApproved(db, u("sam"), slug, t(1))).toThrow(/authors/);
    expect(lessonStatus(db, slug).state).toBe("unpublished");
  });
});
