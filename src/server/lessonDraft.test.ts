import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "./db";
import { userById } from "./auth";
import { draftPrompt, generateLessonDraft, readSource, shapeDraft } from "./lessonDraft";
import { validateLesson } from "./generate";
import type { Lesson } from "@/content/lessons";

/* Drafting a new lesson with Claude from a brief and a source document. */

const file = (bytes: Buffer | string, name: string, type = "") =>
  new File([new Uint8Array(typeof bytes === "string" ? Buffer.from(bytes) : bytes)], name, { type });

describe("reading source documents", () => {
  it("sends PDFs as they are", async () => {
    const s = await readSource(file("%PDF-1.7\n...", "policy.pdf", "application/pdf"));
    expect(s.kind).toBe("pdf");
  });

  it("reads the words out of a Word document", async () => {
    const s = await readSource(file(fs.readFileSync(path.join(__dirname, "fixtures/sample.docx")), "guide.docx"));
    expect(s).toMatchObject({ kind: "text", text: "Changes to a visit\nCheck with the coordinator & record the change." });
  });

  it("reads text files, and turns away old Word files and anything else", async () => {
    expect(await readSource(file("Plain notes", "notes.txt", "text/plain"))).toMatchObject({ kind: "text", text: "Plain notes" });
    await expect(readSource(file(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "old.doc"))).rejects.toThrow(/older Word file/);
    await expect(readSource(file(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "photo.jpg", "image/jpeg"))).rejects.toThrow(/PDF, Word/);
  });
});

describe("the draft", () => {
  it("tells Claude to use only the document's facts when there is one", () => {
    const withDoc = draftPrompt({ brief: "Teach what to do when a visit changes." }, { kind: "text", name: "guide.docx", text: "x" });
    expect(withDoc).toContain("<brief>\nTeach what to do when a visit changes.\n</brief>");
    expect(withDoc).toContain("It is the only source of facts");
    expect(draftPrompt({ brief: "Teach something." })).toContain("There is no source document");
  });

  it("needs a brief or a document, and an author", async () => {
    const db = openDb(":memory:");
    await expect(generateLessonDraft(db, userById(db, "jordan")!, { brief: "short" }, null, new Date())).rejects.toThrow(/brief/);
    await expect(generateLessonDraft(db, userById(db, "sam")!, { brief: "A long enough brief here." }, null, new Date())).rejects.toThrow(/learning authors/);
  });

  it("fills in what the editor needs around Claude's cards", () => {
    const db = openDb(":memory:");
    const raw = {
      title: "When a visit changes",
      summary: "s",
      outcome: "o",
      minutes: 4,
      beats: ["Start", "Check", "Remember"],
      start: "intro",
      nodes: {
        intro: { id: "intro", type: "image", beat: 0, label: "Intro", heading: "A change", body: "", visual: { kind: "none" }, next: "q" },
        q: {
          id: "q",
          type: "quiz",
          beat: 1,
          label: "Check",
          heading: "Check",
          body: "",
          visual: { kind: "none" },
          questions: [
            {
              id: "q",
              prompt: "?",
              options: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
              ],
              correct: "a",
              feedback: { correct: "Yes.", incorrect: "No." },
            },
          ],
          next: "end",
        },
        end: {
          id: "end",
          type: "summary",
          beat: 2,
          label: "Remember",
          heading: "Done",
          body: "",
          visual: { kind: "none" },
          action: "Check first.",
          cta: "Finish",
        },
      },
    } as unknown as Lesson;
    expect(validateLesson(raw)).toEqual([]);
    const l = shapeDraft(raw, { brief: "x", audience: "coordinator" }, userById(db, "jordan")!, new Date("2026-10-23T00:00:00Z"));
    expect(l).toMatchObject({
      slug: "when-a-visit-changes",
      track: "coordinator",
      version: "0.1",
      completion: { type: "quiz", cardId: "q" },
      reviewDate: "2027-04-23",
    });
    expect(l.owner).toMatch(/AI draft for review/);
  });
});
