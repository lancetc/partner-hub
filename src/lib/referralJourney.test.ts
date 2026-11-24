import { describe, expect, it } from "vitest";
import {
  attribute,
  blankInputs,
  blankRow,
  calculate,
  calendarMonth,
  cleanInputs,
  comparable,
  inputChanges,
  rate,
  validateInputs,
  zeroBlanks,
  type CohortRow,
  type ReferralInputs,
  type ReferralRecord,
} from "./referralJourney";
import { caseProblems, updatedInputs } from "./referralLab";
import { REFERRAL_ACTIVE } from "@/content/referralCases";

/*
  The Referral Journey model, held to the PRD's acceptance fixtures (section 14, fixtures 2 to 9) with exact numbers:
  one arrival cohort and a stated denominator; stage-matched rates; a mature denominator for continuity; relationship
  hours per start with onboarding apart; a median only from exact dates; one person counted once; no calendar-month
  "conversion"; small samples too early to rank; and blank, unknown and zero kept apart.
*/

const person = (id: string, over: Partial<ReferralRecord> = {}): ReferralRecord => ({
  id,
  area: "",
  enquiredOn: "2026-01-10",
  contacts: [{ source: "gp", on: over.enquiredOn ?? "2026-01-10", authorised: true }],
  attribution: "",
  initialStage: "allocated",
  laterStage: "",
  introducedOn: "",
  pathwayOn: "",
  allocatedOn: "",
  agreedOn: "",
  startedOn: "",
  closed: "",
  closedOn: "",
  wait: "",
  exitedOn: "",
  exitReason: "",
  ...over,
});
const started = (id: string, startedOn: string, over: Partial<ReferralRecord> = {}) =>
  person(id, { introducedOn: "2026-01-11", pathwayOn: "2026-01-12", agreedOn: startedOn, startedOn, ...over });
const records = (rs: ReferralRecord[], over: Partial<ReferralInputs> = {}): ReferralInputs => ({
  mode: "records",
  asOf: "2026-06-30",
  timezone: "Australia/Brisbane",
  observationDays: 90,
  matureAge: 90,
  minSample: 5,
  areas: [],
  records: rs,
  effort: [],
  rows: [],
  ...over,
});
const row = (over: Partial<CohortRow> = {}): CohortRow => ({
  ...zeroBlanks(blankRow("r1", "2026-01")),
  ...over,
});
const aggregate = (rows: CohortRow[], over: Partial<ReferralInputs> = {}): ReferralInputs => ({ ...blankInputs("2026-06-30"), minSample: 5, rows, ...over });
const gp = (i: ReferralInputs) => calculate(i).sources.find((s) => s.source === "gp")!;

describe("fixture 2: one arrival cohort, a stated denominator, and stage-matched rates", () => {
  // 12 distinct January enquiries; 8 already allocated at first contact; all 6 first services from that group.
  const cohort = records([
    ...Array.from({ length: 6 }, (_, k) => started(`A${k + 1}`, "2026-02-02")),
    ...["A7", "A8"].map((id) => person(id)),
    ...["W1", "W2", "W3", "W4"].map((id) => person(id, { initialStage: "waiting", wait: "funding" })),
  ]);

  it("shows the overall service-start rate as 6/12 = 50%, and the stage-matched rate as 6/8 = 75%", () => {
    const s = gp(cohort);
    expect(s.enquiries).toBe(12);
    expect(s.stages.allocated).toBe(8);
    expect(s.startRate).toMatchObject({ num: 6, den: 12, value: 0.5, text: "6/12 = 50%" });
    expect(s.stageMatched.allocated).toMatchObject({ num: 6, den: 8, value: 0.75, text: "6/8 = 75%" });
    expect(s.stageMatched.waiting.text).toBe("0/4 = 0%");
    expect(calculate(cohort).period).toBe("January 2026 enquiries");
  });

  it("doesn’t label the four people waiting for funding as lost: they’re open, with their ages and the reason", () => {
    const s = gp(cohort);
    expect(s.closed).toBe(0);
    expect(s.closedReasons).toEqual([]);
    expect(s.open).toBe(6);
    expect(s.waits.funding).toBe(4);
    expect(s.timing.open.filter((o) => o.wait === "funding").map((o) => o.age)).toEqual([171, 171, 171, 171]);
    expect(s.caution.join(" ")).toMatch(/4 waiting for a funding allocation: open, not lost/);
  });

  it("says “insufficient data”, never 0% or infinity, when a denominator is zero", () => {
    expect(rate(0, 0)).toEqual({ num: 0, den: 0, value: null, text: "insufficient data" });
    expect(gp(cohort).stageMatched.urgent.text).toBe("insufficient data");
    expect(gp(cohort).effort.perStart.text).toBe("insufficient data");
    expect(gp(records([person("Z1")])).continuity.rate.text).toBe("insufficient data");
  });
});

describe("fixture 3: continuity uses the mature denominator", () => {
  it("shows 4/5 = 80% for 8 starts, 5 old enough for a 90-day outcome and 4 still active: never divided by eight", () => {
    const old = ["2026-01-20", "2026-01-25", "2026-02-01", "2026-02-10", "2026-03-01"];
    const recent = ["2026-05-01", "2026-05-20", "2026-06-10"];
    const i = records([
      ...old.map((d, k) => started(`M${k + 1}`, d, k === 0 ? { exitedOn: "2026-02-20", exitReason: "residential" } : {})),
      ...recent.map((d, k) => started(`N${k + 1}`, d)),
    ]);
    const c = gp(i).continuity;
    expect(c).toMatchObject({ days: 90, starts: 8, mature: 5, active: 4 });
    expect(c.rate).toMatchObject({ num: 4, den: 5, text: "4/5 = 80%" });
    // Shown by reason: a move to residential care isn't a failed referral.
    expect(c.exits).toEqual([{ reason: "residential", count: 1 }]);
  });

  it("does the same from manual cohorts, and won’t accept more mature starts than starts", () => {
    const r = row({
      enquiries: 10,
      stages: { ...row().stages, allocated: 10 },
      introduced: 10,
      pathway: 9,
      agreed: 8,
      started: 8,
      closed: 2,
      matureStarts: 5,
      active: 4,
    });
    r.bands = { ...r.bands, d15_30: 8 };
    r.exits = [{ reason: "died", count: 1 }];
    expect(validateInputs(aggregate([r]))).toEqual([]);
    expect(gp(aggregate([r])).continuity.rate.text).toBe("4/5 = 80%");
    const bad = validateInputs(aggregate([{ ...r, matureStarts: 9 }])).map((e) => e.message);
    expect(bad.join(" ")).toMatch(/9 mature starts, more than the 8 total starts/);
  });
});

describe("fixture 4: relationship hours per start, with onboarding shown apart", () => {
  const effort = { meetings: 6, travel: 4, materials: 3, followUp: 5, onboarding: 12, costs: "unknown" as const, observed: true };
  const i = records(
    Array.from({ length: 6 }, (_, k) => started(`E${k + 1}`, "2026-02-01")),
    { effort: [{ id: "e1", source: "gp", month: "2026-01", effort }] },
  );

  it("shows 18 recorded relationship hours and 6 first services as 3 hours per start", () => {
    const e = gp(i).effort;
    expect(e.relationship).toBe(18);
    expect(e.perStart).toMatchObject({ num: 18, den: 6, value: 3, text: "18 h / 6 starts = 3 h per start" });
  });

  it("keeps case onboarding separate: neither added to the 18 hours nor silently dropped", () => {
    const e = gp(i).effort;
    expect(e.onboarding).toBe(12);
    expect(e.onboardingPerStart.text).toBe("12 h / 6 starts = 2 h per start");
    expect(e.note).toMatch(/Case onboarding is shown separately/);
    expect(e.costs).toBe("unknown");
  });
});

describe("fixture 5: time to first service is a distribution", () => {
  it("gives a median of 21 days for starts at 7, 21 and 35 days, with the still-open enquiries and their ages", () => {
    const i = records([
      started("T1", "2026-01-17"),
      started("T2", "2026-01-31"),
      started("T3", "2026-02-14"),
      person("T4", { initialStage: "waiting", wait: "funding" }),
      person("T5", { enquiredOn: "2026-01-20", contacts: [{ source: "gp", on: "2026-01-20", authorised: true }], wait: "capacity" }),
    ]);
    const t = gp(i).timing;
    expect(t.days).toEqual([7, 21, 35]);
    expect(t).toMatchObject({ exact: true, started: 3, median: 21, min: 7, max: 35 });
    expect(t.open).toEqual([
      { id: "T4", age: 171, wait: "funding", stage: "waiting" },
      { id: "T5", age: 161, wait: "capacity", stage: "allocated" },
    ]);
    expect(t.bands).toMatchObject({ d0_14: 1, d15_30: 1, d31_60: 1, d61: 0 });
  });

  it("separates the wait before a funding allocation from the time after it, and labels what isn’t known", () => {
    const i = records([
      started("F1", "2026-03-20", { initialStage: "waiting", allocatedOn: "2026-03-01" }),
      started("F2", "2026-03-20", { initialStage: "waiting" }),
      started("F3", "2026-01-24"),
    ]);
    expect(gp(i).timing.segments).toEqual([
      { id: "F1", total: 69, before: 50, after: 19 },
      { id: "F2", total: 69, before: "unknown", after: "unknown" },
      { id: "F3", total: 14, before: "n/a", after: 14 },
    ]);
  });

  it("never fabricates an exact median from manual time bands", () => {
    const r = row({ enquiries: 3, stages: { ...row().stages, allocated: 3 }, introduced: 3, pathway: 3, agreed: 3, started: 3, matureStarts: 0, active: 0 });
    r.bands = { ...r.bands, d0_14: 1, d15_30: 1, d31_60: 1 };
    const t = gp(aggregate([r])).timing;
    expect(t).toMatchObject({ exact: false, median: null, min: null, max: null });
    expect(t.bands).toMatchObject({ d0_14: 1, d15_30: 1, d31_60: 1 });
    expect(t.note).toMatch(/no exact median/);
  });
});

describe("fixture 6: one person counts once", () => {
  it("counts a person introduced by a GP and later mentioned by a pharmacist once, with the pharmacist as an assist", () => {
    const p = started("D1", "2026-02-01", {
      contacts: [
        { source: "other", on: "2026-01-20", authorised: false },
        { source: "gp", on: "2026-01-10", authorised: true },
      ],
    });
    expect(attribute(p)).toEqual({ source: "gp", rule: "authorised", assists: ["other"] });
    const r = calculate(records([p]));
    expect(r.all.enquiries).toBe(1);
    expect(r.all.funnel.started.count).toBe(1);
    expect(gp(records([p]))).toMatchObject({ enquiries: 1, assists: 0 });
    const pharmacist = r.sources.find((s) => s.source === "other")!;
    expect(pharmacist).toMatchObject({ enquiries: 0, assists: 1 });
    expect(pharmacist.startRate.text).toBe("insufficient data");
    expect(pharmacist.caution[0]).toMatch(/Assists only/);
  });

  it("supports Unknown or multiple, and a reviewed attribution", () => {
    const multiple = person("U1", {
      contacts: [
        { source: "other", on: "2026-01-10", authorised: false },
        { source: "self", on: "2026-01-12", authorised: false },
      ],
    });
    expect(attribute(multiple).source).toBe("unknown");
    expect(calculate(records([multiple])).sources.map((s) => [s.source, s.enquiries])).toEqual([
      ["self", 0],
      ["other", 0],
      ["unknown", 1],
    ]);
    expect(attribute({ ...multiple, attribution: "self" })).toEqual({ source: "self", rule: "reviewed", assists: ["other"] });
  });

  it("won’t accept the same person twice", () => {
    expect(validateInputs(records([person("X1"), person("X1")])).map((e) => e.message)).toEqual([
      "Enquiry X1 appears twice. One person counts once: merge the rows and keep the other contact as an assist.",
    ]);
  });
});

describe("fixture 7: starts belong to their arrival cohort", () => {
  it("never divides a current-month start from a January enquiry by current-month enquiries", () => {
    const i = records(
      [
        started("J1", "2026-03-15"),
        person("J2"),
        ...["Q1", "Q2", "Q3"].map((id) => person(id, { enquiredOn: "2026-03-05", contacts: [{ source: "gp", on: "2026-03-05", authorised: true }] })),
      ],
      { asOf: "2026-03-31" },
    );
    const march = calculate(i, { months: ["2026-03"] }).sources[0];
    expect(march.startRate.text).toBe("0/3 = 0%");
    expect(march.caution.join(" ")).toMatch(/3 enquiries are under 90 days old: open, not yet mature/);
    expect(calculate(i, { months: ["2026-01"] }).sources[0].startRate.text).toBe("1/2 = 50%");
    expect(calendarMonth(i, "2026-03")).toMatchObject({ enquiries: 3, starts: 1, sameCohort: 0, earlierCohorts: 1, rate: null });
  });
});

describe("fixture 8: small samples are too early to rank", () => {
  it("warns about a source with two mature enquiries, and doesn’t rank it against a source with 50", () => {
    const many = Array.from({ length: 50 }, (_, k) => person(`G${k + 1}`));
    const few = ["C1", "C2"].map((id) => person(id, { contacts: [{ source: "community", on: "2026-01-10", authorised: true }] }));
    const r = calculate(records([...many, ...few]));
    const g = r.sources.find((s) => s.source === "gp")!;
    const c = r.sources.find((s) => s.source === "community")!;
    expect(g).toMatchObject({ mature: 50, tooEarly: false });
    expect(c).toMatchObject({ mature: 2, tooEarly: true });
    expect(c.caution[0]).toMatch(/^Too early to rank: 2 mature enquiries, fewer than 5/);
    expect(comparable(g, c)).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/too early to rank/);
  });

  it("says when stage mixes differ, so overall rates aren’t compared as like with like", () => {
    const waiting = Array.from({ length: 6 }, (_, k) => person(`W${k}`, { initialStage: "waiting" }));
    const ready = Array.from({ length: 6 }, (_, k) => person(`R${k}`, { contacts: [{ source: "community", on: "2026-01-10", authorised: true }] }));
    expect(calculate(records([...waiting, ...ready])).stageMixDiffers).toBe(true);
  });
});

describe("fixture 9: blank, unknown and zero are distinct, and counts stay inside the cohort", () => {
  it("treats a blank as an error, never as zero", () => {
    const messages = validateInputs(blankInputs("2026-06-30")).map((e) => e.message);
    expect(messages).toContain("The smallest sample to rank is blank. It’s set by the owner: enter their number of mature enquiries.");
    expect(messages.some((m) => /distinct enquiries is blank/.test(m))).toBe(true);
    expect(messages.some((m) => /relationship meetings hours is blank/.test(m))).toBe(true);
  });

  it("keeps an unknown out of the arithmetic and names it, and counts zero as zero", () => {
    const r = row({ enquiries: 6, stages: { ...row().stages, allocated: 6 }, introduced: 6, pathway: 6, agreed: 6, started: 6, matureStarts: 0, active: 0 });
    r.bands = { ...r.bands, d0_14: 6 };
    r.effort = { meetings: 6, travel: "unknown", materials: 0, followUp: 6, onboarding: "unknown", costs: "unknown", observed: true };
    const e = gp(aggregate([r])).effort;
    expect(e.relationship).toBe(12);
    expect(e.included).toEqual(["meetings", "materials", "followUp"]);
    expect(e.missing).toEqual(["travel"]);
    expect(e.note).toMatch(/Not recorded, so not included: travel and outreach/);
    expect(e.perStart.text).toBe("12 h / 6 starts = 2 h per start");
    expect(e.onboarding).toBe("unknown");
    expect(e.onboardingPerStart.text).toBe("insufficient data");
    // Not recorded by stage is "insufficient data", not zero.
    expect(gp(aggregate([r])).stageMatched.allocated.text).toBe("insufficient data (not recorded by stage)");
    expect(gp(aggregate([{ ...r, startsByStage: { ...r.startsByStage, allocated: 6 } }])).stageMatched.allocated.text).toBe("6/6 = 100%");
  });

  it("won’t let counts exceed the distinct cohort", () => {
    const r = row({ enquiries: 4, introduced: 5, agreed: 2, started: 3, open: 2, closed: 1 });
    r.stages = { ...r.stages, allocated: 3, waiting: 2 };
    const messages = validateInputs(aggregate([r])).map((e) => e.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/stage counts add to 5, more than the 4 distinct enquiries/),
        expect.stringMatching(/authorised introductions.*|5 is more than the 4 distinct enquiries/),
        expect.stringMatching(/more first services than agreements/),
        expect.stringMatching(/started, open and closed add to 6, more than the 4/),
      ]),
    );
  });

  it("reads stored JSON back with blanks as blanks and unknowns as unknowns", () => {
    const i = aggregate([{ ...blankRow("r1", "2026-01"), effort: { ...blankRow("r1", "2026-01").effort, travel: "unknown" } }]);
    const back = cleanInputs(JSON.parse(JSON.stringify(i)));
    expect(back.rows[0].enquiries).toBeNull();
    expect(back.rows[0].effort.travel).toBe("unknown");
    expect(back.rows[0].startsByStage.allocated).toBe("unknown");
    expect(back).toEqual(i);
  });
});

describe("what changed", () => {
  it("says when a waiting person’s allocation arrives and they start, in their own cohort", () => {
    const before = records([person("W1", { initialStage: "waiting", wait: "funding" })]);
    const after = records([started("W1", "2026-05-01", { initialStage: "waiting", allocatedOn: "2026-04-10", wait: "funding" })]);
    expect(inputChanges(before, after)).toEqual([
      "W1: a funding allocation arrived (10 Apr 2026).",
      "W1: agreed (1 May 2026).",
      "W1: first service (1 May 2026), counted in its January 2026 cohort.",
    ]);
  });
});

describe("the fictional case (Maya's three relationships)", () => {
  const d = REFERRAL_ACTIVE;
  const at = (i: ReferralInputs, months: string[], source: string) => calculate(i, { months }).sources.find((s) => s.source === source)!;

  it("validates, before and after the return visit, and passes its case check", () => {
    expect(validateInputs(d.inputs)).toEqual([]);
    expect(validateInputs(updatedInputs(d))).toEqual([]);
    expect(caseProblems(d)).toEqual([]);
  });

  it("shows the figures the story and its feedback quote, as of 30 September", () => {
    const r = calculate(d.inputs, { months: d.period });
    expect(r.sources.map((s) => [s.source, s.enquiries, s.funnel.started.count])).toEqual([
      ["gp", 12, 4],
      ["hospital", 6, 4],
      ["community", 5, 4],
      ["client", 2, 1],
      ["self", 0, 0],
      ["other", 0, 0],
      ["unknown", 1, 1],
    ]);
    expect(r.all).toMatchObject({ enquiries: 26, open: 8, closed: 4 });
    const gp = at(d.inputs, d.period, "gp");
    expect([gp.startRate.text, gp.stageMatched.allocated.text, gp.stageMatched.waiting.text]).toEqual(["4/12 = 33%", "3/4 = 75%", "1/5 = 20%"]);
    expect(gp.effort.perStart.text).toBe("18 h / 4 starts = 4.5 h per start");
    expect(gp.continuity).toMatchObject({ starts: 4, mature: 2, active: 2 });
    expect(gp.timing.segments.find((x) => x.id === "E05")).toEqual({ id: "E05", total: 138, before: 119, after: 19 });
    const hospital = at(d.inputs, d.period, "hospital");
    expect([hospital.startRate.text, hospital.timing.median, hospital.effort.onboardingPerStart.text]).toEqual([
      "4/6 = 67%",
      11.5,
      "28 h / 4 starts = 7 h per start",
    ]);
    expect(hospital.continuity.rate.text).toBe("3/4 = 75%");
    // Stage-matched across the stages at which a person can choose: urgent and considering a change count, not only allocated.
    expect([gp.readyMatched.text, hospital.readyMatched.text, hospital.stageMatched.allocated.text]).toEqual(["3/4 = 75%", "4/6 = 67%", "insufficient data"]);
    expect(hospital.closedReasons).toEqual([
      { reason: "choseOther", count: 1 },
      { reason: "residential", count: 1 },
    ]);
    const community = at(d.inputs, d.period, "community");
    expect([community.startRate.text, community.effort.perStart.text, community.continuity.rate.text]).toEqual([
      "4/5 = 80%",
      "6 h / 4 starts = 1.5 h per start",
      "3/3 = 100%",
    ]);
    expect(at(d.inputs, d.period, "client").tooEarly).toBe(true);
    expect(r.stageMixDiffers).toBe(true);
    expect(calendarMonth(d.inputs, "2026-06")).toMatchObject({ enquiries: 9, starts: 3, sameCohort: 2, earlierCohorts: 1 });
  });

  it("shows the return visit: the GP cohort catching up, and October too young to rank", () => {
    const u = updatedInputs(d);
    const gp = at(u, d.period, "gp");
    expect([gp.startRate.text, gp.effort.perStart.text]).toEqual(["6/12 = 50%", "18 h / 6 starts = 3 h per start"]);
    expect(gp.continuity).toMatchObject({ starts: 6, mature: 4, active: 3 });
    const october = at(u, d.update.period, "gp");
    expect(october).toMatchObject({ enquiries: 4, mature: 0, tooEarly: true });
    expect(october.stages.allocated).toBe(3);
    expect(october.startRate.text).toBe("2/4 = 50%");
  });
});
