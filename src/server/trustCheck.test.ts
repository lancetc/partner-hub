import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { setDemoSignOff } from "./demoSignOff";
import { allBlocks } from "@/lib/magazine";
import type { TrustData } from "@/lib/trustCheck";
import { MRS_PATEL_TRUST } from "@/content/trustCases";
import { DATA_SOURCES, DEMO_ISSUES } from "@/content/trustDemo";
import { moveTrust, retryTrust, startTrust, submitTrust, trustRegister, trustState, trustStats, viewedTrust } from "./trustCheck";
import { cleanBoard, demoView, getBoard, logToolEvent, saveBoard, toolHome } from "./trustTool";

/*
  The 28-Day Trust Check and its Work Tool on the server (docs/trust-check.md): it can't publish unsigned or with
  placeholder procedures; readers never get the case; moves and submits are idempotent and their events carry no typed
  words; totals are suppressed under five people; the Work Tool is for the business planner only, reads demo data only,
  keeps boards inside the business, guards its statuses and saves idempotently (criteria 9, 11 and 12).
*/

let db: Db;
let jordan: User, riley: User, sam: User, casey: User, ash: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";

function approved(d: TrustData = MRS_PATEL_TRUST): TrustData {
  const c = structuredClone(d);
  c.approval = {
    owner: "O",
    operations: "Op",
    quality: "Q",
    policy: "Po",
    finance: "F",
    clinical: "C",
    partnerships: "Pa",
    privacy: "Pr",
    learning: "L",
    approvedOn: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: c.scenarioVersion,
  };
  c.sources = c.sources.map((s) =>
    s.placeholder ? { ...s, placeholder: false, url: "https://example.org/procedure", checked: TODAY, reviewBy: "2027-05-01" } : s,
  );
  return c;
}
const doc = (data: TrustData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "ZZ Test trust check",
      purpose: "",
      template: "decide",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Trust", blocks: [{ id: "tc", type: "trustcheck", ...data }] }],
    },
  ],
});
function course(data = approved()) {
  const c = createGuide(db, jordan, { title: "ZZ Test trust check", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const B = { blockId: "tc" };
const move = (u: User, g: string, m: object) => moveTrust(db, u, g, { ...B, move: m }, now);
const strong = MRS_PATEL_TRUST.paths.find((p) => p.id === "strong")!;
/** Plays the strong path through the server, as the page would: open each card, answer each step in turn, the plan. */
function playThrough(u: User, g: string) {
  for (const id of ["s-cleans", "s-budget", "s-invoice", "s-asha", "s-prefs", "s-plan"]) move(u, g, { do: "open", signal: id });
  for (const step of ["facts", "alternatives", "artefact", "triage", "first-contact", "opening", "questions", "complaint", "diagnosis", "retriage"])
    move(u, g, { do: "answer", step, options: strong.answers[step] });
  move(u, g, { do: "plan", plan: strong.plan });
  move(u, g, { do: "propose" });
  move(u, g, { do: "answer", step: "tuesdays", options: strong.answers.tuesdays });
  move(u, g, { do: "open", signal: "c7-delivered" });
  for (const step of ["day7-evidence", "day7", "day28-evidence", "day28", "improve"]) move(u, g, { do: "answer", step, options: strong.answers[step] });
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam, casey, ash] = ["jordan", "riley", "sam", "casey", "ash"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("publishing", () => {
  it("can’t publish the demo as it ships, even with “Publish anyway”; a signed-off block with real procedures can", () => {
    const c = createGuide(db, jordan, { title: "ZZ Test unsigned", completion: "confirm", doc: doc(MRS_PATEL_TRUST) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/28-Day Trust Check needs Trilogy Care’s procedures/);
    const stale = createGuide(db, jordan, { title: "ZZ Test stale", completion: "confirm", doc: doc({ ...approved(), scenarioVersion: "v2" }) as never }, now);
    expect(() => publishGuide(db, jordan, stale.id, "", now)).toThrow(/Trust Check/);
    expect(() => course()).not.toThrow();
  });

  it("a demo sign-off stands in for the reviewers, but never for a broken case", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const c = createGuide(db, jordan, { title: "ZZ Test demo", completion: "confirm", doc: doc(MRS_PATEL_TRUST) as never }, now);
    setDemoSignOff(db, jordan, c.id, true, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).not.toThrow();
    const broken = structuredClone(MRS_PATEL_TRUST);
    broken.signals[0].noticed = "Churn score 82%: likely to leave.";
    const b = createGuide(db, jordan, { title: "ZZ Test broken", completion: "confirm", doc: doc(broken) as never }, now);
    setDemoSignOff(db, jordan, b.id, true, now);
    expect(() => publishGuide(db, jordan, b.id, "", now, { allowUnverified: true })).toThrow(/case check doesn’t pass/);
  });
});

describe("an attempt", () => {
  it("gives readers the frame only, and the case without feedback, levels or codes", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "trustcheck") as unknown as TrustData;
    expect([b.signals, b.steps, b.variations, b.paths, b.sharing]).toEqual([[], [], [], [], []]);
    const v = startTrust(db, riley, c.id, B, now);
    expect(JSON.stringify(v)).not.toMatch(/"feedback"|"levels"|"codes"|"allowed"/);
    expect(trustState(db, riley, c.slug, "tc", { embed: true }).block?.signals).toEqual([]);
  });

  it("is idempotent: a resent start, move, submit or viewed changes nothing twice", () => {
    const c = course();
    const a = startTrust(db, riley, c.id, B, now);
    expect(startTrust(db, riley, c.id, B, now).attemptId).toBe(a.attemptId);
    playThrough(riley, c.id);
    playThrough(riley, c.id);
    const s1 = submitTrust(db, riley, c.id, B, now);
    const s2 = submitTrust(db, riley, c.id, B, now);
    expect(s2.debrief).toEqual(s1.debrief);
    viewedTrust(db, riley, c.id, B, now);
    viewedTrust(db, riley, c.id, B, now);
    const count = (e: string) => events(c.id).filter((x) => x.event === e).length;
    expect([count("trust_check_opened"), count("signal_viewed"), count("plan_proposed"), count("response_submitted"), count("activity_completed")]).toEqual([
      1, 7, 1, 1, 1,
    ]);
    expect(count("followup_checkpoint_viewed")).toBe(1);
    expect(count("triage_selected")).toBe(2);
    expect(s1.debrief).toMatchObject({ ending: "stays", defensible: true, score: 21 });
  });

  it("logs no typed words: the concern and what the learner would say stay in the attempt", () => {
    const c = course();
    startTrust(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    submitTrust(db, riley, c.id, B, now);
    const text = JSON.stringify(events(c.id));
    expect(text).not.toContain(strong.plan.concern);
    expect(text).not.toContain("lodge it");
    expect(text).not.toMatch(/Mrs Patel|Asha/);
    for (const e of events(c.id)) expect(JSON.parse(e.detail)).toMatchObject({ fictional: true, policy: MRS_PATEL_TRUST.ruleSetId });
    expect(events(c.id).find((e) => e.event === "plan_proposed")!.detail).toMatch(/"said":true/);
  });

  it("flags a critical rule as its own event, with the code only", () => {
    const c = course();
    startTrust(db, riley, c.id, B, now);
    for (const id of ["s-cleans", "s-budget", "s-invoice"]) move(riley, c.id, { do: "open", signal: id });
    for (const step of ["facts", "alternatives", "artefact", "triage", "first-contact", "opening", "questions"])
      move(riley, c.id, { do: "answer", step, options: strong.answers[step] });
    move(riley, c.id, { do: "answer", step: "complaint", options: ["cp-noneed"] });
    expect(() => submitTrust(db, riley, c.id, B, now)).toThrow(/Finish the case/);
    for (const step of ["diagnosis", "retriage"]) move(riley, c.id, { do: "answer", step, options: strong.answers[step] });
    move(riley, c.id, { do: "plan", plan: strong.plan });
    move(riley, c.id, { do: "propose" });
    for (const step of ["tuesdays", "day7-evidence", "day7", "day28-evidence", "day28", "improve"])
      move(riley, c.id, { do: "answer", step, options: strong.answers[step] });
    const r = submitTrust(db, riley, c.id, B, now);
    expect(r.debrief?.ending).toBe("unsafe");
    const flagged = events(c.id).filter((e) => e.event === "critical_rule_flagged");
    expect(flagged.map((e) => JSON.parse(e.detail).code)).toEqual(["complaintDiscouraged"]);
  });

  it("refuses moves out of order, and a changed answer", () => {
    const c = course();
    startTrust(db, riley, c.id, B, now);
    expect(() => move(riley, c.id, { do: "answer", step: "facts", options: ["f-missed"] })).toThrow(/Open at least/);
    for (const id of ["s-cleans", "s-budget", "s-invoice"]) move(riley, c.id, { do: "open", signal: id });
    move(riley, c.id, { do: "answer", step: "facts", options: ["f-missed"] });
    expect(() => move(riley, c.id, { do: "answer", step: "facts", options: ["f-leave"] })).toThrow(/already decided/);
    expect(() => move(riley, c.id, { do: "plan", plan: strong.plan })).toThrow(/hear her/);
  });

  it("retries on the next variation (her choice to move), keeping the first attempt’s debrief", () => {
    const c = course();
    startTrust(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    const first = submitTrust(db, riley, c.id, B, now);
    const second = retryTrust(db, riley, c.id, { ...B, from: first.attemptId }, now);
    expect([second.attemptNo, second.status]).toEqual([2, "active"]);
    const row = db.prepare("SELECT variation FROM trust_attempts WHERE id = ?").get(second.attemptId) as { variation: string };
    expect(row.variation).toBe("moves");
    expect(JSON.stringify(second.view)).not.toMatch(/She chooses to move/);
  });

  it("shows authors counts only under five people, marked fictional; never to learners", () => {
    const c = course();
    startTrust(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    submitTrust(db, riley, c.id, B, now);
    const s = trustStats(db, jordan, c.id);
    expect(s.mode).toBe("fictional");
    expect(s.blocks[0]).toMatchObject({ people: 1, suppressed: true, dims: null, endings: null, codes: null, critical: null });
    expect(() => trustStats(db, riley, c.id)).toThrow();
    const r = trustRegister(db).find((x) => x.guideId === c.id)!;
    expect(r).toMatchObject({ suppressed: true, critical: "", endings: "", codes: "" });
    expect(r.dims.signal).toBe("");
  });
});

describe("the Work Tool: role-restricted, demo data only (criteria 11 and 12)", () => {
  it("is for the business planner only: anyone else gets nothing, and can’t save", () => {
    expect(toolHome(db, casey)).toMatchObject({ access: { role: "owner" } });
    for (const u of [sam, riley, jordan, ash]) {
      const h = toolHome(db, u);
      expect(h.access).toBeNull();
      expect(Object.keys(h).sort()).toEqual(["access", "notice"]);
      expect(() => saveBoard(db, u, { name: "x", state: {}, idem: "key-12345678" }, now)).toThrow(/business owner/);
      expect(() => logToolEvent(db, u, { event: "trust_check_opened" }, now)).toThrow(/business owner/);
    }
  });

  it("keeps a business’s boards inside it: another business can’t read or write them", () => {
    const b = saveBoard(db, casey, { name: "November follow-ups", state: {}, idem: "key-aaaaaaaa" }, now);
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(() => getBoard(db, riley, b.id)).toThrow(/isn’t here/);
    expect(() => saveBoard(db, riley, { id: b.id, state: {}, idem: "key-bbbbbbbb" }, now)).toThrow(/isn’t here/);
    expect((toolHome(db, riley) as { boards: unknown[] }).boards).toEqual([]);
  });

  it("saves idempotently: the same key returns the same version, and an unchanged board makes no new one", () => {
    const state = { issues: { "demo-a": { owner: "booking", status: "checking" } } };
    const first = saveBoard(db, casey, { name: "November follow-ups", state, idem: "key-11111111" }, now);
    const again = saveBoard(db, casey, { name: "November follow-ups", state, idem: "key-11111111" }, now);
    expect(again).toMatchObject({ id: first.id, version: 1, replayed: true });
    const unchanged = saveBoard(db, casey, { id: first.id, state, idem: "key-22222222" }, now);
    expect(unchanged).toMatchObject({ version: 1, unchanged: true });
    const next = saveBoard(db, casey, { id: first.id, state: { issues: { "demo-a": { status: "waitingOwner" } } }, idem: "key-33333333" }, now);
    expect(next.version).toBe(2);
    expect((db.prepare("SELECT COUNT(*) AS n FROM trust_board_versions").get() as { n: number }).n).toBe(2);
    expect(() => saveBoard(db, casey, { id: first.id, state, idem: "" }, now)).toThrow(/key/);
  });

  it("guards the statuses: evidence to resolve, the person’s own choice to transfer, safety stays escalated, owners are operational", () => {
    expect(() => cleanBoard({ issues: { "demo-a": { status: "resolved", evidence: ["a-booked"] } } })).toThrow(/isn’t resolution/);
    expect(() => cleanBoard({ issues: { "demo-a": { status: "resolved", evidence: ["a-delivered", "a-person"] } } })).not.toThrow();
    expect(() => cleanBoard({ issues: { "demo-a": { status: "transferred" } } })).toThrow(/own decision/);
    expect(() => cleanBoard({ issues: { "demo-d": { status: "transferred", evidence: ["d-choice"] } } })).not.toThrow();
    expect(() => cleanBoard({ issues: { "demo-e": { status: "checking" } } })).toThrow(/urgent clinical and incident process/);
    expect(() => cleanBoard({ issues: { "demo-a": { owner: "family" } } })).toThrow(/operational role/);
    expect(() => cleanBoard({ issues: { "demo-a": { evidence: ["b-credit"] } } })).toThrow(/own records/);
    expect(() => cleanBoard({ issues: { "real-person-1": { status: "checking" } } })).toThrow(/Only the demo issues/);
    expect(() => saveBoard(db, casey, { name: "Mrs Smith 0412345678", state: {}, idem: "key-44444444" }, now)).toThrow(/never a person’s details/);
  });

  it("keeps a complaint in its own system: its reference is read-only, and no status withdraws it (criterion 9)", () => {
    const v = demoView(cleanBoard({ issues: { "demo-b": { status: "resolved", evidence: ["b-credit", "b-person"] } } }));
    const b = v.issues.find((x) => x.id === "demo-b")!;
    expect(b.status).toBe("resolved");
    expect(b.complaintRef).toBe("DEMO-CMP-0142");
    expect(() => cleanBoard({ issues: { "demo-b": { complaintRef: "" } } })).not.toThrow();
    expect(demoView(cleanBoard({ issues: { "demo-b": { complaintRef: "" } } })).issues.find((x) => x.id === "demo-b")!.complaintRef).toBe("DEMO-CMP-0142");
    expect(JSON.stringify(v)).not.toMatch(/withdraw(n)? (the )?complaint|"closedComplaint"/i);
  });

  it("names the type of problem, never a churn score; a planned pause reads as context (criterion 8)", () => {
    const v = demoView();
    expect(v.issues.find((x) => x.id === "demo-c")?.triage.level).toBe("context");
    expect(v.issues.find((x) => x.id === "demo-e")?.safety).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(/churn|probability|risk score|likely to leave/i);
  });

  it("reads no real data: every source is unconnected, and its server imports nothing that holds real records", () => {
    expect(DATA_SOURCES.every((s) => s.connected === false)).toBe(true);
    expect(JSON.stringify(toolHome(db, casey))).toMatch(/Demo data only/);
    const src = fs.readFileSync(path.join(process.cwd(), "src/server/trustTool.ts"), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["./auth", "./caseloadPlanner", "./db", "@/content/trustDemo", "@/lib/trustCheck", "node:crypto"]);
    expect(src).not.toMatch(/FROM (?!trust_|business_planner|users\b)\w+/);
    // No name, phone, email or date of birth anywhere in the demo.
    expect(JSON.stringify(DEMO_ISSUES)).not.toMatch(/Mrs |Mr |@|\b04\d{8}\b|born/);
  });

  it("logs the tool’s events with a demo id only, once per key", () => {
    logToolEvent(db, casey, { event: "signal_viewed", ref: "demo-a", idem: "key-55555555" }, now);
    logToolEvent(db, casey, { event: "signal_viewed", ref: "demo-a", idem: "key-55555555" }, now);
    const rows = db.prepare("SELECT event, detail FROM trust_tool_events").all() as { event: string; detail: string }[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].detail)).toEqual({ ref: "demo-a", mode: "demo" });
    expect(() => logToolEvent(db, casey, { event: "churn_scored" }, now)).toThrow(/isn’t one of/);
  });
});
