import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, intakeForReaders, intakeHardProblems, type IntakeLabData } from "@/lib/growthLab";
import { blankInputs } from "@/lib/growthReadiness";
import { NEXT_TEN } from "@/content/growthCases";
import { ensurePlanner } from "./caseloadPlanner";
import { businessHome, finishIntake, getScenario, intakeState, intakeStats, retryIntake, saveIntake, saveScenario, submitPrediction } from "./growthReadiness";

/*
  Growth readiness: a fictional case that passes its check, the debrief only once the steps are done, a rubric that
  never scores intake, telemetry with no words or figures, and private business scenarios nobody else can reach.
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-22T00:00:00Z");
const SIGNED = {
  owner: "Owner",
  operations: "Ops",
  partnerships: "Partnerships",
  policy: "Policy",
  privacy: "Privacy",
  approvedOn: "2026-11-22",
  reviewBy: "2027-06-30",
};
const next10 = (signed = true): IntakeLabData => {
  const d = structuredClone(NEXT_TEN);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: IntakeLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Next 10",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Priya", blocks: [{ id: "gr", type: "intake", ...data }] }],
    },
  ],
});
function course(data = next10()) {
  const c = createGuide(db, jordan, { title: "Can we take on the next 10 clients?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
/** Works through every step before the decision: the prediction, a week, a service gap and a change. */
function workThrough(guideId: string, user: User, count = 6) {
  submitPrediction(db, user, guideId, { blockId: "gr", prediction: { count, checks: ["agreements", "weeks", "services", "effort"] } }, now);
  return saveIntake(
    db,
    user,
    guideId,
    { blockId: "gr", state: { stage: 3, weeks: [1], services: ["personal care|certificate iii|north brisbane|early morning (6–8 am)#1"], applied: ["cover"] } },
    now,
  );
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, casey, sam] = ["jordan", "riley", "casey", "sam"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("the block", () => {
  it("reads back from stored JSON unchanged, and the case passes its check", () => {
    const parsed = allBlocks(readGuideDoc(doc(next10()) as never)).find((b) => b.type === "intake")!;
    expect(parsed).toMatchObject({ type: "intake", title: NEXT_TEN.title, storyVersion: NEXT_TEN.storyVersion });
    expect((parsed as unknown as IntakeLabData).inputs).toEqual(NEXT_TEN.inputs);
    expect(caseProblems(NEXT_TEN)).toEqual([]);
  });

  it("can't be published without its sign-off, and “Publish anyway” doesn’t cover it", () => {
    expect(intakeHardProblems(next10(false), "2026-11-22").join(" ")).toMatch(/record the owner/);
    const c = createGuide(db, jordan, { title: "Next 10", completion: "confirm", doc: doc(next10(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/growth readiness block needs/);
    expect(() => course()).not.toThrow();
  });

  it("gives learners no answer key: which checks matter, the feedback, levels, flags and the debrief stay on the server", () => {
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const b = allBlocks(g.doc).find((x) => x.type === "intake") as unknown as IntakeLabData;
    expect(b.prediction.checks.every((x) => !x.useful)).toBe(true);
    expect(b.decisions.every((x) => !x.feedback && !x.flags.length && !Object.keys(x.levels).length)).toBe(true);
    expect(b.messages.every((x) => !x.outcome)).toBe(true);
    expect(b.debrief).toBe("");
    expect(intakeForReaders(NEXT_TEN).inputs).toEqual(NEXT_TEN.inputs);
  });
});

describe("an attempt", () => {
  it("opens the map only after the prediction, and sends the debrief only once every step is done", () => {
    const c = course();
    const early = saveIntake(db, riley, c.id, { blockId: "gr", state: { stage: 4 } }, now);
    expect(early.state.stage).toBeLessThanOrEqual(1);
    expect(() => finishIntake(db, riley, c.id, { blockId: "gr", decision: "plan", message: "honest" }, now)).toThrow(/Make your prediction first/);
    workThrough(c.id, riley);
    const v = finishIntake(db, riley, c.id, { blockId: "gr", decision: "plan", message: "honest" }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBeGreaterThanOrEqual(10);
    expect(v.debrief!.message.outcome).toMatch(/starts on the 10th/);
    expect(intakeState(db, riley, c.id, "gr").debrief).not.toBeNull();
  });

  it("never scores intake: the same choices score the same whatever was predicted, and a promised date is flagged above any total", () => {
    const c = course();
    workThrough(c.id, riley, 0);
    const a = finishIntake(db, riley, c.id, { blockId: "gr", decision: "plan", message: "honest" }, now).debrief!;
    workThrough(c.id, jordan, 10);
    const b = finishIntake(db, jordan, c.id, { blockId: "gr", decision: "plan", message: "honest" }, now).debrief!;
    expect(a.score).toBe(b.score);
    retryIntake(db, riley, c.id, { blockId: "gr" }, now);
    workThrough(c.id, riley, 10);
    const promised = finishIntake(db, riley, c.id, { blockId: "gr", decision: "all-ten", message: "all-set" }, now).debrief!;
    expect(promised.flags.map((f) => f.id)).toEqual(["promised"]);
  });

  it("keeps every attempt, and logs fictional choices, levels and flags only", () => {
    const c = course();
    workThrough(c.id, riley);
    finishIntake(db, riley, c.id, { blockId: "gr", decision: "plan", message: "honest" }, now);
    const again = retryIntake(db, riley, c.id, { blockId: "gr" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.stage).toBe(0);
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "intake_started",
        "prediction_submitted",
        "week_inspected",
        "service_inspected",
        "change_tried",
        "decision_submitted",
        "intake_completed",
        "retry_started",
      ]),
    );
    // No message text, no figures from the case.
    expect(log.map((e) => e.detail).join(" ")).not.toMatch(/working towards|26,720|Priya/);
    expect(intakeStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null });
  });
});

describe("Use my business", () => {
  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ orgName: expect.any(String), role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, scenarios: [] });
    expect(() => saveScenario(db, sam, { name: "Mine", inputs: blankInputs("2026-12", "2026-11-22") }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions, keeps a blank as blank, and resumes", () => {
    const blank = blankInputs("2026-12", "2026-11-22");
    const v1 = saveScenario(db, casey, { name: "December starts", inputs: blank }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.reservePct).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    const v2 = saveScenario(
      db,
      casey,
      {
        id: v1.id,
        inputs: { ...blank, reservePct: 10 },
        sheet: { actions: [{ action: "Confirm the morning roster", owner: "Casey", due: "2026-11-25" }], reviewBy: "2026-12-01" },
      },
      now,
    );
    expect(v2.version).toBe(2);
    expect(getScenario(db, casey, v1.id).sheet.actions[0]).toMatchObject({ owner: "Casey", status: "open" });
    expect(getScenario(db, casey, v1.id, 1).inputs.reservePct).toBeNull();
    expect(businessHome(db, casey).scenarios).toHaveLength(1);
  });

  it("can't be read by anyone outside the business, whatever id they ask for", () => {
    const s = saveScenario(db, casey, { name: "December starts", inputs: blankInputs("2026-12", "2026-11-22") }, now);
    expect(() => getScenario(db, sam, s.id)).toThrow(/business owner/);
    // An owner of another business, with access of their own, still can't reach it.
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getScenario(db, riley, s.id)).toThrow(/isn’t here/);
    expect(() => saveScenario(db, riley, { id: s.id, inputs: blankInputs("2026-12", "2026-11-22") }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).scenarios).toEqual([]);
  });
});
