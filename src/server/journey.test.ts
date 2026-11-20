import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  emptyState,
  finishProblems,
  freshJourney,
  PERSONA_IDS,
  readTry,
  scoreJourney,
  tryTension,
  type Attempt,
  type JourneyBlockData,
  type JourneyState,
} from "@/lib/journey";
import { JOURNEY_CASES } from "@/content/journeyCases";
import { finishJourney, journeyState, journeyStats, restartJourney, saveJourney, tryJourney } from "./journey";

/* The SaH Journey: four perspectives everywhere, approval kept apart from allocation, safety first, and no promise succeeds. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Learning",
  operations: "Care Operations",
  clinical: "Clinical",
  quality: "Quality",
  privacy: "Privacy",
  communications: "Communications",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "How the Support at Home program works", version: "2026-11", verifiedOn: "2026-11-20" };
const seed = () => JOURNEY_CASES[0].data;
const signed = (): JourneyBlockData => ({ ...seed(), approval: SIGNED, source: SOURCE });
const pages = (data: JourneyBlockData) => [
  {
    id: "p1",
    title: "Journey",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Arthur", blocks: [{ id: "jy", type: "journey", ...data }] }],
  },
];
const blocking = (data: JourneyBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: JourneyBlockData) {
  const c = createGuide(db, jordan, { title: "The SaH Journey", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const fall = () => seed().tensions.find((t) => t.id === "jr-t-fall")!;
const onboard = () => seed().tensions.find((t) => t.id === "jr-t-onboard")!;
const good = (t = fall()): Attempt => ({
  options: t.areas.flatMap((a) => a.options.filter((o) => o.role === "essential").map((o) => o.id)),
  saying: t.sayings.find((s) => s.good)!.id,
});
const at = (id: string) => seed().milestones.findIndex((m) => m.id === id);

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the journey an author publishes", () => {
  it("has seven milestones with all four perspectives at each, and keeps approval apart from allocation", () => {
    const b = seed();
    expect(b.milestones).toHaveLength(7);
    for (const m of b.milestones) for (const p of PERSONA_IDS) expect(m.cards[p].knows.length).toBeGreaterThan(3);
    const labels = b.milestones.map((m) => m.label).join(" | ");
    expect(labels).toMatch(/Notice of Decision/);
    expect(labels).toMatch(/Priority System/);
    expect(labels).toMatch(/Funding allocation letter/);
    expect(JSON.stringify(b)).not.toMatch(/package assignment/i);
    expect(b.timeNote).toBe("Fictional case timeline — not an estimate of your wait");
    expect(b.milestones.find((m) => m.id === "jr-assessment")?.misconception).toMatch(/Trilogy Care doesn’t assign the official priority/);
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    expect(blocking(seed()).join(" ")).toMatch(/sign-off is required/);
    expect(blocking(signed())).toEqual([]);
    const c = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(seed()) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/SaH Journey needs its sign-off/);
  });

  it("requires every perspective at every milestone", () => {
    const b = structuredClone(signed());
    b.milestones[0].cards.provider.knows = "";
    expect(blocking(b).join(" ")).toMatch(/independent provider: what they know/);
  });

  it("keeps the decision keys and reviewed responses off the learner's page", () => {
    const c = course(signed());
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Chloe says it was minor, so no check is needed");
    for (const secret of [
      "“Minor” is a report, not a conclusion",
      "Follow the immediate safety and clinical escalation pathway if the facts",
      '"unsafe"',
      '"essential"',
    ])
      expect(page).not.toContain(secret);
  });

  it("gives a copy fresh ids that still point at their milestones", () => {
    const b = freshJourney(freshJourney(seed(), "aaaaa"), "bbbbb");
    expect(b.tensions[0].milestoneId).toBe("jr-waiting-xbbbbb");
    expect(b.milestones.map((m) => m.id)).toContain("jr-waiting-xbbbbb");
  });
});

describe("the fall while waiting", () => {
  it("routes safety separately from review and interim support, and stands with the reviewed plan", () => {
    expect(fall().areas.map((a) => a.label)).toEqual([
      "Safety and clinical escalation",
      "Assessment and review",
      "Possible interim supports",
      "Communication and follow-up",
    ]);
    const f = readTry(fall(), good());
    expect(f).toMatchObject({ stands: true, critical: [], gaps: [] });
    expect(f.reviewed).toMatch(/Support Plan Review/);
    expect(f.effects.find((e) => e.dim === "safety")?.text).toBe("Covered.");
  });

  it("“it was minor, so no check” needs a debrief; skipping safety is named as the gap", () => {
    const minor = readTry(fall(), { options: ["jr-o-minor", "jr-o-record", "jr-o-chsp", "jr-o-tell"], saying: "jr-s-good" });
    expect(minor.stands).toBe(false);
    expect(minor.critical[0].feedback).toMatch(/“Minor” is a report/);
    expect(minor.gaps.map((g) => g.area)).toEqual(["Safety and clinical escalation"]);
    expect(minor.reviewed).toBe("");
  });

  it("CHSP and interim funding stay separate; nothing moves Arthur up the queue or backdates payment", () => {
    for (const bad of ["jr-o-auto", "jr-o-queue", "jr-o-book", "jr-o-all"])
      expect(readTry(fall(), { ...good(), options: [...good().options, bad] }).stands).toBe(false);
  });

  it("can't succeed by promising funding", () => {
    const promise = readTry(fall(), { ...good(), saying: "jr-s-date" });
    expect(promise.stands).toBe(false);
    expect(promise.critical.map((c) => c.feedback).join(" ")).toMatch(/Nobody can promise that/);
  });
});

describe("funding allocation and onboarding", () => {
  it("hands over to the Care Partner with Arthur involved, and keeps the provider provisional", () => {
    expect(readTry(onboard(), good(onboard())).stands).toBe(true);
    expect(readTry(onboard(), { ...good(onboard()), options: [...good(onboard()).options, "jr-o-roster"] }).stands).toBe(false);
    expect(readTry(onboard(), { ...good(onboard()), options: [...good(onboard()).options, "jr-o-chloe"] }).critical[0].feedback).toMatch(
      /Arthur makes his own decisions/,
    );
    expect(readTry(onboard(), { ...good(onboard()), saying: "jr-s-monday" }).stands).toBe(false);
  });
});

describe("progress", () => {
  it("can't decide before reaching the point, keeps every try, and needs the lenses and decisions to finish", () => {
    const b = seed();
    let s: JourneyState = emptyState();
    expect(tryTension(b, s, "jr-t-fall", good())).toMatchObject({ problem: /haven’t reached/ });
    s = { ...s, at: at("jr-waiting") };
    const bad = tryTension(b, s, "jr-t-fall", { options: ["jr-o-minor"], saying: "jr-s-fine" });
    s = "state" in bad ? bad.state : s;
    const ok = tryTension(b, s, "jr-t-fall", good());
    s = "state" in ok ? ok.state : s;
    expect(s.tries["jr-t-fall"]).toHaveLength(2);
    expect(s.tries["jr-t-fall"][0].options).toEqual(["jr-o-minor"]);
    expect(s.settled).toEqual(["jr-t-fall"]);
    const left = finishProblems(b, s).join(" ");
    expect(left).toMatch(/open Arthur, Chloe, Trilogy Care Coordinator, Independent provider’s view/);
    expect(left).toMatch(/Decide at “Funding is allocated/);
    const r = scoreJourney(b, s);
    expect(r.flags).toMatchObject({ criticalFirstTry: 1, retries: 1 });
    expect(r.dims.safety.notes.join(" ")).toMatch(/first try had “Chloe says it was minor/);
  });
});

describe("attempts", () => {
  it("runs the journey through the server, keeps tries and lenses, and gives authors totals only", () => {
    const c = course(signed());
    const b = seed();
    expect(journeyState(db, riley, c.id, "jy")).toMatchObject({ status: "new", decided: {}, debrief: null });
    const lenses = Object.fromEntries(b.milestones.map((m) => [m.id, [...PERSONA_IDS]]));
    saveJourney(db, riley, c.id, { blockId: "jy", state: { at: at("jr-waiting"), lenses: { "jr-referral": ["person"] } } }, now);
    saveJourney(db, riley, c.id, { blockId: "jy", state: { at: at("jr-waiting"), lenses: { "jr-referral": ["family"] } } }, now);
    expect(journeyState(db, riley, c.id, "jy").state.lenses["jr-referral"].sort()).toEqual(["family", "person"]);
    // A saved state can't settle a decision.
    saveJourney(db, riley, c.id, { blockId: "jy", state: { at: at("jr-waiting"), settled: ["jr-t-fall"] } }, now);
    expect(journeyState(db, riley, c.id, "jy").state.settled).toEqual([]);

    expect(tryJourney(db, riley, c.id, { blockId: "jy", tensionId: "jr-t-fall", options: ["jr-o-minor"], saying: "jr-s-date" }, now).feedback.stands).toBe(
      false,
    );
    expect(tryJourney(db, riley, c.id, { blockId: "jy", tensionId: "jr-t-fall", ...good() }, now).feedback.stands).toBe(true);
    expect(() => finishJourney(db, riley, c.id, { blockId: "jy" }, now)).toThrow(/Not yet/);
    saveJourney(db, riley, c.id, { blockId: "jy", state: { at: at("jr-allocation"), lenses } }, now);
    tryJourney(db, riley, c.id, { blockId: "jy", tensionId: "jr-t-onboard", ...good(onboard()) }, now);
    const done = finishJourney(db, riley, c.id, { blockId: "jy" }, now);
    expect(done.status).toBe("finished");
    expect(done.debrief?.map).toHaveLength(7);
    expect(done.debrief?.decisions.find((d) => d.id === "jr-t-fall")).toMatchObject({ tries: 2, first: { stands: false }, last: { stands: true } });
    expect(done.decided["jr-t-onboard"].stands).toBe(true);

    const stats = journeyStats(db, jordan, c.id);
    expect(stats).toMatchObject({
      finished: 1,
      byTension: { "jr-t-fall": { tries: 2, stood: 1, critical: 1 }, "jr-t-onboard": { tries: 1, stood: 1, critical: 0 } },
    });
    expect(() => journeyStats(db, riley, c.id)).toThrow();
    expect(restartJourney(db, riley, c.id, { blockId: "jy" }, now)).toMatchObject({ status: "active", state: { at: 0 } });
  });
});
