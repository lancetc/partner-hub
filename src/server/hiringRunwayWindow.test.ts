import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { caseProblems, labWindow, type Decision, type HiringLabData } from "@/lib/hiringRunway";
import { HIRING_CASES } from "@/content/hiringCases";
import { caseHash, commitInitial, commitRevised, hiringAdmin, hiringRegister, hiringState, saveHiring } from "./hiringRunway";
import { plannerReport } from "./caseloadPlanner";
import { exportRegister } from "./problemDesk";

/*
  The Hiring Runway block with the decision window (Care Partner Hiring Runway PRD): older cases and attempts still
  load, the window reaches the debrief, the Work Tool link is only for someone who may plan a business, events carry
  which assumption moved and never its value, and the register and Admin view are aggregate only.
*/

let db: Db;
let jordan: User, riley: User, casey: User;
const now = new Date("2026-11-24T00:00:00Z");
const SIGNED = { owner: "Owner", finance: "Finance", operations: "Ops", partnerships: "Partnerships", privacy: "Privacy", approvedOn: "2026-11-22" };
const maya = (): HiringLabData => {
  const d = structuredClone(HIRING_CASES[0].data);
  d.governance = { ...d.governance, ...SIGNED, reviewBy: "2027-06-30" };
  return d;
};
/** A block as saved before lab 2: no classification mix, contact duty, uncertainty band, theme or review decision. */
const legacy = (): HiringLabData => {
  const d = maya() as Partial<HiringLabData> & Record<string, unknown>;
  delete d.classifications;
  delete d.contactDuty;
  delete d.leadSpread;
  const g = { ...d.governance! } as Record<string, unknown>;
  delete g.themeId;
  delete g.review;
  d.governance = g as HiringLabData["governance"];
  d.storyVersion = "maya-1";
  return d as HiringLabData;
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
function course(data = maya()) {
  const c = createGuide(db, jordan, { title: "ZZ Test growing a partner business", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const decision = (patch: Partial<Decision> = {}): Decision => ({
  recruit: true,
  optionId: "add-06",
  startMonth: 1,
  temporary: true,
  pace: false,
  workflow: false,
  monitor: true,
  incomeBasis: "agreement",
  rationale: "Sam's workload passes the threshold by Month 3, so recruit 0.6 FTE now with temporary help, and watch cash and the reserve.",
  changeIf: "If the leave or the slower payments push cash below the reserve, I'd revisit.",
  ...patch,
});
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? ORDER BY rowid").all(guideId) as { event: string; detail: string }[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, casey] = ["jordan", "riley", "casey"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("older cases and attempts", () => {
  it("a case saved before lab 2 still reconciles, publishes and shows a window", () => {
    expect(caseProblems(legacy())).toEqual([]);
    expect(publishChecks(doc(legacy()) as never, "confirm").blocking.join(" | ")).not.toMatch(/Hiring Runway|classification/);
    const c = course(legacy());
    const v = hiringState(db, riley, c.id, "hl");
    expect(v.status).toBe("new");
    expect(labWindow(legacy()).recommendation.kind).toBe("interim-and-recruit");
  });

  it("an attempt stored before lab 2 (no views, an earlier model, a lab-1 result) still loads, resumes and shows its debrief", () => {
    const c = course(legacy());
    const guide = db.prepare("SELECT id, revision_id FROM magazine_guides WHERE id = ?").get(c.id) as { id: string; revision_id: string };
    const block = legacy() as HiringLabData;
    const oldState = {
      stage: 3,
      opened: ["agreement-b" + "xxxxx"],
      growthId: "expected",
      optionId: "add-06",
      edits: {},
      compared: ["expected"],
      initial: decision(),
      revised: decision(),
      retries: 0,
    };
    const oldResult = {
      versions: { lab: "hiring-lab-1", story: "maya-1", model: "hiring-model-1", rubric: "hiring-rubric-1" },
      score: 10,
      dims: { workload: 2, income: 2, economics: 2, timing: 2, protection: 2, revision: 0 },
      misconceptions: [],
      initial: null,
      revised: null,
      plan: { monthsAbove: 0, lowestCash: 1000 },
    };
    db.prepare(
      `INSERT INTO hiring_lab_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, assessment, state, result, status, started_at, updated_at, finished_at)
       VALUES ('hl-old', ?, ?, 'hl', 'riley', 1, ?, 'maya-1', 'hiring-model-1', 'hiring-rubric-1', 'formative', ?, ?, 'finished', ?, ?, ?)`,
    ).run(
      guide.id,
      guide.revision_id,
      caseHash({ id: "hl", type: "hiring", ...block } as never),
      JSON.stringify(oldState),
      JSON.stringify(oldResult),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    const v = hiringState(db, riley, c.id, "hl");
    expect(v.attemptId).toBe("hl-old");
    expect(v.state.stage).toBe(3);
    expect(v.state.views).toEqual([]);
    expect(v.earlierModel).toBe(true);
    expect(v.debrief?.range.recommendation.kind).toBeDefined();
    expect(v.debrief?.windowVersion).toBe("hiring-window-1");
    // The stored result is never rewritten by reading it.
    const kept = db.prepare("SELECT result FROM hiring_lab_attempts WHERE id = 'hl-old'").get() as { result: string };
    expect(JSON.parse(kept.result)).toEqual(oldResult);
    // And a save against it is harmless: a finished attempt stays as it was.
    saveHiring(db, riley, c.id, { blockId: "hl", state: { ...oldState, views: ["sensitivity"] } }, now);
    expect((db.prepare("SELECT state FROM hiring_lab_attempts WHERE id = 'hl-old'").get() as { state: string }).state).toBe(JSON.stringify(oldState));
  });
});

describe("the attempt with the window", () => {
  it("logs which assumption moved and the views opened, never a value, and saves are idempotent", () => {
    const c = course();
    hiringState(db, riley, c.id, "hl");
    const state = {
      stage: 1,
      opened: [],
      growthId: "faster",
      optionId: "add-06",
      edits: { newPerMonth: 4.5 },
      compared: ["expected", "faster"],
      views: ["sensitivity", "basis"],
    };
    saveHiring(db, riley, c.id, { blockId: "hl", state }, now);
    saveHiring(db, riley, c.id, { blockId: "hl", state }, now);
    const ev = events(c.id);
    const of = (name: string) => ev.filter((e) => e.event === name);
    expect(of("assumption_changed")).toHaveLength(1);
    expect(JSON.parse(of("assumption_changed")[0].detail)).toMatchObject({ input: "newPerMonth" });
    expect(of("assumption_changed")[0].detail).not.toMatch(/4\.5/);
    expect(of("scenario_compared").map((e) => JSON.parse(e.detail).view)).toEqual(["sensitivity"]);
    expect(of("source_opened").map((e) => JSON.parse(e.detail).source)).toEqual(["calculation-basis"]);
    // Nothing in the log is a business figure or a typed explanation.
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    commitRevised(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    const all = events(c.id)
      .map((e) => e.detail)
      .join(" ");
    expect(all).not.toMatch(/Sam's workload|reserve, I'd revisit|7550|7,550|\$360/);
  });

  it("shows the decision window in the debrief, and the Work Tool link only to someone who may plan a business", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    const r = commitRevised(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    expect(r.debrief?.range.pressure).not.toBeNull();
    expect(r.debrief?.range.recommendation.headline).not.toMatch(/\b\d+ (clients|participants)\b/);
    expect(r.planner).toBeNull();
    commitInitial(db, casey, c.id, { blockId: "hl", decision: decision() }, now);
    const owner = commitRevised(db, casey, c.id, { blockId: "hl", decision: decision() }, now);
    expect(owner.planner).toBe("/tools/caseload-margin");
    // Before the debrief, nobody gets the link.
    expect(hiringState(db, jordan, c.id, "hl").planner).toBeNull();
  });

  it("a classification mix that doesn't match the caseload can't publish, and the mix never changes the window", () => {
    const off = maya();
    off.classifications = [0, 5, 9, 10, 7, 3, 0, 0];
    expect(caseProblems(off).join(" ")).toMatch(/classification mix adds up to 34, but the caseload is 35/);
    const shuffled = maya();
    shuffled.classifications = [35, 0, 0, 0, 0, 0, 0, 0];
    expect(caseProblems(shuffled)).toEqual([]);
    expect(labWindow(shuffled)).toEqual(labWindow(maya()));
  });
});

describe("register and Admin: aggregate only", () => {
  it("lists each published lab with versions and counts, suppresses small groups, and is for authors", () => {
    const c = course();
    commitInitial(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    commitRevised(db, riley, c.id, { blockId: "hl", decision: decision() }, now);
    const rows = hiringRegister(db, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ responseId: `${c.id}:hl`, started: 1, finished: 1, people: 1, suppressed: true, misconceptions: "", sensitivity: "" });
    expect(rows[0].version).toMatch(/maya-2 · hiring-lab-2 · hiring-model-2 · hiring-window-1 · hiring-rubric-1/);
    expect(JSON.stringify(rows)).not.toMatch(/riley|Sam's workload/);
    expect(() => hiringAdmin(db, riley, now, {})).toThrow();
    const admin = hiringAdmin(db, jordan, now, plannerReport(db, jordan));
    expect(admin.labs).toHaveLength(1);
    expect(JSON.stringify(admin.planner)).not.toMatch(/taylor|casey/i);
  });

  it("adds a Hiring Runway sheet to the decision register workbook", () => {
    course();
    const { buffer } = exportRegister(db, jordan, {}, now);
    const files = unzipSync(new Uint8Array(buffer));
    const book = strFromU8(files["xl/workbook.xml"]);
    expect(book).toMatch(/Hiring Runway labs/);
  });
});
