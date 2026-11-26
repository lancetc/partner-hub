import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { ensureLives, rememberConversation, seedLivesDemo } from "./livesInProgress";
import { ensureMoments, momentAction, seedMomentsDemo } from "./lifeMoments";
import { ensureCalendar, seedCalendarDemo } from "./livingCalendar";
import { livesOverview, PARTS } from "./livesOverview";

/* The admin overview: the six parts in order, live counts, what needs attention, who has what, and never anyone's words. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-25T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  riley = userById(db, "riley")!;
  ensureCharacters(db, now);
  ensureLives(db, now);
  seedLivesDemo(db, now);
  ensureMoments(db, now);
  seedMomentsDemo(db, now);
  ensureCalendar(db, now);
  seedCalendarDemo(db, now);
});

describe("the overview", () => {
  it("shows the six parts in order, with live counts and what's waiting", () => {
    const o = livesOverview(db, jordan, now);
    expect(o.parts.map((p) => p.heading)).toEqual(PARTS.map((p) => p.heading));
    expect(o.parts.map((p) => p.line)).toEqual([
      "Who they are.",
      "What they’re doing.",
      "What’s happening in their lives.",
      "How their lives evolve.",
      "What we’ve spoken about.",
      "How we maintain a connection.",
    ]);
    const part = (k: string) => o.parts.find((p) => p.key === k)!;
    expect(part("bible").stats[0]).toEqual({ label: "Approved", value: 3 });
    expect(part("moments").attention).toContain("1 moment awaiting approval");
    expect(part("arcs").attention).toContain("1 episode in review");
    expect(o.characters.map((c) => c.id).sort()).toEqual(["margaret-alder", "mr-okafor", "mrs-alvarez"]);
    expect(o.characters.every((c) => c.parts.bible && c.parts.arcs && !c.parts.checkin)).toBe(true);
  });

  it("names a character with stories but no approved Bible", () => {
    const { id } = momentAction(db, jordan, { action: "moment.new", memberId: "mrs-patel" }, now) as { id: string };
    expect(id).toBeTruthy();
    expect(livesOverview(db, jordan, now).parts.find((p) => p.key === "bible")!.attention).toContain("Mrs Patel: no approved Bible");
  });

  it("is for authors, and holds counts only", () => {
    expect(() => livesOverview(db, riley, now)).toThrow(/author/i);
    rememberConversation(db, riley, "mrs-alvarez", "conv-riley-secret", null, [{ role: "user", text: "What about your secret recipe?" }], now);
    const o = livesOverview(db, jordan, now);
    expect(o.parts.find((p) => p.key === "memory")!.stats[0]).toEqual({ label: "Learners with memories", value: 1 });
    expect(JSON.stringify(o)).not.toContain("secret recipe");
  });
});
