import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  batonWarnings,
  blankDecision,
  chooseRole,
  emptyBaton,
  freshBaton,
  readHandoff,
  relayMap,
  sendHandoff,
  stageFor,
  type BatonBlockData,
  type Decision,
  type Option,
  type RoleId,
  type Stage,
} from "@/lib/baton";
import { BATON_CASES } from "@/content/batonCases";
import { batonState, batonStats, restartBaton, saveBaton, sendBaton } from "./baton";

/* Pass the Baton: closed-loop handoffs, minimum necessary sharing, urgent concerns first, and sent is never done. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Learning",
  clinical: "Clinical",
  operations: "Care Operations",
  finance: "Finance",
  quality: "Quality",
  privacy: "Privacy",
  approvedOn: "2026-11-20",
};
const seed = () => structuredClone(BATON_CASES[0].data);
const signed = (): BatonBlockData => ({ ...seed(), approval: SIGNED, policyIds: ["approved-transition-sop"], reviewDue: "2027-05-19" });
const stage = (role: RoleId) => stageFor(seed(), role)!;
const first = (g: Option[], v: Option["verdict"] = "good") => g.find((x) => x.verdict === v)?.id ?? "";
/** The authored good path for a stage. */
function good(s: Stage): Decision {
  return {
    placements: Object.fromEntries(s.factRules.map((r) => [r.factId, r.accept[0]])),
    recipient: first(s.recipients),
    urgency: first(s.urgency),
    channel: first(s.channels),
    owner: first(s.owners),
    ack: first(s.acks),
    actions: s.actions.filter((a) => a.verdict === "good").map((a) => a.id),
    redFlag: s.redFlag ? first(s.redFlag.options) : "",
    followUp: s.responds ? "" : first(s.followUps),
  };
}
const pages = (data: BatonBlockData) => [
  {
    id: "p1",
    title: "Relay",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Mr Nguyen", blocks: [{ id: "bt", type: "baton", ...data }] }],
  },
];
const blocking = (data: BatonBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: BatonBlockData) {
  const c = createGuide(db, jordan, { title: "Relay", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the relay an author publishes", () => {
  it("has four playable roles across six stages, and can't be published without sign-off, even with Publish anyway", () => {
    const b = seed();
    expect(b.stages).toHaveLength(6);
    expect(b.stages.filter((s) => s.kind === "handoff").map((s) => s.role)).toEqual(["coordinator", "clinical", "partner", "finance"]);
    expect(blocking(b).join(" ")).toMatch(/sign-off is required/);
    expect(blocking(signed())).toEqual([]);
    const c = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(b) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Pass the Baton relay needs its sign-off/);
    const old = createGuide(
      db,
      jordan,
      { title: "Old", completion: "confirm", doc: { schema: 2, pages: pages({ ...signed(), reviewDue: "2026-01-01" }) } },
      now,
    );
    expect(() => publishGuide(db, jordan, old.id, "", now, { allowUnverified: true })).toThrow(/current review date/);
  });

  it("won't let a role sort a fact it can't see, and warns about a stage with no good owner", () => {
    const b = signed();
    b.stages[4].factIds.push("bt-f-photo");
    b.stages[4].factRules.push({ factId: "bt-f-photo", accept: ["keep"], critical: true, dim: "scope", feedback: "x", line: "" });
    expect(blocking(b).join(" ")).toMatch(/Finance \/ Invoice Officer can’t see “A ward photo/);
    const w = signed();
    w.stages[1].owners = w.stages[1].owners.map((x) => ({ ...x, verdict: "poor" }));
    expect(batonWarnings(w).join(" ")).toMatch(/Coordinator handoff” has no owner marked as good/);
    expect(batonWarnings(signed())).toEqual([]);
  });

  it("keeps the rules, consequences and debrief off the learner's page", () => {
    const c = course(signed());
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("A ward clerk said on the phone");
    for (const secret of [
      "A phone remark isn’t evidence",
      "Send Clinical the new wound-care need, the discharge date",
      '"critical"',
      "Mr Nguyen gets home knowing",
    ])
      expect(page).not.toContain(secret);
  });

  it("never gives a dressing schedule, a price or a clinical outcome", () => {
    const all = JSON.stringify(seed());
    expect(all).not.toMatch(/\$\d/);
    expect(all).not.toMatch(/wound (worsens|got worse|infected)/i);
    const daily = stage("clinical").factRules.find((r) => r.factId === "bt-f-daily")!;
    expect(daily.accept).not.toContain("send");
    expect(freshBaton(seed(), "aaaaa").stages[1].factRules[0].factId).toBe("bt-f-date-xaaaaa");
  });
});

describe("handoffs", () => {
  it("the Coordinator labels the missing summary, routes the wound need to Clinical and owns the follow-up", () => {
    const s = stage("coordinator");
    const f = readHandoff(seed(), s, good(s));
    expect(f).toMatchObject({ result: "ontrack", needsFollowUp: false, missing: [] });
    expect(f.reached).toEqual(expect.arrayContaining(["A new wound-care need is noted", "The full discharge summary and instructions haven’t arrived"]));
    expect(f.preview.frames[1].lines[0]).toMatch(/Clinical sees a clear task/);
    expect(f.preview.frames[2].lines.join(" ")).toMatch(/Acknowledged/);
  });

  it("“wound care is sorted” sent as fact, with no owner, is false certainty", () => {
    const s = stage("coordinator");
    const d = { ...good(s), placements: { ...good(s).placements, "bt-f-sorted": "send" as const }, owner: "bt-c-o-none" };
    const f = readHandoff(seed(), s, d);
    expect(f.result).toBe("critical");
    expect(f.items.map((x) => x.feedback).join(" ")).toMatch(/false certainty/);
    expect(f.preview.frames[1].lines.join(" ")).toMatch(/stops to check/);
    expect(f.dims.find((x) => x.dim === "ownership")?.result).toBe("followup");
  });

  it("gives Finance a useful question without clinical material; sending the summary or photo is a critical gap", () => {
    const s = stage("partner");
    expect(readHandoff(seed(), s, good(s)).result).toBe("ontrack");
    const leak = readHandoff(seed(), s, { ...good(s), placements: { ...good(s).placements, "bt-f-summary": "send", "bt-f-photo": "send" } });
    expect(leak.result).toBe("critical");
    expect(leak.preview.frames[1].lines.join(" ")).toMatch(/hospital summary it has no purpose for/);
    const fin = stage("finance");
    const f = readHandoff(seed(), fin, good(fin));
    expect(f.result).toBe("ontrack");
    expect(f.reached).toContain("The quoted rate differs from the approved price list");
    expect(readHandoff(seed(), fin, { ...good(fin), actions: [...good(fin).actions, "bt-f-x-clinical"] }).result).toBe("critical");
  });

  it("an unacknowledged handoff stays open until followed up; “treat it as done” is a critical gap", () => {
    const b = seed();
    let st = chooseRole(b, emptyBaton(), "partner");
    if ("problem" in st) throw new Error(st.problem);
    const open = sendHandoff(b, st, { ...good(stage("partner")), followUp: "" });
    if ("problem" in open) throw new Error(open.problem);
    expect(open.feedback).toMatchObject({ needsFollowUp: true });
    expect(open.feedback.preview.frames[2].lines.join(" ")).toMatch(/still open/);
    expect(open.state.passed).toEqual([]);
    st = open.state;
    const done = sendHandoff(b, st, good(stage("partner")));
    if ("problem" in done) throw new Error(done.problem);
    expect(done.feedback).toMatchObject({ needsFollowUp: false, result: "ontrack" });
    expect(done.state.tries["bt-s-cp"]).toHaveLength(1);
    expect(done.state.passed).toEqual(["bt-s-cp"]);
    const assumed = readHandoff(b, stage("partner"), { ...good(stage("partner")), followUp: "bt-p-f-approved" });
    expect(assumed.result).toBe("critical");
    // Not asking for acknowledgement leaves the Coordinator's handoff open too.
    expect(readHandoff(b, stage("coordinator"), { ...good(stage("coordinator")), ack: "bt-c-a-none" }).needsFollowUp).toBe(true);
  });

  it("an urgent concern is graded on the immediate route, however good the rest of the handoff is", () => {
    const s = stage("partner");
    const f = readHandoff(seed(), s, { ...good(s), redFlag: "bt-p-rf-note" });
    expect(f.result).toBe("critical");
    expect(f.dims.find((x) => x.dim === "timeliness")?.result).toBe("critical");
    expect(sendHandoff(seed(), { ...emptyBaton(), role: "partner" }, { ...good(s), redFlag: "" })).toMatchObject({ problem: /urgent concern first/ });
  });

  it("the Care Partner involves Mr Nguyen and promises nothing unconfirmed", () => {
    const s = stage("partner");
    const without = readHandoff(seed(), s, { ...good(s), actions: [] });
    expect(without.result).toBe("followup");
    expect(without.missing).toContain("Mr Nguyen wasn’t part of the plan and budget review.");
    expect(readHandoff(seed(), s, { ...good(s), actions: [...good(s).actions, "bt-p-x-promise"] }).result).toBe("critical");
  });

  it("each role starts clean, and isn't marked down for another role's scripted handoff", () => {
    const b = seed();
    let st = chooseRole(b, emptyBaton(), "coordinator") as ReturnType<typeof emptyBaton>;
    const bad = sendHandoff(b, st, { ...good(stage("coordinator")), placements: { ...good(stage("coordinator")).placements, "bt-f-sorted": "send" } });
    if ("problem" in bad) throw new Error(bad.problem);
    st = chooseRole(b, bad.state, "finance") as typeof st;
    expect(st.drafts["bt-s-fin"]).toBeUndefined();
    const ok = sendHandoff(b, st, good(stage("finance")));
    if ("problem" in ok) throw new Error(ok.problem);
    expect(ok.feedback.result).toBe("ontrack");
    expect(ok.state.passed).toEqual(["bt-s-fin"]);
    const map = relayMap(b, ok.state);
    expect(map.find((m) => m.id === "bt-s-coord")).toMatchObject({ played: true, result: "critical" });
    expect(map.find((m) => m.id === "bt-s-clin")).toMatchObject({ played: false, text: expect.stringMatching(/assessment booked/) });
    expect(sendHandoff(b, emptyBaton(), blankDecision())).toMatchObject({ problem: /Choose a role/ });
  });

  it("an assigned role comes first", () => {
    const b = { ...seed(), assignedRole: "clinical" as const };
    expect(chooseRole(b, emptyBaton(), "finance")).toMatchObject({ problem: /assigned role first/ });
    expect(chooseRole(b, emptyBaton(), "clinical")).toMatchObject({ role: "clinical" });
  });
});

describe("attempts", () => {
  it("runs a relay through the server: role, draft, send, follow-up, replay after a critical gap, and totals for authors", () => {
    const c = course(signed());
    expect(batonState(db, riley, c.id, "bt", now)).toMatchObject({ status: "new", sent: {} });
    saveBaton(db, riley, c.id, { blockId: "bt", role: "partner" }, now);
    saveBaton(db, riley, c.id, { blockId: "bt", draft: { recipient: "bt-p-r-fin" } }, now);
    expect(batonState(db, riley, c.id, "bt", now).state.drafts["bt-s-cp"].recipient).toBe("bt-p-r-fin");

    const p = stage("partner");
    const critical = sendBaton(db, riley, c.id, { blockId: "bt", decision: { ...good(p), redFlag: "bt-p-rf-fin" } }, now);
    expect(critical.feedback.result).toBe("critical");
    expect(critical.state.passed).toEqual([]);
    const open = sendBaton(db, riley, c.id, { blockId: "bt", decision: { ...good(p), followUp: "" } }, now);
    expect(open.feedback.needsFollowUp).toBe(true);
    const done = sendBaton(db, riley, c.id, { blockId: "bt", decision: good(p) }, now);
    expect(done).toMatchObject({ finishedNow: true, status: "finished", feedback: { result: "ontrack" } });
    expect(done.state.tries["bt-s-cp"]).toHaveLength(2);
    expect(done.map.find((m) => m.id === "bt-s-cp")?.result).toBe("ontrack");

    expect(batonStats(db, jordan, c.id)).toMatchObject({ finished: 1, byStage: { "bt-s-cp": { sends: 3, critical: 1, open: 1, ontrack: 1 } } });
    expect(() => batonStats(db, riley, c.id)).toThrow();
    const events = JSON.stringify(db.prepare("SELECT detail FROM magazine_events WHERE event = 'baton.sent'").all());
    expect(events).not.toMatch(/bt-p-r-fin|bt-f-/);
    expect(restartBaton(db, riley, c.id, { blockId: "bt" }, now)).toMatchObject({ status: "active", state: { role: "", passed: [] } });
  });
});
