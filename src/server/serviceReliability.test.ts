import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, currentInputs, reliabilityForReaders, reliabilityHardProblems, type ReliabilityLabData } from "@/lib/reliabilityLab";
import { blankInputs, calculate } from "@/lib/serviceReliability";
import { charactersInBlock } from "@/lib/characters";
import { MISSED_SERVICE } from "@/content/reliabilityCases";
import { ensurePlanner } from "./caseloadPlanner";
import {
  businessHome,
  finishReliability,
  getSheet,
  reliabilityState,
  reliabilityStats,
  retryReliability,
  saveReliability,
  saveSheet,
  sheetEvent,
  submitPrediction,
} from "./serviceReliability";

/*
  The Service Reliability Calculator on the server: a fictional case that passes its check and can't publish unsigned,
  no answer key for readers, the debrief only once every step is done, a critical flag above any score, telemetry with
  no words or figures, and private Decision Sheets nobody outside the business can reach (PRD section 15, fixtures 1,
  9, 10 and 11).
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-24T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  operations: "Ops",
  quality: "Quality",
  clinical: "Clinical",
  supplier: "Supplier",
  finance: "Finance",
  policy: "Policy",
  partnerships: "Partnerships",
  privacy: "Privacy",
  approvedOn: "2026-11-24",
  effectiveFrom: "2026-11-24",
  reviewBy: "2027-06-30",
};
const month = (signed = true): ReliabilityLabData => {
  const d = structuredClone(MISSED_SERVICE);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: ReliabilityLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Missed services",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The month", blocks: [{ id: "sr", type: "reliability", ...data }] }],
    },
  ],
});
function course(data = month()) {
  const c = createGuide(db, jordan, { title: "What does a missed service cost?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
/** The reviewed answers, for a strong attempt. */
const CARDS = Object.fromEntries(MISSED_SERVICE.cards.map((c) => [c.id, { choice: c.answer.choice, urgent: c.answer.urgent }]));
const ENTRIES = Object.fromEntries(MISSED_SERVICE.log.entries.map((e) => [e.id, !e.duplicate]));

function workThrough(guideId: string, user: User, over: Record<string, unknown> = {}) {
  saveReliability(db, user, guideId, { blockId: "sr", state: { stage: 1, response: "listen" } }, now);
  submitPrediction(db, user, guideId, { blockId: "sr", response: "listen", prediction: { failures: 8, cost: "time" } }, now);
  return saveReliability(
    db,
    user,
    guideId,
    {
      blockId: "sr",
      state: {
        stage: 3,
        response: "listen",
        cards: CARDS,
        entries: ENTRIES,
        inspected: ["occ:V15", "view:table", "leads"],
        tried: ["backup"],
        estimates: { backup: { reduction: 0.75 } },
        changed: true,
        repeat: "pattern",
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

describe("the block", () => {
  it("reads back from stored JSON unchanged, and the case passes its check", () => {
    const parsed = allBlocks(readGuideDoc(doc(month()) as never)).find((b) => b.type === "reliability")! as unknown as ReliabilityLabData;
    expect(parsed.inputs).toEqual(MISSED_SERVICE.inputs);
    expect(parsed.cards).toEqual(MISSED_SERVICE.cards);
    expect(parsed.log).toEqual(MISSED_SERVICE.log);
    expect(caseProblems(MISSED_SERVICE)).toEqual([]);
  });

  it("ships with its sign-off empty, can't be published without it, and “Publish anyway” doesn’t cover it", () => {
    expect(Object.values(MISSED_SERVICE.approval).every((v) => v === "")).toBe(true);
    expect(reliabilityHardProblems(month(false), "2026-11-24").join(" ")).toMatch(/record the owner/);
    const c = createGuide(db, jordan, { title: "Missed services", completion: "confirm", doc: doc(month(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Service Reliability Calculator block needs/);
    expect(() => course()).not.toThrow();
  });

  it("names Maya and Mrs Patel for the character library, and no coordinator, worker or supplier", () => {
    const named = charactersInBlock({ type: "reliability", ...MISSED_SERVICE });
    expect(named.map((p) => [p.name, p.role])).toEqual([
      ["Maya", "other"],
      ["Mrs Patel", "participant"],
    ]);
    expect(JSON.stringify(MISSED_SERVICE)).not.toMatch(/\bSam\b|Leila|Amira|Brightway/);
  });

  it("gives learners no answer key: card answers, repeat lines, feedback, levels, flags and the debrief stay on the server", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "reliability") as unknown as ReliabilityLabData;
    expect(b.cards.every((x) => !x.feedback && x.answer.urgent === null)).toBe(true);
    expect(b.log.entries.every((e) => !e.duplicate && !e.feedback)).toBe(true);
    // The visits the cards describe don't give the answer away either.
    const asked = new Set(MISSED_SERVICE.cards.map((x) => x.occurrence).filter(Boolean));
    for (const o of b.inputs.occurrences.filter((x) => asked.has(x.id))) expect([o.outcome, o.reason, o.verified]).toEqual(["unknown", "", false]);
    for (const list of [b.response.options, b.repeat.options, b.explanations, b.decisions, b.later.options])
      expect(list.every((o) => !o.feedback && !o.flags.length && !Object.keys(o.levels).length)).toBe(true);
    expect(b.decisions.every((x) => !x.outcome)).toBe(true);
    expect(b.prediction.options.every((x) => !x.likely)).toBe(true);
    expect([b.debrief, b.followUp]).toEqual(["", ""]);
    // Classified the reviewed way, the readers' copy gives the same figures as the case.
    const mine = currentInputs(reliabilityForReaders(MISSED_SERVICE), { cards: CARDS, tried: [], estimates: {}, freedHours: "labour" });
    expect(calculate(mine).supplierRate.text).toBe(calculate(MISSED_SERVICE.inputs).supplierRate.text);
    expect(calculate(mine).recovery.cases.map((x) => [x.id, x.status, x.days])).toEqual(
      calculate(MISSED_SERVICE.inputs).recovery.cases.map((x) => [x.id, x.status, x.days]),
    );
  });
});

describe("an attempt", () => {
  it("opens the log only after the response and guess, and sends the debrief only once every step is done (fixture 1: no real data needed)", () => {
    const c = course();
    expect(saveReliability(db, riley, c.id, { blockId: "sr", state: { stage: 4 } }, now).state.stage).toBeLessThanOrEqual(1);
    expect(() => submitPrediction(db, riley, c.id, { blockId: "sr", prediction: { cost: "time" } }, now)).toThrow(/immediate response/);
    expect(() => finishReliability(db, riley, c.id, { blockId: "sr", decision: "reliability", explanation: "tradeoff", later: "measure" }, now)).toThrow(
      /Choose Mrs Patel’s immediate response/,
    );
    workThrough(c.id, riley);
    const v = finishReliability(db, riley, c.id, { blockId: "sr", decision: "reliability", explanation: "tradeoff", later: "measure" }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBe(15);
    expect(v.debrief!.hours).toEqual({ yours: 2.25, unique: 2.25, logged: 3.75 });
    expect(v.debrief!.result.supplierRate).toBe("5/100 = 5%");
    expect(v.debrief!.decision.outcome).toMatch(/backup starts on 10 November/);
    expect(reliabilityState(db, riley, c.id, "sr").debrief).not.toBeNull();
  });

  it("puts a missed escalation above any score (fixture 9), and catches the misconceptions", () => {
    const c = course();
    workThrough(c.id, riley, {
      cards: {
        ...CARDS,
        "c-lunchtime": { choice: "supplier", urgent: false },
        "c-sister": { choice: "supplier", urgent: null },
        "c-invoice": { choice: "delivered", urgent: null },
      },
      entries: Object.fromEntries(MISSED_SERVICE.log.entries.map((e) => [e.id, true])),
      repeat: "booked",
    });
    const d = finishReliability(db, riley, c.id, { blockId: "sr", decision: "double", explanation: "lifetime", later: "save" }, now).debrief!;
    expect(d.unsafe).toBe(true);
    expect(d.flags.find((f) => f.id === "noEscalation")).toMatchObject({ critical: true });
    expect(d.flags.map((f) => f.id).sort()).toEqual(["allSupplier", "bookedAsDelivered", "doubleCount", "lifetimeValue", "noEscalation", "transferFailure"]);
    expect(d.dims.find((x) => x.dim === "person")!.rating).toBe(0);
    expect(d.hours.yours).toBe(3.75);
  });

  it("a person choosing another provider isn't a learner failure when it's supported (fixture 9)", () => {
    const c = course();
    workThrough(c.id, riley);
    const d = finishReliability(db, riley, c.id, { blockId: "sr", decision: "reliability", explanation: "tradeoff", later: "measure" }, now).debrief!;
    expect(d.flags.map((f) => f.id)).not.toContain("transferFailure");
    expect(d.dims.find((x) => x.dim === "person")!.rating).toBe(3);
  });

  it("keeps every attempt, and logs fictional choices, matches, levels and flags only: no words, figures or assumptions", () => {
    const c = course();
    workThrough(c.id, riley);
    saveReliability(db, riley, c.id, { blockId: "sr", state: { estimates: { backup: { reduction: 0.5 } }, tried: ["backup"] } }, now);
    finishReliability(db, riley, c.id, { blockId: "sr", decision: "reliability", explanation: "tradeoff", later: "measure" }, now);
    sheetEvent(db, riley, c.id, { blockId: "sr", action: "printed" }, now);
    const again = retryReliability(db, riley, c.id, { blockId: "sr" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.stage).toBe(0);
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "reliability_started",
        "response_chosen",
        "prediction_submitted",
        "card_classified",
        "tasks_marked",
        "occurrence_opened",
        "view_opened",
        "intervention_tried",
        "assumption_revised",
        "repeat_answered",
        "decision_submitted",
        "later_answered",
        "reliability_completed",
        "sheet_printed",
        "retry_started",
      ]),
    );
    const text = log.map((e) => e.detail).join(" ");
    expect(text).not.toMatch(/Patel|Maya|book group|0\.75|0\.5|217|"failures"|\$/);
    expect(reliabilityStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null, decisions: null });
    expect(() => reliabilityStats(db, riley, c.id)).toThrow();
  });
});

describe("Review my service reliability", () => {
  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ orgName: expect.any(String), role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, sheets: [] });
    expect(() => saveSheet(db, sam, { name: "Mine", inputs: blankInputs("2026-11-24") }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions of aggregate counts only, keeps blanks, and shows last time's action beside the new figures", () => {
    const blank = blankInputs("2026-11-24");
    const v1 = saveSheet(db, casey, { name: "October", inputs: blank }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.hourly).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    // Individual visit rows (and links to them) never reach the store.
    const v2 = saveSheet(
      db,
      casey,
      {
        id: v1.id,
        inputs: { ...MISSED_SERVICE.inputs, lifetimeValue: 3000 },
        sheet: {
          action: "Tuesday backup",
          owner: "Principal",
          reviewBy: "2026-12-08",
          clientMeasure: "Ask Tuesday clients if the day is dependable",
          expectedPrevented: 3,
        },
      },
      now,
    );
    expect(v2.version).toBe(2);
    expect(v2.inputs.occurrences).toEqual([]);
    expect(v2.inputs.tasks.every((t) => !t.occurrence)).toBe(true);
    expect(v2.inputs).not.toHaveProperty("lifetimeValue");
    const v3 = saveSheet(db, casey, { id: v1.id, inputs: blank, sheet: { followUp: { result: "fewer", participantsSay: "Tuesdays are dependable" } } }, now);
    expect(v3.previous).toMatchObject({ number: 2, sheet: { action: "Tuesday backup", expectedPrevented: 3 } });
    expect(v3.sheet.followUp).toEqual({ result: "fewer", participantsSay: "Tuesdays are dependable", note: "" });
    expect(getSheet(db, casey, v1.id, 1).inputs.hourly).toBeNull();
    expect(businessHome(db, casey).sheets).toHaveLength(1);
  });

  it("can't be read by anyone outside the business, whatever id they ask for, and never reaches the authors' totals (fixture 10)", () => {
    const s = saveSheet(db, casey, { name: "October", inputs: blankInputs("2026-11-24") }, now);
    expect(() => getSheet(db, sam, s.id)).toThrow(/business owner/);
    expect(() => getSheet(db, jordan, s.id)).toThrow();
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getSheet(db, riley, s.id)).toThrow(/isn’t here/);
    expect(() => saveSheet(db, riley, { id: s.id, inputs: blankInputs("2026-11-24") }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).sheets).toEqual([]);
    const c = course();
    expect(reliabilityStats(db, jordan, c.id).blocks).toEqual([]);
  });
});
