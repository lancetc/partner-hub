import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { answerCard, feedbackFor, freshLine, initialState, servable, summarise, twistCard, type Answer, type LineBlockData, type LineCase } from "@/lib/line";
import { LINE_CASES } from "@/content/lineCases";
import { answerLine, finishLine, lineState, lineStats, restartLine, revisitLine } from "./line";

/* Where Is the Line?: three choices per card, informed refusal respected, the gutter nuance, a fact that changes the answer, and keys kept server-side. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const TODAY = "2026-11-20";
const SIGNED = { owner: "Care Partner learning", sme: "Care Partner SME", clinical: "Clinical", quality: "Quality", approvedOn: "2026-11-20" };
const SOURCE = { title: "Self-management policy set", version: "2026.11" };
const draft = () => LINE_CASES[0].data;
const approved = (data = draft(), reviewOn = "2027-05-20"): LineBlockData => ({
  ...data,
  shuffle: false,
  cases: data.cases.map((c) => ({ ...c, status: "approved" as const, source: { ...c.source, approver: "Clinical and Quality", reviewOn } })),
  approval: SIGNED,
  source: SOURCE,
});
const pages = (data: LineBlockData) => [
  {
    id: "p1",
    title: "Where is the line?",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Cards", blocks: [{ id: "ln", type: "line", ...data }] }],
  },
];
const blocking = (data: LineBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: LineBlockData) {
  const c = createGuide(db, jordan, { title: "Where is the line?", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const card = (id: string) => draft().cases.find((c) => c.id === id)!;
const right = (c: LineCase): Answer => ({ lane: c.lane, reason: c.primary, action: c.acceptedActions[0] });

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the deck an author publishes", () => {
  it("the draft deck has ten cards, none approved, and can't be published until each is signed off", () => {
    expect(draft().cases).toHaveLength(10);
    const p = blocking(draft()).join(" ");
    expect(p).toMatch(/case 1 isn’t approved yet/);
    expect(p).toMatch(/sign-off is required/);
    expect(blocking(approved())).toEqual([]);
  });

  it("can't be published with an unapproved card, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(draft()) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/needs every card approved/);
    expect(() => course(approved())).not.toThrow();
  });

  it("keeps every answer off the learner's page", () => {
    const c = course(approved());
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("I don’t want a nursing review.");
    for (const secret of [
      "Never treat a refusal as permission",
      "AT-HM equipment has its own pathway. Trilogy Care can’t",
      '"acceptedActions":["ln-',
      '"primary":"ln-',
    ])
      expect(page).not.toContain(secret);
  });

  it("only serves approved cards within their review date, in a stable order per attempt", () => {
    expect(initialState(draft(), TODAY).order).toEqual([]);
    expect(initialState(approved(undefined, "2026-11-19"), TODAY).order).toEqual([]);
    expect(initialState(approved(), TODAY).order).toHaveLength(10);
    const shuffled = { ...approved(), shuffle: true };
    expect(initialState(shuffled, TODAY, 7).order).toEqual(initialState(shuffled, TODAY, 7).order);
    expect(initialState(shuffled, TODAY, 7).order).not.toEqual(initialState(shuffled, TODAY, 8).order);
    expect(servable({ status: "needs_review", source: approved().cases[0].source }, TODAY)).toBe(false);
  });

  it("gives a copy fresh ids that the keys still point at", () => {
    const b = freshLine(freshLine(draft(), "aaaaa"), "bbbbb");
    expect(b.cases[1].primary).toBe("ln-02-r1-xbbbbb");
    expect(b.cases[1].critical?.actions).toEqual(["ln-02-a2-xbbbbb", "ln-02-a3-xbbbbb"]);
  });
});

describe("reading a card", () => {
  it("won't move on until a lane, a reason and an action are chosen", () => {
    const b = approved();
    const s = initialState(b, TODAY);
    expect(answerCard(b, s, s.order[0], { lane: "choice", reason: "", action: "" })).toMatchObject({
      problem: /Choose a lane, the governing reason and a next action/,
    });
    expect(answerCard(b, s, s.order[1], right(b.cases[1]))).toMatchObject({ problem: /isn’t the one in front of you/ });
    const ok = answerCard(b, s, s.order[0], right(b.cases[0]));
    expect("state" in ok && ok.state.at).toBe(1);
  });

  it("respects an informed refusal and still acts on the falls; overriding it or ignoring them needs a debrief", () => {
    const c = card("ln-02");
    expect(c.lane).toBe("choice");
    expect(feedbackFor(c, right(c))).toMatchObject({ laneRight: true, reasonRight: true, actionRight: true, debrief: "" });
    expect(feedbackFor(c, { lane: "cannot", reason: "ln-02-r4", action: "ln-02-a2" }).debrief).toMatch(/informed refusal was overruled/);
    expect(feedbackFor(c, { lane: "choice", reason: "ln-02-r1", action: "ln-02-a3" })).toMatchObject({
      laneRight: true,
      actionRight: false,
      debrief: expect.stringMatching(/falls were left/),
    });
    expect(c.why).toMatch(/Never treat a refusal as permission to ignore falls/);
  });

  it("teaches the gutter nuance: the right lane for the wrong reason is caught", () => {
    const c = card("ln-09");
    expect(feedbackFor(c, { lane: "cannot", reason: "ln-09-r2", action: "ln-09-a3" })).toMatchObject({
      laneRight: true,
      reasonRight: false,
      actionRight: false,
    });
    expect(c.why).toMatch(/can be eligible essential home maintenance/);
  });

  it("never gives full credit for a bare no on a cannot-authorise card", () => {
    for (const id of ["ln-08", "ln-09", "ln-10"]) {
      const c = card(id);
      const bare = c.actions.find((a) => a.text === "Just say no")!;
      expect(feedbackFor(c, { lane: "cannot", reason: c.primary, action: bare.id }).actionRight).toBe(false);
    }
  });

  it("changes the lift chair's answer when the funding source changes, keeping the first answer", () => {
    const b = approved();
    let s = initialState(b, TODAY);
    for (const id of [...s.order]) s = (answerCard(b, s, id, right(b.cases.find((c) => c.id === id)!)) as { state: typeof s }).state;
    const out = twistCard(b, s, "ln-05", "cannot");
    expect("result" in out && out.result).toMatchObject({ lane: "cannot", right: true, changed: true, before: "check" });
    expect("result" in out && out.state?.answers["ln-05"].lane).toBe("check");
    const gardener = twistCard(b, s, "ln-04", "check");
    expect("result" in gardener && gardener.result).toMatchObject({ lane: "choice", right: false, changed: true });
  });
});

describe("the line map", () => {
  it("tells over-control from approving before checks, and lists what to replay", () => {
    const b = approved();
    let s = initialState(b, TODAY);
    for (const id of [...s.order]) {
      const c = b.cases.find((x) => x.id === id)!;
      // Veto the refusal case; wave through the gardener; everything else right.
      const a =
        id === "ln-02"
          ? { lane: "cannot" as const, reason: "ln-02-r4", action: "ln-02-a2" }
          : id === "ln-04"
            ? { lane: "choice" as const, reason: "ln-04-r3", action: "ln-04-a2" }
            : right(c);
      s = (answerCard(b, s, id, a) as { state: typeof s }).state;
    }
    const m = summarise(b, s);
    expect(m).toMatchObject({ total: 10, lane: 8, reason: 8, action: 8, mastered: 8, overControl: 1, premature: 1 });
    expect(m.missed.sort()).toEqual(["ln-02", "ln-04"]);
    expect(m.debriefs.map((d) => d.id).sort()).toEqual(["ln-02", "ln-04"]);
    expect(m.twists.sort()).toEqual(["ln-04", "ln-05"]);
    expect(m.map.find((x) => x.lane === "cannot")?.placed.map((p) => p.id)).toContain("ln-02");
  });
});

describe("attempts", () => {
  it("runs a deck through the server, keeps answers server-side until given, and reports accuracy separately", () => {
    const c = course(approved());
    const b = approved();
    const first = lineState(db, riley, c.id, "ln", now);
    expect(first).toMatchObject({ status: "new", answered: {}, summary: null, held: 0 });
    expect(() => finishLine(db, riley, c.id, { blockId: "ln" }, now)).toThrow(/Answer every card/);
    let order = lineState(db, riley, c.id, "ln", now).state.order;
    for (const id of order) {
      const cs = b.cases.find((x) => x.id === id)!;
      const out = answerLine(
        db,
        riley,
        c.id,
        { blockId: "ln", caseId: id, answer: id === "ln-09" ? { lane: "cannot", reason: "ln-09-r2", action: "ln-09-a1" } : right(cs) },
        now,
      );
      expect(out.feedback.caseId).toBe(id);
      order = out.state.order;
    }
    const done = finishLine(db, riley, c.id, { blockId: "ln" }, now);
    expect(done.summary).toMatchObject({ total: 10, lane: 10, reason: 9, action: 10, mastered: 9, missed: ["ln-09"] });
    expect(Object.keys(done.answered)).toHaveLength(10);

    expect(revisitLine(db, riley, c.id, { blockId: "ln", kind: "replay", caseId: "ln-09", answer: right(b.cases[8]) }, now).feedback).toMatchObject({
      reasonRight: true,
    });
    expect(revisitLine(db, riley, c.id, { blockId: "ln", kind: "twist", caseId: "ln-05", lane: "cannot" }, now).twist).toMatchObject({ right: true });
    const after = lineState(db, riley, c.id, "ln", now);
    expect(after.replayed["ln-09"].reasonRight).toBe(true);
    expect(after.state.answers["ln-09"].reason).toBe("ln-09-r2");

    const stats = lineStats(db, jordan, c.id);
    expect(stats).toMatchObject({ finished: 1, withOverControl: 0, withPremature: 0 });
    expect(stats.byCase["ln-09"]).toEqual({ answered: 1, lane: 1, reason: 0, action: 1, debriefs: 0 });
    expect(() => lineStats(db, riley, c.id)).toThrow();
    expect(restartLine(db, riley, c.id, { blockId: "ln" }, now)).toMatchObject({ status: "active", state: { at: 0 } });
  });
});
