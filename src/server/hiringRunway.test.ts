import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  buildHiringDebrief,
  caseProblems,
  emptyHiringState,
  hiringForReaders,
  labHardProblems,
  planForecast,
  type Decision,
  type HiringLabData,
} from "@/lib/hiringRunway";
import { HIRING_CASES } from "@/content/hiringCases";
import { commitInitial, commitRevised, feedbackViewed, hiringState, hiringStats, retryHiring, saveHiring, SMALL_COHORT } from "./hiringRunway";

/* Hiring Runway Decision Lab: a reconciled fictional case, the event only after a first decision, a deterministic rubric that accepts different defensible plans, and nothing private in the telemetry. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-22T00:00:00Z");
const SIGNED = { owner: "Owner", finance: "Finance", operations: "Ops", partnerships: "Partnerships", privacy: "Privacy", approvedOn: "2026-11-22" };
const maya = (signed = true): HiringLabData => {
  const d = structuredClone(HIRING_CASES[0].data);
  if (signed) d.governance = { ...d.governance, ...SIGNED, reviewBy: "2027-06-30" };
  return d;
};
const doc = (data: HiringLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Maya",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Maya", blocks: [{ id: "hl", type: "hiring", ...data }] }],
    },
  ],
});
const blocking = (data: HiringLabData) => publishChecks(doc(data) as never, "confirm").blocking.join(" | ");
function course(data = maya()) {
  const c = createGuide(db, jordan, { title: "Growing a partner business", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const decision = (patch: Partial<Decision> = {}): Decision => ({
  recruit: true,
  optionId: "add-06",
  startMonth: 1,
  temporary: false,
  pace: false,
  workflow: false,
  monitor: true,
  incomeBasis: "agreement",
  rationale: "The workload diary shows onboarding and intensive hours push Sam over the threshold by Month 3, so recruit now and watch cash and callbacks.",
  changeIf: "If callbacks still slip or cash falls below the reserve, I’d revisit.",
  ...patch,
});
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  // AI off: nothing in the lab calls a model.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("the case", () => {
  it("is complete and reconciles: every evidence figure matches the model", () => {
    expect(caseProblems(maya())).toEqual([]);
    expect(blocking(maya())).toBe("");
  });

  it("blocks a figure on a card that doesn't match the model, naming it", () => {
    const d = maya();
    d.cards[0].figures[0].value = 380;
    expect(blocking(d)).toMatch(/says 380 for partner income.*uses 360/);
  });

  it("blocks a missing input, zero capacity, and a case without an expected growth case", () => {
    const missing = maya();
    delete (missing.inputs as Partial<typeof missing.inputs>).reserve;
    expect(blocking(missing)).toMatch(/Minimum cash reserve is missing/);
    const noTeam = maya();
    noTeam.inputs.currentFte = 0;
    noTeam.cards = noTeam.cards.map((e) => ({ ...e, figures: e.figures.filter((f) => f.key !== "currentFte") }));
    expect(blocking(noTeam)).toMatch(/no available hours/);
    const noExpected = maya();
    noExpected.growth = noExpected.growth.filter((g) => g.id !== "expected");
    expect(blocking(noExpected)).toMatch(/expected/);
  });

  it("can't publish without sign-off, even with Publish anyway", () => {
    expect(labHardProblems(maya(false), "2026-11-22").join(" ")).toMatch(/Finance, Operations\/Quality, Partnerships and privacy/);
    expect(labHardProblems(maya(), "2026-11-22")).toEqual([]);
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc(maya(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Hiring Runway lab needs/);
  });

  it("keeps the new information, the rubric and the reviewed plans out of the learner's copy", () => {
    const r = hiringForReaders(maya());
    expect(r.event.story).toBe("");
    expect(r.event.adjustments).toEqual([]);
    expect(r.feedback.alternatives).toEqual([]);
    expect(r.feedback.dimensions.workload.keywords).toEqual([]);
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const block = g.doc.pages[0].sections[0].blocks[0] as unknown as HiringLabData;
    expect(block.event.story).toBe("");
    expect(block.inputs.incomePerClient).toBe(360);
  });
});

describe("the attempt", () => {
  it("only reveals the new information after a committed first decision, and resumes where it was", () => {
    const c = course();
    const start = hiringState(db, riley, c.id, "hl");
    expect(start).toMatchObject({ status: "new", event: null, debrief: null });
    saveHiring(
      db,
      riley,
      c.id,
      { blockId: "hl", state: { ...emptyHiringState(maya()), stage: 1, opened: ["agreement", "workload"], compared: ["expected", "faster"] } },
      now,
    );
    // A half-written decision is refused, and still nothing is revealed.
    expect(() => commitInitial(db, riley, c.id, { blockId: "hl", decision: decision({ rationale: "", incomeBasis: "" }) }, now)).toThrow(/Not yet/);
    expect(hiringState(db, riley, c.id, "hl").event).toBeNull();
    const after = commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    expect(after.state.stage).toBe(2);
    expect(after.event?.title).toBe("Two emails in the same week");
    expect(after.comparison?.after.lowestCash).toBeLessThan(after.comparison!.before.lowestCash);
    // Coming back: the same stage, the same event, the plan as committed.
    const again = hiringState(db, riley, c.id, "hl");
    expect(again.state).toMatchObject({ stage: 2, opened: ["agreement", "workload"] });
    expect(again.event).not.toBeNull();
    expect(again.debrief).toBeNull();
  });

  it("finishes with a debrief, a recorded rubric and the versions, and Try another approach keeps both attempts", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    expect(() => commitRevised(db, riley, c.id, { blockId: "hl", decision: decision({ changeIf: "" }) }, now)).toThrow(/Not yet/);
    const done = commitRevised(
      db,
      riley,
      c.id,
      {
        blockId: "hl",
        decision: decision({
          rationale: "Sam’s leave and the later payment mean cash dips below the reserve, so I keep the 0.6 hire and check the payment dates.",
        }),
      },
      now,
    );
    expect(done.status).toBe("finished");
    expect(done.debrief?.dims).toHaveLength(6);
    expect(done.versions).toMatchObject({ story: "maya-1", model: "hiring-model-2", rubric: "hiring-rubric-1" });
    const second = retryHiring(db, riley, c.id, { blockId: "hl" }, now);
    expect(second).toMatchObject({ attemptNo: 2, status: "active" });
    expect(second.state.stage).toBe(0);
    expect(second.event).toBeNull();
    expect(events(c.id).map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "hiring_lab_started",
        "initial_decision_submitted",
        "event_revealed",
        "revised_decision_submitted",
        "hiring_lab_completed",
        "retry_started",
      ]),
    );
  });

  it("counts reading the feedback once per attempt, however often the debrief is reopened", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    commitRevised(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    for (let i = 0; i < 3; i++) feedbackViewed(db, riley, c.id, { blockId: "hl" }, now);
    expect(events(c.id).filter((e) => e.event === "rubric_feedback_viewed")).toHaveLength(1);
  });

  it("pins an attempt to its version: a republished case starts fresh, and the old attempt keeps its story", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    const v2 = maya();
    v2.storyVersion = "maya-2";
    v2.inputs.newPerMonth = 4;
    v2.cards[1].figures = v2.cards[1].figures.map((f) => (f.key === "newPerMonth" ? { ...f, value: 4 } : f));
    saveGuideDraft(db, jordan, c.id, { title: "Growing a partner business", completion: "confirm", doc: doc(v2) as never }, now);
    publishGuide(db, jordan, c.id, "", now);
    const fresh = hiringState(db, riley, c.id, "hl");
    expect(fresh.status).toBe("new");
    expect(fresh.versions.story).toBe("maya-2");
    const old = db.prepare("SELECT story_version FROM hiring_lab_attempts WHERE user_id = 'riley'").all() as { story_version: string }[];
    expect(old.map((r) => r.story_version)).toEqual(["maya-1"]);
  });

  it("keeps real business figures and typed words out of the activity log, and stores only fictional choices", () => {
    const c = course();
    saveHiring(
      db,
      riley,
      c.id,
      { blockId: "hl", state: { ...emptyHiringState(maya()), stage: 1, edits: { staffCostPerFte: 999_999, newPerMonth: 4 }, realSalary: 123_456 } },
      now,
    );
    const s = hiringState(db, riley, c.id, "hl").state;
    // A what-if edit is held to the author's range; anything else is dropped.
    expect(s.edits).toEqual({ staffCostPerFte: 9_000, newPerMonth: 4 });
    expect(JSON.stringify(s)).not.toContain("123456");
    commitInitial(
      db,
      riley,
      c.id,
      { blockId: "hl", decision: decision({ rationale: "My own business pays $95,000 and has 41 clients, so I would recruit now." }) },
      now,
    );
    const log = events(c.id)
      .map((e) => e.detail)
      .join(" ");
    expect(log).not.toMatch(/95,000|41 clients|my own business/i);
    expect(log).toContain('"actions":["recruit","monitor"]');
  });

  it("gives authors totals only, suppresses small groups, and refuses learners", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    commitRevised(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    expect(() => hiringStats(db, riley, c.id)).toThrow();
    const s = hiringStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ attempts: 1, people: 1, decided: 1, finished: 1, counted: 1, suppressed: true, dims: null, misconceptions: null });
    expect(SMALL_COHORT).toBe(5);
  });
});

describe("the debrief", () => {
  const debrief = (initial: Decision, revised: Decision = initial, opened = ["agreement", "workload", "cash"]) =>
    buildHiringDebrief(maya(), { ...emptyHiringState(maya()), stage: 3, opened, initial, revised });

  it("accepts different defensible plans, each on its own terms", () => {
    const recruit = debrief(
      decision(),
      decision({
        rationale:
          "Sam’s leave and the later payment cut cash to about $1,350 in Month 7, below the reserve, so I keep the 0.6 hire, confirm the payment dates and watch callbacks.",
      }),
    );
    const steady = debrief(
      decision({ recruit: false, optionId: "", temporary: true, pace: true, workflow: true }),
      decision({
        recruit: false,
        optionId: "",
        temporary: true,
        pace: true,
        workflow: true,
        rationale:
          "With the payment delay I’d rather keep cash above the reserve: pace intake, temporary help through Sam’s leave, and test the workflow change, then revisit hiring in Month 4. I’ll check callbacks and Sam’s hours weekly.",
      }),
    );
    for (const d of [recruit, steady]) {
      expect(d.misconceptions).toEqual([]);
      expect(d.score).toBeGreaterThanOrEqual(10);
      expect(d.dims.find((x) => x.dim === "income")?.rating).toBe(2);
    }
    // Different plans, both strong: the rubric doesn't require the highest margin or one hire.
    expect(recruit.yours.after.operating12).not.toBe(steady.yours.after.operating12);
  });

  it("fills feedback from the calculated values", () => {
    const d = debrief(decision());
    const economics = d.dims.find((x) => x.dim === "economics")!.text;
    expect(economics).toContain("$1,350");
    expect(economics).toContain("$10,000");
    expect(d.dims.find((x) => x.dim === "workload")!.text).toContain("Month 3");
  });

  it("names the funding, cash and capacity misconceptions", () => {
    expect(debrief(decision({ incomeBasis: "public" })).misconceptions).toContain("public-funding-as-fee");
    expect(
      debrief(
        decision({
          optionId: "add-10",
          rationale: "Hire a full-time coordinator now so the team has plenty of capacity for growth and onboarding.",
          changeIf: "If the new coordinator doesn’t settle in.",
        }),
      ).misconceptions,
    ).toContain("ignores-negative-cash");
    expect(
      debrief(
        decision({ recruit: false, optionId: "", monitor: true, rationale: "The business is profitable, so keep the current team and keep an eye on it." }),
      ).misconceptions,
    ).toContain("profit-over-capacity");
  });

  it("works from the authored case, not the learner's what-if edits", () => {
    const d = buildHiringDebrief(maya(), { ...emptyHiringState(maya()), stage: 3, edits: { newPerMonth: 6 }, initial: decision(), revised: decision() });
    expect(Math.round(d.none.lowestCash)).toBe(27_280);
    expect(planForecast(maya(), decision()).monthsAbove).toBe(0);
  });
});
