import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import { spacedAction, spacedOverview } from "./spaced";
import { prompt, validateLesson } from "./generate";
import { lessons } from "@/content/lessons";
import { getLesson } from "./lessonStore";
import type { Lesson } from "@/content/lessons";

/* The spaced learning checkbox on master lessons, and checks on what Claude writes. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const now = new Date("2026-10-22T04:00:00Z");
const enrolments = () => (db.prepare("SELECT COUNT(*) n FROM enrolments").get() as { n: number }).n;
const row = (slug: string) => spacedOverview(db).find((l) => l.slug === slug)!;

const draft = (over: Partial<Lesson> = {}) =>
  ({
    slug: "noticing-a-change-recall",
    title: "Recall: noticing a change",
    start: "q1",
    beats: ["Recall", "Summary"],
    nodes: {
      q1: {
        id: "q1",
        beat: 0,
        type: "quiz",
        heading: "Quick check",
        body: "",
        visual: { kind: "none" },
        questions: [
          {
            id: "q",
            prompt: "Who do you tell?",
            options: [
              { id: "a", label: "The coordinator" },
              { id: "b", label: "No one" },
            ],
            correct: "a",
            feedback: { correct: "Yes.", incorrect: "Tell the coordinator." },
          },
        ],
        next: "end",
      },
      end: {
        id: "end",
        beat: 1,
        type: "summary",
        heading: "Done",
        body: "Nice work.",
        visual: { kind: "none" },
        action: "Tell your coordinator about changes you notice.",
      },
    },
    ...over,
  }) as unknown as Lesson;

describe("spaced learning checkbox", () => {
  it("only starts follow ups for lessons with spaced learning on", () => {
    recordLessonCompletion(db, userById(db, "sam")!, { slug: "our-mission-and-model", version: "1.1" }, now);
    expect(enrolments()).toBe(0);
    recordLessonCompletion(db, userById(db, "sam")!, { slug: "legislative-framework", version: "1.0" }, now);
    expect(enrolments()).toBe(1);
  });

  it("stops new enrolments when switched off, and lists the prepared variations", async () => {
    const lf = row("legislative-framework");
    expect(lf.state).toBe("live");
    expect(lf.variations.map((v) => v.stage)).toEqual(["Recall", "Apply", "Refresh", "Refresh support"]);
    expect(row("our-mission-and-model").state).toBe("off");

    await spacedAction(db, userById(db, "jordan")!, "legislative-framework", "disable", now);
    expect(row("legislative-framework").state).toBe("off");
    recordLessonCompletion(db, userById(db, "sam")!, { slug: "legislative-framework", version: "1.0" }, now);
    expect(enrolments()).toBe(0);

    // Turning it back on reuses the existing follow ups rather than generating new ones.
    await spacedAction(db, userById(db, "jordan")!, "legislative-framework", "enable", now);
    expect(row("legislative-framework").state).toBe("live");
  });

  it("stays off when Claude can't generate the variations", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(spacedAction(db, userById(db, "jordan")!, "our-mission-and-model", "enable", now, "Keep it short.")).rejects.toThrow(/isn’t connected/);
    expect(row("our-mission-and-model").state).toBe("off");
    if (key) process.env.ANTHROPIC_API_KEY = key;
  });

  it("only lets authors change the setting", async () => {
    await expect(spacedAction(db, userById(db, "sam")!, "legislative-framework", "disable", now)).rejects.toThrow();
  });

  it("keeps drafts out of the player until approved", () => {
    db.prepare(
      "INSERT INTO generated_lessons (slug, master_slug, stage, status, content, model, created_at, created_by) VALUES (?, ?, ?, 'draft', ?, 'test', ?, 'jordan')",
    ).run("noticing-a-change-recall", "noticing-a-change", "recall", JSON.stringify(draft()), now.toISOString());
    expect(getLesson(db, "noticing-a-change-recall")).toMatchObject({ generated: { status: "draft", master: "noticing-a-change" } });
  });
});

describe("validating generated lessons", () => {
  it("accepts a well-formed lesson", () => {
    expect(validateLesson(draft())).toEqual([]);
  });

  it("catches broken links, bad answers and missing alt text", () => {
    const bad = draft();
    const q = bad.nodes.q1 as unknown as { next: string; questions: { correct: string }[]; visual: unknown };
    q.next = "nowhere";
    q.questions[0].correct = "z";
    q.visual = { kind: "illustration", icon: "spark", variant: "rings", tone: "teal" };
    const issues = validateLesson(bad).join(" | ");
    expect(issues).toContain("missing card");
    expect(issues).toContain("correct answer");
    expect(issues).toContain("alt text");
  });
});

describe("author instructions", () => {
  const master = lessons.find((l) => l.slug === "noticing-a-change")!;
  it("adds the author's instructions to the prompt, inside their own tags", () => {
    const text = prompt(master, "Use gardening examples.");
    expect(text).toContain("<author_instructions>\nUse gardening examples.\n</author_instructions>");
    expect(text).toContain("never add facts");
  });
  it("leaves the prompt unchanged without them", () => {
    expect(prompt(master)).not.toContain("author_instructions");
  });
});
