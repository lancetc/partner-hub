import { describe, expect, it } from "vitest";
import {
  applyChange,
  calculate,
  cleanInputs,
  inputChanges,
  resultChanges,
  validateInputs,
  weeksOf,
  type IntakeInputs,
  type Start,
  type Supply,
} from "./growthReadiness";

/* The growth readiness model (docs/growth-readiness.md), with the PRD's five calculation fixtures. */

const MONTH = "2027-02"; // Monday 1 to Sunday 28 February: four full weeks.
const base = (over: Partial<IntakeInputs> = {}): IntakeInputs => ({
  month: MONTH,
  asOf: "2027-01-25",
  staleDays: 30,
  reservePct: 0,
  followUpSpread: [1],
  bands: [{ id: "routine", label: "Routine", count: 0, hoursPerWeek: 0, setupHours: 8, followUpHours: 0 }],
  coordinators: [{ id: "c1", name: "Jess", hoursPerWeek: 40, nonClientPerWeek: 0, leave: [0, 0, 0, 0] }],
  exceptional: [0, 0, 0, 0],
  cover: [0, 0, 0, 0],
  starts: [],
  supply: [],
  ...over,
});
const start = (k: number, week: number, over: Partial<Start> = {}): Start => ({
  id: `s${k}`,
  label: `Start ${k}`,
  stage: "ready",
  band: "routine",
  week,
  order: k,
  services: [],
  unknowns: [],
  ...over,
});
const cleaning = { service: "Cleaning", capability: "Domestic", area: "Northside", window: "Weekday" };
const slot = () => [{ id: "v1", ...cleaning, slotsPerWeek: 1 }];
const supply = (id: string, slots: number, status: Supply["status"] = "confirmed", verifiedOn = "2027-01-20"): Supply => ({
  id,
  supplier: id,
  ...cleaning,
  weeks: [],
  slots,
  status,
  verifiedOn,
});

describe("calendar weeks", () => {
  it("splits a month into Monday-to-Sunday weeks, partial weeks included, counting weekdays inside the month", () => {
    const dec = weeksOf("2026-12"); // Tuesday 1 to Thursday 31
    expect(dec.map((w) => w.weekdays)).toEqual([4, 5, 5, 5, 4]);
    expect(dec[0]).toMatchObject({ from: "2026-12-01", to: "2026-12-06", partial: true });
    expect(dec.at(-1)).toMatchObject({ from: "2026-12-28", to: "2026-12-31", partial: true });
    expect(weeksOf(MONTH).map((w) => w.weekdays)).toEqual([5, 5, 5, 5]);
  });

  it("scales weekly hours to the weekdays in a partial week, never a full five", () => {
    const r = calculate({
      ...base({ month: "2026-12" }),
      coordinators: [{ id: "c1", name: "Jess", hoursPerWeek: 40, nonClientPerWeek: 10, leave: [0, 0, 0, 0, 0] }],
      exceptional: [0, 0, 0, 0, 0],
      cover: [0, 0, 0, 0, 0],
    });
    expect(r.weeks[0].working).toBe(32);
    expect(r.weeks[0].nonClient).toBe(8);
    expect(r.weeks[1].working).toBe(40);
  });

  it("takes leave once: non-client duties fall only on the days worked", () => {
    const r = calculate(base({ coordinators: [{ id: "c1", name: "Jess", hoursPerWeek: 40, nonClientPerWeek: 10, leave: [0, 16, 0, 0] }] }));
    // 40 working − 16 leave − 10 × (24/40) duties = 18
    expect(r.weeks[1]).toMatchObject({ working: 40, leave: 16, nonClient: 6, available: 18 });
  });
});

describe("the PRD fixtures", () => {
  it("1. Six 8-hour starts against 40 hours in Week 2: five fit, the sixth is constrained by 8 hours under the order set", () => {
    const i = base({
      starts: [1, 2, 3, 4, 5, 6].map((k) => start(k, 1, { services: slot() })),
      supply: [supply("ample", 10)],
    });
    const r = calculate(i);
    expect(r.weeks[1].available).toBe(40);
    expect(r.starts.filter((s) => s.status === "supported").map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    const sixth = r.starts.find((s) => s.id === "s6")!;
    expect(sixth.status).toBe("constrained");
    expect(sixth.reasons[0]).toMatch(/Week 2 by 8 hours/);
    // Change the order and a different start is the one beyond the hours: the model never picks by itself.
    const reordered = calculate({ ...i, starts: i.starts.map((s) => (s.id === "s1" ? { ...s, order: 9 } : s)) });
    expect(reordered.starts.find((s) => s.status === "constrained")!.id).toBe("s1");
  });

  it("2. Five starts, three confirmed slots and a provisional offer: three covered, one needs confirmation, one constrained", () => {
    const r = calculate(
      base({
        bands: [{ id: "routine", label: "Routine", count: 0, hoursPerWeek: 0, setupHours: 1, followUpHours: 0 }],
        starts: [1, 2, 3, 4, 5].map((k) => start(k, 3, { services: slot() })),
        supply: [supply("confirmed", 3), supply("provisional", 1, "provisional")],
      }),
    );
    expect(r.starts.map((s) => s.status)).toEqual(["supported", "supported", "supported", "confirm", "constrained"]);
    expect(r.supported).toBe(3);
    // The provisional offer never turns a start into a supported one.
    expect(r.services[0]).toMatchObject({ required: 5, confirmed: 3, shortfall: 2, state: "gap" });
  });

  it("2b. Booked, expired and stale supply never count as confirmed", () => {
    const r = calculate(
      base({
        bands: [{ id: "routine", label: "Routine", count: 0, hoursPerWeek: 0, setupHours: 1, followUpHours: 0 }],
        starts: [start(1, 3, { services: slot() })],
        supply: [supply("booked", 2, "booked"), supply("expired", 2, "expired"), supply("stale", 2, "confirmed", "2026-11-01")],
      }),
    );
    expect(r.services[0].confirmed).toBe(0);
    expect(r.starts[0].status).toBe("confirm");
    expect(r.state).not.toBe("available");
  });

  it("3. Twelve spare hours in Week 1 don't hide a six-hour deficit in Week 2", () => {
    const r = calculate(base({ exceptional: [28, 46, 40, 40] }));
    expect(r.weeks[0].headroom).toBe(12);
    expect(r.weeks[1].headroom).toBe(-6);
    expect(r.weeks.reduce((a, w) => a + w.headroom, 0)).toBe(6);
    expect(r.state).toBe("gap");
    expect(r.tightest).toBe(1);
    expect(r.findings.join(" ")).toMatch(/hides a short week/);
  });

  it("4. Eight hours of approved cover clears an eight-hour coordinator gap, but not an independent supplier gap", () => {
    const i = base({
      exceptional: [0, 48, 0, 0],
      starts: [start(1, 2, { services: slot() })],
      supply: [],
    });
    const before = calculate(i);
    expect(before.weeks[1].headroom).toBe(-8);
    const after = calculate(applyChange(i, { kind: "cover", week: 1, hours: 8 }));
    expect(after.weeks[1].headroom).toBe(0);
    expect(after.services[0].state).toBe("gap");
    expect(after.state).toBe("gap");
    expect(resultChanges(before, after)).toContain("Week 2 headroom: -8 → 0 hours");
  });

  it("5. A blank input isn't zero: it fails validation, so the last valid result stays", () => {
    const i = base();
    expect(validateInputs(i)).toEqual([]);
    const blank = { ...i, cover: [0, null, 0, 0] };
    const errors = validateInputs(blank);
    expect(errors).toEqual([{ field: "cover.1", message: expect.stringMatching(/blank/) }]);
    // Reading stored JSON keeps a blank blank.
    expect(cleanInputs({ ...blank }).cover[1]).toBeNull();
  });
});

describe("starts and changes", () => {
  it("keeps enquiries out of the forecast, and an expected start or an open question is never green", () => {
    const r = calculate(
      base({ starts: [start(1, 0, { stage: "enquiry" }), start(2, 0, { stage: "expected" }), start(3, 0, { unknowns: ["preferred worker’s checks"] })] }),
    );
    expect(r.starts.map((s) => s.status)).toEqual(["enquiry", "confirm", "confirm"]);
    expect(r.proposed).toBe(2);
    expect(r.state).toBe("confirm");
  });

  it("moving a start changes both coordinator and service demand in the weeks affected, and says what changed", () => {
    const i = base({ starts: [start(1, 0, { services: slot() })], supply: [supply("w1", 1)] });
    const moved = applyChange(i, { kind: "move", start: "s1", week: 2 });
    const a = calculate(i);
    const b = calculate(moved);
    expect(a.weeks[0].setup).toBe(8);
    expect(b.weeks[0].setup).toBe(0);
    expect(b.weeks[2].setup).toBe(8);
    expect(a.services.length).toBe(4);
    expect(b.services.length).toBe(2);
    expect(inputChanges(i, moved)[0]).toMatch(/moved from Week 1 to Week 3/);
  });

  it("spreads follow-up by the authored shares, and counts follow-up after the month separately", () => {
    const r = calculate(
      base({
        followUpSpread: [0, 0.5, 0.5],
        bands: [{ id: "routine", label: "Routine", count: 0, hoursPerWeek: 0, setupHours: 4, followUpHours: 6 }],
        starts: [start(1, 2)],
      }),
    );
    expect(r.weeks.map((w) => w.setup + w.followUp)).toEqual([0, 0, 4, 3]);
    expect(r.afterMonth).toBe(3);
  });
});
