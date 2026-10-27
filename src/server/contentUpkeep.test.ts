import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons } from "@/content/lessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { editorLesson, publishLesson, restoreVersion, saveDraft } from "./authoredLessons";
import { importantChangesSince, listVersions } from "./lessonVersions";
import { contentReview, daysUntil, statusOf } from "./contentReview";
import { openReports, reportCard, resolveReport } from "./contentReports";
import { deleteFact, factUsage, factValues, listFacts, saveFact } from "./facts";
import { runContentReminders } from "./contentReminders";
import type { NotificationAdapter, OutboundMessage } from "./notify";

/* Keeping content current: version history, the facts library, check dates, learner reports and reminders. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T01:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3600_000);
const slug = "a-little-extra-time";

function edit(fn: (l: ReturnType<typeof editorLesson> & object) => void, when: Date) {
  const found = editorLesson(db, slug)!;
  fn(found);
  saveDraft(db, u("jordan"), slug, found.lesson, when);
}

describe("version history", () => {
  it("keeps the version before history began, then each publish with its note and changes", () => {
    const before = lessons.find((l) => l.slug === slug)!.version;
    edit((f) => void ((f.lesson.nodes.visit as { heading?: string }).heading = "A new heading"), at(1));
    publishLesson(db, u("jordan"), slug, at(2), { notes: "Fresh heading", kind: "minor" });

    const versions = listVersions(db, u("jordan"), slug);
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({ version: before, by: "content files", latest: false });
    expect(versions[0]).toMatchObject({ notes: "Fresh heading", kind: "minor", latest: true });
    expect(versions[0].changes.cards).toEqual([expect.objectContaining({ id: "visit", change: "changed" })]);
    expect(() => listVersions(db, u("sam"), slug)).toThrow();
  });

  it("tells people who did an earlier version about important changes only", () => {
    const before = lessons.find((l) => l.slug === slug)!.version;
    edit((f) => void (f.lesson.summary = "Small tweak"), at(1));
    const minor = publishLesson(db, u("jordan"), slug, at(2), { notes: "Typo", kind: "minor" }).version;
    edit((f) => void (f.lesson.summary = "New rate"), at(3));
    const important = publishLesson(db, u("jordan"), slug, at(4), { notes: "The rate changed", kind: "important" }).version;

    expect(importantChangesSince(db, slug, before)).toEqual([expect.objectContaining({ version: important, notes: "The rate changed" })]);
    expect(importantChangesSince(db, slug, minor)).toHaveLength(1);
    expect(importantChangesSince(db, slug, important)).toEqual([]);
    expect(importantChangesSince(db, slug, "not-a-version")).toEqual([]);
  });

  it("restores an earlier version as the draft, leaving the live lesson alone", () => {
    const before = lessons.find((l) => l.slug === slug)!;
    edit((f) => void (f.lesson.summary = "Changed"), at(1));
    publishLesson(db, u("jordan"), slug, at(2));
    restoreVersion(db, u("jordan"), slug, before.version, at(3));
    expect(editorLesson(db, slug)!.lesson.summary).toBe(before.summary);
    expect(lessons.find((l) => l.slug === slug)!.summary).toBe("Changed");
    expect(() => restoreVersion(db, u("jordan"), slug, "9.9", at(4))).toThrow(/isn’t in the history/);
  });
});

describe("facts library", () => {
  it("adds and updates facts, and knows where they're used", () => {
    expect(factValues(db).example_rate).toBe("$80");
    expect(factUsage(db).example_rate?.map((l) => l.slug)).toContain(slug);
    saveFact(db, u("jordan"), { key: "example_rate", label: "Example hourly rate", value: "$82", checkBy: "2027-05-01" }, now);
    expect(factValues(db).example_rate).toBe("$82");
    expect(listFacts(db, u("jordan")).find((f) => f.key === "example_rate")).toMatchObject({ checkBy: "2027-05-01" });
  });

  it("checks what's entered, and won't delete a fact a lesson uses", () => {
    expect(() => saveFact(db, u("jordan"), { key: "Bad Key", label: "x", value: "1" }, now)).toThrow(/lowercase/);
    expect(() => saveFact(db, u("jordan"), { key: "ok_key", label: "x", value: "1", sourceUrl: "http://x" }, now)).toThrow(/https/);
    expect(() => saveFact(db, u("sam"), { key: "ok_key", label: "x", value: "1" }, now)).toThrow();
    expect(() => deleteFact(db, u("jordan"), "example_rate", now)).toThrow(/used in/);
    saveFact(db, u("jordan"), { key: "spare", label: "Spare", value: "1" }, now);
    deleteFact(db, u("jordan"), "spare", now);
    expect(factValues(db).spare).toBeUndefined();
  });
});

describe("content review", () => {
  it("sorts dated items into overdue, due soon and fine", () => {
    expect(daysUntil("2026-10-25", now)).toBe(-1);
    expect([statusOf(-1), statusOf(30), statusOf(31)]).toEqual(["overdue", "due", "ok"]);
    const r = contentReview(db, u("jordan"), now);
    expect(r.overdue.map((i) => i.key)).toContain(`card:${slug}:visit`);
    expect(r.due.map((i) => i.key)).toEqual(expect.arrayContaining(["card:legislative-framework:act", "fact:example_rate"]));
    expect(() => contentReview(db, u("sam"), now)).toThrow();
  });

  it("suggests a check date for cards with amounts or dates and no check or fact", () => {
    const r = contentReview(db, u("jordan"), now);
    for (const s of r.suggestions) expect(s.found.length).toBeGreaterThan(0);
    expect(r.suggestions.some((s) => s.cardId === "visit" && s.slug === slug)).toBe(false);
  });
});

describe("learner reports", () => {
  it("lets learners flag a card and authors resolve it", () => {
    reportCard(db, u("sam"), slug, "visit", "The rate looks old", now);
    expect(() => reportCard(db, u("sam"), slug, "nope", "Looks wrong", now)).toThrow(/not found/);
    expect(() => reportCard(db, u("sam"), slug, "visit", "bad", now)).toThrow(/a little/);
    const [r] = openReports(db);
    expect(r).toMatchObject({ slug, cardId: "visit", by: "Sam" });
    expect(contentReview(db, u("jordan"), now).reports).toHaveLength(1);
    expect(() => resolveReport(db, u("sam"), r.id, "", now)).toThrow();
    resolveReport(db, u("jordan"), r.id, "Updated the rate", now);
    expect(openReports(db)).toEqual([]);
    expect(() => resolveReport(db, u("jordan"), r.id, "", now)).toThrow(/already/);
  });

  it("limits reports to 10 an hour per person", () => {
    for (let i = 0; i < 10; i++) reportCard(db, u("sam"), slug, "visit", `Report number ${i}`, now);
    expect(() => reportCard(db, u("sam"), slug, "visit", "One too many", now)).toThrow(/a lot of reports/);
  });
});

describe("reminders", () => {
  class Fake implements NotificationAdapter {
    channel = "email" as const;
    name = "fake";
    configured = true;
    sent: OutboundMessage[] = [];
    async send(msg: OutboundMessage) {
      this.sent.push(msg);
      return { status: "accepted" as const, providerRef: "x" };
    }
  }

  it("emails authors a digest once per stage, not every day", async () => {
    const email = new Fake();
    await runContentReminders(db, now, email);
    expect(email.sent.length).toBeGreaterThan(0);
    expect(email.sent[0].idempotencyKey).toMatch(/^content-reminder:/);
    const body = JSON.stringify(email.sent[0]);
    expect(body).toContain("/admin/content-review");
    expect(body).toContain("?card=visit");

    const again = new Fake();
    await runContentReminders(db, at(24), again);
    expect(again.sent).toEqual([]);
  });
});
