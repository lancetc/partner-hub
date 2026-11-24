import { beforeEach, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { analyse, blankPlan, fictionalExample, monthlyRows, type Plan } from "@/lib/caseloadPlanner";
import {
  accessList,
  comparePlans,
  duplicatePlan,
  ensurePlanner,
  exportWorkbook,
  getPlan,
  listPlans,
  plannerAccess,
  plannerEligible,
  plannerHome,
  plannerReport,
  recordPlannerEvent,
  savePlan,
  setAccess,
  setToolFavourite,
} from "./caseloadPlanner";
import { favouritesList } from "./favourites";

/* The Caseload-to-Margin Work Tool's server: business scope on every call, versions never overwritten, figure-free events, and a workbook that matches the page. */

let db: Db;
let casey: User, sam: User, riley: User, jordan: User, ash: User;
const now = new Date("2026-11-22T00:00:00Z");

/** A business plan with real-looking (still invented) aggregate figures. */
const myPlan = (patch: Partial<Plan["values"]> = {}): Plan => ({ ...fictionalExample(), kind: "business", values: { ...fictionalExample().values, ...patch } });

beforeEach(() => {
  db = openDb(":memory:");
  [casey, sam, riley, jordan, ash] = ["casey", "sam", "riley", "jordan", "ash"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
});

describe("who may plan a business", () => {
  it("is the owner, and members the owner authorises in the same business", () => {
    expect(plannerAccess(db, casey)).toMatchObject({ orgId: "taylor-cleaning", role: "owner" });
    expect(plannerAccess(db, sam)).toBeNull();
    setAccess(db, casey, { userId: "sam", grant: true }, now);
    expect(plannerAccess(db, sam)).toMatchObject({ orgId: "taylor-cleaning", role: "member" });
    expect(
      accessList(db, casey)
        .members.map((m) => m.id)
        .sort(),
    ).toEqual(["casey", "sam"]);
    setAccess(db, casey, { userId: "sam", grant: false }, now);
    expect(plannerAccess(db, sam)).toBeNull();
  });

  it("can't reach into another business, and a member can't hand out access", () => {
    expect(() => setAccess(db, casey, { userId: "riley", grant: true }, now)).toThrow(/isn’t in your business/);
    setAccess(db, casey, { userId: "sam", grant: true }, now);
    expect(() => setAccess(db, sam, { userId: "casey", grant: false }, now)).toThrow(/Only the business owner/);
    expect(() => setAccess(db, casey, { userId: "casey", grant: false }, now)).toThrow(/your own access/);
  });

  it("gives a general coordinator, another partner and Trilogy staff no business access", () => {
    for (const u of [riley, ash, jordan]) {
      expect(plannerAccess(db, u)).toBeNull();
      expect(() => listPlans(db, u)).toThrow(/business owner/);
      expect(() => savePlan(db, u, { name: "Mine", plan: blankPlan() }, now)).toThrow(/business owner/);
    }
    // Authors still see the card, to review the tool and its fictional example.
    expect(plannerEligible(db, jordan)).toBe(true);
    expect(plannerEligible(db, riley)).toBe(false);
  });
});

describe("saved plans", () => {
  it("saves new versions and never overwrites one", () => {
    const first = savePlan(db, casey, { name: "Next year", plan: myPlan() }, now);
    expect(first.version).toBe(1);
    const second = savePlan(db, casey, { id: first.id, plan: myPlan({ newPerMonth: 5 }), note: "Busier intake" }, now);
    expect(second.version).toBe(2);
    expect(getPlan(db, casey, first.id, 1).plan.values.newPerMonth).toBe(3);
    expect(getPlan(db, casey, first.id, 2).plan.values.newPerMonth).toBe(5);
    expect(second.versions.map((v) => v.modelVersion)).toEqual(["hiring-model-2", "hiring-model-2"]);
    expect(second.versions[0].snapshot.options["add-10"].lowestCash).toBe(-1_670);
  });

  it("won't save the fictional example, or a plan without a name", () => {
    expect(() => savePlan(db, casey, { name: "Example", plan: fictionalExample() }, now)).toThrow(/fictional example isn’t saved/);
    expect(() => savePlan(db, casey, { name: " ", plan: blankPlan() }, now)).toThrow(/name/);
  });

  it("saves a blank plan as blanks, with no income invented", () => {
    const p = savePlan(db, casey, { name: "Draft", plan: blankPlan() }, now);
    expect(p.plan.values.income).toBeNull();
    expect(p.versions[0].snapshot).toEqual({ complete: false });
  });

  it("duplicates a version into a new plan and compares versions", () => {
    const a = savePlan(db, casey, { name: "Base", plan: myPlan() }, now);
    savePlan(db, casey, { id: a.id, plan: myPlan({ newPerMonth: 5, currentFte: 1.2 }) }, now);
    const copy = duplicatePlan(db, casey, { id: a.id, version: 1 }, now);
    expect(copy.name).toBe("Base (copy)");
    expect(copy.from).toEqual({ plan: a.id, version: 1 });
    expect(getPlan(db, casey, a.id).versions).toHaveLength(2);
    const c = comparePlans(db, casey, { id: a.id, a: 1, b: 2 }, now);
    expect(c.inputs.map((i) => i.key).sort()).toEqual(["currentFte", "newPerMonth"]);
  });

  it("is not found by a guessed address from outside the business", () => {
    const p = savePlan(db, casey, { name: "Private", plan: myPlan() }, now);
    setAccess(db, casey, { userId: "sam", grant: true }, now);
    expect(getPlan(db, sam, p.id).name).toBe("Private");
    // Another business's owner: give Riley's business an owner and try.
    db.prepare(
      "INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES ('northside-coord', 'riley', 'owner', 'test', ?)",
    ).run(now.toISOString());
    for (const call of [
      () => getPlan(db, riley, p.id),
      () => savePlan(db, riley, { id: p.id, plan: myPlan() }, now),
      () => duplicatePlan(db, riley, { id: p.id }, now),
      () => comparePlans(db, riley, { id: p.id, a: 1, b: 1 }, now),
      () => exportWorkbook(db, riley, { id: p.id }, now),
    ])
      expect(call).toThrow(/That plan isn’t here/);
    expect(listPlans(db, riley).plans).toEqual([]);
    // Removing a member's access closes the plans to them at once.
    setAccess(db, casey, { userId: "sam", grant: false }, now);
    expect(() => getPlan(db, sam, p.id)).toThrow(/business owner/);
  });
});

describe("the workbook", () => {
  const sheetText = (bytes: Buffer, n: number) => strFromU8(unzipSync(new Uint8Array(bytes))[`xl/worksheets/sheet${n}.xml`]);

  it("downloads the fictional example for anyone, with five sheets that match the page", () => {
    const { bytes, file } = exportWorkbook(db, riley, { plan: fictionalExample(), growthId: "expected", optionId: "add-10" }, now);
    expect(file).toBe("fictional-example-2026-11-22.xlsx");
    const files = Object.keys(unzipSync(new Uint8Array(bytes)));
    expect(files.filter((f) => f.startsWith("xl/worksheets/"))).toHaveLength(5);
    const monthly = sheetText(bytes, 3);
    const a = analyse(fictionalExample(), "expected", "add-10")!;
    // Every number on the page's monthly table is in the sheet as a number cell.
    for (const row of monthlyRows(a.selected, a)) for (const v of row) if (typeof v === "number") expect(monthly).toContain(`<v>${v}</v>`);
    expect(sheetText(bytes, 4)).toContain("<v>-1670</v>");
  });

  it("needs business access for an unsaved business plan, and has no participant details", () => {
    expect(() => exportWorkbook(db, riley, { plan: myPlan() }, now)).toThrow(/business owner/);
    const { bytes } = exportWorkbook(db, casey, { plan: myPlan() }, now);
    const all = Object.values(unzipSync(new Uint8Array(bytes)))
      .map((x) => strFromU8(x))
      .join(" ");
    expect(all).not.toMatch(/Mrs |Mr |date of birth/i);
  });

  it("says when the caseload isn't there yet", () => {
    expect(() => exportWorkbook(db, casey, { plan: blankPlan() }, now)).toThrow(/Fill in the caseload/);
  });
});

describe("events, reporting and Favourites", () => {
  it("records events with no figures, and reports counts only", () => {
    recordPlannerEvent(db, riley, { event: "business_simulator_opened", mode: "learn" }, now);
    recordPlannerEvent(db, casey, { event: "cash_warning_seen", mode: "plan" }, now);
    expect(() => recordPlannerEvent(db, riley, { event: "business_simulator_opened", mode: "plan" }, now)).toThrow(/business owner/);
    expect(() => recordPlannerEvent(db, casey, { event: "income_entered", mode: "plan" }, now)).toThrow(/Unknown event/);
    const cols = (db.prepare("PRAGMA table_info(planner_events)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(["id", "event", "mode", "access", "model_version", "user_id", "org_id", "at"]);
    const r = plannerReport(db, jordan);
    // One business is too few to report as a number.
    expect(r).toMatchObject({ eligibleBusinesses: "fewer than 5", businessesPlanning: "fewer than 5", savedPlans: 0 });
    expect(JSON.stringify(r)).not.toMatch(/taylor|casey|riley/i);
    expect(() => plannerReport(db, casey)).toThrow(/Only authors/);
  });

  it("pins the tool to Favourites for someone who can use it, and shows it there", () => {
    expect(() => setToolFavourite(db, riley, true, now)).toThrow(/isn’t available/);
    expect(setToolFavourite(db, casey, true, now)).toEqual({ saved: true });
    expect(plannerHome(db, casey).saved).toBe(true);
    const item = favouritesList(db, casey, {}, now).items.find((i) => i.kind === "tool")!;
    expect(item).toMatchObject({ title: "Caseload-to-Margin & Hiring Capacity", state: "current", href: "/tools/caseload-margin?from=favourites" });
    expect(setToolFavourite(db, casey, false, now)).toEqual({ saved: false });
  });

  it("moves an older Favourites table on to allow a tool, keeping what was saved", () => {
    const old = openDb(":memory:");
    old.exec(`DROP TABLE favourites; CREATE TABLE favourites (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK (kind IN ('job_aid', 'passage')), target_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, seen TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL, last_opened_at TEXT,
      UNIQUE (user_id, kind, target_id));
      INSERT INTO favourites (id, user_id, kind, target_id, saved_at) VALUES ('f1', 'casey', 'job_aid', 'x', '2026-01-01');`);
    ensurePlanner(old, now);
    expect(setToolFavourite(old, userById(old, "casey")!, true, now)).toEqual({ saved: true });
    expect((old.prepare("SELECT COUNT(*) AS n FROM favourites").get() as { n: number }).n).toBe(2);
  });
});
