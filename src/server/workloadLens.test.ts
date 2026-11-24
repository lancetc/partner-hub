import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, workloadForReaders, workloadHardProblems, type WorkloadLabData } from "@/lib/workloadLab";
import { blankInputs } from "@/lib/workloadLens";
import { charactersInBlock } from "@/lib/characters";
import { COORDINATOR_WEEK } from "@/content/workloadCases";
import { ensurePlanner } from "./caseloadPlanner";
import {
  businessHome,
  finishWorkload,
  getScenario,
  retryWorkload,
  saveScenario,
  saveWorkload,
  submitPrediction,
  workloadState,
  workloadStats,
} from "./workloadLens";

/*
  The Workload Lens on the server: a fictional case that passes its check and can't publish unsigned, no answer key
  for readers, the debrief only once the steps are done, telemetry with no words or hours, and private team maps
  nobody outside the business can reach (PRD section 14, fixture 8).
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-23T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  operations: "Ops",
  quality: "Quality",
  partnerships: "Partnerships",
  privacy: "Privacy",
  pilot: "Pilot",
  approvedOn: "2026-11-23",
  reviewBy: "2027-06-30",
};
const week = (signed = true): WorkloadLabData => {
  const d = structuredClone(COORDINATOR_WEEK);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: WorkloadLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Sam’s week",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The week", blocks: [{ id: "wl", type: "workload", ...data }] }],
    },
  ],
});
function course(data = week()) {
  const c = createGuide(db, jordan, { title: "Where does a coordinator’s week go?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
const TAGS = {
  call: { category: "conversation", causes: ["missedService"], prompt: null },
  hospital: { category: "escalation", causes: ["needChanged"], prompt: true },
  "plan-doc": { category: "documentation", causes: ["noRework"], prompt: false },
  invoice: { category: "supplier", causes: ["invoiceCorrection"], prompt: null },
  handoff: { category: "documentation", causes: ["unclearHandoff"], prompt: null },
};
/** Works through every step before the decision: the prediction, the tags, the map, a story detail and a change. */
function workThrough(guideId: string, user: User, tags: Record<string, unknown> = TAGS) {
  submitPrediction(db, user, guideId, { blockId: "wl", prediction: { constraint: "unplanned", hours: 8 } }, now);
  return saveWorkload(
    db,
    user,
    guideId,
    {
      blockId: "wl",
      state: {
        stage: 3,
        tags,
        inspected: ["cat:conversation", "week:week-before"],
        details: ["call"],
        tried: ["handoff-fix"],
        estimates: { "handoff-fix": { occurrences: 2, minutesEach: 30 } },
        changed: true,
      },
    },
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
    const parsed = allBlocks(readGuideDoc(doc(week()) as never)).find((b) => b.type === "workload")!;
    expect(parsed).toMatchObject({ type: "workload", title: COORDINATOR_WEEK.title, storyVersion: COORDINATOR_WEEK.storyVersion });
    expect((parsed as unknown as WorkloadLabData).inputs).toEqual(COORDINATOR_WEEK.inputs);
    expect((parsed as unknown as WorkloadLabData).events).toEqual(COORDINATOR_WEEK.events);
    expect(caseProblems(COORDINATOR_WEEK)).toEqual([]);
  });

  it("ships with its sign-off empty, can't be published without it, and “Publish anyway” doesn’t cover it", () => {
    expect(Object.values(COORDINATOR_WEEK.approval).every((v) => v === "")).toBe(true);
    expect(workloadHardProblems(week(false), "2026-11-23").join(" ")).toMatch(/record the owner/);
    const c = createGuide(db, jordan, { title: "Sam’s week", completion: "confirm", doc: doc(week(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Workload Lens block needs/);
    expect(() => course()).not.toThrow();
  });

  it("names Maya for the character library, and not Sam, whose bare name is already a Trilogy Care team member there", () => {
    const named = charactersInBlock({ type: "workload", ...COORDINATOR_WEEK });
    expect(named.map((p) => [p.name, p.role])).toEqual([["Maya", "other"]]);
  });

  it("gives learners no answer key: reviewed tags, likely answer, feedback, levels, flags and the debrief stay on the server", () => {
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const b = allBlocks(g.doc).find((x) => x.type === "workload") as unknown as WorkloadLabData;
    expect(b.prediction.options.every((x) => !x.likely)).toBe(true);
    expect(b.events.every((e) => !e.feedback && !e.answer.causes.length && e.answer.prompt === null)).toBe(true);
    // The tasks the events became don't give the tags away either.
    const asked = new Set(COORDINATOR_WEEK.events.map((e) => e.task));
    for (const t of b.inputs.weeks[0].tasks.filter((x) => asked.has(x.id))) {
      expect(t.category).toBe("other");
      expect(t.causes).toEqual([]);
      expect(t.prompt).toBeUndefined();
    }
    expect(b.explanations.every((x) => !x.feedback && !x.flags.length && !Object.keys(x.levels).length)).toBe(true);
    expect(b.decisions.every((x) => !x.outcome && !x.feedback)).toBe(true);
    expect(b.debrief).toBe("");
    expect(workloadForReaders(COORDINATOR_WEEK).inputs.plan).toEqual(COORDINATOR_WEEK.inputs.plan);
  });
});

describe("an attempt", () => {
  it("opens the week only after the prediction, and sends the debrief only once every step is done", () => {
    const c = course();
    const early = saveWorkload(db, riley, c.id, { blockId: "wl", state: { stage: 4 } }, now);
    expect(early.state.stage).toBeLessThanOrEqual(1);
    expect(() => finishWorkload(db, riley, c.id, { blockId: "wl", explanation: "mix", decision: "process" }, now)).toThrow(/Make your prediction first/);
    submitPrediction(db, riley, c.id, { blockId: "wl", prediction: { constraint: "unplanned", hours: 8 } }, now);
    expect(() => finishWorkload(db, riley, c.id, { blockId: "wl", explanation: "mix", decision: "process" }, now)).toThrow(/Tag every event/);
    workThrough(c.id, riley);
    const v = finishWorkload(db, riley, c.id, { blockId: "wl", explanation: "mix", decision: "process" }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBe(12);
    expect(v.debrief!.tags.every((t) => t.category)).toBe(true);
    expect(v.debrief!.decision.outcome).toMatch(/review happens on Monday/);
    // The handoff fix, at 1 h, takes next week from 2 h short to 1 h short: modelled.
    expect(v.debrief!.before.headroom).toBe(-2);
    expect(v.debrief!.after).toEqual({ headroom: -1, modelled: 1 });
    expect(workloadState(db, riley, c.id, "wl").debrief).not.toBeNull();
  });

  it("flags treating a necessary call as waste, and putting off a prompt escalation, above any total", () => {
    const c = course();
    workThrough(c.id, riley, { ...TAGS, hospital: { category: "escalation", causes: ["needChanged"], prompt: false } });
    const d = finishWorkload(db, riley, c.id, { blockId: "wl", explanation: "calls", decision: "shorten" }, now).debrief!;
    expect(d.flags.map((f) => f.id).sort()).toEqual(["cutReview", "delayed", "waste"]);
    expect(d.score).toBeLessThan(6);
  });

  it("keeps every attempt, and logs fictional choices, levels and flags only: no words, no hours", () => {
    const c = course();
    workThrough(c.id, riley);
    finishWorkload(db, riley, c.id, { blockId: "wl", explanation: "mix", decision: "process" }, now);
    const again = retryWorkload(db, riley, c.id, { blockId: "wl" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.stage).toBe(0);
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "workload_started",
        "prediction_submitted",
        "event_tagged",
        "map_inspected",
        "detail_opened",
        "change_tried",
        "decision_submitted",
        "workload_completed",
        "retry_started",
      ]),
    );
    const text = log.map((e) => e.detail).join(" ");
    expect(text).not.toMatch(/Maya|Sam|shower|26,720|"hours"/);
    expect(workloadStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null, decisions: null });
    expect(() => workloadStats(db, riley, c.id)).toThrow();
  });
});

describe("Map my team’s week", () => {
  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ orgName: expect.any(String), role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, scenarios: [] });
    expect(() => saveScenario(db, sam, { name: "Mine", inputs: blankInputs() }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions, keeps blank and “not measured” apart, and shows the last change beside the new one", () => {
    const blank = blankInputs();
    const v1 = saveScenario(db, casey, { name: "March weeks", inputs: blank }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.weeks[0].tasks[0].minutes).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    const next = structuredClone(blank);
    next.weeks[0].tasks[0].minutes = "unknown";
    const v2 = saveScenario(
      db,
      casey,
      { id: v1.id, inputs: next, review: { change: "Fix the discharge handoff", owner: "Principal", expectedHours: 1.5, reviewBy: "2026-12-07" } },
      now,
    );
    expect(v2.version).toBe(2);
    expect(v2.inputs.weeks[0].tasks[0].minutes).toBe("unknown");
    const v3 = saveScenario(db, casey, { id: v1.id, inputs: next, review: { followUp: { helped: "partly", note: "Fewer calls" } } }, now);
    expect(v3.previous).toMatchObject({ number: 2, review: { change: "Fix the discharge handoff", expectedHours: 1.5 } });
    expect(v3.review.followUp).toEqual({ helped: "partly", note: "Fewer calls" });
    expect(getScenario(db, casey, v1.id, 1).inputs.weeks[0].tasks[0].minutes).toBeNull();
    expect(businessHome(db, casey).scenarios).toHaveLength(1);
  });

  it("can't be read by anyone outside the business, whatever id they ask for, and never reaches the authors' totals", () => {
    const s = saveScenario(db, casey, { name: "March weeks", inputs: blankInputs() }, now);
    expect(() => getScenario(db, sam, s.id)).toThrow(/business owner/);
    // The author and superadmin, without planner access to that business, gets nothing either.
    expect(() => getScenario(db, jordan, s.id)).toThrow();
    // An owner of another business, with access of their own, still can't reach it.
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getScenario(db, riley, s.id)).toThrow(/isn’t here/);
    expect(() => saveScenario(db, riley, { id: s.id, inputs: blankInputs() }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).scenarios).toEqual([]);
    const c = course();
    expect(workloadStats(db, jordan, c.id).blocks).toEqual([]);
  });
});
