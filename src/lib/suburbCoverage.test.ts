import { describe, expect, it } from "vitest";
import {
  absence,
  blankInputs,
  calculate,
  cleanInputs,
  inputChanges,
  resultChanges,
  validateInputs,
  WEEKDAYS,
  type CoverageInputs,
  type DemandCell,
  type SupplyRow,
} from "./suburbCoverage";
import { updatedInputs } from "./coverageLab";
import { SUBURB_GROWTH } from "@/content/coverageCases";

/*
  The Local Coverage model, held to the PRD's acceptance fixtures (section 15, fixtures 2 to 9) with exact numbers:
  a gap by service, place and time window; supply that counts only when approved, suitable, confirmed and current;
  a worker counted once at a time; forecast kept apart from the current gap; backup shown apart; stale sources
  turning a confident result into "needs confirmation".
*/

const cell = (over: Partial<DemandCell> & Pick<DemandCell, "id">): DemandCell => ({
  service: "domestic",
  capability: "",
  area: "b",
  window: { days: [...WEEKDAYS], from: 13, to: 16 },
  unit: "hours",
  visitHours: 2,
  planned: 0,
  booked: 0,
  arranging: 0,
  forecast: { low: 0, base: 0, high: 0 },
  unknown: 0,
  neededFrom: "",
  preference: "none",
  backupTarget: 1,
  continuity: "",
  source: "Test schedule",
  owner: "Owner",
  verifiedOn: "2026-11-20",
  ...over,
});
const row = (over: Partial<SupplyRow> & Pick<SupplyRow, "id">): SupplyRow => ({
  label: over.id,
  aggregate: false,
  service: "domestic",
  capabilities: [],
  state: "approved",
  areas: ["b"],
  slots: [{ id: "s1", days: [...WEEKDAYS], from: 13, to: 17, hours: 6, status: "confirmed", effectiveFrom: "" }],
  verifiedOn: "2026-11-20",
  source: "Register",
  owner: "Onboarding",
  preferredFor: "",
  onboardingWeeks: null,
  bookings: [],
  ...over,
});
const plan = (demand: DemandCell[], supply: SupplyRow[]): CoverageInputs => ({
  asOf: "2026-11-23",
  timezone: "Australia/Brisbane",
  weeks: 8,
  freshness: { days: 30, setBy: "Onboarding", from: "2026-11-01" },
  leadWeeks: 6,
  areas: [
    { id: "b", name: "Bee Park", x: 20, y: 20 },
    { id: "x", name: "Ex Hill", x: 60, y: 60 },
  ],
  demand,
  supply,
});
const at = (r: ReturnType<typeof calculate>, id: string) => r.cells.find((c) => c.id === id)!;

describe("the fictional case validates", () => {
  it("has no input errors, before and after the story update", () => {
    expect(validateInputs(SUBURB_GROWTH.inputs)).toEqual([]);
    expect(validateInputs(updatedInputs(SUBURB_GROWTH))).toEqual([]);
  });
});

describe("fixture 2: the early-morning personal care gap", () => {
  it("18 h planned, 6 booked, two approved workers free only after 10 am and an unverified candidate: a 12-hour gap, none of them counted", () => {
    const r = calculate(SUBURB_GROWTH.inputs);
    const c = at(r, "banksia-am");
    expect(c).toMatchObject({ planned: 18, booked: 6, unfilled: 12, spare: 0, gap: 12, status: "gap" });
    const use = (id: string) => c.supply.find((x) => x.id === id)!;
    expect(use("w-a")).toMatchObject({ use: "unavailable", kind: "time", hours: 0 });
    expect(use("w-b")).toMatchObject({ use: "unavailable", kind: "time", hours: 0 });
    expect(use("w-c")).toMatchObject({ use: "potential", kind: "pipeline", hours: 0 });
    expect(use("w-a").reason).toMatch(/10 am.*outside the Mon–Fri 7 am–9 am window/);
    // The result names a service, a place and a time window, not a colour.
    expect(r.findings.join(" ")).toMatch(/Personal care, Banksia Rise, Mon–Fri 7 am–9 am: 12 h a week unfilled, with no confirmed suitable spare capacity/);
  });

  it("can't fill a longer visit from a shorter block, and doesn't swap a cleaner for a carer", () => {
    const short = row({
      id: "short",
      service: "personalCare",
      slots: [{ id: "s1", days: [...WEEKDAYS], from: 7, to: 8, hours: 5, status: "confirmed", effectiveFrom: "" }],
    });
    const cleaner = row({ id: "cleaner", slots: [{ id: "s1", days: [...WEEKDAYS], from: 7, to: 9, hours: 10, status: "confirmed", effectiveFrom: "" }] });
    const need = cell({ id: "am", service: "personalCare", window: { days: [...WEEKDAYS], from: 7, to: 9 }, visitHours: 1.5, planned: 6, booked: 0 });
    const c = at(calculate(plan([need], [short, cleaner])), "am");
    expect(c.gap).toBe(6);
    expect(c.supply.find((x) => x.id === "short")!.reason).toMatch(/shorter than a 1.5-hour visit/);
    expect(c.supply.find((x) => x.id === "cleaner")!.reason).toMatch(/not personal care: they aren’t interchangeable/);
  });

  it("keeps hours and visits in their own units", () => {
    const need = cell({ id: "v", unit: "visits", visitHours: 1.5, planned: 6, booked: 2, window: { days: [...WEEKDAYS], from: 13, to: 16 } });
    const w = row({ id: "w", slots: [{ id: "s1", days: [...WEEKDAYS], from: 13, to: 16, hours: 4.5, status: "confirmed", effectiveFrom: "" }] });
    const c = at(calculate(plan([need], [w])), "v");
    expect(c).toMatchObject({ unit: "visits", unfilled: 4, spare: 3, gap: 1 });
  });
});

describe("fixture 3: covered, with a surplus that isn't counted twice", () => {
  const b = cell({ id: "b-pm", planned: 12, booked: 8 });
  const d = row({ id: "d", areas: ["b", "x"] });

  it("12 h planned, 8 booked and 6 verified spare in the matching window: no gap, 2 hours of surplus", () => {
    const c = at(calculate(plan([b], [d])), "b-pm");
    expect(c).toMatchObject({ unfilled: 4, spare: 6, gap: 0, surplus: 2, status: "covered" });
    expect(c.supply.find((x) => x.id === "d")).toMatchObject({ use: "usable", hours: 6 });
  });

  it("doesn't reuse that surplus in another area at an overlapping time, or where the worker doesn't travel", () => {
    const x = cell({ id: "x-pm", area: "x", planned: 4, booked: 0 });
    const r = calculate(plan([b, x], [d]));
    expect(at(r, "b-pm")).toMatchObject({ gap: 0, surplus: 2 });
    expect(at(r, "x-pm")).toMatchObject({ spare: 0, gap: 4 });
    expect(at(r, "x-pm").supply.find((y) => y.id === "d")!.reason).toMatch(/already counted for Domestic assistance \(cleaning\), Bee Park.*overlapping time/);
    const noTravel = calculate(plan([b, x], [{ ...d, areas: ["b"] }]));
    expect(at(noTravel, "x-pm").gap).toBe(4);
    expect(at(noTravel, "x-pm").supply.find((y) => y.id === "d")!.reason).toMatch(/doesn’t travel to Ex Hill/);
  });

  it("in the case, Corella Park's afternoon cleaning is covered with 2 hours to spare", () => {
    expect(at(calculate(SUBURB_GROWTH.inputs), "corella-pm")).toMatchObject({ planned: 12, booked: 8, spare: 6, gap: 0, surplus: 2, status: "covered" });
  });
});

describe("fixture 4: a small current gap stays an immediate action", () => {
  it("4 h of approved weekend nursing, 2 booked, no confirmed spare and a 2-hour provisional offer: a 2-hour current gap", () => {
    const r = calculate(SUBURB_GROWTH.inputs);
    const c = at(r, "quandong-wkd");
    expect(c).toMatchObject({ planned: 4, booked: 2, spare: 0, gap: 2, status: "gap" });
    expect(c.supply.find((x) => x.id === "w-h")).toMatchObject({ use: "potential", kind: "provisional" });
    // Banksia Rise's larger gap tops the network list; the nursing gap is still an immediate action.
    expect(r.network[0].cell).toBe("banksia-am");
    expect(r.immediate.map((x) => x.cell)).toEqual(["banksia-am", "quandong-wkd"]);
    expect(r.immediate[1].text).toMatch(/Nursing \(wound care\), Quandong Hill, Sat, Sun 8 am–10 am: 2 h a week.*from 28 Nov 2026/);
    expect(r.immediate[1].text).toMatch(/A recruitment brief doesn’t resolve this week’s need/);
  });
});

describe("fixture 5: backup fragility, apart from the gap", () => {
  it("every current visit booked but no approved suitable backup: no current gap, and a separate warning", () => {
    const booked = cell({ id: "full", planned: 4, booked: 4, backupTarget: 1 });
    const r = calculate(plan([booked], []));
    expect(at(r, "full")).toMatchObject({ gap: 0, status: "covered", backup: { available: 0, target: 1, state: "short" } });
    expect(r.findings.join(" ")).toMatch(/no current gap, but backup is fragile: 0 suitable backup against a target of 1/);
    // A candidate is never a safe backup.
    const withCandidate = calculate(plan([booked], [row({ id: "cand", state: "candidate" })]));
    expect(at(withCandidate, "full").backup.state).toBe("short");
    // An approved continuity arrangement counts; a target nobody has set is said so, not invented.
    expect(at(calculate(plan([{ ...booked, continuity: "Provider’s own team covers absences" }], [])), "full").backup.state).toBe("ok");
    expect(at(calculate(plan([{ ...booked, backupTarget: null }], [])), "full").backup.state).toBe("notSet");
  });

  it("an absence shows the visits it would leave, and what suitable backup covers", () => {
    const a = absence(SUBURB_GROWTH.inputs, "w-e")!;
    expect(a.affected).toEqual([expect.objectContaining({ cell: "corella-pm", lost: 8, covered: 2, uncovered: 6 })]);
  });
});

describe("fixture 6: forecast demand is a band, never the current gap", () => {
  it("six hours of speculative referrals move the forecast band, not the confirmed gap", () => {
    const more = structuredClone(SUBURB_GROWTH.inputs);
    const c = more.demand.find((x) => x.id === "banksia-am")!;
    c.forecast = { low: c.forecast.low! + 6, base: c.forecast.base! + 6, high: c.forecast.high! + 6 };
    const a = at(calculate(SUBURB_GROWTH.inputs), "banksia-am");
    const b = at(calculate(more), "banksia-am");
    expect(a.gap).toBe(12);
    expect(b.gap).toBe(12);
    expect(a.forecastGap).toEqual({ low: 12, base: 15, high: 18 });
    expect(b.forecastGap).toEqual({ low: 18, base: 21, high: 24 });
    expect(inputChanges(SUBURB_GROWTH.inputs, more).join(" ")).toMatch(/The current gap doesn’t change/);
  });
});

describe("fixture 7: a participant's chosen worker", () => {
  it("is a choice to assess: not usable spare, and not discarded", () => {
    const c = at(calculate(SUBURB_GROWTH.inputs), "banksia-am");
    expect(c.choices).toEqual([{ id: "w-p", label: "Worker P", state: "verification" }]);
    expect(c.supply.find((x) => x.id === "w-p")).toMatchObject({ use: "potential", kind: "pipeline", hours: 0 });
    expect(c.supply.find((x) => x.id === "w-p")!.reason).toMatch(/chosen by the participant.*a choice to assess/);
  });
});

describe("fixture 8: one worker, two areas, the same time", () => {
  it("can't fill simultaneous slots in two areas; changing a booking updates the cells and the explanation", () => {
    const sat = { days: ["sat" as const], from: 8, to: 12 };
    const w = row({ id: "w", areas: ["b", "x"], slots: [{ id: "s1", ...sat, hours: 4, status: "confirmed", effectiveFrom: "" }] });
    const before = plan([cell({ id: "b-sat", window: sat, planned: 4 }), cell({ id: "x-sat", area: "x", window: sat, planned: 4 })], [w]);
    const r1 = calculate(before);
    expect(at(r1, "b-sat").gap).toBe(0);
    expect(at(r1, "x-sat").gap).toBe(4);
    expect(at(r1, "x-sat").supply[0]).toMatchObject({ use: "committed", kind: "taken" });
    // Someone else takes the Bee Park booking: the worker is free for Ex Hill.
    const after = structuredClone(before);
    after.demand[0].booked = 4;
    const r2 = calculate(after);
    expect(at(r2, "x-sat")).toMatchObject({ gap: 0, spare: 4 });
    expect(inputChanges(before, after)).toContain("Domestic assistance (cleaning), Bee Park, Sat 8 am–12 pm: booked 0 → 4.");
    expect(resultChanges(r1, r2).join(" ")).toMatch(/Ex Hill, Sat 8 am–12 pm: current gap 4 h → 0 h/);
  });

  it("rejects one person's overlapping availability windows", () => {
    const w = row({
      id: "w",
      slots: [
        { id: "s1", days: ["mon"], from: 8, to: 12, hours: 4, status: "confirmed", effectiveFrom: "" },
        { id: "s2", days: ["mon"], from: 11, to: 14, hours: 3, status: "confirmed", effectiveFrom: "" },
      ],
    });
    expect(validateInputs(plan([cell({ id: "c" })], [w])).map((e) => e.message)).toEqual([expect.stringMatching(/can’t be in two places at once/)]);
  });
});

describe("fixture 9: a stale source needs confirmation", () => {
  it("supply older than the owner's freshness rule turns a covered cell into “needs confirmation”", () => {
    const stale = structuredClone(SUBURB_GROWTH.inputs);
    stale.supply.find((x) => x.id === "w-d")!.verifiedOn = "2026-10-01";
    expect(at(calculate(SUBURB_GROWTH.inputs), "corella-pm").status).toBe("covered");
    const c = at(calculate(stale), "corella-pm");
    expect(c.status).toBe("confirm");
    expect(c.supply.find((x) => x.id === "w-d")).toMatchObject({ use: "potential", kind: "stale" });
    expect(c.changeIf.join(" ")).toMatch(/Re-verifying Worker D/);
  });

  it("stale demand figures need confirmation too, and a blank freshness rule isn't invented", () => {
    const stale = structuredClone(SUBURB_GROWTH.inputs);
    stale.demand.find((x) => x.id === "corella-pm")!.verifiedOn = "2026-08-01";
    expect(at(calculate(stale), "corella-pm").status).toBe("confirm");
    const unset = { ...SUBURB_GROWTH.inputs, freshness: { days: null, setBy: "", from: "" } };
    expect(validateInputs(unset).map((e) => e.field)).toEqual(["freshness.days"]);
  });
});

describe("blank, unknown and zero", () => {
  it("a blank is an error, an unknown need makes a covered cell need confirmation, and zero is zero", () => {
    const blank = plan([cell({ id: "c", planned: null })], []);
    expect(
      validateInputs(blank)
        .map((e) => e.message)
        .join(" "),
    ).toMatch(/confirmed planned is blank/);
    const unknown = at(calculate(plan([cell({ id: "c", planned: 0, unknown: 2 })], [])), "c");
    expect(unknown).toMatchObject({ gap: 0, status: "confirm", unknown: 2 });
    expect(at(calculate(plan([cell({ id: "c", planned: 0 })], [])), "c")).toMatchObject({ gap: 0, status: "covered" });
    const stored = cleanInputs(JSON.parse(JSON.stringify(plan([cell({ id: "c", planned: null, booked: 0 })], []))));
    expect([stored.demand[0].planned, stored.demand[0].booked]).toEqual([null, 0]);
    expect(validateInputs(blankInputs("2026-11-23")).length).toBeGreaterThan(5);
  });
});

describe("the story update", () => {
  it("counts only the candidate who became approved and matches the window: the gap halves, it doesn't close", () => {
    const r = calculate(updatedInputs(SUBURB_GROWTH));
    const c = at(r, "banksia-am");
    expect(c).toMatchObject({ spare: 6, gap: 6 });
    expect(c.supply.find((x) => x.id === "w-c")).toMatchObject({ use: "usable", hours: 6 });
    expect(c.supply.find((x) => x.id === "w-m")).toMatchObject({ use: "unavailable", kind: "time" });
    expect(c.supply.find((x) => x.id === "w-n")).toMatchObject({ use: "potential", kind: "pipeline" });
    expect(at(r, "quandong-wkd").gap).toBe(2);
    expect(resultChanges(calculate(SUBURB_GROWTH.inputs), r).join(" ")).toMatch(/newly usable: Candidate C/);
  });
});
