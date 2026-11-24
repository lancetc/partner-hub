import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { fictionalExample, PLANNER_VERSION, type Plan } from "@/lib/caseloadPlanner";
import { WINDOW_VERSION } from "@/lib/hiringWindow";
import { ensurePlanner, exportWorkbook, getPlan, listPlans, plannerHome, plannerReport, recordPlannerEvent, savePlan, snapshotOf } from "./caseloadPlanner";

/*
  Plan my business with the decision window (Care Partner Hiring Runway PRD, sections 10 to 15): idempotent saves,
  history kept and recalculation shown as a comparison, a business's figures never in analytics or another business's
  reach, and an older database moved on in place.
*/

let db: Db;
let casey: User, ash: User, riley: User, jordan: User;
const now = new Date("2026-11-24T00:00:00Z");
/** Invented aggregate figures with a distinctive salary and income, so a leak would be easy to spot. */
const myPlan = (): Plan => ({
  ...fictionalExample(),
  kind: "business",
  values: { ...fictionalExample().values, staffCostPerFte: 7_777, income: 361 },
});
const eventRows = () => db.prepare("SELECT * FROM planner_events").all() as Record<string, unknown>[];

beforeEach(() => {
  db = openDb(":memory:");
  [casey, ash, riley, jordan] = ["casey", "ash", "riley", "jordan"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
});

describe("saving", () => {
  it("is idempotent: a retried save with the same key returns the same version, never a duplicate", () => {
    const a = savePlan(db, casey, { name: "2027 growth", plan: myPlan(), idem: "save-key-0001" }, now);
    const b = savePlan(db, casey, { name: "2027 growth", plan: myPlan(), idem: "save-key-0001" }, now);
    expect(b.id).toBe(a.id);
    expect(b.version).toBe(1);
    expect(listPlans(db, casey).plans).toHaveLength(1);
    expect(eventRows().filter((e) => e.event === "scenario_saved")).toHaveLength(1);
    // A new key is a deliberate new version, and nothing is overwritten.
    const c = savePlan(db, casey, { id: a.id, plan: { ...myPlan(), values: { ...myPlan().values, newPerMonth: 4 } }, idem: "save-key-0002" }, now);
    expect(c.version).toBe(2);
    expect(getPlan(db, casey, a.id, 1).plan.values.newPerMonth).toBe(3);
  });

  it("keeps the decision window with each version, in months and a kind only", () => {
    const s = savePlan(db, casey, { name: "Window", plan: myPlan() }, now);
    const snap = s.versions[0].snapshot as { window: Record<string, unknown> };
    expect(snap.window).toEqual({ version: WINDOW_VERSION, kind: "interim-and-recruit", pressureFrom: 1, pressureTo: 3, startFrom: 1, startTo: 1 });
    expect(listPlans(db, casey).plans[0].window).toEqual(snap.window);
    expect(s.earlierRules).toBe(false);
  });

  it("shows an older version's saved results beside a recalculation, without overwriting either", () => {
    const s = savePlan(db, casey, { name: "Older", plan: myPlan() }, now);
    // As planner 1 saved it: no window in the snapshot, and an older planner version.
    const old = { complete: true, options: (s.versions[0].snapshot as { options: unknown }).options };
    db.prepare("UPDATE business_plan_versions SET planner_version = 'caseload-planner-1', snapshot = ? WHERE plan_id = ?").run(JSON.stringify(old), s.id);
    const g = getPlan(db, casey, s.id);
    expect(g.earlierRules).toBe(true);
    expect(g.versions[0].snapshot).toEqual(old);
    expect((g.recalculated as { window: unknown }).window).toMatchObject({ kind: "interim-and-recruit" });
    const stored = db.prepare("SELECT planner_version, snapshot FROM business_plan_versions WHERE plan_id = ?").get(s.id) as {
      planner_version: string;
      snapshot: string;
    };
    expect(stored.planner_version).toBe("caseload-planner-1");
    expect(JSON.parse(stored.snapshot)).toEqual(old);
    expect(PLANNER_VERSION).toBe("caseload-planner-2");
  });

  it("reads a plan saved before the contact guardrail as not assigned", () => {
    const s = savePlan(db, casey, { name: "Before", plan: myPlan() }, now);
    const raw = JSON.parse((db.prepare("SELECT inputs FROM business_plan_versions WHERE plan_id = ?").get(s.id) as { inputs: string }).inputs);
    delete raw.contactDuty;
    db.prepare("UPDATE business_plan_versions SET inputs = ? WHERE plan_id = ?").run(JSON.stringify(raw), s.id);
    expect(getPlan(db, casey, s.id).plan.contactDuty).toBe(false);
  });
});

describe("a business's figures stay in the business", () => {
  it("another business, a coordinator and an author can't open, list or download the plan", () => {
    const s = savePlan(db, casey, { name: "Private", plan: myPlan() }, now);
    for (const u of [ash, riley, jordan]) {
      expect(() => getPlan(db, u, s.id)).toThrow();
      expect(() => exportWorkbook(db, u, { id: s.id }, now)).toThrow();
      expect(plannerHome(db, u).plans).toEqual([]);
    }
  });

  it("analytics carry an event, a mode and a fixed-list detail: never a value, salary, income or result", () => {
    const s = savePlan(db, casey, { name: "Events", plan: myPlan(), idem: "save-key-0003" }, now);
    recordPlannerEvent(db, casey, { event: "scenario_mode_selected", mode: "plan", detail: "mode:plan", idem: "evt-key-0001" }, now);
    recordPlannerEvent(db, casey, { event: "assumption_changed", mode: "plan", detail: "field:staffCostPerFte", idem: "evt-key-0002" }, now);
    recordPlannerEvent(db, casey, { event: "assumption_changed", mode: "plan", detail: "field:staffCostPerFte=7777", idem: "evt-key-0003" }, now);
    recordPlannerEvent(db, casey, { event: "assumption_changed", mode: "plan", detail: "7777", idem: "evt-key-0004" }, now);
    recordPlannerEvent(db, casey, { event: "scenario_compared", mode: "plan", detail: "growth:faster", idem: "evt-key-0005" }, now);
    recordPlannerEvent(db, casey, { event: "scenario_compared", mode: "plan", detail: "sensitivity", idem: "evt-key-0006" }, now);
    recordPlannerEvent(db, casey, { event: "source_opened", mode: "plan", detail: "basis", idem: "evt-key-0007" }, now);
    exportWorkbook(db, casey, { id: s.id }, now);
    const rows = eventRows();
    const details = rows.map((r) => r.detail);
    expect(details).toContain("field:staffCostPerFte");
    // Anything off the list is dropped to blank rather than stored.
    expect(details.filter((d) => d === "").length).toBeGreaterThanOrEqual(2);
    const all = JSON.stringify(rows);
    expect(all).not.toMatch(/7777|7,777|361|18,?160|Private/);
    expect(() => recordPlannerEvent(db, casey, { event: "salary_entered", mode: "plan" }, now)).toThrow(/Unknown event/);
  });

  it("counts a retried event once", () => {
    for (let i = 0; i < 3; i++) recordPlannerEvent(db, casey, { event: "business_simulator_opened", mode: "plan", idem: "evt-key-same" }, now);
    expect(eventRows().filter((e) => e.event === "business_simulator_opened")).toHaveLength(1);
  });

  it("the authors' report counts use of the low and high cases without naming anyone or showing a figure", () => {
    recordPlannerEvent(db, casey, { event: "business_simulator_opened", mode: "plan" }, now);
    recordPlannerEvent(db, casey, { event: "scenario_compared", mode: "plan", detail: "growth:slower" }, now);
    const r = plannerReport(db, jordan);
    expect(r).toMatchObject({ openedBy: "fewer than 5", usedSensitivity: "fewer than 5" });
    expect(JSON.stringify(r)).not.toMatch(/taylor|casey|7777/i);
  });
});

describe("an older database", () => {
  it("gains the new columns in place, keeping every saved version and event", () => {
    const old = openDb(":memory:");
    old.exec(`DROP TABLE IF EXISTS planner_events; DROP TABLE IF EXISTS business_plan_versions;
CREATE TABLE business_plan_versions (
  plan_id TEXT NOT NULL REFERENCES business_plans(id), number INTEGER NOT NULL, inputs TEXT NOT NULL, model_version TEXT NOT NULL,
  planner_version TEXT NOT NULL, snapshot TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', saved_by TEXT NOT NULL REFERENCES users(id), saved_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, number)
);
CREATE TABLE planner_events (
  id TEXT PRIMARY KEY, event TEXT NOT NULL, mode TEXT NOT NULL, access TEXT NOT NULL, model_version TEXT NOT NULL,
  user_id TEXT NOT NULL, org_id TEXT, at TEXT NOT NULL
);
INSERT INTO planner_events (id, event, mode, access, model_version, user_id, org_id, at) VALUES ('e1', 'scenario_saved', 'plan', 'owner', 'hiring-model-2', 'casey', 'taylor-cleaning', '2026-11-22');`);
    ensurePlanner(old, now);
    const cols = (t: string) => (old.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols("planner_events")).toEqual(expect.arrayContaining(["detail", "idem"]));
    expect(cols("business_plan_versions")).toContain("idem");
    expect(old.prepare("SELECT id, detail, idem FROM planner_events").all()).toEqual([{ id: "e1", detail: "", idem: null }]);
    const c = userById(old, "casey")!;
    expect(savePlan(old, c, { name: "After", plan: myPlan(), idem: "save-key-0009" }, now).version).toBe(1);
  });

  it("a version's snapshot can be recalculated from its inputs alone", () => {
    expect(snapshotOf(myPlan())).toMatchObject({ complete: true, window: { kind: "interim-and-recruit" } });
  });
});
