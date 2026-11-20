import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  advance,
  applyChanges,
  balanceApproved,
  balanceForReaders,
  checkTension,
  emptyState,
  finishProblems,
  freshBalance,
  needsWhs,
  scaleOf,
  scoreBalance,
  type BalanceBlockData,
  type BalanceState,
} from "@/lib/balance";
import { BALANCE_CASES } from "@/content/balanceCases";
import { advanceBalance, balanceState, balanceStats, eventBalance, finishBalance, restartBalance, saveBalance } from "./balance";

/* The Balance Scale: no stack of minor cards stands in for a must-do step, an offer isn't a completed referral, and nothing scores a person. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Content owner",
  clinical: "Clinical reviewer",
  quality: "Quality reviewer",
  operations: "Care Operations",
  whs: "WHS reviewer",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "Dignity of risk procedure", version: "1.0", policyId: "CP-001", effectiveOn: "2026-11-20", reviewOn: "2027-05-20" };
type Id = "alvarez" | "okoro" | "pearce";
const seed = (id: Id) => BALANCE_CASES.find((c) => c.id === id)!.data;
const signed = (id: Id): BalanceBlockData => ({ ...seed(id), approval: SIGNED, source: SOURCE });
const pages = (data: BalanceBlockData) => [
  {
    id: "p1",
    title: "A case",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "bal", type: "balance", ...data }] }],
  },
];
const blocking = (data: BalanceBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: BalanceBlockData) {
  const c = createGuide(db, jordan, { title: "Balance", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
/** A learner at the build step, with the tension named correctly. */
const building = (b: BalanceBlockData, plan: string[] = []): BalanceState => ({
  ...emptyState(),
  stage: 2,
  asked: [b.questions.find((q) => q.useful)!.id],
  goal: b.goals.find((g) => g.right)!.id,
  risks: b.risks.filter((r) => r.required).map((r) => r.id),
  tensionTries: 1,
  plan,
  ever: plan,
});
const alvarezGood = ["al-ask", "al-discuss", "al-path", "al-record", "al-review"];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the case an author publishes", () => {
  it("every starter case is complete apart from its sign-off, and asks for WHS only where workers are at risk", () => {
    for (const c of BALANCE_CASES) {
      expect(blocking(c.data).join(" ")).toMatch(/sign-off is required/);
      expect(blocking({ ...c.data, approval: SIGNED, source: SOURCE })).toEqual([]);
    }
    expect(needsWhs(seed("alvarez"))).toBe(false);
    expect(needsWhs(seed("pearce"))).toBe(true);
    expect(balanceApproved({ ...signed("pearce"), approval: { ...SIGNED, whs: "" } })).toBe(false);
    expect(balanceApproved({ ...signed("alvarez"), approval: { ...SIGNED, whs: "" } })).toBe(true);
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: { schema: 2, pages: pages(seed("alvarez")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Balance Scale case needs its sign-off/);
    expect(() => course(signed("alvarez"))).not.toThrow();
  });

  it("refuses a criterion an unsafe card could meet, and a new fact with no must-do step", () => {
    const bad = structuredClone(signed("alvarez"));
    bad.criteria[0].anyOf = ["al-waiver"];
    expect(blocking(bad).join(" ")).toMatch(/can’t be met by an over-restrictive or unsafe card/);
    const soft = structuredClone(signed("alvarez"));
    soft.criteria = soft.criteria.map((c) => ({ ...c, critical: false }));
    expect(blocking(soft).join(" ")).toMatch(/new fact needs at least one must-do criterion/);
  });

  it("keeps the criteria, what each card is worth and the new fact off the learner's page", () => {
    const c = course(signed("alvarez"));
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Ask her to sign a dignity of risk waiver");
    for (const secret of [
      "A signature doesn’t replace",
      "al-c-postfall",
      "her wrist is sore",
      "Not another person telling me",
      "My husband planted those roses",
      "Fictional teaching example",
    ])
      expect(page).not.toContain(secret);
    const r = balanceForReaders(seed("alvarez"));
    expect(r.criteria).toEqual([]);
    expect(r.actions.every((a) => a.effect === "contextual" && !a.rationale && !a.response)).toBe(true);
  });

  it("gives a copy fresh ids that the criteria still point at", () => {
    const b = freshBalance(freshBalance(seed("alvarez"), "aaaaa"), "bbbbb");
    expect(b.actions[0].id).toBe("al-ask-xbbbbb");
    expect(b.criteria[0].anyOf).toEqual(["al-ask-xbbbbb"]);
  });
});

describe("naming the tension", () => {
  const b = seed("alvarez");
  it("doesn't reward a made-up capacity finding or a missed risk", () => {
    expect(checkTension(b, { ...building(b), risks: ["al-r-fall", "al-r-capacity"] })).toMatchObject({
      ok: false,
      risks: expect.arrayContaining([expect.objectContaining({ id: "al-r-capacity", real: false })]),
    });
    expect(checkTension(b, { ...building(b), risks: ["al-r-aid"] })).toMatchObject({ ok: false, missing: 1 });
    expect(checkTension(b, { ...building(b), goal: "al-g-walker" }).ok).toBe(false);
    expect(checkTension(b, building(b)).ok).toBe(true);
  });

  it("counts each try, and only moves on once it fits the facts", () => {
    const s = { ...building(b), stage: 1, risks: ["al-r-capacity"] };
    const out = advance(b, s);
    expect("problem" in out && out.state?.tensionTries).toBe(2);
    expect("state" in advance(b, { ...s, risks: ["al-r-fall"] }) && (advance(b, { ...s, risks: ["al-r-fall"] }) as { state: BalanceState }).state.stage).toBe(
      2,
    );
  });
});

describe("Mrs Alvarez: what can and can't reach a balanced plan", () => {
  const b = seed("alvarez");
  const balanced = (plan: string[]) => scaleOf(b, building(b, plan)).balanced;

  it("not with documentation alone, an unaccepted OT referral, a forced walker or a waiver", () => {
    expect(balanced(["al-record"])).toBe(false);
    expect(balanced(["al-ask", "al-discuss", "al-ot", "al-record", "al-review"])).toBe(false);
    expect(scaleOf(b, building(b, ["al-ask", "al-discuss", "al-ot", "al-record", "al-review"])).prompts.join(" ")).toMatch(
      /What change could help her keep gardening/,
    );
    expect(balanced([...alvarezGood, "al-tell"])).toBe(false);
    expect(scaleOf(b, building(b, [...alvarezGood, "al-tell"])).label).toBe("Leaning towards control");
    expect(balanced([...alvarezGood, "al-waiver"])).toBe(false);
    expect(scaleOf(b, building(b, ["al-waiver"])).label).toBe("Leaning towards leaving the risk unmanaged");
  });

  it("does with more than one valid combination, and says residual risk remains", () => {
    const s = scaleOf(b, building(b, alvarezGood));
    expect(s).toMatchObject({ balanced: true, label: "Balanced plan for this scenario", tilt: 0 });
    expect(s.note).toMatch(/Residual risk remains/);
    expect(balanced(["al-ask", "al-discuss", "al-shoes", "al-ot", "al-record", "al-review"])).toBe(true);
    // The annual review has no trigger for a fall: it doesn't stand in for the real review.
    expect(balanced(["al-ask", "al-discuss", "al-path", "al-record", "al-annual"])).toBe(false);
  });

  it("won't test a plan with something unsafe in it", () => {
    expect(advance(b, building(b, [...alvarezGood, "al-leave"]))).toMatchObject({ problem: /Leave it alone.*doesn’t end Trilogy Care’s role/ });
  });

  it("after the fall, the earlier plan isn't enough until post-fall action, the incident and a plan review are there", () => {
    const after: BalanceState = { ...building(b, alvarezGood), stage: 3, saying: "al-s-good", firstSaying: "al-s-good", eventSeen: true };
    expect(scaleOf(b, after).balanced).toBe(false);
    expect(scaleOf(b, after).prompts[0]).toMatch(/She’s fallen and her wrist is sore/);
    // More weight on the scale doesn't offset it.
    const more = { ...after, plan: [...alvarezGood, "al-more"] };
    expect(finishProblems(b, more).join(" ")).toMatch(/doesn’t stand in for a post-fall assessment/);
    expect(finishProblems(b, after).length).toBe(3);
    const done = { ...after, plan: [...alvarezGood, "al-postfall", "al-incident", "al-replan"] };
    expect(finishProblems(b, done)).toEqual([]);
    expect(scaleOf(b, done).balanced).toBe(true);
  });
});

describe("the contrasting cases", () => {
  it("Mr Okoro: no funded booking for an unchecked worker, while his preference still counts", () => {
    const b = seed("okoro");
    const good = ["ok-ask", "ok-explain", "ok-compliance", "ok-help-des", "ok-record", "ok-review"];
    expect(scaleOf(b, building(b, good)).balanced).toBe(true);
    expect(advance(b, building(b, [...good, "ok-approve"]))).toMatchObject({ problem: /Approve Des now/ });
    expect(scaleOf(b, building(b, [...good, "ok-forbid"])).label).toBe("Leaning towards control");
    // Declining the approved gardener is his right; it just doesn't count as the agreed path.
    expect(scaleOf(b, building(b, ["ok-ask", "ok-explain", "ok-compliance", "ok-alt", "ok-record", "ok-review"])).balanced).toBe(false);
    const after: BalanceState = { ...building(b, [...good, "ok-book"]), stage: 3, saying: "ok-s-good", eventSeen: true };
    expect(finishProblems(b, after).join(" ")).toMatch(/Applied isn’t cleared/);
    expect(finishProblems(b, { ...after, plan: [...good, "ok-confirm"] })).toEqual([]);
  });

  it("Mrs Pearce: her home choice is kept apart from a worker's safe way out", () => {
    const b = seed("pearce");
    const good = ["pe-ask", "pe-discuss", "pe-path", "pe-whs", "pe-record", "pe-review"];
    expect(scaleOf(b, building(b, good)).balanced).toBe(true);
    expect(scaleOf(b, building(b, ["pe-ask", "pe-discuss", "pe-path", "pe-record", "pe-review"])).prompts.join(" ")).toMatch(/worker’s safety/);
    expect(scaleOf(b, building(b, [...good, "pe-clear"])).label).toBe("Leaning towards control");
    expect(scaleOf(b, building(b, [...good, "pe-stop"])).balanced).toBe(false);
    expect(advance(b, building(b, [...good, "pe-carryon"]))).toMatchObject({ problem: /carry on and be careful/ });
    const after: BalanceState = { ...building(b, [...good, "pe-shower-anyway"]), stage: 3, saying: "pe-s-good", eventSeen: true };
    expect(finishProblems(b, after).length).toBe(3);
    expect(finishProblems(b, { ...after, plan: [...good, "pe-pause", "pe-revisit"] })).toEqual([]);
  });
});

describe("reading an attempt", () => {
  it("reports each area separately, and flags over-control and under-response without a score", () => {
    const b = seed("alvarez");
    const s: BalanceState = {
      ...building(b, [...alvarezGood, "al-postfall", "al-incident", "al-replan"]),
      stage: 3,
      eventSeen: true,
      saying: "al-s-good",
      firstSaying: "al-s-control",
      ever: [...alvarezGood, "al-tell", "al-postfall", "al-incident", "al-replan"],
      asked: ["al-q-diagnosis"],
      tensionTries: 2,
    };
    const r = scoreBalance(b, s);
    expect(r.balanced).toBe(true);
    expect(r.flags).toMatchObject({ overControl: true, underResponse: false, usefulQuestion: false });
    expect(r.areas.choice.rating).not.toBe("Strong");
    expect(r.areas.choice.notes.join(" ")).toMatch(
      /None of your questions got to why.*At one point the plan had “Tell her she can’t go into the garden|At one point the plan had “Tell her/,
    );
    expect(r.areas.risk.notes.join(" ")).toMatch(/on try 2/);
    expect(r.areas.escalation.rating).toBe("Strong");
    expect(JSON.stringify(r)).not.toMatch(/"score"|percent|audit/i);
  });

  it("an offer the person declines is recorded as offered and declined, not done", () => {
    const b = seed("alvarez");
    const s = applyChanges(b, building(b), { plan: ["al-ot"] });
    const view = scaleOf(b, s);
    expect(view.balanced).toBe(false);
    expect(s.revisions).toEqual([["al-ot"]]);
  });
});

describe("attempts", () => {
  it("runs the whole case through the server, keeps every revision, and gives authors totals only", () => {
    const c = course(signed("alvarez"));
    const save = (state: Partial<BalanceState>) => saveBalance(db, riley, c.id, { blockId: "bal", state }, now);
    const go = () => advanceBalance(db, riley, c.id, { blockId: "bal" }, now);

    expect(balanceState(db, riley, c.id, "bal")).toMatchObject({ status: "new", known: { scale: null } });
    expect(go()).toMatchObject({ ok: false, problem: /Ask at least one question/ });
    expect(save({ asked: ["al-q-walker"] }).known.answers["al-q-walker"]).toMatch(/catches on the gravel/);
    expect(go()).toMatchObject({ ok: true, state: { stage: 1 } });
    // A plan saved before building starts is ignored.
    expect(save({ goal: "al-g-roses", risks: ["al-r-capacity"], plan: ["al-record"] }).state.plan).toEqual([]);
    const miss = go();
    expect(miss).toMatchObject({ ok: false, tension: { ok: false } });
    save({ risks: ["al-r-fall"] });
    expect(go()).toMatchObject({ ok: true, state: { stage: 2, tensionTries: 2 } });

    // The scale comes back with each save, and the person's answer to anything they were asked.
    const first = save({ plan: ["al-ask", "al-ot"] });
    expect(first.known.scale?.balanced).toBe(false);
    expect(first.known.responses["al-ot"]).toMatchObject({ accepts: false, response: /Maybe later/ });
    expect(save({ plan: alvarezGood }).known.scale?.balanced).toBe(true);
    expect(go()).toMatchObject({ ok: true, state: { stage: 3 } });

    expect(() => eventBalance(db, riley, c.id, { blockId: "bal" }, now)).toThrow(/what you’d say/);
    save({ saying: "al-s-good" });
    const ev = eventBalance(db, riley, c.id, { blockId: "bal" }, now);
    expect(ev.known.event?.facts.join(" ")).toMatch(/wrist is sore/);
    expect(ev.known.scale?.balanced).toBe(false);
    expect(() => finishBalance(db, riley, c.id, { blockId: "bal" }, now)).toThrow(/Not yet.*She’s fallen/);
    save({ plan: [...alvarezGood, "al-postfall", "al-incident", "al-replan"] });
    const done = finishBalance(db, riley, c.id, { blockId: "bal" }, now);
    expect(done.status).toBe("finished");
    expect(done.debrief).toMatchObject({ balanced: true, reviewOwner: "Her Care Partner", event: { title: "A week later" } });
    expect(done.debrief?.note).toMatch(/^Fictional teaching example/);
    expect(done.state.revisions.length).toBe(3);
    expect(done.state.blocked).toBe(1);

    const stats = balanceStats(db, jordan, c.id);
    expect(stats.blocks[0]).toMatchObject({ people: 1, finished: 1, balanced: 1, retriedTension: 1, overControl: 0, underResponse: 0 });
    expect(JSON.stringify(stats)).not.toMatch(/riley|roses|gravel/);
    expect(() => balanceStats(db, riley, c.id)).toThrow();

    expect(restartBalance(db, riley, c.id, { blockId: "bal" }, now)).toMatchObject({ status: "active", state: { stage: 0 } });
  });
});
