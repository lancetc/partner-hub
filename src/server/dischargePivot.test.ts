import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, saveGuideDraft, authorGuide } from "./magazine";
import { setDemoSignOff } from "./demoSignOff";
import { allBlocks } from "@/lib/magazine";
import type { DischargeData } from "@/lib/dischargePivot";
import { DOT_DISCHARGE } from "@/content/dischargeCases";
import {
  dischargePlacements,
  dischargeRegister,
  dischargeState,
  dischargeStats,
  moveDischarge,
  retryDischarge,
  startDischarge,
  submitDischarge,
  viewedDischarge,
} from "./dischargePivot";

/*
  The 72-Hour Discharge Pivot on the server: it can't publish until its scenario check passes, its sources are real and
  its reviewers sign off; readers never get the scenario; moves and submits are idempotent; the debrief is frozen with
  the attempt; a hidden first-service gap is never a safe handover however quickly it was submitted; events carry no
  free text; retries get a variation; totals are suppressed under five people (PRD acceptance criteria 1, 5, 13, 15, 17).
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";

/** Test-only sign-off, with the placeholder internal sources swapped for public ones, to show a reviewed block can publish. The demo's stay empty. */
function approved(d: DischargeData = DOT_DISCHARGE): DischargeData {
  const c = structuredClone(d);
  const swap = (s: string) => (s.startsWith("tc-") ? "acqsc-transitions" : s);
  for (const a of c.actions) a.source = swap(a.source);
  for (const a of c.alerts) a.source = swap(a.source);
  for (const g of c.gates) g.source = swap(g.source);
  c.approval = {
    owner: "O",
    clinical: "C",
    operations: "Op",
    policy: "P",
    process: "Pr",
    learning: "L",
    approvedOn: TODAY,
    effectiveFrom: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: c.scenarioVersion,
  };
  return c;
}
const doc = (data: DischargeData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Dot comes home",
      purpose: "",
      template: "decide",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Dot", blocks: [{ id: "dp", type: "discharge", ...data }] }],
    },
  ],
});
function course(data = approved()) {
  const c = createGuide(db, jordan, { title: "ZZ Test discharge", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const B = { blockId: "dp" };
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];
const take = (u: User, g: string, action: string) => moveDischarge(db, u, g, { ...B, move: { do: "take", action } }, now);
const wait = (u: User, g: string) => {
  const v = dischargeState(db, u, g, "dp", {}, now);
  return moveDischarge(db, u, g, { ...B, move: { do: "wait", at: v.desk!.clock.minute } }, now);
};
const allGates = (status: string) => Object.fromEntries(DOT_DISCHARGE.gates.map((g) => [g.id, { status, owner: g.owners[0] }]));

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("publishing (criteria 1 and 16)", () => {
  it("can’t publish the demo as it ships, even with “Publish anyway”; a signed-off block on real sources can", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc(DOT_DISCHARGE) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/72-Hour Discharge Pivot needs a scenario that passes/);
    const stale = createGuide(
      db,
      jordan,
      { title: "Stale", completion: "confirm", doc: doc({ ...approved(), scenarioVersion: "dot-discharge-2" }) as never },
      now,
    );
    expect(() => publishGuide(db, jordan, stale.id, "", now)).toThrow(/Discharge Pivot/);
    expect(() => course()).not.toThrow();
  });

  it("a demo sign-off stands in for the reviewers, but never for a broken scenario", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const c = createGuide(db, jordan, { title: "Demo", completion: "confirm", doc: doc(DOT_DISCHARGE) as never }, now);
    setDemoSignOff(db, jordan, c.id, true, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).not.toThrow();
    const broken = structuredClone(DOT_DISCHARGE);
    broken.actions[0].effects.push({ fact: "first", status: "confirmed", text: "" });
    const b = createGuide(db, jordan, { title: "Broken", completion: "confirm", doc: doc(broken) as never }, now);
    setDemoSignOff(db, jordan, b.id, true, now);
    expect(() => publishGuide(db, jordan, b.id, "", now, { allowUnverified: true })).toThrow(/scenario check doesn’t pass/);
  });
});

describe("an attempt", () => {
  it("gives readers the frame only, and the desk without feedback, codes or future alerts", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "discharge") as unknown as DischargeData;
    expect([b.actions, b.alerts, b.gates, b.facts, b.paths]).toEqual([[], [], [], [], []]);
    const v = startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(/"feedback"|"codes"|hiddenGap|outreach team has accepted/);
    expect(v.desk!.alerts.map((a) => a.id)).toEqual(["planner-call"]);
    // The Topic embed gets the same readers' copy.
    const e = dischargeState(db, riley, c.slug, "dp", { embed: true }, now);
    expect(e.block!.actions).toEqual([]);
    expect(e.attemptId).toBe(v.attemptId);
  });

  it("is idempotent: a resent start, move, wait, submit or viewed changes nothing twice (criterion 13)", () => {
    const c = course();
    const a = startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    expect(startDischarge(db, riley, c.id, { ...B, mode: "untimed" }, now).attemptId).toBe(a.attemptId);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "inspect", fact: "wound" } }, now);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "inspect", fact: "wound" } }, now);
    take(riley, c.id, "ask-summary");
    take(riley, c.id, "ask-summary");
    moveDischarge(db, riley, c.id, { ...B, move: { do: "wait", at: 15 } }, now);
    const v = moveDischarge(db, riley, c.id, { ...B, move: { do: "wait", at: 15 } }, now);
    expect(v.desk!.clock.minute).toBe(30);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "handover" } }, now);
    const h = { declaration: "ready", gates: allGates("confirmed"), answers: { tell: "reassure", firstcheck: "fiona" } };
    const r1 = submitDischarge(db, riley, c.id, { ...B, handover: h }, now);
    const r2 = submitDischarge(db, riley, c.id, { ...B, handover: { ...h, declaration: "incomplete" } }, now);
    expect(r2.debrief).toEqual(r1.debrief);
    viewedDischarge(db, riley, c.id, B, now);
    viewedDischarge(db, riley, c.id, B, now);
    const ev = events(c.id).map((e) => e.event);
    const count = (n: string) => ev.filter((e) => e === n).length;
    expect([
      count("activity_started"),
      count("handover_field_checked"),
      count("action_taken"),
      count("response_submitted"),
      count("activity_completed"),
    ]).toEqual([1, 1, 1, 1, 1]);
  });

  it("never scores a hidden first-service gap as a safe handover, however quickly it’s submitted (criterion 5)", () => {
    const c = course({ ...approved(), mode: "assessed", passMark: 1 });
    startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "inspect", fact: "first" } }, now);
    take(riley, c.id, "ask-summary");
    moveDischarge(db, riley, c.id, { ...B, move: { do: "handover" } }, now);
    const v = submitDischarge(
      db,
      riley,
      c.id,
      { ...B, handover: { declaration: "ready", gates: allGates("confirmed"), answers: { tell: "honest", firstcheck: "call" } } },
      now,
    );
    expect(v.debrief!.ending).toBe("unsafe");
    expect(v.debrief!.critical.map((x) => x.code)).toContain("hiddenGap");
    expect(v.debrief!.finishedAt).toBe("Wednesday 3:45 pm");
    viewedDischarge(db, riley, c.id, B, now);
    const ev = events(c.id).map((e) => e.event);
    expect(ev).toContain("assessment_attempted");
    expect(ev).not.toContain("assessment_passed");
  });

  it("plays the prompt path to a confirmed handover, completes only once the debrief is viewed, and logs ids only", () => {
    const c = course();
    startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    for (const f of DOT_DISCHARGE.facts) moveDischarge(db, riley, c.id, { ...B, move: { do: "inspect", fact: f.id } }, now);
    for (const s of DOT_DISCHARGE.paths.find((p) => p.id === "prompt")!.steps) take(riley, c.id, s);
    wait(riley, c.id);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "handover" } }, now);
    const v = submitDischarge(
      db,
      riley,
      c.id,
      { ...B, handover: { declaration: "ready", gates: allGates("confirmed"), answers: { tell: "honest", firstcheck: "call" } } },
      now,
    );
    expect(v.status).toBe("submitted");
    expect(v.debrief!.ending).toBe("confirmed");
    expect(v.debrief!.score).toBe(15);
    expect(events(c.id).some((e) => e.event === "activity_completed")).toBe(false);
    viewedDischarge(db, riley, c.id, B, now);
    const ev = events(c.id);
    for (const n of [
      "clinical_gap_identified",
      "escalation_selected",
      "funding_route_selected",
      "service_confirmation_received",
      "readiness_status_viewed",
      "handover_submitted",
    ])
      expect(
        ev.map((e) => e.event),
        n,
      ).toContain(n);
    for (const e of ev) {
      const det = JSON.parse(e.detail) as Record<string, unknown>;
      expect(det.key).toBeTruthy();
      expect(det.scenario).toBe("dot-discharge-1");
      // No narrative, clinical detail or free text: every string is an id, a code, a version or a key.
      const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
      for (const s of strings(det)) expect(s, e.event).toMatch(/^[A-Za-z0-9:._@-]*$/);
    }
    expect(new Set(ev.map((e) => JSON.parse(e.detail).key)).size).toBe(ev.length);
  });

  it("a retry starts a fresh attempt with the variation; the first keeps its debrief after a republish", () => {
    const c = course();
    startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    moveDischarge(db, riley, c.id, { ...B, move: { do: "inspect", fact: "first" } }, now);
    take(riley, c.id, "ask-summary");
    moveDischarge(db, riley, c.id, { ...B, move: { do: "handover" } }, now);
    const first = submitDischarge(
      db,
      riley,
      c.id,
      { ...B, handover: { declaration: "incomplete", gates: allGates("unresolved"), answers: { tell: "honest", firstcheck: "call" } } },
      now,
    );
    // Retry while a different attempt id is sent: ignored. With the right one: a new attempt, variation 1.
    expect(retryDischarge(db, riley, c.id, { ...B, from: "nope" }, now).attemptId).toBe(first.attemptId);
    const second = retryDischarge(db, riley, c.id, { ...B, from: first.attemptId, mode: "untimed" }, now);
    expect(second.attemptNo).toBe(2);
    expect(second.desk!.variation!.label).toBe("The outreach team is full");
    expect(second.desk!.play).toBe("untimed");
    expect(retryDischarge(db, riley, c.id, { ...B, from: first.attemptId }, now).attemptId).toBe(second.attemptId);
    // An edit and republish: the old attempt and its debrief stay as they were.
    const changed = approved();
    changed.endings.incomplete = "Changed.";
    saveGuideDraft(db, jordan, c.id, { doc: doc(changed) as never }, now);
    publishGuide(db, jordan, c.id, "", now);
    expect(authorGuide(db, jordan, c.id).publishedNumber).toBe(2);
    const row = db.prepare("SELECT result FROM discharge_attempts WHERE id = ?").get(first.attemptId) as { result: string };
    expect(JSON.parse(row.result).debrief).toEqual(first.debrief);
  });
});

describe("authors, Quality and the register (criterion 15)", () => {
  it("totals are counts only under five people; placements and the register trace the block; non-authors are refused", () => {
    const c = course();
    startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    const s = dischargeStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ attempts: 1, people: 1, suppressed: true, dims: null, codes: null });
    expect(() => dischargeStats(db, sam, c.id)).toThrow();
    const p = dischargePlacements(db, jordan, now);
    expect(p.pivots[0]).toMatchObject({ block: "dp", participant: "Dot", placements: ["Magazine: ZZ Test discharge"] });
    expect(dischargePlacements(db, jordan, now, { source: "doh-at-hm" }).pivots).toHaveLength(1);
    expect(dischargePlacements(db, jordan, now, { source: "no-such" }).pivots).toHaveLength(0);
    const r = dischargeRegister(db, now)[0];
    expect(r).toMatchObject({ blockId: "dp", started: 1, suppressed: true, critical: "", jobAid: "hospital-to-home-handover-check" });
    expect(r.measure).toMatch(/Owned separately/);
  });

  it("writes nothing outside its own table and the activity log (criterion 17)", () => {
    const c = course();
    const tables = () =>
      Object.fromEntries(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => [
          t.name,
          (db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number }).n,
        ]),
      );
    startDischarge(db, riley, c.id, { ...B, mode: "timed" }, now);
    const before = tables();
    take(riley, c.id, "request-nurse");
    take(riley, c.id, "athm-request");
    const after = tables();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    expect(changed.sort()).toEqual(["magazine_events"]);
  });
});
