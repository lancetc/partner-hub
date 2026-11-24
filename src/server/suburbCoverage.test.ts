import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, coverageForReaders, coverageHardProblems, type CoverageLabData } from "@/lib/coverageLab";
import { blankInputs } from "@/lib/suburbCoverage";
import { charactersInBlock } from "@/lib/characters";
import { SUBURB_GROWTH } from "@/content/coverageCases";
import { ensurePlanner } from "./caseloadPlanner";
import { businessHome, coverageState, coverageStats, finishCoverage, getPlan, retryCoverage, saveCoverage, savePlan, submitPrediction } from "./suburbCoverage";

/*
  Local Coverage on the server: a fictional case that passes its check and can't publish unsigned, no answer key for
  readers, the debrief only once every step is done (fixture 1: end to end with fictional information), telemetry
  with no words, hours or area figures, and private plans nobody outside the business can reach (fixture 10).
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-23T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  operations: "Ops",
  onboarding: "Onboarding",
  quality: "Quality",
  partnerships: "Partnerships",
  policy: "Policy",
  privacy: "Privacy",
  pilot: "Pilot",
  approvedOn: "2026-11-23",
  reviewBy: "2027-06-30",
};
const suburbs = (signed = true): CoverageLabData => {
  const d = structuredClone(SUBURB_GROWTH);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: CoverageLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Maya’s suburbs",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The comparison", blocks: [{ id: "lc", type: "coverage", ...data }] }],
    },
  ],
});
function course(data = suburbs()) {
  const c = createGuide(db, jordan, { title: "Is this suburb ready for growth?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
/** The model's readings: what a careful learner tags. */
const TAGS = {
  "card-a": "unavailable",
  "card-b": "unavailable",
  "card-c": "potential",
  "card-p": "potential",
  "card-d": "usable",
  "card-e": "committed",
  "card-k": "potential",
  "card-h": "potential",
};
/** Works through every step before finishing: the prediction, an area, the tags, a row, a filter and the absence. */
function workThrough(guideId: string, user: User, tags: Record<string, string> = TAGS) {
  submitPrediction(db, user, guideId, { blockId: "lc", prediction: { area: "unclear" } }, now);
  return saveCoverage(
    db,
    user,
    guideId,
    { blockId: "lc", state: { stage: 3, opened: ["area:banksia", "cell:banksia-am"], filters: ["service"], tags, absence: true } },
    now,
  );
}
const STRONG = { immediate: "escalate", network: "banksia-am", explanation: "fit", followUp: "partly" };

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, casey, sam] = ["jordan", "riley", "casey", "sam"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("the block", () => {
  it("reads back from stored JSON unchanged, and the case passes its check", () => {
    const parsed = allBlocks(readGuideDoc(doc(suburbs()) as never)).find((b) => b.type === "coverage")! as unknown as CoverageLabData;
    expect(parsed).toMatchObject({ title: SUBURB_GROWTH.title, storyVersion: SUBURB_GROWTH.storyVersion });
    expect(parsed.inputs).toEqual(SUBURB_GROWTH.inputs);
    expect(parsed.cards).toEqual(SUBURB_GROWTH.cards);
    expect(parsed.update).toEqual(SUBURB_GROWTH.update);
    // The selection rationale and the story version are kept with the scenario (fixture 11).
    expect(parsed.rationale).toEqual(SUBURB_GROWTH.rationale);
    expect(caseProblems(SUBURB_GROWTH)).toEqual([]);
  });

  it("ships with its sign-off empty, can't be published without it, and “Publish anyway” doesn’t cover it", () => {
    expect(Object.values(SUBURB_GROWTH.approval).every((v) => v === "")).toBe(true);
    expect(coverageHardProblems(suburbs(false), "2026-11-23").join(" ")).toMatch(/record the owner/);
    const c = createGuide(db, jordan, { title: "Maya’s suburbs", completion: "confirm", doc: doc(suburbs(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Local Coverage Comparison block needs/);
    expect(() => course()).not.toThrow();
  });

  it("names Maya for the character library, and no contractor or client", () => {
    const named = charactersInBlock({ type: "coverage", ...SUBURB_GROWTH });
    expect(named.map((p) => [p.name, p.role])).toEqual([["Maya", "other"]]);
  });

  it("gives learners no answer key: likely answers, card feedback, option feedback, levels, flags, outcomes and the debrief stay on the server", () => {
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const b = allBlocks(g.doc).find((x) => x.type === "coverage") as unknown as CoverageLabData;
    expect(b.prediction.options.every((x) => !x.likely)).toBe(true);
    expect(b.cards.every((x) => !x.feedback)).toBe(true);
    for (const list of [b.immediate, b.network])
      expect(list.every((x) => !x.feedback && !x.outcome && !x.flags.length && !Object.keys(x.levels).length)).toBe(true);
    expect(b.explanations.every((x) => !x.feedback && !x.flags.length)).toBe(true);
    expect(b.followUp.options.every((x) => !x.feedback && !x.flags.length)).toBe(true);
    expect(b.debrief).toBe("");
    expect(coverageForReaders(SUBURB_GROWTH).inputs).toEqual(SUBURB_GROWTH.inputs);
  });
});

describe("an attempt (fixture 1: end to end, fictional only)", () => {
  it("opens the detail only after the prediction, and sends the debrief only once every step is done", () => {
    const c = course();
    const early = saveCoverage(db, riley, c.id, { blockId: "lc", state: { stage: 5 } }, now);
    expect(early.state.stage).toBeLessThanOrEqual(1);
    expect(() => finishCoverage(db, riley, c.id, { blockId: "lc", ...STRONG }, now)).toThrow(/Make your prediction first/);
    submitPrediction(db, riley, c.id, { blockId: "lc", prediction: { area: "unclear" } }, now);
    expect(() => finishCoverage(db, riley, c.id, { blockId: "lc", ...STRONG }, now)).toThrow(/Tag every supply card/);
    workThrough(c.id, riley);
    const v = finishCoverage(db, riley, c.id, { blockId: "lc", ...STRONG }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBe(18);
    expect(v.debrief!.cards.every((x) => x.matches)).toBe(true);
    expect(v.debrief!.immediate.outcome).toMatch(/clinical team covers Sunday’s dressing/);
    expect(coverageState(db, riley, c.id, "lc").debrief).not.toBeNull();
  });

  it("flags leaving a current gap for recruitment, and counting a candidate as capacity, above any total", () => {
    const c = course();
    workThrough(c.id, riley, { ...TAGS, "card-c": "usable", "card-a": "usable" });
    const d = finishCoverage(
      db,
      riley,
      c.id,
      { blockId: "lc", immediate: "recruit", network: "thinnest", explanation: "count", followUp: "closed" },
      now,
    ).debrief!;
    expect(d.flags.map((f) => f.id).sort()).toEqual(["candidateAsCapacity", "countAsCapacity", "ignoredUrgent", "timeMismatch"]);
    expect(d.score).toBeLessThan(8);
  });

  it("flags dropping a participant’s chosen worker", () => {
    const c = course();
    workThrough(c.id, riley, { ...TAGS, "card-p": "unavailable" });
    const d = finishCoverage(db, riley, c.id, { blockId: "lc", ...STRONG }, now).debrief!;
    expect(d.flags.map((f) => f.id)).toEqual(["overrodeChoice"]);
  });

  it("keeps every attempt, and logs fictional choices, matches, levels and flags only: no words, hours or area figures", () => {
    const c = course();
    workThrough(c.id, riley);
    finishCoverage(db, riley, c.id, { blockId: "lc", ...STRONG, revised: "corella" }, now);
    const again = retryCoverage(db, riley, c.id, { blockId: "lc" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.stage).toBe(0);
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "coverage_started",
        "prediction_submitted",
        "area_opened",
        "row_opened",
        "filter_used",
        "card_tagged",
        "absence_viewed",
        "decision_submitted",
        "followup_answered",
        "coverage_completed",
        "retry_started",
      ]),
    );
    expect(log.find((e) => e.event === "followup_answered")!.detail).toMatch(/"changed":true/);
    expect(log.filter((e) => e.event === "card_tagged").every((e) => /"matches":true/.test(e.detail))).toBe(true);
    const text = log.map((e) => e.detail).join(" ");
    expect(text).not.toMatch(/Maya|Banksia Rise|Toowoomba|26,720|"hours"|"gap"/);
    expect(coverageStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null, misread: null });
    expect(() => coverageStats(db, riley, c.id)).toThrow();
  });
});

describe("Plan my local area (fixture 10)", () => {
  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ orgName: expect.any(String), role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, plans: [] });
    expect(() => savePlan(db, sam, { name: "Mine", inputs: blankInputs("2026-11-23") }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions, keeps blanks as blanks, and returns the version before for “what changed”", () => {
    const blank = blankInputs("2026-11-23");
    const v1 = savePlan(db, casey, { name: "North side", inputs: blank }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.demand[0].planned).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    const filled = structuredClone(SUBURB_GROWTH.inputs);
    const v2 = savePlan(
      db,
      casey,
      { id: v1.id, inputs: filled, brief: { owner: "Principal", order: [{ cell: "quandong-wkd", reason: "Clinical team asked" }] } },
      now,
    );
    expect(v2.version).toBe(2);
    expect(v2.versions[1].snapshot).toEqual({ needs: 3, gapHours: 14, gapVisits: 0, immediate: 2, confirm: 0, fragile: 2 });
    expect(v2.brief.order).toEqual([{ cell: "quandong-wkd", reason: "Clinical team asked" }]);
    expect(v2.previous).toMatchObject({ number: 1 });
    expect(v2.previous!.inputs.demand[0].planned).toBeNull();
    expect(getPlan(db, casey, v1.id, 1).inputs.demand[0].planned).toBeNull();
    expect(businessHome(db, casey).plans).toHaveLength(1);
  });

  it("can't be read by anyone outside the business, whatever id they ask for, and never reaches the authors' totals", () => {
    const p = savePlan(db, casey, { name: "North side", inputs: blankInputs("2026-11-23") }, now);
    expect(() => getPlan(db, sam, p.id)).toThrow(/business owner/);
    // The author and superadmin, without planner access to that business, gets nothing either.
    expect(() => getPlan(db, jordan, p.id)).toThrow();
    // An owner of another business, with access of their own, still can't reach it.
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getPlan(db, riley, p.id)).toThrow(/isn’t here/);
    expect(() => savePlan(db, riley, { id: p.id, inputs: blankInputs("2026-11-23") }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).plans).toEqual([]);
    const c = course();
    expect(coverageStats(db, jordan, c.id).blocks).toEqual([]);
  });
});
