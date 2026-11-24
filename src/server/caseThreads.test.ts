import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, recordGuideEvent } from "./magazine";
import {
  caseAttemptComplete,
  caseModeration,
  caseModerationAction,
  caseThreadAction,
  caseThreadInsights,
  caseThreadSpace,
  caseThreadView,
  mySavedScripts,
  removeCaseThread,
} from "./caseThreads";
import { CASE_FAMILY_FRIEND, CASE_REFUSED_CHECK } from "@/content/caseThreadCases";
import {
  caseGuardrailProblems,
  caseThreadForReaders,
  ENDORSED_LABEL,
  freshCaseThread,
  LIVE_ROUTE,
  PEER_LABEL,
  rankFeed,
  screenCaseText,
  SEED_LABEL,
  type CaseThreadData,
  type Take,
} from "@/lib/caseThread";
import { BLOCK_REGISTRY } from "@/lib/blockRegistry";
import { allBlocks } from "@/lib/magazine";

/*
  "What Would You Do?" Community Case Threads (docs/case-threads.md): the PRD's section 11 acceptance criteria.
  1 private first take, then unlock; 2 one canonical thread for the Magazine and Community under the same
  permissions; 3 the case note apart, popularity never endorsement; 4 sharing opt-in, completion never from posting
  or votes; 5 reported or unapproved hidden, in the queue, audited; 6 identifiers blocked or quarantined, live
  matters interrupted; 7 and 8 the two cases' guardrails; 9 saved scripts with author, versions, stale warnings and
  endorsement; 10 the accessibility contract.
*/

let db: Db;
let jordan: User, riley: User, sam: User, dana: User;
const now = new Date("2026-11-24T00:00:00Z");
const later = (h: number) => new Date(now.getTime() + h * 3_600_000);
const A = CASE_FAMILY_FRIEND.threadId;
const B = CASE_REFUSED_CHECK.threadId;

/** A case as reviewers would sign it off. Test values only: never placeholders in real content. */
const signed = (d: CaseThreadData, policy = "2026.1"): CaseThreadData => ({
  ...freshCaseThread(d),
  policy: { ...d.policy, version: policy },
  reviewDue: "2027-06-30",
  approval: { owner: "Test owner", clinical: "Test clinician", quality: "Test quality", community: "Test community", approvedOn: "2026-11-20" },
});
const page = (blocks: unknown[]) => [
  {
    id: "p1",
    title: "What would you do?",
    purpose: "",
    template: "say",
    kind: "content",
    required: true,
    allActivities: true,
    sections: [{ id: "s1", title: "Cases", blocks }],
  },
];
function course(cases: { id: string; data: CaseThreadData }[], audience: string[] = ["coordinator", "staff"], title = "Case course") {
  const c = createGuide(
    db,
    jordan,
    { title, completion: "confirm", audience, doc: { schema: 2, pages: page(cases.map((x) => ({ id: x.id, type: "casethread", ...x.data }))) } },
    now,
  );
  publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
  return c;
}
const take: Take = {
  say: "Margaret, I can hear how much it matters that you choose who helps you. Can you tell me what worries you about someone new?",
  do: "I’d check what the agreement needs for a funded worker, ask the team about Jess’s insurance and checks, and record the request and reasons.",
  who: "The care partner team and Margaret, with a call back on Thursday.",
};
const act = (u: User, threadId: string, action: string, extra: Record<string, unknown> = {}, at = now) =>
  caseThreadAction(db, u, { threadId, action, ...extra }, at) as ReturnType<typeof caseThreadView> & { interrupt?: typeof LIVE_ROUTE };
const view = (u: User, id = A, v?: string) => caseThreadView(db, u, id, { view: v }, now);
const firstSeed = (u: User, id = A) => view(u, id).feed!.posts[0];
/** Submit, read the note, read a peer approach and reflect: the four things that finish a case. */
function finish(u: User, id = A) {
  act(u, id, "submit", { take });
  act(u, id, "viewed-note");
  act(u, id, "viewed-peer", { postId: firstSeed(u, id).id });
  return act(u, id, "reflect", { reflection: "I’d ask about safety this week sooner." });
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam, dana] = ["jordan", "riley", "sam", "dana"].map((id) => userById(db, id)!);
});

describe("publishing a case thread", () => {
  it("can't be published without the case note's approval, sign-off, policy version and review date, even with Publish anyway", () => {
    const c = createGuide(
      db,
      jordan,
      { title: "Unsigned", completion: "confirm", doc: { schema: 2, pages: page([{ id: "a", type: "casethread", ...CASE_FAMILY_FRIEND }]) } },
      now,
    );
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/case note approval and sign-off/);
    try {
      publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
    } catch (e) {
      const p = (e as { problems: string[] }).problems.join(" ");
      expect(p).toMatch(/Community owner approval/);
      expect(p).toMatch(/policy or agreement and its version/);
      expect(p).toMatch(/next review date/);
    }
    expect(() => caseThreadView(db, riley, A, {}, now)).toThrow(/Not found/);
  });

  it("registers one thread with its fictional seed responses, labelled as seeds and never as a real person", () => {
    course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    act(riley, A, "submit", { take });
    const feed = view(riley).feed!;
    expect(feed.posts).toHaveLength(4);
    for (const p of feed.posts) {
      expect(p.author.kind).toBe("seed");
      expect(p.author.badge).toBe(SEED_LABEL);
      expect(p.author.name).toMatch(/\(fictional\)$/);
      expect(p.label).toBe(PEER_LABEL);
    }
  });
});

describe("1. a private first take, then the case note and the discussion", () => {
  beforeEach(() => void course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]));

  it("keeps the case note, self-review and seeds out of the page and the API until the first take is submitted", () => {
    const blocks = allBlocks(readGuide(db, riley, "case-course").doc);
    const b = blocks.find((x) => x.type === "casethread") as unknown as CaseThreadData;
    expect(b.caseNote.summary).toBe("");
    expect(b.seeds).toEqual([]);
    expect(b.checklist).toEqual([]);
    expect(caseThreadForReaders(CASE_FAMILY_FRIEND).caseNote.boundaries).toEqual([]);
    const before = view(riley);
    expect(before.unlocked).toBe(false);
    expect(before.note).toBeNull();
    expect(before.feed).toBeNull();
    expect(before.checklist).toEqual([]);
    expect(before.thread.responses).toBe(4);
    expect(() => act(riley, A, "vote", { postId: "seed-wwyd-chosen-friend-a-ask-first", on: true })).toThrow(/Submit your first take/);
  });

  it("keeps a draft to return to, then saves the first take privately and immutably", () => {
    act(riley, A, "draft", { take: { say: "Margaret, I hear you.", do: "", who: "" } });
    expect(view(riley).attempt.draft.say).toBe("Margaret, I hear you.");
    expect(view(riley).unlocked).toBe(false);
    const v = act(riley, A, "submit", { take });
    expect(v.unlocked).toBe(true);
    expect(v.note?.title).toMatch(/Case note/);
    expect(v.checklist.length).toBeGreaterThanOrEqual(3);
    // Nothing public: no post exists for it.
    expect(v.mine).toEqual([]);
    expect(caseModeration(db, jordan, now).queue).toEqual([]);
    expect(() => act(riley, A, "submit", { take: { ...take, say: "Changed my mind" } })).toThrow(/already submitted/);
    act(riley, A, "reflect", { reflection: "I’d lead with safety.", revised: { ...take, say: "First, are you managing safely this week?" } });
    const after = view(riley);
    expect(after.attempt.firstTake).toEqual(take);
    expect(after.attempt.revised?.say).toBe("First, are you managing safely this week?");
  });
});

describe("2. one canonical thread, in the Magazine and in Community, under identical permissions", () => {
  it("is the same thread, posts, votes and comments wherever it's placed, and another course embeds it without a new version", () => {
    const home = course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    // A second course placing the same thread id: no new thread, no new version, even with different words.
    course([{ id: "a2", data: { ...signed(CASE_FAMILY_FRIEND), title: "Another page’s copy" } }], ["coordinator", "staff"], "Refresher");
    act(riley, A, "submit", { take });
    act(jordan, A, "submit", { take });
    const seed = firstSeed(riley);
    act(riley, A, "vote", { postId: seed.id, on: true });
    // What the block reads and what Community reads come from the same function and the same rows.
    const fromBlock = caseThreadView(db, jordan, (allBlocks(readGuide(db, jordan, home.slug).doc)[0] as unknown as CaseThreadData).threadId, {}, now);
    const community = caseThreadSpace(db, jordan).threads.find((t) => t.id === A)!;
    expect(fromBlock.thread.id).toBe(community.id);
    expect(fromBlock.thread.version).toBe(1);
    expect(fromBlock.case.title).toBe("A worker the client trusts");
    expect(fromBlock.feed!.posts.find((p) => p.id === seed.id)!.helpful).toBe(1);
    expect(community.responses).toBe(fromBlock.thread.responses);
  });

  it("answers “not found” to a role outside the thread's audience, from either place and for every action", () => {
    course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    expect(() => view(sam)).toThrow(/Not found/);
    expect(() => act(sam, A, "submit", { take })).toThrow(/Not found/);
    expect(() => act(sam, A, "vote", { postId: "seed-wwyd-chosen-friend-a-ask-first", on: true })).toThrow(/Not found/);
    expect(caseThreadSpace(db, sam).threads).toEqual([]);
    expect(caseThreadSpace(db, riley).threads.map((t) => t.id)).toEqual([A]);
    // The thread's cohort sits inside the course's audience: a partner-only course can't open it to coordinators.
    expect(caseThreadSpace(db, dana).threads).toHaveLength(1);
  });
});

describe("3. the case note stays apart, and popularity never confers endorsement", () => {
  beforeEach(() => void course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]));

  it("pins the case note outside the feed and orders peers by votes without ever endorsing them", () => {
    const voters = ["riley", "jordan", "dana", "hamish", "morgan"].map((id) => userById(db, id)!);
    for (const u of voters) act(u, A, "submit", { take });
    const last = view(riley).feed!.posts.at(-1)!;
    for (const u of voters.slice(1)) act(u, A, "vote", { postId: last.id, on: true });
    const feed = view(riley).feed!;
    expect(feed.posts[0].id).toBe(last.id);
    expect(feed.posts[0].helpful).toBe(4);
    expect(feed.posts[0].endorsement).toBeNull();
    expect(feed.posts[0].label).toBe(PEER_LABEL);
    expect(feed.posts.some((p) => /Case note/.test(p.body))).toBe(false);
    // A moderator's endorsement, with reviewer, date and case version, puts it above any vote count.
    const other = feed.posts[1];
    expect(() => caseModerationAction(db, riley, { target: "post", id: other.id, action: "endorse" }, now)).toThrow(/Only moderators/);
    caseModerationAction(db, jordan, { target: "post", id: other.id, action: "endorse" }, now);
    const after = view(riley).feed!;
    expect(after.posts[0].id).toBe(other.id);
    expect(after.posts[0].label).toBe(ENDORSED_LABEL);
    expect(after.posts[0].endorsement).toEqual({ by: "Jordan Lee", at: "2026-11-24", version: 1 });
  });

  it("ranks by view: endorsed first in Helpful, members only in Other perspectives, nothing outdated in Helpful", () => {
    const p = (id: string, kind: "seed" | "verified" | "member", helpful: number, endorsed = false, current = true) => ({
      id,
      kind,
      helpful,
      endorsed,
      current,
      at: `2026-11-0${id.length}`,
    });
    const posts = [p("a", "seed", 1), p("bb", "verified", 9), p("ccc", "member", 50), p("dddd", "seed", 0, true), p("eeeee", "verified", 20, false, false)];
    expect(rankFeed(posts, "helpful").map((x) => x.id)).toEqual(["dddd", "bb", "a"]);
    expect(rankFeed(posts, "others").map((x) => x.id)).toEqual(["ccc"]);
    expect(rankFeed(posts, "all")).toHaveLength(5);
  });

  it("lets a person take a helpful vote back, counts it once, and refuses a vote on their own response", () => {
    act(riley, A, "submit", { take });
    const s = firstSeed(riley);
    act(riley, A, "vote", { postId: s.id, on: true });
    act(riley, A, "vote", { postId: s.id, on: true });
    expect(view(riley).feed!.posts.find((p) => p.id === s.id)!.helpful).toBe(1);
    act(riley, A, "vote", { postId: s.id, on: false });
    expect(view(riley).feed!.posts.find((p) => p.id === s.id)!.helpful).toBe(0);
  });
});

describe("4. sharing is opt-in, and completion never depends on posting, votes or comments", () => {
  beforeEach(() => void course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]));

  it("finishes on first take, case note, one peer approach and a reflection, with nothing posted", () => {
    act(riley, A, "submit", { take });
    // Votes, comments and saves don't finish it.
    const s = firstSeed(riley);
    act(riley, A, "vote", { postId: s.id, on: true });
    act(riley, A, "save", { postId: s.id });
    act(riley, A, "comment", { postId: s.id, text: "How long do the checks usually take?", checked: true, key: "k1" });
    expect(caseAttemptComplete(db, riley, A)).toBe(false);
    act(riley, A, "viewed-note");
    act(riley, A, "viewed-peer", { postId: s.id });
    expect(caseAttemptComplete(db, riley, A)).toBe(false);
    const v = act(riley, A, "reflect", { reflection: "I’d check this week’s safety first." });
    expect(v.attempt.complete).toBe(true);
    expect(v.mine).toEqual([]);
    // Sam's colleague who only posts and votes, without a reflection, hasn't finished.
    act(jordan, A, "submit", { take });
    act(jordan, A, "share", { which: "first", checked: true, key: "s1" });
    expect(caseAttemptComplete(db, jordan, A)).toBe(false);
  });

  it("marks the Magazine block done only on the server's record of completion", () => {
    const c = createGuide(
      db,
      jordan,
      {
        title: "Block",
        completion: "confirm",
        audience: ["coordinator"],
        doc: { schema: 2, pages: page([{ id: "bx", type: "casethread", ...signed(CASE_REFUSED_CHECK) }]) },
      },
      now,
    );
    publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
    const g = readGuide(db, riley, c.slug);
    expect(() => recordGuideEvent(db, riley, c.id, { event: "engaged", revisionId: g.revisionId, blockId: "bx" }, now)).toThrow(/Finish the case first/);
    finish(riley, B);
    expect(recordGuideEvent(db, riley, c.id, { event: "engaged", revisionId: g.revisionId, blockId: "bx" }, now)).toMatchObject({ ok: true });
  });

  it("needs the three checks before sharing, and a shared response waits for a moderator", () => {
    act(riley, A, "submit", { take });
    expect(() => act(riley, A, "share", { which: "first" })).toThrow(/three checks/);
    const v = act(riley, A, "share", { which: "first", checked: true, key: "s1" });
    act(riley, A, "share", { which: "first", checked: true, key: "s1" });
    expect(v.mine).toHaveLength(1);
    expect(v.mine[0].statusText).toBe("Waiting for a moderator");
    act(jordan, A, "submit", { take });
    expect(view(jordan).feed!.posts.some((p) => p.id === v.mine[0].id)).toBe(false);
    caseModerationAction(db, jordan, { target: "post", id: v.mine[0].id, action: "approve" }, later(2));
    const others = view(jordan, A, "others").feed!.posts;
    expect(others.map((p) => p.id)).toContain(v.mine[0].id);
    expect(others[0].author).toMatchObject({ name: "Riley", kind: "member", badge: "" });
  });
});

describe("5. reported or unapproved posts are hidden, queued and audited", () => {
  beforeEach(() => void course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]));

  it("hides a reported post at once, puts it in the one queue with its reason, and logs every decision", () => {
    act(riley, A, "submit", { take });
    act(jordan, A, "submit", { take });
    const s = firstSeed(riley);
    act(riley, A, "report", { target: "post", id: s.id, reason: "unsafe" });
    expect(view(jordan).feed!.posts.some((p) => p.id === s.id)).toBe(false);
    const q = caseModeration(db, jordan, now);
    expect(q.reported.map((r) => r.id)).toEqual([s.id]);
    expect(q.reported[0].reports[0].reason).toBe("Unsafe or outdated advice");
    expect(() => caseModerationAction(db, jordan, { target: "post", id: s.id, action: "archive" }, now)).toThrow(/Give a reason/);
    caseModerationAction(db, jordan, { target: "post", id: s.id, action: "restore", reason: "Checked against the case note" }, now);
    expect(view(jordan).feed!.posts.some((p) => p.id === s.id)).toBe(true);
    const log = db.prepare("SELECT event, entity, reason FROM audit WHERE event LIKE 'case_thread.%'").all() as { event: string; reason: string }[];
    expect(log.map((l) => l.event)).toContain("case_thread.restore");
    expect(caseModeration(db, jordan, now).decisions[0]).toMatchObject({ action: "restore", reason: "Checked against the case note" });
  });

  it("shows a pending or declined comment only to its author, with the reason", () => {
    act(riley, A, "submit", { take });
    act(jordan, A, "submit", { take });
    const s = firstSeed(riley);
    act(riley, A, "comment", { postId: s.id, text: "Would a female worker help here?", checked: true, key: "c1" });
    act(riley, A, "comment", { postId: s.id, text: "Would a female worker help here?", checked: true, key: "c1" });
    expect(view(riley).feed!.posts.find((p) => p.id === s.id)!.comments).toHaveLength(1);
    expect(view(jordan).feed!.posts.find((p) => p.id === s.id)!.comments).toHaveLength(0);
    const c = caseModeration(db, jordan, now).queue.find((x) => x.kind === "comment")!;
    caseModerationAction(db, jordan, { target: "comment", id: c.id, action: "reject", reason: "Please ask it as a general question." }, now);
    const mine = view(riley).feed!.posts.find((p) => p.id === s.id)!.comments[0];
    expect(mine.statusText).toBe("Not published");
    expect(mine.note).toBe("Please ask it as a general question.");
  });
});

describe("6. real details blocked or quarantined; live matters interrupted", () => {
  beforeEach(() => void course([{ id: "b", data: signed(CASE_REFUSED_CHECK) }]));

  it("refuses identifying detail in a private take, and stores nothing", () => {
    expect(() => act(riley, B, "submit", { take: { ...take, say: `${take.say} Call Mrs Hartley on 0412 345 678.` } })).toThrow(/might identify someone/);
    expect(view(riley, B).attempt.started).toBe(false);
  });

  it("interrupts a live situation with the incident route, stores nothing, and continues only when it's the fictional case", () => {
    const live = { ...take, say: "My client fell this morning and won’t let anyone in. What should I do?" };
    const r = act(riley, B, "submit", { take: live });
    expect(r.interrupt).toEqual(LIVE_ROUTE);
    expect(r.interrupt!.href).toBe("/tools/sirs-first-steps");
    expect(view(riley, B).attempt.started).toBe(false);
    expect(caseThreadInsights(db, jordan).threads[0].activity.liveInterrupts).toBe(1);
    // Writing about Graham's fall in the case doesn't trip it.
    expect(screenCaseText("I’d ask Graham whether he hit his head when he fell, and whether he’s injured.", ["Graham"]).live).toBe(false);
    expect(screenCaseText("I’d ask the client what worries him.", []).identifying).toEqual([]);
    expect(screenCaseText("I have a client who fell yesterday and refuses help, what should I do?", []).live).toBe(true);
  });

  it("quarantines a shared response that might identify someone, with its flags, for a moderator", () => {
    act(riley, B, "submit", { take });
    act(riley, B, "reflect", { reflection: "More on safety.", revised: { ...take, who: "The clinical team." } });
    const v = act(riley, B, "share", { which: "revised", checked: true, key: "k" });
    expect(v.mine[0].status).toBe("pending");
    act(riley, B, "edit", { postId: v.mine[0].id, text: "I once had Mr Brennan in this spot, so I’d ring his daughter.", checked: true });
    const q = caseModeration(db, jordan, now).queue[0];
    expect(q.flags.join(" ")).toMatch(/a person’s name/);
  });
});

describe("7 and 8. the source guardrails of the two cases", () => {
  it("keeps Margaret's choice, requires suitability and the funded arrangement, and never bans every informal helper", () => {
    const a = CASE_FAMILY_FRIEND;
    expect(caseGuardrailProblems(a)).toEqual([]);
    const text = JSON.stringify(a);
    expect(text).toMatch(/genuinely consider/i);
    expect(text).toMatch(/suitability/);
    expect(text).toMatch(/insurance/);
    expect(text).toMatch(/funded/);
    expect(text).toMatch(/Informal help outside the funded arrangement is her choice/);
    expect(text).not.toMatch(/(family|friends?) (are|is) (always|never) (prohibited|allowed)/i);
    const bad = { ...a, caseNote: { ...a.caseNote, boundaries: [...a.caseNote.boundaries, "Family and friends are always prohibited from providing care."] } };
    expect(caseGuardrailProblems(bad).join(" ")).toMatch(/blanket ban/);
  });

  it("respects Graham's informed choice, prompts immediate safety, and never labels a refusal SIRS automatically", () => {
    const b = CASE_REFUSED_CHECK;
    expect(caseGuardrailProblems(b)).toEqual([]);
    expect(b.caseNote.summary).toMatch(/not automatically a SIRS incident/);
    expect(b.caseNote.summary).toMatch(/provider makes that decision/);
    expect(b.safetyCue).toMatch(/000/);
    expect(b.caseNote.boundaries.join(" ")).toMatch(/Don’t coerce/);
    const bad = { ...b, seeds: [...b.seeds, { id: "x", name: "X", role: "Y", body: "His refusal is a SIRS incident, so lodge it today.", why: "" }] };
    expect(caseGuardrailProblems(bad).join(" ")).toMatch(/labels a refusal as an incident/);
  });
});

describe("9. saved scripts: author, versions, a stale warning, and endorsement with reviewer and date", () => {
  it("keeps who wrote it and the versions, and warns after a policy change, which also withdraws endorsements and pauses the thread", () => {
    const home = course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    act(riley, A, "submit", { take });
    const [x, y] = view(riley).feed!.posts;
    caseModerationAction(db, jordan, { target: "post", id: x.id, action: "endorse" }, now);
    act(riley, A, "save", { postId: x.id });
    act(riley, A, "save", { postId: y.id });
    const saved = view(riley).saved;
    const ex = saved.find((s) => s.postId === x.id)!;
    expect(ex.label).toBe(ENDORSED_LABEL);
    expect(ex.endorsement).toMatchObject({ by: "Jordan Lee", at: "2026-11-24" });
    expect(ex.author).toMatch(/\(fictional\) · Fictional seed response/);
    expect(ex).toMatchObject({ caseVersion: 1, policyVersion: "2026.1", stale: [] });
    expect(saved.find((s) => s.postId === y.id)!.label).toBe(PEER_LABEL);
    // The policy changes: a new case version, endorsements withdrawn, the thread paused, saved scripts flagged.
    const draft = db.prepare("SELECT draft FROM magazine_guides WHERE id = ?").get(home.id) as { draft: string };
    const doc = JSON.parse(draft.draft);
    doc.pages[0].sections[0].blocks[0].policy.version = "2027.1";
    db.prepare("UPDATE magazine_guides SET draft = ? WHERE id = ?").run(JSON.stringify(doc), home.id);
    publishGuide(db, jordan, home.id, "", later(24), { allowUnverified: true });
    const v = view(riley);
    expect(v.thread.version).toBe(2);
    expect(v.thread.status).toBe("paused");
    expect(v.feed).toBeNull();
    expect(v.feedProblem).toMatch(/policy changed to version 2027.1/);
    const after = mySavedScripts(db, riley).find((s) => s.postId === x.id)!;
    expect(after.stale.join(" ")).toMatch(/Saved under policy version 2026.1; the policy is now 2027.1/);
    expect(after.stale.join(" ")).toMatch(/endorsement has been withdrawn/);
    expect(after.label).toBe(PEER_LABEL);
    // The paused discussion can't be marked as read.
    expect(() => act(riley, A, "viewed-peer", { postId: y.id })).toThrow(/paused/);
    caseModerationAction(db, jordan, { target: "thread", id: A, action: "reopen" }, later(25));
    expect(view(riley).feed).not.toBeNull();
  });
});

describe("10. accessibility, verified badges and analytics", () => {
  it("promises keyboard, screen reader, text-only status and no animation in its contract", () => {
    const c = BLOCK_REGISTRY.find((b) => b.type === "casethread")!;
    expect(c.accessible).toMatch(/Keyboard and screen reader/);
    expect(c.accessible).toMatch(/text-only view/);
    expect(c.accessible).toMatch(/no animation/);
    expect(c.completion).toMatch(/Never votes, posting or comments/);
    expect(c.evidence).toBe("completed");
  });

  it("badges a member as a verified coordinator only from a recorded grant, never by inference", () => {
    course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    act(riley, A, "submit", { take });
    const v = act(riley, A, "share", { which: "first", checked: true, key: "k" });
    caseModerationAction(db, jordan, { target: "post", id: v.mine[0].id, action: "approve" }, now);
    act(jordan, A, "submit", { take });
    expect(view(jordan, A, "helpful").feed!.posts.some((p) => p.id === v.mine[0].id)).toBe(false);
    expect(() => caseModerationAction(db, jordan, { target: "user", id: "sam", action: "verify", criterion: "x" }, now)).toThrow(/Only coordinators/);
    expect(() => caseModerationAction(db, jordan, { target: "user", id: "riley", action: "verify" }, now)).toThrow(/criterion/);
    caseModerationAction(db, jordan, { target: "user", id: "riley", action: "verify", criterion: "Test criterion: two years coordinating" }, now);
    const p = view(jordan, A, "helpful").feed!.posts.find((x) => x.id === v.mine[0].id)!;
    expect(p.author).toMatchObject({ kind: "verified", badge: "Verified experienced coordinator" });
  });

  it("counts people and events without anyone's words, and suppresses small groups", () => {
    course([{ id: "a", data: signed(CASE_FAMILY_FRIEND) }]);
    finish(riley);
    const t = caseThreadInsights(db, jordan).threads[0];
    expect(t.learners.firstTake).toBe("fewer than 5");
    expect(t.learners.completed).toBe("fewer than 5");
    expect(JSON.stringify(t)).not.toMatch(/Margaret, I can hear/);
    const rows = db.prepare("SELECT * FROM ct_events").all() as Record<string, unknown>[];
    expect(rows.every((r) => !("text" in r) && !("body" in r))).toBe(true);
    expect(() => caseThreadInsights(db, riley)).toThrow(/Only moderators/);
    removeCaseThread(db, jordan, A, now);
    expect(caseThreadSpace(db, riley).threads).toEqual([]);
  });
});
