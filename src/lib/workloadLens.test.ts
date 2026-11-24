import { describe, expect, it } from "vitest";
import {
  blankInputs,
  calculate,
  cleanInputs,
  inputChanges,
  resultChanges,
  validateInputs,
  type ForwardPlan,
  type Intervention,
  type ObservedWeek,
  type Task,
  type WorkloadInputs,
} from "./workloadLens";
import { WEEK_CASE } from "@/content/workloadCases";

/*
  The Workload Lens model, held to the PRD's acceptance fixtures (section 14, fixtures 2 to 7): time counted once,
  capacity and headroom to the hour, a change capped at the reviewed tasks it touches, a range rather than a verdict,
  blank/unknown/zero kept apart, and cause tags that never move a category total.
*/

const task = (over: Partial<Task> & { id: string; minutes: Task["minutes"] }): Task => ({
  label: over.id,
  category: "conversation",
  planned: "unplanned",
  causes: [],
  rework: "necessary",
  owner: "partner",
  day: 1,
  count: 1,
  ...over,
});
const week = (tasks: Task[], over: Partial<ObservedWeek> = {}): ObservedWeek => ({
  id: "w1",
  label: "Week 1",
  kind: "ordinary",
  rostered: 37.5,
  leave: 5,
  unavailable: 4,
  overdue: 0,
  tasks,
  ...over,
});
const plan = (over: Partial<ForwardPlan> = {}): ForwardPlan => ({
  rostered: 37.5,
  leave: 5,
  unavailable: 4,
  recurring: 30,
  starts: 0,
  hoursPerStart: 0,
  exceptional: 0,
  duties: 0,
  reserve: 0,
  ...over,
});
const inputs = (weeks: ObservedWeek[], p = plan(), interventions: Intervention[] = []): WorkloadInputs => ({ weeks, plan: p, interventions, guardrails: [] });
/** 30 unique task hours: 24 of necessary work and 6 of reviewed avoidable rework from an unclear handoff. */
const thirty = () => [
  task({ id: "review", category: "review", planned: "planned", minutes: 600 }),
  task({ id: "calls", category: "conversation", minutes: 480 }),
  task({ id: "supplier", category: "supplier", minutes: 360 }),
  task({ id: "rework", category: "documentation", causes: ["unclearHandoff"], rework: "avoidable", count: 4, minutes: 90 }),
];

describe("fixture 2: a task's time counts once", () => {
  it("a family call about a missed service adds its duration once; the cause is an overlay, not another bucket", () => {
    const call = task({ id: "family", category: "conversation", causes: ["missedService"], rework: "avoidable", minutes: 40 });
    const r = calculate(inputs([week([call])]));
    const w = r.weeks[0];
    expect(w.observed).toBeCloseTo(40 / 60, 2);
    expect(w.byCategory.conversation).toBeCloseTo(40 / 60, 2);
    expect(Object.values(w.byCategory).reduce((a, b) => a + b, 0)).toBeCloseTo(40 / 60, 2);
    expect(w.byCause.missedService).toBeCloseTo(40 / 60, 2);
    expect(w.reworkTagged).toBeCloseTo(40 / 60, 2);
    expect(w.partitionOk).toBe(true);
  });
});

describe("fixture 3: capacity, unrecorded time and headroom", () => {
  it("37.5 hours less 5 of leave and 4 unavailable is 28.5; 30 task hours leaves −1.5, flagged as overlap or overrun", () => {
    const r = calculate(inputs([week(thirty())]));
    expect(r.weeks[0].capacity).toBe(28.5);
    expect(r.weeks[0].observed).toBe(30);
    expect(r.weeks[0].unclassified).toBe(-1.5);
    const f = r.findings.join(" ");
    expect(f).toMatch(/overlapping entries or an overrun/);
    expect(f).toMatch(/not to anyone being unproductive/);
    expect(f).not.toMatch(/idle/);
  });

  it("a forward plan with the same 30 hours and a 3-hour reserve has −4.5 hours of headroom", () => {
    const r = calculate(inputs([week(thirty())], plan({ recurring: 30, reserve: 3 })));
    expect(r.plan.capacity).toBe(28.5);
    expect(r.plan.demand).toBe(33);
    expect(r.plan.headroom).toBe(-4.5);
  });

  it("duties are counted once: as planned demand, never also taken off capacity", () => {
    const r = calculate(inputs([week(thirty())], plan({ recurring: 27, duties: 3, reserve: 3 })));
    expect(r.plan.capacity).toBe(28.5);
    expect(r.plan.headroom).toBe(-4.5);
  });
});

describe("fixture 4: a change touches only the reviewed tasks it names", () => {
  const fix = (occurrences: number, minutesEach: number): Intervention => ({
    id: "handoff",
    label: "Fix the handoff checklist",
    kind: "process",
    cause: "unclearHandoff",
    occurrences,
    minutesEach,
    owner: "Maya",
    evidence: "Count handoff callbacks for two weeks",
    active: true,
  });

  it("6 reviewed rework hours in a 30-hour week, and a change affecting 3 of them, recovers 3 modelled hours: not 9, and not realised", () => {
    const r = calculate(inputs([week(thirty())], plan({ recurring: 30, reserve: 3 }), [fix(2, 90)]));
    expect(r.weeks[0].reworkTagged).toBe(6);
    expect(r.plan.changes[0]).toMatchObject({ modelled: 3, eligible: 6, capped: false });
    expect(r.plan.modelled).toBe(3);
    expect(r.plan.demandAfter).toBe(30);
    expect(r.plan.headroomAfter).toBe(-1.5);
    expect(r.findings.join(" ")).toMatch(/modelled, not realised/);
  });

  it("never reaches past the reviewed tasks: a bigger estimate is capped at what was observed", () => {
    const r = calculate(inputs([week(thirty())], plan(), [fix(6, 90)]));
    expect(r.plan.changes[0]).toMatchObject({ modelled: 6, capped: true });
  });

  it("lets two changes aimed at the same tasks share them, never claiming more than was observed", () => {
    const second: Intervention = { ...fix(4, 90), id: "template", kind: "jobaid", label: "A handoff template" };
    const r = calculate(inputs([week(thirty())], plan(), [fix(2, 90), second]));
    expect(r.plan.changes.map((c) => c.modelled)).toEqual([3, 3]);
    expect(r.plan.modelled).toBe(6);
  });

  it("doesn't touch necessary or unreviewed work, whatever its category", () => {
    const calls: Intervention = { ...fix(10, 60), cause: undefined, category: "conversation" };
    const r = calculate(inputs([week(thirty())], plan(), [calls]));
    expect(r.plan.changes[0].modelled).toBe(0);
  });
});

describe("fixture 5: a spread, not a verdict", () => {
  it("weeks of 25 and 35 hours show the range and the sample count; the 30-hour average isn't a staffing verdict", () => {
    const a = week([task({ id: "a", minutes: 25 * 60 })], { id: "w1", label: "Week 1" });
    const b = week([task({ id: "a", minutes: 35 * 60 })], { id: "w2", label: "Week 2", kind: "pressured" });
    const r = calculate(inputs([a, b]));
    expect(r.sample).toBe(2);
    expect(r.evidence).toBe("few");
    expect(r.observed).toEqual({ min: 25, max: 35, mean: 30, spread: 10 });
    const f = r.findings.join(" ");
    expect(f).toMatch(/2 weeks sampled/);
    expect(f).toMatch(/from 25 h to 35 h/);
    expect(f).toMatch(/isn’t a staffing verdict/);
    expect(f).not.toMatch(/you need|hire now|permanent/i);
  });

  it("labels a single week as an illustration, not a forecast", () => {
    const r = calculate(inputs([week(thirty())]));
    expect(r.evidence).toBe("single");
    expect(r.findings.join(" ")).toMatch(/illustrative scenario, not a forecast/);
  });
});

describe("fixture 6: blank, unknown and zero are different", () => {
  it("a blank duration is an error to fix, “not measured” is kept out of the hours, and zero is zero", () => {
    const blank = inputs([week([task({ id: "x", minutes: null })])]);
    expect(
      validateInputs(blank)
        .map((e) => e.message)
        .join(" "),
    ).toMatch(/minutes are blank/);

    const unknown = calculate(inputs([week([task({ id: "x", minutes: "unknown" }), task({ id: "y", minutes: 60 })])]));
    expect(validateInputs(inputs([week([task({ id: "x", minutes: "unknown" })])]))).toEqual([]);
    expect(unknown.weeks[0].observed).toBe(1);
    expect(unknown.weeks[0].unmeasured).toBe(1);
    expect(unknown.findings.join(" ")).toMatch(/not counted as zero/);

    const zero = calculate(inputs([week([task({ id: "x", minutes: 0 }), task({ id: "y", minutes: 60 })])]));
    expect(zero.weeks[0].observed).toBe(1);
    expect(zero.weeks[0].unmeasured).toBe(0);
  });

  it("keeps the three states through storage, and a blank plan figure isn't read as zero", () => {
    const stored = cleanInputs(
      JSON.parse(JSON.stringify(inputs([week([task({ id: "a", minutes: null }), task({ id: "b", minutes: "unknown" }), task({ id: "c", minutes: 0 })])]))),
    );
    expect(stored.weeks[0].tasks.map((t) => t.minutes)).toEqual([null, "unknown", 0]);
    expect(validateInputs(blankInputs()).length).toBeGreaterThan(5);
    expect(validateInputs({ ...inputs([week(thirty())]), plan: plan({ reserve: null }) }).map((e) => e.field)).toEqual(["plan.reserve"]);
  });
});

describe("fixture 7: what changed", () => {
  it("changing a cause tag leaves the category totals unchanged, and says so", () => {
    const before = inputs([week(thirty())]);
    const after = structuredClone(before);
    after.weeks[0].tasks[1].causes = ["missedService"];
    const a = calculate(before);
    const b = calculate(after);
    expect(b.weeks[0].byCategory).toEqual(a.weeks[0].byCategory);
    expect(b.weeks[0].observed).toBe(a.weeks[0].observed);
    expect(b.weeks[0].byCause.missedService).toBe(8);
    expect(inputChanges(before, after).join(" ")).toMatch(/category totals don’t change/);
    expect(resultChanges(a, b)).toEqual([]);
  });

  it("changing a duration updates the total and the explanation", () => {
    const before = inputs([week(thirty())]);
    const after = structuredClone(before);
    after.weeks[0].tasks[1].minutes = 510;
    const b = calculate(after);
    expect(b.weeks[0].observed).toBe(30.5);
    expect(b.weeks[0].unclassified).toBe(-2);
    expect(inputChanges(before, after).join(" ")).toMatch(/480 min → 1 × 510 min \(\+0\.5 h/);
    expect(resultChanges(calculate(before), b).join(" ")).toMatch(/30 h → 30\.5 h/);
  });
});

describe("the fictional week", () => {
  it("validates, partitions every week exactly, and has something to find", () => {
    expect(validateInputs(WEEK_CASE.inputs)).toEqual([]);
    const r = calculate(WEEK_CASE.inputs);
    expect(r.weeks.every((w) => w.partitionOk)).toBe(true);
    expect(r.weeks.some((w) => w.reworkTagged > 0)).toBe(true);
    expect(r.plan.headroom).toBeLessThan(0);
    // Rework is named by its source; a change in need is called necessary, never something to cut.
    const f = r.findings.join(" ");
    expect(f).toMatch(/largest source of reviewed rework is invoice or data correction: 1.5 h a week, on average/);
    expect(f).toMatch(/followed a change in a client’s needs: necessary work, not something to cut/);
  });
});
