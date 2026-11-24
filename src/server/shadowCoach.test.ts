import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { setDemoSignOff } from "./demoSignOff";
import { allBlocks } from "@/lib/magazine";
import type { Move, ShadowData } from "@/lib/shadowCoach";
import { SHADOW_SOURCES } from "@/lib/shadowCoachSources";
import { MAYA_SHADOW } from "@/content/shadowCoachCases";
import { DATA_SOURCES, DEMO_HIRES } from "@/content/shadowCoachDemo";
import { moveShadow, resolveContent, retryShadow, shadowRegister, shadowState, shadowStats, startShadow, submitShadow, viewedShadow } from "./shadowCoach";
import { assignable, cleanWorkbench, coordinatorView, logToolEvent, previewCoordinator, saveWorkbench, toolHome, type ShadowToolHome } from "./shadowCoachTool";

/*
  First 100 Days: Shadow & Coach on the server, and its workbench (docs/shadow-and-coach.md). It can't publish unsigned
  or with placeholder procedures, and never with a broken case; readers never get the key; moves, submits and saves are
  idempotent and events carry no free text; the plan resolves only real, current content and asks an author to review
  what's missing (once, not per learner); authors see totals only; the workbench is for the business planner, reads
  demo data only, stays inside the business, never scores or ranks, and the coordinator's view has no manager-only items.
*/

let db: Db;
let jordan: User, riley: User, sam: User, casey: User, ash: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";
const CALL = "contribution-call";

/** The shipped case, with its plan pointed at content that exists in a fresh database (a shipped Topic), and the Job Aid missing. */
function testData(): ShadowData {
  const c = structuredClone(MAYA_SHADOW);
  const s = c.scenarios[0].suggestions.find((x) => x.id === "s-topic-contrib")!;
  s.ref = { type: "topic", id: "noticing-a-change" };
  return c;
}
function signed(d = testData()): ShadowData {
  d.approval = {
    owner: "O",
    operations: "Op",
    quality: "Q",
    clinical: "C",
    policy: "Po",
    partnerships: "Pa",
    people: "HR",
    privacy: "Pr",
    approvedOn: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: d.scenarioVersion,
  };
  return d;
}
const doc = (data: ShadowData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "ZZ Test shadow coach",
      purpose: "",
      template: "decide",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Shadow", blocks: [{ id: "sc", type: "shadowcoach", ...data }] }],
    },
  ],
});
/** Published under a demo sign-off: the structural case check still applies, the reviewers' sign-off doesn't. */
function course(data = testData()) {
  vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
  const c = createGuide(db, jordan, { title: "ZZ Test shadow coach", completion: "confirm", doc: doc(data) as never }, now);
  setDemoSignOff(db, jordan, c.id, true, now);
  publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
  return c;
}
const B = { blockId: "sc", scenario: CALL };
const move = (u: User, g: string, m: Move) => moveShadow(db, u, g, { ...B, move: m }, now);
const STRONG: Move[] = [
  { do: "view", artefact: "call" },
  { do: "view", artefact: "note" },
  { do: "view", artefact: "qa" },
  { do: "mark", key: "c3", kind: "assumption", cls: "act_now", cause: "both", why: "SECRET-REASON an invented rate" },
  { do: "mark", key: "c4", kind: "observation", cls: "act_now", cause: "", why: "She may cancel her nurse." },
  { do: "mark", key: "n3", kind: "observation", cls: "process", cause: "workflow", why: "Old sheet." },
  { do: "inspected" },
  { do: "act", now: ["a-source", "a-correct", "a-nurse", "a-record"], later: ["a-sheet", "a-coach"] },
  {
    do: "coach",
    text: "SECRET-WORDS In your call with Mrs Lin I heard you say all three have the same contribution. Where did you check it? Let’s practise together, and I’ll sit in on your next call.",
  },
  { do: "pushback", option: "p-source" },
  { do: "coached" },
  {
    do: "plan",
    items: [
      { id: "s-correct", due: 0 },
      { id: "s-topic-contrib", due: 3 },
      { id: "s-aid-contrib", due: 2 },
      { id: "s-practice-roleplay", due: 5 },
      { id: "s-observe", due: 12 },
      { id: "s-process", due: 1 },
    ],
  },
  { do: "assign" },
  { do: "followView" },
  ...["e-category", "e-rate", "e-date", "e-source"].map((f): Move => ({ do: "evidence", field: f, state: "verified" })),
  { do: "evidence", field: "e-plan", state: "material_gap" },
  { do: "decide", outcome: "signoff", scope: "s-contrib", reviewer: "" },
];
const playThrough = (u: User, g: string) => {
  for (const m of STRONG) move(u, g, m);
};
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];
const grant = (u: User) =>
  db
    .prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)")
    .run(u.org_id, u.id, now.toISOString());

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam, casey, ash] = ["jordan", "riley", "sam", "casey", "ash"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("publishing", () => {
  it("can’t publish the demo as it ships, even with “Publish anyway”: the reviewers and Trilogy Care’s procedures are missing", () => {
    const c = createGuide(db, jordan, { title: "ZZ Test unsigned", completion: "confirm", doc: doc(MAYA_SHADOW) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Shadow & Coach needs Trilogy Care’s procedures/);
    // Signed, but still resting on placeholder procedures: held.
    const s = createGuide(db, jordan, { title: "ZZ Test signed", completion: "confirm", doc: doc(signed()) as never }, now);
    expect(() => publishGuide(db, jordan, s.id, "", now)).toThrow(/Shadow & Coach/);
  });

  it("publishes once signed and the placeholders are replaced; a stale scenario version is held", () => {
    const saved = SHADOW_SOURCES.map((x) => ({ ...x }));
    try {
      for (const x of SHADOW_SOURCES)
        if (x.placeholder) Object.assign(x, { placeholder: false, url: "https://example.org/procedure", checked: TODAY, reviewBy: "2027-05-01" });
      const stale = createGuide(db, jordan, { title: "ZZ Test stale", completion: "confirm", doc: doc({ ...signed(), scenarioVersion: "v2" }) as never }, now);
      expect(() => publishGuide(db, jordan, stale.id, "", now)).toThrow(/Shadow & Coach/);
      const ok = createGuide(db, jordan, { title: "ZZ Test ok", completion: "confirm", doc: doc(signed()) as never }, now);
      expect(() => publishGuide(db, jordan, ok.id, "", now)).not.toThrow();
    } finally {
      SHADOW_SOURCES.splice(0, SHADOW_SOURCES.length, ...saved);
    }
  });

  it("a demo sign-off stands in for the reviewers, but never for a broken case", () => {
    expect(() => course()).not.toThrow();
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const broken = testData();
    broken.scenarios[0].followup.artefact.lines[0].text = broken.scenarios[0].artefacts[0].lines[1].text;
    const b = createGuide(db, jordan, { title: "ZZ Test broken", completion: "confirm", doc: doc(broken) as never }, now);
    setDemoSignOff(db, jordan, b.id, true, now);
    expect(() => publishGuide(db, jordan, b.id, "", now, { allowUnverified: true })).toThrow(/Shadow & Coach case check doesn’t pass/);
  });
});

describe("an attempt", () => {
  it("gives readers the frame only, and the view without the key", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "shadowcoach") as unknown as ShadowData;
    expect(b.scenarios.map((s) => [s.artefacts, s.findings, s.actions, s.suggestions, s.followup.fields])).toEqual([
      [[], [], [], [], []],
      [[], [], [], [], []],
    ]);
    const v = startShadow(db, riley, c.id, B, now);
    expect(JSON.stringify(v)).not.toMatch(/"verdict"|"misclassCode"|"essential"|"fit"|"outOfScope"/);
    expect(shadowState(db, riley, c.slug, "sc", null, now, { embed: true }).block?.scenarios[0].findings).toEqual([]);
  });

  it("is idempotent: a resent start, move, submit or viewed changes nothing twice", () => {
    const c = course();
    const a = startShadow(db, riley, c.id, B, now);
    expect(startShadow(db, riley, c.id, B, now).attemptId).toBe(a.attemptId);
    playThrough(riley, c.id);
    // Everything after the decision is refused or a no-op; a resent mark changes nothing.
    const s1 = submitShadow(db, riley, c.id, B, now);
    const s2 = submitShadow(db, riley, c.id, B, now);
    expect(s2.debrief).toEqual(s1.debrief);
    viewedShadow(db, riley, c.id, B, now);
    viewedShadow(db, riley, c.id, B, now);
    const count = (e: string) => events(c.id).filter((x) => x.event === e).length;
    expect([
      count("shadow_coach_started"),
      count("passage_highlighted"),
      count("plan_assigned"),
      count("response_submitted"),
      count("activity_completed"),
    ]).toEqual([1, 3, 1, 1, 1]);
    expect(s1.debrief).toMatchObject({ ending: "signoff", critical: [] });
    expect(shadowState(db, riley, c.id, "sc", CALL, now).scenarios.find((s) => s.id === CALL)?.status).toBe("completed");
  });

  it("logs no free text: reasons, coaching words and names stay in the attempt; every string is an id, a code or a version", () => {
    const c = course();
    startShadow(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    submitShadow(db, riley, c.id, B, now);
    const text = JSON.stringify(events(c.id));
    expect(text).not.toMatch(/SECRET-REASON|SECRET-WORDS|Mrs Lin|Maya/);
    for (const e of events(c.id)) {
      const d = JSON.parse(e.detail) as Record<string, unknown>;
      expect(d.fictional).toBe(true);
      const strings = Object.values(d)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((v): v is string => typeof v === "string");
      for (const s of strings) expect(s).toMatch(/^[\w:.-]*$/);
    }
    const names = new Set(events(c.id).map((e) => e.event));
    for (const e of [
      "artefact_viewed",
      "concern_classified",
      "immediate_action_selected",
      "escalation_branch_completed",
      "coaching_response_submitted",
      "plan_suggested",
      "plan_edited",
      "followup_sample_reviewed",
      "defined_task_signed_off",
      "process_issue_raised",
    ])
      expect(names).toContain(e);
  });

  it("a critical first action is its own event and blocks coaching until it’s fixed", () => {
    const c = course();
    startShadow(db, riley, c.id, B, now);
    for (const m of STRONG.slice(0, 7)) move(riley, c.id, m);
    const v = move(riley, c.id, { do: "act", now: ["a-lesson"], later: [] });
    expect(v.view?.actions?.feedback?.missing.length).toBeGreaterThan(0);
    expect(() => move(riley, c.id, STRONG[8])).toThrow(/Protect the person first/);
    expect(
      events(c.id)
        .filter((e) => e.event === "critical_rule_flagged")
        .map((e) => JSON.parse(e.detail).code),
    ).toEqual(["missed_correction"]);
  });

  it("resolves the plan against the live catalogue: a shipped Topic is current; a missing Job Aid becomes one author review request, not one per learner", () => {
    const c = course();
    for (const u of [riley, sam]) {
      startShadow(db, u, c.id, B, now);
      playThrough(u, c.id);
    }
    const rows = db.prepare("SELECT suggestion_id, status, attempts FROM shadow_review_requests WHERE guide_id = ?").all(c.id);
    expect(rows).toEqual([{ suggestion_id: "s-aid-contrib", status: "open", attempts: 2 }]);
    const a = db.prepare("SELECT state FROM shadow_attempts WHERE user_id = ? AND guide_id = ?").get(riley.id, c.id) as { state: string };
    const assigned = (JSON.parse(a.state) as { assigned: { id: string; status: string; version: string }[] }).assigned;
    expect(assigned.find((i) => i.id === "s-topic-contrib")).toMatchObject({ status: "current", version: "shipped" });
    expect(assigned.find((i) => i.id === "s-aid-contrib")).toMatchObject({ status: "missing" });
    expect(shadowStats(db, jordan, c.id).reviewRequests.map((r) => r.ref_id)).toEqual(["contribution-explainer"]);
  });

  it("resolveContent only calls current, published or approved content current", () => {
    const a = resolveContent(
      db,
      riley,
      [
        { suggestion: "t1", ref: { type: "topic", id: "noticing-a-change" }, label: "x" },
        { suggestion: "t2", ref: { type: "topic", id: "no-such-topic" }, label: "x" },
        { suggestion: "m1", ref: { type: "magazine", id: "no-such-page" }, label: "x" },
        { suggestion: "a1", ref: { type: "aid", id: "sirs-first-steps" }, label: "x" },
        { suggestion: "a2", ref: { type: "aid", id: "contribution-explainer" }, label: "x" },
      ],
      now,
    );
    expect(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.status]))).toEqual({
      t1: "current",
      t2: "missing",
      m1: "missing",
      a1: "unapproved",
      a2: "missing",
    });
  });

  it("retries the same episode, keeping the first attempt’s debrief; a later episode carries the earlier one’s decision", () => {
    const c = course();
    startShadow(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    const first = submitShadow(db, riley, c.id, B, now);
    viewedShadow(db, riley, c.id, B, now);
    const second = retryShadow(db, riley, c.id, { ...B, from: first.attemptId }, now);
    expect([second.attemptNo, second.status]).toEqual([2, "active"]);
    const later = startShadow(db, riley, c.id, { ...B, scenario: "minimised-incident" }, now);
    expect(later.view?.history).toEqual([expect.objectContaining({ scenario: CALL, outcome: "Sign off the defined task" })]);
  });

  it("shows authors counts only under five people, marked as simulation; never to learners", () => {
    const c = course();
    startShadow(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    submitShadow(db, riley, c.id, B, now);
    const s = shadowStats(db, jordan, c.id);
    expect(s.mode).toBe("simulation");
    expect(s.scenarios[0]).toMatchObject({ people: 1, suppressed: true, dims: null, outcomes: null, codes: null, critical: null });
    expect(() => shadowStats(db, riley, c.id)).toThrow();
    const r = shadowRegister(db).find((x) => x.guideId === c.id && x.scenarioId === CALL)!;
    expect(r).toMatchObject({ suppressed: true, critical: "", outcomes: "", codes: "" });
    expect(r.reviewRequests).toMatch(/contribution-explainer/);
    expect(JSON.stringify(shadowRegister(db))).not.toMatch(/riley|Riley/);
  });
});

describe("the workbench: role-restricted, demo data only, never a ranking", () => {
  it("is for the business planner only: a coordinator, a partner, an author or another org gets nothing, and can’t save or preview", () => {
    expect(toolHome(db, casey, now)).toMatchObject({ access: { role: "owner" } });
    for (const u of [riley, sam, jordan, ash]) {
      const h = toolHome(db, u, now);
      expect(h.access).toBeNull();
      expect(Object.keys(h).sort()).toEqual(["access", "notice"]);
      expect(() => saveWorkbench(db, u, { state: {}, idem: "key-12345678" }, now)).toThrow(/business owner/);
      expect(() => previewCoordinator(db, u, "demo-hire-a", now)).toThrow(/business owner/);
      expect(() => logToolEvent(db, u, { event: "first100_opened" }, now)).toThrow(/business owner/);
    }
  });

  it("reads demo data only: no real data source is connected, the notice says so, and only demo hires can be worked", () => {
    const h = toolHome(db, casey, now) as ShadowToolHome;
    expect(DATA_SOURCES.every((s) => !s.connected)).toBe(true);
    expect(h.notice).toMatch(/Demo data only/);
    expect(h.roleMatrix.every((r) => !r.approved)).toBe(true);
    expect(h.demo.hires.map((x) => x.id)).toEqual(
      DEMO_HIRES.map((x) => x.id).sort((a, b) => (DEMO_HIRES.find((x) => x.id === a)!.started < DEMO_HIRES.find((x) => x.id === b)!.started ? -1 : 1)),
    );
    expect(() => saveWorkbench(db, casey, { state: { hires: { "real-person": {} } }, idem: "key-aaaaaaaa" }, now)).toThrow(/Only the demo hires/);
  });

  it("never scores or ranks: unknown fields like a score or a note are dropped, and hires are in start-date order", () => {
    const w = cleanWorkbench({ hires: { "demo-hire-a": { stage: "practise", score: 87, rank: 1, note: "free text about a person" } } }, new Set());
    expect(JSON.stringify(w)).not.toMatch(/score|rank|free text/);
    const h = toolHome(db, casey, now) as ShadowToolHome;
    expect(JSON.stringify(h.demo)).not.toMatch(/"score"|"rank"|"level"/);
    expect(h.demo.hires.map((x) => x.started)).toEqual([...h.demo.hires.map((x) => x.started)].sort());
  });

  it("assigns only current approved content, and a sign-off needing a reviewer needs that reviewer first", () => {
    const cat = assignable(db, casey, now);
    const current = cat.filter((c) => c.status === "current").map((c) => c.key);
    const missing = cat.find((c) => c.status !== "current")!.key;
    expect(() => saveWorkbench(db, casey, { state: { hires: { "demo-hire-a": { learning: [missing] } } }, idem: "key-bbbbbbbb" }, now)).toThrow(
      /current approved content/,
    );
    const obs = { task: "escalate-incident", outcome: "signoff", date: "2027-03-01", shared: true };
    expect(() => saveWorkbench(db, casey, { state: { hires: { "demo-hire-a": { observations: [obs] } } }, idem: "key-cccccccc" }, now)).toThrow(
      /Quality\/incident owner/,
    );
    expect(() =>
      saveWorkbench(
        db,
        casey,
        { state: { hires: { "demo-hire-a": { observations: [obs], reviewers: ["quality"], learning: current.slice(0, 1) } } }, idem: "key-dddddddd" },
        now,
      ),
    ).not.toThrow();
  });

  it("saves idempotently: the same key returns the same version, and an unchanged state makes no new one", () => {
    const state = { hires: { "demo-hire-a": { stage: "independence" } } };
    const first = saveWorkbench(db, casey, { state, idem: "key-11111111" }, now);
    const again = saveWorkbench(db, casey, { state, idem: "key-11111111" }, now);
    expect([first.version, again.version]).toEqual([1, 1]);
    expect(again).toMatchObject({ replayed: true });
    const same = saveWorkbench(db, casey, { state, idem: "key-22222222" }, now);
    expect(same).toMatchObject({ version: 1, unchanged: true });
    const next = saveWorkbench(db, casey, { state: { hires: { "demo-hire-a": { stage: "consolidate" } } }, idem: "key-33333333" }, now);
    expect(next.version).toBe(2);
    expect(() => saveWorkbench(db, casey, { state, idem: "nokey" }, now)).toThrow(/key/);
  });

  it("keeps a business’s workbench inside it: another business sees only the demo", () => {
    saveWorkbench(db, casey, { state: { hires: { "demo-hire-a": { stage: "independence" } } }, idem: "key-44444444" }, now);
    grant(riley);
    const other = toolHome(db, riley, now) as ShadowToolHome;
    expect([other.version, other.state]).toEqual([0, { hires: {} }]);
  });

  it("the coordinator’s view has her plan and shared feedback, never manager-only items, other hires or an answer key", () => {
    const cat = assignable(db, casey, now);
    const current = cat.filter((c) => c.status === "current").map((c) => c.key);
    saveWorkbench(
      db,
      casey,
      {
        state: {
          hires: {
            "demo-hire-a": {
              learning: current.slice(0, 1),
              reviewers: ["hr"],
              processIssues: ["outdated-source"],
              observations: [
                { task: "explain-contributions", outcome: "extend", date: "2027-02-20", shared: true },
                { task: "invoice-check", outcome: "fix_process", date: "2027-02-21", shared: false },
              ],
            },
          },
        },
        idem: "key-55555555",
      },
      now,
    );
    const v = previewCoordinator(db, casey, "demo-hire-a", now);
    expect(v.learning.map((x) => x.key)).toEqual(current.slice(0, 1));
    expect(v.feedback).toEqual([expect.objectContaining({ outcome: "Continue supported practice", date: "2027-02-20" })]);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(/People\/HR|outdated|demo-hire-b|Demo hire B|invoice|finding|verdict|misclass/);
    expect(coordinatorView({ hires: {} }, "demo-hire-b", cat).hire.label).toBe("Demo hire B");
    expect(() => previewCoordinator(db, casey, "someone-real", now)).toThrow(/isn’t here/);
  });

  it("records its own events with ids only, once per key", () => {
    logToolEvent(db, casey, { event: "coordinator_view_previewed", ref: "demo-hire-a", idem: "key-66666666" }, now);
    logToolEvent(db, casey, { event: "coordinator_view_previewed", ref: "demo-hire-a", idem: "key-66666666" }, now);
    expect(() => logToolEvent(db, casey, { event: "employee_rated" }, now)).toThrow(/isn’t one of/);
    const rows = db.prepare("SELECT event, detail FROM shadow_tool_events").all() as { event: string; detail: string }[];
    expect(rows).toEqual([{ event: "coordinator_view_previewed", detail: JSON.stringify({ ref: "demo-hire-a", mode: "demo" }) }]);
  });
});
