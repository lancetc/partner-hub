import { beforeEach, describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { syncPublishedLessons } from "./lessonRegistry";
import { saveProgress } from "./progress";
import { recordLessonCompletion } from "./learning";
import {
  challengeReport,
  challengeView,
  createChallenge,
  missionLock,
  missionQuestions,
  missionSlugs,
  myChallenges,
  publishChallenge,
  queueChallengeEmails,
  setMyPreferences,
  timeline,
  updateChallenge,
  type ChallengeInput,
} from "./challenges";

/* Challenge Mode: daily unlocks, frozen first answers, points, leaderboards and emails. */

let db: Db;
const u = (id: string) => userById(db, id)!;
const DAYS = ["lf-refresh-support", "et-apply", "a-little-extra-time"];
const lesson = (slug: string) => lessons.find((l) => l.slug === slug)!;
// Brisbane is UTC+10 all year: day 1 opens 08:00 on 2 November, which is 22:00 UTC on 1 November.
const at = (s: string) => new Date(s);
const DAY1 = at("2026-11-01T22:00:00Z");
const DAY2 = at("2026-11-02T22:00:00Z");

const input = (over: Partial<ChallengeInput> = {}): ChallengeInput => ({
  name: "Test Week",
  tagline: "A test",
  story: "Once upon a time",
  startsOn: "2026-11-02",
  unlockTime: "08:00",
  reminderTime: "15:00",
  timezone: "Australia/Brisbane",
  points: { decision: 100, question: 50, complete: 100, onTheDay: 50, perfect: 100 },
  missions: DAYS.map((slug, i) => ({ day: i + 1, slug, beat: `Day ${i + 1} beat` })),
  teams: [
    { name: "Brisbane", colour: "teal", members: ["sam", "ash"] },
    { name: "Sydney", colour: "navy", members: ["riley", "casey"] },
  ],
  ...over,
});

/** Saves progress the way the player does: the first answer to every decision and question, right or wrong. */
function play(userId: string, slug: string, right: boolean, when: Date) {
  const answers: Record<string, string | number> = {};
  for (const q of missionQuestions(lesson(slug))) {
    answers[q.key] = right ? 1 : 0;
    answers[`pick:${q.key.slice(6)}`] = q.options.find((o) => o.right === right)!.id;
  }
  saveProgress(db, u(userId), slug, { answers }, when.toISOString(), when);
}
const finish = (userId: string, slug: string, when: Date) => recordLessonCompletion(db, u(userId), { slug, version: lesson(slug).version }, when);

let id: string;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
  id = createChallenge(db, u("jordan"), input(), at("2026-10-20T00:00:00Z")).id;
  publishChallenge(db, u("jordan"), id, true, at("2026-10-20T00:00:00Z"));
});

describe("daily unlocks", () => {
  it("opens each mission at the unlock time, one day apart, and closes after the grace days", () => {
    const t = timeline({ starts_on: "2026-11-02", unlock_time: "08:00", reminder_time: "15:00", timezone: "Australia/Brisbane" }, 3);
    expect(t.opens.map((d) => d.toISOString())).toEqual(["2026-11-01T22:00:00.000Z", "2026-11-02T22:00:00.000Z", "2026-11-03T22:00:00.000Z"]);
    expect(t.reminders[0].toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // Last mission opens 4 November; two grace days; closes at midnight starting 7 November.
    expect(t.closes.toISOString()).toBe("2026-11-06T14:00:00.000Z");
  });

  it("locks a mission for learners until it opens, but never for authors", () => {
    expect(missionLock(db, u("sam"), DAYS[1], DAY1)).toMatchObject({ day: 2, opensAt: DAY2.toISOString() });
    expect(missionLock(db, u("jordan"), DAYS[1], DAY1)).toBeNull();
    expect(missionLock(db, u("sam"), DAYS[0], DAY1)).toBeNull();
    expect(missionSlugs(db)).toEqual(new Set(DAYS));
  });

  it("keeps a draft challenge's missions locked for learners", () => {
    publishChallenge(db, u("jordan"), id, false, at("2026-10-21T00:00:00Z"));
    expect(missionLock(db, u("sam"), DAYS[0], DAY2)).toMatchObject({ opensAt: null });
  });
});

describe("scoring", () => {
  it("scores right first answers, completion, finishing on the day, and a perfect mission", () => {
    play("sam", DAYS[0], true, at("2026-11-01T23:00:00Z"));
    finish("sam", DAYS[0], at("2026-11-01T23:05:00Z"));
    // Ash gets everything wrong first time, and finishes the next day.
    play("ash", DAYS[0], false, at("2026-11-02T23:00:00Z"));
    finish("ash", DAYS[0], at("2026-11-02T23:05:00Z"));
    const sam = challengeView(db, u("sam"), id, at("2026-11-03T00:00:00Z"));
    // One decision (100) + one question (50) + complete (100) + on the day (50) + perfect (100).
    expect(sam.missions[0]).toMatchObject({ total: 400, onTheDay: true, perfect: true });
    const ash = challengeView(db, u("ash"), id, at("2026-11-03T00:00:00Z"));
    expect(ash.missions[0]).toMatchObject({ total: 100, onTheDay: false, perfect: false });
  });

  it("freezes first answers: restarting a topic and answering again changes nothing", () => {
    play("sam", DAYS[0], false, at("2026-11-01T23:00:00Z"));
    play("sam", DAYS[0], true, at("2026-11-01T23:30:00Z"));
    finish("sam", DAYS[0], at("2026-11-01T23:35:00Z"));
    expect(challengeView(db, u("sam"), id, at("2026-11-02T00:00:00Z")).missions[0]).toMatchObject({ total: 150, perfect: false });
  });

  it("ignores answers given before a mission opens, and completions from before it opened", () => {
    play("sam", DAYS[1], true, at("2026-11-02T10:00:00Z"));
    finish("sam", DAYS[1], at("2026-11-02T10:05:00Z"));
    const v = challengeView(db, u("sam"), id, at("2026-11-03T00:00:00Z"));
    expect(v.missions[1]).toMatchObject({ total: 0, completedAt: null });
  });

  it("only reveals a mission's title and story beat once it's open", () => {
    const v = challengeView(db, u("sam"), id, DAY1);
    expect(v.missions.map((m) => m.open)).toEqual([true, false, false]);
    expect(v.missions[1]).toMatchObject({ title: null, beat: "" });
  });
});

describe("leaderboards", () => {
  beforeEach(() => {
    play("sam", DAYS[0], true, at("2026-11-01T23:00:00Z"));
    finish("sam", DAYS[0], at("2026-11-01T23:05:00Z"));
    play("riley", DAYS[0], false, at("2026-11-01T23:00:00Z"));
    finish("riley", DAYS[0], at("2026-11-01T23:05:00Z"));
  });

  it("lists people who've scored by first name and initial, shows the viewer as You, and leaves out zero scores", () => {
    const v = challengeView(db, u("sam"), id, at("2026-11-02T00:00:00Z"));
    expect(v.leaderboard.top.map((r) => [r.rank, r.name, r.points])).toEqual([
      [1, "You", 400],
      [2, "Riley M.", 150],
    ]);
    expect(v.me).toMatchObject({ rank: 1, total: 400 });
  });

  it("hides a name when the person asks", () => {
    setMyPreferences(db, u("riley"), id, { hideName: true });
    const v = challengeView(db, u("sam"), id, at("2026-11-02T00:00:00Z"));
    expect(v.leaderboard.top[1].name).toBe("A player");
  });

  it("ranks teams by average points per member", () => {
    const v = challengeView(db, u("ash"), id, at("2026-11-02T00:00:00Z"));
    expect(v.teams.map((t) => [t.name, t.average, t.mine])).toEqual([
      ["Brisbane", 200, true],
      ["Sydney", 75, false],
    ]);
  });

  it("keeps the challenge to its members", () => {
    expect(() => challengeView(db, { ...u("sam"), id: "nobody" }, id, DAY1)).toThrow(/isn’t available/);
  });
});

describe("the learner's list", () => {
  it("shows upcoming, then live with today's mission, then finished", () => {
    expect(myChallenges(db, u("sam"), at("2026-11-01T00:00:00Z"))[0]).toMatchObject({ state: "upcoming", day: 0 });
    expect(myChallenges(db, u("sam"), DAY2)[0]).toMatchObject({ state: "live", day: 2, todaySlug: DAYS[1], todayDone: false });
    expect(myChallenges(db, u("sam"), at("2026-11-08T00:00:00Z"))[0]).toMatchObject({ state: "finished" });
  });
});

describe("authoring", () => {
  it("fixes the dates, missions and points once published", () => {
    expect(() => updateChallenge(db, u("jordan"), id, input({ startsOn: "2026-11-09" }), DAY1)).toThrow(/fixed/);
    // Renaming a team or the story is fine.
    expect(updateChallenge(db, u("jordan"), id, input({ tagline: "Updated" }), DAY1)).toEqual({ id });
  });

  it("won't publish without people, or put someone in two teams", () => {
    const empty = createChallenge(db, u("jordan"), input({ name: "Empty", teams: [] }), DAY1).id;
    expect(() => publishChallenge(db, u("jordan"), empty, true, DAY1)).toThrow(/people/);
    expect(() =>
      createChallenge(
        db,
        u("jordan"),
        input({
          teams: [
            { name: "A", colour: "teal", members: ["sam"] },
            { name: "B", colour: "navy", members: ["sam"] },
          ],
        }),
        DAY1,
      ),
    ).toThrow(/two teams/);
  });

  it("can't be unpublished once it has started", () => {
    expect(() => publishChallenge(db, u("jordan"), id, false, DAY2)).toThrow(/started/);
  });
});

describe("reporting", () => {
  it("counts participation per day, and lists knowledge gaps from fewest right first time", () => {
    play("sam", DAYS[0], true, at("2026-11-01T23:00:00Z"));
    finish("sam", DAYS[0], at("2026-11-01T23:05:00Z"));
    play("ash", DAYS[0], false, at("2026-11-01T23:00:00Z"));
    const r = challengeReport(db, u("jordan"), id, at("2026-11-02T01:00:00Z"));
    expect(r.days[0]).toMatchObject({ started: 2, completed: 1, onTheDay: 1, averagePoints: 400 });
    expect(r.gaps[0]).toMatchObject({ answered: 2, right: 1, commonWrong: { count: 1 } });
    expect(r.people[0]).toMatchObject({ id: "sam", total: 400, completed: 1 });
  });
});

describe("daily emails", () => {
  it("invites everyone when a mission opens, reminds only those who haven't finished, and never queues twice", () => {
    expect(queueChallengeEmails(db, at("2026-11-01T22:30:00Z"), "https://hub.test")).toBe(4);
    expect(queueChallengeEmails(db, at("2026-11-01T23:30:00Z"), "https://hub.test")).toBe(0);
    finish("sam", DAYS[0], at("2026-11-02T01:00:00Z"));
    setMyPreferences(db, u("ash"), id, { emails: false });
    // 3pm Brisbane: Riley and Casey still haven't finished; Ash has switched emails off.
    expect(queueChallengeEmails(db, at("2026-11-02T05:30:00Z"), "https://hub.test")).toBe(2);
    const msgs = db.prepare("SELECT user_id, kind, subject, body FROM outbox ORDER BY id").all() as {
      user_id: string;
      kind: string;
      subject: string;
      body: string;
    }[];
    expect(msgs[0]).toMatchObject({ kind: "challenge_open", subject: "Test Week: day 1 is open" });
    expect(msgs[0].body).toContain("https://hub.test/challenge/");
    expect(
      msgs
        .filter((m) => m.kind === "challenge_reminder")
        .map((m) => m.user_id)
        .sort(),
    ).toEqual(["casey", "riley"]);
  });

  it("doesn't back-fill a day that has passed", () => {
    expect(queueChallengeEmails(db, at("2026-11-02T15:00:00Z"), "https://hub.test")).toBe(0);
  });
});
