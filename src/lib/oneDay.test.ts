import { describe, expect, it } from "vitest";
import { LEILAS_MONDAY } from "@/content/oneDayCases";
import {
  applyDayAction,
  bestPath,
  buildDebrief,
  caseProblems,
  cleanAttempt,
  dayView,
  emptyAttempt,
  knowledgePreview,
  learnerOnly,
  oneDayForReaders,
  oneDayHardProblems,
  replay,
  retryFrom,
  type Attempt,
  type OneDayData,
} from "./oneDay";

/* One Day, Five Perspectives: a deterministic replay, knowledge kept apart from the learner's perspective visits, flags that override totals, and a branch test that catches impossible reveals. */

const day = (): OneDayData => structuredClone(LEILAS_MONDAY);
const SIGNED = {
  owner: "O",
  story: "S",
  operations: "Op",
  quality: "Q",
  billing: "B",
  supplier: "Su",
  privacy: "P",
  approvedOn: "2026-11-22",
  reviewBy: "2027-06-30",
};
const with_ = (patch: Partial<Attempt>): Attempt => ({ ...emptyAttempt(), ...patch });
const strong = () => bestPath(day());

describe("the case", () => {
  it("passes its branch test, and the strongest path reaches 4:30 without a flag, leaving an issue open with an owner", () => {
    expect(caseProblems(day())).toEqual([]);
    const s = replay(day(), strong());
    expect(s.done).toBe(true);
    expect(s.flags).toEqual([]);
    const d = buildDebrief(day(), strong(), s);
    expect(d.highlights.changed).toMatchObject({ event: "e-patel-change", time: "15:00" });
    expect(d.highlights.goodHandoff).not.toBeNull();
    expect(d.highlights.open.some((c) => c.owner !== "leila")).toBe(true);
  });

  it("catches impossible reveals and contradictions", () => {
    const d = day();
    // A lens that reveals what that person doesn't know.
    d.events[1].lenses[2].facts.push("p-bookgroup");
    // An option that needs a fact no one ever tells Leila.
    d.events[0].decision!.options[1].needs = ["p-local-gap"];
    // A conditional event hanging on a state nothing sets.
    d.events[6].when = { key: "nobody.sets", is: ["x"] };
    // A commitment owned by someone outside the cast.
    d.events[2].decision!.options[0].effect.commit![1].owner = "ghost";
    const p = caseProblems(d).join(" | ");
    expect(p).toMatch(/reveals “Mrs Patel hosts her book group.*which cleaner doesn’t know/);
    expect(p).toMatch(/which Leila can never be told/);
    expect(p).toMatch(/waits on “nobody.sets”, which nothing sets/);
    expect(p).toMatch(/owner isn’t in the cast/);
  });

  it("can't publish without every reviewer, or past its review date", () => {
    expect(oneDayHardProblems(day(), "2026-11-22").join(" ")).toMatch(/Operations, Quality\/clinical, Billing\/Finance, supplier onboarding and privacy/);
    const signed = { ...day(), approval: SIGNED };
    expect(oneDayHardProblems(signed, "2026-11-22")).toEqual([]);
    expect(oneDayHardProblems(signed, "2027-07-01").join(" ")).toMatch(/due for review/);
  });

  it("keeps events, facts and honest statuses out of the learner's copy", () => {
    const r = oneDayForReaders(day());
    expect(r.events).toEqual([]);
    expect(r.facts).toEqual([]);
    expect(r.truths).toEqual([]);
    expect(r.actors.every((a) => a.about === "")).toBe(true);
    expect(r.threads.map((t) => t.name)).toEqual(["Mrs Patel", "Dot", "Mr Tan"]);
  });
});

describe("the replay", () => {
  it("is deterministic: the same case and attempt always give the same view", () => {
    const a = with_({ choices: { "e-plan": "list", "e-cancel": "ask" }, lenses: ["e-cancel:mrs-patel"] });
    expect(JSON.stringify(dayView(day(), a))).toBe(JSON.stringify(dayView(day(), a)));
  });

  it("only shows events that have arrived, and stops at the next decision", () => {
    const v = dayView(day(), emptyAttempt());
    expect(v.events.map((e) => e.id)).toEqual(["e-plan"]);
    expect(v.currentId).toBe("e-plan");
    expect(v.remaining).toBe(7);
    expect(JSON.stringify(v)).not.toMatch(/book group|Joy/);
  });

  it("keeps what the learner learned in a perspective visit apart from what Leila knows", () => {
    const d = day();
    let a = with_({ choices: { "e-plan": "list" } });
    a = applyDayAction(d, a, { action: "lens", eventId: "e-cancel", actorId: "mrs-patel" }).attempt;
    const s = replay(d, a);
    expect(s.leila.has("p-bookgroup")).toBe(false);
    expect(learnerOnly(s)).toEqual(expect.arrayContaining(["p-bookgroup", "p-strangers"]));
    const v = dayView(d, a);
    expect(v.lenses[0].facts.map((f) => f.id)).toContain("p-bookgroup");
    expect(v.leila.map((f) => f.id)).not.toContain("p-bookgroup");
    // Asking Mrs Patel is how Leila comes to know it.
    a = applyDayAction(d, a, { action: "choose", eventId: "e-cancel", optionId: "ask" }).attempt;
    expect(replay(d, a).leila.has("p-bookgroup")).toBe(true);
    expect(learnerOnly(replay(d, a))).not.toContain("p-bookgroup");
  });

  it("refuses a choice that acts on what only the learner knows, and counts it against information accuracy", () => {
    const d = day();
    let a = with_({ choices: { "e-plan": "list" }, lenses: ["e-cancel:mrs-patel"] });
    const out = applyDayAction(d, a, { action: "choose", eventId: "e-cancel", optionId: "keep-tuesday" });
    expect(out.refused).toMatchObject({ eventId: "e-cancel", optionId: "keep-tuesday", missing: 1 });
    expect(out.attempt.choices["e-cancel"]).toBeUndefined();
    a = applyDayAction(d, out.attempt, { action: "choose", eventId: "e-cancel", optionId: "ask" }).attempt;
    const s = replay(d, a);
    expect(s.scores.some((x) => x.dim === "accuracy" && x.level === 0 && x.event === "e-cancel")).toBe(true);
  });

  it("only takes a choice at the event waiting on the learner", () => {
    expect(applyDayAction(day(), emptyAttempt(), { action: "choose", eventId: "e-tan", optionId: "separate" }).error).toMatch(/isn’t waiting/);
    expect(applyDayAction(day(), emptyAttempt(), { action: "lens", eventId: "e-tan", actorId: "billing" }).error).toMatch(/isn’t available/);
  });

  it("brings in the conditional 3 pm event that fits the state: a changed plan, or correcting a promise about Joy", () => {
    const base = { "e-plan": "list", "e-cancel": "ask", "e-roses": "ask-dot", "e-document": "full", "e-tan": "separate" };
    const truthful = replay(day(), with_({ choices: { ...base, "e-supplier": "truthful" } }));
    expect(truthful.current?.id).toBe("e-patel-change");
    const joy = replay(day(), with_({ choices: { ...base, "e-supplier": "joy" } }));
    expect(joy.current?.id).toBe("e-patel-correct");
    expect(joy.arrived.map((x) => x.event.id)).not.toContain("e-patel-change");
  });

  it("drops the choices from an event onward when retrying from it", () => {
    const a = strong();
    const r = retryFrom(day(), a, "e-roses");
    expect(Object.keys(r.choices)).toEqual(["e-plan", "e-cancel", "e-supplier"]);
    expect(r.closing).toEqual({});
    expect(replay(day(), r).current?.id).toBe("e-roses");
  });
});

describe("the debrief", () => {
  it("lets a critical flag override a high total: promising an unapproved worker", () => {
    const a = strong();
    const flagged = { ...a, choices: { ...a.choices, "e-supplier": "joy", "e-patel-correct": "correct" } };
    delete (flagged.choices as Record<string, string>)["e-patel-change"];
    const s = replay(day(), flagged);
    expect(s.done).toBe(true);
    const d = buildDebrief(day(), flagged, s);
    expect(d.flags.map((f) => f.flag)).toContain("unapproved-worker");
    expect(d.total).toBeGreaterThan(12);
  });

  it("marks a sent message recorded as done, and a dishonest end-of-day status", () => {
    const a = strong();
    const s = replay(day(), { ...a, choices: { ...a.choices, "e-document": "emailed" }, closing: { ...a.closing, tan: "done" } });
    expect(s.flags.map((f) => f.flag)).toContain("sent-as-done");
    expect(s.scores.find((x) => x.dim === "followThrough" && x.level === 0)).toBeTruthy();
  });

  it("shows three aligned timelines, with what others knew but hadn't said", () => {
    const d = buildDebrief(day(), strong());
    const tan = d.timelines.find((t) => t.event === "e-tan")!;
    expect(tan.unsaid.map((u) => u.text).join(" ")).toMatch(/Kiran is proposing a higher rate/);
    expect(tan.leila.decided).toMatch(/Billing/);
  });

  it("previews what the coordinator knows at each event", () => {
    const rows = knowledgePreview(day());
    expect(rows[0].leila.join(" ")).toMatch(/invoice query is in Billing’s queue/);
    expect(rows.find((r) => r.event === "e-cancel")!.leila.join(" ")).toMatch(/book group/);
  });
});

describe("a stored attempt", () => {
  it("keeps only choices, lenses and statuses that exist in the case", () => {
    const a = cleanAttempt(day(), {
      choices: { "e-plan": "list", "e-cancel": "nope", ghost: "x" },
      lenses: ["e-cancel:mrs-patel", "e-cancel:leila", "x:y"],
      replies: { "e-cancel:mrs-patel": "tuesday", "e-cancel:asha": "z" },
      closing: { patel: "waiting", dot: "maybe", ghost: "done" },
      misses: ["e-cancel:keep-tuesday"],
    });
    expect(a).toEqual({
      choices: { "e-plan": "list" },
      lenses: ["e-cancel:mrs-patel"],
      replies: { "e-cancel:mrs-patel": "tuesday" },
      misses: ["e-cancel:keep-tuesday"],
      closing: { patel: "waiting" },
    });
  });
});

describe("hidden knowledge in the debrief", () => {
  it("doesn't count a fact as unsaid before it exists in the day", () => {
    const d = buildDebrief(day(), strong());
    const at1030 = d.timelines.find((t) => t.event === "e-supplier")!;
    expect(at1030.unsaid.map((u) => u.text).join(" ")).not.toMatch(/rather wait for next Tuesday/);
    const preview = knowledgePreview(day()).find((r) => r.event === "e-supplier")!;
    expect(preview.hidden.map((h) => h.text).join(" ")).not.toMatch(/rather wait for next Tuesday/);
  });
});
