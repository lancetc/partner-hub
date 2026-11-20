import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  advance,
  allocationClock,
  anchorDate,
  applyBoard,
  decide,
  finishProblems,
  firstStatement,
  freshMission,
  initialState,
  missionForReaders,
  moveProblem,
  openItems,
  promises,
  scoreMission,
  type MissionBlockData,
  type MissionState,
} from "@/lib/mission";
import { MISSION_CASES } from "@/content/missionCases";
import { advanceMission, decideMission, finishMission, missionState, missionStats, redoMission, restartMission, saveMission } from "./mission";

/* The Mission Board: start gates, honest promises, a statement that can fall after Day 30, and no retention score. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Care Operations lead",
  compliance: "Supplier Compliance",
  finance: "Finance reviewer",
  quality: "Quality reviewer",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "Support at Home program guidance", version: "November 2026", reviewedOn: "2026-11-20" };
const seed = (id: "lin" | "haddad") => MISSION_CASES.find((c) => c.id === id)!.data;
const signed = (id: "lin" | "haddad"): MissionBlockData => ({ ...seed(id), approval: SIGNED, source: SOURCE });
const pages = (data: MissionBlockData) => [
  {
    id: "p1",
    title: "A case",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "mb", type: "mission", ...data }] }],
  },
];
function course(data: MissionBlockData) {
  const c = createGuide(db, jordan, { title: "First 30 days", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const essential = (b: MissionBlockData, at: number) => b.checkpoints[at].actions.filter((a) => a.role === "essential").map((a) => a.id);
const done = (s: MissionState, ...ids: string[]) => ({ ...s, board: { ...s.board, ...Object.fromEntries(ids.map((i) => [i, "done" as const])) } });

/** A learner who does the right thing at every point, keeping the board in step. */
function walk(b: MissionBlockData, beforeEach?: (s: MissionState, at: number) => MissionState) {
  let s = initialState(b);
  for (let i = 0; i < b.checkpoints.length; i++) {
    if (beforeEach) s = beforeEach(s, i);
    const c = b.checkpoints[i];
    const out = decide(b, s, {
      checkpoint: c.id,
      actions: essential(b, i),
      message: c.message ? "I know you chose Lena. Her checks aren’t done; I’ll call tomorrow." : "",
    });
    if ("problem" in out) throw new Error(out.problem);
    s = out.state;
    const next = advance(b, s);
    if ("problem" in next) throw new Error(`${c.id}: ${next.problem} ${next.missing.join(", ")}`);
    s = next.state;
  }
  return s;
}
/** Mrs Lin's board, kept in step: the arrangement and provider done before the case moves to Day 7. */
const linBoard = (s: MissionState, at: number) => (at === 1 ? done(s, "l-start", "l-agree", "l-provider") : s);

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the case an author publishes", () => {
  it("both starter cases are complete apart from their sign-off", () => {
    for (const c of MISSION_CASES) {
      const problems = publishChecks({ schema: 2, pages: pages(c.data) } as never, "confirm").blocking;
      const text = JSON.stringify(problems);
      expect(text).toMatch(/sign-off is required/);
      expect(text).toMatch(/source and its version/);
      const ok = publishChecks({ schema: 2, pages: pages({ ...c.data, approval: SIGNED, source: SOURCE }) } as never, "confirm").blocking;
      expect(ok.filter((p: string) => /First 30|decision point|task|sign-off|statement/i.test(p))).toEqual([]);
    }
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: { schema: 2, pages: pages(seed("lin")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/sign-off/);
    expect(() => course(signed("lin"))).not.toThrow();
  });

  it("catches dependencies that loop and statement dates outside the rule", () => {
    const loop = structuredClone(signed("lin"));
    loop.tasks[0].dependsOn = [loop.tasks[1].id];
    loop.tasks[1].dependsOn = [loop.tasks[0].id];
    expect(JSON.stringify(publishChecks({ schema: 2, pages: pages(loop) } as never, "confirm").blocking)).toMatch(/circle/);
    const early = { ...signed("lin"), statementIssuedDay: 10 };
    expect(JSON.stringify(publishChecks({ schema: 2, pages: pages(early) } as never, "confirm").blocking)).toMatch(
      /first statement is issued after November 2026 ends/,
    );
  });

  it("keeps what marks a choice right off the learner's page", () => {
    const c = course(signed("lin"));
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Send Lena anyway and collect the check later");
    for (const secret of [
      "l-d0-depends",
      "Critical",
      "Honest about what isn’t known yet",
      "I’ll call you tomorrow afternoon, even if",
      '"essential"',
      '"unsafe"',
      "Update Mrs Lin and Aaron on Lena’s checks within a week",
    ])
      expect(page).not.toContain(secret.replace("l-d0-depends", 'keeps":"l-d0'));
    const r = missionForReaders(seed("lin"));
    expect(r.checkpoints.flatMap((c) => c.actions).every((a) => a.role === "helpful" && !a.feedback && !a.promise && !a.told && !a.sets.length)).toBe(true);
    expect(r.checkpoints.every((c) => !c.message || (!c.message.model && !c.message.checklist.length))).toBe(true);
  });

  it("gives a copy fresh ids that still point at each other", () => {
    const a = freshMission(seed("lin"), "aaaaa");
    const b = freshMission(a, "bbbbb");
    expect(b.tasks[0].id).toBe("l-start-xbbbbb");
    const agree = b.tasks.find((t) => t.title === "Agree the service arrangement")!;
    expect(b.tasks.some((t) => t.dependsOn.includes(agree.id))).toBe(true);
    const d7 = b.checkpoints.find((c) => c.day === 7)!;
    expect(d7.requires).toContain(agree.id);
    expect(b.checkpoints.flatMap((c) => c.actions).find((x) => x.keeps)!.keeps).toMatch(/-xbbbbb$/);
  });
});

describe("dates", () => {
  it("keeps the allocation clock apart from the referral, with the extension labelled for starting services", () => {
    const h = seed("haddad");
    const clock = allocationClock(h, 0)!;
    expect(clock).toMatchObject({ allocated: "2026-11-10", startBy: "2027-01-05", extendedTo: "2027-02-02", beforeReferral: 6, used: 6 });
    expect(allocationClock(h, 28)!.used).toBe(34);
    expect(anchorDate(h, "referral_accepted")).toBe("2026-11-16");
    expect(anchorDate(h, "first_service")).toBe("2026-12-21");
  });

  it("works out the first statement from the calendar month, not from Day 30", () => {
    expect(firstStatement(seed("lin"))).toMatchObject({
      month: "November 2026",
      due: "2026-12-31",
      dueDay: 59,
      issued: "2026-12-10",
      afterDay30: true,
      noServices: false,
    });
    expect(firstStatement(seed("haddad"))).toMatchObject({
      month: "November 2026",
      due: "2026-12-31",
      issued: "2026-12-14",
      afterDay30: false,
      noServices: true,
    });
  });
});

describe("the board", () => {
  const b = seed("lin");
  it("won't mark a task done before what it depends on", () => {
    const s = initialState(b);
    expect(moveProblem(b, s, "l-safe", "done")).toMatch(/needs “Agree the service arrangement” and “Confirm the first-week provider” done first/);
    expect(moveProblem(b, s, "l-safe", "at_risk")).toBeNull();
    expect(moveProblem(b, done(s, "l-welcome", "l-agree", "l-provider"), "l-safe", "done")).toBeNull();
  });

  it("won't count a sample as the real statement, which stays open past Day 30", () => {
    const end = { ...initialState(b), at: b.checkpoints.length };
    expect(moveProblem(b, end, "l-statement", "done")).toMatch(/isn’t issued until Thursday 10 December/);
    expect(moveProblem(b, end, "l-sample", "done")).toBeNull();
    // Mr Haddad's no-service statement is issued on Day 28, inside the case.
    const h = seed("haddad");
    expect(moveProblem(h, { ...initialState(h), at: 2 }, "h-statement", "done")).toBeNull();
  });

  it("ignores saved moves the rules don't allow", () => {
    const s = initialState(b);
    const next = applyBoard(b, s, { ...s, board: { ...s.board, "l-safe": "done", "l-start": "done" } });
    expect(next.board["l-safe"]).toBe("to_plan");
    expect(next.board["l-start"]).toBe("done");
  });

  it("won't start funded services until the agreement, care plan and provider are in place", () => {
    let s = initialState(b);
    for (const at of [0, 1]) {
      const out = decide(b, s, { checkpoint: b.checkpoints[at].id, actions: essential(b, at) });
      if ("problem" in out) throw new Error(out.problem);
      s = out.state;
      if (at === 0) s = (advance(b, s) as { state: MissionState }).state;
    }
    const blocked = advance(b, s);
    expect(blocked).toMatchObject({ missing: ["Agree the service arrangement", "Confirm the first-week provider"] });
    expect("problem" in blocked && blocked.problem).toMatch(/Before Day 7.*before or on the day funded services start/);
    expect("state" in advance(b, done(s, "l-agree", "l-provider"))).toBe(true);
  });
});

describe("decisions", () => {
  const b = seed("lin");
  const at14 = () => {
    let s = initialState(b);
    s = walk({ ...b, checkpoints: b.checkpoints.slice(0, 3) }, linBoard);
    return { ...s, at: 3, board: { ...s.board, "l-lena": "at_risk" as const } };
  };

  it("sends an unsafe choice back to be looked at again, and a decision with nothing needed too", () => {
    const s = at14();
    const send = decide(b, s, { checkpoint: "l-d14", actions: ["l-d14-send", "l-d14-tell"], message: "Lena will be there on Wednesday as planned." });
    if ("problem" in send) throw new Error(send.problem);
    expect(send.feedback.critical[0]).toMatch(/Send Lena anyway.*no verified clearance/);
    expect(send.feedback.missed).toEqual([]);
    expect(send.feedback.message).toBeNull();
    expect(send.state.decisions["l-d14"].settled).toBe(false);
    expect("problem" in advance(b, send.state)).toBe(true);
    const wait = decide(b, s, { checkpoint: "l-d14", actions: ["l-d14-wait"], message: "We’re waiting on Compliance and will be in touch." });
    expect("feedback" in wait && wait.feedback.critical[0]).toMatch(/doesn’t deal with what this moment needs/);
  });

  it("accepts a safe recovery, shows the example message after, and records what she was told", () => {
    const s = at14();
    expect(decide(b, s, { checkpoint: "l-d14", actions: essential(b, 3), message: "" })).toMatchObject({ problem: /Write what you’d say/ });
    const out = decide(b, s, {
      checkpoint: "l-d14",
      actions: essential(b, 3),
      message: "Lena’s checks aren’t done. Approved cleaner or move it? I’ll call tomorrow.",
      covered: [0, 2, 9],
    });
    if ("problem" in out) throw new Error(out.problem);
    expect(out.feedback.critical).toEqual([]);
    expect(out.feedback.status).toMatchObject({ readiness: "held", informed: "yes" });
    expect(out.feedback.message?.model).toMatch(/I want to keep that preference/);
    expect(out.state.decisions["l-d14"].covered).toEqual([0, 2]);
  });

  it("only takes a decision at the point the case is on", () => {
    expect(decide(b, initialState(b), { checkpoint: "l-d14", actions: ["l-d14-hold"] })).toMatchObject({ problem: /moment has passed/ });
  });
});

describe("closing the loop", () => {
  it("needs an owner and a date for each open task and unkept promise, and a next check-in", () => {
    const b = seed("lin");
    const s = walk(b, linBoard);
    const open = openItems(b, s);
    expect(open.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Walk through her first real statement", "Walk Mrs Lin through her first real statement after it’s issued on 10 December"]),
    );
    expect(finishProblems(b, s).length).toBe(open.length + 1);
    const close = Object.fromEntries(open.map((i) => [i.key, { owner: "Care Partner", date: "2026-12-11", resolved: false }]));
    expect(finishProblems(b, { ...s, close, nextCheckIn: "2026-12-09" })).toEqual([]);
  });

  it("tracks which promises a later choice kept", () => {
    const b = seed("lin");
    const p = promises(b, walk(b, linBoard));
    expect(p.find((x) => x.id === "l-d0-depends")?.keptAt).toMatch(/^Day 7: Give Mrs Lin and Aaron the update/);
    expect(p.find((x) => x.id === "l-d14-tell")?.keptAt).toMatch(/^Day 21/);
    expect(p.find((x) => x.id === "l-d30-book")?.keptAt).toBeNull();
  });

  it("reads strong on a good walk-through, lower when unsafe choices had to be undone, and never scores retention", () => {
    const b = seed("lin");
    const good = scoreMission(b, walk(b, linBoard));
    expect(Object.values(good.dims).every((d) => d.score === 1)).toBe(true);
    const s = walk(b, linBoard);
    const shaky = scoreMission(b, {
      ...s,
      refusals: 2,
      decisions: { ...s.decisions, "l-d14": { ...s.decisions["l-d14"], tries: [["l-d14-send"], s.decisions["l-d14"].actions] } },
    });
    expect(shaky.dims.safe.score).toBeLessThan(1);
    expect(shaky.dims.safe.notes.join(" ")).toMatch(/first chose “Send Lena anyway/);
    expect(shaky.dims.sequencing.notes.join(" ")).toMatch(/stopped 2 moves/);
    expect(JSON.stringify(good)).not.toMatch(/retention|churn|stay/i);
  });
});

describe("attempts", () => {
  it("runs a whole case through the server and keeps the record", () => {
    const c = course(signed("lin"));
    const b = seed("lin");
    expect(missionState(db, riley, c.id, "mb")).toMatchObject({ status: "new", debrief: null });
    // The start gate, from the server: Day 7 can't be reached without the arrangement done.
    for (const at of [0, 1]) {
      decideMission(db, riley, c.id, { blockId: "mb", checkpoint: b.checkpoints[at].id, actions: essential(b, at) }, now);
      if (at === 0) advanceMission(db, riley, c.id, { blockId: "mb" }, now);
    }
    expect(() => advanceMission(db, riley, c.id, { blockId: "mb" }, now)).toThrow(/Before Day 7.*Still to do: Agree the service arrangement/);
    // The learner's copy of the case has no promise text, so the server works out what's been promised and said.
    const known = missionState(db, riley, c.id, "mb").known;
    expect(known.promises.map((p) => p.text)).toEqual(["Update Mrs Lin and Aaron on Lena’s checks within a week"]);
    expect(known.told[0].told.length).toBeGreaterThan(0);
    const s = missionState(db, riley, c.id, "mb").state;
    expect(s.refusals).toBe(1);
    // A saved Done that skips a dependency is ignored; one that follows the rules is kept.
    saveMission(db, riley, c.id, { blockId: "mb", state: { ...s, board: { ...s.board, "l-safe": "done" } } }, now);
    expect(missionState(db, riley, c.id, "mb").state.board["l-safe"]).not.toBe("done");
    saveMission(db, riley, c.id, { blockId: "mb", state: done(s, "l-start", "l-agree", "l-provider") }, now);
    advanceMission(db, riley, c.id, { blockId: "mb" }, now);
    for (let at = 2; at < b.checkpoints.length; at++) {
      const cp = b.checkpoints[at];
      decideMission(
        db,
        riley,
        c.id,
        { blockId: "mb", checkpoint: cp.id, actions: essential(b, at), message: cp.message ? "Her checks aren’t done; I’ll call tomorrow." : "" },
        now,
      );
      advanceMission(db, riley, c.id, { blockId: "mb" }, now);
    }
    const end = missionState(db, riley, c.id, "mb").state;
    expect(() => finishMission(db, riley, c.id, { blockId: "mb", state: end }, now)).toThrow(/owner and a date/);
    const close = Object.fromEntries(openItems(b, end).map((i) => [i.key, { owner: "Care Partner", date: "2026-12-11", resolved: false }]));
    const out = finishMission(db, riley, c.id, { blockId: "mb", state: { ...end, close, nextCheckIn: "2026-12-09" } }, now);
    expect(out.status).toBe("finished");
    expect(out.debrief?.statement).toMatchObject({ afterDay30: true, issued: "2026-12-10" });
    expect(out.debrief?.dims.every((d) => d.rating === "Strong")).toBe(true);
    expect(out.debrief?.told.length).toBeGreaterThan(3);

    const redo = redoMission(db, riley, c.id, { blockId: "mb", checkpoint: "l-d14", actions: ["l-d14-wait"] }, now);
    // Waiting silently isn't enough: the learner is told so, and why.
    expect(redo.feedback.critical.join(" ")).toMatch(/doesn’t deal with what this moment needs.*Silence turns a delay into a broken expectation/);
    expect(missionState(db, riley, c.id, "mb")).toMatchObject({ status: "finished", state: { redo: { checkpoint: "l-d14" } } });

    const stats = missionStats(db, jordan, c.id);
    expect(stats.blocks[0]).toMatchObject({ people: 1, finished: 1, refusals: 1, promisesKept: 2, promisesHandedOn: 1 });
    expect(JSON.stringify(stats)).not.toMatch(/call tomorrow|Care Partner/);
    expect(() => missionStats(db, riley, c.id)).toThrow();

    const again = restartMission(db, riley, c.id, { blockId: "mb" }, now);
    expect(again).toMatchObject({ status: "active", state: { at: 0 } });
    expect((db.prepare("SELECT count(*) n FROM mission_attempts").get() as { n: number }).n).toBe(2);
  });
});
