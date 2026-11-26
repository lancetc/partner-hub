import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { editorLesson, saveDraft } from "./authoredLessons";
import { addReviewer, allReviewComments, deleteReviewComment, postReviewComment, resolveReviewComment, reviewComments, reviewerById } from "./reviews";

/* Review comments: named reviewers, signed in to the hub, commenting on a topic's cards. There are no review links. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-28T02:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);
const slug = "legislative-framework";

function linkAndJoin(name = "Dr Pat Lee", email = "pat@example.org") {
  const { id } = addReviewer(db, { name, email }, now);
  return { who: reviewerById(db, id)! };
}

describe("reviewers", () => {
  it("asks reviewers for a name and a real-looking email", () => {
    expect(() => addReviewer(db, { name: "", email: "pat@example.org" }, now)).toThrow(/name/);
    expect(() => addReviewer(db, { name: "Pat", email: "not an email" }, now)).toThrow(/email/);
    expect(addReviewer(db, { name: "  Pat   Lee ", email: "PAT@Example.org" }, now).name).toBe("Pat Lee");
  });

  it("needs only a name when commenting straight on a topic, but still checks an email that's given", () => {
    expect(() => addReviewer(db, { name: "P" }, now, { emailOptional: true })).toThrow(/name/);
    expect(() => addReviewer(db, { name: "Pat", email: "nope" }, now, { emailOptional: true })).toThrow(/email/);
    const { id } = addReviewer(db, { name: "Pat" }, now, { emailOptional: true });
    expect(reviewerById(db, id)).toEqual({ kind: "reviewer", id, name: "Pat" });
  });
});

describe("review comments", () => {
  it("threads comments on a card, with replies, and shows emails to authors only", () => {
    const { who } = linkAndJoin();
    const first = postReviewComment(db, who, slug, { card: "kit", text: "The second bullet needs the 2026 date." }, now).comments[0];
    expect(first).toMatchObject({ card: "kit", parent: null, mine: true, by: { name: "Dr Pat Lee", role: "Reviewer" }, changed: false, resolved: null });
    expect(first.by.email).toBeUndefined();

    const asAuthor = { kind: "author" as const, user: u("jordan") };
    const reply = postReviewComment(db, asAuthor, slug, { card: "ignored", text: "Fixed, thanks.", parent: first.id }, later(5)).comments[1];
    // A reply goes on the thread's card, whatever card was sent.
    expect(reply).toMatchObject({ parent: first.id, card: "kit", by: { role: "Author" } });
    // A reply to a reply joins the same thread.
    const nested = postReviewComment(db, who, slug, { text: "Great.", parent: reply.id }, later(6)).comments[2];
    expect(nested.parent).toBe(first.id);

    const seen = reviewComments(db, asAuthor, slug);
    expect(seen.canResolve).toBe(true);
    expect(seen.comments[0].by.email).toBe("pat@example.org");
    expect(reviewComments(db, who, slug).canResolve).toBe(false);
  });

  it("refuses cards that aren't in the lesson, empty or very long comments", () => {
    const { who } = linkAndJoin();
    expect(() => postReviewComment(db, who, slug, { card: "no-such-card", text: "Hello there" }, now)).toThrow(/isn’t in the topic/);
    expect(() => postReviewComment(db, who, slug, { card: "kit", text: " " }, now)).toThrow(/Write/);
    expect(() => postReviewComment(db, who, slug, { card: "kit", text: "x".repeat(2001) }, now)).toThrow(/2000/);
  });

  it("lets people delete only their own; deleting a first comment removes its thread", () => {
    const { who } = linkAndJoin();
    const other = linkAndJoin("Sam Reviewer", "sam@example.org").who;
    const c = postReviewComment(db, who, slug, { card: "kit", text: "Typo in the heading." }, now).comments[0];
    postReviewComment(db, other, slug, { text: "Agree.", parent: c.id }, later(1));
    expect(() => deleteReviewComment(db, other, slug, c.id, later(2))).toThrow(/your own/);
    expect(deleteReviewComment(db, who, slug, c.id, later(2)).comments).toEqual([]);
  });

  it("authors resolve and reopen threads; reviewers can't", () => {
    const { who } = linkAndJoin();
    const c = postReviewComment(db, who, slug, { card: "kit", text: "Typo in the heading." }, now).comments[0];
    expect(() => resolveReviewComment(db, u("sam"), slug, c.id, true, now)).toThrow(/authors/);
    const done = resolveReviewComment(db, u("jordan"), slug, c.id, true, later(1)).comments[0];
    expect(done.resolved).toMatchObject({ by: "Lance Elliott" });
    expect(resolveReviewComment(db, u("jordan"), slug, c.id, false, later(2)).comments[0].resolved).toBeNull();
  });

  it("flags a comment when its card has been edited or removed since", () => {
    const { who } = linkAndJoin();
    postReviewComment(db, who, slug, { card: "kit", text: "Heading is unclear." }, now);
    const draft = editorLesson(db, slug)!.lesson;
    draft.nodes.kit.heading = "A clearer heading";
    saveDraft(db, u("jordan"), slug, draft, later(1));
    expect(reviewComments(db, who, slug).comments[0]).toMatchObject({ changed: true, cardGone: false });
  });

  it("limits how many comments someone can post in an hour", () => {
    const { who } = linkAndJoin();
    for (let i = 0; i < 40; i++) postReviewComment(db, who, slug, { card: "kit", text: `Comment ${i}` }, later(i));
    expect(() => postReviewComment(db, who, slug, { card: "kit", text: "One more" }, later(41))).toThrow(/a lot of comments/);
  });
});

describe("all review comments", () => {
  it("lists topics with comments, latest first, counts open threads, and is for authors only", () => {
    const { who } = linkAndJoin();
    const a = postReviewComment(db, who, slug, { card: "kit", text: "First topic, first comment." }, now).comments[0];
    postReviewComment(db, who, slug, { text: "A reply.", parent: a.id }, later(1));
    postReviewComment(db, who, slug, { card: "kit", text: "First topic, second comment." }, later(2));
    resolveReviewComment(db, u("jordan"), slug, a.id, true, later(3));
    const all = allReviewComments(db, u("jordan"));
    expect(all.topics.map((t) => t.slug)).toEqual([slug]);
    expect(all.topics[0].comments).toHaveLength(3);
    expect(all.topics[0].comments[0].by.email).toBe("pat@example.org");
    expect(all.open).toBe(1);
    expect(() => allReviewComments(db, u("sam"))).toThrow();
  });
});
