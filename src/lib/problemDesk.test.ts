import { describe, expect, it } from "vitest";
import {
  caseOpen,
  countCases,
  emptyDiagnosis,
  emptyResponse,
  learnerHours,
  months,
  ratePer100,
  reportLink,
  responseProblems,
  trend,
  workingStatement,
  type Case,
  type EventKind,
} from "./problemDesk";

/* The Problem desk's counting rules: cases, the contacts about them, and rates that are never made up. */

let n = 0;
const kase = (events: [EventKind, string][], over: Partial<Case> = {}): Case => ({
  id: `c${++n}`,
  themeId: "t",
  source: "billing",
  sourceRef: `R${n}`,
  summary: "",
  link: "",
  falseMatch: false,
  events: events.map(([kind, on], i) => ({ id: `e${n}-${i}`, kind, on, note: "" })),
  ...over,
});

describe("counting", () => {
  it("counts one case with three follow-ups as one case and four contact events", () => {
    const one = kase([
      ["initial", "2026-06-09"],
      ["update", "2026-06-16"],
      ["update", "2026-06-30"],
      ["update", "2026-07-14"],
    ]);
    expect(countCases([one], "2026-11-21")).toMatchObject({ cases: 1, contactEvents: 4, followUps: 3, repeatCases: 1, reopened: 0, open: 1 });
  });

  it("counts a reopening only after a closure, and never as a contact", () => {
    const reopened = kase([
      ["initial", "2026-06-01"],
      ["close", "2026-06-11"],
      ["reopen", "2026-07-01"],
      ["close", "2026-07-05"],
    ]);
    const stray = kase([
      ["initial", "2026-06-01"],
      ["reopen", "2026-06-05"],
    ]);
    const c = countCases([reopened, stray], "2026-11-21");
    expect(c.reopened).toBe(1);
    expect(c.contactEvents).toBe(2);
    expect(c.open).toBe(1);
    expect(c.medianDaysToClose).toBe(10);
    expect(caseOpen(reopened, "2026-07-02")).toBe(true);
    expect(caseOpen(reopened, "2026-06-20")).toBe(false);
  });

  it("leaves out false matches, and events after the as-at date", () => {
    const later = kase([
      ["initial", "2026-06-01"],
      ["update", "2026-12-01"],
    ]);
    const c = countCases([kase([["initial", "2026-06-01"]], { falseMatch: true }), later], "2026-11-21");
    expect(c).toMatchObject({ cases: 1, contactEvents: 1, followUps: 0, repeatCases: 0 });
    expect(c.medianDaysToClose).toBeNull();
  });

  it("keeps new cases, follow-ups and reopenings as three separate monthly series", () => {
    const long = kase([
      ["initial", "2026-06-09"],
      ["update", "2026-06-16"],
      ["update", "2026-07-14"],
      ["close", "2026-07-21"],
      ["reopen", "2026-08-02"],
    ]);
    expect(trend([long, kase([["initial", "2026-07-03"]])], "2026-06", "2026-08")).toMatchObject([
      { bucket: "2026-06", newCases: 1, followUps: 1, reopened: 0 },
      { bucket: "2026-07", newCases: 1, followUps: 1, reopened: 0 },
      { bucket: "2026-08", newCases: 0, followUps: 0, reopened: 1 },
    ]);
    expect(months("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("rates and effort", () => {
  it("gives a rate only with a denominator", () => {
    expect(ratePer100({ numerator: 41, denominator: 1260 })).toBe(3.3);
    expect(ratePer100({ numerator: 41, denominator: null })).toBeNull();
    expect(ratePer100({ numerator: 41, denominator: 0 })).toBeNull();
  });

  it("works out learner hours: ten minutes for 11,000 people is about 1,833 hours", () => {
    expect(learnerHours(11000, 10)).toBe(1833.3);
    expect(learnerHours(null, 10)).toBeNull();
    expect(learnerHours(420, 0)).toBeNull();
  });

  it("links a Topic’s report and never invents one", () => {
    expect(reportLink("topic", "what-a-good-invoice-looks-like")).toBe("/admin/completions/lessons/what-a-good-invoice-looks-like");
    expect(reportLink("course", "mag-123")).toBeNull();
    expect(reportLink("topic", "../x")).toBeNull();
  });
});

describe("the response", () => {
  it("accepts a decision with no learning item, but not one with no measure or review date", () => {
    const r = {
      ...emptyResponse(),
      problem: "Travel charged inside the visit rate.",
      audience: "Coordinators",
      desired: "Quote travel as its own line.",
      barrierSummary: "The form had no travel line (known).",
      learning: "none" as const,
      why: "The form was the cause; it has been fixed.",
      measure: { name: "Travel queries per 100 quotes", definition: "", owner: "", link: "" },
      baseline: { window: "", note: "12 in May" },
      reviewOn: "2027-01-15",
      owner: "Operations lead",
    };
    expect(responseProblems(r, true)).toEqual([]);
    expect(responseProblems(r, false)).toEqual(["Add at least one action with an owner."]);
    expect(responseProblems({ ...r, measure: { ...r.measure, name: "" }, reviewOn: "" }, true)).toHaveLength(2);
    expect(responseProblems({ ...r, assignment: { required: true, roles: "", reason: "", due: "" } }, true)).toEqual([
      "A required assignment needs its roles and its reason.",
    ]);
    expect(responseProblems(emptyResponse(), false).length).toBeGreaterThan(8);
  });

  it("writes the working statement with how sure anyone is", () => {
    expect(workingStatement(emptyDiagnosis(), () => "x")).toBe("");
    const s = workingStatement(
      {
        ...emptyDiagnosis(),
        situation: "invoice approval",
        role: "coordinators",
        observed: "approve without checking the rate",
        desired: "to compare the rate with the agreement",
        barriers: [{ id: "b1", barrier: "attention", text: "", evidence: "", confidence: "suspected", validator: "" }],
      },
      () => "overlooks the detail",
    );
    expect(s).toBe(
      "In invoice approval, coordinators currently approve without checking the rate. The desired behaviour is to compare the rate with the agreement. We think the main barrier is overlooks the detail (suspected).",
    );
  });
});
