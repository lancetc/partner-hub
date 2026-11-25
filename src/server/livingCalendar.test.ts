import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { ensureLives, livesActivity, livesChatContext, publishDueEpisodes, seedLivesDemo } from "./livesInProgress";
import { ensureMoments, momentAction, seedMomentsDemo } from "./lifeMoments";
import { calendarAdmin, calendarReview, ensureCalendar, livingCalendar, routineAction, seedCalendarDemo } from "./livingCalendar";
import { livesProposal } from "./livesAssist";
import { CALENDAR_MOMENTS } from "@/content/livingCalendar";
import { DEMO_MOMENTS } from "@/content/lifeMoments";
import { localDay } from "@/lib/livingCalendar";

/*
  The Living Calendar: what's shared shows on the day it happened; what's coming shows only by its teaser; routines
  are "usual", never "happened"; filters, shared events, the chat, routines, rescheduling and the review; and "a little
  serendipity": varied, deterministic schedules, and at most one notice per learner per person per day.
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const seededAt = new Date("2026-11-25T00:00:00Z");
const key = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  riley = userById(db, "riley")!;
  sam = userById(db, "sam")!;
  ensureCharacters(db, seededAt);
  ensureLives(db, seededAt);
  seedLivesDemo(db, seededAt);
  ensureMoments(db, seededAt);
  seedMomentsDemo(db, seededAt);
  ensureCalendar(db, seededAt);
  seedCalendarDemo(db, seededAt);
});
afterEach(() => {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
});

const tz = (u: User) => u.timezone || "Australia/Sydney";
const all = (v: ReturnType<typeof livingCalendar>) => v.days.flatMap((d) => d.entries);

describe("the month", () => {
  it("opens on this month, Monday first, with today in the reader's time zone", () => {
    const v = livingCalendar(db, riley, seededAt);
    expect(v.month).toBe(localDay(seededAt.toISOString(), tz(riley)).slice(0, 7));
    expect(v.today).toBe(localDay(seededAt.toISOString(), tz(riley)));
    expect(new Date(`${v.days[0].date}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(v.days.length % 7).toBe(0);
  });

  it("shows what's shared on the day it happened, and never a scheduled moment's words", () => {
    const nov = JSON.stringify(livingCalendar(db, riley, seededAt));
    expect(nov).toContain("Isabel came for Sunday lunch");
    const dec = livingCalendar(db, riley, seededAt, { month: "2026-12" });
    const text = JSON.stringify(dec);
    // Coming up: the teaser, and nothing about how it goes.
    expect(text).toContain("Dana is coming for Christmas lunch");
    expect(text).not.toContain("Christmas lunch with Dana");
    expect(text).not.toContain("brought the pudding");
    expect(text).not.toContain("The seat by the roses has arrived");
    const ahead = all(dec).find((e) => e.id === "ahead:lm-cal-ald-christmas")!;
    expect(ahead).toMatchObject({ kind: "ahead", date: "2026-12-25", tense: "upcoming", narrative: "", quote: "", audio: null });
  });

  it("shows a due episode as a new chapter, without its title", () => {
    const text = JSON.stringify(livingCalendar(db, riley, seededAt, { month: "2026-12" }));
    expect(text).toContain("A new chapter in Mrs Alvarez’s story");
    expect(text).not.toContain("Isabel has other ideas");
    expect(text).not.toContain("Finding another way");
  });

  it("shows routines as usual days, and a shared moment from a routine in its place", () => {
    const nov = all(livingCalendar(db, riley, seededAt));
    const isabel = nov.filter((e) => e.id.startsWith("routine:rt-alv-isabel:"));
    expect(isabel.length).toBeGreaterThan(2);
    expect(isabel.every((e) => e.kind === "routine" && e.routine === "Every Sunday at 12 pm" && !e.quote)).toBe(true);
    const sunday = nov.find((e) => e.id === "lm-cal-alv-isabel-sunday")!;
    expect(nov.some((e) => e.id === `routine:rt-alv-isabel:${sunday.date}`)).toBe(false);
    // Mr Okafor's library van is paused while his hip heals.
    const dec = all(livingCalendar(db, riley, seededAt, { month: "2026-12" }));
    expect(dec.some((e) => e.id.startsWith("routine:rt-oka-library:") && e.date.startsWith("2026-12"))).toBe(false);
    const jan = all(livingCalendar(db, riley, seededAt, { month: "2027-01" }));
    expect(jan.some((e) => e.id === "routine:rt-oka-library:2027-01-02")).toBe(true);
  });

  it("filters by person, by who you follow, and keeps a shared event on each person's calendar", () => {
    const only = all(livingCalendar(db, riley, seededAt, { members: "margaret-alder" }));
    expect(only.length).toBeGreaterThan(3);
    expect(only.every((e) => e.people.some((p) => p.id === "margaret-alder"))).toBe(true);
    expect(all(livingCalendar(db, riley, seededAt, { following: "1" }))).toEqual([]);
    livesActivity(db, riley, "mr-okafor", { kind: "follow" }, seededAt);
    expect(all(livingCalendar(db, riley, seededAt, { following: "1" })).every((e) => e.people[0].id === "mr-okafor")).toBe(true);
    const { id } = momentAction(db, jordan, { action: "moment.new", memberId: "mrs-alvarez" }, seededAt) as { id: string };
    const shared = {
      id,
      headline: "A video call about roses",
      quote: "We compared aphids.",
      alsoMembers: ["mr-okafor"],
      publishAt: "2026-11-20T01:00:00.000Z",
    };
    momentAction(db, jordan, { action: "moment.save", moment: shared }, seededAt);
    for (const s of ["in_review", "approved", "published"]) momentAction(db, jordan, { action: "moment.status", id, status: s }, seededAt);
    const okafor = all(livingCalendar(db, riley, seededAt, { members: "mr-okafor" })).find((e) => e.id === id)!;
    expect(okafor.people.map((p) => p.id)).toEqual(["mrs-alvarez", "mr-okafor"]);
  });
});

describe("the chat", () => {
  it("knows the usual week and what's coming, but not how it goes", () => {
    const brief = livesChatContext(db, riley, "margaret-alder", {}, seededAt)!.brief;
    expect(brief).toContain("Dana’s Sunday call: every sunday at 6 pm");
    expect(brief).toContain("Dana is coming for Christmas lunch");
    expect(brief).not.toContain("brought the pudding");
  });
});

describe("authoring", () => {
  it("moves a moment by dragging, but not before the episode it follows", () => {
    const { id } = momentAction(db, jordan, { action: "moment.new", memberId: "mrs-alvarez", date: "2026-12-03" }, seededAt) as { id: string };
    expect(localDay(calendarAdmin(db, jordan, seededAt, "2026-12").moments.find((m) => m.id === id)!.date, "UTC")).toBe("2026-12-03");
    momentAction(db, jordan, { action: "moment.reschedule", id, date: "2026-12-05" }, seededAt);
    expect(calendarAdmin(db, jordan, seededAt, "2026-12").moments.find((m) => m.id === id)!.date).toBe("2026-12-05");
    expect(() => momentAction(db, jordan, { action: "moment.reschedule", id: "lm-alv-sunday", date: "2026-12-05" }, seededAt)).toThrow(/has been shared/);
    expect(() => momentAction(db, jordan, { action: "moment.reschedule", id: "lm-alv-seat", date: "2026-11-30" }, seededAt)).toThrow(/give the story away/);
  });

  it("approves routines only when they're complete and grounded", () => {
    const { id } = routineAction(db, jordan, { action: "routine.new", memberId: "margaret-alder", title: "Crossword" }, seededAt) as { id: string };
    expect(() => routineAction(db, jordan, { action: "routine.status", id, status: "approved" }, seededAt)).toThrow(/Character Bible/);
    routineAction(
      db,
      jordan,
      { action: "routine.save", id, routine: { title: "Crossword", start: "2026-11-01", freq: "weekly", weekdays: [2], source: "Draft" } },
      seededAt,
    );
    expect(() => routineAction(db, riley, { action: "routine.status", id, status: "approved" }, seededAt)).toThrow(/author/i);
  });

  it("reviews a month: duplicates, crowding and balance", () => {
    for (const d of ["2026-12-08", "2026-12-08", "2026-12-08"]) {
      const { id } = momentAction(db, jordan, { action: "moment.new", memberId: "mrs-alvarez", date: d }, seededAt) as { id: string };
      momentAction(
        db,
        jordan,
        { action: "moment.save", moment: { id, headline: "Watering again", category: "everyday", publishAt: `${d}T00:00:00.000Z` } },
        seededAt,
      );
    }
    const r = calendarReview(db, "2026-12", "Australia/Sydney");
    expect(r.issues.some((i) => /appears twice/.test(i.text))).toBe(true);
    expect(r.issues.some((i) => /give their days some room/.test(i.text))).toBe(true);
    expect(r.balance.map((b) => b.bucket)).toEqual(["everyday", "social", "celebration", "story", "care"]);
  });
});

describe("a little serendipity", () => {
  it("spreads the demo unevenly, at varied times, with quiet days", () => {
    const rows = db.prepare("SELECT member_id, publish_at, event_at FROM lip_moments WHERE status = 'published'").all() as {
      member_id: string;
      publish_at: string;
      event_at: string;
    }[];
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(localDay(r.publish_at, "Australia/Sydney"), (perDay.get(localDay(r.publish_at, "Australia/Sydney")) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(3);
    expect(new Set(rows.map((r) => new Date(r.publish_at).getUTCHours())).size).toBeGreaterThanOrEqual(6);
    const days = [...perDay.keys()].sort();
    const span = (Date.parse(days.at(-1)!) - Date.parse(days[0])) / 86_400_000 + 1;
    expect(span - perDay.size).toBeGreaterThan(10);
    expect(DEMO_MOMENTS.length + CALENDAR_MOMENTS.length).toBeGreaterThanOrEqual(45);
  });

  it("generates a month the same way every time: uneven, timed by kind, nobody two days running", async () => {
    const ask = async <T>() =>
      ({
        moments: Array.from({ length: 30 }, (_, i) => ({
          memberId: ["mrs-alvarez", "margaret-alder", "mr-okafor"][i % 3],
          category: ["celebration", "reflection", "everyday", "new_chapter"][i % 4],
          headline: `Moment ${i}`,
        })),
      }) as T;
    const once = await livesProposal(
      db,
      jordan,
      { kind: "moments", memberIds: ["mrs-alvarez", "margaret-alder", "mr-okafor"], brief: { month: "2027-01" } },
      seededAt,
      ask,
    );
    const twice = await livesProposal(
      db,
      jordan,
      { kind: "moments", memberIds: ["mrs-alvarez", "margaret-alder", "mr-okafor"], brief: { month: "2027-01" } },
      seededAt,
      ask,
    );
    const p = (once.proposal as { moments: { memberId: string; category: string; publishAt: string; time: string }[] }).moments;
    expect(p).toEqual((twice.proposal as { moments: unknown[] }).moments);
    const days = new Map<string, Set<string>>();
    for (const m of p) {
      const d = localDay(m.publishAt, "Australia/Brisbane");
      expect(d.startsWith("2027-01")).toBe(true);
      days.set(d, (days.get(d) ?? new Set()).add(m.memberId));
      const hour = Number(m.time.slice(0, 2));
      if (m.category === "celebration") expect(hour).toBeLessThanOrEqual(10);
      if (m.category === "reflection") expect(hour).toBeGreaterThanOrEqual(18);
      if (m.category === "new_chapter") expect(new Date(`${d}T00:00:00Z`).getUTCDay()).not.toBe(0);
    }
    for (const set of days.values()) expect(set.size).toBeLessThanOrEqual(3);
    for (const [d, set] of days) {
      const next = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      for (const who of set) expect(days.get(next)?.has(who) ?? false).toBe(false);
    }
    expect(new Set(p.map((m) => m.time)).size).toBeGreaterThan(8);
  });

  it("tells a follower at most once per person per day, batched, and only about the kinds they're told about", () => {
    livesActivity(db, riley, "mrs-alvarez", { kind: "follow" }, seededAt);
    // Tomorrow: Mrs Alvarez's voice message goes out (told), and an everyday follow-up the day before (not told).
    publishDueEpisodes(db, new Date(seededAt.getTime() + 2 * 86_400_000));
    // A week on: episode 4 and the paving moment go out the same day.
    publishDueEpisodes(db, new Date(seededAt.getTime() + 8.2 * 86_400_000));
    const notes = db.prepare("SELECT title, body, source FROM notifications WHERE user_id = 'riley' AND category = 'Lives in Progress'").all() as {
      title: string;
      body: string;
      source: string;
    }[];
    const sources = notes.map((n) => n.source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.every((s) => s.startsWith("lives-day:mrs-alvarez:"))).toBe(true);
    expect(notes.some((n) => n.title === "Mrs Alvarez: A voice message from Mrs Alvarez")).toBe(true);
    expect(JSON.stringify(notes)).not.toContain("back in the garden this afternoon");
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND category = 'Lives in Progress'").get()).toEqual({ n: 0 });
    void sam;
  });
});
