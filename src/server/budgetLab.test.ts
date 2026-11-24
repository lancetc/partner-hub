import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ensureProblems, exportRegister } from "./problemDesk";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { budgetLabHardProblems, type BudgetLabData } from "@/lib/budgetLab";
import { charactersInBlock } from "@/lib/characters";
import { DOT_QUARTER_END } from "@/content/budgetLabCases";
import {
  budgetLabPlacements,
  budgetLabRegister,
  budgetLabState,
  budgetLabStats,
  retryBudgetLab,
  saveBudgetLab,
  submitBudgetLab,
  viewedBudgetLab,
} from "./budgetLab";

/*
  The Quarterly Budget Decision Lab on the server: it can't publish unsigned or on a rule set the reviewers didn't check;
  readers get no feedback before they submit; the steps open in order; completion needs the feedback viewed; each
  attempt keeps its versions and debrief; a retry is its own attempt with a variation; events hold no words; a Topic
  card gets the same block; authors see totals only (PRD acceptance criteria 1, 3, 8 to 10, 12 to 15).
*/

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-24T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  operations: "Ops",
  policy: "Policy",
  quality: "Quality",
  learning: "Learning",
  approvedOn: "2026-11-24",
  effectiveFrom: "2026-11-24",
  reviewBy: "2027-05-01",
  ruleSetReviewed: DOT_QUARTER_END.ruleSetId,
};
const lab = (signed = true, over: Partial<BudgetLabData> = {}): BudgetLabData => ({
  ...structuredClone(DOT_QUARTER_END),
  ...(signed && { approval: SIGNED }),
  ...over,
});
const doc = (data: BudgetLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Quarter end",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Dot", blocks: [{ id: "ql", type: "budgetlab", ...data }] }],
    },
  ],
});
function course(data = lab()) {
  const c = createGuide(db, jordan, { title: "Dot at quarter end", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];
const REASON = "Dot asked for her physio back and it can be delivered; I explained her contributions and what carries over.";

/** The steps, played strongly, up to the reason. */
function workThrough(guideId: string, user: User, proposed: { serviceId: string; date: string }[] = [{ serviceId: "physio", date: "2026-12-15" }]) {
  saveBudgetLab(
    db,
    user,
    guideId,
    {
      blockId: "ql",
      state: { stage: 1, opened: ["doc:statement", "doc:careplan"], answers: { projected: "projected", booked: "estimate", carry: "threshold" } },
    },
    now,
  );
  saveBudgetLab(db, user, guideId, { blockId: "ql", state: { stage: 2, conversation: "ask-dot" } }, now);
  return saveBudgetLab(
    db,
    user,
    guideId,
    { blockId: "ql", state: { stage: 3, conversation: "ask-dot", proposed, unchanged: !proposed.length, equipment: "at-hm" } },
    now,
  );
}
const submit = (guideId: string, user: User, over: Record<string, unknown> = {}) =>
  submitBudgetLab(db, user, guideId, { blockId: "ql", explanation: "plain", nextStep: "record", reason: REASON, ...over }, now);

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("publishing (criteria 1 and 14)", () => {
  it("ships unsigned, can't be published without its sign-off, and “Publish anyway” doesn’t cover it", () => {
    expect(Object.values(DOT_QUARTER_END.approval).every((v) => v === "")).toBe(true);
    expect(budgetLabHardProblems(lab(false), "2026-11-24").join(" ")).toMatch(/record the owner, Operations\/Finance/);
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc(lab(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Quarterly Budget Decision Lab needs/);
    expect(() => course()).not.toThrow();
  });

  it("is Review required when the reviewers signed off a different rule set, or the rules are past review", () => {
    const stale = lab(true, { approval: { ...SIGNED, ruleSetReviewed: "sah-quarter-end-2026-01" } });
    expect(budgetLabHardProblems(stale, "2026-11-24").join(" ")).toMatch(/Review required/);
    expect(budgetLabHardProblems(lab(), "2027-06-01").join(" ")).toMatch(/Review required/);
    expect(budgetLabHardProblems(lab(), "2026-11-24")).toEqual([]);
  });

  it("names Dot and Fiona for the character library, and keeps Dot’s established facts", () => {
    expect(charactersInBlock({ type: "budgetlab", ...DOT_QUARTER_END }).map((p) => [p.name, p.role])).toEqual([
      ["Dot", "participant"],
      ["Fiona", "family"],
    ]);
    expect(DOT_QUARTER_END.story.about).toMatch(/roses.*bowls on Thursday mornings.*Osteoarthritis in both hands.*Lena/);
    expect(DOT_QUARTER_END.story.decisionMaker).toMatch(/Dot makes her own decisions/);
  });

  it("reads back from stored JSON unchanged", () => {
    const parsed = allBlocks(readGuideDoc(doc(lab()) as never)).find((b) => b.type === "budgetlab")! as unknown as BudgetLabData;
    expect(parsed).toEqual({ id: "ql", type: "budgetlab", ...lab() });
  });
});

describe("an attempt", () => {
  it("gives readers no feedback, levels, flags, endings or debrief before they submit", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "budgetlab") as unknown as BudgetLabData;
    for (const q of [...b.read, b.conversation, b.equipment, b.explanation, b.nextStep])
      expect(q.options.every((o) => !o.feedback && !o.flags.length && !Object.keys(o.levels).length)).toBe(true);
    expect([b.endings.added, b.endings.unchanged, b.debrief, b.avoid.length]).toEqual(["", "", "", 0]);
    expect(budgetLabState(db, riley, c.id, "ql", {}, now).debrief).toBeNull();
  });

  it("opens each step only when the one before is done, and never skips to the consequences", () => {
    const c = course();
    expect(saveBudgetLab(db, riley, c.id, { blockId: "ql", state: { stage: 4 } }, now).state.stage).toBe(0);
    // Answers without opening the statement and care plan don't open step 2.
    expect(
      saveBudgetLab(db, riley, c.id, { blockId: "ql", state: { stage: 1, answers: { projected: "projected", booked: "estimate", carry: "threshold" } } }, now)
        .state.stage,
    ).toBe(0);
    expect(() => submit(c.id, riley)).toThrow(/Not yet/);
    const v = workThrough(c.id, riley);
    expect(v.state.stage).toBe(3);
    expect(v.status).toBe("active");
  });

  it("drops anything the engine would block, whatever the browser sends (criteria 6 and 8)", () => {
    const c = course();
    const v = workThrough(c.id, riley, [
      { serviceId: "platform-step", date: "2026-12-15" },
      { serviceId: "physio", date: "2027-01-06" },
      { serviceId: "physio", date: "2026-12-16" },
      { serviceId: "physio", date: "2026-12-22" },
    ]);
    expect(v.state.proposed).toEqual([{ serviceId: "physio", date: "2026-12-22" }]);
  });

  it("submits a response with its debrief kept as given, then completes only when the feedback is viewed", () => {
    const c = course();
    workThrough(c.id, riley);
    const v = submit(c.id, riley);
    expect(v.status).toBe("submitted");
    expect(v.debrief!.score).toBe(15);
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.ending).toBe("added");
    expect([v.debrief!.plan.projectedBalanceCents, v.debrief!.plan.projectedAboveThresholdCents]).toEqual([135_000, 35_000]);
    expect(v.debrief!.dims.find((d) => d.dim === "budget")!.why).toMatch(/\$2,400.00 now, less the \$900.00 booked estimate, is \$1,500.00 projected/);
    // A resent submit returns the same attempt; nothing new is recorded.
    const before = events(c.id).length;
    expect(submit(c.id, riley).attemptId).toBe(v.attemptId);
    expect(events(c.id).length).toBe(before);
    const done = viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    expect(done.status).toBe("completed");
    viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    const names = events(c.id).map((e) => e.event);
    expect(names).toEqual([
      "activity_started",
      "budget_information_opened",
      "budget_information_opened",
      "budget_projection_viewed",
      "budget_plan_changed",
      "funding_route_chosen",
      "participant_explanation_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
    ]);
    // No words from the learner's reason, and every event carries its versions and an idempotency key.
    for (const e of events(c.id)) {
      expect(e.detail).not.toMatch(/physio back|I explained/);
      expect(JSON.parse(e.detail)).toMatchObject({
        ruleSet: DOT_QUARTER_END.ruleSetId,
        rubric: "budget-rubric-1",
        scenario: "dot-quarter-end-1",
        place: "magazine",
      });
      expect(JSON.parse(e.detail).key).toMatch(/^bl-/);
    }
  });

  it("lets a no-additional-service ending succeed too, with a different projection (criterion 9)", () => {
    const c = course();
    // The first attempt, then a retry: the physio's books are full, so leaving the plan unchanged is defensible.
    workThrough(c.id, riley);
    const first = submit(c.id, riley);
    viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    const again = retryBudgetLab(db, riley, c.id, { blockId: "ql", from: first.attemptId }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.twist).toBe("physio-full");
    // A resent retry doesn't make a third attempt.
    expect(retryBudgetLab(db, riley, c.id, { blockId: "ql", from: first.attemptId }, now).attemptId).toBe(again.attemptId);
    workThrough(c.id, riley, []);
    const second = submit(c.id, riley);
    expect(second.debrief!.ending).toBe("unchanged");
    expect(second.debrief!.score).toBe(15);
    expect(second.debrief!.plan.projectedBalanceCents).toBe(150_000);
    // Each attempt keeps its own record and versions.
    const rows = db.prepare("SELECT attempt_no, twist, rule_set_id, rubric_version, status FROM budgetlab_attempts ORDER BY attempt_no").all();
    expect(rows).toEqual([
      { attempt_no: 1, twist: "", rule_set_id: DOT_QUARTER_END.ruleSetId, rubric_version: "budget-rubric-1", status: "completed" },
      { attempt_no: 2, twist: "physio-full", rule_set_id: DOT_QUARTER_END.ruleSetId, rubric_version: "budget-rubric-1", status: "submitted" },
    ]);
  });

  it("never rescores an old attempt: a republished course starts fresh and the old debrief stays as given (criterion 10)", () => {
    const c = course();
    workThrough(c.id, riley);
    const first = submit(c.id, riley);
    const stored = db.prepare("SELECT result FROM budgetlab_attempts WHERE id = ?").get(first.attemptId!) as { result: string };
    const changed = lab(true, { scenarioVersion: "dot-quarter-end-2", explanation: { ...DOT_QUARTER_END.explanation, prompt: "Changed" } });
    saveGuideDraft(db, jordan, c.id, { doc: doc(changed) as never }, now);
    publishGuide(db, jordan, c.id, "", now, { moveLearners: true });
    const fresh = budgetLabState(db, riley, c.id, "ql", {}, now);
    expect(fresh.attemptId).not.toBe(first.attemptId);
    expect(fresh.status).toBe("new");
    expect((db.prepare("SELECT result FROM budgetlab_attempts WHERE id = ?").get(first.attemptId!) as { result: string }).result).toBe(stored.result);
    expect(JSON.parse(stored.result).debrief.versions).toMatchObject({
      scenario: "dot-quarter-end-1",
      rubric: "budget-rubric-1",
      ruleSet: DOT_QUARTER_END.ruleSetId,
    });
  });

  it("in assessed mode, a critical error prevents a pass, and only a pass logs assessment_passed (criterion 10)", () => {
    const c = course(lab(true, { assessment: { mode: "assessed", passMark: 11 } }));
    workThrough(c.id, riley);
    const v = submit(c.id, riley, { nextStep: "claim" });
    expect(v.debrief!.unsafe).toBe(true);
    expect(v.debrief!.passed).toBe(false);
    viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    const names = events(c.id).map((e) => e.event);
    expect(names).toContain("assessment_attempted");
    expect(names).not.toContain("assessment_passed");
    // The retry is the variation where the physio has no openings: leaving the plan unchanged is the defensible ending.
    retryBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    workThrough(c.id, riley, []);
    expect(submit(c.id, riley).debrief!.passed).toBe(true);
    viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    expect(events(c.id).filter((e) => e.event === "assessment_passed")).toHaveLength(1);
  });
});

describe("placement, totals and the register (criteria 12, 13 and 15)", () => {
  it("gives a Topic card the same block, readers' copy and attempt, by reference", () => {
    const c = course();
    workThrough(c.id, riley);
    const v = budgetLabState(db, riley, c.slug, "ql", { embed: true }, now);
    expect(v.guideId).toBe(c.id);
    expect(v.block!.explanation.options.every((o) => !o.feedback)).toBe(true);
    expect(v.state.stage).toBe(3);
    expect(budgetLabPlacements(db, jordan, now).labs).toEqual([
      expect.objectContaining({ guide: c.slug, block: "ql", title: "Dot at quarter end", participant: "Dot", status: "current" }),
    ]);
    expect(() => budgetLabPlacements(db, riley, now)).toThrow();
  });

  it("shows authors totals only, suppressed under five people, and the register keeps practice apart from work measures", () => {
    const c = course();
    workThrough(c.id, riley);
    submit(c.id, riley);
    const s = budgetLabStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ attempts: 1, people: 1, submitted: 1, completed: 0, suppressed: true, dims: null, flags: null });
    expect(JSON.stringify(s)).not.toMatch(/physio back/);
    expect(() => budgetLabStats(db, riley, c.id)).toThrow();
    const [row] = budgetLabRegister(db, now);
    expect(row).toMatchObject({ blockId: "ql", ruleSet: DOT_QUARTER_END.ruleSetId, started: 1, submitted: 1, suppressed: true, misconceptions: "" });
    expect(row.placements).toEqual(["Magazine: Dot at quarter end"]);
    expect(row.measure).toMatch(/separately owned measure/);
    expect(JSON.stringify(row)).not.toMatch(/physio back/);
  });

  it("adds a Budget Decision Labs sheet to the decision register export, with no learner’s reason", () => {
    const c = course();
    workThrough(c.id, riley);
    submit(c.id, riley);
    ensureProblems(db, now);
    const files = unzipSync(new Uint8Array(exportRegister(db, jordan, { origin: "https://hub.example" }, now).buffer));
    const names = strFromU8(files["xl/workbook.xml"]);
    expect(names).toMatch(/Budget Decision Labs/);
    const all = Object.keys(files)
      .filter((k) => k.startsWith("xl/"))
      .map((k) => strFromU8(files[k]))
      .join("");
    expect(all).toMatch(/sah-quarter-end-2026-11/);
    expect(all).toMatch(/Practice evidence, not proof of performance/);
    expect(all).not.toMatch(/physio back/);
  });

  it("writes nothing outside its own attempts and events: no booking, claim or care-plan table is touched", () => {
    const c = course();
    const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name).sort();
    workThrough(c.id, riley);
    const before = tables();
    submit(c.id, riley);
    viewedBudgetLab(db, riley, c.id, { blockId: "ql" }, now);
    expect(tables()).toEqual(before);
  });
});
