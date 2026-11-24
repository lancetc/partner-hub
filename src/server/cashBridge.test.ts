import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { blankInputs, calculate, dateLabel, money } from "@/lib/cashBridge";
import { caseProblems, cashBridgeHardProblems, currentScenario, emptyState, type CashBridgeLabData } from "@/lib/cashBridgeLab";
import { charactersInBlock } from "@/lib/characters";
import { MAYA_INPUTS } from "@/lib/hiringRunway";
import { CASH_BRIDGE_CASE } from "@/content/cashBridgeCases";
import { ensurePlanner } from "./caseloadPlanner";
import {
  businessHome,
  cashBridgeState,
  cashBridgeStats,
  exportWorkbook,
  finishCashBridge,
  getPlan,
  retryCashBridge,
  saveCashBridge,
  savePlan,
  sheetEvent,
  submitLow,
  submitPrediction,
} from "./cashBridge";

/*
  The 90-Day Cash Bridge on the server: Maya's case reuses the Hiring Runway's terms and passes its check, can't publish
  unsigned, gives readers no answer key, enforces the order, puts a critical flag above any score, logs no figures,
  keeps private plans to their own business, and writes a workbook that agrees with the page (PRD section 12).
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-24T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  finance: "Finance",
  operations: "Ops",
  quality: "Quality",
  partnerships: "Partnerships",
  privacy: "Privacy",
  partnerReps: "Pilot",
  approvedOn: "2026-11-24",
  effectiveFrom: "2026-11-24",
  reviewBy: "2027-06-30",
};
const fund = (signed = true): CashBridgeLabData => {
  const d = structuredClone(CASH_BRIDGE_CASE);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: CashBridgeLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Cash",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The 90 days", blocks: [{ id: "cb", type: "cashbridge", ...data }] }],
    },
  ],
});
function course(data = fund()) {
  const c = createGuide(db, jordan, { title: "Can we fund the next 90 days?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
const CARDS = Object.fromEntries(CASH_BRIDGE_CASE.cards.map((c) => [c.id, { stage: c.answer.stage, cash: c.answer.cash }]));

function workThrough(guideId: string, user: User, over: Record<string, unknown> = {}, required: number | null = 30_906) {
  submitPrediction(db, user, guideId, { blockId: "cb", prediction: { cover: "dip", hardest: "p-jan28" } }, now);
  saveCashBridge(db, user, guideId, { blockId: "cb", state: { stage: 2, cards: CARDS, slip: "move" } }, now);
  saveCashBridge(db, user, guideId, { blockId: "cb", state: { stage: 3, inspected: ["week:9", "date:2027-01-28", "view:capacity"] } }, now);
  submitLow(db, user, guideId, { blockId: "cb", low: { option: "jan28", required } }, now);
  return saveCashBridge(
    db,
    user,
    guideId,
    {
      blockId: "cb",
      state: {
        stage: 5,
        tried: ["late-receipt", "hire-feb"],
        tested: ["late-receipt", "late-start", "hire-feb"],
        decision: "hire-feb",
        explanation: "dated",
        actuals: true,
        review: "replace",
        ...over,
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

describe("Maya’s case", () => {
  it("reuses the Hiring Runway’s agreement, cash and capacity rather than a second set of terms", () => {
    const i = CASH_BRIDGE_CASE.inputs;
    expect(i.agreement).toMatchObject({ feePerMonth: MAYA_INPUTS.incomePerClient, lagMonths: MAYA_INPUTS.paymentLagMonths });
    expect([i.openingCash, i.reserve]).toEqual([MAYA_INPUTS.openingCash, MAYA_INPUTS.reserve]);
    expect(i.capacity?.model).toBe(MAYA_INPUTS);
    expect(i.caseload.active).toBe(MAYA_INPUTS.bands.standard.count + MAYA_INPUTS.bands.higher.count + MAYA_INPUTS.bands.intensive.count);
    // The loaded coordinator cost, split into dated parts, adds back to the Hiring Runway's $7,550 a month.
    const h = i.hires.find((x) => x.existing)!;
    expect(((h.grossPerPay! + h.superPerPay!) * 26) / 12 + h.onCostPerMonth!).toBeCloseTo(MAYA_INPUTS.staffCostPerFte, 6);
    // And the one-off hiring cost to its $4,000.
    expect(i.events.filter((e) => e.category === "setup").reduce((n, e) => n + (e.amount as number), 0)).toBe(4_000);
    expect(CASH_BRIDGE_CASE.story.situation).toMatch(/Toowoomba.*35 people; three start each month and about one leaves.*\$26,720.*\$10,000/);
  });

  it("finds a midweek payroll low the weekly view hides, a gap to close, and a late receipt that goes below zero", () => {
    const r = calculate(CASH_BRIDGE_CASE.inputs);
    expect([money(r.low.cents), dateLabel(r.low.date)]).toEqual(["$5,814", "Thu 28 Jan"]);
    expect([money(r.required), money(r.additional!)]).toEqual(["$30,906", "$4,186"]);
    const week = r.buckets.find((b) => b.from <= r.low.date && b.to >= r.low.date)!;
    expect(week.closing).toBeGreaterThan(r.reserve);
    expect(r.intraday.risks.map((x) => x.date)).toEqual(["2026-12-31", "2027-02-26"]);
    const late = calculate(CASH_BRIDGE_CASE.inputs, CASH_BRIDGE_CASE.options.find((o) => o.id === "late-receipt")!.patch);
    expect(late.belowZero.first).toBe("2027-02-11");
    // An enquiry and an allocation make no receipt; a hire moved to March leaves February over the capacity threshold.
    expect(r.days.flatMap((d) => d.events).some((e) => /Start [4689]/.test(e.label))).toBe(false);
    const march = calculate(CASH_BRIDGE_CASE.inputs, CASH_BRIDGE_CASE.options.find((o) => o.id === "hire-mar")!.patch);
    expect(march.capacity!.filter((m) => m.pressure).map((m) => m.month)).toEqual(["2027-02"]);
    expect(caseProblems(CASH_BRIDGE_CASE)).toEqual([]);
  });

  it("reads back from stored JSON unchanged", () => {
    const parsed = allBlocks(readGuideDoc(doc(fund()) as never)).find((b) => b.type === "cashbridge")! as unknown as CashBridgeLabData;
    expect(parsed.inputs).toEqual(CASH_BRIDGE_CASE.inputs);
    expect(parsed.options).toEqual(CASH_BRIDGE_CASE.options);
    expect(parsed.example).toEqual(CASH_BRIDGE_CASE.example);
    expect(parsed.cards).toEqual(CASH_BRIDGE_CASE.cards);
  });

  it("ships with its sign-off empty, and can't be published without it, even with “Publish anyway”", () => {
    expect(Object.values(CASH_BRIDGE_CASE.approval).every((v) => v === "")).toBe(true);
    expect(cashBridgeHardProblems(fund(false), "2026-11-24").join(" ")).toMatch(/record the owner, Finance/);
    const c = createGuide(db, jordan, { title: "Cash", completion: "confirm", doc: doc(fund(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/90-Day Cash Bridge block needs/);
    expect(() => course()).not.toThrow();
  });

  it("names Maya for the character library, and no coordinator, worker or client", () => {
    expect(charactersInBlock({ type: "cashbridge", ...CASH_BRIDGE_CASE }).map((p) => [p.name, p.role])).toEqual([["Maya", "other"]]);
    expect(JSON.stringify(CASH_BRIDGE_CASE)).not.toMatch(/\bSam\b|Leila|Amira/);
  });

  it("gives learners no answer key", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "cashbridge") as unknown as CashBridgeLabData;
    expect(b.cards.every((x) => !x.feedback && x.answer.stage === "start" && x.answer.cash === false)).toBe(true);
    for (const list of [b.slip.options, b.lowPoint.options, b.explanations, b.decisions, b.review.options])
      expect(list.every((o) => !o.feedback && !o.flags.length && !Object.keys(o.levels).length)).toBe(true);
    expect(b.decisions.every((x) => !x.outcome)).toBe(true);
    expect(b.prediction.options.every((x) => !x.likely)).toBe(true);
    expect([b.debrief, b.followUp]).toEqual(["", ""]);
    // The figures stay: the readers' copy calculates the same bridge.
    expect(calculate(b.inputs).low).toEqual(calculate(CASH_BRIDGE_CASE.inputs).low);
  });
});

describe("an attempt", () => {
  it("opens the evidence only after the first guess, the choices only after the low point, and the debrief only when every step is done", () => {
    const c = course();
    expect(saveCashBridge(db, riley, c.id, { blockId: "cb", state: { stage: 4 } }, now).state.stage).toBe(0);
    expect(() => submitLow(db, riley, c.id, { blockId: "cb", low: { option: "jan28", required: 1 } }, now)).toThrow(/first guess/);
    expect(() => finishCashBridge(db, riley, c.id, { blockId: "cb", decision: "hire-feb", explanation: "dated", review: "replace" }, now)).toThrow(
      /first guess/,
    );
    workThrough(c.id, riley);
    const v = finishCashBridge(db, riley, c.id, { blockId: "cb" }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBe(18);
    expect(v.debrief!.low).toMatchObject({ matched: true, date: "2027-01-28", required: 3_090_600 });
    expect(v.debrief!.decision.outcome).toMatch(/starts on 1 February/);
    expect(cashBridgeState(db, riley, c.id, "cb").debrief).not.toBeNull();
  });

  it("puts closing the gap with a service delay above any score, and catches the misconceptions", () => {
    const c = course();
    workThrough(
      c.id,
      riley,
      {
        cards: {
          ...CARDS,
          "c-advice": { stage: "received", cash: true },
          "c-allocation": { stage: "earned", cash: true },
          "c-pooled": { stage: "earned", cash: false },
        },
        decision: "pause-starts",
        explanation: "margin",
        review: "ignore",
        inspected: [],
      },
      null,
    );
    // A fresh attempt's low reading, from the month-end.
    const d = finishCashBridge(db, riley, c.id, { blockId: "cb" }, now).debrief!;
    expect(d.unsafe).toBe(true);
    expect(d.flags[0]).toMatchObject({ id: "cutCare", critical: true });
    expect(d.flags.map((f) => f.id).sort()).toEqual(["cutCare", "doubleCount", "guarantee", "ignoredBill", "prospectAsCash", "publicFunding"]);
    expect(d.dims.find((x) => x.dim === "continuity")!.rating).toBe(0);
    expect(d.dims.find((x) => x.dim === "arithmetic")!.rating).toBe(0);
  });

  it("flags a month-end reading and a hire moved without opening the capacity check", () => {
    const c = course();
    submitPrediction(db, riley, c.id, { blockId: "cb", prediction: { cover: "yes", hardest: "p-dec17" } }, now);
    saveCashBridge(db, riley, c.id, { blockId: "cb", state: { stage: 2, cards: CARDS, slip: "move", inspected: ["week:9"] } }, now);
    saveCashBridge(db, riley, c.id, { blockId: "cb", state: { stage: 3 } }, now);
    submitLow(db, riley, c.id, { blockId: "cb", low: { option: "jan31", required: 26_720 } }, now);
    saveCashBridge(
      db,
      riley,
      c.id,
      { blockId: "cb", state: { stage: 5, tried: ["late-receipt", "hire-mar"], decision: "buffer", explanation: "dated", actuals: true, review: "replace" } },
      now,
    );
    const d = finishCashBridge(db, riley, c.id, { blockId: "cb" }, now).debrief!;
    expect(d.flags.map((f) => f.id).sort()).toEqual(["hireNoCapacity", "monthEndPayroll"]);
    expect(d.low.matched).toBe(false);
  });

  it("keeps every attempt, and logs fictional choices and matches only: no figures or typed amounts", () => {
    const c = course();
    workThrough(c.id, riley);
    finishCashBridge(db, riley, c.id, { blockId: "cb" }, now);
    sheetEvent(db, riley, c.id, { blockId: "cb", action: "printed" }, now);
    const wb = exportWorkbook(db, riley, { guideId: c.id, blockId: "cb", tried: ["late-receipt"], actuals: false }, now);
    expect(wb.file).toMatch(/^fictional-90-day-cash-bridge-2026-11-24\.xlsx$/);
    const again = retryCashBridge(db, riley, c.id, { blockId: "cb" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state).toEqual({ ...emptyState(), retries: 1 });
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "cashbridge_started",
        "prediction_submitted",
        "card_placed",
        "start_answered",
        "week_opened",
        "date_opened",
        "view_opened",
        "low_answered",
        "sensitivity_tested",
        "option_tried",
        "actuals_applied",
        "review_answered",
        "decision_submitted",
        "cashbridge_completed",
        "sheet_printed",
        "workbook_exported",
        "retry_started",
      ]),
    );
    const text = log.map((e) => e.detail).join(" ");
    expect(text).not.toMatch(/30906|30,906|5814|26720|\$|Maya/);
    expect(cashBridgeStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null });
    expect(() => cashBridgeStats(db, riley, c.id)).toThrow();
  });
});

describe("the workbook", () => {
  it("gives the same low date, balances and required opening cash as the page, labelled fictional, with every sheet", () => {
    const c = course();
    submitPrediction(db, riley, c.id, { blockId: "cb", prediction: { cover: "dip", hardest: "p-jan28" } }, now);
    const s = { ...emptyState(), tried: ["late-receipt"] };
    const page = calculate(CASH_BRIDGE_CASE.inputs, currentScenario(CASH_BRIDGE_CASE, s));
    const { sheets, bytes } = exportWorkbook(db, riley, { guideId: c.id, blockId: "cb", tried: s.tried, actuals: false }, now);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(sheets.map((x) => x.name)).toEqual([
      "Assumptions",
      "Dated receipts",
      "Dated outflows",
      "Daily balance",
      "Weekly view",
      "Scenario comparison",
      "Definitions and data sources",
    ]);
    const row = (name: string) => sheets[0].rows.find((r) => r[0] === name)?.[1];
    expect(row("Label")).toMatch(/^FICTIONAL/);
    expect(row("Calendar")).toBe("Australia/Brisbane local dates");
    expect(row("Result: low date")).toBe(page.low.date);
    expect(row("Result: lowest end-of-day cash")).toBe(page.low.cents / 100);
    expect(row("Result: opening cash needed to keep the reserve")).toBe(page.required / 100);
    const daily = sheets.find((x) => x.name === "Daily balance")!;
    expect(daily.rows).toHaveLength(90);
    expect(daily.rows.find((r) => r[10] === "LOW")![0]).toBe(page.low.date);
    expect(daily.rows.map((r) => r[6])).toEqual(page.days.map((d) => d.closing / 100));
    expect(sheets.find((x) => x.name === "Weekly view")!.rows).toHaveLength(13);
    expect(JSON.stringify(sheets)).not.toMatch(/\bSam\b/);
  });
});

describe("Plan my next 90 days", () => {
  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, plans: [] });
    expect(() => savePlan(db, sam, { name: "Mine", inputs: blankInputs("2026-12-01") }, now)).toThrow(/business owner/);
    expect(() => exportWorkbook(db, sam, { inputs: blankInputs("2026-12-01") }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions, keeps blanks, strips names, and shows what changed since last time", () => {
    const v1 = savePlan(db, casey, { name: "December to February", inputs: blankInputs("2026-12-01") }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.openingCash).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    const mine = structuredClone(CASH_BRIDGE_CASE.inputs);
    mine.clients[0].label = "Mrs Example";
    mine.hires[1].label = "Jo Bloggs";
    const v2 = savePlan(
      db,
      casey,
      { id: v1.id, inputs: { ...mine, publicFunding: 5_000 }, sheet: { option: "Hire from February", scenarioType: "hire", owner: "Principal" } },
      now,
    );
    expect(v2.version).toBe(2);
    expect(JSON.stringify(v2.inputs)).not.toMatch(/Mrs Example|Jo Bloggs/);
    expect(v2.inputs.clients[0].label).toBe("Start 1");
    expect(v2.inputs).not.toHaveProperty("publicFunding");
    expect(v2.inputs.capacity).toBeNull();
    expect(v2.inputs.events.every((e) => e.source !== "fictional")).toBe(true);
    expect(v2.versions[1].snapshot).toMatchObject({ lowDate: "2027-01-28", required: 3_090_600 });
    const later = structuredClone(v2.inputs);
    later.hires[1].start = "2027-02-01";
    const v3 = savePlan(db, casey, { id: v1.id, inputs: later, note: "Hire moved" }, now);
    expect(v3.previous).toMatchObject({ number: 2, sheet: { option: "Hire from February" } });
    expect(getPlan(db, casey, v1.id, 1, now).inputs.reserve).toBeNull();
    // Exports are recorded with the reads and saves; none of it carries a figure.
    exportWorkbook(db, casey, { id: v1.id, version: 3 }, now);
    const audit = db.prepare("SELECT action, version FROM cashbridge_plan_audit WHERE plan_id = ? ORDER BY rowid").all(v1.id) as { action: string }[];
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["save", "read", "export"]));
  });

  it("can't be read or exported by anyone outside the business, whatever id they try, and never reaches the authors' totals", () => {
    const p = savePlan(db, casey, { name: "Mine", inputs: blankInputs("2026-12-01") }, now);
    expect(() => getPlan(db, sam, p.id, null, now)).toThrow(/business owner/);
    expect(() => getPlan(db, jordan, p.id, null, now)).toThrow();
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getPlan(db, riley, p.id, null, now)).toThrow(/isn’t here/);
    expect(() => savePlan(db, riley, { id: p.id, inputs: blankInputs("2026-12-01") }, now)).toThrow(/isn’t here/);
    expect(() => exportWorkbook(db, riley, { id: p.id }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).plans).toEqual([]);
    const c = course();
    expect(cashBridgeStats(db, jordan, c.id).blocks).toEqual([]);
  });
});
