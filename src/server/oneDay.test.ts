import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { bestPath, type OneDayData } from "@/lib/oneDay";
import { LEILAS_MONDAY } from "@/content/oneDayCases";
import { actOnDay, oneDayState, oneDayStats, retryDay, SMALL_COHORT, startDay } from "./oneDay";

/* One Day, Five Perspectives on the server: the day held back until it arrives, perspective visits kept apart, a finished attempt with its rubric, retries kept, and totals only for authors. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-22T00:00:00Z");
const SIGNED = {
  owner: "O",
  story: "S",
  operations: "Op",
  quality: "Q",
  billing: "B",
  supplier: "Su",
  privacy: "P",
  approvedOn: "2026-11-22",
  reviewBy: "2027-06-30",
};
const leila = (signed = true): OneDayData => ({ ...structuredClone(LEILAS_MONDAY), ...(signed ? { approval: SIGNED } : {}) });
const doc = (data: OneDayData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Leila’s Monday",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The day", blocks: [{ id: "od", type: "onedaymap", ...data }] }],
    },
  ],
});
function course(data = leila()) {
  const c = createGuide(db, jordan, { title: "A coordinator’s day", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
/** Plays the strongest path through the server. */
function playThrough(guideId: string, user: User) {
  startDay(db, user, guideId, { blockId: "od" }, now);
  const best = bestPath(leila());
  let v = oneDayState(db, user, guideId, "od");
  for (let i = 0; i < 20 && v.day.currentId; i++) {
    const id = v.day.currentId;
    v =
      id === "e-close"
        ? actOnDay(db, user, guideId, { blockId: "od", action: "close", closing: best.closing }, now)
        : actOnDay(db, user, guideId, { blockId: "od", action: "choose", eventId: id, optionId: best.choices[id] }, now);
  }
  return v;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("publishing", () => {
  it("can't publish without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc(leila(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/One Day, Five Perspectives map needs/);
  });

  it("gives readers the frame only", () => {
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const b = g.doc.pages[0].sections[0].blocks[0] as unknown as OneDayData;
    expect(b.events).toEqual([]);
    expect(b.facts).toEqual([]);
    expect(b.threads).toHaveLength(3);
  });
});

describe("the attempt", () => {
  it("holds the day back until it arrives", () => {
    const c = course();
    expect(oneDayState(db, riley, c.id, "od").status).toBe("new");
    const v = startDay(db, riley, c.id, { blockId: "od" }, now);
    expect(v.day.events.map((e) => e.id)).toEqual(["e-plan"]);
    expect(JSON.stringify(v)).not.toMatch(/book group|Joy|Kiran/);
    expect(events(c.id).map((e) => e.event)).toEqual(["journey_started", "event_arrived"]);
  });

  it("keeps a perspective visit apart from what Leila knows, and refuses acting on it", () => {
    const c = course();
    startDay(db, riley, c.id, { blockId: "od" }, now);
    actOnDay(db, riley, c.id, { blockId: "od", action: "choose", eventId: "e-plan", optionId: "list" }, now);
    const lens = actOnDay(db, riley, c.id, { blockId: "od", action: "lens", eventId: "e-cancel", actorId: "mrs-patel" }, now);
    expect(lens.day.learnerOnly.map((f) => f.id)).toContain("p-bookgroup");
    expect(lens.day.leila.map((f) => f.id)).not.toContain("p-bookgroup");
    const refused = actOnDay(db, riley, c.id, { blockId: "od", action: "choose", eventId: "e-cancel", optionId: "keep-tuesday" }, now);
    expect(refused.refused).toMatchObject({ optionId: "keep-tuesday" });
    expect(refused.day.currentId).toBe("e-cancel");
    expect(events(c.id).map((e) => e.event)).toEqual(expect.arrayContaining(["role_lens_opened", "knowledge_gap_hit"]));
    // A choice for an event that hasn't arrived is refused outright.
    expect(() => actOnDay(db, riley, c.id, { blockId: "od", action: "choose", eventId: "e-tan", optionId: "separate" }, now)).toThrow(/isn’t waiting/);
  });

  it("finishes with the rubric, then retries from an event as a new attempt, keeping the first", () => {
    const c = course();
    const done = playThrough(c.id, riley);
    expect(done.status).toBe("finished");
    expect(done.day.debrief?.flags).toEqual([]);
    expect(events(c.id).map((e) => e.event)).toEqual(expect.arrayContaining(["decision_made", "day_closed", "journey_completed"]));
    const retry = retryDay(db, riley, c.id, { blockId: "od", eventId: "e-roses" }, now);
    expect(retry).toMatchObject({ attemptNo: 2, status: "active" });
    expect(retry.day.currentId).toBe("e-roses");
    expect(db.prepare("SELECT COUNT(*) AS n FROM one_day_attempts WHERE guide_id = ?").get(c.id)).toEqual({ n: 2 });
  });

  it("logs fictional choices only", () => {
    const c = course();
    playThrough(c.id, riley);
    const log = events(c.id)
      .map((e) => e.detail)
      .join(" ");
    expect(log).not.toMatch(/book group|hospital|budget/i);
    expect(log).toContain('"option":"ask"');
  });

  it("gives authors totals only, suppresses small groups, and refuses learners", () => {
    const c = course();
    playThrough(c.id, riley);
    expect(() => oneDayStats(db, riley, c.id)).toThrow();
    const s = oneDayStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ attempts: 1, people: 1, finished: 1, counted: 1, suppressed: true, dims: null, flags: null });
    expect(SMALL_COHORT).toBe(5);
  });
});
